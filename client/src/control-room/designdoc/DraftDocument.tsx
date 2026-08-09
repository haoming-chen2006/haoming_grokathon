/**
 * The empty state of a project that has no design document — and the way out of it.
 *
 * A project may now be created from a name alone, which makes "this project has no brief yet" an
 * ordinary state rather than an impossible one. The page that would otherwise say so offers to
 * write it instead: say what you want in a sentence, an X agent drafts the document, and you edit
 * it before anything is saved.
 *
 * **The agent drafts; the user saves.** Two steps, deliberately. The draft comes back into an
 * editable box with its parse verdict beside it, and nothing reaches disk until Save is pressed —
 * an agent that quietly wrote the brief its own team then works from would be the review gate this
 * product exists to keep, removed.
 */
import { useEffect, useState } from "react";
import { draftDesignDoc, saveDesignDoc, type DraftResult } from "../agents/useAgents";

interface Props {
  projectId: string;
  /** Called with the new document's id once it is saved and attached to the project. */
  onSaved(docId: string): void;
}

/**
 * The project's name, read here rather than taken as a prop.
 *
 * `WorkspacePageProps` carries the id and not the name, and that contract belongs to the shell
 * branch — widening it to spare this component one request would be a shared-file change for a
 * private need. The fallback is a phrase, never an id: "proj_msk…" is not a project's name.
 */
function useProjectName(projectId: string): string {
  const [name, setName] = useState("This project");
  useEffect(() => {
    let live = true;
    if (!projectId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { name?: unknown };
        if (live && typeof body?.name === "string" && body.name.trim()) setName(body.name);
      } catch {
        // The heading falls back to "This project"; drafting does not depend on the name.
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId]);
  return name;
}

export function DraftDocument({ projectId, onSaved }: Props) {
  const projectName = useProjectName(projectId);
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "draft" | "save") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "draft") {
        const result = await draftDesignDoc({
          projectId,
          projectName,
          brief,
          // Revising rather than restarting: whatever is in the box is what the agent improves, so
          // a second press builds on the edits instead of discarding them.
          existing: text.trim() || undefined,
        });
        setDraft(result);
        setText(result.text);
      } else {
        const saved = await saveDesignDoc({ projectId, title: projectName, text });
        onSaved(saved.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="draft-document" className="mx-auto max-w-2xl p-8">
      <h1 className="text-[19px] text-ink">{projectName} has no design document yet</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-faint">
        The document is what declares the work: its areas become the boxes on the board, and an
        agent is confined to one of them. Say what you want in a sentence and an X agent will draft
        it — you edit it, and nothing is saved until you say so.
      </p>

      <textarea
        data-testid="draft-brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder="What do you want built? One or two sentences is enough."
        className="mt-4 w-full rounded border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-ghost"
      />

      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          data-testid="draft-submit"
          onClick={() => void run("draft")}
          disabled={busy !== null || !brief.trim()}
          title={brief.trim() ? "Ask an X agent for a document" : "Say what you want built first"}
          className="rounded border border-border-strong bg-surface-active px-3 py-1.5 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
        >
          {busy === "draft" ? "Drafting…" : draft ? "Draft again" : "Draft with X"}
        </button>
        {draft ? (
          <span data-testid="draft-model" className="text-[11px] text-ink-ghost">
            {draft.model}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" data-testid="draft-error" className="mt-2 text-[13px] text-status-failed">
          {error}
        </p>
      ) : null}

      {draft ? (
        <>
          {/* The parse verdict, before saving rather than after. A document whose `project` block is
              malformed still saves — losing the draft to report a line number is the worse failure —
              but the user gets to fix it here, where the text is still in front of them. */}
          {draft.declares ? (
            <p data-testid="draft-declares" className="mt-4 text-[13px] text-ink-faint">
              This declares the project and its areas. Read it, change anything, then save.
            </p>
          ) : (
            <div data-testid="draft-errors" className="mt-4 text-[13px] text-status-failed">
              {/* Two different failures. A block with mistakes has line numbers to print; a draft
                  with no block at all has none, and printing an empty list under "these are what to
                  fix" would say nothing is wrong with a document that declares nothing. */}
              <p>
                {draft.errors.length > 0
                  ? "The project block does not parse yet. It will still save; these are what to fix:"
                  : "This has no project block, so it would declare no areas and the board would have no boxes. Draft again, or add one before saving."}
              </p>
              {draft.errors.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-[12px]">
                  {draft.errors.map((e) => (
                    <li key={`${e.line}:${e.message}`}>
                      line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          <textarea
            data-testid="draft-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={20}
            className="mt-2 w-full rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink"
          />

          <button
            type="button"
            data-testid="draft-save"
            onClick={() => void run("save")}
            disabled={busy !== null || !text.trim()}
            className="mt-3 rounded border border-border-strong bg-surface-active px-3 py-1.5 text-[13px] text-ink hover:bg-surface-hover disabled:opacity-40"
          >
            {busy === "save" ? "Saving…" : "Save as this project's document"}
          </button>
        </>
      ) : null}
    </div>
  );
}
