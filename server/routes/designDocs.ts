import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { parseDeclaration, type DeclarationResult } from "../services/designDoc";
import { startWork } from "../services/startWork";
import { getProjectStore } from "../services/projectStore";

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
 *          server-side parser in services/designDoc.ts, the same code path a stored document uses;
 *          and, since the product needed a front door, writing and deleting a document as a file
 *   not    versioning, section anchors and suggestions. A POST overwrites nothing and a DELETE
 *          keeps no history, because history is the store's job and the store is not wired yet.
 *
 * When the store is wired, `listDocuments()`, the POST and the DELETE are what change.
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

/**
 * The project that followed this document, if any.
 *
 * Matched on `project.designDocId`, which startWork records.
 *
 * This compared document TITLES until it bit: the start screen offers a skeleton whose heading is
 * "Name your project", so the second person to use it hit 409 DOCUMENT_ALREADY_FOLLOWED for a
 * document nothing followed — no project, no boxes, no explanation. Two documents may share a
 * heading; they cannot share an id.
 */
function projectFollowing(docId: string): string | undefined {
  for (const summary of getProjectStore().listProjects()) {
    const full = getProjectStore().getProject(summary.id);
    if (full.designDocId === docId) return full.id;
  }
  return undefined;
}

function listDocuments(): DesignDocView[] {
  const dir = docsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const doc = readDocument(f);
      const followedBy = projectFollowing(doc.id);
      return followedBy ? { ...doc, followedByProjectId: followedBy } : doc;
    });
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

/** A filename from a title, so a pasted document is findable on disk by a human. */
function slugFor(title: string, text: string): string {
  const base = (title || firstHeadingOf(text) || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
  const dir = docsDir();
  if (!existsSync(join(dir, `${base}.md`))) return base;
  for (let n = 2; n < 500; n += 1) if (!existsSync(join(dir, `${base}-${n}.md`))) return `${base}-${n}`;
  throw new Error(`Too many documents named ${base}`);
}

function firstHeadingOf(text: string): string | undefined {
  return /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
}

/**
 * POST /api/design-docs — paste or import a document.
 *
 * This is the product's front door: a user arrives with a document, and everything downstream —
 * the project, the team, the plan, the deliverables — is derived from it. Until this existed the
 * only way in was to drop a file into `demo/design-docs/` by hand, which is not a product.
 *
 * The document is written to disk **as pasted**, and the declaration is returned alongside it
 * rather than being enforced: a document whose `project` block is malformed is still saved, and the
 * errors come back with their line numbers so the user can fix them in place. Refusing to save
 * would lose what they typed, which is the one thing a paste box must never do.
 */
designDocRoutes.post("/", async (c) => {
  let body: { title?: string; text?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON body with a `text` field" }, 400);
  }
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text.trim()) return c.json({ error: "text is required and cannot be empty" }, 400);

  const dir = docsDir();
  mkdirSync(dir, { recursive: true });
  const id = slugFor(body.title ?? "", text);
  writeFileSync(join(dir, `${id}.md`), text, "utf8");

  const doc = readDocument(`${id}.md`);
  return c.json(doc, 201);
});

/**
 * DELETE /api/design-docs/:docId — remove a document.
 *
 * A demo that cannot be reset is a demo you get one run of. Deleting the document does NOT delete
 * the project it declared or the assets that project produced: those have their own lifetimes, and
 * silently cascading would destroy work the user never asked to lose.
 */
designDocRoutes.delete("/:docId", (c) => {
  const id = c.req.param("docId");
  const path = join(docsDir(), `${id}.md`);
  if (!existsSync(path)) return c.json({ error: `No design document with id ${id}` }, 404);
  rmSync(path);
  return c.json({ deleted: id });
});

/**
 * POST /api/design-docs/:docId/start — the one action.
 *
 * Creates the project the document declares, seeds its team, and stands it in a workspace. It does
 * NOT launch anything: the plan is generated separately and approved by a human, because that gate
 * is the reason this product supervises agents rather than merely running them.
 *
 * Refuses a second project for the same document (§3.3, D-2). One project per document, always —
 * the refusal is here, at the API, rather than as a disabled button, because a disabled button is a
 * suggestion and this is a rule.
 */
designDocRoutes.post("/:docId/start", async (c) => {
  const id = c.req.param("docId");
  const doc = listDocuments().find((d) => d.id === id);
  if (!doc) return c.json({ error: `No design document with id ${id}` }, 404);

  const existing = projectFollowing(id);
  if (existing) {
    return c.json(
      {
        error: `${doc.title} is already followed by a project`,
        code: "DOCUMENT_ALREADY_FOLLOWED",
        projectId: existing,
      },
      409,
    );
  }

  let body: { repositoryPath?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    // No body is the ordinary case — a deck has no repository to name.
  }

  try {
    const started = startWork({
      documentId: doc.id,
      documentTitle: doc.title,
      documentText: doc.text,
      repositoryPath: body?.repositoryPath,
    });
    return c.json(started, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});
