/**
 * The USERS page, MAIN region — loops/08-users-and-x.md §3.8.
 *
 * Small, because the product is deliberately less rich than what it replaces, and smaller still
 * because this is a secondary surface. It is the only page in the workspace that produces nothing
 * — no asset, no document, no agent output.
 *
 * The column order is the argument. §3.8's first rule is that **the capability column, not the
 * budget column, is the wide one**, because capability is the control that works: a grant is a
 * boolean and cannot be defeated by a bug in the measurement, where a dollar cap depends on a
 * meter that currently reads zero for every Grok model. The budget column is therefore a cap and
 * nothing else — no spend figure and no percentage-full bar, because per-person spend is not
 * measured and a zero would read as "spent nothing" rather than "not counted".
 *
 * One line under the title says nothing here is enforced. That is the whole of it: the page used
 * to carry a banner, an expandable gap register and four "not built" statements, which is more
 * apology than page.
 */
import { useEffect, useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { CAPABILITIES, CAPABILITY_KEYS } from "./capabilities";
import type { WorkspaceUser } from "./types";
import { Avatar, CapabilityPill, Money, usd } from "./ui";
import { useUsersState, visibleUsers } from "./usersStore";

/**
 * One grid template, declared once and used by the header and every row.
 *
 * Two grids that are meant to line up and are written out twice are two grids that stop lining up
 * the first time somebody widens a column.
 */
const COLUMNS = "minmax(0,1fr) 104px minmax(260px,1.4fr) 172px";

function ColumnHeader() {
  return (
    <div
      style={{ gridTemplateColumns: COLUMNS }}
      className="grid shrink-0 gap-4 border-b border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost"
    >
      <div>Person</div>
      <div>Role</div>
      <div>May create agents with</div>
      <div>Budget</div>
    </div>
  );
}

function PersonRow({
  user,
  selected,
  onSelect,
}: {
  user: WorkspaceUser;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`user-row-${user.id}`}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      style={{ gridTemplateColumns: COLUMNS }}
      className={`grid w-full items-center gap-4 border-b border-l-2 border-border px-4 py-3 text-left text-[15px] ${
        selected ? "border-l-accent bg-accent/10" : "border-l-transparent hover:bg-surface-hover"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Avatar name={user.displayName} muted={user.disabled} />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className={`truncate ${user.disabled ? "text-ink-faint" : "text-ink"}`}>
              {user.displayName}
            </span>
            {user.disabled ? (
              // Disabled, not deleted (§3.8): a removed person's approvals and published posts
              // have to stay attributable, so the principal outlives the access.
              <span className="shrink-0 rounded border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
                disabled
              </span>
            ) : null}
          </span>
          {user.email ? (
            <span className="block truncate text-[12px] text-ink-ghost">{user.email}</span>
          ) : (
            // Nobody signs in, so there is no address. Said, rather than left as an empty line.
            <span className="block truncate text-[12px] text-ink-ghost">
              nobody signs in — this is whoever opened the workspace
            </span>
          )}
        </span>
      </span>

      <span className={user.disabled ? "text-ink-ghost" : "text-ink-muted"}>{user.role}</span>

      <span className="flex flex-wrap gap-1.5">
        {CAPABILITY_KEYS.map((key) => (
          <CapabilityPill
            key={key}
            label={CAPABILITIES[key].label}
            granted={user.capabilities[key]}
            title={CAPABILITIES[key].price || CAPABILITIES[key].note}
          />
        ))}
      </span>

      {user.budgetUsd === undefined ? (
        <span className="text-[12px] text-ink-faint">no cap</span>
      ) : (
        <span className="flex items-baseline gap-1.5">
          <Money>{usd(user.budgetUsd)}</Money>
          <span className="text-[11px] text-ink-ghost">a month</span>
        </span>
      )}
    </button>
  );
}

/**
 * The project's own cap, from `GET /api/projects/:id`.
 *
 * The one figure on this page that is neither invented nor unmeasured: a project budget is a
 * number a person wrote down and the store keeps. It is a CAP and never a spend — the page says
 * so, because a cap beside a table of people invites exactly that misreading.
 */
function useProjectCap(projectId: string): number | undefined {
  const [cap, setCap] = useState<number | undefined>();
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const body = await res.json();
        // Checked, not asserted: an error body is an object too, and `body.budgetUsd` on one is
        // `undefined`, which is exactly the right answer rather than a thrown render.
        if (live && body && typeof body.budgetUsd === "number") setCap(body.budgetUsd);
      } catch {
        // A cap that will not load is a cap that is not shown. It is not an error the reader can act on.
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId]);
  return cap;
}

function UsersMain({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const state = useUsersState();
  const rows = visibleUsers(state);
  const projectCap = useProjectCap(projectId);

  // Real arithmetic over the caps that are written down. It is not a spend total and is not
  // labelled as one — it is what this workspace has authorised, which is a fact the caps support.
  const capped = state.users.filter((u) => !u.disabled && u.budgetUsd !== undefined);
  const totalCaps = capped.reduce((sum, u) => sum + (u.budgetUsd ?? 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-[17px] text-ink">People on this project</h1>
          {/*
            One line, permanently, in place of the banner that used to open this page. Nobody signs
            in, so no request carries a person and no role or grant below can be applied. Said once
            and quietly — the page is honest, not apologetic.
          */}
          <p data-testid="not-enforced-note" className="mt-0.5 text-[12px] text-ink-ghost">
            Nobody signs in yet, so nothing here is enforced — roles and grants are recorded, not
            applied, and edits stay in this browser tab.
          </p>
        </div>
        <div className="flex-1" />
        <span
          data-testid="users-totals"
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost"
        >
          {/*
            Two caps, and neither is a spend. BUDGETS TOTAL is arithmetic over what people were
            authorised; PROJECT CAP is the project's own figure.
          */}
          Budgets total {capped.length === 0 ? "none set" : usd(totalCaps)} · Project cap{" "}
          {projectCap === undefined ? "not set" : usd(projectCap)}
        </span>
      </header>

      <ColumnHeader />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p data-testid="users-empty" className="px-4 py-6 text-[13px] text-ink-faint">
            {state.users.length === 0
              ? "Nobody is on this project."
              : "No one here matches that search."}
          </p>
        ) : (
          rows.map((user) => (
            <PersonRow
              key={user.id}
              user={user}
              selected={user.id === selectionId}
              onSelect={() => onSelect(user.id === selectionId ? undefined : user.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * The MAIN slot.
 *
 * A thin wrapper that renders `<UsersMain/>` rather than being `UsersMain` itself, and that is not
 * a style choice. `WorkspaceShell` invokes a page's slots as plain functions —
 * `component(props)`, `page.navigator(pageProps)` — so a slot that used a hook directly would have
 * its hooks counted against the *shell's* fiber, and switching pages would change the shell's hook
 * count between renders. Returning an element gives this component its own fiber, which is where
 * its hooks belong. Filed in the handoff as a hazard for 07-shell, since it applies to all five
 * pages and not only this one.
 */
export const UsersPageMain = (props: WorkspacePageProps) => <UsersMain {...props} />;
