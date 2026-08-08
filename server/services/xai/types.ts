/**
 * Types for the api.x.ai generation engine.
 *
 * Exported from here rather than from server/types/*.ts, which every worktree in this pivot
 * shares and none may edit (loops/04-generation.md §0.3). Anything another surface needs to build
 * against — the cost event, the asset sink, the error — is declared here so one import reaches it.
 */

/**
 * xAI reports spend in "ticks": 1 USD = 10^10 ticks. Verified against docs.x.ai §5.4, where
 * 37,756,000 ticks is documented as $0.0038.
 */
export const USD_TICKS_PER_DOLLAR = 10_000_000_000;

/** Convert a `usage.cost_in_usd_ticks` figure to dollars. */
export function ticksToUsd(ticks: number): number {
  return ticks / USD_TICKS_PER_DOLLAR;
}

/**
 * The five codes api.x.ai documents on a failed video job (§5.2), plus the four this client
 * raises on its own behalf. Keeping them in one union means a caller switches on one thing.
 */
export type XaiErrorCode =
  // Ours, raised without a request being sent or after the transport gave up.
  | "no_credential"
  | "timeout"
  | "rate_limited"
  | "bad_response"
  // xAI's, as documented for video jobs and returned in `error.code` on other endpoints.
  | "invalid_argument"
  | "permission_denied"
  | "failed_precondition"
  | "service_unavailable"
  | "internal_error";

/**
 * A failure from the api.x.ai surface, carrying the provider's own code.
 *
 * Modelled on `AcpError` (server/services/acpClient.ts:59-67): the code travels with the message
 * so a caller can branch on the failure without parsing prose. `invalid_argument` in particular
 * carries moderation blocks (§5.2), which must be surfaced and never retried.
 *
 * The request's Authorization header is deliberately not carried on this error. An error object
 * is logged, serialised into events and shown to users; a credential on it would reach all three.
 */
export class XaiError extends Error {
  constructor(
    message: string,
    readonly code: XaiErrorCode,
    /** HTTP status, when the failure came back as a response rather than a timeout. */
    readonly status?: number,
    /** The provider's error body, when it parsed. Never the request. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "XaiError";
  }

  /** A moderation block arrives as `invalid_argument`. Retrying spends money to be refused again. */
  get isRetryable(): boolean {
    return this.code === "service_unavailable" || this.code === "rate_limited";
  }
}

// ───────────────────────────────────────────────────────────────────────────── cost

export type CostOperation =
  | "image_generate"
  | "image_edit"
  | "video_generate"
  | "video_extend"
  | "tts"
  | "stt"
  | "realtime"
  | "structure_turn";

export type CostUnitKind = "images" | "video_seconds" | "characters" | "audio_minutes" | "tokens";

/**
 * Where the dollar figure came from.
 *
 * `ticks` is what xAI billed and is the best answer available. `unit_rate` is our own count times
 * a published per-unit price and is exact by construction — an image is $0.02, a second of video
 * is $0.080. `token_estimate` is the only one that is not exact, because a token price is a list
 * price that drifts (server/services/usageAccounting.ts:37-44).
 */
export type CostSource = "ticks" | "unit_rate" | "token_estimate";

/**
 * One billable call. 06 stores these; this worktree produces them (loops/04-generation.md §6.1).
 *
 * Units, unit rate and source travel with every dollar amount on purpose: a cost figure with no
 * unit count cannot be checked by anyone, including the code that produced it.
 */
export interface CostEvent {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  projectId: string;
  agentId: string;
  areaId?: string;
  taskId?: string;
  /** Recorded only when 03's caller supplies it. Never inferred from a project id (§1.3). */
  designDocId?: string;
  operation: CostOperation;
  provider: "xai";
  modelId: string;
  units: { kind: CostUnitKind; count: number };
  /** USD per unit, when a published per-unit price exists for this model. */
  unitRateUsd?: number;
  costUsd: number;
  source: CostSource;
  exact: boolean;
  /** The model key the rate was found under, or null when no rate is known for it. */
  rateKey: string | null;
  assetIds?: string[];
  /** Video jobs, so a charge traces back to its job. */
  requestId?: string;
  jobId?: string;
  /**
   * Present only when the response carried `cost_in_usd_ticks` *and* a published unit rate was
   * supplied. Two independent derivations of one charge; they should agree, and a disagreement is
   * a finding rather than a thing to choose between.
   */
  ticksUsd?: number;
  unitRateDerivedUsd?: number;
}

/** Receives every cost event. 06 wires the ledger in at startup; the default sink is a no-op. */
export type CostSink = (event: CostEvent) => void;

// ───────────────────────────────────────────────────────────────────────────── assets

export type GeneratedAssetKind =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "slides"
  | "table"
  | "workflow";

export interface AssetPutInput {
  projectId: string;
  agentId: string;
  /** Supplied by 03's caller when work was declared from a design document. Never inferred. */
  designDocId?: string;
  bytes: Uint8Array;
  mimeType: string;
  kind: GeneratedAssetKind;
  sourceModel: string;
  sourcePrompt?: string;
  params: Record<string, unknown>;
  /** Provenance only. Expired by the time anyone reads it (§3.5). */
  sourceUrl?: string;
  requestId?: string;
  costEventId?: string;
}

export interface AssetPutResult {
  assetId: string;
  sha256: string;
  bytes: number;
}

/**
 * 02 owns the store. This worktree owns the discipline of handing it bytes at the right moment:
 * a generated asset that has not been persisted does not exist, because the URL in the response
 * is already dying (§3.5).
 *
 * `findByInputHash` is the regeneration cache and is the strongest cost control in this engine —
 * stronger than any budget cap, because it prevents the spend rather than stopping after it.
 */
export interface AssetSink {
  put(input: AssetPutInput): Promise<AssetPutResult>;
  findByInputHash(hash: string): Promise<{ assetId: string } | null>;
}
