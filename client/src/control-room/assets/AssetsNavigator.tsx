/**
 * ASSETS — NAVIGATOR. The five asset types and their deliverables.
 *
 * Five types, named with the five words the product uses everywhere else: documents · slides ·
 * tables · workflows · software. Generated images, clips and narration are *component* files of a
 * deliverable, never a sixth type, so they never appear here — they appear in the inspector as
 * files of the thing they belong to.
 *
 * An empty type is listed with a zero rather than hidden: "you have no slides yet" and "this
 * product does not make slides" are different facts.
 */
import type { WorkspacePageProps } from "../shell/contract";
import { TYPE_LABELS, TYPE_ORDER } from "./mockAssets";
import { byType, formatCost, useAssets } from "./useAssets";

export function AssetsNavigator({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { assets } = useAssets(projectId);
  const groups = byType(assets);

  return (
    <div data-testid="assets-navigator" className="flex flex-col gap-3">
      {groups.map(({ type, items }) => (
        <div key={type} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-ink-ghost">
              {TYPE_LABELS[type]}
            </span>
            <span className="font-mono text-[9px] text-ink-ghost">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <p className="px-1 py-0.5 text-[12px] text-ink-ghost">None yet</p>
          ) : (
            items.map((asset) => {
              const selected = asset.id === selectionId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  data-testid={`assets-nav-${asset.id}`}
                  onClick={() => onSelect(asset.id)}
                  aria-current={selected ? "true" : undefined}
                  className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left ${
                    selected ? "bg-surface-active text-ink" : "text-ink-muted hover:bg-surface-hover"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px]">{asset.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-ghost">
                    {formatCost(asset)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ))}

      <p className="mt-1 text-[11px] text-ink-ghost">
        {assets.length} of {assets.length} shown. Five types:{" "}
        {TYPE_ORDER.map((t) => TYPE_LABELS[t].toLowerCase()).join(" · ")}.
      </p>
    </div>
  );
}
