/**
 * The cost ledger (COST-004): one append-only row per charge.
 *
 * Everything else in the cost engine is a grouping over this table. It exists because the product
 * has never had one: `agent.costUsd += …` (`server/services/agentRegistry.ts:359`) and
 * `task.costUsd = task.costUsd + …` (`server/services/projectStore.ts:1227`) keep running totals and
 * nothing anywhere persists an individual charge. That is not "the charts are missing" — it is that
 * the information needed to draw any of them was destroyed at write time and cannot be backfilled.
 *
 * Three rules, and they are the whole design:
 *
 *   1. `record()` never throws. By the time it is called the money is already spent, so a throw
 *      loses the row and not the charge. An unpriceable charge is written with `costUsd: null` and
 *      `pricing: "unknown"`, and the unpriced-charge report is how it gets noticed.
 *   2. Append-only. No row is updated or deleted; a correction is a new row. The store is NDJSON
 *      appended a line at a time, so the property holds at the filesystem level rather than by
 *      convention — a rewrite of the whole file could not preserve it under a crash.
 *   3. Totals are derived. `agent.costUsd` and `task.costUsd` become sums over these rows rather
 *      than a second source of truth kept beside them. Two counters that can disagree eventually do.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { UnitKind } from "./usageAccounting";

export type { UnitKind } from "./usageAccounting";

/** Where a figure came from, in descending order of confidence (§4.2). */
export type Pricing = "billed" | "metered" | "estimated" | "unknown";

/**
 * What was bought. Deliberately not finer than a turn: `AcpConnection.prompt()` returns one usage
 * object per turn and ACP `tool_call` updates carry none, so per-tool-call attribution would be an
 * invention. Say "turn" and mean it.
 */
export type CostOperation =
  | "turn"
  | "injection"
  | "image_generation"
  | "video_generation"
  | "tts"
  | "stt"
  | "realtime"
  | "sandbox";

export type CostAssetType = "document" | "slides" | "table" | "workflow" | "software";

export interface CostEvent {
  id: string;
  /** ISO timestamp. */
  at: string;

  projectId: string;
  areaId?: string;
  agentId?: string;
  taskId?: string;

  assetId?: string;
  assetType?: CostAssetType;
  /** Which design document declared the work (03-design-docs owns the id). */
  designDocId?: string;

  operation: CostOperation;

  modelId?: string;
  /** The rate that produced the figure, or `null` when a lookup found none. */
  rateKey: string | null;

  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;

  units?: { kind: UnitKind; count: number };

  /** `null` whenever nothing could price the charge. Never `0` standing in for unknown. */
  costUsd: number | null;
  pricing: Pricing;
  /** Billed minus our own metered arithmetic, when both exist. A drift detector (COST-014). */
  meteredDeltaUsd?: number;

  /** `request_id` for a video job, the response id otherwise. */
  providerRequestId?: string;
  /** The persisted local path — never a temporary provider URL, which expires. */
  assetPath?: string;
  /** The capability that authorised the spend, recorded as a cross-check on 01-agents' enforcement. */
  capability?: string;
  /** Retry ordinal, so a retry loop is visible as rows rather than as one large total. */
  attempt?: number;
  /** Set when the spend passed the approval gate (COST-010). */
  approvalId?: string;
}

/** What a caller passes. `id` and `at` are the ledger's to assign; everything else is the caller's. */
export type CostEventInput = Omit<CostEvent, "id" | "at" | "rateKey" | "costUsd" | "pricing"> & {
  rateKey?: string | null;
  costUsd?: number | null;
  /**
   * Optional. Derived when absent — but a `billed` charge cannot be derived, because a figure that
   * came from the provider looks exactly like one we computed. Pass it explicitly for those, or the
   * row is recorded as `unknown`, which understates rather than fabricates.
   */
  pricing?: Pricing;
};

export interface CostFilter {
  projectId?: string;
  agentId?: string;
  areaId?: string;
  taskId?: string;
  assetId?: string;
  assetType?: CostAssetType;
  operation?: CostOperation;
  /** Inclusive ISO bound. */
  from?: string;
  /** Inclusive ISO bound. */
  to?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `cost_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A provider URL in `assetPath` is a pointer that will rot; the row must reference what we kept. */
const looksLikeUrl = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

/**
 * Decide the tier when the caller did not. `billed` is deliberately underivable: it is the one tier
 * that cannot be told apart from a computed figure by looking at the row.
 */
function derivePricing(input: CostEventInput): Pricing {
  if (input.pricing) return input.pricing;
  if (input.costUsd === null || input.costUsd === undefined) return "unknown";
  if (input.rateKey === null || input.rateKey === undefined) return "unknown";
  return input.units && input.units.kind !== "tokens" ? "metered" : "estimated";
}

export class CostLedger {
  private rows: CostEvent[] = [];
  private readonly path: string | null;

  constructor(dir?: string) {
    this.path = dir ? join(dir, "cost-ledger.ndjson") : null;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      this.load();
    }
  }

  /**
   * Read the ledger back.
   *
   * A malformed line is skipped and reported, never allowed to hide the rows around it. The library
   * next door does the opposite — `promptLibrary.load()` swallows a parse failure and presents a
   * truncated file as an empty one — and for money that would mean a charge silently ceasing to
   * exist. Line-per-row storage is what makes recovering the rest possible at all.
   */
  private load(): void {
    if (!this.path || !existsSync(this.path)) return;
    const unreadable: number[] = [];
    for (const [index, line] of readFileSync(this.path, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        this.rows.push(JSON.parse(line) as CostEvent);
      } catch {
        unreadable.push(index + 1);
      }
    }
    if (unreadable.length) {
      // Both numbers, because either alone misleads: how much was lost, and how much was not.
      console.error(
        `\x1b[38;5;203m[cost]\x1b[0m ${this.path}: skipped ${unreadable.length} unreadable line(s) ` +
          `at ${unreadable.join(", ")}; kept ${this.rows.length} row(s)`,
      );
    }
  }

  /**
   * Append one charge and return the row.
   *
   * Never throws: every failure path here still returns a row, because the alternative is losing the
   * record of money that has already left. A charge nobody can price is recorded as such.
   */
  record(input: CostEventInput): CostEvent {
    let assetPath = input.assetPath;
    if (assetPath && looksLikeUrl(assetPath)) {
      // Recording it would produce a row that eventually points at nothing, so the user could not
      // see what the charge bought. The charge itself is still recorded.
      console.error(
        `\x1b[38;5;203m[cost]\x1b[0m assetPath must be the persisted path, not a provider URL; ` +
          `dropped ${assetPath} from a ${input.operation} row`,
      );
      assetPath = undefined;
    }

    const event: CostEvent = {
      ...input,
      assetPath,
      id: newId(),
      at: nowIso(),
      rateKey: input.rateKey ?? null,
      costUsd: input.costUsd ?? null,
      pricing: derivePricing(input),
    };

    this.rows.push(event);
    try {
      if (this.path) appendFileSync(this.path, JSON.stringify(event) + "\n");
    } catch (err) {
      // The row is in memory and the caller gets it back; only durability was lost, and saying so
      // is more useful than throwing into a code path that has already spent the money.
      console.error(`\x1b[38;5;203m[cost]\x1b[0m could not append to ${this.path}:`, err);
    }
    return event;
  }

  /** Every row, oldest first. */
  all(): CostEvent[] {
    return [...this.rows];
  }

  query(filter: CostFilter = {}): CostEvent[] {
    return this.rows.filter((row) => {
      if (filter.projectId && row.projectId !== filter.projectId) return false;
      if (filter.agentId && row.agentId !== filter.agentId) return false;
      if (filter.areaId && row.areaId !== filter.areaId) return false;
      if (filter.taskId && row.taskId !== filter.taskId) return false;
      if (filter.assetId && row.assetId !== filter.assetId) return false;
      if (filter.assetType && row.assetType !== filter.assetType) return false;
      if (filter.operation && row.operation !== filter.operation) return false;
      if (filter.from && row.at < filter.from) return false;
      if (filter.to && row.at > filter.to) return false;
      return true;
    });
  }
}

let ledger: CostLedger | null = null;
let ledgerDir: string | null = null;

/** Rebuilt when the configured data directory changes, as `getPromptLibrary` is. */
export function getCostLedger(): CostLedger {
  const dir = process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
  if (!ledger || ledgerDir !== dir) {
    ledger = new CostLedger(dir);
    ledgerDir = dir;
  }
  return ledger;
}
