import { useCallback, useEffect, useRef, useState } from "react";
import type { CodingAgent } from "./types";
import type { DesignDocumentView, Requirement } from "./projectTypes";
import type { DesignSuggestionView, SubmissionView } from "./ReviewQueues";
import type { MessageView } from "./ConversationView";
import type { TranscriptEntryView, LiveSessionStateView } from "./SessionDrawer";

export interface ProjectSummary {
  id: string;
  name: string;
  goal: string;
  repositoryPath: string;
  budgetUsd?: number;
}

export interface ProgressView {
  percent: number;
  completed: number;
  total: number;
}

export interface ControlRoomState {
  projects: ProjectSummary[];
  projectId: string | null;
  project: ProjectSummary | null;
  document: DesignDocumentView | null;
  requirements: Requirement[];
  agents: CodingAgent[];
  suggestions: DesignSuggestionView[];
  submissions: SubmissionView[];
  messages: MessageView[];
  progress: ProgressView | null;
  costUsd: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: ControlRoomState = {
  projects: [], projectId: null, project: null, document: null, requirements: [],
  agents: [], suggestions: [], submissions: [], messages: [], progress: null,
  costUsd: 0, loading: true, error: null,
};

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
 * Loads and keeps the control room in sync.
 *
 * Reads go through the REST API; live changes arrive on the control-room WebSocket, so the view
 * updates without polling or a refresh (V-019). The socket carries deltas, and anything that
 * changes a collection triggers a targeted refetch rather than a full reload.
 */
export function useControlRoom() {
  const [state, setState] = useState<ControlRoomState>(EMPTY);
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntryView[]>([]);
  const [sessionState, setSessionState] = useState<LiveSessionStateView>("stopped");
  const socketRef = useRef<WebSocket | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const projects = await json<ProjectSummary[]>("/api/projects");
      setState((s) => ({ ...s, projects, projectId: s.projectId ?? projects[0]?.id ?? null, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    try {
      const [full, doc, agents, progress, costs] = await Promise.all([
        json<any>(`/api/projects/${id}`),
        json<DesignDocumentView>(`/api/projects/${id}/document`),
        json<CodingAgent[]>(`/api/coding-agents?projectId=${id}`),
        json<ProgressView>(`/api/projects/${id}/progress`),
        json<any>(`/api/coding-agents/costs/${id}`).catch(() => ({ projectCostUsd: 0 })),
      ]);
      setState((s) => ({
        ...s,
        projectId: id,
        project: { id: full.id, name: full.name, goal: full.goal, repositoryPath: full.repositoryPath, budgetUsd: full.budgetUsd },
        document: doc,
        requirements: full.requirements ?? [],
        suggestions: full.suggestions ?? [],
        submissions: full.submissions ?? [],
        messages: full.messages ?? [],
        agents,
        progress,
        costUsd: costs.projectCostUsd ?? 0,
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { if (state.projectId) void loadProject(state.projectId); }, [state.projectId, loadProject]);

  // Live updates. Reconnects if the socket drops so the view does not silently go stale.
  useEffect(() => {
    if (!state.projectId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws/control-room?projectId=${state.projectId}`);
      socketRef.current = ws;

      ws.onmessage = (raw) => {
        let published: any;
        try { published = JSON.parse(raw.data); } catch { return; }
        const e = published.event;
        if (!e) return;

        if (e.type === "transcript") {
          // Only the drawer's agent, and never duplicate a sequence already shown.
          setTranscript((prev) =>
            e.agentId === drawerAgentId && !prev.some((t) => t.seq === e.entry.seq) ? [...prev, e.entry] : prev,
          );
        } else if (e.type === "session_state" && e.agentId === drawerAgentId) {
          setSessionState(e.state);
        } else if (e.type === "progress") {
          setState((s) => ({ ...s, progress: { percent: e.percent, completed: e.completed, total: e.total } }));
        } else if (e.type === "cost") {
          setState((s) => ({ ...s, costUsd: e.projectCostUsd }));
        } else if (e.type === "agent_status" || e.type === "agent_activity") {
          if (state.projectId) void loadProject(state.projectId);
        } else if (e.type === "requirement_status" || e.type === "task_status") {
          if (state.projectId) void loadProject(state.projectId);
        }
      };

      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [state.projectId, drawerAgentId, loadProject]);

  const openDrawer = useCallback(async (agentId: string) => {
    setDrawerAgentId(agentId);
    setTranscript([]);
    setSessionState("starting");
    try {
      const session = await json<any>(`/api/coding-agents/${agentId}/session`, { method: "POST", body: "{}" });
      setSessionState(session.state);
      setTranscript(session.transcript ?? []);
    } catch (err) {
      setSessionState("failed");
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const sessionAction = useCallback(async (agentId: string, action: "pause" | "resume" | "stop") => {
    try {
      const session = await json<any>(`/api/coding-agents/${agentId}/session/${action}`, { method: "POST" });
      setSessionState(session.state);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const sendMessage = useCallback(async (agentId: string, text: string) => {
    setSessionState("working");
    try {
      await json(`/api/coding-agents/${agentId}/session/message`, { method: "POST", body: JSON.stringify({ text }) });
      setSessionState("ready");
    } catch (err) {
      setSessionState("failed");
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  /** Persist a dragged agent position so canvas layout survives a restart (V-021). */
  const moveAgent = useCallback(async (agentId: string, position: { x: number; y: number }) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, position } : a)),
    }));
    try {
      await json(`/api/coding-agents/${agentId}/position`, { method: "PATCH", body: JSON.stringify(position) });
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const refresh = useCallback(() => {
    if (state.projectId) void loadProject(state.projectId);
  }, [state.projectId, loadProject]);

  return {
    ...state,
    drawerAgentId,
    transcript,
    sessionState,
    selectProject: (id: string) => setState((s) => ({ ...s, projectId: id, loading: true })),
    openDrawer,
    moveAgent,
    closeDrawer: () => setDrawerAgentId(null),
    sessionAction,
    sendMessage,
    refresh,
    saveDocument: async (content: string) => {
      if (!state.projectId) return 0;
      const res = await json<{ version: number }>(`/api/projects/${state.projectId}/document`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      refresh();
      return res.version;
    },
    resolveSuggestion: async (id: string, action: "accept" | "reject" | "request_revision") => {
      if (!state.projectId) return;
      await json(`/api/projects/${state.projectId}/suggestions/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ action, note: action === "request_revision" ? "Please revise" : undefined }),
      });
      refresh();
    },
    reviewSubmission: async (id: string, action: "approve" | "request-changes", feedback?: string) => {
      if (!state.projectId) return;
      await json(`/api/projects/${state.projectId}/submissions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "request-changes" ? { feedback } : { note: "Approved" }),
      });
      refresh();
    },
  };
}
