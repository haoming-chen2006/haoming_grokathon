// The one join between the generation engine and the asset store.
//
// 04 built `server/services/xai/` fail-closed on purpose: until something calls `setAssetSink`,
// every generator refuses rather than downloading bytes with nowhere to land. 02 built the store.
// Neither could call the other — 04 must not know how 02 indexes an asset, and 02 must not know
// that Imagine exists — so the wire is here, in the composition root's own module, and it is the
// only file in the tree that imports both.
//
// `wireGeneration()` is called once at startup from `server/index.ts`. Until it is, generation is
// unavailable and says so with `NO_ASSET_SINK_MESSAGE`, which is the correct behaviour and not a
// bug to work around.

import { getAssetStore, persistFile, type AssetType } from "./assetStore";
import { setAssetSink } from "./xai/assets";
import type { AssetPutInput, AssetPutResult, AssetSink, GeneratedAssetKind } from "./xai/types";

/**
 * What kind of deliverable a generated file belongs to.
 *
 * An image is not an asset type in this product — the five are document, slides, table, workflow
 * and software — so a generated image becomes a FILE on an asset rather than a sixth type. Video
 * and audio are the same: a 60-second cut is a `workflow` deliverable that happens to hold an mp4.
 */
const ASSET_TYPE_FOR: Record<GeneratedAssetKind, AssetType> = {
  image: "document",
  video: "workflow",
  audio: "workflow",
  document: "document",
  slides: "slides",
  table: "table",
  workflow: "workflow",
};

/** The role a generated file plays on its asset, so the Assets page can label it. */
const ROLE_FOR: Record<GeneratedAssetKind, string> = {
  image: "image",
  video: "video",
  audio: "narration",
  document: "body",
  slides: "deck",
  table: "sheet",
  workflow: "sequence",
};

function titleFor(input: AssetPutInput): string {
  const prompt = input.sourcePrompt?.trim();
  if (!prompt) return `Generated ${input.kind}`;
  // The prompt is the only human-readable thing a generated asset arrives with. Trimmed to a
  // headline rather than stored as a paragraph, and never invented when it is absent.
  const firstLine = prompt.split("\n")[0].trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
}

class StoreBackedAssetSink implements AssetSink {
  async put(input: AssetPutInput): Promise<AssetPutResult> {
    const store = getAssetStore();
    const asset = store.createAsset({
      projectId: input.projectId,
      type: ASSET_TYPE_FOR[input.kind],
      title: titleFor(input),
      origin: "generated",
      authorId: input.agentId,
      producedByAgentId: input.agentId,
      changeSummary: `Generated with ${input.sourceModel}`,
    });

    // persistFile is a free function that writes the bytes and returns a descriptor; the
    // synchronous store then records it. Split that way on purpose — every mutation on the store
    // is synchronous so that nothing can interleave between read and write.
    const file = await persistFile(
      {
        assetId: asset.id,
        role: ROLE_FOR[input.kind],
        mime: input.mimeType,
        bytes: input.bytes,
        producedByAgentId: input.agentId,
        model: input.sourceModel,
        requestId: input.requestId,
        prompt: input.sourcePrompt,
      },
      store,
    );
    store.attachFile(asset.id, file, { authorId: input.agentId, changeSummary: `Generated ${input.kind}` });

    return {
      assetId: asset.id,
      // The store hashes what it wrote. Rehashing here would be a second answer to one question,
      // and the store's is the one that describes the bytes actually on disk.
      sha256: file.sha256,
      bytes: file.bytes,
    };
  }

  /**
   * Never regenerate what we already paid for.
   *
   * Returns null until the store indexes by input hash — which it does not yet — because a lookup
   * that always misses is honest and a lookup that pretends to hit is not. The consequence is only
   * that an identical prompt costs $0.02 twice, and the alternative would be serving the wrong
   * image for a prompt that merely resembles another.
   */
  async findByInputHash(_hash: string): Promise<{ assetId: string } | null> {
    return null;
  }
}

let wired = false;

export function wireGeneration(): void {
  if (wired) return;
  setAssetSink(new StoreBackedAssetSink());
  wired = true;
}

/** For tests, which must be able to put the process back to fail-closed. */
export function unwireGeneration(): void {
  setAssetSink(null);
  wired = false;
}
