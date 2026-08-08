import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DesignDocStore, sweepStaleSuggestions, type SectionTargetedSuggestion } from "./designDoc";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user-1" };
const OTHER: Actor = { kind: "user", id: "user-2" };
const AGENT: Actor = { kind: "agent", id: "agent-research" };

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

let store: DesignDocStore;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "openui-dd-versioning-"));
  roots.push(dir);
  store = new DesignDocStore(join(dir, "design-docs"));
});

function twoSections() {
  const doc = store.createDocument(
    { title: "Brief", sections: [{ title: "Research", body: "a" }, { title: "Slides", body: "b" }] },
    USER,
  );
  return { doc, research: doc.sections[0].anchor, slides: doc.sections[1].anchor };
}

// ---- DD-007 -------------------------------------------------------------------------------

describe("DD-007: section writes are versioned, conflict-detected and independent", () => {
  test("each write appends a version carrying authorId and changeSummary", () => {
    const { doc, research } = twoSections();

    store.writeSection(doc.id, research, { body: "a2", expectedVersion: 1, changeSummary: "first" }, USER);
    store.writeSection(doc.id, research, { body: "a3", expectedVersion: 2, changeSummary: "second" }, OTHER);

    const section = store.getDocument(doc.id).sections[0];
    expect(section.currentVersion).toBe(3);
    expect(section.versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(section.versions.map((v) => v.authorId)).toEqual(["user-1", "user-1", "user-2"]);
    expect(section.versions.map((v) => v.changeSummary)).toEqual([undefined, "first", "second"]);
    // Append-only: version 1 still holds the text it held.
    expect(section.versions[0].body).toBe("a");
    expect(section.versions[2].body).toBe("a3");
  });

  test("a stale expectedVersion throws VersionConflictError carrying both versions", () => {
    const { doc, research } = twoSections();
    store.writeSection(doc.id, research, { body: "a2", expectedVersion: 1 }, USER);

    let error: any;
    try {
      // A second writer still holding version 1.
      store.writeSection(doc.id, research, { body: "conflicting", expectedVersion: 1 }, OTHER);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.name).toBe("VersionConflictError");
    expect(error.code).toBe("VERSION_CONFLICT");
    // Both numbers, because "conflict" alone renders into nothing a user can act on.
    expect(error.baseVersion).toBe(1);
    expect(error.currentVersion).toBe(2);
    expect(error.message).toContain("1");
    expect(error.message).toContain("2");

    // The refused write left nothing behind.
    const section = store.getDocument(doc.id).sections[0];
    expect(section.currentVersion).toBe(2);
    expect(section.body).toBe("a2");
    expect(section.versions).toHaveLength(2);
  });

  test("two different sections can be written concurrently without either conflicting", () => {
    const { doc, research, slides } = twoSections();

    // Both writers read version 1 of their own section, then both write. Versioning per section is
    // what makes this two independent facts rather than one contested one.
    store.writeSection(doc.id, research, { body: "research v2", expectedVersion: 1 }, USER);
    store.writeSection(doc.id, slides, { body: "slides v2", expectedVersion: 1 }, OTHER);

    const after = store.getDocument(doc.id);
    expect(after.sections[0].body).toBe("research v2");
    expect(after.sections[1].body).toBe("slides v2");
    expect(after.sections.map((s) => s.currentVersion)).toEqual([2, 2]);
    // Neither write bumped the other's version, and the structure did not change.
    expect(after.manifestVersion).toBe(doc.manifestVersion);
  });

  test("interleaved writes to two sections do not lose an update", () => {
    // The invariant the synchronous store exists to protect, exercised rather than asserted.
    const { doc, research, slides } = twoSections();

    for (let i = 0; i < 25; i++) {
      store.writeSection(doc.id, research, { body: `r${i}`, expectedVersion: i + 1 }, USER);
      store.writeSection(doc.id, slides, { body: `s${i}`, expectedVersion: i + 1 }, OTHER);
    }

    const after = store.getDocument(doc.id);
    expect(after.sections[0].versions).toHaveLength(26);
    expect(after.sections[1].versions).toHaveLength(26);
    expect(after.sections[0].body).toBe("r24");
    expect(after.sections[1].body).toBe("s24");
  });
});

describe("DD-007: the stale sweep is scoped to the section that was written", () => {
  function pending(overrides: Partial<SectionTargetedSuggestion> = {}): SectionTargetedSuggestion {
    return { state: "pending", baseVersion: 1, targetDocId: "doc-1", targetSectionAnchor: "sec-a", ...overrides };
  }

  test("a suggestion pending against section A does not go stale when section B is written", () => {
    const againstA = pending({ targetSectionAnchor: "sec-a" });
    const againstB = pending({ targetSectionAnchor: "sec-b" });

    const swept = sweepStaleSuggestions([againstA, againstB], {
      docId: "doc-1",
      sectionAnchor: "sec-b",
      newVersion: 2,
    });

    // This is the whole reason to version per section: today's document-wide sweep
    // (projectStore.ts:324-329) would have marked BOTH stale.
    expect(againstA.state).toBe("pending");
    expect(againstB.state).toBe("stale");
    expect(swept).toEqual([againstB]);
  });

  test("a suggestion against the written section does go stale", () => {
    const s = pending({ baseVersion: 1 });
    sweepStaleSuggestions([s], { docId: "doc-1", sectionAnchor: "sec-a", newVersion: 2 });
    expect(s.state).toBe("stale");
  });

  test("a suggestion written against the new version or later is untouched", () => {
    const current = pending({ baseVersion: 2 });
    const ahead = pending({ baseVersion: 3 });
    sweepStaleSuggestions([current, ahead], { docId: "doc-1", sectionAnchor: "sec-a", newVersion: 2 });
    expect(current.state).toBe("pending");
    expect(ahead.state).toBe("pending");
  });

  test("another document's suggestions are untouched", () => {
    const otherDoc = pending({ targetDocId: "doc-2" });
    sweepStaleSuggestions([otherDoc], { docId: "doc-1", sectionAnchor: "sec-a", newVersion: 2 });
    expect(otherDoc.state).toBe("pending");
  });

  test("a resolved suggestion is never revived or re-marked", () => {
    for (const state of ["accepted", "rejected", "stale", "revision_requested"]) {
      const resolved = pending({ state });
      sweepStaleSuggestions([resolved], { docId: "doc-1", sectionAnchor: "sec-a", newVersion: 9 });
      expect(resolved.state).toBe(state);
    }
  });

  test("a whole-document suggestion with no target is left to the legacy path", () => {
    const legacy: SectionTargetedSuggestion = { state: "pending", baseVersion: 1 };
    sweepStaleSuggestions([legacy], { docId: "doc-1", sectionAnchor: "sec-a", newVersion: 2 });
    expect(legacy.state).toBe("pending");
  });
});

// ---- DD-008 -------------------------------------------------------------------------------

// Fake credentials, matching server/services/secrets.ts patterns. None is real.
const FAKE_AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE".slice(0, 16);
const FAKE_GITHUB = "ghp_" + "0123456789abcdefghij";

describe("DD-008: a credential cannot be written into a design document", () => {
  test("a user write carrying a credential is refused and the section is unchanged", () => {
    const { doc, research } = twoSections();

    let error: any;
    try {
      store.writeSection(doc.id, research, { body: `deploy key ${FAKE_AWS_KEY}`, expectedVersion: 1 }, USER);
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe("SECRET_EXPOSURE");
    // The error names WHERE it was found, so the author knows which write to fix.
    expect(error.message).toContain('design document section "Research"');
    expect(error.message).toContain("aws-access-key");
    // Refused, not redacted: a silently-altered design document is its own problem.
    expect(error.message).toContain("Reference it from the environment instead");

    const section = store.getDocument(doc.id).sections[0];
    expect(section.currentVersion).toBe(1);
    expect(section.body).toBe("a");
    expect(section.versions).toHaveLength(1);
  });

  test("agent-authored text is scanned when it arrives, which is via an accepted suggestion", () => {
    // An agent cannot write a section at all (DD-009), so "agent-originated write" reaches the
    // store only as a user accepting the agent's proposed text. That accept carries
    // fromSuggestionId and is scanned on the same path — proven in the next test.
    // Here: the direct attempt is refused before any secret check runs, for permission.
    const { doc, research } = twoSections();

    expect(() =>
      store.writeSection(doc.id, research, { body: `token ${FAKE_GITHUB}`, expectedVersion: 1 }, AGENT),
    ).toThrow(/Agents cannot write a design document/);
    expect(store.getDocument(doc.id).sections[0].currentVersion).toBe(1);
  });

  test("an accepted suggestion carrying a credential is refused on the same path", () => {
    // Accepting a suggestion IS a section write carrying fromSuggestionId — there is no second
    // path, which is why there is no second place for the check to be forgotten.
    const { doc, research } = twoSections();

    let error: any;
    try {
      store.writeSection(
        doc.id,
        research,
        { body: `see ${FAKE_GITHUB}`, expectedVersion: 1, fromSuggestionId: "sug-1", changeSummary: "accepted" },
        USER,
      );
    } catch (e) {
      error = e;
    }

    expect(error.code).toBe("SECRET_EXPOSURE");
    expect(error.message).toContain("github-token");
    const section = store.getDocument(doc.id).sections[0];
    expect(section.currentVersion).toBe(1);
    expect(section.versions).toHaveLength(1);
  });

  test("a section created with a credential is refused, and the document is not created", () => {
    expect(() =>
      store.createDocument({ title: "Brief", sections: [{ title: "Keys", body: FAKE_AWS_KEY }] }, USER),
    ).toThrow(/Refusing to store a credential/);

    // No half-document: the refusal happens before anything is persisted.
    expect(store.listDocuments()).toEqual([]);
  });

  test("the version check runs before the secret check, so a stale secret write reports the conflict", () => {
    const { doc, research } = twoSections();
    store.writeSection(doc.id, research, { body: "a2", expectedVersion: 1 }, USER);

    // Stale version AND a credential. The version check runs first, so this reports the conflict —
    // asserted rather than assumed, because which error a user sees decides what they do next.
    let error: any;
    try {
      store.writeSection(doc.id, research, { body: FAKE_AWS_KEY, expectedVersion: 1 }, USER);
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(store.getDocument(doc.id).sections[0].body).toBe("a2");
  });

  test("ordinary prose that merely mentions keys is not refused", () => {
    // A false positive here blocks a user from writing their brief, which is worse than annoying:
    // the design document is where the work is declared.
    const { doc, research } = twoSections();
    const prose = "We will need an AWS access key and a GitHub token for the deploy step.";

    expect(() => store.writeSection(doc.id, research, { body: prose, expectedVersion: 1 }, USER)).not.toThrow();
    expect(store.getDocument(doc.id).sections[0].body).toBe(prose);
  });
});
