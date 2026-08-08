import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RATES,
  DEFAULT_UNIT_RATES,
  UNPRICED_BY_DESIGN,
  estimateCost,
  extractUsage,
  meterCost,
  resolveRate,
  resolveUnitRate,
} from "./usageAccounting";

describe("V-045: token usage is extracted exactly", () => {
  test("reads the shape grok actually returns", () => {
    // Captured from a real session/prompt _meta.
    const usage = extractUsage({
      totalTokens: 7659,
      inputTokens: 7657,
      outputTokens: 2,
      modelId: "gpt-4o-2024-08-06",
      usage: { inputTokens: 7657, outputTokens: 2, totalTokens: 7659, cachedReadTokens: 7552, reasoningTokens: 0 },
    });
    expect(usage.totalTokens).toBe(7659);
    expect(usage.inputTokens).toBe(7657);
    expect(usage.outputTokens).toBe(2);
    expect(usage.cachedReadTokens).toBe(7552);
    expect(usage.modelId).toBe("gpt-4o-2024-08-06");
  });

  test("missing fields become zero rather than NaN", () => {
    const usage = extractUsage(undefined);
    expect(usage).toEqual({
      inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedReadTokens: 0, reasoningTokens: 0, modelId: undefined,
    });
    expect(Number.isNaN(usage.totalTokens)).toBe(false);
  });
});

describe("V-045: cost is estimated and labelled as such", () => {
  test("a dated model id resolves to its base rate", () => {
    expect(resolveRate("gpt-4o-2024-08-06")![0]).toBe("gpt-4o");
    expect(resolveRate("gpt-4o")![0]).toBe("gpt-4o");
  });

  test("the longest matching prefix wins", () => {
    // gpt-4o-mini must not be priced as gpt-4o — that would understate by ~16x.
    expect(resolveRate("gpt-4o-mini-2024-07-18")![0]).toBe("gpt-4o-mini");
  });

  test("an unknown model yields zero with a null rate key, never a guessed price", () => {
    const est = estimateCost({ inputTokens: 1000, outputTokens: 100, totalTokens: 1100, cachedReadTokens: 0, reasoningTokens: 0, modelId: "mystery-model" });
    expect(est.costUsd).toBe(0);
    expect(est.rateKey).toBeNull();
    expect(est.estimated).toBe(true);
  });

  test("cached reads are billed at the discounted rate, not twice", () => {
    const rate = DEFAULT_RATES["gpt-4o"];
    const est = estimateCost({
      inputTokens: 1_000_000, cachedReadTokens: 1_000_000, outputTokens: 0,
      totalTokens: 1_000_000, reasoningTokens: 0, modelId: "gpt-4o",
    });
    // All input was cached, so it costs the cached rate, not the full input rate.
    expect(est.costUsd).toBeCloseTo(rate.cachedInputPerMillion!, 6);
    expect(est.costUsd).toBeLessThan(rate.inputPerMillion);
  });

  test("a plain input/output turn prices correctly", () => {
    const est = estimateCost({
      inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000,
      cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o",
    });
    expect(est.costUsd).toBeCloseTo(2.5 + 10, 6);
  });

  test("every cost is flagged estimated and names the rate it used", () => {
    // §22.18 forbids fabricated cost; an unlabelled dollar figure would be exactly that.
    const est = estimateCost({
      inputTokens: 100, outputTokens: 10, totalTokens: 110, cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o",
    });
    expect(est.estimated).toBe(true);
    expect(est.rateKey).toBe("gpt-4o");
  });

  test("cached reads exceeding input do not produce a negative charge", () => {
    const est = estimateCost({
      inputTokens: 100, cachedReadTokens: 500, outputTokens: 0, totalTokens: 100, reasoningTokens: 0, modelId: "gpt-4o",
    });
    expect(est.costUsd).toBeGreaterThanOrEqual(0);
  });

  test("zero usage costs zero", () => {
    expect(estimateCost({ inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o" }).costUsd).toBe(0);
  });
});

describe("COST-001: the model a live turn reports has a rate", () => {
  /**
   * Verbatim `_meta` from one real `session/prompt`, captured 2026-08-08 against
   * `grok --no-auto-update agent -m grok-4.5 --always-approve stdio` — the same binary and the
   * same args the product spawns (server/services/acpClient.ts:28).
   *
   * Before the grok-4.5 rate existed this turn priced at $0.00 with a null rate key, which is the
   * failure §2.4 of loops/06-tools-and-cost.md describes: the product drives grok and the rate
   * table held only OpenAI keys.
   */
  const LIVE_GROK_TURN_META = {
    sessionId: "019fe2e0-7393-74a0-b39a-aac6ed26312b",
    requestId: "a3301947-ea54-471d-8f47-5377321da0ba",
    totalTokens: 12326,
    modelId: "grok-4.5",
    inputTokens: 12306,
    outputTokens: 20,
    cachedReadTokens: 1408,
    reasoningTokens: 19,
    usage: {
      inputTokens: 12306, outputTokens: 20, totalTokens: 12326,
      cachedReadTokens: 1408, cacheCreationTokens: 0, reasoningTokens: 19,
      modelCalls: 1, apiDurationMs: 1631, costUsdTicks: 223_384_000, numTurns: 1,
    },
  };

  /** The same turn's own billed figure, from `usage.costUsdTicks` at 10^10 ticks to the dollar. */
  const BILLED_USD = 223_384_000 / 1e10;

  test("the id that actually arrives resolves to a rate", () => {
    const usage = extractUsage(LIVE_GROK_TURN_META);
    expect(usage.modelId).toBe("grok-4.5");
    expect(resolveRate(usage.modelId)?.[0]).toBe("grok-4.5");
  });

  test("our estimate for that turn equals what the provider billed for it", () => {
    // The published rate is only worth having if it reproduces a real bill. The sole difference
    // is estimateCost's rounding to six decimal places.
    const est = estimateCost(extractUsage(LIVE_GROK_TURN_META));
    expect(est.rateKey).toBe("grok-4.5");
    expect(est.costUsd).toBe(Number(BILLED_USD.toFixed(6)));
    expect(est.costUsd).toBeGreaterThan(0);
  });

  test("a dated grok-4.5 id still resolves, as gpt-4o's does", () => {
    expect(resolveRate("grok-4.5-0709")?.[0]).toBe("grok-4.5");
  });
});

describe("COST-002: every model and medium the product can call has a rate, or is deliberately unpriced", () => {
  test("every text model configured for the grok binary is named", () => {
    // `grok models` on 2026-08-08 lists exactly these three. hf-qwen-coder is the third and it is
    // deliberately unpriced — see the UNPRICED_BY_DESIGN case below.
    expect(resolveRate("grok-4.5")?.[0]).toBe("grok-4.5");
    expect(resolveRate("gpt-4o")?.[0]).toBe("gpt-4o");
  });

  test("every rate carries the page it was read from and the date", () => {
    // A rate with no provenance cannot be re-checked when it drifts (§7). The rate-table editor
    // (COST-009) and the drift report (COST-014) render these; this test is what keeps a rate from
    // being added without one.
    for (const [key, rate] of Object.entries(DEFAULT_RATES)) {
      expect(rate.source.url, `${key} has no source url`).toMatch(/^https:\/\//);
      expect(rate.source.readOn, `${key} has no read date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const [key, rate] of Object.entries(DEFAULT_UNIT_RATES)) {
      expect(rate.source.url, `${key} has no source url`).toMatch(/^https:\/\//);
      expect(rate.source.readOn, `${key} has no read date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("a per-unit price exists for each medium the product can call", () => {
    expect(resolveUnitRate("grok-imagine-image")?.[1]).toMatchObject({ unit: "images", perUnitUsd: 0.02 });
    expect(resolveUnitRate("grok-imagine-image-quality")?.[1]).toMatchObject({ unit: "images", perUnitUsd: 0.05 });
    expect(resolveUnitRate("grok-imagine-video")?.[1]).toMatchObject({ unit: "video_seconds", perUnitUsd: 0.05 });
    expect(resolveUnitRate("grok-imagine-video-1.5")?.[1]).toMatchObject({ unit: "video_seconds", perUnitUsd: 0.08 });
    expect(resolveUnitRate("tts")?.[1]).toMatchObject({ unit: "characters" });
    expect(resolveUnitRate("stt")?.[1]).toMatchObject({ unit: "audio_hours", perUnitUsd: 0.1 });
    expect(resolveUnitRate("grok-voice-think-fast-2.0")?.[1]).toMatchObject({ unit: "realtime_minutes", perUnitUsd: 0.08 });
  });

  test("the 60-second workflow asset in §4.3 prices at the figure the document quotes", () => {
    // Eight 8-second clips at grok-imagine-video-1.5 plus one quality source image each.
    const video = meterCost({ rateKey: "grok-imagine-video-1.5", unit: "video_seconds", count: 8 * 8 });
    const images = meterCost({ rateKey: "grok-imagine-image-quality", unit: "images", count: 8 });
    expect(video.costUsd).toBeCloseTo(5.12, 6);
    expect(images.costUsd).toBeCloseTo(0.4, 6);
    expect(video.costUsd! + images.costUsd!).toBeCloseTo(5.52, 6);
    expect(video.pricing).toBe("metered");
  });

  test("narration prices per character, not per million", () => {
    // §4.3: 6,000 characters of narration at $15.00/1M is $0.09.
    expect(meterCost({ rateKey: "tts", unit: "characters", count: 6000 }).costUsd).toBeCloseTo(0.09, 6);
  });

  test("a medium with no rate is priced null and unknown, never zero", () => {
    const charge = meterCost({ rateKey: "e2b-sandbox", unit: "sandbox_minutes", count: 30 });
    expect(charge.costUsd).toBeNull();
    expect(charge.pricing).toBe("unknown");
    expect(charge.rateKey).toBeNull();
    // The count is still exact and must survive — only the price is unknown.
    expect(charge.units).toEqual({ kind: "sandbox_minutes", count: 30 });
  });

  test("a key whose unit disagrees with the caller's is unknown, not mispriced", () => {
    // Pricing video seconds off the image rate would be wrong in the cheap direction.
    const charge = meterCost({ rateKey: "grok-imagine-image", unit: "video_seconds", count: 64 });
    expect(charge.costUsd).toBeNull();
    expect(charge.pricing).toBe("unknown");
  });

  test("the rates that are deliberately absent are absent, and say why", () => {
    for (const [key, entry] of Object.entries(UNPRICED_BY_DESIGN)) {
      expect(resolveRate(key), `${key} must not be priced`).toBeNull();
      expect(resolveUnitRate(key), `${key} must not be priced`).toBeNull();
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.checkAt).toMatch(/^https:\/\//);
    }
    // The two the documents name: a sandbox meter no one has chosen a provider for (§2.6), and a
    // Hugging Face model whose price is whatever third party serves the request (§8).
    expect(Object.keys(UNPRICED_BY_DESIGN)).toContain("hf-qwen-coder");
    expect(Object.keys(UNPRICED_BY_DESIGN)).toContain("sandbox_minutes");
  });

  test("a prompt at or above 200k tokens is priced at the tier xAI actually charges", () => {
    // xAI doubles all three grok-4.5 figures at 200k, and its context window is 500k, so this is
    // reachable. Pricing it at the short-prompt tier would understate the bill by half.
    const long = estimateCost({
      inputTokens: 200_000, outputTokens: 1_000, totalTokens: 201_000,
      cachedReadTokens: 0, reasoningTokens: 0, modelId: "grok-4.5",
    });
    expect(long.costUsd).toBeCloseTo((200_000 / 1e6) * 4 + (1_000 / 1e6) * 12, 6);

    const short = estimateCost({
      inputTokens: 199_999, outputTokens: 1_000, totalTokens: 200_999,
      cachedReadTokens: 0, reasoningTokens: 0, modelId: "grok-4.5",
    });
    expect(short.costUsd).toBeCloseTo((199_999 / 1e6) * 2 + (1_000 / 1e6) * 6, 6);
    expect(long.costUsd).toBeGreaterThan(short.costUsd * 1.9);
  });

  test("a model with no long-prompt tier keeps one price at any length", () => {
    const est = estimateCost({
      inputTokens: 400_000, outputTokens: 0, totalTokens: 400_000,
      cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o",
    });
    expect(est.costUsd).toBeCloseTo((400_000 / 1e6) * 2.5, 6);
  });
});
