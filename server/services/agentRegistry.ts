import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { atomicWriteJson } from "./persistence";
import {
  AGENT_STATUS_PRESENTATION,
  DEFAULT_AGENT_PERMISSIONS,
  type AgentActivity,
  type AgentPermissions,
  type AgentRuntimeStatus,
  type AgentStatusPresentation,
  type AgentTemplate,
  type CodingAgent,
} from "../types/agent";

/** A spending cap was reached; execution must pause rather than continue (V-046). */
export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED";
  constructor(
    message: string,
    readonly scope: "agent" | "task" | "project",
    readonly spent: number,
    readonly limit: number,
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Fraction of a budget at which a warning is raised before the hard stop (§16). */
export const DEFAULT_WARNING_THRESHOLD = 0.8;

export interface BudgetSnapshot {
  scope: "agent" | "task" | "project";
  spent: number;
  limit?: number;
  /** Fraction of the limit consumed; null when no limit is set. */
  fraction: number | null;
  warning: boolean;
  exceeded: boolean;
  /** True when exact cost is unavailable and `spent` is a token-derived estimate (V-045). */
  estimated: boolean;
}

/** Presentation for a status — always includes text, never colour alone (V-022). */
export function statusPresentation(status: AgentRuntimeStatus): AgentStatusPresentation {
  const presentation = AGENT_STATUS_PRESENTATION[status];
  if (!presentation) throw new Error(`Unknown agent status: ${status}`);
  return presentation;
}

/**
 * Derive the status an agent should display from its situation. Kept pure and total so the UI
 * never has to guess, and so a fabricated status cannot be written directly (§22.18 forbids
 * "fabricated agent status").
 */
export function deriveStatus(input: {
  hasFailed?: boolean;
  sessionRunning?: boolean;
  taskComplete?: boolean;
  awaitingReview?: boolean;
  blocker?: string;
}): AgentRuntimeStatus {
  if (input.hasFailed) return "failed";
  if (input.taskComplete) return "complete";
  if (input.awaitingReview) return "needs_review";
  if (input.blocker) return "waiting";
  if (input.sessionRunning) return "working";
  return "idle";
}

export function evaluateBudget(
  scope: "agent" | "task" | "project",
  spent: number,
  limit?: number,
  warningThreshold = DEFAULT_WARNING_THRESHOLD,
  estimated = false,
): BudgetSnapshot {
  if (limit === undefined || limit <= 0) {
    return { scope, spent, limit, fraction: null, warning: false, exceeded: false, estimated };
  }
  const fraction = spent / limit;
  return {
    scope,
    spent,
    limit,
    fraction,
    warning: fraction >= warningThreshold && fraction < 1,
    exceeded: fraction >= 1,
    estimated,
  };
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory registry of coding agents for a project, persisted through the caller's store.
 * Agents are kept separate from the project document so a busy agent updating its activity
 * several times a second does not rewrite the whole project file.
 */
export interface AgentRegistryOptions {
  /** Directory to persist agents and templates into. Omit for an in-memory registry. */
  persistDir?: string;
  onChange?: (agents: CodingAgent[]) => void;
}

export class AgentRegistry {
  private agents = new Map<string, CodingAgent>();
  private templates = new Map<string, AgentTemplate>();
  private readonly persistPath: string | null;

  constructor(private readonly options: AgentRegistryOptions = {}) {
    this.persistPath = options.persistDir ? join(options.persistDir, "agents.json") : null;
    if (options.persistDir) {
      mkdirSync(options.persistDir, { recursive: true });
      this.load();
    }
  }

  /**
   * Read persisted agents back. Canvas position lives on the agent record, so this is the path
   * that makes layout survive a restart (V-021, V-049).
   */
  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.persistPath, "utf8")) as {
        agents?: CodingAgent[];
        templates?: AgentTemplate[];
      };
      this.hydrate(raw.agents ?? [], raw.templates ?? []);
    } catch (err) {
      // A corrupt file must not prevent the server from starting; start empty and say so.
      console.error(`\x1b[38;5;203m[agents]\x1b[0m Failed to read ${this.persistPath}:`, err);
    }
  }

  private save(): void {
    if (!this.persistPath) return;
    atomicWriteJson(this.persistPath, {
      agents: [...this.agents.values()],
      templates: [...this.templates.values()],
    });
  }

  private touched(): void {
    this.save();
    this.options.onChange?.(this.list());
  }

  hydrate(agents: CodingAgent[], templates: AgentTemplate[] = []): void {
    this.agents = new Map(agents.map((a) => [a.id, a]));
    this.templates = new Map(templates.map((t) => [t.id, t]));
  }

  create(params: {
    projectId: string;
    name: string;
    role: string;
    persona?: string;
    skills?: string[];
    tools?: string[];
    permissions?: Partial<AgentPermissions>;
    budgetUsd?: number;
    branch?: string;
    worktree?: string;
    position?: { x: number; y: number };
  }): CodingAgent {
    const timestamp = nowIso();
    const agent: CodingAgent = {
      id: newId("agent"),
      projectId: params.projectId,
      name: params.name,
      role: params.role,
      persona: params.persona,
      skills: params.skills ?? [],
      tools: params.tools ?? [],
      branch: params.branch,
      worktree: params.worktree,
      // A new agent has no session, so it is idle — never "working" by default.
      status: "idle",
      activity: {},
      permissions: { ...DEFAULT_AGENT_PERMISSIONS, ...params.permissions },
      budgetUsd: params.budgetUsd,
      costUsd: 0,
      tokensUsed: 0,
      position: params.position,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.agents.set(agent.id, agent);
    this.touched();
    return agent;
  }

  /** Instantiate an agent from a reusable template (V-041). */
  createFromTemplate(templateId: string, projectId: string, overrides: { name?: string } = {}): CodingAgent {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`Agent template not found: ${templateId}`);
    return this.create({
      projectId,
      name: overrides.name ?? template.name,
      role: template.role,
      persona: template.persona,
      skills: [...template.skills],
      tools: [...template.tools],
      permissions: template.permissions,
      budgetUsd: template.budgetUsd,
    });
  }

  saveTemplate(params: {
    name: string;
    role: string;
    persona?: string;
    skills?: string[];
    tools?: string[];
    permissions?: Partial<AgentPermissions>;
    budgetUsd?: number;
  }): AgentTemplate {
    const template: AgentTemplate = {
      id: newId("tmpl"),
      name: params.name,
      role: params.role,
      persona: params.persona,
      skills: params.skills ?? [],
      tools: params.tools ?? [],
      permissions: { ...DEFAULT_AGENT_PERMISSIONS, ...params.permissions },
      budgetUsd: params.budgetUsd,
      createdAt: nowIso(),
    };
    this.templates.set(template.id, template);
    // Templates are persisted alongside agents; without this a saved template would be lost
    // on restart, defeating V-041's "reused in a new project".
    this.touched();
    return template;
  }

  listTemplates(): AgentTemplate[] {
    return [...this.templates.values()];
  }

  get(agentId: string): CodingAgent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    return agent;
  }

  list(projectId?: string): CodingAgent[] {
    const all = [...this.agents.values()];
    return projectId ? all.filter((a) => a.projectId === projectId) : all;
  }

  remove(agentId: string): void {
    this.agents.delete(agentId);
    this.touched();
  }

  setStatus(agentId: string, status: AgentRuntimeStatus, detail?: string): CodingAgent {
    const agent = this.get(agentId);
    agent.status = status;
    agent.statusDetail = detail;
    agent.updatedAt = nowIso();
    this.touched();
    return agent;
  }

  /** Merge observed activity (V-024). Only supplied fields change, so a partial ACP update
   * cannot blank out fields it says nothing about. */
  updateActivity(agentId: string, activity: AgentActivity): CodingAgent {
    const agent = this.get(agentId);
    agent.activity = { ...agent.activity, ...activity, updatedAt: nowIso() };
    if (activity.blocker !== undefined) {
      agent.status = activity.blocker ? "waiting" : agent.status;
      agent.statusDetail = activity.blocker || agent.statusDetail;
    }
    agent.updatedAt = nowIso();
    this.touched();
    return agent;
  }

  assignTask(agentId: string, taskId: string, opts: { branch?: string; worktree?: string } = {}): CodingAgent {
    const agent = this.get(agentId);
    agent.currentTaskId = taskId;
    if (opts.branch) agent.branch = opts.branch;
    if (opts.worktree) agent.worktree = opts.worktree;
    agent.activity = { ...agent.activity, taskId, branch: agent.branch };
    agent.updatedAt = nowIso();
    this.touched();
    return agent;
  }

  setPosition(agentId: string, position: { x: number; y: number }): CodingAgent {
    const agent = this.get(agentId);
    agent.position = position;
    agent.updatedAt = nowIso();
    this.touched();
    return agent;
  }

  // ------------------------------------------------------------ cost & budget

  /**
   * Record usage against an agent (V-045). Returns budget snapshots for the agent and project so
   * the caller can warn or pause. Throws once a hard cap is exceeded (V-046).
   */
  recordUsage(
    agentId: string,
    usage: { costUsd?: number; tokens?: number; estimated?: boolean },
    projectBudgetUsd?: number,
    warningThreshold = DEFAULT_WARNING_THRESHOLD,
  ): { agent: CodingAgent; agentBudget: BudgetSnapshot; projectBudget: BudgetSnapshot } {
    const agent = this.get(agentId);
    agent.costUsd += usage.costUsd ?? 0;
    agent.tokensUsed += usage.tokens ?? 0;
    agent.updatedAt = nowIso();

    const agentBudget = evaluateBudget(
      "agent",
      agent.costUsd,
      agent.budgetUsd,
      warningThreshold,
      usage.estimated ?? false,
    );
    const projectSpend = this.list(agent.projectId).reduce((sum, a) => sum + a.costUsd, 0);
    const projectBudget = evaluateBudget(
      "project",
      projectSpend,
      projectBudgetUsd,
      warningThreshold,
      usage.estimated ?? false,
    );

    if (agentBudget.exceeded || projectBudget.exceeded) {
      // Pause rather than keep spending.
      agent.status = "idle";
      agent.statusDetail = agentBudget.exceeded
        ? `Paused: agent budget of $${agent.budgetUsd?.toFixed(2)} reached`
        : `Paused: project budget of $${projectBudgetUsd?.toFixed(2)} reached`;
      this.touched();
      const scope = agentBudget.exceeded ? "agent" : "project";
      const snapshot = agentBudget.exceeded ? agentBudget : projectBudget;
      throw new BudgetExceededError(
        `${scope} budget exceeded: $${snapshot.spent.toFixed(2)} of $${snapshot.limit?.toFixed(2)}. Execution paused.`,
        scope,
        snapshot.spent,
        snapshot.limit ?? 0,
      );
    }

    this.touched();
    return { agent, agentBudget, projectBudget };
  }

  /** Aggregate spend for a project, plus the per-agent breakdown (§16). */
  costSummary(projectId: string, projectBudgetUsd?: number) {
    const agents = this.list(projectId);
    const total = agents.reduce((sum, a) => sum + a.costUsd, 0);
    return {
      projectCostUsd: Number(total.toFixed(6)),
      projectBudgetUsd,
      remainingUsd: projectBudgetUsd === undefined ? undefined : Number((projectBudgetUsd - total).toFixed(6)),
      byAgent: agents.map((a) => ({
        agentId: a.id,
        name: a.name,
        costUsd: a.costUsd,
        tokensUsed: a.tokensUsed,
        budgetUsd: a.budgetUsd,
      })),
      budget: evaluateBudget("project", total, projectBudgetUsd),
    };
  }

  /** Aggregate spend for one task across every agent that worked on it. */
  taskCost(projectId: string, taskId: string): number {
    return this.list(projectId)
      .filter((a) => a.currentTaskId === taskId)
      .reduce((sum, a) => sum + a.costUsd, 0);
  }
}

/** Process-wide registry, persisted alongside the rest of OpenUI state. */
let registry: AgentRegistry | null = null;
export function getAgentRegistry(): AgentRegistry {
  if (!registry) {
    registry = new AgentRegistry({
      persistDir: process.env.OPENUI_DATA_DIR || join(homedir(), ".openui"),
    });
  }
  return registry;
}
