import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { designDocRoutes } from "./designDocs";

/**
 * Editing a design document — `PUT /api/design-docs/:docId`.
 *
 * The document surface edits one paragraph at a time and sends the whole text back with only that
 * paragraph's lines rewritten, so the two properties worth asserting on this endpoint are:
 *
 *   1. what comes back is the document REPARSED — the title is the first heading, the declaration
 *      is the server's parse of the new text — because the rail and the inspector render from the
 *      response and would otherwise show the previous document's title over the new one's words;
 *   2. a save that would overwrite somebody else's is refused rather than silently winning, and the
 *      refusal carries the text that is actually on disk so the client can say what happened.
 *
 * The second matters more than it looks: several agents and one human in one document is this
 * product's normal state, and "last write wins, silently" is how an hour of writing disappears.
 */

let docsDir: string;
let app: Hono;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json };
}

const ORIGINAL = ["# Chair launch", "", "The opening claim.", "", "```project", "name: Aeris", "category: slides", "```"].join("\n");

beforeEach(() => {
  docsDir = mkdtempSync(join(tmpdir(), "openui-docedit-"));
  process.env.OPENUI_DESIGN_DOCS_DIR = docsDir;
  writeFileSync(join(docsDir, "chair.md"), ORIGINAL, "utf8");
  app = new Hono();
  app.route("/api/design-docs", designDocRoutes);
});

afterEach(() => {
  delete process.env.OPENUI_DESIGN_DOCS_DIR;
  rmSync(docsDir, { recursive: true, force: true });
});

describe("saving an edit", () => {
  test("the text reaches the file exactly as sent", async () => {
    const next = ORIGINAL.replace("The opening claim.", "A shorter claim.");
    const res = await call("PUT", "/api/design-docs/chair", { text: next, expectedText: ORIGINAL });
    expect(res.status).toBe(200);
    expect(readFileSync(join(docsDir, "chair.md"), "utf8")).toBe(next);
  });

  test("the response is the document reparsed, not the one that was open", async () => {
    const next = ORIGINAL.replace("# Chair launch", "# Chair launch, revised").replace(
      "category: slides",
      "category: documents",
    );
    const res = await call("PUT", "/api/design-docs/chair", { text: next, expectedText: ORIGINAL });
    expect(res.json.title).toBe("Chair launch, revised");
    expect(res.json.declaration.ok).toBe(true);
    expect(res.json.declaration.declaration.category).toBe("documents");
  });

  test("a declaration the edit broke comes back refused, with its line", async () => {
    // The user is fixing the block in place; the errors are how they know what to fix.
    const next = ORIGINAL.replace("category: slides", "bugdet: 25");
    const res = await call("PUT", "/api/design-docs/chair", { text: next, expectedText: ORIGINAL });
    expect(res.status).toBe(200);
    expect(res.json.declaration.ok).toBe(false);
    expect(res.json.declaration.errors.length).toBeGreaterThan(0);
    expect(res.json.declaration.errors[0].line).toBeGreaterThan(0);
  });

  test("no expectedText still saves — a first save has no baseline to compare", async () => {
    const res = await call("PUT", "/api/design-docs/chair", { text: "# Only this" });
    expect(res.status).toBe(200);
    expect(readFileSync(join(docsDir, "chair.md"), "utf8")).toBe("# Only this");
  });
});

describe("a save that would clobber somebody else's", () => {
  test("is refused, names what happened, and leaves the file alone", async () => {
    writeFileSync(join(docsDir, "chair.md"), "# Changed by somebody else", "utf8");
    const res = await call("PUT", "/api/design-docs/chair", {
      text: "# My version",
      expectedText: ORIGINAL,
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("DOCUMENT_CHANGED");
    // The client cannot explain a conflict it cannot see, so the current text comes back with it.
    expect(res.json.currentText).toBe("# Changed by somebody else");
    expect(readFileSync(join(docsDir, "chair.md"), "utf8")).toBe("# Changed by somebody else");
  });
});

describe("what it refuses outright", () => {
  test("a document that does not exist is 404, and no file is created", async () => {
    const res = await call("PUT", "/api/design-docs/nope", { text: "# New" });
    expect(res.status).toBe(404);
    expect(existsSync(join(docsDir, "nope.md"))).toBe(false);
  });

  test("a body with no text is 400, and the document is untouched", async () => {
    const res = await call("PUT", "/api/design-docs/chair", { title: "renamed" });
    expect(res.status).toBe(400);
    expect(readFileSync(join(docsDir, "chair.md"), "utf8")).toBe(ORIGINAL);
  });

  test("an id that walks out of the documents directory cannot reach a file", async () => {
    // `join(docsDir, `${id}.md`)` with a traversing id resolves outside the directory. The route
    // must not write there — and today it cannot, because such a path does not exist and the
    // existence check runs first. Asserted so that stays true if the check ever moves.
    const before = readdirSync(docsDir);
    const res = await call("PUT", "/api/design-docs/..%2F..%2Fescaped", { text: "# Escaped" });
    expect(res.status).toBe(404);
    expect(readdirSync(docsDir)).toEqual(before);
  });
});
