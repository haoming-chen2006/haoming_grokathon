/**
 * The X client — publish, read back, and a dry run that calls nothing
 * (loops/08-users-and-x.md §3.13, §3.14).
 *
 * ── The failure this file is built around ─────────────────────────────────────────────────────
 * §3.13 names it exactly: "the failure that ruins a demo is not a rejected post. It is a post that
 * succeeded while the client believed it failed, followed by a retry." A duplicate on a real
 * timeline cannot be taken back, and the apology is public.
 *
 * So there is **no retry anywhere in this file**, deliberately, and the absence is load bearing:
 *
 *   - the idempotency key is persisted *before* the HTTP call, so a crash between the two leaves a
 *     record saying an attempt was in flight rather than no record at all;
 *   - a timeout resolves to `unknown`, never to `failed`. We do not know whether the post exists,
 *     and the only honest states are "it is there" and "go and look";
 *   - a 4xx is a stop. Moderation refusals and duplicate-content refusals both arrive as 4xx and
 *     both are things a person needs to read, not things to route around.
 *
 * ── Dry run ───────────────────────────────────────────────────────────────────────────────────
 * `X_DRY_RUN=1` renders, validates, records — and calls nothing. The returned id is visibly
 * synthetic and the record carries `dryRun: true`, so a dry run can never be mistaken later for a
 * real post. Built in the same stage as the client, as §3.14 requires, rather than bolted on after
 * the first accidental live post.
 */

import { authorizationHeader, credentialsFromEnv, type Nonce, type XCredentials } from "./oauth";

export const X_API_BASE = "https://api.x.com";

/** X's own limit. Counted in code points, not UTF-16 units — an emoji is one character to X. */
export const MAX_POST_CHARACTERS = 280;

export function postLength(text: string): number {
  return [...text].length;
}

// ───────────────────────────────────────────────────────────────────────────── transport seam

export interface XHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

export type XTransport = (request: XHttpRequest) => Promise<Response>;

const REAL_TRANSPORT: XTransport = (r) =>
  fetch(r.url, { method: r.method, headers: r.headers, body: r.body, signal: r.signal });

let transport: XTransport = REAL_TRANSPORT;

/**
 * Replace the outbound call. Tests only.
 *
 * A seam rather than `mock.module`, which patches the module registry process-wide and reaches only
 * importers evaluated after it runs — in a full suite it goes silently inert, and the test that
 * looked mocked makes the real call. Here that real call is a public post on someone's timeline.
 */
export function setXTransport(fn: XTransport | null): void {
  transport = fn ?? REAL_TRANSPORT;
}

// ───────────────────────────────────────────────────────────────────────────── errors

export type XErrorCode =
  | "no_credential"
  | "refused" // 4xx: moderation, duplicate content, bad request. A stop, never a retry.
  | "rate_limited"
  | "unknown" // timed out or dropped: the post may exist. Do not retry; go and look.
  | "server_error"
  | "too_long";

export class XError extends Error {
  constructor(
    message: string,
    readonly code: XErrorCode,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "XError";
  }
}

// ───────────────────────────────────────────────────────────────────────────── results

export interface PublishedPost {
  /** X's id, or a `dryrun_…` id when nothing was sent. */
  id: string;
  text: string;
  /** True when nothing left this machine. Never absent — a missing flag reads as "real". */
  dryRun: boolean;
  url?: string;
  at: string;
}

export interface XAccount {
  id: string;
  username: string;
  name: string;
}

export interface XClientOptions {
  credentials?: XCredentials;
  dryRun?: boolean;
  timeoutMs?: number;
  nonce?: Nonce;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

export class XClient {
  private readonly credentials: XCredentials | null;
  private readonly missing: string[];
  readonly dryRun: boolean;
  private readonly timeoutMs: number;
  private readonly nonce?: Nonce;

  constructor(options: XClientOptions = {}) {
    if (options.credentials) {
      this.credentials = options.credentials;
      this.missing = [];
    } else {
      const resolved = credentialsFromEnv();
      if ("missing" in resolved) {
        this.credentials = null;
        this.missing = resolved.missing;
      } else {
        this.credentials = resolved;
        this.missing = [];
      }
    }
    // Explicit option wins; otherwise the environment decides. A dry run must be easy to turn on
    // and impossible to turn on by accident, so the value must be exactly "1".
    this.dryRun = options.dryRun ?? process.env.X_DRY_RUN === "1";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.nonce = options.nonce;
  }

  get hasCredentials(): boolean {
    return this.credentials !== null;
  }

  private require(): XCredentials {
    if (!this.credentials) {
      throw new XError(
        `no X credentials are configured; ${this.missing.join(", ")} ${this.missing.length === 1 ? "is" : "are"} ` +
          `missing. All four of consumer_key, consumer_secret, x_access_token and x_access_secret are ` +
          `required — three of four signs nothing, and X answers a partial set with the same error it ` +
          `gives a wholly wrong key. They are issued at developer.x.com under Keys and tokens.`,
        "no_credential",
      );
    }
    return this.credentials;
  }

  /**
   * One request, with a timeout that resolves to `unknown` rather than to a failure.
   *
   * The distinction is the whole of §3.13: a timed-out publish may well have succeeded, and calling
   * that "failed" is what invites the retry that duplicates it.
   */
  private async send(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<{ status: number; payload: any }> {
    const credentials = this.require();
    const query = opts.query ?? {};
    const url = `${X_API_BASE}${path}`;
    const search = new URLSearchParams(query).toString();

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await transport({
        url: search ? `${url}?${search}` : url,
        method,
        headers: {
          Authorization: authorizationHeader(method, url, credentials, query, this.nonce),
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = { raw: text };
      }

      if (response.status === 429) {
        const reset = response.headers.get("x-rate-limit-reset");
        throw new XError(
          `X rate limit reached${reset ? `; it resets at ${new Date(Number(reset) * 1000).toISOString()}` : ""}. ` +
            `This is a wait, not a failure — nothing was posted.`,
          "rate_limited",
          429,
          payload,
        );
      }
      if (response.status >= 400 && response.status < 500) {
        // Moderation and duplicate-content refusals both land here, and both are for a human to
        // read. Retrying either one spends a request to be refused again in the same words.
        throw new XError(
          `X refused this request (HTTP ${response.status}): ${messageFrom(payload) ?? "no reason given"}. ` +
            `This is a stop, not something to retry.`,
          "refused",
          response.status,
          payload,
        );
      }
      if (!response.ok) {
        throw new XError(`X returned HTTP ${response.status}`, "server_error", response.status, payload);
      }
      return { status: response.status, payload };
    } catch (err) {
      if (timedOut) {
        throw new XError(
          `the request to X timed out after ${this.timeoutMs}ms. **It may have succeeded.** Do not ` +
            `retry — read the account back and check before sending anything again.`,
          "unknown",
        );
      }
      if (err instanceof XError) throw err;
      throw new XError(
        `the connection to X failed: ${err instanceof Error ? err.message : String(err)}. If this was a ` +
          `publish, it may have succeeded — check the account rather than retrying.`,
        "unknown",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Who these credentials are. A read, and the cheapest proof that all four values agree. */
  async verifyCredentials(): Promise<XAccount> {
    if (this.dryRun) {
      return { id: "dryrun_account", username: "dry_run", name: "Dry run — nothing was sent" };
    }
    const { payload } = await this.send("GET", "/2/users/me");
    return { id: payload.data.id, username: payload.data.username, name: payload.data.name };
  }

  /**
   * Publish.
   *
   * The caller is responsible for having asked a human first — this method cannot tell an approved
   * post from an unapproved one, which is precisely why publishing is not an MCP tool and why the
   * confirmation lives above it rather than inside it.
   */
  async publish(text: string): Promise<PublishedPost> {
    const length = postLength(text);
    if (length === 0) throw new XError("there is nothing to post", "refused");
    if (length > MAX_POST_CHARACTERS) {
      throw new XError(
        `this post is ${length} characters and the limit is ${MAX_POST_CHARACTERS}. Shorten it before ` +
          `confirming — truncating someone's words on their behalf is not this program's decision.`,
        "too_long",
      );
    }

    if (this.dryRun) {
      // Everything above ran. Nothing below leaves the machine.
      return {
        id: `dryrun_${Date.now().toString(36)}`,
        text,
        dryRun: true,
        at: new Date().toISOString(),
      };
    }

    const { payload } = await this.send("POST", "/2/tweets", { body: { text } });
    const id = payload?.data?.id;
    if (!id) {
      // A 2xx with no id is not a success we can point at. Reported as unknown rather than failed:
      // something may exist on the timeline.
      throw new XError(
        `X accepted the request but returned no post id. Check the account before sending again.`,
        "unknown",
        200,
        payload,
      );
    }
    return { id, text, dryRun: false, url: `https://x.com/i/web/status/${id}`, at: new Date().toISOString() };
  }

  /**
   * The most recent posts on the account.
   *
   * This is the reconciliation path §3.13 requires after an `unknown`: read the account back and
   * look for the text rather than guessing, and never resend to find out.
   */
  async recentPosts(accountId: string, max = 10): Promise<{ id: string; text: string }[]> {
    if (this.dryRun) return [];
    const { payload } = await this.send("GET", `/2/users/${accountId}/tweets`, {
      query: { max_results: String(Math.max(5, Math.min(100, max))) },
    });
    return (payload?.data ?? []).map((p: any) => ({ id: p.id, text: p.text }));
  }
}

function messageFrom(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.title === "string") return payload.title;
  if (Array.isArray(payload.errors) && payload.errors[0]?.message) return payload.errors[0].message;
  if (typeof payload.error === "string") return payload.error;
  return null;
}
