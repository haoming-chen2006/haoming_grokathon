/**
 * Editing one block, in place.
 *
 * A design document is the sentence a person writes to say what they want, and until now the only
 * way to change one was to delete it and paste a new one. That is not an editor; it is a form with
 * one field. So: click a paragraph, it becomes a textarea holding that paragraph's own markdown,
 * type, and it saves.
 *
 * **Only the block's own lines are ever rewritten.** The textarea opens on
 * `sliceLines(text, block.startLine, block.endLine)` and commits through `replaceLines` over that
 * same range, so an edit to one paragraph cannot reformat the document around it. Everything the
 * user did not touch is byte-identical after a save.
 *
 * The source, not a rich-text approximation of it: what is in the file is markdown, the declaration
 * block is markdown that means something, and an editor that hid the markup would be an editor that
 * could not type a heading. Mono while editing says the same thing — this is the machine-readable
 * form — and the block returns to prose the moment it commits.
 */
import { useEffect, useLayoutEffect, useRef } from "react";

export interface BlockEditorProps {
  /** The block's own markdown, as it is in the file. */
  value: string;
  onChange(next: string): void;
  /** Write the draft back into the document. */
  onCommit(): void;
  /** Leave the block as it was. */
  onCancel(): void;
  /** Committed by keyboard, so focus should move to the next block rather than out of the page. */
  onCommitAndNext?(): void;
  label: string;
}

export function BlockEditor({ value, onChange, onCommit, onCancel, onCommitAndNext, label }: BlockEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Grow with the text. A fixed-height box that scrolls internally makes a five-line paragraph feel
  // like a form field; the point of editing in place is that the page keeps its shape.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="rounded-[8px] border border-accent/50 bg-canvas">
      <textarea
        ref={ref}
        data-testid="block-editor"
        aria-label={label}
        value={value}
        spellCheck
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
            return;
          }
          // ⌘↵ / Ctrl+↵ commits. Plain Enter is a newline: this is a document, and a paragraph that
          // saved itself every time someone pressed Return would be unusable to write in.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (onCommitAndNext ?? onCommit)();
          }
        }}
        // Clicking elsewhere in the document saves. A user who clicks away from a paragraph they
        // just typed means to keep it, and an editor that discards on blur loses work silently.
        onBlur={onCommit}
        className="block w-full resize-none bg-transparent px-3.5 py-2.5 font-mono text-[13px] leading-[1.7] text-ink outline-none"
      />
      <div className="flex items-center gap-3 border-t border-border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
        <span>⌘↵ save</span>
        <span>esc cancel</span>
        <span className="flex-1" />
        <span>markdown</span>
      </div>
    </div>
  );
}
