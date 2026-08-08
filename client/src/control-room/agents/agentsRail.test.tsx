/**
 * The AGENTS rail — the container, against hand-made areas and agents.
 *
 * The rail is the page's one summary surface, so the thing worth checking hardest is that it never
 * summarises anything into existence: with no areas it says there are none, with no agents every
 * count is a zero that is still a zero, and nothing waiting on you says exactly that rather than
 * leaving a blank where a number goes.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AgentsRail } from "./AgentsRail";
import type { AgentView, AreaView } from "./types";

afterEach(cleanup);

const area = (id: string, name: string, ownerAgentId?: string): AreaView => ({
  id,
  projectId: "p1",
  name,
  colorToken: "purple",
  glyph: "◆",
  ownerAgentId,
});

const agent = (id: string, name: string, status: string, role = "writer"): AgentView => ({
  id,
  name,
  role,
  status,
});

/** design/mockups/agents-page.html's three areas and five agents. Test-only, never shipped. */
const PITCH = area("area_pitch", "Pitch materials", "agent_scribe");
const DEMO = area("area_demo", "Demo", "agent_reel");
const NUMBERS = area("area_numbers", "Numbers", "agent_ledger");
const AREAS = [PITCH, DEMO, NUMBERS];
const AGENTS = [
  agent("agent_scribe", "Scribe", "working"),
  agent("agent_slide", "Slidewright", "waiting", "deck maker"),
  agent("agent_reel", "Reel", "complete", "video maker"),
  agent("agent_voice", "Voiceover", "idle", "narrator"),
  agent("agent_ledger", "Ledger", "failed", "table maker"),
];

const noop = () => {};

function renderRail(areas: AreaView[], agents: AgentView[], props: Partial<Parameters<typeof AgentsRail>[0]> = {}) {
  render(<AgentsRail areas={areas} agents={agents} onSelect={noop} onAddAgent={noop} {...props} />);
}

/** "FINE 1WORKING 1STOPPED 3" — each count carries its word for a screen reader. */
const counts = (row: HTMLElement) =>
  ["fine", "working", "stopped"].map((b) => within(row).getByTestId(`count-${b}`).textContent?.trim());

describe("the rail counts what is there", () => {
  test("Everything totals every agent, in the three columns the mockup prints", () => {
    renderRail(AREAS, AGENTS);
    expect(counts(screen.getByTestId("rail-everything"))).toEqual([
      "FINE 1",
      "WORKING 1",
      "STOPPED 3",
    ]);
  });

  test("each area counts only the agents hired into it", () => {
    renderRail(AREAS, AGENTS);
    expect(counts(screen.getByTestId(`rail-area-${PITCH.id}`))).toEqual([
      "FINE 0",
      "WORKING 1",
      "STOPPED 0",
    ]);
    expect(counts(screen.getByTestId(`rail-area-${NUMBERS.id}`))).toEqual([
      "FINE 0",
      "WORKING 0",
      "STOPPED 1",
    ]);
  });

  test("every area row prints its name and its glyph", () => {
    renderRail(AREAS, AGENTS);
    expect(screen.getByTestId(`rail-area-${DEMO.id}`).textContent).toContain("Demo");
    expect(screen.getByTestId(`rail-area-${DEMO.id}`).textContent).toContain("◆");
  });

  test("picking an area selects it, and picking it again clears the selection", () => {
    const picked: (string | undefined)[] = [];
    renderRail(AREAS, AGENTS, { selectionId: PITCH.id, onSelect: (id) => picked.push(id) });
    fireEvent.click(screen.getByTestId(`rail-area-${PITCH.id}`));
    fireEvent.click(screen.getByTestId("rail-everything"));
    expect(picked).toEqual([undefined, undefined]);
  });
});

describe("search matches an area by its name or by who works in it", () => {
  test("by area name", () => {
    renderRail(AREAS, AGENTS);
    fireEvent.change(screen.getByTestId("agents-search"), { target: { value: "demo" } });
    expect(screen.getByTestId(`rail-area-${DEMO.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`rail-area-${PITCH.id}`)).toBeNull();
  });

  test("by the name of an agent inside it — the control says 'Search agents'", () => {
    renderRail(AREAS, AGENTS);
    fireEvent.change(screen.getByTestId("agents-search"), { target: { value: "scribe" } });
    expect(screen.getByTestId(`rail-area-${PITCH.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`rail-area-${DEMO.id}`)).toBeNull();
  });

  test("a search that matches nothing says so instead of showing an empty list", () => {
    renderRail(AREAS, AGENTS);
    fireEvent.change(screen.getByTestId("agents-search"), { target: { value: "zzz" } });
    expect(screen.getByTestId("rail-no-matches").textContent).toContain("zzz");
    expect(screen.queryAllByTestId(/^rail-area-/)).toHaveLength(0);
  });
});

describe("what needs a person", () => {
  test("a question asked is one waiting on you", () => {
    renderRail(AREAS, AGENTS);
    expect(screen.getByTestId("needs-you").textContent).toContain("1 waiting on you");
  });

  test("nothing waiting says nothing is waiting, rather than leaving a blank", () => {
    renderRail(AREAS, [agent("agent_scribe", "Scribe", "working")]);
    expect(screen.getByTestId("needs-you-none").textContent).toBe("Nothing is waiting on you.");
    expect(screen.queryByTestId("needs-you")).toBeNull();
  });
});

describe("a rail with nothing in it", () => {
  test("no areas says there are none, and draws no row", () => {
    renderRail([], []);
    expect(screen.getByTestId("rail-no-areas").textContent).toContain("No areas yet");
    expect(screen.queryAllByTestId(/^rail-area-/)).toHaveLength(0);
  });

  test("Everything is still there, and every count is a zero", () => {
    renderRail([], []);
    expect(counts(screen.getByTestId("rail-everything"))).toEqual([
      "FINE 0",
      "WORKING 0",
      "STOPPED 0",
    ]);
  });

  test("the two ways to get agents are both present", () => {
    renderRail([], []);
    expect(screen.getByTestId("build-the-team")).toBeTruthy();
    expect(screen.getByTestId("add-agent")).toBeTruthy();
  });
});

describe("the two ways to get agents", () => {
  test("'Build the team for me' is disabled, and its title says why", () => {
    renderRail(AREAS, AGENTS);
    const button = screen.getByTestId("build-the-team") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toContain("no endpoint");
  });

  test("'Add one agent by hand' asks for the two fields the server requires", () => {
    let created: { name: string; role: string } | undefined;
    renderRail(AREAS, AGENTS, { onAddAgent: (input) => (created = input) });
    fireEvent.click(screen.getByTestId("add-agent"));

    const submit = () => screen.getByTestId("add-agent-submit") as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    expect(submit().getAttribute("title")).toBe("The server needs both a name and a role");

    fireEvent.change(screen.getByTestId("add-agent-name"), { target: { value: "Nib" } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("add-agent-role"), { target: { value: "writer" } });
    expect(submit().disabled).toBe(false);

    fireEvent.click(submit());
    expect(created).toEqual({ name: "Nib", role: "writer" });
  });

  test("cancelling the form leaves nothing behind", () => {
    renderRail(AREAS, AGENTS);
    fireEvent.click(screen.getByTestId("add-agent"));
    fireEvent.click(screen.getByTestId("add-agent-cancel"));
    expect(screen.queryByTestId("add-agent-form")).toBeNull();
    expect(screen.getByTestId("add-agent")).toBeTruthy();
  });
});
