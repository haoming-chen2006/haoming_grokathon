import { useState } from "react";
import { ProjectHeader } from "./ProjectHeader";
import { CommandCenter } from "./CommandCenter";
import { AgentCanvas } from "./AgentCanvas";
import { DesignDocumentPanel } from "./DesignDocumentPanel";
import { RequirementDetail, RequirementList } from "./RequirementPanel";
import { ReviewQueue, SuggestionQueue } from "./ReviewQueues";
import { ConversationView } from "./ConversationView";
import { SessionDrawer } from "./SessionDrawer";
import { useControlRoom } from "./useControlRoom";

type Tab = "agents" | "canvas" | "document" | "reviews" | "conversations";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "canvas", label: "Canvas" },
  { id: "document", label: "Design Document" },
  { id: "reviews", label: "Reviews" },
  { id: "conversations", label: "Conversations" },
];

/** The Control Room (product-design.md §11): top bar, requirement list, main view, session drawer. */
export function ControlRoomApp() {
  const room = useControlRoom();
  const [tab, setTab] = useState<Tab>("agents");
  const [selectedRequirement, setSelectedRequirement] = useState<string | undefined>();

  const requirement = room.requirements.find((r) => r.id === selectedRequirement) ?? null;
  const owner = requirement?.ownerAgentId
    ? room.agents.find((a) => a.id === requirement.ownerAgentId) ?? null
    : null;
  const drawerAgent = room.agents.find((a) => a.id === room.drawerAgentId) ?? null;

  if (room.loading) {
    return <div data-testid="control-room-loading" className="p-8 text-sm text-white/50">Loading control room…</div>;
  }

  if (room.projects.length === 0) {
    return (
      <div data-testid="control-room-no-projects" className="p-8 text-sm text-white/60">
        <div className="mb-2 font-semibold text-white">No projects yet</div>
        Create one to begin:
        <pre className="mt-3 rounded bg-neutral-900 p-3 text-xs text-white/70">{`curl -X POST http://localhost:6968/api/projects \\
  -H 'content-type: application/json' \\
  -d '{"name":"My Project","goal":"…","repositoryPath":"/path/to/repo","budgetUsd":10}'`}</pre>
      </div>
    );
  }

  return (
    <div data-testid="control-room" className="flex h-full w-full flex-col bg-neutral-950">
      <ProjectHeader
        name={room.project?.name ?? "—"}
        goal={room.project?.goal}
        progress={room.progress}
        costUsd={room.costUsd}
        budgetUsd={room.project?.budgetUsd}
        agentsWorking={room.agents.filter((a) => a.status === "working").length}
        agentsWaiting={room.agents.filter((a) => a.status === "waiting").length}
        reviewsPending={room.submissions.filter((s) => s.state === "pending").length}
        suggestionsPending={room.suggestions.filter((s) => s.state === "pending").length}
      />

      {room.error && (
        <div data-testid="control-room-error" role="alert" className="border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {room.error}
        </div>
      )}

      {/*
        V-046: a warning must reach the user *before* the cap is hit, and a hard stop must read
        differently from a warning — one of them means work has already halted.
      */}
      {room.budgetAlert && (
        <div
          data-testid="budget-alert"
          data-severity={room.budgetAlert.severity}
          role="alert"
          className={`flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs ${
            room.budgetAlert.severity === "exceeded"
              ? "border-red-500/20 bg-red-500/10 text-red-300"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300"
          }`}
        >
          <span>
            {room.budgetAlert.severity === "exceeded"
              ? `${room.budgetAlert.scope === "agent" ? "Agent" : "Project"} budget reached — execution paused at `
              : `${room.budgetAlert.scope === "agent" ? "Agent" : "Project"} spending approaching its limit: `}
            ${room.budgetAlert.spent.toFixed(2)} of ${room.budgetAlert.limit.toFixed(2)}
          </span>
          <button
            type="button"
            data-testid="budget-alert-dismiss"
            onClick={room.dismissBudgetAlert}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss budget alert"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left: requirements */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-white/10">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
            Requirements
          </div>
          <RequirementList
            requirements={room.requirements}
            selectedId={selectedRequirement}
            onSelect={setSelectedRequirement}
          />
        </aside>

        {/* Centre: tabbed main view */}
        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex gap-1 border-b border-white/10 px-3 py-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`tab-${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className={`rounded px-2 py-1 text-xs ${tab === t.id ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/5"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "agents" && (
              <CommandCenter
                agents={room.agents}
                projectCostUsd={room.costUsd}
                projectBudgetUsd={room.project?.budgetUsd}
                onOpenSession={room.openDrawer}
                onPause={(id) => room.sessionAction(id, "pause")}
                onStop={(id) => room.sessionAction(id, "stop")}
              />
            )}
            {tab === "canvas" && (
              <div className="h-full min-h-[24rem]">
                <AgentCanvas
                  agents={room.agents}
                  onMoveAgent={room.moveAgent}
                  onOpenSession={room.openDrawer}
                  onPause={(id) => room.sessionAction(id, "pause")}
                  onStop={(id) => room.sessionAction(id, "stop")}
                />
              </div>
            )}
            {tab === "document" && (
              <DesignDocumentPanel document={room.document} onSave={room.saveDocument} onImport={room.saveDocument} />
            )}
            {tab === "reviews" && (
              <div>
                <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
                  Design suggestions
                </div>
                <SuggestionQueue
                  suggestions={room.suggestions.filter((s) => s.state === "pending" || s.state === "stale")}
                  onAccept={(id) => room.resolveSuggestion(id, "accept")}
                  onReject={(id) => room.resolveSuggestion(id, "reject")}
                  onRequestRevision={(id) => room.resolveSuggestion(id, "request_revision")}
                />
                <div className="border-y border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
                  Code reviews
                </div>
                <ReviewQueue
                  submissions={room.submissions}
                  onApprove={(id) => room.reviewSubmission(id, "approve")}
                  onRequestChanges={(id, feedback) => room.reviewSubmission(id, "request-changes", feedback)}
                />
              </div>
            )}
            {tab === "conversations" && (
              <ConversationView
                messages={room.messages}
                onLoadHistory={room.loadMessageHistory}
                historyLoaded={room.historyLoaded}
                historyLoading={room.historyLoading}
              />
            )}
          </div>
        </main>

        {/* Right: the selected requirement, or the live session drawer */}
        {drawerAgent ? (
          <SessionDrawer
            agentId={drawerAgent.id}
            agentName={drawerAgent.name}
            acpSessionId={room.acpSessionId ?? undefined}
            state={room.sessionState}
            transcript={room.transcript}
            onSend={(text) => room.sendMessage(drawerAgent.id, text)}
            onPause={() => room.sessionAction(drawerAgent.id, "pause")}
            onResume={() => room.sessionAction(drawerAgent.id, "resume")}
            onStop={() => room.sessionAction(drawerAgent.id, "stop")}
            onClose={room.closeDrawer}
          />
        ) : (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-white/10">
            <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
              Implementation
            </div>
            <RequirementDetail requirement={requirement} owner={owner} />
          </aside>
        )}
      </div>
    </div>
  );
}
