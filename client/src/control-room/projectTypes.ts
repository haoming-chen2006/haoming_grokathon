/** Client mirror of the project domain model in server/types/project.ts. */

export type RequirementStatus =
  | "defined"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "tests_passing"
  | "reviewed"
  | "merged"
  | "complete";

export type ReviewStatus = "not_required" | "pending" | "changes_requested" | "approved";

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  defined: "Defined",
  assigned: "Assigned",
  in_progress: "In Progress",
  submitted: "Submitted",
  tests_passing: "Tests Passing",
  reviewed: "Reviewed",
  merged: "Merged",
  complete: "Complete",
};

export interface AcceptanceCriterion {
  id: string;
  text: string;
  met: boolean;
}

export interface Requirement {
  id: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
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
  baseVersion: number;
}

export interface DesignDocumentView {
  content: string;
  version: number;
  title: string;
}

export function requirementStatusLabel(status: RequirementStatus): string {
  const label = REQUIREMENT_STATUS_LABELS[status];
  if (!label) throw new Error(`No label defined for requirement status: ${status}`);
  return label;
}
