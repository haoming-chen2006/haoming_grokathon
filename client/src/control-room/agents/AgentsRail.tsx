/**
 * The AGENTS rail — the navigator region, as `design/mockups/agents-page.html` draws it.
 *
 * Search, then the areas with their three counts, then what needs a person, then the two ways to
 * get agents. The counts are the rail's whole argument: a person opening this product wants to
 * know, in one glance, how much of the work is moving and how much has stopped. FINE / WORKING /
 * STOPPED is that glance, and `board.ts` explains where the three buckets come from.
 *
 * Colour never carries a count on its own. Each column is headed by its word, each dot is a
 * different shape, and every figure is a numeral beside them.
 */
import { useState } from "react";
import {
  BUCKETS,
  BUCKET_LABEL,
  agentsInArea,
  areaAccent,
  countBuckets,
  needsYou,
  type Bucket,
  type BucketCounts,
} from "./board";
import type { AgentView, AreaView } from "./types";

/** Written out per bucket because Tailwind reads source text; see the same note in board.ts. */
const BUCKET_STYLE: Record<Bucket, { ink: string; shape: string }> = {
  fine: { ink: "text-status-complete", shape: "rounded-full" },
  working: { ink: "text-status-working", shape: "rounded-[2px]" },
  stopped: { ink: "text-status-failed", shape: "rotate-45" },
};

function Counts({ counts }: { counts: BucketCounts }) {
  return (
    <span className="flex gap-2.5 font-mono text-[11px]">
      {BUCKETS.map((bucket) => (
        <span
          key={bucket}
          data-testid={`count-${bucket}`}
          // A zero is dimmed rather than hidden: three columns that keep their places are
          // scannable down the rail, and a missing one reads as a different area shape.
          className={`flex items-center gap-1 ${counts[bucket] === 0 ? "text-ink-ghost" : BUCKET_STYLE[bucket].ink}`}
        >
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] bg-current ${BUCKET_STYLE[bucket].shape}`}
          />
          <span className="sr-only">{BUCKET_LABEL[bucket]} </span>
          {counts[bucket]}
        </span>
      ))}
    </span>
  );
}

export interface AgentsRailProps {
  areas: AreaView[];
  agents: AgentView[];
  selectionId?: string;
  busy?: boolean;
  onSelect(selectionId: string | undefined): void;
  onAddAgent(input: { name: string; role: string }): void;
}

export function AgentsRail({
  areas,
  agents,
  selectionId,
  busy,
  onSelect,
  onAddAgent,
}: AgentsRailProps) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  // The control says "Search agents" and the list under it is areas, so it matches both: an area
  // by its own name, or by the name or role of anyone hired into it. Searching for a person and
  // being shown where they work is the behaviour the label promises.
  const needle = query.trim().toLowerCase();
  const matches = (area: AreaView) => {
    if (!needle) return true;
    if (area.name.toLowerCase().includes(needle)) return true;
    return agentsInArea(area, agents).some(
      (a) => a.name.toLowerCase().includes(needle) || a.role.toLowerCase().includes(needle),
    );
  };
  const shown = areas.filter(matches);
  const waiting = needsYou(agents);

  return (
    <div data-testid="agents-rail" className="flex min-h-0 flex-1 flex-col gap-2">
      <input
        data-testid="agents-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search agents"
        aria-label="Search agents"
        className="rounded-[7px] border border-border-strong bg-transparent px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-ghost"
      />

      <div className="pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Areas</div>

      <div className="flex gap-2.5 px-2 font-mono text-[9px] uppercase tracking-[0.05em] text-ink-ghost">
        <span className="flex-1" />
        {BUCKETS.map((bucket) => (
          <span key={bucket} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className={`h-[7px] w-[7px] bg-current ${BUCKET_STYLE[bucket].ink} ${BUCKET_STYLE[bucket].shape}`}
            />
            {BUCKET_LABEL[bucket]}
          </span>
        ))}
      </div>

      <button
        type="button"
        data-testid="rail-everything"
        onClick={() => onSelect(undefined)}
        title="Show every area on the board"
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
          selectionId === undefined ? "bg-surface-active text-ink" : "text-ink-muted hover:bg-surface-hover"
        }`}
      >
        <span className="min-w-0 flex-1">Everything</span>
        <Counts counts={countBuckets(agents)} />
      </button>

      {areas.length === 0 ? (
        <p data-testid="rail-no-areas" className="px-2 text-[13px] leading-snug text-ink-faint">
          No areas yet. An area names a section of the brief and the one place an agent hired into
          it may write.
        </p>
      ) : shown.length === 0 ? (
        <p data-testid="rail-no-matches" className="px-2 text-[13px] text-ink-faint">
          Nothing matches “{query}”.
        </p>
      ) : (
        shown.map((area) => (
          <button
            key={area.id}
            type="button"
            data-testid={`rail-area-${area.id}`}
            onClick={() => onSelect(area.id === selectionId ? undefined : area.id)}
            title={`Show ${area.name}`}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] ${
              area.id === selectionId ? "bg-surface-active text-ink" : "text-ink-muted hover:bg-surface-hover"
            }`}
          >
            {area.glyph ? (
              <span aria-hidden="true" className={`text-[11px] leading-none ${areaAccent(area).ink}`}>
                {area.glyph}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">{area.name}</span>
            <Counts counts={countBuckets(agentsInArea(area, agents))} />
          </button>
        ))
      )}

      <div className="my-1 h-px bg-border" />

      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Needs you</div>
      {waiting.length === 0 ? (
        <p data-testid="needs-you-none" className="px-2 text-[13px] text-ink-faint">
          Nothing is waiting on you.
        </p>
      ) : (
        <div
          data-testid="needs-you"
          role="status"
          className="flex items-center gap-2 rounded-md border border-status-waiting px-2 py-1.5 text-[13px] text-ink-muted"
        >
          <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full bg-status-waiting" />
          {waiting.length} waiting on you
        </div>
      )}

      <div className="flex-1" />

      <button
        type="button"
        data-testid="build-the-team"
        disabled
        title="Not wired yet: a team is seeded when a project is created, and the server has no endpoint that builds one into a project that already exists. Filed in loops/handoff/pivot-frontend.md."
        className="rounded-[7px] border border-border-strong px-2.5 py-2 text-center text-[13px] text-ink opacity-40"
      >
        Build the team for me
      </button>

      {adding ? (
        <form
          data-testid="add-agent-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAddAgent({ name: name.trim(), role: role.trim() });
            setName("");
            setRole("");
            setAdding(false);
          }}
          className="flex flex-col gap-1.5 rounded-[7px] border border-dashed border-border-strong p-2"
        >
          <input
            data-testid="add-agent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Agent name"
            className="rounded border border-border bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-ghost"
          />
          <input
            data-testid="add-agent-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role — writer, deck maker, narrator"
            aria-label="Agent role"
            className="rounded border border-border bg-surface px-2 py-1 text-[13px] text-ink placeholder:text-ink-ghost"
          />
          <div className="flex gap-1.5">
            <button
              type="submit"
              data-testid="add-agent-submit"
              disabled={!name.trim() || !role.trim() || busy}
              title={
                name.trim() && role.trim()
                  ? "Create this agent"
                  : "The server needs both a name and a role"
              }
              className="flex-1 rounded border border-border-strong bg-surface-active px-2 py-1 text-[12px] text-ink hover:bg-surface-hover disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              data-testid="add-agent-cancel"
              onClick={() => setAdding(false)}
              title="Close this form"
              className="rounded border border-border px-2 py-1 text-[12px] text-ink-faint hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          data-testid="add-agent"
          onClick={() => setAdding(true)}
          title="Create one agent with a name and a role"
          className="rounded-[7px] border border-dashed border-border px-2.5 py-2 text-center text-[12px] text-ink-faint hover:bg-surface-hover"
        >
          Add one agent by hand
        </button>
      )}
    </div>
  );
}
