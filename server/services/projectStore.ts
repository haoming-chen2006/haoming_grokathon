import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { atomicWriteJson } from "./persistence";
import {
  assertLaunchable,
  assertNoCycle,
  effectiveStatus,
  newlyUnblocked,
  topologicalOrder,
  unmetDependencies,
} from "./taskGraph";
import {
  checkLoopGuard,
  MissingRecipientError,
  requiresRecipient,
  validateLinks,
} from "./messaging";
import { assertNoSecrets } from "./secrets";
import {
  BudgetExceededError,
  DEFAULT_WARNING_THRESHOLD,
  evaluateBudget,
  type BudgetSnapshot,
} from "./agentRegistry";
import {
  CompletionGateError,
  IncompleteSubmissionError,
  evaluateCompletionGate,
  missingSubmissionFields,
  testsPass,
  type SubmissionInput,
} from "./codeReview";
import { DEFAULT_MESSAGE_LIMITS } from "../types/project";
import type {
  Actor,
  AgentMessage,
  ArtifactKind,
  CodeArtifact,
  CodeSubmission,
  CodingTask,
  CompletionGate,
  TaskTestRun,
  DesignSuggestion,
  EffectiveTaskStatus,
  ImplementationPlan,
  MessageKind,
  MessageLimits,
  MessageLink,
  Project,
  Requirement,
  RequirementStatus,
  SubmissionState,
  SuggestionState,
} from "../types/project";

/** Agent attempted an operation its permissions do not allow (V-014, V-030). */
export class PermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/** Suggestion was written against a document version that is no longer current (V-016). */
export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(message: string, readonly baseVersion: number, readonly currentVersion: number) {
    super(message);
    this.name = "VersionConflictError";
  }
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * How many messages stay in the project file. Older ones move to an append-only sidecar.
 *
 * Every mutation re-reads and re-writes the whole project document, so an unbounded message list
 * makes each write O(n) and the project O(n²) over its life. Measured: ~0.6 KB and a linear cost
 * per message, so 20k messages would mean a 12 MB file rewritten on every update. Archiving keeps
 * the hot path bounded without losing anything — the sidecar is append-only and readable.
 */
const MAX_INLINE_MESSAGES = 500;

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * File-backed project store. One JSON document per project, written atomically via the same
 * tmp+rename path the session store uses, so a crash mid-write cannot truncate project state
 * (V-049, V-051).
 */
export class ProjectStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private pathFor(projectId: string): string {
    return join(this.dir, `${projectId}.json`);
  }

  private archivePathFor(projectId: string): string {
    return join(this.dir, `${projectId}.messages.jsonl`);
  }

  /**
   * Move older messages into the append-only sidecar, keeping threads atomic.
   *
   * A thread is either entirely retained or entirely archived, never split. The loop guard
   * (V-027) counts a thread's length and a pair's unanswered streak from the retained list;
   * archiving half a thread would silently under-count and stop runaway conversations from
   * escalating. Threads are bounded by maxThreadLength, so holding a live thread whole costs
   * little beyond the nominal window.
   */
  private archiveOldMessages(project: Project): void {
    if (project.messages.length <= MAX_INLINE_MESSAGES) return;

    const cutoff = project.messages.length - MAX_INLINE_MESSAGES;
    const liveThreads = new Set(project.messages.slice(cutoff).map((m) => m.threadId));

    const archived: AgentMessage[] = [];
    const retained: AgentMessage[] = [];
    project.messages.forEach((m, i) => {
      (i >= cutoff || liveThreads.has(m.threadId) ? retained : archived).push(m);
    });
    if (archived.length === 0) return;

    // Appended, never rewritten, so archiving cost does not grow with history.
    appendFileSync(this.archivePathFor(project.id), archived.map((m) => JSON.stringify(m)).join("\n") + "\n");
    project.messages = retained;
  }

  /**
   * Write the project back to disk.
   *
   * **Every mutation on this class must stay synchronous.** A mutation is read-whole-file →
   * change in memory → write-whole-file, and `atomicWriteJson` makes only the *write* atomic. The
   * read-modify-write *sequence* is safe purely because no `await` occurs inside it, so the event
   * loop cannot interleave two of them and let one agent's update overwrite another's. Several
   * agents writing at once is this product's normal state, so that is load-bearing.
   *
   * Introducing an `async` method here — switching to `fs.promises`, for instance — would silently
   * reintroduce lost updates. `projectStoreInvariants.test.ts` fails if any method becomes async,
   * and `concurrency.test.ts` exercises the behaviour it protects.
   *
   * The guarantee is per-process. A second process writing the same project would also collide on
   * the fixed `.tmp` path; the product runs one server, and nothing else writes these files.
   */
  private persist(project: Project): Project {
    project.updatedAt = nowIso();
    this.archiveOldMessages(project);
    atomicWriteJson(this.pathFor(project.id), project);
    return project;
  }

  /** Messages moved to the sidecar, oldest first. Empty when nothing has been archived. */
  archivedMessages(projectId: string): AgentMessage[] {
    const path = this.archivePathFor(projectId);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as AgentMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is AgentMessage => m !== null);
  }

  /** Assert the actor may write the canonical document. Users always may; agents need a grant. */
  private assertCanWriteDocument(actor: Actor, what: string): void {
    if (actor.kind === "user") return;
    if (actor.canWriteDocument) return;
    throw new PermissionDeniedError(
      `Agent "${actor.id}" has read-only access to the canonical document and may not ${what}. ` +
        `Submit a design suggestion instead.`,
    );
  }

  createProject(params: {
    name: string;
    goal: string;
    repositoryPath: string;
    baseBranch?: string;
    documentTitle?: string;
    documentContent?: string;
    budgetUsd?: number;
  }): Project {
    const createdAt = nowIso();
    const project: Project = {
      id: newId("proj"),
      name: params.name,
      goal: params.goal,
      repositoryPath: params.repositoryPath,
      baseBranch: params.baseBranch ?? "main",
      document: {
        id: newId("doc"),
        title: params.documentTitle ?? `${params.name} Design`,
        currentVersion: 1,
        versions: [
          {
            version: 1,
            content: params.documentContent ?? "",
            createdAt,
            authorId: "user",
            changeSummary: "Initial document",
          },
        ],
      },
      requirements: [],
      suggestions: [],
      tasks: [],
      messages: [],
      artifacts: [],
      submissions: [],
      budgetUsd: params.budgetUsd,
      createdAt,
      updatedAt: createdAt,
    };
    return this.persist(project);
  }

  getProject(projectId: string): Project {
    const path = this.pathFor(projectId);
    if (!existsSync(path)) throw new NotFoundError(`Project not found: ${projectId}`);
    const project = JSON.parse(readFileSync(path, "utf8")) as Project;
    // Projects written before a given field existed need it back-filled on read.
    if (!project.tasks) project.tasks = [];
    if (!project.messages) project.messages = [];
    if (!project.artifacts) project.artifacts = [];
    if (!project.submissions) project.submissions = [];
    return project;
  }

  listProjects(): Project[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf8")) as Project)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  deleteProject(projectId: string): void {
    const path = this.pathFor(projectId);
    if (existsSync(path)) unlinkSync(path);
    // The message archive is a separate file; leaving it behind leaks disk and would resurface
    // as stale history if the id were ever reused.
    const archive = this.archivePathFor(projectId);
    if (existsSync(archive)) unlinkSync(archive);
  }

  // ---------------------------------------------------------------- document

  /** Current document content. Always readable — agents get read access by default (§4). */
  getDocument(projectId: string): { content: string; version: number; title: string } {
    const project = this.getProject(projectId);
    const current = project.document.versions.find((v) => v.version === project.document.currentVersion);
    return {
      content: current?.content ?? "",
      version: project.document.currentVersion,
      title: project.document.title,
    };
  }

  getDocumentVersion(projectId: string, version: number) {
    const project = this.getProject(projectId);
    const found = project.document.versions.find((v) => v.version === version);
    if (!found) throw new NotFoundError(`Document version ${version} not found`);
    return found;
  }

  /**
   * Write a new canonical document version. Rejected for agents without a scoped grant (V-014).
   * `expectedVersion` gives callers optimistic concurrency (V-016).
   */
  updateDocument(
    projectId: string,
    content: string,
    actor: Actor,
    opts: { changeSummary?: string; expectedVersion?: number; fromSuggestionId?: string } = {},
  ): Project {
    this.assertCanWriteDocument(actor, "rewrite approved content");
    // A credential in the canonical document would be persisted and rendered (V-048).
    assertNoSecrets(content, "the design document");
    const project = this.getProject(projectId);

    if (opts.expectedVersion !== undefined && opts.expectedVersion !== project.document.currentVersion) {
      throw new VersionConflictError(
        `Document has moved on: expected version ${opts.expectedVersion}, current is ${project.document.currentVersion}`,
        opts.expectedVersion,
        project.document.currentVersion,
      );
    }

    const version = project.document.currentVersion + 1;
    project.document.versions.push({
      version,
      content,
      createdAt: nowIso(),
      authorId: actor.id,
      changeSummary: opts.changeSummary,
      fromSuggestionId: opts.fromSuggestionId,
    });
    project.document.currentVersion = version;

    // Any pending suggestion written against an older version is now stale (V-016).
    for (const suggestion of project.suggestions) {
      if (suggestion.state === "pending" && suggestion.baseVersion < version) {
        suggestion.state = "stale";
      }
    }

    return this.persist(project);
  }

  // ------------------------------------------------------------ requirements

  addRequirement(
    projectId: string,
    params: {
      id: string;
      description: string;
      acceptanceCriteria?: string[];
      designSection?: string;
      ownerAgentId?: string;
    },
    actor: Actor,
  ): Requirement {
    this.assertCanWriteDocument(actor, "create requirements");
    const project = this.getProject(projectId);

    if (project.requirements.some((r) => r.id === params.id)) {
      throw new Error(`Requirement ${params.id} already exists`);
    }

    const timestamp = nowIso();
    const requirement: Requirement = {
      id: params.id,
      description: params.description,
      acceptanceCriteria: (params.acceptanceCriteria ?? []).map((text) => ({
        id: newId("ac"),
        text,
        met: false,
      })),
      designSection: params.designSection,
      ownerAgentId: params.ownerAgentId,
      taskIds: [],
      affectedFiles: [],
      status: params.ownerAgentId ? "assigned" : "defined",
      reviewStatus: "not_required",
      baseVersion: project.document.currentVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    project.requirements.push(requirement);
    this.persist(project);
    return requirement;
  }

  getRequirement(projectId: string, requirementId: string): Requirement {
    const found = this.getProject(projectId).requirements.find((r) => r.id === requirementId);
    if (!found) throw new NotFoundError(`Requirement not found: ${requirementId}`);
    return found;
  }

  /**
   * Update requirement progress. Agents may report on their own work, so this is not gated on
   * document-write permission — but an agent may only touch a requirement it owns.
   */
  updateRequirement(
    projectId: string,
    requirementId: string,
    patch: Partial<
      Pick<
        Requirement,
        | "status"
        | "ownerAgentId"
        | "branch"
        | "worktree"
        | "affectedFiles"
        | "reviewStatus"
        | "testsPassing"
        | "testsTotal"
        | "taskIds"
      >
    >,
    actor: Actor,
  ): Requirement {
    const project = this.getProject(projectId);
    const requirement = project.requirements.find((r) => r.id === requirementId);
    if (!requirement) throw new NotFoundError(`Requirement not found: ${requirementId}`);

    if (actor.kind === "agent" && requirement.ownerAgentId && requirement.ownerAgentId !== actor.id) {
      throw new PermissionDeniedError(
        `Agent "${actor.id}" does not own requirement ${requirementId} (owner: ${requirement.ownerAgentId})`,
      );
    }

    Object.assign(requirement, patch);
    requirement.updatedAt = nowIso();
    this.persist(project);
    return requirement;
  }

  /**
   * Progress from objective evidence, not a model estimate (§15, V-020): the fraction of
   * requirements that have reached each milestone.
   */
  getProgress(projectId: string): {
    total: number;
    byStatus: Record<RequirementStatus, number>;
    completed: number;
    percent: number;
    formula: string;
  } {
    const requirements = this.getProject(projectId).requirements;
    const byStatus = {
      defined: 0,
      assigned: 0,
      in_progress: 0,
      submitted: 0,
      tests_passing: 0,
      reviewed: 0,
      merged: 0,
      complete: 0,
    } as Record<RequirementStatus, number>;

    for (const r of requirements) byStatus[r.status] += 1;
    const completed = byStatus.complete;
    const total = requirements.length;

    return {
      total,
      byStatus,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      formula: "requirements with status=complete / total requirements",
    };
  }

  // -------------------------------------------------------------- task graph

  /**
   * Create or replace the implementation plan. Always lands in `draft` — a Planner proposing work
   * must never start it (V-018).
   */
  createPlan(
    projectId: string,
    params: {
      milestones?: Array<{ id?: string; name: string; ownerAgentId?: string; dependsOn?: string[] }>;
      authorAgentId?: string;
    },
    actor: Actor,
  ): ImplementationPlan {
    const project = this.getProject(projectId);
    if (project.plan && project.plan.state !== "draft" && actor.kind !== "user") {
      throw new PermissionDeniedError(`Plan is already ${project.plan.state}; only the user may replace it`);
    }

    const timestamp = nowIso();
    const plan: ImplementationPlan = {
      id: newId("plan"),
      state: "draft",
      authorAgentId: params.authorAgentId ?? (actor.kind === "agent" ? actor.id : undefined),
      milestones: (params.milestones ?? []).map((m) => ({
        id: m.id ?? newId("ms"),
        name: m.name,
        ownerAgentId: m.ownerAgentId,
        taskIds: [],
        dependsOn: m.dependsOn ?? [],
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    project.plan = plan;
    this.persist(project);
    return plan;
  }

  /** Edit a draft plan's assignments and budgets. Refused once approved (V-018). */
  updatePlan(
    projectId: string,
    patch: { milestones?: ImplementationPlan["milestones"] },
    actor: Actor,
  ): ImplementationPlan {
    const project = this.getProject(projectId);
    if (!project.plan) throw new NotFoundError("Project has no implementation plan");
    if (project.plan.state !== "draft") {
      throw new Error(`Plan is ${project.plan.state} and can no longer be edited`);
    }
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may edit the implementation plan`);
    }
    if (patch.milestones) project.plan.milestones = patch.milestones;
    project.plan.updatedAt = nowIso();
    this.persist(project);
    return project.plan;
  }

  /** The approval gate. Only the user may approve, and only a draft can be approved (V-018). */
  approvePlan(projectId: string, actor: Actor): ImplementationPlan {
    const project = this.getProject(projectId);
    if (!project.plan) throw new NotFoundError("Project has no implementation plan");
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(
        `Only the user may approve an implementation plan (actor: ${actor.id})`,
      );
    }
    if (project.plan.state !== "draft") {
      throw new Error(`Plan is already ${project.plan.state}`);
    }

    // Never approve a graph that cannot drain.
    assertNoCycle(project.tasks);

    project.plan.state = "approved";
    project.plan.approvedAt = nowIso();
    project.plan.approvedBy = actor.id;
    project.plan.updatedAt = project.plan.approvedAt;
    this.persist(project);
    return project.plan;
  }

  addTask(
    projectId: string,
    params: {
      id?: string;
      objective: string;
      requirementId?: string;
      assignedAgentId?: string;
      dependsOn?: string[];
      expectedFiles?: string[];
      completionCriteria?: string[];
      requiredTests?: string[];
      milestoneId?: string;
      budgetUsd?: number;
      branch?: string;
      worktree?: string;
    },
    actor: Actor,
  ): CodingTask {
    const project = this.getProject(projectId);
    if (project.plan && project.plan.state !== "draft" && actor.kind !== "user") {
      throw new PermissionDeniedError(`Cannot add tasks to an ${project.plan.state} plan`);
    }
    if (params.id && project.tasks.some((t) => t.id === params.id)) {
      throw new Error(`Task ${params.id} already exists`);
    }

    const timestamp = nowIso();
    const task: CodingTask = {
      id: params.id ?? newId("task"),
      objective: params.objective,
      requirementId: params.requirementId,
      assignedAgentId: params.assignedAgentId,
      branch: params.branch,
      worktree: params.worktree,
      dependsOn: params.dependsOn ?? [],
      expectedFiles: params.expectedFiles ?? [],
      completionCriteria: params.completionCriteria ?? [],
      requiredTests: params.requiredTests ?? [],
      status: "pending",
      costUsd: 0,
      budgetUsd: params.budgetUsd,
      reviewStatus: "not_required",
      milestoneId: params.milestoneId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    project.tasks.push(task);
    // Reject the edge rather than persisting an undrainable graph.
    assertNoCycle(project.tasks);

    if (task.milestoneId && project.plan) {
      project.plan.milestones.find((m) => m.id === task.milestoneId)?.taskIds.push(task.id);
    }
    if (task.requirementId) {
      const requirement = project.requirements.find((r) => r.id === task.requirementId);
      if (requirement && !requirement.taskIds.includes(task.id)) requirement.taskIds.push(task.id);
    }

    this.persist(project);
    return task;
  }

  getTask(projectId: string, taskId: string): CodingTask {
    const found = this.getProject(projectId).tasks.find((t) => t.id === taskId);
    if (!found) throw new NotFoundError(`Task not found: ${taskId}`);
    return found;
  }

  /** Tasks with their derived status, so callers never see a stale `blocked`/`ready`. */
  listTasks(projectId: string): Array<CodingTask & { effectiveStatus: EffectiveTaskStatus; blockedBy: string[] }> {
    const tasks = this.getProject(projectId).tasks;
    return tasks.map((task) => ({
      ...task,
      effectiveStatus: effectiveStatus(task, tasks),
      blockedBy: unmetDependencies(task, tasks),
    }));
  }

  /**
   * Record task progress. Returns any tasks unblocked by this change so the caller can wake the
   * next agent (V-019).
   */
  updateTask(
    projectId: string,
    taskId: string,
    patch: Partial<
      Pick<
        CodingTask,
        | "status"
        | "assignedAgentId"
        | "branch"
        | "worktree"
        | "costUsd"
        | "budgetUsd"
        | "reviewStatus"
        | "expectedFiles"
        | "dependsOn"
      >
    >,
    actor: Actor,
  ): { task: CodingTask; unblocked: CodingTask[] } {
    const project = this.getProject(projectId);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);

    if (actor.kind === "agent" && task.assignedAgentId && task.assignedAgentId !== actor.id) {
      throw new PermissionDeniedError(
        `Agent "${actor.id}" is not assigned to task ${taskId} (assigned: ${task.assignedAgentId})`,
      );
    }

    // Raising your own spending cap would defeat the budget control (§16, V-047).
    if (patch.budgetUsd !== undefined && actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may change a task budget (actor: ${actor.id})`);
    }
    // Rewiring the graph is a planning action, not something an agent does mid-flight.
    if (patch.dependsOn !== undefined && actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may change task dependencies (actor: ${actor.id})`);
    }

    // Work may not begin before approval or before dependencies clear.
    if (patch.status === "working" && task.status !== "working") {
      assertLaunchable(project, taskId);
    }

    Object.assign(task, patch);
    task.updatedAt = nowIso();

    // A rewired dependency must not be able to persist an undrainable graph.
    if (patch.dependsOn !== undefined) assertNoCycle(project.tasks);

    const unblocked = patch.status === "complete" ? newlyUnblocked(project.tasks, taskId) : [];
    this.persist(project);
    return { task, unblocked };
  }

  /**
   * Record a test run against a task (V-034) and derive whether it blocks completion (V-035).
   * A task whose required tests are failing is moved out of needs_review and back to working,
   * so a red suite cannot sit silently in a review queue.
   */
  recordTestRun(
    projectId: string,
    taskId: string,
    run: Omit<TaskTestRun, "ranAt">,
  ): { task: CodingTask; blocked: boolean; reason?: string } {
    const project = this.getProject(projectId);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);

    task.testRun = { ...run, ranAt: nowIso() };
    task.updatedAt = task.testRun.ranAt;

    // Unknown counts are not success: a suite that ran nothing must not unblock a task.
    const green = run.parsed && run.failed === 0 && run.total > 0 && run.passed === run.total;
    let reason: string | undefined;

    if (!green) {
      reason = !run.parsed
        ? `Test results could not be parsed from "${run.command}" (exit ${run.exitCode}); treating as not passing`
        : `${run.failed} of ${run.total} required tests failing`;
      // Re-running is what clears this, so the task returns to working rather than complete.
      if (task.status === "needs_review" || task.status === "complete") task.status = "working";
      task.reviewStatus = "changes_requested";
    } else if (task.reviewStatus === "changes_requested") {
      // A green re-run lifts the previous block.
      task.reviewStatus = "pending";
    }

    this.persist(project);
    return { task, blocked: !green, reason };
  }

  /** Dependency-respecting execution order (§10 step 11: "merge branches in dependency order"). */
  getExecutionOrder(projectId: string): CodingTask[] {
    return topologicalOrder(this.getProject(projectId).tasks);
  }

  /** Gate used before launching a Grok session for a task. Throws with a specific reason. */
  assertTaskLaunchable(projectId: string, taskId: string): CodingTask {
    return assertLaunchable(this.getProject(projectId), taskId);
  }

  // ------------------------------------------------------ code review & merge

  /** V-037: submit completed work for review. Rejected unless it carries the required evidence. */
  submitCode(projectId: string, input: SubmissionInput & { revisionOf?: string }): CodeSubmission {
    const project = this.getProject(projectId);

    const missing = missingSubmissionFields(input);
    if (missing.length > 0) throw new IncompleteSubmissionError(missing);

    if (input.revisionOf) {
      const original = project.submissions.find((s) => s.id === input.revisionOf);
      if (!original) throw new NotFoundError(`Cannot revise unknown submission: ${input.revisionOf}`);
      if (original.state === "merged") {
        throw new Error(`Submission ${input.revisionOf} is already merged and cannot be revised`);
      }
    }

    const submission: CodeSubmission = {
      id: newId("sub"),
      projectId,
      taskId: input.taskId!,
      agentId: input.agentId!,
      requirementIds: input.requirementIds!,
      branch: input.branch!,
      worktree: input.worktree,
      changedFiles: input.changedFiles!,
      diff: input.diff,
      summary: input.summary!,
      knownLimitations: input.knownLimitations,
      testResults: {
        passed: input.testResults!.passed!,
        failed: input.testResults!.failed!,
        total: input.testResults!.total!,
        command: input.testResults!.command,
        output: input.testResults!.output,
      },
      costUsd: input.costUsd!,
      state: "pending",
      revisionOf: input.revisionOf,
      createdAt: nowIso(),
    };

    project.submissions.push(submission);

    // The owning task moves to needs_review, and so do the requirements it covers.
    const task = project.tasks.find((t) => t.id === submission.taskId);
    if (task) {
      task.status = "needs_review";
      task.reviewStatus = "pending";
      task.updatedAt = nowIso();
    }
    for (const requirementId of submission.requirementIds) {
      const requirement = project.requirements.find((r) => r.id === requirementId);
      if (requirement) {
        requirement.status = "submitted";
        requirement.reviewStatus = "pending";
        requirement.updatedAt = nowIso();
      }
    }

    this.persist(project);
    return submission;
  }

  getSubmission(projectId: string, submissionId: string): CodeSubmission {
    const found = this.getProject(projectId).submissions.find((s) => s.id === submissionId);
    if (!found) throw new NotFoundError(`Submission not found: ${submissionId}`);
    return found;
  }

  listSubmissions(projectId: string, filter: { taskId?: string; state?: SubmissionState } = {}): CodeSubmission[] {
    let submissions = this.getProject(projectId).submissions;
    if (filter.taskId) submissions = submissions.filter((s) => s.taskId === filter.taskId);
    if (filter.state) submissions = submissions.filter((s) => s.state === filter.state);
    return submissions;
  }

  /**
   * V-038: reject a submission with feedback. The task returns to working so the agent can
   * revise, and the feedback is delivered as a message the agent will actually see.
   */
  requestChanges(
    projectId: string,
    submissionId: string,
    feedback: string,
    actor: Actor,
  ): { submission: CodeSubmission; message: AgentMessage } {
    const project = this.getProject(projectId);
    const submission = project.submissions.find((s) => s.id === submissionId);
    if (!submission) throw new NotFoundError(`Submission not found: ${submissionId}`);
    if (submission.state !== "pending") {
      throw new Error(`Submission ${submissionId} is ${submission.state}, not pending review`);
    }
    if (!feedback?.trim()) throw new Error("Review feedback is required when requesting changes");

    submission.state = "changes_requested";
    submission.reviewFeedback = feedback;
    submission.reviewedBy = actor.id;
    submission.reviewedAt = nowIso();

    const task = project.tasks.find((t) => t.id === submission.taskId);
    if (task) {
      task.status = "working";
      task.reviewStatus = "changes_requested";
      task.updatedAt = nowIso();
    }
    for (const requirementId of submission.requirementIds) {
      const requirement = project.requirements.find((r) => r.id === requirementId);
      if (requirement) {
        requirement.status = "in_progress";
        requirement.reviewStatus = "changes_requested";
        requirement.updatedAt = nowIso();
      }
    }
    this.persist(project);

    const message = this.sendMessage(projectId, {
      kind: "review_request",
      fromAgentId: actor.id,
      toAgentId: submission.agentId,
      body: `Changes requested on ${submission.branch}: ${feedback}`,
      links: [
        { kind: "review", id: submission.id },
        { kind: "task", id: submission.taskId },
        { kind: "branch", id: submission.branch },
      ],
    });

    return { submission: this.getSubmission(projectId, submissionId), message };
  }

  /** Approve a submission. Refused while its required tests are failing (V-035). */
  approveSubmission(projectId: string, submissionId: string, actor: Actor, note?: string): CodeSubmission {
    const project = this.getProject(projectId);
    const submission = project.submissions.find((s) => s.id === submissionId);
    if (!submission) throw new NotFoundError(`Submission not found: ${submissionId}`);
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may approve a code submission (actor: ${actor.id})`);
    }
    if (submission.state !== "pending") {
      throw new Error(`Submission ${submissionId} is ${submission.state}, not pending review`);
    }
    if (!testsPass(submission.testResults)) {
      throw new Error(
        `Cannot approve ${submissionId}: ${submission.testResults.failed} of ` +
          `${submission.testResults.total} required tests are failing`,
      );
    }

    submission.state = "approved";
    submission.reviewedBy = actor.id;
    submission.reviewedAt = nowIso();
    submission.reviewFeedback = note;

    for (const requirementId of submission.requirementIds) {
      const requirement = project.requirements.find((r) => r.id === requirementId);
      if (requirement) {
        requirement.status = "reviewed";
        requirement.reviewStatus = "approved";
        requirement.updatedAt = nowIso();
      }
    }
    this.persist(project);
    return submission;
  }

  /**
   * V-039: record a completed merge. Only an approved submission may be recorded, and a merge is
   * only recorded when a real commit exists — a failed merge leaves the submission untouched so
   * it cannot falsely complete a requirement.
   */
  recordMerge(projectId: string, submissionId: string, mergeCommit: string, actor: Actor): CodeSubmission {
    const project = this.getProject(projectId);
    const submission = project.submissions.find((s) => s.id === submissionId);
    if (!submission) throw new NotFoundError(`Submission not found: ${submissionId}`);
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may merge (actor: ${actor.id})`);
    }
    if (submission.state !== "approved") {
      throw new Error(`Submission ${submissionId} is ${submission.state}; only an approved submission may be merged`);
    }
    if (!mergeCommit?.trim()) {
      throw new Error("A merge commit is required to record a merge");
    }

    submission.state = "merged";
    submission.mergeCommit = mergeCommit;
    submission.mergedAt = nowIso();

    const task = project.tasks.find((t) => t.id === submission.taskId);
    if (task) {
      task.status = "complete";
      task.reviewStatus = "approved";
      task.updatedAt = nowIso();
    }
    for (const requirementId of submission.requirementIds) {
      const requirement = project.requirements.find((r) => r.id === requirementId);
      if (requirement) {
        requirement.status = "merged";
        requirement.updatedAt = nowIso();
      }
    }
    this.persist(project);
    return submission;
  }

  /**
   * V-040: mark a requirement Complete only when every gate has passed. Throws listing the
   * outstanding conditions rather than silently refusing.
   */
  completeRequirement(projectId: string, requirementId: string, actor: Actor): { requirement: Requirement; gate: CompletionGate } {
    const project = this.getProject(projectId);
    const requirement = project.requirements.find((r) => r.id === requirementId);
    if (!requirement) throw new NotFoundError(`Requirement not found: ${requirementId}`);
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may complete a requirement (actor: ${actor.id})`);
    }

    // The most recent submission covering this requirement decides the gate.
    const submission = [...project.submissions]
      .filter((s) => s.requirementIds.includes(requirementId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .pop();

    const pendingSuggestionCount = project.suggestions.filter(
      (s) => s.state === "accepted" && s.requirementId === requirementId && s.baseVersion >= project.document.currentVersion,
    ).length;

    const { gate, unmet } = evaluateCompletionGate({ submission, requirement, pendingSuggestionCount });
    if (unmet.length > 0) throw new CompletionGateError(unmet);

    requirement.status = "complete";
    requirement.updatedAt = nowIso();
    this.persist(project);
    return { requirement, gate };
  }

  /** Inspect the completion gate without attempting the transition. */
  completionGate(projectId: string, requirementId: string): { gate: CompletionGate; unmet: string[] } {
    const project = this.getProject(projectId);
    const requirement = project.requirements.find((r) => r.id === requirementId);
    if (!requirement) throw new NotFoundError(`Requirement not found: ${requirementId}`);
    const submission = [...project.submissions]
      .filter((s) => s.requirementIds.includes(requirementId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .pop();
    return evaluateCompletionGate({ submission, requirement, pendingSuggestionCount: 0 });
  }

  // ---------------------------------------------------- messages & artifacts

  /**
   * Send a structured agent message (V-025). Every message must reference a project object.
   * When the loop guard trips, the message is re-addressed to the user rather than dropped, so
   * the content survives and the agents stop retrying (V-027).
   */
  sendMessage(
    projectId: string,
    params: {
      kind: MessageKind;
      fromAgentId: string;
      toAgentId?: string;
      body: string;
      links: MessageLink[];
      threadId?: string;
      replyToId?: string;
    },
  ): AgentMessage {
    const project = this.getProject(projectId);

    validateLinks(params.kind, params.links);
    // Messages are stored and shown; a secret must not travel between agents this way (V-048).
    assertNoSecrets(params.body, "an agent message");
    if (requiresRecipient(params.kind) && !params.toAgentId) {
      throw new MissingRecipientError(params.kind);
    }

    // A reply joins the thread it answers; otherwise use the caller's thread or start a new one.
    const repliedTo = params.replyToId
      ? project.messages.find((m) => m.id === params.replyToId) ??
        this.archivedMessages(projectId).find((m) => m.id === params.replyToId)
      : undefined;
    if (params.replyToId && !repliedTo) {
      throw new NotFoundError(`Cannot reply to unknown message: ${params.replyToId}`);
    }
    const threadId = repliedTo?.threadId ?? params.threadId ?? newId("thread");

    // A reply can revive a thread that was archived in full. The guard counts only this thread,
    // so splice its history back in.
    //
    // The archive is consulted only when the thread might actually be in it: a freshly minted
    // thread id cannot have history, and scanning the sidecar for one would make every new
    // conversation O(total messages) — exactly the cost archiving exists to remove.
    const threadCouldBeArchived =
      (repliedTo !== undefined || params.threadId !== undefined) &&
      !project.messages.some((m) => m.threadId === threadId);
    const guardMessages = threadCouldBeArchived
      ? [...this.archivedMessages(projectId).filter((m) => m.threadId === threadId), ...project.messages]
      : project.messages;

    const verdict = checkLoopGuard(
      guardMessages,
      { threadId, fromAgentId: params.fromAgentId, toAgentId: params.toAgentId },
      project.messageLimits ?? DEFAULT_MESSAGE_LIMITS,
    );

    const message: AgentMessage = {
      id: newId("msg"),
      projectId,
      kind: verdict.escalate ? "escalation" : params.kind,
      fromAgentId: params.fromAgentId,
      // On escalation the recipient becomes the user, expressed as an absent toAgentId.
      toAgentId: verdict.escalate ? undefined : params.toAgentId,
      body: params.body,
      links: params.links,
      threadId,
      replyToId: params.replyToId,
      createdAt: nowIso(),
      autoEscalated: verdict.escalate || undefined,
      escalationReason: verdict.reason,
    };

    project.messages.push(message);
    this.persist(project);
    return message;
  }

  listMessages(
    projectId: string,
    filter: {
      threadId?: string;
      agentId?: string;
      kind?: MessageKind;
      unreadOnly?: boolean;
      /**
       * Messages referencing a given project object, e.g. { linkKind: "requirement", linkId: "AUTH-01" }.
       *
       * Every message is required to carry links (V-025) and nothing could query them, so the
       * product's stated core value — connecting a requirement to the conversations responsible
       * for it (§21) — was not reachable even though the data was captured on every message.
       */
      linkKind?: string;
      linkId?: string;
      /** Include archived history. Off by default so the common case stays cheap. */
      includeArchived?: boolean;
    } = {},
  ): AgentMessage[] {
    const current = this.getProject(projectId).messages;
    let messages = filter.includeArchived
      ? [...this.archivedMessages(projectId), ...current]
      : current;
    if (filter.linkKind || filter.linkId) {
      messages = messages.filter((m) =>
        m.links.some(
          (l) =>
            (filter.linkKind === undefined || l.kind === filter.linkKind) &&
            (filter.linkId === undefined || l.id === filter.linkId),
        ),
      );
    }
    if (filter.threadId) messages = messages.filter((m) => m.threadId === filter.threadId);
    if (filter.kind) messages = messages.filter((m) => m.kind === filter.kind);
    if (filter.agentId) {
      messages = messages.filter((m) => m.fromAgentId === filter.agentId || m.toAgentId === filter.agentId);
    }
    if (filter.unreadOnly) messages = messages.filter((m) => !m.readAt);
    return messages;
  }

  markMessageRead(projectId: string, messageId: string): AgentMessage {
    const project = this.getProject(projectId);
    const message = project.messages.find((m) => m.id === messageId);
    if (!message) throw new NotFoundError(`Message not found: ${messageId}`);
    message.readAt = nowIso();
    this.persist(project);
    return message;
  }

  /** Messages awaiting the user — escalations and anything auto-diverted by the loop guard. */
  listEscalations(projectId: string): AgentMessage[] {
    return this.getProject(projectId).messages.filter((m) => m.kind === "escalation" && !m.readAt);
  }

  createArtifact(
    projectId: string,
    params: {
      kind: ArtifactKind;
      name: string;
      producedByAgentId: string;
      content?: string;
      uri?: string;
      requirementId?: string;
      taskId?: string;
      branch?: string;
    },
  ): CodeArtifact {
    if (params.content) assertNoSecrets(params.content, `artifact "${params.name}"`);
    const project = this.getProject(projectId);
    const artifact: CodeArtifact = {
      id: newId("art"),
      projectId,
      kind: params.kind,
      name: params.name,
      producedByAgentId: params.producedByAgentId,
      content: params.content,
      uri: params.uri,
      requirementId: params.requirementId,
      taskId: params.taskId,
      branch: params.branch,
      createdAt: nowIso(),
    };
    project.artifacts.push(artifact);
    this.persist(project);
    return artifact;
  }

  getArtifact(projectId: string, artifactId: string): CodeArtifact {
    const found = this.getProject(projectId).artifacts.find((a) => a.id === artifactId);
    if (!found) throw new NotFoundError(`Artifact not found: ${artifactId}`);
    return found;
  }

  /**
   * Associate an existing artifact with a requirement (and optionally a task).
   *
   * `listArtifacts` filters on `artifact.requirementId`, so an artifact that is not stamped with
   * one is unfindable from its requirement. The MCP tool that claims to do this only sent a
   * message saying it had happened, which reported success while attaching nothing.
   */
  attachArtifactToRequirement(
    projectId: string,
    artifactId: string,
    requirementId: string,
    taskId?: string,
  ): CodeArtifact {
    const project = this.getProject(projectId);
    const artifact = project.artifacts.find((a) => a.id === artifactId);
    if (!artifact) throw new NotFoundError(`Artifact not found: ${artifactId}`);
    if (!project.requirements.some((r) => r.id === requirementId)) {
      throw new NotFoundError(`Requirement not found: ${requirementId}`);
    }
    artifact.requirementId = requirementId;
    if (taskId) artifact.taskId = taskId;
    this.persist(project);
    return artifact;
  }

  /**
   * Accumulate cost against a task and enforce its cap (§16).
   *
   * `CodingTask.budgetUsd` was settable through the API and enforced nowhere, and `task.costUsd`
   * was initialised to zero and never updated from live agent work — so a per-task cap was a
   * control that did nothing, which §22.18 explicitly forbids. The `"task"` scope already existed
   * in `evaluateBudget` and `BudgetExceededError`; only the wiring was missing.
   *
   * Like the agent and project caps, the cost is recorded before the limit is checked: the tokens
   * were already spent, and dropping the charge would make the ledger understate real spending.
   */
  recordTaskCost(
    projectId: string,
    taskId: string,
    costUsd: number,
    opts: { warningThreshold?: number; estimated?: boolean } = {},
  ): { task: CodingTask; budget: BudgetSnapshot } {
    const project = this.getProject(projectId);
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);

    task.costUsd = Number(((task.costUsd ?? 0) + costUsd).toFixed(10));
    task.updatedAt = nowIso();

    const budget = evaluateBudget(
      "task",
      task.costUsd,
      task.budgetUsd,
      opts.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
      opts.estimated ?? false,
    );
    this.persist(project);

    if (budget.exceeded) {
      throw new BudgetExceededError(
        `task budget exceeded: $${budget.spent.toFixed(2)} of $${budget.limit?.toFixed(2)}. Execution paused.`,
        "task",
        budget.spent,
        budget.limit ?? 0,
      );
    }
    return { task, budget };
  }

  /** One message by id, including archived history. */
  getMessage(projectId: string, messageId: string): AgentMessage {
    const found =
      this.getProject(projectId).messages.find((m) => m.id === messageId) ??
      this.archivedMessages(projectId).find((m) => m.id === messageId);
    if (!found) throw new NotFoundError(`Message not found: ${messageId}`);
    return found;
  }

  listArtifacts(projectId: string, filter: { requirementId?: string; taskId?: string } = {}): CodeArtifact[] {
    let artifacts = this.getProject(projectId).artifacts;
    if (filter.requirementId) artifacts = artifacts.filter((a) => a.requirementId === filter.requirementId);
    if (filter.taskId) artifacts = artifacts.filter((a) => a.taskId === filter.taskId);
    return artifacts;
  }

  /**
   * V-026: one agent produces an artifact and hands it to another, with the related context
   * attached. Returns both so the caller can surface the pair to the user.
   */
  handoffArtifact(
    projectId: string,
    params: {
      fromAgentId: string;
      toAgentId: string;
      artifact: {
        kind: ArtifactKind;
        name: string;
        content?: string;
        uri?: string;
        requirementId?: string;
        taskId?: string;
        branch?: string;
      };
      body: string;
      threadId?: string;
    },
  ): { artifact: CodeArtifact; message: AgentMessage } {
    const artifact = this.createArtifact(projectId, {
      ...params.artifact,
      producedByAgentId: params.fromAgentId,
    });

    // The handoff message carries the artifact plus whatever context it belongs to.
    const links: MessageLink[] = [{ kind: "artifact", id: artifact.id }];
    if (params.artifact.taskId) links.push({ kind: "task", id: params.artifact.taskId });
    if (params.artifact.requirementId) links.push({ kind: "requirement", id: params.artifact.requirementId });
    if (params.artifact.branch) links.push({ kind: "branch", id: params.artifact.branch });

    const message = this.sendMessage(projectId, {
      kind: "handoff",
      fromAgentId: params.fromAgentId,
      toAgentId: params.toAgentId,
      body: params.body,
      links,
      threadId: params.threadId,
    });

    return { artifact, message };
  }

  setMessageLimits(projectId: string, limits: MessageLimits): MessageLimits {
    const project = this.getProject(projectId);
    project.messageLimits = limits;
    this.persist(project);
    return limits;
  }

  // ------------------------------------------------------------- suggestions

  /** An agent proposes a document change rather than editing it directly (§4, V-015). */
  submitSuggestion(
    projectId: string,
    params: {
      authorAgentId: string;
      originalText: string;
      proposedText: string;
      reason: string;
      requirementId?: string;
      affectedFiles?: string[];
      risks?: string;
      baseVersion?: number;
    },
  ): DesignSuggestion {
    const project = this.getProject(projectId);
    const baseVersion = params.baseVersion ?? project.document.currentVersion;

    const suggestion: DesignSuggestion = {
      id: newId("sug"),
      projectId,
      requirementId: params.requirementId,
      authorAgentId: params.authorAgentId,
      baseVersion,
      originalText: params.originalText,
      proposedText: params.proposedText,
      reason: params.reason,
      affectedFiles: params.affectedFiles ?? [],
      risks: params.risks,
      // Submitted against an already-superseded version: stale on arrival (V-016).
      state: baseVersion < project.document.currentVersion ? "stale" : "pending",
      createdAt: nowIso(),
    };

    project.suggestions.push(suggestion);
    this.persist(project);
    return suggestion;
  }

  listSuggestions(projectId: string, state?: SuggestionState): DesignSuggestion[] {
    const all = this.getProject(projectId).suggestions;
    return state ? all.filter((s) => s.state === state) : all;
  }

  /**
   * Amend a suggestion before accepting it (V-015: the user may "accept, reject, edit, or request
   * revision"). Only the user may edit — an agent editing its own proposal after review would
   * defeat the review gate. The original proposal is retained for provenance.
   */
  editSuggestion(
    projectId: string,
    suggestionId: string,
    patch: { proposedText?: string; reason?: string; risks?: string; affectedFiles?: string[] },
    actor: Actor,
  ): DesignSuggestion {
    const project = this.getProject(projectId);
    const suggestion = project.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) throw new NotFoundError(`Suggestion not found: ${suggestionId}`);

    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may edit a design suggestion (actor: ${actor.id})`);
    }
    if (suggestion.state !== "pending" && suggestion.state !== "revision_requested") {
      throw new Error(`Suggestion ${suggestionId} is ${suggestion.state} and can no longer be edited`);
    }

    if (patch.proposedText !== undefined && patch.proposedText !== suggestion.proposedText) {
      // Keep the agent's original wording the first time the user overrides it.
      if (suggestion.originalProposedText === undefined) {
        suggestion.originalProposedText = suggestion.proposedText;
      }
      suggestion.proposedText = patch.proposedText;
    }
    if (patch.reason !== undefined) suggestion.reason = patch.reason;
    if (patch.risks !== undefined) suggestion.risks = patch.risks;
    if (patch.affectedFiles !== undefined) suggestion.affectedFiles = patch.affectedFiles;

    suggestion.editedBy = actor.id;
    suggestion.editedAt = nowIso();
    // An edited suggestion returns to pending so it can be accepted.
    suggestion.state = "pending";

    this.persist(project);
    return suggestion;
  }

  /**
   * Resolve a suggestion. Only the user may accept — accepting applies the proposed text and
   * creates a new document version (V-015). A stale suggestion is never silently applied (V-016).
   */
  resolveSuggestion(
    projectId: string,
    suggestionId: string,
    action: "accept" | "reject" | "request_revision",
    actor: Actor,
    note?: string,
  ): { suggestion: DesignSuggestion; newVersion?: number } {
    const project = this.getProject(projectId);
    const suggestion = project.suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) throw new NotFoundError(`Suggestion not found: ${suggestionId}`);

    if (actor.kind !== "user") {
      throw new PermissionDeniedError(`Only the user may resolve design suggestions (actor: ${actor.id})`);
    }
    if (suggestion.state !== "pending") {
      if (suggestion.state === "stale" && action === "accept") {
        throw new VersionConflictError(
          `Suggestion ${suggestionId} was written against document version ${suggestion.baseVersion}, ` +
            `which is no longer current (${project.document.currentVersion}). Rebase or re-run it before accepting.`,
          suggestion.baseVersion,
          project.document.currentVersion,
        );
      }
      throw new Error(`Suggestion ${suggestionId} is ${suggestion.state}, not pending`);
    }

    suggestion.resolvedAt = nowIso();
    suggestion.resolvedBy = actor.id;
    suggestion.resolutionNote = note;

    if (action === "reject") {
      suggestion.state = "rejected";
      this.persist(project);
      return { suggestion };
    }
    if (action === "request_revision") {
      suggestion.state = "revision_requested";
      this.persist(project);
      return { suggestion };
    }

    // Accept: apply the proposed text to produce a new canonical version.
    suggestion.state = "accepted";
    const current = project.document.versions.find((v) => v.version === project.document.currentVersion);
    const currentContent = current?.content ?? "";
    const nextContent = suggestion.originalText
      ? currentContent.replace(suggestion.originalText, suggestion.proposedText)
      : `${currentContent}\n\n${suggestion.proposedText}`.trim();

    this.persist(project);
    const updated = this.updateDocument(projectId, nextContent, actor, {
      changeSummary: `Accepted suggestion from ${suggestion.authorAgentId}: ${suggestion.reason}`,
      fromSuggestionId: suggestion.id,
    });

    return { suggestion, newVersion: updated.document.currentVersion };
  }
}

/** Default store, rooted alongside the rest of OpenUI state in ~/.openui. */
function projectsDir(): string {
  return join(process.env.OPENUI_DATA_DIR || join(homedir(), ".openui"), "projects");
}

let defaultStore: ProjectStore | null = null;
let defaultStoreDir: string | null = null;

/**
 * Process-wide store. Rebuilt when the configured data directory changes rather than caching the
 * first one forever — otherwise the directory is fixed by whichever caller happened to run first,
 * which is both untestable and wrong if the configuration changes.
 */
export function getProjectStore(): ProjectStore {
  const dir = projectsDir();
  if (!defaultStore || defaultStoreDir !== dir) {
    defaultStore = new ProjectStore(dir);
    defaultStoreDir = dir;
  }
  return defaultStore;
}
