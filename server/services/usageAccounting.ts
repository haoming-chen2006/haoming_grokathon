/**
 * Token accounting and cost estimation (V-045).
 *
 * Token counts come from the agent and are exact. Money does not: prices change and vary by
 * account, so every derived figure is marked `estimated` and the rate used is reported alongside
 * it. §22.18 forbids fabricated cost — an unlabelled dollar figure would be exactly that.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedReadTokens: number;
  reasoningTokens: number;
  modelId?: string;
}

export interface ModelRate {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
  /** USD per million cached-read input tokens, when the provider discounts them. */
  cachedInputPerMillion?: number;
}

/**
 * Published list prices, used only to estimate. Override per deployment — these are not authoritative
 * and will drift.
 */
export const DEFAULT_RATES: Record<string, ModelRate> = {
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10, cachedInputPerMillion: 1.25 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.075 },
  "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5 },
};

export interface CostEstimate {
  costUsd: number;
  /** Always true for this function — the figure is derived from list prices, not billed amounts. */
  estimated: true;
  /** The rate key actually used, so an unexpected number can be traced to its assumption. */
  rateKey: string | null;
  tokens: TokenUsage;
}

/** Normalise the `_meta` a prompt returns into a token record. Missing fields become zero. */
export function extractUsage(meta: Record<string, any> | undefined): TokenUsage {
  const usage = meta?.usage ?? {};
  const num = (...vals: unknown[]) => {
    for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
    return 0;
  };
  return {
    inputTokens: num(usage.inputTokens, meta?.inputTokens),
    outputTokens: num(usage.outputTokens, meta?.outputTokens),
    totalTokens: num(usage.totalTokens, meta?.totalTokens),
    cachedReadTokens: num(usage.cachedReadTokens, meta?.cachedReadTokens),
    reasoningTokens: num(usage.reasoningTokens, meta?.reasoningTokens),
    modelId: typeof meta?.modelId === "string" ? meta.modelId : undefined,
  };
}

/** Match a model id against the rate table, tolerating dated suffixes like `gpt-4o-2024-08-06`. */
export function resolveRate(modelId: string | undefined, rates = DEFAULT_RATES): [string, ModelRate] | null {
  if (!modelId) return null;
  if (rates[modelId]) return [modelId, rates[modelId]];
  // Longest prefix wins, so `gpt-4o-mini-…` does not match `gpt-4o`.
  const keys = Object.keys(rates).sort((a, b) => b.length - a.length);
  for (const key of keys) if (modelId.startsWith(key)) return [key, rates[key]];
  return null;
}

/**
 * Estimate cost from token counts. Returns 0 with `rateKey: null` when the model is unknown —
 * an honest zero the UI can label, never a guessed price.
 */
export function estimateCost(tokens: TokenUsage, rates = DEFAULT_RATES): CostEstimate {
  const resolved = resolveRate(tokens.modelId, rates);
  if (!resolved) return { costUsd: 0, estimated: true, rateKey: null, tokens };

  const [rateKey, rate] = resolved;
  // Cached reads are billed at a discount where the provider offers one, so they are subtracted
  // from the full-price input count rather than counted twice.
  const cached = Math.min(tokens.cachedReadTokens, tokens.inputTokens);
  const fullPriceInput = Math.max(0, tokens.inputTokens - cached);

  const cost =
    (fullPriceInput / 1_000_000) * rate.inputPerMillion +
    (cached / 1_000_000) * (rate.cachedInputPerMillion ?? rate.inputPerMillion) +
    (tokens.outputTokens / 1_000_000) * rate.outputPerMillion;

  return { costUsd: Number(cost.toFixed(6)), estimated: true, rateKey, tokens };
}
