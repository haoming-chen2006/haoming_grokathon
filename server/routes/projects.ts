import { Hono } from "hono";
import {
  getProjectStore,
  NotFoundError,
  PermissionDeniedError,
  VersionConflictError,
} from "../services/projectStore";
import { DependencyCycleError, PlanNotApprovedError, TaskBlockedError } from "../services/taskGraph";
import { MissingRecipientError, UnlinkedMessageError } from "../services/messaging";
import { getControlRoomBus } from "../services/controlRoomEvents";
import { CompletionGateError, IncompleteSubmissionError } from "../services/codeReview";
import { getAcpSessionManager } from "../services/acpSessionManager";
import type { Actor } from "../types/project";

export const projectRoutes = new Hono();

/**
 * Resolve the acting identity from request headers.
 *
 * Defaults to the user, because the browser UI is the only unauthenticated caller. Agent traffic
 * arrives through the Project MCP server, which sets these headers explicitly. An agent can never
 * escalate itself by claiming `kind=user`: the header is only trusted to *narrow* privilege, so
 * anything presenting an agent id is treated as an agent.
 */
function actorFrom(c: any): Actor {
  const id = c.req.header("x-openui-actor-id");
  const kind = c.req.header("x-openui-actor-kind");
  if (!id || kind !== "agent") return { kind: "user", id: "user" };
  return {
    kind: "agent",
    id,
    canWriteDocument: c.req.header("x-openui-actor-doc-write") === "true",
  };
}

/** Map domain errors onto HTTP status codes so the backend visibly rejects bad operations. */
function fail(c: any, err: unknown) {
  if (err instanceof PermissionDeniedError) {
    return c.json({ error: err.message, code: err.code }, 403);
  }
  if (err instanceof VersionConflictError) {
    return c.json(
      { error: err.message, code: err.code, baseVersion: err.baseVersion, currentVersion: err.currentVersion },
      409,
    );
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message, code: err.code }, 404);
  }
  // The plan gate and the dependency gate are separate 409s so a client can tell them apart.
  if (err instanceof PlanNotApprovedError) {
    return c.json({ error: err.message, code: err.code }, 409);
  }
  if (err instanceof TaskBlockedError) {
    return c.json({ error: err.message, code: err.code, blockedBy: err.blockedBy }, 409);
  }
  if (err instanceof DependencyCycleError) {
    return c.json({ error: err.message, code: err.code, cycle: err.cycle }, 400);
  }
  if (err instanceof UnlinkedMessageError || err instanceof MissingRecipientError) {
    return c.json({ error: err.message, code: err.code }, 400);
  }
  if (err instanceof IncompleteSubmissionError) {
    return c.json({ error: err.message, code: err.code, missing: err.missing }, 400);
  }
  // The completion gate is a precondition failure, not a bad request.
  if (err instanceof CompletionGateError) {
    return c.json({ error: err.message, code: err.code, unmet: err.unmet }, 409);
  }
  return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
}

projectRoutes.get("/", (c) => c.json(getProjectStore().listProjects()));

projectRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.name) return c.json({ error: "name is required" }, 400);
    if (!body?.repositoryPath) return c.json({ error: "repositoryPath is required" }, 400);
    return c.json(
      getProjectStore().createProject({
        name: body.name,
        goal: body.goal ?? "",
        repositoryPath: body.repositoryPath,
        baseBranch: body.baseBranch,
        documentTitle: body.documentTitle,
        documentContent: body.documentContent,
        budgetUsd: body.budgetUsd,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id", (c) => {
  try {
    return c.json(getProjectStore().getProject(c.req.param("id")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.delete("/:id", (c) => {
  getProjectStore().deleteProject(c.req.param("id"));
  return c.json({ success: true });
});

// ------------------------------------------------------------------ document

projectRoutes.get("/:id/document", (c) => {
  try {
    return c.json(getProjectStore().getDocument(c.req.param("id")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/document/versions/:version", (c) => {
  try {
    return c.json(
      getProjectStore().getDocumentVersion(c.req.param("id"), Number(c.req.param("version"))),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.put("/:id/document", async (c) => {
  try {
    const body = await c.req.json();
    if (typeof body?.content !== "string") return c.json({ error: "content is required" }, 400);
    const project = getProjectStore().updateDocument(c.req.param("id"), body.content, actorFrom(c), {
      changeSummary: body.changeSummary,
      expectedVersion: body.expectedVersion,
    });
    return c.json({ version: project.document.currentVersion });
  } catch (err) {
    return fail(c, err);
  }
});

// -------------------------------------------------------------- requirements

projectRoutes.get("/:id/requirements", (c) => {
  try {
    return c.json(getProjectStore().getProject(c.req.param("id")).requirements);
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/requirements", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.id) return c.json({ error: "requirement id is required" }, 400);
    return c.json(
      getProjectStore().addRequirement(
        c.req.param("id"),
        {
          id: body.id,
          description: body.description ?? "",
          acceptanceCriteria: body.acceptanceCriteria,
          designSection: body.designSection,
          ownerAgentId: body.ownerAgentId,
        },
        actorFrom(c),
      ),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/requirements/:reqId", (c) => {
  try {
    return c.json(getProjectStore().getRequirement(c.req.param("id"), c.req.param("reqId")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.patch("/:id/requirements/:reqId", async (c) => {
  try {
    const projectId = c.req.param("id");
    const body = await c.req.json();
    const store = getProjectStore();
    const requirement = store.updateRequirement(projectId, c.req.param("reqId"), body, actorFrom(c));

    const bus = getControlRoomBus();
    bus.publish(projectId, {
      type: "requirement_status",
      requirementId: requirement.id,
      status: requirement.status,
    });
    // Progress is derived from requirement statuses, so it changes with them (V-020).
    const progress = store.getProgress(projectId);
    bus.publish(projectId, {
      type: "progress",
      percent: progress.percent,
      completed: progress.completed,
      total: progress.total,
    });

    return c.json(requirement);
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/progress", (c) => {
  try {
    return c.json(getProjectStore().getProgress(c.req.param("id")));
  } catch (err) {
    return fail(c, err);
  }
});

// ---------------------------------------------------------- plan and tasks

projectRoutes.get("/:id/plan", (c) => {
  try {
    const plan = getProjectStore().getProject(c.req.param("id")).plan;
    if (!plan) return c.json({ error: "Project has no implementation plan", code: "NOT_FOUND" }, 404);
    return c.json(plan);
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/plan", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      getProjectStore().createPlan(
        c.req.param("id"),
        { milestones: body?.milestones, authorAgentId: body?.authorAgentId },
        actorFrom(c),
      ),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.patch("/:id/plan", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(getProjectStore().updatePlan(c.req.param("id"), { milestones: body?.milestones }, actorFrom(c)));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/plan/approve", (c) => {
  try {
    return c.json(getProjectStore().approvePlan(c.req.param("id"), actorFrom(c)));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/tasks", (c) => {
  try {
    return c.json(getProjectStore().listTasks(c.req.param("id")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/tasks", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.objective) return c.json({ error: "objective is required" }, 400);
    return c.json(getProjectStore().addTask(c.req.param("id"), body, actorFrom(c)), 201);
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/tasks/:taskId", (c) => {
  try {
    return c.json(getProjectStore().getTask(c.req.param("id"), c.req.param("taskId")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.patch("/:id/tasks/:taskId", async (c) => {
  try {
    const projectId = c.req.param("id");
    const body = await c.req.json();
    const store = getProjectStore();
    const result = store.updateTask(projectId, c.req.param("taskId"), body, actorFrom(c));

    // Push the transition and any dependents it unblocked, so waiting agents flip to ready
    // without a refresh (V-019).
    const tasks = store.listTasks(projectId);
    const updated = tasks.find((t) => t.id === result.task.id);
    getControlRoomBus().publish(projectId, {
      type: "task_status",
      taskId: result.task.id,
      status: result.task.status,
      effectiveStatus: updated?.effectiveStatus ?? result.task.status,
      unblocked: result.unblocked.map((t) => t.id),
    });

    return c.json(result);
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * V-018: launch a Grok session for a task. The approval gate is enforced here — this is the only
 * path that starts an agent, so a draft plan cannot produce a running session.
 */
projectRoutes.post("/:id/tasks/:taskId/launch", async (c) => {
  try {
    const projectId = c.req.param("id");
    const taskId = c.req.param("taskId");
    const store = getProjectStore();

    // Throws PlanNotApprovedError or TaskBlockedError, mapped to 409 by fail().
    const task = store.assertTaskLaunchable(projectId, taskId);
    if (!task.assignedAgentId) {
      return c.json({ error: `Task ${taskId} has no assigned agent to launch`, code: "NO_AGENT" }, 400);
    }

    const session = await getAcpSessionManager().open(task.assignedAgentId);
    store.updateTask(projectId, taskId, { status: "working" }, { kind: "user", id: "user" });
    return c.json({ taskId, agentId: task.assignedAgentId, session }, 201);
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/execution-order", (c) => {
  try {
    return c.json(getProjectStore().getExecutionOrder(c.req.param("id")).map((t) => t.id));
  } catch (err) {
    return fail(c, err);
  }
});

// ------------------------------------------------------- code review & merge

projectRoutes.get("/:id/submissions", (c) => {
  try {
    return c.json(
      getProjectStore().listSubmissions(c.req.param("id"), {
        taskId: c.req.query("taskId") ?? undefined,
        state: (c.req.query("state") as any) ?? undefined,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

/** V-037: submit code for review; refused unless it carries the required evidence. */
projectRoutes.post("/:id/submissions", async (c) => {
  try {
    const body = await c.req.json();
    const actor = actorFrom(c);
    return c.json(
      getProjectStore().submitCode(c.req.param("id"), { ...body, agentId: body.agentId ?? actor.id }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/submissions/:submissionId", (c) => {
  try {
    return c.json(getProjectStore().getSubmission(c.req.param("id"), c.req.param("submissionId")));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-038: request changes; the task returns to the agent with feedback. */
projectRoutes.post("/:id/submissions/:submissionId/request-changes", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(
      getProjectStore().requestChanges(
        c.req.param("id"),
        c.req.param("submissionId"),
        body?.feedback ?? "",
        actorFrom(c),
      ),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/submissions/:submissionId/approve", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      getProjectStore().approveSubmission(
        c.req.param("id"),
        c.req.param("submissionId"),
        actorFrom(c),
        body?.note,
      ),
    );
  } catch (err) {
    return fail(c, err);
  }
});

/** V-039: record a completed merge. A commit is mandatory. */
projectRoutes.post("/:id/submissions/:submissionId/merge", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(
      getProjectStore().recordMerge(
        c.req.param("id"),
        c.req.param("submissionId"),
        body?.mergeCommit ?? "",
        actorFrom(c),
      ),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/requirements/:reqId/completion-gate", (c) => {
  try {
    return c.json(getProjectStore().completionGate(c.req.param("id"), c.req.param("reqId")));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-040: complete a requirement only when every gate has passed. */
projectRoutes.post("/:id/requirements/:reqId/complete", (c) => {
  try {
    const projectId = c.req.param("id");
    const result = getProjectStore().completeRequirement(projectId, c.req.param("reqId"), actorFrom(c));
    const progress = getProjectStore().getProgress(projectId);
    getControlRoomBus().publish(projectId, {
      type: "progress",
      percent: progress.percent,
      completed: progress.completed,
      total: progress.total,
    });
    return c.json(result);
  } catch (err) {
    return fail(c, err);
  }
});

// ------------------------------------------------------ messages & artifacts

projectRoutes.get("/:id/messages", (c) => {
  try {
    return c.json(
      getProjectStore().listMessages(c.req.param("id"), {
        threadId: c.req.query("threadId") ?? undefined,
        agentId: c.req.query("agentId") ?? undefined,
        kind: (c.req.query("kind") as any) ?? undefined,
        unreadOnly: c.req.query("unread") === "true",
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/messages", async (c) => {
  try {
    const body = await c.req.json();
    const actor = actorFrom(c);
    if (!body?.kind) return c.json({ error: "kind is required" }, 400);
    if (!body?.body) return c.json({ error: "body is required" }, 400);
    return c.json(
      getProjectStore().sendMessage(c.req.param("id"), {
        kind: body.kind,
        fromAgentId: body.fromAgentId ?? actor.id,
        toAgentId: body.toAgentId,
        body: body.body,
        links: body.links ?? [],
        threadId: body.threadId,
        replyToId: body.replyToId,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.patch("/:id/messages/:messageId/read", (c) => {
  try {
    return c.json(getProjectStore().markMessageRead(c.req.param("id"), c.req.param("messageId")));
  } catch (err) {
    return fail(c, err);
  }
});

/** Messages awaiting the user (V-025 escalate_to_user, V-027 loop escalation). */
projectRoutes.get("/:id/escalations", (c) => {
  try {
    return c.json(getProjectStore().listEscalations(c.req.param("id")));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.put("/:id/message-limits", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(
      getProjectStore().setMessageLimits(c.req.param("id"), {
        maxThreadLength: body.maxThreadLength,
        maxUnansweredPerPair: body.maxUnansweredPerPair,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/artifacts", (c) => {
  try {
    return c.json(
      getProjectStore().listArtifacts(c.req.param("id"), {
        requirementId: c.req.query("requirementId") ?? undefined,
        taskId: c.req.query("taskId") ?? undefined,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/artifacts", async (c) => {
  try {
    const body = await c.req.json();
    const actor = actorFrom(c);
    if (!body?.kind || !body?.name) return c.json({ error: "kind and name are required" }, 400);
    return c.json(
      getProjectStore().createArtifact(c.req.param("id"), {
        ...body,
        producedByAgentId: body.producedByAgentId ?? actor.id,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.get("/:id/artifacts/:artifactId", (c) => {
  try {
    return c.json(getProjectStore().getArtifact(c.req.param("id"), c.req.param("artifactId")));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-026: produce an artifact and hand it to another agent with its context attached. */
projectRoutes.post("/:id/handoffs", async (c) => {
  try {
    const body = await c.req.json();
    const actor = actorFrom(c);
    if (!body?.toAgentId) return c.json({ error: "toAgentId is required" }, 400);
    if (!body?.artifact) return c.json({ error: "artifact is required" }, 400);
    return c.json(
      getProjectStore().handoffArtifact(c.req.param("id"), {
        fromAgentId: body.fromAgentId ?? actor.id,
        toAgentId: body.toAgentId,
        artifact: body.artifact,
        body: body.body ?? `Artifact ${body.artifact.name} ready`,
        threadId: body.threadId,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

// --------------------------------------------------------------- suggestions

projectRoutes.get("/:id/suggestions", (c) => {
  try {
    const state = c.req.query("state") as any;
    return c.json(getProjectStore().listSuggestions(c.req.param("id"), state));
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/suggestions", async (c) => {
  try {
    const body = await c.req.json();
    const actor = actorFrom(c);
    if (!body?.proposedText) return c.json({ error: "proposedText is required" }, 400);
    if (!body?.reason) return c.json({ error: "reason is required" }, 400);
    return c.json(
      getProjectStore().submitSuggestion(c.req.param("id"), {
        authorAgentId: body.authorAgentId ?? actor.id,
        originalText: body.originalText ?? "",
        proposedText: body.proposedText,
        reason: body.reason,
        requirementId: body.requirementId,
        affectedFiles: body.affectedFiles,
        risks: body.risks,
        baseVersion: body.baseVersion,
      }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.patch("/:id/suggestions/:suggestionId", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(
      getProjectStore().editSuggestion(
        c.req.param("id"),
        c.req.param("suggestionId"),
        {
          proposedText: body?.proposedText,
          reason: body?.reason,
          risks: body?.risks,
          affectedFiles: body?.affectedFiles,
        },
        actorFrom(c),
      ),
    );
  } catch (err) {
    return fail(c, err);
  }
});

projectRoutes.post("/:id/suggestions/:suggestionId/resolve", async (c) => {
  try {
    const body = await c.req.json();
    const action = body?.action;
    if (!["accept", "reject", "request_revision"].includes(action)) {
      return c.json({ error: "action must be accept, reject or request_revision" }, 400);
    }
    return c.json(
      getProjectStore().resolveSuggestion(
        c.req.param("id"),
        c.req.param("suggestionId"),
        action,
        actorFrom(c),
        body?.note,
      ),
    );
  } catch (err) {
    return fail(c, err);
  }
});
