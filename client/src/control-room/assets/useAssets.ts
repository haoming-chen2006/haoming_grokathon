/**
 * The one seam between the ASSETS page and its data.
 *
 * Today it returns the contents of `./mockAssets`, which is the only module that holds fake data.
 * When `server/routes/assets.ts` exists this becomes a fetch of `GET /api/assets?projectId=…` and
 * `mockAssets.ts` is deleted; no component below changes, because none of them imports the mock.
 */
import { useEffect, useState } from "react";
import { TYPE_ORDER, type MockAsset, type MockAssetType } from "./mockAssets";

export interface AssetsView {
  assets: MockAsset[];
  /** Present only while the data is fake, so the page can say so on the page itself. */
  usingMockData: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * `GET /api/assets?projectId=…`, which is `server/routes/assets.ts`.
 *
 * The store's `Asset` and the page's `MockAsset` are the same shape by construction — the mock was
 * copied from `server/services/assetStore.ts` structurally, precisely so that wiring this seam
 * changed no component below it. `usingMockData` is now always false: an empty project renders an
 * empty page, which is the truth, rather than borrowing fake deliverables to look populated.
 */
export function useAssets(projectId: string): AssetsView {
  const [assets, setAssets] = useState<MockAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fetch(`/api/assets?projectId=${encodeURIComponent(projectId)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
        return body as MockAsset[];
      })
      .then((list) => { if (live) { setAssets(list); setError(null); } })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [projectId]);

  return { assets, usingMockData: false, loading, error };
}

/** Deliverables of one type, in the navigator's order. Empty types are still listed, with a zero. */
export function byType(assets: MockAsset[]): { type: MockAssetType; items: MockAsset[] }[] {
  return TYPE_ORDER.map((type) => ({ type, items: assets.filter((a) => a.type === type) }));
}

/**
 * The money a deliverable has cost.
 *
 * `costUsd: null` means the model could not be priced. It is NOT zero, and the difference is the
 * whole point: a 60-second generated video is roughly $5.52 of media, and rendering that as $0.00
 * because no rate exists is the same defect as inventing a figure. So this returns the priced
 * subtotal and the count of charges that could not be priced, and the UI states both.
 */
export function costOf(asset: MockAsset): { usd: number; unpriced: number } {
  let usd = 0;
  let unpriced = 0;
  for (const charge of asset.charges) {
    if (charge.costUsd === null || charge.costSource === "unknown") unpriced += 1;
    else usd += charge.costUsd;
  }
  return { usd, unpriced };
}

export function formatCost(asset: MockAsset): string {
  // No charges at all is not a price of zero. A user upload cost nothing because no agent ran, and
  // rendering "$0.00" there reads as a figure we computed — which is how a fabricated number gets
  // into a UI that was careful everywhere else. Caught by a smoke render, which found "$0.00" on
  // the page an hour after this module was written to prevent exactly that.
  if (asset.charges.length === 0) return "—";
  const { usd, unpriced } = costOf(asset);
  if (unpriced > 0 && usd === 0) return "unknown";
  if (unpriced > 0) return `$${usd.toFixed(2)} + unpriced`;
  return `$${usd.toFixed(2)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
