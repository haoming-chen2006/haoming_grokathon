import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  AREA_COLOR_TOKENS,
  AREA_GLYPHS,
  WorkAreaStore,
  areaStatusPresentation,
  deriveAreaStatus,
  getWorkAreaStore,
} from "./workArea";

/**
 * AGENTS-001 — a work area is a record.
 *
 * The three clauses: the record carries its seven identifying fields; `rootPath` is stored
 * canonicalised so no later comparison has to remember to canonicalise it; status is derived and
 * never stored.
 */

let dataDir: string;
let root: string;

function makeStore(): WorkAreaStore {
  return new WorkAreaStore({ persistDir: dataDir });
}

function area(store: WorkAreaStore, extra: Record<string, unknown> = {}) {
  return store.create({
    projectId: "p1",
    name: "Slides",
    briefSectionAnchor: "§3 Deck",
    milestoneId: "m3",
    rootPath: root,
    ...extra,
  } as any);
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-workarea-"));
  root = mkdtempSync(join(tmpdir(), "openui-area-root-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("the record", () => {
  test("carries an id, name, colour token, glyph, brief anchor, milestone id and root path", () => {
    const a = area(makeStore());
    expect(a.id).toMatch(/^area_/);
    expect(a.projectId).toBe("p1");
    expect(a.name).toBe("Slides");
    expect(AREA_COLOR_TOKENS).toContain(a.colorToken);
    expect(AREA_GLYPHS).toContain(a.glyph);
    expect(a.briefSectionAnchor).toBe("§3 Deck");
    expect(a.milestoneId).toBe("m3");
    expect(a.rootPath).toBe(realpathSync(root));
    expect(a.createdAt).toBeTruthy();
    expect(a.updatedAt).toBeTruthy();
  });

  test("names the field that was missing rather than refusing anonymously", () => {
    const store = makeStore();
    expect(() => area(store, { milestoneId: "" })).toThrow(/milestoneId is required/);
    expect(() => area(store, { briefSectionAnchor: undefined })).toThrow(/briefSectionAnchor is required/);
    expect(() => area(store, { rootPath: "  " })).toThrow(/rootPath is required/);
  });

  test("accents and glyphs are assigned in the documented order, red and green last and apart", () => {
    const store = makeStore();
    const tokens = AREA_COLOR_TOKENS.map((_, i) => area(store, { name: `A${i}`, milestoneId: `m${i}` }).colorToken);
    expect(tokens).toEqual([...AREA_COLOR_TOKENS]);
    expect(Math.abs(tokens.indexOf("red") - tokens.indexOf("green"))).toBeGreaterThan(1);

    // The ninth area wraps rather than running out of accents.
    expect(area(store, { name: "ninth", milestoneId: "m99" }).colorToken).toBe(AREA_COLOR_TOKENS[0]);
  });

  test("two areas in one project may not claim the same milestone", () => {
    const store = makeStore();
    area(store, { name: "Slides", milestoneId: "m3" });
    expect(() => area(store, { name: "Video", milestoneId: "m3" })).toThrow(/already the work of area/);
    // Another project may use the same milestone id — the clash is scoped to a project.
    expect(() => area(store, { projectId: "p2", name: "Video", milestoneId: "m3" })).not.toThrow();
  });

  test("an agent may not be hired into a second area", () => {
    const store = makeStore();
    area(store, { name: "Slides", milestoneId: "m3", ownerAgentId: "agent_1" });
    expect(() => area(store, { name: "Video", milestoneId: "m4", ownerAgentId: "agent_1" })).toThrow(
      /already owns area/,
    );
    expect(store.forAgent("agent_1")?.name).toBe("Slides");
    expect(store.forAgent("agent_nobody")).toBeNull();
  });
});

describe("rootPath is stored canonicalised", () => {
  test("a symlinked root is stored as its real path", () => {
    const link = join(dataDir, "link-to-root");
    symlinkSync(root, link);
    const a = area(makeStore(), { rootPath: link });

    // The stored value is the real directory, so no later comparison can be fooled by the name it
    // was created under.
    expect(a.rootPath).toBe(realpathSync(root));
    expect(a.rootPath).not.toBe(link);
  });

  test("a root that does not exist yet keeps its deepest existing ancestor canonical", () => {
    const a = area(makeStore(), { rootPath: join(root, "not", "created", "yet") });
    expect(a.rootPath).toBe(join(realpathSync(root), "not", "created", "yet"));
  });
});

describe("status is derived, never stored", () => {
  test("no record on disk carries a status", () => {
    const store = makeStore();
    area(store, { ownerAgentId: "agent_1" });
    const persisted = JSON.parse(readFileSync(join(dataDir, "areas.json"), "utf-8"));
    expect(persisted.areas).toHaveLength(1);
    expect(Object.keys(persisted.areas[0])).not.toContain("status");
  });

  test("a status supplied at creation is discarded, not stored", () => {
    const store = makeStore();
    const a = area(store, { status: "complete" } as Record<string, unknown>);
    expect(a).not.toHaveProperty("status");
    const persisted = JSON.parse(readFileSync(join(dataDir, "areas.json"), "utf-8"));
    expect(persisted.areas[0]).not.toHaveProperty("status");
  });

  test("an area nobody is hired into is unstaffed, not idle", () => {
    expect(deriveAreaStatus({ tasksTotal: 4, tasksComplete: 0 })).toBe("unstaffed");
    // "idle" claims a session exists. Nothing exists here.
    expect(areaStatusPresentation("unstaffed").label).toBe("Nobody assigned");
  });

  test("the owner's status carries through while work remains", () => {
    expect(deriveAreaStatus({ ownerStatus: "working", tasksTotal: 6, tasksComplete: 4 })).toBe("working");
    expect(deriveAreaStatus({ ownerStatus: "waiting", tasksTotal: 6, tasksComplete: 4 })).toBe("waiting");
    expect(deriveAreaStatus({ ownerStatus: "idle", tasksTotal: 6, tasksComplete: 0 })).toBe("idle");
  });

  test("a failure is never masked by progress", () => {
    expect(deriveAreaStatus({ ownerStatus: "failed", tasksTotal: 3, tasksComplete: 3 })).toBe("failed");
  });

  test("work awaiting acceptance is not complete", () => {
    expect(deriveAreaStatus({ ownerStatus: "needs_review", tasksTotal: 3, tasksComplete: 3 })).toBe("needs_review");
  });

  test("the milestone finishing is what completes the area", () => {
    expect(deriveAreaStatus({ ownerStatus: "working", tasksTotal: 3, tasksComplete: 3 })).toBe("complete");
    // An empty milestone is not a finished one; zero of zero must not read as done.
    expect(deriveAreaStatus({ ownerStatus: "working", tasksTotal: 0, tasksComplete: 0 })).toBe("working");
  });

  test("an owner reporting complete with tasks left does not complete the area", () => {
    // The agent finished its own task. The section of the brief is not done, and saying so would
    // be a fabricated status.
    expect(deriveAreaStatus({ ownerStatus: "complete", tasksTotal: 5, tasksComplete: 2 })).toBe("waiting");
  });

  test("every derivable status has a text label, so colour is never the only signal", () => {
    const statuses = ["unstaffed", "working", "waiting", "needs_review", "complete", "idle", "failed"] as const;
    for (const status of statuses) {
      const presentation = areaStatusPresentation(status);
      expect(presentation.label.trim().length).toBeGreaterThan(0);
      expect(presentation.status).toBe(status);
    }
  });
});

describe("persistence", () => {
  test("areas survive a restart of the store", () => {
    const created = area(makeStore(), { ownerAgentId: "agent_1", budgetUsd: 5 });
    const reopened = makeStore();
    const [restored] = reopened.list("p1");
    expect(restored).toEqual(created);
    expect(reopened.get(created.id).budgetUsd).toBe(5);
    expect(() => reopened.get("area_missing")).toThrow(/not found/);
  });

  test("list filters by project, and the process-wide store follows OPENUI_DATA_DIR", () => {
    const store = makeStore();
    area(store, { projectId: "p1", milestoneId: "m1" });
    area(store, { projectId: "p2", milestoneId: "m2" });
    expect(store.list("p1")).toHaveLength(1);
    expect(store.list()).toHaveLength(2);

    process.env.OPENUI_DATA_DIR = dataDir;
    expect(getWorkAreaStore().list("p1")).toHaveLength(1);
  });
});
