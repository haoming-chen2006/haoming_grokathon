/**
 * What the wireframe draws here, and why there is no button.
 *
 * `verifiables.md` §22.18 prohibits a control that does nothing, and loops/08-users-and-x.md §3.15
 * closes the obvious loophole: a control shown disabled, greyed, or with a "connect to enable"
 * tooltip is still a control that does nothing. The escape is not a nicer disabled state — it is
 * to stop rendering a control and render the fact instead.
 *
 * So this is not a button. It has no `onClick`, it is not focusable, and there is nothing about it
 * that rewards a click. It is a statement in the place a control will later occupy, naming what
 * would be there and what has to exist first. When the thing is built, the `<NotBuilt>` is deleted
 * and the control takes the space — which is a real edit somebody has to make, not a flag that
 * quietly flips.
 *
 * `role="note"` rather than `role="status"`: this is standing commentary on the page, not an
 * announcement of something that just happened, and a screen reader should not interrupt for it.
 */

export function NotBuilt({
  what,
  because,
  closedBy,
}: {
  /** The affordance the wireframe draws. Named as the user would name it. */
  what: string;
  /** Why it cannot work — the missing record, endpoint or credential. */
  because: string;
  /** Which stage or sibling loop delivers it. */
  closedBy?: string;
}) {
  return (
    <div
      role="note"
      data-testid={`not-built-${what.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className="rounded-md border border-dashed border-border-strong px-3 py-2.5"
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-status-waiting">
          Not built
        </span>
        <span className="text-[13px] text-ink-muted">{what}</span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-faint">{because}</p>
      {closedBy ? <p className="mt-1 text-[11px] text-ink-ghost">{closedBy}</p> : null}
    </div>
  );
}
