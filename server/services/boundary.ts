/**
 * The area boundary — the one place that decides whether a path is inside a work area.
 *
 * Isolation used to be a git worktree: a cwd handed to the agent and nothing more. A worktree made
 * an out-of-bounds edit *recoverable*; it never *prevented* one. This module is the prevention, and
 * everything that compares a path against an area root goes through it so there is exactly one
 * implementation to get right.
 */
import { realpathSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

/**
 * Resolve a path to its canonical form, following symlinks.
 *
 * Copied deliberately from `server/routes/repository.ts` rather than re-derived: both directions of
 * this bug have actually happened, and a second implementation is a second chance to reintroduce
 * one of them. Both halves of every comparison must be canonical or the guard is wrong in both
 * directions:
 *
 *   - False refusals. On macOS `/var` is a symlink to `/private/var`, so an area stored as
 *     `/var/folders/x/area` and a path reported as `/private/var/folders/x/area` are the same
 *     directory under two names. String comparison rejects the second, which refuses a write the
 *     agent was entitled to make.
 *   - False approvals. `<area-root>/link` pointing at `/etc` starts with the area root as a string,
 *     so it passes — and the write then lands in /etc. Canonicalising closes that.
 *
 * A path that does not exist yet cannot be canonicalised, so the deepest existing ancestor is
 * resolved and the remaining segments are appended. Writes create files that do not exist yet, so
 * this branch is the common one here, not the exception.
 */
export function canonical(path: string): string {
  let head = resolve(path);
  const tail: string[] = [];
  for (;;) {
    try {
      return tail.length === 0 ? realpathSync(head) : join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) return resolve(path); // reached the root; nothing to canonicalise
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

/**
 * Is `candidate` the area root itself, or inside it?
 *
 * Canonicalises both halves before comparing — that is the whole point of the function, and the
 * reason no caller is allowed to do this comparison itself. The trailing separator matters: without
 * it `/area-other/file` starts with `/area` as a string and a sibling area would be judged inside
 * this one.
 */
export function isInsideRoot(root: string, candidate: string): boolean {
  const canonicalRoot = canonical(root);
  const canonicalCandidate = canonical(candidate);
  return canonicalCandidate === canonicalRoot || canonicalCandidate.startsWith(canonicalRoot + sep);
}
