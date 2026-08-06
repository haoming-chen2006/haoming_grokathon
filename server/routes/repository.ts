import { Hono } from "hono";
import {
  GitCommandError,
  MergeConflictError,
  NotARepositoryError,
  ProtectedBranchError,
  agentChangedFiles,
  createAgentWorktree,
  getDiff,
  listWorktrees,
  mergeAgentBranch,
  openRepository,
  removeAgentWorktree,
} from "../services/repository";

export const repositoryRoutes = new Hono();

function fail(c: any, err: unknown) {
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
    return c.json(openRepository(path));
  } catch (err) {
    return fail(c, err);
  }
});

repositoryRoutes.get("/worktrees", (c) => {
  try {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(listWorktrees(path));
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
      createAgentWorktree(body.repoPath, {
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
    removeAgentWorktree(body.repoPath, body.worktreePath, body.force === true);
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
    return c.json(agentChangedFiles(worktree, base));
  } catch (err) {
    return fail(c, err);
  }
});

repositoryRoutes.get("/diff", (c) => {
  try {
    const worktree = c.req.query("worktree");
    if (!worktree) return c.json({ error: "worktree is required" }, 400);
    return c.json({
      diff: getDiff(worktree, { baseBranch: c.req.query("base") ?? undefined, file: c.req.query("file") ?? undefined }),
    });
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
      mergeAgentBranch(body.repoPath, {
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
