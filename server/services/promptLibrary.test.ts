import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  PromptLibrary,
  UnresolvedVariableError,
  composeAgentInstructions,
  referencedVariables,
  renderPrompt,
  rulesForAgent,
  LibraryUnreadableError,
  GrokSkillStore,
  parseSkillMarkdown,
  serializeSkillMarkdown,
  parseIgnoreList,
  writeIgnoreList,
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

// ═══════════════════════════════════════════════════════ TOOL-001: edit and delete, for all three

describe("TOOL-001: a resource can be edited and deleted", () => {
  test("an edit survives a restart", () => {
    const prompt = library.createPrompt({ name: "Release note", body: "Ship {version}." });
    library.updatePrompt(prompt.id, { name: "Release announcement" });

    // A second PromptLibrary over the same directory is what a restart is.
    const reopened = new PromptLibrary(dir);
    expect(reopened.getPrompt(prompt.id).name).toBe("Release announcement");
    expect(reopened.getPrompt(prompt.id).body).toBe("Ship {version}.");
  });

  test("editing a body re-derives its variables, so an added placeholder is not a hole", () => {
    const prompt = library.createPrompt({ name: "Deploy", body: "Deploy {service}." });
    const updated = library.updatePrompt(prompt.id, { body: "Deploy {service} to {region}." });

    expect(updated.variables.map((v) => v.name).sort()).toEqual(["region", "service"]);
    expect(() => renderPrompt(updated, { service: "api" })).toThrow(UnresolvedVariableError);
    expect(renderPrompt(updated, { service: "api", region: "eu" })).toBe("Deploy api to eu.");
  });

  test("an edit cannot fork the record by sending back its own id", () => {
    const skill = library.createSkill({ name: "Review", instructions: "Read the diff." });
    const updated = library.updateSkill(skill.id, { name: "Careful review", id: "skill_other" } as any);

    expect(updated.id).toBe(skill.id);
    expect(updated.createdAt).toBe(skill.createdAt);
    expect(library.listSkills()).toHaveLength(1);
  });

  test("delete removes it, and deleting twice is a clear error rather than a silent success", () => {
    const workflow = library.createWorkflow({
      name: "Ship it",
      stages: [{ name: "Build", role: "Engineer" }],
    });
    library.deleteWorkflow(workflow.id);

    expect(library.listWorkflows()).toHaveLength(0);
    expect(() => library.deleteWorkflow(workflow.id)).toThrow(/not found/);
    expect(new PromptLibrary(dir).listWorkflows()).toHaveLength(0);
  });

  test("deleting an assigned skill does not stop that agent launching", () => {
    const skill = library.createSkill({ name: "TDD", instructions: "Write the test first." });
    const agent = { persona: "You are careful.", skills: [skill.id] };
    expect(rulesForAgent(agent, library)).toContain("Write the test first.");

    library.deleteSkill(skill.id);

    // The persona must survive: the agent still launches, minus the skill.
    const rules = rulesForAgent(agent, library);
    expect(rules).toContain("You are careful.");
    expect(rules).not.toContain("Write the test first.");
  });

  test("a corrupt library surfaces as an error and refuses to overwrite what it could not read", () => {
    library.createPrompt({ name: "Precious", body: "Do not lose me." });
    writeFileSync(join(dir, "library.json"), "{ this is not json");

    const reopened = new PromptLibrary(dir);
    expect(reopened.loadError).toContain("Could not read the library");
    // The distinction TOOL-001 asks for: not an empty library, an unreadable one.
    expect(() => reopened.createPrompt({ name: "Clobber", body: "x" })).toThrow(LibraryUnreadableError);
    expect(readFileSync(join(dir, "library.json"), "utf8")).toBe("{ this is not json");
  });
});

// ═══════════════════════════════ TOOL-004/005/006: skills are grok skill directories on disk
//
// The format is not ours and these tests are written against grok's, deliberately. See the A-00
// note in `loops/handoff/pivot-tools.md` §1 for the probe that established it.

describe("skill frontmatter round-trips grok's own format", () => {
  test("parses the shape ~/.grok/README.md documents", () => {
    const { frontmatter, body } = parseSkillMarkdown(
      `---\nname: commit\ndescription: Create git commits. Use when the user wants to commit.\n---\n\n# Git Commit\n\nRun git diff.\n`,
    );
    expect(frontmatter.name).toBe("commit");
    expect(frontmatter.description).toBe("Create git commits. Use when the user wants to commit.");
    expect(body.trim()).toBe("# Git Commit\n\nRun git diff.");
  });

  test("preserves undocumented keys the shipped skills actually use", () => {
    // ~/.grok/bundled/skills/design/SKILL.md carries both of these and the README documents neither.
    const source = `---\nname: design\ndescription: Run the loop. Use when asked to design.\nwhen-to-use: Use when asked to "design".\nargument-hint: "<what to design>"\n---\n\nBody.\n`;
    const { frontmatter } = parseSkillMarkdown(source);
    expect(frontmatter["when-to-use"]).toBe('Use when asked to "design".');
    expect(frontmatter["argument-hint"]).toBe("<what to design>");

    const rewritten = serializeSkillMarkdown({
      name: "design",
      description: "Run the loop. Use when asked to design.",
      body: "Body.",
      extras: { "when-to-use": 'Use when asked to "design".', "argument-hint": "<what to design>" },
    });
    expect(parseSkillMarkdown(rewritten).frontmatter).toEqual(frontmatter);
  });

  test("a file with no frontmatter is body, not a parse failure", () => {
    const { frontmatter, body } = parseSkillMarkdown("Just some notes.\n");
    expect(frontmatter).toEqual({});
    expect(body).toBe("Just some notes.\n");
  });
});

describe("the [skills] ignore list is edited, not rewritten", () => {
  test("adds a section when config.toml has none", () => {
    const updated = writeIgnoreList('[ui]\nyolo = false\n', ["~/.grok/skills/noisy"]);
    expect(parseIgnoreList(updated)).toEqual(["~/.grok/skills/noisy"]);
    expect(updated).toContain("[ui]\nyolo = false");
  });

  test("leaves every other key, comment and section intact", () => {
    const before = `# my notes\n[skills]\npaths = ["~/team"]   # shared\nignore = ["~/.grok/skills/a"]\n\n[ui]\nyolo = false\n`;
    const after = writeIgnoreList(before, ["~/.grok/skills/a", "~/.grok/skills/b"]);

    expect(parseIgnoreList(after)).toEqual(["~/.grok/skills/a", "~/.grok/skills/b"]);
    expect(after).toContain("# my notes");
    expect(after).toContain('paths = ["~/team"]   # shared');
    expect(after).toContain("[ui]\nyolo = false");
  });

  test("turning the last skill back on leaves no trace we were here", () => {
    const before = `[skills]\nignore = ["~/.grok/skills/a"]\n\n[ui]\nyolo = false\n`;
    const after = writeIgnoreList(before, []);
    expect(after).not.toContain("ignore");
    expect(after).toContain("[ui]\nyolo = false");
  });

  test("a [plugins] disabled list is never read as ours", () => {
    // grok-workspace.md §10.2 confused these two sections; the parser must not.
    const toml = `[plugins]\ndisabled = ["user/x/noisy"]\nignore = ["not-ours"]\n\n[skills]\npaths = []\n`;
    expect(parseIgnoreList(toml)).toEqual([]);
  });
});

describe("TOOL-004/005/006: a skill is a directory on disk", () => {
  let grokHome: string;
  let store: GrokSkillStore;

  beforeEach(() => {
    grokHome = mkdtempSync(join(tmpdir(), "openui-grok-"));
    store = new GrokSkillStore({ home: grokHome, grokHome });
  });

  afterEach(() => rmSync(grokHome, { recursive: true, force: true }));

  const DESCRIPTION = "Format our release notes. Use when the user asks to write a changelog.";

  test("TOOL-004: creating writes <root>/<name>/SKILL.md with grok's frontmatter", () => {
    const skill = store.create({ name: "Release Notes", description: DESCRIPTION, body: "# Steps\n\n1. Read the log." });

    // The name is slugified to grok's constraint: lowercase, hyphens.
    expect(skill.name).toBe("release-notes");
    const file = join(grokHome, "skills", "release-notes", "SKILL.md");
    expect(existsSync(file)).toBe(true);

    const raw = readFileSync(file, "utf8");
    expect(raw.startsWith("---\n")).toBe(true);
    const { frontmatter, body } = parseSkillMarkdown(raw);
    expect(frontmatter.name).toBe("release-notes");
    expect(frontmatter.description).toBe(DESCRIPTION);
    expect(body).toContain("1. Read the log.");
  });

  test("TOOL-004: a skill created by hand, outside the panel, appears in the panel", () => {
    // Exactly the probe from the handoff, in miniature: mkdir + SKILL.md, no registration.
    const dir = join(grokHome, "skills", "hand-written");
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/SKILL.md", `---\nname: hand-written\ndescription: ${DESCRIPTION}\n---\n\nBy hand.\n`);

    const listed = store.list().find((s) => s.name === "hand-written");
    expect(listed).toBeDefined();
    expect(listed!.description).toBe(DESCRIPTION);
    expect(listed!.editable).toBe(true);
  });

  test("TOOL-004: the file on disk is the only copy of the body", () => {
    const skill = store.create({ name: "notes", description: DESCRIPTION, body: "Original." });
    // Edit the file behind the store's back; the next read must reflect it.
    writeFileSync(join(skill.dir, "SKILL.md"), `---\nname: notes\ndescription: ${DESCRIPTION}\n---\n\nEdited on disk.\n`);
    expect(store.get(skill.id).body.trim()).toBe("Edited on disk.");
  });

  test("TOOL-004: further markdown files can live in the same directory", () => {
    const skill = store.create({ name: "notes", description: DESCRIPTION });
    const withResource = store.writeResource(skill.id, "reference.md", "# Reference\n");

    expect(withResource.resources.map((r) => r.path)).toContain("reference.md");
    expect(store.readResource(skill.id, "reference.md")).toBe("# Reference\n");
    expect(store.deleteResource(skill.id, "reference.md").resources).toHaveLength(0);
  });

  test("a resource path cannot escape the skill's directory", () => {
    const skill = store.create({ name: "notes", description: DESCRIPTION });
    expect(() => store.writeResource(skill.id, "../../escaped.md", "x")).toThrow(/outside/);
    expect(existsSync(join(grokHome, "escaped.md"))).toBe(false);
  });

  test("TOOL-005: a description that does not say WHEN is refused, with a reason", () => {
    expect(() => store.create({ name: "vague", description: "Formats release notes." })).toThrow(/WHEN/);
    // And the refusal is not a silent rewrite — nothing was written.
    expect(existsSync(join(grokHome, "skills", "vague"))).toBe(false);

    expect(() => store.create({ name: "fine", description: DESCRIPTION })).not.toThrow();
  });

  test("TOOL-006: three states, and the off-state is written to grok's own config", () => {
    const skill = store.create({ name: "notes", description: DESCRIPTION });
    expect(skill.state).toBe("active");

    const off = store.setState(skill.id, "inactive");
    expect(off.state).toBe("inactive");

    // Written to config.toml, not held in memory — this is what makes it survive a restart, and
    // what makes the terminal agree with the panel.
    const config = readFileSync(join(grokHome, "config.toml"), "utf8");
    // Stored tilde-relative — the form the handoff's probe proved grok expands.
    expect(parseIgnoreList(config)).toEqual(["~/skills/notes"]);
    expect(config).toContain("[skills]");

    // A fresh store is what a reload is.
    expect(new GrokSkillStore({ home: grokHome, grokHome }).get(skill.id).state).toBe("inactive");

    // And it is still listed and editable while off — that is the whole point of the middle state.
    const stillThere = new GrokSkillStore({ home: grokHome, grokHome }).list();
    expect(stillThere.map((s) => s.name)).toContain("notes");

    expect(store.setState(skill.id, "active").state).toBe("active");
    expect(parseIgnoreList(readFileSync(join(grokHome, "config.toml"), "utf8"))).toEqual([]);
  });

  test("deleting a skill does not leave its off-state behind for the next skill of that name", () => {
    const skill = store.create({ name: "notes", description: DESCRIPTION });
    store.setState(skill.id, "inactive");
    store.remove(skill.id);

    expect(parseIgnoreList(readFileSync(join(grokHome, "config.toml"), "utf8"))).toEqual([]);
    const recreated = store.create({ name: "notes", description: DESCRIPTION });
    expect(recreated.state).toBe("active");
  });

  test("a bundled skill is listed but refuses edits, because grok owns it", () => {
    const dir = join(grokHome, "bundled", "skills", "imagine");
    mkdirSync(dir, { recursive: true });
    writeFileSync(dir + "/SKILL.md", `---\nname: imagine\ndescription: ${DESCRIPTION}\n---\n\nShipped.\n`);

    const bundled = store.list().find((s) => s.name === "imagine")!;
    expect(bundled.editable).toBe(false);
    expect(bundled.scope).toBe("bundled");
    expect(() => store.update(bundled.id, { body: "mine now" })).toThrow(/ships with grok/);
    expect(() => store.remove(bundled.id)).toThrow(/ships with grok/);
  });

  test("a higher-priority root wins a name collision, as grok's own dedup does", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "openui-proj-"));
    try {
      for (const [base, marker] of [
        [join(projectRoot, ".grok", "skills", "notes"), "project copy"],
        [join(grokHome, "skills", "notes"), "user copy"],
      ] as const) {
        mkdirSync(base, { recursive: true });
        writeFileSync(base + "/SKILL.md", `---\nname: notes\ndescription: ${DESCRIPTION}\n---\n\n${marker}\n`);
      }
      const scoped = new GrokSkillStore({ home: grokHome, grokHome, projectRoot });
      const notes = scoped.list().filter((s) => s.name === "notes");

      expect(notes).toHaveLength(1);
      expect(notes[0].scope).toBe("project");
      expect(notes[0].body).toContain("project copy");
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
