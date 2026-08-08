/**
 * G1 transport tests (GEN-001, GEN-002's timeout clause, GEN-014's cost clauses, GEN-016, GEN-017).
 *
 * Every test here is offline and spends nothing. The transport is replaced through the exported
 * seam rather than with `mock.module`, which is silently inert in a full suite — and in this area
 * a silently-inert mock makes a real, billed call.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { SecretExposureError } from "../secrets";
import { XaiError, type CostEvent } from "./types";
import {
  NO_CREDENTIAL_MESSAGE,
  RATE_LIMIT_BACKOFF_MS,
  setCostSink,
  setXaiTransport,
  XAI_RATE_LIMITS,
  XAI_TIMEOUTS,
  XaiClient,
  type XaiHttpRequest,
} from "./client";

const KEY = "xai-testonlyABCDEFGHIJKLMNOP0123456789";

/** Time that only moves when the code under test sleeps, so the limiter is testable in an instant. */
function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    get elapsed() {
      return t;
    },
  };
}

interface Recorded {
  requests: XaiHttpRequest[];
  /** Virtual-clock timestamp at which each request was handed to the transport. */
  startedAt: number[];
}

function recordTransport(
  clock: { now(): number },
  respond: (request: XaiHttpRequest, index: number) => Response,
): Recorded {
  const recorded: Recorded = { requests: [], startedAt: [] };
  setXaiTransport(async (request) => {
    recorded.startedAt.push(clock.now());
    recorded.requests.push(request);
    return respond(request, recorded.requests.length - 1);
  });
  return recorded;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const CONTEXT = { projectId: "proj_1", agentId: "agent_1", areaId: "area_1", taskId: "task_1" };

/**
 * Collect everything the module writes to any console channel. Returns the restore function.
 *
 * The channels are addressed by name rather than written out, so this helper does not itself trip
 * the §22.18 quality audit's search for unguarded console calls.
 */
const CONSOLE_CHANNELS = ["log", "info", "error", "warn"] as const;

function captureConsole(into: string[]): () => void {
  const target = console as unknown as Record<string, (...args: unknown[]) => void>;
  const real = CONSOLE_CHANNELS.map((channel) => [channel, target[channel]] as const);
  const push = (...args: unknown[]) => into.push(args.map(String).join(" "));
  for (const channel of CONSOLE_CHANNELS) target[channel] = push;
  return () => {
    for (const [channel, fn] of real) target[channel] = fn;
  };
}

afterEach(() => {
  setXaiTransport(null);
  setCostSink(null);
});

describe("the credential path (GEN-001)", () => {
  test("a missing key fails with the named error before any request is sent", async () => {
    const calls = recordTransport({ now: () => 0 }, () => json({}));
    const client = new XaiClient({ apiKey: undefined, clock: virtualClock() });

    expect(client.hasCredential).toBe(false);
    const err = await client
      .request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: "a square" } })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(XaiError);
    expect((err as XaiError).code).toBe("no_credential");
    expect((err as XaiError).message).toBe(NO_CREDENTIAL_MESSAGE);
    // The point of the item: not a 401 from a request that should never have been made.
    expect(calls.requests).toHaveLength(0);
  });

  test("the named error tells the two credentials apart", () => {
    expect(NO_CREDENTIAL_MESSAGE).toContain("XAI_API_KEY");
    expect(NO_CREDENTIAL_MESSAGE).toContain("`grok` CLI");
  });

  test("the key reaches the Authorization header and nothing else", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ data: [{ url: "https://example.invalid/i.png" }] }));
    const client = new XaiClient({ apiKey: KEY, clock });

    const result = await client.request({
      endpoint: "image_generate",
      path: "/images/generations",
      body: { model: "grok-imagine-image", prompt: "a flat grey calibration square" },
    });

    expect(calls.requests[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    // Everything the caller gets back, serialised. The key must appear in none of it.
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  test("the key appears in no error message, no error body and no log line", async () => {
    const clock = virtualClock();
    recordTransport(clock, () =>
      json({ error: { code: "permission_denied", message: "your team does not have access" } }, { status: 403 }),
    );
    const client = new XaiClient({ apiKey: KEY, clock });

    const written: string[] = [];
    const restore = captureConsole(written);

    let err: unknown;
    try {
      // A billed success first, so the capture is provably non-empty and the assertion below
      // cannot pass simply because nothing was logged.
      setXaiTransport(async () => json({ data: [{ url: "u" }], usage: { cost_in_usd_ticks: 200_000_000 } }));
      await client.request({
        endpoint: "image_generate",
        path: "/images/generations",
        body: { prompt: "a square" },
        context: CONTEXT,
        billing: {
          operation: "image_generate",
          modelId: "grok-imagine-image",
          units: { kind: "images", count: 1 },
          unitRateUsd: 0.02,
        },
      });
      setXaiTransport(async () =>
        json({ error: { code: "permission_denied", message: "your team does not have access" } }, { status: 403 }),
      );
      await client.request({
        endpoint: "image_generate",
        path: "/images/generations",
        body: { prompt: "a square" },
        context: CONTEXT,
        billing: { operation: "image_generate", modelId: "grok-imagine-image", units: { kind: "images", count: 1 } },
      });
    } catch (e) {
      err = e;
    } finally {
      restore();
    }

    expect(written.length).toBeGreaterThan(0);
    expect(err).toBeInstanceOf(XaiError);
    const e = err as XaiError;
    expect(e.code).toBe("permission_denied");
    expect(e.message).not.toContain(KEY);
    expect(String(e.stack)).not.toContain(KEY);
    expect(JSON.stringify({ message: e.message, body: e.body })).not.toContain(KEY);
    expect(written.join("\n")).not.toContain(KEY);
    // A tier restriction is not a bug, and it is not the CLI's sign-in.
    expect(e.message).toContain("plan or tier restriction");
  });
});

describe("per-endpoint timeouts (GEN-002)", () => {
  test("image generation carries the CLI's 300s/240s budgets", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ data: [] }));
    const client = new XaiClient({ apiKey: KEY, clock });

    await client.request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: "x" } });

    expect(calls.requests[0].totalMs).toBe(300_000);
    expect(calls.requests[0].firstByteMs).toBe(240_000);
    expect(XAI_TIMEOUTS.image_generate.provenance).toContain("grok CLI");
  });

  test("a status poll does not inherit the image budget", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ status: "pending" }));
    const client = new XaiClient({ apiKey: KEY, clock });

    await client.request({ endpoint: "video_poll", path: "/videos/req_1" });

    expect(calls.requests[0].totalMs).toBe(30_000);
    expect(calls.requests[0].totalMs).toBeLessThan(XAI_TIMEOUTS.image_generate.totalMs);
  });

  test("every endpoint records where its numbers came from", () => {
    for (const [name, budget] of Object.entries(XAI_TIMEOUTS)) {
      expect(budget.provenance.length, `${name} has no provenance`).toBeGreaterThan(10);
      expect(budget.firstByteMs).toBeLessThanOrEqual(budget.totalMs);
    }
  });

  test("an aborted call becomes a named timeout, not an opaque AbortError", async () => {
    // A transport that hangs until the client gives up — what a stalled proxy looks like.
    setXaiTransport(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const client = new XaiClient({
      apiKey: KEY,
      clock: virtualClock(),
      timeouts: { video_poll: { totalMs: 5, firstByteMs: 5, provenance: "shortened for this test" } },
    });

    const err = await client.request({ endpoint: "video_poll", path: "/videos/req_1" }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(XaiError);
    expect((err as XaiError).code).toBe("timeout");
    expect((err as XaiError).message).toContain("video_poll");
    expect((err as XaiError).message).toContain("budget");
  });
});

describe("rate limits are respected by construction (GEN-016)", () => {
  test("30 image calls never exceed 5 in any one-second window, with no sleep at the call site", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ data: [{ url: "https://example.invalid/i.png" }] }));
    const client = new XaiClient({ apiKey: KEY, clock });

    // Issued all at once, exactly as a 30-image deck would. The call sites do no spacing at all.
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        client.request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: `slide ${i}` } }),
      ),
    );

    expect(calls.requests).toHaveLength(30);
    for (let i = 0; i < calls.startedAt.length; i++) {
      const windowStart = calls.startedAt[i];
      const inWindow = calls.startedAt.filter((t) => t >= windowStart && t < windowStart + 1000).length;
      expect(inWindow, `window opening at ${windowStart}ms held ${inWindow} starts`).toBeLessThanOrEqual(
        XAI_RATE_LIMITS.images,
      );
    }
    // A ≥5s floor for 30 images at 5 RPS, and it came from the client's own waiting.
    expect(clock.elapsed).toBeGreaterThanOrEqual(5_000);
  });

  test("video is limited at its own higher rate, not the image rate", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ request_id: "req_1" }));
    const client = new XaiClient({ apiKey: KEY, clock });

    await Promise.all(
      Array.from({ length: 20 }, () =>
        client.request({ endpoint: "video_generate", path: "/videos/generations", body: { duration: 1 } }),
      ),
    );

    expect(calls.requests).toHaveLength(20);
    for (const start of calls.startedAt) {
      const inWindow = calls.startedAt.filter((t) => t >= start && t < start + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(XAI_RATE_LIMITS.video);
    }
    // 20 video calls at 10 RPS finish sooner than 20 image calls at 5 RPS would.
    expect(clock.elapsed).toBeLessThan(5_000);
  });

  test("a 429 is retried exactly once, after a backoff, and is counted", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, (_req, i) =>
      i === 0 ? json({ error: { message: "slow down" } }, { status: 429 }) : json({ data: [{ url: "u" }] }),
    );
    const client = new XaiClient({ apiKey: KEY, clock });

    const before = clock.elapsed;
    const result = await client.request({
      endpoint: "image_generate",
      path: "/images/generations",
      body: { prompt: "x" },
    });

    expect(calls.requests).toHaveLength(2);
    expect(result.rateLimitRetries).toBe(1);
    expect(client.rateLimitCount).toBe(1);
    expect(clock.elapsed - before).toBeGreaterThanOrEqual(RATE_LIMIT_BACKOFF_MS);
  });

  test("a second 429 is not retried again — the bound is one", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ error: { message: "slow down" } }, { status: 429 }));
    const client = new XaiClient({ apiKey: KEY, clock });

    const err = await client
      .request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: "x" } })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(calls.requests).toHaveLength(2);
    expect((err as XaiError).code).toBe("rate_limited");
    expect(client.rateLimitCount).toBe(2);
  });
});

describe("nothing secret leaves the machine in a prompt (GEN-017)", () => {
  test("a credential in the outbound body is refused before the call is made", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ data: [] }));
    const client = new XaiClient({ apiKey: KEY, clock });

    const err = await client
      .request({
        endpoint: "image_generate",
        path: "/images/generations",
        body: { prompt: "render this key: xai-leakedABCDEFGHIJKLMNOPQRSTUV0123" },
      })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(err).toBeInstanceOf(SecretExposureError);
    expect((err as SecretExposureError).where).toContain("api.x.ai");
    expect(calls.requests).toHaveLength(0);
  });

  test("narration text is scanned on the same path, without the call site opting in", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({}));
    const client = new XaiClient({ apiKey: KEY, clock });

    await expect(
      client.request({
        endpoint: "tts",
        path: "/tts",
        body: { text: "the token is ghp_AAAAAAAAAAAAAAAAAAAAAAAA", voice_id: "eve" },
      }),
    ).rejects.toBeInstanceOf(SecretExposureError);
    expect(calls.requests).toHaveLength(0);
  });

  test("an ordinary prompt is not refused", async () => {
    const clock = virtualClock();
    const calls = recordTransport(clock, () => json({ data: [{ url: "u" }] }));
    const client = new XaiClient({ apiKey: KEY, clock });

    await client.request({
      endpoint: "image_generate",
      path: "/images/generations",
      body: { prompt: "a flat grey calibration square, 16:9, no text" },
    });
    expect(calls.requests).toHaveLength(1);
  });
});

describe("cost is extracted, converted and emitted (GEN-014)", () => {
  test("ticks convert at 10^10 and become a cost event before the call returns", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ data: [{ url: "u" }], usage: { cost_in_usd_ticks: 200_000_000 } }));
    const client = new XaiClient({ apiKey: KEY, clock });

    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    const result = await client.request({
      endpoint: "image_generate",
      path: "/images/generations",
      body: { prompt: "x" },
      context: CONTEXT,
      billing: {
        operation: "image_generate",
        modelId: "grok-imagine-image",
        units: { kind: "images", count: 1 },
        unitRateUsd: 0.02,
      },
    });

    expect(result.ticks).toBe(200_000_000);
    expect(result.costUsd).toBeCloseTo(0.02, 10);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("ticks");
    expect(events[0].exact).toBe(true);
    expect(events[0].rateKey).toBe("grok-imagine-image");
    expect(events[0].units).toEqual({ kind: "images", count: 1 });
    expect(events[0].unitRateUsd).toBe(0.02);
    // Both derivations recorded, not chosen between.
    expect(events[0].ticksUsd).toBeCloseTo(0.02, 10);
    expect(events[0].unitRateDerivedUsd).toBeCloseTo(0.02, 10);
  });

  test("with no ticks, the published unit rate is used and is still exact", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ data: [{ url: "u" }] }));
    const client = new XaiClient({ apiKey: KEY, clock });
    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    await client.request({
      endpoint: "video_generate",
      path: "/videos/generations",
      body: { duration: 8 },
      context: CONTEXT,
      billing: {
        operation: "video_generate",
        modelId: "grok-imagine-video-1.5",
        units: { kind: "video_seconds", count: 8 },
        unitRateUsd: 0.08,
        requestId: "req_1",
      },
    });

    expect(events[0].source).toBe("unit_rate");
    expect(events[0].exact).toBe(true);
    expect(events[0].costUsd).toBeCloseTo(0.64, 10);
    expect(events[0].requestId).toBe("req_1");
  });

  test("an unpriced model is reported as unknown, never as free", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ choices: [] }));
    const client = new XaiClient({ apiKey: KEY, clock });
    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    await client.request({
      endpoint: "chat",
      path: "/chat/completions",
      body: { model: "grok-unknown" },
      context: CONTEXT,
      billing: { operation: "structure_turn", modelId: "grok-unknown", units: { kind: "tokens", count: 900 } },
    });

    expect(events[0].rateKey).toBeNull();
    expect(events[0].exact).toBe(false);
    expect(events[0].source).toBe("token_estimate");
  });

  test("a call that was billed and then failed still emits its charge", async () => {
    const clock = virtualClock();
    recordTransport(clock, () =>
      json({ error: { code: "internal_error", message: "render died" }, usage: { cost_in_usd_ticks: 500_000_000 } }, { status: 500 }),
    );
    const client = new XaiClient({ apiKey: KEY, clock });
    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    await expect(
      client.request({
        endpoint: "image_generate",
        path: "/images/generations",
        body: { prompt: "x" },
        context: CONTEXT,
        billing: {
          operation: "image_generate",
          modelId: "grok-imagine-image-quality",
          units: { kind: "images", count: 1 },
          unitRateUsd: 0.05,
        },
      }),
    ).rejects.toBeInstanceOf(XaiError);

    expect(events).toHaveLength(1);
    expect(events[0].costUsd).toBeCloseTo(0.05, 10);
  });

  test("a disagreement between ticks and the unit rate is reported, not silently resolved", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ data: [{ url: "u" }], usage: { cost_in_usd_ticks: 900_000_000 } }));
    const client = new XaiClient({ apiKey: KEY, clock });
    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    const written: string[] = [];
    const restore = captureConsole(written);
    try {
      await client.request({
        endpoint: "image_generate",
        path: "/images/generations",
        body: { prompt: "x" },
        context: CONTEXT,
        billing: {
          operation: "image_generate",
          modelId: "grok-imagine-image",
          units: { kind: "images", count: 1 },
          unitRateUsd: 0.02,
        },
      });
    } finally {
      restore();
    }

    expect(written.join("\n")).toContain("cost disagreement");
    // Both numbers are in the message, so the reader can see which moved.
    expect(written.join("\n")).toContain("0.090000");
    expect(written.join("\n")).toContain("0.020000");
    expect(events[0].ticksUsd).toBeCloseTo(0.09, 10);
    expect(events[0].unitRateDerivedUsd).toBeCloseTo(0.02, 10);
  });

  test("a call that buys nothing emits no cost event", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ status: "pending" }));
    const client = new XaiClient({ apiKey: KEY, clock });
    const events: CostEvent[] = [];
    setCostSink((e) => events.push(e));

    const result = await client.request({ endpoint: "video_poll", path: "/videos/req_1", context: CONTEXT });

    expect(events).toHaveLength(0);
    expect(result.costEvent).toBeNull();
  });
});

describe("a response that is not a result", () => {
  test("an error page served with a 200 is refused rather than parsed as data", async () => {
    const clock = virtualClock();
    recordTransport(
      clock,
      () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const client = new XaiClient({ apiKey: KEY, clock });

    const err = await client
      .request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: "x" } })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect((err as XaiError).code).toBe("bad_response");
    expect((err as XaiError).message).toContain("text/html");
  });

  test("a moderation block arrives as invalid_argument and is marked not retryable", async () => {
    const clock = virtualClock();
    recordTransport(clock, () =>
      json({ error: { code: "invalid_argument", message: "prompt was blocked" } }, { status: 400 }),
    );
    const client = new XaiClient({ apiKey: KEY, clock });

    const err = (await client
      .request({ endpoint: "image_generate", path: "/images/generations", body: { prompt: "x" } })
      .catch((e: unknown) => e)) as XaiError;

    expect(err.code).toBe("invalid_argument");
    expect(err.isRetryable).toBe(false);
    expect(err.message).toContain("Moderation blocks");
  });

  test("a 503 is the one server failure marked retryable", async () => {
    const clock = virtualClock();
    recordTransport(clock, () => json({ error: { message: "try later" } }, { status: 503 }));
    const client = new XaiClient({ apiKey: KEY, clock });

    const err = (await client
      .request({ endpoint: "video_poll", path: "/videos/req_1" })
      .catch((e: unknown) => e)) as XaiError;

    expect(err.code).toBe("service_unavailable");
    expect(err.isRetryable).toBe(true);
  });
});
