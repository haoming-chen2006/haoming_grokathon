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
import { AGENT_STATUS_PRESENTATION, type AgentRuntimeStatus } from "../types/agent";

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
