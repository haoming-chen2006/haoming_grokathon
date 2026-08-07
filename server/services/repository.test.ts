import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  MergeConflictError,
  NotARepositoryError,
  ProtectedBranchError,
  agentChangedFiles,
  commitAgentWork,
  agentWorktreePath,
  assertAgentCanWrite,
  createAgentWorktree,
  getDiff,
  git,
  isProtectedBranch,
  listChangedFiles,
  listWorktrees,
  mergeAgentBranch,
  openRepository,
  removeAgentWorktree,
} from "./repository";

let repo: string;

/** A real git repository — worktree isolation cannot be honestly verified against a mock. */
function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "openui-repo-"));
  git(["init", "-b", "main"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# Test repo\n");
  writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
  git(["add", "."], dir);
  git(["commit", "-m", "initial"], dir);
  return dir;
}

beforeEach(() => {
  repo = initRepo();
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("V-008: repository can be opened", () => {
  test("reports root, base branch and clean status", () => {
    const info = openRepository(repo);
    expect(info.currentBranch).toBe("main");
    expect(info.isClean).toBe(true);
    expect(info.changedFiles).toHaveLength(0);
    expect(info.head).toMatch(/^[0-9a-f]{40}$/);
    expect(info.root).toBeTruthy();
  });

  test("reports changed files once the tree is dirty", () => {
    writeFileSync(join(repo, "app.ts"), "export const x = 2;\n");
    writeFileSync(join(repo, "new.ts"), "export const y = 1;\n");
    const info = openRepository(repo);

    expect(info.isClean).toBe(false);
    const paths = info.changedFiles.map((f) => f.path);
    expect(paths).toContain("app.ts");
    expect(paths).toContain("new.ts");
    expect(info.changedFiles.find((f) => f.path === "app.ts")!.status).toBe("M");
    expect(info.changedFiles.find((f) => f.path === "new.ts")!.status).toBe("??");
  });

  test("rejects a non-repository directory clearly", () => {
    const plain = mkdtempSync(join(tmpdir(), "openui-plain-"));
    try {
      expect(() => openRepository(plain)).toThrow(NotARepositoryError);
      expect(() => openRepository(plain)).toThrow(/Not a git repository/);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("rejects a path that does not exist", () => {
    expect(() => openRepository(join(tmpdir(), "definitely-missing-xyz"))).toThrow(NotARepositoryError);
  });
});

describe("V-009: agent worktrees are isolated", () => {
  test("each agent gets its own branch and worktree", () => {
    const backend = createAgentWorktree(repo, { agentId: "backend-agent", branch: "agent/auth-backend" });
    const frontend = createAgentWorktree(repo, { agentId: "frontend-agent", branch: "agent/auth-frontend" });

    expect(backend.created).toBe(true);
    expect(frontend.created).toBe(true);
    expect(backend.path).not.toBe(frontend.path);
    expect(existsSync(backend.path)).toBe(true);
    expect(existsSync(frontend.path)).toBe(true);
    expect(backend.path).toBe(agentWorktreePath(openRepository(repo).root, "agent/auth-backend"));

    const worktrees = listWorktrees(repo);
    expect(worktrees.map((w) => w.branch)).toContain("agent/auth-backend");
    expect(worktrees.map((w) => w.branch)).toContain("agent/auth-frontend");
  });

  test("one agent's changes do not appear in another's worktree", () => {
    const backend = createAgentWorktree(repo, { agentId: "backend-agent", branch: "agent/backend" });
    const frontend = createAgentWorktree(repo, { agentId: "frontend-agent", branch: "agent/frontend" });

    writeFileSync(join(backend.path, "session.ts"), "export const session = true;\n");
    git(["add", "."], backend.path);
    git(["commit", "-m", "backend work"], backend.path);

    // The isolation claim, checked directly on disk.
    expect(existsSync(join(backend.path, "session.ts"))).toBe(true);
    expect(existsSync(join(frontend.path, "session.ts"))).toBe(false);

    // And the frontend worktree is still clean.
    expect(listChangedFiles(frontend.path)).toHaveLength(0);
  });

  test("worktree creation is idempotent", () => {
    const first = createAgentWorktree(repo, { agentId: "a", branch: "agent/x" });
    const second = createAgentWorktree(repo, { agentId: "a", branch: "agent/x" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
  });

  test("the .agents directory is excluded without touching the tracked .gitignore", () => {
    createAgentWorktree(repo, { agentId: "a", branch: "agent/x" });

    const exclude = readFileSync(join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain(".agents/");

    // The repository's own .gitignore must not have been modified.
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    // And the worktree must not show up as an untracked change.
    expect(openRepository(repo).changedFiles.map((f) => f.path)).not.toContain(".agents/");
  });

  test("a worktree can be removed", () => {
    const wt = createAgentWorktree(repo, { agentId: "a", branch: "agent/x" });
    removeAgentWorktree(repo, wt.path, true);
    expect(existsSync(wt.path)).toBe(false);
  });
});

describe("V-010: changed files and diffs are displayed", () => {
  test("changed files are scoped to the agent's own branch", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });

    writeFileSync(join(wt.path, "session.ts"), "export const s = 1;\n");
    writeFileSync(join(wt.path, "app.ts"), "export const x = 99;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "backend work"], wt.path);

    const changed = agentChangedFiles(wt.path, "main").map((f) => f.path);
    expect(changed).toContain("session.ts");
    expect(changed).toContain("app.ts");
    expect(changed).not.toContain("README.md");
  });

  test("unrelated commits on the base branch are not attributed to the agent", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });

    // Agent's own work.
    writeFileSync(join(wt.path, "session.ts"), "export const s = 1;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "agent work"], wt.path);

    // Somebody else lands an unrelated change on main afterwards.
    writeFileSync(join(repo, "unrelated.ts"), "export const u = 1;\n");
    git(["add", "."], repo);
    git(["commit", "-m", "unrelated main work"], repo);

    // Using base...HEAD (merge-base) means main's new commit is NOT the agent's change.
    const changed = agentChangedFiles(wt.path, "main").map((f) => f.path);
    expect(changed).toContain("session.ts");
    expect(changed).not.toContain("unrelated.ts");
  });

  test("uncommitted work in progress is still reported", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });
    writeFileSync(join(wt.path, "wip.ts"), "// in progress\n");
    expect(agentChangedFiles(wt.path, "main").map((f) => f.path)).toContain("wip.ts");
  });

  test("a diff can be inspected", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });
    writeFileSync(join(wt.path, "app.ts"), "export const x = 42;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "change x"], wt.path);

    const diff = getDiff(wt.path, { baseBranch: "main" });
    expect(diff).toContain("app.ts");
    expect(diff).toContain("+export const x = 42;");
    expect(diff).toContain("-export const x = 1;");

    expect(getDiff(wt.path, { baseBranch: "main", file: "app.ts" })).toContain("app.ts");
  });
});

describe("V-011: main branch is protected", () => {
  test("identifies protected branches", () => {
    expect(isProtectedBranch("main")).toBe(true);
    expect(isProtectedBranch("master")).toBe(true);
    expect(isProtectedBranch("agent/auth-backend")).toBe(false);
    expect(isProtectedBranch("custom", ["custom"])).toBe(true);
  });

  test("an agent sitting on main is refused a write", () => {
    let caught: unknown;
    try {
      assertAgentCanWrite(repo, "backend-agent");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProtectedBranchError);
    expect((caught as ProtectedBranchError).branch).toBe("main");
    expect((caught as Error).message).toContain("may not write directly");
  });

  test("an agent in its own worktree may write", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend" });
    expect(assertAgentCanWrite(wt.path, "backend")).toBe("agent/backend");
  });

  test("merging without an approver is refused", () => {
    createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend" });
    expect(() => mergeAgentBranch(repo, { branch: "agent/backend", target: "main" })).toThrow(
      ProtectedBranchError,
    );
    expect(() => mergeAgentBranch(repo, { branch: "agent/backend", target: "main" })).toThrow(
      /requires explicit approval/,
    );
  });

  test("an approved merge lands and records the commit", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });
    writeFileSync(join(wt.path, "session.ts"), "export const s = 1;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "backend work"], wt.path);

    const result = mergeAgentBranch(repo, {
      branch: "agent/backend",
      target: "main",
      approvedBy: "user",
    });

    expect(result.merged).toBe(true);
    expect(result.approvedBy).toBe("user");
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    // The work is genuinely on main now.
    expect(git(["show", "main:session.ts"], repo).stdout).toContain("export const s = 1;");
  });

  test("rejected work stays isolated on its own branch", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/rejected", baseBranch: "main" });
    writeFileSync(join(wt.path, "bad.ts"), "export const bad = true;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "rejected work"], wt.path);

    // No merge is performed — the file must not exist on main.
    expect(git(["show", "main:bad.ts"], repo).ok).toBe(false);
    // But it is still recoverable from the agent's branch (V-051).
    expect(git(["show", "agent/rejected:bad.ts"], repo).stdout).toContain("bad = true");
  });

  test("a conflicting merge aborts and leaves the target untouched", () => {
    const wt = createAgentWorktree(repo, { agentId: "backend", branch: "agent/conflict", baseBranch: "main" });

    writeFileSync(join(wt.path, "app.ts"), "export const x = 111;\n");
    git(["add", "."], wt.path);
    git(["commit", "-m", "agent edit"], wt.path);

    writeFileSync(join(repo, "app.ts"), "export const x = 222;\n");
    git(["add", "."], repo);
    git(["commit", "-m", "main edit"], repo);

    const headBefore = git(["rev-parse", "main"], repo).stdout.trim();

    let caught: unknown;
    try {
      mergeAgentBranch(repo, { branch: "agent/conflict", target: "main", approvedBy: "user" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(MergeConflictError);
    expect((caught as MergeConflictError).conflicts).toContain("app.ts");
    // A failed merge must not advance main, and must not leave it mid-merge.
    expect(git(["rev-parse", "main"], repo).stdout.trim()).toBe(headBefore);
    expect(git(["show", "main:app.ts"], repo).stdout).toContain("222");
    expect(existsSync(join(repo, ".git", "MERGE_HEAD"))).toBe(false);
  });
});

describe("committing agent work (found by V-052)", () => {
  test("commits working-tree changes on the agent's branch", () => {
    const wt = createAgentWorktree(repo, { agentId: "a", branch: "agent/c", baseBranch: "main" });
    writeFileSync(join(wt.path, "impl.ts"), "export const done = true;\n");

    const result = commitAgentWork(wt.path, "Implement it");
    expect(result.committed).toBe(true);
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.files).toContain("impl.ts");
    expect(listChangedFiles(wt.path)).toHaveLength(0);
  });

  test("reports nothing to commit rather than creating an empty commit", () => {
    const wt = createAgentWorktree(repo, { agentId: "a", branch: "agent/empty", baseBranch: "main" });
    const result = commitAgentWork(wt.path, "nothing");
    expect(result.committed).toBe(false);
    expect(result.reason).toContain("No changes");
  });

  test("merging a branch with no commits ahead is refused", () => {
    // The V-052 failure: every step reported success while the code never landed, because the
    // agent's edits were never committed and the merge therefore carried nothing.
    createAgentWorktree(repo, { agentId: "a", branch: "agent/nothing", baseBranch: "main" });
    expect(() =>
      mergeAgentBranch(repo, { branch: "agent/nothing", target: "main", approvedBy: "user" }),
    ).toThrow(/nothing to merge/);
  });

  test("after committing, the merge carries the work onto the target", () => {
    const wt = createAgentWorktree(repo, { agentId: "a", branch: "agent/real", baseBranch: "main" });
    writeFileSync(join(wt.path, "landed.ts"), "export const landed = true;\n");
    commitAgentWork(wt.path, "Add landed.ts");

    const merge = mergeAgentBranch(repo, { branch: "agent/real", target: "main", approvedBy: "user" });
    expect(merge.merged).toBe(true);
    expect(git(["show", "main:landed.ts"], repo).stdout).toContain("landed = true");
  });
});
