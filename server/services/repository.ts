import { spawnSync } from "bun";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

/** Branches an agent may never write to directly (V-011). */
export const DEFAULT_PROTECTED_BRANCHES = ["main", "master", "develop", "release"];

export class NotARepositoryError extends Error {
  readonly code = "NOT_A_REPOSITORY";
  constructor(path: string) {
    super(`Not a git repository: ${path}`);
    this.name = "NotARepositoryError";
  }
}

export class ProtectedBranchError extends Error {
  readonly code = "PROTECTED_BRANCH";
  constructor(message: string, readonly branch: string) {
    super(message);
    this.name = "ProtectedBranchError";
  }
}

export class GitCommandError extends Error {
  readonly code = "GIT_COMMAND_FAILED";
  constructor(message: string, readonly stderr: string, readonly exitCode: number) {
    super(message);
    this.name = "GitCommandError";
  }
}

export class MergeConflictError extends Error {
  readonly code = "MERGE_CONFLICT";
  constructor(message: string, readonly conflicts: string[]) {
    super(message);
    this.name = "MergeConflictError";
  }
}

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a git command. Never throws; callers decide whether a non-zero exit is fatal. */
export function git(args: string[], cwd: string): GitResult {
  try {
    const result = spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return {
      ok: result.exitCode === 0,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode ?? -1,
    };
  } catch (err) {
    return { ok: false, stdout: "", stderr: err instanceof Error ? err.message : String(err), exitCode: -1 };
  }
}

function gitOrThrow(args: string[], cwd: string, what: string): string {
  const result = git(args, cwd);
  if (!result.ok) {
    throw new GitCommandError(`${what} failed: ${result.stderr.trim() || result.stdout.trim()}`, result.stderr, result.exitCode);
  }
  return result.stdout.trim();
}

export interface ChangedFile {
  path: string;
  /** Porcelain status code, e.g. "M", "A", "D", "R", "??". */
  status: string;
  staged: boolean;
}

export interface RepositoryInfo {
  root: string;
  currentBranch: string;
  head: string;
  isClean: boolean;
  changedFiles: ChangedFile[];
  protectedBranches: string[];
}

/** V-008: open a local repository, reporting branch and status. Invalid dirs are rejected clearly. */
export function openRepository(path: string, protectedBranches = DEFAULT_PROTECTED_BRANCHES): RepositoryInfo {
  if (!existsSync(path)) throw new NotARepositoryError(path);

  const top = git(["rev-parse", "--show-toplevel"], path);
  if (!top.ok) throw new NotARepositoryError(path);
  const root = top.stdout.trim();

  const changedFiles = listChangedFiles(root);
  return {
    root,
    currentBranch: git(["rev-parse", "--abbrev-ref", "HEAD"], root).stdout.trim(),
    head: git(["rev-parse", "HEAD"], root).stdout.trim(),
    isClean: changedFiles.length === 0,
    changedFiles,
    protectedBranches,
  };
}

/** Working-tree changes, staged and unstaged, from `git status --porcelain`. */
export function listChangedFiles(cwd: string): ChangedFile[] {
  const result = git(["status", "--porcelain"], cwd);
  if (!result.ok) return [];

  return result.stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const status = line.slice(0, 2);
      // Renames read "R  old -> new"; the new path is what changed.
      const rest = line.slice(3);
      const path = rest.includes(" -> ") ? rest.split(" -> ")[1] : rest;
      return { path: path.trim(), status: status.trim(), staged: status[0] !== " " && status[0] !== "?" };
    });
}

// ------------------------------------------------------------------ worktrees

export interface AgentWorktree {
  agentId: string;
  branch: string;
  path: string;
  baseBranch: string;
  created: boolean;
}

/** Worktrees live under `.agents/` per the design document (§10 step 5). */
export function agentWorktreePath(repoRoot: string, branch: string): string {
  return join(repoRoot, ".agents", branch.replace(/\//g, "-"));
}

/**
 * Keep `.agents/` out of git without touching the repository's tracked .gitignore — the control
 * room must not create a spurious diff in the user's project.
 */
function excludeAgentsDir(repoRoot: string): void {
  const excludePath = join(repoRoot, ".git", "info", "exclude");
  try {
    mkdirSync(join(repoRoot, ".git", "info"), { recursive: true });
    const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
    if (!existing.split("\n").some((l) => l.trim() === ".agents/")) {
      appendFileSync(excludePath, `${existing.endsWith("\n") || existing === "" ? "" : "\n"}.agents/\n`);
    }
  } catch {
    // A read-only .git is not fatal — the worktree still works, it just shows as untracked.
  }
}

/**
 * V-009: give an implementation agent its own branch and worktree, so agents cannot overwrite one
 * another's changes. Idempotent — an existing worktree for the branch is reused.
 */
export function createAgentWorktree(
  repoRoot: string,
  params: { agentId: string; branch: string; baseBranch?: string },
): AgentWorktree {
  const info = openRepository(repoRoot);
  const baseBranch = params.baseBranch ?? info.currentBranch;
  const path = agentWorktreePath(info.root, params.branch);

  if (existsSync(path)) {
    return { agentId: params.agentId, branch: params.branch, path, baseBranch, created: false };
  }

  excludeAgentsDir(info.root);
  mkdirSync(join(info.root, ".agents"), { recursive: true });

  const branchExists = git(["rev-parse", "--verify", params.branch], info.root).ok;
  const args = branchExists
    ? ["worktree", "add", path, params.branch]
    : ["worktree", "add", "-b", params.branch, path, baseBranch];

  gitOrThrow(args, info.root, `Creating worktree for ${params.agentId}`);
  log(`\x1b[38;5;141m[git]\x1b[0m worktree ${params.branch} -> ${path} (${params.agentId})`);

  return { agentId: params.agentId, branch: params.branch, path, baseBranch, created: true };
}

export function listWorktrees(repoRoot: string): Array<{ path: string; branch: string; head: string }> {
  const result = git(["worktree", "list", "--porcelain"], repoRoot);
  if (!result.ok) return [];

  const entries: Array<{ path: string; branch: string; head: string }> = [];
  let current: Partial<{ path: string; branch: string; head: string }> = {};
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) entries.push(current as any);
      current = { path: line.slice(9).trim(), branch: "", head: "" };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).trim().replace("refs/heads/", "");
    } else if (line.startsWith("detached")) {
      current.branch = "(detached)";
    }
  }
  if (current.path) entries.push(current as any);
  return entries;
}

export function removeAgentWorktree(repoRoot: string, worktreePath: string, force = false): void {
  gitOrThrow(
    ["worktree", "remove", ...(force ? ["--force"] : []), worktreePath],
    repoRoot,
    `Removing worktree ${worktreePath}`,
  );
}

// ------------------------------------------------------------- diffs (V-010)

/**
 * Files this agent changed, scoped to its own branch. Uses the merge-base (`base...branch`) so
 * unrelated commits landing on the base branch are never attributed to the agent.
 */
export function agentChangedFiles(worktreePath: string, baseBranch: string): ChangedFile[] {
  const committed = git(["diff", "--name-status", `${baseBranch}...HEAD`], worktreePath);
  const files: ChangedFile[] = [];

  if (committed.ok) {
    for (const line of committed.stdout.split("\n").filter((l) => l.trim())) {
      const [status, ...rest] = line.split("\t");
      const path = rest[rest.length - 1];
      if (path) files.push({ path: path.trim(), status: status.trim(), staged: true });
    }
  }

  // Include work in progress that has not been committed yet.
  for (const file of listChangedFiles(worktreePath)) {
    if (!files.some((f) => f.path === file.path)) files.push(file);
  }

  return files;
}

export function getDiff(worktreePath: string, opts: { baseBranch?: string; file?: string } = {}): string {
  const args = ["diff"];
  if (opts.baseBranch) args.push(`${opts.baseBranch}...HEAD`);
  if (opts.file) args.push("--", opts.file);
  const result = git(args, worktreePath);
  return result.ok ? result.stdout : "";
}

// -------------------------------------------------- branch protection (V-011)

export function isProtectedBranch(branch: string, protectedBranches = DEFAULT_PROTECTED_BRANCHES): boolean {
  return protectedBranches.includes(branch);
}

/**
 * Refuse a write when the working tree sits on a protected branch. Agents work in their own
 * worktree on their own branch; landing on main means something is wrong.
 */
export function assertAgentCanWrite(
  worktreePath: string,
  agentId: string,
  protectedBranches = DEFAULT_PROTECTED_BRANCHES,
): string {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath).stdout.trim();
  if (isProtectedBranch(branch, protectedBranches)) {
    throw new ProtectedBranchError(
      `Agent "${agentId}" may not write directly to protected branch "${branch}". ` +
        `Work in an assigned worktree and request a merge.`,
      branch,
    );
  }
  return branch;
}

export interface MergeResult {
  merged: boolean;
  commit: string;
  branch: string;
  target: string;
  approvedBy: string;
}

/**
 * V-011 + V-039: merging into a protected branch requires an explicit approval. `approvedBy` is
 * mandatory — there is no code path that merges without a named approver. A conflicting merge is
 * aborted so a failed merge never leaves the target branch half-updated or marks work complete.
 */
export function mergeAgentBranch(
  repoRoot: string,
  params: { branch: string; target: string; approvedBy?: string; message?: string },
): MergeResult {
  if (!params.approvedBy) {
    throw new ProtectedBranchError(
      `Merging "${params.branch}" into "${params.target}" requires explicit approval; no approver was supplied.`,
      params.target,
    );
  }

  const originalBranch = git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot).stdout.trim();
  gitOrThrow(["checkout", params.target], repoRoot, `Checking out ${params.target}`);

  try {
    const merge = git(
      [
        "merge",
        "--no-ff",
        params.branch,
        "-m",
        params.message ?? `Merge ${params.branch} into ${params.target} (approved by ${params.approvedBy})`,
      ],
      repoRoot,
    );

    if (!merge.ok) {
      const conflicts = git(["diff", "--name-only", "--diff-filter=U"], repoRoot)
        .stdout.split("\n")
        .filter((l) => l.trim());
      // Leave the target branch exactly as it was.
      git(["merge", "--abort"], repoRoot);
      throw new MergeConflictError(
        `Merge of ${params.branch} into ${params.target} conflicted in ${conflicts.length} file(s)`,
        conflicts,
      );
    }

    return {
      merged: true,
      commit: git(["rev-parse", "HEAD"], repoRoot).stdout.trim(),
      branch: params.branch,
      target: params.target,
      approvedBy: params.approvedBy,
    };
  } finally {
    if (originalBranch && originalBranch !== params.target) {
      git(["checkout", originalBranch], repoRoot);
    }
  }
}
