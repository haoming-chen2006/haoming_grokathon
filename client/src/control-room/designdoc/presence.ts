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
 *
 * **Presence never gates an action.** Nothing in this module returns a permission, and no control
 * built on it is disabled because of what it says. It is a view of what agents claim, and a view
 * that quietly became a lock would let one stale report block a person from their own document.
 */
import type { AgentView } from "../agents/types";

/** A claim an agent made about where it was working. Never treated as ground truth. */
export interface PresenceReport {
  agentId: string;
  agentName: string;
  /** The agent's role, for the entry's second field. Omitted when the record does not say. */
  role?: string;
  /** What this agent has cost. Absent means never priced — it does NOT mean zero. */
  costUsd?: number;
  /**
   * Which of the six work-area colours this agent's highlight uses.
   *
   * OPTIONAL, and absent is the ordinary case today: an agent record carries no area, so nothing
   * can say which colour is its. An entry with no area index is drawn in neutral ink rather than
   * being assigned a hue it has not earned — a colour that means "area" must come from an area.
   */
  areaIndex?: 1 | 2 | 3 | 4 | 5 | 6;
  /** The area's name, for the entry's chip. Omitted with the index, for the same reason. */
  areaName?: string;
  /** The verb the agent claimed — "writing", "reading". Omitted when it did not say. */
  kind?: string;
  /** What the agent said it was doing, in its own words. Optional — omitted, never invented. */
  activity?: string;
  /** The reported range. Undefined when the agent is alive but has not said where. */
  lines?: { from: number; to: number };
  /**
   * When the claim was made.
   *
   * OPTIONAL. An agent can be demonstrably inside a document — its own activity names the file —
   * while nothing timestamps that fact. Rendering a missing timestamp as "now" would be the worst
   * possible fabrication on this page, so an absent one makes the state `unknown` instead.
   */
  reportedAt?: number;
  /** Whether the ACP session is still running. From the session manager, not from the report. */
  sessionRunning: boolean;
  /**
   * The document version the claim was made against. When the document moves, every range reported
   * against an older version is not merely old — it points at the wrong text.
   *
   * OPTIONAL: a report that makes no version claim cannot be wrong about one, so the check is
   * skipped rather than failed. A report that DOES claim a version is held to it.
   */
  documentVersion?: number;
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
  if (report.documentVersion !== undefined && report.documentVersion !== docVersion) return "unknown";
  if (!report.lines) return "unknown";
  // Alive, positioned, and nothing says when. Not "now" — unknown.
  if (report.reportedAt === undefined) return "unknown";

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

/**
 * The one-word freshness the mockup prints beside the verb: "WRITING · FRESH 8s".
 *
 * It is the presence AGE, and nothing else — not a health check, not a permission. An entry marked
 * STALE is an entry whose claim is old; the agent behind it may be perfectly busy.
 */
export type PresenceFreshness = "FRESH" | "STALE" | "ENDED" | "UNKNOWN";

export const FRESHNESS: Record<PresenceState, PresenceFreshness> = {
  live: "FRESH",
  stale: "STALE",
  ended: "ENDED",
  unknown: "UNKNOWN",
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
  const age = report.reportedAt === undefined ? undefined : elapsed(report.reportedAt, now);
  const range = report.lines ? `lines ${report.lines.from}–${report.lines.to}` : undefined;

  switch (state) {
    case "live":
      return range ? `working in ${range}` : "working now";
    case "stale":
      return range
        ? `last reported ${range}${age ? `, ${age} ago` : ""}`
        : `last reported${age ? ` ${age} ago` : ""}`;
    case "unknown":
      return "working in this document but has not reported which lines";
    case "ended":
      return range
        ? `finished — last worked in ${range}${age ? `, ${age} ago` : ""}`
        : `finished${age ? ` ${age} ago` : ""}`;
  }
}

// ───────────────────────────────────────────────── where reports actually come from today

/**
 * The document a file path belongs to, as a bare id.
 *
 * `server/routes/designDocs.ts` stores every document at `<docs>/<id>.md`, so a path whose last
 * segment is `<id>.md` names that document. The comparison is on the segment and not on the whole
 * path because an agent reports the path it saw, and that is absolute on its machine.
 */
export function documentIdOfPath(path: string): string | undefined {
  const file = path.split(/[\\/]/).pop();
  if (!file || !file.endsWith(".md")) return undefined;
  return file.slice(0, -3);
}

/**
 * Who is in this document, derived from what agents actually report.
 *
 * **There is no presence service.** `server/services/presence.ts` and the `report_document_focus`
 * tool named in the design do not exist, so nothing on the server says "agent X is in document Y
 * at lines N–M". What DOES exist is `AgentActivity.latestFile` — the last file an agent touched,
 * reported by the agent itself — and a document that lives at a known path. An agent whose own
 * latest file IS this document is in this document; that is a derivation from two real fields, not
 * a guess.
 *
 * What it cannot produce is the LINE RANGE, so every report from here is positionless and lands in
 * the `unknown` state: alive, in this document, has not said where. Nothing is highlighted in the
 * body for it, which is exactly right — a highlight needs a position, and there is none. The line
 * range is filed in loops/handoff/pivot-frontend.md; the day it arrives, `lines` is set here and
 * the body highlight that is already built starts drawing.
 *
 * A previous version of this page filled the gap with `mockPresence.ts`. That file is deleted: a
 * page that looks inhabited and is not hides the fact that nothing is wired.
 */
export function reportsFromAgents(agents: AgentView[], documentId: string): PresenceReport[] {
  const reports: PresenceReport[] = [];
  for (const agent of agents) {
    const path = agent.activity?.latestFile;
    if (!path || documentIdOfPath(path) !== documentId) continue;
    const parsed = agent.activity?.updatedAt ? Date.parse(agent.activity.updatedAt) : undefined;
    reports.push({
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      costUsd: agent.costUsd,
      kind: agent.activity?.tool,
      activity: agent.statusDetail ?? agent.activity?.command,
      reportedAt: parsed === undefined || Number.isNaN(parsed) ? undefined : parsed,
      // The session is what makes presence live. An agent that finished or failed is in the
      // document's history, not in the document.
      sessionRunning: agent.status !== "complete" && agent.status !== "failed",
    });
  }
  return reports;
}
