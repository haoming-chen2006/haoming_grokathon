/**
 * SW-004 — the gate is the build, not the agent's report.
 *
 * The red fixture is asserted alongside the green one, and was written first: §8 says a build
 * validator that cannot fail on demand proves nothing, and four consecutive audits in the retired
 * product shipped with bugs in the checker rather than in the code it checked. Every build here is
 * a real one with a real exit code — the point of the item is that nothing in the path is a
 * judgement call, so there is nothing worth mocking.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DEFAULT_BUILD_TIMEOUT_MS, detectBuildCommand, runBuild, type BuildRunResult } from "./buildRunner.ts";
import { materializeTemplate } from "./template.ts";
import { createAgentWorktree } from "../repository.ts";
import { waitFor } from "../testSupport.ts";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const evidence: string[] = [];
const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function sh(cmd: string, cwd: string): void {
  const r = Bun.spawnSync(["/bin/sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd} failed in ${cwd}: ${r.stderr.toString()}`);
}

/** A repository with a build script that does exactly what the test needs, and no install. */
function fakeRepo(buildScript: string): string {
  const dir = tempDir("build-fake-");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fake", scripts: { build: buildScript } }));
  return dir;
}

// ─────────────────────────────────────────────────────── the real template, installed once

let asset = "";
let worktree = "";
let green: BuildRunResult;
let red: BuildRunResult;
let inWorktree: BuildRunResult;

beforeAll(async () => {
  asset = tempDir("build-asset-");
  materializeTemplate(asset);
  sh("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm template", asset);
  sh(`${process.execPath} install`, asset);

  green = await runBuild(asset);

  // The build in a worktree runs before the source is broken, since the worktree branches from the
  // committed template rather than from the working tree.
  worktree = createAgentWorktree(asset, { agentId: "a1", branch: "agent/a1" }).path;
  inWorktree = await runBuild(worktree);

  // The red fixture: one source file with a syntax error, nothing else changed.
  writeFileSync(join(asset, "src", "App.jsx"), "export default function App() { return <div>unclosed\n");
  red = await runBuild(asset);

  evidence.push(`green exit=${green.exitCode} in ${green.durationMs}ms`);
  evidence.push(`worktree exit=${inWorktree.exitCode} via "${inWorktree.command}" in ${inWorktree.durationMs}ms`);
  evidence.push(`red exit=${red.exitCode}`);
}, 300_000);

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  if (evidence.length) log(`[SW-004] ${evidence.join(" · ")}`);
});

describe("the build gate, against the real template (SW-004)", () => {
  test("a working app builds: exit 0, ok, and the result is the build's own", () => {
    expect({ ok: green.ok, exitCode: green.exitCode, parsed: green.parsed, timedOut: green.timedOut }).toEqual({
      ok: true,
      exitCode: 0,
      parsed: true,
      timedOut: false,
    });
    expect(green.command).toBe("bun run build");
    expect(green.durationMs).toBeGreaterThan(0);
    expect(existsSync(join(asset, "dist", "index.html"))).toBe(true);
  });

  test("a deliberately broken source file fails, and the error text is kept", () => {
    expect(red.ok).toBe(false);
    expect(red.exitCode).not.toBe(0);
    // parsed stays true: the build ran and gave its own answer. "Failed" and "could not be run"
    // are different claims and the gate has to keep them apart.
    expect(red.parsed).toBe(true);
    const output = red.stdout + red.stderr;
    expect(output).toContain("src/App.jsx");
    expect(output).toMatch(/error|Unexpected/i);
  });

  test("the build runs in an agent's worktree, off the asset's single install", () => {
    // §5.4 says node_modules is installed once per asset and asks for this to be stated plainly
    // rather than assumed: the worktree has no node_modules of its own and never gets one — the
    // build resolves upward to <asset>/node_modules, which is the worktree's ancestor.
    expect(inWorktree.ok).toBe(true);
    expect(existsSync(join(worktree, "node_modules"))).toBe(false);
    expect(existsSync(join(worktree, "dist", "index.html"))).toBe(true);
    expect(existsSync(join(asset, ".agents"))).toBe(true);

    // Observed, not wished for: this fixture commits the template and installs afterwards, so
    // `bun.lock` is untracked, a worktree — which has only committed files — does not have it, and
    // detection falls back to npm. The build works either way, but the runner that installs and the
    // runner that builds should be the same one. `createAssetRepo` installs *before* the first
    // commit for exactly this reason, and `assetRepo.test.ts` asserts a worktree of a real asset
    // gets `bun run build`. This fixture keeps the fallback itself honest.
    expect(inWorktree.command).toBe("npm run build");
    expect(existsSync(join(worktree, "bun.lock"))).toBe(false);
  });
});

describe("what the build gate refuses to call a pass (SW-004)", () => {
  test("an exit code of 1 is a failure however cheerful the output is", async () => {
    // The direct correction of `validateBuild` in .refs/open-lovable, which string-matches the
    // returned HTML: an agent that prints "Build succeeded" has not built anything.
    const result = await runBuild(fakeRepo("echo 'Build succeeded! 0 errors.'; exit 1"));
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.parsed).toBe(true);
    expect(result.stdout).toContain("Build succeeded");
  });

  test("a build that could not be run is unknown, never a pass, and names what is missing", async () => {
    const noManifest = await runBuild(tempDir("build-empty-"));
    expect({ ok: noManifest.ok, parsed: noManifest.parsed, exitCode: noManifest.exitCode }).toEqual({
      ok: false,
      parsed: false,
      exitCode: -1,
    });
    expect(noManifest.unrunnable).toContain("no package.json");

    const noScript = tempDir("build-noscript-");
    writeFileSync(join(noScript, "package.json"), JSON.stringify({ name: "x", scripts: { test: "true" } }));
    const missingScript = await runBuild(noScript);
    expect(missingScript.parsed).toBe(false);
    expect(missingScript.ok).toBe(false);
    expect(missingScript.unrunnable).toContain('no "build" script');

    const absent = await runBuild(join(tmpdir(), "software-no-such-dir-9d2f"));
    expect(absent.parsed).toBe(false);
    expect(absent.ok).toBe(false);
    expect(absent.unrunnable).toContain("No such directory");
  });

  test("a malformed package.json finds no command rather than throwing", () => {
    const dir = tempDir("build-malformed-");
    writeFileSync(join(dir, "package.json"), "{ not json");
    expect(detectBuildCommand(dir)).toBeNull();
  });

  test("a configured command wins over detection", () => {
    const dir = fakeRepo("echo detected");
    expect(detectBuildCommand(dir)?.source).toBe("package.json");
    expect(detectBuildCommand(dir, "make release")).toEqual({ command: "make release", source: "configured" });
  });
});

describe("the timeout bound (SW-004, SW-013)", () => {
  test("a build that hangs is stopped, reported as unknown, and leaves no descendant running", async () => {
    // The grandchild matters: `bun run build` spawns vite, so a runner that kills only the process
    // it spawned leaves the real work running. §8 — a child process you did not kill is still
    // running, and upstream's manager deletes from a Map and calls that termination.
    const dir = tempDir("build-hang-");
    const pidFile = join(dir, "grandchild.pid");
    const result = await runBuild(dir, 1_500, {
      command: `/bin/sh -c 'sleep 60 & echo $! > ${pidFile}; wait'`,
    });

    expect({ ok: result.ok, parsed: result.parsed, timedOut: result.timedOut }).toEqual({
      ok: false,
      parsed: false,
      timedOut: true,
    });
    expect(result.unrunnable).toContain("1500ms");
    expect(result.durationMs).toBeGreaterThanOrEqual(1_400);

    const grandchild = Number(readFileSync(pidFile, "utf8").trim());
    expect(grandchild).toBeGreaterThan(0);
    await waitFor(`grandchild ${grandchild} to be gone`, () => {
      try {
        process.kill(grandchild, 0);
        return false;
      } catch {
        return true; // ESRCH — no such process
      }
    });
    evidence.push(`timeout killed pid ${grandchild}`);
  }, 30_000);

  test("a descendant that ignores SIGTERM is killed anyway, after the grace period", async () => {
    // The escalation has to outlive the process we spawned: /bin/sh exiting says nothing about the
    // vite it started. An earlier version of this file cancelled the SIGKILL as soon as the direct
    // child closed, which reads as tidy and drops the kill in exactly the case it exists for. This
    // test is what catches that.
    const dir = tempDir("build-stubborn-");
    const pidFile = join(dir, "stubborn.pid");
    const result = await runBuild(dir, 1_000, {
      command: `/bin/sh -c 'trap "" TERM; while true; do sleep 1; done' & echo $! > ${pidFile}; wait`,
    });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);

    const stubborn = Number(readFileSync(pidFile, "utf8").trim());
    await waitFor(`SIGTERM-ignoring pid ${stubborn} to be killed`, () => {
      try {
        process.kill(stubborn, 0);
        return false;
      } catch {
        return true;
      }
    });
    evidence.push(`SIGKILL escalation reached pid ${stubborn}`);
  }, 30_000);

  test("the default bound is a written constant, not a number in a call site", () => {
    expect(DEFAULT_BUILD_TIMEOUT_MS).toBe(300_000);
    const source = readFileSync(join(import.meta.dir, "buildRunner.ts"), "utf8");
    // A bound with no stated reason is the one that gets doubled by the next person who hits it.
    expect(source).toMatch(/5 minutes\./);
  });
});
