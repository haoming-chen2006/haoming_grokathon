/**
 * The list an `@` opens: this project's assets and design documents, filtered as you type.
 *
 * Keyboard first. A picker you can only click is one nobody uses mid-sentence, so ↑↓ move, ↵ and ⇥
 * insert, Escape closes — and the footer says so, because a keyboard affordance nobody is told
 * about is one nobody has.
 *
 * Options commit on `mousedown` as well as on click, with the default prevented. The block editor
 * saves the paragraph when its textarea blurs; without that, clicking a row here would commit the
 * half-typed `@ch` first and then insert the link into a paragraph that had already been written
 * back.
 *
 * Everything starts empty, so the empty case is the normal case on a fresh install: it says, in
 * plain language, that there is nothing to link to yet. It never borrows an example to look
 * populated.
 */
import { kindLabel, targetName } from "./targets";
import type { MentionInput } from "./useMentionInput";

export function MentionPicker({
  input,
  placement = "below",
}: {
  input: MentionInput;
  /**
   * Which side of the textarea the list hangs off.
   *
   * `above` for a message box that sits at the bottom of its panel, where a list drawn below would
   * be half off the screen and over the Send button.
   */
  placement?: "above" | "below";
}) {
  if (!input.open) return null;
  const { targets, matches, active, query, overflow } = input;

  return (
    <div
      data-testid="mention-picker"
      className={`absolute left-0 right-0 z-30 overflow-hidden rounded-[8px] border border-border-strong bg-surface shadow-panel ${
        placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
      }`}
    >
      <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">
        Link to an asset or a design document
      </div>

      {targets.loading ? (
        <p data-testid="mention-loading" className="px-3 py-2.5 text-[13px] text-ink-faint">
          Reading this project's assets and design documents…
        </p>
      ) : targets.targets.length === 0 ? (
        <p data-testid="mention-empty" className="px-3 py-2.5 text-[13px] leading-snug text-ink-faint">
          This project has no assets and no design documents yet, so there is nothing to link to.
        </p>
      ) : matches.length === 0 ? (
        <p data-testid="mention-no-match" className="px-3 py-2.5 text-[13px] text-ink-faint">
          Nothing here is called “{query}”.
        </p>
      ) : (
        <div role="listbox" aria-label="Assets and design documents" className="max-h-64 overflow-y-auto">
          {matches.map((target, i) => (
            <button
              key={`${target.kind}:${target.id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              data-testid={`mention-option-${target.id}`}
              onMouseEnter={() => input.setActive(i)}
              // Keep the focus in the textarea: see the note at the top of this file.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => input.choose(target)}
              className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left ${
                i === active ? "bg-surface-active" : "hover:bg-surface-hover"
              }`}
            >
              {/* The kind is a word, never a colour or an icon on its own. */}
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
                {kindLabel(target.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{targetName(target)}</span>
              <span className="shrink-0 truncate font-mono text-[10px] text-ink-ghost">{target.id}</span>
            </button>
          ))}
          {overflow > 0 ? (
            <p data-testid="mention-overflow" className="px-3 py-1.5 text-[12px] text-ink-ghost">
              {overflow} more {overflow === 1 ? "match" : "matches"} — keep typing to narrow it.
            </p>
          ) : null}
        </div>
      )}

      {/* A partial failure still lists what did arrive, and names what it could not read. */}
      {targets.error ? (
        <p data-testid="mention-error" className="border-t border-border px-3 py-1.5 text-[12px] text-status-failed">
          {targets.error}
        </p>
      ) : null}

      <div className="flex gap-3 border-t border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">
        <span>↑↓ move</span>
        <span>↵ insert</span>
        <span>esc close</span>
      </div>
    </div>
  );
}
