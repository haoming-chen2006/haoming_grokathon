/**
 * The first thing on the page, and it cannot be dismissed.
 *
 * loops/08-users-and-x.md §3.1 is unambiguous: shipping a users page over a product with no
 * authentication is theatre, and a table of people with roles where every request is already the
 * fully privileged user is a control that does nothing. The page ships anyway — the owner asked
 * for it, and settling the shape of the surface before the record exists is real work — so it
 * carries the sentence that keeps it honest, at the top, permanently.
 *
 * Three decisions worth defending:
 *
 *   - **no dismiss control.** A banner you can close is a banner that is closed the second time
 *     anybody looks at the page, and the statement is true every time. The shell has a dismissible
 *     notification stack for things that happen; this is not one of those, it is what the page is.
 *   - **the detail is one click away, not hidden.** The headline is a sentence anybody can act on;
 *     the register underneath names files and line numbers, which is what makes it checkable
 *     rather than reassuring. Both audiences are real and they want different lengths.
 *   - **it is not styled as an error.** Nothing has failed. `status-waiting` is the token for
 *     "this is not finished", and the same amber the wireframe reached for.
 */
import { useState } from "react";
import { BANNER_BODY, BANNER_HEADLINE, GAPS, SCOPE_NOTE } from "./enforcement";

export function NotEnforcedBanner() {
  const [open, setOpen] = useState(false);

  return (
    <section
      data-testid="not-enforced-banner"
      aria-label="Enforcement status"
      className="border-b border-border bg-status-waiting/10"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-dashed border-status-waiting"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-ink-muted">
            <span className="font-mono text-[10px] uppercase tracking-[0.07em] text-status-waiting">
              {BANNER_HEADLINE}
            </span>
            <span aria-hidden="true" className="text-ink-ghost">
              {" — "}
            </span>
            {BANNER_BODY}
          </p>
        </div>
        <button
          type="button"
          data-testid="banner-detail-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[13px] text-ink-faint hover:bg-surface-hover"
        >
          {open ? "Hide the detail" : "What this means"}
        </button>
      </div>

      {open ? (
        <div data-testid="banner-detail" className="border-t border-border px-4 py-3.5">
          <p className="max-w-3xl text-[13px] leading-relaxed text-ink-faint">
            Each row is something this screen would have you believe, what is actually the case, and
            where to check. They are listed worst-first: without the first one, every row below it
            is decoration on decoration.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {GAPS.map((gap) => (
              <li key={gap.id} data-testid={`gap-${gap.id}`} className="max-w-3xl">
                <p className="text-[13px] text-ink-muted">{gap.assumed}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-faint">{gap.actual}</p>
                <p className="mt-1 font-mono text-[11px] leading-snug text-ink-ghost">
                  {gap.evidence}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-ghost">Closed by: {gap.closedBy}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-3xl border-t border-border pt-3 text-[12px] leading-snug text-ink-ghost">
            {SCOPE_NOTE}
          </p>
        </div>
      ) : null}
    </section>
  );
}
