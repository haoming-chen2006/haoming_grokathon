/**
 * SW-003 — where a software asset's code lives, and why it is its own repository.
 *
 * ```text
 * <project workspace root>/
 *   assets/
 *     software/
 *       <assetId>/          a git repository. Its own, not a subdirectory of ours.
 *         .git/
 *         package.json      from the template, never regenerated
 *         src/
 *         .agents/          worktrees, excluded from the app's git without touching its .gitignore
 * ```
 *
 * Each decision has a reason (§5.3):
 *
 *   - **Its own repository, not ours.** The user's app must never share history with the
 *     workspace's own source. Sharing it means an agent's branch is a branch of our product,
 *     `bun run verify` sees the user's files, and a merge conflict in their app is one in ours.
 *   - **One repository per asset**, initialised with one commit of the pristine template, so the
 *     first diff a reviewer sees is the agent's work and not the scaffold.
 *   - **Under the project workspace root**, inside the boundary 01-agents enforces and inside the
 *     tree 02-assets walks.
 *   - **Every path canonicalised before use.** An `assetId` from an HTTP request is untrusted, and
 *     `../` in an asset id is the oldest bug in this class.
 *   - **`git ls-files` is not how the app is listed.** It shows tracked files only, so a file an
 *     agent has just written is invisible until it is added. `listAppFiles` walks the directory.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "fs";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { detectScriptCommand } from "./buildRunner.ts";
import { materializeTemplate, TEMPLATE_NAME } from "./template.ts";
import { killGroup, spawnDetached } from "./processGroup.ts";

/**
 * 5 minutes. The template's 37 packages install in about three seconds warm and under a minute on
 * a cold cache over a slow link. The bound exists so a registry that has stopped answering fails
 * with a sentence the user can act on instead of holding the asset half-created (§5.4, §8).
 */
export const INSTALL_TIMEOUT_MS = 300_000;

/** Directories never walked when listing an app's files, and never shipped in an export. */
export const NOT_THE_APP = new Set(["node_modules", ".git", ".agents", "dist"]);

export interface AssetRepo {
  assetId: string;
  repoPath: string;
  /** The file a reader should open first. The template's entry point, until an agent moves it. */
  entryFile: string;
  template: string;
  created: boolean;
}

export class AssetRepoError extends Error {
  constructor(
    message: string,
    /** A single sentence for the user, with no stack trace and no command line in it (§5.7). */
    readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Resolve a path to its canonical form, following symlinks.
 *
 * Copied from `canonical` in `server/routes/repository.ts:44` rather than re-derived, on §5.3's
 * instruction, because both of its failure modes were found by a real test: on macOS `/var` is a
 * symlink to `/private/var`, so the same directory under two names compared unequal and broke every
 * repository under /var or /tmp; and `<root>/link` pointing at `/etc` starts with the root as a
 * string, so a prefix check approved operating on /etc. A path that does not exist yet cannot be
 * canonicalised, so the deepest existing ancestor is resolved and the rest appended.
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

/** Where every software asset in a workspace lives. */
export function softwareAssetsRoot(workspaceRoot: string): string {
  return join(canonical(workspaceRoot), "assets", "software");
}

/**
 * The directory for one asset, refusing an id that would leave the software assets root.
 *
 * Two checks rather than one: the id must look like an id, and the resolved path must still be
 * inside the root. The first alone would miss a symlink planted at `assets/software/<id>`; the
 * second alone would accept `..%2F..` shapes that happen to resolve inside today and confuse every
 * reader tomorrow.
 */
export function assetRepoPath(workspaceRoot: string, assetId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(assetId) || assetId.includes("..")) {
    throw new AssetRepoError(
      `Refusing asset id ${JSON.stringify(assetId)}: ids are letters, digits, dot, dash and underscore.`,
      "That app's name can't be used as a folder name.",
    );
  }
  const root = softwareAssetsRoot(workspaceRoot);
  const candidate = canonical(join(root, assetId));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new AssetRepoError(
      `Refusing asset id ${JSON.stringify(assetId)}: ${candidate} is outside ${root}.`,
      "That app's name can't be used as a folder name.",
    );
  }
  return candidate;
}

function git(args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string } {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: r.exitCode === 0, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/**
 * Create the repository for a software asset: template, install, one commit.
 *
 * The order matters and is not the obvious one. The install runs **before** the first commit so the
 * lockfile is part of it — a lockfile written afterwards is untracked, an agent's worktree contains
 * only committed files, and the build there then falls back to a package manager that did not do
 * the install (measured in iteration 2: the worktree detected `npm` while the asset was installed
 * with `bun`).
 *
 * Idempotent: an existing repository is returned untouched. Re-running the scaffold over an app an
 * agent has already edited would silently destroy its work.
 */
export async function createAssetRepo(
  workspaceRoot: string,
  assetId: string,
  { installCommand, timeoutMs = INSTALL_TIMEOUT_MS }: { installCommand?: string; timeoutMs?: number } = {},
): Promise<AssetRepo> {
  const repoPath = assetRepoPath(workspaceRoot, assetId);
  const done = (created: boolean): AssetRepo => ({
    assetId,
    repoPath,
    entryFile: "src/App.jsx",
    template: TEMPLATE_NAME,
    created,
  });

  if (existsSync(join(repoPath, ".git"))) return done(false);
  if (existsSync(repoPath) && readdirSync(repoPath).length > 0) {
    throw new AssetRepoError(
      `${repoPath} already exists and is not a repository.`,
      "There is already something in this app's folder, so it was left alone.",
    );
  }

  // Built somewhere else and moved into place, so a failed create never leaves a half-scaffolded
  // directory where the next call would find "something already there".
  const staging = `${repoPath}.creating`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    materializeTemplate(staging);
    await install(staging, installCommand, timeoutMs);

    const steps: Array<[string[], string]> = [
      [["init", "-q"], "start the app's own history"],
      [["add", "-A"], "record the starting files"],
      // Identity on the command, not in config: the workspace's git identity is the user's, and
      // the first commit of a scaffold is not something they wrote.
      [
        [
          "-c",
          "user.email=workspace@localhost",
          "-c",
          "user.name=Workspace",
          "commit",
          "-q",
          "-m",
          "The app's starting point",
        ],
        "make the first commit",
      ],
    ];
    for (const [args, what] of steps) {
      const r = git(args, staging);
      if (!r.ok) {
        throw new AssetRepoError(
          `git ${args[0]} failed in ${staging}: ${r.stderr.trim()}`,
          `The app's folder could not ${what}.`,
        );
      }
    }

    excludeWorktreesDir(staging);
    renameSync(staging, repoPath);
    return done(true);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Install the app's own dependencies.
 *
 * One attempt, no retries. A first install needs the network, and when there is none the honest
 * answer is one sentence and a stop — sixteen retries against a registry that is not there is a
 * spend of the user's time with no different outcome (§5.4).
 */
async function install(dir: string, configured: string | undefined, timeoutMs: number): Promise<void> {
  // bun, always: the workspace runs on bun, so it is the one package manager guaranteed present,
  // and it is what writes the lockfile that the first commit carries.
  const command = configured ?? "bun install";
  const started = Date.now();
  const child = spawnDetached(command, dir);
  let output = "";
  child.stdout.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr.on("data", (d: Buffer) => (output += d.toString()));

  const code = await new Promise<number>((settle) => {
    const timer = setTimeout(() => {
      killGroup(child, "SIGKILL");
      settle(-1);
    }, timeoutMs);
    child.on("close", (c: number | null) => {
      clearTimeout(timer);
      settle(c ?? -1);
    });
    child.on("error", () => {
      clearTimeout(timer);
      settle(-1);
    });
  });

  if (code !== 0) {
    const offline = /getaddrinfo|ENOTFOUND|ECONNREFUSED|network|dns|failed to resolve host/i.test(output);
    throw new AssetRepoError(
      `install failed in ${dir} after ${Date.now() - started}ms (exit ${code}): ${output.slice(-2000)}`,
      offline
        ? "This app needs to download its building blocks once, and there is no internet connection right now."
        : "The app's building blocks could not be downloaded, so it was not created.",
    );
  }
}

/**
 * Keep `.agents/` out of the app's git without touching the app's own `.gitignore`.
 *
 * The same decision `excludeAgentsDir` makes for the workspace's repositories
 * (`server/services/repository.ts:144`), for the same reason: worktrees are ours, and the user's
 * app must not carry a diff we created.
 */
function excludeWorktreesDir(repoPath: string): void {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  try {
    mkdirSync(dirname(excludePath), { recursive: true });
    const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
    if (existing.split("\n").some((line) => line.trim() === ".agents/")) return;
    appendFileSync(excludePath, `${existing === "" || existing.endsWith("\n") ? "" : "\n"}.agents/\n`);
  } catch {
    // A read-only .git is not fatal: the worktrees still work, they just show as untracked.
  }
}

/**
 * Every file that is part of the app, relative to `repoPath`, sorted.
 *
 * A real directory walk, not `git ls-files`: that lists tracked files only, so a file an agent
 * wrote a second ago is invisible until it is added, and an asset would appear to lose files at
 * exactly the moment it gained them (§5.3).
 */
export function listAppFiles(repoPath: string): string[] {
  const root = canonical(repoPath);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (NOT_THE_APP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(relative(root, full));
    }
  };
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  walk(root);
  return out.sort();
}

/** The build command an agent's worktree will use. Exported so a test can prove it is not npm. */
export function repoBuildCommand(dirPath: string): string | null {
  return detectScriptCommand(dirPath, "build")?.command ?? null;
}
