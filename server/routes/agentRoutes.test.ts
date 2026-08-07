import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
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
