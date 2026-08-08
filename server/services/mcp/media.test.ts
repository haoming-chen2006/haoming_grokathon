/**
 * MEDIA-1 … MEDIA-7. Every test here is offline and spends nothing.
 *
 * The transport is replaced through `setXaiTransport`, the exported seam, and never with
 * `mock.module` — a module mock patches the registry process-wide and only reaches importers
 * evaluated after it runs, so in a full suite it goes silently inert and the test that looked
 * mocked makes the real call. Against these endpoints that is not a slow test, it is a bill.
 *
 * What the offline tests cannot prove is what a live response actually looks like. The one real
 * call this worktree made is a single $0.02 image, recorded in `loops/handoff/pivot-media.md`;
 * `/v1/tts`'s response shape remains unverified and the fixtures below say so where they guess.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AssetStore, type AssetCharge } from "../assetStore";
import { assetRoutes } from "../../routes/assets";
import { resetXaiClient, setXaiTransport, type XaiHttpRequest } from "../xai/client";
import { setMediaDownloader } from "../xai/assets";
import { TTS_USD_PER_CHARACTER } from "../xai/speech";
import { chargeFromCostEvent, registerMediaTools, textFileNaming, type MediaToolContext } from "./media";

const PROJECT = "proj_media";
const AGENT = "agent_writer";
const KEY = "xai-testonlyABCDEFGHIJKLMNOP0123456789";

/** A four-pixel PNG. Real bytes, so "an image was stored" is a claim about a file, not a length. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00,
]);
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x0f, 0xf0, 0x00, 0x00, 0x69]);

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

let dataDir: string;
let store: AssetStore;
let requests: XaiHttpRequest[];

/** Connect a client to a server carrying only the media tools, at the given capability. */
async function connect(overrides: Partial<MediaToolContext> = {}) {
  const server = new McpServer({ name: "test", version: "1.0.0" }, { capabilities: { tools: {} } });
  registerMediaTools(server, {
    projectId: PROJECT,
    agentId: AGENT,
    capabilities: { images: true, voice: true },
    store,
    ...overrides,
  });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result: any = await client.callTool({ name, arguments: args });
  const text: string = result.content?.[0]?.text ?? "{}";
  // A schema rejection comes back as prose rather than as our JSON envelope. It is still a
  // refusal, so it is carried through as one instead of blowing up the helper.
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { data, text, isError: result.isError === true };
}

/** Reply to every api.x.ai request with the same JSON body, recording what was asked. */
function respondWith(body: unknown, init: ResponseInit = {}) {
  setXaiTransport(async (request) => {
    requests.push(request);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });
  });
}

const IMAGE_OK = { data: [{ b64_json: b64(PNG), mime_type: "image/png" }], model: "grok-imagine-image" };

/**
 * A plausible `/v1/tts` reply. **The field names here are a guess** — docs.x.ai does not state the
 * response shape (§5.3/§5.4), which is exactly why `speech.ts` searches for the audio rather than
 * indexing one key, and why the timings are stored verbatim rather than reshaped.
 */
const TTS_OK = {
  audio: b64(MP3),
  mime_type: "audio/mpeg",
  timestamps: [
    { character: "H", start_ms: 0, end_ms: 60 },
    { character: "i", start_ms: 60, end_ms: 110 },
  ],
};

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-media-"));
  store = new AssetStore(join(dataDir, "assets"));
  requests = [];
  process.env.XAI_API_KEY = KEY;
  resetXaiClient();
});

afterEach(() => {
  setXaiTransport(null);
  setMediaDownloader(null);
  delete process.env.XAI_API_KEY;
  resetXaiClient();
  rmSync(dataDir, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-1

describe("MEDIA-1: an agent creates a deliverable and it appears on the Assets page", () => {
  test("create_deliverable returns an id the store holds", async () => {
    const client = await connect();
    const { data } = await call(client, "create_deliverable", { type: "document", title: "Launch brief" });

    expect(data.assetId).toStartWith("asset_");
    const asset = store.getAsset(data.assetId);
    expect(asset.title).toBe("Launch brief");
    expect(asset.projectId).toBe(PROJECT);
    expect(asset.producedByAgentId).toBe(AGENT);
    expect(asset.origin).toBe("generated");
  });

  test("it comes back from GET /api/assets — the page's own route, not the store's", async () => {
    // The store is reached through OPENUI_DATA_DIR here rather than injected, because the point of
    // the test is the path the page actually uses. A deliverable that only the fixture can see is
    // the failure this asserts against.
    process.env.OPENUI_DATA_DIR = dataDir;
    try {
      const client = await connect({ store: undefined });
      const { data } = await call(client, "create_deliverable", { type: "slides", title: "Q3 deck" });

      const app = new Hono();
      app.route("/api/assets", assetRoutes);
      const response = await app.request(`/api/assets?projectId=${PROJECT}`);
      const listed = (await response.json()) as { id: string; title: string }[];

      expect(response.status).toBe(200);
      expect(listed.map((a) => a.id)).toContain(data.assetId);
      expect(listed.find((a) => a.id === data.assetId)?.title).toBe("Q3 deck");
    } finally {
      delete process.env.OPENUI_DATA_DIR;
    }
  });

  test("a sixth type is refused rather than stored", async () => {
    const client = await connect();
    const { isError } = await call(client, "create_deliverable", { type: "video", title: "Nope" });
    expect(isError).toBe(true);
    expect(store.listAssets(PROJECT)).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-2

describe("MEDIA-2: write_text puts readable text on a deliverable", () => {
  test("the bytes on disk are the text that was written", async () => {
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const body = "# Launch brief\n\nThe product ships on Tuesday.\n";
    const { data } = await call(client, "write_text", {
      assetId: created.assetId,
      filename: "brief.md",
      text: body,
    });

    expect(data.mime).toBe("text/markdown");
    const asset = store.getAsset(created.assetId);
    const file = asset.files.find((f) => f.id === data.fileId)!;
    expect(readFileSync(join(store.assetDir(asset.id), file.path), "utf8")).toBe(body);
    expect(file.producedByAgentId).toBe(AGENT);
    // Writing a file costs nothing, and a $0.00 row is indistinguishable on the page from a
    // generation we failed to price.
    expect(asset.charges).toHaveLength(0);
  });

  test("attaching a file is a version, so the page can say what changed", async () => {
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    await call(client, "write_text", { assetId: created.assetId, filename: "a.md", text: "one" });

    const asset = store.getAsset(created.assetId);
    expect(asset.currentVersion).toBe(2);
    expect(asset.versions.at(-1)?.authorId).toBe(AGENT);
    expect(asset.versions.at(-1)?.changeSummary).toBe("a.md");
  });

  test("an empty file is refused: an empty deliverable reads as a broken one", async () => {
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const { isError } = await call(client, "write_text", {
      assetId: created.assetId,
      filename: "a.md",
      text: "",
    });
    expect(isError).toBe(true);
    expect(store.getAsset(created.assetId).files).toHaveLength(0);
  });

  test("a filename that is a path is refused before anything is written", () => {
    expect(() => textFileNaming("../../etc/passwd")).toThrow(/bare name/);
    expect(() => textFileNaming("notes/summary.md")).toThrow(/bare name/);
    expect(textFileNaming("summary.md")).toEqual({ mime: "text/markdown", ext: "md" });
    // No extension, or a nonsense one, becomes .txt rather than the store's "bin" — this tool
    // writes text, and a text file named .bin is one nothing will preview.
    expect(textFileNaming("README")).toEqual({ mime: "text/plain", ext: "txt" });
  });
});

// ─────────────────────────────────────────────────────────────────── identity is not a parameter

describe("an agent may only write inside its own project", () => {
  test("another project's deliverable is refused, and refused identically to one that does not exist", async () => {
    const foreign = store.createAsset({
      projectId: "proj_someone_else",
      type: "document",
      title: "Theirs",
      origin: "generated",
      authorId: "agent_other",
    });

    const client = await connect();
    const theirs = await call(client, "write_text", {
      assetId: foreign.id,
      filename: "a.md",
      text: "mine now",
    });
    const missing = await call(client, "write_text", {
      assetId: "asset_does_not_exist",
      filename: "a.md",
      text: "x",
    });

    expect(theirs.isError).toBe(true);
    expect(store.getAsset(foreign.id).files).toHaveLength(0);
    // Identical wording on purpose: a different message would let an agent probe another project's
    // ids one refusal at a time.
    expect(theirs.data.error.replace(foreign.id, "ID")).toBe(missing.data.error.replace("asset_does_not_exist", "ID"));
  });

  test("no tool takes a projectId, so nothing an agent sends can change which project it writes to", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("projectId");
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("agentId");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-3

describe("MEDIA-3: generate_image stores a real image and records what it cost", () => {
  test("the request is the documented one, and the file is the bytes that came back", async () => {
    respondWith(IMAGE_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const { data } = await call(client, "generate_image", {
      assetId: created.assetId,
      prompt: "a flat grey calibration square",
      aspect: "16:9",
    });

    expect(requests).toHaveLength(1);
    const sent = requests[0];
    expect(sent.url).toBe("https://api.x.ai/v1/images/generations");
    expect(sent.method).toBe("POST");
    expect(sent.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(sent.body!)).toEqual({
      model: "grok-imagine-image",
      prompt: "a flat grey calibration square",
      n: 1,
      // Asked for deliberately: the returned URL expires, and base64 sidesteps the dying link
      // rather than racing it.
      response_format: "b64_json",
      aspect_ratio: "16:9",
    });

    const asset = store.getAsset(created.assetId);
    const file = asset.files.find((f) => f.id === data.fileId)!;
    expect(file.role).toBe("image");
    expect(file.mime).toBe("image/png");
    expect(file.model).toBe("grok-imagine-image");
    expect(file.prompt).toBe("a flat grey calibration square");
    expect(new Uint8Array(readFileSync(join(store.assetDir(asset.id), file.path)))).toEqual(PNG);
  });

  test("the charge is on the asset, carries the file it paid for, and is the published price", async () => {
    respondWith(IMAGE_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const { data } = await call(client, "generate_image", { assetId: created.assetId, prompt: "a grey square" });

    const [charge] = store.getAsset(created.assetId).charges;
    expect(charge.fileId).toBe(data.fileId);
    expect(charge.operation).toBe("image_generation");
    expect(charge.modelId).toBe("grok-imagine-image");
    expect(charge.costUsd).toBeCloseTo(0.02, 10);
    expect(charge.costSource).toBe("estimated");
    expect(charge.units).toEqual({ kind: "images", count: 1 });
    expect(charge.agentId).toBe(AGENT);
  });

  test("when the response reports ticks, the charge is what xAI billed and says so", async () => {
    // 200,000,000 ticks at 10^10 per dollar is $0.02.
    respondWith({ ...IMAGE_OK, usage: { cost_in_usd_ticks: 200_000_000 } });
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    await call(client, "generate_image", { assetId: created.assetId, prompt: "a grey square" });

    const [charge] = store.getAsset(created.assetId).charges;
    expect(charge.costUsd).toBeCloseTo(0.02, 10);
    expect(charge.costSource).toBe("billed");
  });

  test("an error page served with a 200 is not an image, and nothing is stored", async () => {
    // The generation call succeeds and hands back a URL; the download then returns HTML. This is a
    // real failure mode of proxied media APIs and the reason the body is verified before it lands.
    respondWith({ data: [{ url: "https://cdn.invalid/i.png" }] });
    setMediaDownloader(async () => new Response("<html>gateway</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const { isError, data } = await call(client, "generate_image", {
      assetId: created.assetId,
      prompt: "a grey square",
    });

    expect(isError).toBe(true);
    expect(data.error).toContain("text/html");
    expect(store.getAsset(created.assetId).files).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-4

describe("MEDIA-4: narrate stores audio and keeps its per-character timings", () => {
  test("the request names the /v1/tts parameters, and always asks for timestamps", async () => {
    respondWith(TTS_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "workflow", title: "Walkthrough" });
    await call(client, "narrate", { assetId: created.assetId, text: "Hi", voice: "ara" });

    expect(requests[0].url).toBe("https://api.x.ai/v1/tts");
    expect(JSON.parse(requests[0].body!)).toEqual({
      // Not `input`/`voice`: /v1/tts is not OpenAI's /v1/audio/speech.
      text: "Hi",
      voice_id: "ara",
      // No call site can omit this. It is free, and reacquiring it means paying for the audio again.
      with_timestamps: true,
    });
  });

  test("the audio and the timings are both files on the deliverable", async () => {
    respondWith(TTS_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "workflow", title: "Walkthrough" });
    const { data } = await call(client, "narrate", { assetId: created.assetId, text: "Hi" });

    const asset = store.getAsset(created.assetId);
    const audio = asset.files.find((f) => f.id === data.fileId)!;
    const timings = asset.files.find((f) => f.id === data.timingsFileId)!;

    expect(audio.role).toBe("narration");
    expect(audio.mime).toBe("audio/mpeg");
    expect(new Uint8Array(readFileSync(join(store.assetDir(asset.id), audio.path)))).toEqual(MP3);

    expect(timings.role).toBe("timings");
    const kept = JSON.parse(readFileSync(join(store.assetDir(asset.id), timings.path), "utf8"));
    expect(kept.timestamps).toEqual(TTS_OK.timestamps);
    // The audio is not duplicated into the timings file; everything else is kept verbatim, because
    // the field names are unverified and a reshaping that guesses wrong discards what it cost to
    // learn.
    expect(kept.audio).toBeUndefined();
    expect(data.characterTimingCount).toBe(2);
  });

  test("the charge is per character at the published rate", async () => {
    respondWith(TTS_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "workflow", title: "Walkthrough" });
    const text = "Hello there.";
    await call(client, "narrate", { assetId: created.assetId, text });

    const [charge] = store.getAsset(created.assetId).charges;
    expect(charge.operation).toBe("tts");
    expect(charge.units).toEqual({ kind: "characters", count: text.length });
    expect(charge.costUsd).toBeCloseTo(text.length * TTS_USD_PER_CHARACTER, 12);
    expect(charge.costSource).toBe("estimated");
  });

  test("text past the REST ceiling is refused, not truncated", async () => {
    respondWith(TTS_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "workflow", title: "W" });
    const { isError, data } = await call(client, "narrate", {
      assetId: created.assetId,
      text: "a".repeat(15_001),
    });

    expect(isError).toBe(true);
    expect(data.error).toContain("15,000-character");
    // Truncating would silently drop the end of what someone asked to be said, and bill for it.
    expect(requests).toHaveLength(0);
  });

  test("a response with no recognisable audio names the keys that did arrive", async () => {
    respondWith({ result: { blob: "…" }, usage: { cost_in_usd_ticks: 100 } });
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "workflow", title: "W" });
    const { isError, data } = await call(client, "narrate", { assetId: created.assetId, text: "Hi" });

    expect(isError).toBe(true);
    // The message is the whole point: one live call then settles the shape instead of a guess
    // staying in the code.
    expect(data.error).toContain("result, usage");
    expect(store.getAsset(created.assetId).files).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-5

describe("MEDIA-5: list_deliverables lets an agent read the shelf", () => {
  test("it reports what exists, what is on it, and what it cost", async () => {
    respondWith(IMAGE_OK);
    const client = await connect();
    const { data: doc } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    await call(client, "write_text", { assetId: doc.assetId, filename: "brief.md", text: "body" });
    await call(client, "generate_image", { assetId: doc.assetId, prompt: "a grey square" });
    await call(client, "create_deliverable", { type: "table", title: "Numbers" });

    const { data } = await call(client, "list_deliverables");
    expect(data.count).toBe(2);
    const brief = data.deliverables.find((d: any) => d.assetId === doc.assetId);
    expect(brief.title).toBe("Brief");
    expect(brief.files.map((f: any) => f.role).sort()).toEqual(["body", "image"]);
    expect(brief.cost.pricedUsd).toBeCloseTo(0.02, 10);
    expect(brief.cost.unpricedCount).toBe(0);
  });

  test("it never shows another project's shelf", async () => {
    store.createAsset({
      projectId: "proj_someone_else",
      type: "document",
      title: "Theirs",
      origin: "generated",
      authorId: "agent_other",
    });
    const client = await connect();
    const { data } = await call(client, "list_deliverables");
    expect(data.count).toBe(0);
  });

  test("the type filter is the five, and a search matches the title", async () => {
    const client = await connect();
    await call(client, "create_deliverable", { type: "document", title: "Launch brief" });
    await call(client, "create_deliverable", { type: "table", title: "Numbers" });

    expect((await call(client, "list_deliverables", { type: "table" })).data.count).toBe(1);
    expect((await call(client, "list_deliverables", { q: "launch" })).data.count).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────── MEDIA-6

describe("MEDIA-6: refusals are clear, and nothing is ever charged at $0.00", () => {
  test("with no credential the priced tools refuse by name and send nothing", async () => {
    delete process.env.XAI_API_KEY;
    delete process.env.xai_api_key;
    resetXaiClient();
    setXaiTransport(async (request) => {
      requests.push(request);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });

    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    const image = await call(client, "generate_image", { assetId: created.assetId, prompt: "a grey square" });
    const speech = await call(client, "narrate", { assetId: created.assetId, text: "Hi" });

    for (const result of [image, speech]) {
      expect(result.isError).toBe(true);
      expect(result.data.error).toContain("XAI_API_KEY");
      // Not "returned empty", and not a 401 from a request that should never have been made.
      expect(result.data.error).toContain("`grok` CLI");
    }
    expect(requests).toHaveLength(0);
    expect(store.getAsset(created.assetId).charges).toHaveLength(0);
  });

  test("the tools that cost nothing keep working with no credential", async () => {
    delete process.env.XAI_API_KEY;
    delete process.env.xai_api_key;
    resetXaiClient();

    const client = await connect();
    const { data: created, isError } = await call(client, "create_deliverable", {
      type: "document",
      title: "Brief",
    });
    expect(isError).toBe(false);
    const wrote = await call(client, "write_text", {
      assetId: created.assetId,
      filename: "brief.md",
      text: "This still works.",
    });
    expect(wrote.isError).toBe(false);
  });

  test("a model with no published price is unpriced, never zero", () => {
    // The shape `client.ts` emits when it has neither a billed figure nor a published rate: the
    // dollar amount is 0 and `rateKey` is null. Rendering that 0 is how a product comes to show
    // "$0.00" for every Grok model. `rateKey` is the discriminator, and it is checked.
    const charge = chargeFromCostEvent(
      {
        id: "cost_1",
        at: 0,
        projectId: PROJECT,
        agentId: AGENT,
        operation: "image_generate",
        provider: "xai",
        modelId: "grok-imagine-image-unreleased",
        units: { kind: "images", count: 1 },
        costUsd: 0,
        source: "token_estimate",
        exact: false,
        rateKey: null,
      },
      { agentId: AGENT, operation: "image_generation", modelId: "grok-imagine-image-unreleased" },
    );

    expect(charge.costUsd).toBeNull();
    expect(charge.costSource).toBe("unknown");
    expect(charge.rateKey).toBeNull();
  });

  test("a missing cost event is unknown too, because no information is not free", () => {
    const charge = chargeFromCostEvent(null, {
      agentId: AGENT,
      operation: "tts",
      modelId: "xai:/v1/tts",
      units: { kind: "characters", count: 12 },
    });
    expect(charge.costUsd).toBeNull();
    expect(charge.costSource).toBe("unknown");
  });

  test("no charge this worktree can write is ever a priced zero", async () => {
    respondWith(IMAGE_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    await call(client, "generate_image", { assetId: created.assetId, prompt: "a grey square" });
    await call(client, "write_text", { assetId: created.assetId, filename: "a.md", text: "x" });

    const charges: AssetCharge[] = store.getAsset(created.assetId).charges;
    expect(charges.length).toBeGreaterThan(0);
    for (const charge of charges) {
      const priced = charge.costSource !== "unknown";
      expect(priced ? charge.costUsd !== 0 : charge.costUsd === null).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────── capability is registration

describe("a priced endpoint an agent may not reach is not registered at all", () => {
  test("base Grok gets the three free tools and neither generator", async () => {
    const client = await connect({ capabilities: { images: false, voice: false } });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["create_deliverable", "list_deliverables", "write_text"]);
  });

  test("images alone registers generate_image and withholds narrate", async () => {
    const client = await connect({ capabilities: { images: true, voice: false } });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("generate_image");
    expect(names).not.toContain("narrate");
  });

  test("an omitted capability is base Grok, not a granted one", async () => {
    const client = await connect({ capabilities: undefined });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("generate_image");
    expect(names).not.toContain("narrate");
  });

  test("what an agent was allowed to spend on is recorded on what it produced", async () => {
    const client = await connect({ capabilities: { images: true, voice: false } });
    const { data } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    expect(store.getAsset(data.assetId).capability).toBe("images");
  });
});

// ─────────────────────────────────────────────────────────────────── the charge write itself

describe("charges survive alongside the files they paid for", () => {
  test("two generations leave two charges and two files, neither overwriting the other", async () => {
    respondWith(IMAGE_OK);
    const client = await connect();
    const { data: created } = await call(client, "create_deliverable", { type: "document", title: "Brief" });
    await call(client, "generate_image", { assetId: created.assetId, prompt: "one grey square" });
    await call(client, "generate_image", { assetId: created.assetId, prompt: "two grey squares" });

    const asset = store.getAsset(created.assetId);
    expect(asset.files).toHaveLength(2);
    expect(asset.charges).toHaveLength(2);
    expect(new Set(asset.charges.map((c) => c.fileId))).toEqual(new Set(asset.files.map((f) => f.id)));
    // Read back from disk, not from memory: the charge writer is a second writer of an envelope
    // AssetStore owns, and the thing to prove is that it did not lose the file the store wrote.
    expect(existsSync(join(store.assetDir(asset.id), "asset.json"))).toBe(true);
  });
});
