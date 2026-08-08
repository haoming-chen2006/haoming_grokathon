import { useState } from "react";
import { DiffView, type DiffFileView } from "./DiffView";

export interface DesignSuggestionView {
  id: string;
  authorAgentId: string;
  requirementId?: string;
  baseVersion: number;
  originalText: string;
  proposedText: string;
  reason: string;
  risks?: string;
  affectedFiles: string[];
  state: "pending" | "accepted" | "rejected" | "revision_requested" | "stale";
}

export interface SubmissionView {
  id: string;
  taskId: string;
  agentId: string;
  requirementIds: string[];
  branch: string;
  changedFiles: string[];
  /** Set when the agent's own file list disagreed with the repository. */
  claimedChangedFiles?: string[];
  summary: string;
  knownLimitations?: string;
  testResults: { passed: number; failed: number; total: number };
  costUsd: number;
  state: "pending" | "changes_requested" | "approved" | "merged" | "rejected";
  mergeCommit?: string;
}

interface SuggestionProps {
  suggestions: DesignSuggestionView[];
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onRequestRevision?: (id: string, note: string) => void;
  onEdit?: (id: string, proposedText: string) => void;
}

/** Pending design suggestions with the four review actions V-015 requires. */
export function SuggestionQueue({ suggestions, onAccept, onReject, onRequestRevision, onEdit }: SuggestionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [revisionNote, setRevisionNote] = useState<Record<string, string>>({});

  if (suggestions.length === 0) {
    return (
      <div data-testid="suggestions-empty" className="p-4 text-sm text-white/50">
        No pending design suggestions.
      </div>
    );
  }

  return (
    <ul data-testid="suggestion-queue" className="divide-y divide-white/5">
      {suggestions.map((s) => (
        <li key={s.id} data-testid={`suggestion-${s.id}`} className="p-3 text-white">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span data-testid={`suggestion-author-${s.id}`} className="font-medium">
              {s.authorAgentId}
            </span>
            {s.requirementId && <span className="font-mono text-white/50">{s.requirementId}</span>}
            <span className="text-white/40">based on v{s.baseVersion}</span>
            {s.state === "stale" && (
              <span data-testid={`suggestion-stale-${s.id}`} className="rounded bg-orange-500/15 px-1.5 text-orange-300">
                Stale — rebase required
              </span>
            )}
          </div>

          <p data-testid={`suggestion-reason-${s.id}`} className="mb-2 text-xs text-white/70">
            {s.reason}
          </p>

          <div className="mb-2 space-y-1 text-xs">
            <div data-testid={`suggestion-original-${s.id}`} className="rounded bg-red-500/10 px-2 py-1 text-red-300">
              − {s.originalText}
            </div>
            {editing === s.id ? (
              <textarea
                data-testid={`suggestion-edit-${s.id}`}
                aria-label="Edit proposed text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded bg-neutral-950 p-2 font-mono text-xs text-white/90"
              />
            ) : (
              <div data-testid={`suggestion-proposed-${s.id}`} className="rounded bg-green-500/10 px-2 py-1 text-green-300">
                + {s.proposedText}
              </div>
            )}
          </div>

          {s.risks && (
            <div data-testid={`suggestion-risks-${s.id}`} className="mb-2 text-xs text-yellow-300">
              Risks: {s.risks}
            </div>
          )}

          {editing !== s.id && (
            /* The note is the whole point of asking for a revision — the agent has to be told what
               to change, so it travels with the action instead of being thrown away. */
            <input
              data-testid={`suggestion-revision-note-${s.id}`}
              aria-label="Revision note"
              value={revisionNote[s.id] ?? ""}
              onChange={(e) => setRevisionNote({ ...revisionNote, [s.id]: e.target.value })}
              placeholder="What should the agent change? (sent with Request Revision)"
              className="mb-2 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white/90"
            />
          )}

          <div className="flex flex-wrap gap-2">
            {editing === s.id ? (
              <>
                <button
                  type="button"
                  data-testid={`suggestion-save-${s.id}`}
                  onClick={() => {
                    onEdit?.(s.id, draft);
                    setEditing(null);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Save Edit
                </button>
                <button
                  type="button"
                  data-testid={`suggestion-cancel-${s.id}`}
                  onClick={() => setEditing(null)}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-testid={`suggestion-accept-${s.id}`}
                  disabled={s.state === "stale"}
                  onClick={() => onAccept?.(s.id)}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-testid={`suggestion-reject-${s.id}`}
                  onClick={() => onReject?.(s.id)}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Reject
                </button>
                <button
                  type="button"
                  data-testid={`suggestion-edit-btn-${s.id}`}
                  onClick={() => {
                    setEditing(s.id);
                    setDraft(s.proposedText);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Edit
                </button>
                <button
                  type="button"
                  data-testid={`suggestion-revise-${s.id}`}
                  onClick={() => onRequestRevision?.(s.id, revisionNote[s.id]?.trim() ?? "")}
                  className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                >
                  Request Revision
                </button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Why approval is refused, or null when it is allowed. The server's `testsPass` (codeReview.ts)
 * demands failed === 0 AND total > 0 AND passed === total; a client that checks only the first two
 * offers an Approve button the server then rejects, so the rule is mirrored exactly and the button
 * reports *which* half of it is unmet rather than being inertly greyed out.
 */
function approvalBlocker(results: SubmissionView["testResults"]): string | null {
  if (results.total === 0) return "No tests were run — approval requires a suite that ran and passed";
  if (results.failed > 0) {
    return `${results.failed} required test${results.failed === 1 ? " is" : "s are"} failing`;
  }
  if (results.passed !== results.total) {
    return `Only ${results.passed} of ${results.total} tests passed — the rest did not report a result`;
  }
  return null;
}

interface ReviewProps {
  submissions: SubmissionView[];
  onApprove?: (id: string) => void;
  onRequestChanges?: (id: string, feedback: string) => void;
  onMerge?: (id: string) => void;
  /** Fetch the submission's changed files and unified diff. Absent when the caller cannot supply one. */
  onLoadDiff?: (submissionId: string) => Promise<{ files: DiffFileView[]; diff: string }>;
}

/** Pending code reviews (§11C), with the request-revision and approve-merge controls. */
export function ReviewQueue({ submissions, onApprove, onRequestChanges, onMerge, onLoadDiff }: ReviewProps) {
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [diffOpen, setDiffOpen] = useState<Record<string, boolean>>({});
  const [diffs, setDiffs] = useState<Record<string, { files: DiffFileView[]; diff: string }>>({});
  const [diffLoading, setDiffLoading] = useState<Record<string, boolean>>({});
  const [diffError, setDiffError] = useState<Record<string, string | null>>({});

  async function toggleDiff(id: string) {
    if (!onLoadDiff) return;
    if (diffOpen[id]) {
      setDiffOpen((prev) => ({ ...prev, [id]: false }));
      return;
    }
    setDiffOpen((prev) => ({ ...prev, [id]: true }));
    // Already fetched, or a fetch is still in flight: reopening must not re-hit the server.
    if (diffs[id] || diffLoading[id]) return;

    setDiffLoading((prev) => ({ ...prev, [id]: true }));
    setDiffError((prev) => ({ ...prev, [id]: null }));
    try {
      const loaded = await onLoadDiff(id);
      setDiffs((prev) => ({ ...prev, [id]: loaded }));
    } catch (err) {
      // A failed fetch must say so; a silently empty diff reads as "this submission changed nothing".
      setDiffError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setDiffLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  if (submissions.length === 0) {
    return (
      <div data-testid="reviews-empty" className="p-4 text-sm text-white/50">
        No code submissions awaiting review.
      </div>
    );
  }

  return (
    <ul data-testid="review-queue" className="divide-y divide-white/5">
      {submissions.map((s) => {
        const blocker = approvalBlocker(s.testResults);
        return (
          <li key={s.id} data-testid={`submission-${s.id}`} className="p-3 text-white">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span data-testid={`submission-agent-${s.id}`} className="font-medium">
                {s.agentId}
              </span>
              <span data-testid={`submission-branch-${s.id}`} className="font-mono text-white/60">
                {s.branch}
              </span>
              <span data-testid={`submission-state-${s.id}`} className="text-white/50">
                {s.state.replace(/_/g, " ")}
              </span>
            </div>

            <p data-testid={`submission-summary-${s.id}`} className="mb-1 text-xs text-white/80">
              {s.summary}
            </p>

            <div className="mb-2 flex flex-wrap gap-3 text-xs text-white/60">
              <span data-testid={`submission-files-${s.id}`}>
                {s.changedFiles.length} file{s.changedFiles.length === 1 ? "" : "s"}
              </span>
              <span
                data-testid={`submission-tests-${s.id}`}
                className={blocker ? "text-red-400" : "text-green-400"}
              >
                {s.testResults.passed}/{s.testResults.total} tests passing
                {s.testResults.failed > 0 ? ` · ${s.testResults.failed} failing` : ""}
              </span>
              <span data-testid={`submission-cost-${s.id}`}>${s.costUsd.toFixed(2)}</span>
              {s.claimedChangedFiles && (
                // The agent's own file list disagreed with the repository. The count above is
                // git's, so it is already right — this says the agent's account of its own work
                // was not, which bears on the claims here that nothing can verify.
                <span
                  data-testid={`submission-misreported-${s.id}`}
                  title={`The agent reported: ${s.claimedChangedFiles.join(", ")}`}
                  className="text-amber-400"
                >
                  agent misreported its changed files
                </span>
              )}
              <span data-testid={`submission-requirements-${s.id}`}>{s.requirementIds.join(", ")}</span>
            </div>

            {s.knownLimitations && (
              <div data-testid={`submission-limitations-${s.id}`} className="mb-2 text-xs text-white/50">
                Known limitations: {s.knownLimitations}
              </div>
            )}

            {s.mergeCommit && (
              <div data-testid={`submission-merge-${s.id}`} className="mb-2 font-mono text-xs text-white/60">
                Merged as {s.mergeCommit.slice(0, 12)}
              </div>
            )}

            {/* No toggle at all when the caller cannot fetch a diff — the panel must not promise
                changes it has no way to show. */}
            {onLoadDiff && (
              <div className="mb-2">
                <button
                  type="button"
                  data-testid={`submission-diff-toggle-${s.id}`}
                  aria-expanded={!!diffOpen[s.id]}
                  onClick={() => void toggleDiff(s.id)}
                  className="rounded bg-white/5 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white/90"
                >
                  {diffOpen[s.id] ? "Hide changes" : "View changes"}
                </button>
                {diffOpen[s.id] && (
                  <div data-testid={`submission-diff-${s.id}`} className="mt-2">
                    <DiffView
                      files={diffs[s.id]?.files ?? []}
                      diff={diffs[s.id]?.diff ?? ""}
                      loading={!!diffLoading[s.id]}
                      error={diffError[s.id] ?? null}
                    />
                  </div>
                )}
              </div>
            )}

            {s.state === "pending" && (
              <>
                <input
                  data-testid={`submission-feedback-${s.id}`}
                  aria-label="Review feedback"
                  value={feedback[s.id] ?? ""}
                  onChange={(e) => setFeedback({ ...feedback, [s.id]: e.target.value })}
                  placeholder="Feedback (required to request changes)"
                  className="mb-2 w-full rounded border border-white/10 bg-neutral-950 px-2 py-1 text-xs text-white/90"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid={`submission-approve-${s.id}`}
                    // A submission whose tests did not all run and pass must not be approvable (V-035).
                    disabled={!!blocker}
                    title={blocker ?? undefined}
                    onClick={() => onApprove?.(s.id)}
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                  >
                    Approve
                  </button>
                  {blocker && (
                    // A greyed-out button explains nothing; the reason has to be readable.
                    <span data-testid={`submission-approve-blocked-${s.id}`} className="self-center text-xs text-white/50">
                      Cannot approve: {blocker}
                    </span>
                  )}
                  <button
                    type="button"
                    data-testid={`submission-request-changes-${s.id}`}
                    disabled={!feedback[s.id]?.trim()}
                    onClick={() => onRequestChanges?.(s.id, feedback[s.id] ?? "")}
                    className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                  >
                    Request Changes
                  </button>
                </div>
              </>
            )}

            {s.state === "approved" && (
              <button
                type="button"
                data-testid={`submission-merge-btn-${s.id}`}
                onClick={() => onMerge?.(s.id)}
                className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
              >
                Approve Merge
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
