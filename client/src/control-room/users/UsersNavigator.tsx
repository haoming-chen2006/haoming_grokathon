/**
 * The USERS page, NAVIGATOR region.
 *
 * The shell has already rendered the page selector and the page's name above this; everything
 * here is the page's own — a search box, the roles with their counts, and the people themselves.
 *
 * The wireframe's third section, "needs a decision", is not here. Both of its rows were statements
 * that something is missing rather than something to decide: "1 person over their cap" cannot be
 * counted while spend is unmeasured and `user` is not a budget scope (§3.6), and "invite someone"
 * needs a sign-in to invite anybody to (§3.1).
 */
import type { WorkspacePageProps } from "../shell/contract";
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
    </div>
  );
}

/** The NAVIGATOR slot. Hook-free at the call site — see the note on `UsersPageMain`. */
export const UsersPageNavigator = (props: WorkspacePageProps) => <Navigator {...props} />;
