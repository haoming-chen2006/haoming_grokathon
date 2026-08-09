/**
 * Identity: the principal, the credential, the session, and the middleware that fails closed
 * (loops/08-users-and-x.md §3.1–§3.7).
 *
 * ── What this file is fixing ──────────────────────────────────────────────────────────────────
 * The product has no authentication. Not weak, not dev-mode — absent. `actorFrom`
 * (`server/routes/projects.ts`) resolves the caller from two request headers and falls back to
 * `{kind:"user", id:"user"}` when neither is present, so **sending no headers at all is the
 * maximum-privilege request**. Binding 127.0.0.1 limits reach, not privilege, and a CORS allowlist
 * is a browser convention that `curl` has never read.
 *
 * The consequence is already in the stored data: `submission.reviewedBy`, `plan.approvedBy` and the
 * merge gate's `approvedBy` all end up as the literal string `"user"`. `mergeAgentBranch` genuinely
 * refuses to merge without a named approver — the gate exists — but the name it demands is a
 * constant the caller supplies. **The gate exists. The identity does not.** This file is the
 * identity.
 *
 * ── The shape, and why the halves are split ───────────────────────────────────────────────────
 * `UserStore` is **entirely synchronous**, for the reason `ProjectStore.persist` gives at length: a
 * mutation is read-whole-file → change in memory → write-whole-file, and that sequence is safe only
 * because no `await` occurs inside it, so the event loop cannot interleave two of them and lose an
 * update. `authInvariants.test.ts` fails if any store method becomes async, if an `await` appears in
 * the class body, or if this explanation is deleted.
 *
 * Password hashing is argon2id and therefore genuinely asynchronous, so it lives **outside** the
 * store as free functions — the same split `persistFile` uses against `AssetStore`. Callers hash
 * first and hand the store a finished hash.
 *
 * ── The one rule that must not be reintroduced ────────────────────────────────────────────────
 * There is no `if (isLocal) return adminActor` here, and there must never be. That is the same shape
 * as the bug being fixed and it will be copied. First run *creates* a session; it does not skip the
 * check.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson } from "./persistence";
import type { Actor } from "../types/project";

// ───────────────────────────────────────────────────────────────────────────── the principal

/**
 * Three roles, named for what a salesperson would call them, each a superset of the one below
 * (§3.4). Three, and no more — a fourth is a permission matrix in disguise.
 */
export type Role = "owner" | "approver" | "member";

export const ROLES: readonly Role[] = ["owner", "approver", "member"];

/**
 * What a person may hand out (§3.5).
 *
 * `video` is separable from `images` **on purpose**: video is priced per second and a 60-second
 * generated experience is about $5.52 in media alone, against $0.02 for a still. A capability is
 * worth more than any dollar cap because it is a boolean and cannot be wrong — a cap depends on the
 * meter working, and a grant does not.
 */
export interface CapabilityGrant {
  /** `/v1/images/*` */
  images: boolean;
  /** `/v1/videos/*` — the expensive one. */
  video: boolean;
  /** `/v1/tts`, `/v1/stt`, `/v1/realtime` */
  voice: boolean;
  /** Publishing to X (§3.12). Owner and approver only by default. */
  publishToX: boolean;
}

export const CAPABILITY_KEYS: readonly (keyof CapabilityGrant)[] = ["images", "video", "voice", "publishToX"];

export const NO_CAPABILITIES: CapabilityGrant = { images: false, video: false, voice: false, publishToX: false };
export const ALL_CAPABILITIES: CapabilityGrant = { images: true, video: true, voice: true, publishToX: true };

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  capabilities: CapabilityGrant;
  /** §3.6. Recorded, and deliberately not enforced — the ledger that would enforce it is not built. */
  budgetUsd?: number;
  /** "Disable", never "Delete": a removed principal orphans the approvals it signed (§3.8). */
  disabled: boolean;
  /**
   * argon2id, from `hashPassword`. Absent for the first-run owner, who is created without one
   * because at that moment anyone who can reach the port is already the owner by physical
   * possession of the machine (§3.3).
   */
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

/**
 * A session, stored **hashed**.
 *
 * A session table full of live bearer tokens is a credential store: anyone who reads the file is
 * every user. Only the SHA-256 of the token is kept, so the stored value cannot be replayed as a
 * cookie. SHA-256 rather than argon2 on purpose — the token is 256 bits of `randomBytes`, not a
 * guessable human secret, so there is nothing for a slow hash to defend, and this lookup runs on
 * every single request.
 */
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastSeenAt?: string;
}

/** The caller, once a session has proved who they are. Never assembled from a request header. */
export interface Principal {
  user: User;
  session: SessionRecord;
}

// ───────────────────────────────────────────────────────────────────────────── the one rule

/**
 * What a role may do, expressed **once**.
 *
 * §3.4 forbids a permission matrix with a row per endpoint: it drifts from the code within two
 * iterations and the drift is silent. Because each role is a superset of the one below, the whole
 * rule is a rank comparison, and every gate in the product routes through `may`.
 */
export type Permission =
  | "create_projects"
  | "create_agents"
  | "approve"
  | "manage_users"
  | "manage_credentials";

const ROLE_RANK: Record<Role, number> = { member: 0, approver: 1, owner: 2 };

const MINIMUM_ROLE: Record<Permission, Role> = {
  create_projects: "member",
  create_agents: "member",
  approve: "approver",
  manage_users: "owner",
  manage_credentials: "owner",
};

export function may(role: Role, permission: Permission): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[MINIMUM_ROLE[permission]];
}

/** The role a permission needs, for a refusal that says what would be required. */
export function roleRequiredFor(permission: Permission): Role {
  return MINIMUM_ROLE[permission];
}

/**
 * The capabilities in `requested` that `holder` does not hold.
 *
 * A user cannot grant a capability they do not hold. Not hidden — refused, with the missing
 * capability named, because a hidden button is not a rule (§3.5).
 */
export function missingCapabilities(
  holder: CapabilityGrant,
  requested: CapabilityGrant,
): (keyof CapabilityGrant)[] {
  return CAPABILITY_KEYS.filter((key) => requested[key] && !holder[key]);
}

/**
 * The mapping between what a *person* may hand out and what an *agent* holds — written down once,
 * here, exactly as §3.5 requires, because two structures that nearly match is how a field comes to
 * mean two things.
 *
 * **`images` and `video` collapse into one flag, and not in the direction you would guess.**
 * 01-agents' `AgentCapabilities` is `{images, voice}`, and its own comment defines the image flag as
 * "Grok Imagine: still images AND video. One endpoint family, one credential, one rate family" —
 * `IMAGE_TOOLS` includes `image_to_video` and `poll_video_job`. So an agent granted `images` can
 * spend at the per-second video rate.
 *
 * Therefore handing an agent that flag requires the granter to hold **both** `images` and `video`.
 * The conservative direction is the only honest one: the alternative lets a user who was explicitly
 * denied video create an agent that generates it. The cost is that "images but not video" cannot be
 * expressed as an agent today, which is a real limitation of 01's two-field shape and is recorded in
 * the handoff rather than papered over here.
 */
export function agentCapabilitiesFrom(grant: CapabilityGrant): { images: boolean; voice: boolean } {
  return { images: grant.images && grant.video, voice: grant.voice };
}

/** An `Actor` for the code that predates identity. The id is a real user id at last. */
export function actorFor(user: User): Actor {
  return { kind: "user", id: user.id };
}

// ───────────────────────────────────────────────────────────────────────────── the credential

/**
 * argon2id, built into the runtime. Genuinely async, and therefore never called from inside the
 * store — see the note at the top of this file.
 *
 * There is no password-reset email flow in a local product. The owner resets a member's password
 * from the users page, and that is an audited action.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new AuthError("a password must be at least 8 characters", "weak_password", 400);
  return Bun.password.hash(plain, { algorithm: "argon2id" });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(plain, hash);
  } catch {
    // A malformed stored hash must read as "wrong password", never as "no password required".
    return false;
  }
}

/** 256 bits from the CSPRNG. This value is handed to the browser once and never stored. */
export function mintSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What goes on disk. See `SessionRecord` for why this is SHA-256 and not argon2. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compare two hashes without leaking where they diverge.
 *
 * The lookup below is by hash, so a timing signal here is faint. It is constant-time anyway because
 * the cost is one comparison and the alternative is an argument about how faint is faint enough.
 */
function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export const SESSION_COOKIE = "openui_session";

/** Thirty days. Long, because the target user is one person on their own laptop (§3.3). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * `HttpOnly` so a script cannot read it, `SameSite=Strict` so another origin cannot ride it, and
 * `Path=/` because the API and the app share an origin. `Secure` is omitted deliberately: the
 * product is served over http on loopback, and a `Secure` cookie would simply never be stored.
 */
export function sessionCookie(token: string, expiresAt: string): string {
  return (
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; ` +
    `Expires=${new Date(expiresAt).toUTCString()}`
  );
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Read the session token out of a raw Cookie header. */
export function tokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────── errors

export type AuthErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "already_initialised"
  | "weak_password"
  | "invalid_argument"
  | "self_approval"
  | "owner_immutable";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: AuthErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ───────────────────────────────────────────────────────────────────────────── the store

interface AuthFile {
  users: User[];
  sessions: SessionRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${randomBytes(4).toString("hex")}`;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Users and sessions, in one JSON file, mutated synchronously.
 *
 * **Every method on this class must stay synchronous**, for the reason given at the top of this file
 * and at `ProjectStore.persist`. The safety comes from the absence of `await`, not from locking.
 * Introducing an `async` method here — switching to `fs.promises`, awaiting a hash — silently
 * reintroduces lost updates, and two users created at once become one.
 *
 * Sessions live in the same file as users rather than beside them. It costs a rewrite of the user
 * list on every sign-in, which at laptop scale is nothing, and it buys one file whose read-modify-
 * write is atomic as a unit — a session and the user it belongs to can never disagree about whether
 * they exist.
 */
export class UserStore {
  private readonly path: string;

  constructor(dir: string) {
    // `atomicWriteJson` writes `<path>.tmp` and renames; neither creates a missing directory, so a
    // first run against a fresh data directory would fail at the moment it mints the owner.
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, "auth.json");
  }

  private read(): AuthFile {
    if (!existsSync(this.path)) return { users: [], sessions: [] };
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<AuthFile>;
      return { users: parsed.users ?? [], sessions: parsed.sessions ?? [] };
    } catch {
      // A corrupt file must not read as "no users", which would let first-run mint a second owner
      // over the top of a real workspace.
      throw new AuthError(`the identity store at ${this.path} is unreadable`, "invalid_argument", 500);
    }
  }

  private write(file: AuthFile): void {
    atomicWriteJson(this.path, file);
  }

  // ---------------------------------------------------------------- users

  listUsers(): User[] {
    return this.read().users.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  getUser(userId: string): User {
    const user = this.read().users.find((u) => u.id === userId);
    if (!user) throw new AuthError(`no user ${userId}`, "not_found", 404);
    return user;
  }

  findByEmail(email: string): User | undefined {
    const wanted = normaliseEmail(email);
    return this.read().users.find((u) => normaliseEmail(u.email) === wanted);
  }

  get userCount(): number {
    return this.read().users.length;
  }

  /** The single owner, or undefined before first run. There is exactly one, always (§3.4). */
  owner(): User | undefined {
    return this.read().users.find((u) => u.role === "owner");
  }

  /**
   * Mint the first-run owner: exactly one, and only when the workspace has none.
   *
   * No password, because at that moment anyone who can reach the port is already the owner by
   * physical possession of the machine. A password becomes required the moment there is a second
   * user or the host is not loopback — see `passwordRequired`.
   */
  createFirstRunOwner(params: { displayName: string; email: string }): User {
    const file = this.read();
    if (file.users.length > 0) {
      throw new AuthError(
        "this workspace already has an owner; first-run setup cannot run twice",
        "already_initialised",
        409,
      );
    }
    const user = buildUser({ ...params, role: "owner", capabilities: { ...ALL_CAPABILITIES } });
    file.users.push(user);
    this.write(file);
    return user;
  }

  /**
   * Add a person. The caller has already been checked for `manage_users` and for holding every
   * capability being granted — those are decisions about the *requester*, and this store is handed
   * the outcome rather than the request.
   */
  createUser(params: {
    displayName: string;
    email: string;
    role: Role;
    capabilities?: Partial<CapabilityGrant>;
    budgetUsd?: number;
    passwordHash?: string;
  }): User {
    const file = this.read();
    if (params.role === "owner") {
      throw new AuthError("there is exactly one owner and it cannot be created twice", "owner_immutable", 400);
    }
    if (file.users.some((u) => normaliseEmail(u.email) === normaliseEmail(params.email))) {
      throw new AuthError(`${params.email} is already a user of this workspace`, "invalid_argument", 409);
    }
    const user = buildUser({
      ...params,
      capabilities: { ...NO_CAPABILITIES, ...params.capabilities },
    });
    file.users.push(user);
    this.write(file);
    return user;
  }

  /**
   * Change a person.
   *
   * The owner cannot be demoted or disabled **by anyone, including itself**. A workspace whose owner
   * demoted themselves has nobody who can manage users, and the recovery is editing JSON by hand.
   */
  updateUser(
    userId: string,
    changes: {
      displayName?: string;
      email?: string;
      role?: Role;
      capabilities?: Partial<CapabilityGrant>;
      budgetUsd?: number | null;
      disabled?: boolean;
      passwordHash?: string;
    },
  ): User {
    const file = this.read();
    const user = file.users.find((u) => u.id === userId);
    if (!user) throw new AuthError(`no user ${userId}`, "not_found", 404);

    if (user.role === "owner") {
      if (changes.role !== undefined && changes.role !== "owner") {
        throw new AuthError(
          "the owner cannot be demoted — a workspace with no owner has nobody who can manage it",
          "owner_immutable",
          400,
        );
      }
      if (changes.disabled === true) {
        throw new AuthError("the owner cannot be disabled", "owner_immutable", 400);
      }
    }
    if (changes.role === "owner" && user.role !== "owner") {
      throw new AuthError("there is exactly one owner and the role cannot be handed over", "owner_immutable", 400);
    }
    if (changes.email !== undefined) {
      const taken = file.users.some(
        (u) => u.id !== userId && normaliseEmail(u.email) === normaliseEmail(changes.email as string),
      );
      if (taken) throw new AuthError(`${changes.email} is already a user of this workspace`, "invalid_argument", 409);
      user.email = changes.email.trim();
    }

    if (changes.displayName !== undefined) user.displayName = changes.displayName.trim();
    if (changes.role !== undefined) user.role = changes.role;
    if (changes.capabilities !== undefined) user.capabilities = { ...user.capabilities, ...changes.capabilities };
    if (changes.budgetUsd !== undefined) {
      if (changes.budgetUsd === null) delete user.budgetUsd;
      else user.budgetUsd = changes.budgetUsd;
    }
    if (changes.disabled !== undefined) user.disabled = changes.disabled;
    if (changes.passwordHash !== undefined) user.passwordHash = changes.passwordHash;

    user.updatedAt = nowIso();
    this.write(file);
    return user;
  }

  // ---------------------------------------------------------------- sessions

  /**
   * Record a session for a token that has already been minted.
   *
   * The plain token is never handed to this method's storage — only its hash. The caller holds the
   * token exactly long enough to put it in a `Set-Cookie` header.
   */
  createSession(userId: string, token: string, ttlMs = SESSION_TTL_MS): SessionRecord {
    const file = this.read();
    const user = file.users.find((u) => u.id === userId);
    if (!user) throw new AuthError(`no user ${userId}`, "not_found", 404);
    if (user.disabled) throw new AuthError("this account is disabled", "forbidden", 403);

    const created = new Date();
    const session: SessionRecord = {
      id: newId("sess"),
      userId,
      tokenHash: hashSessionToken(token),
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + ttlMs).toISOString(),
    };
    // Expired rows are dropped on every write rather than swept on a timer: the file is rewritten
    // here anyway, and a sweep that runs on a timer is a sweep that does not run in a test.
    file.sessions = [...pruneExpired(file.sessions, created), session];
    this.write(file);
    return session;
  }

  /**
   * The principal for a token, or null.
   *
   * Null for every failure — no session, unknown token, expired, revoked, disabled account — because
   * the caller's answer is 401 in all five cases and distinguishing them for the client only tells
   * an attacker which guess was closer.
   */
  principalFor(token: string): Principal | null {
    const file = this.read();
    const wanted = hashSessionToken(token);
    const session = file.sessions.find((s) => hashesEqual(s.tokenHash, wanted));
    if (!session) return null;
    if (session.revokedAt) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return null;

    const user = file.users.find((u) => u.id === session.userId);
    if (!user || user.disabled) return null;
    return { user, session };
  }

  /** Stamp activity. Separate from `principalFor` so a read cannot become a write by accident. */
  touch(sessionId: string): void {
    const file = this.read();
    const session = file.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const at = nowIso();
    session.lastSeenAt = at;
    const user = file.users.find((u) => u.id === session.userId);
    if (user) user.lastActiveAt = at;
    this.write(file);
  }

  /** Sign out. Revoked rather than deleted, so "when did this session end" stays answerable. */
  revokeSession(sessionId: string): void {
    const file = this.read();
    const session = file.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.revokedAt = nowIso();
    this.write(file);
  }

  /** Every session for a user — what disabling an account or resetting a password must call. */
  revokeAllSessionsFor(userId: string): number {
    const file = this.read();
    let revoked = 0;
    for (const session of file.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = nowIso();
        revoked += 1;
      }
    }
    if (revoked > 0) this.write(file);
    return revoked;
  }

  listSessions(userId?: string): SessionRecord[] {
    const sessions = this.read().sessions;
    return userId ? sessions.filter((s) => s.userId === userId) : sessions;
  }
}

function pruneExpired(sessions: SessionRecord[], now: Date): SessionRecord[] {
  const cutoff = now.getTime();
  return sessions.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
}

function buildUser(params: {
  displayName: string;
  email: string;
  role: Role;
  capabilities: CapabilityGrant;
  budgetUsd?: number;
  passwordHash?: string;
}): User {
  const displayName = params.displayName.trim();
  const email = params.email.trim();
  if (!displayName) throw new AuthError("a display name is required", "invalid_argument", 400);
  if (!email.includes("@")) throw new AuthError(`"${email}" is not an email address`, "invalid_argument", 400);

  const at = nowIso();
  const user: User = {
    id: newId("user"),
    email,
    displayName,
    role: params.role,
    capabilities: { ...params.capabilities },
    disabled: false,
    createdAt: at,
    updatedAt: at,
  };
  if (params.budgetUsd !== undefined) user.budgetUsd = params.budgetUsd;
  if (params.passwordHash !== undefined) user.passwordHash = params.passwordHash;
  return user;
}

// ───────────────────────────────────────────────────────────────────────────── the shared store

let store: UserStore | null = null;
let storeDir: string | null = null;

/**
 * Where the identity file lives.
 *
 * Resolved here rather than through `persistence.ts`'s `getDataDir()`, which hard-codes
 * `~/.openui` and ignores `OPENUI_DATA_DIR`. `getAssetStore` and `getAgentRegistry` both read the
 * environment variable, so this matches the two stores it sits beside rather than the one helper
 * that does not — and a store no test can redirect is a store every test writes to the developer's
 * real home directory. `persistence.ts` belongs to no worktree row, so it is left alone and the
 * inconsistency is recorded in the handoff instead.
 */
function authDir(): string {
  return process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
}

/**
 * The process's store, rebuilt when the data directory changes rather than cached forever — the
 * pattern `getAssetStore` uses, and for the same reason: otherwise the directory is fixed by
 * whichever caller happened to run first, and a test can never point it anywhere.
 */
export function getUserStore(): UserStore {
  const dir = authDir();
  if (!store || storeDir !== dir) {
    store = new UserStore(dir);
    storeDir = dir;
  }
  return store;
}

/** Tests only. */
export function resetUserStore(): void {
  store = null;
  storeDir = null;
}

// ───────────────────────────────────────────────────────────────────── startup and middleware

/**
 * Whether a password is required to sign in (§3.3).
 *
 * Two conditions, and the second is a startup concern rather than a sign-in one: a workspace
 * exposed to a network with no passwords should refuse to start, not discover the problem when
 * someone tries to log in.
 */
export function passwordRequired(store: UserStore, host = process.env.OPENUI_HOST): boolean {
  return store.userCount > 1 || !isLoopbackHost(host);
}

export function isLoopbackHost(host: string | undefined): boolean {
  const value = (host ?? "127.0.0.1").trim();
  return value === "" || value === "127.0.0.1" || value === "localhost" || value === "::1";
}

/**
 * The startup refusal.
 *
 * Returns the reason to refuse to start, or null. Deliberately a pure function returning a message
 * rather than a `process.exit`, so the composition root decides and a test can assert the sentence.
 *
 * Note what this is **not**: it is not a privilege decision. `isLoopbackHost` appears here and
 * nowhere else in this file — there is no path where being local grants an actor. That distinction
 * is the whole of §3.3.
 */
export function startupRefusal(store: UserStore, host = process.env.OPENUI_HOST): string | null {
  if (isLoopbackHost(host)) return null;
  const passwordless = store.listUsers().filter((u) => !u.disabled && !u.passwordHash);
  if (passwordless.length === 0) return null;
  return (
    `OPENUI_HOST is set to ${host}, which is not a loopback address, and ` +
    `${passwordless.length} account(s) in this workspace have no password: ` +
    `${passwordless.map((u) => u.email).join(", ")}. A workspace reachable from the network with ` +
    `passwordless accounts is an open door. Set a password for each account, or unset OPENUI_HOST.`
  );
}

/**
 * Resolve the caller from the session cookie, or refuse.
 *
 * This is the inversion the whole document turns on:
 *
 * ```text
 * today   no session, no headers  → {kind:"user", id:"user"}, fully privileged
 * after   no valid session        → 401. Nothing else. No default actor.
 * ```
 *
 * It takes a cookie header rather than a framework request so it can be tested without one, and so
 * the MCP path — which proves identity with a bearer secret rather than a cookie — can reuse the
 * store half without inheriting the cookie half.
 */
export function principalFromCookie(cookieHeader: string | null | undefined, store = getUserStore()): Principal | null {
  const token = tokenFromCookieHeader(cookieHeader);
  if (!token) return null;
  return store.principalFor(token);
}

/** The sentence a 401 carries. One sentence, and it never says which of the five reasons applied. */
export const UNAUTHENTICATED_MESSAGE =
  "not signed in. This request carried no valid session. Sign in at /api/users/session, or run " +
  "first-run setup if this workspace has no owner yet.";

/**
 * Assert a permission, or throw the refusal that names what would have been required.
 *
 * Every gate in the product routes through here rather than testing `role === "owner"` at the call
 * site — one rule, one place, as §3.4 requires.
 */
export function requirePermission(principal: Principal, permission: Permission): void {
  if (!may(principal.user.role, permission)) {
    throw new AuthError(
      `this action needs the ${roleRequiredFor(permission)} role; ${principal.user.displayName} is a ` +
        `${principal.user.role}`,
      "forbidden",
      403,
    );
  }
}

/**
 * Nobody approves their own request (§3.4).
 *
 * The server refuses; hiding the control is not a rule. The single-user workspace is the interesting
 * case — the owner is alone and there is no second pair of eyes to be had — and the answer is not to
 * fake one. `selfApprovalAllowed` says when a self-approval is the only approval available, and the
 * caller records `selfApproved: true` and says so in the confirmation. An honest record of a weak
 * approval beats a fabricated strong one.
 */
export function selfApprovalIsOnlyOption(store: UserStore): boolean {
  return store.listUsers().filter((u) => !u.disabled && may(u.role, "approve")).length <= 1;
}

export function requireDifferentApprover(requesterId: string, approver: Principal, store: UserStore): void {
  if (requesterId !== approver.user.id) return;
  if (selfApprovalIsOnlyOption(store)) return; // Recorded as selfApproved by the caller, never hidden.
  throw new AuthError(
    "you cannot approve your own request — another approver in this workspace must do it",
    "self_approval",
    403,
  );
}
