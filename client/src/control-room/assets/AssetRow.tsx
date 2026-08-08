/**
 * One deliverable, as a row — the shape `design/mockups/assets-page.html` draws down its rail.
 *
 * "chair_launch_plan · document · Scribe · $0.31", with a thumbnail box on the left and the money
 * on the right. The mockup's fourth row is the exception that defines the component: a SOFTWARE
 * asset prints "software · 24 files" where the others print their producing agent, because a
 * repository is not a thing one agent wrote in one turn and naming one would misattribute it.
 *
 * Every field is the record's. An asset with no producing agent — an upload — prints its origin
 * instead of borrowing a plausible name.
 */
import { formatCost } from "./useAssets";
import type { AssetView } from "./types";

/** The second line of a row: what this thing is, and where it came from. */
export function rowSubtitle(asset: AssetView): string {
  // A repository's provenance is its size, not its author. The mockup prints "software · 24 files".
  if (asset.type === "software") {
    const n = asset.files.length;
    return `software · ${n} ${n === 1 ? "file" : "files"}`;
  }
  if (asset.producedByAgentName) return `${asset.type} · ${asset.producedByAgentName}`;
  // No agent made it, so no agent is named. `origin` is a field, not a guess.
  return `${asset.type} · ${asset.origin}`;
}

export interface AssetRowProps {
  asset: AssetView;
  selected?: boolean;
  onSelect(assetId: string): void;
}

export function AssetRow({ asset, selected, onSelect }: AssetRowProps) {
  return (
    <button
      type="button"
      data-testid={`asset-row-${asset.id}`}
      onClick={() => onSelect(asset.id)}
      aria-current={selected ? "true" : undefined}
      title={asset.title}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left ${
        selected
          ? "border border-dashed border-accent text-ink"
          : "border border-transparent text-ink-muted hover:bg-surface-hover"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-[15px] w-5 shrink-0 border border-border-strong"
      />
      <span className="min-w-0 flex-1">
        {/* The name is mono: it is an identifier an agent chose, not prose. */}
        <span data-testid="asset-row-name" className="block truncate font-mono text-[13px]">
          {asset.title}
        </span>
        <span data-testid="asset-row-subtitle" className="block truncate text-[12px] text-ink-ghost">
          {rowSubtitle(asset)}
        </span>
      </span>
      <span data-testid="asset-row-cost" className="shrink-0 font-mono text-[10px] text-ink-faint">
        {formatCost(asset)}
      </span>
    </button>
  );
}
