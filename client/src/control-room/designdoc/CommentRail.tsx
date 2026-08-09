/**
 * Agents in the margin — what the old surface printed as a gutter column.
 *
 * A claim like "Scribe is working in lines 12–19" is a remark ABOUT a passage, which is exactly the
 * shape of a comment, so it is drawn as one: a card in the margin, level with the passage, tied to
 * it by a rule in the agent's area colour. Clicking a card marks the passage; clicking the passage
 * marks the card. That is the whole interaction, and it is the one people already know.
 *
 * The honesty rules from `presence.ts` are unchanged and are the reason this file has two lists
 * rather than one:
 *
 *   placed     the claim names lines, and the claim is fresh enough to still be about now. It gets
 *              a card beside those lines and a wash over them.
 *   unplaced   the agent is demonstrably in this document and has NOT said where. It gets a card at
 *              the top of the rail saying so in words, and NOTHING is highlighted for it.
 *
 * A card is never invented, never given a range it did not report, and never moved to the lines it
 * was at last time. An unplaced agent stays unplaced until it says otherwise.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Money } from "../agents/AgentCard";
import { stackTops } from "./commentLayout";
import { areaBorder, areaText, Marker } from "./PresenceEntry";
import { FRESHNESS, PRESENCE_ENCODING, elapsed, presenceCaption, type PresenceReport, type PresenceState } from "./presence";

export interface Comment {
  report: PresenceReport;
  state: PresenceState;
  /**
   * Pixels from the top of the document body to the passage this comment is about.
   *
   * Undefined when the comment is not about a passage — see `unplaced` above. A comment with no
   * anchor is not placed at zero; it is placed in the list that says it has no position.
   */
  top?: number;
}

export interface CommentRailProps {
  comments: Comment[];
  now: number;
  selectedAgentId?: string;
  onSelect(agentId: string | undefined): void;
  onOpen?(agentId: string): void;
}

const CARD_WIDTH = "w-[248px]";

export function CommentRail({ comments, now, selectedAgentId, onSelect, onOpen }: CommentRailProps) {
  const placed = comments.filter((c) => c.top !== undefined);
  const unplaced = comments.filter((c) => c.top === undefined);

  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const [heights, setHeights] = useState<number[]>([]);

  // Two passes: render at the desired positions, measure, then settle. Heights are only known once
  // the text is in the DOM — a card's height depends on how long the agent's own words are.
  useLayoutEffect(() => {
    const measured = placed.map((_, i) => refs.current[i]?.offsetHeight ?? 0);
    setHeights((prev) =>
      prev.length === measured.length && prev.every((h, i) => h === measured[i]) ? prev : measured,
    );
  });

  const tops = stackTops(
    placed.map((c) => c.top ?? 0),
    heights,
  );

  return (
    <div data-testid="comment-rail" className={`relative shrink-0 ${CARD_WIDTH}`}>
      {unplaced.length > 0 ? (
        <div className="flex flex-col gap-2">
          {unplaced.map((comment) => (
            <CommentCard
              key={comment.report.agentId}
              comment={comment}
              now={now}
              selected={selectedAgentId === comment.report.agentId}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : null}

      {placed.map((comment, i) => (
        <div
          key={comment.report.agentId}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute left-0 right-0 transition-[top] duration-150"
          style={{ top: `${tops[i]}px` }}
        >
          <CommentCard
            comment={comment}
            now={now}
            selected={selectedAgentId === comment.report.agentId}
            onSelect={onSelect}
            onOpen={onOpen}
          />
        </div>
      ))}
    </div>
  );
}

function CommentCard({
  comment,
  now,
  selected,
  onSelect,
  onOpen,
}: {
  comment: Comment;
  now: number;
  selected: boolean;
  onSelect(agentId: string | undefined): void;
  onOpen?(agentId: string): void;
}) {
  const { report, state } = comment;
  const enc = PRESENCE_ENCODING[state];
  const age = report.reportedAt === undefined ? undefined : elapsed(report.reportedAt, now);
  const verb = (report.kind ?? enc.label).toUpperCase();

  return (
    <div
      data-testid={`comment-${report.agentId}`}
      data-state={state}
      data-placed={comment.top === undefined ? "false" : "true"}
      onClick={() => onSelect(selected ? undefined : report.agentId)}
      className={`cursor-pointer rounded-[10px] border border-l-[3px] bg-surface px-3 py-2.5 shadow-node transition-shadow ${areaBorder(
        report.areaIndex,
      )} ${selected ? "shadow-node-hover ring-1 ring-accent/40" : "hover:shadow-node-hover"}`}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-[14px] ${areaText(report.areaIndex)}`}>{report.agentName}</span>
        {report.role ? <span className="text-[11px] text-ink-ghost">{report.role}</span> : null}
        <span className="flex-1" />
        <span className="font-mono text-[10px]">
          <Money usd={report.costUsd} />
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <Marker state={state} areaIndex={report.areaIndex} />
        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-ink-muted">
          {verb} · {FRESHNESS[state]}
          {age ? ` ${age}` : ""}
        </span>
      </div>

      {/* The claim, in the tense the state earns. `presenceCaption` owns that wording. */}
      <p data-testid={`comment-caption-${report.agentId}`} className="mt-1.5 text-[12.5px] leading-snug text-ink-faint">
        {presenceCaption(report, state, now)}
      </p>

      {report.activity ? (
        <p className="mt-1 text-[12px] leading-snug text-ink-ghost">{report.activity}</p>
      ) : null}

      {onOpen ? (
        <button
          type="button"
          data-testid={`comment-open-${report.agentId}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(report.agentId);
          }}
          title={`Open ${report.agentName}`}
          className="mt-2 rounded-[5px] border border-border px-2 py-[3px] text-[11px] text-ink-faint hover:bg-surface-hover"
        >
          Open agent
        </button>
      ) : null}
    </div>
  );
}
