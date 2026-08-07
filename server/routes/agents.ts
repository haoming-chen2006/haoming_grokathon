import { Hono } from "hono";
import { BudgetExceededError, getAgentRegistry, statusPresentation } from "../services/agentRegistry";
import { getControlRoomBus } from "../services/controlRoomEvents";
import {
  NoLiveSessionError,
  SessionPausedError,
  getAcpSessionManager,
} from "../services/acpSessionManager";
import { AGENT_RUNTIME_STATUSES, AGENT_STATUS_PRESENTATION } from "../types/agent";
import { getProjectStore } from "../services/projectStore";
import type { BudgetSnapshot } from "../services/agentRegistry";

export const agentRoutes = new Hono();

function fail(c: any, err: unknown) {
  if (err instanceof NoLiveSessionError) {
    return c.json({ error: err.message, code: err.code }, 409);
  }
  if (err instanceof SessionPausedError) {
    return c.json({ error: err.message, code: err.code }, 409);
  }
  if (err instanceof BudgetExceededError) {
    return c.json(
      { error: err.message, code: err.code, scope: err.scope, spent: err.spent, limit: err.limit },
      402, // Payment Required — the spend gate, distinct from a permission failure.
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("not found")) return c.json({ error: message, code: "NOT_FOUND" }, 404);
  return c.json({ error: message }, 400);
}

/** Status vocabulary with labels, so the UI never has to invent text for a colour (V-022). */
agentRoutes.get("/statuses", (c) =>
  c.json({
    statuses: AGENT_RUNTIME_STATUSES,
    presentation: AGENT_STATUS_PRESENTATION,
  }),
);

agentRoutes.get("/", (c) => c.json(getAgentRegistry().list(c.req.query("projectId") ?? undefined)));

agentRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.projectId) return c.json({ error: "projectId is required" }, 400);
    if (!body?.name) return c.json({ error: "name is required" }, 400);
    if (!body?.role) return c.json({ error: "role is required" }, 400);
    return c.json(getAgentRegistry().create(body), 201);
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.get("/templates", (c) => c.json(getAgentRegistry().listTemplates()));

agentRoutes.post("/templates", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.name || !body?.role) return c.json({ error: "name and role are required" }, 400);
    return c.json(getAgentRegistry().saveTemplate(body), 201);
  } catch (err) {
    return fail(c, err);
  }
});

/** V-041: instantiate a saved template into a project. */
agentRoutes.post("/templates/:templateId/instantiate", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.projectId) return c.json({ error: "projectId is required" }, 400);
    return c.json(
      getAgentRegistry().createFromTemplate(c.req.param("templateId"), body.projectId, { name: body.name }),
      201,
    );
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.get("/:agentId", (c) => {
  try {
    const agent = getAgentRegistry().get(c.req.param("agentId"));
    return c.json({ ...agent, statusPresentation: statusPresentation(agent.status) });
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.delete("/:agentId", (c) => {
  getAgentRegistry().remove(c.req.param("agentId"));
  return c.json({ success: true });
});

agentRoutes.patch("/:agentId/status", async (c) => {
  try {
    const body = await c.req.json();
    const agent = getAgentRegistry().setStatus(c.req.param("agentId"), body.status, body.detail);
    getControlRoomBus().publish(agent.projectId, {
      type: "agent_status",
      agentId: agent.id,
      status: agent.status,
      statusDetail: agent.statusDetail,
    });
    return c.json({ ...agent, statusPresentation: statusPresentation(agent.status) });
  } catch (err) {
    return fail(c, err);
  }
});

/** V-024: report observed coding activity. */
agentRoutes.patch("/:agentId/activity", async (c) => {
  try {
    const body = await c.req.json();
    const agent = getAgentRegistry().updateActivity(c.req.param("agentId"), body);
    getControlRoomBus().publish(agent.projectId, {
      type: "agent_activity",
      agentId: agent.id,
      activity: agent.activity,
    });
    return c.json(agent);
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.patch("/:agentId/task", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.taskId) return c.json({ error: "taskId is required" }, 400);
    return c.json(
      getAgentRegistry().assignTask(c.req.param("agentId"), body.taskId, {
        branch: body.branch,
        worktree: body.worktree,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.patch("/:agentId/position", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(getAgentRegistry().setPosition(c.req.param("agentId"), { x: body.x, y: body.y }));
  } catch (err) {
    return fail(c, err);
  }
});

/** V-045 + V-046: record usage; 402 when a configured cap is reached. */
agentRoutes.post("/:agentId/usage", async (c) => {
  try {
    const body = await c.req.json();
    const agentId = c.req.param("agentId");
    const agent = getAgentRegistry().get(agentId);
    let projectBudget: number | undefined;
    try {
      projectBudget = getProjectStore().getProject(agent.projectId).budgetUsd;
    } catch {
      projectBudget = body.projectBudgetUsd;
    }
    const result = getAgentRegistry().recordUsage(
      agentId,
      { costUsd: body.costUsd, tokens: body.tokens, estimated: body.estimated },
      projectBudget,
      body.warningThreshold,
    );

    // §16 also caps a coding task. The agent's current task is the one the spend belongs to.
    let taskBudget: BudgetSnapshot | undefined;
    if (agent.currentTaskId && body.costUsd) {
      taskBudget = getProjectStore().recordTaskCost(agent.projectId, agent.currentTaskId, body.costUsd, {
        warningThreshold: body.warningThreshold,
        estimated: body.estimated,
      }).budget;
    }

    const bus = getControlRoomBus();
    const summary = getAgentRegistry().costSummary(agent.projectId, projectBudget);
    bus.publish(agent.projectId, {
      type: "cost",
      projectCostUsd: summary.projectCostUsd,
      projectBudgetUsd: summary.projectBudgetUsd,
      byAgent: summary.byAgent.map((a) => ({ agentId: a.agentId, name: a.name, costUsd: a.costUsd })),
    });
    // Warn before the hard stop, so the user sees it coming (V-046).
    const snapshots: BudgetSnapshot[] = [result.agentBudget, result.projectBudget];
    if (taskBudget) snapshots.push(taskBudget);
    for (const snapshot of snapshots) {
      if (snapshot.warning && snapshot.limit !== undefined) {
        bus.publish(agent.projectId, {
          type: "budget_warning",
          scope: snapshot.scope,
          spent: snapshot.spent,
          limit: snapshot.limit,
          fraction: snapshot.fraction ?? 0,
        });
      }
    }

    return c.json(taskBudget ? { ...result, taskBudget } : result);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      try {
        const agent = getAgentRegistry().get(c.req.param("agentId"));
        getControlRoomBus().publish(agent.projectId, {
          type: "budget_exceeded",
          scope: err.scope,
          spent: err.spent,
          limit: err.limit,
        });
      } catch {
        // The agent lookup failing must not mask the original budget error.
      }
    }
    return fail(c, err);
  }
});

agentRoutes.get("/costs/:projectId", (c) => {
  try {
    let budget: number | undefined;
    try {
      budget = getProjectStore().getProject(c.req.param("projectId")).budgetUsd;
    } catch {
      budget = undefined;
    }
    return c.json(getAgentRegistry().costSummary(c.req.param("projectId"), budget));
  } catch (err) {
    return fail(c, err);
  }
});

// ------------------------------------------------- live session drawer (V-023)

/** Open (or reopen) an agent's Grok session — what clicking an agent card does. */
agentRoutes.post("/:agentId/session", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const session = await getAcpSessionManager().open(c.req.param("agentId"), {
      resume: body?.resume === true,
    });
    return c.json(session);
  } catch (err) {
    return fail(c, err);
  }
});

/** Transcript, optionally only what is new since a sequence number. */
agentRoutes.get("/:agentId/session", (c) => {
  try {
    const manager = getAcpSessionManager();
    const agentId = c.req.param("agentId");
    const since = Number(c.req.query("since") ?? 0);
    const session = manager.get(agentId);
    return c.json({ ...session, transcript: manager.transcript(agentId, since) });
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.post("/:agentId/session/message", async (c) => {
  try {
    const body = await c.req.json();
    const added = await getAcpSessionManager().send(c.req.param("agentId"), body?.text ?? "");
    return c.json({ added });
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.post("/:agentId/session/pause", (c) => {
  try {
    return c.json(getAcpSessionManager().pause(c.req.param("agentId")));
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.post("/:agentId/session/resume", (c) => {
  try {
    return c.json(getAcpSessionManager().resume(c.req.param("agentId")));
  } catch (err) {
    return fail(c, err);
  }
});

agentRoutes.post("/:agentId/session/stop", (c) => {
  try {
    return c.json(getAcpSessionManager().stop(c.req.param("agentId")));
  } catch (err) {
    return fail(c, err);
  }
});
