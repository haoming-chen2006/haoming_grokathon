/**
 * ASSETS — MAIN. Mounted by the shell through `WorkspacePageComponent`.
 *
 * Everything an agent produces lands here, previewed as itself. The page receives exactly
 * `{ projectId, selectionId, onSelect }`. The SELECTION is in the URL, never in this component, so
 * a deep link, the browser back button and an agent's notification all land on the same asset.
 * The type filter is local state, and that is the line: a selection is a location, a filter is a
 * preference, and only the first belongs in the URL.
 */
import { useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { AssetPreview, FilePreview } from "./AssetPreview";
import { TYPE_LABELS, type MockAsset, type MockAssetType } from "./mockAssets";
import { byType, formatCost, useAssets } from "./useAssets";

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
        {(asset.files ?? []).length > 0 ? <FilePreview asset={asset} /> : <AssetPreview body={asset.body} />}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{asset.title}</span>
          <Label>
            {TYPE_LABELS[asset.type].replace(/s$/, "")}
            {asset.body?.kind === "slides" ? ` · ${asset.body.slides.length}` : ""}
            {asset.body?.kind === "workflow" ? " · 60s" : ""}
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

/**
 * The selected deliverable, large.
 *
 * A 190px card is enough to recognise a deck; it is not enough to read one. Selecting an asset
 * opens it at a size where the thing itself is legible, with the grid still underneath — the
 * inspector answers "where did this come from", and this answers "what is it".
 */
function OpenAsset({ asset, onClose }: { asset: MockAsset; onClose(): void }) {
  return (
    <section
      data-testid="asset-open"
      className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-accent"
    >
      <header className="flex shrink-0 items-baseline gap-3 border-b border-border px-4 py-2">
        <span className="min-w-0 truncate text-[15px] text-ink">{asset.title}</span>
        <Label>{TYPE_LABELS[asset.type].replace(/s$/, "")}</Label>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-muted">
          {formatCost(asset)}
        </span>
        <button
          type="button"
          data-testid="asset-open-close"
          onClick={onClose}
          aria-label="Close this deliverable"
          className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover"
        >
          Close
        </button>
      </header>
      <div className="h-[340px] shrink-0 overflow-auto bg-surface">
        {(asset.files ?? []).length > 0 ? <FilePreview asset={asset} /> : <AssetPreview body={asset.body} />}
      </div>
    </section>
  );
}

/** Filter chips. Local view state on purpose: it is a preference, not a location. */
function TypeFilter({
  counts,
  active,
  onPick,
}: {
  counts: { type: MockAssetType; items: MockAsset[] }[];
  active: MockAssetType | "all";
  onPick(next: MockAssetType | "all"): void;
}) {
  const chip = (key: MockAssetType | "all", label: string, count: number) => (
    <button
      key={key}
      type="button"
      data-testid={`asset-filter-${key}`}
      onClick={() => onPick(key)}
      aria-pressed={active === key}
      className={`rounded-full border px-2.5 py-[2px] text-[12px] ${
        active === key
          ? "border-accent text-ink"
          : "border-border text-ink-faint hover:bg-surface-hover"
      }`}
    >
      {label} <span className="font-mono text-[10px] text-ink-ghost">{count}</span>
    </button>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-5 pt-4">
      {chip("all", "All", counts.reduce((n, c) => n + c.items.length, 0))}
      {counts.map((c) => chip(c.type, TYPE_LABELS[c.type], c.items.length))}
    </div>
  );
}

/**
 * Bring a deliverable in from outside.
 *
 * The store could only be written by the generation engine, so a user with a deck already on their
 * laptop had no way to put it in front of the agents meant to work on it. The file is read in the
 * browser and posted as base64 — adequate for a deck or a spreadsheet, and the point at which that
 * stops being true (a video) is the point to add a streaming upload rather than guess now.
 */
function ImportAsset({ projectId, onDone }: { projectId: string; onDone(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const b of buf) binary += String.fromCharCode(b);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const type =
        ext === "pptx" || ext === "key" ? "slides"
        : ext === "xlsx" || ext === "csv" ? "table"
        : ext === "mp4" || ext === "mov" ? "workflow"
        : "document";
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          type,
          title: file.name,
          origin: "uploaded",
          mime: file.type || "application/octet-stream",
          filename: file.name,
          base64: btoa(binary),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label
        data-testid="import-asset"
        className="cursor-pointer rounded border border-border px-2.5 py-1 text-[13px] text-ink-faint hover:bg-surface-hover"
        title="Add a document, deck, sheet or video you already have"
      >
        {busy ? "Importing…" : "Import"}
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
      </label>
      {error ? (
        <span role="alert" data-testid="import-error" className="text-[11px] text-status-failed-ink">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function AssetsPage({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { assets, usingMockData, refresh } = useAssets(projectId);
  const [filter, setFilter] = useState<MockAssetType | "all">("all");

  const counts = byType(assets);
  const open = assets.find((a) => a.id === selectionId);
  const shown = filter === "all" ? assets : assets.filter((a) => a.type === filter);

  if (assets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p className="max-w-sm text-center text-[13px] text-ink-faint">
          Nothing here yet. Everything your agents produce — documents, slides, tables, workflows
          and software — lands on this page as they finish it.
        </p>
        {/* An empty shelf still needs a way to put something on it. */}
        <ImportAsset projectId={projectId} onDone={refresh} />
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
      <div className="flex shrink-0 items-center justify-between gap-3 pr-5">
        <TypeFilter counts={counts} active={filter} onPick={setFilter} />
        <ImportAsset projectId={projectId} onDone={refresh} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
        {open ? <OpenAsset asset={open} onClose={() => onSelect(undefined)} /> : null}
        {shown.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-faint">
            No {TYPE_LABELS[filter as MockAssetType].toLowerCase()} yet.
          </p>
        ) : null}
        <div className="grid grid-cols-1 content-start gap-4 xl:grid-cols-2">
        {shown.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            selected={asset.id === selectionId}
            onSelect={onSelect}
          />
        ))}
        </div>
      </div>
    </div>
  );
}
