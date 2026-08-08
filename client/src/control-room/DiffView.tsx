export interface DiffFileView {
  path: string;
  /** Porcelain/name-status code as git reports it, e.g. "M", "A", "D", "R100", "??". */
  status?: string;
  additions?: number;
  deletions?: number;
}

interface Props {
  files: DiffFileView[];
  diff: string;
  loading?: boolean;
  error?: string | null;
}

type DiffLineKind = "added" | "removed" | "hunk" | "meta" | "context";

interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/**
 * A very large diff rendered line-by-line locks the browser, and a reviewer cannot read 40k lines
 * anyway. Beyond this the tail is dropped and the panel says so rather than silently lying.
 */
const MAX_LINES = 2000;

const STATUS_LABELS: Record<string, string> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type changed",
  U: "conflicted",
  "??": "untracked",
};

/** Git's codes are unreadable on their own, and status must never be conveyed by colour alone. */
function statusLabel(status: string): string {
  // Similarity scores ride along with renames and copies ("R100"), so match on the letter.
  const label = STATUS_LABELS[status] ?? STATUS_LABELS[status.slice(0, 1)];
  return label ?? status;
}

function classify(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  // "+++"/"---" are the file headers, not content. Counting them would inflate every single file
  // by one addition and one deletion.
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename ") ||
    line.startsWith("copy ")
  ) {
    return "meta";
  }
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  return "context";
}

function parseDiff(diff: string): DiffLine[] {
  // A trailing newline would otherwise render a phantom blank line at the end of every diff.
  return diff.replace(/\n$/, "").split("\n").map((text) => ({ kind: classify(text), text }));
}

const LINE_CLASS: Record<DiffLineKind, string> = {
  added: "bg-green-500/10 text-green-300",
  removed: "bg-red-500/10 text-red-300",
  hunk: "text-white/40",
  meta: "text-white/40",
  context: "text-white/70",
};

/**
 * The changed files and the unified diff behind a submission.
 *
 * V-037 asks a reviewer to approve a merge on the evidence shown; a file count is not evidence.
 * Nothing here is conveyed by colour alone — every added and removed line carries a text label a
 * screen reader announces, because the red/green wash is decoration.
 */
export function DiffView({ files, diff, loading, error }: Props) {
  const lines = diff.trim() ? parseDiff(diff) : [];
  const shown = lines.slice(0, MAX_LINES);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;

  return (
    <div data-testid="diff-view" className="flex h-full min-w-0 flex-col text-white">
      {loading ? (
        <div data-testid="diff-loading" className="p-4 text-sm text-white/50">
          Loading changes…
        </div>
      ) : error ? (
        <div data-testid="diff-error" role="alert" className="p-4 text-sm text-red-400">
          Could not load the diff: {error}
        </div>
      ) : files.length === 0 && lines.length === 0 ? (
        <div data-testid="diff-empty" className="p-4 text-sm text-white/50">
          No changes — this submission does not modify any files.
        </div>
      ) : (
        <>
          <div
            data-testid="diff-summary"
            className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2 text-xs text-white/60"
          >
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} changed
            </span>
            {lines.length > 0 && (
              <>
                <span className="text-green-400">{added} added</span>
                <span className="text-red-400">{removed} removed</span>
              </>
            )}
          </div>

          {files.length > 0 && (
            <ul data-testid="diff-files" className="max-h-40 shrink-0 overflow-auto border-b border-white/10">
              {files.map((file) => (
                <li
                  key={file.path}
                  data-testid="diff-file"
                  data-path={file.path}
                  className="flex items-baseline gap-2 whitespace-nowrap px-3 py-1 text-xs"
                >
                  <span className="font-mono text-white/80">{file.path}</span>
                  {file.status && <span className="text-white/50">{statusLabel(file.status)}</span>}
                  {file.additions !== undefined && (
                    <span className="text-green-400">
                      +{file.additions}
                      <span className="sr-only"> added</span>
                    </span>
                  )}
                  {file.deletions !== undefined && (
                    <span className="text-red-400">
                      −{file.deletions}
                      <span className="sr-only"> removed</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {lines.length === 0 ? (
            <div data-testid="diff-body-empty" className="p-4 text-xs text-white/50">
              No line changes to show for these files.
            </div>
          ) : (
            <pre
              data-testid="diff-body"
              // Its own scroll container in both axes: a long source line must never push the
              // control room's layout sideways.
              className="min-h-0 flex-1 overflow-auto bg-neutral-950 py-2 font-mono text-xs leading-5"
            >
              {/* Without min-w-max the row backgrounds stop at the visible edge and the added and
                  removed bands break up as soon as the diff is scrolled horizontally. */}
              <div className="min-w-max">
                {shown.map((line, i) => (
                  <div key={i} data-testid="diff-line" data-diff-kind={line.kind} className={`px-3 ${LINE_CLASS[line.kind]}`}>
                    {(line.kind === "added" || line.kind === "removed") && (
                      <span className="sr-only">{line.kind === "added" ? "added line " : "removed line "}</span>
                    )}
                    {line.text || " "}
                  </div>
                ))}
              </div>
            </pre>
          )}

          {lines.length > shown.length && (
            <div data-testid="diff-truncated" className="border-t border-white/10 px-3 py-2 text-xs text-white/50">
              Showing the first {MAX_LINES} lines of {lines.length}. Review the rest on the branch.
            </div>
          )}
        </>
      )}
    </div>
  );
}
