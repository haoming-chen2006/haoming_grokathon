/**
 * The one place a dollar figure becomes text (§4.7, COST-015).
 *
 * It exists as a function rather than a convention because `$0.00` is currently rendered from three
 * different code paths — `client/src/control-room/ProjectHeader.tsx:139`,
 * `client/src/control-room/CommandCenter.tsx:70` and `client/src/control-room/AgentCard.tsx:72` —
 * and every one of them is lying. `estimateCost` returns `{ costUsd: 0, rateKey: null }` for a model
 * it has no rate for, all three sites `.toFixed(2)` it, and the user reads *cheap* where the truth is
 * *we do not know the price of this model*. A guideline would not survive four worktrees writing
 * components in parallel; a single function will.
 *
 * The rule this module enforces, in one sentence: **an absent price is said in words, never
 * defaulted to a number.**
 */

/** Where a figure came from, in descending order of confidence (§4.2). */
export type Pricing = "billed" | "metered" | "estimated" | "unknown";

export interface Charge {
  /** `null` whenever nothing could price the charge. Never `0` standing in for "we don't know". */
  costUsd: number | null;
  pricing: Pricing;
  /**
   * The rate that produced the figure, or `null` when a lookup was made and found nothing. A
   * `billed` charge legitimately has none — the provider gave us the money directly — which is why
   * `null` only means "unpriced" for the two tiers that are computed from a rate.
   */
  rateKey?: string | null;
  modelId?: string;
  /** The exact part of the charge: how much was bought. Survives even when the price does not. */
  units?: { kind: string; count: number };
}

/** Whether this charge can be shown as money at all. */
export function isPriced(charge: Charge): boolean {
  if (charge.costUsd === null || charge.costUsd === undefined) return false;
  if (charge.pricing === "unknown") return false;
  // A token estimate or a metered charge with no rate key is the $0.00 failure this module exists
  // to stop: the arithmetic ran, found no rate, and returned zero rather than nothing.
  if ((charge.pricing === "estimated" || charge.pricing === "metered") && charge.rateKey === null) return false;
  return true;
}

const money = (usd: number) => `$${usd.toFixed(2)}`;

/**
 * Format one charge.
 *
 *   billed     "$6.20"
 *   metered    "$5.52"
 *   estimated  "$0.41 est."
 *   unknown    "price unknown"
 *
 * Never "$0.00" for an absent price, never "$—", never blank.
 */
export function formatCharge(charge: Charge): string {
  if (!isPriced(charge)) return "price unknown";
  const usd = charge.costUsd as number;
  return charge.pricing === "estimated" ? `${money(usd)} est.` : money(usd);
}

const UNIT_LABELS: Record<string, [singular: string, plural: string]> = {
  tokens: ["token", "tokens"],
  images: ["image", "images"],
  video_seconds: ["second of video", "seconds of video"],
  characters: ["character", "characters"],
  audio_hours: ["hour of audio", "hours of audio"],
  realtime_minutes: ["minute of live speech", "minutes of live speech"],
  sandbox_minutes: ["minute of sandbox time", "minutes of sandbox time"],
};

/**
 * What was bought, in words. This part is exact even when the price is unknown, so it is shown
 * either way — a charge nobody can price is still a charge whose size the user can judge.
 *
 * Returns `null` when there is nothing exact to say.
 */
export function formatUnits(charge: Charge): string | null {
  const units = charge.units;
  if (!units || !Number.isFinite(units.count)) return null;
  const [singular, plural] = UNIT_LABELS[units.kind] ?? [units.kind.replace(/_/g, " "), units.kind.replace(/_/g, " ")];
  return `${units.count.toLocaleString("en-US")} ${units.count === 1 ? singular : plural}`;
}

/** A charge as one line: the price if there is one, and always the size. */
export function describeCharge(charge: Charge): string {
  const units = formatUnits(charge);
  return units ? `${formatCharge(charge)} · ${units}` : formatCharge(charge);
}

export interface ChargeTotal {
  /** The sum of the charges that could be priced. Incomplete whenever `unpricedCount` is non-zero. */
  costUsd: number;
  pricedCount: number;
  unpricedCount: number;
  /** True only when every charge in the total carried a price. */
  complete: boolean;
}

/**
 * Add charges up without pretending the unpriced ones are free.
 *
 * Summing an unpriced charge as zero is the failure mode that makes a total unnoticeably wrong: it
 * produces a number that looks authoritative and is smaller than the truth. Here the unpriced ones
 * are counted, not added, and the count travels with the total so every renderer has to deal with it.
 */
export function summariseCharges(charges: readonly Charge[]): ChargeTotal {
  let costUsd = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const charge of charges) {
    if (isPriced(charge)) {
      costUsd += charge.costUsd as number;
      pricedCount += 1;
    } else {
      unpricedCount += 1;
    }
  }
  return {
    costUsd: Number(costUsd.toFixed(6)),
    pricedCount,
    unpricedCount,
    complete: unpricedCount === 0,
  };
}

const charges = (n: number) => `${n} charge${n === 1 ? "" : "s"}`;

/**
 * Format a total. An incomplete total says so and says by how many charges — a total that quietly
 * omits what it could not price is the same lie as a `$0.00` charge, one level up.
 */
export function formatTotal(total: ChargeTotal): string {
  if (total.pricedCount === 0 && total.unpricedCount === 0) return "nothing spent yet";
  if (total.pricedCount === 0) return `price unknown for all ${charges(total.unpricedCount)}`;
  if (total.complete) return money(total.costUsd);
  return `${money(total.costUsd)} plus ${charges(total.unpricedCount)} we could not price`;
}

/**
 * Whether spend is inside its budget.
 *
 * `under` is a claim that requires a complete total: with an unpriced charge outstanding the spend
 * could be anything, so the honest answer is `unknown`. `over` needs no such care — it is proved by
 * the priced charges alone, and an unpriced charge can only make it more true.
 */
export type BudgetState = "under" | "over" | "unknown";

export function budgetState(total: ChargeTotal, budgetUsd: number | undefined): BudgetState {
  if (budgetUsd === undefined) return "unknown";
  if (total.costUsd > budgetUsd) return "over";
  return total.complete ? "under" : "unknown";
}

/** Spend against a budget, in plain words, for the non-technical surface (§4.4). */
export function formatBudget(total: ChargeTotal, budgetUsd: number | undefined): string {
  const spent = formatTotal(total);
  if (budgetUsd === undefined) return spent;
  const state = budgetState(total, budgetUsd);
  if (state === "over") return `${money(total.costUsd)} of ${money(budgetUsd)} — over budget`;
  if (state === "under") return `${money(total.costUsd)} of ${money(budgetUsd)}`;
  if (total.pricedCount === 0) return `${money(budgetUsd)} budget — ${spent}, so this may already be over`;
  return `${money(total.costUsd)} of ${money(budgetUsd)}, plus ${charges(total.unpricedCount)} we could not price`;
}
