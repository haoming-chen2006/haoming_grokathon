import { useCallback, useEffect, useRef, useState } from "react";
import type { CodingAgent } from "./types";
import type { DesignDocumentView, Requirement } from "./projectTypes";
import type { DesignSuggestionView, SubmissionView } from "./ReviewQueues";
import type { DiffFileView } from "./DiffView";
import type { MessageView } from "./ConversationView";
import type { TranscriptEntryView, LiveSessionStateView } from "./SessionDrawer";
import type { NewProjectInput } from "./NewProjectPanel";
import type { GrokStatusView } from "./SetupBanner";

export interface ProjectSummary {
  id: string;
  name: string;
  goal: string;
  repositoryPath: string;
  /** What an agent branch is diffed against; the repository endpoints need it. */
  baseBranch?: string;
  budgetUsd?: number;
}

/**
 * A submission carries the worktree its diff must be read from, which the review queue itself has
 * no use for — it asks for a diff by submission id and this hook resolves the git coordinates.
 */
type SubmissionSource = SubmissionView & { worktree?: string };

export interface ProgressView {
  percent: number;
  completed: number;
  total: number;
}

export interface BudgetAlert {
  severity: "warning" | "exceeded";
  scope: "agent" | "project";
  spent: number;
  limit: number;
}

/**
 * A session that stopped because Grok has no credentials.
 *
 * The server publishes `auth_required` with the guidance the user has to act on ("run grok and
 * sign in"). Without surfacing it the drawer shows a failed session and no reason, which reads as
 * a broken product rather than an unfinished sign-in.
 */
export interface AuthAlert {
  agentId: string;
  authMethods: string[];
  message: string;
}

export interface ProjectHealth {
  /** False when the project's repository has been moved or deleted. */
  repositoryExists: boolean;
  repositoryPath: string;
}

export interface PlanView {
  id: string;
  state: "draft" | "approved" | "revising";
  approvedBy?: string;
  milestones: Array<{ id: string; name: string }>;
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

export interface ControlRoomState {
  projects: ProjectSummary[];
  projectId: string | null;
  project: ProjectSummary | null;
  document: DesignDocumentView | null;
  requirements: Requirement[];
  agents: CodingAgent[];
  suggestions: DesignSuggestionView[];
  submissions: SubmissionSource[];
  messages: MessageView[];
  /** The implementation plan, absent until one is drafted. */
  plan: PlanView | null;
  tasks: TaskView[];
  health: ProjectHealth | null;
  progress: ProgressView | null;
  costUsd: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: ControlRoomState = {
  projects: [], projectId: null, project: null, document: null, requirements: [],
  agents: [], suggestions: [], submissions: [], messages: [], plan: null, tasks: [], health: null, progress: null,
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
 * Ask the user for a file, resolving null when they dismiss the dialog.
 *
 * Both listeners matter: without `cancel` the promise would never settle and the panel would sit
 * on "Saving…" forever after a dismissed dialog.
 */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
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

  /**
   * The latest budget alert pushed by the server.
   *
   * V-046 requires warnings to appear *before* the configured threshold. The server published
   * budget_warning and budget_exceeded on this channel and the shell ignored both, so the only
   * spending signal a user ever saw was the header turning red once the cap was already blown —
   * an after-the-fact indicator, not a warning.
   */
  const [budgetAlert, setBudgetAlert] = useState<BudgetAlert | null>(null);
  const [authAlert, setAuthAlert] = useState<AuthAlert | null>(null);
  const [grokStatus, setGrokStatus] = useState<GrokStatusView | null>(null);
  const [acpSessionId, setAcpSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * Why the created project has no team.
   *
   * It cannot live in `state.error`: the next project load clears that field, and this message
   * would vanish a few hundred milliseconds after it appeared — which is how a teamless project
   * (nothing to assign, NO_AGENT on every launch) used to reach the user as silence.
   */
  const [teamError, setTeamError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  /** Why the last plan's assignments may need a second look — see generatePlan. */
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

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
        project: {
          id: full.id, name: full.name, goal: full.goal, repositoryPath: full.repositoryPath,
          baseBranch: full.baseBranch, budgetUsd: full.budgetUsd,
        },
        document: doc,
        requirements: full.requirements ?? [],
        suggestions: full.suggestions ?? [],
        submissions: full.submissions ?? [],
        messages: full.messages ?? [],
        plan: full.plan ?? null,
        tasks: full.tasks ?? [],
        health: {
          repositoryExists: full.repositoryExists !== false,
          repositoryPath: full.repositoryPath ?? "",
        },
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

  /**
   * Whether Grok Build can be run at all (V-004).
   *
   * Asked once, before any work is attempted, so a missing binary is stated up front instead of
   * emerging as a failed "Generate plan" click. A failed request leaves the status null — "not
   * asked" — because claiming Grok is missing on the strength of a broken fetch would be a lie,
   * and the control room must still open.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await json<{
          installed?: boolean;
          version?: string | null;
          binaryPath?: string | null;
          error?: string | null;
          setupMessage?: string | null;
        }>("/api/grok/status");
        // The endpoint answers with nulls where the view declares optional strings; passing null
        // straight through would render "null" and defeat every `status.error &&` guard.
        if (!cancelled && typeof status?.installed === "boolean") {
          setGrokStatus({
            installed: status.installed,
            version: status.version ?? undefined,
            binaryPath: status.binaryPath ?? undefined,
            error: status.error ?? undefined,
            setupMessage: status.setupMessage ?? undefined,
          });
        }
      } catch {
        /* left null: the banner stays hidden rather than taking the room down with it */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Which agent's transcript the drawer is showing, as a ref rather than a dependency.
   *
   * Listing it in the socket effect's dependencies tore the connection down and rebuilt it every
   * time the drawer opened or closed, and the server replays recent events on connect — so a
   * budget alert the user had just dismissed came straight back. The handler still needs the
   * current id, which is what this carries.
   */
  const drawerAgentIdRef = useRef<string | null>(null);
  useEffect(() => { drawerAgentIdRef.current = drawerAgentId; }, [drawerAgentId]);

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
          // Only the drawer's agent. `seq` identifies an entry, and a streamed reply is republished
          // under the same seq as it grows — so a seq already shown is REPLACED, not skipped.
          // Skipping it (which this did) froze every reply at its first chunk.
          setTranscript((prev) => {
            if (e.agentId !== drawerAgentIdRef.current) return prev;
            const at = prev.findIndex((t) => t.seq === e.entry.seq);
            if (at < 0) return [...prev, e.entry];
            const next = prev.slice();
            next[at] = e.entry;
            return next;
          });
        } else if (e.type === "session_state" && e.agentId === drawerAgentIdRef.current) {
          setSessionState(e.state);
        } else if (e.type === "progress") {
          setState((s) => ({ ...s, progress: { percent: e.percent, completed: e.completed, total: e.total } }));
        } else if (e.type === "cost") {
          setState((s) => ({ ...s, costUsd: e.projectCostUsd }));
        } else if (e.type === "agent_status" || e.type === "agent_activity") {
          if (state.projectId) void loadProject(state.projectId);
        } else if (e.type === "requirement_status" || e.type === "task_status") {
          if (state.projectId) void loadProject(state.projectId);
        } else if (e.type === "budget_warning" || e.type === "budget_exceeded") {
          const severity = e.type === "budget_exceeded" ? "exceeded" : "warning";
          setBudgetAlert((prev) =>
            // A stop must not be downgraded by a later warning; that would hide that work halted.
            prev?.severity === "exceeded" && severity === "warning"
              ? prev
              : { severity, scope: e.scope, spent: e.spent, limit: e.limit },
          );
        } else if (e.type === "auth_required") {
          // The session has already stopped by the time this arrives; the message is the only
          // thing that tells the user how to get it running again.
          setAuthAlert({ agentId: e.agentId, authMethods: e.authMethods ?? [], message: e.message });
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
  }, [state.projectId, loadProject]);

  const openDrawer = useCallback(async (agentId: string) => {
    setDrawerAgentId(agentId);
    setTranscript([]);
    setAcpSessionId(null);
    setSessionState("starting");
    try {
      const session = await json<any>(`/api/coding-agents/${agentId}/session`, { method: "POST", body: "{}" });
      setSessionState(session.state);
      setTranscript(session.transcript ?? []);
      // The server returns the ACP session id; without keeping it the drawer cannot show which
      // session is open.
      setAcpSessionId(session.acpSessionId ?? null);
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

  /**
   * Pull the full conversation history, including messages moved to the archive.
   *
   * The project payload carries only the retained window, so on a busy project the oldest
   * exchanges are on disk but absent from the panel. This is how the user reaches them.
   */
  const loadMessageHistory = useCallback(async () => {
    if (!state.projectId) return;
    setHistoryLoading(true);
    try {
      const all = await json<any[]>(`/api/projects/${state.projectId}/messages?includeArchived=true`);
      setState((s) => ({ ...s, messages: all }));
      setHistoryLoaded(true);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setHistoryLoading(false);
    }
  }, [state.projectId]);

  /**
   * Pause every agent that is currently working (§11).
   *
   * The header's "Pause All" button existed and the shell never passed a handler, so it rendered
   * and did nothing — the operator's one global stop control was decorative.
   */
  const pauseAll = useCallback(async () => {
    const working = state.agents.filter((a) => a.status === "working");
    // Settled rather than all: one agent whose session has already exited must not prevent the
    // rest from being paused.
    await Promise.allSettled(
      working.map((a) => json(`/api/coding-agents/${a.id}/session/pause`, { method: "POST", body: "{}" })),
    );
    if (state.projectId) void loadProject(state.projectId);
  }, [state.agents, state.projectId, loadProject]);

  /**
   * Approve the implementation plan (V-018).
   *
   * Until this existed the only way to pass the gate was a curl command, which made the Control
   * Room something you watch rather than something you operate — and the approval is the one
   * decision the design insists a human makes.
   */
  const approvePlan = useCallback(async () => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/plan/approve`, { method: "POST", body: "{}" });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /** Launch the Grok session for a task. Refused by the server until the plan is approved. */
  const launchTask = useCallback(async (taskId: string) => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/tasks/${taskId}/launch`, { method: "POST", body: "{}" });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /**
   * Create a project and select it (§10 steps 1-2).
   *
   * The empty state used to print a curl command, so the first thing the Control Room asked of a
   * user was to leave it.
   */
  const createProject = useCallback(async (input: NewProjectInput): Promise<string | null> => {
    setCreating(true);
    setTeamError(null);
    try {
      const { requirements, ...projectInput } = input;
      const project = await json<any>("/api/projects", { method: "POST", body: JSON.stringify(projectInput) });

      // Requirements are a separate endpoint, so a rejected one must not lose the project.
      for (const requirement of requirements ?? []) {
        try {
          await json(`/api/projects/${project.id}/requirements`, {
            method: "POST", body: JSON.stringify(requirement),
          });
        } catch { /* reported by the project view; the project itself stands */ }
      }

      // The server seeds the team and returns it with the project. Seeding can fail while the
      // project itself is created, and a project with no agents can plan nothing and launch
      // nothing — so the failure is held in its own state until the user has read it.
      if (project.teamError) {
        setTeamError(
          `The project was created, but its agent team could not be set up: ${project.teamError}. ` +
            `Until it has agents, the Planner has no one to assign tasks to and no task can launch.`,
        );
      }

      await loadProjects();
      setState((s) => ({
        ...s,
        projectId: project.id,
        // Taken from the create response rather than refetched: the team is already known here,
        // and the canvas should not be empty for a round trip.
        agents: project.agents ?? s.agents,
        loading: true,
        error: null,
      }));
      // The selection effect only runs when the id actually changes. A create that answers with
      // the project already selected would otherwise leave the room on its loading screen with
      // nothing on the way to clear it.
      if (state.projectId === project.id) void loadProject(project.id);
      return project.id as string;
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      return null;
    } finally {
      setCreating(false);
    }
  }, [loadProjects, loadProject, state.projectId]);

  /**
   * Give an unowned task an owner (§10 step 5).
   *
   * The Planner cannot always place every role it asks for, and launch refuses a task with no
   * agent (NO_AGENT). Without this the only remedy for a plan the Planner could not fully staff
   * was a PATCH by hand.
   */
  const assignTask = useCallback(async (taskId: string, agentId: string) => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/tasks/${taskId}`, {
        method: "PATCH", body: JSON.stringify({ assignedAgentId: agentId }),
      });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /**
   * Ask the Planner to propose tasks from the design document (§10 step 4).
   *
   * The Plan panel used to tell the user to run `bun run new -- --plan`, which meant the browser
   * flow ended at the one step that turns a document into work. This is a real agent turn, so the
   * caller shows it as running.
   */
  const generatePlan = useCallback(async () => {
    if (!state.projectId) return;
    setPlanning(true);
    try {
      // A plan whose tasks have no owner cannot be launched, and that used to be visible only as a
      // NO_AGENT error one click later. The server now says which roles it could not place.
      const res = await json<{ unmatchedRoles?: string[]; teamMissing?: boolean }>(
        `/api/projects/${state.projectId}/plan/generate`,
        { method: "POST", body: "{}" },
      );
      setPlanNotice(
        res.teamMissing
          ? "This project has no agents, so nothing owns these tasks and none of them can be launched. Create the team, then generate the plan again."
          : res.unmatchedRoles?.length
            ? `The Planner asked for ${res.unmatchedRoles.join(", ")}, which no agent on this project holds. Those tasks went to an implementer so they can still run — reassign them if that is wrong.`
            : null,
      );
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPlanning(false);
    }
  }, [state.projectId, loadProject]);

  /**
   * Merge an approved submission (§10 step 15).
   *
   * The "Approve Merge" button was wired to a prop the shell never passed, so approving a
   * submission left the user with nothing to click. Merging also settles the task and the
   * requirement, which is what unblocks dependent tasks and moves progress off zero.
   */
  const mergeSubmission = useCallback(async (submissionId: string) => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/submissions/${submissionId}/merge`, {
        method: "POST", body: "{}",
      });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /** Edit a pending design suggestion before resolving it — the fourth §22.17 action. */
  const editSuggestion = useCallback(async (suggestionId: string, proposedText: string) => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/suggestions/${suggestionId}`, {
        method: "PATCH", body: JSON.stringify({ proposedText }),
      });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /**
   * The changed files and unified diff behind a submission (V-037).
   *
   * A reviewer is asked to approve a merge on the evidence shown, and until now the only evidence
   * was a file count. The two repository endpoints answer in different shapes — /changed-files is
   * a bare array of `{ path, status, staged }` with no line counts, /diff wraps its text in
   * `{ diff }` — so the adaptation happens here rather than leaking git's shapes into the queue.
   */
  const loadDiff = useCallback(async (submissionId: string): Promise<{ files: DiffFileView[]; diff: string }> => {
    const submission = state.submissions.find((s) => s.id === submissionId);
    // A submission whose worktree has been removed (or that never had one) has nothing to read.
    // An empty result renders as "no changes"; throwing would report a broken panel instead.
    if (!submission?.worktree) return { files: [], diff: "" };

    const query =
      `worktree=${encodeURIComponent(submission.worktree)}` +
      `&base=${encodeURIComponent(state.project?.baseBranch ?? "main")}`;
    const [changed, diff] = await Promise.all([
      json<Array<{ path: string; status?: string; staged?: boolean }>>(`/api/repository/changed-files?${query}`),
      json<{ diff: string }>(`/api/repository/diff?${query}`),
    ]);

    return {
      // The endpoint reports no line counts, so additions and deletions are left undefined —
      // DiffView omits a figure it was not given rather than showing a fabricated "+0".
      files: changed.map((file) => ({ path: file.path, status: file.status })),
      diff: diff.diff ?? "",
    };
  }, [state.submissions, state.project]);

  /**
   * Answer an agent from the conversation panel (§21).
   *
   * Everything but the text is derived from the message being answered: the thread it belongs to,
   * the agent that asked, and its links — the server rejects an unlinked message (V-025), so the
   * reply inherits what the question was about rather than inventing a link of its own.
   */
  const replyToMessage = useCallback(async (message: MessageView, text: string) => {
    if (!state.projectId) return;
    try {
      if (!message.links?.length) {
        throw new Error(
          "This message links to no task or requirement, so a reply to it would be rejected as " +
            "unlinked agent chatter. Answer the agent in its session drawer instead.",
        );
      }
      await json(`/api/projects/${state.projectId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          kind: "answer",
          toAgentId: message.fromAgentId,
          body: text,
          links: message.links,
          threadId: message.threadId,
          replyToId: message.id,
        }),
      });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  /** Clear an unread badge, so the panel stops reporting a message the user has dealt with. */
  const markMessageRead = useCallback(async (messageId: string) => {
    if (!state.projectId) return;
    try {
      await json(`/api/projects/${state.projectId}/messages/${messageId}/read`, { method: "PATCH", body: "{}" });
      void loadProject(state.projectId);
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [state.projectId, loadProject]);

  const refresh = useCallback(() => {
    if (state.projectId) void loadProject(state.projectId);
  }, [state.projectId, loadProject]);

  /**
   * Import a design document from a file (§10 step 2).
   *
   * Import was wired to the same handler as Save, so the two buttons did the same thing under
   * different names — the panel advertised a capability the shell did not have. Reading a file the
   * user picks is what "import" means, and the imported text becomes the new document version, so
   * it lands in the editor on the refresh that follows.
   */
  const importDocument = useCallback(async (): Promise<number> => {
    if (!state.projectId) return 0;
    const file = await pickFile();
    // The panel clears its dirty flag on a resolved handler, which would then let the editor
    // re-sync and discard whatever the user had typed. A cancelled picker must not do that, so it
    // reports rather than quietly succeeding.
    if (!file) throw new Error("No file chosen — the design document is unchanged.");
    const res = await json<{ version: number }>(`/api/projects/${state.projectId}/document`, {
      method: "PUT",
      body: JSON.stringify({ content: await file.text() }),
    });
    refresh();
    return res.version;
  }, [state.projectId, refresh]);

  return {
    ...state,
    drawerAgentId,
    acpSessionId,
    historyLoaded,
    historyLoading,
    loadMessageHistory,
    budgetAlert,
    dismissBudgetAlert: () => setBudgetAlert(null),
    authAlert,
    dismissAuthAlert: () => setAuthAlert(null),
    grokStatus,
    teamError,
    dismissTeamError: () => setTeamError(null),
    pauseAll,
    approvePlan,
    launchTask,
    assignTask,
    createProject,
    creating,
    mergeSubmission,
    editSuggestion,
    loadDiff,
    replyToMessage,
    markMessageRead,
    importDocument,
    generatePlan,
    planning,
    planNotice,
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
    /**
     * The note is what the agent is meant to act on, so it travels with the action. These two
     * mutations were also the only ones with no error handling: called from a bare arrow in the
     * shell, a server refusal became an unhandled rejection and the user saw nothing at all —
     * exactly what happens when the approve rule the client mirrors is rejected server-side.
     */
    resolveSuggestion: async (id: string, action: "accept" | "reject" | "request_revision", note?: string) => {
      if (!state.projectId) return;
      try {
        await json(`/api/projects/${state.projectId}/suggestions/${id}/resolve`, {
          method: "POST",
          body: JSON.stringify({ action, note: action === "request_revision" ? note?.trim() || undefined : undefined }),
        });
        refresh();
      } catch (err) {
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      }
    },
    reviewSubmission: async (id: string, action: "approve" | "request-changes", feedback?: string) => {
      if (!state.projectId) return;
      try {
        await json(`/api/projects/${state.projectId}/submissions/${id}/${action}`, {
          method: "POST",
          body: JSON.stringify(action === "request-changes" ? { feedback } : { note: "Approved" }),
        });
        refresh();
      } catch (err) {
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      }
    },
  };
}
