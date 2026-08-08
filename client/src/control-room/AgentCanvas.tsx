import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  useNodesState,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { AgentCard } from "./AgentCard";
import type { CodingAgent } from "./types";

export interface AgentCanvasProps {
  agents: CodingAgent[];
  /** Called when an agent is dragged to a new position, so layout can be persisted (V-021). */
  onMoveAgent?: (agentId: string, position: { x: number; y: number }) => void;
  onOpenSession?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
}

type AgentNodeData = {
  agent: CodingAgent;
  onOpenSession?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
};

function AgentFlowNode({ data }: NodeProps) {
  const { agent, onOpenSession, onPause, onStop } = data as AgentNodeData;
  return <AgentCard agent={agent} onOpenSession={onOpenSession} onPause={onPause} onStop={onStop} />;
}

const NODE_TYPES = { codingAgent: AgentFlowNode };

/**
 * Lay agents out deterministically when they have no saved position, so a fresh project does not
 * stack every card at the origin.
 */
export function defaultPosition(index: number): { x: number; y: number } {
  const COLUMNS = 3;
  return { x: (index % COLUMNS) * 320, y: Math.floor(index / COLUMNS) * 260 };
}

export function agentsToNodes(agents: CodingAgent[], handlers: Omit<AgentNodeData, "agent"> = {}): Node[] {
  return agents.map((agent, index) => ({
    id: agent.id,
    type: "codingAgent",
    position: agent.position ?? defaultPosition(index),
    data: { agent, ...handlers },
  }));
}

/**
 * Extract persist-worthy moves from a React Flow change batch. Only committed drags are returned
 * (`dragging === false`), so a drag in progress does not generate a write per animation frame.
 */
export function positionUpdatesFrom(changes: NodeChange[]): Array<{ id: string; position: { x: number; y: number } }> {
  const updates: Array<{ id: string; position: { x: number; y: number } }> = [];
  for (const change of changes) {
    if (change.type === "position" && change.dragging === false && change.position) {
      updates.push({ id: change.id, position: change.position });
    }
  }
  return updates;
}

function samePosition(a?: { x: number; y: number }, b?: { x: number; y: number }): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

/**
 * Fold a freshly derived node list into the nodes the canvas is already showing.
 *
 * Everything a card renders — status, cost, blocker, and which agents exist at all — is the
 * server's, so the incoming node replaces the existing one wholesale. Position is the exception:
 * it belongs to the canvas, because the card may be under the user's cursor right now and an
 * update arriving mid-drag would yank it back to where the drag started. A server position is
 * taken only when it differs from the one that arrived last time, so a status update landing
 * before a just-finished drag has been persisted cannot snap the card back either.
 */
export function mergeAgentNodes(current: Node[], incoming: Node[]): Node[] {
  const byId = new Map(current.map((node) => [node.id, node]));
  return incoming.map((node) => {
    const existing = byId.get(node.id);
    if (!existing) return node;
    const lastSeen = (existing.data as AgentNodeData).agent.position;
    const fromServer = (node.data as AgentNodeData).agent.position;
    const serverMoved = fromServer !== undefined && !samePosition(lastSeen, fromServer);
    // Spreading `existing` first keeps what React Flow wrote onto the node — selection, measured
    // size, drag flag — which would otherwise be discarded on every WebSocket update.
    return {
      ...existing,
      ...node,
      position: existing.dragging || !serverMoved ? existing.position : node.position,
    };
  });
}

/** The Agent Command Center canvas (V-021): agents can be moved, and moves are persisted. */
function AgentCanvasInner({ agents, onMoveAgent, onOpenSession, onPause, onStop }: AgentCanvasProps) {
  const agentNodes = useMemo(
    () => agentsToNodes(agents, { onOpenSession, onPause, onStop }),
    [agents, onOpenSession, onPause, onStop],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(agentNodes);

  // `useNodesState` is `useState`, so it reads its argument once. Without this the canvas would
  // render whatever agents it mounted with for as long as the tab stays open: live status, cost
  // and blocker updates, and newly launched agents, would never appear.
  useEffect(() => {
    setNodes((current) => mergeAgentNodes(current, agentNodes));
  }, [agentNodes, setNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const update of positionUpdatesFrom(changes)) {
        onMoveAgent?.(update.id, update.position);
      }
    },
    [onNodesChange, onMoveAgent],
  );

  return (
    <div data-testid="agent-canvas" style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        onNodesChange={handleNodesChange}
        nodeTypes={NODE_TYPES}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function AgentCanvas(props: AgentCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
