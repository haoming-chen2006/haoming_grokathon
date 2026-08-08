import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CostLedger, getCostLedger } from "./costLedger";
import { extractUsage, turnCharge } from "./usageAccounting";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-cost-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const file = () => join(dir, "cost-ledger.ndjson");

/** Verbatim `_meta` from the live grok-4.5 turn captured for COST-001, ticks and all. */
const LIVE_TURN_META = {
  modelId: "grok-4.5",
  totalTokens: 12326,
  inputTokens: 12306,
  outputTokens: 20,
  cachedReadTokens: 1408,
  reasoningTokens: 19,
  usage: {
    inputTokens: 12306, outputTokens: 20, totalTokens: 12326,
    cachedReadTokens: 1408, reasoningTokens: 19, costUsdTicks: 223_384_000,
  },
};

describe("COST-004: every charge is a ledger row", () => {
  test("one agent turn produces exactly one row, carrying the fields that apply to it", () => {
    const ledger = new CostLedger(dir);
    const charge = turnCharge(extractUsage(LIVE_TURN_META));

    const row = ledger.record({
      projectId: "proj_1",
      agentId: "agent_1",
      areaId: "area_1",
      taskId: "task_1",
      operation: "turn",
      capability: "base",
      ...charge,
    });

    expect(ledger.all()).toHaveLength(1);
    expect(row.id).toStartWith("cost_");
    expect(row.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.operation).toBe("turn");
    expect(row.modelId).toBe("grok-4.5");
    expect(row.rateKey).toBe("grok-4.5");
    expect(row.projectId).toBe("proj_1");
    expect(row.agentId).toBe("agent_1");
    expect(row.areaId).toBe("area_1");
    expect(row.taskId).toBe("task_1");
    expect(row.capability).toBe("base");
  });

  test("the token split survives to the row rather than collapsing to one number", () => {
    // Every caller today collapses TokenUsage to { costUsd, tokens, estimated }, which is why a
    // cached read cannot be told from full-price input after the fact.
    const ledger = new CostLedger(dir);
    const row = ledger.record({ projectId: "p", operation: "turn", ...turnCharge(extractUsage(LIVE_TURN_META)) });
    expect(row.inputTokens).toBe(12306);
    expect(row.outputTokens).toBe(20);
    expect(row.cachedTokens).toBe(1408);
    expect(row.reasoningTokens).toBe(19);
  });

  test("a turn the provider billed is recorded as billed, not as an estimate", () => {
    const ledger = new CostLedger(dir);
    const row = ledger.record({ projectId: "p", operation: "turn", ...turnCharge(extractUsage(LIVE_TURN_META)) });
    expect(row.pricing).toBe("billed");
    expect(row.costUsd).toBe(223_384_000 / 1e10);
  });

  test("a turn with no billed figure falls back to an estimate, and says so", () => {
    const ledger = new CostLedger(dir);
    const noTicks = { ...LIVE_TURN_META, usage: { ...LIVE_TURN_META.usage, costUsdTicks: undefined } };
    const row = ledger.record({ projectId: "p", operation: "turn", ...turnCharge(extractUsage(noTicks)) });
    expect(row.pricing).toBe("estimated");
    expect(row.costUsd).toBeCloseTo(0.022338, 6);
  });

  test("an unpriceable charge is still recorded, as null and unknown", () => {
    // The money is already spent by the time record() is called. Refusing the row loses the record,
    // not the charge.
    const ledger = new CostLedger(dir);
    const unknownModel = { ...LIVE_TURN_META, modelId: "some-model-nobody-priced", usage: { ...LIVE_TURN_META.usage, costUsdTicks: undefined } };
    const row = ledger.record({ projectId: "p", operation: "turn", ...turnCharge(extractUsage(unknownModel)) });
    expect(row.costUsd).toBeNull();
    expect(row.pricing).toBe("unknown");
    expect(row.rateKey).toBeNull();
    // The counts are exact and must survive; only the price is missing.
    expect(row.inputTokens).toBe(12306);
    expect(ledger.all()).toHaveLength(1);
  });

  test("one image generation and one narration are one row each", () => {
    const ledger = new CostLedger(dir);
    ledger.record({
      projectId: "p", assetId: "asset_deck", assetType: "slides",
      operation: "image_generation", rateKey: "grok-imagine-image-quality",
      units: { kind: "images", count: 8 }, costUsd: 0.4, pricing: "metered",
      assetPath: "/data/assets/asset_deck/slide-1.png",
    });
    ledger.record({
      projectId: "p", assetId: "asset_deck", assetType: "slides",
      operation: "tts", rateKey: "tts",
      units: { kind: "characters", count: 6000 }, costUsd: 0.09, pricing: "metered",
      assetPath: "/data/assets/asset_deck/narration.mp3",
    });
    expect(ledger.query({ assetId: "asset_deck" })).toHaveLength(2);
    expect(ledger.query({ operation: "image_generation" })).toHaveLength(1);
    expect(ledger.query({ operation: "tts" })).toHaveLength(1);
  });

  test("a media row keeps the persisted path and refuses a provider URL", () => {
    // A returned media URL expires, so a row holding one eventually cannot show the user what the
    // charge bought. The charge is still recorded — only the rotting pointer is dropped.
    const ledger = new CostLedger(dir);
    const kept = ledger.record({
      projectId: "p", operation: "image_generation", costUsd: 0.05, pricing: "metered",
      rateKey: "grok-imagine-image-quality", assetPath: "/data/assets/a/1.png",
    });
    expect(kept.assetPath).toBe("/data/assets/a/1.png");

    const rotting = ledger.record({
      projectId: "p", operation: "image_generation", costUsd: 0.05, pricing: "metered",
      rateKey: "grok-imagine-image-quality",
      assetPath: "https://imgen.x.ai/tmp/abc123.png?expires=1786217792",
    });
    expect(rotting.assetPath).toBeUndefined();
    expect(rotting.costUsd).toBe(0.05);
    expect(ledger.all()).toHaveLength(2);
  });

  test("a metered charge and a token charge are never given each other's tier", () => {
    const ledger = new CostLedger(dir);
    const media = ledger.record({
      projectId: "p", operation: "video_generation", rateKey: "grok-imagine-video-1.5",
      units: { kind: "video_seconds", count: 64 }, costUsd: 5.12,
    });
    const turn = ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 0.02, units: { kind: "tokens", count: 12326 } });
    expect(media.pricing).toBe("metered");
    expect(turn.pricing).toBe("estimated");
  });

  test("a retry loop is visible as rows with attempt ordinals, not as one total", () => {
    const ledger = new CostLedger(dir);
    for (let attempt = 1; attempt <= 3; attempt++) {
      ledger.record({
        projectId: "p", operation: "video_generation", rateKey: "grok-imagine-video-1.5",
        units: { kind: "video_seconds", count: 8 }, costUsd: 0.64, pricing: "metered", attempt,
      });
    }
    expect(ledger.all().map((r) => r.attempt)).toEqual([1, 2, 3]);
  });
});

describe("COST-004: the ledger is append-only", () => {
  test("it exposes no way to change or remove a row", () => {
    const ledger = new CostLedger(dir) as unknown as Record<string, unknown>;
    for (const forbidden of ["update", "delete", "remove", "clear", "set", "edit"]) {
      expect(typeof ledger[forbidden], `CostLedger.${forbidden} must not exist`).toBe("undefined");
    }
  });

  test("appending never rewrites what was already written", () => {
    const ledger = new CostLedger(dir);
    ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 1 });
    const afterFirst = readFileSync(file(), "utf8");

    ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 2 });
    const afterSecond = readFileSync(file(), "utf8");

    // Byte-for-byte: the second write is a suffix, so the first row cannot have been touched.
    expect(afterSecond.startsWith(afterFirst)).toBe(true);
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length);
  });

  test("rows survive a restart", () => {
    const first = new CostLedger(dir);
    first.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 1 });
    first.record({ projectId: "p", operation: "tts", rateKey: "tts", costUsd: 0.09, units: { kind: "characters", count: 6000 } });

    const reopened = new CostLedger(dir);
    expect(reopened.all()).toHaveLength(2);
    expect(reopened.all()[1]!.operation).toBe("tts");
  });

  test("a truncated line loses that row and no other", () => {
    // The library next door presents a corrupt file as an empty one. For money that would mean a
    // charge silently ceasing to exist, so the surviving rows must still load.
    const ledger = new CostLedger(dir);
    ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 1 });
    ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 2 });
    writeFileSync(file(), readFileSync(file(), "utf8") + '{"id":"cost_trunc","projec');

    const reopened = new CostLedger(dir);
    expect(reopened.all()).toHaveLength(2);
    expect(reopened.all().map((r) => r.costUsd)).toEqual([1, 2]);
  });
});

describe("COST-004: record() never throws", () => {
  test("an unwritable ledger still returns the row", () => {
    // Durability can fail; the caller must still get its row back, because the alternative is
    // throwing into a path that has already spent the money.
    const ledger = new CostLedger(dir);
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(dir, "not a directory");

    const row = ledger.record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 1 });
    expect(row.costUsd).toBe(1);
    expect(ledger.all()).toHaveLength(1);
    rmSync(dir, { force: true });
  });

  test("a charge with nothing but a project and an operation is recorded", () => {
    const ledger = new CostLedger(dir);
    const row = ledger.record({ projectId: "p", operation: "sandbox" });
    expect(row.costUsd).toBeNull();
    expect(row.pricing).toBe("unknown");
    expect(row.rateKey).toBeNull();
  });
});

describe("COST-004: the ledger is reachable as a singleton", () => {
  test("getCostLedger follows OPENUI_DATA_DIR, as the library does", () => {
    const previous = process.env.OPENUI_DATA_DIR;
    process.env.OPENUI_DATA_DIR = dir;
    try {
      getCostLedger().record({ projectId: "p", operation: "turn", rateKey: "grok-4.5", costUsd: 1 });
      expect(existsSync(file())).toBe(true);
      expect(getCostLedger().query({ projectId: "p" })).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.OPENUI_DATA_DIR;
      else process.env.OPENUI_DATA_DIR = previous;
    }
  });
});
