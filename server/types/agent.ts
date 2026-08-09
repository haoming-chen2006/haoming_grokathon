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

/**
 * Where in a design document an agent says it is working, reported by the agent itself through
 * the `report_document_focus` tool.
 *
 * **The whole claim or none of it.** `documentId`, `from` and `to` are required *inside* this
 * object so that a range without a document, or a document without a range, cannot be written
 * down: the design-document page draws this range over real prose, and a half-claim would either
 * highlight the wrong document or highlight nothing while insisting someone is there. The optional
 * part is the object itself — an agent that has not said where it is simply has no focus, which is
 * the ordinary case and the one the page already renders as "position unknown".
 *
 * `kind` and `documentVersion` are separately optional because an agent may genuinely not say
 * which verb it is doing or which version it measured against. Neither is defaulted: a claim with
 * no version cannot be checked against the document and is not pretended to have passed a check,
 * and a claim with no verb is drawn without one rather than being called "reading".
 */
export interface DocumentFocus {
  /** The design document's id — its file's basename, as `/api/design-docs` publishes it. */
  documentId: string;
  /** First line of the claimed range. 1-based and inclusive, like every line number in this product. */
  from: number;
  /** Last line of the claimed range, inclusive. Equal to `from` for a single line. */
  to: number;
  /** The verb the agent claimed. Omitted when it did not say — never guessed from the tool it used. */
  kind?: "reading" | "writing";
  /**
   * The document version this range was measured against.
   *
   * Omitted when the agent did not state one, and NEVER defaulted to 0: `presenceState` treats a
   * report that makes no version claim as one that cannot be wrong about a version, while a
   * fabricated `0` would be checked against the real version, fail, and hide a live agent.
   */
  documentVersion?: number;
  /**
   * When this claim was made, set by the server's clock rather than taken from the agent.
   *
   * It exists because `AgentActivity.updatedAt` is bumped by *every* activity update — a shell
   * command, a changed file, a blocker — and a range is only as fresh as the moment it was
   * reported. Without a timestamp of its own, an agent that claimed lines 12–19 ten minutes ago
   * and has been busy elsewhere since would be drawn over those lines as "working now".
   */
  reportedAt?: string;
}

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
  /**
   * Which lines of which design document this agent last claimed.
   *
   * Replaced wholesale by each report rather than merged field by field — `updateActivity` spreads
   * one activity over another, and spreading a new `from` onto an old `to` would assemble a range
   * no agent ever claimed out of two it did.
   */
  documentFocus?: DocumentFocus;
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
