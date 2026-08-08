import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { atomicWriteJson } from "./persistence";
import { assertNoSecrets } from "./secrets";
import { NotFoundError, PermissionDeniedError, VersionConflictError } from "./projectStore";
import type { Actor } from "../types/project";

/**
 * A document already belongs to another project.
 *
 * All three ids are on the error because "already followed" alone cannot be rendered into anything
 * a user can act on: the UI has to be able to offer "open the other project" as the next click.
 */
export class DocumentAlreadyFollowedError extends Error {
  readonly code = "DOCUMENT_ALREADY_FOLLOWED";
  constructor(
    readonly docId: string,
    readonly currentProjectId: string,
    readonly requestedProjectId: string,
  ) {
    super(
      `Design document ${docId} is already followed by project ${currentProjectId}; ` +
        `${requestedProjectId} cannot also follow it.`,
    );
    this.name = "DocumentAlreadyFollowedError";
  }
}

/**
 * A design document is the surface where work is declared and watched. It is not one of the five
 * asset types, and it is not `Project.document` (`server/types/project.ts:273-291`), which embeds a
 * single document inside a project and is retired at reconciliation. Until then this store is
 * authoritative and the embedded document is legacy.
 *
 * Types are exported from here rather than from `server/types/`, which is a hot file across nine
 * parallel worktrees. The move to `server/types/designDoc.ts` is a rename, filed in
 * `loops/handoff/pivot-design-docs.md`.
 */

/** One version of one section. `DesignDocumentVersion` (`server/types/project.ts:49-58`) with the
 * field names unchanged and `body` in place of `content`, because a section is not a document.
 * `authorId` and `fromSuggestionId` are what make a history readable as provenance, not as a diff. */
export interface DocSectionVersion {
  version: number;
  body: string;
  createdAt: string;
  /** Actor id that produced this version — user edits included. */
  authorId: string;
  changeSummary?: string;
  /** Suggestion that produced this version, when it came from one. */
  fromSuggestionId?: string;
}

export interface DocSection {
  /**
   * Minted at creation and NEVER derived from the title.
   *
   * A heading-derived anchor works until a user renames a heading, and then every area mapping and
   * every suggestion target detaches silently with nothing reporting it. The scar is in this
   * repository in the open: `Requirement.designSection` (`server/types/project.ts:79`) is a
   * free-text section name, accepted by the API, stored, mirrored client-side, and set by nothing,
   * in a product that closed 52 checklist items.
   */
  anchor: string;
  index: number;
  title: string;
  /** The single link to a colour-coded work area. Written by the area assignment control and the
   * declaration-apply path, and by nothing else. */
  areaId?: string;
  body: string;
  currentVersion: number;
  versions: DocSectionVersion[];
  /**
   * Derived on read, never stored. A stored line number is a line number that goes wrong on the
   * next edit — line numbers are transient presence data, anchors are the stable identifiers.
   */
  firstLine: number;
}

export interface DesignDoc {
  id: string;
  title: string;
  /**
   * AT MOST ONE. The entire cardinality rule is this field being singular: one project may follow
   * many documents, one document may be followed by at most one project, never two projects on one
   * document. A single optional string cannot hold two projects, so the illegal state is
   * unrepresentable — the rule lives in the shape, not in a check that can be forgotten.
   *
   * The inverse (`Project.documentIds: string[]`) is representable, wrong and silent: two projects
   * both listing `d7` is a legal array on both sides, nothing fails, and the first person to notice
   * is the user.
   */
  followedByProjectId?: string;
  /** Ordered. */
  sections: DocSection[];
  /** Bumps only on add / remove / reorder of sections. Section edits version the section. */
  manifestVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** The five asset types. A category names the kind of thing the project makes. */
export const DECLARATION_CATEGORIES = ["documents", "slides", "tables", "workflows", "software"] as const;
export type DeclarationCategory = (typeof DECLARATION_CATEGORIES)[number];

export interface DeclaredArea {
  name: string;
  description?: string;
  /** Line in the rendered document the area was declared on, for error reporting and highlighting. */
  line: number;
}

export interface ProjectDeclaration {
  name: string;
  category: DeclarationCategory;
  budget?: number;
  /** Empty is legal: zero areas means one implicit area covering the whole document. */
  areas: DeclaredArea[];
  /** 1-based lines of the opening and closing fence in the rendered document. */
  blockStart: number;
  blockEnd: number;
}

/**
 * Every error carries a line. An error without one, in a 200-line document, is a scavenger hunt.
 */
export interface DeclarationError {
  line: number;
  message: string;
}

export interface DeclarationResult {
  ok: boolean;
  declaration?: ProjectDeclaration;
  errors: DeclarationError[];
}

const DECLARATION_KEYS = ["name", "category", "budget", "areas"] as const;

/**
 * Parse the one fenced `project` block a design document may contain.
 *
 * **Strictly delimited, never inferred from prose.** `shared/designDocument.ts:14-21` records why:
 * a loose pattern turns ordinary bullets into requirements, and a project full of phantom
 * requirements is worse than a project with none. The failure here is worse still — phantom areas
 * assemble a team, and a team spends money.
 *
 * **Pure and total.** It returns errors and never throws, on any input, because it runs on every
 * keystroke's worth of document the user has typed so far: half-written fences, unclosed quotes and
 * mid-word keys are the normal case, not the edge case. `ok` is false only when there are errors —
 * a document with no `project` block declares nothing, which is not an error.
 *
 * There is **one parser, on the server**. The client reaches it through
 * `GET /api/design-docs/:docId/declaration` and does not reimplement it: `shared/designDocument.ts`
 * exists precisely because the CLI and the browser had two parsers and drifted about what a
 * project's requirements were.
 */
export function parseDeclaration(text: string): DeclarationResult {
  const errors: DeclarationError[] = [];
  const lines = text.split("\n");

  // Scan every fence, not just the project ones: a ```project opened inside another fenced block is
  // an example in prose, not a declaration, and treating it as one would declare a project from
  // documentation about declaring projects.
  type Fence = { info: string; start: number; end: number | null; body: Array<{ text: string; line: number }> };
  const fences: Fence[] = [];
  let open: Fence | null = null;

  lines.forEach((raw, i) => {
    const fence = /^\s*```(.*)$/.exec(raw);
    if (fence) {
      if (open === null) open = { info: fence[1].trim(), start: i + 1, end: null, body: [] };
      else {
        open.end = i + 1;
        fences.push(open);
        open = null;
      }
      return;
    }
    if (open) open.body.push({ text: raw, line: i + 1 });
  });
  if (open) fences.push(open); // unterminated

  const blocks = fences.filter((f) => f.info === "project");
  if (blocks.length === 0) return { ok: true, errors: [] };

  if (blocks.length > 1) {
    // Naming both lines is the point: "duplicate block" alone leaves the user hunting for the one
    // they forgot they wrote.
    const [first, second] = blocks;
    errors.push({
      line: second.start,
      message: `A design document may contain only one \`project\` block; found one at line ${first.start} and another at line ${second.start}.`,
    });
    return { ok: false, errors };
  }

  const block = blocks[0];
  if (block.end === null) {
    errors.push({
      line: block.start,
      message: "The `project` block opened here is never closed — add a closing ``` fence.",
    });
    return { ok: false, errors };
  }

  const seen = new Map<string, number>();
  let name: string | undefined;
  let category: string | undefined;
  let categoryLine = block.start;
  let budget: number | undefined;
  const areas: DeclaredArea[] = [];
  let inAreas = false;

  for (const { text: raw, line } of block.body) {
    if (raw.trim() === "") continue;

    const areaEntry = /^\s+-\s*(.*)$/.exec(raw);
    if (areaEntry) {
      if (!inAreas) {
        errors.push({ line, message: "A `- ` list item here belongs under `areas:`." });
        continue;
      }
      const entry = areaEntry[1].trim();
      if (entry === "") {
        errors.push({ line, message: "An area needs a name." });
        continue;
      }
      const split = entry.indexOf(":");
      const areaName = (split === -1 ? entry : entry.slice(0, split)).trim();
      const description = split === -1 ? undefined : entry.slice(split + 1).trim() || undefined;
      if (areaName === "") {
        errors.push({ line, message: "An area needs a name before its description." });
        continue;
      }
      if (areas.some((a) => a.name.toLowerCase() === areaName.toLowerCase())) {
        errors.push({ line, message: `Duplicate area \`${areaName}\`.` });
        continue;
      }
      areas.push({ name: areaName, ...(description ? { description } : {}), line });
      continue;
    }

    const kv = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw);
    if (!kv) {
      errors.push({ line, message: `Expected \`key: value\`, got ${JSON.stringify(raw.trim())}.` });
      inAreas = false;
      continue;
    }

    const key = kv[1];
    const value = kv[2].trim();

    // An unknown key is an error, not an ignored line. A user who writes `bugdet: 25` and sees no
    // error believes they set a budget.
    if (!(DECLARATION_KEYS as readonly string[]).includes(key)) {
      errors.push({
        line,
        message: `Unknown key \`${key}\`. Expected one of: ${DECLARATION_KEYS.join(", ")}.`,
      });
      inAreas = false;
      continue;
    }
    if (seen.has(key)) {
      errors.push({ line, message: `Duplicate key \`${key}\`; already set on line ${seen.get(key)}.` });
      inAreas = false;
      continue;
    }
    seen.set(key, line);
    inAreas = key === "areas";

    if (key === "name") {
      if (value === "") errors.push({ line, message: "`name` cannot be empty." });
      else name = value;
    } else if (key === "category") {
      categoryLine = line;
      if (value === "") errors.push({ line, message: "`category` cannot be empty." });
      else category = value;
    } else if (key === "budget") {
      // Strict: "25 dollars" must not silently become 25.
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        errors.push({ line, message: `\`budget\` must be a number, got ${JSON.stringify(value)}.` });
      } else if (Number(value) < 0) {
        errors.push({ line, message: "`budget` cannot be negative." });
      } else {
        budget = Number(value);
      }
    } else if (key === "areas" && value !== "") {
      errors.push({ line, message: "`areas` takes a list of `- Name: description` lines beneath it." });
    }
  }

  if (name === undefined && !seen.has("name")) {
    errors.push({ line: block.start, message: "`name` is required." });
  }
  if (category === undefined && !seen.has("category")) {
    errors.push({ line: block.start, message: "`category` is required." });
  }
  if (category !== undefined && !(DECLARATION_CATEGORIES as readonly string[]).includes(category)) {
    errors.push({
      line: categoryLine,
      message: `\`category\` must be one of: ${DECLARATION_CATEGORIES.join(", ")}. Got \`${category}\`.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    declaration: {
      name: name!,
      category: category as DeclarationCategory,
      ...(budget !== undefined ? { budget } : {}),
      areas,
      blockStart: block.start,
      blockEnd: block.end,
    },
    errors: [],
  };
}

/**
 * The design-document tools an agent may call, and the complete list of them.
 *
 * **There is no write tool, and its absence is the design.** §3.9: an agent may read, may report
 * where it is looking, and may suggest — nothing else. `DELIBERATELY_USER_ONLY`
 * (`server/services/projectMcpServer.ts:692`) is the precedent: an agent cannot approve its own
 * work, and by the same reasoning it cannot rewrite the brief its work is judged against.
 *
 * Exported as a constant so a test can assert the surface rather than trusting a reading of the
 * registration code — a tool added later shows up here or fails the check.
 */
export const DESIGN_DOC_MCP_TOOLS = ["read_design_document", "list_design_documents"] as const;

/** Tool names that would let an agent change a document. None of these may ever be registered. */
export const DESIGN_DOC_FORBIDDEN_TOOLS = [
  "write_design_document",
  "write_design_section",
  "update_design_document",
  "edit_design_document",
  "apply_declaration",
  "create_project_from_document",
  "follow_document",
  "unfollow_document",
  "promote_to_design_document",
] as const;

/**
 * A document rendered for an agent to read, with **line numbers in the output**.
 *
 * That is not a convenience. An agent cannot report a line range it was never shown, so a tool that
 * returns bare prose guarantees every subsequent focus report is the model counting newlines — and
 * it will be wrong. §3.8.2.
 */
export function numberedDocument(
  doc: DesignDoc,
  opts: { fromLine?: number; toLine?: number } = {},
): { title: string; manifestVersion: number; totalLines: number; fromLine: number; toLine: number; text: string } {
  const all = renderDocument(doc).split("\n");
  // The trailing newline from renderDocument produces a final empty element that is not a line.
  if (all.length > 0 && all[all.length - 1] === "") all.pop();

  const from = Math.max(1, opts.fromLine ?? 1);
  const to = Math.min(all.length, opts.toLine ?? all.length);
  const slice = from > to ? [] : all.slice(from - 1, to);
  const width = String(to).length;

  return {
    title: doc.title,
    manifestVersion: doc.manifestVersion,
    totalLines: all.length,
    fromLine: from,
    toLine: to,
    text: slice.map((line, i) => `${String(from + i).padStart(width, " ")}  ${line}`).join("\n"),
  };
}

/**
 * The shape this sweep needs from a suggestion. Structural on purpose: the record is
 * `DesignSuggestion` (`server/types/project.ts:95-118`), owned by the project store, and this
 * worktree does **not** write a second suggestion system (§3.9). The three target fields are the
 * additive change requested as R-3 in the handoff.
 */
export interface SectionTargetedSuggestion {
  state: string;
  baseVersion: number;
  targetDocId?: string;
  targetSectionAnchor?: string;
}

/**
 * Mark pending suggestions stale — **scoped to the section that was written.**
 *
 * `ProjectStore.updateDocument` (`server/services/projectStore.ts:324-329`) sweeps document-wide:
 * every pending suggestion with `baseVersion < version` goes stale when anything in the document
 * changes. That is why two agents proposing against two different parts invalidate each other on
 * every write — the cost of versioning one blob instead of each section.
 *
 * Scoping the sweep is the other half of versioning per section. A suggestion pending against
 * section A is untouched when section B is written, because nothing it was written against moved.
 *
 * Pure: it mutates the records handed to it and returns the ones it changed, so the caller decides
 * when to persist. A suggestion carrying no `targetDocId` is a whole-document suggestion from the
 * legacy path and is deliberately left alone — this sweep has no opinion about it.
 *
 * Returns the suggestions it marked stale.
 */
export function sweepStaleSuggestions<T extends SectionTargetedSuggestion>(
  suggestions: T[],
  written: { docId: string; sectionAnchor: string; newVersion: number },
): T[] {
  const swept: T[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.state !== "pending") continue;
    if (suggestion.targetDocId !== written.docId) continue;
    if (suggestion.targetSectionAnchor !== written.sectionAnchor) continue;
    if (suggestion.baseVersion >= written.newVersion) continue;
    suggestion.state = "stale";
    swept.push(suggestion);
  }
  return swept;
}

/** What is written to disk: `firstLine` is derived on read and must never be persisted. */
type StoredSection = Omit<DocSection, "firstLine">;
type StoredDoc = Omit<DesignDoc, "sections"> & { sections: StoredSection[] };

let idCounter = 0;

/**
 * Mint an id that sorts in creation order.
 *
 * The counter is zero-padded deliberately. `Date.now()` has millisecond resolution, and creating
 * several documents in one millisecond is ordinary — a seeded project, an import, a test. When the
 * timestamps tie, the id is the tiebreak, so an unpadded counter (`"z"` before `"10"`) would put
 * the 36th document ahead of the 37th and the listing order would be arbitrary.
 *
 * Width 4 keeps ordering exact for the first 36^4 ≈ 1.7M ids in a process; past that the timestamp
 * has long since moved on.
 */
function newId(prefix: string): string {
  idCounter += 1;
  const seq = idCounter.toString(36).padStart(4, "0");
  return `${prefix}_${Date.now().toString(36)}${seq}${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** The lines one section occupies in the rendered document: its heading, then its body. */
function sectionLines(section: { title: string; body: string }): string[] {
  return [`## ${section.title}`, ...section.body.split("\n")];
}

/**
 * The canonical rendering of a document, and therefore the definition of what a line number means.
 *
 * Presence ranges, suggestion line ranges and the declaration parser's error lines all count lines
 * in *this* text. There is one renderer, on the server, for the same reason there is one
 * declaration parser: `shared/designDocument.ts` exists because the CLI and the browser had two
 * parsers and drifted about what a project's requirements were.
 */
export function renderDocument(doc: { sections: Array<{ title: string; body: string }> }): string {
  if (doc.sections.length === 0) return "";
  return doc.sections.map((s) => sectionLines(s).join("\n")).join("\n\n") + "\n";
}

/** Attach the derived `firstLine` to every section. Kept in one place so the rendering and the
 * line numbering cannot drift apart. */
function hydrate(stored: StoredDoc): DesignDoc {
  let line = 1;
  const sections = stored.sections.map((s) => {
    const firstLine = line;
    line += sectionLines(s).length + 1; // +1 for the blank line between sections
    return { ...s, firstLine };
  });
  return { ...stored, sections };
}

/**
 * File-backed design-document store. One JSON document per design document, written atomically via
 * the same tmp+rename path the project store uses, so a crash mid-write cannot truncate it.
 *
 * **Every mutation on this class must stay synchronous.** A mutation is read-whole-file → change in
 * memory → write-whole-file, and `atomicWriteJson` makes only the *write* atomic. The
 * read-modify-write *sequence* is safe purely because no `await` occurs inside it, so the event loop
 * cannot interleave two of them and let one update overwrite another's. Several agents suggesting
 * and one human editing at once is this product's normal state, so that is load-bearing.
 *
 * Introducing an `async` method here — switching to `fs.promises`, for instance — would silently
 * reintroduce lost updates. `designDocInvariants.test.ts` fails if any method becomes async, and it
 * also fails if this explanation is deleted, because a rule whose reason is gone gets "cleaned up".
 *
 * The guarantee is per-process, exactly as in `server/services/projectStore.ts:148-162`.
 */
export class DesignDocStore {
  /**
   * **`dir` must be somewhere no agent can reach as a file path.** Not inside a project repository,
   * not inside any agent worktree. The natural home is the OPENUI data directory.
   *
   * This is load-bearing, and it is the only thing making DD-009 real. `writeSection` refuses a
   * non-user actor, but that refusal guards *this API* — and an agent is a real `grok` process
   * retaining Grok Build's native surface, including file reading and editing (`grok-workspace.md`
   * §3.3.1, A-0). An agent that can see `asset.json`-style files on disk edits them with its own
   * tools and never calls this class at all. The refusal would still pass its tests while the brief
   * was being rewritten underneath it.
   *
   * Write-time path enforcement is `server/services/boundary.ts` (01-agents) and does not exist
   * yet; `assertAgentCanWrite` (`server/services/repository.ts:261`) has zero production callers.
   * So today this store's safety is unreachability, nothing more. Whoever wires the composition
   * root chooses this path — see R-10 in `loops/handoff/pivot-design-docs.md`.
   */
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private pathFor(docId: string): string {
    return join(this.dir, `${docId}.json`);
  }

  /** Read the stored form. Every mutation re-reads from disk, so two stores over one directory
   * cannot serve stale in-memory copies of the same document. */
  private load(docId: string): StoredDoc {
    const path = this.pathFor(docId);
    if (!existsSync(path)) throw new NotFoundError(`Design document not found: ${docId}`);
    return JSON.parse(readFileSync(path, "utf8")) as StoredDoc;
  }

  private persist(doc: StoredDoc): DesignDoc {
    doc.updatedAt = nowIso();
    atomicWriteJson(this.pathFor(doc.id), doc);
    return hydrate(doc);
  }

  private sectionOf(doc: StoredDoc, anchor: string): StoredSection {
    const section = doc.sections.find((s) => s.anchor === anchor);
    if (!section) throw new NotFoundError(`Section not found: ${anchor}`);
    return section;
  }

  private reindex(doc: StoredDoc): void {
    doc.sections.forEach((s, i) => {
      s.index = i;
    });
  }

  // ---- documents -------------------------------------------------------------------------

  /**
   * Create a design document. No project is required, and none is created: a design document is
   * where the next project comes from, so it exists before, and outlives, any project that follows
   * it.
   */
  createDocument(params: { title: string; sections?: Array<{ title: string; body?: string }> }, actor: Actor): DesignDoc {
    const at = nowIso();
    const doc: StoredDoc = {
      id: newId("doc"),
      title: params.title,
      sections: [],
      manifestVersion: 1,
      createdAt: at,
      updatedAt: at,
    };
    for (const s of params.sections ?? []) {
      doc.sections.push(this.mintSection(s.title, s.body ?? "", actor, at));
    }
    this.reindex(doc);
    return this.persist(doc);
  }

  private mintSection(title: string, body: string, actor: Actor, at: string): StoredSection {
    assertNoSecrets(body, `design document section "${title}"`);
    return {
      anchor: newId("sec"),
      index: 0,
      title,
      body,
      currentVersion: 1,
      versions: [{ version: 1, body, createdAt: at, authorId: actor.id }],
    };
  }

  getDocument(docId: string): DesignDoc {
    return hydrate(this.load(docId));
  }

  /**
   * Every document, in creation order.
   *
   * The sort is total: `createdAt` first, then `id`. Without the second key, documents created in
   * the same millisecond tie and the order falls back to whatever `readdirSync` returns — which is
   * filesystem order, differs between machines, and changes as files are rewritten. A user's list
   * of briefs reordering itself between page loads is not a cosmetic problem.
   */
  listDocuments(): DesignDoc[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"))
      .map((f) => hydrate(JSON.parse(readFileSync(join(this.dir, f), "utf8")) as StoredDoc))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  retitleDocument(docId: string, title: string, _actor: Actor): DesignDoc {
    const doc = this.load(docId);
    doc.title = title;
    return this.persist(doc);
  }

  /**
   * The declaration this document currently makes, parsed from its rendered text.
   *
   * **Parsing is automatic and continuous; applying is a human click.** This method creates
   * nothing, assembles no team and spends no money — it only answers what the document says. The
   * apply path is separate and carries the acting user's id, which preserves the one human approval
   * gate the retired product proved was the right amount of ceremony.
   */
  declarationFor(docId: string): DeclarationResult {
    return parseDeclaration(renderDocument(this.getDocument(docId)));
  }

  // ---- cardinality -----------------------------------------------------------------------

  /**
   * Bind a document to the project that follows it.
   *
   * The check is one lookup on the record being mutated: `followedByProjectId` is a single optional
   * string, so "two projects on one document" is unrepresentable rather than merely forbidden. The
   * alternative — `Project.documentIds: string[]` — is representable, wrong and silent: two projects
   * both listing `d7` is a legal array on both sides, nothing fails, the UI shows the document under
   * both, two teams read it as their brief, and the first person to notice is the user.
   *
   * A user action. An agent that could bind a document to a project could bind itself to any brief.
   */
  followDocument(docId: string, projectId: string, actor: Actor): DesignDoc {
    this.assertUser(actor, "follow a design document");
    const doc = this.load(docId);

    // Idempotent: re-following the project that already follows it is not an error, because the
    // caller's intent is already satisfied and failing here would make retries unsafe.
    if (doc.followedByProjectId === projectId) return hydrate(doc);
    if (doc.followedByProjectId) {
      throw new DocumentAlreadyFollowedError(docId, doc.followedByProjectId, projectId);
    }

    doc.followedByProjectId = projectId;
    return this.persist(doc);
  }

  /**
   * Detach a document from its project. A user action only, never an agent tool: an agent that
   * could unfollow could detach itself from its own brief.
   */
  unfollowDocument(docId: string, actor: Actor): DesignDoc {
    this.assertUser(actor, "unfollow a design document");
    const doc = this.load(docId);
    delete doc.followedByProjectId;
    return this.persist(doc);
  }

  /**
   * The documents a project follows — **derived by scan, never stored.**
   *
   * A stored list on the project is a second record of the same fact, and two records of one fact
   * disagree eventually. The scan is the only authority.
   */
  listDocumentsForProject(projectId: string): DesignDoc[] {
    return this.listDocuments().filter((d) => d.followedByProjectId === projectId);
  }

  /**
   * Clear the follow link from every document a project follows, and delete nothing.
   *
   * **A design document outlives its project.** The document is where the next project comes from,
   * and a user who deletes a failed project and loses the brief they spent an hour writing does not
   * open the product again.
   *
   * Call this when a project is deleted. `ProjectStore.deleteProject`
   * (`server/services/projectStore.ts:261`) does not call it yet — that file is hot, and the
   * one-line wiring is filed in `loops/handoff/pivot-design-docs.md`. Until it lands, a deleted
   * project leaves a dangling `followedByProjectId`, which is recorded in `VERIFICATION.md` as the
   * reason DD-003 is held rather than passed.
   */
  unfollowProject(projectId: string): DesignDoc[] {
    return this.listDocumentsForProject(projectId).map((doc) => {
      const stored = this.load(doc.id);
      delete stored.followedByProjectId;
      return this.persist(stored);
    });
  }

  private assertUser(actor: Actor, action: string): void {
    if (actor.kind !== "user") {
      // The refusal names what to do instead. A refusal that does not is how an agent gets stuck
      // retrying the same call.
      throw new PermissionDeniedError(
        `Only a user may ${action}. An agent may read the document and submit a suggestion against it.`,
      );
    }
  }

  // ---- sections --------------------------------------------------------------------------

  /** Add a section. Structural change, so it bumps `manifestVersion` and no section's version. */
  addSection(docId: string, params: { title: string; body?: string; afterAnchor?: string }, actor: Actor): DesignDoc {
    const doc = this.load(docId);
    const section = this.mintSection(params.title, params.body ?? "", actor, nowIso());
    const at = params.afterAnchor ? doc.sections.findIndex((s) => s.anchor === params.afterAnchor) : -1;
    if (params.afterAnchor && at === -1) throw new NotFoundError(`Section not found: ${params.afterAnchor}`);
    doc.sections.splice(at === -1 ? doc.sections.length : at + 1, 0, section);
    this.reindex(doc);
    doc.manifestVersion += 1;
    return this.persist(doc);
  }

  /**
   * Rename a section's heading. The anchor, the area assignment and the version history are
   * untouched — that is the whole point of minting anchors rather than deriving them.
   *
   * A retitle is not a body edit, so it does not append a section version: the text of record has
   * not changed.
   */
  retitleSection(docId: string, anchor: string, title: string, _actor: Actor): DesignDoc {
    const doc = this.load(docId);
    this.sectionOf(doc, anchor).title = title;
    return this.persist(doc);
  }

  /** Reorder sections. Structural, so `manifestVersion` bumps and no anchor changes. */
  reorderSections(docId: string, anchorsInOrder: string[], _actor: Actor): DesignDoc {
    const doc = this.load(docId);
    const known = new Set(doc.sections.map((s) => s.anchor));
    const requested = new Set(anchorsInOrder);
    if (anchorsInOrder.length !== doc.sections.length || requested.size !== anchorsInOrder.length) {
      throw new Error(
        `Reorder must list every section exactly once: got ${anchorsInOrder.length} of ${doc.sections.length}`,
      );
    }
    for (const a of anchorsInOrder) if (!known.has(a)) throw new NotFoundError(`Section not found: ${a}`);

    doc.sections = anchorsInOrder.map((a) => doc.sections.find((s) => s.anchor === a)!);
    this.reindex(doc);
    doc.manifestVersion += 1;
    return this.persist(doc);
  }

  /**
   * Assign or clear a section's owning area. A user action, never an agent tool: `areaId` scopes
   * presence and suggestions, and an agent that could reassign areas could scope itself onto any
   * part of the brief.
   */
  assignSectionArea(docId: string, anchor: string, areaId: string | undefined, _actor: Actor): DesignDoc {
    const doc = this.load(docId);
    const section = this.sectionOf(doc, anchor);
    if (areaId === undefined) delete section.areaId;
    else section.areaId = areaId;
    return this.persist(doc);
  }

  /**
   * Write a section's body, versioned with optimistic concurrency.
   *
   * `expectedVersion` and `VersionConflictError` carry both numbers because "conflict" alone
   * renders into nothing a user can act on. Versioning at the section rather than the document is
   * what lets two agents propose against two different parts without invalidating each other.
   */
  writeSection(
    docId: string,
    anchor: string,
    params: { body: string; expectedVersion: number; changeSummary?: string; fromSuggestionId?: string },
    actor: Actor,
  ): DesignDoc {
    // §3.9: agents never write a design document. Not through a tool, not inside their own area,
    // and NOT with a scoped grant — `Actor.canWriteDocument` (`server/types/project.ts:45-46`) is
    // deliberately not consulted here, because the design document is where the human states
    // intent, and an agent that can rewrite the brief can rewrite the brief to match what it
    // already did. The agent's entire write surface is the suggestion path.
    //
    // A user accepting a suggestion is still a user write — it carries `fromSuggestionId` and the
    // accepting user's id — so provenance survives without opening a second door.
    if (actor.kind !== "user") {
      throw new PermissionDeniedError(
        `Agents cannot write a design document. Submit a suggestion instead: ` +
          `submit_design_suggestion with targetDocId "${docId}" and targetSectionAnchor "${anchor}". ` +
          `A user reviews it, and accepting it produces the new version.`,
      );
    }

    const doc = this.load(docId);
    const section = this.sectionOf(doc, anchor);

    if (params.expectedVersion !== section.currentVersion) {
      throw new VersionConflictError(
        `Section ${anchor} has moved on: wrote against version ${params.expectedVersion}, current is ${section.currentVersion}`,
        params.expectedVersion,
        section.currentVersion,
      );
    }

    // Refused, not redacted, and refused before anything is written: a design document is read by
    // every agent on the project and exported to shared assets, so a secret leaks further from here
    // than from a private repository. The author needs to know their credential did not land.
    assertNoSecrets(params.body, `design document section "${section.title}"`);

    section.body = params.body;
    section.currentVersion += 1;
    section.versions.push({
      version: section.currentVersion,
      body: params.body,
      createdAt: nowIso(),
      authorId: actor.id,
      ...(params.changeSummary ? { changeSummary: params.changeSummary } : {}),
      ...(params.fromSuggestionId ? { fromSuggestionId: params.fromSuggestionId } : {}),
    });
    return this.persist(doc);
  }
}
