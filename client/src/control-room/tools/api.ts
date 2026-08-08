/**
 * The client for `/api/library` — loops/06-tools-and-cost.md §6.
 *
 * `grep -rn "api/library" client/src` returned nothing before this file existed. The backend has
 * been complete and unreachable: nine endpoints, a render engine that refuses to emit a hole, and
 * no caller anywhere. This module is its first user, which is why the panel is a front-end build
 * against an API that already works rather than a feature that needs a backend.
 *
 * Errors are surfaced, never swallowed. The server answers a failed render with a 400 naming the
 * missing variables and a corrupt library with a 500; a client that returned `[]` for both would
 * turn the one distinction those status codes exist to draw back into a blank panel.
 */

export interface PromptVariable {
  name: string;
  description?: string;
  required: boolean;
  default?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  variables: PromptVariable[];
  createdAt: string;
}

export type SkillScope = "project" | "user" | "claude" | "bundled";
export type SkillState = "active" | "inactive";

export interface SkillResource {
  path: string;
  bytes: number;
}

/** A skill as it exists on disk, in grok's own format. See the A-00 note in the handoff. */
export interface GrokSkill {
  id: string;
  name: string;
  /** The discovery prompt: what it does AND when to use it. This is what the agent matches on. */
  description: string;
  body: string;
  extras: Record<string, string>;
  dir: string;
  scope: SkillScope;
  state: SkillState;
  resources: SkillResource[];
  editable: boolean;
}

export interface WorkflowStage {
  id: string;
  name: string;
  role: string;
  dependsOn: string[];
  reviewGate: boolean;
}

export interface ProjectWorkflow {
  id: string;
  name: string;
  description?: string;
  roles: string[];
  stages: WorkflowStage[];
  createdAt: string;
}

export interface InjectionPayload {
  kind: "prompt" | "skill" | "workflow";
  resourceId: string;
  resourceName: string;
  resourceVersion: string;
  text: string | null;
  mounts: Array<{ relativePath: string; contents: string }>;
  effective: "this_turn" | "next_session";
  estimatedInputTokens: number;
  effectNote: string;
  provenance: { libraryVersion: string; at: string };
}

/** An agent the panel can inject into. Read over HTTP; `agents/**` is never imported. */
export interface InjectableAgent {
  id: string;
  name: string;
  status?: string;
}

/**
 * A server error carrying what the server actually said.
 *
 * `missing` is the reason this is a class and not a string: an unresolved-variable 400 names the
 * variables, and the prompt form highlights exactly those fields rather than showing one banner
 * that leaves the user hunting.
 */
export class LibraryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly missing?: string[],
  ) {
    super(message);
    this.name = "LibraryError";
  }
}

const BASE = "/api/library";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // A dead server and a rejected request are different problems and the panel says which.
    throw new LibraryError("The workspace server is not responding.", 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new LibraryError(
      parsed?.error ?? `The server returned ${res.status}.`,
      res.status,
      parsed?.code,
      parsed?.missing,
    );
  }
  return parsed as T;
}

// ─────────────────────────────────────────────────────────────────────────────── prompts

export const listPrompts = () => call<PromptTemplate[]>("GET", "/prompts");

export const createPrompt = (input: { name: string; body: string; variables?: PromptVariable[] }) =>
  call<PromptTemplate>("POST", "/prompts", input);

export const updatePrompt = (
  id: string,
  patch: { name?: string; body?: string; variables?: PromptVariable[] },
) => call<PromptTemplate>("PATCH", `/prompts/${encodeURIComponent(id)}`, patch);

export const deletePrompt = (id: string) => call<void>("DELETE", `/prompts/${encodeURIComponent(id)}`);

/**
 * Render on the server, not in the browser.
 *
 * The rule that a required variable with no value is an error rather than a silent hole lives in
 * `renderPrompt`, and a second implementation here would be a second place for it to be wrong.
 */
export const renderPrompt = (id: string, values: Record<string, string>) =>
  call<{ rendered: string }>("POST", `/prompts/${encodeURIComponent(id)}/render`, { values });

// ──────────────────────────────────────────────────────────────────────────────── skills

export const listSkills = () => call<GrokSkill[]>("GET", "/grok-skills");

export const createSkill = (input: {
  name: string;
  description: string;
  body?: string;
  scope?: SkillScope;
}) => call<GrokSkill>("POST", "/grok-skills", input);

export const updateSkill = (
  id: string,
  patch: { description?: string; body?: string; state?: SkillState },
) => call<GrokSkill>("PATCH", `/grok-skills/${encodeURIComponent(id)}`, patch);

export const deleteSkill = (id: string) => call<void>("DELETE", `/grok-skills/${encodeURIComponent(id)}`);

/**
 * The other files in a skill's directory.
 *
 * §10's definition is "a preprocessed **directory** of markdown files fronted by a discovery
 * prompt" — the plural is the point, and `~/.grok/bundled/skills/pdf/` ships as six files plus two
 * subdirectories. A panel that could only edit SKILL.md would be editing one file and calling it a
 * directory.
 */
export const readSkillResource = (id: string, path: string) =>
  call<{ content: string }>("GET", `/grok-skills/${encodeURIComponent(id)}/resources/${path}`);

export const writeSkillResource = (id: string, path: string, content: string) =>
  call<GrokSkill>("PUT", `/grok-skills/${encodeURIComponent(id)}/resources/${path}`, { content });

export const deleteSkillResource = (id: string, path: string) =>
  call<GrokSkill>("DELETE", `/grok-skills/${encodeURIComponent(id)}/resources/${path}`);

// ───────────────────────────────────────────────────────────────────────────── workflows

export const listWorkflows = () => call<ProjectWorkflow[]>("GET", "/workflows");

export const createWorkflow = (input: {
  name: string;
  description?: string;
  stages: Array<{ name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
}) => call<ProjectWorkflow>("POST", "/workflows", input);

export const updateWorkflow = (
  id: string,
  patch: {
    name?: string;
    description?: string;
    stages?: Array<{ id?: string; name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
  },
) => call<ProjectWorkflow>("PATCH", `/workflows/${encodeURIComponent(id)}`, patch);

export const deleteWorkflow = (id: string) =>
  call<void>("DELETE", `/workflows/${encodeURIComponent(id)}`);

// ────────────────────────────────────────────────────────────────────────────── injection

export const resolveInjection = (input: {
  kind: "prompt" | "skill" | "workflow";
  resourceId: string;
  values?: Record<string, string>;
  projectId: string;
  agentId: string;
  oneShot?: boolean;
}) => call<InjectionPayload>("POST", "/injections/resolve", input);

/**
 * The agents this panel could inject into.
 *
 * Read straight from `/api/coding-agents`, which `01-agents` owns the server half of. That is an
 * HTTP read and not a component import, so §4.6's boundary holds: no module under `agents/**` is
 * referenced, and this returning nothing degrades to "open the panel from an agent" rather than
 * to a build error.
 */
export async function listInjectableAgents(projectId: string): Promise<InjectableAgent[]> {
  try {
    const res = await fetch(`/api/coding-agents?projectId=${encodeURIComponent(projectId)}`);
    if (!res.ok) return [];
    const agents = await res.json();
    return Array.isArray(agents)
      ? agents.map((a: any) => ({ id: a.id, name: a.name ?? a.id, status: a.status }))
      : [];
  } catch {
    return [];
  }
}
