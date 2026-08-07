import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { libraryRoutes } from "./library";

/**
 * HTTP coverage for the library router (V-041, V-043, V-044).
 *
 * `promptLibrary.ts` was well tested and every one of these nine endpoints had no caller at all —
 * no test, no client code, no script (found by `bun run audit:endpoints`). A service can be
 * correct while the route in front of it reads the wrong field, returns the wrong status, or
 * swallows an error, and nothing would have noticed.
 */

let dataDir: string;
let app: Hono;

async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-library-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  app = new Hono();
  app.route("/api/library", libraryRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("skills over HTTP", () => {
  test("a skill can be created and listed", async () => {
    expect((await req("GET", "/api/library/skills")).json).toEqual([]);

    const created = await req("POST", "/api/library/skills", {
      name: "Test-Driven Bug Fix",
      instructions: "Write the failing test first, then fix it.",
      description: "TDD procedure",
    });
    expect(created.status).toBe(201);
    expect(created.json.id).toBeTruthy();
    expect(created.json.name).toBe("Test-Driven Bug Fix");

    const listed = await req("GET", "/api/library/skills");
    expect(listed.json).toHaveLength(1);
    expect(listed.json[0].id).toBe(created.json.id);
  });

  test("a skill without instructions is rejected, not stored empty", async () => {
    const res = await req("POST", "/api/library/skills", { name: "Nameless" });
    expect(res.status).toBe(400);
    expect(typeof res.json.error).toBe("string");
    expect((await req("GET", "/api/library/skills")).json).toHaveLength(0);
  });

  test("compose returns the exact instruction text an agent would receive", async () => {
    const skill = await req("POST", "/api/library/skills", {
      name: "Careful Review", instructions: "Read the diff twice.",
    });

    const composed = await req("POST", "/api/library/skills/compose", {
      persona: "You are a meticulous reviewer.",
      skillIds: [skill.json.id],
      prompt: "Review PR 12.",
    });
    expect(composed.status).toBe(200);
    // Order matters: persona frames the role, skills add procedure, the prompt states the job.
    expect(composed.json.instructions).toContain("# Persona");
    expect(composed.json.instructions).toContain("You are a meticulous reviewer.");
    expect(composed.json.instructions).toContain("# Skill: Careful Review");
    expect(composed.json.instructions).toContain("Read the diff twice.");
    expect(composed.json.instructions).toContain("# Task");
    expect(composed.json.instructions.indexOf("# Persona"))
      .toBeLessThan(composed.json.instructions.indexOf("# Skill: Careful Review"));
    expect(composed.json.instructions.indexOf("# Skill: Careful Review"))
      .toBeLessThan(composed.json.instructions.indexOf("# Task"));
  });

  test("composing with an unknown skill id fails rather than silently dropping it", async () => {
    const res = await req("POST", "/api/library/skills/compose", { skillIds: ["skill_nope"] });
    expect(res.status).toBe(404);
    expect(res.json.code).toBe("NOT_FOUND");
  });
});

describe("prompt templates over HTTP", () => {
  test("a template can be created, listed and rendered", async () => {
    const created = await req("POST", "/api/library/prompts", {
      name: "Fix Bug",
      body: "Fix {ticket} in {area}.",
      variables: [{ name: "area", required: false, default: "the server" }],
    });
    expect(created.status).toBe(201);
    // An undeclared placeholder is recorded as required so it cannot render as a hole.
    expect(created.json.variables.find((v: any) => v.name === "ticket").required).toBe(true);

    expect((await req("GET", "/api/library/prompts")).json).toHaveLength(1);

    const rendered = await req("POST", `/api/library/prompts/${created.json.id}/render`, {
      values: { ticket: "BUG-9" },
    });
    expect(rendered.status).toBe(200);
    expect(rendered.json.rendered).toBe("Fix BUG-9 in the server.");
  });

  test("a missing required variable is a 400 naming it, not a prompt with a hole", async () => {
    const created = await req("POST", "/api/library/prompts", { name: "P", body: "Do {thing}." });
    const rendered = await req("POST", `/api/library/prompts/${created.json.id}/render`, { values: {} });

    expect(rendered.status).toBe(400);
    expect(rendered.json.code).toBe("UNRESOLVED_VARIABLE");
    expect(rendered.json.missing).toEqual(["thing"]);
  });

  test("rendering an unknown template is a 404", async () => {
    const res = await req("POST", "/api/library/prompts/prompt_nope/render", { values: {} });
    expect(res.status).toBe(404);
  });
});

describe("workflows over HTTP", () => {
  async function makeWorkflow() {
    return req("POST", "/api/library/workflows", {
      name: "Standard Feature",
      stages: [
        { id: "plan", name: "Plan", role: "Planner" },
        { id: "build", name: "Build", role: "Backend Engineer", dependsOn: ["plan"] },
        { id: "review", name: "Review", role: "Reviewer", dependsOn: ["build"], reviewGate: true },
      ],
    });
  }

  test("a workflow can be created and listed", async () => {
    const created = await makeWorkflow();
    expect(created.status).toBe(201);
    expect(created.json.stages).toHaveLength(3);
    expect(created.json.roles).toEqual(["Planner", "Backend Engineer", "Reviewer"]);
    expect((await req("GET", "/api/library/workflows")).json).toHaveLength(1);
  });

  test("a stage depending on an unknown stage is rejected", async () => {
    const res = await req("POST", "/api/library/workflows", {
      name: "Broken", stages: [{ id: "a", name: "A", role: "R", dependsOn: ["ghost"] }],
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain("ghost");
  });

  test("instantiating produces a draft plan with remapped task ids and preserved dependencies", async () => {
    const wf = await makeWorkflow();
    const res = await req("POST", `/api/library/workflows/${wf.json.id}/instantiate`, {
      roleAssignments: { "Backend Engineer": "agent-1" },
    });

    expect(res.status).toBe(200);
    expect(res.json.tasks).toHaveLength(3);

    // Ids are fresh so the same workflow can be applied to several projects without collision.
    const ids = res.json.tasks.map((t: any) => t.id);
    expect(ids).not.toContain("plan");
    expect(new Set(ids).size).toBe(3);

    // Dependencies are remapped to the new ids, not left pointing at stage names.
    const build = res.json.tasks.find((t: any) => t.objective === "Build");
    const plan = res.json.tasks.find((t: any) => t.objective === "Plan");
    expect(build.dependsOn).toEqual([plan.id]);
    expect(build.assignedAgentId).toBe("agent-1");
    expect(res.json.tasks.find((t: any) => t.objective === "Review").reviewGate).toBe(true);
  });

  test("stage names can be overridden at instantiation", async () => {
    const wf = await makeWorkflow();
    const res = await req("POST", `/api/library/workflows/${wf.json.id}/instantiate`, {
      stageNames: { plan: "Design the API" },
    });
    expect(res.json.tasks.some((t: any) => t.objective === "Design the API")).toBe(true);
  });

  test("instantiating an unknown workflow is a 404", async () => {
    const res = await req("POST", "/api/library/workflows/wf_nope/instantiate", {});
    expect(res.status).toBe(404);
  });
});
