/**
 * Presence states — loops/03-design-documents.md §3.8.
 *
 * This is the part of the surface most likely to be built dishonestly, so the whole encoding lives
 * in one file with no JSX in it and is tested on its own.
 *
 * The record's field is `reportedAt`, not `at`. The name is load-bearing: everything rendered from
 * it is a past-tense claim about what an agent *said*, and naming the field after the report rather
 * than after the state is what stops the next person writing "is reading" on a four-minute-old
 * lease.
 */

/** A claim an agent made about where it was working. Never treated as ground truth. */
export interface PresenceReport {
  agentId: string;
  agentName: string;
  /** Which of the six work-area colours this agent's highlight uses. 01-agents owns the binding. */
  areaIndex: 1 | 2 | 3 | 4 | 5 | 6;
  /** What the agent said it was doing, in its own words. Optional — omitted, never invented. */
  activity?: string;
  /** The reported range. Undefined when the agent is alive but has not said where. */
  lines?: { from: number; to: number };
  /** When the claim was made. */
  reportedAt: number;
  /** Whether the ACP session is still running. From the session manager, not from the report. */
  sessionRunning: boolean;
  /**
   * The document version the claim was made against. When the document moves, every range reported
   * against an older version is not merely old — it points at the wrong text.
   */
  documentVersion: number;
}

/**
 * Four states, and only one of them draws a highlight in the document body.
 *
 * `unknown` is the important one. The product knows the agent is alive, because the session is
 * running and the transcript is moving; it does not know where. Saying so costs one row and buys
 * the user's trust in every other highlight on the page. A highlight that keeps its position after
 * the text under it moved is a fabricated value with a colour on it.
 */
export type PresenceState = "live" | "stale" | "unknown" | "ended";

export const LIVE_WINDOW_MS = 90_000;
export const STALE_WINDOW_MS = 10 * 60_000;

export function presenceState(report: PresenceReport, docVersion: number, now: number): PresenceState {
  if (!report.sessionRunning) return "ended";

  // Version first, and before the TTL. A report made against an older document is `unknown` rather
  // than `stale`, because its line numbers are wrong rather than old, and no elapsed time makes a
  // wrong range right.
  if (report.documentVersion !== docVersion) return "unknown";
  if (!report.lines) return "unknown";

  const age = now - report.reportedAt;
  if (age > STALE_WINDOW_MS) return "ended";
  if (age > LIVE_WINDOW_MS) return "stale";
  return "live";
}

/** Only `live` and `stale` put anything in the document body. */
export function drawsHighlight(state: PresenceState): boolean {
  return state === "live" || state === "stale";
}

/**
 * The encoding, stated once.
 *
 * **Never colour alone.** Each state differs from the others by its outline style *and* carries a
 * word, so the four are told apart in greyscale, at 9px, and by a reader who cannot distinguish the
 * six area hues. The wireframe arrived at the same answer independently — solid / dashed / dotted
 * with a written KEY — which is the main reason its treatment was adopted rather than argued with.
 */
export interface PresenceEncoding {
  /** The word shown to the user. Never an id, never a colour name. */
  label: string;
  /** How the marker and the gutter rule are stroked. The non-colour half of the signal. */
  stroke: "filled" | "dashed" | "dotted";
  /** Whether the area colour fills the highlight or only outlines it. */
  filled: boolean;
}

export const PRESENCE_ENCODING: Record<PresenceState, PresenceEncoding> = {
  live: { label: "working now", stroke: "filled", filled: true },
  stale: { label: "last reported", stroke: "dashed", filled: false },
  unknown: { label: "position unknown", stroke: "dotted", filled: false },
  ended: { label: "finished", stroke: "dotted", filled: false },
};

/** "8s" · "4m" · "22m" · "2h". Whole units only — a presence age is not a stopwatch. */
export function elapsed(fromMs: number, now: number): string {
  const s = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/**
 * The sentence under an agent's name, in the tense the state earns.
 *
 * `live` is present tense because a claim 90 seconds old is still a claim about now. Everything
 * else is past tense or an admission. There is no branch here that invents a range.
 */
export function presenceCaption(report: PresenceReport, state: PresenceState, now: number): string {
  const age = elapsed(report.reportedAt, now);
  const range = report.lines ? `lines ${report.lines.from}–${report.lines.to}` : undefined;

  switch (state) {
    case "live":
      return range ? `working in ${range}` : "working now";
    case "stale":
      return range ? `last reported ${range}, ${age} ago` : `last reported ${age} ago`;
    case "unknown":
      return "working in this document but has not reported which lines";
    case "ended":
      return range ? `finished — last worked in ${range}, ${age} ago` : `finished ${age} ago`;
  }
}
