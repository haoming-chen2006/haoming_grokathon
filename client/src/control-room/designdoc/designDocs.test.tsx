/**
 * The DESIGN DOCUMENTS containers — the rail and the document body.
 *
 * The empty cases are the ones that carry the weight here. This page used to fill its presence
 * column from `mockPresence.ts`, so a machine with nothing running showed four busy agents; the
 * assertions below are what stop that coming back.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DesignDocsRail, NEW_DOCUMENT } from "./DesignDocsRail";
import { DocumentSurface } from "./DocumentSurface";
import { documentSpend } from "./index";
import { presenceState, type PresenceReport } from "./presence";
import type { DesignDocView } from "./useDesignDocs";

afterEach(cleanup);

const NOW = 1_700_000_000_000;

/** design/mockups/design-document.html's open document. Test-only, never shipped. */
const PLAN: DesignDocView = {
  id: "chair_launch_plan",
  title: "chair_launch_plan",
  text: ["# Chair launch", "", "The opening claim.", "More of it.", "", "## Numbers", "A price list."].join(
    "\n",
  ),
  lineCount: 7,
  sections: [],
  declaration: {
    ok: true,
    declaration: {
      name: "Aeris Chairs — Q3",
      category: "slides",
      budget: 6.88,
      areas: [{ name: "Pitch materials", line: 6 }],
      blockStart: 1,
      blockEnd: 2,
    },
    errors: [],
  },
  followedByProjectId: "proj_aeris",
};

const OTHER: DesignDocView = {
  id: "showroom_plan",
  title: "showroom_plan",
  text: "# Showroom",
  lineCount: 1,
  sections: [],
  declaration: { ok: true, errors: [] },
};

const noop = () => {};

describe("the rail with documents in it", () => {
  test("OPEN NOW names the document, who is inside it and what it declared", () => {
    render(<DesignDocsRail docs={[PLAN, OTHER]} open={PLAN} agentsInside={3} onSelect={noop} />);
    const open = screen.getByTestId(`docs-open-${PLAN.id}`);
    expect(open.textContent).toContain("chair_launch_plan");
    expect(open.textContent).toContain("3 agents inside");
    expect(open.textContent).toContain("$6.88");
    expect(open.textContent).toContain("declared");
  });

  test("one agent inside reads as one agent, not '1 agents'", () => {
    render(<DesignDocsRail docs={[PLAN]} open={PLAN} agentsInside={1} onSelect={noop} />);
    expect(screen.getByTestId(`docs-open-${PLAN.id}`).textContent).toContain("1 agent inside");
  });

  test("a document that declares no budget says so, rather than declaring $0.00", () => {
    render(<DesignDocsRail docs={[OTHER]} open={OTHER} agentsInside={0} onSelect={noop} />);
    const open = screen.getByTestId(`docs-open-${OTHER.id}`);
    expect(open.textContent).toContain("no budget declared");
    expect(open.textContent).not.toContain("$");
  });

  test("RECENT holds everything that is not open", () => {
    render(<DesignDocsRail docs={[PLAN, OTHER]} open={PLAN} agentsInside={0} onSelect={noop} />);
    expect(screen.getByTestId(`docs-recent-${OTHER.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`docs-recent-${PLAN.id}`)).toBeNull();
  });

  test("search filters by title and says when nothing matches", () => {
    render(<DesignDocsRail docs={[PLAN, OTHER]} open={PLAN} agentsInside={0} onSelect={noop} />);
    fireEvent.change(screen.getByTestId("docs-search"), { target: { value: "zzz" } });
    expect(screen.queryAllByTestId(/^docs-recent-/)).toHaveLength(0);
    expect(screen.getByTestId("docs-no-recent").textContent).toContain("zzz");
  });

  test("New design document asks for the paste box by name", () => {
    let picked: string | undefined;
    render(<DesignDocsRail docs={[PLAN]} open={PLAN} agentsInside={0} onSelect={(id) => (picked = id)} />);
    fireEvent.click(screen.getByTestId("new-design-document"));
    expect(picked).toBe(NEW_DOCUMENT);
  });

  test("the sentinel cannot collide with a real document id", () => {
    // slugFor() maps every run of non-alphanumerics to one dash, so no document is ever named
    // with underscores. Asserted rather than assumed, because the whole scheme rests on it.
    expect(NEW_DOCUMENT).toContain("_");
    expect(NEW_DOCUMENT).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("the rail with nothing in it", () => {
  test("no documents says so, and draws no row", () => {
    render(<DesignDocsRail docs={[]} agentsInside={0} onSelect={noop} />);
    expect(screen.getByTestId("docs-none-open").textContent).toBe("No documents yet.");
    expect(screen.queryAllByTestId(/^docs-recent-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^docs-open-/)).toHaveLength(0);
  });

  test("the way to start one is still there", () => {
    render(<DesignDocsRail docs={[]} agentsInside={0} onSelect={noop} />);
    expect(screen.getByTestId("new-design-document")).toBeTruthy();
  });
});

describe("the document body", () => {
  const stateOf = (r: PresenceReport) => presenceState(r, r.documentVersion ?? 0, NOW);

  test("the text is rendered exactly as written, line for line", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    const surface = screen.getByTestId("document-surface");
    expect(surface.textContent).toContain("The opening claim.");
    expect(surface.textContent).toContain("A price list.");
  });

  test("a positioned, live claim highlights its own lines and nothing else", () => {
    const claim: PresenceReport = {
      agentId: "agent_scribe",
      agentName: "Scribe",
      areaIndex: 1,
      lines: { from: 3, to: 4 },
      reportedAt: NOW - 8_000,
      sessionRunning: true,
    };
    render(<DocumentSurface doc={PLAN} reports={[claim]} stateOf={stateOf} />);
    expect(screen.getByTestId("line-3-presence")).toBeTruthy();
    expect(screen.getByTestId("line-4-presence")).toBeTruthy();
    expect(screen.queryByTestId("line-5-presence")).toBeNull();
    // The gutter prints the range and the name at the top of the block: never colour alone.
    expect(screen.getByTestId("line-3-presence").textContent).toContain("3–4 · Scribe");
  });

  test("a report with NO position draws nothing at all in the body", () => {
    const positionless: PresenceReport = {
      agentId: "agent_nib",
      agentName: "Nib",
      reportedAt: NOW,
      sessionRunning: true,
    };
    render(<DocumentSurface doc={PLAN} reports={[positionless]} stateOf={stateOf} />);
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
  });

  test("a claim against an older document draws nothing — its lines point at the wrong text", () => {
    const wrongVersion: PresenceReport = {
      agentId: "agent_scribe",
      agentName: "Scribe",
      lines: { from: 3, to: 4 },
      reportedAt: NOW,
      sessionRunning: true,
      documentVersion: 1,
    };
    render(
      <DocumentSurface doc={PLAN} reports={[wrongVersion]} stateOf={(r) => presenceState(r, 2, NOW)} />,
    );
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
  });

  test("a declared area colours the line that declares it, with its name in the gutter", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    expect(screen.getByTestId("line-6-area").textContent).toContain("area · Pitch materials");
  });

  test("with no presence and no declaration, no line is marked", () => {
    const bare: DesignDocView = { ...PLAN, declaration: { ok: true, errors: [] } };
    render(<DocumentSurface doc={bare} reports={[]} stateOf={stateOf} />);
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/-area$/)).toHaveLength(0);
  });
});

describe("what a document has cost is the sum of who is in it", () => {
  const priced = (id: string, costUsd?: number): PresenceReport => ({
    agentId: id,
    agentName: id,
    costUsd,
    sessionRunning: true,
  });

  test("the mockup's three agents sum to the figure it prints", () => {
    expect(documentSpend([priced("a", 0.31), priced("b", 1.05), priced("c", 5.52)])).toBeCloseTo(6.88, 10);
  });

  test("nobody inside is unknown, not zero", () => {
    expect(documentSpend([])).toBeUndefined();
    expect(documentSpend([priced("a"), priced("b")])).toBeUndefined();
  });

  test("priced at nothing is zero, which is a different statement from unknown", () => {
    expect(documentSpend([priced("a", 0)])).toBe(0);
  });
});
