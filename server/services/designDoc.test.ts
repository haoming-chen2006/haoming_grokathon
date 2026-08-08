import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DesignDocStore, renderDocument } from "./designDoc";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user-1" };
const OTHER: Actor = { kind: "user", id: "user-2" };

const roots: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "openui-designdoc-"));
  roots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

let dir: string;
let store: DesignDocStore;

beforeEach(() => {
  dir = freshDir();
  store = new DesignDocStore(join(dir, "design-docs"));
});

// ---- DD-001 -------------------------------------------------------------------------------

describe("DD-001: a design document exists independently of any project", () => {
  test("a document can be created, retitled and read with no project in existence", () => {
    const created = store.createDocument({ title: "Q3 Enterprise Deck" }, USER);
    expect(created.id).toBeTruthy();
    expect(created.followedByProjectId).toBeUndefined();

    const retitled = store.retitleDocument(created.id, "Q3 Enterprise Deck (rev 2)", USER);
    expect(retitled.title).toBe("Q3 Enterprise Deck (rev 2)");
    expect(store.getDocument(created.id).title).toBe("Q3 Enterprise Deck (rev 2)");

    // No project store was constructed and nothing wrote a project. A design document is where the
    // next project comes from, so it must exist before one does.
    expect(readdirSync(dir)).toEqual(["design-docs"]);
    expect(readdirSync(join(dir, "design-docs"))).toEqual([`${created.id}.json`]);
  });

  test("it round-trips through a real process restart with sections, order and versions intact", () => {
    const doc = store.createDocument(
      {
        title: "Brief",
        sections: [
          { title: "Research", body: "prospect material" },
          { title: "Slides", body: "deck assembly" },
        ],
      },
      USER,
    );
    const [research, slides] = doc.sections;
    store.writeSection(doc.id, research.anchor, { body: "prospect material v2", expectedVersion: 1 }, USER);
    store.writeSection(
      doc.id,
      research.anchor,
      { body: "prospect material v3", expectedVersion: 2, changeSummary: "narrowed the list" },
      OTHER,
    );

    // A second store instance would share this process. Read it back from a genuinely separate
    // process instead: "survives a restart" is a claim about the bytes on disk, and only a new
    // process proves nothing was being served out of memory.
    const script = `
      const { DesignDocStore } = await import(${JSON.stringify(join(import.meta.dir, "designDoc.ts"))});
      const store = new DesignDocStore(${JSON.stringify(join(dir, "design-docs"))});
      process.stdout.write(JSON.stringify(store.getDocument(${JSON.stringify(doc.id)})));
    `;
    const run = Bun.spawnSync([process.execPath, "-e", script]);
    expect(run.stderr.toString(), "the restart subprocess failed").toBe("");
    expect(run.exitCode).toBe(0);
    const restored = JSON.parse(run.stdout.toString());

    expect(restored.title).toBe("Brief");
    expect(restored.sections.map((s: any) => s.title)).toEqual(["Research", "Slides"]);
    expect(restored.sections.map((s: any) => s.anchor)).toEqual([research.anchor, slides.anchor]);
    expect(restored.sections[0].currentVersion).toBe(3);
    expect(restored.sections[0].body).toBe("prospect material v3");
    expect(restored.sections[0].versions.map((v: any) => v.version)).toEqual([1, 2, 3]);
    expect(restored.sections[0].versions.map((v: any) => v.authorId)).toEqual(["user-1", "user-1", "user-2"]);
    expect(restored.sections[0].versions[2].changeSummary).toBe("narrowed the list");
  });

  test("a missing document is a NotFoundError, not an empty document", () => {
    // An empty document returned for an unknown id is a fabricated value: the caller cannot tell
    // "no such document" from "a document with nothing in it".
    expect(() => store.getDocument("doc_nope")).toThrow(/not found/i);
  });

  test("firstLine is derived on read and never reaches disk", () => {
    const doc = store.createDocument(
      {
        title: "Brief",
        sections: [
          { title: "Research", body: "line one\nline two" },
          { title: "Slides", body: "deck" },
        ],
      },
      USER,
    );

    // ## Research (1), line one (2), line two (3), blank (4), ## Slides (5)
    expect(doc.sections.map((s) => s.firstLine)).toEqual([1, 5]);
    expect(renderDocument(doc).split("\n")[4]).toBe("## Slides");

    const onDisk = JSON.parse(readFileSync(join(dir, "design-docs", `${doc.id}.json`), "utf8"));
    for (const section of onDisk.sections) {
      expect(section.firstLine, "a stored line number is wrong on the next edit").toBeUndefined();
    }
  });

  test("an edit above a section moves its derived firstLine without touching its anchor", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research", body: "one" }, { title: "Slides", body: "deck" }] },
      USER,
    );
    const slidesAnchor = doc.sections[1].anchor;
    expect(doc.sections[1].firstLine).toBe(4);

    const after = store.writeSection(doc.id, doc.sections[0].anchor, { body: "one\ntwo\nthree", expectedVersion: 1 }, USER);
    const slides = after.sections.find((s) => s.anchor === slidesAnchor)!;
    expect(slides.firstLine, "the section moved down two lines").toBe(6);
    expect(slides.anchor).toBe(slidesAnchor);
  });
});

// ---- DD-002 -------------------------------------------------------------------------------

const AGENT: Actor = { kind: "agent", id: "agent-research" };

describe("DD-002: a document may be followed by at most one project", () => {
  test("the link is a single field on the document", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);
    const followed = store.followDocument(doc.id, "proj-1", USER);

    expect(followed.followedByProjectId).toBe("proj-1");
    // Singular, so the illegal state is unrepresentable rather than merely forbidden.
    expect(Array.isArray((followed as any).followedByProjectId)).toBe(false);

    const onDisk = JSON.parse(readFileSync(join(dir, "design-docs", `${doc.id}.json`), "utf8"));
    expect(typeof onDisk.followedByProjectId).toBe("string");
  });

  test("a second project is refused, and the refusal carries all three ids", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);
    store.followDocument(doc.id, "proj-1", USER);

    let error: any;
    try {
      store.followDocument(doc.id, "proj-2", USER);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.name).toBe("DocumentAlreadyFollowedError");
    expect(error.code).toBe("DOCUMENT_ALREADY_FOLLOWED");
    // All three, because "already followed" alone renders into nothing the user can act on — the
    // UI must be able to offer "open the other project".
    expect(error.docId).toBe(doc.id);
    expect(error.currentProjectId).toBe("proj-1");
    expect(error.requestedProjectId).toBe("proj-2");
  });

  test("the refusal leaves followedByProjectId unchanged", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);
    store.followDocument(doc.id, "proj-1", USER);
    const before = store.getDocument(doc.id).followedByProjectId;

    expect(() => store.followDocument(doc.id, "proj-2", USER)).toThrow();

    expect(store.getDocument(doc.id).followedByProjectId).toBe(before);
    expect(store.getDocument(doc.id).followedByProjectId).toBe("proj-1");
  });

  test("re-following the same project is idempotent, not an error", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);
    store.followDocument(doc.id, "proj-1", USER);

    // Failing here would make a retry unsafe, and the caller's intent is already satisfied.
    expect(() => store.followDocument(doc.id, "proj-1", USER)).not.toThrow();
    expect(store.getDocument(doc.id).followedByProjectId).toBe("proj-1");
  });

  test("follow and unfollow are refused for an agent and permitted for a user", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);

    expect(() => store.followDocument(doc.id, "proj-1", AGENT)).toThrow(/Only a user may follow/);
    expect(store.getDocument(doc.id).followedByProjectId).toBeUndefined();

    store.followDocument(doc.id, "proj-1", USER);

    // An agent that could unfollow could detach itself from its own brief.
    let error: any;
    try {
      store.unfollowDocument(doc.id, AGENT);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("PERMISSION_DENIED");
    // A refusal that does not say what to do instead produces an agent that retries the same call.
    expect(error.message).toContain("submit a suggestion");
    expect(store.getDocument(doc.id).followedByProjectId).toBe("proj-1");

    const unfollowed = store.unfollowDocument(doc.id, USER);
    expect(unfollowed.followedByProjectId).toBeUndefined();
  });

  test("an unfollowed document can be followed by a different project", () => {
    const doc = store.createDocument({ title: "Brief" }, USER);
    store.followDocument(doc.id, "proj-1", USER);
    store.unfollowDocument(doc.id, USER);

    expect(store.followDocument(doc.id, "proj-2", USER).followedByProjectId).toBe("proj-2");
  });
});

// ---- DD-003 -------------------------------------------------------------------------------

describe("DD-003: a project may follow many documents", () => {
  test("one project follows three documents, and the list is derived by scan", () => {
    const a = store.createDocument({ title: "Brief A" }, USER);
    const b = store.createDocument({ title: "Brief B" }, USER);
    const c = store.createDocument({ title: "Brief C" }, USER);
    const other = store.createDocument({ title: "Someone else's" }, USER);

    for (const d of [a, b, c]) store.followDocument(d.id, "proj-1", USER);
    store.followDocument(other.id, "proj-2", USER);

    const followed = store.listDocumentsForProject("proj-1");
    expect(followed.map((d) => d.title)).toEqual(["Brief A", "Brief B", "Brief C"]);
    expect(store.listDocumentsForProject("proj-2").map((d) => d.title)).toEqual(["Someone else's"]);

    // Derived, never stored: nothing on disk holds a list of documents. A stored list is a second
    // record of one fact, and two records of one fact disagree eventually.
    for (const file of readdirSync(join(dir, "design-docs"))) {
      const raw = readFileSync(join(dir, "design-docs", file), "utf8");
      expect(raw).not.toContain("documentIds");
      expect(JSON.parse(raw).documents).toBeUndefined();
    }
  });

  test("documents created in the same millisecond still list in creation order", () => {
    // The regression this guards: `createdAt` has millisecond resolution, so a seeded project or an
    // import creates several documents on one tick. With `createdAt` as the only sort key they tie,
    // and the order falls back to readdirSync — filesystem order, which differs between machines.
    // 40 crosses the base-36 digit boundary at 36, which an unpadded counter tiebreak gets wrong.
    const titles = Array.from({ length: 40 }, (_, i) => `Brief ${String(i).padStart(2, "0")}`);
    const made = titles.map((title) => store.createDocument({ title }, USER));
    for (const d of made) store.followDocument(d.id, "proj-1", USER);

    const distinctTimestamps = new Set(made.map((d) => d.createdAt)).size;
    expect(distinctTimestamps, "the test is meaningless unless creation times actually tie").toBeLessThan(
      titles.length,
    );

    expect(store.listDocuments().map((d) => d.title)).toEqual(titles);
    expect(store.listDocumentsForProject("proj-1").map((d) => d.title)).toEqual(titles);
  });

  test("the project-deleted sweep unfollows all three and deletes none of them", () => {
    const docs = ["A", "B", "C"].map((t) => store.createDocument({ title: `Brief ${t}` }, USER));
    const keep = store.createDocument({ title: "Other project's" }, USER);
    for (const d of docs) store.followDocument(d.id, "proj-1", USER);
    store.followDocument(keep.id, "proj-2", USER);

    const swept = store.unfollowProject("proj-1");

    expect(swept).toHaveLength(3);
    expect(store.listDocumentsForProject("proj-1")).toEqual([]);
    // A design document outlives its project: the brief a user spent an hour writing survives the
    // deletion of the project that failed.
    expect(store.listDocuments()).toHaveLength(4);
    for (const d of docs) {
      const still = store.getDocument(d.id);
      expect(still.title).toBe(d.title);
      expect(still.followedByProjectId).toBeUndefined();
    }
    // Another project's documents are untouched by the sweep.
    expect(store.getDocument(keep.id).followedByProjectId).toBe("proj-2");
  });

  test("a swept document is still readable, keeps its sections, and can be re-followed", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research", body: "prospect material" }] },
      USER,
    );
    const anchor = doc.sections[0].anchor;
    store.followDocument(doc.id, "proj-1", USER);
    store.writeSection(doc.id, anchor, { body: "prospect material v2", expectedVersion: 1 }, USER);

    store.unfollowProject("proj-1");

    const after = store.getDocument(doc.id);
    expect(after.sections[0].anchor).toBe(anchor);
    expect(after.sections[0].body).toBe("prospect material v2");
    expect(after.sections[0].versions.map((v) => v.version)).toEqual([1, 2]);

    expect(store.followDocument(doc.id, "proj-9", USER).followedByProjectId).toBe("proj-9");
  });
});

// ---- DD-006 -------------------------------------------------------------------------------

describe("DD-006: section anchors are minted and survive a retitle", () => {
  test("an anchor is minted at creation and is not derived from the title", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research" }, { title: "Research" }] },
      USER,
    );
    const [a, b] = doc.sections;

    expect(a.anchor).toMatch(/^sec_/);
    expect(a.anchor.toLowerCase()).not.toContain("research");
    // Two sections with the identical title get distinct anchors. A slugged anchor would collide
    // here, and the second section would silently inherit the first's presence and suggestions.
    expect(a.anchor).not.toBe(b.anchor);
  });

  test("renaming a heading leaves the anchor, the areaId and the version history intact", () => {
    const doc = store.createDocument({ title: "Brief", sections: [{ title: "Research", body: "v1" }] }, USER);
    const anchor = doc.sections[0].anchor;
    store.assignSectionArea(doc.id, anchor, "area-research", USER);
    store.writeSection(doc.id, anchor, { body: "v2", expectedVersion: 1 }, USER);

    const renamed = store.retitleSection(doc.id, anchor, "Market research", USER);
    const section = renamed.sections[0];

    expect(section.title).toBe("Market research");
    expect(section.anchor, "a heading-derived anchor detaches here, silently").toBe(anchor);
    expect(section.areaId).toBe("area-research");
    expect(section.currentVersion).toBe(2);
    expect(section.versions.map((v) => v.version)).toEqual([1, 2]);
    // A retitle is not a body edit: the text of record did not change, so no version was appended.
    expect(section.body).toBe("v2");
  });

  test("reordering bumps manifestVersion and changes no anchor", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research" }, { title: "Slides" }, { title: "Video" }] },
      USER,
    );
    const anchors = doc.sections.map((s) => s.anchor);
    const before = doc.manifestVersion;

    const reordered = store.reorderSections(doc.id, [anchors[2], anchors[0], anchors[1]], USER);

    expect(reordered.manifestVersion).toBe(before + 1);
    expect(reordered.sections.map((s) => s.anchor)).toEqual([anchors[2], anchors[0], anchors[1]]);
    expect(reordered.sections.map((s) => s.title)).toEqual(["Video", "Research", "Slides"]);
    expect(reordered.sections.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(new Set(reordered.sections.map((s) => s.anchor))).toEqual(new Set(anchors));
  });

  test("an area assignment survives both a retitle and a reorder", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research" }, { title: "Slides" }] },
      USER,
    );
    const [research, slides] = doc.sections.map((s) => s.anchor);
    store.assignSectionArea(doc.id, research, "area-research", USER);
    store.assignSectionArea(doc.id, slides, "area-slides", USER);

    store.retitleSection(doc.id, research, "Market research", USER);
    const after = store.reorderSections(doc.id, [slides, research], USER);

    const byAnchor = Object.fromEntries(after.sections.map((s) => [s.anchor, s.areaId]));
    expect(byAnchor[research]).toBe("area-research");
    expect(byAnchor[slides]).toBe("area-slides");
  });

  test("adding a section bumps manifestVersion and can be positioned after another", () => {
    const doc = store.createDocument({ title: "Brief", sections: [{ title: "Research" }, { title: "Video" }] }, USER);
    const [research, video] = doc.sections.map((s) => s.anchor);

    const after = store.addSection(doc.id, { title: "Slides", afterAnchor: research }, USER);

    expect(after.manifestVersion).toBe(doc.manifestVersion + 1);
    expect(after.sections.map((s) => s.title)).toEqual(["Research", "Slides", "Video"]);
    expect(after.sections[0].anchor).toBe(research);
    expect(after.sections[2].anchor).toBe(video);
  });

  test("a reorder that drops or duplicates a section is refused", () => {
    const doc = store.createDocument({ title: "Brief", sections: [{ title: "A" }, { title: "B" }] }, USER);
    const [a, b] = doc.sections.map((s) => s.anchor);

    expect(() => store.reorderSections(doc.id, [a], USER)).toThrow(/every section exactly once/);
    expect(() => store.reorderSections(doc.id, [a, a], USER)).toThrow(/every section exactly once/);
    // The refusal leaves the document alone.
    expect(store.getDocument(doc.id).sections.map((s) => s.anchor)).toEqual([a, b]);
    expect(store.getDocument(doc.id).manifestVersion).toBe(doc.manifestVersion);
  });
});
