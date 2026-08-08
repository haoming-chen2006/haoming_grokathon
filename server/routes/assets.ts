// The ASSETS page's HTTP surface.
//
// `client/src/control-room/assets/useAssets.ts` was written against this route before it existed
// and reads from `mockAssets.ts` in the meantime. This is the file that lets that mock be deleted:
// the shapes below are `Asset` and its members from `server/services/assetStore.ts`, serialised as
// they are, because the page copied those shapes structurally rather than importing a server type.
//
// Nothing is invented here. An asset the store does not hold does not appear, an unpriced charge
// keeps `costUsd: null` and `costSource: "unknown"` rather than becoming a zero, and an asset with
// no producing agent omits the field instead of defaulting to a plausible one — the two honesty
// rules the mock was careful to keep, which only matter once the data is real.

import { Hono } from "hono";
import { getAssetStore, ASSET_TYPES, AssetNotFoundError, type AssetType } from "../services/assetStore";

export const assetRoutes = new Hono();

function fail(c: any, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return c.json({ error: message, ...(code ? { code } : {}) }, 400);
}

/**
 * GET /api/assets?projectId=…&type=…&q=…
 *
 * `projectId` is required rather than optional-with-a-default. The store lists per project, and a
 * route that quietly returned every project's deliverables would look like it worked right up until
 * a second project existed.
 */
assetRoutes.get("/", (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) return c.json({ error: "projectId is required" }, 400);

  const type = c.req.query("type");
  if (type && !(ASSET_TYPES as readonly string[]).includes(type)) {
    return c.json(
      { error: `type must be one of: ${ASSET_TYPES.join(", ")}. Got \`${type}\`.` },
      400,
    );
  }

  try {
    return c.json(
      getAssetStore().listAssets(projectId, {
        type: type as AssetType | undefined,
        q: c.req.query("q") ?? undefined,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

/** One deliverable, for the inspector. 404 rather than an empty object, so a bad id is visible. */
assetRoutes.get("/:assetId", (c) => {
  const assetId = c.req.param("assetId");
  try {
    return c.json(getAssetStore().getAsset(assetId));
  } catch (err) {
    // The store's own typed miss, distinguished from a real failure: anything else is a 400 with
    // its message, not a 404 that would tell the caller the asset does not exist when the disk is
    // what failed.
    if (err instanceof AssetNotFoundError) return c.json({ error: `No asset ${assetId}` }, 404);
    return fail(c, err);
  }
});
