/**
 * Domain model for the Grok Build Software Project Control Room (loopdesign.md §8).
 *
 * Core principle (§4): the design document is the implementation contract and is read-only to
 * coding agents by default. Agents propose changes as suggestions; they never silently rewrite
 * approved requirements.
 */

/** Progress states, ordered. Derived from repository/review evidence, never model estimates (§15). */
export type RequirementStatus =
  | "defined"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "tests_passing"
  | "reviewed"
  | "merged"
  | "complete";

export const REQUIREMENT_STATUS_ORDER: RequirementStatus[] = [
  "defined",
  "assigned",
  "in_progress",
  "submitted",
  "tests_passing",
  "reviewed",
  "merged",
  "complete",
];

export type SuggestionState =
  | "pending"
  | "accepted"
  | "rejected"
  | "revision_requested"
  /** Base version no longer current — must be rebased or re-reviewed before it can apply (V-016). */
  | "stale";

export type ReviewStatus = "not_required" | "pending" | "changes_requested" | "approved";

/** Who is acting. Agents are read-only on the canonical document unless granted scoped write. */
export interface Actor {
  kind: "user" | "agent";
  id: string;
  /** Scoped grant allowing an agent to write the canonical document directly (§13). */
  canWriteDocument?: boolean;
}

export interface DesignDocumentVersion {
  version: number;
  content: string;
  createdAt: string;
  /** Actor id that produced this version. */
  authorId: string;
  changeSummary?: string;
  /** Suggestion that produced this version, when it came from one. */
  fromSuggestionId?: string;
}

export interface DesignDocument {
  id: string;
  title: string;
  currentVersion: number;
  versions: DesignDocumentVersion[];
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  met: boolean;
}

export interface Requirement {
  /** Human-facing identifier, e.g. "AUTH-03". */
  id: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  /** Heading or anchor in the design document this requirement derives from. */
  designSection?: string;
  ownerAgentId?: string;
  taskIds: string[];
  affectedFiles: string[];
  status: RequirementStatus;
  branch?: string;
  worktree?: string;
  reviewStatus: ReviewStatus;
  testsPassing?: number;
  testsTotal?: number;
  /** Document version this requirement was written against. */
  baseVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignSuggestion {
  id: string;
  projectId: string;
  requirementId?: string;
  /** Agent that proposed the change. */
  authorAgentId: string;
  /** Document version the proposal was written against — the basis of conflict detection (V-016). */
  baseVersion: number;
  originalText: string;
  proposedText: string;
  /** Why implementation requires the design to change (§4). */
  reason: string;
  affectedFiles: string[];
  risks?: string;
  state: SuggestionState;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  /** The agent's wording before the user amended it, retained for provenance. */
  originalProposedText?: string;
  editedBy?: string;
  editedAt?: string;
}

/** Status an agent reports for its own task. */
export type TaskStatus = "pending" | "working" | "needs_review" | "complete" | "failed";

/**
 * Status after accounting for dependencies (V-019). `blocked` and `ready` are never stored —
 * they are derived, so the graph is the single source of truth and cannot drift.
 */
export type EffectiveTaskStatus = TaskStatus | "blocked" | "ready";

export interface CodingTask {
  id: string;
  objective: string;
  requirementId?: string;
  assignedAgentId?: string;
  branch?: string;
  worktree?: string;
  /** Task ids that must reach `complete` before this one may start. */
  dependsOn: string[];
  expectedFiles: string[];
  completionCriteria: string[];
  requiredTests: string[];
  status: TaskStatus;
  costUsd: number;
  /** Per-task spending cap (§16). */
  budgetUsd?: number;
  reviewStatus: ReviewStatus;
  milestoneId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  name: string;
  ownerAgentId?: string;
  taskIds: string[];
  dependsOn: string[];
}

/** Draft plans never execute; the user must approve first (V-018). */
export type PlanState = "draft" | "approved" | "executing" | "complete";

export interface ImplementationPlan {
  id: string;
  state: PlanState;
  /** Agent that produced the plan, e.g. the Planner. */
  authorAgentId?: string;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
}

/** Structured message kinds agents may exchange (§10 step 7, V-025). */
export type MessageKind =
  | "question"
  | "answer"
  | "dependency_request"
  | "handoff"
  | "failing_test"
  | "review_request"
  | "escalation";

/** Every message must reference a concrete project object — no free-floating chatter (V-025). */
export type MessageLinkKind =
  | "task"
  | "requirement"
  | "file"
  | "branch"
  | "test"
  | "artifact"
  | "review"
  | "blocker";

export interface MessageLink {
  kind: MessageLinkKind;
  id: string;
}

export interface AgentMessage {
  id: string;
  projectId: string;
  kind: MessageKind;
  fromAgentId: string;
  /** Absent means the message is addressed to the user (an escalation). */
  toAgentId?: string;
  body: string;
  links: MessageLink[];
  threadId: string;
  replyToId?: string;
  createdAt: string;
  readAt?: string;
  /** Set when the loop guard converted this into a user escalation (V-027). */
  autoEscalated?: boolean;
  escalationReason?: string;
}

export type ArtifactKind =
  | "api_contract"
  | "patch"
  | "diff"
  | "test_report"
  | "benchmark"
  | "screenshot"
  | "build_log"
  | "migration"
  | "branch"
  | "commit";

export interface CodeArtifact {
  id: string;
  projectId: string;
  kind: ArtifactKind;
  name: string;
  producedByAgentId: string;
  content?: string;
  uri?: string;
  requirementId?: string;
  taskId?: string;
  branch?: string;
  createdAt: string;
}

/** Bounds that stop agents talking in circles (V-027). */
export interface MessageLimits {
  /** Maximum messages in one thread before it escalates to the user. */
  maxThreadLength: number;
  /** Consecutive unanswered messages from one agent to another before escalating. */
  maxUnansweredPerPair: number;
}

export const DEFAULT_MESSAGE_LIMITS: MessageLimits = {
  maxThreadLength: 20,
  maxUnansweredPerPair: 3,
};

export interface Project {
  id: string;
  name: string;
  goal: string;
  repositoryPath: string;
  baseBranch: string;
  document: DesignDocument;
  requirements: Requirement[];
  suggestions: DesignSuggestion[];
  tasks: CodingTask[];
  messages: AgentMessage[];
  artifacts: CodeArtifact[];
  submissions: CodeSubmission[];
  plan?: ImplementationPlan;
  messageLimits?: MessageLimits;
  budgetUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionState =
  | "pending"
  | "changes_requested"
  | "approved"
  | "merged"
  | "rejected";

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  command?: string;
  output?: string;
}

/**
 * A completed coding task submitted for review (§10 step 8). The design lists exactly what a
 * submission must carry; `MISSING_SUBMISSION_FIELDS` enforces it so an incomplete submission
 * cannot enter review (V-037).
 */
export interface CodeSubmission {
  id: string;
  projectId: string;
  taskId: string;
  agentId: string;
  requirementIds: string[];
  branch: string;
  worktree?: string;
  changedFiles: string[];
  diff?: string;
  summary: string;
  knownLimitations?: string;
  testResults: TestResults;
  costUsd: number;
  state: SubmissionState;
  reviewFeedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  mergeCommit?: string;
  mergedAt?: string;
  /** Set when this submission revises an earlier one after changes were requested (V-038). */
  revisionOf?: string;
  createdAt: string;
}

/** A requirement is complete only when every gate below has passed (V-040). */
export interface CompletionGate {
  implementationAccepted: boolean;
  testsPassing: boolean;
  reviewPassed: boolean;
  merged: boolean;
  designChangesReflected: boolean;
}
