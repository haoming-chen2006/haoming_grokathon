import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  PromptLibrary,
  UnresolvedVariableError,
  composeAgentInstructions,
  referencedVariables,
  renderPrompt,
} from "./promptLibrary";

let dir: string;
let library: PromptLibrary;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-library-"));
  library = new PromptLibrary(dir);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("V-043: prompt templates support variables", () => {
  const BODY = [
    "Implement requirement {requirement_id} in {module}.",
    "",
    "Constraints:",
    "- Modify only assigned modules unless necessary.",
    "- Add tests for all acceptance criteria.",
  ].join("\n");

  test("referencedVariables finds placeholders in order, deduplicated", () => {
    expect(referencedVariables("{a} then {b} then {a}")).toEqual(["a", "b"]);
    expect(referencedVariables("no placeholders")).toEqual([]);
  });

  test("variables resolve from supplied values", () => {
    const rendered = renderPrompt(
      { name: "impl", body: BODY, variables: [] },
      { requirement_id: "AUTH-03", module: "src/auth" },
    );
    expect(rendered).toContain("Implement requirement AUTH-03 in src/auth.");
    expect(rendered).not.toContain("{requirement_id}");
    expect(rendered).not.toContain("{module}");
  });

  test("a declared default fills in an unsupplied value", () => {
    const rendered = renderPrompt(
      {
        name: "impl",
        body: "Run {command} in {cwd}.",
        variables: [
          { name: "command", required: true },
          { name: "cwd", required: false, default: "." },
        ],
      },
      { command: "bun test" },
    );
    expect(rendered).toBe("Run bun test in ..");
  });

  test("an unresolved required variable is an error, not an empty string", () => {
    // A prompt with a hole in it would send the agent off on the wrong task.
    let caught: unknown;
    try {
      renderPrompt({ name: "impl", body: BODY, variables: [] }, { requirement_id: "AUTH-03" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnresolvedVariableError);
    expect((caught as UnresolvedVariableError).missing).toEqual(["module"]);
    expect((caught as Error).message).toContain("impl");
  });

  test("an empty string counts as unsupplied", () => {
    expect(() => renderPrompt({ name: "t", body: "{x}", variables: [] }, { x: "" })).toThrow(
      UnresolvedVariableError,
    );
  });

  test("an optional variable with no default renders empty", () => {
    const rendered = renderPrompt(
      { name: "t", body: "a{x}b", variables: [{ name: "x", required: false }] },
      {},
    );
    expect(rendered).toBe("ab");
  });

  test("numbers are accepted as values", () => {
    expect(renderPrompt({ name: "t", body: "{n} tests", variables: [] }, { n: 22 })).toBe("22 tests");
  });

  test("an undeclared placeholder is recorded as required when the template is saved", () => {
    // Otherwise a typo like {modual} would silently render as an empty hole.
    const prompt = library.createPrompt({ name: "impl", body: BODY });
    expect(prompt.variables.map((v) => v.name)).toEqual(["requirement_id", "module"]);
    expect(prompt.variables.every((v) => v.required)).toBe(true);

    expect(() => library.renderPromptById(prompt.id, { requirement_id: "AUTH-01" })).toThrow(
      UnresolvedVariableError,
    );
  });

  test("templates persist across a restart", () => {
    const prompt = library.createPrompt({ name: "impl", body: BODY });
    const reopened = new PromptLibrary(dir);
    expect(reopened.getPrompt(prompt.id).body).toBe(BODY);
    expect(reopened.renderPromptById(prompt.id, { requirement_id: "A", module: "m" })).toContain(
      "Implement requirement A in m.",
    );
  });
});

describe("V-042: reusable skills can be assigned", () => {
  const TDD = [
    "1. Reproduce the bug.",
    "2. Add a failing regression test.",
    "3. Implement the minimal fix.",
    "4. Run targeted tests.",
  ].join("\n");

  test("skills are created, listed and retrievable", () => {
    const skill = library.createSkill({ name: "Test-Driven Bug Fix", instructions: TDD });
    expect(skill.id).toBeTruthy();
    expect(library.listSkills()).toHaveLength(1);
    expect(library.getSkill(skill.id).instructions).toContain("failing regression test");
  });

  test("a skill requires a name and instructions", () => {
    expect(() => library.createSkill({ name: "", instructions: TDD })).toThrow(/name is required/);
    expect(() => library.createSkill({ name: "x", instructions: "  " })).toThrow(/instructions are required/);
  });

  test("multiple skills can be assigned and all reach the session instructions", () => {
    const a = library.createSkill({ name: "Test-Driven Bug Fix", instructions: TDD });
    const b = library.createSkill({ name: "API Contract Review", instructions: "Check the contract." });

    const composed = composeAgentInstructions({
      persona: "Prefer small, reviewable changes.",
      skills: library.resolveSkills([a.id, b.id]),
      prompt: "Implement requirement AUTH-03.",
    });

    // Persona frames the role, skills add procedure, the prompt states the job — in that order.
    expect(composed.indexOf("# Persona")).toBeLessThan(composed.indexOf("# Skill: Test-Driven Bug Fix"));
    expect(composed.indexOf("# Skill: Test-Driven Bug Fix")).toBeLessThan(composed.indexOf("# Skill: API Contract Review"));
    expect(composed.indexOf("# Skill: API Contract Review")).toBeLessThan(composed.indexOf("# Task"));

    expect(composed).toContain("failing regression test");
    expect(composed).toContain("Check the contract.");
    expect(composed).toContain("Implement requirement AUTH-03.");
  });

  test("an unknown skill id is rejected rather than silently dropped", () => {
    expect(() => library.resolveSkills(["nope"])).toThrow(/Skill not found/);
  });

  test("composing with no persona or prompt still emits the skills", () => {
    const skill = library.createSkill({ name: "S", instructions: "do the thing" });
    const composed = composeAgentInstructions({ skills: [skill] });
    expect(composed).toBe("# Skill: S\n\ndo the thing");
  });

  test("skills persist across a restart", () => {
    const skill = library.createSkill({ name: "S", instructions: "i" });
    expect(new PromptLibrary(dir).getSkill(skill.id).name).toBe("S");
  });
});

describe("V-044: reusable workflow can launch a project plan", () => {
  function makeWorkflow() {
    return library.createWorkflow({
      name: "Standard Feature Delivery",
      stages: [
        { id: "analyze", name: "Repository analysis", role: "Planner" },
        { id: "implement", name: "Parallel implementation", role: "Backend Engineer", dependsOn: ["analyze"] },
        { id: "test", name: "Integration testing", role: "Test Engineer", dependsOn: ["implement"] },
        { id: "review", name: "Design-compliance review", role: "Reviewer", dependsOn: ["test"], reviewGate: true },
      ],
    });
  }

  test("a workflow defines roles, stages, dependencies and review gates", () => {
    const workflow = makeWorkflow();
    expect(workflow.stages).toHaveLength(4);
    expect(workflow.roles).toEqual(["Planner", "Backend Engineer", "Test Engineer", "Reviewer"]);
    expect(workflow.stages.find((s) => s.id === "review")!.reviewGate).toBe(true);
    expect(workflow.stages.find((s) => s.id === "implement")!.dependsOn).toEqual(["analyze"]);
  });

  test("a stage depending on an unknown stage is rejected", () => {
    expect(() =>
      library.createWorkflow({ name: "bad", stages: [{ name: "s", role: "r", dependsOn: ["ghost"] }] }),
    ).toThrow(/unknown stage/);
  });

  test("a workflow needs at least one stage", () => {
    expect(() => library.createWorkflow({ name: "empty", stages: [] })).toThrow(/at least one stage/);
  });

  test("instantiating generates stages with dependencies remapped to fresh task ids", () => {
    const workflow = makeWorkflow();
    const { tasks } = library.instantiateWorkflow(workflow.id);

    expect(tasks).toHaveLength(4);
    // Ids must be fresh, not the workflow's stage ids, so the same workflow can be applied twice.
    expect(tasks.map((t) => t.id)).not.toContain("analyze");

    const byObjective = new Map(tasks.map((t) => [t.objective, t]));
    const analyze = byObjective.get("Repository analysis")!;
    const implement = byObjective.get("Parallel implementation")!;
    expect(implement.dependsOn).toEqual([analyze.id]);
    expect(byObjective.get("Design-compliance review")!.reviewGate).toBe(true);
  });

  test("the same workflow applied twice produces independent, non-colliding tasks", () => {
    const workflow = makeWorkflow();
    const first = library.instantiateWorkflow(workflow.id);
    const second = library.instantiateWorkflow(workflow.id);

    const firstIds = new Set(first.tasks.map((t) => t.id));
    expect(second.tasks.every((t) => !firstIds.has(t.id))).toBe(true);
  });

  test("project-specific values remain editable via overrides", () => {
    const workflow = makeWorkflow();
    const { tasks } = library.instantiateWorkflow(workflow.id, {
      stageNames: { analyze: "Analyze the payments repo" },
      roleAssignments: { Planner: "planner-agent", "Backend Engineer": "backend-agent" },
    });

    const analyze = tasks.find((t) => t.objective === "Analyze the payments repo");
    expect(analyze).toBeDefined();
    expect(analyze!.assignedAgentId).toBe("planner-agent");
    expect(tasks.find((t) => t.objective === "Parallel implementation")!.assignedAgentId).toBe("backend-agent");
    // A role with no assignment stays unassigned rather than being invented.
    expect(tasks.find((t) => t.objective === "Integration testing")!.assignedAgentId).toBeUndefined();
  });

  test("workflows persist across a restart", () => {
    const workflow = makeWorkflow();
    expect(new PromptLibrary(dir).getWorkflow(workflow.id).stages).toHaveLength(4);
  });
});
