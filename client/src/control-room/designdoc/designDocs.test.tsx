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
const PLAN_TEXT = [
  "# Chair launch", // 1
  "", // 2
  "The opening claim,", // 3
  "carried over two lines.", // 4
  "", // 5
  "```project", // 6
  "name: Aeris Chairs — Q3", // 7
  "category: slides", // 8
  "areas:", // 9
  "  - Pitch materials: the deck", // 10
  "```", // 11
  "", // 12
  "## Numbers", // 13
  "", // 14
  "A price list.", // 15
].join("\n");

const PLAN: DesignDocView = {
  id: "chair_launch_plan",
  title: "chair_launch_plan",
  text: PLAN_TEXT,
  lineCount: 15,
  sections: [],
  declaration: {
    ok: true,
    declaration: {
      name: "Aeris Chairs — Q3",
      category: "slides",
      budget: 6.88,
      areas: [{ name: "Pitch materials", line: 10 }],
      blockStart: 6,
      blockEnd: 11,
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

describe("the document, read as a document", () => {
  const stateOf = (r: PresenceReport) => presenceState(r, r.documentVersion ?? 0, NOW);

  test("headings are headings and prose is prose, not one row per line", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Chair launch");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Numbers");
    // Two source lines, one paragraph — the old surface drew them as two unrelated rows.
    const paragraph = screen.getByTestId("block-3");
    expect(paragraph.textContent).toContain("The opening claim,");
    expect(paragraph.textContent).toContain("carried over two lines.");
  });

  test("every byte of the document is still on the page", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    const surface = screen.getByTestId("document-surface");
    for (const fragment of ["Chair launch", "The opening claim,", "Numbers", "A price list."]) {
      expect(surface.textContent).toContain(fragment);
    }
  });

  test("the project fence is drawn as what it declares, not as source", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    const card = screen.getByTestId("declaration-card");
    expect(card.textContent).toContain("This document declares a project");
    expect(card.textContent).toContain("Aeris Chairs — Q3");
    // The backticks are markup, not content: they are gone from the reading view and still in the
    // file, which Source view proves below.
    expect(screen.getByTestId("document-paper").textContent).not.toContain("```");
  });

  test("a declared area carries its colour on the line that declares it", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    const row = screen.getByTestId("declared-area-10");
    expect(row.textContent).toContain("Pitch materials");
    expect(row.querySelector(".text-area-1")).toBeTruthy();
  });

  test("markdown the document does not use draws nothing extra", () => {
    const bare: DesignDocView = { ...PLAN, text: "Just a sentence.", declaration: { ok: true, errors: [] } };
    render(<DocumentSurface doc={bare} reports={[]} stateOf={stateOf} />);
    expect(screen.queryByTestId("declaration-card")).toBeNull();
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
  });

  test("Source view shows the file byte for byte, with its line numbers", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    fireEvent.click(screen.getByTestId("mode-source"));
    const editor = screen.getByTestId("source-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe(PLAN_TEXT);
  });
});

describe("agents appear in the margin, as comments", () => {
  const stateOf = (r: PresenceReport) => presenceState(r, r.documentVersion ?? 0, NOW);

  const SCRIBE: PresenceReport = {
    agentId: "agent_scribe",
    agentName: "Scribe",
    areaIndex: 1,
    lines: { from: 3, to: 4 },
    reportedAt: NOW - 8_000,
    sessionRunning: true,
  };

  test("a positioned, live claim marks its own passage and nothing else", () => {
    render(<DocumentSurface doc={PLAN} reports={[SCRIBE]} stateOf={stateOf} now={NOW} />);
    // Lines 3–4 are one paragraph block, which starts at line 3.
    expect(screen.getByTestId("block-3-presence")).toBeTruthy();
    expect(screen.queryByTestId("block-13-presence")).toBeNull();
  });

  test("the claim is stated in words in the margin, never in colour alone", () => {
    render(<DocumentSurface doc={PLAN} reports={[SCRIBE]} stateOf={stateOf} now={NOW} />);
    const comment = screen.getByTestId("comment-agent_scribe");
    expect(comment.textContent).toContain("Scribe");
    expect(comment.textContent).toContain("lines 3–4");
    expect(comment.getAttribute("data-state")).toBe("live");
    expect(comment.getAttribute("data-placed")).toBe("true");
  });

  test("a report with NO position marks nothing, and its comment says so", () => {
    const positionless: PresenceReport = {
      agentId: "agent_nib",
      agentName: "Nib",
      reportedAt: NOW,
      sessionRunning: true,
    };
    render(<DocumentSurface doc={PLAN} reports={[positionless]} stateOf={stateOf} now={NOW} />);
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
    const comment = screen.getByTestId("comment-agent_nib");
    expect(comment.getAttribute("data-placed")).toBe("false");
    expect(comment.textContent).toContain("has not reported which lines");
  });

  test("a claim against an older document marks nothing — its lines point at the wrong text", () => {
    const wrongVersion: PresenceReport = { ...SCRIBE, documentVersion: 1 };
    render(
      <DocumentSurface
        doc={PLAN}
        reports={[wrongVersion]}
        stateOf={(r) => presenceState(r, 2, NOW)}
        now={NOW}
      />,
    );
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
    expect(screen.getByTestId("comment-agent_scribe").getAttribute("data-placed")).toBe("false");
  });

  test("a finished agent is not in the document at all", () => {
    const ended: PresenceReport = { ...SCRIBE, sessionRunning: false };
    render(<DocumentSurface doc={PLAN} reports={[ended]} stateOf={stateOf} now={NOW} />);
    expect(screen.queryAllByTestId(/-presence$/)).toHaveLength(0);
  });

  test("clicking a passage selects the agent commenting on it", () => {
    render(<DocumentSurface doc={PLAN} reports={[SCRIBE]} stateOf={stateOf} now={NOW} />);
    fireEvent.click(screen.getByTestId("block-3-presence"));
    expect(screen.getByTestId("comment-agent_scribe").className).toContain("ring-accent/40");
  });

  test("Open agent hands the id back rather than navigating on its own", () => {
    let opened: string | undefined;
    render(
      <DocumentSurface
        doc={PLAN}
        reports={[SCRIBE]}
        stateOf={stateOf}
        now={NOW}
        onOpenAgent={(id) => (opened = id)}
      />,
    );
    fireEvent.click(screen.getByTestId("comment-open-agent_scribe"));
    expect(opened).toBe("agent_scribe");
  });
});

describe("editing the document", () => {
  const stateOf = (r: PresenceReport) => presenceState(r, r.documentVersion ?? 0, NOW);

  test("with no way to save, no editor opens and the page says it is read-only", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} />);
    expect(screen.getByTestId("save-readonly")).toBeTruthy();
    expect(screen.queryByTestId("append-paragraph")).toBeNull();
    fireEvent.click(screen.getByTestId("block-3"));
    expect(screen.queryByTestId("block-editor")).toBeNull();
  });

  test("clicking a paragraph opens it on its own markdown, and nothing else's", () => {
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={noop} />);
    fireEvent.click(screen.getByTestId("block-3"));
    const editor = screen.getByTestId("block-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("The opening claim,\ncarried over two lines.");
  });

  test("a saved edit rewrites that paragraph's lines and leaves every other byte alone", () => {
    let saved: string | undefined;
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={(t) => (saved = t)} />);
    fireEvent.click(screen.getByTestId("block-3"));
    const editor = screen.getByTestId("block-editor");
    fireEvent.change(editor, { target: { value: "One shorter line." } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });

    expect(saved).toBeDefined();
    const before = PLAN_TEXT.split("\n");
    const after = saved!.split("\n");
    expect(after[2]).toBe("One shorter line.");
    // Everything above and below is untouched, including the fence and its indentation.
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after.slice(3)).toEqual(before.slice(4));
  });

  test("Escape leaves the document exactly as it was", () => {
    let saved: string | undefined;
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={(t) => (saved = t)} />);
    fireEvent.click(screen.getByTestId("block-3"));
    const editor = screen.getByTestId("block-editor");
    fireEvent.change(editor, { target: { value: "discarded" } });
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(saved).toBeUndefined();
    expect(screen.queryByTestId("block-editor")).toBeNull();
  });

  test("an edit that changes nothing does not write", () => {
    let writes = 0;
    render(
      <DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={() => (writes += 1)} />,
    );
    fireEvent.click(screen.getByTestId("block-3"));
    fireEvent.keyDown(screen.getByTestId("block-editor"), { key: "Enter", metaKey: true });
    expect(writes).toBe(0);
  });

  test("a save that failed says so, and never reads as saved", () => {
    render(
      <DocumentSurface
        doc={PLAN}
        reports={[]}
        stateOf={stateOf}
        onEdit={noop}
        saveState={{ kind: "error", message: "the disk is full" }}
      />,
    );
    expect(screen.getByTestId("save-error").textContent).toContain("the disk is full");
    expect(screen.queryByTestId("save-state")).toBeNull();
  });

  test("Source view saves the whole document", () => {
    let saved: string | undefined;
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={(t) => (saved = t)} />);
    fireEvent.click(screen.getByTestId("mode-source"));
    fireEvent.change(screen.getByTestId("source-editor"), { target: { value: "# Rewritten" } });
    fireEvent.click(screen.getByTestId("source-save"));
    expect(saved).toBe("# Rewritten");
  });

  test("a new paragraph at the end writes only once something is typed", () => {
    let saved: string | undefined;
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={(t) => (saved = t)} />);

    fireEvent.click(screen.getByTestId("append-paragraph"));
    fireEvent.keyDown(screen.getByTestId("block-editor"), { key: "Enter", metaKey: true });
    expect(saved).toBeUndefined();

    fireEvent.click(screen.getByTestId("append-paragraph"));
    const editor = screen.getByTestId("block-editor");
    fireEvent.change(editor, { target: { value: "## Risks" } });
    fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
    expect(saved).toBe(`${PLAN_TEXT}\n\n## Risks\n`);
  });

  test("Source view's Cancel discards", () => {
    let saved: string | undefined;
    render(<DocumentSurface doc={PLAN} reports={[]} stateOf={stateOf} onEdit={(t) => (saved = t)} />);
    fireEvent.click(screen.getByTestId("mode-source"));
    fireEvent.change(screen.getByTestId("source-editor"), { target: { value: "# Rewritten" } });
    fireEvent.click(screen.getByTestId("source-cancel"));
    expect(saved).toBeUndefined();
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
