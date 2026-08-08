import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { atomicWriteJson } from "./persistence";

/**
 * The asset store: one envelope, five types.
 *
 * ASSETS holds outputs. It never declares work — the only thing that declares work is a design
 * document, and a design document is not an asset (`loops/02-assets.md` §2). The one link between
 * them runs one way: an asset carries `declaredBy`, and a design document stores no list of
 * assets, so no two records can disagree about the same fact.
 *
 * These types cannot live in `server/types/project.ts`: that file is shared by every parallel
 * worktree and may not be edited by one of them. They are exported from here and a re-export is
 * requested in `loops/handoff/pivot-assets.md`.
 */

export type AssetType = "document" | "slides" | "table" | "workflow" | "software";

/**
 * The five types, in the order the page lists them. Exported because the refusal in
 * `createAsset` and any HTTP or MCP validator must check against one list, not three copies.
 */
export const ASSET_TYPES: readonly AssetType[] = ["document", "slides", "table", "workflow", "software"];

export type AssetOrigin = "generated" | "uploaded" | "imported";

/** Which `api.x.ai` endpoints the producing agent was allowed to call. Set by 01-agents, read here. */
export type AssetCapability = "base" | "images" | "voice" | "voice+images";

/**
 * The back-pointer to the design document that declared this asset, and the version the line range
 * was read against. When the document advances past `designDocVersion` the range is marked stale
 * rather than re-anchored: a re-anchored range that guesses wrong is worse than a stale one that
 * says so. Same mechanism as `DesignSuggestion.baseVersion` in `server/types/project.ts`.
 */
export interface AssetDeclaredBy {
  designDocId: string;
  designDocVersion: number;
  lineStart: number;
  lineEnd: number;
  stale: boolean;
}

/**
 * One file of an asset. `path` is always relative to the asset's own directory and always local —
 * a returned `api.x.ai` media URL expires, so a record that referenced one would break days later,
 * in front of a customer. `persistFile` is the only way to produce one of these.
 */
export interface AssetFile {
  id: string;
  assetId: string;
  /** Type-specific: "body" | "slide" | "narration" | … */
  role: string;
  path: string;
  bytes: number;
  sha256: string;
  mime: string;
  durationSec?: number;
  producedByAgentId?: string;
  capability?: AssetCapability;
  /** Present for generated files, absent — never defaulted — for uploaded ones. */
  model?: string;
  requestId?: string;
  prompt?: string;
  createdAt: string;
}

/**
 * `DesignDocumentVersion` (`server/types/project.ts`) with the field names unchanged, plus
 * `fileIds`. `authorId` and `changeSummary` are what make a version history readable as provenance
 * rather than as a diff; renaming them would lose that.
 */
export interface AssetVersion {
  version: number;
  createdAt: string;
  authorId: string;
  changeSummary?: string;
  fileIds: string[];
}

/** `kind: "none"` always carries a reason. An empty preview pane is indistinguishable from a broken one. */
export interface AssetPreview {
  kind: "image" | "text" | "none";
  path?: string;
  text?: string;
  reason?: string;
  generatedAt: string;
}

/**
 * Shaped as a cost-ledger row on purpose, so that adopting `costLedger.ts` (06-tools-cost, not yet
 * built) is a move rather than a rewrite. `costUsd: null` with `costSource: "unknown"` means the
 * model could not be priced; it does not mean zero, and it must never render as `$0.00`.
 */
export interface AssetCharge {
  id: string;
  assetId: string;
  fileId?: string;
  agentId: string;
  /** "image_generation" | "video_generation" | "tts" | "turn" | … */
  operation: string;
  modelId: string;
  rateKey: string | null;
  units?: { kind: "images" | "video_seconds" | "characters" | "tokens"; count: number };
  costUsd: number | null;
  costSource: "billed" | "estimated" | "unknown";
  at: string;
}

/** Emitted by a write that actually happened, never reported by the agent. */
export interface AssetWriteLease {
  agentId: string;
  since: string;
  expiresAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  title: string;
  origin: AssetOrigin;
  declaredBy?: AssetDeclaredBy;
  /** Absent for a user upload. Never defaulted to a fake agent. */
  producedByAgentId?: string;
  capability?: AssetCapability;
  files: AssetFile[];
  preview?: AssetPreview;
  /** Individual charges, never a running total. */
  charges: AssetCharge[];
  currentVersion: number;
  versions: AssetVersion[];
  writeLease?: AssetWriteLease;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** A type that is not one of the five. Refused, not stored — see `ASSET_TYPES`. */
export class UnknownAssetTypeError extends Error {
  readonly code = "UNKNOWN_ASSET_TYPE";
  constructor(readonly received: unknown) {
    super(
      `Unknown asset type ${JSON.stringify(received)}. The five types are ${ASSET_TYPES.join(", ")}.`,
    );
    this.name = "UnknownAssetTypeError";
  }
}

export class AssetNotFoundError extends Error {
  readonly code = "ASSET_NOT_FOUND";
  constructor(assetId: string) {
    super(`No asset ${assetId}`);
    this.name = "AssetNotFoundError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isAssetType(value: unknown): value is AssetType {
  return typeof value === "string" && (ASSET_TYPES as readonly string[]).includes(value);
}

/**
 * Directory-backed asset store, one directory per asset:
 *
 * ```text
 * <root>/<assetId>/asset.json          the envelope
 * <root>/<assetId>/files/<fileId>.<ext>  the persisted bytes
 * <root>/<assetId>/files/<fileId>.json   the per-file provenance sidecar
 * ```
 *
 * **The listing is derived from those directories, never from an index.** An index that can
 * disagree with disk will disagree with disk, and the lie is always about the thing that was just
 * created: `listRepositoryFiles` (`server/services/repository.ts`) answers with `git ls-files`, so
 * a file an agent generated ten seconds ago is invisible while the answer looks authoritative.
 */
export class AssetStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  /** The asset's own directory. `AssetFile.path` is relative to this. */
  assetDir(assetId: string): string {
    return join(this.dir, assetId);
  }

  /** Where `persistFile` writes bytes. Created on demand, because an asset may hold none. */
  filesDir(assetId: string): string {
    return join(this.assetDir(assetId), "files");
  }

  private envelopePath(assetId: string): string {
    return join(this.assetDir(assetId), "asset.json");
  }

  /**
   * Write the envelope back to disk.
   *
   * **Every mutation on this class must stay synchronous.** A mutation is read-whole-file → change
   * in memory → write-whole-file, and `atomicWriteJson` makes only the *write* atomic. The
   * read-modify-write *sequence* is safe purely because no `await` occurs inside it, so the event
   * loop cannot interleave two of them and let one agent's update overwrite another's. Several
   * agents writing at once is this product's normal state, so that is load-bearing.
   *
   * Downloading or writing bytes inside a mutation is how the invariant dies. That work lives in
   * `persistFile`, a free function below, which returns a descriptor the synchronous store then
   * attaches. `assetStore.test.ts` fails if any method here becomes async, if an `await` appears
   * in the class body, or if this explanation is deleted.
   */
  private persist(asset: Asset): Asset {
    asset.updatedAt = nowIso();
    mkdirSync(this.assetDir(asset.id), { recursive: true });
    atomicWriteJson(this.envelopePath(asset.id), asset);
    return asset;
  }

  createAsset(params: {
    projectId: string;
    type: AssetType;
    title: string;
    origin: AssetOrigin;
    authorId: string;
    id?: string;
    declaredBy?: AssetDeclaredBy;
    producedByAgentId?: string;
    capability?: AssetCapability;
    changeSummary?: string;
  }): Asset {
    // Refused before anything is written: an HTTP body or an MCP argument arrives as unvalidated
    // JSON, so the type system is not the check.
    if (!isAssetType(params.type)) throw new UnknownAssetTypeError(params.type);

    const id = params.id ?? newId("asset");
    const createdAt = nowIso();
    const asset: Asset = {
      id,
      projectId: params.projectId,
      type: params.type,
      title: params.title,
      origin: params.origin,
      files: [],
      charges: [],
      currentVersion: 1,
      versions: [
        {
          version: 1,
          createdAt,
          authorId: params.authorId,
          changeSummary: params.changeSummary ?? "created",
          fileIds: [],
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };
    // Absent, not defaulted: an uploaded asset has no producing agent and no capability, and a
    // plausible-looking default would be a fabrication the UI could not tell from a fact.
    if (params.declaredBy) asset.declaredBy = params.declaredBy;
    if (params.producedByAgentId) asset.producedByAgentId = params.producedByAgentId;
    if (params.capability) asset.capability = params.capability;

    return this.persist(asset);
  }

  getAsset(assetId: string): Asset {
    const path = this.envelopePath(assetId);
    if (!existsSync(path)) throw new AssetNotFoundError(assetId);
    return JSON.parse(readFileSync(path, "utf8")) as Asset;
  }

  /** Undefined rather than throwing, for callers walking the directory listing. */
  private readIfPresent(assetId: string): Asset | undefined {
    const path = this.envelopePath(assetId);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Asset;
    } catch {
      return undefined;
    }
  }

  /** Derived from the directories every time. There is no index to fall out of step. */
  listAssets(
    projectId: string,
    opts: { type?: AssetType; q?: string; includeDeleted?: boolean } = {},
  ): Asset[] {
    if (!existsSync(this.dir)) return [];
    const q = opts.q?.trim().toLowerCase();

    const out: Asset[] = [];
    for (const entry of readdirSync(this.dir)) {
      if (!statSync(join(this.dir, entry)).isDirectory()) continue;
      const asset = this.readIfPresent(entry);
      if (!asset || asset.projectId !== projectId) continue;
      if (!opts.includeDeleted && asset.deletedAt) continue;
      if (opts.type && asset.type !== opts.type) continue;
      if (q && !asset.title.toLowerCase().includes(q)) continue;
      out.push(asset);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  /**
   * Record a file whose bytes `persistFile` has already written. Appending a file changes what the
   * asset is, so it is a version, carrying the author and a summary like any other.
   */
  attachFile(assetId: string, file: AssetFile, opts: { authorId: string; changeSummary?: string }): Asset {
    const asset = this.getAsset(assetId);
    if (file.assetId !== assetId) {
      throw new Error(`File ${file.id} was persisted for asset ${file.assetId}, not ${assetId}`);
    }
    asset.files.push(file);
    asset.currentVersion += 1;
    asset.versions.push({
      version: asset.currentVersion,
      createdAt: nowIso(),
      authorId: opts.authorId,
      changeSummary: opts.changeSummary,
      fileIds: asset.files.map((f) => f.id),
    });
    return this.persist(asset);
  }
}

const MIME_EXT: Record<string, string> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "image/png": "png",
  "image/jpeg": "jpg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
};

export interface PersistFileInput {
  assetId: string;
  role: string;
  mime: string;
  /** Overrides the mime lookup. Falls back to "bin" rather than guessing. */
  ext?: string;
  bytes?: Uint8Array;
  base64?: string;
  durationSec?: number;
  producedByAgentId?: string;
  capability?: AssetCapability;
  model?: string;
  requestId?: string;
  prompt?: string;
}

/**
 * Write bytes into an asset's directory and return the descriptor the store will attach.
 *
 * This is where the one unavoidable `await` lives, deliberately outside `AssetStore` — see the
 * note on `persist()`. It is an internal server API for 04-generation and 05-software. It is not
 * an MCP tool, and no MCP tool takes a URL: an agent that could hand the store a URL could persist
 * anything on the network into a user's asset store.
 *
 * The bytes are on disk before this returns, and the record does not exist until the caller
 * attaches the descriptor, so a failure here leaves no half-file in the envelope.
 *
 * Accepting a remote URL and downloading it before the record is written is AS-004 and is not
 * built yet; until it is, callers hand over bytes they already hold.
 */
export async function persistFile(input: PersistFileInput, store: AssetStore): Promise<AssetFile> {
  const bytes = input.bytes ?? (input.base64 !== undefined ? Buffer.from(input.base64, "base64") : undefined);
  if (!bytes) throw new Error(`persistFile needs bytes or base64 for role "${input.role}"`);

  const id = newId("file");
  const ext = input.ext ?? MIME_EXT[input.mime] ?? "bin";
  const relative = join("files", `${id}.${ext}`);
  const dir = store.filesDir(input.assetId);
  mkdirSync(dir, { recursive: true });

  const descriptor: AssetFile = {
    id,
    assetId: input.assetId,
    role: input.role,
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mime: input.mime,
    createdAt: nowIso(),
  };
  if (input.durationSec !== undefined) descriptor.durationSec = input.durationSec;
  if (input.producedByAgentId) descriptor.producedByAgentId = input.producedByAgentId;
  if (input.capability) descriptor.capability = input.capability;
  if (input.model) descriptor.model = input.model;
  if (input.requestId) descriptor.requestId = input.requestId;
  if (input.prompt) descriptor.prompt = input.prompt;

  await writeFile(join(dir, `${id}.${ext}`), bytes);
  // The provenance sidecar sits beside the bytes so a directory scan can rebuild the envelope.
  await writeFile(join(dir, `${id}.json`), JSON.stringify(descriptor, null, 2));

  return descriptor;
}

/** Default store, rooted alongside the rest of OpenUI state. */
function assetsDir(): string {
  return join(process.env.OPENUI_DATA_DIR || join(homedir(), ".openui"), "assets");
}

let defaultStore: AssetStore | null = null;
let defaultStoreDir: string | null = null;

/**
 * Process-wide store, rebuilt when the configured data directory changes rather than caching the
 * first one forever — otherwise the directory is fixed by whichever caller happened to run first.
 */
export function getAssetStore(): AssetStore {
  const dir = assetsDir();
  if (!defaultStore || defaultStoreDir !== dir) {
    defaultStore = new AssetStore(dir);
    defaultStoreDir = dir;
  }
  return defaultStore;
}
