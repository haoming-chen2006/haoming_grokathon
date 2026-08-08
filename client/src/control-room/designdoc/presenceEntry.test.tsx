/**
 * The presence entry, against one hand-made report.
 *
 * The record below is Scribe, the first entry in `design/mockups/design-document.html`, written out
 * field by field. It lives in this file and nowhere else — that is the whole point of the exercise
 * now that `mockPresence.ts` is gone.
 *
 * The last suite is the one that matters most: presence is a VIEW, not a lock. A claim going stale
 * must never disable anything, because the alternative is one four-minute-old report standing
 * between a person and their own document.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PresenceEntry } from "./PresenceEntry";
import type { PresenceReport } from "./presence";

afterEach(cleanup);

const NOW = 1_700_000_000_000;

/** design/mockups/design-document.html, the "WRITING · FRESH 8s" entry. Never shipped. */
const SCRIBE: PresenceReport = {
  agentId: "agent_scribe",
  agentName: "Scribe",
  role: "writer",
  costUsd: 0.31,
  areaIndex: 1,
  areaName: "Pitch materials",
  kind: "writing",
  activity: "Rewriting the opening claim",
  lines: { from: 12, to: 19 },
  reportedAt: NOW - 8_000,
  sessionRunning: true,
};

function renderEntry(report: PresenceReport, props: Partial<Parameters<typeof PresenceEntry>[0]> = {}) {
  render(<PresenceEntry report={report} state="live" now={NOW} {...props} />);
  return screen.getByTestId(`presence-${report.agentId}`);
}

describe("one report, rendered as the mockup draws it", () => {
  test("name, role, cost, the state line, the range and the activity", () => {
    const entry = renderEntry(SCRIBE);
    expect(within(entry).getByTestId("presence-name").textContent).toBe("Scribe");
    expect(within(entry).getByTestId("presence-role").textContent).toBe("writer");
    expect(within(entry).getByTestId("presence-cost").textContent).toBe("$0.31");
    expect(within(entry).getByTestId("presence-state").textContent).toBe("WRITING · FRESH 8s");
    expect(within(entry).getByTestId("presence-lines").textContent).toBe("lines 12–19");
    expect(within(entry).getByTestId("presence-activity").textContent).toBe("Rewriting the opening claim");
    expect(within(entry).getByTestId("presence-area").textContent).toBe("Pitch materials");
  });

  test("a stale claim says STALE, its age, and that the range is the last one reported", () => {
    const entry = renderEntry({ ...SCRIBE, reportedAt: NOW - 4 * 60_000 }, { state: "stale" });
    expect(within(entry).getByTestId("presence-state").textContent).toBe("WRITING · STALE 4m");
    expect(within(entry).getByTestId("presence-lines").textContent).toBe("lines 12–19 (last reported)");
  });

  test("the marker's stroke differs by state, so the four survive greyscale", () => {
    render(<PresenceEntry report={SCRIBE} state="live" now={NOW} />);
    expect(screen.getByTestId("marker-live").className).toContain("border-solid");
    cleanup();
    render(<PresenceEntry report={SCRIBE} state="stale" now={NOW} />);
    expect(screen.getByTestId("marker-stale").className).toContain("border-dashed");
    cleanup();
    render(<PresenceEntry report={SCRIBE} state="unknown" now={NOW} />);
    expect(screen.getByTestId("marker-unknown").className).toContain("border-dotted");
  });
});

describe("an absent field draws nothing", () => {
  /** What `reportsFromAgents` actually produces today: no range, no area, no price. */
  const DERIVED: PresenceReport = {
    agentId: "agent_nib",
    agentName: "Nib",
    role: "writer",
    sessionRunning: true,
  };

  test("no range prints the admission instead, never 'lines ?' and never 'lines 0–0'", () => {
    const entry = renderEntry(DERIVED, { state: "unknown" });
    expect(within(entry).queryByTestId("presence-lines")).toBeNull();
    expect(within(entry).getByTestId("presence-no-lines").textContent).toBe(
      "working in this document but has not reported which lines",
    );
  });

  test("no price says unknown, and never $0.00", () => {
    const entry = renderEntry(DERIVED, { state: "unknown" });
    expect(within(entry).getByTestId("presence-cost").textContent).toBe("unknown");
  });

  test("no area draws no area chip — a hue that means 'area' must come from an area", () => {
    const entry = renderEntry(DERIVED, { state: "unknown" });
    expect(within(entry).queryByTestId("presence-area")).toBeNull();
  });

  test("no timestamp prints the state word with no age beside it", () => {
    const entry = renderEntry(DERIVED, { state: "unknown" });
    expect(within(entry).getByTestId("presence-state").textContent).toBe("POSITION UNKNOWN · UNKNOWN");
  });

  test("no activity draws no activity line", () => {
    const entry = renderEntry(DERIVED, { state: "unknown" });
    expect(within(entry).queryByTestId("presence-activity")).toBeNull();
  });
});

describe("presence is a view, not a lock", () => {
  test("a stale claim disables nothing", () => {
    const entry = renderEntry(
      { ...SCRIBE, reportedAt: NOW - 5 * 60_000 },
      { state: "stale", onOpen: () => {}, onPause: () => {} },
    );
    const open = within(entry).getByTestId(`presence-open-${SCRIBE.agentId}`) as HTMLButtonElement;
    const pause = within(entry).getByTestId(`presence-pause-${SCRIBE.agentId}`) as HTMLButtonElement;
    expect([open.disabled, pause.disabled]).toEqual([false, false]);
  });

  test("an unknown position disables nothing either", () => {
    const entry = renderEntry(
      { ...SCRIBE, lines: undefined },
      { state: "unknown", onOpen: () => {}, onPause: () => {} },
    );
    expect(
      (within(entry).getByTestId(`presence-pause-${SCRIBE.agentId}`) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("the ONE gate is the session, and it says so", () => {
    const entry = renderEntry(
      { ...SCRIBE, sessionRunning: false },
      { state: "ended", onOpen: () => {}, onPause: () => {} },
    );
    const pause = within(entry).getByTestId(`presence-pause-${SCRIBE.agentId}`) as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
    expect(pause.getAttribute("title")).toBe(
      "This agent's session has ended, so there is nothing to pause",
    );
  });

  test("Open reports the agent it belongs to", () => {
    let opened: string | undefined;
    const entry = renderEntry(SCRIBE, { onOpen: (id) => (opened = id) });
    fireEvent.click(within(entry).getByTestId(`presence-open-${SCRIBE.agentId}`));
    expect(opened).toBe("agent_scribe");
  });
});
