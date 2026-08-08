import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  ASSET_TYPES,
  AssetStore,
  UnknownAssetTypeError,
  persistFile,
  type AssetType,
} from "./assetStore";

/**
 * AS-001 (five types, persistence) and AS-002 (the store stays synchronous).
 *
 * The restart case is the one that matters and the one an in-memory store would pass by accident:
 * a second `AssetStore` over the same directory is a cold read of disk, because the store keeps no
 * cache. The same check across a real process boundary is recorded under AS-001 in
 * `VERIFICATION.md`, since two `bun -e` invocations are not something a test file can host.
 */

let dir: string;
let store: AssetStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-assets-"));
  store = new AssetStore(join(dir, "assets"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function create(type: AssetType) {
  return store.createAsset({
    projectId: "proj_1",
    type,
    title: `a ${type}`,
    origin: "uploaded",
    authorId: "user",
  });
}

describe("AS-001 an asset exists in five types and persists", () => {
  test("all five types can be created and are listed back", () => {
    for (const type of ASSET_TYPES) create(type);

    const listed = store.listAssets("proj_1");
    expect(listed.map((a) => a.type).sort()).toEqual([...ASSET_TYPES].sort());
    expect(listed.every((a) => a.currentVersion === 1)).toBe(true);
  });

  test("an unknown type is refused, and nothing is stored", () => {
    expect(() =>
      store.createAsset({
        projectId: "proj_1",
        // The refusal has to hold against a value the type system never saw — an HTTP body or an
        // MCP argument arrives as unvalidated JSON, which is exactly where a bad type comes from.
        type: "spreadsheet" as AssetType,
        title: "not a type",
        origin: "uploaded",
        authorId: "user",
      }),
    ).toThrow(UnknownAssetTypeError);

    expect(store.listAssets("proj_1")).toEqual([]);
    expect(readdirSync(join(dir, "assets"))).toEqual([]);
  });

  test("files, their order and the version history survive a restart", async () => {
    const asset = create("document");
    for (const role of ["body", "figure-1", "figure-2"]) {
      const descriptor = await persistFile(
        { assetId: asset.id, role, mime: "text/plain", ext: "txt", bytes: Buffer.from(`${role} bytes`) },
        store,
      );
      store.attachFile(asset.id, descriptor, { authorId: "user", changeSummary: `attach ${role}` });
    }

    const reopened = new AssetStore(join(dir, "assets")).getAsset(asset.id);

    expect(reopened.files.map((f) => f.role)).toEqual(["body", "figure-1", "figure-2"]);
    expect(reopened.currentVersion).toBe(4);
    expect(reopened.versions.map((v) => v.version)).toEqual([1, 2, 3, 4]);
    expect(reopened.versions.at(-1)!.fileIds).toEqual(reopened.files.map((f) => f.id));
    expect(reopened.versions.at(-1)!.changeSummary).toBe("attach figure-2");
    expect(reopened.versions.every((v) => v.authorId === "user")).toBe(true);
    expect(readFileSync(join(dir, "assets", asset.id, reopened.files[0]!.path), "utf8")).toBe("body bytes");
  });

  test("the listing is derived from disk, not from an index that can disagree with it", () => {
    const asset = create("slides");
    // Whatever a cache would say, deleting the directory is the truth.
    rmSync(join(dir, "assets", asset.id), { recursive: true });
    expect(store.listAssets("proj_1")).toEqual([]);
  });
});

describe("AS-002 every store mutation is synchronous", () => {
  const src = readFileSync(join(import.meta.dir, "assetStore.ts"), "utf8");

  /** The class body only: `persistFile` is a free function outside it and must be able to await. */
  function classBody(): string {
    const start = src.indexOf("export class AssetStore {");
    expect(start, "AssetStore is declared as `export class AssetStore {`").toBeGreaterThan(-1);
    const end = src.indexOf("\n}\n", start);
    expect(end, "the class body ends with a closing brace in column 0").toBeGreaterThan(start);
    return src.slice(start, end);
  }

  test("no method on the store returns a Promise", () => {
    const asyncMethods = Object.getOwnPropertyNames(AssetStore.prototype)
      .filter((name) => name !== "constructor")
      .filter((name) => {
        const fn = (AssetStore.prototype as any)[name];
        return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
      });

    expect(
      asyncMethods,
      "an async method reintroduces the interleaving that loses one of two concurrent writes — see persist()",
    ).toEqual([]);
  });

  test("the class body contains no await", () => {
    // An async arrow or an awaited helper inside a method would not appear as an AsyncFunction on
    // the prototype, but breaks the same guarantee.
    const awaits = classBody()
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bawait\s/.test(line) && !line.startsWith("*") && !line.startsWith("//"));

    expect(awaits.map((a) => `${a.n}: ${a.line}`)).toEqual([]);
  });

  test("the reason is written where someone would break it", () => {
    // A rule whose reason has been deleted gets "cleaned up" by the next reader. Deleting the
    // explanation from the source fails here, not in production six months later. Matched against
    // the comment prose with line wrapping removed, so reflowing the paragraph is not a failure.
    const prose = src
      .split("\n")
      .map((line) => line.trim().replace(/^\*\s?/, ""))
      .join(" ")
      .replace(/\s+/g, " ");

    expect(prose).toContain("Every mutation on this class must stay synchronous");
    expect(prose).toContain(
      "safe purely because no `await` occurs inside it, so the event loop cannot interleave two of them",
    );
    expect(prose).toContain("Several agents writing at once is this product's normal state");
    expect(prose).toContain("Downloading or writing bytes inside a mutation is how the invariant dies");
  });

  test("byte persistence happens outside the store", () => {
    // The one unavoidable await lives in a free function, which hands the store a descriptor.
    expect(persistFile.constructor.name).toBe("AsyncFunction");
    const free = src.slice(src.indexOf("export async function persistFile"));
    expect(free).toContain("await");
  });

  test("the bytes are on disk before the store is told about them", async () => {
    const asset = create("document");
    const descriptor = await persistFile(
      { assetId: asset.id, role: "body", mime: "text/plain", ext: "txt", bytes: Buffer.from("hello") },
      store,
    );

    const onDisk = join(dir, "assets", asset.id, descriptor.path);
    expect(existsSync(onDisk)).toBe(true);
    expect(store.getAsset(asset.id).files).toEqual([]);

    store.attachFile(asset.id, descriptor, { authorId: "user" });
    expect(store.getAsset(asset.id).files.map((f) => f.id)).toEqual([descriptor.id]);
  });
});

describe("AS-006 declaredBy points at a design document and goes stale honestly", () => {
  const declaredBy = {
    designDocId: "doc_1",
    designDocVersion: 7,
    lineStart: 40,
    lineEnd: 52,
    stale: false,
  };

  function declared() {
    return store.createAsset({
      projectId: "proj_1",
      type: "slides",
      title: "Q3 deck",
      origin: "generated",
      authorId: "agent_1",
      producedByAgentId: "agent_1",
      declaredBy: { ...declaredBy },
    });
  }

  test("the range and the version it was read against are recorded at creation", () => {
    const asset = declared();
    expect(asset.declaredBy).toEqual(declaredBy);
    // Reread from disk: a field the envelope drops on write is a field nobody can trust.
    expect(store.getAsset(asset.id).declaredBy).toEqual(declaredBy);
  });

  test("the document advancing past that version marks the range stale", () => {
    const asset = declared();
    const changed = store.sweepDeclarations("proj_1", "doc_1", 8);

    expect(changed).toEqual([{ assetId: asset.id, designDocId: "doc_1", designDocVersion: 7 }]);
    expect(store.getAsset(asset.id).declaredBy!.stale).toBe(true);
  });

  test("nothing re-anchors the range", () => {
    // A re-anchored range that guesses wrong is worse than a stale one that says so.
    const asset = declared();
    store.sweepDeclarations("proj_1", "doc_1", 99);
    const after = store.getAsset(asset.id).declaredBy!;

    expect(after.lineStart).toBe(40);
    expect(after.lineEnd).toBe(52);
    expect(after.designDocVersion).toBe(7);
    expect(after).toEqual({ ...declaredBy, stale: true });
  });

  test("an asset declared against the current version is left alone", () => {
    const asset = declared();
    expect(store.sweepDeclarations("proj_1", "doc_1", 7)).toEqual([]);
    expect(store.getAsset(asset.id).declaredBy!.stale).toBe(false);
  });

  test("staleness never reverses, and the sweep is idempotent", () => {
    const asset = declared();
    store.sweepDeclarations("proj_1", "doc_1", 8);
    // A second sweep reports no change, and rolling the version back does not un-stale it: the
    // document did move, and that fact does not become untrue.
    expect(store.sweepDeclarations("proj_1", "doc_1", 8)).toEqual([]);
    expect(store.sweepDeclarations("proj_1", "doc_1", 7)).toEqual([]);
    expect(store.getAsset(asset.id).declaredBy!.stale).toBe(true);
  });

  test("a sweep for one document does not touch another's assets", () => {
    const mine = declared();
    const other = store.createAsset({
      projectId: "proj_1",
      type: "document",
      title: "elsewhere",
      origin: "generated",
      authorId: "agent_1",
      declaredBy: { ...declaredBy, designDocId: "doc_2" },
    });

    store.sweepDeclarations("proj_1", "doc_1", 8);
    expect(store.getAsset(mine.id).declaredBy!.stale).toBe(true);
    expect(store.getAsset(other.id).declaredBy!.stale).toBe(false);
  });

  test("an undeclared asset is not given a declaration by the sweep", () => {
    const plain = create("document");
    store.sweepDeclarations("proj_1", "doc_1", 8);
    expect(store.getAsset(plain.id).declaredBy).toBeUndefined();
  });
});

describe("AS-003 a document asset is not a design document", () => {
  const src = readFileSync(join(import.meta.dir, "assetStore.ts"), "utf8");

  test("the store exposes nothing that declares work", () => {
    // Enumerated rather than pattern-matched: an allowlist fails when a method is *added*, which
    // is the direction the mistake comes from. A `promoteToDesignDocument` lands here first.
    //
    // TypeScript's `private` is compile-time only, so the three internal methods are on the
    // prototype at runtime and are listed. Hiding them behind a filter would mean a private
    // `promoteToDesignDocument` slipped through the check that exists to catch it.
    const methods = Object.getOwnPropertyNames(AssetStore.prototype)
      .filter((name) => name !== "constructor")
      .sort();

    expect(methods).toEqual([
      "assetDir",
      "attachFile",
      "createAsset",
      "envelopePath", // private
      "filesDir",
      "getAsset",
      "listAssets",
      "persist", // private
      "readIfPresent", // private
      "sweepDeclarations",
    ]);
  });

  test("the link runs one way: the asset points at the document, never the reverse", () => {
    // The asset side carries the back-pointer.
    expect(src).toContain("declaredBy");

    // The design-document side carries no list of assets. Checked against the real declaration
    // rather than asserted in prose, so 03-design-docs adding one fails here.
    const projectTypes = readFileSync(join(import.meta.dir, "../types/project.ts"), "utf8");
    const designDocument = projectTypes.slice(
      projectTypes.indexOf("export interface DesignDocument {"),
      projectTypes.indexOf("}", projectTypes.indexOf("export interface DesignDocument {")),
    );
    expect(designDocument).not.toContain("asset");
    expect(designDocument).not.toContain("Asset");
  });

  test("the sweep is the only writer of stale, and it only ever sets it", () => {
    const body = src.slice(src.indexOf("sweepDeclarations("), src.indexOf("\n}\n", src.indexOf("export class AssetStore {")));
    expect(body).toContain("stale = true");
    expect(body).not.toContain("stale = false");
  });
});
