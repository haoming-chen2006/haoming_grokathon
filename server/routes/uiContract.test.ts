import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { agentRoutes } from "./agents";
import { ProjectStore } from "../services/projectStore";
import { getAgentRegistry } from "../services/agentRegistry";
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
