/**
 * The document: a page you can read, a page you can edit, and the agents in its margin.
 *
 * Three things share one scroll:
 *
 *   the paper       the document rendered as prose (`Prose.tsx`), one measured column wide
 *   the passages    a wash in the area colour over the lines an agent claims, right now
 *   the margin      one comment per claim, level with the passage it is about (`CommentRail.tsx`)
 *
 * **The text is never re-serialised.** Blocks keep the line range they came from, an edit rewrites
 * that range and nothing else, and Source view shows the file byte for byte. What changed from the
 * old surface is how it is drawn, not what is stored — a document the product rewrote on the way to
 * the screen is a document the user cannot trust, and that rule survives this rebuild intact.
 *
 * **Only positioned, current claims draw anything over the text.** A report with no line range, or
 * one made against an older version of the document, highlights NOTHING and says so in a card in
 * the margin. A highlight that keeps its position after the text under it moved is a fabricated
 * value with a colour on it.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { BlockEditor } from "./BlockEditor";
import { CommentRail, type Comment } from "./CommentRail";
import { parseBlocks, replaceLines, sliceLines, type Block } from "./markdown";
import { areaBorder, areaGutter } from "./PresenceEntry";
import { blockSpacing, ProseBlock } from "./Prose";
import { drawsHighlight, type PresenceReport, type PresenceState } from "./presence";
import type { DesignDocView } from "./useDesignDocs";

/** What a save is doing, so the page can say it rather than the user guessing. */
export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export interface DocumentSurfaceProps {
  doc: DesignDocView;
  reports: PresenceReport[];
  /** The presence state of each report, resolved once by the page so nothing recomputes it. */
  stateOf(report: PresenceReport): PresenceState;
  /**
   * The text on screen. Defaults to the document's — passed separately so a page holding an
   * unsaved draft shows the draft rather than flicking back to the server's copy mid-edit.
   */
  text?: string;
  /**
   * Commit an edit. **Absent means read-only**, and then no editor opens and no control offers one:
   * a page that let a user type into a document it cannot save would lose their work at the moment
   * they trusted it.
   */
  onEdit?(nextText: string): void;
  saveState?: SaveState;
  now?: number;
  onOpenAgent?(agentId: string): void;
}

/** Which blocks a reported line range covers, and which one the comment hangs off. */
function coverage(blocks: Block[], from: number, to: number): { lines: Set<number>; anchor?: number } {
  const lines = new Set<number>();
  for (const b of blocks) if (b.startLine <= to && b.endLine >= from) lines.add(b.startLine);
  if (lines.size > 0) return { lines, anchor: Math.min(...lines) };
  // The range fell in the gaps between blocks — blank lines, or past the end. The comment still
  // belongs somewhere legible, so it hangs off the next block down, and nothing is washed.
  const next = blocks.find((b) => b.startLine >= from);
  return { lines, anchor: next?.startLine ?? blocks[blocks.length - 1]?.startLine };
}

export function DocumentSurface({
  doc,
  reports,
  stateOf,
  text,
  onEdit,
  saveState,
  now = Date.now(),
  onOpenAgent,
}: DocumentSurfaceProps) {
  const source = text ?? doc.text;
  const blocks = useMemo(() => parseBlocks(source), [source]);

  // The declaration is parsed on the SERVER — `shared/designDocument.ts` exists because the CLI and
  // the browser once had two parsers and drifted. All the page does here is match each declared
  // area back to the line it was declared on, so the colour in the inspector and the colour in the
  // document are the same colour.
  const areaOfLine = useMemo(() => {
    const areas = doc.declaration?.declaration?.areas ?? [];
    const byLine = new Map(areas.map((a, index) => [a.line, { name: a.name, index }]));
    return (line: number) => byLine.get(line);
  }, [doc.declaration]);

  const [mode, setMode] = useState<"read" | "source">("read");
  /**
   * What is open for editing: a block, keyed by its first line, or the new paragraph at the end.
   * One at a time, like a document.
   */
  const [editing, setEditing] = useState<number | "append" | undefined>();
  const [draft, setDraft] = useState("");
  const [sourceDraft, setSourceDraft] = useState<string | undefined>();
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();

  const blockEls = useRef(new Map<number, HTMLElement>());
  const [tops, setTops] = useState<Record<string, number>>({});

  /**
   * Claims, resolved onto blocks.
   *
   * `drawsHighlight` is the gate, unchanged: only `live` and `stale` claim a position at all. The
   * rest become margin cards with no anchor, which is what the `unknown` row has always been.
   */
  const claims = useMemo(() => {
    return reports.map((report) => {
      const state = stateOf(report);
      const positioned = drawsHighlight(state) && report.lines;
      const cover = positioned ? coverage(blocks, report.lines!.from, report.lines!.to) : undefined;
      return { report, state, washed: cover?.lines ?? new Set<number>(), anchor: cover?.anchor };
    });
  }, [reports, stateOf, blocks]);

  /** Which claim, if any, washes this block. First wins; the margin lists all of them. */
  const claimOn = (startLine: number) => claims.find((c) => c.washed.has(startLine));

  // Measure where each anchored comment's passage actually sits. Heights depend on wrapped text and
  // on the loaded face, so this runs after every layout rather than on a dependency guess.
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const claim of claims) {
      if (claim.anchor === undefined) continue;
      const el = blockEls.current.get(claim.anchor);
      if (el) next[claim.report.agentId] = el.offsetTop;
    }
    setTops((prev) => {
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]);
      return same ? prev : next;
    });
  });

  const comments: Comment[] = claims.map((c) => ({
    report: c.report,
    state: c.state,
    top: c.anchor === undefined ? undefined : tops[c.report.agentId],
  }));

  const openEditor = (block: Block) => {
    if (!onEdit) return;
    setEditing(block.startLine);
    setDraft(sliceLines(source, block.startLine, block.endLine));
  };

  const commit = (block: Block) => {
    setEditing(undefined);
    const original = sliceLines(source, block.startLine, block.endLine);
    if (draft === original) return;
    onEdit?.(replaceLines(source, block.startLine, block.endLine, draft));
  };

  /**
   * A new paragraph at the end.
   *
   * Nothing is written when the editor opens — only when something has been typed into it. A blank
   * paragraph appended on click would put a save, a version and a changed document behind a click
   * that produced no words.
   */
  const commitAppend = () => {
    setEditing(undefined);
    if (draft.trim() === "") return;
    onEdit?.(`${source.replace(/\s*$/, "")}\n\n${draft}\n`);
  };

  return (
    <div data-testid="document-surface" className="min-w-0 flex-1 overflow-auto">
      <Toolbar
        mode={mode}
        onMode={(next) => {
          setMode(next);
          setEditing(undefined);
          setSourceDraft(next === "source" ? source : undefined);
        }}
        editable={Boolean(onEdit)}
        saveState={saveState}
        lineCount={(sourceDraft ?? source).split("\n").length}
      />

      {mode === "source" ? (
        <SourceView
          value={sourceDraft ?? source}
          onChange={setSourceDraft}
          editable={Boolean(onEdit)}
          onSave={() => {
            if (sourceDraft !== undefined && sourceDraft !== source) onEdit?.(sourceDraft);
            setMode("read");
            setSourceDraft(undefined);
          }}
          onCancel={() => {
            setMode("read");
            setSourceDraft(undefined);
          }}
        />
      ) : (
        // `relative` here is load-bearing, not cosmetic: it makes this row the offsetParent every
        // block measures against, which is what puts a comment level with its passage.
        <div className="relative mx-auto flex max-w-[1080px] gap-7 px-8 pb-24 pt-6">
          <article
            data-testid="document-paper"
            className="min-w-0 flex-1 rounded-[12px] border border-border bg-surface px-11 py-10 shadow-panel"
          >
            {blocks.length === 0 ? (
              <p className="text-[15px] text-ink-faint">
                This document is empty. {onEdit ? "Click below to write the first line." : null}
              </p>
            ) : null}

            {blocks.map((block, i) => {
              const claim = claimOn(block.startLine);
              const selected = claim && claim.report.agentId === selectedAgentId;
              const isEditing = editing === block.startLine;
              return (
                <div
                  key={`${block.startLine}-${block.kind}`}
                  ref={(el) => {
                    if (el) blockEls.current.set(block.startLine, el);
                    else blockEls.current.delete(block.startLine);
                  }}
                  data-testid={
                    claim ? `block-${block.startLine}-presence` : `block-${block.startLine}`
                  }
                  data-line={block.startLine}
                  onClick={() => {
                    // Clicks inside the open editor bubble up here. Reopening on each one would
                    // reset the draft to the file's text and throw away what was just typed.
                    if (isEditing) return;
                    if (claim) setSelectedAgentId(claim.report.agentId);
                    openEditor(block);
                  }}
                  className={`group relative ${blockSpacing(block, i === 0)}`}
                >
                  {/*
                    The line number, in the margin, on hover — and always when an agent has claimed
                    the passage, because every other surface in this product talks about this
                    document in line numbers and a claim you cannot locate is a claim you cannot
                    check.
                  */}
                  <span
                    aria-hidden="true"
                    className={`absolute -left-8 top-1 select-none font-mono text-[10px] text-ink-ghost ${
                      claim ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    }`}
                  >
                    {block.startLine}
                  </span>

                  {isEditing ? (
                    <BlockEditor
                      value={draft}
                      onChange={setDraft}
                      onCommit={() => commit(block)}
                      onCancel={() => setEditing(undefined)}
                      label={`Edit lines ${block.startLine} to ${block.endLine}`}
                    />
                  ) : (
                    <div
                      className={`rounded-[6px] ${
                        onEdit ? "cursor-text hover:bg-surface-hover" : ""
                      } ${
                        claim
                          ? `border-l-[3px] -ml-3.5 pl-3 ${areaBorder(claim.report.areaIndex)} ${areaGutter(
                              claim.report.areaIndex,
                            )} ${selected ? "ring-1 ring-accent/40" : ""}`
                          : "-ml-1.5 px-1.5"
                      }`}
                    >
                      <ProseBlock block={block} areaOfLine={areaOfLine} />
                    </div>
                  )}
                </div>
              );
            })}

            {onEdit && editing === "append" ? (
              <div className="mt-6">
                <BlockEditor
                  value={draft}
                  onChange={setDraft}
                  onCommit={commitAppend}
                  onCancel={() => setEditing(undefined)}
                  label="Write a new paragraph at the end of this document"
                />
              </div>
            ) : null}

            {onEdit && editing !== "append" ? (
              <button
                type="button"
                data-testid="append-paragraph"
                onClick={() => {
                  setEditing("append");
                  setDraft("");
                }}
                title="Add a paragraph at the end of this document"
                className="mt-6 w-full rounded-[6px] border border-dashed border-border px-3 py-2.5 text-left text-[14px] text-ink-ghost hover:border-border-strong hover:text-ink-faint"
              >
                Write another paragraph…
              </button>
            ) : null}
          </article>

          <CommentRail
            comments={comments}
            now={now}
            selectedAgentId={selectedAgentId}
            onSelect={setSelectedAgentId}
            onOpen={onOpenAgent}
          />
        </div>
      )}
    </div>
  );
}

function Toolbar({
  mode,
  onMode,
  editable,
  saveState,
  lineCount,
}: {
  mode: "read" | "source";
  onMode(next: "read" | "source"): void;
  editable: boolean;
  saveState?: SaveState;
  lineCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-canvas/90 px-8 py-1.5 backdrop-blur">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
        {lineCount} lines
      </span>
      <span className="flex-1" />
      <SaveBadge state={saveState} editable={editable} />
      <div className="flex overflow-hidden rounded-[6px] border border-border">
        {(["read", "source"] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`mode-${m}`}
            onClick={() => onMode(m)}
            title={m === "read" ? "Read and edit as a document" : "Edit the markdown source"}
            className={`px-2.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.06em] ${
              mode === m ? "bg-surface-active text-ink" : "text-ink-faint hover:bg-surface-hover"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the last save did. Never "Saved" for a save that has not happened. */
function SaveBadge({ state, editable }: { state?: SaveState; editable: boolean }) {
  if (!editable) {
    return (
      <span data-testid="save-readonly" className="text-[11px] text-ink-ghost">
        Read-only
      </span>
    );
  }
  if (!state || state.kind === "idle") return null;
  if (state.kind === "saving") {
    return (
      <span data-testid="save-state" className="text-[11px] text-ink-faint">
        Saving…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span data-testid="save-state" className="text-[11px] text-ink-faint">
        Saved
      </span>
    );
  }
  return (
    <span data-testid="save-error" className="text-[11px] text-status-failed" title={state.message}>
      Not saved — {state.message}
    </span>
  );
}

/**
 * The file, byte for byte, with its line numbers.
 *
 * Read mode is a view; this is the thing itself. It exists because the document's most consequential
 * lines are markup — the fenced `project` block that declares the work — and a person fixing one
 * needs to see exactly what is written, including the line numbers everything else quotes.
 */
function SourceView({
  value,
  onChange,
  editable,
  onSave,
  onCancel,
}: {
  value: string;
  onChange(next: string): void;
  editable: boolean;
  onSave(): void;
  onCancel(): void;
}) {
  const lines = value.split("\n");
  return (
    <div className="mx-auto max-w-[1080px] px-8 py-6">
      <div className="flex overflow-hidden rounded-[10px] border border-border bg-surface">
        <div
          aria-hidden="true"
          className="select-none border-r border-border px-2.5 py-3 text-right font-mono text-[12px] leading-[1.7] text-ink-ghost"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          data-testid="source-editor"
          aria-label="Design document source"
          value={value}
          readOnly={!editable}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          style={{ height: `${lines.length * 1.7 * 12 + 24}px` }}
          className="min-h-[300px] w-full resize-none bg-transparent px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-ink-muted outline-none"
        />
      </div>
      {editable ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="source-save"
            onClick={onSave}
            title="Save the whole document"
            className="rounded-[6px] border border-accent/50 bg-accent/10 px-3 py-1.5 text-[13px] text-ink hover:bg-accent/20"
          >
            Save document
          </button>
          <button
            type="button"
            data-testid="source-cancel"
            onClick={onCancel}
            title="Discard these changes"
            className="rounded-[6px] border border-border px-3 py-1.5 text-[13px] text-ink-faint hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
