/**
 * The one seam between the ASSETS page and its data.
 *
 * Today it returns the contents of `./mockAssets`, which is the only module that holds fake data.
 * When `server/routes/assets.ts` exists this becomes a fetch of `GET /api/assets?projectId=…` and
 * `mockAssets.ts` is deleted; no component below changes, because none of them imports the mock.
 */
import { MOCK_ASSETS, TYPE_ORDER, type MockAsset, type MockAssetType } from "./mockAssets";

export interface AssetsView {
  assets: MockAsset[];
  /** Present only while the data is fake, so the page can say so on the page itself. */
  usingMockData: boolean;
}

export function useAssets(_projectId: string): AssetsView {
  // The project id is accepted and ignored on purpose: the mock is a single project's worth of
  // deliverables. When this becomes a fetch, it is the query parameter.
  return { assets: MOCK_ASSETS, usingMockData: true };
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
