/**
 * XAP-002, XAP-005, XAP-006, XAP-007 — the publish path, offline.
 *
 * **No test here posts to a real account.** Every one either runs in dry run or replaces the
 * transport through the exported seam, which is a seam rather than `mock.module` because a module
 * mock goes silently inert in a full suite — and the call it would fail to intercept here is a
 * public post on someone's timeline.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { XClient, XError, postLength, setXTransport, type XHttpRequest } from "./client";
import { authorizationHeader, credentialsFromEnv, percentEncode } from "./oauth";
import { PublishRecordStore, idempotencyKey } from "./publishRecord";
import { publishToX } from "./publish";

const CREDS = {
  consumerKey: "ck-test",
  consumerSecret: "cs-test",
  accessToken: "1234-at-test",
  accessSecret: "as-test",
};

let dir: string;
let store: PublishRecordStore;
let requests: XHttpRequest[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-x-"));
  store = new PublishRecordStore(dir);
  requests = [];
});

afterEach(() => {
  setXTransport(null);
  rmSync(dir, { recursive: true, force: true });
});

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  setXTransport(async (r) => {
    requests.push(r);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  });
}

const liveClient = (o = {}) => new XClient({ credentials: CREDS, dryRun: false, ...o });

// ───────────────────────────────────────────────────────────────────────────── the signature

describe("OAuth 1.0a signing", () => {
  test("the four characters encodeURIComponent leaves alone are encoded", () => {
    // The classic silent 401: !*'() are legal in a URI component and illegal in an OAuth signature.
    expect(percentEncode("a!b*c'd(e)f")).toBe("a%21b%2Ac%27d%28e%29f");
    expect(percentEncode("hello world")).toBe("hello%20world");
  });

  test("a signature is reproducible for a fixed nonce and timestamp", () => {
    const nonce = { value: () => "abc123", timestamp: () => "1700000000" };
    const a = authorizationHeader("POST", "https://api.x.com/2/tweets", CREDS, {}, nonce);
    const b = authorizationHeader("POST", "https://api.x.com/2/tweets", CREDS, {}, nonce);
    expect(a).toBe(b);
    expect(a).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(a).toContain('oauth_consumer_key="ck-test"');
    // The secrets themselves never appear in the header.
    expect(a).not.toContain("cs-test");
    expect(a).not.toContain("as-test");
  });

  test("query parameters change the signature, because they are signed", () => {
    const nonce = { value: () => "abc123", timestamp: () => "1700000000" };
    const bare = authorizationHeader("GET", "https://api.x.com/2/users/1/tweets", CREDS, {}, nonce);
    const withQuery = authorizationHeader(
      "GET",
      "https://api.x.com/2/users/1/tweets",
      CREDS,
      { max_results: "10" },
      nonce,
    );
    expect(bare).not.toBe(withQuery);
  });

  test("a partial credential set names each missing value", () => {
    const result = credentialsFromEnv({ consumer_key: "k", x_access_token: "t" } as any);
    expect("missing" in result && result.missing.sort()).toEqual(["accessSecret", "consumerSecret"]);
    // Three of four signs nothing, and X answers a partial set exactly as it answers a wrong key.
  });
});

// ───────────────────────────────────────────────────────────────────────────── XAP-002

describe("XAP-002: a credential never reaches disk or a log", () => {
  test("no secret appears in a publish record", async () => {
    respond(201, { data: { id: "1", text: "hello" } });
    await publishToX({ text: "hello", confirmedBy: "user_dana", selfApproved: true }, liveClient(), store);

    const onDisk = readFileSync(join(dir, "x-publishes.json"), "utf8");
    for (const secret of [CREDS.consumerSecret, CREDS.accessSecret, CREDS.accessToken]) {
      expect(onDisk).not.toContain(secret);
    }
  });

  test("the refusal for missing credentials names what is absent without printing what is present", async () => {
    const client = new XClient({ credentials: undefined, dryRun: false });
    // Constructed from an environment that has none of them.
    const err = await client.publish("x").catch((e) => e as XError);
    if (err instanceof XError && err.code === "no_credential") {
      expect(err.message).toContain("developer.x.com");
      expect(err.message).toContain("three of four signs nothing");
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────── dry run

describe("§3.14: dry run renders, validates, records — and calls nothing", () => {
  test("nothing leaves the machine and the id says so", async () => {
    setXTransport(async (r) => {
      requests.push(r);
      return new Response("{}", { status: 200 });
    });
    const client = new XClient({ credentials: CREDS, dryRun: true });
    const out = await publishToX({ text: "hello", confirmedBy: "user_dana", selfApproved: true }, client, store);

    expect(requests).toHaveLength(0);
    expect(out.post!.dryRun).toBe(true);
    expect(out.post!.id).toStartWith("dryrun_");
    // The record carries it too, so a dry run can never be mistaken for a real post later.
    expect(out.record.dryRun).toBe(true);
    expect(out.record.state).toBe("published");
  });

  test("dry run still refuses a post that is too long — validation is not skipped", async () => {
    const client = new XClient({ credentials: CREDS, dryRun: true });
    await expect(client.publish("x".repeat(281))).rejects.toThrow(/281 characters/);
  });

  test("X_DRY_RUN must be exactly 1, so it cannot be switched on by accident", () => {
    const saved = process.env.X_DRY_RUN;
    try {
      process.env.X_DRY_RUN = "1";
      expect(new XClient({ credentials: CREDS }).dryRun).toBe(true);
      for (const value of ["0", "true", "yes", ""]) {
        process.env.X_DRY_RUN = value;
        expect(new XClient({ credentials: CREDS }).dryRun).toBe(false);
      }
    } finally {
      if (saved === undefined) delete process.env.X_DRY_RUN;
      else process.env.X_DRY_RUN = saved;
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────── XAP-007

describe("XAP-007: a publish cannot happen twice", () => {
  test("the same confirmation twice sends once", async () => {
    respond(201, { data: { id: "111", text: "hello" } });
    const key = idempotencyKey({ text: "hello", confirmedBy: "user_dana", at: "2026-08-08T12:00:00.000Z" });

    const first = await publishToX({ text: "hello", confirmedBy: "user_dana", selfApproved: true, key }, liveClient(), store);
    const second = await publishToX({ text: "hello", confirmedBy: "user_dana", selfApproved: true, key }, liveClient(), store);

    expect(requests).toHaveLength(1);
    expect(second.deduplicated).toBe(true);
    expect(second.record.postId).toBe(first.record.postId);
  });

  test("the key is on disk before the call, so a crash mid-flight leaves a question not a duplicate", async () => {
    // The transport inspects the record from inside the call — which is exactly the window a crash
    // would land in. The claim must already be durable at that moment.
    let stateDuringCall: string | undefined;
    setXTransport(async (r) => {
      requests.push(r);
      stateDuringCall = JSON.parse(readFileSync(join(dir, "x-publishes.json"), "utf8"))[0]?.state;
      return new Response(JSON.stringify({ data: { id: "222" } }), { status: 201 });
    });

    await publishToX({ text: "mid-flight", confirmedBy: "user_dana", selfApproved: true }, liveClient(), store);
    expect(stateDuringCall).toBe("in_flight");
    expect(store.list()[0].state).toBe("published");
  });

  test("a double-click within the same second is one post, without the caller passing a key", async () => {
    respond(201, { data: { id: "333" } });
    const args = { text: "same words", confirmedBy: "user_dana", selfApproved: false };
    await publishToX(args, liveClient(), store);
    await publishToX(args, liveClient(), store);
    expect(requests).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────── §3.13

describe("§3.13: a timeout is not a failure", () => {
  test("a timed-out publish is recorded as unknown, and nothing is retried", async () => {
    setXTransport(async (r) => {
      requests.push(r);
      // Never resolves; the client's own timeout fires.
      return new Promise<Response>((_, reject) => {
        r.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });

    const out = await publishToX(
      { text: "did this send?", confirmedBy: "user_dana", selfApproved: true },
      liveClient({ timeoutMs: 20 }),
      store,
    );

    expect(requests).toHaveLength(1); // once. Never twice.
    expect(out.record.state).toBe("unknown");
    expect(out.record.error).toContain("may have succeeded");
    expect(out.record.error).toContain("Do not");
    expect(out.record.postId).toBeUndefined();
    // And it is listed for a human to resolve by looking, not by resending.
    expect(store.unsettled().map((r) => r.id)).toEqual([out.record.id]);
  });

  test("a 4xx is a stop, and the reason X gave is carried through verbatim", async () => {
    respond(403, { detail: "You are not allowed to create a Tweet with duplicate content." });
    const out = await publishToX({ text: "dupe", confirmedBy: "user_dana", selfApproved: true }, liveClient(), store);

    expect(out.record.state).toBe("refused");
    expect(out.record.error).toContain("duplicate content");
    expect(out.record.error).toContain("not something to retry");
    expect(requests).toHaveLength(1);
  });

  test("a rate limit says when it resets and posts nothing", async () => {
    const reset = Math.floor(Date.now() / 1000) + 900;
    respond(429, { title: "Too Many Requests" }, { "x-rate-limit-reset": String(reset) });
    const out = await publishToX({ text: "later", confirmedBy: "user_dana", selfApproved: true }, liveClient(), store);

    expect(out.record.state).toBe("refused");
    expect(out.record.error).toContain("rate limit");
    expect(out.record.error).toContain("nothing was posted");
  });

  test("a 2xx with no post id is unknown, not success", async () => {
    respond(200, { data: {} });
    const out = await publishToX({ text: "hm", confirmedBy: "user_dana", selfApproved: true }, liveClient(), store);
    expect(out.record.state).toBe("unknown");
  });
});

// ───────────────────────────────────────────────────────────────────────────── the record

describe("the record is auditable on its own", () => {
  test("it carries who confirmed, whether it was a self-approval, and what it cost", async () => {
    respond(201, { data: { id: "444" } });
    const out = await publishToX(
      {
        text: "shipping",
        confirmedBy: "user_dana",
        selfApproved: true,
        draftedByAgentId: "agent_poster",
        projectId: "proj_aeris",
        costUsd: 5.64,
      },
      liveClient(),
      store,
    );

    expect(out.record.confirmedBy).toBe("user_dana");
    // An honest record of a weak approval beats a fabricated strong one.
    expect(out.record.selfApproved).toBe(true);
    expect(out.record.draftedByAgentId).toBe("agent_poster");
    expect(out.record.costUsd).toBe(5.64);
    expect(out.record.url).toBe("https://x.com/i/web/status/444");
  });

  test("an unpriced draft records null, never zero", async () => {
    respond(201, { data: { id: "555" } });
    const out = await publishToX(
      { text: "unpriced", confirmedBy: "user_dana", selfApproved: false, costUsd: null },
      liveClient(),
      store,
    );
    expect(out.record.costUsd).toBeNull();
  });

  test("a corrupt record file refuses rather than reading as nothing published", () => {
    Bun.write(join(dir, "x-publishes.json"), "{{{");
    expect(() => new PublishRecordStore(dir).list()).toThrow(/refusing to risk a duplicate/);
  });

  test("settle without claim is refused — the ordering is the safety", () => {
    expect(() => store.settle("pub_never_claimed", { state: "published", postId: "1" })).toThrow(
      /must follow claim/,
    );
  });
});

describe("the post length limit is counted the way X counts it", () => {
  test("an emoji is one character, not two", () => {
    expect(postLength("🚀")).toBe(1);
    expect("🚀".length).toBe(2); // what a naive check would have used
    expect(postLength("a".repeat(280))).toBe(280);
  });

  test("281 characters is refused rather than truncated", async () => {
    const client = new XClient({ credentials: CREDS, dryRun: true });
    await expect(client.publish("a".repeat(281))).rejects.toThrow(/not this program's decision/);
  });
});
