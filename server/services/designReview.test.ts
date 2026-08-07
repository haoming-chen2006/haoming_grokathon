import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FINDING_LABELS, reviewSubmission, type FindingKind } from "./designReview";
import { ProjectStore } from "./projectStore";
import type { Actor, Project } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };
let dir: string;
let store: ProjectStore;
let projectId: string;

const GOOD_TESTS = { passed: 22, failed: 0, total: 22 };

function base(overrides: Record<string, any> = {}) {
  return {
    taskId: "api",
    agentId: "backend",
    requirementIds: ["AUTH-03"],
    branch: "agent/backend",
    changedFiles: ["src/auth/session.ts"],
    summary: "Refresh token rotation",
    testResults: GOOD_TESTS,
    costUsd: 0.5,
    ...overrides,
  };
}

function reviewOf(submissionOverrides: Record<string, any> = {}, diff?: string) {
  const submission = store.submitCode(projectId, base(submissionOverrides));
  const project: Project = store.getProject(projectId);
  return reviewSubmission({ project, submission, diff });
}

function kinds(review: { findings: Array<{ kind: FindingKind }> }) {
  return review.findings.map((f) => f.kind);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-review-"));
  store = new ProjectStore(join(dir, "projects"));
  const p = store.createProject({ name: "Auth", goal: "g", repositoryPath: "/tmp/r" });
  projectId = p.id;
  store.addRequirement(
    projectId,
    { id: "AUTH-03", description: "Stay signed in", acceptanceCriteria: ["Survives reload"], ownerAgentId: "backend" },
    USER,
  );
  store.createPlan(projectId, { milestones: [] }, USER);
  store.addTask(
    projectId,
    { id: "api", objective: "API", assignedAgentId: "backend", requirementId: "AUTH-03", expectedFiles: ["src/auth/session.ts"] },
    USER,
  );
  store.approvePlan(projectId, USER);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("V-036: reviewer checks design compliance", () => {
  test("a clean submission is compliant and records what it checked", () => {
    const review = reviewOf();
    expect(review.compliant).toBe(true);
    expect(review.findings.filter((f) => f.severity === "blocking")).toHaveLength(0);
    expect(review.requirementsChecked).toEqual(["AUTH-03"]);
    expect(review.id).toBeTruthy();
    expect(review.submissionId).toBeTruthy();
  });

  test("every finding kind has a human-readable label", () => {
    for (const kind of Object.keys(FINDING_LABELS) as FindingKind[]) {
      expect(FINDING_LABELS[kind].length).toBeGreaterThan(0);
    }
  });

  test("flags missing implementation when a claimed requirement does not exist", () => {
    const review = reviewOf({ requirementIds: ["AUTH-03", "GHOST-1"] });
    expect(kinds(review)).toContain("missing_implementation");
    expect(review.compliant).toBe(false);
    expect(review.findings[0].subjects).toContain("GHOST-1");
  });

  test("flags missing tests when nothing ran", () => {
    const review = reviewOf({ testResults: { passed: 0, failed: 0, total: 0 } });
    expect(kinds(review)).toContain("missing_tests");
    expect(review.compliant).toBe(false);
  });

  test("flags failing tests as blocking", () => {
    const review = reviewOf({ testResults: { passed: 18, failed: 2, total: 20 } });
    const finding = review.findings.find((f) => f.kind === "missing_tests")!;
    expect(finding.message).toContain("2 of 20");
    expect(finding.severity).toBe("blocking");
  });

  test("flags an unresolved design suggestion as an undocumented deviation", () => {
    // Merging with an open suggestion would leave the document out of step with the code.
    store.submitSuggestion(projectId, {
      authorAgentId: "backend",
      requirementId: "AUTH-03",
      originalText: "modal",
      proposedText: "redirect",
      reason: "provider blocks embedding",
    });
    const review = reviewOf();
    expect(kinds(review)).toContain("undocumented_deviation");
    expect(review.compliant).toBe(false);
  });

  test("flags files outside those declared for the work", () => {
    const review = reviewOf({ changedFiles: ["src/auth/session.ts", "src/billing/invoice.ts"] });
    const finding = review.findings.find((f) => f.kind === "unrelated_changes")!;
    expect(finding.subjects).toEqual(["src/billing/invoice.ts"]);
    // A stray file is worth surfacing but should not block on its own.
    expect(finding.severity).toBe("warning");
    expect(review.compliant).toBe(true);
  });

  test("flags a credential introduced by the diff, without echoing it", () => {
    const diff = '+ const key = "ghp_abcdefghijklmnopqrstuvwxyz0123";\n';
    const review = reviewOf({}, diff);
    const finding = review.findings.find((f) => f.kind === "security_concern")!;
    expect(finding.severity).toBe("blocking");
    expect(review.compliant).toBe(false);
    // The finding must not leak the secret it found.
    expect(JSON.stringify(finding)).not.toContain("abcdefghijklmnopqrstuvwxyz0123");
  });

  test("flags a destructive command added by the diff", () => {
    const review = reviewOf({}, "+ rm -rf ./build\n");
    const finding = review.findings.find((f) => f.kind === "security_concern")!;
    expect(finding.message).toContain("destructive");
  });

  test("only added lines are scanned for destructive commands", () => {
    // A removed `rm -rf` is a fix, not a defect.
    const review = reviewOf({}, "- rm -rf ./build\n");
    expect(kinds(review)).not.toContain("security_concern");
  });

  test("the review is deterministic — same inputs, same findings", () => {
    // A reviewer that changes its mind between runs cannot gate a merge.
    const a = reviewOf({ testResults: { passed: 1, failed: 1, total: 2 } });
    const b = reviewOf({ testResults: { passed: 1, failed: 1, total: 2 } });
    expect(kinds(a)).toEqual(kinds(b));
    expect(a.compliant).toBe(b.compliant);
  });

  test("warnings alone do not block, blocking findings do", () => {
    const warnOnly = reviewOf({ changedFiles: ["src/auth/session.ts", "unrelated.ts"] });
    expect(warnOnly.compliant).toBe(true);
    const blocking = reviewOf({ testResults: { passed: 0, failed: 0, total: 0 } });
    expect(blocking.compliant).toBe(false);
  });
});
