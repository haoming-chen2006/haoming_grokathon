import { Hono } from "hono";
import { basename, dirname, join, resolve, sep } from "path";
import { realpathSync } from "fs";
import { getProjectStore } from "../services/projectStore";
import {
  GitCommandError,
  MergeConflictError,
  NotARepositoryError,
  ProtectedBranchError,
  agentChangedFiles,
  commitAgentWork,
  createAgentWorktree,
  getDiff,
  listWorktrees,
  mergeAgentBranch,
  openRepository,
  removeAgentWorktree,
} from "../services/repository";

export const repositoryRoutes = new Hono();

/**
 * Restrict filesystem operations to repositories this server actually manages.
 *
 * These endpoints take paths from the request and hand them to git, including `commit`, which
 * would `git add -A` in whatever directory it was given. Without this, any caller able to reach
 * the server could operate on any repository on the machine.
 */
/**
 * Resolve a path to its canonical form, following symlinks.
 *
 * Both halves of the comparison must be canonical or the guard gets it wrong in both directions:
 *
 *   - False refusals. On macOS `/var` is a symlink to `/private/var`, so a project stored as
 *     `/var/folders/x/repo` and a git worktree reported as `/private/var/folders/x/repo` are the
 *     same directory under two names. String comparison rejected the worktree, which broke the
 *     end-to-end flow for any repository under /var or /tmp.
 *   - False approvals. `<managed-repo>/link` pointing at `/etc` starts with the managed root as a
 *     string, so it passed — and git would then have operated on /etc. Canonicalising closes that.
 *
 * A path that does not exist yet cannot be canonicalised, so the deepest existing ancestor is
 * resolved and the remaining segments are appended.
 */
function canonical(path: string): string {
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

function assertManagedPath(candidate: string): string {
  const resolved = canonical(candidate);
  const roots = getProjectStore()
    .listProjects()
    .map((p) => canonical(p.repositoryPath));

  // A path is allowed when it is a managed repository or lives inside one (e.g. a worktree
  // under <repo>/.agents/). Compared with a trailing separator so "/repo-other" cannot match
  // "/repo".
  const ok = roots.some((root) => resolved === root || resolved.startsWith(root + sep));
  if (!ok) {
    throw new UnmanagedPathError(candidate);
  }
  return resolved;
}

export class UnmanagedPathError extends Error {
  readonly code = "UNMANAGED_PATH";
  constructor(path: string) {
    super(
      `Refusing to operate on "${path}": it is not inside a repository managed by this server. ` +
        `Create a project for it first.`,
    );
    this.name = "UnmanagedPathError";
  }
}

function fail(c: any, err: unknown) {
  if (err instanceof UnmanagedPathError) return c.json({ error: err.message, code: err.code }, 403);
  if (err instanceof NotARepositoryError) return c.json({ error: err.message, code: err.code }, 400);
  if (err instanceof ProtectedBranchError) {
    return c.json({ error: err.message, code: err.code, branch: err.branch }, 403);
  }
  if (err instanceof MergeConflictError) {
    return c.json({ error: err.message, code: err.code, conflicts: err.conflicts }, 409);
  }
  if (err instanceof GitCommandError) {
    return c.json({ error: err.message, code: err.code }, 500);
  }
  return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
}

/** V-008: open a local repository and report branch + status. */
repositoryRoutes.get("/info", (c) => {
  try {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(openRepository(assertManagedPath(path)));
  } catch (err) {
    return fail(c, err);
  }
});

repositoryRoutes.get("/worktrees", (c) => {
  try {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(listWorktrees(assertManagedPath(path)));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-009: give an agent its own isolated branch + worktree. */
repositoryRoutes.post("/worktrees", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.repoPath) return c.json({ error: "repoPath is required" }, 400);
    if (!body?.agentId) return c.json({ error: "agentId is required" }, 400);
    if (!body?.branch) return c.json({ error: "branch is required" }, 400);
    return c.json(
      createAgentWorktree(assertManagedPath(body.repoPath), {
        agentId: body.agentId,
        branch: body.branch,
        baseBranch: body.baseBranch,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

repositoryRoutes.delete("/worktrees", async (c) => {
  try {
    const body = await c.req.json();
    removeAgentWorktree(assertManagedPath(body.repoPath), assertManagedPath(body.worktreePath), body.force === true);
    return c.json({ success: true });
  } catch (err) {
    return fail(c, err);
  }
});

/** V-010: files this agent changed, scoped to its branch via merge-base. */
repositoryRoutes.get("/changed-files", (c) => {
  try {
    const worktree = c.req.query("worktree");
    const base = c.req.query("base") ?? "main";
    if (!worktree) return c.json({ error: "worktree is required" }, 400);
    return c.json(agentChangedFiles(assertManagedPath(worktree), base));
  } catch (err) {
    return fail(c, err);
  }
});

repositoryRoutes.get("/diff", (c) => {
  try {
    const worktree = c.req.query("worktree");
    if (!worktree) return c.json({ error: "worktree is required" }, 400);
    return c.json({
      diff: getDiff(assertManagedPath(worktree), { baseBranch: c.req.query("base") ?? undefined, file: c.req.query("file") ?? undefined }),
    });
  } catch (err) {
    return fail(c, err);
  }
});

/** Commit an agent's work on its branch so a later merge actually carries it. */
repositoryRoutes.post("/commit", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.worktree) return c.json({ error: "worktree is required" }, 400);
    if (!body?.message) return c.json({ error: "message is required" }, 400);
    return c.json(commitAgentWork(assertManagedPath(body.worktree), body.message, body.author));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-011 + V-039: merge requires an explicit named approver. */
repositoryRoutes.post("/merge", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.repoPath) return c.json({ error: "repoPath is required" }, 400);
    return c.json(
      mergeAgentBranch(assertManagedPath(body.repoPath), {
        branch: body.branch,
        target: body.target,
        approvedBy: body.approvedBy,
        message: body.message,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});
