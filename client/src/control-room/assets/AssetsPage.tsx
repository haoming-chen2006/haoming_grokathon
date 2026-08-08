/**
 * ASSETS — MAIN. Mounted by the shell through `WorkspacePageComponent`.
 *
 * Everything an agent produces lands here, previewed as itself. The page receives exactly
 * `{ projectId, selectionId, onSelect }` and holds no state of its own: the selection is in the
 * URL, so a deep link, the browser back button and a notification all land on the same asset.
 */
import type { WorkspacePageProps } from "../shell/contract";
import { AssetPreview } from "./AssetPreview";
import { TYPE_LABELS, type MockAsset } from "./mockAssets";
import { formatCost, useAssets } from "./useAssets";

/** The mono, tracked, uppercase micro-label the shell uses for every region heading. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-ink-ghost">{children}</span>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "accent" }) {
  return (
    <span
      className={`rounded-full border px-2 py-[1px] text-[11px] ${
        tone === "accent" ? "border-accent text-ink" : "border-border text-ink-faint"
      }`}
    >
      {children}
    </span>
  );
}

/** The capability grant, written so it can only read as an addition. */
function Capability({ asset }: { asset: MockAsset }) {
  // Absent for an upload — omitted, never defaulted to a plausible agent (AgentCard.tsx's rule).
  if (!asset.capability) return null;
  const extra = asset.capability === "base" ? null : asset.capability.replace("+", " + ");
  return (
    <Chip tone={extra ? "accent" : undefined}>
      {/* base Grok is the FULL Grok Build surface; every "+" is a grant on top of that whole
          agent, never a smaller one. Never render a tier as a kind of agent. */}
      {extra ? `base Grok + ${extra}` : "base Grok"}
    </Chip>
  );
}

function AssetCard({
  asset,
  selected,
  onSelect,
}: {
  asset: MockAsset;
  selected: boolean;
  onSelect(id: string): void;
}) {
  return (
    <button
      type="button"
      data-testid={`asset-card-${asset.id}`}
      onClick={() => onSelect(asset.id)}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
        selected ? "border-accent" : "border-border hover:border-border-strong"
      }`}
    >
      <div className="h-[190px] shrink-0 overflow-hidden border-b border-border bg-surface">
        <AssetPreview body={asset.body} />
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{asset.title}</span>
          <Label>
            {TYPE_LABELS[asset.type].replace(/s$/, "")}
            {asset.body.kind === "slides" ? ` · ${asset.body.slides.length}` : ""}
            {asset.body.kind === "workflow" ? " · 60s" : ""}
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {asset.producedByAgentName ? (
            <Chip>{asset.producedByAgentName}</Chip>
          ) : (
            <Chip>Uploaded by you</Chip>
          )}
          <Capability asset={asset} />
          <span className="ml-auto font-mono text-[11px] text-ink-muted">{formatCost(asset)}</span>
        </div>
      </div>
    </button>
  );
}

export function AssetsPage({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { assets, usingMockData } = useAssets(projectId);

  if (assets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-sm text-center text-[13px] text-ink-faint">
          Nothing here yet. Everything your agents produce — documents, slides, tables, workflows
          and software — lands on this page as they finish it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {usingMockData ? (
        // Said on the page itself, not just in a comment: this is the difference between a demo
        // and a lie, and it disappears with mockAssets.ts.
        <div
          data-testid="assets-mock-banner"
          className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-1.5 text-[11px] text-ink-faint"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-status-waiting" />
          Sample data — the assets service is not wired to this page yet.
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-auto p-5 xl:grid-cols-2">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            selected={asset.id === selectionId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
