import { describe, expect, test } from "bun:test";
import {
  budgetState,
  describeCharge,
  formatBudget,
  formatCharge,
  formatTotal,
  formatUnits,
  isPriced,
  summariseCharges,
  type Charge,
} from "./formatCharge";

/** What `estimateCost` returns today for a model the rate table has no entry for. */
const UNPRICED_TURN: Charge = {
  costUsd: 0,
  pricing: "estimated",
  rateKey: null,
  modelId: "some-model-nobody-priced",
  units: { kind: "tokens", count: 12_326 },
};

const PRICED_TURN: Charge = {
  costUsd: 0.022338,
  pricing: "estimated",
  rateKey: "grok-4.5",
  modelId: "grok-4.5",
  units: { kind: "tokens", count: 12_326 },
};

describe("COST-003: an unpriced charge says so, and never says $0.00", () => {
  test("a charge with no rate key is words, not a number", () => {
    // The whole failure in one assertion: today all three render sites turn this into "$0.00",
    // and a user reads that as cheap rather than as unknown.
    expect(formatCharge(UNPRICED_TURN)).toBe("price unknown");
    expect(formatCharge(UNPRICED_TURN)).not.toContain("$");
    expect(isPriced(UNPRICED_TURN)).toBe(false);
  });

  test("an explicitly unknown charge is the same, whatever number rides along with it", () => {
    expect(formatCharge({ costUsd: null, pricing: "unknown" })).toBe("price unknown");
    expect(formatCharge({ costUsd: 5, pricing: "unknown", rateKey: "stale" })).toBe("price unknown");
  });

  test("the count is still shown, because that part is exact", () => {
    expect(formatUnits(UNPRICED_TURN)).toBe("12,326 tokens");
    expect(describeCharge(UNPRICED_TURN)).toBe("price unknown · 12,326 tokens");
  });

  test("each of the four tiers renders the way §4.7 says", () => {
    expect(formatCharge({ costUsd: 6.2, pricing: "billed" })).toBe("$6.20");
    expect(formatCharge({ costUsd: 5.52, pricing: "metered", rateKey: "grok-imagine-video-1.5" })).toBe("$5.52");
    expect(formatCharge({ costUsd: 0.41, pricing: "estimated", rateKey: "grok-4.5" })).toBe("$0.41 est.");
    expect(formatCharge({ costUsd: null, pricing: "unknown", rateKey: null })).toBe("price unknown");
  });

  test("a billed charge needs no rate key — the provider gave us the money directly", () => {
    // `null` means "we looked and found nothing", which only makes a charge unpriced for the tiers
    // that are computed from a rate. Treating it as unpriced everywhere would hide real money.
    expect(formatCharge({ costUsd: 0.0223384, pricing: "billed", rateKey: null })).toBe("$0.02");
  });

  test("nothing renders as $0.00 unless it genuinely cost nothing", () => {
    expect(formatCharge({ costUsd: 0, pricing: "billed" })).toBe("$0.00");
    expect(formatCharge({ costUsd: 0, pricing: "estimated", rateKey: "grok-4.5" })).toBe("$0.00 est.");
    expect(formatCharge(UNPRICED_TURN)).toBe("price unknown");
  });

  test("units read as English for every kind the ledger can carry", () => {
    expect(formatUnits({ costUsd: null, pricing: "unknown", units: { kind: "images", count: 8 } })).toBe("8 images");
    expect(formatUnits({ costUsd: null, pricing: "unknown", units: { kind: "images", count: 1 } })).toBe("1 image");
    expect(formatUnits({ costUsd: null, pricing: "unknown", units: { kind: "video_seconds", count: 64 } }))
      .toBe("64 seconds of video");
    expect(formatUnits({ costUsd: null, pricing: "unknown", units: { kind: "characters", count: 6000 } }))
      .toBe("6,000 characters");
    expect(formatUnits({ costUsd: null, pricing: "unknown", units: { kind: "sandbox_minutes", count: 30 } }))
      .toBe("30 minutes of sandbox time");
    expect(formatUnits({ costUsd: 1, pricing: "billed" })).toBeNull();
  });
});

describe("COST-003: a total containing an unpriced charge says how many", () => {
  test("unpriced charges are counted, not added as zero", () => {
    const total = summariseCharges([PRICED_TURN, UNPRICED_TURN, UNPRICED_TURN]);
    expect(total.costUsd).toBe(0.022338);
    expect(total.pricedCount).toBe(1);
    expect(total.unpricedCount).toBe(2);
    expect(total.complete).toBe(false);
  });

  test("the rendered total names the shortfall rather than hiding it", () => {
    const total = summariseCharges([
      { costUsd: 6.2, pricing: "billed" },
      UNPRICED_TURN,
      UNPRICED_TURN,
      UNPRICED_TURN,
    ]);
    expect(formatTotal(total)).toBe("$6.20 plus 3 charges we could not price");
  });

  test("one unpriced charge is singular, because a total that reads wrong is not read", () => {
    expect(formatTotal(summariseCharges([{ costUsd: 1, pricing: "billed" }, UNPRICED_TURN])))
      .toBe("$1.00 plus 1 charge we could not price");
  });

  test("a complete total is just the money", () => {
    expect(formatTotal(summariseCharges([{ costUsd: 6.2, pricing: "billed" }, PRICED_TURN])))
      .toBe("$6.22");
  });

  test("a total of nothing but unpriced charges is not a number at all", () => {
    expect(formatTotal(summariseCharges([UNPRICED_TURN, UNPRICED_TURN]))).toBe("price unknown for all 2 charges");
  });

  test("no charges is a different answer from zero dollars", () => {
    // §22.18 and COST-007: an empty range is empty, not free.
    expect(formatTotal(summariseCharges([]))).toBe("nothing spent yet");
  });
});

describe("COST-003: a budget is not reported as under its limit while charges are unpriced", () => {
  test("under requires a complete total", () => {
    const complete = summariseCharges([{ costUsd: 2, pricing: "billed" }]);
    expect(budgetState(complete, 10)).toBe("under");

    const incomplete = summariseCharges([{ costUsd: 2, pricing: "billed" }, UNPRICED_TURN]);
    expect(budgetState(incomplete, 10)).toBe("unknown");
    expect(budgetState(incomplete, 10)).not.toBe("under");
  });

  test("over is provable from the priced charges alone", () => {
    // An unpriced charge can only make an exceeded budget more exceeded, so this one is safe to say.
    const incomplete = summariseCharges([{ costUsd: 12.4, pricing: "billed" }, UNPRICED_TURN]);
    expect(budgetState(incomplete, 10)).toBe("over");
  });

  test("no budget is not the same as being within one", () => {
    expect(budgetState(summariseCharges([{ costUsd: 2, pricing: "billed" }]), undefined)).toBe("unknown");
  });

  test("the budget line says in words why it cannot promise you are inside", () => {
    const incomplete = summariseCharges([{ costUsd: 2, pricing: "billed" }, UNPRICED_TURN]);
    expect(formatBudget(incomplete, 10)).toBe("$2.00 of $10.00, plus 1 charge we could not price");

    const complete = summariseCharges([{ costUsd: 2, pricing: "billed" }]);
    expect(formatBudget(complete, 10)).toBe("$2.00 of $10.00");

    const over = summariseCharges([{ costUsd: 12.4, pricing: "billed" }]);
    expect(formatBudget(over, 10)).toBe("$12.40 of $10.00 — over budget");

    const nothingPriced = summariseCharges([UNPRICED_TURN]);
    expect(formatBudget(nothingPriced, 10))
      .toBe("$10.00 budget — price unknown for all 1 charge, so this may already be over");
  });

  test("no token count, model name or rate key reaches the non-technical line", () => {
    // §4.4: the budget meter is read by someone who must never see the word rateKey.
    const line = formatBudget(summariseCharges([PRICED_TURN, UNPRICED_TURN]), 10);
    expect(line).not.toContain("rateKey");
    expect(line).not.toContain("grok-4.5");
    expect(line).not.toContain("token");
  });
});
