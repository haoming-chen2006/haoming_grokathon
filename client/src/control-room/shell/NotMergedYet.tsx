/**
 * The honest hole — loops/07-shell.md §3.3.1.
 *
 * A slot with nothing mounted in it says so. It never renders an empty list, a spinner, or a
 * plausible-looking zero: an empty Assets grid and an Assets page that has not been built are two
 * different facts, and only one of them is true here.
 *
 * This is the rule `client/src/control-room/AgentCard.tsx` follows when it omits every field the
 * server did not supply, applied one level up — a missing page is stated, not faked.
 *
 * **It used to claim the branch "has not merged yet", and looking at the running app is what
 * caught it.** `06-tools-cost` HAS merged — `client/src/control-room/tools/` is in the tree — but
 * it merged a `formatCharge` helper and no panel component, so the overlay went on telling the
 * user a branch had not landed when it had. The shell can observe one thing here and not the
 * other: it knows whether a component was registered in `pages.ts`, and it cannot know what is in
 * anyone's git history. So it now states only the first, and names the branch as provenance rather
 * than as a status. Being wrong in the reassuring direction is exactly the defect this component
 * exists to prevent, one level up again.
 */

export function NotMergedYet({ what, branch }: { what: string; branch?: string }) {
  return (
    <div
      data-testid="not-merged-yet"
      className="flex h-full w-full items-center justify-center p-8"
    >
      <div className="max-w-sm text-center">
        <p className="text-sm text-ink">Nothing is mounted here yet.</p>
        <p className="mt-2 text-xs text-ink-faint">
          {branch
            ? `${what} is built on branch ${branch}, and has not been wired into this build.`
            : `${what} has not been wired into this build.`}
        </p>
      </div>
    </div>
  );
}
