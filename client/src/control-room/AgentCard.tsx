import { AgentStatusBadge } from "./AgentStatusBadge";
import type { CodingAgent } from "./types";

interface Props {
  agent: CodingAgent;
  onOpenSession?: (agentId: string) => void;
  onPause?: (agentId: string) => void;
  onStop?: (agentId: string) => void;
}

function Field({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="shrink-0 text-white/40">{label}</span>
      <span data-testid={testId} className="truncate font-mono text-white/80">
        {value}
      </span>
    </div>
  );
}

/**
 * One coding agent on the command canvas (V-021), showing the activity fields the design requires
 * (V-024): role, status, current task, branch, worktree, latest file, tests, cost and blocker.
 *
 * Every value is rendered only when the server actually supplied it — §22.18 forbids fabricated
 * agent status and fabricated cost, so an unknown field is omitted rather than defaulted to a
 * plausible-looking placeholder.
 */
export function AgentCard({ agent, onOpenSession, onPause, onStop }: Props) {
  const { activity } = agent;
  const hasTests = activity.testsTotal !== undefined && activity.testsPassing !== undefined;

  return (
    <div
      data-testid="agent-card"
      data-agent-id={agent.id}
      className="w-72 rounded-lg border border-white/10 bg-neutral-900 p-3 text-white shadow-lg"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div data-testid="agent-name" className="truncate text-sm font-semibold">
            {agent.name}
          </div>
          <div data-testid="agent-role" className="truncate text-xs text-white/50">
            {agent.role}
          </div>
        </div>
        <AgentStatusBadge status={agent.status} detail={agent.statusDetail} />
      </div>

      {agent.statusDetail && (
        <div data-testid="agent-status-detail" className="mb-2 text-xs text-white/60">
          {agent.statusDetail}
        </div>
      )}

      <div className="space-y-1">
        {activity.command && <Field label="Command" value={activity.command} testId="agent-command" />}
        {activity.tool && <Field label="Tool" value={activity.tool} testId="agent-tool" />}
        {agent.currentTaskId && <Field label="Task" value={agent.currentTaskId} testId="agent-task" />}
        {activity.latestFile && <Field label="File" value={activity.latestFile} testId="agent-file" />}
        {agent.branch && <Field label="Branch" value={agent.branch} testId="agent-branch" />}
        {agent.worktree && <Field label="Worktree" value={agent.worktree} testId="agent-worktree" />}
        {hasTests && (
          <Field
            label="Tests"
            value={`${activity.testsPassing}/${activity.testsTotal} passing`}
            testId="agent-tests"
          />
        )}
        <Field label="Cost" value={`$${agent.costUsd.toFixed(2)}`} testId="agent-cost" />
      </div>

      {activity.blocker && (
        <div
          data-testid="agent-blocker"
          className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300"
        >
          Blocked: {activity.blocker}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="agent-open-session"
          onClick={() => onOpenSession?.(agent.id)}
          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          Open Session
        </button>
        <button
          type="button"
          data-testid="agent-pause"
          onClick={() => onPause?.(agent.id)}
          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          Pause
        </button>
        <button
          type="button"
          data-testid="agent-stop"
          onClick={() => onStop?.(agent.id)}
          className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
        >
          Stop
        </button>
      </div>
    </div>
  );
}
