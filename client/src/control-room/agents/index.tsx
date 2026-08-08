/**
 * The AGENTS page — the board, and the four buttons the loop is made of.
 *
 * This page did not exist. Every service under it did: a Planner that takes a real turn, a launch
 * that creates a worktree and briefs a `grok` process, a submission with test results. All of it
 * was reachable only by curl, so the product had a working engine and no driver's seat. The old
 * control room was that seat and was retired when `/` became the workspace — before this replaced
 * it, which was the wrong order and is what this file corrects.
 *
 * Laid out from `design/mockups/agents-page.html`: areas as columns, an agent card stating its role,
 * its capability, what it is doing, where, and what it has cost, over a board that says out loud
 * that an agent can only change things inside its own area.
 */
import { useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { startProject, useAgents, type AgentView, type TaskView } from "./useAgents";

const STATUS_CLASS: Record<string, string> = {
  working: "bg-status-working-bg text-status-working-ink border-status-working-border",
  waiting: "bg-status-waiting-bg text-status-waiting-ink border-status-waiting-border",
  needs_review: "bg-status-needs-review-bg text-status-needs-review-ink border-status-needs-review-border",
  complete: "bg-status-complete-bg text-status-complete-ink border-status-complete-border",
  failed: "bg-status-failed-bg text-status-failed-ink border-status-failed-border",
  idle: "bg-status-idle-bg text-status-idle-ink border-status-idle-border",
};

/** The status word, always written out. Colour is never the only signal. */
function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span
      data-testid={`status-${status}`}
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${
        STATUS_CLASS[status] ?? STATUS_CLASS.idle
      }`}
    >
      {label}
    </span>
  );
}

function Money({ usd }: { usd?: number }) {
  // No charge is not a price of zero, and an unpriced model is not free. Both render as a dash
  // rather than as $0.00, which is a figure we did not compute.
  if (usd === undefined || usd === null) return <span className="font-mono text-ink-ghost">—</span>;
  return <span className="font-mono text-ink-muted">${usd.toFixed(2)}</span>;
}

function AgentCard({ agent, task, onPause }: { agent: AgentView; task?: TaskView; onPause(): void }) {
  return (
    <div
      data-testid={`agent-${agent.id}`}
      className="rounded border border-border bg-surface p-2.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] text-ink">{agent.name}</span>
        <StatusBadge status={agent.status} />
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
        {agent.role}
      </div>

      {agent.statusDetail ? (
        <p className="mt-2 text-[13px] leading-snug text-ink-muted">{agent.statusDetail}</p>
      ) : null}

      {/* Only what the server actually supplied. An absent field is omitted, never defaulted. */}
      {task ? (
        <p className="mt-2 text-[13px] text-ink-faint">
          on <span className="font-mono text-[11px] text-ink-muted">{task.id}</span> — {task.objective}
        </p>
      ) : null}
      {agent.branch ? (
        <p className="mt-1 font-mono text-[11px] text-ink-ghost">{agent.branch}</p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
          cost <Money usd={agent.costUsd} />
        </span>
        <button
          type="button"
          data-testid={`pause-${agent.id}`}
          onClick={onPause}
          disabled={agent.status !== "working"}
          title={agent.status === "working" ? "Pause this agent" : "Only a working agent can be paused"}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
        >
          Pause
        </button>
      </div>
    </div>
  );
}

/** Paste a document and the product does the rest. This is the front door. */
export function StartProject({ onStarted }: { onStarted?(projectId: string): void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { projectId } = await startProject(title, text);
      onStarted?.(projectId);
      // Land on the project that was just created, not on whichever is first in the list. Without
      // the id in the URL the shell selects the oldest project it has, and creating a new one looks
      // like it did nothing — which is exactly what it looked like.
      const url = new URL(location.href);
      url.searchParams.set("project", projectId);
      location.assign(url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="start-project" className="mx-auto max-w-2xl p-8">
      <h1 className="text-[19px] text-ink">Start a project</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
        Paste a design document. Everything else — the team, the plan, the deliverables — is derived
        from it. Declare the work in a fenced <span className="font-mono text-[11px]">project</span>{" "}
        block:
      </p>
      <pre className="mt-2.5 overflow-x-auto rounded border border-border bg-surface p-2.5 font-mono text-[11px] leading-relaxed text-ink-faint">{`\`\`\`project
name: Aeris Chairs — Q3 Sales Push
category: slides
budget: 25
areas:
  - Research: what buyers already believe
  - Narrative: the five-slide arc
\`\`\``}</pre>

      <input
        data-testid="start-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional — the first heading is used otherwise)"
        className="mt-4 w-full rounded border border-border bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-ghost"
      />
      <textarea
        data-testid="start-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder="# Your design document…"
        className="mt-2 w-full rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-ghost"
      />

      {error ? (
        <p role="alert" data-testid="start-error" className="mt-2 text-[13px] text-status-failed-ink">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="start-submit"
        onClick={() => void submit()}
        disabled={busy || !text.trim()}
        title={text.trim() ? "Create the project this document declares" : "Paste a document first"}
        className="mt-3 rounded border border-border-strong bg-surface-active px-3 py-1.5 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
      >
        {busy ? "Starting…" : "Start work"}
      </button>
    </div>
  );
}

export function AgentsPage({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const data = useAgents(projectId);
  const { project, agents } = data;
  // The front door has to be reachable from a workspace that already HAS projects. It was rendered
  // only when there were none, so anyone who had ever used the product could not find it — which is
  // the state every real machine is in.
  const [starting, setStarting] = useState(false);

  if (!projectId || starting) return <StartProject />;
  if (data.loading && !project) {
    return <p className="p-6 text-[13px] text-ink-faint">Loading the board…</p>;
  }

  const tasks = project?.tasks ?? [];
  const planState = project?.plan?.state;
  const byRequirement = (project?.requirements ?? []).map((r) => ({
    requirement: r,
    tasks: tasks.filter((t) => t.requirementId === r.id),
  }));
  const unassigned = tasks.filter((t) => !t.requirementId);

  const launchReason = (t: TaskView): string | undefined => {
    if (planState !== "approved") return "The plan must be approved before any session launches";
    if (!t.assignedAgentId) return "No agent assigned";
    if (t.status === "complete") return "Already complete";
    const unmet = t.dependsOn.filter((d) => tasks.find((x) => x.id === d)?.status !== "complete");
    return unmet.length ? `Waiting on ${unmet.join(", ")}` : undefined;
  };

  return (
    <div data-testid="agents-page" className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <span className="text-[15px] text-ink">The board</span>
          <span className="ml-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
            {byRequirement.length} areas · {agents.length} agents
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data.busy ? (
            <span className="font-mono text-[11px] text-ink-faint">{data.busy}…</span>
          ) : null}
          <button
            type="button"
            data-testid="new-project"
            onClick={() => setStarting(true)}
            title="Paste another design document and start a second project"
            className="rounded border border-border px-2.5 py-1 text-[13px] text-ink-faint hover:bg-surface-hover"
          >
            New project
          </button>
          {!project?.plan ? (
            <button
              type="button"
              data-testid="generate-plan"
              onClick={() => void data.generatePlan()}
              disabled={!!data.busy}
              title="A real Planner turn. It reads the document and proposes the work."
              className="rounded border border-border-strong bg-surface-active px-2.5 py-1 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
            >
              Generate plan
            </button>
          ) : planState !== "approved" ? (
            <button
              type="button"
              data-testid="approve-plan"
              onClick={() => void data.approvePlan()}
              disabled={!!data.busy}
              title="Nothing runs until a human approves the plan."
              className="rounded border border-border-strong bg-surface-active px-2.5 py-1 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
            >
              Approve plan
            </button>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-status-working-ink">
              plan approved
            </span>
          )}
        </div>
      </div>

      <p className="border-b border-border px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-ink-ghost">
        An agent can only change things inside its own area
      </p>

      {data.error ? (
        <p role="alert" data-testid="agents-error" className="border-b border-border px-4 py-2 text-[13px] text-status-failed-ink">
          {data.error}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {byRequirement.length === 0 && unassigned.length === 0 ? (
          <p className="text-[13px] text-ink-faint">
            No areas yet. Generate a plan and the Planner proposes the work this document declares.
          </p>
        ) : null}

        {byRequirement.map(({ requirement, tasks: areaTasks }) => (
          <section
            key={requirement.id}
            data-testid={`area-${requirement.id}`}
            className="flex w-72 shrink-0 flex-col gap-2 rounded border border-border bg-canvas p-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <button
                type="button"
                onClick={() => onSelect(requirement.id === selectionId ? undefined : requirement.id)}
                className="text-left text-[15px] text-ink hover:text-accent"
              >
                {requirement.id}
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
                {requirement.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-[13px] leading-snug text-ink-faint">{requirement.description}</p>

            {areaTasks.map((t) => {
              const reason = launchReason(t);
              const agent = agents.find((a) => a.id === t.assignedAgentId);
              return (
                <div key={t.id} className="rounded border border-border bg-surface p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-ink-muted">{t.id}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-ink">{t.objective}</p>
                  <p className="mt-1 text-[11px] text-ink-ghost">
                    {agent ? agent.name : "unassigned"}
                  </p>
                  <button
                    type="button"
                    data-testid={`launch-${t.id}`}
                    onClick={() => void data.launch(t.id)}
                    disabled={!!reason || !!data.busy}
                    title={reason ?? "Open a worktree and brief an agent in it"}
                    className="mt-1.5 w-full rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
                  >
                    Launch
                  </button>
                  {reason ? (
                    <p className="mt-1 text-[11px] text-ink-ghost">{reason}</p>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="border-t border-border p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">The team</div>
        <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              task={tasks.find((t) => t.id === a.currentTaskId)}
              onPause={() => void data.pause(a.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgentsNavigator({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { project, agents } = useAgents(projectId);
  if (!project) return <p className="text-[13px] text-ink-faint">No project yet.</p>;
  // `?? []` rather than `project.requirements.map`: the project payload is a network value, and a
  // response without the field threw during render. Twice now in this file's neighbours.
  const requirements = project.requirements ?? [];
  return (
    <div className="flex flex-col gap-1">
      {requirements.map((r) => (
        <button
          key={r.id}
          type="button"
          data-testid={`nav-area-${r.id}`}
          onClick={() => onSelect(r.id === selectionId ? undefined : r.id)}
          className={`rounded px-2 py-1 text-left text-[13px] ${
            r.id === selectionId ? "bg-surface-active text-ink" : "text-ink-muted hover:bg-surface-hover"
          }`}
        >
          {r.id}
        </button>
      ))}
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
        {agents.length} agents
      </div>
    </div>
  );
}

export const AGENTS_PAGE_SLOTS = {
  main: AgentsPage,
  navigator: AgentsNavigator,
};
