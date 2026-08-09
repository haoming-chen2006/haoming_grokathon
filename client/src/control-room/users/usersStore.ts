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
import type { CapabilityGrant, Role, WorkspaceUser } from "./types";

/**
 * Where the rows come from, stated on screen.
 *
 * It used to be `"fixture"`, and `mockUsers.ts` held four invented people with plausible names and
 * `.example` addresses. They are deleted. A table of invented colleagues is the one fabrication
 * this page could least afford: it is the page whose entire subject is who may do what, and a
 * reader had no way to tell four fictional people from four real ones.
 *
 * What is left is the truth about this product's access model, and it is exactly one row — see
 * `THIS_MACHINE`. When `GET /api/users` exists this becomes `"server"`.
 */
export type UsersSource = "unauthenticated" | "server";

export const SOURCE: UsersSource = "unauthenticated";

/**
 * The one person this product can honestly say is here: whoever opened the workspace.
 *
 * Not a placeholder and not a fixture. It follows from two facts the banner above the table
 * already states — there is no sign-in, and there must always be exactly one owner (§3.4). With
 * nobody authenticated, the person looking at the screen holds every capability, which is what an
 * owner is. So the row is real; what it lacks is a NAME, and it does not invent one.
 */
export const THIS_MACHINE: WorkspaceUser = {
  id: "owner_this_machine",
  displayName: "You",
  role: "owner",
  capabilities: { images: true, video: true, voice: true, publishToX: true },
  // No cap on the owner: §3.4 gives them everything below them, and a cap the same person can
  // raise is a note to self rather than a control. Rendered as "no cap", never as $0.
  budgetUsd: undefined,
  disabled: false,
  createdAt: "",
  updatedAt: "",
};

export type RoleFilter = Role | "all";

interface UsersState {
  users: WorkspaceUser[];
  query: string;
  roleFilter: RoleFilter;
}

let state: UsersState = {
  users: [THIS_MACHINE],
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
  return user.displayName.toLowerCase().includes(q) || (user.email ?? "").toLowerCase().includes(q);
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
