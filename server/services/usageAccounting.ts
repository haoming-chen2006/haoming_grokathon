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
  /**
   * What the provider says the turn actually cost, at 10^10 ticks to the dollar. Present on a
   * grok-4.5 turn over ACP and absent on a gpt-4o one, observed 2026-08-08 — so a turn is billed or
   * estimated according to the response, never according to which code path produced it.
   */
  costUsdTicks?: number;
}

/** xAI reports billed cost in ticks; 10^10 of them make a dollar. */
export const USD_TICKS_PER_DOLLAR = 1e10;

/**
 * Where a price came from. Required on every rate: a rate with no provenance cannot be re-checked
 * when it drifts, and drift is the normal case rather than the exception. Rendered by the rate-table
 * editor (COST-009) and by the drift report (COST-014).
 */
export interface RateSource {
  /** The page the figure was read from. */
  url: string;
  /** ISO date the page was read. */
  readOn: string;
}

/** The three token prices that apply together. */
export interface TokenTier {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
  /** USD per million cached-read input tokens, when the provider discounts them. */
  cachedInputPerMillion?: number;
}

export interface ModelRate extends TokenTier {
  source: RateSource;
  /**
   * A second set of prices that replaces the base one once a prompt reaches `fromInputTokens`.
   * xAI doubles all three grok-4.5 figures at 200k and its context window is 500k, so the step is
   * reachable in an ordinary long session; pricing such a turn at the short-prompt tier would
   * understate the bill by half, which is the direction that goes unnoticed.
   */
  longPrompt?: TokenTier & { fromInputTokens: number };
}

const XAI_MODELS: RateSource = { url: "https://docs.x.ai/docs/models", readOn: "2026-08-08" };
const OPENAI_PRICING: RateSource = { url: "https://developers.openai.com/api/docs/pricing", readOn: "2026-08-08" };

/**
 * Published list prices, used only to estimate. Override per deployment — these are not authoritative
 * and will drift.
 */
export const DEFAULT_RATES: Record<string, ModelRate> = {
  // Proven rather than merely sourced: these figures reproduce a real turn's own billed
  // `costUsdTicks` to the sixth decimal — see the COST-001 case in usageAccounting.test.ts.
  "grok-4.5": {
    inputPerMillion: 2,
    outputPerMillion: 6,
    cachedInputPerMillion: 0.3,
    longPrompt: { fromInputTokens: 200_000, inputPerMillion: 4, outputPerMillion: 12, cachedInputPerMillion: 0.6 },
    source: XAI_MODELS,
  },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10, cachedInputPerMillion: 1.25, source: OPENAI_PRICING },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.075, source: OPENAI_PRICING },
  "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5, source: OPENAI_PRICING },
};

/** What one unit of a metered charge is. `tokens` is priced by `DEFAULT_RATES`, not per unit. */
export type MediaUnitKind =
  | "images"
  | "video_seconds"
  | "characters"
  | "audio_hours"
  | "realtime_minutes"
  | "sandbox_minutes";

export type UnitKind = "tokens" | MediaUnitKind;

/**
 * A price for one unit of a medium. Separate from `ModelRate` because the arithmetic is different
 * and so is the confidence: we choose the unit count — n images, d seconds, len(text) characters —
 * so the only way the figure is wrong is if the published rate drifted. A token estimate has three
 * sources of error against that one.
 */
export interface UnitRate {
  unit: MediaUnitKind;
  /** USD for exactly one unit of `unit`. */
  perUnitUsd: number;
  source: RateSource;
}

/**
 * Per-unit media prices.
 *
 * The keys for image, video and realtime speech are the model ids xAI publishes. **`tts`, `stt` and
 * `stt-streaming` are ours**: the pricing table lists those two as services and names no model id,
 * so a caller must pass these keys explicitly rather than expect a provider id to resolve.
 *
 * Not priced here, deliberately: the "$0.004 / text input" component xAI lists beside each
 * speech-to-speech model. The page does not say what one text input is, and a guess would be a
 * fabrication. A realtime charge is metered on audio minutes and that component is missing.
 */
export const DEFAULT_UNIT_RATES: Record<string, UnitRate> = {
  "grok-imagine-image": { unit: "images", perUnitUsd: 0.02, source: XAI_MODELS },
  "grok-imagine-image-quality": { unit: "images", perUnitUsd: 0.05, source: XAI_MODELS },
  "grok-imagine-video": { unit: "video_seconds", perUnitUsd: 0.05, source: XAI_MODELS },
  "grok-imagine-video-1.5": { unit: "video_seconds", perUnitUsd: 0.08, source: XAI_MODELS },
  // $15.00 per million characters, expressed per character so the arithmetic needs no scaling.
  tts: { unit: "characters", perUnitUsd: 15 / 1_000_000, source: XAI_MODELS },
  stt: { unit: "audio_hours", perUnitUsd: 0.1, source: XAI_MODELS },
  "stt-streaming": { unit: "audio_hours", perUnitUsd: 0.2, source: XAI_MODELS },
  "grok-voice-think-fast-1.0": { unit: "realtime_minutes", perUnitUsd: 0.05, source: XAI_MODELS },
  "grok-voice-think-fast-2.0": { unit: "realtime_minutes", perUnitUsd: 0.08, source: XAI_MODELS },
};

/**
 * Things this product can be pointed at that have **no** rate, on purpose.
 *
 * Absent is the honest state. A guessed number would understate a bill that runs while nobody is
 * watching, and it would do so silently; an unpriced charge at least announces itself in the
 * unpriced-charge report (COST-009). Each entry names the page that must be read before it can be
 * priced, so the next person does not have to rediscover why it is missing.
 */
export const UNPRICED_BY_DESIGN: Record<string, { reason: string; checkAt: string }> = {
  "hf-qwen-coder": {
    reason:
      "Configured for the grok binary (~/.grok/config.toml, Qwen/Qwen2.5-Coder-32B-Instruct via " +
      "router.huggingface.co) but Hugging Face publishes no fixed per-token price: it passes " +
      "through whatever third-party provider serves the request, so the price depends on routing " +
      "at call time and cannot be tabulated in advance.",
    checkAt: "https://huggingface.co/docs/inference-providers/en/pricing",
  },
  sandbox_minutes: {
    reason:
      "A software preview is metered by wall clock by a third party that is not xAI and returns no " +
      "cost figure. 05-software has not named the provider, so there is no published rate to read. " +
      "Priced only once that loop names it.",
    checkAt: "https://e2b.dev/docs/pricing",
  },
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
  const ticks = usage.costUsdTicks ?? meta?.costUsdTicks;
  return {
    inputTokens: num(usage.inputTokens, meta?.inputTokens),
    outputTokens: num(usage.outputTokens, meta?.outputTokens),
    totalTokens: num(usage.totalTokens, meta?.totalTokens),
    cachedReadTokens: num(usage.cachedReadTokens, meta?.cachedReadTokens),
    reasoningTokens: num(usage.reasoningTokens, meta?.reasoningTokens),
    modelId: typeof meta?.modelId === "string" ? meta.modelId : undefined,
    // Left `undefined` rather than 0 when absent: a turn that reported no billed figure and a turn
    // that was genuinely free are different facts, and only one of them is a price.
    costUsdTicks: typeof ticks === "number" && Number.isFinite(ticks) ? ticks : undefined,
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
  // A long prompt is charged at a higher tier where the provider steps its prices; the step is on
  // the prompt length, so it is decided before any of the arithmetic below.
  const tier: TokenTier =
    rate.longPrompt && tokens.inputTokens >= rate.longPrompt.fromInputTokens ? rate.longPrompt : rate;
  // Cached reads are billed at a discount where the provider offers one, so they are subtracted
  // from the full-price input count rather than counted twice.
  const cached = Math.min(tokens.cachedReadTokens, tokens.inputTokens);
  const fullPriceInput = Math.max(0, tokens.inputTokens - cached);

  const cost =
    (fullPriceInput / 1_000_000) * tier.inputPerMillion +
    (cached / 1_000_000) * (tier.cachedInputPerMillion ?? tier.inputPerMillion) +
    (tokens.outputTokens / 1_000_000) * tier.outputPerMillion;

  return { costUsd: Number(cost.toFixed(6)), estimated: true, rateKey, tokens };
}

/** Match a media key against the per-unit table, tolerating dated suffixes as `resolveRate` does. */
export function resolveUnitRate(key: string | undefined, rates = DEFAULT_UNIT_RATES): [string, UnitRate] | null {
  if (!key) return null;
  if (rates[key]) return [key, rates[key]];
  const keys = Object.keys(rates).sort((a, b) => b.length - a.length);
  for (const k of keys) if (key.startsWith(k)) return [k, rates[k]];
  return null;
}

/** What a metered charge came to, and how sure we are of it. */
export interface UnitCharge {
  /** `null` when nothing could price it — never 0, which reads as free. */
  costUsd: number | null;
  /** `metered` when units × a published rate produced the figure; `unknown` when nothing did. */
  pricing: "metered" | "unknown";
  rateKey: string | null;
  /** The count is exact whether or not the price is known, so it survives either way. */
  units: { kind: UnitKind; count: number };
}

/**
 * Price a media charge from units × a published per-unit rate — the second, non-token code path.
 *
 * The caller declares the unit it thinks it is buying, and a resolved rate must agree with that
 * declaration. Disagreement is a caller bug, and pricing video seconds off the image rate would be
 * wrong in the direction nobody notices, so the charge is returned unpriced instead.
 */
export function meterCost(
  request: { rateKey?: string; unit: MediaUnitKind; count: number },
  rates = DEFAULT_UNIT_RATES,
): UnitCharge {
  const units = { kind: request.unit as UnitKind, count: request.count };
  const resolved = resolveUnitRate(request.rateKey, rates);
  if (!resolved || resolved[1].unit !== request.unit) {
    return { costUsd: null, pricing: "unknown", rateKey: null, units };
  }
  const [rateKey, rate] = resolved;
  return {
    costUsd: Number((rate.perUnitUsd * request.count).toFixed(6)),
    pricing: "metered",
    rateKey,
    units,
  };
}

/** What one turn cost, in the shape a ledger row wants (COST-004). */
export interface TurnCharge {
  costUsd: number | null;
  pricing: "billed" | "estimated" | "unknown";
  rateKey: string | null;
  modelId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

/**
 * Price one turn, preferring what the provider billed over what we can derive.
 *
 * This is the single call an ingest site makes, so that wiring the ledger into a file this loop does
 * not own is one line rather than a policy decision copied into three places. The tier comes from
 * the response: a turn carrying `costUsdTicks` is `billed`, a turn priced from a rate is
 * `estimated`, and a turn whose model is in no rate table is `unknown` — never a zero.
 */
export function turnCharge(usage: TokenUsage, rates = DEFAULT_RATES): TurnCharge {
  const shared = {
    modelId: usage.modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedTokens: usage.cachedReadTokens,
    reasoningTokens: usage.reasoningTokens,
  };
  const rateKey = resolveRate(usage.modelId, rates)?.[0] ?? null;

  if (usage.costUsdTicks !== undefined) {
    return { ...shared, costUsd: usage.costUsdTicks / USD_TICKS_PER_DOLLAR, pricing: "billed", rateKey };
  }
  if (!rateKey) return { ...shared, costUsd: null, pricing: "unknown", rateKey: null };
  return { ...shared, costUsd: estimateCost(usage, rates).costUsd, pricing: "estimated", rateKey };
}
