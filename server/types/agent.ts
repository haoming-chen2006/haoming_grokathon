/**
 * The Coding Agent entity (loopdesign.md §8) — the thing the Agent Command Center actually
 * renders. Distinct from OpenUI's terminal `Session`: a coding agent owns a role, persona,
 * skills, a worktree, a task, a budget, and a status.
 */

/**
 * The six agent states required by V-022. Every one carries a text label — the checklist is
 * explicit that "each status must contain text in addition to color", so colour is never the sole
 * carrier of meaning (this is also an accessibility requirement).
 */
export type AgentRuntimeStatus = "working" | "waiting" | "needs_review" | "complete" | "idle" | "failed";

export const AGENT_RUNTIME_STATUSES: AgentRuntimeStatus[] = [
  "working",
  "waiting",
  "needs_review",
  "complete",
  "idle",
  "failed",
];

export interface AgentStatusPresentation {
  status: AgentRuntimeStatus;
  /** Human-readable text shown alongside the colour. Never empty. */
  label: string;
  /** Semantic colour token, per §12. */
  color: "green" | "yellow" | "blue" | "gray" | "red" | "orange";
  description: string;
}

/** Presentation for every status. Exhaustive by construction — see the totality test. */
export const AGENT_STATUS_PRESENTATION: Record<AgentRuntimeStatus, AgentStatusPresentation> = {
  working: {
    status: "working",
    label: "Working",
    color: "green",
    description: "Editing files, analyzing code, running tools, or executing tests.",
  },
  waiting: {
    status: "waiting",
    label: "Waiting",
    color: "yellow",
    description: "Blocked by another branch, contract, approval, agent, or user.",
  },
  needs_review: {
    status: "needs_review",
    label: "Needs Review",
    color: "blue",
    description: "Code, design change, or merge requires approval.",
  },
  complete: {
    status: "complete",
    label: "Complete",
    color: "gray",
    description: "Task passed tests and required reviews.",
  },
  idle: {
    status: "idle",
    label: "Idle",
    color: "red",
    description: "Session exists but is not executing.",
  },
  failed: {
    status: "failed",
    label: "Failed",
    color: "orange",
    description: "Command, build, test, or agent session failed.",
  },
};

/** Observable coding activity surfaced in the UI (V-024). Every field is optional — the design
 * says "where available" — but the shape is fixed so the UI never invents values. */
export interface AgentActivity {
  /** The shell command currently executing. */
  command?: string;
  /** The tool currently in use, from ACP tool_call updates. */
  tool?: string;
  taskId?: string;
  /** Most recently changed file. */
  latestFile?: string;
  branch?: string;
  testsPassing?: number;
  testsTotal?: number;
  /** Why the agent is waiting, when it is. */
  blocker?: string;
  updatedAt?: string;
}

export interface AgentPermissions {
  /** Scoped grant to write the canonical design document. Off by default (§4). */
  canWriteDocument: boolean;
  /** Whether shell commands need per-command approval. */
  shellApproval: "always" | "auto" | "deny";
  /** Paths the agent may modify. Empty means its worktree only. */
  allowedPaths: string[];
}

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  canWriteDocument: false,
  shellApproval: "auto",
  allowedPaths: [],
};

export interface CodingAgent {
  id: string;
  projectId: string;
  name: string;
  /** e.g. "Planner", "Backend Engineer", "Reviewer". */
  role: string;
  persona?: string;
  skills: string[];
  tools: string[];
  /**
   * Which priced api.x.ai endpoint families this agent may reach — `boundary.ts`'s AgentCapabilities.
   *
   * Absent means base Grok: the media tools are not registered at all, so the agent cannot call a
   * per-unit endpoint. Enforcement is registration rather than refusal, because an advertised tool
   * that always fails invites a retry, and a retry against a priced endpoint is a spend loop.
   */
  capabilities?: { images: boolean; voice: boolean };
  /**
   * The one area this agent works in, if it has been hired into one.
   *
   * The relation used to live on the AREA, as a single `ownerAgentId`, which made "one agent per
   * area" a property of the storage rather than a decision — and it was the wrong decision: an
   * area is a part of the work and several agents can share it. Held here, the rule that survives
   * is the one that matters: an agent belongs to exactly ONE area, because the area is where it is
   * allowed to write and two answers to that question is no answer.
   */
  areaId?: string;
  avatar?: string;
  color?: string;

  /** ACP session identity, once a live session exists. */
  acpSessionId?: string;
  /** OpenUI session id, linking the agent to its terminal/transcript view. */
  openuiSessionId?: string;

  branch?: string;
  worktree?: string;
  currentTaskId?: string;

  status: AgentRuntimeStatus;
  /** Short text elaborating the status, e.g. "Waiting for API contract". */
  statusDetail?: string;
  activity: AgentActivity;

  permissions: AgentPermissions;

  /** Per-agent spending cap (§16). */
  budgetUsd?: number;
  costUsd: number;
  tokensUsed: number;

  /** Canvas position, so layout can persist across restarts (V-021). */
  position?: { x: number; y: number };

  createdAt: string;
  updatedAt: string;
}

/** Reusable agent template (V-041) — a persona + skills + tools + permissions, minus runtime. */
export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  persona?: string;
  skills: string[];
  tools: string[];
  /**
   * Which priced api.x.ai endpoint families this agent may reach — `boundary.ts`'s AgentCapabilities.
   *
   * Absent means base Grok: the media tools are not registered at all, so the agent cannot call a
   * per-unit endpoint. Enforcement is registration rather than refusal, because an advertised tool
   * that always fails invites a retry, and a retry against a priced endpoint is a spend loop.
   */
  capabilities?: { images: boolean; voice: boolean };
  /**
   * The one area this agent works in, if it has been hired into one.
   *
   * The relation used to live on the AREA, as a single `ownerAgentId`, which made "one agent per
   * area" a property of the storage rather than a decision — and it was the wrong decision: an
   * area is a part of the work and several agents can share it. Held here, the rule that survives
   * is the one that matters: an agent belongs to exactly ONE area, because the area is where it is
   * allowed to write and two answers to that question is no answer.
   */
  areaId?: string;
  permissions: AgentPermissions;
  budgetUsd?: number;
  createdAt: string;
}
