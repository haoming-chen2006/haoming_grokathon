/**
 * Killing a child process is not killing the work.
 *
 * `bun run dev` and `bun run build` are both parents of the process that does the job — vite, in
 * each case. Signalling only the process we spawned leaves that one running, holding a port or a
 * few hundred megabytes, and upstream's manager (`lib/sandbox/sandbox-manager.ts` in
 * `.refs/open-lovable`) deletes from a `Map` and calls that termination. §8: a child process you
 * did not kill is still running.
 *
 * So every child in this area is spawned `detached` — it leads its own process group — and stopped
 * by signalling the group. Both facts have to be true together: `spawnDetached` exists so that
 * cannot be got half right.
 */

import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "child_process";

/** How long a group gets to exit after SIGTERM before it is killed harder. */
export const SIGKILL_GRACE_MS = 2_000;

/**
 * Spawn a command in its own process group, so it can be stopped as one.
 *
 * The return type promises both streams: every caller here reads the child's own output, which is
 * the error channel §5.5 chooses over scraping an iframe, and an optional stream would make every
 * one of them write a null check for a case that cannot happen.
 */
export function spawnDetached(command: string, cwd: string): ChildProcessWithoutNullStreams {
  return spawn("/bin/sh", ["-c", command], { cwd, detached: true });
}

/** Signal every process in the child's group. Silent when the group is already gone. */
export function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    process.kill(-child.pid!, signal);
  } catch {
    // Already gone, or never started. Either way there is nothing to kill.
  }
}

/** Signal 0 kills nothing; it asks whether the group still has a member. */
export function groupExists(child: ChildProcess): boolean {
  try {
    process.kill(-child.pid!, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM the group, then SIGKILL what is left after the grace period.
 *
 * The escalation deliberately outlives the direct child's exit: `/bin/sh` exiting tells us the
 * process we spawned is gone and says nothing about the vite it started. Cancelling the pending
 * SIGKILL when the child closes reads as tidy and drops the kill in exactly the case it exists for.
 * It is probed rather than fired blindly so an emptied group is not signalled, and unref'd so a
 * pending kill never holds the process open.
 */
export function terminateGroup(child: ChildProcess): void {
  killGroup(child, "SIGTERM");
  setTimeout(() => {
    if (groupExists(child)) killGroup(child, "SIGKILL");
  }, SIGKILL_GRACE_MS).unref?.();
}
