import { findSecrets } from "./secrets";
import { classifyShellCommand } from "./approvals";
import type { CodeSubmission, DesignSuggestion, Project, Requirement } from "../types/project";

/**
 * Design-compliance review (V-036).
 *
 * Deliberately deterministic rather than model-generated: a reviewer that returns a different
 * verdict each run cannot gate a merge. Findings are derived from the requirement, the submission
 * and the diff, so the same inputs always produce the same review.
 */

export type FindingKind =
  | "missing_implementation"
  | "missing_tests"
  | "undocumented_deviation"
  | "unrelated_changes"
  | "security_concern";

export type FindingSeverity = "blocking" | "warning";

export interface ReviewFinding {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  /** Files or ids the finding refers to, so it can be acted on. */
  subjects: string[];
}

export interface DesignReview {
  id: string;
  projectId: string;
  submissionId: string | null;
  requirementsChecked: string[];
  findings: ReviewFinding[];
  /** True only when no blocking finding remains. */
  compliant: boolean;
  reviewedAt: string;
}

export const FINDING_LABELS: Record<FindingKind, string> = {
  missing_implementation: "Missing implementation",
  missing_tests: "Missing tests",
  undocumented_deviation: "Undocumented deviation",
  unrelated_changes: "Unrelated code changes",
  security_concern: "Unresolved security concern",
};

let counter = 0;
function newId(): string {
  counter += 1;
  return `rev_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Files a submission is expected to touch, from the tasks covering its requirements. */
function expectedFilesFor(project: Project, submission: CodeSubmission): string[] {
  const expected = new Set<string>();
  for (const task of project.tasks) {
    if (!submission.requirementIds.includes(task.requirementId ?? "")) continue;
    task.expectedFiles.forEach((f) => expected.add(f));
  }
  for (const requirementId of submission.requirementIds) {
    const requirement = project.requirements.find((r) => r.id === requirementId);
    requirement?.affectedFiles.forEach((f) => expected.add(f));
  }
  return [...expected];
}

/**
 * Review a submission against the approved design.
 *
 * `diff` is optional; when supplied it is scanned for credentials and destructive commands, which
 * are the two classes of problem a human reviewer most reliably misses in a large diff.
 */
export function reviewSubmission(params: {
  project: Project;
  submission: CodeSubmission;
  diff?: string;
}): DesignReview {
  const { project, submission, diff } = params;
  const findings: ReviewFinding[] = [];

  const requirements: Requirement[] = submission.requirementIds
    .map((id) => project.requirements.find((r) => r.id === id))
    .filter((r): r is Requirement => !!r);

  // A requirement the submission claims to cover but that does not exist is itself a defect.
  const unknown = submission.requirementIds.filter(
    (id) => !project.requirements.some((r) => r.id === id),
  );
  if (unknown.length > 0) {
    findings.push({
      kind: "missing_implementation",
      severity: "blocking",
      message: `Submission references requirements that do not exist: ${unknown.join(", ")}`,
      subjects: unknown,
    });
  }

  // Missing implementation: a covered requirement with no changed files behind it.
  if (submission.changedFiles.length === 0) {
    findings.push({
      kind: "missing_implementation",
      severity: "blocking",
      message: "Submission changes no files, so no requirement can be implemented by it",
      subjects: submission.requirementIds,
    });
  }

  // Missing tests: either none ran, or acceptance criteria remain unmet.
  if (submission.testResults.total === 0) {
    findings.push({
      kind: "missing_tests",
      severity: "blocking",
      message: "No tests were run for this submission",
      subjects: [submission.taskId],
    });
  } else if (submission.testResults.failed > 0) {
    findings.push({
      kind: "missing_tests",
      severity: "blocking",
      message: `${submission.testResults.failed} of ${submission.testResults.total} tests are failing`,
      subjects: [submission.taskId],
    });
  }

  for (const requirement of requirements) {
    const unmet = requirement.acceptanceCriteria.filter((c) => !c.met);
    if (requirement.acceptanceCriteria.length > 0 && unmet.length === requirement.acceptanceCriteria.length) {
      findings.push({
        kind: "missing_tests",
        severity: "warning",
        message: `No acceptance criteria are marked met for ${requirement.id}`,
        subjects: unmet.map((c) => c.text),
      });
    }
  }

  // Undocumented deviation: an accepted design change that has not landed in the document, or a
  // pending suggestion against a requirement being submitted.
  const openSuggestions: DesignSuggestion[] = project.suggestions.filter(
    (s) =>
      (s.state === "pending" || s.state === "stale") &&
      s.requirementId !== undefined &&
      submission.requirementIds.includes(s.requirementId),
  );
  if (openSuggestions.length > 0) {
    findings.push({
      kind: "undocumented_deviation",
      severity: "blocking",
      message:
        `${openSuggestions.length} design suggestion(s) affecting these requirements are still unresolved; ` +
        `merging would leave the document out of step with the code`,
      subjects: openSuggestions.map((s) => s.id),
    });
  }

  // Unrelated changes: files outside what the tasks and requirements declared.
  const expected = expectedFilesFor(project, submission);
  if (expected.length > 0) {
    const unrelated = submission.changedFiles.filter((f) => !expected.includes(f));
    if (unrelated.length > 0) {
      findings.push({
        kind: "unrelated_changes",
        severity: "warning",
        message: `${unrelated.length} changed file(s) are outside the files declared for this work`,
        subjects: unrelated,
      });
    }
  }

  // Security: credentials or destructive commands introduced by the diff.
  if (diff) {
    const secrets = findSecrets(diff);
    if (secrets.length > 0) {
      findings.push({
        kind: "security_concern",
        severity: "blocking",
        message: `The diff appears to introduce ${secrets.length} credential(s): ${secrets
          .map((s) => s.name)
          .join(", ")}`,
        // Never echo the secret itself, only its shape.
        subjects: secrets.map((s) => `${s.name} at offset ${s.index}`),
      });
    }

    for (const line of diff.split("\n")) {
      if (!line.startsWith("+")) continue;
      const verdict = classifyShellCommand(line.slice(1));
      if (verdict.restricted) {
        findings.push({
          kind: "security_concern",
          severity: "warning",
          message: `Added line contains a destructive command (${verdict.why})`,
          subjects: [line.slice(1).trim().slice(0, 120)],
        });
        break; // one finding is enough to send it back
      }
    }
  }

  return {
    id: newId(),
    projectId: project.id,
    submissionId: submission.id,
    requirementsChecked: submission.requirementIds,
    findings,
    compliant: !findings.some((f) => f.severity === "blocking"),
    reviewedAt: new Date().toISOString(),
  };
}
