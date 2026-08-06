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

  const gate: CompletionGate = {
    implementationAccepted: submission?.state === "approved" || submission?.state === "merged",
    testsPassing: submission ? testsPass(submission.testResults) : false,
    reviewPassed: requirement.reviewStatus === "approved",
    merged: submission?.state === "merged" && !!submission.mergeCommit,
    // An accepted design change that has not landed in the document leaves the contract stale.
    designChangesReflected: pendingSuggestionCount === 0,
  };

  const unmet: string[] = [];
  if (!gate.implementationAccepted) unmet.push("implementation not accepted");
  if (!gate.testsPassing) unmet.push("required tests not passing");
  if (!gate.reviewPassed) unmet.push("review not approved");
  if (!gate.merged) unmet.push("code not merged");
  if (!gate.designChangesReflected) unmet.push("accepted design changes not reflected in the document");

  return { gate, unmet };
}
