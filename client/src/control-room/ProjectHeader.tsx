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
}

/**
 * Top bar of §11A. Every number here is server-derived — progress comes from requirement
 * statuses and cost from recorded usage, so nothing on this bar is an estimate.
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
          data-testid="project-cost-summary"
          className={`text-xs ${overBudget ? "text-red-400" : "text-white/70"}`}
        >
          ${costUsd.toFixed(2)}
          {budgetUsd !== undefined ? ` / $${budgetUsd.toFixed(2)}` : ""}
          {overBudget ? " — over budget" : ""}
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
