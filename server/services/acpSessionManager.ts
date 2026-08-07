import { AcpConnection, type AcpEvent } from "./acpClient";
import { getAgentRegistry } from "./agentRegistry";
import { getControlRoomBus } from "./controlRoomEvents";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

/** One entry in an agent's visible transcript (V-023). */
export interface TranscriptEntry {
  seq: number;
  at: string;
  kind: "user" | "agent" | "thought" | "tool" | "system";
  text: string;
  /** Tool status, for `kind: "tool"` entries. */
  status?: string;
}

export type LiveSessionState = "starting" | "ready" | "working" | "paused" | "stopped" | "failed";

export interface LiveSession {
  agentId: string;
  projectId: string;
  acpSessionId: string | null;
  state: LiveSessionState;
  transcript: TranscriptEntry[];
  error?: string;
}

/** Attempted to act on an agent that has no open session. */
export class NoLiveSessionError extends Error {
  readonly code = "NO_LIVE_SESSION";
  constructor(agentId: string) {
    super(`Agent ${agentId} has no open session. Open one before sending messages or controls.`);
    this.name = "NoLiveSessionError";
  }
}

/** The agent is paused; the caller must resume before it will accept work. */
export class SessionPausedError extends Error {
  readonly code = "SESSION_PAUSED";
  constructor(agentId: string) {
    super(`Agent ${agentId} is paused. Resume it before sending a message.`);
    this.name = "SessionPausedError";
  }
}

interface Entry {
  connection: AcpConnection;
  session: LiveSession;
  seq: number;
}

const MAX_TRANSCRIPT = 500;

/**
 * Owns the live ACP connections behind the UI's session drawer. Connections are kept here rather
 * than in the agent registry because they are process handles, not persistable state — the
 * registry stores what survives a restart, this stores what is currently running.
 */
export class AcpSessionManager {
  private entries = new Map<string, Entry>();

  constructor(private readonly cwdFor: (agentId: string) => string) {}

  private push(entry: Entry, kind: TranscriptEntry["kind"], text: string, status?: string): void {
    if (!text) return;
    entry.seq += 1;
    const line: TranscriptEntry = { seq: entry.seq, at: new Date().toISOString(), kind, text, status };
    entry.session.transcript.push(line);
    // Bound the buffer so a long-running agent cannot grow it without limit.
    if (entry.session.transcript.length > MAX_TRANSCRIPT) {
      entry.session.transcript.splice(0, entry.session.transcript.length - MAX_TRANSCRIPT);
    }
    getControlRoomBus().publish(entry.session.projectId, {
      type: "transcript",
      agentId: entry.session.agentId,
      entry: line,
    });
  }

  private setState(entry: Entry, state: LiveSessionState, error?: string): void {
    entry.session.state = state;
    if (error) entry.session.error = error;
    getControlRoomBus().publish(entry.session.projectId, {
      type: "session_state",
      agentId: entry.session.agentId,
      state,
      error,
    });
  }

  /** Open (or reopen) a session for an agent. Returns the existing one if already open. */
  async open(agentId: string, opts: { resume?: boolean } = {}): Promise<LiveSession> {
    const existing = this.entries.get(agentId);
    if (existing && existing.connection.isRunning) return existing.session;

    const registry = getAgentRegistry();
    const agent = registry.get(agentId);

    const session: LiveSession = {
      agentId,
      projectId: agent.projectId,
      acpSessionId: null,
      state: "starting",
      transcript: [],
    };
    const entry: Entry = { connection: null as any, session, seq: 0 };

    const connection = new AcpConnection({
      agentId,
      cwd: this.cwdFor(agentId),
      requestTimeoutMs: 120_000,
      onEvent: (event: AcpEvent) => this.onAgentEvent(entry, event),
    });
    entry.connection = connection;
    this.entries.set(agentId, entry);

    try {
      connection.start();
      await connection.initialize();

      // Reopen the persisted session when asked, so the drawer shows prior history.
      if (opts.resume && agent.acpSessionId && connection.supportsLoadSession) {
        await connection.loadSession(agent.acpSessionId);
        this.push(entry, "system", `Reopened session ${agent.acpSessionId}`);
      } else {
        await connection.newSession();
      }

      session.acpSessionId = connection.sessionId;
      if (connection.sessionId) registry.setAcpSession(agentId, connection.sessionId);
      this.setState(entry, "ready");
      log(`\x1b[38;5;141m[acp]\x1b[0m drawer session open for ${agentId} (${connection.sessionId})`);
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState(entry, "failed", message);
      registry.setStatus(agentId, "failed", message);
      throw err;
    }
  }

  /** Translate ACP events into transcript lines and status. */
  private onAgentEvent(entry: Entry, event: AcpEvent): void {
    switch (event.type) {
      case "update": {
        const update = event.update;
        if (update.sessionUpdate === "agent_message_chunk") {
          this.push(entry, "agent", update.content?.text ?? "");
        } else if (update.sessionUpdate === "agent_thought_chunk") {
          this.push(entry, "thought", update.content?.text ?? "");
        } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
          this.push(entry, "tool", update.title ?? update.toolCallId ?? "tool call", update.status);
          // Tool activity is also the agent's current activity (V-024).
          if (update.title) {
            try {
              getAgentRegistry().updateActivity(entry.session.agentId, { tool: update.title });
            } catch {
              // The agent may have been removed mid-flight; transcript still stands.
            }
          }
        }
        break;
      }
      case "disconnected":
        if (entry.session.state !== "stopped") {
          this.setState(entry, "failed", "Agent process exited");
          try {
            getAgentRegistry().markDisconnected(entry.session.agentId, "Agent process exited");
          } catch {}
        }
        break;
      case "failed":
        this.setState(entry, "failed", event.error);
        break;
      default:
        break;
    }
  }

  get(agentId: string): LiveSession {
    const entry = this.entries.get(agentId);
    if (!entry) throw new NoLiveSessionError(agentId);
    return entry.session;
  }

  has(agentId: string): boolean {
    return this.entries.has(agentId);
  }

  transcript(agentId: string, sinceSeq = 0): TranscriptEntry[] {
    return this.get(agentId).transcript.filter((line) => line.seq > sinceSeq);
  }

  /** Send a user message and stream the reply into the transcript. */
  async send(agentId: string, text: string): Promise<TranscriptEntry[]> {
    const entry = this.entries.get(agentId);
    if (!entry) throw new NoLiveSessionError(agentId);
    if (entry.session.state === "paused") throw new SessionPausedError(agentId);
    if (!entry.connection.isRunning) throw new NoLiveSessionError(agentId);
    if (!text?.trim()) throw new Error("Message text is required");

    const before = entry.seq;
    this.push(entry, "user", text);
    this.setState(entry, "working");
    try {
      getAgentRegistry().setStatus(agentId, "working");
    } catch {}

    try {
      await entry.connection.prompt(text, { timeoutMs: 300_000 });
      this.setState(entry, "ready");
      try {
        getAgentRegistry().setStatus(agentId, "idle");
      } catch {}
      return entry.session.transcript.filter((line) => line.seq > before);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.push(entry, "system", `Prompt failed: ${message}`);
      this.setState(entry, "failed", message);
      throw err;
    }
  }

  /**
   * Pause an agent. The process stays alive and the session is preserved — pausing is about
   * refusing new work, not discarding the agent, so resuming is instant and loses nothing.
   */
  pause(agentId: string): LiveSession {
    const entry = this.entries.get(agentId);
    if (!entry) throw new NoLiveSessionError(agentId);
    this.setState(entry, "paused");
    this.push(entry, "system", "Paused by user");
    try {
      getAgentRegistry().setStatus(agentId, "idle", "Paused by user");
    } catch {}
    return entry.session;
  }

  resume(agentId: string): LiveSession {
    const entry = this.entries.get(agentId);
    if (!entry) throw new NoLiveSessionError(agentId);
    this.setState(entry, entry.connection.isRunning ? "ready" : "failed");
    this.push(entry, "system", "Resumed by user");
    return entry.session;
  }

  /** Stop an agent's process. The session id is retained so it can be reopened later (V-007). */
  stop(agentId: string): LiveSession {
    const entry = this.entries.get(agentId);
    if (!entry) throw new NoLiveSessionError(agentId);
    entry.connection.stop();
    this.setState(entry, "stopped");
    this.push(entry, "system", "Stopped by user");
    try {
      getAgentRegistry().markDisconnected(agentId, "Stopped by user");
    } catch {}
    return entry.session;
  }

  stopAll(): void {
    for (const agentId of [...this.entries.keys()]) {
      try {
        this.stop(agentId);
      } catch {}
    }
  }

  /** Drop a stopped session's handle. The persisted session id remains on the agent record. */
  close(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (!entry) return;
    entry.connection.stop();
    this.entries.delete(agentId);
  }
}

let manager: AcpSessionManager | null = null;
export function getAcpSessionManager(): AcpSessionManager {
  if (!manager) {
    manager = new AcpSessionManager((agentId) => {
      // An agent works in its own worktree when it has one; otherwise the project repository.
      try {
        const agent = getAgentRegistry().get(agentId);
        return agent.worktree || process.env.LAUNCH_CWD || process.cwd();
      } catch {
        return process.env.LAUNCH_CWD || process.cwd();
      }
    });
  }
  return manager;
}
