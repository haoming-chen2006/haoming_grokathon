import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "fs";
import { dirname, join, resolve, sep } from "path";
import { homedir } from "os";
import { atomicWriteJson } from "./persistence";

/** A template referenced a variable that was not supplied and has no default (V-043). */
export class UnresolvedVariableError extends Error {
  readonly code = "UNRESOLVED_VARIABLE";
  constructor(readonly missing: string[], readonly templateName: string) {
    super(`Prompt template "${templateName}" has unresolved required variables: ${missing.join(", ")}`);
    this.name = "UnresolvedVariableError";
  }
}

/** The library file exists but could not be parsed, so writing would destroy it (TOOL-001). */
export class LibraryUnreadableError extends Error {
  readonly code = "LIBRARY_UNREADABLE";
  constructor(message: string) {
    super(message);
    this.name = "LibraryUnreadableError";
  }
}

export interface PromptVariable {
  name: string;
  description?: string;
  required: boolean;
  default?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  /** Body using {variable} placeholders. */
  body: string;
  variables: PromptVariable[];
  createdAt: string;
}

/** A reusable coding skill: instructions injected into an agent's session (§14). */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  /** The instruction text handed to the agent, e.g. a Test-Driven Bug Fix procedure. */
  instructions: string;
  createdAt: string;
}

export interface WorkflowStage {
  id: string;
  name: string;
  /** Agent role responsible, e.g. "Planner", "Backend Engineer". */
  role: string;
  dependsOn: string[];
  /** Whether this stage gates on human review before the next may start. */
  reviewGate: boolean;
}

/** A saved sequence of roles, stages, dependencies and review gates (V-044). */
export interface ProjectWorkflow {
  id: string;
  name: string;
  description?: string;
  roles: string[];
  stages: WorkflowStage[];
  createdAt: string;
}

const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Variable names referenced by a template body, in first-appearance order, deduplicated. */
export function referencedVariables(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/**
 * Render a template. Unsupplied variables fall back to their declared default; a required
 * variable with neither a value nor a default is an error, never a silently empty string —
 * a prompt with a hole in it would send the agent off on the wrong task.
 */
export function renderPrompt(
  template: Pick<PromptTemplate, "name" | "body" | "variables">,
  values: Record<string, string | number | undefined> = {},
): string {
  const declared = new Map(template.variables.map((v) => [v.name, v]));
  const missing: string[] = [];

  const resolved = new Map<string, string>();
  for (const name of referencedVariables(template.body)) {
    const supplied = values[name];
    if (supplied !== undefined && String(supplied).length > 0) {
      resolved.set(name, String(supplied));
      continue;
    }
    const declaration = declared.get(name);
    if (declaration?.default !== undefined) {
      resolved.set(name, declaration.default);
      continue;
    }
    // Undeclared placeholders are treated as required — a typo must not vanish silently.
    if (!declaration || declaration.required) {
      missing.push(name);
      continue;
    }
    resolved.set(name, "");
  }

  if (missing.length > 0) throw new UnresolvedVariableError(missing, template.name);

  return template.body.replace(PLACEHOLDER, (whole, name: string) => resolved.get(name) ?? whole);
}

/**
 * Compose the instruction text handed to a Grok session for an agent: persona, then each assigned
 * skill, then the task prompt. Order matters — persona frames the role, skills add procedure, the
 * prompt states the immediate job.
 */
export function composeAgentInstructions(params: {
  persona?: string;
  skills: Skill[];
  prompt?: string;
}): string {
  const sections: string[] = [];
  if (params.persona?.trim()) sections.push(`# Persona\n\n${params.persona.trim()}`);
  for (const skill of params.skills) {
    sections.push(`# Skill: ${skill.name}\n\n${skill.instructions.trim()}`);
  }
  if (params.prompt?.trim()) sections.push(`# Task\n\n${params.prompt.trim()}`);
  return sections.join("\n\n");
}

/**
 * The `rules` text an agent's session should be opened with: its persona plus its assigned skills.
 *
 * Shared by the session manager and the planner because both open sessions for a configured agent,
 * and the planner previously opened one with no rules at all — so a Planner persona could be set
 * (both `bun run new` and the Control Room set one) and silently do nothing.
 *
 * An unknown skill id is skipped rather than fatal: a deleted skill must not stop an agent from
 * starting.
 */
export function rulesForAgent(
  agent: { persona?: string; skills?: string[] } | undefined,
  library: Pick<PromptLibrary, "getSkill">,
): string | undefined {
  if (!agent) return undefined;
  const skills: Skill[] = [];
  for (const id of agent.skills ?? []) {
    try {
      skills.push(library.getSkill(id));
    } catch {
      // Skipped, not fatal.
    }
  }
  const composed = composeAgentInstructions({ persona: agent.persona, skills });
  return composed.trim() ? composed : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface LibraryFile {
  skills: Skill[];
  prompts: PromptTemplate[];
  workflows: ProjectWorkflow[];
}

/**
 * Project-independent library of reusable skills, prompt templates and workflows. Stored outside
 * any single project so the same definitions can be applied to another repository (V-041, V-044).
 */
export class PromptLibrary {
  private skills = new Map<string, Skill>();
  private prompts = new Map<string, PromptTemplate>();
  private workflows = new Map<string, ProjectWorkflow>();
  private readonly path: string | null;

  /**
   * Set when the library file exists but could not be parsed (TOOL-001).
   *
   * The failure this prevents: a truncated or hand-edited `library.json` used to be caught, logged
   * to a terminal nobody is watching, and left as three empty maps — so the panel rendered "no
   * prompts yet" over a file that in fact held forty, and the first create() overwrote all of them.
   * An empty library and an unreadable one are opposite situations and must not look alike.
   *
   * Held rather than thrown so the constructor still returns: the process must start. Writes are
   * refused while it is set, which is what stops the overwrite.
   */
  loadError: string | null = null;


  constructor(dir?: string) {
    this.path = dir ? join(dir, "library.json") : null;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      this.load();
    }
  }

  private load(): void {
    if (!this.path || !existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<LibraryFile>;
      this.skills = new Map((raw.skills ?? []).map((s) => [s.id, s]));
      this.prompts = new Map((raw.prompts ?? []).map((p) => [p.id, p]));
      this.workflows = new Map((raw.workflows ?? []).map((w) => [w.id, w]));
      this.loadError = null;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.loadError = `Could not read the library at ${this.path}: ${detail}`;
      console.error(`\x1b[38;5;203m[library]\x1b[0m Failed to read ${this.path}:`, err);
    }
  }

  /** Refuse to write over a file we could not read — see `loadError`. */
  private assertReadable(): void {
    if (this.loadError) throw new LibraryUnreadableError(this.loadError);
  }

  private save(): void {
    if (!this.path) return;
    atomicWriteJson(this.path, {
      skills: [...this.skills.values()],
      prompts: [...this.prompts.values()],
      workflows: [...this.workflows.values()],
    } satisfies LibraryFile);
  }

  // ------------------------------------------------------------------ skills

  createSkill(params: { name: string; instructions: string; description?: string }): Skill {
    this.assertReadable();
    if (!params.name?.trim()) throw new Error("Skill name is required");
    if (!params.instructions?.trim()) throw new Error("Skill instructions are required");
    const skill: Skill = { id: newId("skill"), createdAt: nowIso(), ...params };
    this.skills.set(skill.id, skill);
    this.save();
    return skill;
  }

  getSkill(skillId: string): Skill {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill not found: ${skillId}`);
    return skill;
  }

  listSkills(): Skill[] {
    return [...this.skills.values()];
  }

  /** Resolve assigned skill ids to definitions, rejecting unknown ids. */
  resolveSkills(skillIds: string[]): Skill[] {
    return skillIds.map((id) => this.getSkill(id));
  }

  updateSkill(
    skillId: string,
    patch: Partial<Pick<Skill, "name" | "instructions" | "description">>,
  ): Skill {
    this.assertReadable();
    const existing = this.getSkill(skillId);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Skill name is required");
    if (patch.instructions !== undefined && !patch.instructions.trim()) {
      throw new Error("Skill instructions are required");
    }
    // id and createdAt are the record's identity, never patchable — a client that sends them back
    // in a round-tripped object must not be able to fork the row.
    const updated: Skill = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
    this.skills.set(skillId, updated);
    this.save();
    return updated;
  }

  /**
   * Delete a skill. Agents that reference it keep launching: `rulesForAgent` skips unknown ids
   * deliberately (see its doc comment), and TOOL-001 requires that behaviour be preserved, so this
   * does not walk the agent list looking for references to scrub.
   */
  deleteSkill(skillId: string): void {
    this.assertReadable();
    this.getSkill(skillId);
    this.skills.delete(skillId);
    this.save();
  }

  // ---------------------------------------------------------- prompts, cont.

  // ---------------------------------------------------------------- prompts

  createPrompt(params: { name: string; body: string; variables?: PromptVariable[] }): PromptTemplate {
    this.assertReadable();
    if (!params.name?.trim()) throw new Error("Prompt name is required");

    // Any placeholder the author did not declare is recorded as required, so rendering fails
    // loudly rather than emitting a prompt with a hole in it.
    const declared = params.variables ?? [];
    const declaredNames = new Set(declared.map((v) => v.name));
    const variables = [
      ...declared,
      ...referencedVariables(params.body)
        .filter((name) => !declaredNames.has(name))
        .map((name) => ({ name, required: true })),
    ];

    const prompt: PromptTemplate = {
      id: newId("prompt"),
      name: params.name,
      body: params.body,
      variables,
      createdAt: nowIso(),
    };
    this.prompts.set(prompt.id, prompt);
    this.save();
    return prompt;
  }

  getPrompt(promptId: string): PromptTemplate {
    const prompt = this.prompts.get(promptId);
    if (!prompt) throw new Error(`Prompt template not found: ${promptId}`);
    return prompt;
  }

  listPrompts(): PromptTemplate[] {
    return [...this.prompts.values()];
  }

  renderPromptById(promptId: string, values: Record<string, string | number | undefined>): string {
    return renderPrompt(this.getPrompt(promptId), values);
  }

  /**
   * Edit a template. Re-derives undeclared placeholders exactly as `createPrompt` does, so a body
   * edited to add `{region}` gains a required variable rather than rendering a hole — the two paths
   * must agree or a prompt behaves differently depending on whether it was created or edited.
   */
  updatePrompt(
    promptId: string,
    patch: Partial<Pick<PromptTemplate, "name" | "body" | "variables">>,
  ): PromptTemplate {
    this.assertReadable();
    const existing = this.getPrompt(promptId);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Prompt name is required");

    const body = patch.body ?? existing.body;
    const declared = patch.variables ?? (patch.body !== undefined ? [] : existing.variables);
    const declaredNames = new Set(declared.map((v) => v.name));
    const variables = [
      ...declared,
      ...referencedVariables(body)
        .filter((name) => !declaredNames.has(name))
        .map((name) => ({ name, required: true })),
    ];

    const updated: PromptTemplate = {
      ...existing,
      name: patch.name ?? existing.name,
      body,
      variables,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    this.prompts.set(promptId, updated);
    this.save();
    return updated;
  }

  deletePrompt(promptId: string): void {
    this.assertReadable();
    this.getPrompt(promptId);
    this.prompts.delete(promptId);
    this.save();
  }

  // -------------------------------------------------------------- workflows

  createWorkflow(params: {
    name: string;
    description?: string;
    roles?: string[];
    stages: Array<{ id?: string; name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
  }): ProjectWorkflow {
    this.assertReadable();
    if (!params.name?.trim()) throw new Error("Workflow name is required");
    if (!params.stages?.length) throw new Error("A workflow needs at least one stage");

    const stages: WorkflowStage[] = params.stages.map((s) => ({
      id: s.id ?? newId("stage"),
      name: s.name,
      role: s.role,
      dependsOn: s.dependsOn ?? [],
      reviewGate: s.reviewGate ?? false,
    }));

    const known = new Set(stages.map((s) => s.id));
    for (const stage of stages) {
      for (const dep of stage.dependsOn) {
        if (!known.has(dep)) throw new Error(`Stage "${stage.name}" depends on unknown stage: ${dep}`);
      }
    }

    const workflow: ProjectWorkflow = {
      id: newId("wf"),
      name: params.name,
      description: params.description,
      roles: params.roles ?? [...new Set(stages.map((s) => s.role))],
      stages,
      createdAt: nowIso(),
    };
    this.workflows.set(workflow.id, workflow);
    this.save();
    return workflow;
  }

  getWorkflow(workflowId: string): ProjectWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    return workflow;
  }

  listWorkflows(): ProjectWorkflow[] {
    return [...this.workflows.values()];
  }

  /**
   * Edit a workflow. Stage ids are preserved where the caller sends them back and minted where it
   * does not, and the dependency graph is re-validated, because an edit that drops a stage another
   * stage depends on would otherwise persist a workflow that `instantiateWorkflow` cannot expand.
   *
   * TOOL-009: this mutates the stored definition only. Nothing here reaches a plan that was already
   * instantiated from it — `instantiateWorkflow` copies into fresh task ids, so a run in progress
   * keeps the shape it started with.
   */
  updateWorkflow(
    workflowId: string,
    patch: {
      name?: string;
      description?: string;
      roles?: string[];
      stages?: Array<{ id?: string; name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
    },
  ): ProjectWorkflow {
    this.assertReadable();
    const existing = this.getWorkflow(workflowId);
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Workflow name is required");
    if (patch.stages !== undefined && !patch.stages.length) {
      throw new Error("A workflow needs at least one stage");
    }

    const stages: WorkflowStage[] = patch.stages
      ? patch.stages.map((s) => ({
          id: s.id ?? newId("stage"),
          name: s.name,
          role: s.role,
          dependsOn: s.dependsOn ?? [],
          reviewGate: s.reviewGate ?? false,
        }))
      : existing.stages;

    const known = new Set(stages.map((s) => s.id));
    for (const stage of stages) {
      for (const dep of stage.dependsOn) {
        if (!known.has(dep)) throw new Error(`Stage "${stage.name}" depends on unknown stage: ${dep}`);
      }
    }

    const updated: ProjectWorkflow = {
      ...existing,
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      roles: patch.roles ?? (patch.stages ? [...new Set(stages.map((s) => s.role))] : existing.roles),
      stages,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    this.workflows.set(workflowId, updated);
    this.save();
    return updated;
  }

  deleteWorkflow(workflowId: string): void {
    this.assertReadable();
    this.getWorkflow(workflowId);
    this.workflows.delete(workflowId);
    this.save();
  }

  /**
   * Turn a saved workflow into a draft plan for a project (V-044). Stage ids are remapped to
   * fresh task ids so the same workflow can be applied to several projects without collision,
   * and every generated value stays editable because the plan lands as a draft.
   */
  instantiateWorkflow(
    workflowId: string,
    overrides: { stageNames?: Record<string, string>; roleAssignments?: Record<string, string> } = {},
  ): {
    workflow: ProjectWorkflow;
    milestones: Array<{ id: string; name: string; ownerAgentId?: string; dependsOn: string[] }>;
    tasks: Array<{ id: string; objective: string; assignedAgentId?: string; dependsOn: string[]; reviewGate: boolean }>;
  } {
    const workflow = this.getWorkflow(workflowId);
    const idMap = new Map(workflow.stages.map((s) => [s.id, newId("task")]));

    const tasks = workflow.stages.map((stage) => ({
      id: idMap.get(stage.id)!,
      objective: overrides.stageNames?.[stage.id] ?? stage.name,
      assignedAgentId: overrides.roleAssignments?.[stage.role],
      dependsOn: stage.dependsOn.map((d) => idMap.get(d)!).filter(Boolean),
      reviewGate: stage.reviewGate,
    }));

    const milestones = workflow.stages.map((stage) => ({
      id: newId("ms"),
      name: overrides.stageNames?.[stage.id] ?? stage.name,
      ownerAgentId: overrides.roleAssignments?.[stage.role],
      dependsOn: [],
    }));

    return { workflow, milestones, tasks };
  }
}

let library: PromptLibrary | null = null;
let libraryDir: string | null = null;

/** Rebuilt when the configured data directory changes — see getProjectStore for the reasoning. */
export function getPromptLibrary(): PromptLibrary {
  const dir = process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
  if (!library || libraryDir !== dir) {
    library = new PromptLibrary(dir);
    libraryDir = dir;
  }
  return library;
}

// ═══════════════════════════════════════════════ grok skills on disk (A-00, TOOL-004…TOOL-006)
//
// The finding, in one line: grok's skill format IS our skill format, so this is a filesystem
// editor over grok's own discovery roots and not a second skill runtime.
//
// Verified against grok 1.0.0 rather than assumed — the probe and its output are in
// `loops/handoff/pivot-tools.md` §1. A directory holding SKILL.md with `name` and `description`
// frontmatter, dropped into ~/.grok/skills/, took `grok inspect` from 22 skills to 23 and was
// tagged `user`, with no registration step and no restart. `description` is the discovery prompt
// §10 asks for; the directory is the directory. Nothing here needed inventing.
//
// Two corrections to grok-workspace.md §10.2, both load-bearing and both probed:
//   - there is no `[skills] disabled` key. `[skills]` takes `paths` and `ignore`; `disabled`
//     belongs to `[plugins]`.
//   - `ignore` is not a turn-down, it is a delete from grok's view: adding a skill to it took the
//     listing 23 -> 22. Upstream is binary.
// So the middle state of TOOL-006 is ours. It costs no runtime: we list from disk, grok lists from
// discovery, and `ignore` is the seam between them.

/** Where a skill was found. `bundled` ships with grok and is read-only. */
export type SkillScope = "project" | "user" | "claude" | "bundled";

/**
 * absent / listed-but-inactive / active (TOOL-006, grok-workspace §10.3).
 *
 * `absent` is not a value here because it is the absence of a directory, not a state a record can
 * hold — a three-valued enum with one member that can never be stored would be a lie in the type.
 */
export type SkillState = "active" | "inactive";

export interface SkillResource {
  /** Path relative to the skill directory, e.g. "reference.md" or "scripts/run.sh". */
  path: string;
  bytes: number;
}

/** A skill as it exists on disk, in grok's own format. */
export interface GrokSkill {
  /** `<scope>:<directory name>`. Stable across edits, and unique where two roots hold one name. */
  id: string;
  /** The directory name. Also grok's key, and what `/name` invokes. */
  name: string;
  /** The discovery prompt: what it does AND when to use it. Decides whether grok invokes it. */
  description: string;
  /** Everything after the frontmatter. */
  body: string;
  /**
   * Frontmatter keys beyond name/description, preserved verbatim on write.
   *
   * The shipped skills use `when-to-use` and `argument-hint`, which `~/.grok/README.md` does not
   * document. Round-tripping unknown keys rather than dropping them is what stops this panel
   * silently degrading a skill the user wrote in a future version of the format.
   */
  extras: Record<string, string>;
  dir: string;
  scope: SkillScope;
  state: SkillState;
  /** Sibling files — the rest of the directory §10 calls for. Excludes SKILL.md itself. */
  resources: SkillResource[];
  /** False for bundled skills: they are grok's, and an edit would be lost on upgrade. */
  editable: boolean;
}

const SKILL_FILE = "SKILL.md";

/** grok's own constraint: lowercase, hyphens, max 64 (`~/.grok/README.md:1637`). */
export function slugifySkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (!slug) throw new Error("A skill needs a name with at least one letter or digit in it");
  return slug;
}

/**
 * Does this description say *when* to use the skill, not only what it is (TOOL-005)?
 *
 * grok matches a task against `description` alone, so "Formats our release notes" can never be
 * selected — there is no occasion in it. The check is deliberately shallow: it looks for language
 * of occasion and for enough words to carry one. It is a guardrail against the empty case, not a
 * grader, and the panel offers it as a refusal the user can read and fix, never a silent rewrite.
 */
export function describesWhenToUse(description: string): boolean {
  const text = description.trim();
  if (text.split(/\s+/).length < 6) return false;
  return /\b(when|whenever|use (this|it|for)|after|before|if the|for (any|a|an)|asks?|wants?|requests?|during)\b/i.test(
    text,
  );
}

/**
 * Split `---\nkey: value\n---\nbody`.
 *
 * Still not a YAML parser, and `package.json` is a hot file so a dependency cannot be added. But
 * "skill frontmatter is flat scalars" — what this used to assume — is false of the skills grok
 * itself ships: `~/.grok/bundled/skills/build-with-ai/SKILL.md` writes its description as a folded
 * block scalar and carries a nested `metadata:` map. Reading `key: value` off each line gave that
 * skill the description `">"`, and description is the ONE field the feature turns on — it is what
 * grok matches a task against and the only thing the panel can show about a skill. So the panel
 * listed grok's own skills as a column of `>`.
 *
 * What is understood, and no more: block scalars (`>` folds, `|` keeps newlines), a plain value
 * continued on following indented lines, and nested maps — which are SKIPPED rather than recorded
 * as an empty string, because `metadata: ""` is a fact about our parser and not about the file.
 * A skipped map is lost on rewrite; that was already true when it was stored as empty, and the
 * skills that use one are the bundled ones, which are not editable.
 */
export function parseSkillMarkdown(source: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontmatter: {}, body: source };

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  const indentOf = (line: string) => line.length - line.trimStart().length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();

    // Everything indented under this key belongs to it, up to the next key at column zero.
    const owned: string[] = [];
    let next = i + 1;
    for (; next < lines.length; next++) {
      if (lines[next].trim() && indentOf(lines[next]) === 0) break;
      owned.push(lines[next].trim());
    }
    const consume = () => {
      i = next - 1;
    };

    if (/^[|>][-+]?$/.test(value)) {
      // `|` is literal, `>` is folded. The chomping indicator only affects trailing newlines,
      // which are trimmed either way.
      const literal = value.startsWith("|");
      value = literal ? owned.join("\n").trim() : owned.filter(Boolean).join(" ").trim();
      consume();
    } else if (value === "") {
      // A nested map, or a key with nothing after it. Neither is a scalar we can honestly report.
      consume();
      continue;
    } else if (owned.some((l) => l.length > 0)) {
      value = [value, ...owned.filter(Boolean)].join(" ");
      consume();
    }

    // Strip one layer of matching quotes; `argument-hint: "<what to design>"` ships quoted.
    if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    frontmatter[kv[1]] = value;
  }
  return { frontmatter, body: source.slice(match[0].length) };
}

/** The inverse of `parseSkillMarkdown`. name and description lead; extras keep their order. */
export function serializeSkillMarkdown(params: {
  name: string;
  description: string;
  body: string;
  extras?: Record<string, string>;
}): string {
  const quote = (v: string) => (/[:#]|^\s|\s$/.test(v) ? JSON.stringify(v) : v);
  const lines = [`name: ${quote(params.name)}`, `description: ${quote(params.description)}`];
  for (const [key, value] of Object.entries(params.extras ?? {})) {
    if (key === "name" || key === "description") continue;
    lines.push(`${key}: ${quote(value)}`);
  }
  const body = params.body.trim();
  return `---\n${lines.join("\n")}\n---\n\n${body}${body ? "\n" : ""}`;
}

// ────────────────────────────────────────────────────── the [skills] ignore list, in config.toml
//
// TOOL-006 wants the inactive state "written to configuration, not held in memory". This is that
// configuration, and it is grok's own — so turning a skill off here turns it off in the terminal
// too, and survives a restart because it was never in memory to begin with.

/**
 * Read `[skills] ignore` out of a config.toml.
 *
 * A targeted reader rather than a TOML parser, for the same reason as the frontmatter one: no
 * dependency may be added. It understands the one key it writes, in both the inline and the
 * multi-line array form, and treats anything it cannot read as an empty list — which fails toward
 * "the skill is active", the state that is visible and correctable, rather than toward a skill
 * silently missing from every agent.
 */
export function parseIgnoreList(toml: string): string[] {
  const section = /^\s*\[skills\]\s*$/m.exec(toml);
  if (!section) return [];
  const rest = toml.slice(section.index + section[0].length);
  // Stop at the next section header so a later `[plugins] ignore` is never read as ours.
  const end = /^\s*\[[^\]]+\]\s*$/m.exec(rest);
  const body = end ? rest.slice(0, end.index) : rest;
  const key = /^\s*ignore\s*=\s*(\[[\s\S]*?\])/m.exec(body);
  if (!key) return [];
  return [...key[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
}

/**
 * Return `toml` with `[skills] ignore` set to `paths`, leaving every other byte alone.
 *
 * Rewriting the whole file from a parsed model would be simpler and would silently discard every
 * comment, every unknown key and every bit of formatting in a config the user owns and edits by
 * hand. This is their file; we are a guest in it. An empty list removes the key rather than
 * writing `ignore = []`, so turning the last skill back on leaves no trace we were ever here.
 */
export function writeIgnoreList(toml: string, paths: string[]): string {
  const rendered = `ignore = [${paths.map((p) => JSON.stringify(p)).join(", ")}]`;
  const section = /^\s*\[skills\]\s*$/m.exec(toml);

  if (!section) {
    if (!paths.length) return toml;
    const prefix = toml.length && !toml.endsWith("\n") ? "\n" : "";
    return `${toml}${prefix}\n[skills]\n${rendered}\n`;
  }

  const headEnd = section.index + section[0].length;
  const rest = toml.slice(headEnd);
  const next = /^\s*\[[^\]]+\]\s*$/m.exec(rest);
  const body = next ? rest.slice(0, next.index) : rest;
  const tail = next ? rest.slice(next.index) : "";
  const existing = /^[ \t]*ignore\s*=\s*\[[\s\S]*?\][ \t]*\r?\n?/m.exec(body);

  if (existing) {
    const replaced = paths.length ? `${rendered}\n` : "";
    return toml.slice(0, headEnd) + body.slice(0, existing.index) + replaced + body.slice(existing.index + existing[0].length) + tail;
  }
  if (!paths.length) return toml;
  return `${toml.slice(0, headEnd)}\n${rendered}${body.startsWith("\n") ? "" : "\n"}${body}${tail}`;
}

/** `~/x` rather than `/Users/someone/x` — the form the probe proved grok expands. */
function tildeise(absolute: string, home: string): string {
  return absolute === home || absolute.startsWith(home + "/") ? `~${absolute.slice(home.length)}` : absolute;
}

function expandTilde(path: string, home: string): string {
  return path === "~" || path.startsWith("~/") ? join(home, path.slice(1)) : path;
}

export interface SkillRoot {
  dir: string;
  scope: SkillScope;
  editable: boolean;
}

/**
 * A filesystem editor over grok's skill roots.
 *
 * Every path it touches is one grok already reads, which is the whole point: a skill created here
 * is a skill the terminal runs, and a skill the user wrote in the terminal appears here with no
 * import step. See the A-00 note at the top of this section.
 */
export class GrokSkillStore {
  private readonly home: string;
  private readonly grokHome: string;
  private readonly projectRoot?: string;

  /**
   * `home` defaults to the parent of `grokHome` rather than to `homedir()`.
   *
   * In production the two are the same thing — grokHome is `<home>/.grok` — but a test that points
   * grokHome at a temp directory means to be sealed inside it, and a home that stayed at the real
   * `homedir()` would have `~/.claude/skills` scanned and the developer's own skills appear in the
   * assertions. Deriving it keeps the roots consistent with each other under any override.
   */
  constructor(opts: { home?: string; grokHome?: string; projectRoot?: string } = {}) {
    this.grokHome = opts.grokHome ?? join(opts.home ?? homedir(), ".grok");
    this.home = opts.home ?? (opts.grokHome ? dirname(opts.grokHome) : homedir());
    this.projectRoot = opts.projectRoot;
  }

  get configPath(): string {
    return join(this.grokHome, "config.toml");
  }

  /**
   * The roots, in grok's documented priority order (`~/.grok/README.md:1580-1591`).
   *
   * `~/.claude/skills/` is included because grok reads it (`README.md:2328`) — a user with Claude
   * Code skills sees them here for free, which is a large part of what makes reusing the format
   * worth it. It is listed read-only: those files belong to another tool, and this panel is not
   * the place to discover that an edit here changed something there.
   */
  roots(): SkillRoot[] {
    const roots: SkillRoot[] = [];
    if (this.projectRoot) {
      roots.push({ dir: join(this.projectRoot, ".grok", "skills"), scope: "project", editable: true });
    }
    roots.push({ dir: join(this.grokHome, "skills"), scope: "user", editable: true });
    roots.push({ dir: join(this.home, ".claude", "skills"), scope: "claude", editable: false });
    roots.push({ dir: join(this.grokHome, "bundled", "skills"), scope: "bundled", editable: false });
    return roots;
  }

  /** The root a newly created skill lands in. Project when there is one, else the user's. */
  private writableRoot(scope?: SkillScope): SkillRoot {
    const roots = this.roots().filter((r) => r.editable);
    const chosen = scope ? roots.find((r) => r.scope === scope) : roots[0];
    if (!chosen) throw new Error(`Skills cannot be written to the "${scope}" location`);
    return chosen;
  }

  private ignored(): Set<string> {
    if (!existsSync(this.configPath)) return new Set();
    try {
      return new Set(
        parseIgnoreList(readFileSync(this.configPath, "utf8")).map((p) => expandTilde(p, this.home)),
      );
    } catch {
      return new Set();
    }
  }

  /**
   * Every skill on disk, higher-priority roots winning a name collision — the same dedup rule grok
   * applies (`README.md:1589`), so the panel shows the skill that is actually in force rather than
   * two rows the user has no way to tell apart.
   */
  list(): GrokSkill[] {
    const ignored = this.ignored();
    const seen = new Map<string, GrokSkill>();
    for (const root of this.roots()) {
      if (!existsSync(root.dir)) continue;
      let entries: string[];
      try {
        entries = readdirSync(root.dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const dir = join(root.dir, entry);
        if (seen.has(entry)) continue;
        if (!existsSync(join(dir, SKILL_FILE))) continue;
        const skill = this.read(dir, entry, root, ignored);
        if (skill) seen.set(entry, skill);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private read(dir: string, entry: string, root: SkillRoot, ignored: Set<string>): GrokSkill | null {
    let source: string;
    try {
      source = readFileSync(join(dir, SKILL_FILE), "utf8");
    } catch {
      return null;
    }
    const { frontmatter, body } = parseSkillMarkdown(source);
    const { name: _n, description: _d, ...extras } = frontmatter;
    return {
      id: `${root.scope}:${entry}`,
      // The directory name is the identity grok invokes by; frontmatter that disagrees with it is
      // the file's problem, not ours, so the directory wins and the panel shows what will run.
      name: entry,
      description: frontmatter.description ?? "",
      body,
      extras,
      dir,
      scope: root.scope,
      state: ignored.has(dir) ? "inactive" : "active",
      resources: this.resourcesOf(dir),
      editable: root.editable,
    };
  }

  /** Sibling files, one level deep, so `pdf/` reads as its six files and not its 60 PDFs. */
  private resourcesOf(dir: string): SkillResource[] {
    const out: SkillResource[] = [];
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (entry.name === SKILL_FILE) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        let count = 0;
        try {
          count = readdirSync(full).length;
        } catch {
          count = 0;
        }
        out.push({ path: `${entry.name}/`, bytes: count });
        continue;
      }
      let bytes = 0;
      try {
        bytes = statSync(full).size;
      } catch {
        bytes = 0;
      }
      out.push({ path: entry.name, bytes });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  get(id: string): GrokSkill {
    const found = this.list().find((s) => s.id === id);
    if (!found) throw new Error(`Skill not found: ${id}`);
    return found;
  }

  create(params: { name: string; description: string; body?: string; scope?: SkillScope; extras?: Record<string, string> }): GrokSkill {
    const name = slugifySkillName(params.name ?? "");
    const description = (params.description ?? "").trim();
    if (!description) throw new Error("A skill needs a description — it is how the agent finds it");
    if (!describesWhenToUse(description)) {
      throw new Error(
        "The description must say WHEN to use this skill, not only what it is — that sentence is what the agent matches a task against",
      );
    }
    const root = this.writableRoot(params.scope);
    const dir = join(root.dir, name);
    if (existsSync(join(dir, SKILL_FILE))) throw new Error(`A skill called "${name}" already exists`);

    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, SKILL_FILE),
      serializeSkillMarkdown({ name, description, body: params.body ?? "", extras: params.extras }),
    );
    return this.get(`${root.scope}:${name}`);
  }

  update(id: string, patch: { description?: string; body?: string; extras?: Record<string, string> }): GrokSkill {
    const skill = this.get(id);
    if (!skill.editable) throw new Error(`"${skill.name}" ships with grok and cannot be edited here`);

    const description = (patch.description ?? skill.description).trim();
    if (!description) throw new Error("A skill needs a description — it is how the agent finds it");
    if (!describesWhenToUse(description)) {
      throw new Error(
        "The description must say WHEN to use this skill, not only what it is — that sentence is what the agent matches a task against",
      );
    }
    writeFileSync(
      join(skill.dir, SKILL_FILE),
      serializeSkillMarkdown({
        name: skill.name,
        description,
        body: patch.body ?? skill.body,
        extras: patch.extras ?? skill.extras,
      }),
    );
    return this.get(id);
  }

  remove(id: string): void {
    const skill = this.get(id);
    if (!skill.editable) throw new Error(`"${skill.name}" ships with grok and cannot be deleted here`);
    rmSync(skill.dir, { recursive: true, force: true });
    // Leaving a deleted skill's path in `ignore` would resurrect its off-state onto the next skill
    // that happens to reuse the name.
    this.setIgnored(skill.dir, false);
  }

  /**
   * Turn a skill up or down (TOOL-006).
   *
   * `inactive` means the directory stays exactly where it is and grok is told to skip it, so the
   * skill remains listed and editable in this panel while reaching no agent. Moving or renaming the
   * directory would have been the other option and is worse: it breaks every path the user has
   * written down, and it makes the off-state invisible from the terminal.
   */
  setState(id: string, state: SkillState): GrokSkill {
    const skill = this.get(id);
    this.setIgnored(skill.dir, state === "inactive");
    return this.get(id);
  }

  private setIgnored(dir: string, ignored: boolean): void {
    const existing = existsSync(this.configPath) ? readFileSync(this.configPath, "utf8") : "";
    const current = parseIgnoreList(existing).map((p) => expandTilde(p, this.home));
    const next = current.filter((p) => p !== dir);
    if (ignored) next.push(dir);
    if (next.length === current.length && !ignored) return;

    mkdirSync(this.grokHome, { recursive: true });
    const updated = writeIgnoreList(existing, next.map((p) => tildeise(p, this.home)));
    const tmp = `${this.configPath}.tmp`;
    writeFileSync(tmp, updated);
    renameSync(tmp, this.configPath);
  }

  /** Add or replace one of the directory's other markdown files (TOOL-004's second clause). */
  writeResource(id: string, relativePath: string, content: string): GrokSkill {
    const skill = this.get(id);
    if (!skill.editable) throw new Error(`"${skill.name}" ships with grok and cannot be edited here`);
    const target = this.resolveInside(skill, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    return this.get(id);
  }

  readResource(id: string, relativePath: string): string {
    return readFileSync(this.resolveInside(this.get(id), relativePath), "utf8");
  }

  deleteResource(id: string, relativePath: string): GrokSkill {
    const skill = this.get(id);
    if (!skill.editable) throw new Error(`"${skill.name}" ships with grok and cannot be edited here`);
    rmSync(this.resolveInside(skill, relativePath), { recursive: true, force: true });
    return this.get(id);
  }

  /**
   * Resolve a caller-supplied relative path against the skill directory, refusing to leave it.
   *
   * The panel never sends a path the user typed, but this is an HTTP surface and `../../.ssh/id_rsa`
   * is one request away. Checked with resolve() rather than by looking for ".." so that a symlinked
   * or oddly-encoded path cannot pass a string test and still escape.
   */
  private resolveInside(skill: GrokSkill, relativePath: string): string {
    if (relativePath === SKILL_FILE) throw new Error("Edit the skill itself rather than its SKILL.md");
    const target = resolve(skill.dir, relativePath);
    const base = resolve(skill.dir);
    if (target !== base && !target.startsWith(base + sep)) {
      throw new Error("That path is outside the skill's own directory");
    }
    return target;
  }
}

let skillStore: GrokSkillStore | null = null;
let skillStoreKey: string | null = null;

/**
 * Rebuilt when the project root changes, so project-scoped skills follow the open project.
 *
 * The grok home is part of the cache key and not only the project root, or a test that points
 * `OPENUI_GROK_HOME` at a fresh temp directory would keep the store built for the previous one and
 * read another test's skills. `getPromptLibrary` above keys on its directory for the same reason.
 */
export function getGrokSkillStore(projectRoot?: string): GrokSkillStore {
  const grokHome = process.env.OPENUI_GROK_HOME;
  // The separator is written as the escape `\0` and not as a literal NUL byte. As a raw byte it
  // made this file read as binary: `grep` reports nothing at all for a term that is on 137 lines
  // of it, and `file` calls it data. A cache key that costs everyone their search is too
  // expensive for what it buys.
  const key = `${grokHome ?? ""}\0${projectRoot ?? ""}`;
  if (!skillStore || skillStoreKey !== key) {
    skillStore = new GrokSkillStore({ grokHome, projectRoot });
    skillStoreKey = key;
  }
  return skillStore;
}

// ══════════════════════════════════════════ injection into a live agent (§4.5, TOOL-011)
//
// The division of labour is forced by the partition: **this loop resolves, `01-agents` delivers.**
// Nothing here opens a session, writes into a work area, or spawns anything. It turns a resource id
// into a payload and stops. `01-agents` owns the boundary a mount has to cross, so this hands it
// descriptors and lets it do the writing.

export type InjectionKind = "prompt" | "skill" | "workflow";

export interface InjectionRequest {
  kind: InjectionKind;
  resourceId: string;
  /** Prompt variables only. Ignored for the other two kinds. */
  values?: Record<string, string>;
  projectId: string;
  agentId: string;
  /**
   * Paste a skill's body into the open session as well as mounting it. Default true.
   *
   * False is the honest mount-only path: the agent gets the skill from the next session and the
   * panel must say so. See `effective`.
   */
  oneShot?: boolean;
}

/** A file `01-agents` writes through its own boundary. Never written here. */
export interface SkillMount {
  /** Relative to the agent's work area, e.g. ".grok/skills/deck-conventions/SKILL.md". */
  relativePath: string;
  contents: string;
}

export interface InjectionPayload {
  kind: InjectionKind;
  resourceId: string;
  resourceName: string;
  resourceVersion: string;
  /** Delivered into the live session by `01-agents`. Null for a mount-only skill. */
  text: string | null;
  mounts: SkillMount[];
  effective: "this_turn" | "next_session";
  estimatedInputTokens: number;
  /**
   * The sentence the panel shows the user, additive to §4.5's shape.
   *
   * `effective` is the machine's answer and this is the human's, and they are generated together so
   * they cannot disagree. The failure it exists to stop is a panel that says "skill enabled" and
   * shows no difference for an hour — the UI never claims an effect that has not happened.
   */
  effectNote: string;
  provenance: { libraryVersion: string; at: string };
}

/** djb2. Enough to tell two versions of a body apart; not a security boundary. */
function contentVersion(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/** ~4 characters per token. An estimate, and labelled as one wherever it is shown. */
function estimateTokens(text: string | null): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

/**
 * Turn a resource id into something an agent can be handed. Pure: no session I/O, never spawns.
 *
 * A prompt is text delivered into an open session, so it lands on the next turn. A skill is a
 * directory `grok` discovers at session setup, so a mount alone cannot take effect until the next
 * session — which is why the default also pastes the body once. Both are defensible; saying the
 * wrong one is not.
 */
export function resolveInjection(
  req: InjectionRequest,
  deps: { library?: PromptLibrary; skills?: GrokSkillStore } = {},
): InjectionPayload {
  const library = deps.library ?? getPromptLibrary();
  const at = new Date().toISOString();

  if (req.kind === "prompt") {
    const prompt = library.getPrompt(req.resourceId);
    const text = renderPrompt(prompt, req.values ?? {});
    return {
      kind: "prompt",
      resourceId: prompt.id,
      resourceName: prompt.name,
      resourceVersion: contentVersion(prompt.body),
      text,
      mounts: [],
      effective: "this_turn",
      estimatedInputTokens: estimateTokens(text),
      effectNote: "Sent to the agent. It arrives on its next turn.",
      provenance: { libraryVersion: prompt.createdAt, at },
    };
  }

  if (req.kind === "skill") {
    const skill = (deps.skills ?? getGrokSkillStore()).get(req.resourceId);
    const file = serializeSkillMarkdown({
      name: skill.name,
      description: skill.description,
      body: skill.body,
      extras: skill.extras,
    });
    const base = `.grok/skills/${skill.name}`;
    const mounts: SkillMount[] = [{ relativePath: `${base}/SKILL.md`, contents: file }];

    const oneShot = req.oneShot !== false;
    const text = oneShot
      ? `# Skill: ${skill.name}\n\n${skill.description}\n\n${skill.body.trim()}`
      : null;

    return {
      kind: "skill",
      resourceId: skill.id,
      resourceName: skill.name,
      resourceVersion: contentVersion(file),
      text,
      mounts,
      // Mounting alone cannot reach a session that has already discovered its skills.
      effective: oneShot ? "this_turn" : "next_session",
      estimatedInputTokens: estimateTokens(text),
      effectNote: oneShot
        ? "Sent to the agent now, and saved so its next session discovers it on its own."
        : "Saved to the project. This agent picks it up when it next starts — not on this turn.",
      provenance: { libraryVersion: skill.dir, at },
    };
  }

  const workflow = library.getWorkflow(req.resourceId);
  const text = [
    `# Workflow: ${workflow.name}`,
    workflow.description ? `\n${workflow.description}` : "",
    "\nWork through these stages in order, respecting the dependencies:",
    ...workflow.stages.map((stage, i) => {
      const deps = stage.dependsOn
        .map((id) => workflow.stages.find((s) => s.id === id)?.name)
        .filter(Boolean);
      const after = deps.length ? ` (after ${deps.join(", ")})` : "";
      const gate = stage.reviewGate ? " — stop for review before continuing" : "";
      return `${i + 1}. ${stage.name} — ${stage.role}${after}${gate}`;
    }),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    kind: "workflow",
    resourceId: workflow.id,
    resourceName: workflow.name,
    resourceVersion: contentVersion(JSON.stringify(workflow.stages)),
    text,
    mounts: [],
    effective: "this_turn",
    estimatedInputTokens: estimateTokens(text),
    effectNote: "Sent to the agent. It arrives on its next turn.",
    provenance: { libraryVersion: workflow.createdAt, at },
  };
}
