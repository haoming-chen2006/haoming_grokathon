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
import { basename, join, resolve, sep } from "path";
import { getAssetStore, persistFile, ASSET_TYPES, AssetNotFoundError, type AssetType } from "../services/assetStore";

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

/**
 * POST /api/assets — bring a deliverable in, or start an empty one.
 *
 * The store could only ever be written by the generation engine, so a user with a deck already on
 * their laptop had no way to put it in front of the agents that are supposed to work on it. This is
 * that way in.
 *
 * `origin` says where it came from and is not inferred: an "uploaded" asset carries no producing
 * agent and no capability, and the inspector omits those fields rather than defaulting them to a
 * plausible agent — the same rule the mock data was careful to keep before the data was real.
 */
assetRoutes.post("/", async (c) => {
  let body: {
    projectId?: string;
    type?: string;
    title?: string;
    origin?: string;
    base64?: string;
    mime?: string;
    filename?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON body" }, 400);
  }

  if (!body?.projectId) return c.json({ error: "projectId is required" }, 400);
  if (!body?.title?.trim()) return c.json({ error: "title is required" }, 400);
  if (!body?.type || !(ASSET_TYPES as readonly string[]).includes(body.type)) {
    return c.json({ error: `type must be one of: ${ASSET_TYPES.join(", ")}` }, 400);
  }
  const origin = body.origin === "generated" || body.origin === "imported" ? body.origin : "uploaded";

  try {
    const store = getAssetStore();
    const asset = store.createAsset({
      projectId: body.projectId,
      type: body.type as AssetType,
      title: body.title.trim(),
      origin,
      authorId: "user",
      changeSummary: origin === "uploaded" ? "Uploaded by the user" : `Imported (${origin})`,
    });

    // Bytes are optional: an empty deliverable is a legitimate thing to create and fill later, and
    // refusing one would make "start a deck" impossible without already having a deck.
    if (body.base64) {
      const file = await persistFile(
        {
          assetId: asset.id,
          role: "source",
          mime: body.mime ?? "application/octet-stream",
          base64: body.base64,
          ext: body.filename?.split(".").pop(),
        },
        store,
      );
      store.attachFile(asset.id, file, { authorId: "user", changeSummary: body.filename ?? "Uploaded file" });
      return c.json(store.getAsset(asset.id), 201);
    }

    return c.json(asset, 201);
  } catch (err) {
    return fail(c, err);
  }
});

/**
 * GET /api/assets/:assetId/files/:fileId — the bytes.
 *
 * Nothing served an asset's contents, so an uploaded PDF was stored correctly and could not be
 * looked at: the page had a record of a deliverable and no way to show the deliverable, which is
 * the exact failure the Assets page exists to avoid.
 *
 * Served from the descriptor's own recorded path and mime rather than from anything the caller
 * supplies, and the resolved path is checked to be inside the asset's own directory — a fileId is
 * a URL parameter, and joining a user-supplied string into a path is how a directory traversal
 * gets in.
 */
assetRoutes.get("/:assetId/files/:fileId", async (c) => {
  const assetId = c.req.param("assetId");
  const fileId = c.req.param("fileId");
  try {
    const store = getAssetStore();
    const asset = store.getAsset(assetId);
    const file = (asset.files ?? []).find((f) => f.id === fileId);
    if (!file) return c.json({ error: `No file ${fileId} on ${assetId}` }, 404);

    const dir = resolve(store.assetDir(assetId));
    const full = resolve(join(dir, file.path));
    if (full !== dir && !full.startsWith(dir + sep)) {
      return c.json({ error: "That file is not inside its asset" }, 400);
    }

    const bytes = Bun.file(full);
    if (!(await bytes.exists())) return c.json({ error: "The file's bytes are missing" }, 404);

    // `inline` so a PDF or an image opens in the page rather than downloading. The filename is the
    // stored path's basename, never a caller-supplied one.
    return new Response(bytes, {
      headers: {
        "Content-Type": file.mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${basename(file.path)}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (err instanceof AssetNotFoundError) return c.json({ error: `No asset ${assetId}` }, 404);
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
