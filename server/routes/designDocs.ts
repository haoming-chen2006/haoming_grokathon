import { Hono } from "hono";
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { parseDeclaration, type DeclarationResult } from "../services/designDoc";
import { startWork } from "../services/startWork";
import { getProjectStore } from "../services/projectStore";
import { draftDesignDocument } from "../services/designDocDraft";

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

/**
 * docId → the project following it, built once per listing.
 *
 * `projectFollowing` answers for one document by scanning every project, which is the right shape
 * for the one-document `/start` check and the wrong one for a list: it re-read all 24 projects for
 * each of the documents on disk. Same answer, one pass.
 */
function followerIndex(): Map<string, string> {
  const store = getProjectStore();
  const index = new Map<string, string>();
  for (const summary of store.listProjects()) {
    const docId = store.getProject(summary.id).designDocId;
    if (docId) index.set(docId, summary.id);
  }
  return index;
}

function listDocuments(): DesignDocView[] {
  const dir = docsDir();
  if (!existsSync(dir)) return [];
  const followers = followerIndex();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const doc = readDocument(f);
      const followedBy = followers.get(doc.id);
      return followedBy ? { ...doc, followedByProjectId: followedBy } : doc;
    });
}

/**
 * The documents a project's page should show: its own, and the ones no project has claimed.
 *
 * Switching project switches the document, which is the whole point of scoping — but a filter that
 * returned ONLY `followedByProjectId === projectId` would hide every document nobody has started
 * yet, including the ones sitting on disk waiting to be opened. Those are the drafts you are about
 * to adopt, so they travel with every project rather than belonging to none.
 */
function documentsFor(projectId: string): DesignDocView[] {
  return listDocuments().filter(
    (d) => d.followedByProjectId === projectId || d.followedByProjectId === undefined,
  );
}

/**
 * GET /api/design-docs — every document, with its declaration already parsed.
 *
 * `?projectId=` scopes it to that project (its own document, plus unclaimed drafts). The parameter
 * is optional because the CLI and the tests read the whole set; the page always sends it.
 */
designDocRoutes.get("/", (c) => {
  const projectId = c.req.query("projectId");
  return c.json(projectId ? documentsFor(projectId) : listDocuments());
});

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
  let body: { title?: string; text?: string; projectId?: string };
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

  // `projectId` attaches the document to a project that already exists — the path a blank project
  // takes when its brief is finally written. Without it the document is unclaimed, which is still
  // the ordinary case for a paste that has no project yet.
  //
  // The link is formed AFTER the write, and a failure to link does not unwrite the file: the user's
  // text is the thing that must never be lost, and an orphaned document can be adopted, while a
  // document that was refused is gone.
  let linkError: string | undefined;
  if (body.projectId) {
    try {
      getProjectStore().setDesignDocId(body.projectId, id);
    } catch (err) {
      linkError = err instanceof Error ? err.message : String(err);
    }
  }

  const doc = readDocument(`${id}.md`);
  const followedBy = projectFollowing(id);
  return c.json(
    {
      ...doc,
      ...(followedBy ? { followedByProjectId: followedBy } : {}),
      ...(linkError ? { linkError } : {}),
    },
    201,
  );
});

/**
 * POST /api/design-docs/draft — ask an X agent for a document.
 *
 * Generates and returns; it does not save. The draft comes back with its own parse verdict so the
 * surface can show "this will declare three areas" or the line that is wrong, before the user
 * commits to it. Saving is a second, deliberate call to `POST /` with the text they approved.
 *
 * Registered before `/:docId` so the literal segment is not read as a document id.
 */
designDocRoutes.post("/draft", async (c) => {
  let body: { projectName?: string; brief?: string; existing?: string; projectId?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON body with a `brief` field" }, 400);
  }
  if (!body?.brief?.trim()) {
    return c.json({ error: "brief is required — say what you want built" }, 400);
  }

  try {
    const draft = await draftDesignDocument({
      projectName: body.projectName?.trim() || "Untitled project",
      brief: body.brief,
      existing: body.existing,
      projectId: body.projectId,
    });
    return c.json(draft);
  } catch (err) {
    // The credential message is the common one and is already a sentence a user can act on
    // (`NO_CREDENTIAL_MESSAGE`). 502 rather than 500: the failure is upstream, not in this process.
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

/**
 * PUT /api/design-docs/:docId — save an edit.
 *
 * The document surface edits one block at a time and sends back the WHOLE text, with only that
 * block's line range rewritten (`client/src/control-room/designdoc/markdown.ts`). Taking the whole
 * text is what keeps this endpoint honest about what it can promise: there are no section anchors
 * and no per-section versions on disk, so a partial write would have to invent the boundary it
 * wrote inside.
 *
 * **This is a user's write.** No agent reaches it: the MCP surface offers agents `read` and
 * `submit_design_suggestion` and nothing that writes a document, because an agent that can rewrite
 * the brief can rewrite the brief to match what it already did.
 *
 * What this does NOT do, and what the client must not imply that it does: keep history. The store
 * in `services/designDoc.ts` is versioned and this file is not wired to it (see the note at the top
 * of this file), so a save overwrites. `expectedText` is how a save that would clobber somebody
 * else's is refused in the meantime — 409 with both texts, so the client can say what happened
 * rather than silently picking a winner.
 */
designDocRoutes.put("/:docId", async (c) => {
  const id = c.req.param("docId");
  const path = join(docsDir(), `${id}.md`);
  if (!existsSync(path)) return c.json({ error: `No design document with id ${id}` }, 404);

  let body: { text?: string; expectedText?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Expected a JSON body with a `text` field" }, 400);
  }
  if (typeof body?.text !== "string") return c.json({ error: "text is required" }, 400);

  const onDisk = readFileSync(path, "utf8");
  if (typeof body.expectedText === "string" && body.expectedText !== onDisk) {
    return c.json(
      {
        error: "This document changed since you opened it, so the edit was not saved",
        code: "DOCUMENT_CHANGED",
        currentText: onDisk,
      },
      409,
    );
  }

  writeFileSync(path, body.text, "utf8");
  const doc = readDocument(`${id}.md`);
  const followedBy = projectFollowing(doc.id);
  return c.json(followedBy ? { ...doc, followedByProjectId: followedBy } : doc);
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
