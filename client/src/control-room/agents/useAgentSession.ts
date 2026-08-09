/**
 * Talking to one agent — the conversation the shell did not have.
 *
 * `SessionDrawer.tsx` has existed for a long time and was reachable only through
 * `ControlRoomApp.tsx`, which `main.tsx` stopped mounting when the shell took over. So the drawer,
 * the transcript, pause/resume/stop and the message box were all built, all tested, and all dead:
 * clicking an agent selected a card and there was no way to say anything to it. That is why the `@`
 * picker landed in a component nobody could open.
 *
 * This is the missing half — the four endpoints, in the shape the drawer already asks for. It
 * invents nothing: `LiveSession` off the wire is `TranscriptEntryView[]` plus a state string, which
 * is exactly what the drawer's props are, so nothing is mapped or renamed on the way through.
 *
 * A session is opened only when asked. Opening spawns a real `grok` process — see A-0 — so it is
 * never a side effect of selecting a card, and the poll below does not start until one is open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSessionStateView, TranscriptEntryView } from "../SessionDrawer";

export interface AgentSession {
  agentId: string;
  acpSessionId: string | null;
  state: LiveSessionStateView;
  transcript: TranscriptEntryView[];
  error?: string;
}

export interface AgentSessionData {
  session?: AgentSession;
  /** What is in flight, as a word a control can print. Null when nothing is. */
  busy: string | null;
  /** A failure the user can act on. Never swallowed — a dead button is how a silent refusal looks. */
  error: string | null;
  open(resume?: boolean): Promise<void>;
  send(text: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  close(): void;
}

const STATES: LiveSessionStateView[] = ["starting", "ready", "working", "paused", "stopped", "failed"];

/**
 * Validate a session body before rendering it.
 *
 * `as T` on a network value threw inside render three times in one day and blanked the page. A
 * transcript is the most likely thing here to arrive as an error object rather than a list, because
 * every one of these endpoints answers 409 with `{error, code}` when no session is open.
 */
export function readSession(body: unknown, agentId: string): AgentSession | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw = body as Record<string, unknown>;
  const state = STATES.find((s) => s === raw.state);
  if (!state) return undefined;
  const transcript = Array.isArray(raw.transcript)
    ? (raw.transcript as unknown[]).filter(
        (e): e is TranscriptEntryView =>
          !!e && typeof e === "object" && typeof (e as TranscriptEntryView).text === "string",
      )
    : [];
  return {
    agentId,
    acpSessionId: typeof raw.acpSessionId === "string" ? raw.acpSessionId : null,
    state,
    transcript,
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
  };
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body;
}

export function useAgentSession(agentId: string | undefined): AgentSessionData {
  const [session, setSession] = useState<AgentSession | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  // A different agent is a different conversation. Without this the drawer kept the previous
  // agent's transcript while its header named the new one, which is a lie a screenshot cannot catch.
  useEffect(() => {
    setSession(undefined);
    setError(null);
  }, [agentId]);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      const body = await call(`/api/coding-agents/${encodeURIComponent(agentId)}/session`);
      if (!live.current) return;
      setSession(readSession(body, agentId));
    } catch {
      // A 409 here means "no session open", which is the ordinary state and not an error to show.
      // A real failure surfaces through the action that caused it, where the user can act on it.
    }
  }, [agentId]);

  /**
   * Poll while a session is open, and not otherwise.
   *
   * Five seconds, the same placeholder the board uses and for the same reason: the control-room
   * socket already carries these events and subscribing to it is the right end state, but a poll is
   * four lines and cannot silently miss an event type. Filed in the handoff rather than skipped.
   */
  useEffect(() => {
    live.current = true;
    if (!agentId || !session) return () => { live.current = false; };
    const timer = setInterval(() => void load(), 5000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, [agentId, session, load]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      if (!agentId) return;
      setBusy(label);
      setError(null);
      try {
        const body = await fn();
        if (!live.current) return;
        // Every one of these endpoints answers with the session, so the reply IS the refresh.
        const next = readSession(body, agentId);
        if (next) setSession(next);
        else await load();
      } catch (err) {
        if (live.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (live.current) setBusy(null);
      }
    },
    [agentId, load],
  );

  const post = (suffix: string, body: unknown = {}) => () =>
    call(`/api/coding-agents/${encodeURIComponent(agentId!)}/session${suffix}`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  return {
    session,
    busy,
    error,
    // "Opening" rather than "Starting": this spawns a real grok process and the word should say so.
    open: (resume = false) => run("Opening", post("", { resume })),
    send: (text: string) => run("Sending", post("/message", { text })),
    pause: () => run("Pausing", post("/pause")),
    resume: () => run("Resuming", post("/resume")),
    stop: () => run("Stopping", post("/stop")),
    close: () => setSession(undefined),
  };
}
