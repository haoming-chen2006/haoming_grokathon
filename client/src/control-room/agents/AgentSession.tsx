/**
 * Talking to a running agent.
 *
 * Clicking an agent showed a card of facts about it. The agent is a live `grok` process with a
 * conversation you can join — the endpoints have existed since before this page did — and there was
 * no way to say anything to it. A supervisor who cannot speak to the thing being supervised is
 * watching, not supervising.
 *
 * This is a transcript and a message box, not a terminal emulator. The agent speaks ACP over stdio,
 * so what arrives is typed updates — a message chunk, a thought, a tool call — and rendering them as
 * labelled lines says more than a stream of ANSI would. The old control room's SessionDrawer proved
 * the shape; this is that shape against the workspace's own contract.
 *
 * Opening a session STARTS one if none is running. That is the honest meaning of "open" here and it
 * is what the button says, because a drawer that silently spawned a process would be a surprise with
 * a cost attached.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface TranscriptEntry {
  seq: number;
  at?: string;
  kind: string;
  text?: string;
}

interface SessionView {
  agentId: string;
  acpSessionId?: string;
  state: string;
  transcript?: TranscriptEntry[];
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

/** How each kind of line reads. An unknown kind keeps its own name rather than being hidden. */
const KIND_LABEL: Record<string, string> = {
  user: "You",
  agent: "Agent",
  agent_message_chunk: "Agent",
  agent_thought_chunk: "Thinking",
  thought: "Thinking",
  tool_call: "Tool",
  tool: "Tool",
  system: "System",
  error: "Error",
};

const KIND_CLASS: Record<string, string> = {
  user: "text-ink",
  agent: "text-ink-muted",
  agent_message_chunk: "text-ink-muted",
  agent_thought_chunk: "text-ink-ghost italic",
  thought: "text-ink-ghost italic",
  tool_call: "text-accent",
  tool: "text-accent",
  system: "text-ink-faint",
  error: "text-status-failed-ink",
};

export function AgentSession({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  /** Read whatever session already exists, without starting one. */
  const peek = useCallback(async () => {
    try {
      const s = await json<SessionView>(`/api/coding-agents/${agentId}/session`);
      setSession(s && typeof s === "object" ? s : null);
      setError(null);
    } catch {
      // No session yet is the ordinary case for an agent nobody has spoken to, and it is not an
      // error to report — the panel offers to start one.
      setSession(null);
    }
  }, [agentId]);

  useEffect(() => {
    setSession(null);
    setDraft("");
    setError(null);
    void peek();
    // Polling for now, like the board. The control-room socket already carries `transcript` and
    // `session_state`; subscribing is the right end state and is filed rather than skipped.
    const timer = setInterval(() => void peek(), 2000);
    return () => clearInterval(timer);
  }, [peek]);

  // Follow the conversation as it arrives, the way a terminal does.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [session?.transcript?.length]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await peek();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const start = () =>
    act("Starting", async () => {
      const s = await json<SessionView>(`/api/coding-agents/${agentId}/session`, {
        method: "POST",
        body: "{}",
      });
      setSession(s);
    });

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    return act("Sending", () =>
      json(`/api/coding-agents/${agentId}/session/message`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    );
  };

  const control = (action: "pause" | "resume" | "stop") =>
    act(action, () =>
      json(`/api/coding-agents/${agentId}/session/${action}`, { method: "POST", body: "{}" }),
    );

  const transcript = session?.transcript ?? [];
  const live = !!session && session.state !== "stopped";

  return (
    <div data-testid="agent-session" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-[15px] text-ink">{agentName}</span>
        <span
          data-testid="session-state"
          className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost"
        >
          {session ? session.state : "no session"}
        </span>
        <span className="flex-1" />
        {session?.acpSessionId ? (
          // The id the terminal knows it by, so `grok --resume <id>` reaches this same conversation.
          <span
            className="truncate font-mono text-[10px] text-ink-ghost"
            title={`Resume in a terminal: grok --resume ${session.acpSessionId}`}
          >
            {session.acpSessionId.slice(0, 8)}…
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" data-testid="session-error" className="border-b border-border px-3 py-1.5 text-[12px] text-status-failed-ink">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {!session ? (
          <div className="flex h-full flex-col items-start justify-center gap-2">
            <p className="text-[13px] text-ink-faint">
              No session yet. Starting one launches a real Grok process in this agent's area.
            </p>
            <button
              type="button"
              data-testid="session-start"
              onClick={() => void start()}
              disabled={!!busy}
              className="rounded border border-border-strong bg-surface-active px-2.5 py-1 text-[13px] text-ink disabled:opacity-40"
            >
              {busy ? `${busy}…` : "Start a session"}
            </button>
          </div>
        ) : transcript.length === 0 ? (
          <p className="text-[13px] text-ink-faint">
            Session open, nothing said yet. Type below and the agent answers here.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {transcript.map((entry) => (
              <div key={entry.seq} data-testid="transcript-line" className="text-[13px] leading-snug">
                <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
                  {KIND_LABEL[entry.kind] ?? entry.kind}
                </span>
                <span className={`whitespace-pre-wrap ${KIND_CLASS[entry.kind] ?? "text-ink-muted"}`}>
                  {entry.text}
                </span>
              </div>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </div>

      {session ? (
        <div className="shrink-0 border-t border-border p-2">
          <textarea
            data-testid="session-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — the convention every chat uses, and the one
              // a user will try first.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="Say something to this agent…"
            aria-label={`Message ${agentName}`}
            className="w-full resize-none rounded border border-border bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-ink-ghost"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              data-testid="session-send"
              onClick={() => void send()}
              disabled={!draft.trim() || !!busy}
              title={draft.trim() ? "Send (Enter)" : "Type a message first"}
              className="rounded border border-border-strong bg-surface-active px-2.5 py-1 text-[13px] text-ink disabled:opacity-40"
            >
              {busy === "Sending" ? "Sending…" : "Send"}
            </button>
            <span className="flex-1" />
            <button
              type="button"
              data-testid="session-pause"
              onClick={() => void control(live ? "pause" : "resume")}
              disabled={!!busy}
              className="rounded border border-border px-2 py-1 text-[12px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
            >
              {live ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              data-testid="session-stop"
              onClick={() => void control("stop")}
              disabled={!!busy}
              title="End this session. The conversation stays in grok's own store and can be resumed."
              className="rounded border border-border px-2 py-1 text-[12px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
