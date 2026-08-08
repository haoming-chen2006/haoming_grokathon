/**
 * The USERS page, INSPECTOR region — the capability grant and the budget cap.
 *
 * This is the part of the surface worth building today. loops/08-users-and-x.md §3.5 makes the
 * case: capability is the cheapest budget control in the product, because a grant is a boolean and
 * a dollar cap is a measurement, and the measurement is broken (§3.6). A member who may not grant
 * `video` cannot create an agent that spends $5.52 an experience — whether or not the meter works,
 * whether or not a retry loop went wrong. **Prefer the control that cannot be defeated by a bug in
 * the measurement.**
 *
 * So each switch carries its price, right there, rather than deferring to a rate card. The
 * decision the product wants a person to make is "is this worth $0.050 a second to me", and that
 * decision cannot be made on a screen that only says "video".
 *
 * Two things this panel will not do, and the reason is the same for both:
 *
 *   - it does not enforce anything. Every switch here changes a row in front of you and nothing
 *     else. The rules — a user cannot grant a capability they do not hold; raising a grant is a
 *     restricted action — are server-side by construction (§3.5), because a hidden control is not
 *     a rule and a client that decides what is allowed has already lost. The panel states both
 *     rules and states that neither is written.
 *   - it does not delete a person. §3.8 is explicit: "Disable", not "Delete". A removed person's
 *     approvals and published posts have to stay attributable, and deleting the principal orphans
 *     the record. Deletion is a stop-and-ask (§7), not a button.
 */
import type { WorkspacePageProps } from "../shell/contract";
import { CAPABILITIES, CAPABILITY_KEYS } from "./capabilities";
import { NotBuilt } from "./NotBuilt";
import { ROLES, isSoleOwner, type Role } from "./types";
import { Avatar, Money, SectionLabel, UnmeasuredSpend, usd } from "./ui";
import { setCapability, updateUser, useUsersState } from "./usersStore";

/**
 * A switch, not a checkbox.
 *
 * `role="switch"` with `aria-checked` is the accessible shape for an on/off that takes effect
 * immediately, which is what these do — there is no Save button, because there is nothing to save
 * to and a Save button that saved nowhere would be the dead control this page spends its whole
 * banner refusing to ship.
 */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={`toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      onClick={() => onChange(!checked)}
      className={`flex h-[18px] w-8 shrink-0 items-center rounded-full border px-0.5 ${
        checked ? "justify-end border-accent bg-accent/20" : "justify-start border-border"
      } ${disabled ? "opacity-50" : "hover:border-border-strong"}`}
    >
      <span
        aria-hidden="true"
        className={`h-3.5 w-3.5 rounded-full ${checked ? "bg-accent" : "border border-border-strong"}`}
      />
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}

function Inspector({ selectionId }: WorkspacePageProps) {
  const state = useUsersState();
  const user = state.users.find((u) => u.id === selectionId);

  if (!user) {
    return (
      <p data-testid="inspector-empty" className="text-[13px] text-ink-faint">
        Pick somebody to see what they may do and what they may spend.
      </p>
    );
  }

  // §3.4: there is exactly one owner, it cannot be removed, and it cannot be demoted. Enforced
  // here so the control is coherent — and stated as being the server's job, because a disabled
  // button is a courtesy and a refusal is a rule.
  const soleOwner = isSoleOwner(user, state.users);

  return (
    <div data-testid="user-inspector" className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
      <SectionLabel>Person</SectionLabel>
      <div className="flex items-center gap-2.5">
        <Avatar name={user.displayName} muted={user.disabled} size={34} />
        <div className="min-w-0">
          <div className="truncate text-[17px] text-ink">{user.displayName}</div>
          <div className="truncate text-[12px] text-ink-ghost">{user.email}</div>
        </div>
      </div>

      <Divider />

      <SectionLabel>Role</SectionLabel>
      <select
        data-testid="role-select"
        aria-label="Role"
        value={user.role}
        disabled={soleOwner}
        onChange={(e) => updateUser(user.id, { role: e.target.value as Role })}
        className="rounded-md border border-border bg-transparent px-2.5 py-2 text-[14px] text-ink focus:border-border-strong focus:outline-none disabled:text-ink-faint"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <p className="text-[12px] leading-snug text-ink-faint">
        Three roles, each a superset of the one below. An <span className="text-ink-muted">owner</span>{" "}
        does everything and there is exactly one; an{" "}
        <span className="text-ink-muted">approver</span> settles other people's restricted requests;
        a <span className="text-ink-muted">member</span> works inside what they have been granted
        and can approve nothing.
        {soleOwner ? " This is the only owner, so the role cannot be changed here." : ""}
      </p>
      <p className="text-[11px] leading-snug text-ink-ghost">
        The wireframe names these Owner, User and Guest, and puts approval on a switch rather than
        on a rank. This follows the loop document instead, because the merge gate and the approval
        queue both need the word "approver" to mean a rank. A read-only guest has no equivalent
        yet, and it needs a sign-in before it means anything.
      </p>

      <Divider />

      <SectionLabel>May create agents with</SectionLabel>
      <div className="flex flex-col gap-3">
        {CAPABILITY_KEYS.map((key) => {
          const meta = CAPABILITIES[key];
          return (
            <div key={key} className="flex items-start gap-2.5">
              <div className="pt-0.5">
                <Toggle
                  checked={user.capabilities[key]}
                  label={meta.label}
                  onChange={(next) => setCapability(user.id, key, next)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14px] text-ink-muted">{meta.label}</span>
                  {meta.price ? (
                    <span className="font-mono text-[11px] text-ink-faint">{meta.price}</span>
                  ) : (
                    <span className="font-mono text-[11px] text-status-waiting">irreversible</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-ghost">{meta.note}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-ink-faint">
        This is what this person may hand to an agent they create — not what an agent already holds.
        Two rules belong to the server and neither is written yet: nobody may grant a capability
        they do not hold themselves, and raising a grant is a restricted action that waits for an
        approver.
      </p>

      <Divider />

      <SectionLabel>Budget</SectionLabel>
      <div className="flex items-center gap-2.5">
        <div className="flex items-center rounded-md border border-border px-2 py-1.5 focus-within:border-border-strong">
          <span aria-hidden="true" className="font-mono text-[13px] text-ink-ghost">
            $
          </span>
          <input
            data-testid="budget-input"
            aria-label="Monthly budget in dollars"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={user.budgetUsd ?? ""}
            placeholder="none"
            onChange={(e) =>
              updateUser(user.id, {
                // An empty field means no cap, not a cap of zero. A zero cap and an absent cap are
                // different intentions and the product must not silently convert one into the
                // other — a $0 cap is "this person may spend nothing", which is a real thing
                // somebody might mean.
                budgetUsd: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)),
              })
            }
            className="w-24 bg-transparent px-1 font-mono text-[13px] text-ink placeholder:text-ink-ghost focus:outline-none"
          />
        </div>
        <span className="text-[13px] text-ink-faint">a month</span>
      </div>
      <UnmeasuredSpend />
      <p className="text-[12px] leading-snug text-ink-faint">
        A cap is written down here and nothing reads it. Budgets are enforced at three scopes —
        agent, task and project — and a person is not one of them, and the spend a cap would be
        checked against is not measured. Both have to land before this number can stop anything.
      </p>
      <p className="text-[11px] leading-snug text-ink-ghost">
        Until then the switches above are the control that works. Withholding{" "}
        <span className="text-ink-faint">video</span> is worth more than any figure in this box:{" "}
        {CAPABILITIES.video.price} is what it costs when it runs, and{" "}
        {usd(5.52)} is a sixty-second experience.
      </p>

      <Divider />

      <SectionLabel>Access</SectionLabel>
      <button
        type="button"
        data-testid="disable-toggle"
        disabled={soleOwner}
        onClick={() => updateUser(user.id, { disabled: !user.disabled })}
        className="rounded-md border border-border px-3 py-2 text-[13px] text-ink-muted hover:bg-surface-hover disabled:text-ink-ghost disabled:hover:bg-transparent"
      >
        {user.disabled ? "Enable this person" : "Disable this person"}
      </button>
      <p className="text-[12px] leading-snug text-ink-faint">
        Disabling keeps the person and takes away the access. There is no delete, because their
        approvals and anything they published have to stay attributable to somebody — deleting the
        record orphans them.
        {soleOwner ? " The only owner cannot be disabled." : ""}
      </p>

      <NotBuilt
        what="Remove from the workspace"
        because={
          "The wireframe offers it. Removing a principal orphans every approval and published " +
          "post it authorised, which is irreversible, so it is a decision for the owner rather " +
          "than a button on a panel."
        }
        closedBy="loops/08-users-and-x.md §7 — stop and ask"
      />

      <div className="pb-1 pt-1">
        <p className="text-[11px] leading-snug text-ink-ghost">
          Changes here apply as you make them, to this browser tab. There is no{" "}
          <span className="font-mono">/api/users</span> to save them to yet. Nothing on this panel
          changes what anybody is permitted to do — see the banner.
        </p>
      </div>

      <div className="flex items-baseline gap-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
          Cap authorised
        </span>
        <Money>{user.budgetUsd === undefined ? "none" : usd(user.budgetUsd)}</Money>
      </div>
    </div>
  );
}

/** The INSPECTOR slot. Hook-free at the call site — see the note on `UsersPageMain`. */
export const UsersPageInspector = (props: WorkspacePageProps) => <Inspector {...props} />;
