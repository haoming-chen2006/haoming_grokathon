import { useCallback, useMemo } from "react";
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

/** The Agent Command Center canvas (V-021): agents can be moved, and moves are persisted. */
function AgentCanvasInner({ agents, onMoveAgent, onOpenSession, onPause, onStop }: AgentCanvasProps) {
  const initialNodes = useMemo(
    () => agentsToNodes(agents, { onOpenSession, onPause, onStop }),
    [agents, onOpenSession, onPause, onStop],
  );
  const [nodes, , onNodesChange] = useNodesState(initialNodes);

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
