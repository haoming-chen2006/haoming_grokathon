import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { detectTestCommand, parseTestOutput, runTests, testsPassed } from "./testRunner";
import { ProjectStore } from "./projectStore";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-tests-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("V-034: test commands can be configured or detected", () => {
  test("a configured command always wins over detection", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "jest" } }));
    expect(detectTestCommand(dir, "make check")).toEqual({ command: "make check", source: "configured" });
  });

  test("detects a package.json test script, choosing the right runner", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    expect(detectTestCommand(dir)).toEqual({ command: "npm run test", source: "package.json" });

    writeFileSync(join(dir, "bun.lock"), "");
    expect(detectTestCommand(dir)!.command).toBe("bun run test");
  });

  test("detects pytest, go and cargo projects", () => {
    const py = mkdtempSync(join(tmpdir(), "py-")); writeFileSync(join(py, "pytest.ini"), "");
    const go = mkdtempSync(join(tmpdir(), "go-")); writeFileSync(join(go, "go.mod"), "module x");
    const rs = mkdtempSync(join(tmpdir(), "rs-")); writeFileSync(join(rs, "Cargo.toml"), "[package]");
    try {
      expect(detectTestCommand(py)!.source).toBe("pytest");
      expect(detectTestCommand(go)!.command).toBe("go test ./...");
      expect(detectTestCommand(rs)!.command).toBe("cargo test");
    } finally {
      [py, go, rs].forEach((d) => rmSync(d, { recursive: true, force: true }));
    }
  });

  test("returns null when nothing is detectable, rather than guessing", () => {
    expect(detectTestCommand(dir)).toBeNull();
  });

  test("a malformed package.json does not crash detection", () => {
    writeFileSync(join(dir, "package.json"), "{ not json");
    expect(detectTestCommand(dir)).toBeNull();
  });
});

describe("V-034: counts are parsed from real runner output", () => {
  test("bun test", () => {
    expect(parseTestOutput(" 12 pass\n 0 fail\nRan 12 tests")).toEqual({ passed: 12, failed: 0, total: 12 });
    expect(parseTestOutput(" 10 pass\n 2 fail\n")).toEqual({ passed: 10, failed: 2, total: 12 });
  });

  test("vitest", () => {
    expect(parseTestOutput("Tests  2 failed | 10 passed (12)")).toEqual({ passed: 10, failed: 2, total: 12 });
    expect(parseTestOutput("Tests  12 passed (12)")).toEqual({ passed: 12, failed: 0, total: 12 });
  });

  test("jest", () => {
    expect(parseTestOutput("Tests:       1 failed, 3 passed, 4 total")).toEqual({ passed: 3, failed: 1, total: 4 });
  });

  test("pytest", () => {
    expect(parseTestOutput("=== 2 failed, 10 passed in 1.2s ===")).toEqual({ passed: 10, failed: 2, total: 12 });
    expect(parseTestOutput("=== 5 passed in 0.3s ===")).toEqual({ passed: 5, failed: 0, total: 5 });
  });

  test("go test", () => {
    expect(parseTestOutput("--- PASS: TestA\n--- PASS: TestB\n--- FAIL: TestC\n")).toEqual({
      passed: 2, failed: 1, total: 3,
    });
  });

  test("ANSI colour does not defeat parsing", () => {
    expect(parseTestOutput("[32m 7 pass[0m\n[31m 1 fail[0m")).toEqual({
      passed: 7, failed: 1, total: 8,
    });
  });

  test("unrecognisable output yields null rather than a guess", () => {
    expect(parseTestOutput("everything is fine")).toBeNull();
  });
});

describe("V-034: running tests for real", () => {
  test("captures counts, exit code and output from an actual run", () => {
    // A tiny bun project so the run is real rather than simulated.
    mkdirSync(join(dir, "t"), { recursive: true });
    writeFileSync(join(dir, "t", "a.test.ts"), `import {expect,test} from "bun:test";
test("one", () => expect(1).toBe(1));
test("two", () => expect(2).toBe(2));
`);
    const result = runTests(dir, "bun test t/");
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.parsed).toBe(true);
    expect(testsPassed(result)).toBe(true);
    expect(result.output).toContain("pass");
  });

  test("a failing suite reports the failure, not success", () => {
    mkdirSync(join(dir, "t"), { recursive: true });
    writeFileSync(join(dir, "t", "b.test.ts"), `import {expect,test} from "bun:test";
test("ok", () => expect(1).toBe(1));
test("bad", () => expect(1).toBe(2));
`);
    const result = runTests(dir, "bun test t/");
    expect(result.exitCode).not.toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(testsPassed(result)).toBe(false);
  });

  test("an unparseable run is NOT treated as success even when it exits 0", () => {
    // The vacuous-pass case §22.18 warns about: exit 0 with nothing actually run.
    const result = runTests(dir, "echo nothing to do");
    expect(result.exitCode).toBe(0);
    expect(result.parsed).toBe(false);
    expect(result.total).toBe(0);
    expect(testsPassed(result)).toBe(false);
  });
});

describe("V-035: failing tests block completion", () => {
  function project() {
    const store = new ProjectStore(join(dir, "projects"));
    const p = store.createProject({ name: "P", goal: "g", repositoryPath: dir });
    store.addRequirement(p.id, { id: "R-1", description: "x", ownerAgentId: "backend" }, USER);
    store.createPlan(p.id, { milestones: [] }, USER);
    store.addTask(p.id, { id: "api", objective: "API", assignedAgentId: "backend" }, USER);
    store.approvePlan(p.id, USER);
    return { store, projectId: p.id };
  }

  const RUN = {
    command: "bun test",
    ranByAgentId: "backend",
    exitCode: 0,
    parsed: true,
    passed: 22,
    failed: 0,
    total: 22,
  };

  test("a passing run is recorded and linked to the agent and task", () => {
    const { store, projectId } = project();
    const { task, blocked } = store.recordTestRun(projectId, "api", RUN);

    expect(blocked).toBe(false);
    expect(task.testRun!.passed).toBe(22);
    expect(task.testRun!.ranByAgentId).toBe("backend");
    expect(task.testRun!.command).toBe("bun test");
    expect(task.testRun!.ranAt).toBeTruthy();
  });

  test("a failing run blocks the task and says why", () => {
    const { store, projectId } = project();
    store.updateTask(projectId, "api", { status: "needs_review" }, USER);

    const { task, blocked, reason } = store.recordTestRun(projectId, "api", {
      ...RUN, exitCode: 1, passed: 18, failed: 2, total: 20,
    });

    expect(blocked).toBe(true);
    expect(reason).toContain("2 of 20 required tests failing");
    // The task cannot sit in a review queue with a red suite.
    expect(task.status).toBe("working");
    expect(task.reviewStatus).toBe("changes_requested");
  });

  test("an unparseable run also blocks — unknown is not success", () => {
    const { store, projectId } = project();
    const { blocked, reason } = store.recordTestRun(projectId, "api", {
      ...RUN, parsed: false, passed: 0, failed: 0, total: 0, exitCode: 0,
    });
    expect(blocked).toBe(true);
    expect(reason).toContain("could not be parsed");
  });

  test("re-running green lifts the block", () => {
    const { store, projectId } = project();
    store.recordTestRun(projectId, "api", { ...RUN, exitCode: 1, passed: 18, failed: 2, total: 20 });
    expect(store.getTask(projectId, "api").reviewStatus).toBe("changes_requested");

    const { blocked, task } = store.recordTestRun(projectId, "api", RUN);
    expect(blocked).toBe(false);
    expect(task.reviewStatus).toBe("pending");
    expect(task.testRun!.failed).toBe(0);
  });

  test("the recorded run survives a restart", () => {
    const { store, projectId } = project();
    store.recordTestRun(projectId, "api", RUN);
    const reopened = new ProjectStore(join(dir, "projects"));
    expect(reopened.getTask(projectId, "api").testRun!.passed).toBe(22);
  });
});
