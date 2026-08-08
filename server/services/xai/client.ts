/**
 * The HTTP transport to api.x.ai (loops/04-generation.md G1).
 *
 * One credential read, one base URL, one rate limiter. Every media call in this engine goes
 * through `XaiClient.request`, so the things that must never be forgotten — the secret scan, the
 * rate limit, the tick conversion, the cost event — are forgotten in one place or not at all.
 *
 * ── Why this is hand-rolled `fetch` ───────────────────────────────────────────────────────────
 * For the same class of reason server/services/acpClient.ts:85-95 gives for not using the ACP
 * SDK. There is no official xAI TypeScript SDK at all: the official one is Python and gRPC-based.
 * The third-party JS options cover chat and images only — not video job polling, not `/v1/tts`
 * with timestamps, not the realtime socket — so adopting one would still leave most of this file
 * to write, plus a dependency in package.json, which this worktree may not edit (§0.3).
 *
 * ── What this file must never do ──────────────────────────────────────────────────────────────
 * The key is read from the environment once, at construction. It is never logged, never placed on
 * an event, never put on an error, and never written anywhere durable. `XAI_API_KEY` is also a
 * *different* credential from whatever signs the `grok` CLI in (§2.1); a failure here says so, so
 * that a user does not go and fix the wrong one.
 */

import { assertNoSecrets } from "../secrets";
import {
  ticksToUsd,
  XaiError,
  type CostEvent,
  type CostOperation,
  type CostSink,
  type CostSource,
  type CostUnitKind,
} from "./types";

const QUIET = !!process.env.OPENUI_QUIET;

/**
 * Every diagnostic this module emits, through one function.
 *
 * Two reasons it is not the house's bound-logger idiom (`QUIET ? () => {} : console.log.bind(…)`,
 * server/services/acpClient.ts:6-8). First, a bound logger is captured at module load, so the test
 * that proves a credential never reaches a log line cannot observe it — and that test passing
 * vacuously is worse than not having it. Second, one function is one place to audit: if a key ever
 * did reach a log, it reached it from here.
 */
function report(level: "info" | "warn", message: string): void {
  if (QUIET) return;
  if (level === "warn") console.error(message);
  else console.info(message);
}

/** The one place that knows where api.x.ai lives. */
export const XAI_BASE_URL = "https://api.x.ai/v1";

/**
 * The named error a caller sees when no media credential is configured. Raised before a request
 * is built, so it can never be confused with a 401 from a request that should not have been sent.
 */
export const NO_CREDENTIAL_MESSAGE =
  "no xAI credential is configured; media generation is unavailable. Set XAI_API_KEY (or " +
  "xai_api_key) in the environment. This is a different credential from the one that signs the " +
  "`grok` CLI in — signing the CLI in does not enable media generation, and setting this does not " +
  "sign the CLI in.";

// ───────────────────────────────────────────────────────────────────────── endpoints

export type XaiEndpoint =
  | "image_generate"
  | "image_edit"
  | "video_generate"
  | "video_edit"
  | "video_extend"
  | "video_poll"
  | "tts"
  | "tts_voices"
  | "stt"
  | "chat";

export interface EndpointTimeout {
  /** Whole-call budget, from request start to a parsed body. */
  totalMs: number;
  /** Budget for response headers to arrive. See the note on `firstByteMs` below. */
  firstByteMs: number;
  /** Where the numbers came from, so a later reader can tell sourced from chosen. */
  provenance: string;
}

/**
 * Per-endpoint timeouts.
 *
 * `firstByteMs` is a time-to-first-byte budget, not a between-bytes one. The `grok` CLI's 240 s
 * figure is reqwest's per-read inactivity timeout, which needs a streaming reader; TTFB is a
 * faithful stand-in for these endpoints because the proxy buffers the whole image and then sends
 * it, so the wait is almost entirely before the first byte. Said plainly here rather than left as
 * an implied equivalence.
 *
 * Only two rows are sourced from a published figure. The rest are this client's own choice and are
 * labelled as such — §5 of the loop document is explicit that anything it does not state is
 * unverified, and inventing a number quietly is how an unverified figure becomes a fact.
 */
export const XAI_TIMEOUTS: Record<XaiEndpoint, EndpointTimeout> = {
  image_generate: {
    totalMs: 300_000,
    firstByteMs: 240_000,
    provenance: "the grok CLI's own image-generation timeouts; some models expand the prompt first",
  },
  image_edit: {
    totalMs: 300_000,
    firstByteMs: 240_000,
    provenance: "same path as image_generate",
  },
  video_generate: { totalMs: 60_000, firstByteMs: 30_000, provenance: "ours — submit returns a request_id, not a video" },
  video_edit: { totalMs: 60_000, firstByteMs: 30_000, provenance: "ours — as video_generate" },
  video_extend: { totalMs: 60_000, firstByteMs: 30_000, provenance: "ours — as video_generate" },
  video_poll: { totalMs: 30_000, firstByteMs: 15_000, provenance: "ours — a status read, not a render" },
  tts: {
    totalMs: 900_000,
    firstByteMs: 120_000,
    provenance: "docs.x.ai states a 15-minute REST request timeout for /v1/tts",
  },
  tts_voices: { totalMs: 15_000, firstByteMs: 10_000, provenance: "ours — a small list read" },
  stt: { totalMs: 900_000, firstByteMs: 120_000, provenance: "ours — matched to the tts budget; a 500 MB upload" },
  chat: { totalMs: 120_000, firstByteMs: 60_000, provenance: "ours — structure generation, non-streaming" },
};

/**
 * Rate limits, flat across every spend tier (§3.10). Spending more unlocks text tiers, not media
 * throughput, so there is no account on which raising these is correct.
 *
 * Text and voice have no published flat limit. They are deliberately unlimited here rather than
 * given a guessed number.
 */
export const XAI_RATE_LIMITS = { images: 5, video: 10 } as const;

type LimiterFamily = "images" | "video" | null;

function familyOf(endpoint: XaiEndpoint): LimiterFamily {
  if (endpoint === "image_generate" || endpoint === "image_edit") return "images";
  if (endpoint.startsWith("video_")) return "video";
  return null;
}

// ───────────────────────────────────────────────────────────────────────── the clock

/** Injected so the limiter's behaviour is testable without spending wall-clock seconds. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Spaces requests by a minimum interval — 200 ms for images, 100 ms for video.
 *
 * The first shape tried here was a token bucket with capacity equal to the rate, which lets five
 * images go at once and then one every 200 ms. That is 5 RPS on average and *nine* starts inside
 * the first second, which is precisely the burst a windowed server-side limiter answers with a
 * 429. The limiter exists to prevent 429s, not to average out to the right number, so it spaces
 * instead of bursting: no one-second window ever holds more than `ratePerSec` starts.
 *
 * The cost is that 30 images take 5.8 s of spacing rather than 5.0 s — close to §3.10's stated
 * "≥6-second serialised floor", which is 30÷5 counted the same way. A single call is never
 * delayed, because the first request through an idle limiter waits for nothing.
 */
class RequestSpacer {
  private nextAllowedAt = Number.NEGATIVE_INFINITY;
  /** Serialises waiters, or two concurrent callers both read the same `nextAllowedAt`. */
  private tail: Promise<void> = Promise.resolve();

  constructor(
    readonly ratePerSec: number,
    private readonly clock: Clock,
  ) {}

  take(): Promise<void> {
    const run = this.tail.then(() => this.acquire());
    this.tail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  private async acquire(): Promise<void> {
    const minGapMs = 1000 / this.ratePerSec;
    const wait = this.nextAllowedAt - this.clock.now();
    if (wait > 0) await this.clock.sleep(Math.ceil(wait));
    this.nextAllowedAt = this.clock.now() + minGapMs;
  }
}

// ───────────────────────────────────────────────────────────────────────── transport seam

export interface XaiHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
  endpoint: XaiEndpoint;
  /** The endpoint's budgets, so a recorded transport can assert they were applied. */
  totalMs: number;
  firstByteMs: number;
}

export type XaiTransport = (request: XaiHttpRequest) => Promise<Response>;

const REAL_TRANSPORT: XaiTransport = (request) =>
  fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });

let transport: XaiTransport = REAL_TRANSPORT;

/**
 * Replace the outbound HTTP call. Tests only; never production.
 *
 * A seam rather than `mock.module`, which patches the module registry process-wide and only
 * reaches importers evaluated after it runs. In a full suite it is silently inert, so the test
 * that looked mocked makes the real call (loopdesign.md:257-263). There that cost six live `grok`
 * children and a run that never finished. Here the same mistake spends money.
 */
export function setXaiTransport(fn: XaiTransport | null): void {
  transport = fn ?? REAL_TRANSPORT;
}

// ───────────────────────────────────────────────────────────────────────── cost seam

const NO_OP_COST_SINK: CostSink = () => {};
let costSink: CostSink = NO_OP_COST_SINK;

/** 06 wires the ledger in once at startup. The default sink drops events on the floor. */
export function setCostSink(sink: CostSink | null): void {
  costSink = sink ?? NO_OP_COST_SINK;
}

let costEventCounter = 0;

function newCostEventId(): string {
  costEventCounter += 1;
  return `cost_${Date.now().toString(36)}${costEventCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ───────────────────────────────────────────────────────────────────────── requests

/** Who a charge is attributed to. Supplied by the caller; never inferred here. */
export interface XaiCallContext {
  projectId: string;
  agentId: string;
  areaId?: string;
  taskId?: string;
  /** Only when 03's caller supplies it (§1.3). One project may follow several documents. */
  designDocId?: string;
}

/**
 * What the caller knows about the price that the transport cannot work out for itself: which
 * operation this is, how many units it bought, and the published price per unit.
 */
export interface XaiBilling {
  operation: CostOperation;
  modelId: string;
  units: { kind: CostUnitKind; count: number };
  /** Published USD per unit, when one exists for this model. Absent means no rate is known. */
  unitRateUsd?: number;
  requestId?: string;
  jobId?: string;
}

export interface XaiRequestSpec {
  endpoint: XaiEndpoint;
  /** Path under the base URL, e.g. "/images/generations". */
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  context?: XaiCallContext;
  billing?: XaiBilling;
}

export interface XaiResponse<T> {
  data: T;
  status: number;
  /** `usage.cost_in_usd_ticks` as returned, or null when the response carried none. */
  ticks: number | null;
  /** Ticks converted at 10^10, or null when there were none. */
  costUsd: number | null;
  /** The event handed to the cost sink, when the caller supplied billing information. */
  costEvent: CostEvent | null;
  /** How many 429s this call absorbed before succeeding. */
  rateLimitRetries: number;
}

export interface XaiClientOptions {
  /** Overrides the environment read. Tests, and nothing else. */
  apiKey?: string;
  baseUrl?: string;
  clock?: Clock;
  /**
   * Overrides rows of `XAI_TIMEOUTS`. Tests, and nothing else: the timeout path cannot otherwise
   * be exercised without waiting out a 300-second budget, and an untested timeout path is how an
   * abort surfaces as an opaque `AbortError` instead of a sentence naming the endpoint.
   */
  timeouts?: Partial<Record<XaiEndpoint, EndpointTimeout>>;
}

/** How long to wait after a 429 before the one permitted retry. */
export const RATE_LIMIT_BACKOFF_MS = 1_000;

export class XaiClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly clock: Clock;
  private readonly timeouts: Record<XaiEndpoint, EndpointTimeout>;
  private readonly limiters: Record<"images" | "video", RequestSpacer>;
  private rateLimitHits = 0;

  constructor(options: XaiClientOptions = {}) {
    // Read once, here. A per-call read would let a key rotated into the environment mid-process
    // change behaviour halfway through a job, and would give three places to leak it from.
    //
    // `xai_api_key` is read as well because that is the name the credential actually has in this
    // repository's `.env`, and a client that only looks for `XAI_API_KEY` reports "no credential"
    // on a machine where the credential is present — the most expensive kind of wrong answer,
    // because it sends someone to fix a key that was never broken. `XAI_API_KEY` still wins, so an
    // environment that sets both behaves exactly as before.
    this.apiKey = options.apiKey ?? process.env.XAI_API_KEY ?? process.env.xai_api_key;
    this.baseUrl = options.baseUrl ?? XAI_BASE_URL;
    this.clock = options.clock ?? REAL_CLOCK;
    this.timeouts = { ...XAI_TIMEOUTS, ...options.timeouts };
    this.limiters = {
      images: new RequestSpacer(XAI_RATE_LIMITS.images, this.clock),
      video: new RequestSpacer(XAI_RATE_LIMITS.video, this.clock),
    };
  }

  /** Whether a media credential is present. Never exposes the credential itself. */
  get hasCredential(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  /** Total 429s absorbed since construction, for the setup panel and for GEN-016's evidence. */
  get rateLimitCount(): number {
    return this.rateLimitHits;
  }

  async request<T = unknown>(spec: XaiRequestSpec): Promise<XaiResponse<T>> {
    if (!this.hasCredential) throw new XaiError(NO_CREDENTIAL_MESSAGE, "no_credential");

    const method = spec.method ?? (spec.body === undefined ? "GET" : "POST");
    const body = spec.body === undefined ? undefined : JSON.stringify(spec.body);

    // Scan the whole serialised body rather than a list of prompt fields the caller passes in.
    // A list is a thing a call site can forget; the body is not. Everything outbound is user text
    // as far as this check is concerned (server/services/secrets.ts:113).
    if (body !== undefined) {
      assertNoSecrets(body, `an outbound ${spec.endpoint} request to api.x.ai`);
    }

    const family = familyOf(spec.endpoint);
    if (family) await this.limiters[family].take();

    let retries = 0;
    let response = await this.send(spec, method, body);

    // One retry, and one only. Every retry path in this engine is bounded because a retry loop
    // against a priced endpoint is a spend loop.
    if (response.status === 429) {
      this.rateLimitHits += 1;
      report(
        "warn",
        `[xai] 429 from ${spec.endpoint}; retrying once after ${RATE_LIMIT_BACKOFF_MS}ms ` +
          `(limit is ${family ? XAI_RATE_LIMITS[family] : "unpublished"} RPS and is applied in the client)`,
      );
      await this.clock.sleep(RATE_LIMIT_BACKOFF_MS);
      if (family) await this.limiters[family].take();
      retries = 1;
      response = await this.send(spec, method, body);
      if (response.status === 429) this.rateLimitHits += 1;
    }

    const payload = await readJson(response, spec.endpoint);
    const ticks = extractTicks(payload);
    const costUsd = ticks === null ? null : ticksToUsd(ticks);

    // Before returning, and before throwing: a call that failed after being billed is still a
    // charge, and a charge the ledger never sees is exactly the hole this engine exists to close.
    const costEvent = this.emitCost(spec, ticks, costUsd);

    if (!response.ok) throw errorFor(response.status, payload, spec.endpoint);

    return { data: payload as T, status: response.status, ticks, costUsd, costEvent, rateLimitRetries: retries };
  }

  private async send(spec: XaiRequestSpec, method: string, body: string | undefined): Promise<Response> {
    const budget = this.timeouts[spec.endpoint];
    const controller = new AbortController();
    let expired: "total" | "first_byte" | null = null;

    const totalTimer = setTimeout(() => {
      expired = "total";
      controller.abort();
    }, budget.totalMs);
    const firstByteTimer = setTimeout(() => {
      expired = "first_byte";
      controller.abort();
    }, budget.firstByteMs);

    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    try {
      const response = await transport({
        url: `${this.baseUrl}${spec.path}`,
        method,
        headers,
        body,
        signal: controller.signal,
        endpoint: spec.endpoint,
        totalMs: budget.totalMs,
        firstByteMs: budget.firstByteMs,
      });
      // Headers have arrived, so the first-byte budget is spent. The total budget runs on until
      // the body is read.
      clearTimeout(firstByteTimer);
      return response;
    } catch (err) {
      if (expired) {
        const ms = expired === "total" ? budget.totalMs : budget.firstByteMs;
        const which = expired === "total" ? "total" : "time to first byte";
        throw new XaiError(
          `api.x.ai ${spec.endpoint} exceeded its ${which} budget of ${ms}ms (${budget.provenance})`,
          "timeout",
        );
      }
      throw err;
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(firstByteTimer);
    }
  }

  /**
   * Compose and emit one cost event. Returns null when the caller supplied no billing information,
   * which is the honest outcome for a call that buys nothing — listing voices, polling a job.
   */
  private emitCost(spec: XaiRequestSpec, ticks: number | null, ticksUsd: number | null): CostEvent | null {
    const { billing, context } = spec;
    if (!billing || !context) return null;

    const unitRateDerivedUsd =
      billing.unitRateUsd === undefined ? undefined : billing.unitRateUsd * billing.units.count;

    let source: CostSource;
    let costUsd: number;
    if (ticksUsd !== null) {
      source = "ticks";
      costUsd = ticksUsd;
    } else if (unitRateDerivedUsd !== undefined) {
      source = "unit_rate";
      costUsd = unitRateDerivedUsd;
    } else {
      // No billed figure and no published rate. Recording zero as though it were a price is what
      // makes today's product show $0.00 for every Grok model (§3.11); say the rate is unknown.
      source = "token_estimate";
      costUsd = 0;
    }

    // Two independent derivations of one charge. They should agree; a disagreement means either
    // the published price moved or our unit count is wrong, and both are things to find out from
    // a log line rather than from a bill.
    if (ticksUsd !== null && unitRateDerivedUsd !== undefined) {
      const drift = Math.abs(ticksUsd - unitRateDerivedUsd);
      if (drift > 1e-9 && drift / Math.max(ticksUsd, unitRateDerivedUsd) > 0.01) {
        report(
          "warn",
          `[xai] cost disagreement on ${billing.operation} (${billing.modelId}): ` +
            `billed $${ticksUsd.toFixed(6)} from ticks, $${unitRateDerivedUsd.toFixed(6)} from ` +
            `${billing.units.count} ${billing.units.kind} at $${billing.unitRateUsd}/unit`,
        );
      }
    }

    const event: CostEvent = {
      id: newCostEventId(),
      at: Date.now(),
      projectId: context.projectId,
      agentId: context.agentId,
      operation: billing.operation,
      provider: "xai",
      modelId: billing.modelId,
      units: billing.units,
      costUsd,
      source,
      exact: source !== "token_estimate",
      // A rate key is the model we found a price under. No published rate means no key — and the
      // UI is required to carry that through rather than render an unpriced call as free.
      rateKey: billing.unitRateUsd === undefined ? null : billing.modelId,
    };
    if (context.areaId !== undefined) event.areaId = context.areaId;
    if (context.taskId !== undefined) event.taskId = context.taskId;
    if (context.designDocId !== undefined) event.designDocId = context.designDocId;
    if (billing.unitRateUsd !== undefined) event.unitRateUsd = billing.unitRateUsd;
    if (billing.requestId !== undefined) event.requestId = billing.requestId;
    if (billing.jobId !== undefined) event.jobId = billing.jobId;
    if (ticksUsd !== null) event.ticksUsd = ticksUsd;
    if (unitRateDerivedUsd !== undefined) event.unitRateDerivedUsd = unitRateDerivedUsd;

    if (ticks !== null) {
      report("info", `[xai] ${billing.operation} ${billing.modelId} billed ${ticks} ticks ($${costUsd.toFixed(6)})`);
    }
    costSink(event);
    return event;
  }
}

/** `usage.cost_in_usd_ticks`, or null when the response carried none (§5.4). */
function extractTicks(payload: unknown): number | null {
  const usage = (payload as { usage?: { cost_in_usd_ticks?: unknown } } | null)?.usage;
  const ticks = usage?.cost_in_usd_ticks;
  return typeof ticks === "number" && Number.isFinite(ticks) ? ticks : null;
}

/**
 * Parse the body as JSON, and refuse anything else.
 *
 * An error page served with a 200 and a `text/html` body is a real failure mode of proxied APIs,
 * and treating it as a success is how a zero-byte image reaches an asset store.
 */
async function readJson(response: Response, endpoint: XaiEndpoint): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const contentType = response.headers.get("content-type") ?? "none";
    throw new XaiError(
      `api.x.ai ${endpoint} returned a ${contentType} body that is not JSON (HTTP ${response.status}, ` +
        `${text.length} chars). An error page served with a success status is not a result.`,
      "bad_response",
      response.status,
    );
  }
}

/**
 * Map a failed response onto the documented code set (§5.2), preferring the provider's own
 * `error.code` when it sent one.
 */
function errorFor(status: number, payload: unknown, endpoint: XaiEndpoint): XaiError {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const providerCode = typeof error?.code === "string" ? error.code : null;
  const providerMessage = typeof error?.message === "string" ? error.message : null;

  const known = new Set([
    "invalid_argument",
    "permission_denied",
    "failed_precondition",
    "service_unavailable",
    "internal_error",
  ]);

  let code: XaiError["code"];
  if (providerCode && known.has(providerCode)) code = providerCode as XaiError["code"];
  else if (status === 429) code = "rate_limited";
  else if (status === 401 || status === 403) code = "permission_denied";
  else if (status === 400 || status === 422) code = "invalid_argument";
  else if (status === 503 || status === 502 || status === 504) code = "service_unavailable";
  else code = "internal_error";

  const hint =
    code === "permission_denied"
      ? " This is a plan or tier restriction on the XAI_API_KEY account, not a bug, and not the `grok` CLI's sign-in."
      : code === "invalid_argument"
        ? " Moderation blocks arrive under this code; retrying spends money to be refused again."
        : "";

  return new XaiError(
    `api.x.ai ${endpoint} failed with HTTP ${status} (${code})${providerMessage ? `: ${providerMessage}` : ""}.${hint}`,
    code,
    status,
    payload,
  );
}

// ───────────────────────────────────────────────────────────────────────── the shared client

let shared: XaiClient | null = null;

/** The process's one client, constructed on first use so the environment is read exactly once. */
export function xaiClient(): XaiClient {
  return (shared ??= new XaiClient());
}

/** Tests only: drop the shared client so the next call re-reads the environment. */
export function resetXaiClient(): void {
  shared = null;
}
