/**
 * A design document, read as prose.
 *
 * The old surface printed the file: one monospace row per line, a line-number column, a gutter
 * column, every character the same size. That is a correct rendering of a file and a poor rendering
 * of a document — a person opening the thing that states what they want was reading a terminal.
 *
 * So headings are headings, a list is a list, a table is a table, and the fenced `project` block is
 * drawn as the statement it makes rather than as a grey box of source. The bytes are unchanged:
 * `markdown.ts` keeps every block's original line range, the editor writes back into that range,
 * and Source view shows the file exactly as it is on disk. Rendering is a view, never a rewrite.
 */
import type { Block, Inline } from "./markdown";
import { declarationLines, parseInline } from "./markdown";
import { MentionLink } from "../mentions/MentionLink";
import { areaBorder, areaText } from "./PresenceEntry";

export function InlineText({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case "text":
            return <span key={i}>{node.text}</span>;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-ink">
                <InlineText nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i} className="italic">
                <InlineText nodes={node.children} />
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded-[4px] border border-border bg-canvas px-1 py-px font-mono text-[0.85em] text-ink-muted"
              >
                {node.text}
              </code>
            );
          case "link":
            return (
              // A design document is written by the person using the product and read inside it;
              // a link in it points outward, so it opens outward.
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              >
                <InlineText nodes={node.children} />
              </a>
            );
          case "mention":
            // A mention points INWARD — at an asset or another document in this same project — so
            // it routes rather than loading a page. `MentionLink` is shared with the agent
            // transcript so the same link looks and behaves the same in both.
            return <MentionLink key={i} mention={node.mention} />;
        }
      })}
    </>
  );
}

/** Prose with its markup resolved. One call site's worth of convenience, used everywhere. */
function Text({ children }: { children: string }) {
  return <InlineText nodes={parseInline(children)} />;
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-[30px] leading-[1.25] text-ink",
  2: "text-[22px] leading-[1.3] text-ink",
  3: "text-[18px] leading-[1.35] text-ink",
  4: "text-[16px] leading-[1.4] text-ink",
  5: "text-[15px] leading-[1.4] text-ink-muted",
  6: "text-[14px] leading-[1.4] text-ink-muted",
};

/** Space above a block, so the document breathes the way a heading structure implies. */
export function blockSpacing(block: Block, first: boolean): string {
  if (first) return "mt-0";
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? "mt-9" : block.level === 2 ? "mt-8" : "mt-6";
    case "rule":
      return "mt-7";
    default:
      return "mt-4";
  }
}

/**
 * Which declared area, if any, was declared on a given line of the document.
 *
 * The area list in the inspector and the line that declares it carry the same colour, so "what this
 * document declares" is legible without reading the inspector at all. The index is the area's
 * position in the parsed declaration — the same number the inspector uses — so the two cannot
 * disagree.
 */
export type AreaOfLine = (line: number) => { name: string; index: number } | undefined;

/**
 * The declaration, drawn as what it declares.
 *
 * Read-only, and deliberately: this is the one block in a design document that spends money when it
 * is applied, and the way to change it is to click it and edit its source, where the keys and their
 * spelling are visible. A form here would be a second parser with opinions of its own, and
 * `shared/designDocument.ts` exists because this repository has already paid for having two.
 */
function DeclarationCard({
  block,
  areaOfLine,
}: {
  block: Extract<Block, { kind: "declaration" }>;
  areaOfLine?: AreaOfLine;
}) {
  const rows = declarationLines(block).filter((r) => r.key || r.value);
  return (
    <div
      data-testid="declaration-card"
      className="rounded-[10px] border border-accent/40 bg-accent/5 px-4 py-3"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
        This document declares a project
      </div>
      <dl className="mt-2 flex flex-col gap-1">
        {rows.map((row) => {
          const area = areaOfLine?.(row.line);
          return (
            <div
              key={row.line}
              data-testid={area ? `declared-area-${row.line}` : undefined}
              className="flex gap-3 text-[14px]"
            >
              <dt className="w-[86px] shrink-0 text-ink-faint">{row.key || "·"}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap text-ink-muted">
                {area ? (
                  <span className="flex items-baseline gap-2">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 shrink-0 rounded-sm border ${areaBorder(
                        (area.index % 6) + 1,
                      )}`}
                    />
                    <span className={areaText((area.index % 6) + 1)}>{row.value}</span>
                  </span>
                ) : (
                  row.value
                )}
              </dd>
              <span className="shrink-0 font-mono text-[10px] leading-[1.7] text-ink-ghost">
                {row.line}
              </span>
            </div>
          );
        })}
      </dl>
      {!block.closed ? (
        <p data-testid="declaration-unclosed" className="mt-2 text-[12px] text-status-waiting">
          This block is not closed — add a line with ``` to end it.
        </p>
      ) : null}
    </div>
  );
}

/** One block, rendered for reading. Never for editing: that is `BlockEditor`. */
export function ProseBlock({ block, areaOfLine }: { block: Block; areaOfLine?: AreaOfLine }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h1";
      return (
        <Tag className={HEADING_CLASS[block.level]}>
          <Text>{block.text}</Text>
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p className="whitespace-pre-wrap text-[16px] leading-[1.75] text-ink-muted">
          <Text>{block.text}</Text>
        </p>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className="flex flex-col gap-1.5 text-[16px] leading-[1.7] text-ink-muted">
          {block.items.map((item, i) => (
            <li
              key={item.startLine}
              className="flex gap-2.5"
              style={{ paddingLeft: `${item.depth * 20}px` }}
            >
              <span aria-hidden="true" className="shrink-0 select-none font-mono text-[13px] text-ink-ghost">
                {block.ordered ? `${i + 1}.` : "•"}
              </span>
              <span className="min-w-0 whitespace-pre-wrap">
                <Text>{item.text}</Text>
              </span>
            </li>
          ))}
        </Tag>
      );
    }

    case "quote":
      return (
        <blockquote className="border-l-[3px] border-border-strong pl-4 text-[16px] italic leading-[1.7] text-ink-faint">
          <span className="whitespace-pre-wrap">
            <Text>{block.text}</Text>
          </span>
        </blockquote>
      );

    case "code":
      return (
        <pre className="overflow-x-auto rounded-[8px] border border-border bg-canvas px-3.5 py-3 font-mono text-[12.5px] leading-[1.6] text-ink-muted">
          {block.lang ? (
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.08em] text-ink-ghost">
              {block.lang}
            </span>
          ) : null}
          <code>{block.code}</code>
        </pre>
      );

    case "declaration":
      return <DeclarationCard block={block} areaOfLine={areaOfLine} />;

    case "rule":
      return <hr className="border-t border-border" />;

    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                {block.header.cells.map((cell, i) => (
                  <th
                    key={i}
                    className="border-b border-border-strong px-2.5 py-1.5 text-left font-semibold text-ink"
                  >
                    <Text>{cell}</Text>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.startLine}>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="border-b border-border px-2.5 py-1.5 align-top text-ink-muted">
                      <Text>{cell}</Text>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
