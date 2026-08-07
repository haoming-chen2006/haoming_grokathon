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
