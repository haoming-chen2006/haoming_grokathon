import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { parseDeclaration, type DeclarationResult } from "../services/designDoc";

/**
 * HTTP surface for design documents — mounted at `/api/design-docs`.
 *
 * **Reads the documents from `demo/design-docs/` on disk, not from `DesignDocStore`.** That is a
 * deliberate, temporary shortcut and it is the honest one to take today: the store is built,
 * versioned and tested, but nothing writes to it yet and no composition root chooses its directory
 * (R-10). Three real documents exist on disk, all three parse, and the product could not open any
 * of them. Reading them is what makes the surface demonstrable this hour.
 *
 * What is real here and what is not:
 *   real   the documents, their text, their sections, and the declaration — parsed by the one
 *          server-side parser in services/designDoc.ts, the same code path a stored document uses
 *   not    persistence, versioning, section anchors, writes, and suggestions. This router is
 *          read-only on purpose; there is no endpoint here that pretends to save anything.
 *
 * When the store is wired, `listDocuments()` below is the only function that changes.
 */
export const designDocRoutes = new Hono();

/** Where the demo documents live. Overridable so a test or a real install can point elsewhere. */
function docsDir(): string {
  return process.env.OPENUI_DESIGN_DOCS_DIR ?? join(process.cwd(), "demo", "design-docs");
}

export interface DocSectionView {
  title: string;
  body: string;
  /** 1-based line in the rendered document where this section's heading sits. */
  firstLine: number;
}

export interface DesignDocView {
  id: string;
  title: string;
  /** The whole document, exactly as written. The client renders this, not a re-serialisation. */
  text: string;
  lineCount: number;
  sections: DocSectionView[];
  declaration: DeclarationResult;
  /**
   * The project that follows this document, or undefined.
   *
   * At most one, ever — that is the whole cardinality rule (§3.3). Undefined is the normal state
   * of a document nobody has turned into a project yet, and the page says so rather than hiding it.
   */
  followedByProjectId?: string;
}

/** Split on ATX headings, keeping the line each one starts at. */
function sectionsOf(text: string): DocSectionView[] {
  const lines = text.split("\n");
  const out: DocSectionView[] = [];
  let current: DocSectionView | undefined;

  lines.forEach((line, i) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (current) out.push(current);
      current = { title: heading[2].trim(), body: "", firstLine: i + 1 };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  });
  if (current) out.push(current);
  return out;
}

function readDocument(file: string): DesignDocView {
  const text = readFileSync(join(docsDir(), file), "utf8");
  const sections = sectionsOf(text);
  return {
    id: file.replace(/\.md$/, ""),
    // The first heading is the title; a document with no heading falls back to its filename rather
    // than to an invented one.
    title: sections[0]?.title ?? file.replace(/\.md$/, ""),
    text,
    lineCount: text.split("\n").length,
    sections,
    declaration: parseDeclaration(text),
  };
}

function listDocuments(): DesignDocView[] {
  const dir = docsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map(readDocument);
}

/** GET /api/design-docs — every document, with its declaration already parsed. */
designDocRoutes.get("/", (c) => c.json(listDocuments()));

/** GET /api/design-docs/:docId — one document. 404 rather than an empty shell. */
designDocRoutes.get("/:docId", (c) => {
  const id = c.req.param("docId");
  const doc = listDocuments().find((d) => d.id === id);
  if (!doc) return c.json({ error: `No design document with id ${id}` }, 404);
  return c.json(doc);
});

/**
 * GET /api/design-docs/:docId/declaration — the parse result on its own.
 *
 * Exists because the client must never reimplement the parser: `shared/designDocument.ts` was
 * written precisely because the CLI and the browser had two parsers and drifted about what a
 * project's requirements were.
 */
designDocRoutes.get("/:docId/declaration", (c) => {
  const id = c.req.param("docId");
  const doc = listDocuments().find((d) => d.id === id);
  if (!doc) return c.json({ error: `No design document with id ${id}` }, 404);
  return c.json(doc.declaration);
});
