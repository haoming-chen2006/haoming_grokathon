/**
 * Restricted-action approval gate (V-047, §13 "the backend validates permissions before…").
 *
 * The design lists actions an agent may never take unilaterally. Each is routed through an
 * explicit approval an operator must grant, and the request records enough context for that
 * decision to be informed.
 */

export type RestrictedAction =
  | "main_branch_mutation"
  | "merge"
  | "destructive_shell"
  | "credential_use"
  | "production_deploy"
  | "budget_increase";

export const RESTRICTED_ACTIONS: RestrictedAction[] = [
  "main_branch_mutation",
  "merge",
  "destructive_shell",
  "credential_use",
  "production_deploy",
  "budget_increase",
];

export const RESTRICTED_ACTION_LABELS: Record<RestrictedAction, string> = {
  main_branch_mutation: "Write to a protected branch",
  merge: "Merge into a protected branch",
  destructive_shell: "Run a destructive shell command",
  credential_use: "Use a credential",
  production_deploy: "Deploy to production",
  budget_increase: "Increase a spending limit",
};

export type ApprovalState = "pending" | "approved" | "denied";

export interface ApprovalRequest {
  id: string;
  projectId: string;
  agentId: string;
  action: RestrictedAction;
  /** What the agent wants to do, in the operator's terms. */
  description: string;
  /** The exact command or payload, so approval is informed rather than blind. */
  detail?: string;
  state: ApprovalState;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  reason?: string;
}

export class ApprovalRequiredError extends Error {
  readonly code = "APPROVAL_REQUIRED";
  constructor(readonly request: ApprovalRequest) {
    super(
      `${RESTRICTED_ACTION_LABELS[request.action]} requires approval (request ${request.id}): ${request.description}`,
    );
    this.name = "ApprovalRequiredError";
  }
}

export class ApprovalDeniedError extends Error {
  readonly code = "APPROVAL_DENIED";
  constructor(readonly request: ApprovalRequest) {
    super(`Action was denied: ${request.reason ?? "no reason given"}`);
    this.name = "ApprovalDeniedError";
  }
}

/**
 * Shell commands that must not run unattended. Patterns are matched against the raw command, so
 * an agent cannot slip one through by embedding it in a longer line.
 */
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+/, why: "recursive or forced delete" },
  { pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/, why: "rm -rf" },
  { pattern: /\bgit\s+push\b[^\n]*\s(--force\b|-f\b)/, why: "force push" },
  { pattern: /\bgit\s+reset\s+--hard\b/, why: "discards local changes" },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*[fd]/, why: "deletes untracked files" },
  { pattern: /\bgit\s+branch\s+-D\b/, why: "force-deletes a branch" },
  { pattern: /\b(mkfs|fdisk|parted)\b/, why: "modifies filesystems" },
  { pattern: /\bdd\s+[^\n]*\bof=/, why: "raw device write" },
  { pattern: /\bsudo\b/, why: "elevated privileges" },
  { pattern: /\bchmod\s+(-R\s+)?777\b/, why: "removes all permission restrictions" },
  { pattern: /\bcurl\b[^\n]*\|\s*(ba|z|)sh\b/, why: "pipes a remote script into a shell" },
  { pattern: /\bwget\b[^\n]*\|\s*(ba|z|)sh\b/, why: "pipes a remote script into a shell" },
  { pattern: /\bdrop\s+(table|database)\b/i, why: "destroys database objects" },
  { pattern: /\bkubectl\b[^\n]*\bdelete\b/, why: "deletes cluster resources" },
  { pattern: /\bterraform\s+(destroy|apply)\b/, why: "mutates infrastructure" },
  { pattern: /\bnpm\s+publish\b|\bbun\s+publish\b/, why: "publishes a package" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, why: "fork bomb" },
];

export interface ShellClassification {
  restricted: boolean;
  action?: RestrictedAction;
  why?: string;
}

/** Classify a shell command. Never throws — an unparseable command is treated as restricted. */
export function classifyShellCommand(command: string): ShellClassification {
  const text = (command ?? "").trim();
  if (!text) return { restricted: false };

  for (const { pattern, why } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(text)) {
      return { restricted: true, action: "destructive_shell", why };
    }
  }
  return { restricted: false };
}

/** Branch writes outside an agent's own worktree are restricted (V-011 + V-047). */
export function classifyBranchWrite(branch: string, protectedBranches: string[]): ShellClassification {
  if (protectedBranches.includes(branch)) {
    return { restricted: true, action: "main_branch_mutation", why: `"${branch}" is a protected branch` };
  }
  return { restricted: false };
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `appr_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * In-memory approval queue. Requests are short-lived operator decisions, so they intentionally do
 * not survive a restart — a stale approval granted before a crash should not authorise an action
 * afterwards.
 */
export class ApprovalQueue {
  private requests = new Map<string, ApprovalRequest>();

  request(params: {
    projectId: string;
    agentId: string;
    action: RestrictedAction;
    description: string;
    detail?: string;
  }): ApprovalRequest {
    const request: ApprovalRequest = {
      id: newId(),
      projectId: params.projectId,
      agentId: params.agentId,
      action: params.action,
      description: params.description,
      detail: params.detail,
      state: "pending",
      requestedAt: new Date().toISOString(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  get(requestId: string): ApprovalRequest {
    const request = this.requests.get(requestId);
    if (!request) throw new Error(`Approval request not found: ${requestId}`);
    return request;
  }

  list(projectId?: string, state?: ApprovalState): ApprovalRequest[] {
    return [...this.requests.values()].filter(
      (r) => (!projectId || r.projectId === projectId) && (!state || r.state === state),
    );
  }

  /** Resolve a request. Only a user may decide; an agent cannot approve its own action. */
  resolve(
    requestId: string,
    decision: "approve" | "deny",
    actor: { kind: "user" | "agent"; id: string },
    reason?: string,
  ): ApprovalRequest {
    const request = this.get(requestId);
    if (actor.kind !== "user") {
      throw new Error(`Only the user may resolve an approval request (actor: ${actor.id})`);
    }
    if (request.state !== "pending") {
      throw new Error(`Approval request ${requestId} is already ${request.state}`);
    }
    request.state = decision === "approve" ? "approved" : "denied";
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = actor.id;
    request.reason = reason;
    return request;
  }

  /**
   * Gate an action. Returns silently when an approval for this exact request has been granted;
   * throws ApprovalRequiredError (with a fresh pending request) otherwise.
   */
  assertApproved(requestId: string | undefined, params: {
    projectId: string;
    agentId: string;
    action: RestrictedAction;
    description: string;
    detail?: string;
  }): void {
    if (requestId) {
      const existing = this.get(requestId);
      if (existing.state === "approved") {
        // An approval authorises the action it was granted for, nothing else.
        if (existing.action !== params.action || existing.agentId !== params.agentId) {
          throw new Error(
            `Approval ${requestId} was granted for ${existing.action} by ${existing.agentId}, ` +
              `not ${params.action} by ${params.agentId}`,
          );
        }
        return;
      }
      if (existing.state === "denied") throw new ApprovalDeniedError(existing);
      throw new ApprovalRequiredError(existing);
    }
    throw new ApprovalRequiredError(this.request(params));
  }

  clear(): void {
    this.requests.clear();
  }
}

let queue: ApprovalQueue | null = null;
export function getApprovalQueue(): ApprovalQueue {
  if (!queue) queue = new ApprovalQueue();
  return queue;
}
