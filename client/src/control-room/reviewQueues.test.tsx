import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectHeader } from "./ProjectHeader";
import { ReviewQueue, SuggestionQueue, type DesignSuggestionView, type SubmissionView } from "./ReviewQueues";
import { ConversationView, messageKindLabel, type MessageView } from "./ConversationView";

afterEach(cleanup);

describe("§22.17: project goal and overall progress", () => {
  test("renders the project goal", () => {
    render(<ProjectHeader name="Authentication" goal="Ship auth by Friday" />);
    expect(screen.getByTestId("project-name").textContent).toBe("Authentication");
    expect(screen.getByTestId("project-goal").textContent).toBe("Ship auth by Friday");
  });

  test("progress is shown as text, not only a bar", () => {
    // A bar alone is unreadable to a screen reader and imprecise to everyone else.
    render(
      <ProjectHeader name="P" progress={{ percent: 72, completed: 18, total: 25 }} />,
    );
    expect(screen.getByTestId("project-progress-text").textContent).toBe("72% · 18/25 requirements");
    const bar = screen.getByTestId("project-progress");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("72");
    expect(bar.getAttribute("aria-label")).toContain("72%");
  });

  test("cost is shown against budget and flagged when over", () => {
    const { unmount } = render(<ProjectHeader name="P" costUsd={4.12} budgetUsd={10} />);
    expect(screen.getByTestId("project-cost-summary").textContent).toBe("$4.12 / $10.00");
    unmount();

    render(<ProjectHeader name="P" costUsd={12.5} budgetUsd={10} />);
    expect(screen.getByTestId("project-cost-summary").textContent).toContain("over budget");
  });

  test("pending queues are surfaced with counts and correct pluralisation", () => {
    render(<ProjectHeader name="P" reviewsPending={1} suggestionsPending={3} />);
    expect(screen.getByTestId("reviews-pending-badge").textContent).toBe("1 review pending");
    expect(screen.getByTestId("suggestions-pending-badge").textContent).toBe("3 suggestions pending");
  });

  test("empty queues render no badge at all", () => {
    render(<ProjectHeader name="P" reviewsPending={0} suggestionsPending={0} />);
    expect(screen.queryByTestId("reviews-pending-badge")).toBeNull();
    expect(screen.queryByTestId("suggestions-pending-badge")).toBeNull();
  });

  test("pause-all is wired", () => {
    let paused = false;
    render(<ProjectHeader name="P" onPauseAll={() => (paused = true)} />);
    fireEvent.click(screen.getByTestId("pause-all"));
    expect(paused).toBe(true);
  });
});

describe("§22.17: pending design suggestions", () => {
  function suggestion(overrides: Partial<DesignSuggestionView> = {}): DesignSuggestionView {
    return {
      id: "s1",
      authorAgentId: "frontend-agent",
      requirementId: "AUTH-01",
      baseVersion: 1,
      originalText: "Users sign in with a modal.",
      proposedText: "Users sign in via a full-page OAuth redirect.",
      reason: "The OAuth provider blocks embedded authentication.",
      affectedFiles: ["src/auth/Login.tsx"],
      state: "pending",
      ...overrides,
    };
  }

  test("shows author, reason, and the original vs proposed text", () => {
    render(<SuggestionQueue suggestions={[suggestion()]} />);
    expect(screen.getByTestId("suggestion-author-s1").textContent).toBe("frontend-agent");
    expect(screen.getByTestId("suggestion-reason-s1").textContent).toContain("blocks embedded");
    expect(screen.getByTestId("suggestion-original-s1").textContent).toContain("sign in with a modal");
    expect(screen.getByTestId("suggestion-proposed-s1").textContent).toContain("full-page OAuth redirect");
  });

  test("all four review actions are present and wired", () => {
    const calls: string[] = [];
    render(
      <SuggestionQueue
        suggestions={[suggestion()]}
        onAccept={() => calls.push("accept")}
        onReject={() => calls.push("reject")}
        onRequestRevision={() => calls.push("revise")}
      />,
    );
    fireEvent.click(screen.getByTestId("suggestion-accept-s1"));
    fireEvent.click(screen.getByTestId("suggestion-reject-s1"));
    fireEvent.click(screen.getByTestId("suggestion-revise-s1"));
    expect(calls).toEqual(["accept", "reject", "revise"]);
    expect(screen.getByTestId("suggestion-edit-btn-s1")).toBeTruthy();
  });

  test("editing sends the amended text, not the original", () => {
    const edits: Array<[string, string]> = [];
    render(<SuggestionQueue suggestions={[suggestion()]} onEdit={(id, text) => edits.push([id, text])} />);

    fireEvent.click(screen.getByTestId("suggestion-edit-btn-s1"));
    fireEvent.change(screen.getByTestId("suggestion-edit-s1"), { target: { value: "Amended proposal" } });
    fireEvent.click(screen.getByTestId("suggestion-save-s1"));

    expect(edits).toEqual([["s1", "Amended proposal"]]);
  });

  test("a stale suggestion is labelled and cannot be accepted", () => {
    // Mirrors the backend's 409 — the UI must not offer an action the server will refuse.
    render(<SuggestionQueue suggestions={[suggestion({ state: "stale" })]} />);
    expect(screen.getByTestId("suggestion-stale-s1").textContent).toContain("rebase required");
    expect((screen.getByTestId("suggestion-accept-s1") as HTMLButtonElement).disabled).toBe(true);
  });

  test("an empty queue says so", () => {
    render(<SuggestionQueue suggestions={[]} />);
    expect(screen.getByTestId("suggestions-empty").textContent).toContain("No pending design suggestions");
  });
});

describe("§22.17: pending code reviews, request revision, approve merge", () => {
  function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
    return {
      id: "sub1",
      taskId: "task-api",
      agentId: "backend-agent",
      requirementIds: ["AUTH-03"],
      branch: "agent/auth-backend",
      changedFiles: ["session.ts", "token.ts"],
      summary: "Refresh token rotation",
      knownLimitations: "None",
      testResults: { passed: 22, failed: 0, total: 22 },
      costUsd: 0.84,
      state: "pending",
      ...overrides,
    };
  }

  test("a submission shows the evidence V-037 requires", () => {
    render(<ReviewQueue submissions={[submission()]} />);
    expect(screen.getByTestId("submission-agent-sub1").textContent).toBe("backend-agent");
    expect(screen.getByTestId("submission-branch-sub1").textContent).toBe("agent/auth-backend");
    expect(screen.getByTestId("submission-summary-sub1").textContent).toBe("Refresh token rotation");
    expect(screen.getByTestId("submission-files-sub1").textContent).toBe("2 files");
    expect(screen.getByTestId("submission-tests-sub1").textContent).toContain("22/22 tests passing");
    expect(screen.getByTestId("submission-cost-sub1").textContent).toBe("$0.84");
    expect(screen.getByTestId("submission-requirements-sub1").textContent).toBe("AUTH-03");
    expect(screen.getByTestId("submission-limitations-sub1").textContent).toContain("None");
  });

  test("approve is disabled while required tests are failing", () => {
    // The backend refuses this (V-035); the UI must not offer it.
    render(<ReviewQueue submissions={[submission({ testResults: { passed: 18, failed: 2, total: 20 } })]} />);
    const approve = screen.getByTestId("submission-approve-sub1") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute("title")).toContain("failing");
    expect(screen.getByTestId("submission-tests-sub1").textContent).toContain("2 failing");
  });

  test("request-changes requires feedback before it can be used", () => {
    const calls: Array<[string, string]> = [];
    render(<ReviewQueue submissions={[submission()]} onRequestChanges={(id, f) => calls.push([id, f])} />);

    const button = screen.getByTestId("submission-request-changes-sub1") as HTMLButtonElement;
    expect(button.disabled).toBe(true); // matches the backend's "feedback is required"

    fireEvent.change(screen.getByTestId("submission-feedback-sub1"), {
      target: { value: "Add a regression test" },
    });
    expect((screen.getByTestId("submission-request-changes-sub1") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("submission-request-changes-sub1"));
    expect(calls).toEqual([["sub1", "Add a regression test"]]);
  });

  test("approve fires for a passing submission", () => {
    const approved: string[] = [];
    render(<ReviewQueue submissions={[submission()]} onApprove={(id) => approved.push(id)} />);
    fireEvent.click(screen.getByTestId("submission-approve-sub1"));
    expect(approved).toEqual(["sub1"]);
  });

  test("approve-merge appears only once the submission is approved", () => {
    const { unmount } = render(<ReviewQueue submissions={[submission({ state: "pending" })]} />);
    expect(screen.queryByTestId("submission-merge-btn-sub1")).toBeNull();
    unmount();

    const merged: string[] = [];
    render(<ReviewQueue submissions={[submission({ state: "approved" })]} onMerge={(id) => merged.push(id)} />);
    fireEvent.click(screen.getByTestId("submission-merge-btn-sub1"));
    expect(merged).toEqual(["sub1"]);
    // Review controls are gone once it is out of review.
    expect(screen.queryByTestId("submission-approve-sub1")).toBeNull();
  });

  test("a merged submission shows its commit", () => {
    render(<ReviewQueue submissions={[submission({ state: "merged", mergeCommit: "dde7d75c6bb4aaa" })]} />);
    expect(screen.getByTestId("submission-merge-sub1").textContent).toContain("dde7d75c6bb4");
  });

  test("an empty queue says so", () => {
    render(<ReviewQueue submissions={[]} />);
    expect(screen.getByTestId("reviews-empty").textContent).toContain("No code submissions");
  });
});

describe("§22.17: agent conversations", () => {
  function message(overrides: Partial<MessageView> = {}): MessageView {
    return {
      id: "m1",
      kind: "handoff",
      fromAgentId: "backend-agent",
      toAgentId: "frontend-agent",
      body: "Authentication endpoint is ready.",
      links: [
        { kind: "artifact", id: "art_1" },
        { kind: "branch", id: "agent/auth-backend" },
      ],
      threadId: "t1",
      createdAt: "2026-08-06T00:00:00.000Z",
      ...overrides,
    };
  }

  test("every message kind has a human-readable label", () => {
    expect(messageKindLabel("dependency_request")).toBe("Dependency Request");
    expect(messageKindLabel("failing_test")).toBe("Failing Test");
    expect(() => messageKindLabel("bogus" as any)).toThrow(/No label defined/);
  });

  test("shows sender, recipient, body and links", () => {
    render(<ConversationView messages={[message()]} />);
    expect(screen.getByTestId("message-kind-m1").textContent).toBe("Handoff");
    expect(screen.getByTestId("message-from-m1").textContent).toBe("backend-agent");
    expect(screen.getByTestId("message-to-m1").textContent).toBe("frontend-agent");
    expect(screen.getByTestId("message-body-m1").textContent).toContain("endpoint is ready");
    expect(screen.getByTestId("message-links-m1").textContent).toContain("artifact: art_1");
  });

  test("an escalation with no recipient reads as addressed to you", () => {
    render(
      <ConversationView
        messages={[message({ id: "m2", kind: "escalation", toAgentId: undefined })]}
      />,
    );
    expect(screen.getByTestId("message-to-m2").textContent).toBe("you");
  });

  test("an auto-escalated message explains why", () => {
    render(
      <ConversationView
        messages={[
          message({
            id: "m3",
            kind: "escalation",
            toAgentId: undefined,
            autoEscalated: true,
            escalationReason: "frontend-agent has sent 3 unanswered messages to backend-agent",
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("message-escalation-m3").textContent).toContain("3 unanswered messages");
  });

  test("messages are grouped by thread", () => {
    render(
      <ConversationView
        messages={[
          message({ id: "a", threadId: "t1" }),
          message({ id: "b", threadId: "t1", kind: "answer" }),
          message({ id: "c", threadId: "t2", kind: "question" }),
        ]}
      />,
    );
    expect(screen.getByTestId("thread-t1").textContent).toContain("2 messages");
    expect(screen.getByTestId("thread-t2").textContent).toContain("1 message");
  });

  test("links are clickable and report what they point at", () => {
    const opened: Array<{ kind: string; id: string }> = [];
    render(<ConversationView messages={[message()]} onOpenLink={(l) => opened.push(l)} />);
    fireEvent.click(screen.getByTestId("message-link-m1-artifact"));
    expect(opened).toEqual([{ kind: "artifact", id: "art_1" }]);
  });

  test("unread messages are marked", () => {
    render(<ConversationView messages={[message(), message({ id: "m9", readAt: "2026-08-06T01:00:00Z" })]} />);
    expect(screen.getByTestId("message-unread-m1")).toBeTruthy();
    expect(screen.queryByTestId("message-unread-m9")).toBeNull();
  });

  test("an empty conversation list says so", () => {
    render(<ConversationView messages={[]} />);
    expect(screen.getByTestId("conversations-empty").textContent).toContain("No agent messages");
  });
});

describe("archived conversation history is reachable from the panel", () => {
  const msg = (id: string, body: string): MessageView => ({
    id, kind: "question", fromAgentId: "a", toAgentId: "b", body,
    links: [{ kind: "task", id: "t1" }], threadId: `thread-${id}`, createdAt: "2026-01-01T00:00:00Z",
  });

  test("no control is offered when the caller cannot load history", () => {
    // The panel must not promise something the caller has not wired up.
    render(<ConversationView messages={[msg("1", "hello")]} />);
    expect(screen.queryByTestId("load-message-history")).toBeNull();
  });

  test("the control is offered and invokes the loader", () => {
    let called = 0;
    render(<ConversationView messages={[msg("1", "hello")]} onLoadHistory={() => { called += 1; }} />);
    const button = screen.getByTestId("load-message-history");
    expect(button.textContent).toContain("Load earlier messages");
    fireEvent.click(button);
    expect(called).toBe(1);
  });

  test("the control reports progress and cannot be double-fired", () => {
    let called = 0;
    render(
      <ConversationView messages={[msg("1", "hello")]} onLoadHistory={() => { called += 1; }} historyLoading />,
    );
    const button = screen.getByTestId("load-message-history") as HTMLButtonElement;
    expect(button.textContent).toContain("Loading earlier messages");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(called).toBe(0);
  });

  test("once loaded the panel says so instead of offering the control again", () => {
    render(<ConversationView messages={[msg("1", "hello")]} onLoadHistory={() => {}} historyLoaded />);
    expect(screen.queryByTestId("load-message-history")).toBeNull();
    expect(screen.getByTestId("message-history-loaded").textContent).toContain("Showing full history");
  });

  test("archived messages render as real threads once supplied", () => {
    render(
      <ConversationView
        messages={[msg("old", "the oldest exchange"), msg("new", "the newest exchange")]}
        onLoadHistory={() => {}}
        historyLoaded
      />,
    );
    expect(screen.getByTestId("thread-thread-old")).toBeTruthy();
    expect(screen.getByText("the oldest exchange")).toBeTruthy();
  });
});
