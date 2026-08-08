/**
 * The AGENTS page — the board, and the front door beside it.
 *
 * Rebuilt from `design/mockups/agents-page.html`. The board is areas, each holding the agents
 * hired into it; the rail is the same areas with their counts. Both were previously drawn from
 * `Requirement`, which is a different record with a different lifetime — an area is served by
 * `GET /api/coding-agents/areas` and carries the milestone, the accent, the glyph and the derived
 * status this page needs, and a requirement carries none of them.
 *
 * **Everything here starts empty and that is correct.** A fresh install has no areas and no
 * agents, so the board says so in plain language. Nothing on this page is populated to make it
 * look inhabited; the containers and the cards are built so that the first real record renders the
 * way the mockup draws it, with no further work.
 */
import { useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { AgentCard } from "./AgentCard";
import { AgentsRail } from "./AgentsRail";
import { AreaColumn } from "./AreaColumn";
import { agentsWithoutArea, launchRefusal, launchableTask } from "./board";
import { startProject, useAgents } from "./useAgents";

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
      // A full reload rather than a state update: the shell chooses the active project on mount,
      // and teaching it to adopt one mid-session is a shell change this page does not own.
      location.reload();
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
        <p role="alert" data-testid="start-error" className="mt-2 text-[13px] text-status-failed">
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
  const { project, agents, areas, vocabulary } = data;
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
  const milestones = project?.plan?.milestones ?? [];
  const milestoneName = (id?: string) => milestones.find((m) => m.id === id)?.name;

  // One selection slot serves two kinds of object, so it is read twice: an area id filters the
  // board to that area, an agent id only highlights the card. Nothing else in the URL says which.
  const selectedArea = areas.find((a) => a.id === selectionId);
  const shownAreas = selectedArea ? [selectedArea] : areas;
  const unplaced = agentsWithoutArea(areas, agents);
  const planNeedsAction = !project?.plan || planState !== "approved";

  return (
    <div data-testid="agents-page" className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-[18px] py-2.5">
        <span className="text-[17px] text-ink">The board</span>
        <span
          data-testid="board-counts"
          className="rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-ink-faint"
        >
          {areas.length} {areas.length === 1 ? "area" : "areas"} · {agents.length}{" "}
          {agents.length === 1 ? "agent" : "agents"}
        </span>
        <span className="flex-1" />
        {/* The one rule the whole product is built on, printed where it cannot be missed. */}
        <span
          data-testid="board-rule"
          className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint"
        >
          An agent can only change things inside its own area
        </span>
      </div>

      {/*
        Not in the mockup, and present only while there is a decision to make. The plan gate is
        what stands between a pasted document and any agent running at all, and the mockup draws a
        board whose plan was approved long ago. Once it is, this strip disappears and the header
        above is exactly what the mockup draws.
      */}
      {planNeedsAction || data.busy ? (
        <div
          data-testid="plan-strip"
          className="flex shrink-0 items-center gap-2 border-b border-border px-[18px] py-1.5"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
            {!project?.plan
              ? "No plan yet"
              : planState === "approved"
                ? "Plan approved"
                : "The plan is a draft — nothing runs until it is approved"}
          </span>
          <span className="flex-1" />
          {data.busy ? (
            <span data-testid="agents-busy" className="font-mono text-[11px] text-ink-faint">
              {data.busy}…
            </span>
          ) : null}
          <button
            type="button"
            data-testid="new-project"
            onClick={() => setStarting(true)}
            title="Paste another design document and start a second project"
            className="rounded border border-border px-2.5 py-0.5 text-[12px] text-ink-faint hover:bg-surface-hover"
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
              className="rounded border border-border-strong bg-surface-active px-2.5 py-0.5 text-[12px] text-ink hover:bg-surface-hover disabled:opacity-40"
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
              className="rounded border border-border-strong bg-surface-active px-2.5 py-0.5 text-[12px] text-ink hover:bg-surface-hover disabled:opacity-40"
            >
              Approve plan
            </button>
          ) : null}
        </div>
      ) : null}

      {data.error ? (
        <p
          role="alert"
          data-testid="agents-error"
          className="shrink-0 border-b border-border px-[18px] py-2 text-[13px] text-status-failed"
        >
          {data.error}
        </p>
      ) : null}

      <div className="dotted-field min-h-0 flex-1 overflow-auto bg-canvas p-4">
        {areas.length === 0 && agents.length === 0 ? (
          <p data-testid="board-empty" className="max-w-lg text-[13px] leading-relaxed text-ink-faint">
            No areas yet, and no agents yet. An area names a section of the brief and the one place
            an agent hired into it may write; an agent is hired into exactly one. Generate a plan
            and the Planner proposes the work this document declares.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3.5">
          {shownAreas.map((area) => (
            <AreaColumn
              key={area.id}
              area={area}
              milestoneName={milestoneName(area.milestoneId)}
              agents={agents}
              vocabulary={vocabulary}
              tasks={tasks}
              planState={planState}
              busy={!!data.busy}
              selectionId={selectionId}
              onSelect={onSelect}
              onPause={(id) => void data.pause(id)}
              onLaunch={(taskId) => void data.launch(taskId)}
            />
          ))}
        </div>

        {/*
          An agent exists before it is hired into anything, so this is the ordinary state of a new
          record rather than a corner case. Rendering it under its own heading is what stops a real
          agent from being invisible; putting it inside an invented area would be worse.
        */}
        {!selectedArea && unplaced.length > 0 ? (
          <div data-testid="unplaced-agents" className="mt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">
              Not in an area yet
            </div>
            <p className="mt-1 text-[12px] text-ink-faint">
              These agents can suggest changes but cannot make any until they are hired into an area.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-3">
              {unplaced.map((agent) => {
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
                    busy={!!data.busy}
                    selected={agent.id === selectionId}
                    onOpen={() => onSelect(agent.id === selectionId ? undefined : agent.id)}
                    onPause={() => void data.pause(agent.id)}
                    onLaunch={(taskId) => void data.launch(taskId)}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AgentsNavigator({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const data = useAgents(projectId);
  return (
    <AgentsRail
      areas={data.areas}
      agents={data.agents}
      selectionId={selectionId}
      busy={!!data.busy}
      onSelect={onSelect}
      onAddAgent={(input) => void data.addAgent(input)}
    />
  );
}

export const AGENTS_PAGE_SLOTS = {
  main: AgentsPage,
  navigator: AgentsNavigator,
};
