import type { PlanView, TaskView } from "./useControlRoom";

interface Props {
  plan: PlanView | null;
  tasks: TaskView[];
  agentName?: (agentId: string) => string | undefined;
  onApprove?: () => void;
  onLaunch?: (taskId: string) => void;
  /** Ask the Planner to propose tasks from the design document. A real agent turn. */
  onGenerate?: () => void;
  generating?: boolean;
}

/**
 * The implementation plan and its approval gate (§10 step 5, V-018).
 *
 * "Proposed tasks do not launch automatically … Grok coding sessions launch only after approval"
 * was enforced by the server and reachable only by `curl`, which made the Control Room something
 * you watch rather than something you operate. The one decision the design insists a human makes
 * had no button.
 *
 * Launch is disabled while the plan is a draft rather than hidden, and says why — the same
 * treatment as approving a stale suggestion or merging with failing tests. A control that is absent
 * teaches nothing; one that explains its refusal teaches the gate.
 */
export function PlanPanel({
  plan, tasks, agentName, onApprove, onLaunch, onGenerate, generating,
}: Props) {
  if (!plan) {
    // This used to tell the user to run `bun run new -- --plan`, which ended the browser flow at
    // the one step that turns a document into work.
    return (
      <div data-testid="plan-empty" className="p-4 text-sm text-white/50">
        <div className="mb-3">
          No implementation plan yet. The Planner reads the design document and the repository, and
          proposes tasks for you to review — nothing runs until you approve them.
        </div>
        {onGenerate && (
          <button
            type="button"
            data-testid="plan-generate"
            onClick={onGenerate}
            disabled={generating}
            className="rounded bg-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? "Planning…" : "Generate plan"}
          </button>
        )}
        {generating && (
          <div data-testid="plan-generating" className="mt-2 text-[11px] text-white/40">
            Running a real Grok session against the design document. This takes a minute.
          </div>
        )}
      </div>
    );
  }

  const approved = plan.state === "approved";
  const blockedReason = approved ? undefined : "The plan must be approved before any session launches";

  /** A task cannot start until everything it depends on is complete. */
  const unmetDependencies = (task: TaskView) =>
    task.dependsOn.filter((id) => tasks.find((t) => t.id === id)?.status !== "complete");

  return (
    <div data-testid="plan-panel" className="p-4 text-white">
      <div className="mb-3 flex items-center gap-3">
        <span
          data-testid="plan-state"
          className={`rounded px-2 py-0.5 text-xs ${
            approved ? "bg-green-500/15 text-green-300" : "bg-yellow-500/15 text-yellow-300"
          }`}
        >
          {approved ? "Approved" : "Draft"}
        </span>
        <span className="text-xs text-white/40">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
          {plan.approvedBy ? ` · approved by ${plan.approvedBy}` : ""}
        </span>

        {!approved && (
          <button
            type="button"
            data-testid="plan-approve"
            onClick={onApprove}
            className="ml-auto rounded bg-green-500/20 px-2 py-1 text-xs text-green-200 hover:bg-green-500/30"
          >
            Approve Plan
          </button>
        )}
      </div>

      {!approved && (
        <div data-testid="plan-gate-note" className="mb-3 rounded border border-yellow-500/20 bg-yellow-500/5 p-2 text-xs text-yellow-200/80">
          Nothing runs until you approve. Review the tasks, their owners and their dependencies
          first — this is the gate between the design document and an agent touching the repository.
        </div>
      )}

      {tasks.length === 0 ? (
        <div data-testid="plan-no-tasks" className="text-sm text-white/50">
          The plan has no tasks yet.
        </div>
      ) : (
        <ul data-testid="plan-tasks" className="space-y-2">
          {tasks.map((task) => {
            const unmet = unmetDependencies(task);
            const launchable = approved && unmet.length === 0 && task.status !== "complete";
            const why = !approved
              ? blockedReason
              : unmet.length
                ? `Waiting on ${unmet.join(", ")}`
                : task.status === "complete"
                  ? "Already complete"
                  : undefined;

            return (
              <li
                key={task.id}
                data-testid={`plan-task-${task.id}`}
                className="rounded border border-white/10 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-white/50">{task.id}</span>
                  <span className="text-sm">{task.objective}</span>
                  <span className="ml-auto text-[11px] text-white/40">{task.status.replace(/_/g, " ")}</span>
                </div>

                <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
                  <span data-testid={`plan-task-owner-${task.id}`}>
                    {task.assignedAgentId
                      ? (agentName?.(task.assignedAgentId) ?? task.assignedAgentId)
                      : "unassigned"}
                  </span>
                  {task.requirementId && <span>{task.requirementId}</span>}
                  {task.dependsOn.length > 0 && <span>after {task.dependsOn.join(", ")}</span>}

                  <button
                    type="button"
                    data-testid={`plan-launch-${task.id}`}
                    onClick={() => onLaunch?.(task.id)}
                    disabled={!launchable}
                    title={why}
                    className="ml-auto rounded bg-white/10 px-2 py-0.5 text-[11px] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Launch
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
