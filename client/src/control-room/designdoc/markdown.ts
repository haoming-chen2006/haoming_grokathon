/**
 * The document, parsed into blocks that still know which lines they came from.
 *
 * A design document is markdown and a person reads it as prose, so the page renders it as prose.
 * But everything else on this surface is stated in LINE NUMBERS — an agent reports "lines 41–58",
 * the declaration is "declared on lines 5–12", an edit replaces a range — so a renderer that
 * forgets where a paragraph started would take the surface's whole vocabulary away with it.
 *
 * Hence: every block carries `startLine` and `endLine`, 1-based and inclusive, over the ORIGINAL
 * text. That single property is what lets the same document be read as prose, highlighted by line
 * range, and edited one paragraph at a time without ever re-serialising the parts nobody touched.
 *
 * Blocks do not tile the document: blank lines between them belong to no block. That is deliberate.
 * `replaceLines` only ever rewrites the range of the block being edited, so the spacing a user
 * chose survives an edit to the paragraph beside it.
 *
 * This parser is deliberately small. It covers what a design document contains — headings, prose,
 * lists, quotes, fences, rules and tables — and nothing else. It is pure, total, and never throws;
 * anything it does not recognise stays a paragraph, which renders as the text the user typed.
 */

export interface Span {
  /** 1-based, inclusive, over the original text. */
  startLine: number;
  endLine: number;
}

export interface ListItem extends Span {
  text: string;
  /** Nesting depth, 0 at the margin. Two spaces or one tab per level. */
  depth: number;
}

export interface TableRow extends Span {
  cells: string[];
}

export type Block =
  | ({ kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string } & Span)
  | ({ kind: "paragraph"; text: string } & Span)
  | ({ kind: "list"; ordered: boolean; items: ListItem[] } & Span)
  | ({ kind: "quote"; text: string } & Span)
  | ({ kind: "code"; lang?: string; code: string; closed: boolean } & Span)
  /**
   * The fenced ```project block, lifted out of `code` because it is not code.
   *
   * It is the one part of a design document that DOES something — it declares the project, its
   * category, its budget and its areas — and rendering it as a grey box of source is what made the
   * old surface read like a terminal. The renderer draws it as the statement it is; the source is
   * still here, and still what an edit writes back.
   */
  | ({ kind: "declaration"; source: string; closed: boolean } & Span)
  | ({ kind: "rule" } & Span)
  | ({ kind: "table"; header: TableRow; rows: TableRow[] } & Span);

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*(```+|~~~+)\s*([^\s`~]*)\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const NUMBERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** A table row's cells, with the outer pipes dropped and each cell trimmed. */
function cellsOf(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function isTableRow(line: string): boolean {
  return line.includes("|") && line.trim().length > 0;
}

/**
 * The document as blocks.
 *
 * Total: every line ends up either inside a block or in the gaps between them, and no input
 * produces an exception. An unterminated fence is a fence with `closed: false` running to the end
 * of the document, because that is what the user is looking at while they type it.
 */
export function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineNo = i + 1;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || undefined;
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      while (j < lines.length) {
        if (lines[j].trim().startsWith(marker.slice(0, 3)) && FENCE.test(lines[j])) {
          closed = true;
          break;
        }
        body.push(lines[j]);
        j += 1;
      }
      const endLine = closed ? j + 1 : lines.length;
      blocks.push(
        lang === "project"
          ? { kind: "declaration", source: body.join("\n"), closed, startLine: lineNo, endLine }
          : { kind: "code", lang, code: body.join("\n"), closed, startLine: lineNo, endLine },
      );
      i = closed ? j + 1 : lines.length;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim(),
        startLine: lineNo,
        endLine: lineNo,
      });
      i += 1;
      continue;
    }

    // Before the bullet check: `- - -` is a rule, and `---` under a paragraph is one too.
    if (RULE.test(line)) {
      blocks.push({ kind: "rule", startLine: lineNo, endLine: lineNo });
      i += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = !bullet;
      const items: ListItem[] = [];
      let j = i;
      while (j < lines.length) {
        const b = BULLET.exec(lines[j]);
        const n = NUMBERED.exec(lines[j]);
        const match = ordered ? n : b;
        if (match) {
          const indent = match[1].replace(/\t/g, "  ").length;
          items.push({
            text: match[3],
            depth: Math.floor(indent / 2),
            startLine: j + 1,
            endLine: j + 1,
          });
          j += 1;
          continue;
        }
        // A non-blank, non-marker line indented under the last item continues it.
        if (items.length > 0 && lines[j].trim() !== "" && /^\s+/.test(lines[j]) && !HEADING.test(lines[j])) {
          const last = items[items.length - 1];
          last.text += `\n${lines[j].trim()}`;
          last.endLine = j + 1;
          j += 1;
          continue;
        }
        break;
      }
      blocks.push({
        kind: "list",
        ordered,
        items,
        startLine: lineNo,
        endLine: items[items.length - 1].endLine,
      });
      i = j;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      let j = i;
      while (j < lines.length && QUOTE.test(lines[j])) {
        body.push(QUOTE.exec(lines[j])![1]);
        j += 1;
      }
      blocks.push({ kind: "quote", text: body.join("\n"), startLine: lineNo, endLine: j });
      i = j;
      continue;
    }

    // A table is a row followed by a divider. Without the divider it is a paragraph that happens
    // to contain pipes, which is a sentence, not a table.
    if (isTableRow(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header: TableRow = { cells: cellsOf(line), startLine: lineNo, endLine: lineNo };
      const rows: TableRow[] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) {
        rows.push({ cells: cellsOf(lines[j]), startLine: j + 1, endLine: j + 1 });
        j += 1;
      }
      blocks.push({ kind: "table", header, rows, startLine: lineNo, endLine: j });
      i = j;
      continue;
    }

    // Everything else is prose, running until a blank line or the start of another block.
    const body: string[] = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === "") break;
      if (j > i && (HEADING.test(l) || FENCE.test(l) || RULE.test(l) || BULLET.test(l) || NUMBERED.test(l) || QUOTE.test(l))) {
        break;
      }
      body.push(l);
      j += 1;
    }
    blocks.push({ kind: "paragraph", text: body.join("\n"), startLine: lineNo, endLine: j });
    i = j;
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────── editing by line range

/** The original source of a block — what an editor opens, and what it compares against. */
export function sliceLines(text: string, from: number, to: number): string {
  return text.split("\n").slice(from - 1, to).join("\n");
}

/**
 * Rewrite one line range, leaving every other byte of the document alone.
 *
 * This is the whole edit path. A design document is the record of what a person asked for, and a
 * save that re-serialised the parts they did not touch would quietly rewrite their wording, their
 * spacing and their fences. Replacing a range cannot.
 *
 * Emptying a block deletes its lines and one blank line after them, so removing a paragraph does
 * not leave a widening hole where it was.
 */
export function replaceLines(text: string, from: number, to: number, replacement: string): string {
  const lines = text.split("\n");
  const before = lines.slice(0, from - 1);
  const after = lines.slice(to);
  if (replacement.trim() === "") {
    if (after[0]?.trim() === "") after.shift();
    return [...before, ...after].join("\n");
  }
  return [...before, ...replacement.split("\n"), ...after].join("\n");
}

// ───────────────────────────────────────────────────────────────────────────── inline markup

/**
 * A link to something that lives inside this product — an asset, or another design document.
 *
 * Written as a markdown link with a scheme of our own:
 *
 * ```text
 * [@chair_launch_plan](asset:asset_msl1ykj01m5rlfe)
 * [@chair_launch_plan](doc:doc_msl1bhow2hwse5d)
 * ```
 *
 * **It stores the id and never the title.** A title is renamed the first time somebody disagrees
 * with it, and a mention that stored the title would still read correctly while pointing at
 * nothing — a link that rots silently, which is worse than one that breaks loudly. The label is
 * prose the author wrote and is rendered as written; the id is what is followed.
 *
 * The form is deliberately plain markdown: it survives a round trip through the document store
 * unchanged, it is readable if somebody opens the `.md` on disk, and it needs no new field
 * anywhere on the server.
 */
export type MentionKind = "asset" | "doc";

export interface Mention {
  /** Which surface the target lives on: the ASSETS page, or DESIGN DOCUMENTS. */
  kind: MentionKind;
  /** The server-issued id. Opaque here, and the only thing that is followed. */
  id: string;
  /** What the author wrote between the brackets, conventionally `@something`. */
  label: string;
}

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "mention"; mention: Mention };

/**
 * `[label](asset:id)` or `[label](doc:id)` at the start of a string.
 *
 * The label excludes brackets and newlines so that what the parser yields can always be written
 * back out by `mentionMarkdown` byte for byte; the id excludes `)` and whitespace, which is what
 * ends it.
 */
const MENTION = /^\[([^[\]\n]*)\]\((asset|doc):([^)\s]*)\)/;

/**
 * The mention at the start of `rest`, if there is one.
 *
 * Three answers, not two. `undefined` means this is not our form at all and the caller should
 * carry on. A result with no `mention` means it looked like our form but named nothing —
 * `[@x](asset:)` — and the caller should consume those characters as literal text: the two schemes
 * belong to this product, so a malformed one must not escape as an ordinary link pointing out of
 * the browser.
 */
function readMention(rest: string): { mention?: Mention; length: number } | undefined {
  const m = MENTION.exec(rest);
  if (!m) return undefined;
  const id = m[3];
  if (!id) return { length: m[0].length };
  return { mention: { kind: m[2] as MentionKind, id, label: m[1] }, length: m[0].length };
}

/** A mention, written back into the document. `parseInline(mentionMarkdown(m))` yields `m`. */
export function mentionMarkdown(mention: Mention): string {
  // Brackets and newlines cannot be carried by the form; a label holding one would produce a link
  // that no longer parses as the thing that was inserted. Parsed labels never contain them, so
  // this only ever fires on a label assembled from a title somewhere else.
  const label = mention.label.replace(/[[\]\n]+/g, " ");
  return `[${label}](${mention.kind}:${mention.id})`;
}

/**
 * The label a picker inserts for a title: `@` and then the title.
 *
 * Not a place to invent one. The caller passes the record's own title, or — when a record has
 * none — its id, which is a real value rather than a plausible-looking stand-in.
 */
export function mentionLabel(title: string): string {
  return `@${title.replace(/[[\]\n]+/g, " ").trim()}`;
}

/** What a mention scan yields: literal runs, and the mentions between them. */
export type MentionRun = { kind: "text"; text: string } | { kind: "mention"; mention: Mention };

/**
 * Mentions only, with every other character left exactly as it is.
 *
 * An agent transcript is not a document: turning it into markdown would put emphasis on the
 * asterisks in a shell command and code boxes around the backticks in a log line. But a message
 * that says "look at @chair_launch_plan" has to show that as the link the person clicked to make
 * it, not as `[@chair_launch_plan](doc:…)`. So this is `parseInline` with exactly one rule.
 */
export function parseMentions(text: string): MentionRun[] {
  const out: MentionRun[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[") {
      const read = readMention(text.slice(i));
      if (read?.mention) {
        if (plain) out.push({ kind: "text", text: plain });
        plain = "";
        out.push({ kind: "mention", mention: read.mention });
        i += read.length;
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  if (plain) out.push({ kind: "text", text: plain });
  return out;
}

/**
 * Bold, italic, code, links and mentions — and nothing else.
 *
 * Code is matched first and its contents are never re-scanned, so `**` inside backticks stays two
 * asterisks. Every unmatched marker stays the literal character the user typed: a lone `*` is an
 * asterisk, not the start of an emphasis that swallows the rest of the sentence.
 *
 * Mentions are tried before ordinary links, because `asset:` and `doc:` are valid link hrefs as
 * far as the link rule is concerned and it would happily render one as an anchor out of the app.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";

  const flush = () => {
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: "code", text: code[1] });
      i += code[0].length;
      continue;
    }

    const mention = readMention(rest);
    if (mention) {
      if (mention.mention) {
        flush();
        out.push({ kind: "mention", mention: mention.mention });
      } else {
        plain += rest.slice(0, mention.length);
      }
      i += mention.length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: "link", href: link[2], children: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }

    const strong = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: "strong", children: parseInline(strong[2]) });
      i += strong[0].length;
      continue;
    }

    const em = /^(\*|_)([^*_]+?)\1/.exec(rest);
    if (em) {
      flush();
      out.push({ kind: "em", children: parseInline(em[2]) });
      i += em[0].length;
      continue;
    }

    plain += text[i];
    i += 1;
  }

  flush();
  return out;
}

// ──────────────────────────────────────────────────────────────────── the declaration, readably

export interface DeclarationLine {
  key: string;
  value: string;
  /** 1-based line in the whole document, so an error beside it can be matched to it. */
  line: number;
}

/**
 * The declaration's own lines, for rendering it as a statement rather than as source.
 *
 * This does NOT parse the declaration — `server/services/designDoc.ts` is the one parser, and the
 * page reads its result over `GET /api/design-docs`. This only says which document line each key
 * sits on, so the rendered statement can be pointed at by an error message that names a line.
 */
export function declarationLines(block: Extract<Block, { kind: "declaration" }>): DeclarationLine[] {
  return block.source.split("\n").map((line, i) => {
    const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    return {
      key: kv ? kv[1] : "",
      value: kv ? kv[2] : line.trim(),
      line: block.startLine + 1 + i,
    };
  });
}
