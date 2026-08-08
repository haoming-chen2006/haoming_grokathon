import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { agentRoutes } from "./agents";
import { repositoryRoutes } from "./repository";
import { ProjectStore } from "../services/projectStore";
import { getAgentRegistry } from "../services/agentRegistry";
import { seedDefaultTeam } from "../services/agentTeam";
import { setPlannerImplementation } from "../services/planner";
import { setAcpSessionManager } from "../services/acpSessionManager";
import type { Actor } from "../types/project";

/**
 * Contract tests between the control-room UI and the real API.
 *
 * The shell tests stub `fetch` with assumed response shapes. If the real endpoints return
 * something different the UI breaks and no unit test notices, because both sides were written
 * from the same assumption. These assert the fields `useControlRoom` actually reads are really
 * produced by the real handlers.
 */

const USER: Actor = { kind: "user", id: "user" };
let dataDir: string;
let repo: string;
let app: Hono;
let projectId: string;
let agentId: string;

async function get(path: string) {
  const res = await app.request(path);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function post(path: string, body?: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** Assert every field the UI dereferences is present. */
function hasFields(obj: any, fields: string[], where: string) {
  for (const f of fields) {
    expect(obj, `${where} is missing "${f}"`).toHaveProperty(f);
  }
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-contract-"));
  process.env.OPENUI_DATA_DIR = dataDir;

  repo = mkdtempSync(join(tmpdir(), "openui-contract-repo-"));
  execSync("git init -b main", { cwd: repo, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: repo, stdio: "pipe" });
  execSync("git config user.name T", { cwd: repo, stdio: "pipe" });
  writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
  execSync("git add . && git commit -m init", { cwd: repo, stdio: "pipe" });

  const store = new ProjectStore(join(dataDir, "projects"));
  const project = store.createProject({
    name: "Contract", goal: "verify shapes", repositoryPath: repo,
    documentContent: "# Design", budgetUsd: 10,
  });
  projectId = project.id;
  store.addRequirement(projectId, { id: "REQ-01", description: "d", ownerAgentId: "a1" }, USER);
  store.submitSuggestion(projectId, {
    authorAgentId: "a1", originalText: "o", proposedText: "p", reason: "r", requirementId: "REQ-01",
  });
  store.createPlan(projectId, { milestones: [] }, USER);
  store.addTask(projectId, { id: "t1", objective: "o", assignedAgentId: "a1" }, USER);
  store.approvePlan(projectId, USER);
  store.submitCode(projectId, {
    taskId: "t1", agentId: "a1", requirementIds: ["REQ-01"], branch: "agent/x",
    changedFiles: ["a.ts"], summary: "s", testResults: { passed: 1, failed: 0, total: 1 }, costUsd: 0.1,
  });
  store.sendMessage(projectId, {
    kind: "handoff", fromAgentId: "a1", toAgentId: "a2", body: "b",
    links: [{ kind: "task", id: "t1" }],
  });

  agentId = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer", budgetUsd: 3 }).id;

  app = new Hono();
  app.route("/api/projects", projectRoutes);
  app.route("/api/coding-agents", agentRoutes);
  app.route("/api/repository", repositoryRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("UI contract: the shapes useControlRoom reads", () => {
  test("GET /api/projects returns the fields the project picker uses", async () => {
    const { status, json } = await get("/api/projects");
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    hasFields(json[0], ["id", "name", "goal", "repositoryPath"], "project list item");
  });

  test("GET /api/projects/:id returns every collection the shell renders", async () => {
    const { status, json } = await get(`/api/projects/${projectId}`);
    expect(status).toBe(200);
    // ControlRoomApp reads all of these directly.
    hasFields(json, ["id", "name", "goal", "repositoryPath", "budgetUsd", "document",
      "requirements", "suggestions", "submissions", "messages", "tasks"], "project");
    hasFields(json.document, ["currentVersion"], "project.document");

    hasFields(json.requirements[0], ["id", "description", "status", "reviewStatus",
      "acceptanceCriteria", "affectedFiles", "taskIds", "baseVersion"], "requirement");
    hasFields(json.suggestions[0], ["id", "authorAgentId", "baseVersion", "originalText",
      "proposedText", "reason", "state", "affectedFiles"], "suggestion");
    hasFields(json.submissions[0], ["id", "taskId", "agentId", "requirementIds", "branch",
      "changedFiles", "summary", "testResults", "costUsd", "state"], "submission");
    hasFields(json.submissions[0].testResults, ["passed", "failed", "total"], "submission.testResults");
    hasFields(json.messages[0], ["id", "kind", "fromAgentId", "body", "links", "threadId", "createdAt"], "message");
  });

  test("GET /api/projects/:id/document returns what the editor renders", async () => {
    const { json } = await get(`/api/projects/${projectId}/document`);
    hasFields(json, ["title", "version", "content"], "document");
    expect(typeof json.version).toBe("number");
  });

  test("GET /api/projects/:id/progress returns what the header renders", async () => {
    const { json } = await get(`/api/projects/${projectId}/progress`);
    hasFields(json, ["percent", "completed", "total"], "progress");
    expect(typeof json.percent).toBe("number");
  });

  test("GET /api/coding-agents?projectId= returns what the cards render", async () => {
    const { json } = await get(`/api/coding-agents?projectId=${projectId}`);
    expect(Array.isArray(json)).toBe(true);
    hasFields(json[0], ["id", "projectId", "name", "role", "status", "activity",
      "costUsd", "tokensUsed", "skills", "tools"], "agent");
  });

  test("GET /api/coding-agents/costs/:projectId returns what the header renders", async () => {
    const { json } = await get(`/api/coding-agents/costs/${projectId}`);
    hasFields(json, ["projectCostUsd", "byAgent"], "costs");
    expect(typeof json.projectCostUsd).toBe("number");
  });

  test("PATCH position returns the saved position the canvas relies on", async () => {
    const res = await app.request(`/api/coding-agents/${agentId}/position`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x: 12, y: 34 }),
    });
    const json = (await res.json()) as { position: { x: number; y: number } };
    expect(json.position).toEqual({ x: 12, y: 34 });
  });

  test("suggestion resolve returns what the review queue expects", async () => {
    const project = await get(`/api/projects/${projectId}`);
    const id = project.json.suggestions[0].id;
    const { status, json } = await post(`/api/projects/${projectId}/suggestions/${id}/resolve`, { action: "reject" });
    expect(status).toBe(200);
    hasFields(json, ["suggestion"], "resolve result");
    expect(json.suggestion.state).toBe("rejected");
  });

  test("submission approve returns the updated submission", async () => {
    const project = await get(`/api/projects/${projectId}`);
    const id = project.json.submissions[0].id;
    const { status, json } = await post(`/api/projects/${projectId}/submissions/${id}/approve`, { note: "ok" });
    expect(status).toBe(200);
    hasFields(json, ["id", "state"], "approved submission");
    expect(json.state).toBe("approved");
  });

  test("a failing call returns an `error` string, which is what the UI displays", async () => {
    // useControlRoom surfaces body.error; anything else would render "undefined".
    const { status, json } = await get("/api/projects/does-not-exist");
    expect(status).toBe(404);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
  });
});

describe("UI contract: the endpoints the Control Room writes through", () => {
  // Iteration 36 wrote this file because the shell tests stub fetch with assumed shapes, so the
  // real endpoints could drift and no unit test would notice. The UI has since gained project
  // creation, requirement import, plan approval and task launch, and none of them were covered
  // here — the same gap, reopened by new features.

  test("POST /api/projects returns the created project with the id the UI selects", async () => {
    const { status, json } = await post("/api/projects", {
      name: "From the form", goal: "g", repositoryPath: repo, budgetUsd: 12,
      documentContent: "# Design\n\n- NEW-01: something",
    });
    expect(status).toBe(201);
    // useControlRoom reads project.id to select it, and document.currentVersion for the header.
    hasFields(json, ["id", "name", "goal", "repositoryPath", "document"], "created project");
    hasFields(json.document, ["currentVersion"], "created project document");
    expect(typeof json.id).toBe("string");
  });

  test("POST /api/projects/:id/requirements accepts what the form parses out of a document", async () => {
    // The exact shape shared/designDocument.ts produces.
    const { status, json } = await post(`/api/projects/${projectId}/requirements`, {
      id: "PARSED-01", description: "greet(name) returns a greeting",
    });
    expect(status).toBe(201);
    hasFields(json, ["id", "description", "status", "reviewStatus"], "created requirement");
  });

  test("GET /api/projects/:id carries the plan and tasks the Plan tab renders", async () => {
    const { json } = await get(`/api/projects/${projectId}`);
    // The hook reads full.plan and full.tasks; a rename here would silently empty the Plan tab.
    hasFields(json, ["plan", "tasks"], "project");
    hasFields(json.plan, ["id", "state"], "project.plan");
    hasFields(json.tasks[0], ["id", "objective", "status", "dependsOn"], "project.tasks[0]");
  });

  test("POST /plan/approve returns the approved plan", async () => {
    const fresh = new ProjectStore(join(dataDir, "projects")).createProject({
      name: "Approvable", goal: "g", repositoryPath: repo,
    }).id;
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(fresh, { milestones: [] }, USER);

    const { status, json } = await post(`/api/projects/${fresh}/plan/approve`, {});
    expect(status).toBe(200);
    // The Plan tab reads state to hide the approve control and enable Launch.
    expect(json.state).toBe("approved");
    hasFields(json, ["id", "state", "approvedBy"], "approved plan");
  });

  test("POST /tasks/:id/launch refuses a draft plan with the code the UI mirrors", async () => {
    const fresh = new ProjectStore(join(dataDir, "projects")).createProject({
      name: "Draft", goal: "g", repositoryPath: repo,
    }).id;
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(fresh, { milestones: [] }, USER);
    store.addTask(fresh, { id: "t-draft", objective: "o", assignedAgentId: "a1" }, USER);

    const { status, json } = await post(`/api/projects/${fresh}/tasks/t-draft/launch`, {});
    // The Plan tab disables Launch for exactly this reason; if the server stopped refusing, the
    // UI would be teaching a gate that no longer exists.
    expect(status).toBe(409);
    expect(json.code).toBe("PLAN_NOT_APPROVED");
  });

  test("GET /messages?includeArchived=true returns the shape the conversation view renders", async () => {
    const { status, json } = await get(`/api/projects/${projectId}/messages?includeArchived=true`);
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    hasFields(json[0], ["id", "kind", "fromAgentId", "body", "links", "threadId"], "message");
  });

  // POST /plan/generate used to be skipped here on the grounds that it starts a real Grok session
  // and that the UI read nothing from its response but the fact of it. Both halves stopped being
  // true: `setPlannerImplementation` replaces the live turn, and the panel now renders a notice
  // built from two fields of the reply. An uncovered response shape the UI depends on is exactly
  // what this file exists to catch.
  test("plan/generate returns the fields the plan notice is built from", async () => {
    setPlannerImplementation(async () => ({
      milestones: [],
      tasks: [
        { id: "t1", objective: "o", role: "Backend Engineer", requirementId: "REQ-01", dependsOn: [], expectedFiles: [], requiredTests: [] },
        { id: "t2", objective: "o", role: "Database Administrator", requirementId: "REQ-01", dependsOn: [], expectedFiles: [], requiredTests: [] },
      ],
      usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, reasoningTokens: 0 },
      raw: "{}",
    }));
    try {
      seedDefaultTeam(projectId, { registry: getAgentRegistry() });
      const { status, json } = await post(`/api/projects/${projectId}/plan/generate`, {});

      expect(status).toBe(201);
      // useControlRoom reads exactly these two, and renders nothing when both are absent.
      expect(json.unmatchedRoles).toEqual(["Database Administrator"]);
      expect(json.teamMissing).toBeUndefined();
      expect(json.plan.state).toBe("draft");
    } finally {
      setPlannerImplementation(null);
    }
  });

  test("plan/generate says the team is missing when there is none", async () => {
    setPlannerImplementation(async () => ({
      milestones: [],
      tasks: [{ id: "t1", objective: "o", role: "Backend Engineer", requirementId: "REQ-01", dependsOn: [], expectedFiles: [], requiredTests: [] }],
      usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, reasoningTokens: 0 },
      raw: "{}",
    }));
    try {
      // The shared fixture project already has an agent, so this needs one of its own. `seedTeam`
      // is not something the browser sends; it is the only way to reach the teamless state now
      // that creating a project seeds the team.
      const created = await post("/api/projects", {
        name: "Teamless", goal: "g", repositoryPath: repo, seedTeam: false,
      });
      const { json } = await post(`/api/projects/${created.json.id}/plan/generate`, {});

      expect(json.teamMissing).toBe(true);
      expect(json.unmatchedRoles).toBeUndefined();
    } finally {
      setPlannerImplementation(null);
    }
  });

  /*
   * Found by diffing the endpoints useControlRoom calls against the ones covered here, which §3 of
   * loopdesign.md recommends and which has found real bugs four times. Three of the twenty-six were
   * uncovered, and all three are shapes the hook dereferences rather than merely awaits — the merge
   * endpoint, also uncovered, reads nothing from its reply and so does not belong in this file.
   *
   * `loadDiff` says it adapts "two endpoints [that] answer in different shapes" — a bare array from
   * one, a wrapped `{ diff }` from the other. That asymmetry is precisely the kind of thing that
   * gets tidied up server-side by someone who has not read the client.
   */
  test("repository/changed-files is a bare array of the fields DiffView renders", async () => {
    writeFileSync(join(repo, "b.ts"), "export const y = 2;\n");
    const query = `worktree=${encodeURIComponent(repo)}&base=main`;
    const { status, json } = await get(`/api/repository/changed-files?${query}`);

    expect(status).toBe(200);
    expect(Array.isArray(json), "loadDiff maps over this directly — an envelope would break it").toBe(true);
    expect(json.length).toBeGreaterThan(0);
    hasFields(json[0], ["path"], "changed file");
    expect(typeof json[0].path).toBe("string");
  });

  test("repository/diff wraps its text, and is not the bare string", async () => {
    writeFileSync(join(repo, "b.ts"), "export const y = 2;\n");
    const query = `worktree=${encodeURIComponent(repo)}&base=main`;
    const { status, json } = await get(`/api/repository/diff?${query}`);

    expect(status).toBe(200);
    hasFields(json, ["diff"], "diff response");
    expect(typeof json.diff).toBe("string");
  });

  test("a session control returns the state the drawer switches on", async () => {
    // sessionAction does `setSessionState(session.state)` for pause, resume and stop alike. A reply
    // without `state` sets the drawer to undefined, which renders as a session in no state at all.
    // The manager is substituted because the alternative is spawning a real agent to pause it.
    const states: string[] = [];
    setAcpSessionManager({
      pause: (id: string) => { states.push("pause"); return { agentId: id, state: "paused" }; },
      resume: (id: string) => { states.push("resume"); return { agentId: id, state: "ready" }; },
      stop: (id: string) => { states.push("stop"); return { agentId: id, state: "stopped" }; },
    } as never);
    try {
      for (const action of ["pause", "resume", "stop"]) {
        const { status, json } = await post(`/api/coding-agents/${agentId}/session/${action}`);
        expect(status, `${action} answered ${status}`).toBe(200);
        hasFields(json, ["state"], `${action} result`);
        expect(typeof json.state).toBe("string");
      }
      expect(states).toEqual(["pause", "resume", "stop"]);
    } finally {
      setAcpSessionManager(null);
    }
  });

  test("a control on an agent with no session is an error the shell can show", async () => {
    // The real manager answers 409 here. useControlRoom lets `json()` throw and puts the message in
    // the error banner, so the body has to carry one rather than being an empty 409.
    const { status, json } = await post(`/api/coding-agents/${agentId}/session/pause`);
    expect(status).toBe(409);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
  });
});
