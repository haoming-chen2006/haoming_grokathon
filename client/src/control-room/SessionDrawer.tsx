import { useRef, useState } from "react";
import { MentionPicker } from "./mentions/MentionPicker";
import { MentionText } from "./mentions/MentionLink";
import { MentionTargetsProvider } from "./mentions/targets";
import { useMentionInput } from "./mentions/useMentionInput";

export interface TranscriptEntryView {
  seq: number;
  at: string;
  kind: "user" | "agent" | "thought" | "tool" | "system";
  text: string;
  status?: string;
}

export type LiveSessionStateView = "starting" | "ready" | "working" | "paused" | "stopped" | "failed";

const KIND_LABELS: Record<TranscriptEntryView["kind"], string> = {
  user: "You",
  agent: "Agent",
  thought: "Thinking",
  tool: "Tool",
  system: "System",
};

const STATE_LABELS: Record<LiveSessionStateView, string> = {
  starting: "Starting",
  ready: "Ready",
  working: "Working",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
};

export function transcriptKindLabel(kind: TranscriptEntryView["kind"]): string {
  const label = KIND_LABELS[kind];
  if (!label) throw new Error(`No label defined for transcript kind: ${kind}`);
  return label;
}

export function sessionStateLabel(state: LiveSessionStateView): string {
  const label = STATE_LABELS[state];
  if (!label) throw new Error(`No label defined for session state: ${state}`);
  return label;
}

interface Props {
  agentName: string;
  agentId: string;
  acpSessionId?: string | null;
  state: LiveSessionStateView;
  transcript: TranscriptEntryView[];
  error?: string;
  /**
   * The project whose assets and design documents `@` can reach. OPTIONAL, and absent means the
   * picker does not open: a drawer that has not been told which project it belongs to must not
   * offer an empty list and let the user read it as "there is nothing here".
   */
  projectId?: string;
  onSend?: (text: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onClose?: () => void;
}

/**
 * The live session drawer (V-023): transcript and tool activity, a message box, and pause/stop.
 * Opened by clicking an agent card.
 *
 * `@` in the message box links to an asset or a design document, and the transcript draws the same
 * link back. Both halves matter: a message the user wrote as a link that came back as
 * `[@deck](asset:…)` would teach them not to use the feature.
 */
export function SessionDrawer(props: Props) {
  return (
    <MentionTargetsProvider projectId={props.projectId ?? ""}>
      <Drawer {...props} />
    </MentionTargetsProvider>
  );
}

function Drawer({
  agentName,
  agentId,
  acpSessionId,
  state,
  transcript,
  error,
  onSend,
  onPause,
  onResume,
  onStop,
  onClose,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mentions = useMentionInput(inputRef, setDraft);
  const busy = state === "working" || state === "starting";
  const dead = state === "stopped" || state === "failed";

  return (
    <aside
      data-testid="session-drawer"
      data-agent-id={agentId}
      aria-label={`Live session for ${agentName}`}
      className="flex h-full w-[28rem] flex-col border-l border-white/10 bg-neutral-950 text-white"
    >
      <header className="flex items-center gap-2 border-b border-white/10 p-3">
        <div className="min-w-0">
          <div data-testid="drawer-agent-name" className="truncate text-sm font-semibold">
            {agentName}
          </div>
          {acpSessionId && (
            <div data-testid="drawer-session-id" className="truncate font-mono text-[11px] text-white/40">
              {acpSessionId}
            </div>
          )}
        </div>
        {/* State is text, never colour alone. */}
        <span data-testid="drawer-state" className="ml-auto rounded bg-white/10 px-2 py-0.5 text-xs">
          {sessionStateLabel(state)}
        </span>
        <button
          type="button"
          data-testid="drawer-close"
          aria-label="Close session drawer"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
        >
          ✕
        </button>
      </header>

      {error && (
        <div data-testid="drawer-error" role="alert" className="border-b border-red-500/20 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div data-testid="drawer-transcript" className="flex-1 space-y-2 overflow-y-auto p-3">
        {transcript.length === 0 ? (
          <div data-testid="drawer-transcript-empty" className="text-xs text-white/40">
            No activity yet. Send a message to start the conversation.
          </div>
        ) : (
          transcript.map((entry) => (
            <div key={entry.seq} data-testid={`transcript-${entry.seq}`} data-kind={entry.kind} className="text-xs">
              <span
                data-testid={`transcript-kind-${entry.seq}`}
                className="mr-2 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50"
              >
                {transcriptKindLabel(entry.kind)}
                {entry.status ? ` · ${entry.status}` : ""}
              </span>
              <span
                data-testid={`transcript-text-${entry.seq}`}
                className={
                  entry.kind === "thought"
                    ? "italic text-white/45"
                    : entry.kind === "system"
                      ? "text-white/50"
                      : "text-white/85"
                }
              >
                {/* Mentions only. A transcript is not a document, so nothing else in the text is
                    interpreted: the asterisks in a shell command stay asterisks. */}
                <MentionText text={entry.text} />
              </span>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        {/* `relative` so the picker hangs off the message box rather than off the drawer. */}
        <div className="relative mb-2">
          <textarea
            ref={inputRef}
            data-testid="drawer-input"
            aria-label="Message to agent"
            value={draft}
            disabled={dead}
            onChange={(e) => {
              setDraft(e.target.value);
              mentions.sync(e.target);
            }}
            onKeyUp={(e) => mentions.sync(e.currentTarget)}
            onClick={(e) => mentions.sync(e.currentTarget)}
            // The picker takes ↑↓ ↵ ⇥ and Escape only while it is open; every other key, and every
            // key at all when it is shut, reaches the box unchanged.
            onKeyDown={(e) => mentions.handleKey(e)}
            placeholder={dead ? "Session is not running" : "Send a message to this agent — @ links to an asset or a document"}
            className="h-16 w-full resize-none rounded border border-white/10 bg-neutral-900 p-2 text-xs text-white/90 disabled:opacity-40"
          />
          {/* Above: the message box is the bottom of the drawer, so a list below it would open
              over the Send button and off the edge of the panel. */}
          <MentionPicker input={mentions} placement="above" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="drawer-send"
            // A paused or dead session must not accept work; the backend refuses it too.
            disabled={!draft.trim() || busy || dead || state === "paused"}
            title={state === "paused" ? "Resume the agent to send a message" : undefined}
            onClick={() => {
              onSend?.(draft);
              setDraft("");
            }}
            className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            Send
          </button>

          {state === "paused" ? (
            <button
              type="button"
              data-testid="drawer-resume"
              onClick={onResume}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              data-testid="drawer-pause"
              disabled={dead}
              onClick={onPause}
              className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
            >
              Pause
            </button>
          )}

          <button
            type="button"
            data-testid="drawer-stop"
            disabled={dead}
            onClick={onStop}
            className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            Stop
          </button>
        </div>
      </div>
    </aside>
  );
}
