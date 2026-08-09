/**
 * An agent conversation, drawn the way a conversation looks.
 *
 * The panel used to render one labelled line per transcript entry, and entries were one per ACP
 * chunk, so "Hello! How can I assist you today?" arrived as nine rows each prefixed AGENT. The
 * joining is fixed at the source (see `acpSessionManager.push`) — this file is about the rest of
 * it: a message is a block of prose under a speaker, not a row in a log.
 *
 * Agents write markdown, constantly and without being asked: fenced code, `inline code`, **bold**,
 * bullets, headings. Rendered as plain text those markers are noise the reader has to subtract by
 * eye. `renderRich` handles the five that actually appear; anything else stays exactly as typed,
 * which is the right failure for a renderer nobody can correct from the other side.
 *
 * Mentions still resolve inside all of it — `MentionText` is what draws every text run — because a
 * link the user wrote in their message must come back as a link, not as `[@deck](asset:…)`.
 */
import { MentionText } from "../mentions/MentionLink";

export interface TranscriptEntry {
  seq: number;
  at?: string;
  kind: string;
  text?: string;
  status?: string;
}

/** A fenced block, or a stretch of ordinary prose. */
type Segment =
  | { type: "code"; language?: string; text: string }
  | { type: "prose"; text: string };

/**
 * Split on ``` fences.
 *
 * An unclosed fence is treated as running to the end, because that is what a half-streamed reply
 * looks like and the alternative — showing the fence as literal text until the closing one arrives
 * — makes live output flicker between two renderings of the same words.
 */
export function splitFences(text: string): Segment[] {
  const segments: Segment[] = [];
  let prose: string[] = [];
  let code: { language?: string; lines: string[] } | null = null;

  const flushProse = () => {
    const joined = prose.join("\n");
    if (joined.trim()) segments.push({ type: "prose", text: joined });
    prose = [];
  };
  const flushCode = () => {
    if (!code) return;
    segments.push({ type: "code", language: code.language, text: code.lines.join("\n") });
    code = null;
  };

  for (const line of text.split("\n")) {
    const fence = /^\s*```(.*)$/.exec(line);
    if (fence && code) {
      flushCode();
    } else if (fence) {
      flushProse();
      code = { language: fence[1].trim() || undefined, lines: [] };
    } else if (code) {
      code.lines.push(line);
    } else {
      prose.push(line);
    }
  }
  // An unclosed fence at the end is a reply still streaming, not a mistake.
  flushCode();
  flushProse();

  return segments;
}

/**
 * Inline markers, in one pass: `code` and **bold**.
 *
 * Single-asterisk italic is deliberately NOT interpreted. The old drawer's rule — "the asterisks in
 * a shell command stay asterisks" — is right, and `rm *.txt and *.log` has two of them on one line:
 * italic would eat the middle of a command the reader may be about to run. Doubled asterisks do not
 * occur that way by accident, and backticks around code are code however they got there.
 *
 * Everything that is not a marker goes through `MentionText`, so the two schemes compose rather
 * than one having to know about the other.
 */
function renderRich(text: string, keyPrefix: string) {
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      out.push(<MentionText key={`${keyPrefix}t${last}`} text={text.slice(last, match.index)} />);
    }
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(
        <code
          key={`${keyPrefix}c${match.index}`}
          className="rounded bg-surface-active px-1 py-px font-mono text-[12px] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(
        <strong key={`${keyPrefix}b${match.index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(<MentionText key={`${keyPrefix}t${last}`} text={text.slice(last)} />);
  return out;
}

/** One stretch of prose: blank lines separate paragraphs, `-`/`*`/`1.` start list items. */
function Prose({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const joined = paragraph.join("\n");
    blocks.push(
      <p key={`p${blocks.length}`} className="whitespace-pre-wrap">
        {renderRich(joined, `p${blocks.length}-`)}
      </p>,
    );
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`u${blocks.length}`} className="ml-4 list-disc space-y-0.5 marker:text-ink-ghost">
        {bullets.map((item, i) => (
          <li key={i}>{renderRich(item, `u${blocks.length}-${i}-`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (const line of lines) {
    const bullet = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
    } else if (heading) {
      flushParagraph();
      flushBullets();
      blocks.push(
        <p key={`h${blocks.length}`} className="font-semibold text-ink">
          {renderRich(heading[1], `h${blocks.length}-`)}
        </p>,
      );
    } else if (line.trim() === "") {
      flushParagraph();
      flushBullets();
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();

  return <>{blocks}</>;
}

/** A whole message body: fenced code drawn as code, everything else as prose. */
export function MessageBody({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {splitFences(text).map((segment, i) =>
        segment.type === "code" ? (
          <pre
            key={i}
            data-testid="transcript-code"
            className="overflow-x-auto rounded border border-border bg-surface-active p-2 font-mono text-[12px] leading-relaxed text-ink"
          >
            {segment.language ? (
              <span className="mb-1 block text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
                {segment.language}
              </span>
            ) : null}
            <code>{segment.text}</code>
          </pre>
        ) : (
          <Prose key={i} text={segment.text} />
        ),
      )}
    </div>
  );
}

/** Which speaker a kind belongs to. An unknown kind keeps its own name rather than being hidden. */
function speaker(kind: string, agentName: string): string {
  if (kind === "user") return "You";
  if (kind === "agent" || kind === "agent_message_chunk") return agentName;
  if (kind === "thought" || kind === "agent_thought_chunk") return "Thinking";
  if (kind === "tool" || kind === "tool_call") return "Tool";
  if (kind === "system") return "System";
  if (kind === "error") return "Error";
  return kind;
}

/**
 * A tool call: one compact row, not a message.
 *
 * The agent did not say this, it did it, and giving it the same weight as speech is how a
 * conversation turns back into a log.
 */
function ToolRow({ entry }: { entry: TranscriptEntry }) {
  const failed = entry.status === "failed" || entry.status === "error";
  return (
    <div
      data-testid="transcript-tool"
      className="flex items-baseline gap-2 font-mono text-[11px] text-ink-faint"
    >
      <span className={failed ? "text-status-failed-ink" : "text-accent"} aria-hidden="true">
        ●
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.text}</span>
      {/* The word as well as the colour: a status shown only as a dot says nothing to a reader who
          cannot see it. */}
      {entry.status ? (
        <span className={failed ? "text-status-failed-ink" : "text-ink-ghost"}>{entry.status}</span>
      ) : null}
    </div>
  );
}

export function Transcript({
  entries,
  agentName,
}: {
  entries: TranscriptEntry[];
  agentName: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const kind = entry.kind;
        const text = entry.text ?? "";

        if (kind === "tool" || kind === "tool_call") {
          return <ToolRow key={entry.seq} entry={entry} />;
        }

        if (kind === "system" || kind === "error") {
          return (
            <p
              key={entry.seq}
              data-testid="transcript-line"
              className={`rounded border-l-2 py-0.5 pl-2 text-[12px] ${
                kind === "error"
                  ? "border-status-failed-ink text-status-failed-ink"
                  : "border-border-strong text-ink-faint"
              }`}
            >
              <MentionText text={text} />
            </p>
          );
        }

        const thinking = kind === "thought" || kind === "agent_thought_chunk";
        const you = kind === "user";
        return (
          <div key={entry.seq} data-testid="transcript-line" data-kind={kind}>
            <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
              {speaker(kind, agentName)}
            </div>
            <div
              className={`text-[13px] leading-relaxed ${
                thinking ? "italic text-ink-ghost" : you ? "text-ink" : "text-ink-muted"
              }`}
            >
              <MessageBody text={text} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
