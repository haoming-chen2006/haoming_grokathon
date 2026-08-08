/**
 * The honest hole — loops/07-shell.md §3.3.1.
 *
 * A slot whose component has not merged says so. It never renders an empty list, a spinner, or a
 * plausible-looking zero: an empty Assets grid and an Assets page that has not been built are two
 * different facts, and only one of them is true here.
 *
 * This is the rule `client/src/control-room/AgentCard.tsx` follows when it omits every field the
 * server did not supply, applied one level up — a missing page is stated, not faked.
 */

export function NotMergedYet({ what, branch }: { what: string; branch?: string }) {
  return (
    <div
      data-testid="not-merged-yet"
      className="flex h-full w-full items-center justify-center p-8"
    >
      <div className="max-w-sm text-center">
        <p className="text-sm text-ink">{what} is not in this build.</p>
        <p className="mt-2 text-xs text-ink-faint">
          {branch
            ? `It is built on branch ${branch}, which has not merged yet.`
            : "The branch that builds it has not merged yet."}
        </p>
      </div>
    </div>
  );
}
