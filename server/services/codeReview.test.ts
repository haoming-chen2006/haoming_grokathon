import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NotFoundError, PermissionDeniedError, ProjectStore } from "./projectStore";
import { CompletionGateError, IncompleteSubmissionError, missingSubmissionFields, testsPass } from "./codeReview";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };
const AGENT: Actor = { kind: "agent", id: "backend-agent" };

let dir: string;
let store: ProjectStore;
let projectId: string;

const GOOD_TESTS = { passed: 22, failed: 0, total: 22, command: "bun test" };

function baseSubmission(overrides: Record<string, any> = {}) {
  return {
    taskId: "task-api",
    agentId: "backend-agent",
    requirementIds: ["AUTH-03"],
    branch: "agent/auth-backend",
    changedFiles: ["src/auth/session.ts", "src/auth/token.ts"],
    diff: "+ session refresh handler",
    summary: "Implemented refresh-token rotation",
    knownLimitations: "None",
    testResults: GOOD_TESTS,
    costUsd: 0.84,
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-review-"));
  store = new ProjectStore(dir);
  const project = store.createProject({ name: "Auth", goal: "g", repositoryPath: "/tmp/r" });
  projectId = project.id;
  store.addRequirement(projectId, { id: "AUTH-03", description: "Stay signed in", ownerAgentId: "backend-agent" }, USER);
  store.createPlan(projectId, { milestones: [] }, USER);
  store.addTask(projectId, { id: "task-api", objective: "Auth API", assignedAgentId: "backend-agent" }, USER);
  store.approvePlan(projectId, USER);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("V-037: code submission contains complete evidence", () => {
  test("a complete submission is accepted and carries every required field", () => {
    const submission = store.submitCode(projectId, baseSubmission());

    expect(submission.id).toBeTruthy();
    expect(submission.branch).toBe("agent/auth-backend");
    expect(submission.changedFiles).toHaveLength(2);
    expect(submission.diff).toContain("session refresh handler");
    expect(submission.summary).toBe("Implemented refresh-token rotation");
    expect(submission.requirementIds).toEqual(["AUTH-03"]);
    expect(submission.testResults.passed).toBe(22);
    expect(submission.knownLimitations).toBe("None");
    expect(submission.costUsd).toBeCloseTo(0.84, 6);
    expect(submission.state).toBe("pending");
  });

  test("missingSubmissionFields names every absent piece of evidence", () => {
    expect(missingSubmissionFields({})).toEqual([
      "taskId",
      "agentId",
      "branch",
      "summary",
      "changedFiles",
      "requirementIds",
      "testResults",
      "costUsd",
    ]);
  });

  test("an incomplete submission is refused, listing what is missing", () => {
    let caught: unknown;
    try {
      store.submitCode(projectId, baseSubmission({ summary: "  ", testResults: undefined, costUsd: undefined }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IncompleteSubmissionError);
    expect((caught as IncompleteSubmissionError).missing).toEqual(["summary", "testResults", "costUsd"]);
    // Nothing is recorded when the submission is refused.
    expect(store.listSubmissions(projectId)).toHaveLength(0);
  });

  test("an empty changed-file list is not complete evidence", () => {
    expect(() => store.submitCode(projectId, baseSubmission({ changedFiles: [] }))).toThrow(
      IncompleteSubmissionError,
    );
  });

  test("submitting moves the task and its requirements into review", () => {
    store.submitCode(projectId, baseSubmission());
    expect(store.getTask(projectId, "task-api").status).toBe("needs_review");
    expect(store.getRequirement(projectId, "AUTH-03").status).toBe("submitted");
    expect(store.getRequirement(projectId, "AUTH-03").reviewStatus).toBe("pending");
  });
});

describe("V-038: user can request changes", () => {
  test("requesting changes returns the task to working and messages the agent", () => {
    const original = store.submitCode(projectId, baseSubmission());
    const { submission, message } = store.requestChanges(
      projectId,
      original.id,
      "Token rotation is not covered by a test.",
      USER,
    );

    expect(submission.state).toBe("changes_requested");
    expect(submission.reviewFeedback).toContain("not covered by a test");
    expect(submission.reviewedBy).toBe("user");

    // The task goes back to the agent.
    expect(store.getTask(projectId, "task-api").status).toBe("working");
    expect(store.getRequirement(projectId, "AUTH-03").status).toBe("in_progress");

    // Feedback reaches the agent as a linked message, not just a field.
    expect(message.toAgentId).toBe("backend-agent");
    expect(message.kind).toBe("review_request");
    expect(message.links.map((l) => l.kind)).toContain("review");
    expect(message.body).toContain("not covered by a test");
  });

  test("feedback is mandatory when requesting changes", () => {
    const original = store.submitCode(projectId, baseSubmission());
    expect(() => store.requestChanges(projectId, original.id, "   ", USER)).toThrow(/feedback is required/);
  });

  test("a revised submission can be created and links to the original", () => {
    const original = store.submitCode(projectId, baseSubmission());
    store.requestChanges(projectId, original.id, "Add a test", USER);

    const revised = store.submitCode(
      projectId,
      baseSubmission({ summary: "Added rotation test", revisionOf: original.id }),
    );

    expect(revised.revisionOf).toBe(original.id);
    expect(revised.state).toBe("pending");
    expect(store.listSubmissions(projectId)).toHaveLength(2);
  });

  test("revising an unknown submission is rejected", () => {
    expect(() => store.submitCode(projectId, baseSubmission({ revisionOf: "nope" }))).toThrow(NotFoundError);
  });

  test("an already-reviewed submission cannot be re-reviewed", () => {
    const original = store.submitCode(projectId, baseSubmission());
    store.requestChanges(projectId, original.id, "fix", USER);
    expect(() => store.requestChanges(projectId, original.id, "again", USER)).toThrow(/not pending review/);
  });
});

describe("V-039: approved code can be merged", () => {
  test("approval requires the user and passing tests", () => {
    const submission = store.submitCode(projectId, baseSubmission());
    expect(() => store.approveSubmission(projectId, submission.id, AGENT)).toThrow(PermissionDeniedError);

    const approved = store.approveSubmission(projectId, submission.id, USER, "LGTM");
    expect(approved.state).toBe("approved");
    expect(store.getRequirement(projectId, "AUTH-03").reviewStatus).toBe("approved");
  });

  test("a submission with failing tests cannot be approved", () => {
    // V-035: failed tests block completion.
    const submission = store.submitCode(
      projectId,
      baseSubmission({ testResults: { passed: 18, failed: 2, total: 20 } }),
    );
    expect(() => store.approveSubmission(projectId, submission.id, USER)).toThrow(
      /2 of 20 required tests are failing/,
    );
    expect(store.getSubmission(projectId, submission.id).state).toBe("pending");
  });

  test("testsPass rejects zero-total runs", () => {
    // A suite that ran nothing must not read as success.
    expect(testsPass({ passed: 0, failed: 0, total: 0 })).toBe(false);
    expect(testsPass({ passed: 22, failed: 0, total: 22 })).toBe(true);
    expect(testsPass({ passed: 21, failed: 0, total: 22 })).toBe(false);
  });

  test("only an approved submission may be merged, and only by the user", () => {
    const submission = store.submitCode(projectId, baseSubmission());
    expect(() => store.recordMerge(projectId, submission.id, "abc123", USER)).toThrow(/only an approved/);

    store.approveSubmission(projectId, submission.id, USER);
    expect(() => store.recordMerge(projectId, submission.id, "abc123", AGENT)).toThrow(PermissionDeniedError);

    const merged = store.recordMerge(projectId, submission.id, "abc123def", USER);
    expect(merged.state).toBe("merged");
    expect(merged.mergeCommit).toBe("abc123def");
    expect(merged.mergedAt).toBeTruthy();
    expect(store.getTask(projectId, "task-api").status).toBe("complete");
    expect(store.getRequirement(projectId, "AUTH-03").status).toBe("merged");
  });

  test("a merge cannot be recorded without a commit", () => {
    const submission = store.submitCode(projectId, baseSubmission());
    store.approveSubmission(projectId, submission.id, USER);
    // A failed merge produces no commit — recording it anyway would falsely complete the work.
    expect(() => store.recordMerge(projectId, submission.id, "   ", USER)).toThrow(/merge commit is required/);
    expect(store.getSubmission(projectId, submission.id).state).toBe("approved");
    expect(store.getRequirement(projectId, "AUTH-03").status).not.toBe("merged");
  });
});

describe("V-040: requirement completion follows merge", () => {
  function completeFlow() {
    const submission = store.submitCode(projectId, baseSubmission());
    store.approveSubmission(projectId, submission.id, USER);
    store.recordMerge(projectId, submission.id, "abc123def", USER);
    return submission;
  }

  test("a requirement completes only after every gate passes", () => {
    completeFlow();
    const { requirement, gate } = store.completeRequirement(projectId, "AUTH-03", USER);

    expect(requirement.status).toBe("complete");
    expect(gate.implementationAccepted).toBe(true);
    expect(gate.testsPassing).toBe(true);
    expect(gate.reviewPassed).toBe(true);
    expect(gate.merged).toBe(true);
    expect(gate.designChangesReflected).toBe(true);
  });

  test("completion is refused before submission, naming every open gate", () => {
    let caught: unknown;
    try {
      store.completeRequirement(projectId, "AUTH-03", USER);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CompletionGateError);
    const unmet = (caught as CompletionGateError).unmet;
    expect(unmet).toContain("implementation not accepted");
    expect(unmet).toContain("required tests not passing");
    expect(unmet).toContain("review not approved");
    expect(unmet).toContain("code not merged");
  });

  test("an approved but unmerged submission still cannot complete", () => {
    const submission = store.submitCode(projectId, baseSubmission());
    store.approveSubmission(projectId, submission.id, USER);

    let caught: unknown;
    try {
      store.completeRequirement(projectId, "AUTH-03", USER);
    } catch (err) {
      caught = err;
    }
    expect((caught as CompletionGateError).unmet).toEqual(["code not merged"]);
    expect(store.getRequirement(projectId, "AUTH-03").status).not.toBe("complete");
  });

  test("only the user may complete a requirement", () => {
    completeFlow();
    expect(() => store.completeRequirement(projectId, "AUTH-03", AGENT)).toThrow(PermissionDeniedError);
  });

  test("the gate can be inspected without attempting the transition", () => {
    const { unmet } = store.completionGate(projectId, "AUTH-03");
    expect(unmet.length).toBeGreaterThan(0);
    // Inspecting must not mutate anything.
    expect(store.getRequirement(projectId, "AUTH-03").status).toBe("assigned");
  });

  test("the whole review history survives a restart", () => {
    completeFlow();
    store.completeRequirement(projectId, "AUTH-03", USER);

    const reopened = new ProjectStore(dir);
    const submissions = reopened.listSubmissions(projectId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].state).toBe("merged");
    expect(submissions[0].mergeCommit).toBe("abc123def");
    expect(reopened.getRequirement(projectId, "AUTH-03").status).toBe("complete");
  });
});
