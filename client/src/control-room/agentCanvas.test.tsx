import { describe, expect, test } from "bun:test";
import { agentsToNodes, defaultPosition, positionUpdatesFrom } from "./AgentCanvas";
import type { CodingAgent } from "./types";
import type { NodeChange } from "@xyflow/react";

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
