import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  AgentRegistry,
  BudgetExceededError,
  deriveStatus,
  evaluateBudget,
  statusPresentation,
} from "./agentRegistry";
import { AGENT_RUNTIME_STATUSES, AGENT_STATUS_PRESENTATION } from "../types/agent";

let registry: AgentRegistry;
const PROJECT = "proj_1";

beforeEach(() => {
  registry = new AgentRegistry();
});

function makeAgent(name = "Backend Engineer", extra: Record<string, any> = {}) {
  return registry.create({ projectId: PROJECT, name, role: "Backend Engineer", ...extra });
}

describe("V-022: agent states are accurate", () => {
  test("all six required states exist", () => {
    expect(AGENT_RUNTIME_STATUSES).toEqual([
      "working",
      "waiting",
      "needs_review",
      "complete",
      "idle",
      "failed",
    ]);
  });

  test("every status carries non-empty text in addition to colour", () => {
    // The checklist is explicit: colour must never be the sole carrier of meaning.
    for (const status of AGENT_RUNTIME_STATUSES) {
      const p = statusPresentation(status);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.color.length).toBeGreaterThan(0);
      expect(p.status).toBe(status);
    }
  });

  test("the presentation map is total — no status can render without a label", () => {
    expect(Object.keys(AGENT_STATUS_PRESENTATION).sort()).toEqual([...AGENT_RUNTIME_STATUSES].sort());
  });

  test("labels are human-readable, not raw enum values", () => {
    expect(statusPresentation("needs_review").label).toBe("Needs Review");
    expect(statusPresentation("working").label).toBe("Working");
  });

  test("an unknown status throws rather than rendering blank", () => {
    expect(() => statusPresentation("bogus" as any)).toThrow(/Unknown agent status/);
  });

  test("status is derived from situation, not fabricated", () => {
    expect(deriveStatus({ hasFailed: true, sessionRunning: true })).toBe("failed");
    expect(deriveStatus({ taskComplete: true })).toBe("complete");
    expect(deriveStatus({ awaitingReview: true })).toBe("needs_review");
    expect(deriveStatus({ blocker: "Needs API contract" })).toBe("waiting");
    expect(deriveStatus({ sessionRunning: true })).toBe("working");
    expect(deriveStatus({})).toBe("idle");
  });

  test("failure outranks every other signal", () => {
    expect(deriveStatus({ hasFailed: true, taskComplete: true, awaitingReview: true })).toBe("failed");
  });

  test("a newly created agent is idle, never working", () => {
    expect(makeAgent().status).toBe("idle");
  });

  test("status changes carry an explanatory detail", () => {
    const agent = makeAgent();
    const updated = registry.setStatus(agent.id, "waiting", "Waiting for API contract");
    expect(updated.status).toBe("waiting");
    expect(updated.statusDetail).toBe("Waiting for API contract");
  });
});

describe("V-024: current coding activity is visible", () => {
  test("activity fields required by the design are all representable", () => {
    const agent = makeAgent();
    const updated = registry.updateActivity(agent.id, {
      command: "bun test",
      tool: "shell",
      taskId: "task-api",
      latestFile: "src/auth/session.ts",
      branch: "agent/auth-backend",
      testsPassing: 18,
      testsTotal: 20,
    });

    expect(updated.activity.command).toBe("bun test");
    expect(updated.activity.tool).toBe("shell");
    expect(updated.activity.latestFile).toBe("src/auth/session.ts");
    expect(updated.activity.branch).toBe("agent/auth-backend");
    expect(updated.activity.testsPassing).toBe(18);
    expect(updated.activity.testsTotal).toBe(20);
    expect(updated.activity.updatedAt).toBeTruthy();
  });

  test("a partial update does not blank fields it says nothing about", () => {
    const agent = makeAgent();
    registry.updateActivity(agent.id, { command: "bun test", latestFile: "a.ts" });
    const after = registry.updateActivity(agent.id, { tool: "edit" });

    expect(after.activity.tool).toBe("edit");
    expect(after.activity.command).toBe("bun test"); // preserved
    expect(after.activity.latestFile).toBe("a.ts"); // preserved
  });

  test("reporting a blocker moves the agent to waiting", () => {
    const agent = makeAgent();
    const updated = registry.updateActivity(agent.id, { blocker: "Waiting for API contract" });
    expect(updated.status).toBe("waiting");
    expect(updated.statusDetail).toBe("Waiting for API contract");
  });

  test("assigning a task records branch and worktree", () => {
    const agent = makeAgent();
    const updated = registry.assignTask(agent.id, "task-api", {
      branch: "agent/auth-backend",
      worktree: ".agents/agent-auth-backend",
    });
    expect(updated.currentTaskId).toBe("task-api");
    expect(updated.branch).toBe("agent/auth-backend");
    expect(updated.worktree).toBe(".agents/agent-auth-backend");
    expect(updated.activity.taskId).toBe("task-api");
  });
});

describe("V-045: usage is tracked per agent", () => {
  test("usage accumulates per agent and aggregates to the project", () => {
    const backend = makeAgent("Backend");
    const frontend = makeAgent("Frontend");

    registry.recordUsage(backend.id, { costUsd: 0.71, tokens: 1200 });
    registry.recordUsage(frontend.id, { costUsd: 0.16, tokens: 400 });

    const summary = registry.costSummary(PROJECT);
    expect(summary.projectCostUsd).toBeCloseTo(0.87, 6);
    expect(summary.byAgent).toHaveLength(2);
    expect(summary.byAgent.find((a) => a.name === "Backend")!.costUsd).toBeCloseTo(0.71, 6);
    expect(summary.byAgent.find((a) => a.name === "Backend")!.tokensUsed).toBe(1200);
  });

  test("repeated usage adds up rather than replacing", () => {
    const agent = makeAgent();
    registry.recordUsage(agent.id, { costUsd: 0.5 });
    registry.recordUsage(agent.id, { costUsd: 0.25 });
    expect(registry.get(agent.id).costUsd).toBeCloseTo(0.75, 6);
  });

  test("an estimated cost is labelled as such", () => {
    const agent = makeAgent();
    const { agentBudget } = registry.recordUsage(agent.id, { tokens: 500, estimated: true }, undefined);
    expect(agentBudget.estimated).toBe(true);
  });

  test("task cost aggregates across agents on that task", () => {
    const a = makeAgent("A");
    const b = makeAgent("B");
    registry.assignTask(a.id, "task-1");
    registry.assignTask(b.id, "task-1");
    registry.recordUsage(a.id, { costUsd: 1 });
    registry.recordUsage(b.id, { costUsd: 2 });
    expect(registry.taskCost(PROJECT, "task-1")).toBeCloseTo(3, 6);
  });

  test("agents from other projects are not counted", () => {
    const mine = makeAgent("Mine");
    const theirs = registry.create({ projectId: "other", name: "Theirs", role: "r" });
    registry.recordUsage(mine.id, { costUsd: 1 });
    registry.recordUsage(theirs.id, { costUsd: 99 });
    expect(registry.costSummary(PROJECT).projectCostUsd).toBeCloseTo(1, 6);
  });
});

describe("V-046: spending limits work", () => {
  test("no limit means no warning and no exceed", () => {
    const snapshot = evaluateBudget("agent", 100);
    expect(snapshot.fraction).toBeNull();
    expect(snapshot.warning).toBe(false);
    expect(snapshot.exceeded).toBe(false);
  });

  test("a warning is raised before the hard limit", () => {
    const snapshot = evaluateBudget("agent", 8, 10);
    expect(snapshot.fraction).toBeCloseTo(0.8, 6);
    expect(snapshot.warning).toBe(true);
    expect(snapshot.exceeded).toBe(false);
  });

  test("below the warning threshold nothing fires", () => {
    expect(evaluateBudget("agent", 5, 10).warning).toBe(false);
  });

  test("reaching the limit marks exceeded, not warning", () => {
    const snapshot = evaluateBudget("agent", 10, 10);
    expect(snapshot.exceeded).toBe(true);
    expect(snapshot.warning).toBe(false);
  });

  test("a per-agent cap pauses that agent at the hard limit", () => {
    const agent = makeAgent("Backend", { budgetUsd: 1 });
    registry.recordUsage(agent.id, { costUsd: 0.5 });

    let caught: unknown;
    try {
      registry.recordUsage(agent.id, { costUsd: 0.6 });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as BudgetExceededError).scope).toBe("agent");
    // Execution actually pauses — the agent is no longer working.
    const after = registry.get(agent.id);
    expect(after.status).toBe("idle");
    expect(after.statusDetail).toContain("Paused");
    expect(after.statusDetail).toContain("agent budget");
  });

  test("a project cap pauses even when the agent's own cap is fine", () => {
    const a = makeAgent("A");
    const b = makeAgent("B");
    registry.recordUsage(a.id, { costUsd: 6 }, 10);

    let caught: unknown;
    try {
      registry.recordUsage(b.id, { costUsd: 5 }, 10); // project total 11 > 10
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as BudgetExceededError).scope).toBe("project");
    expect(registry.get(b.id).statusDetail).toContain("project budget");
  });

  test("the warning threshold is configurable", () => {
    const agent = makeAgent("A", { budgetUsd: 10 });
    const { agentBudget } = registry.recordUsage(agent.id, { costUsd: 5 }, undefined, 0.5);
    expect(agentBudget.warning).toBe(true);
  });

  test("the cost summary reports remaining budget", () => {
    const agent = makeAgent("A");
    registry.recordUsage(agent.id, { costUsd: 4.12 }, 10);
    const summary = registry.costSummary(PROJECT, 10);
    expect(summary.projectCostUsd).toBeCloseTo(4.12, 6);
    expect(summary.remainingUsd).toBeCloseTo(5.88, 6);
    expect(summary.budget.exceeded).toBe(false);
  });
});

describe("V-041: reusable agent templates", () => {
  test("a template captures persona, skills, tools and permissions", () => {
    const template = registry.saveTemplate({
      name: "Careful Backend Engineer",
      role: "Backend Engineer",
      persona: "Prefer small, reviewable changes.",
      skills: ["API Implementation", "Unit Testing"],
      tools: ["shell", "edit"],
      permissions: { canWriteDocument: false, shellApproval: "auto", allowedPaths: [] },
      budgetUsd: 5,
    });

    expect(template.id).toBeTruthy();
    expect(template.skills).toContain("Unit Testing");
    expect(registry.listTemplates()).toHaveLength(1);
  });

  test("a template can be reused across projects", () => {
    const template = registry.saveTemplate({
      name: "Reviewer",
      role: "Reviewer",
      persona: "Skeptical staff engineer.",
      skills: ["Code Review"],
    });

    const first = registry.createFromTemplate(template.id, "project-a");
    const second = registry.createFromTemplate(template.id, "project-b", { name: "Reviewer 2" });

    expect(first.projectId).toBe("project-a");
    expect(second.projectId).toBe("project-b");
    expect(second.name).toBe("Reviewer 2");
    expect(first.persona).toBe("Skeptical staff engineer.");
    expect(second.skills).toEqual(["Code Review"]);
    // Skills must be copied, not shared by reference.
    first.skills.push("Mutated");
    expect(second.skills).toEqual(["Code Review"]);
  });

  test("an unknown template id is rejected", () => {
    expect(() => registry.createFromTemplate("nope", PROJECT)).toThrow(/template not found/);
  });
});

describe("V-021: canvas layout persists across restart", () => {
  test("position round-trips through hydrate", () => {
    const agent = makeAgent();
    registry.setPosition(agent.id, { x: 120, y: 340 });

    const snapshot = registry.list();
    const restored = new AgentRegistry();
    restored.hydrate(snapshot);

    expect(restored.get(agent.id).position).toEqual({ x: 120, y: 340 });
    expect(restored.list(PROJECT)).toHaveLength(1);
  });

  test("a persisted registry survives a genuine process restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "openui-agents-"));
    try {
      const first = new AgentRegistry({ persistDir: dir });
      const agent = first.create({ projectId: PROJECT, name: "Backend", role: "Backend Engineer" });
      first.setPosition(agent.id, { x: 512, y: 128 });
      first.assignTask(agent.id, "task-api", { branch: "agent/backend" });
      first.recordUsage(agent.id, { costUsd: 0.42, tokens: 900 });
      const template = first.saveTemplate({ name: "Reviewer", role: "Reviewer", skills: ["Code Review"] });

      // A brand-new registry over the same directory is what a server restart looks like.
      const second = new AgentRegistry({ persistDir: dir });
      const restored = second.get(agent.id);

      expect(restored.position).toEqual({ x: 512, y: 128 });
      expect(restored.name).toBe("Backend");
      expect(restored.currentTaskId).toBe("task-api");
      expect(restored.branch).toBe("agent/backend");
      expect(restored.costUsd).toBeCloseTo(0.42, 6);
      expect(restored.tokensUsed).toBe(900);
      expect(second.listTemplates().map((t) => t.id)).toContain(template.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a corrupt store does not stop the server from starting", () => {
    const dir = mkdtempSync(join(tmpdir(), "openui-agents-bad-"));
    try {
      writeFileSync(join(dir, "agents.json"), "{ not valid json");
      const registry = new AgentRegistry({ persistDir: dir });
      expect(registry.list()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("removing an agent is persisted too", () => {
    const dir = mkdtempSync(join(tmpdir(), "openui-agents-rm-"));
    try {
      const first = new AgentRegistry({ persistDir: dir });
      const agent = first.create({ projectId: PROJECT, name: "Temp", role: "r" });
      first.remove(agent.id);
      expect(new AgentRegistry({ persistDir: dir }).list()).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("V-007: a session id survives restart and the agent stays reconnectable", () => {
    const dir = mkdtempSync(join(tmpdir(), "openui-acpsession-"));
    try {
      const first = new AgentRegistry({ persistDir: dir });
      const agent = first.create({ projectId: PROJECT, name: "Backend", role: "Backend Engineer" });
      first.setAcpSession(agent.id, "019fda77-47ea-7d52-a874-8c94679d2e14");
      first.setStatus(agent.id, "working", "Implementing endpoints");

      // The process dies. The session id must be kept — it is what makes reopening possible.
      first.markDisconnected(agent.id, "Grok process exited");

      const second = new AgentRegistry({ persistDir: dir });
      const restored = second.get(agent.id);

      expect(restored.acpSessionId).toBe("019fda77-47ea-7d52-a874-8c94679d2e14");
      // Visibly marked, with the reason and a hint that it can be reopened.
      expect(restored.status).toBe("idle");
      expect(restored.statusDetail).toContain("Grok process exited");
      expect(restored.statusDetail).toContain("reconnectable");
      // And it is offered as a reconnection candidate rather than reconnected automatically.
      expect(second.reconnectableAgents(PROJECT).map((a) => a.id)).toContain(agent.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an agent with no session is not offered as reconnectable", () => {
    const agent = makeAgent();
    expect(registry.reconnectableAgents(PROJECT)).toHaveLength(0);
    registry.setAcpSession(agent.id, "sess-1");
    expect(registry.reconnectableAgents(PROJECT)).toHaveLength(1);
  });

  test("a working agent is not offered for reconnection", () => {
    // Reconnecting a live agent would duplicate its work.
    const agent = makeAgent();
    registry.setAcpSession(agent.id, "sess-1");
    registry.setStatus(agent.id, "working");
    expect(registry.reconnectableAgents(PROJECT)).toHaveLength(0);
  });

  test("permissions default to read-only on the document", () => {
    expect(makeAgent().permissions.canWriteDocument).toBe(false);
  });
});
