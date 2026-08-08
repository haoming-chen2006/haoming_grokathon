import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AgentCanvas, agentsToNodes, defaultPosition, mergeAgentNodes, positionUpdatesFrom } from "./AgentCanvas";
import type { CodingAgent } from "./types";
import type { Node, NodeChange } from "@xyflow/react";

afterEach(cleanup);

function agent(id: string, position?: { x: number; y: number }): CodingAgent {
  return {
    id,
    projectId: "p",
    name: id,
    role: "Engineer",
    skills: [],
    tools: [],
    status: "idle",
    activity: {},
    costUsd: 0,
    tokensUsed: 0,
    position,
  };
}

describe("V-021: agents can be moved and organized", () => {
  test("a saved position is used verbatim", () => {
    const nodes = agentsToNodes([agent("a1", { x: 120, y: 340 })]);
    expect(nodes[0].position).toEqual({ x: 120, y: 340 });
    expect(nodes[0].id).toBe("a1");
    expect(nodes[0].type).toBe("codingAgent");
  });

  test("agents without a saved position are laid out deterministically, not stacked", () => {
    const nodes = agentsToNodes([agent("a1"), agent("a2"), agent("a3"), agent("a4")]);
    const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);
    // No two cards may occupy the same spot.
    expect(new Set(positions).size).toBe(4);
    // And the layout wraps rather than running off in one direction.
    expect(defaultPosition(0)).toEqual({ x: 0, y: 0 });
    expect(defaultPosition(3)).toEqual({ x: 0, y: 260 });
  });

  test("a committed drag produces a persist-worthy update", () => {
    const changes: NodeChange[] = [
      { id: "a1", type: "position", position: { x: 400, y: 200 }, dragging: false } as NodeChange,
    ];
    expect(positionUpdatesFrom(changes)).toEqual([{ id: "a1", position: { x: 400, y: 200 } }]);
  });

  test("a drag in progress does not persist", () => {
    // Otherwise every animation frame would write to disk.
    const changes: NodeChange[] = [
      { id: "a1", type: "position", position: { x: 10, y: 10 }, dragging: true } as NodeChange,
    ];
    expect(positionUpdatesFrom(changes)).toEqual([]);
  });

  test("non-position changes are ignored", () => {
    const changes: NodeChange[] = [
      { id: "a1", type: "select", selected: true } as NodeChange,
      { id: "a2", type: "remove" } as NodeChange,
    ];
    expect(positionUpdatesFrom(changes)).toEqual([]);
  });

  test("a position change with no position is ignored", () => {
    const changes: NodeChange[] = [{ id: "a1", type: "position", dragging: false } as NodeChange];
    expect(positionUpdatesFrom(changes)).toEqual([]);
  });

  test("multiple agents moved in one batch all persist", () => {
    const changes: NodeChange[] = [
      { id: "a1", type: "position", position: { x: 1, y: 2 }, dragging: false } as NodeChange,
      { id: "a2", type: "position", position: { x: 3, y: 4 }, dragging: false } as NodeChange,
    ];
    expect(positionUpdatesFrom(changes).map((u) => u.id)).toEqual(["a1", "a2"]);
  });

  test("handlers are threaded through to each node", () => {
    const noop = () => {};
    const nodes = agentsToNodes([agent("a1")], { onPause: noop });
    expect((nodes[0].data as any).onPause).toBe(noop);
    expect((nodes[0].data as any).agent.id).toBe("a1");
  });
});

describe("the canvas tracks live agents while it stays open", () => {
  test("a status change and a newly launched agent both appear without a remount", () => {
    const working: CodingAgent = { ...agent("a1"), name: "Backend Agent", status: "working" };
    const { rerender } = render(<AgentCanvas agents={[working]} />);
    expect(screen.getAllByTestId("agent-name").map((n) => n.textContent)).toEqual(["Backend Agent"]);
    expect(screen.getByTestId("agent-status").textContent).toBe("Working");

    // Exactly what arrives over the WebSocket while the Canvas tab is open.
    const failed: CodingAgent = { ...working, status: "failed", costUsd: 1.25 };
    const launched: CodingAgent = { ...agent("a2"), name: "Test Agent" };
    rerender(<AgentCanvas agents={[failed, launched]} />);

    expect(screen.getAllByTestId("agent-name").map((n) => n.textContent)).toEqual([
      "Backend Agent",
      "Test Agent",
    ]);
    expect(screen.getAllByTestId("agent-status").map((n) => n.textContent)).toEqual(["Failed", "Idle"]);
    expect(screen.getAllByTestId("agent-cost").map((n) => n.textContent)).toEqual(["$1.25", "$0.00"]);
  });

  test("an agent that goes away is removed from the canvas", () => {
    const { rerender } = render(<AgentCanvas agents={[agent("a1"), agent("a2")]} />);
    expect(screen.getAllByTestId("agent-card").length).toBe(2);
    rerender(<AgentCanvas agents={[agent("a2")]} />);
    expect(screen.getAllByTestId("agent-name").map((n) => n.textContent)).toEqual(["a2"]);
  });
});

describe("merging live agents does not fight the user's drag", () => {
  function node(id: string, position: { x: number; y: number }, agentOverrides: Partial<CodingAgent> = {}): Node {
    return {
      id,
      type: "codingAgent",
      position,
      data: { agent: { ...agent(id), ...agentOverrides } },
    };
  }

  test("server data wins for everything the card renders", () => {
    const current = [node("a1", { x: 0, y: 0 })];
    const incoming = [node("a1", { x: 0, y: 0 }, { status: "failed", costUsd: 3 })];
    const merged = mergeAgentNodes(current, incoming);
    expect((merged[0].data as any).agent.status).toBe("failed");
    expect((merged[0].data as any).agent.costUsd).toBe(3);
  });

  test("a node being dragged keeps the position the canvas gave it", () => {
    // The update lands mid-drag; snapping the card back to the saved position would yank it out
    // from under the cursor.
    const current = [{ ...node("a1", { x: 512, y: 96 }, { position: { x: 0, y: 0 } }), dragging: true }];
    const incoming = [node("a1", { x: 0, y: 0 }, { position: { x: 0, y: 0 }, status: "working" })];
    const merged = mergeAgentNodes(current, incoming);
    expect(merged[0].position).toEqual({ x: 512, y: 96 });
    expect((merged[0].data as any).agent.status).toBe("working");
  });

  test("a just-dropped card is not snapped back by an update that predates the write", () => {
    // The drop moved the node locally; the agent still carries the old saved position because the
    // PATCH has not landed. Re-reading it would make the card jump back.
    const current = [node("a1", { x: 400, y: 200 }, { position: { x: 0, y: 0 } })];
    const incoming = [node("a1", { x: 0, y: 0 }, { position: { x: 0, y: 0 }, status: "working" })];
    expect(mergeAgentNodes(current, incoming)[0].position).toEqual({ x: 400, y: 200 });
  });

  test("a position the server actually changed is adopted", () => {
    const current = [node("a1", { x: 400, y: 200 }, { position: { x: 0, y: 0 } })];
    const incoming = [node("a1", { x: 64, y: 32 }, { position: { x: 64, y: 32 } })];
    expect(mergeAgentNodes(current, incoming)[0].position).toEqual({ x: 64, y: 32 });
  });

  test("existing cards keep their spot when a new agent shifts the default layout", () => {
    const current = [node("a1", { x: 320, y: 0 })];
    // agentsToNodes would now put a1 second, at index 1, because a2 was inserted ahead of it.
    const incoming = agentsToNodes([agent("a2"), agent("a1")]);
    const merged = mergeAgentNodes(current, incoming);
    expect(merged.map((n) => n.id)).toEqual(["a2", "a1"]);
    expect(merged[1].position).toEqual({ x: 320, y: 0 });
  });

  test("React Flow's own node state survives an update", () => {
    // Selection and measured size are the canvas's; recreating the node from scratch would drop
    // the user's selection on every WebSocket tick.
    const current = [{ ...node("a1", { x: 0, y: 0 }), selected: true, measured: { width: 288, height: 210 } }];
    const merged = mergeAgentNodes(current, [node("a1", { x: 0, y: 0 }, { status: "complete" })]);
    expect(merged[0].selected).toBe(true);
    expect(merged[0].measured).toEqual({ width: 288, height: 210 });
  });
});
