/**
 * DESIGN DOCUMENTS — the page where work is declared and watched. The product's centre.
 *
 * A rail of documents with the open one and what is inside it, the document itself, and an
 * inspector that states what it costs, who is in it and what it declares.
 *
 * The document is a DOCUMENT now, not a file dump: prose rendered as prose, editable in place, with
 * each agent's claim drawn as a comment in the margin beside the passage it is about. The old
 * surface printed one monospace row per line with a gutter column, which is a correct rendering of
 * a file and a poor rendering of the thing that states what a person wants. `DocumentSurface.tsx`
 * holds that rebuild; `markdown.ts` is what keeps the two vocabularies — prose and line numbers —
 * pointing at the same bytes.
 *
 * What is real: every document, its text, its sections, its declaration, the declared areas and
 * their line numbers, and the team of whatever project follows it. All of it from endpoints that
 * exist.
 *
 * What was DELETED: `mockPresence.ts`, four invented agents that made this page look inhabited on
 * a machine where nothing was running. Presence is now derived from what agents actually report
 * (`reportsFromAgents`), which yields real entries with no line range — so those agents get a
 * comment card that says they have not reported which lines, and NOTHING is drawn over the text.
 * The range is filed in loops/handoff/pivot-frontend.md; the highlight machinery is built, tested
 * and waiting for it.
 */
import { useEffect, useMemo, useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { Money } from "../agents/AgentCard";
import { StartProject } from "../agents";
import { MentionTargetsProvider } from "../mentions";
import { DesignDocsRail, NEW_DOCUMENT } from "./DesignDocsRail";
import { DraftDocument } from "./DraftDocument";
import { DocumentSurface } from "./DocumentSurface";
import { PresenceEntry, PresenceKey, areaBorder, areaGutter, areaText } from "./PresenceEntry";
import { presenceState, type PresenceReport } from "./presence";
import { useDesignDocs } from "./useDesignDocs";
import { useDocumentEditor } from "./useDocumentEditor";

export type { DesignDocView } from "./useDesignDocs";
export { NEW_DOCUMENT } from "./DesignDocsRail";

function Label({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">{children}</div>
  );
}

/**
 * The clock the whole page reads.
 *
 * One value, ticking on an interval, rather than `Date.now()` at each call site: two components
 * computing "8s" and "9s" from the same report in the same paint is the kind of detail that makes
 * a user stop believing the rest of the numbers.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * What this document has cost: the sum of what the agents inside it have spent.
 *
 * The mockup prints $6.88 over three agents at $0.31, $1.05 and $5.52, so the figure is a sum of
 * the entries below it and not a separate ledger. Absent prices are not summed as zero — see
 * `Money`, which says "unknown" for a figure nobody computed.
 */
export function documentSpend(reports: PresenceReport[]): number | undefined {
  const priced = reports.map((r) => r.costUsd).filter((c): c is number => typeof c === "number");
  return priced.length === 0 ? undefined : priced.reduce((sum, c) => sum + c, 0);
}

// ───────────────────────────────────────────────────────────────────────── NAVIGATOR

export function DesignDocumentsNavigator({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { docs, doc, reports, loading, error } = useDesignDocs(projectId, selectionId);
  if (loading) return <p className="text-[13px] text-ink-faint">Loading design documents…</p>;
  if (error) return <p className="text-[13px] text-status-failed">{error}</p>;
  return (
    <DesignDocsRail
      docs={docs}
      open={selectionId === NEW_DOCUMENT ? undefined : doc}
      agentsInside={reports.length}
      onSelect={onSelect}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────── MAIN

/**
 * The page, with what an `@` can reach in scope for the whole of it.
 *
 * Above every early return and above the document itself, because both halves of a mention need
 * the same list: the picker offers it, and a mention already in the prose checks itself against it
 * before it is allowed to say its target is gone. One list, so the two cannot disagree.
 */
export function DesignDocumentsPage(props: WorkspacePageProps) {
  return (
    <MentionTargetsProvider projectId={props.projectId}>
      <DesignDocuments {...props} />
    </MentionTargetsProvider>
  );
}

function DesignDocuments({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { docs, doc, reports, loading, error, refresh, replaceDoc } = useDesignDocs(
    projectId,
    selectionId,
  );
  const now = useNow();
  const stateOf = useMemo(
    () => (report: PresenceReport) => presenceState(report, report.documentVersion ?? 0, now),
    [now],
  );
  // Above every early return: a document that fails to load must not change the number of hooks
  // this component runs.
  const editor = useDocumentEditor(doc, replaceDoc);

  if (loading) return <Centered>Loading design documents…</Centered>;
  if (error) return <Centered>{error}</Centered>;

  // Two different empty states, because they are two different situations.
  //
  // With a project, the missing thing is its BRIEF: the project exists, it just has not been
  // described yet, and the way out is to draft one — offering "start a project" to someone who is
  // standing inside one is an answer to a question they did not ask.
  //
  // With no project at all, the missing thing is the project, and the paste box is the front door.
  // An empty state that only describes the way in is not a way in.
  if (selectionId === NEW_DOCUMENT || (!doc && docs.length === 0)) {
    return (
      <div data-testid="documents-empty" className="h-full overflow-auto">
        {projectId ? (
          <DraftDocument
            projectId={projectId}
            onSaved={(docId) => {
              refresh();
              onSelect(docId);
            }}
          />
        ) : (
          <StartProject />
        )}
      </div>
    );
  }
  if (!doc) return <Centered>That document is gone. Pick another from the list.</Centered>;

  const spend = documentSpend(reports);

  return (
    <div data-testid="design-document" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-[18px] py-2.5">
        <span data-testid="doc-title" className="truncate text-[17px] text-ink">
          {doc.title}
        </span>
        {/* The cardinality rule, made visible: at most one project follows a document, ever. */}
        {doc.followedByProjectId ? (
          <span
            data-testid="doc-project"
            className="shrink-0 rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-ink-faint"
          >
            project · {doc.followedByProjectId}
          </span>
        ) : (
          <span data-testid="doc-not-followed" className="shrink-0 text-[12px] text-ink-faint">
            No project follows this document yet
          </span>
        )}
        <span className="flex-1" />
        <span
          data-testid="doc-summary"
          className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-faint"
        >
          This document <Money usd={spend} /> · {reports.length}{" "}
          {reports.length === 1 ? "agent" : "agents"} inside
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <DocumentSurface
          doc={doc}
          reports={reports}
          stateOf={stateOf}
          text={editor.text}
          onEdit={editor.save}
          saveState={editor.saveState}
          now={now}
          onOpenAgent={onSelect}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────── INSPECTOR

export function DesignDocumentInspector({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { doc, reports } = useDesignDocs(projectId, selectionId);
  const now = useNow();
  // Not `null`: WorkspacePageComponent is typed `=> JSX.Element`, so a slot cannot opt out of
  // rendering. Filed for 07-shell as an additive widening to `JSX.Element | null`.
  if (!doc) return <Label>Design document</Label>;

  const spend = documentSpend(reports);
  const declaration = doc.declaration?.declaration;
  const errors = doc.declaration?.errors ?? [];

  return (
    <>
      <Label>Project</Label>
      <p data-testid="inspector-project" className="text-[13px] text-ink-muted">
        {doc.followedByProjectId ?? "No project follows this document yet."}
      </p>

      <div className="flex justify-between text-[13px]">
        <span className="text-ink-faint">This document</span>
        <span data-testid="inspector-spend" className="font-mono text-[12px]">
          <Money usd={spend} />
        </span>
      </div>
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-faint">Agents inside</span>
        <span data-testid="inspector-inside" className="font-mono text-[12px] text-ink-muted">
          {reports.length}
        </span>
      </div>

      <div className="h-px bg-border" />

      <Label>Agents in this document</Label>
      {reports.length === 0 ? (
        <p data-testid="presence-empty" className="text-[13px] leading-snug text-ink-faint">
          Nobody is in this document. An agent appears here when its own reported activity names
          this file — nothing else puts it here, and nothing is shown that no agent claimed.
        </p>
      ) : (
        <>
          {reports.map((report) => (
            <PresenceEntry
              key={report.agentId}
              report={report}
              state={presenceState(report, report.documentVersion ?? 0, now)}
              now={now}
              onOpen={(agentId) => onSelect(agentId)}
            />
          ))}
          <PresenceKey />
        </>
      )}

      <div className="h-px bg-border" />

      <Label>Declaration</Label>
      {!declaration ? (
        <p className="text-[13px] text-ink-faint">
          This document declares nothing. Add a fenced <code>project</code> block to turn it into a
          project.
        </p>
      ) : (
        <>
          <div className="text-[16px] text-ink">{declaration.name}</div>
          <Row label="Category" value={declaration.category} />
          <div className="flex justify-between text-[13px]">
            <span className="text-ink-faint">Budget</span>
            <span className="font-mono text-[12px]">
              {declaration.budget === undefined ? (
                <span className="text-ink-faint">not stated</span>
              ) : (
                <Money usd={declaration.budget} />
              )}
            </span>
          </div>
          <Row label="Declared on" value={`lines ${declaration.blockStart}–${declaration.blockEnd}`} />

          <Label>Areas</Label>
          {declaration.areas.length === 0 ? (
            <p className="text-[12px] text-ink-faint">
              No areas declared — one implicit area covers the whole document.
            </p>
          ) : (
            declaration.areas.map((area, i) => (
              <div key={area.name} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2 w-2 rounded-sm border ${areaBorder(
                      (i % 6) + 1,
                    )} ${areaGutter((i % 6) + 1)}`}
                  />
                  <span className={`text-[14px] ${areaText((i % 6) + 1)}`}>{area.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-ink-ghost">line {area.line}</span>
                </div>
                {area.description ? (
                  <p className="pl-4 text-[12px] leading-snug text-ink-faint">{area.description}</p>
                ) : null}
              </div>
            ))
          )}
        </>
      )}

      {doc.declaration && !doc.declaration.ok && errors.length > 0 ? (
        <>
          <div className="h-px bg-border" />
          <Label>Refused</Label>
          {errors.map((e) => (
            <p key={`${e.line}-${e.message}`} className="text-[12px] text-status-failed">
              line {e.line}: {e.message}
            </p>
          ))}
        </>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink-muted">{value}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-sm text-center text-[13px] text-ink-faint">{children}</p>
    </div>
  );
}

export const DESIGNDOCS_PAGE_SLOTS = {
  main: DesignDocumentsPage,
  navigator: DesignDocumentsNavigator,
  inspector: DesignDocumentInspector,
};
