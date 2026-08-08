import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { parseRequirements } from "../../shared/designDocument";

/**
 * The loop as a browser can drive it, using nothing a browser does not have.
 *
 * This file exists to catch a class of bug the rest of the suite is structurally blind to: the
 * product works only because the test set it up first. A project created through the Control Room
 * arrived with no agents, so the Planner assigned every task to nobody and the first click on
 * Launch was refused with NO_AGENT, with nothing in the UI able to create an agent and fix it. The
 * loop dead-ended on the only path a real user takes. Around 750 unit tests and a 20-step
 * acceptance script were green throughout, because every one of them created the team by hand
 * before exercising the thing under test — they proved the endpoints work when handed a fully
 * formed project, which was never the question.
 *
 * So the rule here, and the only thing that makes this file worth having: it may call exactly the
 * endpoints client/src/control-room/useControlRoom.ts calls, in the order it calls them, with the
 * fields NewProjectPanel.tsx collects. It may not touch ProjectStore or AgentRegistry to arrange
 * state, because the browser cannot, and any state a test arranges is state the product is no
 * longer required to produce. Everything below goes through `browser`, which is the whole client
 * contract and nothing else.
 *
 * The one deliberate exception is the control at the bottom, which creates a project with
 * `seedTeam: false` — not a browser call, but the pre-fix server behaviour — so this file is shown
 * to fail when the bug is present rather than passing for reasons of its own.
 */

// The Planner and the agent session are the two live-model boundaries in this path, and neither may
// run here: one is a Grok turn over the network, the other spawns a process. Both are replaced
// through the seams the services export, and afterEach restores them.
//
// They were replaced with `mock.module` first, and that is worth recording. It passed for this file
// alone, and for every pair tried. In the full suite it silently stopped working — `./projects` is
// evaluated once, by whichever test file imports it first, and a mock installed after that never
// reaches it. Launch then opened real sessions: six live `grok --no-auto-update agent` children of
// the test process, and a run that spun at 100% CPU and never finished. An explicit seam cannot
// depend on evaluation order, which is the whole reason it exists.

const PLAN = {
  milestones: [{ id: "m1", name: "Auth", role: "Planner", dependsOn: [] }],
  tasks: [
    { id: "t1", objective: "Issue a token on login", role: "Backend Engineer", requirementId: "AUTH-01", dependsOn: [], expectedFiles: [], requiredTests: [] },
    { id: "t2", objective: "Expire tokens after an hour", role: "Test Engineer", requirementId: "AUTH-02", dependsOn: [], expectedFiles: [], requiredTests: [] },
  ],
  usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, reasoningTokens: 0 },
  raw: "{}",
};

let plannerOverride: (() => Promise<typeof PLAN>) | null = null;

/**
 * Stands in for the ACP session manager at launch.
 *
 * Stopping the test at the gate and asserting "not NO_AGENT" would pass even if launch then fell
 * over for some other reason, which is a decorative assertion — and on a machine that has `grok`
 * installed it would start a real agent. Recording what launch opened and what it said lets the
 * test assert the positive: a session was opened for the agent that owns the task, and the task's
 * objective reached it.
 */
class RecordingSessionManager {
  readonly opened: string[] = [];
  readonly sent: Array<{ agentId: string; text: string }> = [];

  async open(agentId: string) {
    this.opened.push(agentId);
    return { agentId, projectId: "", acpSessionId: `acp-${agentId}`, state: "ready", transcript: [] };
  }

  async send(agentId: string, text: string) {
    this.sent.push({ agentId, text });
  }
}

let acp: RecordingSessionManager | null = null;

const { projectRoutes } = await import("./projects");
const { agentRoutes } = await import("./agents");
const { setAcpSessionManager } = await import("../services/acpSessionManager");
const { setPlannerImplementation } = await import("../services/planner");

/** What the user pastes into the design-document box, requirement lines and all. */
const DOCUMENT = [
  "# Passwordless auth",
  "",
  "## Requirements",
  "",
  "- AUTH-01: Login returns a token",
  "- AUTH-02: Tokens expire after an hour",
  "",
].join("\n");

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
  try { json = text ? JSON.parse(text) : null; } catch { /* status is the assertion */ }
  return { status: res.status, json };
}

/**
 * Every request useControlRoom.ts makes on this path, and no other way to reach the server.
 *
 * Written as one object so that adding a shortcut to this file means visibly adding a capability
 * the browser does not have.
 */
const browser = {
  /** The projects list the shell loads on mount, and selects the first entry of. */
  listProjects: () => call("GET", "/api/projects"),

  /** createProject: the project, then one POST per requirement the panel parsed. */
  async createProject(input: {
    name: string;
    goal: string;
    repositoryPath: string;
    baseBranch?: string;
    budgetUsd?: number;
    documentContent?: string;
    requirements?: Array<{ id: string; description: string }>;
  }) {
    const { requirements, ...projectInput } = input;
    const created = await call("POST", "/api/projects", projectInput);
    expect(created.status).toBe(201);
    for (const requirement of requirements ?? []) {
      await call("POST", `/api/projects/${created.json.id}/requirements`, requirement);
    }
    return created.json;
  },

  /** loadProject: the five reads the shell fans out on selecting a project. */
  async loadProject(id: string) {
    const [full, document, agents, progress, costs] = await Promise.all([
      call("GET", `/api/projects/${id}`),
      call("GET", `/api/projects/${id}/document`),
      call("GET", `/api/coding-agents?projectId=${id}`),
      call("GET", `/api/projects/${id}/progress`),
      call("GET", `/api/coding-agents/costs/${id}`),
    ]);
    return { full: full.json, document: document.json, agents: agents.json, progress: progress.json, costs: costs.json };
  },

  generatePlan: (id: string) => call("POST", `/api/projects/${id}/plan/generate`, {}),
  approvePlan: (id: string) => call("POST", `/api/projects/${id}/plan/approve`, {}),
  launchTask: (id: string, taskId: string) => call("POST", `/api/projects/${id}/tasks/${taskId}/launch`, {}),
};

/** Submitting NewProjectPanel: its fields, and the requirements its own parser found (V-010). */
function submitNewProjectForm(extra: Record<string, unknown> = {}) {
  const found = parseRequirements(DOCUMENT);
  return browser.createProject({
    name: "Authentication",
    goal: "Ship passwordless auth",
    repositoryPath: repo,
    baseBranch: "main",
    budgetUsd: 10,
    documentContent: DOCUMENT,
    requirements: found.length ? found : undefined,
    ...extra,
  });
}

beforeEach(() => {
  plannerOverride = async () => PLAN;
  setPlannerImplementation(() => plannerOverride!());
  acp = new RecordingSessionManager();
  setAcpSessionManager(acp as never);

  dataDir = mkdtempSync(join(tmpdir(), "openui-browser-"));
  process.env.OPENUI_DATA_DIR = dataDir;

  // A real repository, because launch creates the agent's worktree in it — that is product
  // behaviour on this path, so it runs for real rather than being stubbed out.
  repo = mkdtempSync(join(tmpdir(), "openui-browser-repo-"));
  execSync("git init -b main", { cwd: repo, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: repo, stdio: "pipe" });
  execSync("git config user.name T", { cwd: repo, stdio: "pipe" });
  writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
  execSync("git add .", { cwd: repo, stdio: "pipe" });
  execSync("git commit -m init", { cwd: repo, stdio: "pipe" });

  app = new Hono();
  app.route("/api/projects", projectRoutes);
  app.route("/api/coding-agents", agentRoutes);
});

afterEach(() => {
  // Leaving either set would divert every other file's planner and session calls to these fixtures
  // — and leaving the session manager set would hand them a recorder that spawns nothing.
  plannerOverride = null;
  setPlannerImplementation(null);
  acp = null;
  setAcpSessionManager(null);
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("the loop a browser can drive on its own", () => {
  test("the form's fields alone produce a project the team is already on", async () => {
    const project = await submitNewProjectForm();

    // Read back through the endpoint the canvas loads agents from, not the create response: a team
    // that existed only in the reply would leave plan generation and launch resolving nobody, which
    // is the failure this file is about.
    const { agents, full } = await browser.loadProject(project.id);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a: any) => a.projectId === project.id)).toBe(true);
    expect(full.name).toBe("Authentication");

    // And it is selectable from the list the shell loads on mount, which is how a user gets here.
    const { json: projects } = await browser.listProjects();
    expect(projects.map((p: any) => p.id)).toContain(project.id);
  });

  test("the requirements parsed out of the pasted document land on the project", async () => {
    const project = await submitNewProjectForm();

    const { full, document, progress } = await browser.loadProject(project.id);
    expect(full.requirements.map((r: any) => r.id)).toEqual(["AUTH-01", "AUTH-02"]);
    // The pasted text is version 1 of the document the editor opens on, not just a create-time
    // argument that was parsed and dropped.
    expect(document.version).toBe(1);
    expect(document.content).toContain("AUTH-01: Login returns a token");
    // Progress is derived from requirement statuses, so importing them is what gives it a total.
    expect(progress.total).toBe(2);
  });

  test("the generated plan's tasks are owned by agents this project actually has", async () => {
    const project = await submitNewProjectForm();

    const { status, json } = await browser.generatePlan(project.id);
    expect(status).toBe(201);
    // The product's own signal that the plan cannot be launched. It must not fire on a project the
    // server just created, or the user is being told to fix something they cannot reach.
    expect(json.teamMissing).toBeUndefined();

    const { full, agents } = await browser.loadProject(project.id);
    const teamIds = agents.map((a: any) => a.id);
    expect(full.tasks).toHaveLength(2);
    for (const task of full.tasks) {
      expect(teamIds, `${task.id} was stored with an owner this project does not have`)
        .toContain(task.assignedAgentId);
    }
  });

  test("Launch is not refused with NO_AGENT, and briefs the agent that owns the task", async () => {
    const project = await submitNewProjectForm();
    await browser.generatePlan(project.id);
    await browser.approvePlan(project.id);

    const { full } = await browser.loadProject(project.id);
    const task = full.tasks.find((t: any) => t.id === "t1");

    const { status, json } = await browser.launchTask(project.id, task.id);
    expect(json?.code, "the reported bug: the first Launch of the browser loop").not.toBe("NO_AGENT");
    expect(status).toBe(201);
    expect(json.agentId).toBe(task.assignedAgentId);

    // Past the gate is not the same as launched: the session has to open for that agent and the
    // task has to reach it, or Launch is a button that changes a status and nothing else.
    expect(acp!.opened).toEqual([task.assignedAgentId]);
    expect(acp!.sent[0]?.agentId).toBe(task.assignedAgentId);
    expect(acp!.sent[0]?.text).toContain("Issue a token on login");

    const after = await browser.loadProject(project.id);
    expect(after.full.tasks.find((t: any) => t.id === "t1").status).toBe("working");
  });
});

describe("the control: with no team the same script breaks exactly as reported", () => {
  test("plan generation says the team is missing and Launch answers NO_AGENT", async () => {
    // `seedTeam: false` is not something the browser sends. It is here to reproduce the server as
    // it behaved before seeding existed, so the tests above are known to fail when the bug returns
    // instead of passing for some incidental reason.
    const project = await submitNewProjectForm({ seedTeam: false });

    const { agents } = await browser.loadProject(project.id);
    expect(agents).toEqual([]);

    const generated = await browser.generatePlan(project.id);
    expect(generated.json.teamMissing).toBe(true);

    await browser.approvePlan(project.id);
    const { status, json } = await browser.launchTask(project.id, "t1");
    expect(status).toBe(400);
    expect(json.code).toBe("NO_AGENT");
    expect(acp!.opened).toEqual([]);
  });
});

/**
 * The wordings the Planner actually returned when a plan came back entirely unassigned.
 *
 * The roles above are the five it is asked for, which is why they always resolved. A model answers
 * "Backend Developer" or "QA" often enough, and an exact-match lookup then owned nothing.
 */
const ODD_PLAN = {
  milestones: [{ id: "m1", name: "Auth", role: "Planner", dependsOn: [] }],
  tasks: [
    { id: "t1", objective: "Issue a token", role: "Backend Developer", requirementId: "AUTH-01", dependsOn: [], expectedFiles: [], requiredTests: [] },
    { id: "t2", objective: "Build the form", role: "UI Engineer", requirementId: "AUTH-02", dependsOn: [], expectedFiles: [], requiredTests: [] },
    { id: "t3", objective: "Cover it", role: "QA", requirementId: "AUTH-02", dependsOn: [], expectedFiles: [], requiredTests: [] },
    { id: "t4", objective: "Store the tokens", role: "Database Administrator", requirementId: "AUTH-01", dependsOn: [], expectedFiles: [], requiredTests: [] },
  ],
  usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0, cachedReadTokens: 0, reasoningTokens: 0 },
  raw: "{}",
};

describe("a Planner that names roles the team does not have", () => {
  test("every task still gets an owner, so the plan can be launched", async () => {
    plannerOverride = async () => ODD_PLAN;
    const project = await submitNewProjectForm();

    await browser.generatePlan(project.id);
    const { full, agents } = await browser.loadProject(project.id);
    const teamIds = agents.map((a: any) => a.id);

    expect(full.tasks).toHaveLength(4);
    for (const task of full.tasks) {
      expect(teamIds, `${task.id} was stored unassigned — the reported bug`).toContain(task.assignedAgentId);
    }
  });

  test("each wording reaches the role it meant", async () => {
    plannerOverride = async () => ODD_PLAN;
    const project = await submitNewProjectForm();

    await browser.generatePlan(project.id);
    const { full, agents } = await browser.loadProject(project.id);
    const roleOf = (taskId: string) =>
      agents.find((a: any) => a.id === full.tasks.find((t: any) => t.id === taskId).assignedAgentId)?.role;

    expect(roleOf("t1")).toBe("Backend Engineer");
    expect(roleOf("t2")).toBe("Frontend Engineer");
    // "QA" must not be swallowed by the word "Engineer" and land on the backend.
    expect(roleOf("t3")).toBe("Test Engineer");
  });

  test("a role that matched nothing is reported rather than silently guessed", async () => {
    plannerOverride = async () => ODD_PLAN;
    const project = await submitNewProjectForm();

    const { json } = await browser.generatePlan(project.id);
    // Only the genuine miss: reporting the three that resolved would make the warning noise.
    expect(json.unmatchedRoles).toEqual(["Database Administrator"]);
    expect(json.teamMissing).toBeUndefined();
  });

  test("Launch is accepted for a task whose owner was resolved loosely", async () => {
    // Assignment is only worth anything if it survives the gate the original bug died at.
    plannerOverride = async () => ODD_PLAN;
    const project = await submitNewProjectForm();

    await browser.generatePlan(project.id);
    await browser.approvePlan(project.id);
    const { status, json } = await browser.launchTask(project.id, "t3");

    expect(json?.code).not.toBe("NO_AGENT");
    expect(status).toBe(201);
    expect(acp!.opened).toHaveLength(1);
  });
});

describe("the contract this file is written against", () => {
  test("the hook still calls the endpoints driven above", async () => {
    // If the client stops calling one of these, the sequence here becomes a fossil that guards a
    // path nobody takes — which is the exact way the original bug survived a green suite.
    const hook = readFileSync(
      join(import.meta.dir, "../../client/src/control-room/useControlRoom.ts"),
      "utf8",
    );
    for (const path of [
      '"/api/projects"',
      "/requirements`",
      "/plan/generate`",
      "/plan/approve`",
      "/launch`",
      "/api/coding-agents?projectId=",
    ]) {
      expect(hook, `useControlRoom no longer calls ${path}`).toContain(path);
    }

    // And the browser has no way to create an agent, which is why the server must.
    expect(hook).not.toMatch(/["'`]\/api\/coding-agents["'`]\s*,\s*\{\s*method:\s*"POST"/);
  });
});
