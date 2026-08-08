/**
 * One agent inside a document — the entry `design/mockups/design-document.html` draws in its
 * AGENTS IN THIS DOCUMENT column.
 *
 * "Scribe · writer · $0.31 · WRITING · FRESH 8s · lines 12–19 · Rewriting the opening claim", plus
 * the area it belongs to and the controls. Every one of those is a field of the report, and every
 * one is omitted when the report does not carry it. There is no branch here that invents a range,
 * an age, an area or a price.
 *
 * **Presence is a view, not a lock.** Nothing on this entry is disabled because a claim went
 * stale. The only control with a gate is Pause, and its gate is whether a session is running —
 * a session fact, not a presence one. A stale report blocking a person from their own document is
 * the failure this note exists to prevent.
 */
import { Money } from "../agents/AgentCard";
import {
  FRESHNESS,
  PRESENCE_ENCODING,
  elapsed,
  presenceCaption,
  type PresenceReport,
  type PresenceState,
} from "./presence";

/** Written out one literal at a time: Tailwind reads source text, not computed class names. */
const AREA_TEXT = ["text-area-1", "text-area-2", "text-area-3", "text-area-4", "text-area-5", "text-area-6"];
const AREA_BORDER = [
  "border-area-1",
  "border-area-2",
  "border-area-3",
  "border-area-4",
  "border-area-5",
  "border-area-6",
];
const AREA_GUTTER = [
  "bg-gutter-area-1",
  "bg-gutter-area-2",
  "bg-gutter-area-3",
  "bg-gutter-area-4",
  "bg-gutter-area-5",
  "bg-gutter-area-6",
];

/** An entry with no area is drawn in neutral ink: a hue that means "area" must come from an area. */
export const areaText = (i?: number) => (i ? AREA_TEXT[i - 1] : "text-ink");
export const areaBorder = (i?: number) => (i ? AREA_BORDER[i - 1] : "border-border-strong");
export const areaGutter = (i?: number) => (i ? AREA_GUTTER[i - 1] : "");

/**
 * The 9px marker.
 *
 * Colour says *which agent*; the stroke says *what state*. Filled, dashed and dotted are three
 * different shapes at 9px, so the four states survive greyscale, and every one of them is written
 * out in words beside it. The marker itself is aria-hidden — the caption carries the meaning.
 */
export function Marker({ state, areaIndex }: { state: PresenceState; areaIndex?: number }) {
  const enc = PRESENCE_ENCODING[state];
  const stroke =
    enc.stroke === "filled" ? "border-solid" : enc.stroke === "dashed" ? "border-dashed" : "border-dotted";
  return (
    <span
      aria-hidden="true"
      data-testid={`marker-${state}`}
      className={`inline-block h-[9px] w-[9px] shrink-0 rounded-full border ${stroke} ${areaBorder(
        areaIndex,
      )} ${enc.filled ? `bg-current ${areaText(areaIndex)}` : ""}`}
    />
  );
}

/** The legend. The wireframe carries one and it is the reason its encoding reads at a glance. */
export function PresenceKey() {
  const rows: PresenceState[] = ["live", "stale", "unknown", "ended"];
  return (
    <div data-testid="presence-key" className="flex flex-col gap-1.5 border-t border-border pt-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Key</div>
      {rows.map((s) => (
        <div key={s} className="flex items-center gap-2 text-[12px] text-ink-faint">
          <Marker state={s} areaIndex={1} />
          <span>
            {PRESENCE_ENCODING[s].label} — {PRESENCE_ENCODING[s].stroke}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface PresenceEntryProps {
  report: PresenceReport;
  state: PresenceState;
  /** The moment the page is reading. Passed in so an age is never computed twice differently. */
  now: number;
  busy?: boolean;
  onOpen?(agentId: string): void;
  onPause?(agentId: string): void;
}

export function PresenceEntry({ report, state, now, busy, onOpen, onPause }: PresenceEntryProps) {
  const enc = PRESENCE_ENCODING[state];
  const edge =
    enc.stroke === "filled" ? "border-solid" : enc.stroke === "dashed" ? "border-dashed" : "border-dotted";
  // "WRITING · FRESH 8s". The verb is the agent's own word when it gave one; otherwise the state's
  // word, which describes what the product knows rather than making a claim on the agent's behalf.
  const verb = (report.kind ?? enc.label).toUpperCase();
  const age = report.reportedAt === undefined ? undefined : elapsed(report.reportedAt, now);

  return (
    <div
      data-testid={`presence-${report.agentId}`}
      data-state={state}
      className={`flex flex-col gap-1.5 rounded-[7px] border border-l-4 p-2.5 text-[13px] ${edge} ${areaBorder(
        report.areaIndex,
      )} ${areaGutter(report.areaIndex)}`}
    >
      <div className="flex items-baseline gap-2">
        <span data-testid="presence-name" className={`text-[15px] ${areaText(report.areaIndex)}`}>
          {report.agentName}
        </span>
        {report.role ? (
          <span data-testid="presence-role" className="text-[12px] text-ink-ghost">
            {report.role}
          </span>
        ) : null}
        <span className="flex-1" />
        <span data-testid="presence-cost" className="font-mono text-[11px]">
          <Money usd={report.costUsd} />
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Marker state={state} areaIndex={report.areaIndex} />
        <span
          data-testid="presence-state"
          className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted"
        >
          {verb} · {FRESHNESS[state]}
          {age ? ` ${age}` : ""}
        </span>
      </div>

      {/* No range is ever printed for a report that has none — not "lines ?", not "lines 0–0". */}
      {report.lines ? (
        <div data-testid="presence-lines" className="font-mono text-[11px] text-ink-muted">
          lines {report.lines.from}–{report.lines.to}
          {state === "stale" ? " (last reported)" : ""}
        </div>
      ) : (
        <div data-testid="presence-no-lines" className="text-[12px] text-ink-faint">
          {presenceCaption(report, state, now)}
        </div>
      )}

      {report.activity ? (
        <div data-testid="presence-activity" className="text-[12px] text-ink-faint">
          {report.activity}
        </div>
      ) : null}

      {report.areaName ? (
        <div>
          <span
            data-testid="presence-area"
            className="rounded-[9px] border border-border px-2 py-px text-[12px] text-ink-faint"
          >
            {report.areaName}
          </span>
        </div>
      ) : null}

      {onOpen || onPause ? (
        <div className="flex gap-1.5 text-[12px]">
          {onOpen ? (
            <button
              type="button"
              data-testid={`presence-open-${report.agentId}`}
              onClick={() => onOpen(report.agentId)}
              title={`Open ${report.agentName}`}
              className="rounded-[5px] border border-border px-2 py-[3px] text-ink-faint hover:bg-surface-hover"
            >
              Open
            </button>
          ) : null}
          {onPause ? (
            <button
              type="button"
              data-testid={`presence-pause-${report.agentId}`}
              onClick={() => onPause(report.agentId)}
              // Gated on the SESSION, never on the freshness of the claim above it.
              disabled={!report.sessionRunning || busy}
              title={
                report.sessionRunning
                  ? busy
                    ? "Another action is still running"
                    : `Pause ${report.agentName}`
                  : "This agent's session has ended, so there is nothing to pause"
              }
              className="rounded-[5px] border border-border px-2 py-[3px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
            >
              Pause
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
