/**
 * The DESIGN DOCUMENTS rail — the navigator region, as `design/mockups/design-document.html`
 * draws it: a search, the one document that is open with what is happening inside it, everything
 * else under RECENT, and the way to start a new one.
 *
 * OPEN NOW carries the counts and RECENT does not, and that is the mockup's own division rather
 * than an economy: "N agents inside" is derived per document from that document's project team, so
 * pricing every row would mean a request per row for a number nobody is reading.
 */
import { useState } from "react";
import { Money } from "../agents/AgentCard";
import type { DesignDocView } from "./useDesignDocs";

/**
 * The selection that means "no document — show the paste box".
 *
 * A sentinel rather than a second prop, because the shell gives a page exactly one selection slot.
 * It cannot collide with a real id: `slugFor` in `server/routes/designDocs.ts` maps every run of
 * non-alphanumerics to a single dash, so no document is ever named with underscores.
 */
export const NEW_DOCUMENT = "__new__";

export interface DesignDocsRailProps {
  docs: DesignDocView[];
  /** The open document. The rail does not choose it; the page does, and passes it in. */
  open?: DesignDocView;
  /** How many agents are inside the open document right now. */
  agentsInside: number;
  onSelect(selectionId: string | undefined): void;
}

export function DesignDocsRail({ docs, open, agentsInside, onSelect }: DesignDocsRailProps) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = (doc: DesignDocView) => !needle || doc.title.toLowerCase().includes(needle);
  const recent = docs.filter((d) => d.id !== open?.id).filter(matches);
  const declared = open?.declaration?.declaration?.budget;

  return (
    <div data-testid="docs-rail" className="flex min-h-0 flex-1 flex-col gap-2">
      <input
        data-testid="docs-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search design documents"
        aria-label="Search design documents"
        className="rounded-[7px] border border-border-strong bg-transparent px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-ghost"
      />

      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Open now</div>
      {open && matches(open) ? (
        <button
          type="button"
          data-testid={`docs-open-${open.id}`}
          onClick={() => onSelect(open.id)}
          title={`Show ${open.title}`}
          className="flex flex-col gap-0.5 rounded-md bg-surface-active px-2.5 py-2 text-left text-[13px] text-ink"
        >
          <span className="truncate">{open.title}</span>
          <span className="flex gap-1 truncate text-[12px] text-ink-faint">
            {agentsInside} {agentsInside === 1 ? "agent" : "agents"} inside ·{" "}
            {/* "$X declared" is the document's own `project` block, not a running total. */}
            {declared === undefined ? (
              <span title="This document declares no budget.">no budget declared</span>
            ) : (
              <>
                <Money usd={declared} /> declared
              </>
            )}
          </span>
        </button>
      ) : (
        <p data-testid="docs-none-open" className="px-2 text-[13px] text-ink-faint">
          {docs.length === 0 ? "No documents yet." : "Nothing open."}
        </p>
      )}

      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">Recent</div>
      {recent.length === 0 ? (
        <p data-testid="docs-no-recent" className="px-2 text-[13px] text-ink-faint">
          {needle ? `Nothing else matches “${query}”.` : "Nothing else yet."}
        </p>
      ) : (
        recent.map((doc) => (
          <button
            key={doc.id}
            type="button"
            data-testid={`docs-recent-${doc.id}`}
            onClick={() => onSelect(doc.id)}
            title={`Show ${doc.title}`}
            className="truncate rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-muted hover:bg-surface-hover"
          >
            {doc.title}
          </button>
        ))
      )}

      <div className="flex-1" />

      <button
        type="button"
        data-testid="new-design-document"
        onClick={() => onSelect(NEW_DOCUMENT)}
        title="Paste a new design document"
        className="rounded-[7px] border border-dashed border-border-strong px-2.5 py-2 text-center text-[13px] text-ink-faint hover:bg-surface-hover"
      >
        New design document
      </button>
    </div>
  );
}
