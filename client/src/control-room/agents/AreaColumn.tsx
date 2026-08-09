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
import { useState } from "react";
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
  /**
   * Hire an agent into THIS area — the box-click flow.
   *
   * Optional so the column still renders read-only wherever the caller cannot create; the control
   * is simply absent then, rather than present and refusing.
   */
  /** An agent card was dropped on this area. Absent means the column is not a drop target. */
  onDropAgent?(agentId: string): void;
  onStartAgent?(input: {
    areaId: string;
    name: string;
    role: string;
    capabilities?: { images: boolean; voice: boolean };
  }): void;
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
  onStartAgent,
  onDropAgent,
}: AreaColumnProps) {
  // Dragging is a hover state as well as a drop: a target that does not light up leaves the user
  // guessing whether the gesture is even possible.
  const [over, setOver] = useState(false);
  const accent = areaAccent(area);
  const inside = agentsInArea(area, agents);
  const spend = knownSpend(inside);

  return (
    <section
      data-testid={`area-${area.id}`}
      // Drop moves an agent here. One agent per area, so the server refuses an occupied target with
      // AREA_OCCUPIED — the column stops advertising itself when it is full rather than accepting a
      // gesture it knows will fail.
      onDragOver={(e) => {
        if (!onDropAgent || area.ownerAgentId) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!onDropAgent || area.ownerAgentId) return;
        e.preventDefault();
        const agentId = e.dataTransfer.getData("text/agent-id");
        if (agentId) onDropAgent(agentId);
      }}
      className={`flex min-w-[268px] flex-1 flex-col rounded-[10px] border p-3 ${accent.rule} ${accent.wash} ${
        over ? "ring-2 ring-accent" : ""
      }`}
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
        <>
          <p data-testid="area-empty" className="text-[13px] leading-snug text-ink-faint">
            {/* "Nobody assigned" is the server's own word for it, and it is not a status: an area
                nobody works in is the absence of one. Idle would claim a session exists. */}
            {area.statusPresentation?.label ?? "Nobody assigned"} — no agent is hired into this area
            yet, so nothing here is being worked on.
          </p>
        </>
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

      {/*
        Hiring is offered only while the area is free.
        
        `assignArea` refuses an occupied area with AREA_OCCUPIED — one agent per area is the
        boundary rule, not an oversight: the area is "the one place an agent hired into it may
        write", and two agents writing in one place is the thing it exists to prevent.
        
        Offering the control anyway created the agent and then failed the assignment, leaving an
        orphan with no area — which is what "it errors and kicks the agent out" was. Drag another
        agent's card here to move it instead.
      */}
      {onStartAgent && !area.ownerAgentId ? (
        <StartAgentHere area={area} busy={busy} onStart={onStartAgent} />
      ) : null}
    </section>
  );
}

/**
 * Put an agent inside an empty area.
 *
 * The box is the unit of work and it is also the boundary, so hiring happens ON the box rather than
 * in a global form that then asks which area — an agent belongs to exactly one, and choosing it
 * twice is a chance to choose differently.
 *
 * Capability is the money control, not a feature switch: media tools are REGISTERED per capability,
 * so a text-only agent cannot reach a priced endpoint at all. The prices are on the options because
 * the person clicking this is the person paying.
 */
function StartAgentHere({
  area,
  busy,
  onStart,
}: {
  area: AreaView;
  busy?: boolean;
  onStart: NonNullable<AreaColumnProps["onStartAgent"]>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [capability, setCapability] = useState<"base" | "images" | "voice" | "both">("base");

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`start-agent-${area.id}`}
        onClick={() => setOpen(true)}
        className="rounded-[7px] border border-dashed border-border-strong px-2.5 py-2 text-[13px] text-ink-faint hover:bg-surface-hover"
      >
        Start an agent here
      </button>
    );
  }

  return (
    <form
      data-testid={`start-agent-form-${area.id}`}
      onSubmit={(e) => {
        e.preventDefault();
        onStart({
          areaId: area.id,
          name: name.trim(),
          // The area is the role. A separate role field would be a second name for the same thing,
          // and this agent exists to do this area's work.
          role: area.name,
          ...(capability === "base"
            ? {}
            : {
                capabilities: {
                  images: capability === "images" || capability === "both",
                  voice: capability === "voice" || capability === "both",
                },
              }),
        });
        setName("");
        setCapability("base");
        setOpen(false);
      }}
      className="flex flex-col gap-1.5 rounded-[7px] border border-dashed border-border-strong p-2"
    >
      <input
        data-testid={`start-agent-name-${area.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this agent"
        aria-label="Agent name"
        className="rounded border border-border bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-ghost"
      />
      <select
        data-testid={`start-agent-capability-${area.id}`}
        aria-label="What this agent may produce"
        value={capability}
        onChange={(e) => setCapability(e.target.value as typeof capability)}
        className="rounded border border-border bg-surface px-2 py-1 text-[13px] text-ink"
      >
        <option value="base">Text only — base Grok</option>
        <option value="images">Images — $0.02 each</option>
        <option value="voice">Speech — $15 per million characters</option>
        <option value="both">Images and speech</option>
      </select>
      <div className="flex gap-1.5">
        <button
          type="submit"
          data-testid={`start-agent-submit-${area.id}`}
          disabled={!name.trim() || busy}
          title={name.trim() ? `Hire into ${area.name}` : "Name the agent first"}
          className="flex-1 rounded border border-border-strong bg-surface-active px-2 py-1 text-[13px] text-ink disabled:opacity-40"
        >
          Start
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-border px-2 py-1 text-[13px] text-ink-faint hover:bg-surface-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
