import { useEffect, useState } from "react";
import type { DesignDocumentView } from "./projectTypes";

interface Props {
  document: DesignDocumentView | null;
  loading?: boolean;
  /** Persist new content. Resolves with the new version number. */
  onSave?: (content: string) => Promise<number> | number;
  /** Import/paste an existing design in place of the current content. */
  onImport?: (content: string) => Promise<number> | number;
  readOnly?: boolean;
}

/**
 * The canonical design document (§11A centre panel). Editable by the user only — agents propose
 * changes as suggestions and never write here directly (§4, enforced server-side by V-014).
 */
export function DesignDocumentPanel({ document, loading, onSave, onImport, readOnly }: Props) {
  const [draft, setDraft] = useState(document?.content ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when a different document (or a new version) arrives, unless the user is mid-edit —
  // clobbering unsaved typing would lose work.
  useEffect(() => {
    if (!dirty) setDraft(document?.content ?? "");
  }, [document?.content, document?.version, dirty]);

  if (loading) {
    return (
      <div data-testid="document-loading" className="p-4 text-sm text-white/50">
        Loading design document…
      </div>
    );
  }

  if (!document) {
    return (
      <div data-testid="document-empty" className="p-4 text-sm text-white/50">
        No design document yet. Create one, or paste an existing design to import it.
      </div>
    );
  }

  async function commit(action: "save" | "import") {
    const handler = action === "import" ? onImport ?? onSave : onSave;
    if (!handler) return;
    setSaving(true);
    setError(null);
    try {
      await handler(draft);
      setDirty(false);
    } catch (err) {
      // A rejected write (e.g. a version conflict) must be shown, never swallowed.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="document-panel" className="flex h-full flex-col p-4 text-white">
      <div className="mb-2 flex items-center gap-3">
        <h2 data-testid="document-title" className="text-sm font-semibold">
          {document.title}
        </h2>
        <span data-testid="document-version" className="text-xs text-white/50">
          v{document.version}
        </span>
        {dirty && (
          <span data-testid="document-dirty" className="text-xs text-yellow-400">
            Unsaved changes
          </span>
        )}
      </div>

      <textarea
        data-testid="document-content"
        aria-label="Design document content"
        readOnly={readOnly}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        className="min-h-[12rem] flex-1 resize-none rounded border border-white/10 bg-neutral-950 p-3 font-mono text-xs text-white/90"
      />

      {error && (
        <div data-testid="document-error" role="alert" className="mt-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="document-save"
            disabled={!dirty || saving}
            onClick={() => commit("save")}
            className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            data-testid="document-import"
            disabled={saving}
            onClick={() => commit("import")}
            className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            Import
          </button>
        </div>
      )}
    </div>
  );
}
