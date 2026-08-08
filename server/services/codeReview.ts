import type { CodeSubmission, CompletionGate, Requirement, TestResults } from "../types/project";

/** A submission arrived without everything the design requires it to carry (V-037). */
export class IncompleteSubmissionError extends Error {
  readonly code = "INCOMPLETE_SUBMISSION";
  constructor(readonly missing: string[]) {
    super(`Submission is missing required evidence: ${missing.join(", ")}`);
    this.name = "IncompleteSubmissionError";
  }
}

/** A requirement was asked to complete while a gate was still open (V-040). */
export class CompletionGateError extends Error {
  readonly code = "COMPLETION_GATE_OPEN";
  constructor(readonly unmet: string[]) {
    super(`Requirement cannot be marked complete — unmet: ${unmet.join(", ")}`);
    this.name = "CompletionGateError";
  }
}

export interface SubmissionInput {
  taskId?: string;
  agentId?: string;
  requirementIds?: string[];
  branch?: string;
  worktree?: string;
  changedFiles?: string[];
  /** The agent's own file list, supplied only when it disagreed with the repository. */
  claimedChangedFiles?: string[];
  diff?: string;
  summary?: string;
  knownLimitations?: string;
  testResults?: Partial<TestResults>;
  costUsd?: number;
}

/**
 * The evidence a submission must contain, per §10 step 8 / V-037. `knownLimitations` is optional
 * text but the field must be considered — "none" is a valid answer, silence is not.
 */
export function missingSubmissionFields(input: SubmissionInput): string[] {
  const missing: string[] = [];
  if (!input.taskId) missing.push("taskId");
  if (!input.agentId) missing.push("agentId");
  if (!input.branch) missing.push("branch");
  if (!input.summary?.trim()) missing.push("summary");
  if (!input.changedFiles || input.changedFiles.length === 0) missing.push("changedFiles");
  if (!input.requirementIds || input.requirementIds.length === 0) missing.push("requirementIds");
  if (
    !input.testResults ||
    input.testResults.passed === undefined ||
    input.testResults.failed === undefined ||
    input.testResults.total === undefined
  ) {
    missing.push("testResults");
  }
  if (input.costUsd === undefined) missing.push("costUsd");
  return missing;
}

/** Tests must actually pass — a submission with failures cannot be approved (V-035, V-040). */
export function testsPass(results: TestResults): boolean {
  return results.failed === 0 && results.total > 0 && results.passed === results.total;
}

/**
 * Evaluate the five conditions V-040 requires before a requirement is Complete. Returns the gate
 * so callers can show *which* condition is outstanding rather than a bare refusal.
 */
export function evaluateCompletionGate(params: {
  submission?: CodeSubmission | null;
  requirement: Requirement;
  pendingSuggestionCount: number;
}): { gate: CompletionGate; unmet: string[] } {
  const { submission, requirement, pendingSuggestionCount } = params;

  // Whether the user approved this submission knowing tests were failing, and said why.
  //
  // Without this a requirement merged on an acknowledged partial failure could never complete: the
  // gate reads the submission's *recorded* run, which is frozen at submission time, so it stays
  // "required tests not passing" forever however green the branch later becomes. Observed on a real
  // run — CART-01 was merged while two tests belonging to the next task failed, and sat at `merged`
  // with progress stuck at 50% after both tasks were done. Approving with an acknowledgement (§79)
  // moved the submission and left the requirement behind.
  const acknowledged = submission?.failingTestsAcknowledged?.trim() || undefined;

  const gate: CompletionGate = {
    implementationAccepted: submission?.state === "approved" || submission?.state === "merged",
    testsPassing: submission ? testsPass(submission.testResults) : false,
    failingTestsAcknowledged: acknowledged,
    reviewPassed: requirement.reviewStatus === "approved",
    merged: submission?.state === "merged" && !!submission.mergeCommit,
    // An accepted design change that has not landed in the document leaves the contract stale.
    designChangesReflected: pendingSuggestionCount === 0,
  };

  const unmet: string[] = [];
  if (!gate.implementationAccepted) unmet.push("implementation not accepted");
  // A submission with no recorded run at all is not covered by an acknowledgement: there is nothing
  // to have been informed about.
  if (!gate.testsPassing && !(acknowledged && submission && submission.testResults.total > 0)) {
    unmet.push("required tests not passing");
  }
  if (!gate.reviewPassed) unmet.push("review not approved");
  if (!gate.merged) unmet.push("code not merged");
  if (!gate.designChangesReflected) unmet.push("accepted design changes not reflected in the document");

  return { gate, unmet };
}
