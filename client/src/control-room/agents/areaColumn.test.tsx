/**
 * The area column — the container, against one hand-made area and one hand-made agent.
 *
 * Two things are being proved. First, that a column HOLDING something looks the way
 * `design/mockups/agents-page.html` draws it: the glyph, the name, the milestone line, the spend,
 * and the cards. Second, and more important on a fresh install, that a column holding NOTHING says
 * so — and that no row, card or figure appears that no record supplied.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AreaColumn } from "./AreaColumn";
import type { AgentView, AreaView } from "./types";

afterEach(cleanup);

/** design/mockups/agents-page.html, the "Pitch materials" column. Test-only, never shipped. */
const PITCH: AreaView = {
  id: "area_pitch",
  projectId: "p1",
  name: "Pitch materials",
  colorToken: "purple",
  glyph: "◆",
  milestoneId: "m1",
  ownerAgentId: "agent_scribe",
  status: "working",
  statusPresentation: { status: "working", label: "Working" },
  tasksTotal: 2,
  tasksComplete: 0,
};

const SCRIBE: AgentView = {
  id: "agent_scribe",
  name: "Scribe",
  role: "writer",
  status: "working",
  statusDetail: "Rewriting the opening claim",
  costUsd: 0.31,
};

const noop = () => {};

describe("a column with something in it", () => {
  test("it states its name, its glyph, its milestone and its spend", () => {
    render(
      <AreaColumn
        area={PITCH}
        milestoneName="Deck and brief ready Fri"
        agents={[SCRIBE]}
        onSelect={noop}
        onPause={noop}
      />,
    );
    const column = screen.getByTestId(`area-${PITCH.id}`);
    expect(within(column).getByTestId(`area-select-${PITCH.id}`).textContent).toBe("Pitch materials");
    expect(within(column).getByTestId("area-glyph").textContent).toBe("◆");
    expect(within(column).getByTestId("area-milestone").textContent).toBe(
      "Milestone — Deck and brief ready Fri",
    );
    expect(within(column).getByTestId("area-spend").textContent).toBe("$0.31");
  });

  test("the agents inside it are the ones it owns, and nobody else's", () => {
    const stranger: AgentView = { id: "agent_reel", name: "Reel", role: "video maker", status: "idle" };
    render(<AreaColumn area={PITCH} agents={[SCRIBE, stranger]} onSelect={noop} onPause={noop} />);
    const column = screen.getByTestId(`area-${PITCH.id}`);
    expect(within(column).getByTestId(`agent-card-${SCRIBE.id}`)).toBeTruthy();
    expect(within(column).queryByTestId(`agent-card-${stranger.id}`)).toBeNull();
  });

  test("a milestone the plan does not name draws no milestone line, rather than an empty one", () => {
    render(<AreaColumn area={PITCH} agents={[SCRIBE]} onSelect={noop} onPause={noop} />);
    expect(within(screen.getByTestId(`area-${PITCH.id}`)).queryByTestId("area-milestone")).toBeNull();
  });

  test("with nobody priced, the spend is unknown rather than $0.00", () => {
    const unpriced = { ...SCRIBE, costUsd: undefined };
    render(<AreaColumn area={PITCH} agents={[unpriced]} onSelect={noop} onPause={noop} />);
    expect(within(screen.getByTestId(`area-${PITCH.id}`)).getByTestId("area-spend").textContent).toBe(
      "unknown",
    );
  });

  test("an area pointing at an agent that no longer exists says so out loud", () => {
    render(
      <AreaColumn
        area={{ ...PITCH, ownerAgentId: undefined, unresolvedOwnerAgentId: "agent_gone" }}
        agents={[]}
        onSelect={noop}
        onPause={noop}
      />,
    );
    expect(screen.getByTestId("area-unresolved-owner").textContent).toContain("agent_gone");
  });
});

describe("a column with nothing in it", () => {
  /** The ordinary state on a fresh install: an area exists, nobody is hired into it yet. */
  const UNSTAFFED: AreaView = {
    id: "area_numbers",
    projectId: "p1",
    name: "Numbers",
    colorToken: "magenta",
    glyph: "▲",
    status: "unstaffed",
    statusPresentation: { status: "unstaffed", label: "Nobody assigned" },
  };

  test("it says nobody is assigned, in plain language", () => {
    render(<AreaColumn area={UNSTAFFED} agents={[]} onSelect={noop} onPause={noop} />);
    const empty = screen.getByTestId("area-empty");
    expect(empty.textContent).toContain("Nobody assigned");
    expect(empty.textContent).toContain("no agent is hired into this area yet");
  });

  test("no card of any kind is drawn", () => {
    render(<AreaColumn area={UNSTAFFED} agents={[]} onSelect={noop} onPause={noop} />);
    const column = screen.getByTestId(`area-${UNSTAFFED.id}`);
    expect(within(column).queryAllByTestId(/^agent-card-/)).toHaveLength(0);
  });

  test("an empty area still states its own spend as unknown, and never as zero", () => {
    render(<AreaColumn area={UNSTAFFED} agents={[]} onSelect={noop} onPause={noop} />);
    expect(screen.getByTestId("area-spend").textContent).toBe("unknown");
  });

  test("agents exist but none is in THIS area — still empty, never borrowed", () => {
    render(<AreaColumn area={UNSTAFFED} agents={[SCRIBE]} onSelect={noop} onPause={noop} />);
    expect(screen.getByTestId("area-empty")).toBeTruthy();
    expect(screen.queryByTestId(`agent-card-${SCRIBE.id}`)).toBeNull();
  });
});
