/**
 * Saving an edit to a design document.
 *
 * One endpoint — `PUT /api/design-docs/:docId` — and three facts the page has to be able to state:
 * what is on screen, whether it reached the server, and what happened if it did not.
 *
 * **The draft is authoritative while it is unsaved.** The surface renders `text` from here, not
 * `doc.text`, so a save in flight cannot make the paragraph the user just typed flick back to the
 * server's older copy and then forward again.
 *
 * **A failed save says so and keeps the text.** `saveState` goes to `error` with the server's own
 * sentence and the draft stays exactly as typed. The one thing an editor must never do is lose what
 * somebody wrote, and the second is claim it saved when it did not — so there is no branch here
 * that resets the draft on failure, and none that reports `saved` for a request that errored.
 *
 * Concurrency: `expectedText` carries what this client believes the server holds. If somebody else
 * changed the file in the meantime the server answers 409 and the message names that, rather than
 * one edit silently overwriting the other.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "./DocumentSurface";
import type { DesignDocView } from "./useDesignDocs";

export interface DocumentEditor {
  /** What the surface renders: the local draft when there is one, otherwise the server's text. */
  text?: string;
  save(next: string): void;
  saveState: SaveState;
}

export function useDocumentEditor(
  doc: DesignDocView | undefined,
  onSaved?: (saved: DesignDocView) => void,
): DocumentEditor {
  const [draft, setDraft] = useState<string | undefined>();
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  /** What the server is believed to hold. Sent as `expectedText` so a clobber is refused. */
  const base = useRef<string | undefined>(doc?.text);
  /** One request at a time; a save arriving mid-flight becomes the next one. */
  const inFlight = useRef(false);
  const queued = useRef<string | undefined>();
  const docId = doc?.id;

  // Keyed on the DOCUMENT, not on its text. A different document is a different draft — carrying
  // one over would paste one document's words into another's file. Re-running when the text
  // changed would instead throw away the edit that just changed it.
  useEffect(() => {
    setDraft(undefined);
    setSaveState({ kind: "idle" });
    base.current = doc?.text;
    queued.current = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const put = useCallback(
    async (id: string, text: string) => {
      inFlight.current = true;
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch(`/api/design-docs/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, expectedText: base.current }),
        });
        const body = await res.text();
        const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null;
        if (!res.ok) {
          const message =
            parsed && typeof parsed.error === "string" ? parsed.error : `save returned ${res.status}`;
          setSaveState({ kind: "error", message });
          return;
        }
        base.current = text;
        setSaveState({ kind: "saved" });
        if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
          onSaved?.(parsed as unknown as DesignDocView);
        }
      } catch (e) {
        setSaveState({ kind: "error", message: String((e as Error).message ?? e) });
      } finally {
        inFlight.current = false;
        const next = queued.current;
        queued.current = undefined;
        if (next !== undefined) void put(id, next);
      }
    },
    [onSaved],
  );

  const save = useCallback(
    (next: string) => {
      setDraft(next);
      if (!docId) return;
      if (inFlight.current) {
        queued.current = next;
        return;
      }
      void put(docId, next);
    },
    [docId, put],
  );

  return { text: draft ?? doc?.text, save, saveState };
}
