/**
 * One agent, as `design/mockups/agents-page.html` draws it.
 *
 * The card is the product's smallest complete statement: who is working, on what, where, at what
 * capability, for how much. Its measurements are the mockup's — 220px wide, a 9px radius, a status
 * strip above an 11px body, a 34px tile beside the name, then the mono facts and the controls.
 *
 * It takes a record and renders the fields that record actually has. Nothing here defaults, and
 * nothing here fetches: every absent field simply does not draw a line. That is what makes the
 * card checkable — one hand-made record in a test says exactly what a real one will look like.
 */
import type { AgentView, TaskView } from "./types";
import { bucketOf } from "./board";

/**
 * A figure, or the reason there isn't one.
 *
 * Three outcomes and they are not the same: a record with no `costUsd` was never priced and says
 * "unknown"; a record priced at nothing says "—"; anything else says the money. Rendering an
 * unpriced turn as "$0.00" is the fabricated-value defect, and it is the one this product can
 * least afford — a workspace that under-reports spend is one nobody can trust with a budget.
 */
export function Money({ usd }: { usd?: number }) {
  if (typeof usd !== "number" || Number.isNaN(usd)) {
    return (
      <span
        className="font-mono text-ink-faint"
        title="No rate is known for the model behind this work, so it has not been priced."
      >
        unknown
      </span>
    );
  }
  if (usd === 0) return <span className="font-mono text-ink-faint">—</span>;
  return <span className="font-mono text-ink">${usd.toFixed(2)}</span>;
}

/**
 * Per-status colour, written out one literal at a time.
 *
 * Tailwind reads source text, so `border-status-${status}` is never emitted and the card renders
 * with no rule at all. The keys are the API's status strings; the token names hyphenate where the
 * API underscores, which is the only reason this is a table and not a template.
 */
const STATUS_STYLE: Record<string, { rule: string; ink: string; tile: string }> = {
  working: {
    rule: "border-status-working/40",
    ink: "text-status-working",
    tile: "bg-status-working border-status-working",
  },
  waiting: {
    rule: "border-status-waiting/40",
    ink: "text-status-waiting",
    tile: "bg-status-waiting border-status-waiting",
  },
  needs_review: {
    rule: "border-status-needs-review/40",
    ink: "text-status-needs-review",
    tile: "bg-status-needs-review border-status-needs-review",
  },
  complete: {
    rule: "border-status-complete/40",
    ink: "text-status-complete",
    tile: "bg-status-complete border-status-complete",
  },
  idle: {
    rule: "border-status-idle/40",
    ink: "text-status-idle",
    tile: "bg-status-idle border-status-idle",
  },
  failed: {
    rule: "border-status-failed/40",
    ink: "text-status-failed",
    tile: "bg-status-failed border-status-failed",
  },
};

const FALLBACK_STYLE = { rule: "border-border", ink: "text-ink-faint", tile: "bg-surface-active border-border" };

/** The shape carries the state as well as the colour, and the same three shapes as the rail. */
const BUCKET_SHAPE = {
  fine: "rounded-full",
  working: "rounded-[2px]",
  stopped: "rotate-45",
} as const;

export interface AgentCardProps {
  agent: AgentView;
  /**
   * The server's word for this status. Absent until `/api/coding-agents/statuses` has loaded, at
   * which point the record's own status word is shown instead — a value, not an invention.
   */
  statusLabel?: string;
  /** The capability preset's word, when the record says which preset it holds. */
  capabilityLabel?: string;
  /** The work this agent could be started on, when there is some. Drives "Give it work". */
  launchable?: TaskView;
  /** Why "Give it work" is refused, when it is. Rendered as the control's title. */
  launchRefusal?: string;
  /** True while any mutation is in flight, so the controls do not queue a second one. */
  busy?: boolean;
  selected?: boolean;
  onOpen(): void;
  onPause(): void;
  onLaunch?(taskId: string): void;
}

export function AgentCard({
  agent,
  statusLabel,
  capabilityLabel,
  launchable,
  launchRefusal,
  busy,
  selected,
  onOpen,
  onPause,
  onLaunch,
}: AgentCardProps) {
  const style = STATUS_STYLE[agent.status] ?? FALLBACK_STYLE;
  const shape = BUCKET_SHAPE[bucketOf(agent.status)];
  // The status is ALWAYS a word. The server's word when it has arrived, the record's own when it
  // has not; the colour beside it only reinforces whichever one is showing.
  const word = statusLabel ?? agent.status.replace(/_/g, " ");
  const doing = agent.statusDetail ?? agent.activity?.command ?? agent.activity?.blocker;
  const where = agent.activity?.latestFile;
  const canPause = agent.status === "working";

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      data-status={agent.status}
      className={`w-[220px] overflow-hidden rounded-[9px] border bg-surface shadow-panel ${
        selected ? "border-border-strong" : style.rule
      }`}
    >
      <div className={`flex items-center gap-2 border-b px-[11px] py-1.5 ${style.rule}`}>
        <span aria-hidden="true" className={`h-[9px] w-[9px] shrink-0 ${shape} ${style.tile} border`} />
        <span data-testid="agent-card-status" className={`text-[13px] capitalize ${style.ink}`}>
          {word}
        </span>
        <span className="flex-1" />
        {agent.activity?.tool ? (
          <span
            data-testid="agent-card-tool"
            className="font-mono text-[9px] uppercase tracking-[0.05em] text-ink-ghost"
          >
            {agent.activity.tool}
          </span>
        ) : null}
      </div>

      <div className="p-[11px]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`h-[34px] w-[34px] shrink-0 rounded-lg border opacity-60 ${style.tile}`}
          />
          <span className="min-w-0">
            <span data-testid="agent-card-name" className="block truncate text-[16px] text-ink">
              {agent.name}
            </span>
            {/* "writer · base Grok" — the role always, the capability only when the record says. */}
            <span data-testid="agent-card-subtitle" className="block truncate text-[11px] text-ink-ghost">
              {agent.role}
              {capabilityLabel ? ` · ${capabilityLabel}` : ""}
            </span>
          </span>
        </div>

        {doing ? (
          <p data-testid="agent-card-doing" className="mt-2.5 text-[13px] leading-snug text-ink-muted">
            {doing}
          </p>
        ) : null}

        <div className="mt-2.5 flex flex-col gap-[5px] font-mono text-[11px] text-ink-faint">
          {where ? (
            <span data-testid="agent-card-in" className="flex gap-[7px]">
              <span className="text-ink-ghost">in</span>
              <span className="min-w-0 truncate">{where}</span>
            </span>
          ) : null}
          <span data-testid="agent-card-cost" className="flex gap-[7px]">
            <span className="text-ink-ghost">cost</span>
            <Money usd={agent.costUsd} />
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-[5px] text-[12px]">
          <button
            type="button"
            data-testid={`agent-open-${agent.id}`}
            onClick={onOpen}
            title={`Open ${agent.name}`}
            className="rounded-[5px] border border-border px-2 py-[3px] text-ink-faint hover:bg-surface-hover"
          >
            Open
          </button>
          <button
            type="button"
            data-testid={`agent-pause-${agent.id}`}
            onClick={onPause}
            disabled={!canPause || busy}
            title={
              canPause
                ? busy
                  ? "Another action is still running"
                  : `Pause ${agent.name}`
                : "Only a working agent can be paused"
            }
            className="rounded-[5px] border border-border px-2 py-[3px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
          >
            Pause
          </button>
          {/* The mockup's idle card carries this, and it is the only launch control on the board. */}
          {onLaunch && (launchable || launchRefusal) ? (
            <button
              type="button"
              data-testid={`agent-launch-${agent.id}`}
              onClick={() => launchable && onLaunch(launchable.id)}
              disabled={!launchable || busy}
              title={
                launchable
                  ? busy
                    ? "Another action is still running"
                    : launchable.objective
                  : (launchRefusal ?? "There is no work assigned to this agent")
              }
              className="rounded-[5px] border border-border px-2 py-[3px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
            >
              Give it work
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
