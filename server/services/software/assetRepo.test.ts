/**
 * SW-003 — the app's code lives in its own repository, and an agent works in a worktree of it.
 *
 * Three of the five clauses are testable with no agent and no model: files written in one worktree
 * stay there, the asset's history is its own, and the fixture is asserted before anything runs. The
 * two that name a *session* — its `cwd`, and the files the agent itself writes — need the launch
 * path and a live agent, and are held rather than approximated with a double (§9).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  AssetRepoError,
  assetRepoPath,
  canonical,
  createAssetRepo,
  listAppFiles,
  repoBuildCommand,
  softwareAssetsRoot,
} from "./assetRepo.ts";
import { runBuild } from "./buildRunner.ts";
import { createAgentWorktree } from "../repository.ts";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const evidence: string[] = [];
const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

/** A workspace that is itself a git repository, which is the case that could go wrong. */
let workspace = "";
let asset: Awaited<ReturnType<typeof createAssetRepo>>;

beforeAll(async () => {
  workspace = tempDir("software-workspace-");
  git(["init", "-q"], workspace);
  writeFileSync(join(workspace, "workspace-file.txt"), "the workspace's own source\n");
  git(["add", "-A"], workspace);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "workspace"], workspace);

  asset = await createAssetRepo(workspace, "deck-picker");
  evidence.push(`created ${asset.repoPath}`);
}, 300_000);

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  if (evidence.length) log(`[SW-003] ${evidence.join(" · ")}`);
});

describe("an asset repository is the app's own (SW-003)", () => {
  test("it is created under the workspace, with one commit of the template", () => {
    expect(asset.created).toBe(true);
    expect(asset.repoPath).toBe(join(softwareAssetsRoot(workspace), "deck-picker"));
    expect(existsSync(join(asset.repoPath, ".git"))).toBe(true);

    const log = git(["log", "--oneline"], asset.repoPath).split("\n");
    expect(log).toHaveLength(1);
    expect(log[0]).toContain("The app's starting point");
  });

  test("the first commit carries the lockfile, so a worktree builds with the same runner", () => {
    // The finding this exists for: `bun install` writes bun.lock, and a lockfile written after the
    // commit is untracked — an agent's worktree has only committed files, so its build fell back to
    // npm while the asset had been installed with bun. Installing before committing fixes it, and
    // this is the assertion that keeps it fixed.
    const tracked = git(["ls-files"], asset.repoPath).split("\n");
    expect(tracked).toContain("bun.lock");
    expect(tracked).toContain("package.json");
    expect(tracked).toContain("src/App.jsx");
    expect(repoBuildCommand(asset.repoPath)).toBe("bun run build");
  });

  test("node_modules and build output are installed but never committed", () => {
    expect(existsSync(join(asset.repoPath, "node_modules", "vite"))).toBe(true);
    const tracked = git(["ls-files"], asset.repoPath).split("\n");
    expect(tracked.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(tracked.some((f) => f.startsWith("dist/"))).toBe(false);
    // Nothing uncommitted either: the first diff a reviewer sees must be the agent's work.
    expect(git(["status", "--porcelain"], asset.repoPath)).toBe("");
  });

  test("the app builds before any agent has touched it", async () => {
    // Asserted before the model runs, so a later failure lands on the fixture or on the agent and
    // is attributable either way (§8).
    const result = await runBuild(asset.repoPath);
    expect({ ok: result.ok, command: result.command }).toEqual({ ok: true, command: "bun run build" });
    evidence.push(`fresh asset builds via ${result.command}`);
  }, 120_000);

  test("its history is its own, and the workspace's history knows nothing of it", () => {
    const assetHead = git(["rev-parse", "HEAD"], asset.repoPath);
    const workspaceHead = git(["rev-parse", "HEAD"], workspace);
    expect(assetHead).not.toBe(workspaceHead);

    // The workspace repository has one commit, its own, and no file of the app in it.
    expect(git(["log", "--oneline"], workspace).split("\n")).toHaveLength(1);
    expect(git(["ls-files"], workspace)).toBe("workspace-file.txt");
    expect(git(["rev-parse", "--show-toplevel"], asset.repoPath)).toBe(canonical(asset.repoPath));
    evidence.push(`asset HEAD ${assetHead.slice(0, 7)} vs workspace HEAD ${workspaceHead.slice(0, 7)}`);
  });

  test("creating it twice returns the existing repository rather than re-scaffolding", async () => {
    const again = await createAssetRepo(workspace, "deck-picker");
    expect(again.created).toBe(false);
    expect(again.repoPath).toBe(asset.repoPath);
    expect(git(["log", "--oneline"], asset.repoPath).split("\n")).toHaveLength(1);
  }, 120_000);
});

describe("two agents in two worktrees of one app (SW-003)", () => {
  test("a file written in one worktree is in neither the sibling nor the app's main branch", () => {
    const first = createAgentWorktree(asset.repoPath, { agentId: "a1", branch: "agent/a1" });
    const second = createAgentWorktree(asset.repoPath, { agentId: "a2", branch: "agent/a2" });
    expect(first.path).not.toBe(second.path);

    writeFileSync(join(first.path, "src", "DeckList.jsx"), "export default function DeckList() {}\n");

    expect(existsSync(join(first.path, "src", "DeckList.jsx"))).toBe(true);
    expect(existsSync(join(second.path, "src", "DeckList.jsx"))).toBe(false);
    expect(existsSync(join(asset.repoPath, "src", "DeckList.jsx"))).toBe(false);
    expect(git(["ls-files"], asset.repoPath).split("\n")).not.toContain("src/DeckList.jsx");

    // The worktrees themselves are not a diff in the user's app.
    expect(git(["status", "--porcelain"], asset.repoPath)).toBe("");

    // And the worktree builds with the runner that did the install, because the lockfile is in the
    // commit the worktree branched from. This is the whole point of installing before committing.
    expect(repoBuildCommand(first.path)).toBe("bun run build");
    evidence.push("two worktrees, one file, no leakage");
  });

  test("a file the agent has not added yet is still part of the app", () => {
    // `git ls-files` would not list it, which is why listAppFiles walks the directory: an asset
    // must not appear to lose files at the moment it gains them (§5.3).
    const worktree = join(asset.repoPath, ".agents", "agent-a1");
    writeFileSync(join(worktree, "src", "Fresh.jsx"), "export default function Fresh() {}\n");
    const files = listAppFiles(worktree);
    expect(files).toContain("src/Fresh.jsx");
    expect(git(["ls-files"], worktree).split("\n")).not.toContain("src/Fresh.jsx");

    // And the directories that are not the app are not listed. `.git` in a worktree is a *file*
    // pointing back at the main repository, not a directory — and `.gitignore` is the app's own,
    // so the exclusion is by exact name and path prefix, never by "starts with .git".
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files.some((f) => f === ".git" || f.startsWith(".git/"))).toBe(false);
    expect(files.some((f) => f.startsWith(".agents/"))).toBe(false);
    expect(files).toContain("package.json");
    expect(files).toContain(".gitignore");
  });

  test("listing an app that does not exist is empty, not an exception", () => {
    expect(listAppFiles(join(tmpdir(), "software-no-such-app-4b1"))).toEqual([]);
  });
});

describe("an asset id from a request is untrusted (SW-003)", () => {
  test("an id that would leave the software assets root is refused", () => {
    for (const bad of ["../escape", "..", "a/../../b", "/etc/passwd", "sub/dir", "", ".hidden"]) {
      expect(() => assetRepoPath(workspace, bad)).toThrow(AssetRepoError);
    }
    // The refusal the user sees says nothing about paths.
    try {
      assetRepoPath(workspace, "../escape");
    } catch (error) {
      expect((error as AssetRepoError).userMessage).toBe("That app's name can't be used as a folder name.");
    }
  });

  test("an ordinary id resolves inside the root", () => {
    for (const good of ["deck-picker", "a", "app.2", "A_B-1"]) {
      expect(assetRepoPath(workspace, good).startsWith(softwareAssetsRoot(workspace))).toBe(true);
    }
  });

  test("a symlink is followed before the path is judged, in both directions", () => {
    // Both halves of the comparison are canonicalised, or the guard is wrong in both directions:
    // on macOS /var is a symlink to /private/var, and a repository under a symlinked root compared
    // unequal to itself; and a link inside the root pointing outside it passed a prefix check.
    const elsewhere = tempDir("software-elsewhere-");
    const link = join(softwareAssetsRoot(workspace), "linked-out");
    mkdirSync(softwareAssetsRoot(workspace), { recursive: true });
    symlinkSync(elsewhere, link);
    expect(() => assetRepoPath(workspace, "linked-out")).toThrow(/outside/);

    // The false-refusal half: tmpdir() on macOS is under /var, a symlink to /private/var. The
    // workspace path we were handed and the path git reports are the same directory by two names.
    expect(canonical(workspace)).toBe(canonical(canonical(workspace)));
    expect(assetRepoPath(workspace, "deck-picker")).toBe(canonical(asset.repoPath));
  });
});

describe("creating an app when it cannot be installed (SW-003, SW-012)", () => {
  test("a failed install leaves no half-made app, and says one plain sentence", async () => {
    const ws = tempDir("software-workspace-offline-");
    // Stands in for "there is no network": one attempt, one failure, no retries.
    const failing = createAssetRepo(ws, "no-network", {
      installCommand: "echo 'error: failed to resolve host registry.npmjs.org' >&2; exit 1",
    });
    await expect(failing).rejects.toThrow(AssetRepoError);

    try {
      await createAssetRepo(ws, "no-network-2", {
        installCommand: "echo 'getaddrinfo ENOTFOUND registry.npmjs.org' >&2; exit 1",
      });
      throw new Error("expected the create to fail");
    } catch (error) {
      expect((error as AssetRepoError).userMessage).toBe(
        "This app needs to download its building blocks once, and there is no internet connection right now.",
      );
    }

    // Nothing half-scaffolded is left where the next attempt would trip over it.
    const root = softwareAssetsRoot(ws);
    expect(existsSync(root) ? readdirSync(root) : []).toEqual([]);
  }, 60_000);

  test("an install that hangs is stopped by the timeout rather than waited on forever", async () => {
    const ws = tempDir("software-workspace-hang-");
    const started = Date.now();
    await expect(
      createAssetRepo(ws, "hangs", { installCommand: "sleep 60", timeoutMs: 1_200 }),
    ).rejects.toThrow(AssetRepoError);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});

describe("what SW-003 does not yet prove", () => {
  test("the session clauses are held, not approximated", () => {
    // "the agent's session cwd is its worktree" and "files it writes appear in its worktree" are
    // claims about a live ACP session, which needs the launch path (§6 stage 1.4). Testing them
    // against a stub would record a PASS on evidence about our own double (§9). The fixture above
    // is what those clauses will be asserted on top of, and it is asserted first on purpose.
    expect(existsSync(join(asset.repoPath, ".agents"))).toBe(true);
    expect(readFileSync(join(asset.repoPath, ".git", "info", "exclude"), "utf8")).toContain(".agents/");
  });
});
