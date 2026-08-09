/**
 * The AGENTS page's data, and the actions the loop is made of.
 *
 * Every call here goes to an endpoint that already works and was proven end to end before this
 * file existed — a real Planner turn, a real launch, a real `grok` process. What was missing was a
 * caller: the whole loop was reachable only by curl, which is not a product.
 *
 * Two of the five reads are VOCABULARY: `/statuses` and `/capabilities` publish the words the
 * server uses for a status and for a capability set. They are fetched rather than transcribed
 * because a word typed into a component is a second source of truth for text the server already
 * owns, and the two drift silently — the page then shows a status the API has stopped using.
 *
 * Polling rather than the control-room socket, deliberately and temporarily. The socket carries the
 * events this page wants (`agent_status`, `agent_activity`, `task_status`, `cost`) and subscribing
 * to it is the right end state; a five-second poll is four lines, cannot silently miss an event
 * type, and is honest about being a placeholder. The socket work is filed rather than skipped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentCapabilities,
  AgentView,
  AgentVocabulary,
  AreaView,
  ProjectView,
} from "./types";

export type {
  AgentCapabilities,
  AgentView,
  AgentVocabulary,
  AreaView,
  MilestoneView,
  ProjectView,
  TaskView,
} from "./types";

interface CapabilityPreset {
  id: string;
  label: string;
  capabilities: AgentCapabilities;
}

export interface AgentsData {
  project?: ProjectView;
  agents: AgentView[];
  areas: AreaView[];
  vocabulary: AgentVocabulary;
  loading: boolean;
  error: string | null;
  /** True while a mutation is in flight, so a button can say what it is doing. */
  busy: string | null;
  refresh(): void;
  generatePlan(): Promise<void>;
  approvePlan(): Promise<void>;
  launch(taskId: string): Promise<void>;
  pause(agentId: string): Promise<void>;
  addAgent(input: { name: string; role: string; capabilities?: { images: boolean; voice: boolean } }): Promise<void>;
  /** Move an agent into an area, or out of one with null. Drag and drop uses this. */
  moveAgent(agentId: string, areaId: string | null): Promise<void>;
  /**
   * Dismiss an agent for good: its process is stopped, its work session is deleted from grok's
   * history, and any task it held is released. Not reversible.
   */
  deleteAgent(agentId: string): Promise<void>;
  /** Add an area by hand, for a document that declared none. */
  addArea(name: string): Promise<void>;
  /** Create an agent and put it inside one area — the box-click flow. */
  addAgentToArea(input: {
    areaId: string;
    name: string;
    role: string;
    capabilities?: { images: boolean; voice: boolean };
  }): Promise<void>;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

/**
 * A list, or an empty one.
 *
 * `as T[]` on a network value threw inside render three times in one day and blanked the page —
 * an error body is an object, and an object has no `.map`. This is the only way a list enters
 * this module.
 */
function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** The two vocabularies, fetched once. They are static tables on the server, not per-project. */
function useVocabulary(): AgentVocabulary {
  const [statusLabels, setStatusLabels] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<CapabilityPreset[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [statuses, capabilities] = await Promise.all([
          json<{ presentation?: Record<string, { label?: string }> }>("/api/coding-agents/statuses"),
          json<{ presets?: unknown }>("/api/coding-agents/capabilities"),
        ]);
        if (!live) return;
        const presentation = statuses?.presentation ?? {};
        const labels: Record<string, string> = {};
        for (const [status, value] of Object.entries(presentation)) {
          if (value && typeof value.label === "string") labels[status] = value.label;
        }
        setStatusLabels(labels);
        setPresets(list<CapabilityPreset>(capabilities?.presets));
      } catch {
        // A vocabulary that will not load is not an error the user can act on: every component
        // falls back to the record's own status word, which is a value and not an invention.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return useMemo(
    () => ({
      statusLabel: (status: string) => statusLabels[status],
      capabilityLabel: (capabilities?: AgentCapabilities) => {
        if (!capabilities) return undefined;
        return presets.find(
          (p) =>
            p.capabilities?.images === capabilities.images &&
            p.capabilities?.voice === capabilities.voice,
        )?.label;
      },
    }),
    [statusLabels, presets],
  );
}

export function useAgents(projectId: string): AgentsData {
  const [project, setProject] = useState<ProjectView | undefined>();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [areas, setAreas] = useState<AreaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const vocabulary = useVocabulary();
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(undefined);
      setAgents([]);
      setAreas([]);
      setLoading(false);
      return;
    }
    const query = `projectId=${encodeURIComponent(projectId)}`;
    try {
      const [full, agentList, areaList] = await Promise.all([
        json<ProjectView>(`/api/projects/${projectId}`),
        json<unknown>(`/api/coding-agents?${query}`),
        json<unknown>(`/api/coding-agents/areas?${query}`),
      ]);
      if (!live.current) return;
      setAgents(list<AgentView>(agentList));
      setAreas(list<AreaView>(areaList));
      setProject(full && typeof full === "object" ? full : undefined);
      setError(null);
    } catch (err) {
      if (live.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (live.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    live.current = true;
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [load]);

  /** Every mutation reports its own failure. A silent refusal is how a dead button looks. */
  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      try {
        await fn();
        setError(null);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return {
    project,
    agents,
    areas,
    vocabulary,
    loading,
    error,
    busy,
    refresh: () => void load(),
    generatePlan: () =>
      run("Planning", () => json(`/api/projects/${projectId}/plan/generate`, { method: "POST", body: "{}" })),
    approvePlan: () =>
      run("Approving", () => json(`/api/projects/${projectId}/plan/approve`, { method: "POST", body: "{}" })),
    launch: (taskId: string) =>
      run(`Launching ${taskId}`, () =>
        json(`/api/projects/${projectId}/tasks/${taskId}/launch`, { method: "POST", body: "{}" }),
      ),
    pause: (agentId: string) =>
      run("Pausing", () =>
        json(`/api/coding-agents/${agentId}/session/pause`, { method: "POST", body: "{}" }),
      ),
    deleteAgent: (agentId: string) =>
      run("Dismissing", () => json(`/api/coding-agents/${agentId}`, { method: "DELETE" })),
    moveAgent: (agentId: string, areaId: string | null) =>
      run("Moving", () =>
        json(`/api/coding-agents/${agentId}/area`, {
          method: "PATCH",
          body: JSON.stringify({ areaId }),
        }),
      ),
    addArea: (name: string) =>
      run(`Adding ${name}`, () =>
        json("/api/coding-agents/areas", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            name,
            // A hand-made area has no line in the brief to anchor to, and saying so is better than
            // pointing at line 1 as though the document declared it there.
            briefSectionAnchor: "by hand",
            // Unique per area: the store refuses two areas sharing a milestone, because both would
            // claim the same tasks and show the same number under two names.
            milestoneId: `m-${Date.now().toString(36)}`,
            rootPath: project?.repositoryPath ?? ".",
          }),
        }),
      ),
    addAgentToArea: (input: {
      areaId: string;
      name: string;
      role: string;
      capabilities?: { images: boolean; voice: boolean };
    }) =>
      // Two calls, not one: the registry creates agents and `workArea` owns which area an agent is
      // in, and collapsing them into a create-with-area would give the boundary rule two homes. If
      // the assignment fails the agent still exists and is visible, unassigned — a half-made agent
      // you can see beats a silent rollback.
      run(`Starting ${input.name}`, async () => {
        const created = await json<{ id: string }>("/api/coding-agents", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            name: input.name,
            role: input.role,
            ...(input.capabilities ? { capabilities: input.capabilities } : {}),
          }),
        });
        await json(`/api/coding-agents/${created.id}/area`, {
          method: "PATCH",
          body: JSON.stringify({ areaId: input.areaId }),
        });
      }),
    addAgent: (input: { name: string; role: string; capabilities?: { images: boolean; voice: boolean } }) =>
      run("Adding", () =>
        json("/api/coding-agents", {
          method: "POST",
          // capabilities only when it grants something: the registry treats an absent capability
          // as base Grok, and sending {images:false,voice:false} would record a decision the user
          // did not make.
          body: JSON.stringify({
            projectId,
            name: input.name,
            role: input.role,
            ...(input.capabilities ? { capabilities: input.capabilities } : {}),
          }),
        }),
      ),
  };
}

/** Start a project from a pasted document: the product's front door, in two calls. */
export async function startProject(title: string, text: string): Promise<{ projectId: string }> {
  const doc = await json<{ id: string }>("/api/design-docs", {
    method: "POST",
    body: JSON.stringify({ title, text }),
  });
  return json<{ projectId: string }>(`/api/design-docs/${doc.id}/start`, {
    method: "POST",
    body: "{}",
  });
}

/**
 * A project with a name and no document yet.
 *
 * The document used to be the only way in, so "I know what I am building and have not written it up"
 * was a state the product refused to hold. The brief gets written on the Design Documents page,
 * where an agent can help write it.
 */
export async function startBlankProject(name: string): Promise<{ projectId: string }> {
  return json<{ projectId: string }>("/api/projects/blank", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** Save a document and attach it to a project that already exists. */
export async function saveDesignDoc(params: {
  projectId: string;
  title: string;
  text: string;
}): Promise<{ id: string; linkError?: string }> {
  return json<{ id: string; linkError?: string }>("/api/design-docs", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface DraftResult {
  text: string;
  /** The draft declares the project and its areas. See the server's `DraftResult`. */
  declares: boolean;
  errors: Array<{ line: number; message: string }>;
  costUsd: number | null;
  model: string;
}

/** Ask the X agent for a design document. Returns the draft; saving is a separate decision. */
export async function draftDesignDoc(params: {
  projectId: string;
  projectName: string;
  brief: string;
  existing?: string;
}): Promise<DraftResult> {
  return json<DraftResult>("/api/design-docs/draft", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
