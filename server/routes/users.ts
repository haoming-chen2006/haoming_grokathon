/**
 * The identity surface, mounted at `/api/users` (loops/08-users-and-x.md §3.2–§3.7).
 *
 * ── The inversion ─────────────────────────────────────────────────────────────────────────────
 * Everything here exists to make one line true:
 *
 * ```text
 * today   no session, no headers  → {kind:"user", id:"user"}, fully privileged
 * after   no valid session        → 401. Nothing else. No default actor.
 * ```
 *
 * `requireSession` is that middleware. It is applied to this router today; applying it to the whole
 * of `/api` and `/mcp` is one line in `server/index.ts`, which belongs to no worktree row, and is
 * requested as R-1 in the handoff. Until that lands, USR-003 is **not** met and the handoff says so
 * — a middleware that guards only its own router guards the one router that was already safe.
 *
 * ── The two endpoints that must be reachable without a session ────────────────────────────────
 * `GET /setup` and `POST /first-run`. Without them a workspace with no users could never acquire
 * one, and the product would be a 401 with no way past it. Both are deliberately narrow:
 * `GET /setup` reveals a single boolean, and `POST /first-run` refuses outright the moment an owner
 * exists. Neither is a privilege path — they are the absence of a workspace, not the presence of a
 * local one, and there is no `if (isLocal)` anywhere in this file.
 */

import { Hono } from "hono";
import type { Context, Next } from "hono";
import {
  ALL_CAPABILITIES,
  AuthError,
  CAPABILITY_KEYS,
  NO_CAPABILITIES,
  ROLES,
  UNAUTHENTICATED_MESSAGE,
  agentCapabilitiesFrom,
  clearedSessionCookie,
  getUserStore,
  hashPassword,
  may,
  mintSessionToken,
  missingCapabilities,
  passwordRequired,
  principalFromCookie,
  requirePermission,
  sessionCookie,
  verifyPassword,
  type CapabilityGrant,
  type Principal,
  type Role,
  type User,
} from "../services/auth";

export const userRoutes = new Hono();

/** Where the resolved principal is stashed for the handlers behind the middleware. */
const PRINCIPAL = "openui_principal";

function fail(c: Context, err: unknown) {
  if (err instanceof AuthError) return c.json({ error: err.message, code: err.code }, err.status as 400);
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: message }, 400);
}

/**
 * The public shape of a user.
 *
 * `passwordHash` never leaves the server — not to the owner, not to the user themselves. A hash is
 * still a credential, and an endpoint that returns one is an offline cracking target handed out
 * over HTTP.
 */
function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    capabilities: user.capabilities,
    budgetUsd: user.budgetUsd,
    disabled: user.disabled,
    hasPassword: user.passwordHash !== undefined,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt: user.lastActiveAt,
    /** What this person can hand an agent, so the UI never has to re-derive the fused mapping. */
    canCreateAgentWith: agentCapabilitiesFrom(user.capabilities),
  };
}

/**
 * Refuse anything without a valid session.
 *
 * The failure is a 401 with one sentence, identical for every cause — no cookie, unknown token,
 * expired, revoked, disabled account. Distinguishing them for the caller only tells an attacker
 * which guess was closer.
 */
export async function requireSession(c: Context, next: Next) {
  const principal = principalFromCookie(c.req.header("cookie"), getUserStore());
  if (!principal) return c.json({ error: UNAUTHENTICATED_MESSAGE, code: "unauthenticated" }, 401);
  c.set(PRINCIPAL, principal);
  // Activity is stamped on the way in, not the way out: a request that crashes still happened.
  getUserStore().touch(principal.session.id);
  await next();
}

/** The principal for a handler behind `requireSession`. Throws rather than returning a default. */
export function principalOf(c: Context): Principal {
  const principal = c.get(PRINCIPAL) as Principal | undefined;
  if (!principal) {
    // Reaching here means a handler was mounted outside the middleware. That is a wiring bug, and
    // returning a default actor to paper over it is precisely the bug this file exists to remove.
    throw new AuthError(UNAUTHENTICATED_MESSAGE, "unauthenticated", 401);
  }
  return principal;
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    throw new AuthError("expected a JSON body", "invalid_argument", 400);
  }
}

function readGrant(value: unknown): Partial<CapabilityGrant> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object") throw new AuthError("capabilities must be an object", "invalid_argument", 400);
  const grant: Partial<CapabilityGrant> = {};
  for (const key of CAPABILITY_KEYS) {
    const held = (value as Record<string, unknown>)[key];
    if (held !== undefined) grant[key] = held === true;
  }
  return grant;
}

function readRole(value: unknown): Role {
  if (typeof value !== "string" || !(ROLES as readonly string[]).includes(value)) {
    throw new AuthError(`role must be one of: ${ROLES.join(", ")}`, "invalid_argument", 400);
  }
  return value as Role;
}

// ───────────────────────────────────────────────────────── unauthenticated: setup and first run

/**
 * Does this workspace have an owner yet?
 *
 * One boolean, and reachable without a session because the first-run greeting has to ask it before
 * a session can exist. It says nothing about who the owner is.
 */
userRoutes.get("/setup", (c) => {
  const store = getUserStore();
  return c.json({
    needsFirstRun: store.userCount === 0,
    passwordRequired: passwordRequired(store),
  });
});

/**
 * Mint the one owner (§3.3).
 *
 * No password, because at this moment anyone who can reach the port is already the owner by
 * physical possession of the machine. A session is issued to this browser immediately — created,
 * not skipped. The middleware still requires a session for everything else; first run is how the
 * first one comes to exist.
 */
userRoutes.post("/first-run", async (c) => {
  try {
    const input = await body(c);
    const store = getUserStore();
    const owner = store.createFirstRunOwner({
      displayName: String(input.displayName ?? ""),
      email: String(input.email ?? ""),
    });

    const token = mintSessionToken();
    const session = store.createSession(owner.id, token);
    c.header("Set-Cookie", sessionCookie(token, session.expiresAt));
    return c.json({ user: publicUser(owner) }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * Sign in.
 *
 * A password is required from the moment there is a second user, or the moment the host is not
 * loopback (§3.3). Below that threshold a single-user local workspace signs in by naming itself,
 * which is the same authority first run had.
 *
 * The refusal is identical for an unknown email and a wrong password, and it is identical whether
 * or not the account has a password set. Three different messages here would be an account
 * enumeration oracle.
 */
userRoutes.post("/session", async (c) => {
  try {
    const input = await body(c);
    const store = getUserStore();
    const email = String(input.email ?? "");
    const password = input.password === undefined ? undefined : String(input.password);

    const refusal = () => c.json({ error: "that email and password do not match an account", code: "unauthenticated" }, 401);

    const user = store.findByEmail(email);
    if (!user || user.disabled) return refusal();

    if (passwordRequired(store) || user.passwordHash !== undefined) {
      if (!password || !user.passwordHash) return refusal();
      if (!(await verifyPassword(password, user.passwordHash))) return refusal();
    }

    const token = mintSessionToken();
    const session = store.createSession(user.id, token);
    c.header("Set-Cookie", sessionCookie(token, session.expiresAt));
    return c.json({ user: publicUser(user) });
  } catch (err) {
    return fail(c, err);
  }
});

// ───────────────────────────────────────────────────────────────────── everything below needs one
//
// `requireSession` is attached to each route individually rather than by path pattern. A pattern
// would have to be `/:userId`, which also matches `/setup` and `/session` — so whether the two
// unauthenticated endpoints stayed reachable would depend on registration order, and someone moving
// a route later would lock the workspace out of its own first run with no test failing. Per-route is
// three more words and no ordering to get wrong.

/** Sign out. The cookie is cleared and the session is revoked — either alone is not a sign-out. */
userRoutes.delete("/me/session", requireSession, (c) => {
  const principal = principalOf(c);
  getUserStore().revokeSession(principal.session.id);
  c.header("Set-Cookie", clearedSessionCookie());
  return c.json({ signedOut: true });
});

userRoutes.get("/me", requireSession, (c) => {
  const principal = principalOf(c);
  return c.json({
    user: publicUser(principal.user),
    session: { id: principal.session.id, expiresAt: principal.session.expiresAt },
    // The rule, evaluated once on the server, so the page never re-implements it and drifts.
    may: {
      approve: may(principal.user.role, "approve"),
      manageUsers: may(principal.user.role, "manage_users"),
      manageCredentials: may(principal.user.role, "manage_credentials"),
      createProjects: may(principal.user.role, "create_projects"),
      createAgents: may(principal.user.role, "create_agents"),
    },
  });
});

userRoutes.get("/", requireSession, (c) => {
  principalOf(c);
  return c.json(getUserStore().listUsers().map(publicUser));
});

/**
 * Add a person.
 *
 * Two gates, both on the server because a hidden button is not a rule: the caller must be allowed to
 * manage users at all, and may not grant a capability they do not themselves hold. The second
 * refusal names the missing capability rather than saying "forbidden" — a refusal you cannot act on
 * is a bug report.
 */
userRoutes.post("/", requireSession, async (c) => {
  try {
    const principal = principalOf(c);
    requirePermission(principal, "manage_users");

    const input = await body(c);
    const requested = { ...NO_CAPABILITIES, ...readGrant(input.capabilities) };
    const missing = missingCapabilities(principal.user.capabilities, requested);
    if (missing.length > 0) {
      throw new AuthError(
        `you cannot grant ${missing.join(", ")} because you do not hold ${missing.length > 1 ? "them" : "it"}`,
        "forbidden",
        403,
      );
    }

    const passwordHash =
      input.password === undefined ? undefined : await hashPassword(String(input.password));

    const user = getUserStore().createUser({
      displayName: String(input.displayName ?? ""),
      email: String(input.email ?? ""),
      role: readRole(input.role),
      capabilities: requested,
      budgetUsd: input.budgetUsd === undefined ? undefined : Number(input.budgetUsd),
      passwordHash,
    });
    return c.json(publicUser(user), 201);
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * Change a person.
 *
 * Raising a capability is the interesting case: the granter must hold what they are handing out,
 * checked against what the target would end up with rather than against the delta, so a two-step
 * escalation cannot slip through.
 */
userRoutes.patch("/:userId", requireSession, async (c) => {
  try {
    const principal = principalOf(c);
    requirePermission(principal, "manage_users");

    const store = getUserStore();
    const target = store.getUser(c.req.param("userId"));
    const input = await body(c);

    if (input.password !== undefined) {
      throw new AuthError("set a password at /:userId/password, not here", "invalid_argument", 400);
    }

    const changes: Parameters<typeof store.updateUser>[1] = {};
    if (input.displayName !== undefined) changes.displayName = String(input.displayName);
    if (input.email !== undefined) changes.email = String(input.email);
    if (input.role !== undefined) changes.role = readRole(input.role);
    if (input.disabled !== undefined) changes.disabled = input.disabled === true;
    if (input.budgetUsd !== undefined) {
      changes.budgetUsd = input.budgetUsd === null ? null : Number(input.budgetUsd);
    }
    if (input.capabilities !== undefined) {
      const grant = readGrant(input.capabilities);
      // The resulting grant, not the delta: otherwise two patches each adding "nothing you lack"
      // can still arrive somewhere the granter could not have gone in one step.
      const resulting = { ...target.capabilities, ...grant };
      const missing = missingCapabilities(principal.user.capabilities, resulting);
      if (missing.length > 0) {
        throw new AuthError(
          `you cannot grant ${missing.join(", ")} because you do not hold ${missing.length > 1 ? "them" : "it"}`,
          "forbidden",
          403,
        );
      }
      changes.capabilities = grant;
    }

    const updated = store.updateUser(target.id, changes);
    // A disabled account must not keep a live session: the sign-out has to be immediate, not at
    // the next expiry.
    if (changes.disabled === true) store.revokeAllSessionsFor(updated.id);
    return c.json(publicUser(updated));
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * Set or reset a password.
 *
 * There is no reset-by-email flow in a local product; the owner does it, and every existing session
 * for that account is revoked so a password change actually ends access rather than merely changing
 * how the next one begins.
 */
userRoutes.post("/:userId/password", requireSession, async (c) => {
  try {
    const principal = principalOf(c);
    const store = getUserStore();
    const target = store.getUser(c.req.param("userId"));

    // Own password, or the owner setting someone else's.
    if (target.id !== principal.user.id) requirePermission(principal, "manage_users");

    const input = await body(c);
    const hash = await hashPassword(String(input.password ?? ""));
    store.updateUser(target.id, { passwordHash: hash });
    const revoked = store.revokeAllSessionsFor(target.id);

    // The caller who changed their own password should not be signed out by their own request.
    if (target.id === principal.user.id) {
      const token = mintSessionToken();
      const session = store.createSession(target.id, token);
      c.header("Set-Cookie", sessionCookie(token, session.expiresAt));
    }
    return c.json({ updated: true, sessionsRevoked: revoked });
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * There is no DELETE.
 *
 * "Disable", not "Delete" (§3.8): a removed user's approvals and published posts must remain
 * attributable, and deleting the principal orphans the record. The refusal names the alternative
 * rather than 404-ing, because a missing verb reads as an oversight.
 */
userRoutes.delete("/:userId", requireSession, (c) =>
  c.json(
    {
      error:
        "users are disabled, never deleted — an approval or a published post must stay attributable " +
        "to the person who made it. PATCH /:userId with {\"disabled\": true}.",
      code: "forbidden",
    },
    405,
  ),
);

/** Every capability this workspace knows about, so the page never hard-codes the list. */
userRoutes.get("/capabilities/all", requireSession, (c) => {
  principalOf(c);
  return c.json({ keys: CAPABILITY_KEYS, none: NO_CAPABILITIES, all: ALL_CAPABILITIES });
});
