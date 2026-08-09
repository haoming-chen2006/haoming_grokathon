/**
 * `@`-mentions — the one grammar, shared by the browser and the server.
 *
 * A mention is written as ordinary markdown:
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
 *
 * ── Why this is in `shared/` ──────────────────────────────────────────────────────────────────
 * It began in `client/src/control-room/designdoc/markdown.ts`, next to the rest of the inline
 * markup, and that was right while only the browser read it. Then the server had to read it too:
 * a mention the user typed at an agent reaches `acpSessionManager.send` as raw text, and until
 * something resolved it the agent received `[@x](asset:asset_…)` and an id it could not follow.
 *
 * The server cannot import the client — `tsconfig.json` excludes it, deliberately. So the choice
 * was a second regex on the server or this file, and the repository has already paid for having
 * two of something: `shared/designDocument.ts` exists for exactly that reason, and its own header
 * says why. `markdown.ts` re-exports these so nothing that already imported from there had to
 * change.
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
export function readMention(rest: string): { mention?: Mention; length: number } | undefined {
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

/** Every distinct mention in `text`, first occurrence first. One id mentioned twice yields one. */
export function uniqueMentions(text: string): Mention[] {
  const seen = new Set<string>();
  const out: Mention[] = [];
  for (const run of parseMentions(text)) {
    if (run.kind !== "mention") continue;
    const key = `${run.mention.kind}:${run.mention.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(run.mention);
  }
  return out;
}
