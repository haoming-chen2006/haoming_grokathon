/**
 * USR-001, USR-002, USR-004, USR-005, USR-006, USR-008 — the store and the rules, offline.
 *
 * The invariant that the store cannot go async lives in `authInvariants.test.ts`, including the two
 * negative controls USR-001 asks for. This file is the behaviour.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ALL_CAPABILITIES,
  AuthError,
  NO_CAPABILITIES,
  SESSION_COOKIE,
  UserStore,
  agentCapabilitiesFrom,
  clearedSessionCookie,
  hashPassword,
  hashSessionToken,
  isLoopbackHost,
  may,
  mintSessionToken,
  missingCapabilities,
  passwordRequired,
  principalFromCookie,
  requireDifferentApprover,
  requirePermission,
  selfApprovalIsOnlyOption,
  sessionCookie,
  startupRefusal,
  tokenFromCookieHeader,
  verifyPassword,
} from "./auth";

let dir: string;
let store: UserStore;

const OWNER = { displayName: "Dana Whitfield", email: "dana@aeris.example" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-auth-"));
  store = new UserStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ───────────────────────────────────────────────────────────────────────────── USR-001

describe("USR-001: a user exists and persists", () => {
  test("a user is created with a role, a capability grant and an optional budget", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const member = store.createUser({
      displayName: "Priya Raman",
      email: "priya@aeris.example",
      role: "member",
      capabilities: { images: true },
      budgetUsd: 50,
    });

    expect(owner.role).toBe("owner");
    expect(owner.capabilities).toEqual(ALL_CAPABILITIES);
    expect(member.role).toBe("member");
    // Unnamed capabilities are absent, not inherited: a grant defaults to nothing.
    expect(member.capabilities).toEqual({ ...NO_CAPABILITIES, images: true });
    expect(member.budgetUsd).toBe(50);
    expect(member.disabled).toBe(false);
  });

  test("the record round-trips through a process restart", () => {
    const created = store.createFirstRunOwner(OWNER);
    store.createUser({ displayName: "Sam Okafor", email: "sam@aeris.example", role: "approver" });

    // A second store over the same directory is what a restart is.
    const restarted = new UserStore(dir);
    expect(restarted.listUsers().map((u) => u.email)).toEqual(["dana@aeris.example", "sam@aeris.example"]);
    expect(restarted.getUser(created.id).displayName).toBe("Dana Whitfield");
    expect(restarted.owner()?.id).toBe(created.id);
  });

  test("a corrupt file refuses rather than reading as an empty workspace", () => {
    store.createFirstRunOwner(OWNER);
    Bun.write(join(dir, "auth.json"), "{ this is not json");
    // Reading as empty is the dangerous failure: first-run would mint a second owner over a real
    // workspace and issue that browser a session.
    expect(() => new UserStore(dir).listUsers()).toThrow(/unreadable/);
  });

  test("a password is never stored in clear text", async () => {
    const hash = await hashPassword("correct horse battery staple");
    store.createFirstRunOwner(OWNER);
    const user = store.createUser({
      displayName: "Sam Okafor",
      email: "sam@aeris.example",
      role: "approver",
      passwordHash: hash,
    });

    const onDisk = readFileSync(join(dir, "auth.json"), "utf8");
    expect(onDisk).not.toContain("correct horse battery staple");
    expect(user.passwordHash).toStartWith("$argon2id$");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("a malformed stored hash reads as a wrong password, never as no password needed", async () => {
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  test("a password under eight characters is refused at the point of hashing", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-002

describe("USR-002: first run mints exactly one owner", () => {
  test("with no users on disk, first run creates one owner with every capability", () => {
    expect(store.userCount).toBe(0);
    const owner = store.createFirstRunOwner(OWNER);
    expect(store.listUsers()).toHaveLength(1);
    expect(owner.role).toBe("owner");
    // No password: at first run, anyone who can reach the port already owns the machine (§3.3).
    expect(owner.passwordHash).toBeUndefined();
  });

  test("a second first-run attempt is refused once an owner exists", () => {
    store.createFirstRunOwner(OWNER);
    expect(() => store.createFirstRunOwner({ displayName: "Mallory", email: "m@evil.example" })).toThrow(
      /cannot run twice/,
    );
    expect(store.listUsers()).toHaveLength(1);
  });

  test("the owner cannot be demoted, by anyone, including itself", () => {
    const owner = store.createFirstRunOwner(OWNER);
    expect(() => store.updateUser(owner.id, { role: "member" })).toThrow(/cannot be demoted/);
    expect(() => store.updateUser(owner.id, { role: "approver" })).toThrow(/cannot be demoted/);
    expect(store.getUser(owner.id).role).toBe("owner");
  });

  test("the owner cannot be disabled, and nobody else can become owner", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const sam = store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "approver" });

    expect(() => store.updateUser(owner.id, { disabled: true })).toThrow(/cannot be disabled/);
    expect(() => store.updateUser(sam.id, { role: "owner" })).toThrow(/cannot be handed over/);
    expect(() => store.createUser({ displayName: "X", email: "x@e.co", role: "owner" })).toThrow(/exactly one owner/);
  });

  test("two people cannot share an email", () => {
    store.createFirstRunOwner(OWNER);
    expect(() =>
      store.createUser({ displayName: "Not Dana", email: "DANA@aeris.example", role: "member" }),
    ).toThrow(/already a user/);
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-004

describe("USR-004: a session expires and can be revoked", () => {
  test("the stored value cannot be replayed as a cookie", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const token = mintSessionToken();
    const session = store.createSession(owner.id, token);

    // What is on disk is the hash. Presenting it as the cookie must not authenticate.
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toBe(hashSessionToken(token));
    expect(readFileSync(join(dir, "auth.json"), "utf8")).not.toContain(token);

    expect(store.principalFor(token)?.user.id).toBe(owner.id);
    expect(store.principalFor(session.tokenHash)).toBeNull();
  });

  test("an expired session is refused", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const token = mintSessionToken();
    store.createSession(owner.id, token, -1_000); // already past
    expect(store.principalFor(token)).toBeNull();
  });

  test("a revoked session is refused, and the record says when it ended", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const token = mintSessionToken();
    const session = store.createSession(owner.id, token);
    expect(store.principalFor(token)).not.toBeNull();

    store.revokeSession(session.id);
    expect(store.principalFor(token)).toBeNull();
    // Revoked, not deleted: "when did this session end" stays answerable.
    expect(store.listSessions(owner.id)[0].revokedAt).toBeTruthy();
  });

  test("disabling an account kills its sessions", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const sam = store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "approver" });
    const token = mintSessionToken();
    store.createSession(sam.id, token);
    expect(store.principalFor(token)?.user.id).toBe(sam.id);

    store.updateUser(sam.id, { disabled: true });
    // Even before the sessions are revoked, a disabled account cannot be a principal.
    expect(store.principalFor(token)).toBeNull();
    expect(store.revokeAllSessionsFor(sam.id)).toBe(1);
    expect(owner.id).not.toBe(sam.id);
  });

  test("a disabled account cannot start a new session", () => {
    store.createFirstRunOwner(OWNER);
    const sam = store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "member" });
    store.updateUser(sam.id, { disabled: true });
    expect(() => store.createSession(sam.id, mintSessionToken())).toThrow(/disabled/);
  });

  test("the cookie is HttpOnly, SameSite=Strict and scoped to the whole app", () => {
    const cookie = sessionCookie("tok", new Date(Date.now() + 1000).toISOString());
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(clearedSessionCookie()).toContain("Max-Age=0");
  });

  test("the token is read out of a real Cookie header, and only under its own name", () => {
    expect(tokenFromCookieHeader(`other=1; ${SESSION_COOKIE}=abc; another=2`)).toBe("abc");
    expect(tokenFromCookieHeader("other=1")).toBeNull();
    expect(tokenFromCookieHeader(null)).toBeNull();
    expect(tokenFromCookieHeader(`${SESSION_COOKIE}_decoy=abc`)).toBeNull();
  });

  test("principalFromCookie is the whole path: header in, principal or null out", () => {
    const owner = store.createFirstRunOwner(OWNER);
    const token = mintSessionToken();
    store.createSession(owner.id, token);

    expect(principalFromCookie(`${SESSION_COOKIE}=${token}`, store)?.user.id).toBe(owner.id);
    expect(principalFromCookie(`${SESSION_COOKIE}=wrong`, store)).toBeNull();
    // The maximum-privilege request of the old world — no headers at all — is now nobody.
    expect(principalFromCookie(null, store)).toBeNull();
    expect(principalFromCookie("", store)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────── USR-005 / USR-006

describe("USR-005: roles decide who may approve", () => {
  test("each role is a superset of the one below, expressed once", () => {
    expect(may("member", "create_projects")).toBe(true);
    expect(may("member", "approve")).toBe(false);
    expect(may("member", "manage_users")).toBe(false);

    expect(may("approver", "create_projects")).toBe(true);
    expect(may("approver", "approve")).toBe(true);
    expect(may("approver", "manage_users")).toBe(false);

    for (const permission of ["create_projects", "create_agents", "approve", "manage_users", "manage_credentials"] as const) {
      expect(may("owner", permission)).toBe(true);
    }
  });

  test("a refusal names the role that would have been required", () => {
    store.createFirstRunOwner(OWNER);
    const priya = store.createUser({ displayName: "Priya", email: "p@aeris.example", role: "member" });
    const principal = { user: priya, session: store.createSession(priya.id, mintSessionToken()) };

    expect(() => requirePermission(principal, "approve")).toThrow(/needs the approver role/);
    expect(() => requirePermission(principal, "manage_users")).toThrow(/needs the owner role/);
    expect(() => requirePermission(principal, "create_projects")).not.toThrow();
  });
});

describe("USR-006: nobody approves their own request", () => {
  test("with two approvers, approving your own request is refused by the server", () => {
    const owner = store.createFirstRunOwner(OWNER);
    store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "approver" });
    const principal = { user: owner, session: store.createSession(owner.id, mintSessionToken()) };

    expect(selfApprovalIsOnlyOption(store)).toBe(false);
    expect(() => requireDifferentApprover(owner.id, principal, store)).toThrow(/cannot approve your own/);
    // Someone else's request is fine.
    expect(() => requireDifferentApprover("user_someone_else", principal, store)).not.toThrow();
  });

  test("alone in the workspace, a self-approval is allowed and is the caller's job to record", () => {
    // Do not fake a second pair of eyes. The confirmation says so in plain words and the record
    // carries selfApproved: true — an honest record of a weak approval beats a fabricated strong one.
    const owner = store.createFirstRunOwner(OWNER);
    const principal = { user: owner, session: store.createSession(owner.id, mintSessionToken()) };

    expect(selfApprovalIsOnlyOption(store)).toBe(true);
    expect(() => requireDifferentApprover(owner.id, principal, store)).not.toThrow();
  });

  test("members do not count towards the second pair of eyes", () => {
    const owner = store.createFirstRunOwner(OWNER);
    store.createUser({ displayName: "Priya", email: "p@aeris.example", role: "member" });
    // A member cannot approve, so the owner is still alone for approval purposes.
    expect(selfApprovalIsOnlyOption(store)).toBe(true);
    expect(owner.role).toBe("owner");
  });

  test("a disabled approver does not count either", () => {
    store.createFirstRunOwner(OWNER);
    const sam = store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "approver" });
    expect(selfApprovalIsOnlyOption(store)).toBe(false);
    store.updateUser(sam.id, { disabled: true });
    expect(selfApprovalIsOnlyOption(store)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────── USR-008

describe("USR-008: a user cannot grant a capability they do not hold", () => {
  test("the missing capabilities are named, not hidden", () => {
    const holder = { images: true, video: false, voice: false, publishToX: false };
    expect(missingCapabilities(holder, { images: true, video: false, voice: false, publishToX: false })).toEqual([]);
    expect(missingCapabilities(holder, { images: true, video: true, voice: true, publishToX: false })).toEqual([
      "video",
      "voice",
    ]);
    // Granting less than you hold is always fine.
    expect(missingCapabilities(ALL_CAPABILITIES, NO_CAPABILITIES)).toEqual([]);
  });

  test("the owner holds everything, so the owner can grant anything", () => {
    const owner = store.createFirstRunOwner(OWNER);
    expect(missingCapabilities(owner.capabilities, ALL_CAPABILITIES)).toEqual([]);
  });

  test("the person-to-agent mapping requires video to hand over an image agent", () => {
    // 01-agents fused images and video into one flag — its IMAGE_TOOLS includes image_to_video —
    // so an agent granted `images` can spend at the per-second video rate. The conservative
    // direction is the only honest one: a user denied video must not be able to create an agent
    // that generates it.
    expect(agentCapabilitiesFrom({ images: true, video: true, voice: false, publishToX: false })).toEqual({
      images: true,
      voice: false,
    });
    expect(agentCapabilitiesFrom({ images: true, video: false, voice: false, publishToX: false })).toEqual({
      images: false,
      voice: false,
    });
    expect(agentCapabilitiesFrom(ALL_CAPABILITIES)).toEqual({ images: true, voice: true });
    expect(agentCapabilitiesFrom(NO_CAPABILITIES)).toEqual({ images: false, voice: false });
  });
});

// ───────────────────────────────────────────────────────── §3.3: passwords and the startup refusal

describe("a workspace exposed to a network with no passwords refuses to start", () => {
  test("one user on loopback needs no password", () => {
    store.createFirstRunOwner(OWNER);
    expect(passwordRequired(store, "127.0.0.1")).toBe(false);
    expect(startupRefusal(store, "127.0.0.1")).toBeNull();
  });

  test("a second user makes a password required", () => {
    store.createFirstRunOwner(OWNER);
    store.createUser({ displayName: "Sam", email: "sam@aeris.example", role: "approver" });
    expect(passwordRequired(store, "127.0.0.1")).toBe(true);
  });

  test("a non-loopback host makes a password required even for one user", () => {
    store.createFirstRunOwner(OWNER);
    expect(passwordRequired(store, "0.0.0.0")).toBe(true);
  });

  test("the refusal names the accounts that have no password, at startup", () => {
    store.createFirstRunOwner(OWNER);
    const refusal = startupRefusal(store, "0.0.0.0");
    expect(refusal).toContain("dana@aeris.example");
    expect(refusal).toContain("not a loopback address");
    // Checked at startup rather than at sign-in: the problem is the open door, not the login.
  });

  test("with passwords set, a networked host starts", async () => {
    const owner = store.createFirstRunOwner(OWNER);
    store.updateUser(owner.id, { passwordHash: await hashPassword("a-long-enough-password") });
    expect(startupRefusal(store, "0.0.0.0")).toBeNull();
  });

  test("loopback is recognised by all its names, and nothing else is", () => {
    for (const host of ["127.0.0.1", "localhost", "::1", "", undefined]) expect(isLoopbackHost(host)).toBe(true);
    for (const host of ["0.0.0.0", "192.168.1.10", "example.com"]) expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("AuthError carries the status the HTTP surface should use", () => {
  test("each refusal has a code and a status", () => {
    store.createFirstRunOwner(OWNER);
    const err = (() => {
      try {
        store.createFirstRunOwner({ displayName: "M", email: "m@e.co" });
        return null;
      } catch (e) {
        return e as AuthError;
      }
    })();
    expect(err).toBeInstanceOf(AuthError);
    expect(err!.code).toBe("already_initialised");
    expect(err!.status).toBe(409);
  });
});
