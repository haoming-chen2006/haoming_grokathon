import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
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
let grokHome: string;
let app: Hono;

async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // A 404 from the router itself is plain text, not JSON — parse defensively so a routing miss
  // reports as a status rather than as an unreadable SyntaxError from the harness.
  try {
    return { status: res.status, json: text ? JSON.parse(text) : null };
  } catch {
    return { status: res.status, json: { error: text } as any };
  }
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-library-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  // Sealed inside a temp grok home, or these tests would read (and write) the developer's own
  // ~/.grok/skills and ~/.claude/skills.
  grokHome = join(mkdtempSync(join(tmpdir(), "openui-grok-")), ".grok");
  process.env.OPENUI_GROK_HOME = grokHome;
  app = new Hono();
  app.route("/api/library", libraryRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(grokHome, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
  delete process.env.OPENUI_GROK_HOME;
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

// ═══════════════════════════════════════════ TOOL-001: edit and delete over HTTP, for all three

describe("TOOL-001: PATCH and DELETE, which nothing had before", () => {
  test("a prompt can be edited and deleted", async () => {
    const created = await req("POST", "/api/library/prompts", { name: "Ship", body: "Ship {version}." });
    const id = created.json.id;

    const patched = await req("PATCH", `/api/library/prompts/${id}`, { name: "Ship it" });
    expect(patched.status).toBe(200);
    expect(patched.json.name).toBe("Ship it");
    expect(patched.json.body).toBe("Ship {version}.");

    expect((await req("DELETE", `/api/library/prompts/${id}`)).status).toBe(204);
    expect((await req("GET", "/api/library/prompts")).json).toEqual([]);
    expect((await req("DELETE", `/api/library/prompts/${id}`)).status).toBe(404);
  });

  test("a workflow can be edited and deleted", async () => {
    const created = await req("POST", "/api/library/workflows", {
      name: "Ship", stages: [{ name: "Build", role: "Engineer" }],
    });
    const id = created.json.id;

    const patched = await req("PATCH", `/api/library/workflows/${id}`, {
      stages: [{ name: "Design", role: "Designer" }, { name: "Build", role: "Engineer" }],
    });
    expect(patched.status).toBe(200);
    expect(patched.json.stages.map((s: any) => s.name)).toEqual(["Design", "Build"]);

    expect((await req("DELETE", `/api/library/workflows/${id}`)).status).toBe(204);
    expect((await req("GET", "/api/library/workflows")).json).toEqual([]);
  });

  test("an edit that breaks the dependency graph is refused, not persisted", async () => {
    const created = await req("POST", "/api/library/workflows", {
      name: "Ship", stages: [{ name: "Build", role: "Engineer" }],
    });
    const broken = await req("PATCH", `/api/library/workflows/${created.json.id}`, {
      stages: [{ name: "Build", role: "Engineer", dependsOn: ["no-such-stage"] }],
    });
    expect(broken.status).toBe(400);
    expect(broken.json.error).toMatch(/unknown stage/);

    const still = await req("GET", "/api/library/workflows");
    expect(still.json[0].stages[0].dependsOn).toEqual([]);
  });

  test("a legacy skill can be edited and deleted", async () => {
    const created = await req("POST", "/api/library/skills", { name: "TDD", instructions: "Test first." });
    const patched = await req("PATCH", `/api/library/skills/${created.json.id}`, { instructions: "Test first, always." });
    expect(patched.json.instructions).toBe("Test first, always.");
    expect((await req("DELETE", `/api/library/skills/${created.json.id}`)).status).toBe(204);
  });
});

// ═══════════════════════════════════════ skills on disk, over HTTP (A-00, TOOL-004…TOOL-006)

describe("grok skill directories over HTTP", () => {
  const DESCRIPTION = "Write our release notes. Use when the user asks for a changelog.";

  test("create, list, edit, turn down, delete", async () => {
    expect((await req("GET", "/api/library/grok-skills")).json).toEqual([]);

    const created = await req("POST", "/api/library/grok-skills", {
      name: "Release Notes", description: DESCRIPTION, body: "# Steps\n\n1. Read the log.",
    });
    expect(created.status).toBe(201);
    expect(created.json.name).toBe("release-notes");
    expect(created.json.state).toBe("active");
    const id = encodeURIComponent(created.json.id);

    // It is a real file in grok's own root, not a row in a database.
    const file = join(grokHome, "skills", "release-notes", "SKILL.md");
    expect(readFileSync(file, "utf8")).toContain(`description: ${DESCRIPTION}`);

    const edited = await req("PATCH", `/api/library/grok-skills/${id}`, { body: "# Steps\n\n1. Read the tags." });
    expect(edited.json.body).toContain("Read the tags.");

    // TOOL-006: turned down, still listed, and written to config rather than memory.
    const off = await req("PATCH", `/api/library/grok-skills/${id}`, { state: "inactive" });
    expect(off.json.state).toBe("inactive");
    expect(readFileSync(join(grokHome, "config.toml"), "utf8")).toContain("[skills]");
    expect((await req("GET", "/api/library/grok-skills")).json).toHaveLength(1);

    expect((await req("DELETE", `/api/library/grok-skills/${id}`)).status).toBe(204);
    expect((await req("GET", "/api/library/grok-skills")).json).toEqual([]);
  });

  test("TOOL-005: a description that never says when is a 400 with a readable reason", async () => {
    const res = await req("POST", "/api/library/grok-skills", { name: "vague", description: "Formats notes." });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/WHEN/);
  });

  test("the other files in the directory are reachable", async () => {
    const created = await req("POST", "/api/library/grok-skills", { name: "notes", description: DESCRIPTION });
    const id = encodeURIComponent(created.json.id);

    const put = await req("PUT", `/api/library/grok-skills/${id}/resources/reference.md`, { content: "# Ref\n" });
    expect(put.json.resources.map((r: any) => r.path)).toContain("reference.md");
    expect((await req("GET", `/api/library/grok-skills/${id}/resources/reference.md`)).json.content).toBe("# Ref\n");
    expect((await req("DELETE", `/api/library/grok-skills/${id}/resources/reference.md`)).json.resources).toEqual([]);
  });

  test("a resource path cannot climb out of the skill directory", async () => {
    const created = await req("POST", "/api/library/grok-skills", { name: "notes", description: DESCRIPTION });
    const id = encodeURIComponent(created.json.id);

    // Two shapes, because they fail at two different layers and only one of them is ours: a plain
    // `../..` is normalised away by URL parsing before routing, so it 404s and never reaches the
    // handler, while a percent-encoded one survives to be refused by the store's own check.
    for (const attempt of ["../../escaped.md", "..%2F..%2Fescaped.md"]) {
      const res = await req("PUT", `/api/library/grok-skills/${id}/resources/${attempt}`, { content: "x" });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(existsSync(join(grokHome, "escaped.md"))).toBe(false);
    expect(existsSync(join(grokHome, "skills", "escaped.md"))).toBe(false);
  });
});

// ═════════════════════════════════════════════════ TOOL-011: injection resolves, never delivers

describe("TOOL-011: resolving an injection", () => {
  test("a prompt resolves to text that lands on the next turn", async () => {
    const prompt = await req("POST", "/api/library/prompts", {
      name: "Focus", body: "Work on {area} only.",
    });
    const res = await req("POST", "/api/library/injections/resolve", {
      kind: "prompt", resourceId: prompt.json.id, values: { area: "the parser" },
      projectId: "p1", agentId: "a1",
    });

    expect(res.status).toBe(200);
    expect(res.json.text).toBe("Work on the parser only.");
    expect(res.json.effective).toBe("this_turn");
    expect(res.json.mounts).toEqual([]);
    expect(res.json.estimatedInputTokens).toBeGreaterThan(0);
  });

  test("a prompt missing a required value is a 400 naming it, not a prompt with a hole", async () => {
    const prompt = await req("POST", "/api/library/prompts", { name: "Focus", body: "Work on {area}." });
    const res = await req("POST", "/api/library/injections/resolve", {
      kind: "prompt", resourceId: prompt.json.id, projectId: "p1", agentId: "a1",
    });

    expect(res.status).toBe(400);
    expect(res.json.code).toBe("UNRESOLVED_VARIABLE");
    expect(res.json.missing).toEqual(["area"]);
  });

  test("a skill resolves to a mount, and says in words which effect the user gets", async () => {
    const created = await req("POST", "/api/library/grok-skills", {
      name: "deck-conventions",
      description: "Our slide conventions. Use when building a deck.",
      body: "Always use the house template.",
    });

    const now = await req("POST", "/api/library/injections/resolve", {
      kind: "skill", resourceId: created.json.id, projectId: "p1", agentId: "a1",
    });
    expect(now.json.mounts[0].relativePath).toBe(".grok/skills/deck-conventions/SKILL.md");
    expect(now.json.mounts[0].contents).toContain("Always use the house template.");
    expect(now.json.effective).toBe("this_turn");
    expect(now.json.effectNote).toMatch(/next session discovers it/);

    // Mount-only is the honest other half: no text, and the note says so rather than claiming
    // an effect that has not happened.
    const later = await req("POST", "/api/library/injections/resolve", {
      kind: "skill", resourceId: created.json.id, projectId: "p1", agentId: "a1", oneShot: false,
    });
    expect(later.json.text).toBeNull();
    expect(later.json.effective).toBe("next_session");
    expect(later.json.effectNote).toMatch(/not on this turn/);
  });

  test("a workflow resolves to its stages in order, with gates named", async () => {
    const workflow = await req("POST", "/api/library/workflows", {
      name: "Deck", stages: [
        { id: "s1", name: "Research", role: "Researcher", reviewGate: true },
        { id: "s2", name: "Draft", role: "Writer", dependsOn: ["s1"] },
      ],
    });
    const res = await req("POST", "/api/library/injections/resolve", {
      kind: "workflow", resourceId: workflow.json.id, projectId: "p1", agentId: "a1",
    });

    expect(res.json.text).toContain("1. Research — Researcher — stop for review before continuing");
    expect(res.json.text).toContain("2. Draft — Writer (after Research)");
    expect(res.json.effective).toBe("this_turn");
  });

  test("resolving writes nothing into any work area — it resolves, 01-agents delivers", async () => {
    const created = await req("POST", "/api/library/grok-skills", {
      name: "notes", description: "Our notes. Use when writing notes.",
    });
    const before = readdirSync(grokHome).sort();

    await req("POST", "/api/library/injections/resolve", {
      kind: "skill", resourceId: created.json.id, projectId: "p1", agentId: "a1",
    });

    expect(readdirSync(grokHome).sort()).toEqual(before);
  });

  test("an unknown resource is a 404, and a missing kind a 400", async () => {
    expect((await req("POST", "/api/library/injections/resolve", {
      kind: "prompt", resourceId: "nope", projectId: "p1", agentId: "a1",
    })).status).toBe(404);
    expect((await req("POST", "/api/library/injections/resolve", { projectId: "p1" })).status).toBe(400);
  });
});
