/**
 * The board's arithmetic, with no DOM in it.
 *
 * Everything the AGENTS page counts, groups or sums lives here so it can be checked against a
 * hand-made record rather than against a rendered screen. Nothing in this file invents a value:
 * a count of nothing is 0, a sum of nothing is `undefined`, and an area with no agent in it comes
 * back as an empty list rather than as a placeholder.
 */
import type { AgentView, AreaView } from "./types";

// ───────────────────────────────────────────────────────────── the rail's three counts

/**
 * The three columns the rail prints beside every area: FINE, WORKING, STOPPED.
 *
 * Read out of `design/mockups/agents-page.html` rather than chosen here. Its five agents are
 * Scribe (Working), Slidewright (Needs you), Reel (Done), Voiceover (Idle) and Ledger (Stopped),
 * and its rail totals are 1 · 1 · 3. The only assignment that produces those totals — and the
 * three per-area rows above them — is: done is FINE, working is WORKING, and everything else is
 * STOPPED, because everything else is a thing that is not moving.
 *
 * So STOPPED is not "failed". It is "not running", which is the number a person scanning a rail
 * actually wants: an idle agent and a crashed one are equally not producing anything.
 */
export type Bucket = "fine" | "working" | "stopped";

export const BUCKETS: Bucket[] = ["fine", "working", "stopped"];

/** The word each bucket carries. Colour is never the only signal, on a 7px dot least of all. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  fine: "FINE",
  working: "WORKING",
  stopped: "STOPPED",
};

export function bucketOf(status: string): Bucket {
  if (status === "working") return "working";
  if (status === "complete") return "fine";
  return "stopped";
}

export type BucketCounts = Record<Bucket, number>;

export function countBuckets(agents: AgentView[]): BucketCounts {
  const counts: BucketCounts = { fine: 0, working: 0, stopped: 0 };
  for (const agent of agents) counts[bucketOf(agent.status)] += 1;
  return counts;
}

// ───────────────────────────────────────────────────────────── who is in which area

/**
 * The agents hired into one area.
 *
 * Two sources, deliberately, and in this order. `WorkArea.ownerAgentId` is the authority: it is
 * where `assignArea()` writes the relation today, and one writer of a relation is the point. The
 * `areaId` on the agent is the mirror pivot/agents has filed and the server does not yet return —
 * reading it here costs one clause and means the board needs no edit on the day it lands.
 *
 * De-duplicated, because once both exist they will name the same agent.
 */
export function agentsInArea(area: AreaView, agents: AgentView[]): AgentView[] {
  return agents.filter((a) => a.id === area.ownerAgentId || (a.areaId && a.areaId === area.id));
}

/**
 * The agents no area claims.
 *
 * They are not a design flourish: an agent is created before it is hired into anything, so this is
 * the ordinary state of a new record, and dropping it would make an agent that exists invisible.
 * The board renders them under their own heading rather than inside a fabricated area.
 */
export function agentsWithoutArea(areas: AreaView[], agents: AgentView[]): AgentView[] {
  const claimed = new Set(areas.flatMap((area) => agentsInArea(area, agents).map((a) => a.id)));
  return agents.filter((a) => !claimed.has(a.id));
}

/** The agents that have stopped and want a person: a question asked, or work put up for review. */
export function needsYou(agents: AgentView[]): AgentView[] {
  return agents.filter((a) => a.status === "waiting" || a.status === "needs_review");
}

// ───────────────────────────────────────────────────────────── money

/**
 * What a set of agents has cost, or `undefined` when not one of them has a figure.
 *
 * The distinction matters and is §4's: a record with no `costUsd` was never priced and renders
 * "unknown"; a record with `costUsd: 0` was priced at nothing and renders "—". Summing the second
 * into the first would turn "we do not know" into "$0.00", which is the fabricated figure the rule
 * exists to forbid. A partial sum — some agents priced, some not — reports the priced ones, which
 * is what the ledger actually holds.
 */
export function knownSpend(agents: AgentView[]): number | undefined {
  const priced = agents.map((a) => a.costUsd).filter((c): c is number => typeof c === "number");
  if (priced.length === 0) return undefined;
  return priced.reduce((sum, c) => sum + c, 0);
}

// ───────────────────────────────────────────────────────────── launching

/**
 * Why this task cannot be launched, or `undefined` when it can.
 *
 * A reason rather than a boolean, because a disabled control that does not say why is a control
 * the user files a bug about. The clauses mirror the server's own refusals — the plan gate and the
 * dependency gate are separate 409s in `server/routes/projects.ts`, so they are separate sentences
 * here too.
 */
export function launchRefusal(
  task: TaskLike,
  tasks: TaskLike[],
  planState: string | undefined,
): string | undefined {
  if (planState !== "approved") return "The plan must be approved before anything launches";
  if (!task.assignedAgentId) return "No agent is assigned to this work";
  if (task.status === "complete") return "This work is already complete";
  const unmet = task.dependsOn.filter((d) => tasks.find((t) => t.id === d)?.status !== "complete");
  return unmet.length ? `Waiting on ${unmet.join(", ")}` : undefined;
}

interface TaskLike {
  id: string;
  status: string;
  assignedAgentId?: string;
  dependsOn: string[];
}

/**
 * The one piece of work this agent could be started on, if any.
 *
 * The mockup's idle card carries "Give it work", and this is what that control needs: the task
 * already assigned to this agent that nothing is stopping. Tasks with no agent are not offered
 * here because the launch endpoint refuses them (NO_AGENT) — offering one would be an affordance
 * that cannot work.
 */
export function launchableTask<T extends TaskLike>(
  agent: AgentView,
  tasks: T[],
  planState: string | undefined,
): T | undefined {
  return tasks.find(
    (t) => t.assignedAgentId === agent.id && !launchRefusal(t, tasks, planState),
  );
}

// ───────────────────────────────────────────────────────────── accents

/**
 * The area accent, as one of the six published area tokens.
 *
 * `server/services/workArea.ts` assigns one of EIGHT colour names; the token layer publishes SIX
 * area hues, each measured in both themes by `shell/tokens.test.ts`. So two pairs share a slot:
 * magenta sits with purple, red with orange. That is a real collision and it is survivable here
 * only because the accent is never the signal on its own — every area also prints its glyph and
 * its name, and `AREA_GLYPHS` is eight distinct shapes. Two more measured hues would remove it;
 * the request is in loops/handoff/pivot-frontend.md.
 *
 * An unknown token falls back to slot 1 rather than throwing: a colour is not worth a blank page.
 */
const ACCENT_SLOT: Record<string, number> = {
  blue: 1,
  green: 2,
  purple: 3,
  magenta: 3,
  orange: 4,
  red: 4,
  cyan: 5,
  yellow: 6,
};

export function accentSlot(colorToken: string | undefined): number {
  return (colorToken && ACCENT_SLOT[colorToken]) || 1;
}

/**
 * Written out one literal at a time because Tailwind reads source text: a class built as
 * `border-area-${n}` is never emitted, and the column renders with no rule at all.
 */
export const AREA_ACCENT: Record<number, { rule: string; wash: string; ink: string }> = {
  1: { rule: "border-area-1/50", wash: "bg-gutter-area-1", ink: "text-area-1" },
  2: { rule: "border-area-2/50", wash: "bg-gutter-area-2", ink: "text-area-2" },
  3: { rule: "border-area-3/50", wash: "bg-gutter-area-3", ink: "text-area-3" },
  4: { rule: "border-area-4/50", wash: "bg-gutter-area-4", ink: "text-area-4" },
  5: { rule: "border-area-5/50", wash: "bg-gutter-area-5", ink: "text-area-5" },
  6: { rule: "border-area-6/50", wash: "bg-gutter-area-6", ink: "text-area-6" },
};

export function areaAccent(area: AreaView) {
  return AREA_ACCENT[accentSlot(area.colorToken)];
}
