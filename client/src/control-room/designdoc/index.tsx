/**
 * DESIGN DOCUMENTS — the page where work is declared and watched.
 *
 * Mounted through the shell's published contract (`shell/contract.ts`): three components, one per
 * region, each taking `WorkspacePageProps`. Nothing here reaches into the shell — no toolbar, no
 * theme, no routing. Colours are the published tokens and there is not one hex in this directory.
 *
 * What is real: every document, its text, its sections, its declaration, the declared areas and
 * their line numbers. All of it comes from `GET /api/design-docs`, parsed by the one server-side
 * parser in `services/designDoc.ts`.
 *
 * What is not: line-level presence, which is quarantined in `mockPresence.ts` and clearly labelled
 * on screen. `server/services/presence.ts` does not exist yet.
 */
import { useEffect, useMemo, useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { mockPresence } from "./mockPresence";
import {
  PRESENCE_ENCODING,
  drawsHighlight,
  elapsed,
  presenceCaption,
  presenceState,
  type PresenceReport,
  type PresenceState,
} from "./presence";

// ─────────────────────────────────────────────────────────────────── the server's shape

interface DeclaredArea {
  name: string;
  description?: string;
  line: number;
}
interface ProjectDeclaration {
  name: string;
  category: string;
  budget?: number;
  areas: DeclaredArea[];
  blockStart: number;
  blockEnd: number;
}
interface DeclarationResult {
  ok: boolean;
  declaration?: ProjectDeclaration;
  errors: Array<{ line: number; message: string }>;
}
interface DocSectionView {
  title: string;
  body: string;
  firstLine: number;
}
export interface DesignDocView {
  id: string;
  title: string;
  text: string;
  lineCount: number;
  sections: DocSectionView[];
  declaration: DeclarationResult;
  followedByProjectId?: string;
}

/** One fetch, shared by all three regions, so they cannot disagree about what is on screen. */
function useDesignDocs(): { docs: DesignDocView[]; loading: boolean; error?: string } {
  const [state, setState] = useState<{ docs: DesignDocView[]; loading: boolean; error?: string }>({
    docs: [],
    loading: true,
  });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/design-docs");
        if (!res.ok) throw new Error(`GET /api/design-docs returned ${res.status}`);
        const body = await res.json();
        // Checked, not asserted. `as DesignDocView[]` is a claim about a value that arrived over a
        // network, and when the body was anything else — an error object, a stubbed fetch in a test
        // — `docs.map` threw during render. With no error boundary above, that unmounted the whole
        // shell: the page went blank and only a reload brought it back.
        if (!Array.isArray(body)) {
          throw new Error(
            `GET /api/design-docs returned ${typeof body === "object" && body && "error" in body
              ? String((body as { error: unknown }).error)
              : "something that is not a list of documents"}`,
          );
        }
        if (live) setState({ docs: body as DesignDocView[], loading: false });
      } catch (e) {
        // Stated, never swallowed into an empty list: "no documents" and "could not load
        // documents" are different facts and the page must not conflate them.
        if (live) setState({ docs: [], loading: false, error: String((e as Error).message ?? e) });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return state;
}

const useDoc = (docs: DesignDocView[], selectionId?: string) =>
  docs.find((d) => d.id === selectionId) ?? docs[0];

function Label({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">{children}</div>
  );
}

const AREA_TEXT = ["text-area-1", "text-area-2", "text-area-3", "text-area-4", "text-area-5", "text-area-6"];
const AREA_BORDER = [
  "border-area-1",
  "border-area-2",
  "border-area-3",
  "border-area-4",
  "border-area-5",
  "border-area-6",
];
const AREA_GUTTER = [
  "bg-gutter-area-1",
  "bg-gutter-area-2",
  "bg-gutter-area-3",
  "bg-gutter-area-4",
  "bg-gutter-area-5",
  "bg-gutter-area-6",
];

// ─────────────────────────────────────────────────────────────────────── presence marker

/**
 * The 9px marker.
 *
 * Colour says *which agent*; the stroke says *what state*. Filled, dashed and dotted are three
 * different shapes at 9px, so the four states survive greyscale, and every one of them is written
 * out in words beside it. The marker itself is aria-hidden — the caption carries the meaning.
 */
function Marker({ state, areaIndex }: { state: PresenceState; areaIndex: number }) {
  const enc = PRESENCE_ENCODING[state];
  const stroke =
    enc.stroke === "filled" ? "border-solid" : enc.stroke === "dashed" ? "border-dashed" : "border-dotted";
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[9px] w-[9px] shrink-0 rounded-full border ${stroke} ${
        AREA_BORDER[areaIndex - 1]
      } ${enc.filled ? "bg-current " + AREA_TEXT[areaIndex - 1] : ""}`}
    />
  );
}

/** The legend. The wireframe carries one and it is the reason its encoding reads at a glance. */
function PresenceKey() {
  const rows: PresenceState[] = ["live", "stale", "unknown", "ended"];
  return (
    <div data-testid="presence-key" className="flex flex-col gap-1.5 border-t border-border pt-3">
      <Label>Key</Label>
      {rows.map((s) => (
        <div key={s} className="flex items-center gap-2 text-[12px] text-ink-faint">
          <Marker state={s} areaIndex={1} />
          <span>
            {PRESENCE_ENCODING[s].label} — {PRESENCE_ENCODING[s].stroke}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────── the document

/**
 * The document itself, line-numbered, with presence in the gutter.
 *
 * The text is rendered exactly as written — never re-serialised — because a document the product
 * rewrote on the way to the screen is a document the user cannot trust. Line numbers are computed
 * on read; a stored line number is a line number that goes wrong on the next edit.
 */
function DocumentSurface({
  doc,
  reports,
  now,
}: {
  doc: DesignDocView;
  reports: PresenceReport[];
  now: number;
}) {
  const lines = doc.text.split("\n");
  const decl = doc.declaration.declaration;

  // Only live and stale claim a position. ended and unknown deliberately draw nothing here.
  const claims = reports
    .map((r) => ({ report: r, state: presenceState(r, 1, now) }))
    .filter((c) => drawsHighlight(c.state) && c.report.lines);

  const claimFor = (lineNo: number) =>
    claims.find((c) => lineNo >= c.report.lines!.from && lineNo <= c.report.lines!.to);

  /**
   * Which declared area, if any, was declared on this line.
   *
   * This is the one place the document and the inspector are visibly the same object: area 3 in
   * the list and the line that declares area 3 carry the same colour, so "what this document
   * declares" is legible without reading the inspector at all. The index is the area's position in
   * the declaration, which is exactly what the inspector uses, so the two cannot disagree.
   */
  const areaOnLine = (lineNo: number) => {
    const i = decl?.areas.findIndex((a) => a.line === lineNo) ?? -1;
    return i >= 0 ? { area: decl!.areas[i], index: i } : undefined;
  };

  return (
    <div data-testid="document-surface" className="min-w-0 flex-1 overflow-auto px-6 py-5">
      <div className="mb-4 flex flex-col gap-1.5">
        <h1 className="text-[20px] text-ink">{doc.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
          {/* The cardinality rule, made visible: at most one project, ever. */}
          {doc.followedByProjectId ? (
            <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-muted">
              project · {doc.followedByProjectId}
            </span>
          ) : (
            <span
              data-testid="not-followed"
              className="rounded border border-border px-2 py-0.5 text-[12px] text-ink-faint"
            >
              No project follows this document yet
            </span>
          )}
          <span>
            {doc.lineCount} lines · {doc.sections.length} sections
          </span>
        </div>
      </div>

      <div className="font-mono text-[12px] leading-[1.7]">
        {lines.map((line, i) => {
          const lineNo = i + 1;
          const claim = claimFor(lineNo);
          const inDeclaration = decl && lineNo >= decl.blockStart && lineNo <= decl.blockEnd;
          const declared = areaOnLine(lineNo);
          const enc = claim ? PRESENCE_ENCODING[claim.state] : undefined;
          const rule =
            enc?.stroke === "filled" ? "border-solid" : enc?.stroke === "dashed" ? "border-dashed" : "";
          // Presence wins the rule when both apply: a live agent is the more urgent fact, and the
          // declared area keeps its colour on the text itself.
          const edge = claim
            ? `${AREA_BORDER[claim.report.areaIndex - 1]} ${rule} ${AREA_GUTTER[claim.report.areaIndex - 1]}`
            : declared
              ? `${AREA_BORDER[declared.index % 6]} border-solid ${AREA_GUTTER[declared.index % 6]}`
              : "border-transparent";
          return (
            <div
              key={lineNo}
              data-testid={
                claim ? `line-${lineNo}-presence` : declared ? `line-${lineNo}-area` : undefined
              }
              className={`flex gap-3 border-l-[3px] pl-3 ${edge}`}
            >
              <span className="w-8 shrink-0 select-none text-right text-ink-ghost">{lineNo}</span>
              {/* The gutter word: the state is legible without reading the colour. */}
              <span className="w-24 shrink-0 truncate text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                {claim && claim.report.lines?.from === lineNo
                  ? `${claim.report.agentName} · ${PRESENCE_ENCODING[claim.state].label}`
                  : declared
                    ? `area · ${declared.area.name}`
                    : ""}
              </span>
              <span
                className={`min-w-0 whitespace-pre-wrap ${
                  inDeclaration ? "text-ink" : "text-ink-muted"
                }`}
              >
                {line || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────── the regions

/** NAVIGATOR — every design document, and which project follows it. */
export function DesignDocumentsNavigator({ selectionId, onSelect }: WorkspacePageProps) {
  const { docs, loading, error } = useDesignDocs();
  if (loading) return <p className="text-[13px] text-ink-faint">Loading design documents…</p>;
  if (error) return <p className="text-[13px] text-status-failed">{error}</p>;

  return (
    <div className="flex flex-col gap-1">
      <Label>All documents</Label>
      {docs.map((doc) => {
        const active = doc.id === (selectionId ?? docs[0]?.id);
        const decl = doc.declaration.declaration;
        return (
          <button
            key={doc.id}
            type="button"
            data-testid={`doc-${doc.id}`}
            onClick={() => onSelect(doc.id)}
            className={`flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left ${
              active ? "bg-surface-active text-ink" : "text-ink-muted hover:bg-surface-hover"
            }`}
          >
            <span className="truncate text-[14px]">{doc.title}</span>
            <span className="truncate text-[12px] text-ink-faint">
              {decl ? `declares ${decl.areas.length} areas · ${decl.category}` : "declares nothing yet"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** MAIN — the document, with live per-agent line highlighting. */
export function DesignDocumentsPage({ selectionId }: WorkspacePageProps) {
  const { docs, loading, error } = useDesignDocs();
  const doc = useDoc(docs, selectionId);
  const now = useMemo(() => Date.now(), []);
  // Clamped to the document being viewed: the mock's ranges are fixed, and a claim on line 24 of
  // a 20-line document would be a highlight pointing at nothing. Clamping is what the real
  // presence layer will do anyway when a document shrinks under a running agent.
  const reports = useMemo(
    () => (doc ? mockPresence(now, 1).filter((r) => !r.lines || r.lines.to <= doc.lineCount) : []),
    [now, doc],
  );

  if (loading) return <Centered>Loading design documents…</Centered>;
  if (error) return <Centered>{error}</Centered>;
  if (!doc) return <Centered>No design documents yet. A project starts by writing one.</Centered>;

  const live = reports.map((r) => ({ report: r, state: presenceState(r, 1, now) }));

  return (
    <div className="flex h-full min-h-0">
      <DocumentSurface doc={doc} reports={reports} now={now} />

      <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border px-3 py-4">
        <Label>Agents in this document</Label>
        {live.map(({ report, state }) => (
          <div key={report.agentId} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className={`text-[14px] ${AREA_TEXT[report.areaIndex - 1]}`}>{report.agentName}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
              <Marker state={state} areaIndex={report.areaIndex} />
              <span>{presenceCaption(report, state, now)}</span>
            </div>
            {report.activity ? (
              <span className="text-[12px] text-ink-ghost">{report.activity}</span>
            ) : null}
          </div>
        ))}
        <PresenceKey />
        <p data-testid="mock-warning" className="text-[11px] leading-snug text-ink-ghost">
          Presence above is mock data — <code>designdoc/mockPresence.ts</code>. The document, its
          sections and its declaration are real. Ages shown: {elapsed(now - 8000, now)} to{" "}
          {elapsed(now - 22 * 60000, now)}.
        </p>
      </aside>
    </div>
  );
}

/** INSPECTOR — what this document declares. Properties only, never navigation. */
export function DesignDocumentInspector({ selectionId }: WorkspacePageProps) {
  const { docs } = useDesignDocs();
  const doc = useDoc(docs, selectionId);
  // Not `null`: WorkspacePageComponent is typed `=> JSX.Element`, so a slot cannot opt out of
  // rendering. Filed for 07-shell as an additive widening to `JSX.Element | null`.
  if (!doc) return <Label>Declaration</Label>;

  const { declaration, errors, ok } = {
    declaration: doc.declaration.declaration,
    errors: doc.declaration.errors,
    ok: doc.declaration.ok,
  };

  return (
    <>
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
          <Row
            label="Budget"
            value={declaration.budget !== undefined ? `$${declaration.budget.toFixed(2)}` : "not stated"}
          />
          <Row label="Declared on" value={`lines ${declaration.blockStart}–${declaration.blockEnd}`} />

          <div className="mt-1 h-px bg-border" />
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
                    className={`inline-block h-2 w-2 rounded-sm border ${AREA_BORDER[i % 6]} ${
                      AREA_GUTTER[i % 6]
                    }`}
                  />
                  <span className={`text-[14px] ${AREA_TEXT[i % 6]}`}>{area.name}</span>
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

      {!ok && errors.length > 0 ? (
        <>
          <div className="mt-1 h-px bg-border" />
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
