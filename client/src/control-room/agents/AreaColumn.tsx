/**
 * One area of the board — the container `design/mockups/agents-page.html` draws around its cards.
 *
 * An area is the unit the whole product is built on: it names a section of the brief, the one
 * milestone whose tasks are that section's work, and the one directory an agent hired into it may
 * write. So the column states three things and stops — its name, its milestone, and what it has
 * cost — and everything else on it is a card.
 *
 * The accent is never the signal on its own. Every column also prints the glyph the server issued
 * it (`AREA_GLYPHS`, eight distinct shapes) and its name, which is what makes the column readable
 * when two areas land on the same published hue.
 */
import { AgentCard, Money } from "./AgentCard";
import { agentsInArea, areaAccent, knownSpend, launchRefusal, launchableTask } from "./board";
import { NO_VOCABULARY, type AgentView, type AgentVocabulary, type AreaView, type TaskView } from "./types";

export interface AreaColumnProps {
  area: AreaView;
  /** The milestone this area's work is, resolved from the plan. Absent until a plan names it. */
  milestoneName?: string;
  /** Every agent on the project. The column selects its own; grouping is `agentsInArea`'s. */
  agents: AgentView[];
  vocabulary?: AgentVocabulary;
  tasks?: TaskView[];
  planState?: string;
  busy?: boolean;
  selectionId?: string;
  onSelect(selectionId: string | undefined): void;
  onPause(agentId: string): void;
  onLaunch?(taskId: string): void;
}

export function AreaColumn({
  area,
  milestoneName,
  agents,
  vocabulary = NO_VOCABULARY,
  tasks = [],
  planState,
  busy,
  selectionId,
  onSelect,
  onPause,
  onLaunch,
}: AreaColumnProps) {
  const accent = areaAccent(area);
  const inside = agentsInArea(area, agents);
  const spend = knownSpend(inside);

  return (
    <section
      data-testid={`area-${area.id}`}
      className={`flex min-w-[268px] flex-1 flex-col rounded-[10px] border p-3 ${accent.rule} ${accent.wash}`}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        {area.glyph ? (
          <span data-testid="area-glyph" className={`text-[12px] leading-none ${accent.ink}`}>
            {area.glyph}
          </span>
        ) : null}
        <button
          type="button"
          data-testid={`area-select-${area.id}`}
          onClick={() => onSelect(area.id === selectionId ? undefined : area.id)}
          title={`Show ${area.name}`}
          className={`text-left text-[16px] hover:underline ${
            area.id === selectionId ? "text-ink underline" : "text-ink"
          }`}
        >
          {area.name}
        </button>
        {/* The milestone is the definition of this area's work being finished. One per area. */}
        {milestoneName ? (
          <span
            data-testid="area-milestone"
            className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.05em] text-ink-faint"
          >
            Milestone — {milestoneName}
          </span>
        ) : null}
        <span className="flex-1" />
        <span data-testid="area-spend" className="font-mono text-[11px]">
          <Money usd={spend} />
        </span>
      </div>

      {area.unresolvedOwnerAgentId ? (
        <p data-testid="area-unresolved-owner" className="mb-2.5 text-[12px] text-status-failed">
          This area points at agent {area.unresolvedOwnerAgentId}, which no longer exists.
        </p>
      ) : null}

      {inside.length === 0 ? (
        <p data-testid="area-empty" className="text-[13px] leading-snug text-ink-faint">
          {/* "Nobody assigned" is the server's own word for it, and it is not a status: an area
              nobody works in is the absence of one. Idle would claim a session exists. */}
          {area.statusPresentation?.label ?? "Nobody assigned"} — no agent is hired into this area
          yet, so nothing here is being worked on.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {inside.map((agent) => {
            const launchable = launchableTask(agent, tasks, planState);
            const assigned = tasks.filter((t) => t.assignedAgentId === agent.id);
            return (
              <AgentCard
                key={agent.id}
                agent={agent}
                statusLabel={vocabulary.statusLabel(agent.status)}
                capabilityLabel={vocabulary.capabilityLabel(agent.capabilities)}
                launchable={launchable}
                launchRefusal={
                  launchable || assigned.length === 0
                    ? undefined
                    : launchRefusal(assigned[0], tasks, planState)
                }
                busy={busy}
                selected={agent.id === selectionId}
                onOpen={() => onSelect(agent.id === selectionId ? undefined : agent.id)}
                onPause={() => onPause(agent.id)}
                onLaunch={onLaunch}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
