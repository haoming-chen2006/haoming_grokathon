import type {
  CodingTask,
  EffectiveTaskStatus,
  ImplementationPlan,
  Project,
} from "../types/project";

/** A dependency edge would create a cycle, so the graph could never drain. */
export class DependencyCycleError extends Error {
  readonly code = "DEPENDENCY_CYCLE";
  constructor(message: string, readonly cycle: string[]) {
    super(message);
    this.name = "DependencyCycleError";
  }
}

/** An execution was attempted before the user approved the plan (V-018). */
export class PlanNotApprovedError extends Error {
  readonly code = "PLAN_NOT_APPROVED";
  constructor(message: string) {
    super(message);
    this.name = "PlanNotApprovedError";
  }
}

/** A task cannot start because a dependency has not completed (V-019). */
export class TaskBlockedError extends Error {
  readonly code = "TASK_BLOCKED";
  constructor(message: string, readonly blockedBy: string[]) {
    super(message);
    this.name = "TaskBlockedError";
  }
}

function taskMap(tasks: CodingTask[]): Map<string, CodingTask> {
  return new Map(tasks.map((t) => [t.id, t]));
}

/**
 * Dependency ids that are not yet complete. Unknown ids count as unmet — a task must never look
 * ready because it points at a dependency that does not exist.
 */
export function unmetDependencies(task: CodingTask, tasks: CodingTask[]): string[] {
  const byId = taskMap(tasks);
  return task.dependsOn.filter((id) => byId.get(id)?.status !== "complete");
}

/**
 * Effective status (V-019). `blocked`/`ready` are derived from the graph rather than stored, so a
 * task cannot claim to be ready while a dependency is outstanding.
 */
export function effectiveStatus(task: CodingTask, tasks: CodingTask[]): EffectiveTaskStatus {
  if (task.status !== "pending") return task.status;
  return unmetDependencies(task, tasks).length > 0 ? "blocked" : "ready";
}

/** Tasks that can start now: pending with every dependency complete. */
export function readyTasks(tasks: CodingTask[]): CodingTask[] {
  return tasks.filter((t) => effectiveStatus(t, tasks) === "ready");
}

export function blockedTasks(tasks: CodingTask[]): Array<{ task: CodingTask; blockedBy: string[] }> {
  return tasks
    .filter((t) => effectiveStatus(t, tasks) === "blocked")
    .map((task) => ({ task, blockedBy: unmetDependencies(task, tasks) }));
}

/**
 * Detect a cycle reachable from the graph, returning the offending path.
 * Iterative DFS with an explicit stack so a deep graph cannot blow the call stack.
 */
export function findCycle(tasks: CodingTask[]): string[] | null {
  const byId = taskMap(tasks);
  const state = new Map<string, "visiting" | "done">();
  const parent = new Map<string, string | null>();

  for (const root of tasks) {
    if (state.get(root.id) === "done") continue;

    const stack: Array<{ id: string; enter: boolean }> = [{ id: root.id, enter: true }];
    parent.set(root.id, null);

    while (stack.length) {
      const frame = stack.pop()!;
      if (!frame.enter) {
        state.set(frame.id, "done");
        continue;
      }
      if (state.get(frame.id) === "done") continue;

      state.set(frame.id, "visiting");
      stack.push({ id: frame.id, enter: false });

      for (const depId of byId.get(frame.id)?.dependsOn ?? []) {
        if (!byId.has(depId)) continue; // unknown ids are unmet, not cyclic
        if (state.get(depId) === "visiting") {
          // Walk parents back to depId to reconstruct the cycle.
          const cycle = [frame.id];
          let cursor: string | null | undefined = frame.id;
          while (cursor && cursor !== depId) {
            cursor = parent.get(cursor) ?? null;
            if (cursor) cycle.push(cursor);
          }
          cycle.push(depId);
          return cycle.reverse();
        }
        if (state.get(depId) !== "done") {
          parent.set(depId, frame.id);
          stack.push({ id: depId, enter: true });
        }
      }
    }
  }
  return null;
}

export function assertNoCycle(tasks: CodingTask[]): void {
  const cycle = findCycle(tasks);
  if (cycle) {
    throw new DependencyCycleError(`Task dependencies form a cycle: ${cycle.join(" -> ")}`, cycle);
  }
}

/**
 * Dependency-respecting execution order. Kahn's algorithm; tasks in a cycle are excluded, so
 * callers should assertNoCycle first if a cycle should be an error rather than an omission.
 */
export function topologicalOrder(tasks: CodingTask[]): CodingTask[] {
  const byId = taskMap(tasks);
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const task of tasks) {
    const deps = task.dependsOn.filter((d) => byId.has(d));
    indegree.set(task.id, deps.length);
    for (const dep of deps) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), task.id]);
    }
  }

  const queue = tasks.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const ordered: CodingTask[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    const task = byId.get(id);
    if (task) ordered.push(task);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  return ordered;
}

/**
 * Gate for starting a coding session (V-018 + V-019). Execution requires an approved plan and
 * satisfied dependencies; both refusals are distinct so the UI can explain which one applied.
 */
export function assertLaunchable(project: Project, taskId: string): CodingTask {
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const plan: ImplementationPlan | undefined = project.plan;
  if (!plan) {
    throw new PlanNotApprovedError(`Project has no implementation plan; nothing may execute yet`);
  }
  if (plan.state === "draft") {
    throw new PlanNotApprovedError(
      `Implementation plan is still a draft — the user must approve it before Grok sessions launch`,
    );
  }

  const unmet = unmetDependencies(task, project.tasks);
  if (unmet.length > 0) {
    throw new TaskBlockedError(
      `Task ${taskId} is waiting on: ${unmet.join(", ")}`,
      unmet,
    );
  }

  return task;
}

/**
 * Tasks that became ready as a result of `completedTaskId` finishing — the set whose agents should
 * now be woken (V-019: "dependency completion can unblock the next agent").
 */
export function newlyUnblocked(tasks: CodingTask[], completedTaskId: string): CodingTask[] {
  return tasks.filter(
    (t) =>
      t.status === "pending" &&
      t.dependsOn.includes(completedTaskId) &&
      unmetDependencies(t, tasks).length === 0,
  );
}
