/**
 * The USERS page, NAVIGATOR region.
 *
 * The shell has already rendered the page selector and the page's name above this; everything
 * here is the page's own. The wireframe puts three things in this column — a search box, the roles
 * with their counts, and a "needs a decision" section — and two of the three survive contact with
 * what exists.
 *
 * The one that does not is "1 person over their cap". Nothing knows whether anybody is over a cap:
 * spend is not measured, and `user` is not one of the three budget scopes the product enforces
 * (§3.6). A count of people over a limit that is not checked against a figure that is not measured
 * would be the single most confidently wrong number on the screen, so the section states what it
 * would need instead.
 *
 * "Invite someone" goes the same way and for a shorter reason: there is nobody to invite anybody
 * to be, because there is no sign-in (§3.1).
 */
import type { WorkspacePageProps } from "../shell/contract";
import { NotBuilt } from "./NotBuilt";
import { ROLES, type Role } from "./types";
import { SectionLabel } from "./ui";
import {
  type RoleFilter,
  roleCounts,
  setQuery,
  setRoleFilter,
  useUsersState,
  visibleUsers,
} from "./usersStore";

const ROLE_LABEL: Record<RoleFilter, string> = {
  all: "Everyone",
  owner: "Owner",
  approver: "Approver",
  member: "Member",
};

function FilterRow({
  value,
  active,
  count,
  onPick,
}: {
  value: RoleFilter;
  active: boolean;
  count: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`role-filter-${value}`}
      aria-pressed={active}
      onClick={onPick}
      className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] ${
        active ? "bg-surface-active text-ink" : "text-ink-faint hover:bg-surface-hover"
      }`}
    >
      <span className="flex-1">{ROLE_LABEL[value]}</span>
      <span className="font-mono text-[10px] text-ink-ghost">{count}</span>
    </button>
  );
}

function Navigator({ selectionId, onSelect }: WorkspacePageProps) {
  const state = useUsersState();
  const counts = roleCounts(state.users);
  const shown = visibleUsers(state);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <label className="sr-only" htmlFor="users-search">
        Search people
      </label>
      <input
        id="users-search"
        data-testid="users-search"
        type="search"
        value={state.query}
        placeholder="Search people"
        onChange={(e) => setQuery(e.target.value)}
        className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-ghost focus:border-border-strong focus:outline-none"
      />

      <SectionLabel>Roles</SectionLabel>
      <div className="flex flex-col">
        <FilterRow
          value="all"
          active={state.roleFilter === "all"}
          count={counts.all}
          onPick={() => setRoleFilter("all")}
        />
        {ROLES.map((role: Role) => (
          <FilterRow
            key={role}
            value={role}
            active={state.roleFilter === role}
            count={counts[role]}
            onPick={() => setRoleFilter(role)}
          />
        ))}
      </div>

      {/* The list itself, so a narrow window still has a way to reach a person when MAIN is
          scrolled. It mirrors MAIN's selection rather than keeping one of its own — selection is
          the shell's, in the URL. */}
      <div className="h-px bg-border" />
      <SectionLabel>{shown.length === state.users.length ? "All people" : "Matching"}</SectionLabel>
      <div className="flex flex-col">
        {shown.map((user) => (
          <button
            key={user.id}
            type="button"
            data-testid={`nav-user-${user.id}`}
            onClick={() => onSelect(user.id === selectionId ? undefined : user.id)}
            className={`truncate rounded-md px-2.5 py-1.5 text-left text-[13px] ${
              user.id === selectionId
                ? "bg-accent/10 text-ink"
                : "text-ink-faint hover:bg-surface-hover"
            }`}
          >
            {user.displayName}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2">
        <SectionLabel>Needs a decision</SectionLabel>
        <NotBuilt
          what="People over their cap"
          because={
            "Counting them needs measured spend and a user-scoped budget. Neither exists: the " +
            "rate table has no Grok model, and budgets are enforced at agent, task and project " +
            "scope only."
          }
          closedBy="06-tools-cost COST-004…006, then loop 08 stage 6"
        />
        <NotBuilt
          what="Invite someone"
          because="An invite needs a sign-in to invite somebody to, and nobody signs in."
          closedBy="loop 08 stages 1–2"
        />
      </div>
    </div>
  );
}

/** The NAVIGATOR slot. Hook-free at the call site — see the note on `UsersPageMain`. */
export const UsersPageNavigator = (props: WorkspacePageProps) => <Navigator {...props} />;
