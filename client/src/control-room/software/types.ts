/**
 * What the software page draws, in the shape the route will return.
 *
 * These mirror `server/services/software/preview.ts` and the `SoftwareAsset` shape offered to
 * 02-assets in `loops/handoff/pivot-software.md`, so replacing `MOCK_APPS` with a fetch is a change
 * of source rather than a rewrite of the page.
 *
 * Every optional field here is optional on purpose. An absent cost, an absent summary and an absent
 * preview URL are three different facts, and the page states each rather than defaulting it to
 * something plausible (§5.7).
 */

/** The dev server's lifecycle, as `PreviewSupervisor` reports it. */
export type PreviewState = "starting" | "running" | "failed" | "stopped";

export interface PreviewView {
  state: PreviewState;
  /** Where the running app is served. Absent unless the state is `running`. */
  url?: string;
  /**
   * MOCK ONLY. A stand-in for `url`, so the iframe has something to draw before the preview
   * service is mounted. The real page never sets this; delete it with `mockSoftware.ts`.
   */
  previewHtml?: string;
  /** Why it failed, or why a running preview was stopped. One sentence, already in plain language. */
  message?: string;
  /** Packages the dev server could not resolve, base names. Drives the one repair button offered. */
  missingPackages?: string[];
}

/**
 * What the app is doing, in the user's terms rather than the machinery's.
 *
 * Deliberately not the branch, the task status or the review queue: those are the words of the
 * retired product, and §5.7 says a salesperson never sees them.
 */
export type AppState = "working" | "ready-for-review" | "blocked" | "approved";

export interface SoftwareAppView {
  assetId: string;
  /** The app's name, as the design document called it. */
  name: string;
  state: AppState;
  preview: PreviewView;
  /** What changed, in prose. One sentence per line. Never a diff (§5.7). */
  summary: string[];
  /** Plain-language names for what was touched — "the deck list", never `src/DeckList.jsx`. */
  changedFiles: string[];
  /** How long the agent has been on it, already formatted. Absent when unknown. */
  workedFor?: string;
  /** Absent when the server has not reported one. `$0.00` is not a cost; a missing one is missing. */
  costUsd?: number;
}
