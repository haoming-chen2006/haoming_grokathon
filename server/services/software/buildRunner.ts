/**
 * SW-004 — the gate on a software asset is the build, not the agent's report.
 *
 * One deterministic check, run in the worktree, whose result is an exit code. No string matching
 * against returned HTML, no sleep-then-fetch, no model judgement: `lib/build-validator.ts` in
 * `.refs/open-lovable` sleeps 3,000 ms, fetches the sandbox URL and greps the response for
 * "Vite + React" and `id="root"`, which cannot tell "the app renders" from "the app renders an
 * empty div". We have a build command and an exit code, so we use them (§5.6).
 *
 * ## What is deliberately duplicated from testRunner.ts
 *
 * `server/services/testRunner.ts` already spawns a command in a directory with a timeout, and it is
 * owned by no worktree and may not be edited (§4 correction 2). So the shape is borrowed and the
 * build-specific part is written here, for the reconciliation pass to fold together later. Two real
 * differences, neither cosmetic:
 *
 *   - **This one is async.** `runTests` uses `spawnSync`, which blocks the event loop for the whole
 *     run. A build in the request path that freezes the server for three seconds is interference
 *     between agents, and two agents building at once is this product's first premise (SW-014).
 *   - **This one kills the process group.** `bun run build` is the parent of the process that does
 *     the work, so killing the child we spawned can leave a grandchild holding CPU and a port. §8:
 *     a child process you did not kill is still running.
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { SIGKILL_GRACE_MS, groupExists, killGroup, spawnDetached } from "./processGroup.ts";

/**
 * 5 minutes. A production build of an app this template's size finishes in under three seconds;
 * five minutes is the bound for a large app on a loaded machine, and it exists so a build that has
 * hung fails the gate rather than holding it open forever. Every path in this area has a bound and
 * a written reason for it (§8).
 */
export const DEFAULT_BUILD_TIMEOUT_MS = 300_000;

export interface DetectedCommand {
  command: string;
  /** Where the command came from, so a wrong detection is diagnosable. */
  source: "configured" | "package.json";
}

export interface BuildRunResult {
  /** Null when no build command could be found — there was nothing to run. */
  command: string | null;
  /** The build's own exit code, or -1 when the build never ran or was killed. */
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** `exitCode === 0`, and nothing else. */
  ok: boolean;
  /**
   * True when `exitCode` is the build's own. False when the build could not be run at all, or was
   * killed on the timeout — an honest unknown, which is never treated as success. The name is
   * `TaskTestRun.parsed`'s, unchanged, because the discipline is the same one (§5.6).
   */
  parsed: boolean;
  timedOut: boolean;
  /** Why the build could not be run. Present exactly when `parsed` is false. */
  unrunnable?: string;
}

/**
 * Find the build command for a directory. An explicitly configured command always wins; detection
 * is a convenience, never an override — the same rule `detectTestCommand` follows.
 */
export function detectScriptCommand(
  dirPath: string,
  script: string,
  configured?: string,
): DetectedCommand | null {
  if (configured?.trim()) return { command: configured.trim(), source: "configured" };

  const pkgPath = join(dirPath, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.[script]) return null;
    // Which runner installed this decides which one can run it. The template is installed with bun,
    // which writes bun.lock; anything else is npm's until we are told otherwise.
    const runner =
      existsSync(join(dirPath, "bun.lock")) || existsSync(join(dirPath, "bun.lockb")) ? "bun" : "npm";
    return { command: `${runner} run ${script}`, source: "package.json" };
  } catch {
    // A malformed package.json is not a reason to crash detection; it is a reason to find no
    // command, which the caller reports as an unrunnable build rather than as a failure.
    return null;
  }
}

/** The build command for a directory. */
export function detectBuildCommand(dirPath: string, configured?: string): DetectedCommand | null {
  return detectScriptCommand(dirPath, "build", configured);
}

function unrunnable(reason: string, command: string | null, durationMs = 0): BuildRunResult {
  return {
    command,
    exitCode: -1,
    stdout: "",
    stderr: "",
    durationMs,
    ok: false,
    parsed: false,
    timedOut: false,
    unrunnable: reason,
  };
}

/**
 * Run the build in `worktreePath` and report what happened.
 *
 * Both streams are captured and returned in full. Asserting an effect and discarding the evidence
 * is how a failure becomes undiagnosable — truncation is the display layer's problem, not this
 * one's (§5.6).
 */
export async function runBuild(
  worktreePath: string,
  timeoutMs: number = DEFAULT_BUILD_TIMEOUT_MS,
  { command: configured }: { command?: string } = {},
): Promise<BuildRunResult> {
  const cwd = resolve(worktreePath);
  if (!existsSync(cwd)) return unrunnable(`No such directory: ${cwd}`, null);

  const detected = detectBuildCommand(cwd, configured);
  if (!detected) {
    // Name what is missing, not just that something is. `missingSubmissionFields` earns its keep
    // in this codebase for the same reason (§4).
    return unrunnable(
      existsSync(join(cwd, "package.json"))
        ? `No build command: ${join(cwd, "package.json")} declares no "build" script, and none was configured.`
        : `No build command: there is no package.json in ${cwd}, and none was configured.`,
      null,
    );
  }

  const started = Date.now();
  return await new Promise<BuildRunResult>((settle) => {
    const child = spawnDetached(detected.command, cwd);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    // A build that ignores SIGTERM is still a build that has to stop; the escalation and the
    // reason it outlives the direct child are in processGroup.ts.
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child, "SIGTERM");
      setTimeout(() => {
        if (groupExists(child)) killGroup(child, "SIGKILL");
      }, SIGKILL_GRACE_MS).unref?.();
    }, timeoutMs);

    const finish = (exitCode: number): void => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (timedOut) {
        settle({
          command: detected.command,
          exitCode: -1,
          stdout,
          stderr,
          durationMs,
          ok: false,
          parsed: false,
          timedOut: true,
          unrunnable: `Build did not finish within ${timeoutMs}ms and was stopped.`,
        });
        return;
      }
      settle({
        command: detected.command,
        exitCode,
        stdout,
        stderr,
        durationMs,
        // `ok` is the exit code and nothing else. Not the output, not the presence of a dist
        // directory, not a model's opinion of either.
        ok: exitCode === 0,
        parsed: true,
        timedOut: false,
      });
    };

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      settle(unrunnable(`Could not start "${detected.command}": ${err.message}`, detected.command, Date.now() - started));
    });
    child.on("close", (code: number | null) => finish(code ?? -1));
  });
}
