import { spawnSync } from "bun";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Detecting, running and parsing project tests (V-034, V-035).
 *
 * Counts are parsed from real runner output rather than inferred from the exit code, because
 * "exit 0" and "22 of 22 passed" are different claims — a suite that ran nothing also exits 0.
 */

export interface TestCommand {
  command: string;
  /** Where the command came from, so a wrong detection is diagnosable. */
  source: "configured" | "package.json" | "makefile" | "pytest" | "go" | "cargo";
}

export interface TestRunResult {
  command: string;
  exitCode: number;
  passed: number;
  failed: number;
  total: number;
  /** True when counts were parsed from output; false when only the exit code was available. */
  parsed: boolean;
  output: string;
  durationMs: number;
}

/**
 * Find a project's test command. An explicitly configured command always wins — detection is a
 * convenience, never an override.
 */
export function detectTestCommand(repoPath: string, configured?: string): TestCommand | null {
  if (configured?.trim()) return { command: configured.trim(), source: "configured" };

  const pkgPath = join(repoPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test) {
        const runner = existsSync(join(repoPath, "bun.lock")) || existsSync(join(repoPath, "bun.lockb"))
          ? "bun"
          : "npm";
        return { command: `${runner} run test`, source: "package.json" };
      }
    } catch {
      // A malformed package.json is not a reason to crash detection.
    }
  }

  if (existsSync(join(repoPath, "pytest.ini")) || existsSync(join(repoPath, "pyproject.toml"))) {
    return { command: "pytest", source: "pytest" };
  }
  if (existsSync(join(repoPath, "go.mod"))) return { command: "go test ./...", source: "go" };
  if (existsSync(join(repoPath, "Cargo.toml"))) return { command: "cargo test", source: "cargo" };
  if (existsSync(join(repoPath, "Makefile"))) {
    const mk = readFileSync(join(repoPath, "Makefile"), "utf8");
    if (/^test:/m.test(mk)) return { command: "make test", source: "makefile" };
  }
  return null;
}

interface Counts {
  passed: number;
  failed: number;
  total: number;
}

/**
 * Parse counts from common runner output. Ordered most-specific first; the first pattern that
 * yields a coherent result wins.
 */
export function parseTestOutput(output: string): Counts | null {
  const text = output.replace(/\[[0-9;]*m/g, ""); // strip ANSI

  // bun test: " 12 pass\n 0 fail"
  const bunPass = text.match(/^\s*(\d+)\s+pass\s*$/m);
  const bunFail = text.match(/^\s*(\d+)\s+fail\s*$/m);
  if (bunPass && bunFail) {
    const passed = Number(bunPass[1]);
    const failed = Number(bunFail[1]);
    return { passed, failed, total: passed + failed };
  }

  // vitest / jest: "Tests  2 failed | 10 passed (12)"
  const vitest = text.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s*\((\d+)\)/);
  if (vitest) {
    const failed = Number(vitest[1] ?? 0);
    return { passed: Number(vitest[2]), failed, total: Number(vitest[3]) };
  }

  // jest summary: "Tests:       1 failed, 3 passed, 4 total"
  const jest = text.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed,\s*(\d+)\s+total/);
  if (jest) {
    return { passed: Number(jest[3]), failed: Number(jest[1] ?? 0), total: Number(jest[4]) };
  }

  // pytest: "=== 2 failed, 10 passed in 1.2s ===" (either part may be absent)
  const pyFailed = text.match(/(\d+)\s+failed/);
  const pyPassed = text.match(/(\d+)\s+passed/);
  if (pyFailed || pyPassed) {
    const passed = Number(pyPassed?.[1] ?? 0);
    const failed = Number(pyFailed?.[1] ?? 0);
    if (passed + failed > 0) return { passed, failed, total: passed + failed };
  }

  // go test: count PASS/FAIL lines
  const goPass = (text.match(/^--- PASS/gm) ?? []).length;
  const goFail = (text.match(/^--- FAIL/gm) ?? []).length;
  if (goPass + goFail > 0) return { passed: goPass, failed: goFail, total: goPass + goFail };

  return null;
}

/** Run a test command in a working directory and parse the result. */
export function runTests(cwd: string, command: string, timeoutMs = 600_000): TestRunResult {
  const started = Date.now();
  const result = spawnSync(["/bin/sh", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });

  const output = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`;
  const exitCode = result.exitCode ?? -1;
  const counts = parseTestOutput(output);

  if (counts) {
    return { command, exitCode, ...counts, parsed: true, output, durationMs: Date.now() - started };
  }

  // No parseable counts. Report zero totals rather than inventing a "1 passed" from exit 0 —
  // a fabricated count is worse than an honest unknown (§22.18).
  return {
    command,
    exitCode,
    passed: 0,
    failed: exitCode === 0 ? 0 : 1,
    total: 0,
    parsed: false,
    output,
    durationMs: Date.now() - started,
  };
}

/** Tests pass only when something actually ran and nothing failed. */
export function testsPassed(result: TestRunResult): boolean {
  if (!result.parsed) return false; // unknown is not success
  return result.failed === 0 && result.total > 0 && result.passed === result.total;
}
