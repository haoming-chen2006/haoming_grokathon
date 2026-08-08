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
