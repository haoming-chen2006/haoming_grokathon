import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DesignDocStore, parseDeclaration } from "./designDoc";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user-1" };

const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

let store: DesignDocStore;
beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "openui-declaration-"));
  roots.push(dir);
  store = new DesignDocStore(join(dir, "design-docs"));
});

const FENCE = "```";
function block(body: string): string {
  return `${FENCE}project\n${body}\n${FENCE}`;
}

// ---- DD-004 -------------------------------------------------------------------------------

describe("DD-004: the declaration block is parsed strictly or refused with a line number", () => {
  test("a valid block yields name, category and areas", () => {
    const result = parseDeclaration(
      block(
        [
          "name: Q3 Enterprise Deck",
          "category: slides",
          "budget: 25.00",
          "areas:",
          "  - Research: prospect and competitor material",
          "  - X: the @acme timeline",
          "  - Slides: deck assembly and imagery",
          "  - Video: narration and motion assets",
        ].join("\n"),
      ),
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.declaration!.name).toBe("Q3 Enterprise Deck");
    expect(result.declaration!.category).toBe("slides");
    expect(result.declaration!.budget).toBe(25);
    expect(result.declaration!.areas.map((a) => a.name)).toEqual(["Research", "X", "Slides", "Video"]);
    expect(result.declaration!.areas[0].description).toBe("prospect and competitor material");
    expect(result.declaration!.areas[1].line).toBe(7);
    expect(result.declaration!.blockStart).toBe(1);
    expect(result.declaration!.blockEnd).toBe(10);
  });

  test("an unknown key is an error naming its line, not an ignored line", () => {
    // The §3.4 case: a user who writes `bugdet: 25` and sees no error believes they set a budget.
    const result = parseDeclaration(block(["name: Deck", "category: slides", "bugdet: 25"].join("\n")));

    expect(result.ok).toBe(false);
    expect(result.declaration).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4);
    expect(result.errors[0].message).toContain("Unknown key `bugdet`");
    expect(result.errors[0].message).toContain("name, category, budget, areas");
  });

  test("a second project block is an error naming both lines", () => {
    const text = [block("name: A\ncategory: slides"), "", "some prose", "", block("name: B\ncategory: software")].join(
      "\n",
    );
    const result = parseDeclaration(text);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Both line numbers, so the user can find the one they forgot they wrote.
    expect(result.errors[0].message).toContain("line 1");
    expect(result.errors[0].message).toContain("line 8");
    expect(result.errors[0].line).toBe(8);
  });

  test("a category outside the five asset types is refused", () => {
    const result = parseDeclaration(block(["name: Deck", "category: powerpoint"].join("\n")));

    expect(result.ok).toBe(false);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].message).toContain("`category` must be one of");
    expect(result.errors[0].message).toContain("documents, slides, tables, workflows, software");
    expect(result.errors[0].message).toContain("`powerpoint`");
  });

  test("every one of the five categories is accepted", () => {
    for (const category of ["documents", "slides", "tables", "workflows", "software"]) {
      const result = parseDeclaration(block(`name: X\ncategory: ${category}`));
      expect(result.ok, `${category} was rejected`).toBe(true);
      expect(result.declaration!.category).toBe(category as any);
    }
  });

  test("name and category are required, and the error points at the block", () => {
    const result = parseDeclaration(block("budget: 10"));

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.message)).toEqual(["`name` is required.", "`category` is required."]);
    for (const error of result.errors) expect(error.line).toBe(1);
  });

  test("a document with no project block declares nothing, which is not an error", () => {
    const result = parseDeclaration("## Brief\n\nSome prose about a deck.\n");

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.declaration).toBeUndefined();
  });

  test("a project block is never inferred from prose", () => {
    // A loose pattern turns ordinary bullets into phantom areas, and phantom areas assemble a team
    // that spends money.
    const result = parseDeclaration(
      ["## Brief", "", "name: Q3 Enterprise Deck", "category: slides", "areas:", "  - Research: everything"].join("\n"),
    );

    expect(result.ok).toBe(true);
    expect(result.declaration, "prose outside a fence must never declare a project").toBeUndefined();
  });

  test("a project block inside another fenced block is documentation, not a declaration", () => {
    const text = ["````text", "```project", "name: Example", "category: slides", "```", "````"].join("\n");
    const result = parseDeclaration(text);

    expect(result.declaration).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  test("an unterminated fence is an error naming the line it opened on", () => {
    const result = parseDeclaration([`${FENCE}project`, "name: Deck", "category: slides"].join("\n"));

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(1);
    expect(result.errors[0].message).toContain("never closed");
  });

  test("budget must be a number, and `25 dollars` does not silently become 25", () => {
    const bad = parseDeclaration(block(["name: Deck", "category: slides", "budget: 25 dollars"].join("\n")));
    expect(bad.ok).toBe(false);
    expect(bad.errors[0].line).toBe(4);
    expect(bad.errors[0].message).toContain("must be a number");

    const negative = parseDeclaration(block(["name: Deck", "category: slides", "budget: -5"].join("\n")));
    expect(negative.ok).toBe(false);
    expect(negative.errors[0].message).toContain("cannot be negative");

    const absent = parseDeclaration(block(["name: Deck", "category: slides"].join("\n")));
    expect(absent.ok).toBe(true);
    expect(absent.declaration!.budget).toBeUndefined();
  });

  test("zero areas is legal — it means one implicit area covering the whole document", () => {
    const result = parseDeclaration(block(["name: Deck", "category: slides"].join("\n")));
    expect(result.ok).toBe(true);
    expect(result.declaration!.areas).toEqual([]);

    const emptyList = parseDeclaration(block(["name: Deck", "category: slides", "areas:"].join("\n")));
    expect(emptyList.ok).toBe(true);
    expect(emptyList.declaration!.areas).toEqual([]);
  });

  test("a duplicate key and a duplicate area are refused, each naming its line", () => {
    const dupKey = parseDeclaration(block(["name: A", "category: slides", "name: B"].join("\n")));
    expect(dupKey.ok).toBe(false);
    expect(dupKey.errors[0].line).toBe(4);
    expect(dupKey.errors[0].message).toContain("Duplicate key `name`");
    expect(dupKey.errors[0].message).toContain("line 2");

    const dupArea = parseDeclaration(
      block(["name: A", "category: slides", "areas:", "  - Research: one", "  - research: two"].join("\n")),
    );
    expect(dupArea.ok).toBe(false);
    expect(dupArea.errors[0].line).toBe(6);
    expect(dupArea.errors[0].message).toContain("Duplicate area");
  });

  test("an area without a description keeps its name", () => {
    const result = parseDeclaration(block(["name: A", "category: slides", "areas:", "  - Research"].join("\n")));
    expect(result.ok).toBe(true);
    expect(result.declaration!.areas).toEqual([{ name: "Research", line: 5 }]);
  });

  test("errors accumulate rather than stopping at the first", () => {
    const result = parseDeclaration(block(["name: A", "category: bogus", "bugdet: 3", "nonsense"].join("\n")));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    // Every error carries a line: an error without one, in a 200-line document, is a scavenger hunt.
    for (const error of result.errors) expect(Number.isInteger(error.line)).toBe(true);
  });

  test("the parser never throws, on any input", () => {
    const fuzz: string[] = [
      "",
      "\n",
      "\n\n\n",
      FENCE,
      `${FENCE}project`,
      `${FENCE}project\n`,
      `${FENCE}project\n${FENCE}`,
      `${FENCE}project\n:\n${FENCE}`,
      `${FENCE}project\n::::\n${FENCE}`,
      `${FENCE}project\nname:\n${FENCE}`,
      `${FENCE}project\n   - orphan\n${FENCE}`,
      `${FENCE}project\nareas:\n  -\n${FENCE}`,
      `${FENCE}project\nareas:\n  - : nothing\n${FENCE}`,
      `${FENCE}project\nbudget: NaN\n${FENCE}`,
      `${FENCE}project\nbudget: Infinity\n${FENCE}`,
      `${FENCE}project\nbudget: 1e10\n${FENCE}`,
      `${FENCE}project\nname: ${"x".repeat(10_000)}\n${FENCE}`,
      `${FENCE}PROJECT\nname: A\n${FENCE}`,
      `${FENCE}project extra\nname: A\n${FENCE}`,
      `${FENCE}${FENCE}${FENCE}`,
      "\u0000\u0001\u0002",
      "```project\n\u0000name: \ud800\n```",
      "🙂".repeat(500),
      `${FENCE}project\n${"areas:\n  - A: b\n".repeat(500)}${FENCE}`,
      Array.from({ length: 200 }, (_, i) => `${FENCE}project\nname: ${i}\ncategory: slides\n${FENCE}`).join("\n"),
    ];

    const thrown: Array<{ input: string; error: string }> = [];
    for (const input of fuzz) {
      try {
        const result = parseDeclaration(input);
        // Total means it also returns a well-formed result, not just "did not throw".
        expect(typeof result.ok).toBe("boolean");
        expect(Array.isArray(result.errors)).toBe(true);
        if (result.ok) expect(result.errors).toEqual([]);
        else expect(result.errors.length).toBeGreaterThan(0);
        for (const error of result.errors) {
          expect(Number.isInteger(error.line)).toBe(true);
          expect(error.line).toBeGreaterThan(0);
          expect(typeof error.message).toBe("string");
        }
      } catch (e: any) {
        thrown.push({ input: input.slice(0, 60), error: String(e?.message ?? e) });
      }
    }

    expect(thrown, "the parser must be total — it runs on every half-typed document").toEqual([]);
  });

  test("parsing is automatic through the store and creates nothing", () => {
    const doc = store.createDocument(
      {
        title: "Brief",
        sections: [
          { title: "Overview", body: "We need a deck." },
          { title: "Declaration", body: block(["name: Q3 Enterprise Deck", "category: slides"].join("\n")) },
        ],
      },
      USER,
    );

    const result = store.declarationFor(doc.id);
    expect(result.ok).toBe(true);
    expect(result.declaration!.name).toBe("Q3 Enterprise Deck");

    // Nothing was created: no project, no team, no money spent. Applying is a separate human click.
    expect(store.getDocument(doc.id).followedByProjectId).toBeUndefined();
  });

  test("declaration line numbers are the rendered document's line numbers", () => {
    const doc = store.createDocument(
      {
        title: "Brief",
        sections: [
          { title: "Overview", body: "line A\nline B" },
          { title: "Declaration", body: block(["name: Deck", "category: bogus"].join("\n")) },
        ],
      },
      USER,
    );

    // ## Overview(1) line A(2) line B(3) blank(4) ## Declaration(5) ```project(6) name(7) category(8)
    const result = store.declarationFor(doc.id);
    expect(result.ok).toBe(false);
    expect(result.errors[0].line, "the error must point at the line the user sees").toBe(8);
  });
});
