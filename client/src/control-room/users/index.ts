/**
 * Everything the rest of the product may use from this surface.
 *
 * loops/08-users-and-x.md §0: "the users page and the X page each export one component from
 * `client/src/control-room/users/index.ts`, taking props and importing no shell internals". The
 * only thing this directory imports from 07-shell is `shell/contract.ts` — the file whose own
 * header says every declaration in it is consumed by another worktree, and which imports nothing
 * so that it typechecks with no other shell file present. That is the seam; `WorkspaceShell`,
 * `regions`, `router` and `theme` are not, and nothing here reaches for them.
 *
 * ### How this page is mounted, and why that is one line somebody else writes
 *
 * `client/src/control-room/shell/pages.ts` is 07-shell's file and its header reserves the edit for
 * reconciliation. So this loop does not make it. The edit is:
 *
 * ```diff
 * -  { id: "users", label: "Users", segment: "users", rank: "secondary", builtBy: "08-users-x" },
 * +  { id: "users", label: "Users", segment: "users", rank: "secondary", builtBy: "08-users-x",
 * +    ...USERS_PAGE_SLOTS },
 * ```
 *
 * with `import { USERS_PAGE_SLOTS } from "../users";` at the top. It is filed verbatim in
 * `loops/handoff/pivot-users-x.md`. Exporting the three slots as one object rather than three
 * named components is what keeps it to one line: the row keeps its id, label, segment and rank,
 * which are 07-shell's to decide, and gains only the components, which are this loop's.
 *
 * ### What is not here yet
 *
 * `XPage`. §8 lists it in this file's contract and it is stage 14 — the last stage of the loop,
 * behind nine others and behind credentials that do not exist on this machine (`X_CLIENT_ID`,
 * `X_CLIENT_SECRET`). §3.15 also requires that the X page be **absent** rather than disabled when
 * there are no credentials, so an export that rendered a placeholder would be the wrong thing to
 * have written. The `x` row in `pages.ts` therefore stays unmounted and the shell says the branch
 * that builds it has not merged, which is true.
 */
import type { PageDescriptor } from "../shell/contract";
import { UsersPageInspector } from "./UserInspector";
import { UsersPageNavigator } from "./UsersNavigator";
import { UsersPageMain } from "./UsersPage";

export { UsersPageMain as UsersPage } from "./UsersPage";
export { UsersPageNavigator } from "./UsersNavigator";
export { UsersPageInspector } from "./UserInspector";

export type { CapabilityGrant, Role, WorkspaceUser } from "./types";

/** The three slots, shaped for one `...spread` into the `users` row of the shell's registry. */
export const USERS_PAGE_SLOTS: Pick<PageDescriptor, "main" | "navigator" | "inspector"> = {
  main: UsersPageMain,
  navigator: UsersPageNavigator,
  inspector: UsersPageInspector,
};
