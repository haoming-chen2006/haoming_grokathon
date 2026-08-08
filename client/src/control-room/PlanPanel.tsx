import type { PlanView, TaskView } from "./useControlRoom";

interface Props {
  plan: PlanView | null;
  tasks: TaskView[];
  agentName?: (agentId: string) => string | undefined;
  /** The project's team, so an unowned task can be given an owner here rather than by curl. */
  agents?: Array<{ id: string; name: string; role: string }>;
  onAssign?: (taskId: string, agentId: string) => void;
  onApprove?: () => void;
  onLaunch?: (taskId: string) => void;
  /** Ask the Planner to propose tasks from the design document. A real agent turn. */
  onGenerate?: () => void;
  generating?: boolean;
  /** Why the last plan's assignments may need a second look — an unplaceable role, or no team. */
  notice?: string | null;
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
 *
 * It is disabled for an unowned task for the same reason: the launch endpoint refuses one with
 * NO_AGENT (400). The button used to render enabled, fail on click, and leave an error banner the
 * product offered no way to answer — so the refusal now carries its remedy, an agent picker on the
 * task itself.
 */
export function PlanPanel({
  plan, tasks, agentName, agents = [], onAssign, onApprove, onLaunch, onGenerate, generating, notice,
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

      {notice && (
        // Shown next to the owners it is about, not as a transient toast: the point is to be read
        // while the user is deciding whether the assignments are right.
        <div
          data-testid="plan-assignment-notice"
          role="status"
          className="mb-3 rounded border border-amber-500/25 bg-amber-500/5 p-2 text-xs text-amber-200/85"
        >
          {notice}
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
            const launchable =
              approved && unmet.length === 0 && task.status !== "complete" && !!task.assignedAgentId;
            const why = !approved
              ? blockedReason
              : unmet.length
                ? `Waiting on ${unmet.join(", ")}`
                : task.status === "complete"
                  ? "Already complete"
                  : !task.assignedAgentId
                    ? "No agent assigned — choose one to launch"
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
                    {task.assignedAgentId ? (
                      (agentName?.(task.assignedAgentId) ?? task.assignedAgentId)
                    ) : agents.length > 0 && onAssign ? (
                      // The role is shown beside the name so the task's role can be matched to a
                      // person without opening the roster.
                      <select
                        data-testid={`plan-task-assign-${task.id}`}
                        aria-label={`Assign an agent to ${task.id}`}
                        value=""
                        onChange={(e) => {
                          if (e.target.value) onAssign(task.id, e.target.value);
                        }}
                        className="rounded border border-white/10 bg-neutral-900 px-1 py-0.5 text-[11px] text-white/70 focus:border-white/30 focus:outline-none"
                      >
                        <option value="">unassigned — choose an agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name} · {agent.role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      "unassigned — this project has no agents yet"
                    )}
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
