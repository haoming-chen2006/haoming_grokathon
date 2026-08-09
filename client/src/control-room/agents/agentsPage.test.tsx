/**
 * The AGENTS page, against a stubbed network.
 *
 * The first suite is the one that matters on a fresh install: nothing is returned by anything, and
 * the page has to say so — a header that counts zero, a board that explains what an area is, and
 * not one card, column or figure that no record supplied.
 *
 * The second proves the same page renders real records the way `design/mockups/agents-page.html`
 * draws them. Its records live in this file. Nothing here ships.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { AgentsPage } from "./index";

interface Stub {
  project: unknown;
  agents: unknown;
  areas: unknown;
  calls: string[];
}

let stub: Stub;
const realFetch = globalThis.fetch;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  stub = { project: { id: "p1", name: "Aeris Chairs" }, agents: [], areas: [], calls: [] };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://workspace.invalid").pathname;
    stub.calls.push(path);
    if (path === "/api/coding-agents/areas") return json(stub.areas);
    if (path === "/api/coding-agents") return json(stub.agents);
    if (path === "/api/coding-agents/statuses") {
      return json({ presentation: { working: { label: "Working" }, idle: { label: "Idle" } } });
    }
    if (path === "/api/coding-agents/capabilities") {
      return json({ presets: [{ id: "base", label: "base Grok", capabilities: { images: false, voice: false } }] });
    }
    if (path.startsWith("/api/projects/")) return json(stub.project);
    return json(null);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const noop = () => {};

describe("a workspace with nothing in it", () => {
  test("the header counts zero of each, and prints the rule the product is built on", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("board-counts")).toBeTruthy());
    expect(screen.getByTestId("board-counts").textContent).toBe("0 areas · 0 agents");
    expect(screen.getByTestId("board-rule").textContent).toBe(
      "An agent can only change things inside its own area",
    );
  });

  test("the board says there are no areas, and offers a way to make one", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("board-empty")).toBeTruthy());
    expect(screen.getByTestId("board-empty").textContent).toContain("No areas yet");
    // The wording alone is not the point. A board that explains areas and offers nothing to click
    // is where a user with a document that declared none gets stuck — which is most documents.
    expect(screen.getByTestId("add-area-submit")).toBeTruthy();
  });

  test("not one column and not one card is drawn", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("board-empty")).toBeTruthy());
    expect(screen.queryAllByTestId(/^area-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^agent-card-/)).toHaveLength(0);
  });

  test("with no plan, the gate says so and offers the one thing that moves it", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("plan-strip")).toBeTruthy());
    expect(screen.getByTestId("plan-strip").textContent).toContain("No plan yet");
    expect(screen.getByTestId("generate-plan")).toBeTruthy();
  });

  test("an error body where a list belongs empties the board rather than blanking the page", async () => {
    // `as T[]` on a network value threw inside render three times in one day. An error object has
    // no .map, and a page that throws in render shows nothing at all.
    stub.areas = { error: "boom" };
    stub.agents = { error: "boom" };
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("board-empty")).toBeTruthy());
    expect(screen.getByTestId("board-counts").textContent).toBe("0 areas · 0 agents");
  });
});

describe("a workspace with one area and one agent in it", () => {
  beforeEach(() => {
    stub.project = {
      id: "p1",
      name: "Aeris Chairs",
      plan: { id: "plan1", state: "approved", milestones: [{ id: "m1", name: "Deck and brief ready Fri" }] },
      tasks: [],
    };
    stub.areas = [
      {
        id: "area_pitch",
        projectId: "p1",
        name: "Pitch materials",
        colorToken: "purple",
        glyph: "◆",
        milestoneId: "m1",
        ownerAgentId: "agent_scribe",
        status: "working",
        statusPresentation: { status: "working", label: "Working" },
      },
    ];
    stub.agents = [
      {
        id: "agent_scribe",
        name: "Scribe",
        role: "writer",
        status: "working",
        statusDetail: "Rewriting the opening claim",
        activity: { latestFile: "chair_launch_plan" },
        costUsd: 0.31,
        capabilities: { images: false, voice: false },
      },
    ];
  });

  test("the header counts them, singular where there is one", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("board-counts").textContent).toBe("1 area · 1 agent"));
  });

  test("the column holds the card, with the milestone the plan names", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("area-area_pitch")).toBeTruthy());
    const column = screen.getByTestId("area-area_pitch");
    expect(within(column).getByTestId("area-milestone").textContent).toBe(
      "Milestone — Deck and brief ready Fri",
    );
    expect(within(column).getByTestId("agent-card-agent_scribe")).toBeTruthy();
  });

  test("the card reads the server's own words for the status and the capability", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("agent-card-agent_scribe")).toBeTruthy());
    const card = screen.getByTestId("agent-card-agent_scribe");
    await waitFor(() =>
      expect(within(card).getByTestId("agent-card-subtitle").textContent).toBe("writer · base Grok"),
    );
    expect(within(card).getByTestId("agent-card-status").textContent).toBe("Working");
  });

  test("with the plan approved and nothing running, the gate strip is gone", async () => {
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("area-area_pitch")).toBeTruthy());
    expect(screen.queryByTestId("plan-strip")).toBeNull();
  });

  test("an agent no area claims is shown under its own heading, never inside an invented one", async () => {
    stub.agents = [
      ...(stub.agents as unknown[]),
      { id: "agent_nib", name: "Nib", role: "writer", status: "idle" },
    ];
    render(<AgentsPage projectId="p1" onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("unplaced-agents")).toBeTruthy());
    const unplaced = screen.getByTestId("unplaced-agents");
    expect(within(unplaced).getByTestId("agent-card-agent_nib")).toBeTruthy();
    expect(within(unplaced).queryByTestId("agent-card-agent_scribe")).toBeNull();
    expect(screen.queryAllByTestId(/^area-area_/)).toHaveLength(1);
  });
});
