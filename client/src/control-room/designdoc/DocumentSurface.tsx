/**
 * The document itself, line-numbered, with presence drawn over the lines being worked.
 *
 * The text is rendered exactly as written — never re-serialised — because a document the product
 * rewrote on the way to the screen is a document the user cannot trust. Line numbers are computed
 * on read; a stored line number is a line number that goes wrong on the next edit.
 *
 * Only `live` and `stale` draw anything here. A report with no position draws NOTHING in the body
 * and says so in the inspector instead: a highlight needs a range, and a highlight that keeps its
 * position after the text under it moved is a fabricated value with a colour on it.
 */
import { PRESENCE_ENCODING, drawsHighlight, type PresenceReport, type PresenceState } from "./presence";
import { areaBorder, areaGutter } from "./PresenceEntry";
import type { DesignDocView } from "./useDesignDocs";

export interface DocumentSurfaceProps {
  doc: DesignDocView;
  reports: PresenceReport[];
  /** The presence state of each report, resolved once by the page so nothing recomputes it. */
  stateOf(report: PresenceReport): PresenceState;
}

export function DocumentSurface({ doc, reports, stateOf }: DocumentSurfaceProps) {
  const lines = doc.text.split("\n");
  const decl = doc.declaration?.declaration;

  // Only live and stale claim a position. ended and unknown deliberately draw nothing here.
  const claims = reports
    .map((report) => ({ report, state: stateOf(report) }))
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
            ? `${areaBorder(claim.report.areaIndex)} ${rule} ${areaGutter(claim.report.areaIndex)}`
            : declared
              ? `${areaBorder((declared.index % 6) + 1)} border-solid ${areaGutter((declared.index % 6) + 1)}`
              : "border-transparent";
          const first = claim && claim.report.lines?.from === lineNo;
          return (
            <div
              key={lineNo}
              data-testid={
                claim ? `line-${lineNo}-presence` : declared ? `line-${lineNo}-area` : undefined
              }
              className={`flex gap-3 border-l-[3px] pl-3 ${edge}`}
            >
              <span className="w-8 shrink-0 select-none text-right text-ink-ghost">{lineNo}</span>
              {/*
                The gutter word. The mockup prints the range over the agent's name at the top of
                each claimed block — the state is legible without reading the colour, which is the
                rule this whole page is built on.
              */}
              <span className="w-28 shrink-0 truncate text-[10px] uppercase tracking-[0.06em] text-ink-faint">
                {first && claim.report.lines
                  ? `${claim.report.lines.from}–${claim.report.lines.to} · ${claim.report.agentName}`
                  : declared
                    ? `area · ${declared.area.name}`
                    : ""}
              </span>
              <span
                className={`min-w-0 whitespace-pre-wrap ${inDeclaration ? "text-ink" : "text-ink-muted"}`}
              >
                {line || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
