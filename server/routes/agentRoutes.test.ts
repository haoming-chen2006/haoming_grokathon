import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { agentRoutes } from "./agents";
import { ProjectStore } from "../services/projectStore";
import { getAgentRegistry } from "../services/agentRegistry";
import { getControlRoomBus } from "../services/controlRoomEvents";

/**
 * HTTP coverage for the agent router.
 *
 * `bun run audit:endpoints` found twelve of these endpoints with no caller anywhere — the registry
 * beneath them is well tested, but nothing had ever exercised the routes. These assert status
 * codes and response shapes, which is exactly what a service-level test cannot see.
 */

let dataDir: string;
let app: Hono;
let projectId: string;

async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function makeAgent(extra: Record<string, unknown> = {}) {
  return getAgentRegistry().create({
    projectId, name: "Backend", role: "Backend Engineer", ...extra,
  } as any);
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-agentroutes-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  projectId = new ProjectStore(join(dataDir, "projects")).createProject({
    name: "P", goal: "g", repositoryPath: "/tmp/r", budgetUsd: 10,
  }).id;
  app = new Hono();
  app.route("/api/coding-agents", agentRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("status vocabulary and single-agent reads", () => {
  test("GET /statuses returns the runtime states with their presentation", async () => {
    const { status, json } = await req("GET", "/api/coding-agents/statuses");
    expect(status).toBe(200);
    expect(Array.isArray(json.statuses)).toBe(true);
    // The states the design contract names must all be present.
    for (const s of ["idle", "working", "waiting", "needs_review", "complete", "failed"]) {
      expect(json.statuses).toContain(s);
    }
    // Every status has presentation, or a card would render an unlabelled dot.
    for (const s of json.statuses) expect(json.presentation[s]).toBeTruthy();
  });

  test("GET /:agentId returns the agent with its status presentation", async () => {
    const agent = makeAgent();
    const { status, json } = await req("GET", `/api/coding-agents/${agent.id}`);
    expect(status).toBe(200);
    expect(json.id).toBe(agent.id);
    expect(json.statusPresentation).toBeTruthy();
  });

  test("GET /:agentId for an unknown agent is a 404, not a 500", async () => {
    const { status, json } = await req("GET", "/api/coding-agents/agent_nope");
    expect(status).toBe(404);
    expect(typeof json.error).toBe("string");
  });

  test("DELETE removes the agent and is idempotent", async () => {
    const agent = makeAgent();
    expect((await req("DELETE", `/api/coding-agents/${agent.id}`)).status).toBe(200);
    expect((await req("GET", `/api/coding-agents/${agent.id}`)).status).toBe(404);

    // Deleting again reports success rather than erroring — the resource is absent either way.
    expect((await req("DELETE", `/api/coding-agents/${agent.id}`)).status).toBe(200);
  });
});

describe("status and activity updates", () => {
  test("PATCH /status changes the status and returns its presentation", async () => {
    const agent = makeAgent();
    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/status`, {
      status: "waiting", detail: "waiting on the API contract",
    });
    expect(status).toBe(200);
    expect(json.status).toBe("waiting");
    expect(json.statusDetail).toBe("waiting on the API contract");
    expect(json.statusPresentation).toBeTruthy();
  });

  test("an unknown status is rejected rather than stored", async () => {
    const agent = makeAgent();
    const res = await req("PATCH", `/api/coding-agents/${agent.id}/status`, { status: "vibing" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await req("GET", `/api/coding-agents/${agent.id}`)).json.status).not.toBe("vibing");
  });

  test("PATCH /activity records what the agent is doing (V-024)", async () => {
    const agent = makeAgent();
    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/activity`, {
      command: "bun test", file: "greet.ts",
    });
    expect(status).toBe(200);
    expect(json.activity.command).toBe("bun test");
    expect(json.activity.file).toBe("greet.ts");
  });

  test("status and activity on an unknown agent are 404s", async () => {
    expect((await req("PATCH", "/api/coding-agents/nope/status", { status: "idle" })).status).toBe(404);
    expect((await req("PATCH", "/api/coding-agents/nope/activity", { command: "x" })).status).toBe(404);
  });
});

describe("usage accounting over HTTP (V-045, V-046)", () => {
  test("usage accumulates rather than replacing", async () => {
    const agent = makeAgent({ budgetUsd: 5 });
    await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.5, tokens: 100 });
    const second = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.25, tokens: 50 });

    expect(second.status).toBe(200);
    const after = (await req("GET", `/api/coding-agents/${agent.id}`)).json;
    expect(after.costUsd).toBeCloseTo(0.75, 5);
    expect(after.tokensUsed).toBe(150);
  });

  test("an estimated cost is reported as estimated in the budget snapshot", async () => {
    // "Unavailable exact costs are clearly labeled" — the flag travels with the snapshot the
    // caller gets back, so a UI cannot present an estimate as a billed figure.
    const agent = makeAgent({ budgetUsd: 5 });
    const res = await req("POST", `/api/coding-agents/${agent.id}/usage`, {
      costUsd: 0.1, tokens: 10, estimated: true,
    });
    expect(res.status).toBe(200);
    expect(res.json.agentBudget.estimated).toBe(true);
    expect(res.json.projectBudget.estimated).toBe(true);
  });

  test("exceeding the agent cap is a 402 and pauses the agent", async () => {
    const agent = makeAgent({ budgetUsd: 1 });
    await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.9, tokens: 10 });

    const over = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 5, tokens: 10 });
    expect(over.status).toBe(402);
    expect(over.json.scope).toBe("agent");

    const after = (await req("GET", `/api/coding-agents/${agent.id}`)).json;
    // V-046 requires execution to pause at the hard limit. It does not require the charge to be
    // discarded, and discarding it would be wrong: the tokens were already spent, so dropping the
    // cost would make the ledger understate real spend. The true figure is kept and work stops.
    expect(after.costUsd).toBeCloseTo(5.9, 5);
    expect(after.status).toBe("idle");
    expect(after.statusDetail).toContain("Paused");
    expect(after.statusDetail).toContain("budget");
  });

  test("usage for an unknown agent is a 404", async () => {
    expect((await req("POST", "/api/coding-agents/nope/usage", { costUsd: 1 })).status).toBe(404);
  });
});

describe("agent templates (V-041)", () => {
  test("a template can be saved, listed and instantiated into a project", async () => {
    expect((await req("GET", "/api/coding-agents/templates")).json).toEqual([]);

    const tpl = await req("POST", "/api/coding-agents/templates", {
      name: "Reviewer", role: "Reviewer", skills: [], tools: [], budgetUsd: 2,
    });
    expect(tpl.status).toBe(201);
    expect((await req("GET", "/api/coding-agents/templates")).json).toHaveLength(1);

    const made = await req("POST", `/api/coding-agents/templates/${tpl.json.id}/instantiate`, {
      projectId, name: "Reviewer #2",
    });
    expect(made.status).toBe(201);
    expect(made.json.projectId).toBe(projectId);
    expect(made.json.role).toBe("Reviewer");
    expect(made.json.name).toBe("Reviewer #2");
  });

  test("a template without a role is rejected", async () => {
    const res = await req("POST", "/api/coding-agents/templates", { name: "Roleless" });
    expect(res.status).toBe(400);
  });

  test("instantiating without a projectId is rejected", async () => {
    const tpl = await req("POST", "/api/coding-agents/templates", { name: "R", role: "Reviewer" });
    const res = await req("POST", `/api/coding-agents/templates/${tpl.json.id}/instantiate`, {});
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("projectId");
  });

  test("instantiating an unknown template is a 404", async () => {
    const res = await req("POST", "/api/coding-agents/templates/tpl_nope/instantiate", { projectId });
    expect(res.status).toBe(404);
  });
});

describe("session control with no live session", () => {
  // These must report a clean, specific error rather than throwing — the user can click pause on
  // an agent that has already exited.
  // Written out one endpoint per call rather than looping over the action name: a template hole
  // in the last segment makes the URL indistinguishable from any other, so `bun run audit:endpoints`
  // cannot tell which of the three was exercised.
  async function expectHandledError(path: string) {
    const { status, json } = await req("POST", path);
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
  }

  test("pause on an agent with no session is a handled error", async () => {
    const agent = makeAgent();
    await expectHandledError(`/api/coding-agents/${agent.id}/session/pause`);
  });

  test("resume on an agent with no session is a handled error", async () => {
    const agent = makeAgent();
    await expectHandledError(`/api/coding-agents/${agent.id}/session/resume`);
  });

  test("stop on an agent with no session is a handled error", async () => {
    const agent = makeAgent();
    await expectHandledError(`/api/coding-agents/${agent.id}/session/stop`);
  });
});

describe("budget events reach the control-room channel (V-046)", () => {
  test("crossing the warning threshold publishes a warning before the cap", async () => {
    // The chain that matters: HTTP -> bus -> WebSocket -> UI. This asserts the first two links;
    // the shell's handling of the event is covered in controlRoomApp.test.tsx.
    const seen: any[] = [];
    const unsubscribe = getControlRoomBus().subscribe(projectId, (p) => seen.push(p.event));
    try {
      const agent = makeAgent({ budgetUsd: 10 });
      // 80% of the agent cap, with the threshold set below it.
      const res = await req("POST", `/api/coding-agents/${agent.id}/usage`, {
        costUsd: 8, tokens: 100, warningThreshold: 0.75,
      });
      expect(res.status).toBe(200);

      const warning = seen.find((e) => e.type === "budget_warning");
      expect(warning).toBeTruthy();
      expect(warning.spent).toBeCloseTo(8, 5);
      expect(warning.limit).toBe(10);
      // It must arrive while spending is still under the cap — that is what makes it a warning.
      expect(warning.spent).toBeLessThan(warning.limit);
      expect(seen.some((e) => e.type === "budget_exceeded")).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  test("passing the cap publishes an exceeded event", async () => {
    const seen: any[] = [];
    const unsubscribe = getControlRoomBus().subscribe(projectId, (p) => seen.push(p.event));
    try {
      const agent = makeAgent({ budgetUsd: 1 });
      await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 5, tokens: 10 });

      const exceeded = seen.find((e) => e.type === "budget_exceeded");
      expect(exceeded).toBeTruthy();
      expect(exceeded.scope).toBe("agent");
      expect(exceeded.spent).toBeGreaterThan(exceeded.limit);
    } finally {
      unsubscribe();
    }
  });
});

describe("per-task spending caps are enforced (§16)", () => {
  const USER = { kind: "user" as const, id: "user" };

  function taskProject() {
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(projectId, { milestones: [] }, USER);
    store.addTask(projectId, { id: "t-cap", objective: "o", budgetUsd: 1 }, USER);
    store.approvePlan(projectId, USER);
    return store;
  }

  test("cost accumulates onto the task the agent is working on", async () => {
    // task.costUsd was initialised to zero and never updated from live work, so §16's
    // "track cost at coding task" was not actually happening.
    const store = taskProject();
    const agent = makeAgent({ budgetUsd: 100 });
    getAgentRegistry().assignTask(agent.id, "t-cap");

    await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.3, tokens: 10 });
    await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.2, tokens: 10 });

    const task = store.getProject(projectId).tasks.find((t) => t.id === "t-cap")!;
    expect(task.costUsd).toBeCloseTo(0.5, 5);
  });

  test("passing the task cap is a 402 naming the task scope", async () => {
    // The cap was settable through the API and enforced nowhere — a control that did nothing.
    const store = taskProject();
    const agent = makeAgent({ budgetUsd: 100 });
    getAgentRegistry().assignTask(agent.id, "t-cap");

    const under = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 0.5, tokens: 10 });
    expect(under.status).toBe(200);

    const over = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 2, tokens: 10 });
    expect(over.status).toBe(402);
    expect(over.json.scope).toBe("task");

    // As with the agent cap, the real spend is kept — the tokens were already consumed.
    const task = store.getProject(projectId).tasks.find((t) => t.id === "t-cap")!;
    expect(task.costUsd).toBeCloseTo(2.5, 5);
  });

  test("a task with no cap is unaffected", async () => {
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(projectId, { milestones: [] }, USER);
    store.addTask(projectId, { id: "t-free", objective: "o" }, USER);
    store.approvePlan(projectId, USER);

    const agent = makeAgent({ budgetUsd: 100 });
    getAgentRegistry().assignTask(agent.id, "t-free");

    // Well under the $10 project cap, so only the absent task cap is in play here.
    const res = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 5, tokens: 10 });
    expect(res.status).toBe(200);
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-free")!.costUsd).toBeCloseTo(5, 5);
  });

  test("an agent with no current task records nothing against any task", async () => {
    const store = taskProject();
    const agent = makeAgent({ budgetUsd: 100 });

    const res = await req("POST", `/api/coding-agents/${agent.id}/usage`, { costUsd: 5, tokens: 10 });
    expect(res.status).toBe(200);
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-cap")!.costUsd).toBe(0);
  });

  test("approaching the task cap publishes a warning on the control-room channel", async () => {
    const seen: any[] = [];
    const unsubscribe = getControlRoomBus().subscribe(projectId, (p) => seen.push(p.event));
    try {
      taskProject();
      const agent = makeAgent({ budgetUsd: 100 });
      getAgentRegistry().assignTask(agent.id, "t-cap");

      await req("POST", `/api/coding-agents/${agent.id}/usage`, {
        costUsd: 0.85, tokens: 10, warningThreshold: 0.75,
      });
      const warning = seen.find((e) => e.type === "budget_warning" && e.scope === "task");
      expect(warning).toBeTruthy();
      expect(warning.spent).toBeCloseTo(0.85, 5);
      expect(warning.limit).toBe(1);
    } finally {
      unsubscribe();
    }
  });
});

// ------------------------------------------------------------------ work areas (AGENTS-001)

describe("work areas over HTTP", () => {
  const USER = { kind: "user" as const, id: "user" };
  let root: string;

  function makeArea(extra: Record<string, unknown> = {}) {
    return req("POST", "/api/coding-agents/areas", {
      projectId, name: "Slides", briefSectionAnchor: "§3 Deck", milestoneId: "m3", rootPath: root, ...extra,
    });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "openui-route-area-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("POST /areas creates an area with a canonical root, an accent and a glyph", async () => {
    const { status, json } = await makeArea();
    expect(status).toBe(201);
    expect(json.id).toMatch(/^area_/);
    expect(json.rootPath).toBe(realpathSync(root));
    expect(json.colorToken).toBe("blue");
    expect(json.glyph).toBe("●");
  });

  test("POST /areas names the missing field rather than failing anonymously", async () => {
    const { status, json } = await makeArea({ milestoneId: "" });
    expect(status).toBe(400);
    expect(json.error).toMatch(/milestoneId is required/);
  });

  test("GET /areas resolves as the area list, not as an agent id", async () => {
    // Registration order is the whole mechanism: /areas is declared before /:agentId, so this
    // request must not be read as a lookup of an agent called "areas".
    await makeArea();
    const { status, json } = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("Slides");

    // And the agent lookup still works for a real id.
    const agent = makeAgent();
    const single = await req("GET", `/api/coding-agents/${agent.id}`);
    expect(single.json.id).toBe(agent.id);
  });

  test("GET /areas filters by project", async () => {
    await makeArea();
    const other = new ProjectStore(join(dataDir, "projects")).createProject({
      name: "Other", goal: "g", repositoryPath: "/tmp/r2",
    }).id;
    await makeArea({ projectId: other, name: "Elsewhere", milestoneId: "m9" });

    const mine = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(mine.json.map((a: any) => a.name)).toEqual(["Slides"]);
  });

  test("an area with no owner reads as unstaffed, with the text that says so", async () => {
    const { json } = await makeArea();
    expect(json.status).toBe("unstaffed");
    expect(json.statusPresentation.label).toBe("Nobody assigned");
  });

  test("the status is derived from the owning agent on every read, never stored", async () => {
    const agent = makeAgent();
    const created = await makeArea({ ownerAgentId: agent.id });
    expect(created.json.status).toBe("idle");

    getAgentRegistry().setStatus(agent.id, "working");
    const after = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(after.json[0].status).toBe("working");
    expect(after.json[0].statusPresentation.label).toBe("Working");
  });

  test("the milestone's tasks are what complete an area, and the counts are reported", async () => {
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(projectId, { milestones: [{ id: "m3", name: "Deck" }] }, USER);
    store.addTask(projectId, { id: "t1", objective: "outline", milestoneId: "m3" }, USER);
    store.addTask(projectId, { id: "t2", objective: "draft", milestoneId: "m3" }, USER);
    store.addTask(projectId, { id: "t3", objective: "unrelated" }, USER);
    store.approvePlan(projectId, USER);

    const agent = makeAgent();
    await makeArea({ ownerAgentId: agent.id });
    getAgentRegistry().setStatus(agent.id, "working");

    const partway = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    // t3 carries no milestone id, so it is not this area's work.
    expect(partway.json[0].tasksTotal).toBe(2);
    expect(partway.json[0].tasksComplete).toBe(0);
    expect(partway.json[0].status).toBe("working");

    store.updateTask(projectId, "t1", { status: "complete" }, USER);
    store.updateTask(projectId, "t2", { status: "complete" }, USER);

    const done = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(done.json[0].tasksComplete).toBe(2);
    expect(done.json[0].status).toBe("complete");
  });

  test("an owner id that resolves to nobody is reported, not silently unstaffed", async () => {
    const agent = makeAgent();
    await makeArea({ ownerAgentId: agent.id });
    getAgentRegistry().remove(agent.id);

    const { json } = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(json[0].status).toBe("unstaffed");
    expect(json[0].unresolvedOwnerAgentId).toBe(agent.id);
  });
});

// --------------------------------------------------- tasks inside an area, and brief coverage

describe("a task created inside an area carries that area's milestone (AGENTS-002)", () => {
  const USER = { kind: "user" as const, id: "user" };
  let root: string;

  function planned(milestoneIds: string[]) {
    const store = new ProjectStore(join(dataDir, "projects"));
    store.createPlan(projectId, { milestones: milestoneIds.map((id) => ({ id, name: id })) }, USER);
    return store;
  }

  async function makeArea(extra: Record<string, unknown> = {}) {
    const { json } = await req("POST", "/api/coding-agents/areas", {
      projectId, name: "Slides", briefSectionAnchor: "§3 Deck", milestoneId: "m3", rootPath: root, ...extra,
    });
    return json;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "openui-route-area-task-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("the task carries the milestone id and the milestone's taskIds is no longer empty", async () => {
    // Milestone.taskIds was decorative in the shipping product: plan generation created every task
    // without a milestoneId, so the relation existed and had never run.
    const store = planned(["m3"]);
    const areaJson = await makeArea();

    const { status, json } = await req("POST", `/api/coding-agents/areas/${areaJson.id}/tasks`, {
      objective: "draft the deck outline",
    });
    expect(status).toBe(201);
    expect(json.milestoneId).toBe("m3");

    const plan = store.getProject(projectId).plan!;
    expect(plan.milestones.find((m) => m.id === "m3")!.taskIds).toEqual([json.id]);
  });

  test("the area decides the milestone; a caller cannot supply a different one", async () => {
    const store = planned(["m3", "m4"]);
    const areaJson = await makeArea();

    const { json } = await req("POST", `/api/coding-agents/areas/${areaJson.id}/tasks`, {
      objective: "sneak into another milestone", milestoneId: "m4",
    });
    expect(json.milestoneId).toBe("m3");
    expect(store.getProject(projectId).plan!.milestones.find((m) => m.id === "m4")!.taskIds).toEqual([]);
  });

  test("a milestone that is not in the plan is refused, naming what failed to resolve", async () => {
    // addTask pushes with `milestones.find(...)?.taskIds.push(...)` — optional all the way down, so
    // without this refusal the task is stored and the relation silently does not run.
    const store = planned(["m1"]);
    const areaJson = await makeArea();

    const { status, json } = await req("POST", `/api/coding-agents/areas/${areaJson.id}/tasks`, {
      objective: "orphan",
    });
    expect(status).toBe(400);
    expect(json.code).toBe("MILESTONE_NOT_IN_PLAN");
    expect(json.milestoneId).toBe("m3");
    expect(json.error).toContain("m1");
    expect(store.getProject(projectId).tasks).toHaveLength(0);
  });

  test("a project with no plan at all is refused with the same code, not a silent orphan", async () => {
    const areaJson = await makeArea();
    const { status, json } = await req("POST", `/api/coding-agents/areas/${areaJson.id}/tasks`, {
      objective: "orphan",
    });
    expect(status).toBe(400);
    expect(json.code).toBe("MILESTONE_NOT_IN_PLAN");
    expect(json.error).toContain("no plan yet");
  });

  test("an unknown area is a 404 and creates nothing", async () => {
    const store = planned(["m3"]);
    const { status, json } = await req("POST", "/api/coding-agents/areas/area_nope/tasks", { objective: "x" });
    expect(status).toBe(404);
    expect(json.error).toContain("area_nope");
    expect(store.getProject(projectId).tasks).toHaveLength(0);
  });

  test("an area's tasks count towards its own progress and no other area's", async () => {
    planned(["m3", "m4"]);
    const slides = await makeArea();
    const video = await makeArea({ name: "Video assets", milestoneId: "m4", briefSectionAnchor: "§4 Experience" });
    await req("POST", `/api/coding-agents/areas/${slides.id}/tasks`, { objective: "one" });
    await req("POST", `/api/coding-agents/areas/${slides.id}/tasks`, { objective: "two" });
    await req("POST", `/api/coding-agents/areas/${video.id}/tasks`, { objective: "three" });

    const { json } = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    const bySlug = Object.fromEntries(json.map((a: any) => [a.name, a]));
    expect(bySlug["Slides"].tasksTotal).toBe(2);
    expect(bySlug["Video assets"].tasksTotal).toBe(1);
  });
});

describe("brief coverage over HTTP (AGENTS-002)", () => {
  const USER = { kind: "user" as const, id: "user" };
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "openui-route-coverage-"));
    new ProjectStore(join(dataDir, "projects")).updateDocument(
      projectId,
      ["# Sales presentation", "## §1 Audience", "## §2 Channel", "## §3 Deck", "## §4 Experience"].join("\n"),
      USER,
      {},
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("sections of the brief with no area are reported as uncovered", async () => {
    await req("POST", "/api/coding-agents/areas", {
      projectId, name: "Research", briefSectionAnchor: "§1 Audience", milestoneId: "m1", rootPath: root,
    });

    const { status, json } = await req("GET", `/api/coding-agents/areas/coverage?projectId=${projectId}`);
    expect(status).toBe(200);
    expect(json.sections).toHaveLength(4);
    expect(json.coveredCount).toBe(1);
    expect(json.uncovered).toEqual(["§2 Channel", "§3 Deck", "§4 Experience"]);
    expect(json.sections[0].areaName).toBe("Research");
  });

  test("coverage resolves as its own route, not as an area id", async () => {
    const { status, json } = await req("GET", `/api/coding-agents/areas/coverage?projectId=${projectId}`);
    expect(status).toBe(200);
    expect(Array.isArray(json.sections)).toBe(true);
  });

  test("without a projectId the request is refused rather than answered for nobody", async () => {
    const { status, json } = await req("GET", "/api/coding-agents/areas/coverage");
    expect(status).toBe(400);
    expect(json.error).toContain("projectId");
  });
});

// ------------------------------------------ an agent is hired into exactly one area (AGENTS-003)

describe("hiring an agent into an area", () => {
  let root: string;

  async function makeArea(extra: Record<string, unknown> = {}) {
    const { json } = await req("POST", "/api/coding-agents/areas", {
      projectId, name: "Slides", briefSectionAnchor: "§3 Deck", milestoneId: "m3", rootPath: root, ...extra,
    });
    return json;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "openui-route-area-assign-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("the area records which agent works in it", async () => {
    const agent = makeAgent();
    const area = await makeArea();

    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: area.id });
    expect(status).toBe(200);
    expect(json.area.id).toBe(area.id);
    expect(json.area.ownerAgentId).toBe(agent.id);
    expect(json.previousAreaId).toBeUndefined();

    // And it is the stored record, not just the reply.
    const listed = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(listed.json[0].ownerAgentId).toBe(agent.id);
  });

  test("hiring into a second area is a move, and says which area was left", async () => {
    // An agent works in exactly one area. Two would make "the area this agent writes in" a
    // question with two answers, and the write guard needs exactly one.
    const agent = makeAgent();
    const slides = await makeArea();
    const video = await makeArea({ name: "Video assets", milestoneId: "m4", briefSectionAnchor: "§4 Experience" });

    await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: slides.id });
    const { json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: video.id });

    expect(json.area.id).toBe(video.id);
    expect(json.previousAreaId).toBe(slides.id);

    const listed = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    const owners = Object.fromEntries(listed.json.map((a: any) => [a.name, a.ownerAgentId]));
    expect(owners["Slides"]).toBeUndefined();
    expect(owners["Video assets"]).toBe(agent.id);
  });

  test("an occupied area is refused, and the refusal names the remedy", async () => {
    // A refusal that does not say what to do instead produces a retry.
    const first = makeAgent();
    const second = makeAgent({ name: "Second" });
    const area = await makeArea();
    await req("PATCH", `/api/coding-agents/${first.id}/area`, { areaId: area.id });

    const { status, json } = await req("PATCH", `/api/coding-agents/${second.id}/area`, { areaId: area.id });
    expect(status).toBe(409);
    expect(json.code).toBe("AREA_OCCUPIED");
    expect(json.error).toContain(first.id);
    expect(json.error).toContain(`PATCH /api/coding-agents/${first.id}/area`);
    expect(json.error).toContain('"areaId": null');

    // The remedy works, and the second agent can then be hired.
    const freed = await req("PATCH", `/api/coding-agents/${first.id}/area`, { areaId: null });
    expect(freed.status).toBe(200);
    expect(freed.json.area).toBeNull();
    expect(freed.json.previousAreaId).toBe(area.id);

    const retry = await req("PATCH", `/api/coding-agents/${second.id}/area`, { areaId: area.id });
    expect(retry.status).toBe(200);
    expect(retry.json.area.ownerAgentId).toBe(second.id);
  });

  test("re-hiring an agent into the area it already holds is not a move", async () => {
    const agent = makeAgent();
    const area = await makeArea();
    await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: area.id });

    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: area.id });
    expect(status).toBe(200);
    expect(json.area.ownerAgentId).toBe(agent.id);
    expect(json.previousAreaId).toBeUndefined();
  });

  test("an agent may not be hired into another project's area", async () => {
    // Otherwise the agent's cwd would be a directory outside its own project.
    const agent = makeAgent();
    const otherProject = new ProjectStore(join(dataDir, "projects")).createProject({
      name: "Other", goal: "g", repositoryPath: "/tmp/r2",
    }).id;
    const foreign = await makeArea({ projectId: otherProject, name: "Elsewhere", milestoneId: "m9" });

    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: foreign.id });
    expect(status).toBe(409);
    expect(json.code).toBe("AREA_WRONG_PROJECT");
    expect(json.error).toContain(otherProject);
    expect(json.error).toContain(projectId);
  });

  test("an unknown agent and an unknown area are both 404, and change nothing", async () => {
    const agent = makeAgent();
    const area = await makeArea();

    const badAgent = await req("PATCH", "/api/coding-agents/agent_nope/area", { areaId: area.id });
    expect(badAgent.status).toBe(404);

    const badArea = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: "area_nope" });
    expect(badArea.status).toBe(404);
    expect(badArea.json.error).toContain("area_nope");

    const listed = await req("GET", `/api/coding-agents/areas?projectId=${projectId}`);
    expect(listed.json[0].ownerAgentId).toBeUndefined();
  });

  test("a missing areaId is refused; null is how an agent is removed from its area", async () => {
    const agent = makeAgent();
    const { status, json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, {});
    expect(status).toBe(400);
    expect(json.error).toContain("null");
  });

  test("an agent with no live session is not told the change applies later", async () => {
    // appliesAtNextStart is false here because there is nothing already running to be wrong about.
    const agent = makeAgent();
    const area = await makeArea();
    const { json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: area.id });
    expect(json.appliesAtNextStart).toBe(false);
  });

  test("hiring an agent into an area moves the area's derived status off unstaffed", async () => {
    const agent = makeAgent();
    const area = await makeArea();
    expect(area.status).toBe("unstaffed");

    getAgentRegistry().setStatus(agent.id, "working");
    const { json } = await req("PATCH", `/api/coding-agents/${agent.id}/area`, { areaId: area.id });
    expect(json.area.status).toBe("working");
    expect(json.area.statusPresentation.label).toBe("Working");
  });
});
