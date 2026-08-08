import { useCallback, useMemo, useState } from "react";
import { ProjectHeader } from "./ProjectHeader";
import { CommandCenter } from "./CommandCenter";
import { AgentCanvas } from "./AgentCanvas";
import { DesignDocumentPanel } from "./DesignDocumentPanel";
import { RequirementDetail, RequirementList } from "./RequirementPanel";
import { ReviewQueue, SuggestionQueue } from "./ReviewQueues";
import { ConversationView } from "./ConversationView";
import { NewProjectPanel, type NewProjectInput } from "./NewProjectPanel";
import { PlanPanel } from "./PlanPanel";
import { SessionDrawer } from "./SessionDrawer";
import { SetupBanner } from "./SetupBanner";
import { useControlRoom } from "./useControlRoom";

type Tab = "agents" | "canvas" | "document" | "plan" | "reviews" | "conversations";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "canvas", label: "Canvas" },
  { id: "document", label: "Design Document" },
  { id: "plan", label: "Plan" },
  { id: "reviews", label: "Reviews" },
  { id: "conversations", label: "Conversations" },
];

/** The Control Room (product-design.md §11): top bar, requirement list, main view, session drawer. */
export function ControlRoomApp() {
  const room = useControlRoom();
  const [tab, setTab] = useState<Tab>("agents");
  const [selectedRequirement, setSelectedRequirement] = useState<string | undefined>();
  /**
   * Whether the user asked for another project. The shell offered the form only when there were
   * zero projects, so every project after the first was unreachable from the browser.
   */
  const [creatingProject, setCreatingProject] = useState(false);

  const { createProject, sessionAction } = room;

  // AgentCanvas re-syncs its nodes whenever its handler props change identity, so inline arrows
  // here made every parent render rebuild the canvas.
  const pauseAgent = useCallback((id: string) => { void sessionAction(id, "pause"); }, [sessionAction]);
  const stopAgent = useCallback((id: string) => { void sessionAction(id, "stop"); }, [sessionAction]);

  const handleCreateProject = useCallback(async (input: NewProjectInput) => {
    const id = await createProject(input);
    // Only leave the form once there is a project to go back to; a rejected create keeps the form
    // and the error explaining it.
    if (id) setCreatingProject(false);
  }, [createProject]);

  /** PlanPanel needs only enough of each agent to name it and its role in the assignment picker. */
  const assignableAgents = useMemo(
    () => room.agents.map((a) => ({ id: a.id, name: a.name, role: a.role })),
    [room.agents],
  );

  const requirement = room.requirements.find((r) => r.id === selectedRequirement) ?? null;
  const owner = requirement?.ownerAgentId
    ? room.agents.find((a) => a.id === requirement.ownerAgentId) ?? null
    : null;
  const drawerAgent = room.agents.find((a) => a.id === room.drawerAgentId) ?? null;

  if (room.loading) {
    return <div data-testid="control-room-loading" className="p-8 text-sm text-white/50">Loading control room…</div>;
  }

  const firstProject = room.projects.length === 0;
  if (firstProject || creatingProject) {
    return (
      <div
        data-testid={firstProject ? "control-room-no-projects" : "control-room-new-project"}
        className="h-full w-full overflow-y-auto bg-neutral-950"
      >
        {/* With projects already open, this must be escapable — otherwise clicking "New project"
            by accident strands the user in a form with no way back to their work. */}
        {!firstProject && (
          <div className="border-b border-white/10 px-6 py-2">
            <button
              type="button"
              data-testid="new-project-cancel"
              onClick={() => setCreatingProject(false)}
              className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
            >
              ← Back to {room.project?.name ?? "the control room"}
            </button>
          </div>
        )}
        <NewProjectPanel onCreate={handleCreateProject} busy={room.creating} error={room.error} />
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
        onPauseAll={room.pauseAll}
        projects={room.projects}
        projectId={room.projectId}
        onSelectProject={room.selectProject}
        onNewProject={() => setCreatingProject(true)}
      />

      {/* V-004: an unrunnable Grok Build is stated before anything is attempted, rather than
          emerging as a failed click on Generate plan. */}
      <SetupBanner status={room.grokStatus} />

      {room.teamError && (
        <div
          data-testid="team-error"
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300"
        >
          <span>{room.teamError}</span>
          <button
            type="button"
            data-testid="team-error-dismiss"
            onClick={room.dismissTeamError}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss team setup error"
          >
            ×
          </button>
        </div>
      )}

      {room.health && !room.health.repositoryExists && (
        <div
          data-testid="repo-missing"
          role="alert"
          className="border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300"
        >
          This project's repository is missing — <span className="font-mono">{room.health.repositoryPath}</span>.
          Nothing can be planned or launched until it is restored, or the project is recreated
          against a repository that exists.
        </div>
      )}

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

      {/* A session that stopped for want of credentials used to read as a plain failure. The
          server's message is the only actionable part — it says how to sign in. */}
      {room.authAlert && (
        <div
          data-testid="auth-alert"
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200"
        >
          <span>
            <span data-testid="auth-alert-agent" className="font-medium">
              {room.agents.find((a) => a.id === room.authAlert!.agentId)?.name ?? room.authAlert.agentId}
            </span>
            {" — "}
            <span data-testid="auth-alert-message">{room.authAlert.message}</span>
          </span>
          <button
            type="button"
            data-testid="auth-alert-dismiss"
            onClick={room.dismissAuthAlert}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss authentication alert"
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
                onPause={pauseAgent}
                onStop={stopAgent}
              />
            )}
            {tab === "canvas" && (
              <div className="h-full min-h-[24rem]">
                <AgentCanvas
                  agents={room.agents}
                  onMoveAgent={room.moveAgent}
                  onOpenSession={room.openDrawer}
                  onPause={pauseAgent}
                  onStop={stopAgent}
                />
              </div>
            )}
            {tab === "document" && (
              <DesignDocumentPanel
                document={room.document}
                onSave={room.saveDocument}
                // Import reads a file the user picks; Save persists what is in the editor. They
                // used to be the same call under two labels.
                onImport={room.importDocument}
              />
            )}
            {tab === "plan" && (
              <PlanPanel
                plan={room.plan}
                tasks={room.tasks}
                agentName={(id) => room.agents.find((a) => a.id === id)?.name}
                agents={assignableAgents}
                onAssign={room.assignTask}
                onApprove={room.approvePlan}
                onLaunch={room.launchTask}
                onGenerate={room.generatePlan}
                generating={room.planning}
                notice={room.planNotice}
              />
            )}
            {tab === "reviews" && (
              <div>
                <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
                  Design suggestions
                </div>
                <SuggestionQueue
                  suggestions={room.suggestions.filter((s) => s.state === "pending" || s.state === "stale")}
                  onAccept={(id) => room.resolveSuggestion(id, "accept")}
                  onEdit={(id, proposedText) => room.editSuggestion(id, proposedText)}
                  onReject={(id) => room.resolveSuggestion(id, "reject")}
                  // The note is the whole point of asking for a revision — it used to be collected
                  // by the queue and dropped here in favour of a hardcoded "Please revise".
                  onRequestRevision={(id, note) => room.resolveSuggestion(id, "request_revision", note)}
                />
                <div className="border-y border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/30">
                  Code reviews
                </div>
                <ReviewQueue
                  submissions={room.submissions}
                  onApprove={(id) => room.reviewSubmission(id, "approve")}
                  onRequestChanges={(id, feedback) => room.reviewSubmission(id, "request-changes", feedback)}
                  onMerge={(id) => room.mergeSubmission(id)}
                  onLoadDiff={room.loadDiff}
                />
              </div>
            )}
            {tab === "conversations" && (
              <ConversationView
                messages={room.messages}
                onOpenLink={(link) => {
                  // A requirement link selects it, which is the only navigation the shell has.
                  if (link.kind === "requirement") { setSelectedRequirement(link.id); setTab("document"); }
                }}
                onReply={room.replyToMessage}
                onMarkRead={room.markMessageRead}
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
            <RequirementDetail
                conversations={room.messages.filter((m) =>
                  m.links?.some((l) => l.kind === "requirement" && l.id === selectedRequirement),
                )} requirement={requirement} owner={owner} />
          </aside>
        )}
      </div>
    </div>
  );
}
