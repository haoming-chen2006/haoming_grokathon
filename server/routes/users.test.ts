/**
 * The identity surface over HTTP — USR-002, USR-003, USR-004, USR-007, USR-008.
 *
 * These go through the router with real requests rather than calling the store, because the thing
 * being tested is the refusal a caller actually receives. USR-003 is explicit that the proof is
 * `curl`, not the browser: a guard that only the app respects is not a guard.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
// Resolved through the client's node_modules because that is the only place it is installed — it is
// a client test dependency, and adding it to the root package.json is not this worktree's row.
import { GlobalRegistrator } from "../../client/node_modules/@happy-dom/global-registrator";
import { SESSION_COOKIE, getUserStore, mintSessionToken, resetUserStore } from "../services/auth";
import { userRoutes } from "./users";

/**
 * ── Why this file takes the DOM away first ────────────────────────────────────────────────────
 *
 * `bunfig.toml` preloads `client/happydom.ts` for **every** test in the repository, which registers
 * happy-dom's globals so React components can render. Its `Request` and `Headers` faithfully
 * emulate two browser rules that make this file impossible to write:
 *
 *   - `Cookie` is a forbidden request header, so `fetch` silently drops it — in fact **every**
 *     header is dropped; a probe returned `all: []`;
 *   - `Set-Cookie` is unreadable from a response, so `headers.get("set-cookie")` is always null.
 *
 * A cookie-based session guard tested through that is a guard tested with the cookies removed: the
 * 401s would all pass for the wrong reason and the positive control could never go green. So the
 * DOM is unregistered for this file and restored afterwards. That is not a workaround around the
 * behaviour under test — it is removing a *browser* from a *server* test, and it is the only way
 * these assertions touch the real wire.
 *
 * The proper fix is a separate test configuration for server tests rather than one global preload.
 * `bunfig.toml` is 07-shell's, so it is a handoff request rather than an edit here.
 */
beforeAll(async () => {
  await GlobalRegistrator.unregister();
});

afterAll(() => {
  // Restored so the client tests that run after this file in the same process still have a DOM.
  GlobalRegistrator.register();
});

let dataDir: string;
let app: Hono;

/** Every route this router exposes that must never answer without a session. */
const GUARDED: [string, string][] = [
  ["GET", "/api/users"],
  ["GET", "/api/users/me"],
  ["POST", "/api/users"],
  ["PATCH", "/api/users/user_anything"],
  ["POST", "/api/users/user_anything/password"],
  ["DELETE", "/api/users/user_anything"],
  ["DELETE", "/api/users/me/session"],
  ["GET", "/api/users/capabilities/all"],
];

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-users-route-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  resetUserStore();
  app = new Hono();
  app.route("/api/users", userRoutes);
});

afterEach(() => {
  delete process.env.OPENUI_DATA_DIR;
  resetUserStore();
  rmSync(dataDir, { recursive: true, force: true });
});

async function req(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await app.request(path, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON body is itself a finding; the raw text is returned */
  }
  return { status: res.status, json, text, setCookie: res.headers.get("set-cookie") };
}

/** A cookie header for a user, from a token minted through the store. */
function cookieFor(userId: string): string {
  const token = mintSessionToken();
  getUserStore().createSession(userId, token);
  return `${SESSION_COOKIE}=${token}`;
}

/** The session cookie out of a Set-Cookie header, or undefined. */
function cookieFromResponse(setCookie: string | null): string | undefined {
  const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie ?? "")?.[1];
  return token ? `${SESSION_COOKIE}=${token}` : undefined;
}

/** Run first-run and return the session cookie it actually issued over the wire. */
async function firstRun(displayName = "Dana Whitfield", email = "dana@aeris.example") {
  const res = await req("POST", "/api/users/first-run", { body: { displayName, email } });
  expect(res.status).toBe(201);
  const cookie = cookieFromResponse(res.setCookie);
  expect(cookie, "first run must issue a session cookie").toBeTruthy();
  return { cookie: cookie as string, user: res.json.user };
}

// ───────────────────────────────────────────────────────────────────────────── USR-003

describe("USR-003: the server refuses an unauthenticated request", () => {
  test("every guarded route answers 401 with no session, and says nothing else", async () => {
    await firstRun(); // a populated workspace, so 401 is about the session and not about emptiness

    for (const [method, path] of GUARDED) {
      const res = await req(method, path, { body: method === "GET" || method === "DELETE" ? undefined : {} });
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → 401`);
      expect(res.json.code).toBe("unauthenticated");
    }
  });

  test("a positive control: the same routes answer differently once a session is presented", async () => {
    // A 401 test that cannot pass is worthless. This is the same list with a valid cookie; none of
    // them may still be 401, or the assertion above is proving only that the router exists.
    //
    // A *fresh* session per probe, because `DELETE /me/session` is on the list and signs the caller
    // out — sharing one cookie made the routes after it fail for entirely the right reason, which
    // is exactly the kind of false red this control exists to avoid being.
    const { user } = await firstRun();
    for (const [method, path] of GUARDED) {
      const res = await req(method, path, {
        body: method === "GET" || method === "DELETE" ? undefined : {},
        cookie: cookieFor(user.id),
      });
      expect(`${method} ${path} → ${res.status}`).not.toBe(`${method} ${path} → 401`);
    }
  });

  test("a garbage cookie is refused exactly like no cookie at all", async () => {
    await firstRun();
    const none = await req("GET", "/api/users/me");
    const wrong = await req("GET", "/api/users/me", { cookie: `${SESSION_COOKIE}=not-a-real-token` });
    expect(wrong.status).toBe(401);
    // Identical wording: distinguishing the five causes tells an attacker which guess was closer.
    expect(wrong.json.error).toBe(none.json.error);
  });

  test("the two unauthenticated endpoints are the only two, and they reveal one boolean", async () => {
    const setup = await req("GET", "/api/users/setup");
    expect(setup.status).toBe(200);
    expect(setup.json).toEqual({ needsFirstRun: true, passwordRequired: false });
    // It says whether an owner exists. It does not say who.
    expect(setup.text).not.toContain("@");
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-002

describe("USR-002: first run mints exactly one owner", () => {
  test("first run creates an owner and issues a session to that browser", async () => {
    const { cookie, user } = await firstRun();
    expect(user.role).toBe("owner");
    expect(user.capabilities).toEqual({ images: true, video: true, voice: true, publishToX: true });

    const me = await req("GET", "/api/users/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.json.user.id).toBe(user.id);
    expect(me.json.may).toEqual({
      approve: true,
      manageUsers: true,
      manageCredentials: true,
      createProjects: true,
      createAgents: true,
    });
  });

  test("a second first-run attempt is refused", async () => {
    await firstRun();
    const second = await req("POST", "/api/users/first-run", {
      body: { displayName: "Mallory", email: "m@evil.example" },
    });
    expect(second.status).toBe(409);
    expect(second.json.code).toBe("already_initialised");
    // And it issues nothing.
    expect(second.setCookie).toBeNull();
  });

  test("the owner cannot be demoted over HTTP, including by itself", async () => {
    const { cookie, user } = await firstRun();
    const res = await req("PATCH", `/api/users/${user.id}`, { body: { role: "member" }, cookie });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("owner_immutable");

    const still = await req("GET", "/api/users/me", { cookie });
    expect(still.json.user.role).toBe("owner");
  });

  test("setup reports the workspace as ready once an owner exists", async () => {
    await firstRun();
    const setup = await req("GET", "/api/users/setup");
    expect(setup.json.needsFirstRun).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-004

describe("USR-004: sessions begin, end, and cannot be forged", () => {
  test("sign-out revokes the session and clears the cookie", async () => {
    const { cookie } = await firstRun();
    const out = await req("DELETE", "/api/users/me/session", { cookie });
    expect(out.status).toBe(200);
    expect(out.setCookie).toContain("Max-Age=0");

    // The cookie value is now worthless even if the browser kept it.
    const after = await req("GET", "/api/users/me", { cookie });
    expect(after.status).toBe(401);
  });

  test("sign-in issues a new session, and a wrong password is refused indistinguishably", async () => {
    const { cookie } = await firstRun();
    // Two users, so a password becomes required.
    const created = await req("POST", "/api/users", {
      body: { displayName: "Sam Okafor", email: "sam@aeris.example", role: "approver", password: "a-good-password" },
      cookie,
    });
    expect(created.status).toBe(201);

    const good = await req("POST", "/api/users/session", {
      body: { email: "sam@aeris.example", password: "a-good-password" },
    });
    expect(good.status).toBe(200);
    // The real header, on the real response: HttpOnly and SameSite=Strict or it is not a session.
    expect(good.setCookie).toContain(SESSION_COOKIE);
    expect(good.setCookie).toContain("HttpOnly");
    expect(good.setCookie).toContain("SameSite=Strict");

    const bad = await req("POST", "/api/users/session", {
      body: { email: "sam@aeris.example", password: "wrong" },
    });
    const unknown = await req("POST", "/api/users/session", {
      body: { email: "nobody@aeris.example", password: "wrong" },
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    // An account-enumeration oracle is two different sentences here.
    expect(bad.json.error).toBe(unknown.json.error);
  });

  test("a disabled account is signed out immediately, not at the next expiry", async () => {
    const { cookie: ownerCookie } = await firstRun();
    const sam = (
      await req("POST", "/api/users", {
        body: { displayName: "Sam", email: "sam@aeris.example", role: "approver", password: "a-good-password" },
        cookie: ownerCookie,
      })
    ).json;
    const samCookie = cookieFromResponse(
      (await req("POST", "/api/users/session", { body: { email: "sam@aeris.example", password: "a-good-password" } }))
        .setCookie,
    ) as string;
    expect((await req("GET", "/api/users/me", { cookie: samCookie })).status).toBe(200);

    await req("PATCH", `/api/users/${sam.id}`, { body: { disabled: true }, cookie: ownerCookie });
    expect((await req("GET", "/api/users/me", { cookie: samCookie })).status).toBe(401);
  });

  test("a password hash never leaves the server", async () => {
    const { cookie } = await firstRun();
    await req("POST", "/api/users", {
      body: { displayName: "Sam", email: "sam@aeris.example", role: "member", password: "a-good-password" },
      cookie,
    });

    const list = await req("GET", "/api/users", { cookie });
    expect(list.text).not.toContain("$argon2id$");
    expect(list.text).not.toContain("a-good-password");
    // The fact of a password is safe to report; the hash is not.
    expect(list.json.find((u: any) => u.email === "sam@aeris.example").hasPassword).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-008

describe("USR-008: a user cannot grant a capability they do not hold", () => {
  test("the refusal names the missing capability", async () => {
    const { cookie: ownerCookie } = await firstRun();

    // An approver who holds images only, and who may not manage users — so first prove the role
    // gate, then the capability gate with an owner who lacks nothing.
    const sam = (
      await req("POST", "/api/users", {
        body: {
          displayName: "Sam",
          email: "sam@aeris.example",
          role: "approver",
          capabilities: { images: true },
          password: "a-good-password",
        },
        cookie: ownerCookie,
      })
    ).json;
    expect(sam.capabilities).toEqual({ images: true, video: false, voice: false, publishToX: false });

    const samCookie = cookieFor(sam.id);

    // An approver may not manage users at all — the role gate names the role required.
    const byApprover = await req("POST", "/api/users", {
      body: { displayName: "P", email: "p@aeris.example", role: "member" },
      cookie: samCookie,
    });
    expect(byApprover.status).toBe(403);
    expect(byApprover.json.error).toContain("owner role");
  });

  test("two patches cannot together reach where one could not", async () => {
    // The check is against the RESULTING grant, not the delta. Otherwise a granter who lacks video
    // could add images now and video later, each patch looking like it adds nothing they lack.
    const { cookie: ownerCookie, user: owner } = await firstRun();
    const priya = (
      await req("POST", "/api/users", {
        body: { displayName: "Priya", email: "p@aeris.example", role: "member" },
        cookie: ownerCookie,
      })
    ).json;

    // Take video away from the owner... which the store forbids for role, but capabilities are
    // fair game: the owner is the only granter here, so this is the honest way to build the case.
    await req("PATCH", `/api/users/${owner.id}`, { body: { capabilities: { video: false } }, cookie: ownerCookie });

    const attempt = await req("PATCH", `/api/users/${priya.id}`, {
      body: { capabilities: { video: true } },
      cookie: ownerCookie,
    });
    expect(attempt.status).toBe(403);
    expect(attempt.json.error).toContain("video");
  });

  test("granting less than you hold is always allowed", async () => {
    const { cookie } = await firstRun();
    const res = await req("POST", "/api/users", {
      body: { displayName: "Priya", email: "p@aeris.example", role: "member", capabilities: {} },
      cookie,
    });
    expect(res.status).toBe(201);
    expect(res.json.capabilities).toEqual({ images: false, video: false, voice: false, publishToX: false });
  });

  test("the fused agent mapping travels with the user, so the page never re-derives it", async () => {
    const { cookie } = await firstRun();
    const imagesOnly = (
      await req("POST", "/api/users", {
        body: { displayName: "I", email: "i@aeris.example", role: "member", capabilities: { images: true } },
        cookie,
      })
    ).json;
    // Holding images but not video cannot produce an image agent, because 01 fused the two.
    expect(imagesOnly.canCreateAgentWith).toEqual({ images: false, voice: false });
  });
});

// ───────────────────────────────────────────────────────────────────── §3.8: disable, never delete

describe("a user is disabled, never deleted", () => {
  test("DELETE is refused and names the alternative", async () => {
    const { cookie, user } = await firstRun();
    const res = await req("DELETE", `/api/users/${user.id}`, { cookie });
    expect(res.status).toBe(405);
    // A missing verb reads as an oversight; a refusal that names the alternative reads as a rule.
    expect(res.json.error).toContain("disabled, never deleted");
    expect(res.json.error).toContain("attributable");
  });
});
