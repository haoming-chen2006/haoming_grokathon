/**
 * Where the margin comments sit.
 *
 * Each comment wants to be level with the text it is about. Two agents working four lines apart
 * want the same pixel, and cards that overlap are cards nobody can read — so a comment starts at
 * the line it claims and slides down only as far as the one above it forces.
 *
 * Pure, and tested on its own, because the failure it prevents is silent: a stacking bug does not
 * throw, it just puts one agent's comment underneath another's.
 */

/**
 * Resolve overlapping comment positions, top-down.
 *
 * `desired[i]` is where comment `i` would sit if it were alone; `heights[i]` is how tall it is.
 * The result is the same order, each at its desired position or pushed just below the previous
 * card. Never pushed UP: a comment above the text it is about is worse than one below it, because
 * the eye reads the connection downward.
 */
export function stackTops(desired: number[], heights: number[], gap = 10): number[] {
  const order = desired.map((top, i) => ({ top, i })).sort((a, b) => a.top - b.top || a.i - b.i);
  const out = new Array<number>(desired.length);
  let floor = -Infinity;
  for (const { top, i } of order) {
    const y = Math.max(top, floor);
    out[i] = y;
    floor = y + (heights[i] ?? 0) + gap;
  }
  return out;
}
