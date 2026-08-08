/**
 * ASSETS — NAVIGATOR, as `design/mockups/assets-page.html` draws it.
 *
 * A search, the filter chips, a live match count, the matching rows, then RECENT. The design is
 * search-first and says so at the foot of the rail — "Type to search all 212 assets. Nothing is
 * listed until you ask." — which is not a decoration: a shelf with two hundred deliverables on it
 * is unreadable as a list, and the count is what tells you your search narrowed anything.
 *
 * The count is derived, never written: "4 OF 212 MATCH" is `shown.length` of `assets.length`. On a
 * fresh install it reads "0 OF 0 MATCH", which is correct and is what an empty shelf looks like.
 */
import { useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { AssetRow } from "./AssetRow";
import { ASSET_CHIPS, chipAdmits, type AssetView } from "./types";
import { useAssets } from "./useAssets";

/** How many rows the rail lists before it asks you to narrow. The mockup lists four. */
export const ROW_LIMIT = 12;

/**
 * The deliverables a query and a chip admit.
 *
 * Exported and pure so the count above the list and the list itself cannot disagree — they are the
 * same array, measured once.
 */
export function matchingAssets(assets: AssetView[], query: string, chipId: string): AssetView[] {
  const chip = ASSET_CHIPS.find((c) => c.id === chipId) ?? ASSET_CHIPS[0];
  const needle = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (!chipAdmits(chip, asset.type)) return false;
    if (!needle) return true;
    return (
      asset.title.toLowerCase().includes(needle) ||
      asset.type.toLowerCase().includes(needle) ||
      (asset.producedByAgentName ?? "").toLowerCase().includes(needle)
    );
  });
}

/** The most recently touched deliverables, newest first. `updatedAt` is the store's own field. */
export function recentAssets(assets: AssetView[], limit = 5): AssetView[] {
  return [...assets]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, limit);
}

export function AssetsNavigator({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { assets, loading, error } = useAssets(projectId);
  const [query, setQuery] = useState("");
  const [chipId, setChipId] = useState("all");

  const shown = matchingAssets(assets, query, chipId);
  const listed = shown.slice(0, ROW_LIMIT);
  const recent = recentAssets(assets).filter((a) => !listed.some((l) => l.id === a.id));

  return (
    <div data-testid="assets-navigator" className="flex min-h-0 flex-1 flex-col gap-2.5">
      <input
        data-testid="assets-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assets"
        aria-label="Search assets"
        className="rounded-[7px] border border-border-strong bg-transparent px-2.5 py-2 text-[14px] text-ink placeholder:text-ink-ghost"
      />

      <div className="flex flex-wrap gap-1.5 text-[13px]">
        {ASSET_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            data-testid={`assets-chip-${chip.id}`}
            onClick={() => setChipId(chip.id)}
            aria-pressed={chip.id === chipId}
            title={chip.types ? `Only ${chip.types.join(", ")}` : "Every kind of deliverable"}
            className={`rounded-[11px] border px-2.5 py-0.5 ${
              chip.id === chipId ? "border-border-strong text-ink" : "border-border text-ink-faint"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Both numbers come from the data. Neither is ever rounded, padded or estimated. */}
      <div
        data-testid="assets-match-count"
        className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost"
      >
        {shown.length} of {assets.length} match
      </div>

      {error ? (
        <p role="alert" data-testid="assets-error" className="text-[13px] text-status-failed">
          {error}
        </p>
      ) : loading ? (
        <p className="text-[13px] text-ink-faint">Loading assets…</p>
      ) : assets.length === 0 ? (
        <p data-testid="assets-none" className="text-[13px] leading-snug text-ink-faint">
          Nothing here yet. Everything your agents produce lands on this shelf as they finish it.
        </p>
      ) : shown.length === 0 ? (
        <p data-testid="assets-no-matches" className="text-[13px] text-ink-faint">
          Nothing matches that.
        </p>
      ) : (
        <>
          {listed.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              selected={asset.id === selectionId}
              onSelect={onSelect}
            />
          ))}
          {/* A cap that is not said out loud reads as "this is everything". */}
          {shown.length > listed.length ? (
            <p data-testid="assets-more" className="px-2.5 text-[12px] text-ink-ghost">
              {shown.length - listed.length} more match. Narrow the search to see them.
            </p>
          ) : null}
        </>
      )}

      {recent.length > 0 ? (
        <>
          <div className="my-1 h-px bg-border" />
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Recent</div>
          {recent.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              selected={asset.id === selectionId}
              onSelect={onSelect}
            />
          ))}
        </>
      ) : null}

      <div className="flex-1" />

      <p className="text-[13px] leading-snug text-ink-ghost">
        {assets.length === 0
          ? "An agent puts the first thing here, or you import one."
          : `Type to search all ${assets.length} ${assets.length === 1 ? "asset" : "assets"}.`}
      </p>
    </div>
  );
}
