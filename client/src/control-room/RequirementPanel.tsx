import { requirementStatusLabel, type Requirement } from "./projectTypes";
import type { CodingAgent } from "./types";
import { AgentStatusBadge } from "./AgentStatusBadge";

interface ListProps {
  requirements: Requirement[];
  selectedId?: string;
  onSelect?: (requirementId: string) => void;
}

/** Left panel of §11A: requirements with id, status and owner. */
export function RequirementList({ requirements, selectedId, onSelect }: ListProps) {
  if (requirements.length === 0) {
    return (
      <div data-testid="requirements-empty" className="p-4 text-sm text-white/50">
        No requirements yet. Break the design document into requirements to track implementation.
      </div>
    );
  }

  return (
    <ul data-testid="requirement-list" className="divide-y divide-white/5">
      {requirements.map((req) => {
        const met = req.acceptanceCriteria.filter((c) => c.met).length;
        return (
          <li key={req.id}>
            <button
              type="button"
              data-testid={`requirement-${req.id}`}
              aria-current={selectedId === req.id ? "true" : undefined}
              onClick={() => onSelect?.(req.id)}
              className={`w-full px-3 py-2 text-left hover:bg-white/5 ${
                selectedId === req.id ? "bg-white/10" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-white/90">{req.id}</span>
                <span
                  data-testid={`requirement-status-${req.id}`}
                  className="text-[11px] text-white/50"
                >
                  {requirementStatusLabel(req.status)}
                </span>
              </div>
              <div className="truncate text-xs text-white/60">{req.description}</div>
              <div className="mt-0.5 flex gap-3 text-[11px] text-white/40">
                <span data-testid={`requirement-owner-${req.id}`}>
                  {req.ownerAgentId ? `Owner: ${req.ownerAgentId}` : "Unassigned"}
                </span>
                {req.acceptanceCriteria.length > 0 && (
                  <span data-testid={`requirement-criteria-${req.id}`}>
                    {met}/{req.acceptanceCriteria.length} criteria
                  </span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface DetailProps {
  requirement: Requirement | null;
  /** The agent that owns this requirement, when one is assigned. */
  owner?: CodingAgent | null;
  /**
   * Messages that reference this requirement.
   *
   * §21 states the product's core value as connecting every requirement to the agent, branch,
   * code changes, tests, **conversations**, cost and review decisions responsible for it. Every
   * message is required to carry links (V-025), and until this was added nothing could retrieve
   * them — the conversation half of that promise was captured and unreachable.
   */
  conversations?: Array<{ id: string; kind: string; fromAgentId: string; toAgentId?: string; body: string }>;
}

/**
 * Right panel of §11A: the implementation activity connected to the selected requirement
 * (V-013: "selecting a requirement reveals related implementation activity").
 */
export function RequirementDetail({ requirement, owner, conversations }: DetailProps) {
  if (!requirement) {
    return (
      <div data-testid="requirement-detail-empty" className="p-4 text-sm text-white/50">
        Select a requirement to see the agent, branch, files and tests implementing it.
      </div>
    );
  }

  const hasTests = requirement.testsTotal !== undefined && requirement.testsPassing !== undefined;

  return (
    <div data-testid="requirement-detail" data-requirement-id={requirement.id} className="p-4 text-white">
      <div className="mb-1 flex items-center gap-2">
        <span data-testid="detail-id" className="font-mono text-sm font-semibold">
          {requirement.id}
        </span>
        <span data-testid="detail-status" className="text-xs text-white/60">
          {requirementStatusLabel(requirement.status)}
        </span>
      </div>
      <p data-testid="detail-description" className="mb-3 text-xs text-white/70">
        {requirement.description}
      </p>

      {requirement.acceptanceCriteria.length > 0 && (
        <ul data-testid="detail-criteria" className="mb-3 space-y-1">
          {requirement.acceptanceCriteria.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span aria-hidden="true">{c.met ? "✓" : "○"}</span>
              <span className={c.met ? "text-white/50 line-through" : "text-white/80"}>{c.text}</span>
              <span className="sr-only">{c.met ? "met" : "not met"}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="text-white/40">Owner</dt>
          <dd data-testid="detail-owner" className="flex items-center gap-2 text-white/80">
            {owner ? owner.name : requirement.ownerAgentId ?? "Unassigned"}
            {owner && <AgentStatusBadge status={owner.status} detail={owner.statusDetail} />}
          </dd>
        </div>
        {requirement.branch && (
          <div className="flex gap-2">
            <dt className="text-white/40">Branch</dt>
            <dd data-testid="detail-branch" className="font-mono text-white/80">
              {requirement.branch}
            </dd>
          </div>
        )}
        {requirement.worktree && (
          <div className="flex gap-2">
            <dt className="text-white/40">Worktree</dt>
            <dd data-testid="detail-worktree" className="font-mono text-white/80">
              {requirement.worktree}
            </dd>
          </div>
        )}
        {hasTests && (
          <div className="flex gap-2">
            <dt className="text-white/40">Tests</dt>
            <dd data-testid="detail-tests" className="text-white/80">
              {requirement.testsPassing}/{requirement.testsTotal} passing
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-white/40">Review</dt>
          <dd data-testid="detail-review" className="text-white/80">
            {requirement.reviewStatus.replace(/_/g, " ")}
          </dd>
        </div>
      </dl>

      {requirement.affectedFiles.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-white/40">Changed files</div>
          <ul data-testid="detail-files" className="space-y-0.5">
            {requirement.affectedFiles.map((f) => (
              <li key={f} className="font-mono text-xs text-white/70">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {conversations !== undefined && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] text-white/40">
            Conversations ({conversations.length})
          </div>
          {conversations.length === 0 ? (
            <div data-testid="detail-conversations-empty" className="text-xs text-white/40">
              No agent messages reference this requirement yet.
            </div>
          ) : (
            <ul data-testid="detail-conversations" className="space-y-1">
              {conversations.map((m) => (
                <li key={m.id} className="rounded border border-white/5 px-2 py-1 text-xs text-white/70">
                  <span className="text-white/40">{m.kind.replace(/_/g, " ")}</span>
                  {" · "}
                  <span className="font-mono">{m.fromAgentId}</span>
                  {m.toAgentId ? <> → <span className="font-mono">{m.toAgentId}</span></> : " → user"}
                  <div className="text-white/80">{m.body}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
