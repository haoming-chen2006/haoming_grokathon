import { describe, expect, test } from "bun:test";
import { DEFAULT_RATES, estimateCost, extractUsage, resolveRate } from "./usageAccounting";

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
