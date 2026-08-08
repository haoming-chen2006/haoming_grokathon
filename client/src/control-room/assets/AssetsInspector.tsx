/**
 * ASSETS — INSPECTOR. Properties of the selected deliverable, and never a second navigator.
 *
 * Provenance is the point: which agent made this, under what capability, what it cost, which
 * design document declared it, and whether that declaration has gone stale. Every one of those is
 * omitted rather than defaulted when the field is absent.
 */
import type { WorkspacePageProps } from "../shell/contract";
import { TYPE_LABELS, type MockAsset } from "./mockAssets";
import { costOf, formatBytes, useAssets } from "./useAssets";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.07em] text-ink-ghost">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 truncate text-right text-ink-muted">{value}</span>
    </div>
  );
}

function Cost({ asset }: { asset: MockAsset }) {
  const { usd, unpriced } = costOf(asset);
  if (asset.charges.length === 0) return <Row label="Cost" value="No charges" />;
  return (
    <>
      {usd > 0 ? <Row label="Cost" value={<span className="font-mono">${usd.toFixed(2)}</span>} /> : null}
      {unpriced > 0 ? (
        // Never $0.00. usageAccounting has no rate for these models, and an unpriced charge is
        // unknown, not free — a 60-second generated video is roughly $5.52 of media.
        <Row
          label={usd > 0 ? "Also" : "Cost"}
          value={
            <span className="font-mono text-ink-faint">
              {unpriced} charge{unpriced === 1 ? "" : "s"} unpriced
            </span>
          }
        />
      ) : null}
    </>
  );
}

export function AssetsInspector({ projectId, selectionId }: WorkspacePageProps) {
  const { assets } = useAssets(projectId);
  const asset = assets.find((a) => a.id === selectionId);

  if (!asset) {
    return (
      <p className="text-[13px] text-ink-faint">
        Select a deliverable to see who made it, what it cost, and which design document asked for
        it.
      </p>
    );
  }

  return (
    <div data-testid="assets-inspector" className="flex flex-col gap-4">
      <Section title="Asset">
        <div className="text-[17px] text-ink">{asset.title}</div>
        <Row label="Type" value={TYPE_LABELS[asset.type].replace(/s$/, "")} />
        <Row label="Version" value={`v${asset.currentVersion} of ${asset.versions.length}`} />
      </Section>

      <div className="h-px bg-border" />

      <Section title="Provenance">
        {asset.producedByAgentName ? (
          <Row label="Made by" value={asset.producedByAgentName} />
        ) : (
          <Row label="Made by" value="You (uploaded)" />
        )}
        {asset.capability ? (
          <Row
            label="Capability"
            value={
              asset.capability === "base"
                ? "base Grok"
                : `base Grok + ${asset.capability.replace("+", " + ")}`
            }
          />
        ) : null}
        <Cost asset={asset} />
        {asset.declaredBy ? (
          <>
            <Row label="Declared by" value={asset.declaredBy.designDocTitle} />
            <Row
              label="Lines"
              value={
                <span className="font-mono text-[12px]">
                  {asset.declaredBy.lineStart}–{asset.declaredBy.lineEnd} @ v
                  {asset.declaredBy.designDocVersion}
                </span>
              }
            />
            {asset.declaredBy.stale ? (
              // Stale is stated in words. A range that guessed wrong is worse than one that says so.
              <p className="rounded-md border border-status-waiting bg-status-waiting px-2 py-1 text-[12px] text-status-waiting">
                The document moved on since this was declared, so the line range may no longer point
                at the right paragraph.
              </p>
            ) : null}
          </>
        ) : (
          <Row label="Declared by" value="Nothing — added outside a design document" />
        )}
      </Section>

      <div className="h-px bg-border" />

      <Section title={`Files (${asset.files.length})`}>
        {asset.files.map((file) => (
          <div key={file.id} className="flex items-baseline justify-between gap-3 text-[12px]">
            <span className="min-w-0 flex-1 truncate text-ink-muted">{file.path}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-ghost">
              {file.durationSec ? `${file.durationSec}s · ` : ""}
              {formatBytes(file.bytes)}
            </span>
          </div>
        ))}
      </Section>

      {asset.readBy?.length ? (
        <>
          <div className="h-px bg-border" />
          <Section title="Read by">
            {asset.readBy.map((r) => (
              <Row key={r.agentName} label={r.agentName} value={r.at} />
            ))}
          </Section>
        </>
      ) : null}

      <div className="h-px bg-border" />

      <Section title="History">
        {asset.versions
          .slice()
          .reverse()
          .map((v) => (
            <div key={v.version} className="flex items-baseline gap-2 text-[12px]">
              <span className="shrink-0 font-mono text-[10px] text-ink-ghost">v{v.version}</span>
              <span className="min-w-0 flex-1 truncate text-ink-faint">
                {v.changeSummary ?? "No summary"}
              </span>
            </div>
          ))}
      </Section>
    </div>
  );
}
