/**
 * Margin comments do not overlap, and none of them rises above the passage it is about.
 *
 * A stacking bug is silent — nothing throws, one agent's comment simply sits underneath another's
 * — which is why the geometry is a pure function with its own test rather than a few lines inside
 * a component.
 */
import { describe, expect, test } from "bun:test";
import { stackTops } from "./commentLayout";

describe("stackTops", () => {
  test("comments that do not collide stay exactly where their text is", () => {
    expect(stackTops([0, 200, 400], [50, 50, 50])).toEqual([0, 200, 400]);
  });

  test("two comments wanting the same pixel are separated, never merged", () => {
    const tops = stackTops([100, 100], [40, 40]);
    expect(tops[0]).toBe(100);
    expect(tops[1]).toBe(150); // 100 + height 40 + gap 10
  });

  test("a comment is never pushed UP to fill a gap", () => {
    // Above its own passage is worse than below it: the eye reads the connection downward.
    const tops = stackTops([300, 20], [40, 40]);
    expect(tops[1]).toBe(20);
    expect(tops[0]).toBe(300);
  });

  test("a run of collisions cascades rather than piling on one offset", () => {
    const tops = stackTops([0, 0, 0], [30, 30, 30]);
    expect(tops).toEqual([0, 40, 80]);
  });

  test("input order is preserved in the output, whatever the vertical order", () => {
    const tops = stackTops([500, 100, 300], [20, 20, 20]);
    expect(tops).toEqual([500, 100, 300]);
  });

  test("an unmeasured card is treated as zero-height rather than dropped", () => {
    // Heights arrive one paint after the cards do. Until then the layout must still be defined.
    expect(stackTops([0, 0], [])).toEqual([0, 10]);
  });
});
