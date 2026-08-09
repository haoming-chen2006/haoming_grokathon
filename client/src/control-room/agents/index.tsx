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
import { AgentInspector } from "./AgentInspector";
import { AgentsRail } from "./AgentsRail";
import { AreaColumn } from "./AreaColumn";
import { agentsWithoutArea, launchRefusal, launchableTask } from "./board";
import { startBlankProject, startProject, useAgents } from "./useAgents";

/**
 * A document skeleton the user can edit.
 *
 * This used to be a `<pre>` above the box: an example you could read and not change, next to an
 * empty textarea. People tried to edit the example. It is now the box's starting content, put there
 * on request rather than prefilled — an empty box is the honest initial state, and text nobody
 * asked for is text they have to delete before they can write.
 */
const SCAFFOLD = [
  "# Name your project",
  "",
  "One or two sentences on what this is and who it is for.",
  "",
  "```project",
  "name: Name your project",
  "category: documents",
  "budget: 10",
  "areas:",
  "  - First area: what this part of the work covers",
  "  - Second area: what this part of the work covers",
  "```",
  "",
  "## What good looks like",
  "",
  "How you will know it is finished.",
  "",
].join("\n");

/** Paste a document and the product does the rest. This is the front door. */
export function StartProject({ onStarted }: { onStarted?(projectId: string): void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"document" | "blank" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Both ways in, sharing the landing.
   *
   * `blank` needs a name and nothing else; the document is written later on the Design Documents
   * page, where an agent can help write it. The document path stays exactly as it was — it is
   * still the richer way in, because a document declares the areas the board is made of.
   */
  const submit = async (kind: "document" | "blank") => {
    setBusy(kind);
    setError(null);
    try {
      const { projectId } =
        kind === "document"
          ? await startProject(title, text)
          : await startBlankProject(title.trim() || "Untitled project");
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
      setBusy(null);
    }
  };

  return (
    <div data-testid="start-project" className="mx-auto max-w-2xl p-8">
      <h1 className="text-[19px] text-ink">Start a project</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
        Write or paste a design document. Everything else — the team, the plan, the deliverables —
        is derived from it. The fenced{" "}
        <span className="font-mono text-[11px]">project</span> block is what declares the work.
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          data-testid="start-scaffold"
          onClick={() => setText(SCAFFOLD)}
          disabled={text.trim().length > 0}
          title={
            text.trim()
              ? "You have already written something — clear it first"
              : "Fill the box with a skeleton you can edit"
          }
          className="rounded border border-border px-2.5 py-1 text-[11px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
        >
          Start from a skeleton
        </button>
        <span className="text-[11px] text-ink-ghost">or write your own below</span>
      </div>

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
        placeholder={"# Your design document\n\nWhat are you making, and what does good look like?"}
        className="mt-2 w-full rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink placeholder:text-ink-ghost"
      />

      {error ? (
        <p role="alert" data-testid="start-error" className="mt-2 text-[13px] text-status-failed">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="start-submit"
          onClick={() => void submit("document")}
          disabled={busy !== null || !text.trim()}
          title={text.trim() ? "Create the project this document declares" : "Paste a document first"}
          className="rounded border border-border-strong bg-surface-active px-3 py-1.5 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
        >
          {busy === "document" ? "Starting…" : "Start work"}
        </button>

        {/* The second way in. Deliberately quieter than the first: a document declares the areas the
            board is made of, so starting with one is still the better path and the button that says
            so is the loud one. This is for the case where you know what you are building and have
            not written it up — which was previously a state the product refused to hold. */}
        <span className="text-[11px] text-ink-ghost">or</span>
        <button
          type="button"
          data-testid="start-blank"
          onClick={() => void submit("blank")}
          disabled={busy !== null}
          title="Create the project now and write its document later, with an agent's help"
          className="rounded border border-border px-2.5 py-1 text-[11px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
        >
          {busy === "blank" ? "Creating…" : "Start without a document"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-ghost">
        Without a document the project starts empty — no areas, no team. The Design Documents page
        is where its brief gets written, and an X agent can draft it from a sentence.
      </p>
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
          <div data-testid="board-empty" className="max-w-lg">
            <p className="text-[13px] leading-relaxed text-ink-faint">
              No areas yet. An area names a part of the work and is the one place an agent hired
              into it may write. Add one and you can put an agent in it.
            </p>
            {/*
              The board used to explain the concept and offer nothing to click. A document that
              declares no `areas:` block produces no boxes — which is most documents someone writes
              in a hurry — so the page said "generate a plan" and left the user with no area to hire
              into and no way to make one.
            */}
            <AddArea busy={!!data.busy} onAdd={(name) => void data.addArea(name)} />
          </div>
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
              onStartAgent={(input) => void data.addAgentToArea(input)}
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

/** Name a part of the work, and get a box for it. */
function AddArea({ busy, onAdd }: { busy: boolean; onAdd(name: string): void }) {
  const [name, setName] = useState("");
  return (
    <form
      data-testid="add-area-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name.trim());
        setName("");
      }}
      className="mt-3 flex gap-1.5"
    >
      <input
        data-testid="add-area-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name a part of the work — Research, Narrative, Visuals…"
        aria-label="Area name"
        className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-ghost"
      />
      <button
        type="submit"
        data-testid="add-area-submit"
        disabled={!name.trim() || busy}
        title={name.trim() ? "Create this area" : "Name the area first"}
        className="rounded border border-border-strong bg-surface-active px-2.5 py-1 text-[13px] text-ink disabled:opacity-40"
      >
        Add area
      </button>
    </form>
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

export { AgentInspector } from "./AgentInspector";

export const AGENTS_PAGE_SLOTS = {
  main: AgentsPage,
  navigator: AgentsNavigator,
  inspector: AgentInspector,
};
