import { useState } from "react";

export interface MessageView {
  id: string;
  kind: "question" | "answer" | "dependency_request" | "handoff" | "failing_test" | "review_request" | "escalation";
  fromAgentId: string;
  toAgentId?: string;
  body: string;
  links: Array<{ kind: string; id: string }>;
  threadId: string;
  createdAt: string;
  autoEscalated?: boolean;
  escalationReason?: string;
  readAt?: string;
}

const KIND_LABELS: Record<MessageView["kind"], string> = {
  question: "Question",
  answer: "Answer",
  dependency_request: "Dependency Request",
  handoff: "Handoff",
  failing_test: "Failing Test",
  review_request: "Review Request",
  escalation: "Escalation",
};

export function messageKindLabel(kind: MessageView["kind"]): string {
  const label = KIND_LABELS[kind];
  if (!label) throw new Error(`No label defined for message kind: ${kind}`);
  return label;
}

/**
 * The link kinds the shell can actually navigate to. MessageLinkKind defines eight (task,
 * requirement, file, branch, test, artifact, review, blocker); the rest are still shown, because
 * the traceability V-025 asks for lives in them, but as plain labels rather than buttons — a chip
 * that looks clickable and does nothing is a worse lie than a chip that never offered.
 * Keep this in step with whatever the caller's onOpenLink handles.
 */
export const NAVIGABLE_LINK_KINDS: readonly string[] = ["requirement"];

/**
 * Kinds that leave the exchange open and so deserve a reply box: they want an answer, an unblock,
 * or an acknowledgement. An "answer" is already the end of an exchange, a "review_request" is acted
 * on in the review queue, and a "failing_test" is a report rather than a request.
 */
const REPLIABLE_KINDS: ReadonlySet<MessageView["kind"]> = new Set([
  "question",
  "dependency_request",
  "handoff",
  "escalation",
]);

interface Props {
  messages: MessageView[];
  onOpenLink?: (link: { kind: string; id: string }) => void;
  /** Answer an agent from the panel it asked in. Absent when the caller cannot post messages. */
  onReply?: (message: MessageView, text: string) => void;
  /** Clear an unread badge. Absent when the caller cannot persist the read receipt. */
  onMarkRead?: (messageId: string) => void;
  /** Pull archived history. Absent when the caller does not support it. */
  onLoadHistory?: () => void;
  historyLoaded?: boolean;
  historyLoading?: boolean;
}

/**
 * Agent conversations (§11 right panel). Messages are grouped by thread so an exchange reads as a
 * conversation rather than a flat log, and every message shows what it is linked to — the
 * traceability V-025 requires is only useful if the user can see it.
 */
export function ConversationView({
  messages, onOpenLink, onReply, onMarkRead, onLoadHistory, historyLoaded, historyLoading,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (messages.length === 0) {
    return (
      <div data-testid="conversations-empty" className="p-4 text-sm text-white/50">
        No agent messages yet.
      </div>
    );
  }

  const threads = new Map<string, MessageView[]>();
  for (const message of messages) {
    threads.set(message.threadId, [...(threads.get(message.threadId) ?? []), message]);
  }

  return (
    <div data-testid="conversation-view" className="text-white">
      {onLoadHistory && !historyLoaded && (
        <button
          type="button"
          data-testid="load-message-history"
          onClick={onLoadHistory}
          disabled={historyLoading}
          className="w-full border-b border-white/5 p-2 text-[11px] uppercase tracking-wide text-white/40 hover:text-white/70 disabled:opacity-50"
        >
          {historyLoading ? "Loading earlier messages…" : "Load earlier messages"}
        </button>
      )}
      {onLoadHistory && historyLoaded && (
        <div data-testid="message-history-loaded" className="border-b border-white/5 p-2 text-[11px] uppercase tracking-wide text-white/25">
          Showing full history
        </div>
      )}
      {[...threads.entries()].map(([threadId, thread]) => (
        <section key={threadId} data-testid={`thread-${threadId}`} className="border-b border-white/5 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-white/30">
            Thread · {thread.length} message{thread.length === 1 ? "" : "s"}
          </div>

          {thread.map((m) => (
            <article key={m.id} data-testid={`message-${m.id}`} className="mb-2 last:mb-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span data-testid={`message-kind-${m.id}`} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">
                  {messageKindLabel(m.kind)}
                </span>
                <span data-testid={`message-from-${m.id}`} className="font-medium">
                  {m.fromAgentId}
                </span>
                <span aria-hidden="true" className="text-white/30">
                  →
                </span>
                {/* An escalation has no recipient agent; say so rather than rendering a blank. */}
                <span data-testid={`message-to-${m.id}`} className="text-white/70">
                  {m.toAgentId ?? "you"}
                </span>
                {!m.readAt && (
                  <span data-testid={`message-unread-${m.id}`} className="text-[11px] text-blue-300">
                    unread
                  </span>
                )}
                {onMarkRead && !m.readAt && (
                  <button
                    type="button"
                    data-testid={`message-mark-read-${m.id}`}
                    onClick={() => onMarkRead(m.id)}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/80"
                  >
                    Mark read
                  </button>
                )}
              </div>

              <p data-testid={`message-body-${m.id}`} className="mt-1 text-xs text-white/80">
                {m.body}
              </p>

              {m.autoEscalated && m.escalationReason && (
                <div data-testid={`message-escalation-${m.id}`} className="mt-1 text-xs text-yellow-300">
                  Escalated automatically: {m.escalationReason}
                </div>
              )}

              {m.links.length > 0 && (
                <div data-testid={`message-links-${m.id}`} className="mt-1 flex flex-wrap gap-1">
                  {m.links.map((link) =>
                    onOpenLink && NAVIGABLE_LINK_KINDS.includes(link.kind) ? (
                      <button
                        key={`${link.kind}:${link.id}`}
                        type="button"
                        data-testid={`message-link-${m.id}-${link.kind}`}
                        onClick={() => onOpenLink(link)}
                        className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-white/60 underline decoration-dotted hover:bg-white/10 hover:text-white/90"
                      >
                        {link.kind}: {link.id}
                      </button>
                    ) : (
                      <span
                        key={`${link.kind}:${link.id}`}
                        data-testid={`message-link-${m.id}-${link.kind}`}
                        className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-white/45"
                      >
                        {link.kind}: {link.id}
                      </span>
                    ),
                  )}
                </div>
              )}

              {onReply && REPLIABLE_KINDS.has(m.kind) && (
                <div className="mt-2 flex gap-2">
                  <input
                    data-testid={`message-reply-input-${m.id}`}
                    aria-label={`Reply to ${m.fromAgentId}`}
                    value={drafts[m.id] ?? ""}
                    onChange={(e) => setDrafts({ ...drafts, [m.id]: e.target.value })}
                    placeholder={`Reply to ${m.fromAgentId}…`}
                    className="min-w-0 flex-1 rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white/90"
                  />
                  <button
                    type="button"
                    data-testid={`message-reply-send-${m.id}`}
                    // A blank reply is a message the agent cannot act on, so refuse to send one.
                    disabled={!drafts[m.id]?.trim()}
                    onClick={() => {
                      onReply(m, (drafts[m.id] ?? "").trim());
                      setDrafts({ ...drafts, [m.id]: "" });
                    }}
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
