/**
 * Presence, measured — the part of this product most likely to be built dishonestly.
 *
 * Two things are being held to account. The encoding: four states, each distinguished by a stroke
 * and a word rather than by a hue, and only two of them ever claim a position in the document. And
 * the derivation: where reports come from now that `mockPresence.ts` is deleted — an agent's own
 * reported file, and nothing else.
 */
import { describe, expect, test } from "bun:test";
import {
  FRESHNESS,
  LIVE_WINDOW_MS,
  PRESENCE_ENCODING,
  STALE_WINDOW_MS,
  documentIdOfPath,
  drawsHighlight,
  elapsed,
  presenceCaption,
  presenceState,
  reportsFromAgents,
  type PresenceReport,
  type PresenceState,
} from "./presence";
import type { AgentView, DocumentFocusView } from "../agents/types";

const NOW = 1_700_000_000_000;

const report = (extra: Partial<PresenceReport> = {}): PresenceReport => ({
  agentId: "agent_scribe",
  agentName: "Scribe",
  lines: { from: 12, to: 19 },
  reportedAt: NOW - 8_000,
  sessionRunning: true,
  ...extra,
});

describe("the four states", () => {
  test("a fresh, positioned claim from a running session is live", () => {
    expect(presenceState(report(), 0, NOW)).toBe("live");
  });

  test("a claim older than the live window is stale, not gone", () => {
    expect(presenceState(report({ reportedAt: NOW - LIVE_WINDOW_MS - 1 }), 0, NOW)).toBe("stale");
  });

  test("a claim older than the stale window has ended", () => {
    expect(presenceState(report({ reportedAt: NOW - STALE_WINDOW_MS - 1 }), 0, NOW)).toBe("ended");
  });

  test("a stopped session has ended however fresh the claim is", () => {
    expect(presenceState(report({ sessionRunning: false, reportedAt: NOW }), 0, NOW)).toBe("ended");
  });

  test("alive with no position is unknown — the state that costs a row and buys trust", () => {
    expect(presenceState(report({ lines: undefined }), 0, NOW)).toBe("unknown");
  });

  test("alive, positioned, and nothing says when: unknown, never 'now'", () => {
    expect(presenceState(report({ reportedAt: undefined }), 0, NOW)).toBe("unknown");
  });

  test("a claim against an older document is unknown, because its lines point at the wrong text", () => {
    // Version before TTL: no amount of elapsed time makes a wrong range right.
    expect(presenceState(report({ documentVersion: 1 }), 2, NOW)).toBe("unknown");
  });

  test("a report making no version claim cannot be wrong about one", () => {
    expect(presenceState(report({ documentVersion: undefined }), 7, NOW)).toBe("live");
  });
});

describe("only a positioned, current claim draws on the document", () => {
  test("live and stale draw; unknown and ended do not", () => {
    const states: PresenceState[] = ["live", "stale", "unknown", "ended"];
    expect(states.map(drawsHighlight)).toEqual([true, true, false, false]);
  });

  test("every state differs by stroke as well as by colour, and carries a word", () => {
    const states: PresenceState[] = ["live", "stale", "unknown", "ended"];
    for (const s of states) {
      expect(PRESENCE_ENCODING[s].label.length).toBeGreaterThan(0);
      expect(["filled", "dashed", "dotted"]).toContain(PRESENCE_ENCODING[s].stroke);
    }
    // live and stale — the two that draw — must be told apart without colour.
    expect(PRESENCE_ENCODING.live.stroke).not.toBe(PRESENCE_ENCODING.stale.stroke);
  });

  test("every state has a one-word freshness for the entry's mono line", () => {
    expect(FRESHNESS).toEqual({ live: "FRESH", stale: "STALE", ended: "ENDED", unknown: "UNKNOWN" });
  });
});

describe("the caption never invents a range or an age", () => {
  test("live is present tense, and names the range", () => {
    expect(presenceCaption(report(), "live", NOW)).toBe("working in lines 12–19");
  });

  test("stale is past tense, and says how old", () => {
    const r = report({ reportedAt: NOW - 4 * 60_000 });
    expect(presenceCaption(r, "stale", NOW)).toBe("last reported lines 12–19, 4m ago");
  });

  test("unknown admits it, rather than printing a range it does not have", () => {
    expect(presenceCaption(report({ lines: undefined }), "unknown", NOW)).toBe(
      "working in this document but has not reported which lines",
    );
  });

  test("with no timestamp, no age is printed — not '0s'", () => {
    const caption = presenceCaption(report({ reportedAt: undefined }), "stale", NOW);
    expect(caption).toBe("last reported lines 12–19");
    expect(caption).not.toContain("0s");
  });

  test("ages are whole units — a presence age is not a stopwatch", () => {
    expect(elapsed(NOW - 8_000, NOW)).toBe("8s");
    expect(elapsed(NOW - 4 * 60_000, NOW)).toBe("4m");
    expect(elapsed(NOW - 3 * 3_600_000, NOW)).toBe("3h");
    expect(elapsed(NOW + 5_000, NOW)).toBe("0s");
  });
});

describe("which document a path names", () => {
  test("the last segment, without its extension", () => {
    expect(documentIdOfPath("/Users/x/docs/chair_launch_plan.md")).toBe("chair_launch_plan");
    expect(documentIdOfPath("chair_launch_plan.md")).toBe("chair_launch_plan");
  });

  test("anything that is not a markdown file names no document", () => {
    expect(documentIdOfPath("/Users/x/src/index.ts")).toBeUndefined();
    expect(documentIdOfPath("")).toBeUndefined();
  });
});

describe("where reports come from, now that the mock is deleted", () => {
  const agent = (id: string, extra: Partial<AgentView> = {}): AgentView => ({
    id,
    name: id,
    role: "writer",
    status: "working",
    ...extra,
  });

  test("an agent whose own latest file IS this document is in this document", () => {
    const inside = agent("agent_scribe", {
      name: "Scribe",
      statusDetail: "Rewriting the opening claim",
      costUsd: 0.31,
      activity: {
        latestFile: "/docs/chair_launch_plan.md",
        tool: "write",
        updatedAt: new Date(NOW).toISOString(),
      },
    });
    const [r] = reportsFromAgents([inside], "chair_launch_plan");
    expect(r.agentName).toBe("Scribe");
    expect(r.role).toBe("writer");
    expect(r.costUsd).toBe(0.31);
    expect(r.kind).toBe("write");
    expect(r.activity).toBe("Rewriting the opening claim");
    expect(r.reportedAt).toBe(NOW);
    expect(r.sessionRunning).toBe(true);
  });

  test("it carries NO line range, so nothing is highlighted in the body", () => {
    const inside = agent("a", { activity: { latestFile: "chair_launch_plan.md" } });
    const [r] = reportsFromAgents([inside], "chair_launch_plan");
    expect(r.lines).toBeUndefined();
    expect(presenceState(r, 0, NOW)).toBe("unknown");
    expect(drawsHighlight(presenceState(r, 0, NOW))).toBe(false);
  });

  test("it carries no area, so it is not coloured as one", () => {
    const inside = agent("a", { activity: { latestFile: "chair_launch_plan.md" } });
    expect(reportsFromAgents([inside], "chair_launch_plan")[0].areaIndex).toBeUndefined();
  });

  test("an agent working in another document is not in this one", () => {
    const elsewhere = agent("a", { activity: { latestFile: "/docs/showroom_plan.md" } });
    expect(reportsFromAgents([elsewhere], "chair_launch_plan")).toEqual([]);
  });

  test("an agent that reported no file is in no document at all", () => {
    expect(reportsFromAgents([agent("a"), agent("b", { activity: {} })], "chair_launch_plan")).toEqual([]);
  });

  test("a finished or failed agent is in the document's history, not in the document", () => {
    const done = agent("a", { status: "complete", activity: { latestFile: "chair_launch_plan.md" } });
    const broke = agent("b", { status: "failed", activity: { latestFile: "chair_launch_plan.md" } });
    const reports = reportsFromAgents([done, broke], "chair_launch_plan");
    expect(reports.map((r) => r.sessionRunning)).toEqual([false, false]);
    expect(reports.map((r) => presenceState(r, 0, NOW))).toEqual(["ended", "ended"]);
  });

  test("an unparseable timestamp becomes no timestamp, never NaN and never now", () => {
    const odd = agent("a", { activity: { latestFile: "chair_launch_plan.md", updatedAt: "whenever" } });
    expect(reportsFromAgents([odd], "chair_launch_plan")[0].reportedAt).toBeUndefined();
  });

  test("no agents is no reports — the ordinary state of a fresh install", () => {
    expect(reportsFromAgents([], "chair_launch_plan")).toEqual([]);
  });
});

/**
 * The second source: a claim the agent made on purpose, through `report_document_focus`.
 *
 * This is the only thing on the page that can put colour over a user's prose, so the assertions
 * below are about what must NOT be drawn as much as what must: a claim for another document, a
 * range that covers nothing, a claim with no timestamp, and a claim measured against text that has
 * since changed.
 */
describe("a focus claim is what puts a highlight on the text", () => {
  const agent = (id: string, extra: Partial<AgentView> = {}): AgentView => ({
    id,
    name: id,
    role: "writer",
    status: "working",
    ...extra,
  });

  const claiming = (extra: Partial<DocumentFocusView> = {}) =>
    agent("agent_scribe", {
      name: "Scribe",
      activity: {
        documentFocus: {
          documentId: "chair_launch_plan",
          from: 12,
          to: 19,
          kind: "writing",
          reportedAt: new Date(NOW - 8_000).toISOString(),
          ...extra,
        },
      },
    });

  test("the claimed range reaches the report, and the report is live", () => {
    const [r] = reportsFromAgents([claiming()], "chair_launch_plan");
    expect(r.lines).toEqual({ from: 12, to: 19 });
    expect(r.kind).toBe("writing");
    expect(r.reportedAt).toBe(NOW - 8_000);
    expect(presenceState(r, 0, NOW)).toBe("live");
    expect(drawsHighlight(presenceState(r, 0, NOW))).toBe(true);
  });

  test("a claim for another document does not place the agent in this one", () => {
    const elsewhere = claiming({ documentId: "showroom_plan" });
    expect(reportsFromAgents([elsewhere], "chair_launch_plan")).toEqual([]);
  });

  test("the version the claim was measured against travels with it", () => {
    const [r] = reportsFromAgents([claiming({ documentVersion: 3 })], "chair_launch_plan");
    expect(r.documentVersion).toBe(3);
    expect(presenceState(r, 3, NOW)).toBe("live");
  });

  test("a claim against an OLDER document is not drawn — its lines point at the wrong text", () => {
    const [r] = reportsFromAgents([claiming({ documentVersion: 3 })], "chair_launch_plan");
    expect(presenceState(r, 7, NOW)).toBe("unknown");
    expect(drawsHighlight(presenceState(r, 7, NOW))).toBe(false);
  });

  test("a claim that named no version carries none, rather than a fabricated 0", () => {
    const [r] = reportsFromAgents([claiming()], "chair_launch_plan");
    expect(r.documentVersion).toBeUndefined();
    // A version of 0 would be compared against the document's and fail, hiding a live agent.
    expect(presenceState(r, 7, NOW)).toBe("live");
  });

  test("a claim with no timestamp of its own is positioned but not fresh", () => {
    const [r] = reportsFromAgents([claiming({ reportedAt: undefined })], "chair_launch_plan");
    expect(r.lines).toEqual({ from: 12, to: 19 });
    expect(r.reportedAt).toBeUndefined();
    expect(presenceState(r, 0, NOW)).toBe("unknown");
  });

  test("the claim's own age is used, never the age of the agent's last activity", () => {
    // The agent claimed lines ten minutes ago and has been busy elsewhere since. `updatedAt` moved;
    // the claim did not. Reading `updatedAt` here would paint a ten-minute-old range as "working
    // now" over prose the agent has not looked at since.
    const stale = agent("a", {
      activity: {
        latestFile: "chair_launch_plan.md",
        updatedAt: new Date(NOW).toISOString(),
        documentFocus: {
          documentId: "chair_launch_plan",
          from: 12,
          to: 19,
          reportedAt: new Date(NOW - 5 * 60_000).toISOString(),
        },
      },
    });
    const [r] = reportsFromAgents([stale], "chair_launch_plan");
    expect(r.reportedAt).toBe(NOW - 5 * 60_000);
    expect(presenceState(r, 0, NOW)).toBe("stale");
  });

  test("only latestFile matches, so the report is still positionless — the old path is intact", () => {
    const byFile = agent("a", {
      activity: { latestFile: "/docs/chair_launch_plan.md", tool: "write", updatedAt: new Date(NOW).toISOString() },
    });
    const [r] = reportsFromAgents([byFile], "chair_launch_plan");
    expect(r.lines).toBeUndefined();
    expect(r.kind).toBe("write");
    expect(r.reportedAt).toBe(NOW);
    expect(presenceState(r, 0, NOW)).toBe("unknown");
  });

  test("a nonsense range is dropped to positionless rather than washing nothing in silence", () => {
    // Each of these arrives from the network as a plain JSON object; none of them can be drawn.
    const bad = [
      claiming({ from: 0, to: 4 }),
      claiming({ to: 3 }),
      claiming({ from: Number.NaN }),
      claiming({ to: "nineteen" as unknown as number }),
    ];
    for (const one of bad) {
      const [r] = reportsFromAgents([{ ...one, activity: { ...one.activity, latestFile: "chair_launch_plan.md" } }], "chair_launch_plan");
      expect(r.lines).toBeUndefined();
      expect(presenceState(r, 0, NOW)).toBe("unknown");
    }
  });

  test("a claim from a finished agent is history, not presence", () => {
    const done = { ...claiming(), status: "complete" };
    const [r] = reportsFromAgents([done], "chair_launch_plan");
    expect(r.sessionRunning).toBe(false);
    expect(presenceState(r, 0, NOW)).toBe("ended");
  });
});
