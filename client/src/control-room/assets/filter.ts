/**
 * The one filter the ASSETS page has — shared by its navigator and its main region.
 *
 * There were two. The navigator held the mockup's chips and a live "N OF M MATCH"; MAIN held a
 * second chip row of its own. They were separate `useState` in separate component instances, so the
 * rail could say "All" while the grid showed only slides, and narrowing one did nothing to the
 * other. `design/mockups/assets-page.html` draws chips in the navigator and none in MAIN, which is
 * the shape a single filter takes.
 *
 * **Not the URL, and the reason is mechanical rather than a matter of taste.** `AssetsPage.tsx`
 * already argued that a selection is a location and a filter is a preference, and the router agrees
 * — but the decisive fact is that `workspaceUrl()` REBUILDS the query string from `(page,
 * selectionId, tools)` on every navigation, so a `?type=slides` would be silently dropped the
 * moment you clicked an asset. Putting it there would mean widening the shell's URL scheme, owned
 * by another loop, to carry one page's preference.
 *
 * So it lives here, in the page that owns it, as module state with subscribers — the same shape
 * `shell/regions.ts` uses for region widths, which are also preferences two regions must agree on.
 *
 * Deliberately NOT persisted. A width you set once should survive a reload; a filter should not,
 * because a shelf that comes back filtered looks like a shelf with nothing on it, and the first
 * thing a person does then is file a bug about their missing deliverables.
 */
import { useEffect, useState } from "react";

export interface AssetFilter {
  /** Free text, matched against title, type and producing agent. */
  query: string;
  /** One of `ASSET_CHIPS`. "all" admits every type. */
  chipId: string;
}

const EMPTY: AssetFilter = { query: "", chipId: "all" };

let current: AssetFilter = EMPTY;
const listeners = new Set<(next: AssetFilter) => void>();

/** Read the filter without subscribing. For a caller that already has a render scheduled. */
export function readAssetFilter(): AssetFilter {
  return current;
}

export function setAssetFilter(patch: Partial<AssetFilter>): void {
  const next = { ...current, ...patch };
  if (next.query === current.query && next.chipId === current.chipId) return;
  current = next;
  for (const listener of listeners) listener(current);
}

/**
 * Reset to nothing filtered.
 *
 * Exported for tests, which share this module across cases: state that outlives a test is state
 * that makes the next one pass or fail for reasons it does not name.
 */
export function resetAssetFilter(): void {
  current = EMPTY;
  for (const listener of listeners) listener(current);
}

/** Subscribe. Both regions call this, so neither can hold a stale copy of the other's choice. */
export function useAssetFilter(): AssetFilter {
  const [filter, setFilter] = useState<AssetFilter>(current);
  useEffect(() => {
    // Re-read on mount: the other region may have changed it between this component's first render
    // and its effect, and a filter that is one interaction behind is worse than no filter at all.
    setFilter(current);
    listeners.add(setFilter);
    return () => {
      listeners.delete(setFilter);
    };
  }, []);
  return filter;
}
