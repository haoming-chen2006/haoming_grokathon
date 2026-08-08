import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { ProjectStore, getProjectStore } from "../services/projectStore";
import type { Actor } from "../types/project";

/**
 * Route-level tests for endpoints added in iterations 32–34, which had been verified by hand
 * against a running server but never covered automatically.
 */

const USER: Actor = { kind: "user", id: "user" };
let dataDir: string;
let repo: string;
let app: Hono;
let projectId: string;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-routes-"));
  process.env.OPENUI_DATA_DIR = dataDir;

  repo = mkdtempSync(join(tmpdir(), "openui-routes-repo-"));
  execSync("git init -b main", { cwd: repo, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: repo, stdio: "pipe" });
  execSync("git config user.name T", { cwd: repo, stdio: "pipe" });
  writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
  writeFileSync(join(repo, "package.json"), '{"name":"r","scripts":{"test":"bun test"}}');
  execSync("git add .", { cwd: repo, stdio: "pipe" });
  execSync("git commit -m init", { cwd: repo, stdio: "pipe" });

  const store = new ProjectStore(join(dataDir, "projects"));
  const project = store.createProject({ name: "R", goal: "g", repositoryPath: repo });
  projectId = project.id;
  store.addRequirement(projectId, { id: "REQ-01", description: "x" }, USER);

  app = new Hono();
  app.route("/api/projects", projectRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("POST /:id/submissions/:submissionId/design-review (V-036)", () => {
  async function submit(overrides: Record<string, unknown> = {}) {
    const res = await call("POST", `/api/projects/${projectId}/submissions`, {
      taskId: "t1", agentId: "a1", requirementIds: ["REQ-01"], branch: "agent/x",
      changedFiles: ["a.ts"], summary: "s",
      testResults: { passed: 2, failed: 0, total: 2 }, costUsd: 0.1,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.json.id as string;
  }

  test("returns a compliant review for a clean submission", async () => {
    const id = await submit();
    const { status, json } = await call("POST", `/api/projects/${projectId}/submissions/${id}/design-review`);
    expect(status).toBe(200);
    expect(json.compliant).toBe(true);
    expect(json.requirementsChecked).toEqual(["REQ-01"]);
    expect(json.id).toBeTruthy();
  });

  test("flags a submission with no tests as non-compliant", async () => {
    const id = await submit({ testResults: { passed: 0, failed: 0, total: 0 } });
    const { json } = await call("POST", `/api/projects/${projectId}/submissions/${id}/design-review`);
    expect(json.compliant).toBe(false);
    expect(json.findings.map((f: any) => f.kind)).toContain("missing_tests");
  });

  test("flags a credential in the diff without echoing it", async () => {
    const id = await submit({ diff: '+ const k = "ghp_abcdefghijklmnopqrstuvwxyz0123";' });
    const { json } = await call("POST", `/api/projects/${projectId}/submissions/${id}/design-review`);
    expect(json.compliant).toBe(false);
    expect(JSON.stringify(json)).not.toContain("abcdefghijklmnopqrstuvwxyz0123");
  });

  test("an unknown submission is a 404, not a crash", async () => {
    const { status } = await call("POST", `/api/projects/${projectId}/submissions/nope/design-review`);
    expect(status).toBe(404);
  });
});

describe("POST /:id/tasks/:taskId/tests (V-034)", () => {
  beforeEach(async () => {
    await call("POST", `/api/projects/${projectId}/plan`, { milestones: [] });
    await call("POST", `/api/projects/${projectId}/tasks`, { id: "t1", objective: "o", assignedAgentId: "a1" });
    await call("POST", `/api/projects/${projectId}/plan/approve`);
  });

  test("detects the project's test command and records the run", async () => {
    const { status, json } = await call("POST", `/api/projects/${projectId}/tasks/t1/tests`, { agentId: "a1" });
    expect(status).toBe(200);
    expect(json.source).toBe("package.json");
    expect(json.run.command).toContain("test");
  });

  test("a repository with no detectable test command is refused clearly", async () => {
    const bare = mkdtempSync(join(tmpdir(), "openui-bare-"));
    try {
      const { status, json } = await call("POST", `/api/projects/${projectId}/tasks/t1/tests`, {
        agentId: "a1", worktree: bare,
      });
      expect(status).toBe(400);
      expect(json.code).toBe("NO_TEST_COMMAND");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("an explicitly configured command overrides detection", async () => {
    const { json } = await call("POST", `/api/projects/${projectId}/tasks/t1/tests`, {
      agentId: "a1", command: "echo 5 pass",
    });
    expect(json.source).toBe("configured");
    expect(json.run.command).toBe("echo 5 pass");
  });
});

describe("POST /:id/plan/generate (V-017)", () => {
  test("an unknown project is a 404 rather than a hung request", async () => {
    // The happy path needs a live Grok agent and is covered by the planner suite and V-052;
    // this asserts the endpoint's failure handling, which those do not exercise.
    const { status } = await call("POST", "/api/projects/does-not-exist/plan/generate", {});
    expect(status).toBe(404);
  });
});

describe("merging re-checks requirements it is not carrying", () => {
  // Observed end to end: two requirements, two tasks. The first was merged while the second task's
  // tests still failed, so its gate refused and nothing ever looked at it again — it sat at
  // `merged` while progress read 50% with both tasks complete and the branch fully green.
  test("a requirement left short by an earlier merge is settled by a later one", async () => {
    const store = getProjectStore();
    const actor = { kind: "user", id: "user" } as const;

    store.addRequirement(projectId, { id: "REQ-02", description: "second" }, actor);
    store.addTask(projectId, { id: "tA", objective: "first" }, actor);
    store.addTask(projectId, { id: "tB", objective: "second" }, actor);

    // The first submission's suite is red because the second task is not done yet.
    const first = store.submitCode(projectId, {
      taskId: "tA", agentId: "a1", requirementIds: ["REQ-01"], branch: "agent/tA",
      changedFiles: ["a.ts"], summary: "first", testResults: { passed: 1, failed: 1, total: 2 }, costUsd: 0,
    });
    store.approveSubmission(projectId, first.id, actor, undefined, { acknowledgeFailingTests: "the failure is tB's" });
    store.recordMerge(projectId, first.id, "commit-a", actor);

    const second = store.submitCode(projectId, {
      taskId: "tB", agentId: "a1", requirementIds: ["REQ-02"], branch: "agent/tB",
      changedFiles: ["b.ts"], summary: "second", testResults: { passed: 2, failed: 0, total: 2 }, costUsd: 0,
    });
    store.approveSubmission(projectId, second.id, actor);

    const { status, json } = await call(
      "POST", `/api/projects/${projectId}/submissions/${second.id}/merge`, { mergeCommit: "commit-b" },
    );

    expect(status).toBe(200);
    // Both, not only the one this submission names.
    expect(json.completedRequirements.sort()).toEqual(["REQ-01", "REQ-02"]);
    expect(store.getRequirement(projectId, "REQ-01").status).toBe("complete");
    expect(store.getProgress(projectId).percent).toBe(100);
  });
});
