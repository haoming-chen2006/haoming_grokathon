/**
 * G2 asset-contract tests (GEN-004's offline clauses).
 *
 * The clauses that need a live URL to stop resolving — "the asset is still readable after the
 * returned URL stops resolving" — are held; they need a real generation call, which is a §10 spend
 * approval. Everything provable without money is proved here.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { XaiError, type AssetPutInput, type AssetSink } from "./types";
import {
  findCachedAsset,
  inputHash,
  isAssetSinkWired,
  NO_ASSET_SINK_MESSAGE,
  persistGenerated,
  readVerifiedMedia,
  setAssetSink,
  setMediaDownloader,
} from "./assets";

/** A stand-in for 02's store. Records what it was handed, so the discipline can be asserted. */
function fakeStore(overrides: Partial<AssetSink> = {}) {
  const puts: AssetPutInput[] = [];
  const lookups: string[] = [];
  const sink: AssetSink = {
    put: async (input) => {
      puts.push(input);
      return { assetId: `asset_${puts.length}`, sha256: "a".repeat(64), bytes: input.bytes.byteLength };
    },
    findByInputHash: async (hash) => {
      lookups.push(hash);
      return null;
    },
    ...overrides,
  };
  setAssetSink(sink);
  return { puts, lookups, sink };
}

function mediaResponse(body: Uint8Array | string, headers: Record<string, string>, status = 200): Response {
  return new Response(body, { status, headers });
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const BASE = {
  kind: "image" as const,
  expect: "image" as const,
  projectId: "proj_1",
  agentId: "agent_1",
  sourceModel: "grok-imagine-image",
  sourcePrompt: "a flat grey calibration square",
  params: { aspect_ratio: "16:9", resolution: "1k" },
};

afterEach(() => {
  setAssetSink(null);
  setMediaDownloader(null);
});

describe("with no store wired, generation fails closed (GEN-004)", () => {
  test("persisting refuses with the named error rather than dropping the bytes", async () => {
    expect(isAssetSinkWired()).toBe(false);

    const err = await persistGenerated({ ...BASE, payload: { bytes: PNG, mimeType: "image/png" } }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(XaiError);
    expect((err as XaiError).code).toBe("failed_precondition");
    expect((err as XaiError).message).toBe(NO_ASSET_SINK_MESSAGE);
  });

  test("the cache lookup refuses too, so an unwired store costs nothing", async () => {
    // The obliging answer here is "cache miss", and it is the expensive one: the caller would
    // generate, spend, and only discover at put() that there is nowhere to put it.
    await expect(findCachedAsset({ model: "grok-imagine-image", prompt: "x" })).rejects.toBeInstanceOf(XaiError);
  });

  test("a downloader is never reached before the store is checked", async () => {
    let downloads = 0;
    setMediaDownloader(async () => {
      downloads += 1;
      return mediaResponse(PNG, { "content-type": "image/png" });
    });

    await expect(
      persistGenerated({ ...BASE, payload: { url: "https://example.invalid/i.png" } }),
    ).rejects.toBeInstanceOf(XaiError);
    expect(downloads).toBe(0);
  });

  test("wiring a store flips the report, and unwiring restores the refusal", () => {
    expect(isAssetSinkWired()).toBe(false);
    fakeStore();
    expect(isAssetSinkWired()).toBe(true);
    setAssetSink(null);
    expect(isAssetSinkWired()).toBe(false);
  });
});

describe("the regeneration cache", () => {
  test("the same inputs hash the same however the parameter keys are ordered", () => {
    const a = inputHash({ model: "m", prompt: "p", params: { resolution: "1k", aspect_ratio: "16:9" } });
    const b = inputHash({ model: "m", prompt: "p", params: { aspect_ratio: "16:9", resolution: "1k" } });
    expect(a).toBe(b);
    // A cache that misses on a key reordering is worse than no cache: it looks like it works.
    expect(a).toHaveLength(64);
  });

  test("nested parameters are ordered too", () => {
    const a = inputHash({ model: "m", params: { output: { codec: "mp3", sample_rate: 24000 } } });
    const b = inputHash({ model: "m", params: { output: { sample_rate: 24000, codec: "mp3" } } });
    expect(a).toBe(b);
  });

  test("a changed model, prompt or parameter changes the hash", () => {
    const base = inputHash({ model: "m", prompt: "p", params: { n: 1 } });
    expect(inputHash({ model: "m2", prompt: "p", params: { n: 1 } })).not.toBe(base);
    expect(inputHash({ model: "m", prompt: "p2", params: { n: 1 } })).not.toBe(base);
    expect(inputHash({ model: "m", prompt: "p", params: { n: 2 } })).not.toBe(base);
  });

  test("array order is significant, because it is significant to the model", () => {
    const a = inputHash({ model: "m", params: { images: ["a", "b"] } });
    const b = inputHash({ model: "m", params: { images: ["b", "a"] } });
    expect(a).not.toBe(b);
  });

  test("a hit is returned without generating anything", async () => {
    const store = fakeStore({ findByInputHash: async () => ({ assetId: "asset_existing" }) });
    setAssetSink(store.sink);

    const hit = await findCachedAsset({ model: "grok-imagine-image", prompt: "a square", params: { n: 1 } });
    expect(hit).toEqual({ assetId: "asset_existing" });
  });

  test("the key is the inputs, not the asker — a second agent reuses the first agent's image", async () => {
    const seen: string[] = [];
    setAssetSink({
      put: async () => ({ assetId: "a", sha256: "x", bytes: 1 }),
      findByInputHash: async (hash) => {
        seen.push(hash);
        return null;
      },
    });

    await findCachedAsset({ model: "m", prompt: "p", params: { n: 1 } });
    await findCachedAsset({ model: "m", prompt: "p", params: { n: 1 } });

    expect(seen[0]).toBe(seen[1]);
  });
});

describe("a downloaded body is verified before it is stored (GEN-004)", () => {
  test("an error page served with a 200 is refused, not stored as an image", async () => {
    const err = await readVerifiedMedia(
      mediaResponse("<html>502 Bad Gateway</html>", { "content-type": "text/html" }),
      "image",
      "https://example.invalid/i.png",
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect((err as XaiError).code).toBe("bad_response");
    expect((err as XaiError).message).toContain("text/html");
  });

  test("a zero-byte body is refused", async () => {
    await expect(
      readVerifiedMedia(mediaResponse(new Uint8Array(), { "content-type": "image/png" }), "image", "u"),
    ).rejects.toThrow(/zero-byte/);
  });

  test("a truncated download is refused by its declared length", async () => {
    const err = await readVerifiedMedia(
      mediaResponse(PNG, { "content-type": "image/png", "content-length": "999" }),
      "image",
      "u",
    ).then(
      () => null,
      (e: unknown) => e,
    );

    expect((err as XaiError).message).toContain("truncated");
    expect((err as XaiError).message).toContain("999");
    expect((err as XaiError).message).toContain("12");
  });

  test("a non-2xx download is refused with its status", async () => {
    await expect(
      readVerifiedMedia(mediaResponse("gone", { "content-type": "image/png" }, 404), "image", "u"),
    ).rejects.toThrow(/HTTP 404/);
  });

  test("media of the wrong family is refused — an audio body is not a video", async () => {
    await expect(
      readVerifiedMedia(mediaResponse(PNG, { "content-type": "audio/mpeg" }), "video", "u"),
    ).rejects.toThrow(/video\//);
  });

  test("a correct body passes and reports its own mime type", async () => {
    const result = await readVerifiedMedia(
      mediaResponse(PNG, { "content-type": "image/png; charset=binary", "content-length": String(PNG.byteLength) }),
      "image",
      "u",
    );
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes.byteLength).toBe(PNG.byteLength);
  });
});

describe("persisting reports success only once the store has the bytes (GEN-004)", () => {
  test("a URL is downloaded on receipt and stored, and the caller gets 02's reference", async () => {
    const store = fakeStore();
    setMediaDownloader(async () => mediaResponse(PNG, { "content-type": "image/png" }));

    const stored = await persistGenerated({
      ...BASE,
      payload: { url: "https://vidgen.x.ai/expiring/i.png" },
      requestId: "req_1",
      costEventId: "cost_1",
    });

    expect(stored).toEqual({ assetId: "asset_1", sha256: "a".repeat(64), bytes: PNG.byteLength });
    expect(store.puts).toHaveLength(1);
    expect(store.puts[0].bytes.byteLength).toBe(PNG.byteLength);
    expect(store.puts[0].mimeType).toBe("image/png");
    expect(store.puts[0].requestId).toBe("req_1");
    expect(store.puts[0].costEventId).toBe("cost_1");
  });

  test("the returned URL is provenance on the record and is absent from what the caller gets back", async () => {
    const store = fakeStore();
    const url = "https://vidgen.x.ai/expiring/i.png";
    setMediaDownloader(async () => mediaResponse(PNG, { "content-type": "image/png" }));

    const stored = await persistGenerated({ ...BASE, payload: { url } });

    expect(store.puts[0].sourceUrl).toBe(url);
    // The only way back to these bytes is the asset id. A caller cannot hold the dying link
    // because it never reaches them.
    expect(JSON.stringify(stored)).not.toContain("vidgen");
    expect(JSON.stringify(stored)).not.toContain("http");
  });

  test("a store that rejects means the operation failed — no reference is handed out", async () => {
    setAssetSink({
      put: async () => {
        throw new Error("disk full");
      },
      findByInputHash: async () => null,
    });
    setMediaDownloader(async () => mediaResponse(PNG, { "content-type": "image/png" }));

    await expect(persistGenerated({ ...BASE, payload: { url: "https://example.invalid/i.png" } })).rejects.toThrow(
      /disk full/,
    );
  });

  test("a base64 payload never touches the network", async () => {
    const store = fakeStore();
    let downloads = 0;
    setMediaDownloader(async () => {
      downloads += 1;
      return mediaResponse(PNG, { "content-type": "image/png" });
    });

    const stored = await persistGenerated({
      ...BASE,
      payload: { b64: Buffer.from(PNG).toString("base64"), mimeType: "image/png" },
    });

    expect(downloads).toBe(0);
    expect(stored.bytes).toBe(PNG.byteLength);
    expect(store.puts[0].sourceUrl).toBeUndefined();
  });

  test("base64 that decodes to nothing is refused", async () => {
    fakeStore();
    await expect(persistGenerated({ ...BASE, payload: { b64: "" } })).rejects.toThrow(/zero bytes|exactly one/);
  });

  test("a payload that is both a URL and bytes is refused rather than guessed at", async () => {
    fakeStore();
    const err = await persistGenerated({
      ...BASE,
      payload: { url: "https://example.invalid/i.png", bytes: PNG },
    }).then(
      () => null,
      (e: unknown) => e,
    );

    expect((err as XaiError).code).toBe("invalid_argument");
    expect((err as XaiError).message).toContain("exactly one");
  });

  test("designDocId reaches the store only when the caller supplied one", async () => {
    const store = fakeStore();
    setMediaDownloader(async () => mediaResponse(PNG, { "content-type": "image/png" }));

    await persistGenerated({ ...BASE, payload: { bytes: PNG, mimeType: "image/png" } });
    await persistGenerated({
      ...BASE,
      payload: { bytes: PNG, mimeType: "image/png" },
      designDocId: "doc_1",
    });

    // Never inferred from the project id: one project may follow several design documents.
    expect("designDocId" in store.puts[0]).toBe(false);
    expect(store.puts[1].designDocId).toBe("doc_1");
  });

  test("a downloaded error page never reaches the store", async () => {
    const store = fakeStore();
    setMediaDownloader(async () => mediaResponse("<html>oops</html>", { "content-type": "text/html" }));

    await expect(
      persistGenerated({ ...BASE, payload: { url: "https://example.invalid/i.png" } }),
    ).rejects.toBeInstanceOf(XaiError);
    expect(store.puts).toHaveLength(0);
  });
});
