/**
 * Page state, in a module rather than in a React context.
 *
 * That is forced by the shell contract, and it is worth stating because it looks like a mistake.
 * `WorkspaceShell` renders a page's three slots into three separate regions — the navigator's
 * filter, the main table and the inspector's editor are three sibling subtrees with the shell in
 * between. A page cannot wrap them in a provider, because the page never renders the frame. So
 * anything two slots share lives here, and each slot subscribes.
 *
 * `useSyncExternalStore` rather than a bespoke listener hook: it is React's own answer for an
 * external store and it is the one that stays correct under concurrent rendering, which a naive
 * `useEffect` + `forceUpdate` pair does not.
 *
 * **Selection is deliberately not in here.** Which person is open is `selectionId` in the URL,
 * owned by the shell and handed to every slot as a prop. Keeping a second copy would give one
 * fact two sources of truth — the bug this repository has already fixed twice on
 * `x-openui-actor-doc-write` (`server/routes/projects.ts:27-38`, `server/routes/mcp.ts:23-25`).
 */
import { useSyncExternalStore } from "react";
import { MOCK_USERS } from "./mockUsers";
import type { CapabilityGrant, Role, WorkspaceUser } from "./types";

/**
 * Where the rows come from, stated on screen.
 *
 * When `GET /api/users` exists this becomes `"server"` and the notice the page renders disappears
 * with it. Until then a reader has to be told, every time they look, that these four people are
 * invented — otherwise the page is indistinguishable from a workspace that really has four.
 */
export type UsersSource = "fixture" | "server";

export const SOURCE: UsersSource = "fixture";

export const SOURCE_NOTE =
  "These four people are invented, and edits to them are held in this browser tab only. " +
  "There is no user record and no /api/users to save them to — that is stage 1 of this loop, and " +
  "this page is stage 7.";

export type RoleFilter = Role | "all";

interface UsersState {
  users: WorkspaceUser[];
  query: string;
  roleFilter: RoleFilter;
}

let state: UsersState = {
  users: MOCK_USERS,
  query: "",
  roleFilter: "all",
};

const listeners = new Set<() => void>();

/**
 * Replace the snapshot, never mutate it.
 *
 * `useSyncExternalStore` compares snapshots by identity, so an in-place edit is a change no
 * subscriber sees. This is also the shape the real store has to take: the server half of
 * `server/services/auth.ts` is required to mutate synchronously — no `await` in a mutation, which
 * is where its concurrency safety comes from (`server/services/projectStore.ts:148-162`) — and a
 * client store that batched or deferred would model something the server cannot do.
 */
function set(next: Partial<UsersState>): void {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = (): UsersState => state;

export function useUsersState(): UsersState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const setQuery = (query: string): void => set({ query });

export const setRoleFilter = (roleFilter: RoleFilter): void => set({ roleFilter });

/**
 * Edit one person.
 *
 * Local, and labelled local. This is not a control that does nothing — it does exactly what the
 * page says it does, which is change the row in front of you — but it is emphatically not a
 * control that changes what anybody may do, and the page never implies otherwise.
 */
export function updateUser(id: string, patch: Partial<WorkspaceUser>): void {
  set({
    users: state.users.map((u) =>
      u.id === id ? { ...u, ...patch, updatedAt: new Date().toISOString() } : u,
    ),
  });
}

export function setCapability(id: string, key: keyof CapabilityGrant, value: boolean): void {
  const user = state.users.find((u) => u.id === id);
  if (!user) return;
  updateUser(id, { capabilities: { ...user.capabilities, [key]: value } });
}

/** Name or address, case-insensitively. Nothing cleverer — four rows do not need a matcher. */
const matches = (user: WorkspaceUser, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return user.displayName.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
};

export function visibleUsers(s: UsersState): WorkspaceUser[] {
  return s.users.filter(
    (u) => matches(u, s.query) && (s.roleFilter === "all" || u.role === s.roleFilter),
  );
}

export function roleCounts(users: WorkspaceUser[]): Record<RoleFilter, number> {
  return {
    all: users.length,
    owner: users.filter((u) => u.role === "owner").length,
    approver: users.filter((u) => u.role === "approver").length,
    member: users.filter((u) => u.role === "member").length,
  };
}
