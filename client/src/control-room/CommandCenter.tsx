import { AgentCard } from "./AgentCard";
import { AGENT_RUNTIME_STATUSES, statusLabel, type CodingAgent } from "./types";

interface Props {
  agents: CodingAgent[];
  projectCostUsd?: number;
  projectBudgetUsd?: number;
  onOpenSession?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
}

/**
 * Agent Command Center (V-021). Summarises the fleet by status — each count labelled with text,
 * never colour alone — and renders one card per agent.
 */
export function CommandCenter({
  agents,
  projectCostUsd,
  projectBudgetUsd,
  onOpenSession,
  onPause,
  onStop,
}: Props) {
  const counts = AGENT_RUNTIME_STATUSES.map((status) => ({
    status,
    label: statusLabel(status),
    count: agents.filter((a) => a.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div data-testid="command-center" className="p-4 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span data-testid="agent-total" className="text-sm font-semibold">
          {agents.length} {agents.length === 1 ? "agent" : "agents"}
        </span>
        {counts.map((entry) => (
          <span
            key={entry.status}
            data-testid={`summary-${entry.status}`}
            className="text-xs text-white/60"
          >
            {entry.count} {entry.label}
          </span>
        ))}
        {projectCostUsd !== undefined && (
          <span data-testid="project-cost" className="ml-auto text-xs text-white/70">
            ${projectCostUsd.toFixed(2)}
            {projectBudgetUsd !== undefined ? ` / $${projectBudgetUsd.toFixed(2)}` : ""}
          </span>
        )}
      </div>

      {agents.length === 0 ? (
        <div data-testid="command-center-empty" className="text-sm text-white/50">
          No coding agents yet. Approve an implementation plan to launch them.
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onOpenSession={onOpenSession}
              onPause={onPause}
              onStop={onStop}
            />
          ))}
        </div>
      )}
    </div>
  );
}
