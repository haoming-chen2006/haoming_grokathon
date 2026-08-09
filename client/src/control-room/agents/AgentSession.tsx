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
import { MentionPicker } from "../mentions/MentionPicker";
import { MentionTargetsProvider } from "../mentions/targets";
import { useMentionInput } from "../mentions/useMentionInput";
import { Transcript, type TranscriptEntry } from "./Transcript";

export type { TranscriptEntry } from "./Transcript";

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

/**
 * The agent window, with `@` in its message box.
 *
 * Wrapped in the provider so the picker and the transcript's links read ONE list of targets: a
 * transcript that could not resolve an id the box had just offered would render "missing" against a
 * deliverable that plainly exists.
 */
export function AgentSession(props: { agentId: string; agentName: string; projectId: string }) {
  return (
    <MentionTargetsProvider projectId={props.projectId}>
      <Session {...props} />
    </MentionTargetsProvider>
  );
}

function Session({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  // `@` opens a list of this project's assets and design documents and inserts a link to the one
  // picked. The link carries the id, so it survives the deliverable being renamed.
  const mentions = useMentionInput(input, setDraft);

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
  //
  // Keyed on the LAST message's length as well as the count, because a streaming reply grows one
  // entry rather than adding entries: on count alone the view stopped following after the first
  // chunk and the reply scrolled away under the fold.
  // Indexed rather than `.at(-1)`: this client's tsconfig lib predates es2022, so `.at` does not
  // typecheck here and the build fails on it.
  const lines = session?.transcript;
  const tail = lines && lines.length > 0 ? lines[lines.length - 1] : undefined;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [session?.transcript?.length, tail?.seq, tail?.text?.length]);

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
          <div>
            <Transcript entries={transcript} agentName={agentName} />
            <div ref={bottom} />
          </div>
        )}
      </div>

      {session ? (
        <div className="relative shrink-0 border-t border-border p-2">
          {/* Above the box: the message box sits at the bottom of the panel, so a list drawn
              below it would open off the end of the window. */}
          <MentionPicker input={mentions} placement="above" />
          <textarea
            ref={input}
            data-testid="session-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              mentions.sync(e.currentTarget);
            }}
            onClick={(e) => mentions.sync(e.currentTarget)}
            onBlur={mentions.close}
            onKeyDown={(e) => {
              // The picker gets first refusal, and says whether it took the key. Without that,
              // Enter with the list open would send a half-typed "@cha" instead of inserting.
              if (mentions.handleKey(e)) return;
              // Enter sends, Shift+Enter is a newline — the convention every chat uses, and the one
              // a user will try first.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            placeholder="Say something to this agent — @ links to an asset or a document"
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
