/**
 * Work areas — what replaced the git worktree.
 *
 * A work area is a *record*, not a directory trick. It names a section of the project brief, the
 * one milestone whose tasks are that section's work, and the one directory an agent hired into it
 * may write. The worktree gave isolation by accident of git; an area gives it by construction, and
 * the boundary that enforces it lives in `./boundary.ts`.
 *
 * Status is derived here and stored nowhere — the same discipline `EffectiveTaskStatus`
 * (`server/types/project.ts`) already applies to tasks, so the graph stays the single source of
 * truth and a stale status cannot drift into the record.
 */
import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { atomicWriteJson } from "./persistence";
import { canonical } from "./boundary";
import { getProjectStore } from "./projectStore";
import { getAgentRegistry } from "./agentRegistry";
import { AGENT_STATUS_PRESENTATION, type AgentRuntimeStatus } from "../types/agent";
import type { Actor, CodingTask } from "../types/project";

/**
 * The accent palette, in assignment order. Token names only: light and dark resolve them
 * differently and a hex stored on a record cannot. The hex pairs themselves are 07-shell's.
 *
 * Red and green are last and non-adjacent deliberately — they are the common colour-confusion
 * pair, so two areas created back to back must not land on them.
 */
export const AREA_COLOR_TOKENS = [
  "blue",
  "magenta",
  "cyan",
  "orange",
  "green",
  "purple",
  "yellow",
  "red",
] as const;
export type AreaColorToken = (typeof AREA_COLOR_TOKENS)[number];

/**
 * The redundant non-colour signal, one per area, in the same assignment order. Colour is never the
 * sole carrier of meaning (`server/types/agent.ts`), and an accent bar with no glyph is colour
 * alone.
 */
export const AREA_GLYPHS = ["●", "◆", "▲", "■", "◇", "○", "◼", "▼"] as const;
export type AreaGlyph = (typeof AREA_GLYPHS)[number];

export interface WorkArea {
  id: string;
  projectId: string;
  /** Human, shown to the user: "Slides", "Video assets". */
  name: string;
  colorToken: AreaColorToken;
  glyph: AreaGlyph;
  /** The section of the project brief this area owns. */
  briefSectionAnchor: string;
  /** Exactly one milestone per area. */
  milestoneId: string;
  /** Canonical absolute path; the only writable directory for an agent in this area. */
  rootPath: string;
  /** At most one agent owns an area at a time. */
  ownerAgentId?: string;
  /** Per-area cap. The engine that enforces it is 06-tools-cost's. */
  budgetUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAreaInput {
  projectId: string;
  name: string;
  briefSectionAnchor: string;
  milestoneId: string;
  rootPath: string;
  ownerAgentId?: string;
  budgetUsd?: number;
}

/**
 * `unstaffed` is not an agent status — it is the absence of one, and it needs saying out loud.
 * An area nobody is hired into reads "Nobody assigned", not "Idle": idle claims a session exists.
 */
export type EffectiveAreaStatus = AgentRuntimeStatus | "unstaffed";

export interface AreaStatusPresentation {
  status: EffectiveAreaStatus;
  /** Never empty. The text is what carries the meaning; the colour only reinforces it. */
  label: string;
  color: "green" | "yellow" | "blue" | "gray" | "red" | "orange";
  description: string;
}

const UNSTAFFED_PRESENTATION: AreaStatusPresentation = {
  status: "unstaffed",
  label: "Nobody assigned",
  color: "gray",
  description: "This section of the brief has no agent working on it.",
};

export function areaStatusPresentation(status: EffectiveAreaStatus): AreaStatusPresentation {
  if (status === "unstaffed") return UNSTAFFED_PRESENTATION;
  const presentation = AGENT_STATUS_PRESENTATION[status];
  if (!presentation) throw new Error(`Unknown area status: ${status}`);
  return presentation;
}

export interface AreaStatusInput {
  /** The owning agent's status; absent when no agent owns the area. */
  ownerStatus?: AgentRuntimeStatus;
  /** Tasks carrying this area's milestone id. */
  tasksTotal: number;
  tasksComplete: number;
}

/**
 * The area's status, derived from the owning agent and the milestone's progress. Pure and total,
 * so nothing can write a status the situation does not support.
 *
 * The ladder, and why it is in this order:
 *
 *   1. no owner            — nothing else can be true of an area nobody works in;
 *   2. the owner failed    — a failure is never masked by progress made before it;
 *   3. needs review        — work is done but not accepted, which is not "complete";
 *   4. every task complete — the milestone is the definition of the area's work being finished;
 *   5. the owner said complete while tasks remain — the agent finished *its* task, not the area,
 *      so the area is waiting on the user to assign the rest. Reporting the owner's word verbatim
 *      here would claim the section of the brief is done when it is not;
 *   6. otherwise           — the owner's own status.
 */
export function deriveAreaStatus(input: AreaStatusInput): EffectiveAreaStatus {
  if (!input.ownerStatus) return "unstaffed";
  if (input.ownerStatus === "failed") return "failed";
  if (input.ownerStatus === "needs_review") return "needs_review";
  if (input.tasksTotal > 0 && input.tasksComplete === input.tasksTotal) return "complete";
  if (input.ownerStatus === "complete") return "waiting";
  return input.ownerStatus;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `area_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    // Name the field. "Invalid input" sends the caller back to the source to find out which one.
    throw new Error(`${field} is required to create a work area`);
  }
  return value;
}

export interface WorkAreaStoreOptions {
  /** Directory to persist areas into. Omit for an in-memory store. */
  persistDir?: string;
}

export class WorkAreaStore {
  private areas = new Map<string, WorkArea>();
  private readonly persistPath: string | null;

  constructor(options: WorkAreaStoreOptions = {}) {
    this.persistPath = options.persistDir ? join(options.persistDir, "areas.json") : null;
    if (options.persistDir) {
      mkdirSync(options.persistDir, { recursive: true });
      this.load();
    }
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.persistPath, "utf-8"));
      for (const area of parsed.areas ?? []) this.areas.set(area.id, area);
    } catch {
      // A corrupt file must not stop the server booting; the areas are rebuilt by the next write.
    }
  }

  private save(): void {
    if (!this.persistPath) return;
    atomicWriteJson(this.persistPath, { areas: [...this.areas.values()] });
  }

  list(projectId?: string): WorkArea[] {
    const all = [...this.areas.values()];
    return projectId ? all.filter((a) => a.projectId === projectId) : all;
  }

  get(areaId: string): WorkArea {
    const area = this.areas.get(areaId);
    if (!area) throw new Error(`Work area not found: ${areaId}`);
    return area;
  }

  /** The area an agent is hired into, or null. At most one, enforced at creation. */
  forAgent(agentId: string): WorkArea | null {
    return this.list().find((a) => a.ownerAgentId === agentId) ?? null;
  }

  /**
   * Record which agent works here, or clear it. Record-level only — the cross-store checks that
   * make an assignment legitimate live in `assignArea`, which is the path callers use.
   */
  setOwner(areaId: string, ownerAgentId: string | undefined): WorkArea {
    const area = this.get(areaId);
    if (ownerAgentId === undefined) delete area.ownerAgentId;
    else area.ownerAgentId = ownerAgentId;
    area.updatedAt = nowIso();
    this.save();
    return area;
  }

  create(input: CreateAreaInput): WorkArea {
    const projectId = required(input?.projectId, "projectId");
    const name = required(input?.name, "name");
    const briefSectionAnchor = required(input?.briefSectionAnchor, "briefSectionAnchor");
    const milestoneId = required(input?.milestoneId, "milestoneId");
    const rootPath = required(input?.rootPath, "rootPath");

    const siblings = this.list(projectId);

    // One milestone per area, both ways round. Two areas sharing a milestone would each claim the
    // same tasks, and the progress on both tiles would be the same number wearing two names.
    const clash = siblings.find((a) => a.milestoneId === milestoneId);
    if (clash) {
      throw new Error(`Milestone ${milestoneId} is already the work of area ${clash.id} (${clash.name})`);
    }

    // An agent belongs to exactly one area. Allowing a second would make "the area this agent
    // writes in" a question with two answers, and the write guard needs exactly one.
    if (input.ownerAgentId) {
      const owned = this.forAgent(input.ownerAgentId);
      if (owned) {
        throw new Error(`Agent ${input.ownerAgentId} already owns area ${owned.id} (${owned.name})`);
      }
    }

    const index = siblings.length;
    const timestamp = nowIso();
    const area: WorkArea = {
      id: newId(),
      projectId,
      name,
      // Assignment order is fixed, so the same brief always produces the same board. Past eight
      // areas the palette wraps and two areas share an accent; the name always distinguishes them.
      colorToken: AREA_COLOR_TOKENS[index % AREA_COLOR_TOKENS.length]!,
      glyph: AREA_GLYPHS[index % AREA_GLYPHS.length]!,
      briefSectionAnchor,
      milestoneId,
      // Canonical at the moment it is stored, so no later comparison has to remember to do it.
      rootPath: canonical(rootPath),
      ownerAgentId: input.ownerAgentId,
      budgetUsd: input.budgetUsd,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.areas.set(area.id, area);
    this.save();
    return area;
  }
}

// ─────────────────────────────────────────────── hiring an agent into an area

/** An assignment was refused. The message names the remedy; the code lets the route map it. */
export class AreaAssignmentError extends Error {
  constructor(
    readonly code: "AREA_OCCUPIED" | "AREA_WRONG_PROJECT",
    message: string,
  ) {
    super(message);
    this.name = "AreaAssignmentError";
  }
}

export interface AreaAssignment {
  /** The area the agent now works in, or null when it was removed from the one it had. */
  area: WorkArea | null;
  /** The area the agent was moved out of, if any. */
  previousAreaId?: string;
}

/**
 * Hire an agent into an area — the relation `loops/01-agents.md` A-3 calls "an agent is assigned
 * exactly one area".
 *
 * The authority is the area record's `ownerAgentId`, not a field on the agent: `CodingAgent` lives
 * in a hot file this worktree does not edit, and one writer of a relation is the whole point.
 * `CodingAgent.areaId` is requested in the handoff as a mirror of this, for display.
 *
 * Pass `null` to remove the agent from whatever area it holds. That is the remedy an occupied area
 * names, so the refusal below is actionable rather than a dead end.
 */
export function assignArea(agentId: string, areaId: string | null): AreaAssignment {
  const store = getWorkAreaStore();
  const agent = getAgentRegistry().get(agentId); // throws "Agent not found: <id>"
  const held = store.forAgent(agentId);

  if (areaId === null) {
    if (held) store.setOwner(held.id, undefined);
    return { area: null, previousAreaId: held?.id };
  }

  const area = store.get(areaId); // throws "Work area not found: <id>"

  if (area.projectId !== agent.projectId) {
    // An agent hired into another project's area would be given a cwd outside its own project.
    throw new AreaAssignmentError(
      "AREA_WRONG_PROJECT",
      `Agent ${agentId} belongs to project ${agent.projectId}; area ${areaId} (${area.name}) belongs to ` +
        `project ${area.projectId}. An agent may only be hired into an area of its own project.`,
    );
  }

  if (area.ownerAgentId && area.ownerAgentId !== agentId) {
    throw new AreaAssignmentError(
      "AREA_OCCUPIED",
      `Area ${areaId} (${area.name}) is already worked by agent ${area.ownerAgentId}. ` +
        `Free it first: PATCH /api/coding-agents/${area.ownerAgentId}/area with { "areaId": null }.`,
    );
  }

  // A move, not a second hiring: an agent works in exactly one area, so the old one is released
  // before the new one is taken.
  if (held && held.id !== areaId) store.setOwner(held.id, undefined);
  return { area: store.setOwner(areaId, agentId), previousAreaId: held && held.id !== areaId ? held.id : undefined };
}

// ─────────────────────────────────────────────── the area's work: one milestone, and its tasks

/**
 * The area's milestone is not in the project's plan, so a task created here would carry a
 * `milestoneId` that links to nothing.
 *
 * This refusal exists because `ProjectStore.addTask` pushes the task onto its milestone with
 * `project.plan.milestones.find(...)?.taskIds.push(...)` — optional all the way down. A task whose
 * milestone is absent is stored happily, the milestone's `taskIds` stays empty, and nothing
 * reports it. That is how `Milestone.taskIds` came to be decorative in the shipping product: plan
 * generation created every task without a `milestoneId` and nothing ever asked whether the
 * relation had run.
 */
export class MilestoneNotInPlanError extends Error {
  readonly code = "MILESTONE_NOT_IN_PLAN";
  constructor(
    readonly areaId: string,
    readonly milestoneId: string,
    detail: string,
  ) {
    super(`Area ${areaId} names milestone ${milestoneId}, which ${detail}`);
    this.name = "MilestoneNotInPlanError";
  }
}

/** Everything `ProjectStore.addTask` accepts except the milestone, which the area decides. */
export interface CreateAreaTaskInput {
  id?: string;
  objective: string;
  requirementId?: string;
  assignedAgentId?: string;
  dependsOn?: string[];
  expectedFiles?: string[];
  completionCriteria?: string[];
  requiredTests?: string[];
  budgetUsd?: number;
}

/**
 * Create a task inside an area. The task carries the area's milestone id — always, and not as an
 * argument the caller may supply: the area is what decides which milestone its work belongs to,
 * the same reasoning that keeps an agent's identity off the MCP tool parameters.
 */
export function createTaskInArea(areaId: string, params: CreateAreaTaskInput, actor: Actor): CodingTask {
  const area = getWorkAreaStore().get(areaId);
  const store = getProjectStore();
  const plan = store.getProject(area.projectId).plan;
  if (!plan) {
    throw new MilestoneNotInPlanError(areaId, area.milestoneId, "cannot exist: the project has no plan yet");
  }
  if (!plan.milestones.some((m) => m.id === area.milestoneId)) {
    throw new MilestoneNotInPlanError(
      areaId,
      area.milestoneId,
      `is not in the project's plan (its milestones are: ${plan.milestones.map((m) => m.id).join(", ") || "none"})`,
    );
  }
  return store.addTask(area.projectId, { ...params, milestoneId: area.milestoneId }, actor);
}

// ─────────────────────────────────────────────── which sections of the brief nobody is working on

export interface BriefSection {
  /** The heading text exactly as the brief writes it. */
  anchor: string;
  level: number;
  areaId?: string;
  areaName?: string;
  /** How the area's anchor was matched to this section — recorded because it may be wrong. */
  matchKind?: "exact" | "normalised";
}

export interface BriefCoverage {
  sections: BriefSection[];
  coveredCount: number;
  /** Anchors of the sections nobody is working on. The useful signal, not an error. */
  uncovered: string[];
  /** Areas whose anchor matches no section of the brief — a resolution failure, so it is named. */
  unmatchedAreas: Array<{ areaId: string; name: string; briefSectionAnchor: string }>;
}

/**
 * The brief's sections, in document order.
 *
 * A fenced code block may contain lines beginning with `#`, and reading those as sections invents
 * headings the author never wrote. A single level-one heading at the top is the document's title —
 * `firstHeading` in `shared/designDocument.ts` already treats it that way — so it is not a section
 * of the brief either.
 */
export function briefSections(markdown: string | undefined | null): BriefSection[] {
  const out: BriefSection[] = [];
  let inFence = false;
  const lines = String(markdown ?? "").split("\n");
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1]!.length;
    const anchor = m[2]!;
    // The title: a level-one heading before any other heading has been seen.
    if (level === 1 && out.length === 0 && lines.slice(0, index).every((l) => !/^#{1,6}\s+/.test(l))) continue;
    out.push({ anchor, level });
  }
  return out;
}

/**
 * Compare a heading and an area's anchor without demanding they were typed the same way.
 *
 * The anchor on an area is a string a model wrote during team assembly; the heading is a string the
 * user wrote in the brief. An exact lookup between two such strings resolved to nobody once
 * already, and because nothing recorded which one had failed to match, the bug read as random for
 * two iterations. So: strip the section marker and the numbering, fold case and punctuation, and
 * report which kind of match happened.
 */
function normaliseAnchor(anchor: string): string {
  return anchor
    .toLowerCase()
    .replace(/^[\s§#*]*\d+(?:[.)]\d+)*[.)]?\s*/, "") // "§3 Deck", "3. Deck", "3) Deck" -> "deck"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function coverBrief(markdown: string | undefined | null, areas: WorkArea[]): BriefCoverage {
  const sections = briefSections(markdown);
  const unmatchedAreas: BriefCoverage["unmatchedAreas"] = [];

  for (const area of areas) {
    const free = sections.filter((s) => !s.areaId);
    const exact = free.find((s) => s.anchor === area.briefSectionAnchor);
    const section =
      exact ?? free.find((s) => normaliseAnchor(s.anchor) === normaliseAnchor(area.briefSectionAnchor));
    if (!section) {
      // An area pointing at a section the brief does not contain is not silently dropped: the
      // board has to be able to say which anchor failed to resolve.
      unmatchedAreas.push({ areaId: area.id, name: area.name, briefSectionAnchor: area.briefSectionAnchor });
      continue;
    }
    section.areaId = area.id;
    section.areaName = area.name;
    section.matchKind = exact ? "exact" : "normalised";
  }

  const uncovered = sections.filter((s) => !s.areaId).map((s) => s.anchor);
  return { sections, coveredCount: sections.length - uncovered.length, uncovered, unmatchedAreas };
}

/** Process-wide store, persisted alongside the rest of the state — see getAgentRegistry. */
let store: WorkAreaStore | null = null;
let storeDir: string | null = null;

export function getWorkAreaStore(): WorkAreaStore {
  const dir = process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
  if (!store || storeDir !== dir) {
    store = new WorkAreaStore({ persistDir: dir });
    storeDir = dir;
  }
  return store;
}
