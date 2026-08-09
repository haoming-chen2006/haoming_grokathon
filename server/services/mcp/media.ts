/**
 * The deliverable tools — the link between an agent and the ASSETS page.
 *
 * Before this file, an agent had ~35 MCP tools and not one of them could produce a deliverable. It
 * could read the project, change files in its worktree, submit for review and message other agents,
 * and at the end of all that the Assets page was still empty. The work existed; nothing shipped.
 *
 * Six tools close that:
 *
 *   create_deliverable   start one of the five asset types and get its id
 *   write_text           put readable text on it — the tool that makes the product a product
 *   generate_image       $0.02 a picture, persisted, charged
 *   narrate              speech with its per-character timings kept
 *   list_deliverables    read the shelf, because an agent that can only write is half an agent
 *   read_deliverable     open one, because a shelf you cannot take anything off is a catalogue
 *
 * ── Why `read_deliverable` had to exist ───────────────────────────────────────────────────────
 * `loops/02-assets.md:23` states the loop's own scenario: "The research agent reads existing
 * material *out of* the asset store." Nothing could. `list_deliverables` returned `fileId`, `role`,
 * `mime` and `bytes` — enough to know a 41 KB PDF was there and no way whatsoever to open it — and
 * `get_artifact` (`projectMcpServer.ts`) reads the *project store's* artifacts, a different record
 * type that answers "not found" for every asset id. A user who uploaded two PDFs and `@`-mentioned
 * them at an agent was mentioning something the agent could not reach.
 *
 * ── Identity is not a parameter ───────────────────────────────────────────────────────────────
 * `projectId` and `agentId` are bound when the server is constructed, from the URL the agent was
 * handed (`server/routes/mcp.ts`). No tool here takes a project id, and every one that names an
 * existing asset checks that the asset belongs to *this* project before touching it. An agent
 * cannot write into another project's shelf, and cannot learn whether an id exists in one.
 *
 * ── Which tools exist depends on capability ───────────────────────────────────────────────────
 * `generate_image` and `narrate` are registered only when the agent's capability grants them, which
 * is `boundary.ts`'s rule and not a new one: "the enforcement is registration, not refusal", because
 * an advertised tool that always fails is an invitation to retry and a retry loop against a priced
 * endpoint is a spend loop. The three unpriced tools are registered for every agent.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ASSET_TYPES,
  AssetNotFoundError,
  getAssetStore,
  persistFile,
  type Asset,
  type AssetCharge,
  type AssetFile,
  type AssetStore,
  type AssetType,
} from "../assetStore";
import { atomicWriteJson } from "../persistence";
import { BASE_CAPABILITIES, capabilityPreset, type AgentCapabilities } from "../boundary";
import { XaiError, type CostEvent } from "../xai/types";
import { materialiseGenerated } from "../xai/assets";
import { xaiClient } from "../xai/client";
import { generateImage, IMAGE_ASPECT_RATIOS, IMAGE_MODEL_PRICES_USD } from "../xai/images";
import { generateSpeech, TTS_VOICES } from "../xai/speech";

export interface MediaToolContext {
  projectId: string;
  agentId: string;
  /** What this agent may spend on. Absent means base Grok: no priced endpoint is registered. */
  capabilities?: AgentCapabilities;
  /** Tests only, so a server can be pointed at a fixture store. */
  store?: AssetStore;
}

/**
 * The tools every agent gets, priced at nothing. Exported so `PROJECT_MCP_TOOLS` names them once.
 *
 * `generate_image` and `narrate` are deliberately absent: they live in `boundary.ts`'s `IMAGE_TOOLS`
 * and `VOICE_TOOLS`, which are gated, and a gated tool in the ungated list would be a tool the
 * capability check silently fails to withhold.
 */
export const DELIVERABLE_TOOLS = [
  "create_deliverable",
  "write_text",
  "list_deliverables",
  "read_deliverable",
] as const;

// ─────────────────────────────────────────────────────────────────────── tool result plumbing

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failed(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/**
 * Run a tool body and turn a failure into a sentence.
 *
 * A refusal is returned, never thrown: a thrown error reaches the agent as a JSON-RPC internal
 * error with no guidance in it, and "no xAI credential is configured" is exactly the kind of thing
 * an agent must be able to read and act on rather than retry.
 */
async function guard<T>(fn: () => T | Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof XaiError) return failed(`${err.code.toUpperCase()}: ${err.message}`);
    return failed(err instanceof Error ? err.message : String(err));
  }
}

// ─────────────────────────────────────────────────────────────────────── charges

let chargeCounter = 0;

function newChargeId(): string {
  chargeCounter += 1;
  return `charge_${Date.now().toString(36)}${chargeCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Translate a generation cost event into the charge the Assets page renders.
 *
 * The one rule that matters: **a call we could not price is `costUsd: null` with
 * `costSource: "unknown"`, never `0`.** `client.ts` carries an unpriced charge as `costUsd: 0` with
 * `source: "token_estimate"` and `rateKey: null`, which is the right shape for a ledger row that
 * must still sum — but rendered directly it says "$0.00", and "$0.00" for something we could not
 * price is a fabricated figure. `rateKey === null` is the discriminator, and it is checked here
 * rather than trusted from the number.
 */
export function chargeFromCostEvent(
  event: CostEvent | null,
  what: { agentId: string; operation: string; modelId: string; units?: AssetCharge["units"] },
): Omit<AssetCharge, "id" | "assetId" | "at"> {
  // Only the money comes from the event. What the operation is *called* comes from the caller,
  // because the two vocabularies differ and always have: a `CostEvent` says `image_generate`
  // (after the endpoint) and an `AssetCharge` says `image_generation` (after the act, alongside
  // `turn` and `video_generation`). Copying the event's label through would put endpoint names in
  // a column the page groups by, and the two spellings would quietly become two categories.
  const base = {
    agentId: what.agentId,
    operation: what.operation,
    modelId: what.modelId,
    ...(what.units ? { units: what.units } : {}),
  };

  // No event at all means no billing information reached the client. That is unknown, not free.
  if (!event) return { ...base, rateKey: null, costUsd: null, costSource: "unknown" as const };

  const priced = event.source === "ticks" || event.rateKey !== null;
  return {
    ...base,
    rateKey: event.rateKey,
    costUsd: priced ? event.costUsd : null,
    // "billed" is reserved for what xAI actually charged. A published per-unit price times our own
    // count is exact by construction but is still our arithmetic, not their invoice.
    costSource: priced ? (event.source === "ticks" ? "billed" : "estimated") : "unknown",
  };
}

/**
 * Append a charge to an asset envelope.
 *
 * **This is a second writer of a file `AssetStore` owns, and it should not stay one.** `AssetStore`
 * exposes `createAsset` and `attachFile` and no way to record a charge, so a generated file could be
 * persisted with its model and its prompt but not with what it cost — and an asset store that
 * silently drops the cost of the one operation that costs money is the hole this engine exists to
 * close. `server/services/assetStore.ts` belongs to another worktree and may not be edited from
 * here, so `AssetStore.recordCharge()` is requested in `loops/handoff/pivot-media.md` (R-1) and this
 * function is what stands in until it lands.
 *
 * It holds the store's own invariant while it does: read, change, write, with **no `await` in
 * between**, so the event loop cannot interleave two of them and let one agent's charge overwrite
 * another's. See the note on `AssetStore.persist`. Adding an `await` here is how that dies.
 */
export function recordCharge(
  store: AssetStore,
  assetId: string,
  charge: Omit<AssetCharge, "id" | "assetId" | "at">,
): AssetCharge {
  const asset = store.getAsset(assetId);
  const row: AssetCharge = { id: newChargeId(), assetId, at: new Date().toISOString(), ...charge };
  asset.charges.push(row);
  asset.updatedAt = new Date().toISOString();
  atomicWriteJson(join(store.assetDir(assetId), "asset.json"), asset);
  return row;
}

// ─────────────────────────────────────────────────────────────────────── filenames

const TEXT_MIME_BY_EXT: Readonly<Record<string, string>> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
};

/**
 * Read a mime type and an extension off a filename, refusing anything that is not a bare name.
 *
 * `persistFile` names the file after its own id and uses only the extension, so a path separator
 * cannot escape the asset directory through the name — but it *can* through `ext`, and a filename
 * of `../../etc/passwd` reaching a store is not something to leave to a downstream implementation
 * detail. Refused here, where the message can say why.
 */
export function textFileNaming(filename: string): { mime: string; ext: string } {
  const name = filename.trim();
  if (!name) throw new Error("filename is required");
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error(
      `filename "${filename}" must be a bare name like "summary.md" — a deliverable holds files, ` +
        `not a directory tree, and a path here would write outside the asset.`,
    );
  }

  const dot = name.lastIndexOf(".");
  const raw = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  // Fall back to .txt rather than to the store's "bin": this tool writes text, and a text file
  // named .bin is one nothing will preview.
  const ext = /^[a-z0-9]{1,8}$/.test(raw) ? raw : "txt";
  return { mime: TEXT_MIME_BY_EXT[ext] ?? "text/plain", ext };
}

// ─────────────────────────────────────────────────────────────────────── reading a deliverable

/**
 * How much of a text file `read_deliverable` will inline before it stops and points at the path.
 *
 * A cap and not a refusal: the first 100k characters of a long document are usually the part that
 * answers the question, and an agent that needs the rest has the path and its own `read_file`, which
 * takes an offset. A tool that returned nothing at 100,001 characters would be worse than one that
 * returns the beginning.
 */
export const INLINE_TEXT_LIMIT = 100_000;

/**
 * Whether this file's bytes are text we can put in a tool result.
 *
 * Decided from the mime the store recorded at write time, never from the extension: `persistFile`
 * derives the extension *from* the mime, so the mime is the earlier fact and the one an uploaded
 * file carries from the browser.
 *
 * Everything else — PDF, PPTX, XLSX, images, audio, video — comes back as a path instead, and that
 * is not a shortfall. `read_file` in Grok Build extracts PDF and PPTX text itself
 * (`.refs/grok-build/…/implementations/grok_build/read_file/mod.rs:431`), and images reach the model
 * as images. Re-implementing document extraction on this side would produce a second, worse answer
 * for formats the agent already reads better than we could.
 */
export function isInlineableText(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json" || mime === "image/svg+xml";
}

// ─────────────────────────────────────────────────────────────────────── registration

export function registerMediaTools(server: McpServer, ctx: MediaToolContext): void {
  const capabilities = ctx.capabilities ?? BASE_CAPABILITIES;
  const store = () => ctx.store ?? getAssetStore();

  /**
   * The asset, if it is this project's.
   *
   * One message for "does not exist" and "belongs to someone else", on purpose: distinguishing them
   * would let an agent probe another project's ids one refusal at a time.
   */
  const ownAsset = (assetId: string): Asset => {
    let asset: Asset;
    try {
      asset = store().getAsset(assetId);
    } catch (err) {
      if (err instanceof AssetNotFoundError) throw new Error(`No deliverable ${assetId} in this project.`);
      throw err;
    }
    if (asset.projectId !== ctx.projectId) throw new Error(`No deliverable ${assetId} in this project.`);
    return asset;
  };

  /** Attach a persisted file and report the same summary shape from every tool that makes one. */
  const attach = (assetId: string, file: AssetFile, changeSummary: string) => {
    store().attachFile(assetId, file, { authorId: ctx.agentId, changeSummary });
    return { fileId: file.id, assetId, role: file.role, mime: file.mime, bytes: file.bytes, sha256: file.sha256 };
  };

  // ------------------------------------------------------------------ M-1

  server.registerTool(
    "create_deliverable",
    {
      description:
        "Create a deliverable on the ASSETS page and return its id. This is how your work leaves " +
        "your worktree and reaches the user. Every other deliverable tool takes the id this returns.",
      inputSchema: {
        type: z
          .enum(ASSET_TYPES as unknown as [AssetType, ...AssetType[]])
          .describe("One of the five: document, slides, table, workflow, software"),
        title: z.string().min(1).describe("What this is, in the user's words — it is the page's label"),
      },
    },
    async ({ type, title }) =>
      guard(() => {
        const asset = store().createAsset({
          projectId: ctx.projectId,
          type,
          title: title.trim(),
          origin: "generated",
          authorId: ctx.agentId,
          producedByAgentId: ctx.agentId,
          // What this agent was allowed to call, recorded on the thing it produced.
          capability: capabilityPreset(capabilities).id,
          changeSummary: `Created by ${ctx.agentId}`,
        });
        return { assetId: asset.id, type: asset.type, title: asset.title, createdAt: asset.createdAt };
      }),
  );

  // ------------------------------------------------------------------ M-2

  server.registerTool(
    "write_text",
    {
      description:
        "Write text — Markdown or plain — as a file on a deliverable you created. The bytes are " +
        "stored and readable on the ASSETS page. Costs nothing.",
      inputSchema: {
        assetId: z.string().describe("From create_deliverable"),
        filename: z.string().min(1).describe('A bare name, e.g. "summary.md". No directories.'),
        text: z.string().describe("The document body"),
      },
    },
    async ({ assetId, filename, text }) =>
      guard(async () => {
        ownAsset(assetId);
        const { mime, ext } = textFileNaming(filename);
        const bytes = new TextEncoder().encode(text);
        if (bytes.byteLength === 0) {
          throw new Error("Refusing to write an empty file. An empty deliverable reads as a broken one.");
        }

        const file = await persistFile(
          { assetId, role: "body", mime, ext, bytes, producedByAgentId: ctx.agentId },
          store(),
        );
        // No charge is recorded. Writing a file costs nothing, and a $0.00 row would be
        // indistinguishable on the page from a generation we failed to price.
        return { ...attach(assetId, file, filename.trim()), filename: filename.trim(), characters: text.length };
      }),
  );

  // ------------------------------------------------------------------ M-5

  server.registerTool(
    "list_deliverables",
    {
      description:
        "The deliverables on this project's ASSETS page: what exists, what is on each one, and " +
        "what it cost. Read this before creating something that may already be there.",
      inputSchema: {
        type: z.enum(ASSET_TYPES as unknown as [AssetType, ...AssetType[]]).optional(),
        q: z.string().optional().describe("Match against the title"),
      },
    },
    async ({ type, q }) =>
      guard(() => {
        const assets = store().listAssets(ctx.projectId, { type, q });
        return {
          count: assets.length,
          deliverables: assets.map((asset) => ({
            assetId: asset.id,
            type: asset.type,
            title: asset.title,
            origin: asset.origin,
            producedByAgentId: asset.producedByAgentId,
            version: asset.currentVersion,
            updatedAt: asset.updatedAt,
            files: asset.files.map((f) => ({
              fileId: f.id,
              role: f.role,
              mime: f.mime,
              bytes: f.bytes,
              model: f.model,
              prompt: f.prompt,
            })),
            cost: summariseCharges(asset.charges),
          })),
        };
      }),
  );

  // ------------------------------------------------------------------ M-6

  server.registerTool(
    "read_deliverable",
    {
      description:
        "Open a deliverable and read what is on it. Text files come back inline. Anything else — " +
        "PDF, slides, spreadsheet, image, audio — comes back as an absolute path you open with " +
        "your own read_file, which extracts PDF and PPTX text for you. Costs nothing.",
      inputSchema: {
        assetId: z
          .string()
          .describe("From list_deliverables, or from an asset: mention resolved in your message"),
        fileId: z
          .string()
          .optional()
          .describe("One file on the deliverable. Omit to get every file on it."),
      },
    },
    async ({ assetId, fileId }) =>
      guard(() => {
        const asset = ownAsset(assetId);

        // A named file that is not on this asset is the same refusal as a missing asset, and for
        // the same reason: an agent must not be able to learn which file ids exist elsewhere.
        const files = fileId ? asset.files.filter((f) => f.id === fileId) : asset.files;
        if (fileId && files.length === 0) {
          throw new Error(`No file ${fileId} on deliverable ${assetId}.`);
        }

        return {
          assetId: asset.id,
          type: asset.type,
          title: asset.title,
          origin: asset.origin,
          version: asset.currentVersion,
          producedByAgentId: asset.producedByAgentId,
          declaredBy: asset.declaredBy,
          fileCount: asset.files.length,
          files: files.map((file) => {
            // The absolute path, not the stored relative one. `AssetFile.path` is relative to the
            // asset directory and means nothing in the agent's worktree, which is its cwd.
            const path = join(store().assetDir(asset.id), file.path);
            const base = {
              fileId: file.id,
              role: file.role,
              mime: file.mime,
              bytes: file.bytes,
              sha256: file.sha256,
              createdAt: file.createdAt,
              // Readable because the sandbox profile is `workspace`, which confines writes to the
              // agent's own area and leaves reads open (`server/services/acpClient.ts`). Under
              // `strict` this path would be outside the agent's reach and the text below would be
              // the only way in — which is why the text is inlined rather than only pointed at.
              path,
            };
            if (!isInlineableText(file.mime)) return base;

            let text: string;
            try {
              text = readFileSync(path, "utf8");
            } catch (err) {
              // The envelope says the file is there and the bytes are not. Reported, not thrown:
              // the other files on the deliverable are still readable and still worth returning.
              return { ...base, unreadable: err instanceof Error ? err.message : String(err) };
            }
            if (text.length <= INLINE_TEXT_LIMIT) return { ...base, text };
            return {
              ...base,
              text: text.slice(0, INLINE_TEXT_LIMIT),
              truncated: {
                inlined: INLINE_TEXT_LIMIT,
                characters: text.length,
                note: `Inlined the first ${INLINE_TEXT_LIMIT} of ${text.length} characters. Read ${path} with an offset for the rest.`,
              },
            };
          }),
        };
      }),
  );

  // ------------------------------------------------------------------ M-3 (gated on images)

  if (capabilities.images) {
    server.registerTool(
      "generate_image",
      {
        description:
          "Generate an image with Grok Imagine and store it on a deliverable. This spends real " +
          `money — $${IMAGE_MODEL_PRICES_USD["grok-imagine-image"].toFixed(2)} per image. One image ` +
          "per call, and the same prompt twice costs twice.",
        inputSchema: {
          assetId: z.string().describe("From create_deliverable"),
          prompt: z.string().min(1).describe("What to draw. Be specific; you pay per attempt."),
          aspect: z.enum(IMAGE_ASPECT_RATIOS as unknown as [string, ...string[]]).optional(),
        },
      },
      async ({ assetId, prompt, aspect }) =>
        guard(async () => {
          ownAsset(assetId);
          requireCredential();

          const generated = await generateImage({
            prompt,
            ...(aspect !== undefined ? { aspectRatio: aspect } : {}),
            context: { projectId: ctx.projectId, agentId: ctx.agentId },
          });

          // Verified before it is stored: a zero-byte body or a text/html error page is not a
          // picture, however successful the status line was.
          const { bytes, mimeType } = await materialiseGenerated(generated.payload, "image", "image");

          const file = await persistFile(
            {
              assetId,
              role: "image",
              mime: mimeType,
              bytes,
              producedByAgentId: ctx.agentId,
              capability: capabilityPreset(capabilities).id,
              model: generated.model,
              prompt,
            },
            store(),
          );
          const summary = attach(assetId, file, `Generated image: ${headline(prompt)}`);

          // The charge goes on *after* the file exists, and carries its id. A charge without a file
          // is money we cannot point at anything for.
          const charge = recordCharge(store(), assetId, {
            ...chargeFromCostEvent(generated.costEvent, {
              agentId: ctx.agentId,
              operation: "image_generation",
              modelId: generated.model,
              units: { kind: "images", count: 1 },
            }),
            fileId: file.id,
          });

          return { ...summary, model: generated.model, prompt, charge };
        }),
    );
  }

  // ------------------------------------------------------------------ M-4 (gated on voice)

  if (capabilities.voice) {
    server.registerTool(
      // Named `narrate` because that is the name `boundary.ts` grants under the voice capability.
      // A second name for the same endpoint would be a voice tool the capability table does not
      // know about, and therefore one it cannot withhold.
      "narrate",
      {
        description:
          "Speak text with Grok's TTS and store the audio on a deliverable, together with its " +
          "per-character timings. Spends real money — $15 per million characters. Voices: " +
          `${TTS_VOICES.join(", ")} (default ${TTS_VOICES[0]}).`,
        inputSchema: {
          assetId: z.string().describe("From create_deliverable"),
          text: z.string().min(1).describe("What to say. Max 15,000 characters over REST."),
          voice: z.enum(TTS_VOICES as unknown as [string, ...string[]]).optional(),
        },
      },
      async ({ assetId, text, voice }) =>
        guard(async () => {
          ownAsset(assetId);
          requireCredential();

          const spoken = await generateSpeech({
            text,
            ...(voice !== undefined ? { voice } : {}),
            context: { projectId: ctx.projectId, agentId: ctx.agentId },
          });

          const { bytes, mimeType } = await materialiseGenerated(
            { b64: spoken.b64, mimeType: spoken.mimeType },
            "audio",
            "narration",
          );

          const audio = await persistFile(
            {
              assetId,
              role: "narration",
              mime: mimeType,
              bytes,
              producedByAgentId: ctx.agentId,
              capability: capabilityPreset(capabilities).id,
              model: spoken.modelId,
              prompt: text,
            },
            store(),
          );
          const summary = attach(assetId, audio, `Narration (${spoken.voice}): ${headline(text)}`);

          // The timings are stored as a file of their own rather than folded into the audio file's
          // record, because they are the thing that will later sync narration to a slide build and
          // they cost exactly as much to reacquire as the audio does. Kept verbatim: the field
          // names are unverified, and a reshaping that guesses wrong throws away what it cost to
          // learn.
          const timings = await persistFile(
            {
              assetId,
              role: "timings",
              mime: "application/json",
              // NOT `ext: "json"`. `persistFile` writes the bytes to `<fileId>.<ext>` and its
              // provenance sidecar to `<fileId>.json`, so an extension of exactly "json" makes the
              // sidecar overwrite the file it describes — the timings would be silently replaced by
              // their own metadata, and the mime lookup maps application/json straight onto it. The
              // fix belongs in assetStore.ts, which this worktree may not edit; it is R-3 in
              // loops/handoff/pivot-media.md, and this extension steps around it in the meantime.
              ext: "timings.json",
              bytes: new TextEncoder().encode(JSON.stringify(spoken.timings, null, 2)),
              producedByAgentId: ctx.agentId,
              model: spoken.modelId,
            },
            store(),
          );
          attach(assetId, timings, `Per-character timings for ${audio.id}`);

          const charge = recordCharge(store(), assetId, {
            ...chargeFromCostEvent(spoken.costEvent, {
              agentId: ctx.agentId,
              operation: "tts",
              modelId: spoken.modelId,
              units: { kind: "characters", count: spoken.characters },
            }),
            fileId: audio.id,
          });

          return {
            ...summary,
            voice: spoken.voice,
            characters: spoken.characters,
            timingsFileId: timings.id,
            characterTimingCount: spoken.characterTimings?.length ?? null,
            charge,
          };
        }),
    );
  }
}

/**
 * Refuse before spending, and say which credential is missing.
 *
 * Checked here as well as in the client so the refusal reads as a tool refusal rather than as a
 * failure part-way through one — nothing has been created, nothing has been half-written, and the
 * message names the environment variable to set.
 */
function requireCredential(): void {
  if (!xaiClient().hasCredential) {
    throw new XaiError(
      "no xAI credential is configured, so nothing can be generated. Set XAI_API_KEY (or " +
        "xai_api_key) in the server's environment. This is a different credential from the one " +
        "that signs the `grok` CLI in. Retrying will not help until it is set.",
      "no_credential",
    );
  }
}

/** A prompt trimmed to a change-summary line. Never invented when the prompt is empty. */
function headline(prompt: string): string {
  const first = prompt.trim().split("\n")[0].trim();
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/**
 * Add charges up without pretending the unpriced ones are free.
 *
 * The same rule `client/src/control-room/tools/cost/formatCharge.ts` applies on the page: a total
 * that quietly omits what it could not price reads as complete when it is not, so the count of
 * unpriced charges travels with the number.
 */
export function summariseCharges(charges: readonly AssetCharge[]): {
  pricedUsd: number;
  pricedCount: number;
  unpricedCount: number;
  note?: string;
} {
  let pricedUsd = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const charge of charges) {
    if (typeof charge.costUsd === "number") {
      pricedUsd += charge.costUsd;
      pricedCount += 1;
    } else {
      unpricedCount += 1;
    }
  }
  return {
    pricedUsd,
    pricedCount,
    unpricedCount,
    ...(unpricedCount > 0
      ? { note: `${unpricedCount} charge(s) could not be priced and are not included in the total` }
      : {}),
  };
}
