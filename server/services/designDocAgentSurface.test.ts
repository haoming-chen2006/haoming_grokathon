import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  DESIGN_DOC_FORBIDDEN_TOOLS,
  DESIGN_DOC_MCP_TOOLS,
  DesignDocStore,
  numberedDocument,
} from "./designDoc";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user-1" };
const AGENT: Actor = { kind: "agent", id: "agent-research" };
/** The legacy scoped grant on Actor (server/types/project.ts:45-46). §3.9 says it must not help. */
const GRANTED_AGENT: Actor = { kind: "agent", id: "agent-research", canWriteDocument: true };

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

let store: DesignDocStore;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "openui-dd-agent-"));
  roots.push(dir);
  store = new DesignDocStore(join(dir, "design-docs"));
});

function brief() {
  const doc = store.createDocument(
    { title: "Brief", sections: [{ title: "Research", body: "the user's own words" }, { title: "Slides", body: "b" }] },
    USER,
  );
  return { doc, research: doc.sections[0].anchor };
}

// ---- DD-009 -------------------------------------------------------------------------------

describe("DD-009: an agent cannot write a design document, and suggests instead", () => {
  test("a direct write attempt by an agent is refused", () => {
    const { doc, research } = brief();

    let error: any;
    try {
      store.writeSection(doc.id, research, { body: "REWRITTEN BY THE AGENT", expectedVersion: 1 }, AGENT);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe("PERMISSION_DENIED");
    // The user's words are untouched. An agent that can rewrite the brief can rewrite the brief to
    // match what it already did.
    const section = store.getDocument(doc.id).sections[0];
    expect(section.body).toBe("the user's own words");
    expect(section.currentVersion).toBe(1);
    expect(section.versions).toHaveLength(1);
  });

  test("the refusal names the suggestion path, with the ids to use", () => {
    // A refusal that does not say what to do instead produces an agent that retries the same call
    // until its budget is gone.
    const { doc, research } = brief();

    let message = "";
    try {
      store.writeSection(doc.id, research, { body: "x", expectedVersion: 1 }, AGENT);
    } catch (e: any) {
      message = e.message;
    }

    expect(message).toContain("submit_design_suggestion");
    expect(message).toContain(doc.id);
    expect(message).toContain(research);
    expect(message).toContain("A user reviews it");
  });

  test("a scoped write grant does not help — not even inside the agent's own area", () => {
    // §3.9: "Not through a tool, not inside their own area, not with a scoped grant."
    const { doc, research } = brief();
    store.assignSectionArea(doc.id, research, "area-research", USER);

    expect(() =>
      store.writeSection(doc.id, research, { body: "granted rewrite", expectedVersion: 1 }, GRANTED_AGENT),
    ).toThrow(/Agents cannot write a design document/);
    expect(store.getDocument(doc.id).sections[0].body).toBe("the user's own words");
  });

  test("every structural mutation is closed to agents too", () => {
    const { doc, research } = brief();

    expect(() => store.followDocument(doc.id, "proj-1", AGENT)).toThrow(/Only a user may follow/);
    expect(() => store.unfollowDocument(doc.id, AGENT)).toThrow(/Only a user may unfollow/);
    expect(() => store.writeSection(doc.id, research, { body: "x", expectedVersion: 1 }, AGENT)).toThrow();
  });

  test("no design-document tool writes, and the forbidden names are absent from the source", () => {
    // Asserting the surface rather than trusting a reading of the registration code.
    expect([...DESIGN_DOC_MCP_TOOLS]).toEqual(["read_design_document", "list_design_documents"]);

    const src = readFileSync(join(import.meta.dir, "designDoc.ts"), "utf8");
    for (const forbidden of DESIGN_DOC_FORBIDDEN_TOOLS) {
      // The name may appear only in the forbidden list itself, never as a registered tool.
      const registered = new RegExp(`registerTool\\(\\s*["'\`]${forbidden}`).test(src);
      expect(registered, `${forbidden} must never be registered as a tool`).toBe(false);
    }
  });

  test("the tool surface is read-only by name as well as by behaviour", () => {
    for (const tool of DESIGN_DOC_MCP_TOOLS) {
      expect(tool).toMatch(/^(read|list|report)_/);
    }
  });
});

describe("DD-009 / §3.8.2: a document an agent reads carries line numbers", () => {
  test("read output is numbered, and the numbers are the rendered document's", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research", body: "one\ntwo" }, { title: "Slides", body: "deck" }] },
      USER,
    );

    const read = numberedDocument(store.getDocument(doc.id));

    // ## Research(1) one(2) two(3) blank(4) ## Slides(5) deck(6)
    expect(read.totalLines).toBe(6);
    expect(read.fromLine).toBe(1);
    expect(read.toLine).toBe(6);
    expect(read.text.split("\n")).toEqual([
      "1  ## Research",
      "2  one",
      "3  two",
      "4  ",
      "5  ## Slides",
      "6  deck",
    ]);
    expect(read.title).toBe("Brief");
  });

  test("a line range returns only those lines, still numbered absolutely", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "Research", body: "one\ntwo" }, { title: "Slides", body: "deck" }] },
      USER,
    );

    const read = numberedDocument(store.getDocument(doc.id), { fromLine: 5, toLine: 6 });

    // Absolute, not relative to the slice: an agent that renumbers from 1 reports ranges that
    // point at the wrong text, and the highlight lands on the wrong paragraph.
    expect(read.text.split("\n")).toEqual(["5  ## Slides", "6  deck"]);
    expect(read.fromLine).toBe(5);
    expect(read.toLine).toBe(6);
    expect(read.totalLines).toBe(6);
  });

  test("out-of-range and inverted requests are clamped, never thrown", () => {
    const doc = store.createDocument({ title: "Brief", sections: [{ title: "A", body: "x" }] }, USER);
    const d = store.getDocument(doc.id);

    expect(numberedDocument(d, { fromLine: 0 }).fromLine).toBe(1);
    expect(numberedDocument(d, { toLine: 9999 }).toLine).toBe(2);
    expect(numberedDocument(d, { fromLine: 5, toLine: 2 }).text).toBe("");
    expect(() => numberedDocument(d, { fromLine: -10, toLine: -1 })).not.toThrow();
  });

  test("line numbers stay aligned as the document grows past nine lines", () => {
    const doc = store.createDocument(
      { title: "Brief", sections: [{ title: "A", body: Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n") }] },
      USER,
    );

    const lines = numberedDocument(store.getDocument(doc.id)).text.split("\n");
    // Right-aligned so the text column does not jitter at the 9→10 boundary.
    expect(lines[0]).toBe(" 1  ## A");
    expect(lines[9]).toBe("10  line 8");
    expect(lines[9].indexOf("line")).toBe(lines[0].indexOf("##"));
  });
});
