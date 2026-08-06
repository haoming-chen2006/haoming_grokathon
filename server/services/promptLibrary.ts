import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
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
    } catch (err) {
      console.error(`\x1b[38;5;203m[library]\x1b[0m Failed to read ${this.path}:`, err);
    }
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

  // ---------------------------------------------------------------- prompts

  createPrompt(params: { name: string; body: string; variables?: PromptVariable[] }): PromptTemplate {
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

  // -------------------------------------------------------------- workflows

  createWorkflow(params: {
    name: string;
    description?: string;
    roles?: string[];
    stages: Array<{ id?: string; name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
  }): ProjectWorkflow {
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
export function getPromptLibrary(): PromptLibrary {
  if (!library) {
    library = new PromptLibrary(process.env.OPENUI_DATA_DIR || join(homedir(), ".openui"));
  }
  return library;
}
