/** Client mirror of server/types/agent.ts. Kept in sync by the shared status vocabulary test. */

export type AgentRuntimeStatus = "working" | "waiting" | "needs_review" | "complete" | "idle" | "failed";

export const AGENT_RUNTIME_STATUSES: AgentRuntimeStatus[] = [
  "working",
  "waiting",
  "needs_review",
  "complete",
  "idle",
  "failed",
];

export interface AgentActivity {
  command?: string;
  tool?: string;
  taskId?: string;
  latestFile?: string;
  branch?: string;
  testsPassing?: number;
  testsTotal?: number;
  blocker?: string;
  updatedAt?: string;
}

export interface CodingAgent {
  id: string;
  projectId: string;
  name: string;
  role: string;
  persona?: string;
  skills: string[];
  tools: string[];
  branch?: string;
  worktree?: string;
  currentTaskId?: string;
  status: AgentRuntimeStatus;
  statusDetail?: string;
  activity: AgentActivity;
  budgetUsd?: number;
  costUsd: number;
  tokensUsed: number;
  position?: { x: number; y: number };
}

/**
 * Text label for every status. The checklist requires that "each status must contain text in
 * addition to color" — colour alone is not an accessible signal, so no component may render a
 * status without pulling its label from here.
 */
export const STATUS_LABELS: Record<AgentRuntimeStatus, string> = {
  working: "Working",
  waiting: "Waiting",
  needs_review: "Needs Review",
  complete: "Complete",
  idle: "Idle",
  failed: "Failed",
};

/** Tailwind classes per status. Paired with a label at every call site, never used alone. */
export const STATUS_CLASSES: Record<AgentRuntimeStatus, string> = {
  working: "bg-green-500/15 text-green-400 border-green-500/30",
  waiting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  needs_review: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  complete: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  idle: "bg-red-500/15 text-red-400 border-red-500/30",
  failed: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export const STATUS_DOT: Record<AgentRuntimeStatus, string> = {
  working: "bg-green-400",
  waiting: "bg-yellow-400",
  needs_review: "bg-blue-400",
  complete: "bg-gray-400",
  idle: "bg-red-400",
  failed: "bg-orange-400",
};

export function statusLabel(status: AgentRuntimeStatus): string {
  const label = STATUS_LABELS[status];
  // Fail loudly rather than rendering an empty badge if a new status is added server-side.
  if (!label) throw new Error(`No label defined for agent status: ${status}`);
  return label;
}
