import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { agentRoutes } from "./agents";
import { DEFAULT_TEAM } from "../services/agentTeam";

/**
 * A project created over HTTP — which is what the browser does — used to arrive with no agents, so
 * the Planner had no role to assign and the first Launch was refused with NO_AGENT. These tests
 * cover the seeding, and the opt-out that keeps callers who create their own agents unaffected.
 */

let dataDir: string;
let repo: string;
let app: Hono;

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

async function createProject(body: Record<string, unknown> = {}) {
  const res = await call("POST", "/api/projects", { name: "From the form", repositoryPath: repo, ...body });
  expect(res.status).toBe(201);
  return res.json;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-team-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  repo = mkdtempSync(join(tmpdir(), "openui-team-repo-"));

  app = new Hono();
  app.route("/api/projects", projectRoutes);
  app.route("/api/coding-agents", agentRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("POST /api/projects seeds the agent team", () => {
  test("a project created with no agent fields comes back with all five roles", async () => {
    const project = await createProject();
    expect(project.agents).toHaveLength(5);
    expect(project.agents.map((a: any) => a.role)).toEqual(DEFAULT_TEAM.map((m) => m.role));
    expect(project.agents.every((a: any) => a.projectId === project.id)).toBe(true);
  });

  test("the team is in the registry, which is where launching reads it from", async () => {
    // The response body is a convenience; the plan and launch paths resolve agents through the
    // registry, so a team that existed only in the reply would change nothing.
    const project = await createProject();
    const { status, json } = await call("GET", `/api/coding-agents?projectId=${project.id}`);
    expect(status).toBe(200);
    expect(json.map((a: any) => a.id).sort()).toEqual(project.agents.map((a: any) => a.id).sort());
  });

  test("one of them is a Planner, which is the agent plan generation charges its turn to", async () => {
    const project = await createProject();
    expect(project.agents.filter((a: any) => a.role === "Planner")).toHaveLength(1);
  });

  test("the project budget is split evenly across the team", async () => {
    const project = await createProject({ budgetUsd: 25 });
    expect(project.agents.map((a: any) => a.budgetUsd)).toEqual([5, 5, 5, 5, 5]);
  });

  test("a project with no budget produces agents with no cap", async () => {
    const project = await createProject();
    expect(project.agents.every((a: any) => a.budgetUsd === undefined)).toBe(true);
  });

  test("the created project still carries the fields the UI selects on", async () => {
    const project = await createProject({ goal: "g", budgetUsd: 12, documentContent: "# Design" });
    expect(typeof project.id).toBe("string");
    expect(project.name).toBe("From the form");
    expect(project.goal).toBe("g");
    expect(project.document.currentVersion).toBe(1);
  });
});

describe("POST /api/projects with seedTeam: false", () => {
  test("creates no agents, for callers that bring their own", async () => {
    const project = await createProject({ seedTeam: false });
    expect(project.agents).toEqual([]);

    const { json } = await call("GET", `/api/coding-agents?projectId=${project.id}`);
    expect(json).toEqual([]);
  });

  test("the project itself is created exactly as before", async () => {
    const project = await createProject({ seedTeam: false, goal: "g", budgetUsd: 4 });
    const { status, json } = await call("GET", `/api/projects/${project.id}`);
    expect(status).toBe(200);
    expect(json.goal).toBe("g");
    expect(json.budgetUsd).toBe(4);
  });
});

describe("the failure this seeding removes", () => {
  test("validation still rejects a project without a repository, and seeds nothing", async () => {
    const res = await call("POST", "/api/projects", { name: "No repo" });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("repositoryPath is required");

    const { json } = await call("GET", "/api/coding-agents");
    expect(json).toEqual([]);
  });

  test("an unassigned task is still refused, which is what every task used to be", async () => {
    // The seeded team only helps because assignment resolves to it; a task that reaches Launch with
    // no agent must still fail loudly rather than run somewhere arbitrary.
    const project = await createProject();
    await call("POST", `/api/projects/${project.id}/plan`, { milestones: [] });
    await call("POST", `/api/projects/${project.id}/tasks`, { id: "t1", objective: "Implement it" });
    await call("POST", `/api/projects/${project.id}/plan/approve`);

    const { status, json } = await call("POST", `/api/projects/${project.id}/tasks/t1/launch`);
    expect(status).toBe(400);
    expect(json.code).toBe("NO_AGENT");
  });
});
