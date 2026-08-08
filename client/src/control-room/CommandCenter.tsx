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
 * What the dollar figure actually is. server/services/usageAccounting.ts derives it from token
 * counts at published list prices and marks every result `estimated: true`, because the transport
 * reports tokens, never billed amounts. Duplicated from ProjectHeader rather than shared: the two
 * headers are the only callers, and neither owns a constants module the other could import from.
 */
const COST_IS_ESTIMATED =
  "Estimated cost: derived from token counts at published list prices, not from billed amounts. The actual charge will differ.";

/**
 * Agent Command Center (V-021). Summarises the fleet by status — each count labelled with text,
 * never colour alone — and renders one card per agent. The project total is always labelled as an
 * estimate (V-045); it is the same figure ProjectHeader shows and carries the same caveat.
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
          <span
            data-testid="command-center-cost"
            title={COST_IS_ESTIMATED}
            className="ml-auto flex items-baseline gap-1.5 text-xs text-white/70"
          >
            {/* Visible marker for sighted users; the full caveat below carries it to a screen reader. */}
            <span
              data-testid="command-center-cost-estimated"
              aria-hidden="true"
              className="rounded bg-white/10 px-1 text-[10px] uppercase tracking-wide"
            >
              est.
            </span>
            <span data-testid="project-cost">
              ${projectCostUsd.toFixed(2)}
              {projectBudgetUsd !== undefined ? ` / $${projectBudgetUsd.toFixed(2)}` : ""}
            </span>
            <span data-testid="command-center-cost-caveat" className="sr-only">
              {COST_IS_ESTIMATED}
            </span>
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
