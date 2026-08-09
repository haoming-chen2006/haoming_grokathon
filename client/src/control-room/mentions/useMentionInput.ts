/**
 * Typing `@` in a textarea, and what happens next.
 *
 * One hook, two surfaces: the design document's block editor and the agent's message box. Both are
 * plain textareas with behaviour of their own — one commits on ⌘↵ and cancels on Escape, the other
 * sends — so this cannot own the element. It owns the three things that are the same on both: when
 * the picker is open, which key belongs to it, and where the inserted text goes.
 *
 * `handleKey` returns a boolean rather than swallowing everything, and that is the whole contract
 * with the host. Escape with the picker open closes the picker; Escape with it shut still cancels
 * the edit. Enter with a match highlighted inserts it; Enter with nothing to insert is still a
 * newline. A picker that ate Escape unconditionally would trap somebody in a block editor.
 *
 * The insertion is computed from the textarea's OWN value, not from the `value` prop, because a
 * click on the list happens between renders and the DOM is the copy that is certainly current.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { mentionLabel, mentionMarkdown } from "../designdoc/markdown";
import { matchTargets, targetName, useMentionTargets, type MentionTarget, type MentionTargets } from "./targets";

/**
 * What opens the picker: an `@` at a word boundary, and the characters typed since.
 *
 * The boundary is what keeps an email address out of it — `sales@aeris.com` has no whitespace
 * before its `@`. The query stops at a bracket so that `(@` and `@x)` behave, and at a second `@`
 * so that a mis-typed one starts a new attempt rather than extending a dead one.
 */
const TRIGGER = /(?:^|[\s([{<>"'])@([^\s@[\]()]*)$/;

/** How many rows the list shows before it asks for more typing instead of scrolling forever. */
const SHOWN = 8;

export interface MentionInput {
  open: boolean;
  query: string;
  /** The visible rows, capped at SHOWN. */
  matches: MentionTarget[];
  /** How many further targets matched but are not drawn. Zero when everything is shown. */
  overflow: number;
  active: number;
  /** Loading, error and emptiness, so the picker can state which one it is. */
  targets: MentionTargets;
  setActive(index: number): void;
  choose(target: MentionTarget): void;
  close(): void;
  /** Call after anything that could have moved the caret or changed the text. */
  sync(el: HTMLTextAreaElement | null): void;
  /** Call FIRST in the textarea's onKeyDown. True means the picker consumed the key. */
  handleKey(e: KeyboardEvent<HTMLTextAreaElement>): boolean;
}

export function useMentionInput(
  ref: RefObject<HTMLTextAreaElement | null>,
  onChange: (next: string) => void,
): MentionInput {
  const targets = useMentionTargets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  /** Where the `@` sits and where the caret was, in the text as the textarea last held it. */
  const trigger = useRef<{ start: number; caret: number } | null>(null);
  /** The trigger position Escape dismissed. Cleared once the caret leaves that `@`. */
  const dismissed = useRef<number | null>(null);
  /** Mirrors `query` so a keystroke that did not change it does not reset the highlight. */
  const queryRef = useRef("");
  /** Where the caret goes after an insertion, applied once the new value has rendered. */
  const pendingCaret = useRef<number | null>(null);

  const all = useMemo(() => matchTargets(targets.targets, query), [targets.targets, query]);
  const matches = useMemo(() => all.slice(0, SHOWN), [all]);
  const overflow = all.length - matches.length;

  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null) return;
    pendingCaret.current = null;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
  });

  const close = useCallback(() => {
    dismissed.current = trigger.current?.start ?? null;
    setOpen(false);
  }, []);

  const sync = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return;
      // Without a project there is nothing to link to, and an empty list is not the same claim as
      // "this project has nothing in it". The picker stays shut and `@` is just a character.
      if (!targets.projectId) {
        trigger.current = null;
        setOpen(false);
        return;
      }
      const caret = el.selectionStart ?? el.value.length;
      const match = TRIGGER.exec(el.value.slice(0, caret));
      if (!match) {
        trigger.current = null;
        dismissed.current = null;
        setOpen(false);
        return;
      }
      const start = caret - match[1].length - 1;
      trigger.current = { start, caret };
      if (dismissed.current !== null && dismissed.current !== start) dismissed.current = null;
      if (dismissed.current === start) {
        setOpen(false);
        return;
      }
      if (queryRef.current !== match[1]) {
        queryRef.current = match[1];
        setQuery(match[1]);
        setActive(0);
      }
      setOpen(true);
    },
    [targets.projectId],
  );

  const choose = useCallback(
    (target: MentionTarget) => {
      const el = ref.current;
      const spot = trigger.current;
      if (!el || !spot) return;
      const text = el.value;
      const markdown = mentionMarkdown({
        kind: target.kind,
        id: target.id,
        label: mentionLabel(targetName(target)),
      });
      // A trailing space, because the next thing typed is a word and not the end of the link.
      const inserted = `${markdown} `;
      const next = text.slice(0, spot.start) + inserted + text.slice(spot.caret);
      pendingCaret.current = spot.start + inserted.length;
      trigger.current = null;
      dismissed.current = null;
      queryRef.current = "";
      setOpen(false);
      setQuery("");
      onChange(next);
    },
    [onChange, ref],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return false;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return true;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (matches.length === 0) return false;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : matches.length - 1;
        setActive((i) => (i + step) % matches.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        // ⌘↵ is the block editor's save and stays its save. A modifier means the host's command,
        // not this list's default.
        if (e.metaKey || e.ctrlKey || e.altKey) return false;
        // Nothing highlighted is nothing to insert. The key goes back to the host, so Enter in an
        // empty project is still a newline rather than a keystroke that vanishes.
        if (matches.length === 0) return false;
        e.preventDefault();
        choose(matches[Math.min(active, matches.length - 1)]);
        return true;
      }
      return false;
    },
    [open, matches, active, choose, close],
  );

  return {
    open: open && Boolean(targets.projectId),
    query,
    matches,
    overflow,
    active: Math.min(active, Math.max(matches.length - 1, 0)),
    targets,
    setActive,
    choose,
    close,
    sync,
    handleKey,
  };
}
