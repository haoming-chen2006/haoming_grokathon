/**
 * Region geometry — loops/07-shell.md §3.1.
 *
 * The current shell is fixed at 608px of chrome, 736px with the session drawer open, and
 * `client/src/index.css` sets `overflow: hidden` on `body`, so on a 1280px laptop the main area
 * gets 544px and what does not fit cannot be scrolled to. Every region here is collapsible and
 * resizable, and the widths persist.
 *
 * The bounds are the contract's, not this file's invention:
 *   navigator  288 default, 220 minimum
 *   main       480 minimum — the constraint that wins when the window is small
 *   inspector  320 default, 260 minimum
 *
 * The two wireframes disagree about the navigator's width — assets-page.html draws 262, and
 * design-document.html draws 196 (and 184 in its second state). Neither is wrong: a list of assets
 * and a list of document titles want different room. That disagreement is the argument for the
 * widths being resizable and persisted rather than for picking a third number, so §3.1's 288
 * default stands and the user moves it.
 */
import { useCallback, useEffect, useState } from "react";

export const NAVIGATOR = { key: "navigator", initial: 288, min: 220, max: 480 } as const;
export const INSPECTOR = { key: "inspector", initial: 320, min: 260, max: 520 } as const;
export const MAIN_MIN = 480;

/**
 * A collapsed region keeps a rail; it does not vanish.
 *
 * §3.1 says every region is collapsible and stops there. The two wireframes say what collapsed
 * should look like, and they agree: design-document.html draws the inspector collapsed to a 46px
 * rail carrying a `‹` control, a vertical CONVERSATION label, three presence dots and a count,
 * captioned "the document gets the full width; the rail keeps presence visible". Its second state
 * expands the same region back to a panel.
 *
 * Collapsing to nothing would have cost the user the one thing the caption says the rail is for —
 * knowing three agents are in there — and left a 1px handle as the only way back.
 */
export const RAIL = 46;

export type RegionKey = typeof NAVIGATOR.key | typeof INSPECTOR.key;

export interface RegionState {
  width: number;
  collapsed: boolean;
}

/**
 * A new key rather than the existing `openui-sidebar-pct`.
 *
 * That key holds a percentage for the legacy canvas's splitter and is live persisted state for a
 * surface this loop does not own; reusing it would make one user's canvas layout depend on the
 * other's. §3.6 keeps the openui-* keys unrenamed for the same reason, one level down.
 */
const storageKey = (key: RegionKey) => `grok-workspace-region-${key}`;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Read persisted geometry, falling back to the default on anything unreadable. */
export function readRegion(key: RegionKey): RegionState {
  const spec = key === NAVIGATOR.key ? NAVIGATOR : INSPECTOR;
  const fallback: RegionState = { width: spec.initial, collapsed: false };
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RegionState>;
    return {
      // A stored width outside the bounds is clamped rather than honoured: the bounds may tighten
      // in a later version, and a user should not be stuck with a 40px navigator they cannot see
      // the handle of.
      width: clamp(Number(parsed.width) || spec.initial, spec.min, spec.max),
      collapsed: parsed.collapsed === true,
    };
  } catch {
    // localStorage throws outright when cookies are blocked, and JSON.parse throws on a value some
    // other tool wrote. Neither is a reason to fail to render a layout.
    return fallback;
  }
}

export function writeRegion(key: RegionKey, state: RegionState): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(state));
  } catch {
    // A layout that cannot be persisted is still a layout. Losing the width on reload is a much
    // smaller failure than refusing to drag.
  }
}

/**
 * One resizable, collapsible region.
 *
 * `setWidth` clamps, so a drag past the minimum stops at the minimum rather than inverting the
 * layout, and every change is written through — the width survives a reload because it is stored
 * on the way out, not on unload, which never fires reliably.
 */
export function useRegion(key: RegionKey): RegionState & {
  setWidth: (px: number) => void;
  toggle: () => void;
} {
  const spec = key === NAVIGATOR.key ? NAVIGATOR : INSPECTOR;
  const [state, setState] = useState<RegionState>(() => readRegion(key));

  useEffect(() => {
    writeRegion(key, state);
  }, [key, state]);

  const setWidth = useCallback(
    (px: number) => setState((s) => ({ ...s, width: clamp(Math.round(px), spec.min, spec.max) })),
    [spec.min, spec.max],
  );

  const toggle = useCallback(() => setState((s) => ({ ...s, collapsed: !s.collapsed })), []);

  return { ...state, setWidth, toggle };
}

/**
 * What each region actually renders at, once the window has had its say.
 *
 * MAIN's 480px minimum outranks both side regions: on a narrow window the inspector yields first,
 * then the navigator. Returning the *rendered* widths rather than the stored ones is what keeps a
 * reload from restoring a layout the window cannot fit — the stored width is remembered, the
 * rendered one is honest.
 */
export function layout(
  available: number,
  navigator: RegionState,
  inspector: RegionState,
): { navigator: number; main: number; inspector: number } {
  let nav = navigator.collapsed ? RAIL : navigator.width;
  let insp = inspector.collapsed ? RAIL : inspector.width;

  // A rail is already the smallest a region gets, so only expanded regions yield to MAIN's
  // minimum — squeezing a 46px rail to 20px would make its expand control unhittable and would
  // save less than it cost. The inspector yields before the navigator.
  const shortfall = () => nav + insp + MAIN_MIN - available;
  const floor = (collapsed: boolean) => (collapsed ? RAIL : 0);

  if (shortfall() > 0 && !inspector.collapsed) {
    insp = Math.max(floor(inspector.collapsed), insp - shortfall());
  }
  if (shortfall() > 0 && !navigator.collapsed) {
    nav = Math.max(floor(navigator.collapsed), nav - shortfall());
  }

  return { navigator: nav, main: Math.max(0, available - nav - insp), inspector: insp };
}
