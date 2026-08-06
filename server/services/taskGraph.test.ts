import { describe, expect, test } from "bun:test";
import {
  DependencyCycleError,
  PlanNotApprovedError,
  TaskBlockedError,
  assertLaunchable,
  assertNoCycle,
  blockedTasks,
  effectiveStatus,
  findCycle,
  newlyUnblocked,
  readyTasks,
  topologicalOrder,
  unmetDependencies,
} from "./taskGraph";
import type { CodingTask, Project, TaskStatus } from "../types/project";

function task(id: string, dependsOn: string[] = [], status: TaskStatus = "pending"): CodingTask {
  return {
    id,
    objective: `do ${id}`,
    dependsOn,
    expectedFiles: [],
    completionCriteria: [],
    requiredTests: [],
    status,
    costUsd: 0,
    reviewStatus: "not_required",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("V-019: dependencies affect status", () => {
  test("a task with an incomplete dependency is blocked, not ready", () => {
    const tasks = [task("api"), task("ui", ["api"])];
    expect(effectiveStatus(tasks[1], tasks)).toBe("blocked");
    expect(unmetDependencies(tasks[1], tasks)).toEqual(["api"]);
  });

  test("a task with all dependencies complete is ready", () => {
    const tasks = [task("api", [], "complete"), task("ui", ["api"])];
    expect(effectiveStatus(tasks[1], tasks)).toBe("ready");
    expect(unmetDependencies(tasks[1], tasks)).toEqual([]);
  });

  test("a task with no dependencies is ready immediately", () => {
    const tasks = [task("api")];
    expect(effectiveStatus(tasks[0], tasks)).toBe("ready");
  });

  test("an unknown dependency id counts as unmet", () => {
    // Otherwise a typo'd dependency would silently make a task look runnable.
    const tasks = [task("ui", ["does-not-exist"])];
    expect(unmetDependencies(tasks[0], tasks)).toEqual(["does-not-exist"]);
    expect(effectiveStatus(tasks[0], tasks)).toBe("blocked");
  });

  test("a non-pending status is reported as-is, not recomputed", () => {
    const tasks = [task("api"), task("ui", ["api"], "working")];
    expect(effectiveStatus(tasks[1], tasks)).toBe("working");
  });

  test("partially satisfied dependencies list only the outstanding ones", () => {
    const tasks = [
      task("api", [], "complete"),
      task("schema"),
      task("ui", ["api", "schema"]),
    ];
    expect(unmetDependencies(tasks[2], tasks)).toEqual(["schema"]);
  });

  test("readyTasks and blockedTasks partition the pending set", () => {
    const tasks = [task("api", [], "complete"), task("ui", ["api"]), task("tests", ["ui"])];
    expect(readyTasks(tasks).map((t) => t.id)).toEqual(["ui"]);
    const blocked = blockedTasks(tasks);
    expect(blocked.map((b) => b.task.id)).toEqual(["tests"]);
    expect(blocked[0].blockedBy).toEqual(["ui"]);
  });

  test("completing a dependency unblocks exactly the dependents that are now clear", () => {
    const tasks = [
      task("api", [], "complete"),
      task("schema", [], "complete"),
      task("ui", ["api"]),
      task("integration", ["api", "schema"]),
      task("unrelated"),
    ];
    const unblocked = newlyUnblocked(tasks, "api").map((t) => t.id);
    expect(unblocked).toContain("ui");
    expect(unblocked).toContain("integration");
    // A task that never depended on `api` is not reported as newly unblocked.
    expect(unblocked).not.toContain("unrelated");
  });

  test("a dependent still waiting on another dependency is not unblocked", () => {
    const tasks = [task("api", [], "complete"), task("schema"), task("ui", ["api", "schema"])];
    expect(newlyUnblocked(tasks, "api")).toHaveLength(0);
  });
});

describe("dependency cycles", () => {
  test("detects a direct cycle", () => {
    const tasks = [task("a", ["b"]), task("b", ["a"])];
    const cycle = findCycle(tasks);
    expect(cycle).not.toBeNull();
    expect(() => assertNoCycle(tasks)).toThrow(DependencyCycleError);
  });

  test("detects a longer cycle", () => {
    const tasks = [task("a", ["c"]), task("b", ["a"]), task("c", ["b"])];
    expect(findCycle(tasks)).not.toBeNull();
  });

  test("detects a self-dependency", () => {
    expect(findCycle([task("a", ["a"])])).not.toBeNull();
  });

  test("accepts a diamond, which is not a cycle", () => {
    const tasks = [task("root"), task("left", ["root"]), task("right", ["root"]), task("join", ["left", "right"])];
    expect(findCycle(tasks)).toBeNull();
    expect(() => assertNoCycle(tasks)).not.toThrow();
  });

  test("an unknown dependency id is not mistaken for a cycle", () => {
    expect(findCycle([task("a", ["ghost"])])).toBeNull();
  });
});

describe("topological order", () => {
  test("orders dependencies before dependents", () => {
    const tasks = [task("ui", ["api"]), task("tests", ["ui"]), task("api")];
    const order = topologicalOrder(tasks).map((t) => t.id);
    expect(order.indexOf("api")).toBeLessThan(order.indexOf("ui"));
    expect(order.indexOf("ui")).toBeLessThan(order.indexOf("tests"));
  });

  test("includes every task when the graph is acyclic", () => {
    const tasks = [task("a"), task("b", ["a"]), task("c", ["a"])];
    expect(topologicalOrder(tasks)).toHaveLength(3);
  });

  test("excludes tasks trapped in a cycle rather than looping forever", () => {
    const tasks = [task("ok"), task("a", ["b"]), task("b", ["a"])];
    expect(topologicalOrder(tasks).map((t) => t.id)).toEqual(["ok"]);
  });
});

describe("V-018: user approval gates execution", () => {
  function projectWith(planState: Project["plan"] extends infer _ ? any : never, tasks: CodingTask[]): Project {
    return {
      id: "p",
      name: "n",
      goal: "g",
      repositoryPath: "/tmp",
      baseBranch: "main",
      document: { id: "d", title: "t", currentVersion: 1, versions: [] },
      requirements: [],
      suggestions: [],
      tasks,
      messages: [],
      artifacts: [],
      submissions: [],
      plan: planState,
      createdAt: "",
      updatedAt: "",
    } as Project;
  }

  const draftPlan = { id: "plan", state: "draft" as const, milestones: [], createdAt: "", updatedAt: "" };
  const approvedPlan = { id: "plan", state: "approved" as const, milestones: [], createdAt: "", updatedAt: "" };

  test("nothing launches without a plan", () => {
    const project = projectWith(undefined, [task("a")]);
    expect(() => assertLaunchable(project, "a")).toThrow(PlanNotApprovedError);
  });

  test("a draft plan does not launch tasks automatically", () => {
    const project = projectWith(draftPlan, [task("a")]);
    expect(() => assertLaunchable(project, "a")).toThrow(PlanNotApprovedError);
    try {
      assertLaunchable(project, "a");
    } catch (err) {
      expect((err as Error).message).toContain("approve");
    }
  });

  test("an approved plan launches a task with no dependencies", () => {
    const project = projectWith(approvedPlan, [task("a")]);
    expect(assertLaunchable(project, "a").id).toBe("a");
  });

  test("an approved plan still refuses a blocked task, with a distinct error", () => {
    const project = projectWith(approvedPlan, [task("api"), task("ui", ["api"])]);
    let caught: unknown;
    try {
      assertLaunchable(project, "ui");
    } catch (err) {
      caught = err;
    }
    // Distinct from PlanNotApprovedError so the UI can say which gate applied.
    expect(caught).toBeInstanceOf(TaskBlockedError);
    expect((caught as TaskBlockedError).blockedBy).toEqual(["api"]);
  });
});
