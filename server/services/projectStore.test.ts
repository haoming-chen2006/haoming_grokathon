import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  NotFoundError,
  PermissionDeniedError,
  ProjectStore,
  VersionConflictError,
} from "./projectStore";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };
const AGENT: Actor = { kind: "agent", id: "backend-agent" };
const PRIVILEGED_AGENT: Actor = { kind: "agent", id: "planner", canWriteDocument: true };

let dir: string;
let store: ProjectStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-projects-"));
  store = new ProjectStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeProject(content = "# Auth Design\n\nUsers sign in with a modal.") {
  return store.createProject({
    name: "Authentication",
    goal: "Ship auth",
    repositoryPath: "/tmp/repo",
    documentContent: content,
  });
}

describe("V-012: design document can be created or imported", () => {
  test("creates a project with an initial document version", () => {
    const project = makeProject();
    expect(project.id).toBeTruthy();
    expect(project.document.currentVersion).toBe(1);
    expect(project.document.versions).toHaveLength(1);
    expect(store.getDocument(project.id).content).toContain("Auth Design");
  });

  test("imported content persists to disk and survives a fresh store instance", () => {
    const project = makeProject("# Imported PRD\n\nPasted from an issue.");
    expect(existsSync(join(dir, `${project.id}.json`))).toBe(true);

    // A new store reads the same directory — equivalent to a server restart (V-049).
    const reopened = new ProjectStore(dir);
    expect(reopened.getDocument(project.id).content).toContain("Imported PRD");
    expect(reopened.getProject(project.id).name).toBe("Authentication");
  });

  test("lists projects and deletes them", () => {
    const a = makeProject();
    expect(store.listProjects().map((p) => p.id)).toContain(a.id);
    store.deleteProject(a.id);
    expect(store.listProjects()).toHaveLength(0);
    expect(() => store.getProject(a.id)).toThrow(NotFoundError);
  });
});

describe("V-013: requirements are trackable", () => {
  test("a requirement carries id, status, owner and acceptance criteria", () => {
    const project = makeProject();
    const req = store.addRequirement(
      project.id,
      {
        id: "AUTH-03",
        description: "Users remain signed in after refreshing the page.",
        acceptanceCriteria: ["Session survives reload", "Token rotates"],
        ownerAgentId: "backend-agent",
      },
      USER,
    );

    expect(req.id).toBe("AUTH-03");
    expect(req.ownerAgentId).toBe("backend-agent");
    expect(req.status).toBe("assigned"); // owner present => assigned, not defined
    expect(req.acceptanceCriteria).toHaveLength(2);
    expect(req.acceptanceCriteria.every((c) => c.met === false)).toBe(true);
    expect(req.baseVersion).toBe(1);
  });

  test("unowned requirements start as defined", () => {
    const project = makeProject();
    expect(store.addRequirement(project.id, { id: "AUTH-01", description: "x" }, USER).status).toBe("defined");
  });

  test("rejects duplicate requirement ids", () => {
    const project = makeProject();
    store.addRequirement(project.id, { id: "AUTH-01", description: "x" }, USER);
    expect(() => store.addRequirement(project.id, { id: "AUTH-01", description: "y" }, USER)).toThrow(
      /already exists/,
    );
  });

  test("implementation activity is linked to the requirement", () => {
    const project = makeProject();
    store.addRequirement(project.id, { id: "AUTH-03", description: "x", ownerAgentId: "backend-agent" }, USER);

    const updated = store.updateRequirement(
      project.id,
      "AUTH-03",
      {
        status: "in_progress",
        branch: "agent/auth-backend",
        worktree: ".agents/auth-backend",
        affectedFiles: ["src/auth/session.ts"],
        testsPassing: 18,
        testsTotal: 20,
      },
      AGENT,
    );

    expect(updated.branch).toBe("agent/auth-backend");
    expect(updated.testsPassing).toBe(18);
    expect(store.getRequirement(project.id, "AUTH-03").affectedFiles).toContain("src/auth/session.ts");
  });

  test("an agent cannot update a requirement it does not own", () => {
    const project = makeProject();
    store.addRequirement(project.id, { id: "AUTH-03", description: "x", ownerAgentId: "backend-agent" }, USER);
    const intruder: Actor = { kind: "agent", id: "frontend-agent" };
    expect(() => store.updateRequirement(project.id, "AUTH-03", { status: "complete" }, intruder)).toThrow(
      PermissionDeniedError,
    );
  });
});

describe("V-014: canonical document is protected", () => {
  test("agents can read the document by default", () => {
    const project = makeProject();
    expect(store.getDocument(project.id).content).toContain("Auth Design");
  });

  test("an agent without a grant cannot rewrite approved content", () => {
    const project = makeProject();
    expect(() => store.updateDocument(project.id, "rewritten", AGENT)).toThrow(PermissionDeniedError);
    // The rejection must explain the sanctioned path.
    try {
      store.updateDocument(project.id, "rewritten", AGENT);
    } catch (err) {
      expect((err as Error).message).toContain("design suggestion");
    }
    // And the document must be untouched.
    expect(store.getDocument(project.id).version).toBe(1);
    expect(store.getDocument(project.id).content).toContain("Auth Design");
  });

  test("an agent cannot create requirements without a grant", () => {
    const project = makeProject();
    expect(() => store.addRequirement(project.id, { id: "X-1", description: "x" }, AGENT)).toThrow(
      PermissionDeniedError,
    );
  });

  test("a scoped grant permits direct document writes", () => {
    const project = makeProject();
    const updated = store.updateDocument(project.id, "granted rewrite", PRIVILEGED_AGENT);
    expect(updated.document.currentVersion).toBe(2);
    expect(store.getDocument(project.id).content).toBe("granted rewrite");
  });

  test("the user may always write", () => {
    const project = makeProject();
    expect(store.updateDocument(project.id, "user edit", USER).document.currentVersion).toBe(2);
  });
});

describe("V-015: design suggestions work", () => {
  test("a suggestion records author, original, proposed and reason", () => {
    const project = makeProject();
    const suggestion = store.submitSuggestion(project.id, {
      authorAgentId: "frontend-agent",
      originalText: "Users sign in with a modal.",
      proposedText: "Users sign in via a full-page OAuth redirect.",
      reason: "The OAuth provider blocks embedded authentication.",
      affectedFiles: ["src/auth/Login.tsx"],
    });

    expect(suggestion.state).toBe("pending");
    expect(suggestion.authorAgentId).toBe("frontend-agent");
    expect(suggestion.baseVersion).toBe(1);
    expect(suggestion.reason).toContain("blocks embedded");
    expect(store.listSuggestions(project.id, "pending")).toHaveLength(1);
  });

  test("accepting applies the change and creates a new document version", () => {
    const project = makeProject();
    const suggestion = store.submitSuggestion(project.id, {
      authorAgentId: "frontend-agent",
      originalText: "Users sign in with a modal.",
      proposedText: "Users sign in via a full-page OAuth redirect.",
      reason: "Provider blocks embedded auth.",
    });

    const { suggestion: resolved, newVersion } = store.resolveSuggestion(
      project.id,
      suggestion.id,
      "accept",
      USER,
    );

    expect(resolved.state).toBe("accepted");
    expect(newVersion).toBe(2);

    const doc = store.getDocument(project.id);
    expect(doc.version).toBe(2);
    expect(doc.content).toContain("full-page OAuth redirect");
    expect(doc.content).not.toContain("sign in with a modal");

    // Provenance: the new version records which suggestion produced it.
    const v2 = store.getDocumentVersion(project.id, 2);
    expect(v2.fromSuggestionId).toBe(suggestion.id);
    expect(v2.changeSummary).toContain("frontend-agent");

    // Version 1 remains retrievable (§12 implementation provenance).
    expect(store.getDocumentVersion(project.id, 1).content).toContain("sign in with a modal");
  });

  test("rejecting leaves the document untouched", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "Users sign in with a modal.",
      proposedText: "nope",
      reason: "r",
    });
    store.resolveSuggestion(project.id, s.id, "reject", USER, "Not now");

    expect(store.listSuggestions(project.id, "rejected")).toHaveLength(1);
    expect(store.getDocument(project.id).version).toBe(1);
    expect(store.getDocument(project.id).content).toContain("modal");
  });

  test("requesting revision returns the suggestion to the author", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "x",
      proposedText: "y",
      reason: "r",
    });
    const { suggestion } = store.resolveSuggestion(project.id, s.id, "request_revision", USER, "Add risks");
    expect(suggestion.state).toBe("revision_requested");
    expect(suggestion.resolutionNote).toBe("Add risks");
  });

  test("the user can edit a suggestion before accepting it", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "frontend-agent",
      originalText: "Users sign in with a modal.",
      proposedText: "Users sign in via a redirect.",
      reason: "Provider blocks embedded auth.",
    });

    const edited = store.editSuggestion(
      project.id,
      s.id,
      { proposedText: "Users sign in via a full-page OAuth redirect and return to their route." },
      USER,
    );

    expect(edited.proposedText).toContain("return to their route");
    // The agent's original wording is preserved for provenance.
    expect(edited.originalProposedText).toBe("Users sign in via a redirect.");
    expect(edited.editedBy).toBe("user");
    expect(edited.state).toBe("pending");

    // The edited text is what actually lands in the document.
    store.resolveSuggestion(project.id, s.id, "accept", USER);
    expect(store.getDocument(project.id).content).toContain("return to their route");
  });

  test("an agent may not edit a suggestion", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "backend-agent",
      originalText: "x",
      proposedText: "y",
      reason: "r",
    });
    expect(() => store.editSuggestion(project.id, s.id, { proposedText: "z" }, AGENT)).toThrow(
      PermissionDeniedError,
    );
  });

  test("a resolved suggestion can no longer be edited", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "x",
      proposedText: "y",
      reason: "r",
    });
    store.resolveSuggestion(project.id, s.id, "reject", USER);
    expect(() => store.editSuggestion(project.id, s.id, { proposedText: "z" }, USER)).toThrow(
      /no longer be edited/,
    );
  });

  test("a revision-requested suggestion can be edited back into pending", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "x",
      proposedText: "y",
      reason: "r",
    });
    store.resolveSuggestion(project.id, s.id, "request_revision", USER, "needs risks");
    const edited = store.editSuggestion(project.id, s.id, { risks: "Low" }, USER);
    expect(edited.state).toBe("pending");
    expect(edited.risks).toBe("Low");
  });

  test("an agent may not resolve its own suggestion", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "backend-agent",
      originalText: "x",
      proposedText: "y",
      reason: "r",
    });
    expect(() => store.resolveSuggestion(project.id, s.id, "accept", AGENT)).toThrow(PermissionDeniedError);
    expect(store.getDocument(project.id).version).toBe(1);
  });
});

describe("V-016: version conflicts are detected", () => {
  test("a pending suggestion goes stale when the document moves on", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "Users sign in with a modal.",
      proposedText: "y",
      reason: "r",
    });
    expect(s.baseVersion).toBe(1);

    store.updateDocument(project.id, "# Rewritten by the user", USER);

    expect(store.listSuggestions(project.id, "stale")).toHaveLength(1);
    expect(store.listSuggestions(project.id, "pending")).toHaveLength(0);
  });

  test("a stale suggestion is never silently applied", () => {
    const project = makeProject();
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "Users sign in with a modal.",
      proposedText: "y",
      reason: "r",
    });
    store.updateDocument(project.id, "# Rewritten", USER); // -> version 2, suggestion now stale

    let caught: unknown;
    try {
      store.resolveSuggestion(project.id, s.id, "accept", USER);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(VersionConflictError);
    expect((caught as VersionConflictError).baseVersion).toBe(1);
    expect((caught as VersionConflictError).currentVersion).toBe(2);
    // The document must not have advanced as a side effect of the refused accept.
    expect(store.getDocument(project.id).version).toBe(2);
    expect(store.getDocument(project.id).content).toBe("# Rewritten");
  });

  test("a suggestion submitted against an old version arrives stale", () => {
    const project = makeProject();
    store.updateDocument(project.id, "v2 content", USER);
    const s = store.submitSuggestion(project.id, {
      authorAgentId: "a",
      originalText: "x",
      proposedText: "y",
      reason: "r",
      baseVersion: 1,
    });
    expect(s.state).toBe("stale");
  });

  test("optimistic concurrency rejects a write against a superseded version", () => {
    const project = makeProject();
    store.updateDocument(project.id, "v2", USER);
    expect(() => store.updateDocument(project.id, "v3", USER, { expectedVersion: 1 })).toThrow(
      VersionConflictError,
    );
    expect(store.getDocument(project.id).version).toBe(2);
  });
});

describe("V-017/V-018: plan generation and the approval gate", () => {
  test("a plan is created as a draft, never auto-approved", () => {
    const project = makeProject();
    const plan = store.createPlan(
      project.id,
      { authorAgentId: "planner", milestones: [{ name: "Authentication API", ownerAgentId: "backend-agent" }] },
      { kind: "agent", id: "planner" },
    );
    expect(plan.state).toBe("draft");
    expect(plan.authorAgentId).toBe("planner");
    expect(plan.milestones).toHaveLength(1);
    expect(plan.approvedAt).toBeUndefined();
  });

  test("tasks do not launch while the plan is a draft", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    const t = store.addTask(project.id, { objective: "Implement auth endpoints" }, USER);
    expect(() => store.assertTaskLaunchable(project.id, t.id)).toThrow(/approve/);
    // And the status transition itself is refused.
    expect(() => store.updateTask(project.id, t.id, { status: "working" }, USER)).toThrow(/approve/);
  });

  test("the user can edit assignments before approving", () => {
    const project = makeProject();
    const plan = store.createPlan(project.id, { milestones: [{ id: "m1", name: "API" }] }, USER);
    const updated = store.updatePlan(
      project.id,
      { milestones: [{ ...plan.milestones[0], ownerAgentId: "backend-agent" }] },
      USER,
    );
    expect(updated.milestones[0].ownerAgentId).toBe("backend-agent");
  });

  test("only the user may approve", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    expect(() => store.approvePlan(project.id, AGENT)).toThrow(PermissionDeniedError);
    expect(store.getProject(project.id).plan!.state).toBe("draft");
  });

  test("approval unlocks execution and is recorded", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    const t = store.addTask(project.id, { objective: "x", assignedAgentId: "backend-agent" }, USER);

    const approved = store.approvePlan(project.id, USER);
    expect(approved.state).toBe("approved");
    expect(approved.approvedBy).toBe("user");
    expect(approved.approvedAt).toBeTruthy();

    const { task } = store.updateTask(project.id, t.id, { status: "working" }, AGENT);
    expect(task.status).toBe("working");
  });

  test("an approved plan can no longer be edited", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    store.approvePlan(project.id, USER);
    expect(() => store.updatePlan(project.id, { milestones: [] }, USER)).toThrow(/no longer be edited/);
  });

  test("a cyclic graph cannot be approved", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    store.addTask(project.id, { id: "a", objective: "a" }, USER);
    // Adding the closing edge is itself rejected, so the cycle never persists.
    expect(() => store.addTask(project.id, { id: "b", objective: "b", dependsOn: ["b"] }, USER)).toThrow(
      /cycle/,
    );
  });
});

describe("V-019: dependency completion unblocks the next agent", () => {
  function planned() {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    store.addTask(project.id, { id: "api", objective: "Auth API", assignedAgentId: "backend-agent" }, USER);
    store.addTask(
      project.id,
      { id: "ui", objective: "Login UI", assignedAgentId: "frontend-agent", dependsOn: ["api"] },
      USER,
    );
    store.approvePlan(project.id, USER);
    return project;
  }

  test("a blocked task is reported as waiting with its blockers", () => {
    const project = planned();
    const tasks = store.listTasks(project.id);
    expect(tasks.find((t) => t.id === "api")!.effectiveStatus).toBe("ready");
    const ui = tasks.find((t) => t.id === "ui")!;
    expect(ui.effectiveStatus).toBe("blocked");
    expect(ui.blockedBy).toEqual(["api"]);
  });

  test("the blocked agent cannot start early", () => {
    const project = planned();
    expect(() => store.updateTask(project.id, "ui", { status: "working" }, { kind: "agent", id: "frontend-agent" })).toThrow(
      /waiting on/,
    );
  });

  test("completing the dependency unblocks the dependent and names it", () => {
    const project = planned();
    const { unblocked } = store.updateTask(
      project.id,
      "api",
      { status: "complete" },
      { kind: "agent", id: "backend-agent" },
    );
    expect(unblocked.map((t) => t.id)).toEqual(["ui"]);

    expect(store.listTasks(project.id).find((t) => t.id === "ui")!.effectiveStatus).toBe("ready");
    const started = store.updateTask(project.id, "ui", { status: "working" }, { kind: "agent", id: "frontend-agent" });
    expect(started.task.status).toBe("working");
  });

  test("the user can edit task assignment and budget before approval", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    const t = store.addTask(project.id, { objective: "x", budgetUsd: 2 }, USER);

    const { task } = store.updateTask(
      project.id,
      t.id,
      { assignedAgentId: "backend-agent", budgetUsd: 5 },
      USER,
    );
    expect(task.assignedAgentId).toBe("backend-agent");
    expect(task.budgetUsd).toBe(5);
  });

  test("an agent may not raise its own budget", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    const t = store.addTask(project.id, { objective: "x", assignedAgentId: "backend-agent", budgetUsd: 1 }, USER);
    expect(() => store.updateTask(project.id, t.id, { budgetUsd: 999 }, AGENT)).toThrow(PermissionDeniedError);
    expect(store.getTask(project.id, t.id).budgetUsd).toBe(1);
  });

  test("an agent may not rewire dependencies", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    store.addTask(project.id, { id: "a", objective: "a" }, USER);
    const b = store.addTask(project.id, { id: "b", objective: "b", assignedAgentId: "backend-agent", dependsOn: ["a"] }, USER);
    expect(() => store.updateTask(project.id, b.id, { dependsOn: [] }, AGENT)).toThrow(PermissionDeniedError);
  });

  test("rewiring dependencies into a cycle is rejected", () => {
    const project = makeProject();
    store.createPlan(project.id, { milestones: [] }, USER);
    store.addTask(project.id, { id: "a", objective: "a" }, USER);
    store.addTask(project.id, { id: "b", objective: "b", dependsOn: ["a"] }, USER);
    expect(() => store.updateTask(project.id, "a", { dependsOn: ["b"] }, USER)).toThrow(/cycle/);
  });

  test("an agent cannot update a task assigned to someone else", () => {
    const project = planned();
    expect(() =>
      store.updateTask(project.id, "api", { status: "complete" }, { kind: "agent", id: "frontend-agent" }),
    ).toThrow(PermissionDeniedError);
  });

  test("execution order respects dependencies", () => {
    const project = planned();
    expect(store.getExecutionOrder(project.id).map((t) => t.id)).toEqual(["api", "ui"]);
  });

  test("tasks link back to their requirement", () => {
    const project = makeProject();
    store.addRequirement(project.id, { id: "AUTH-03", description: "x" }, USER);
    const t = store.addTask(project.id, { objective: "impl", requirementId: "AUTH-03" }, USER);
    expect(store.getRequirement(project.id, "AUTH-03").taskIds).toContain(t.id);
  });

  test("the task graph survives a restart", () => {
    const project = planned();
    store.updateTask(project.id, "api", { status: "complete" }, { kind: "agent", id: "backend-agent" });

    const reopened = new ProjectStore(dir);
    const tasks = reopened.listTasks(project.id);
    expect(tasks.find((t) => t.id === "api")!.status).toBe("complete");
    expect(tasks.find((t) => t.id === "ui")!.effectiveStatus).toBe("ready");
    expect(reopened.getProject(project.id).plan!.state).toBe("approved");
  });
});

describe("V-020: progress uses objective milestones", () => {
  test("progress is computed from requirement statuses, not an estimate", () => {
    const project = makeProject();
    store.addRequirement(project.id, { id: "R-1", description: "a" }, USER);
    store.addRequirement(project.id, { id: "R-2", description: "b" }, USER);
    store.addRequirement(project.id, { id: "R-3", description: "c" }, USER);
    store.addRequirement(project.id, { id: "R-4", description: "d" }, USER);

    store.updateRequirement(project.id, "R-1", { status: "complete" }, USER);
    store.updateRequirement(project.id, "R-2", { status: "merged" }, USER);

    const progress = store.getProgress(project.id);
    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(1);
    expect(progress.percent).toBe(25);
    expect(progress.byStatus.complete).toBe(1);
    expect(progress.byStatus.merged).toBe(1);
    expect(progress.byStatus.defined).toBe(2);
    expect(progress.formula).toContain("status=complete");
  });

  test("an empty project reports 0% rather than dividing by zero", () => {
    expect(store.getProgress(makeProject().id).percent).toBe(0);
  });
});
