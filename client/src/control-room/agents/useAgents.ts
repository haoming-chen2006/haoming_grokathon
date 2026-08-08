/**
 * The AGENTS page's data, and the four actions the loop is made of.
 *
 * Every call here goes to an endpoint that already works and was proven end to end before this file
 * existed — a real Planner turn, a real worktree, a real `grok` process, a real submission. What was
 * missing was a caller: the whole loop was reachable only by curl, which is not a product.
 *
 * Polling rather than the control-room socket, deliberately and temporarily. The socket carries the
 * events this page wants (`agent_status`, `agent_activity`, `task_status`, `cost`) and subscribing
 * to it is the right end state; a five-second poll is four lines, cannot silently miss an event
 * type, and is honest about being a placeholder. The socket work is filed rather than skipped.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AgentView {
  id: string;
  name: string;
  role: string;
  status: string;
  statusDetail?: string;
  currentTaskId?: string;
  branch?: string;
  worktree?: string;
  costUsd?: number;
  budgetUsd?: number;
  acpSessionId?: string;
}

export interface TaskView {
  id: string;
  objective: string;
  status: string;
  assignedAgentId?: string;
  requirementId?: string;
  dependsOn: string[];
  branch?: string;
}

export interface RequirementView {
  id: string;
  description: string;
  status: string;
}

export interface ProjectView {
  id: string;
  name: string;
  goal: string;
  repositoryPath: string;
  budgetUsd?: number;
  requirements: RequirementView[];
  tasks: TaskView[];
  plan?: { id: string; state: string };
  submissions: { id: string; state: string; branch?: string; agentId?: string }[];
}

export interface AgentsData {
  project?: ProjectView;
  agents: AgentView[];
  loading: boolean;
  error: string | null;
  /** True while a mutation is in flight, so a button can say what it is doing. */
  busy: string | null;
  refresh(): void;
  generatePlan(): Promise<void>;
  approvePlan(): Promise<void>;
  launch(taskId: string): Promise<void>;
  pause(agentId: string): Promise<void>;
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

export function useAgents(projectId: string): AgentsData {
  const [project, setProject] = useState<ProjectView | undefined>();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!projectId) {
      setProject(undefined);
      setAgents([]);
      setLoading(false);
      return;
    }
    try {
      const [full, list] = await Promise.all([
        json<ProjectView>(`/api/projects/${projectId}`),
        json<AgentView[]>(`/api/coding-agents?projectId=${encodeURIComponent(projectId)}`),
      ]);
      if (!live.current) return;
      // Checked, not asserted: a body that is not a list threw inside render twice already.
      setAgents(Array.isArray(list) ? list : []);
      setProject(full);
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
