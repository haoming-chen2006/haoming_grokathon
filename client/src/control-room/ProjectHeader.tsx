interface Progress {
  percent: number;
  completed: number;
  total: number;
  formula?: string;
}

interface Props {
  name: string;
  goal?: string;
  progress?: Progress | null;
  costUsd?: number;
  budgetUsd?: number;
  agentsWorking?: number;
  agentsWaiting?: number;
  reviewsPending?: number;
  suggestionsPending?: number;
  onPauseAll?: () => void;
  projects?: Array<{ id: string; name: string }>;
  projectId?: string | null;
  onSelectProject?: (id: string) => void;
  onNewProject?: () => void;
}

/**
 * What the dollar figure actually is. server/services/usageAccounting.ts derives it from token
 * counts at published list prices and marks every result `estimated: true`, because the transport
 * reports tokens, never billed amounts.
 */
const COST_IS_ESTIMATED =
  "Estimated cost: derived from token counts at published list prices, not from billed amounts. The actual charge will differ.";

/**
 * Top bar of §11A. Progress is exact — it is counted from requirement statuses on the server.
 * The cost is not, and never can be from this data, so it is always labelled as an estimate (V-045).
 */
export function ProjectHeader({
  name,
  goal,
  progress,
  costUsd,
  budgetUsd,
  agentsWorking = 0,
  agentsWaiting = 0,
  reviewsPending = 0,
  suggestionsPending = 0,
  onPauseAll,
  projects = [],
  projectId = null,
  onSelectProject,
  onNewProject,
}: Props) {
  const overBudget = costUsd !== undefined && budgetUsd !== undefined && costUsd > budgetUsd;

  return (
    <header data-testid="project-header" className="flex flex-wrap items-center gap-4 border-b border-white/10 p-3 text-white">
      <div className="min-w-0">
        <div data-testid="project-name" className="text-sm font-semibold">
          {name}
        </div>
        {goal && (
          <div data-testid="project-goal" className="truncate text-xs text-white/60">
            {goal}
          </div>
        )}
      </div>

      {/*
        The switcher appears only once there is somewhere to switch to: with a single project it is
        a control that can only reselect what is already open, and the name beside it already says
        which that is. "New project" is unconditional — the shell used to offer it only when zero
        projects existed, which made every project after the first one unreachable.
      */}
      <div className="flex items-center gap-2">
        {projects.length > 1 && (
          <select
            data-testid="project-switcher"
            aria-label="Switch project"
            value={projectId ?? ""}
            onChange={(e) => onSelectProject?.(e.target.value)}
            className="rounded border border-white/10 bg-neutral-900 px-2 py-1 text-xs text-white focus:border-white/30 focus:outline-none"
          >
            {/* A project id that is not in the list would otherwise render a blank, lying, box. */}
            {(projectId === null || !projects.some((p) => p.id === projectId)) && (
              <option value="">Select a project…</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          data-testid="new-project-button"
          onClick={onNewProject}
          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          New project
        </button>
      </div>

      {progress && (
        <div className="flex items-center gap-2">
          <div
            data-testid="project-progress"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Project progress: ${progress.percent}%`}
            className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"
          >
            <div className="h-full bg-green-400" style={{ width: `${progress.percent}%` }} />
          </div>
          {/* The percentage is also text — a bar alone is not readable. */}
          <span data-testid="project-progress-text" className="text-xs text-white/70">
            {progress.percent}% · {progress.completed}/{progress.total} requirements
          </span>
        </div>
      )}

      {costUsd !== undefined && (
        <span
          data-testid="project-cost-estimate"
          title={COST_IS_ESTIMATED}
          className={`flex items-baseline gap-1.5 text-xs ${overBudget ? "text-red-400" : "text-white/70"}`}
        >
          {/* Visible marker for sighted users; the full caveat below carries it to a screen reader. */}
          <span
            data-testid="project-cost-estimated"
            aria-hidden="true"
            className="rounded bg-white/10 px-1 text-[10px] uppercase tracking-wide"
          >
            est.
          </span>
          <span data-testid="project-cost-summary">
            ${costUsd.toFixed(2)}
            {budgetUsd !== undefined ? ` / $${budgetUsd.toFixed(2)}` : ""}
            {overBudget ? " — over budget" : ""}
          </span>
          <span data-testid="project-cost-caveat" className="sr-only">
            {COST_IS_ESTIMATED}
          </span>
        </span>
      )}

      <span data-testid="agent-summary" className="text-xs text-white/60">
        {agentsWorking} working · {agentsWaiting} waiting
      </span>

      {reviewsPending > 0 && (
        <span data-testid="reviews-pending-badge" className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">
          {reviewsPending} review{reviewsPending === 1 ? "" : "s"} pending
        </span>
      )}
      {suggestionsPending > 0 && (
        <span data-testid="suggestions-pending-badge" className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-300">
          {suggestionsPending} suggestion{suggestionsPending === 1 ? "" : "s"} pending
        </span>
      )}

      <button
        type="button"
        data-testid="pause-all"
        onClick={onPauseAll}
        className="ml-auto rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
      >
        Pause All
      </button>
    </header>
  );
}
