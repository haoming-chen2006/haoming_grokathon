import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectHeader } from "./ProjectHeader";
import { ReviewQueue, SuggestionQueue, type DesignSuggestionView, type SubmissionView } from "./ReviewQueues";
import { ConversationView, messageKindLabel, type MessageView } from "./ConversationView";
import type { DiffFileView } from "./DiffView";
import { testsPass } from "../../../server/services/codeReview";

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

  test("request revision sends what the user typed, not a canned string", () => {
    // The note is the only instruction the agent gets; discarding it makes the action meaningless.
    const calls: Array<[string, string]> = [];
    render(
      <SuggestionQueue suggestions={[suggestion()]} onRequestRevision={(id, note) => calls.push([id, note])} />,
    );

    fireEvent.change(screen.getByTestId("suggestion-revision-note-s1"), {
      target: { value: "Keep the modal for password sign-in and redirect only for OAuth." },
    });
    fireEvent.click(screen.getByTestId("suggestion-revise-s1"));

    expect(calls).toEqual([["s1", "Keep the modal for password sign-in and redirect only for OAuth."]]);
    expect(calls[0]![1]).not.toBe("Please revise");
  });

  test("each suggestion keeps its own revision note", () => {
    // One shared draft would send the wrong instruction to the wrong agent.
    const calls: Array<[string, string]> = [];
    render(
      <SuggestionQueue
        suggestions={[suggestion(), suggestion({ id: "s2", requirementId: "AUTH-02" })]}
        onRequestRevision={(id, note) => calls.push([id, note])}
      />,
    );

    fireEvent.change(screen.getByTestId("suggestion-revision-note-s1"), { target: { value: "Narrow the scope" } });
    fireEvent.change(screen.getByTestId("suggestion-revision-note-s2"), { target: { value: "Cite the provider docs" } });
    fireEvent.click(screen.getByTestId("suggestion-revise-s2"));
    fireEvent.click(screen.getByTestId("suggestion-revise-s1"));

    expect(calls).toEqual([
      ["s2", "Cite the provider docs"],
      ["s1", "Narrow the scope"],
    ]);
  });

  test("surrounding whitespace is trimmed off the note", () => {
    const calls: Array<[string, string]> = [];
    render(
      <SuggestionQueue suggestions={[suggestion()]} onRequestRevision={(id, note) => calls.push([id, note])} />,
    );
    fireEvent.change(screen.getByTestId("suggestion-revision-note-s1"), { target: { value: "  tighten the wording  " } });
    fireEvent.click(screen.getByTestId("suggestion-revise-s1"));
    expect(calls).toEqual([["s1", "tighten the wording"]]);
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

describe("V-035: the approve button obeys the same rule as the server", () => {
  function submission(testResults: SubmissionView["testResults"]): SubmissionView {
    return {
      id: "sub1",
      taskId: "task-api",
      agentId: "backend-agent",
      requirementIds: ["AUTH-03"],
      branch: "agent/auth-backend",
      changedFiles: ["session.ts"],
      summary: "Refresh token rotation",
      testResults,
      costUsd: 0.84,
      state: "pending",
    };
  }

  test("a submission where not every test passed cannot be approved", () => {
    // passed=1, failed=0, total=2 passes the old client check but the server's testsPass refuses it,
    // so the button used to be enabled and the approval bounced.
    const results = { passed: 1, failed: 0, total: 2 };
    expect(testsPass(results)).toBe(false);

    const approved: string[] = [];
    render(<ReviewQueue submissions={[submission(results)]} onApprove={(id) => approved.push(id)} />);

    const approve = screen.getByTestId("submission-approve-sub1") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute("title")).toContain("Only 1 of 2 tests passed");
    fireEvent.click(approve);
    expect(approved).toEqual([]);
  });

  test("a submission that ran no tests at all cannot be approved", () => {
    render(<ReviewQueue submissions={[submission({ passed: 0, failed: 0, total: 0 })]} />);
    const approve = screen.getByTestId("submission-approve-sub1") as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute("title")).toContain("No tests were run");
  });

  test("the reason is readable, not just a greyed-out button", () => {
    // Disabled-plus-opacity conveys nothing to a screen reader or to anyone wondering why.
    render(<ReviewQueue submissions={[submission({ passed: 3, failed: 1, total: 5 })]} />);
    expect(screen.getByTestId("submission-approve-blocked-sub1").textContent).toContain("1 required test is failing");
  });

  test("no reason is shown when approval is allowed", () => {
    render(<ReviewQueue submissions={[submission({ passed: 5, failed: 0, total: 5 })]} />);
    const approve = screen.getByTestId("submission-approve-sub1") as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect(approve.getAttribute("title")).toBeNull();
    expect(screen.queryByTestId("submission-approve-blocked-sub1")).toBeNull();
  });

  test("client and server agree on every combination", () => {
    // The point of the defect: any disagreement here is a button the server will reject.
    const cases = [
      { passed: 22, failed: 0, total: 22 },
      { passed: 1, failed: 0, total: 2 },
      { passed: 0, failed: 0, total: 0 },
      { passed: 18, failed: 2, total: 20 },
      { passed: 2, failed: 1, total: 2 },
      { passed: 0, failed: 0, total: 3 },
      { passed: 1, failed: 0, total: 1 },
    ];

    for (const results of cases) {
      const { unmount } = render(<ReviewQueue submissions={[submission(results)]} />);
      const approve = screen.getByTestId("submission-approve-sub1") as HTMLButtonElement;
      expect({ ...results, enabled: !approve.disabled }).toEqual({ ...results, enabled: testsPass(results) });
      unmount();
    }
  });
});

describe("V-010: the changed files and diff behind a submission", () => {
  function submission(overrides: Partial<SubmissionView> = {}): SubmissionView {
    return {
      id: "sub1",
      taskId: "task-api",
      agentId: "backend-agent",
      requirementIds: ["AUTH-03"],
      branch: "agent/auth-backend",
      changedFiles: ["session.ts"],
      summary: "Refresh token rotation",
      testResults: { passed: 22, failed: 0, total: 22 },
      costUsd: 0.84,
      state: "pending",
      ...overrides,
    };
  }

  const loaded = {
    files: [{ path: "session.ts", status: "M", additions: 12, deletions: 3 }] as DiffFileView[],
    diff: "diff --git a/session.ts b/session.ts\n@@ -1,3 +1,4 @@\n-const ttl = 60;\n+const ttl = 900;\n",
  };

  test("no toggle is offered when the caller cannot load a diff", () => {
    // The panel must not promise changes it has no way to fetch.
    render(<ReviewQueue submissions={[submission()]} />);
    expect(screen.queryByTestId("submission-diff-toggle-sub1")).toBeNull();
  });

  test("opening the toggle loads the diff and renders it", async () => {
    const asked: string[] = [];
    render(
      <ReviewQueue
        submissions={[submission()]}
        onLoadDiff={async (id) => {
          asked.push(id);
          return loaded;
        }}
      />,
    );

    expect(screen.queryByTestId("diff-view")).toBeNull();
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));

    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
    expect(asked).toEqual(["sub1"]);
    const panel = screen.getByTestId("submission-diff-sub1");
    expect(panel.textContent).toContain("session.ts");
    expect(panel.textContent).toContain("const ttl = 900;");
  });

  test("the toggle closes again and does not refetch what it already has", async () => {
    let calls = 0;
    render(
      <ReviewQueue
        submissions={[submission()]}
        onLoadDiff={async () => {
          calls += 1;
          return loaded;
        }}
      />,
    );

    const toggle = screen.getByTestId("submission-diff-toggle-sub1");
    expect(toggle.textContent).toBe("View changes");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
    expect(toggle.textContent).toBe("Hide changes");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.queryByTestId("submission-diff-sub1")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
    expect(calls).toBe(1);
  });

  test("an in-flight load says so instead of showing an empty diff", async () => {
    // "No changes" and "not fetched yet" are different claims about a submission.
    let release: (value: { files: DiffFileView[]; diff: string }) => void = () => {};
    const pending = new Promise<{ files: DiffFileView[]; diff: string }>((resolve) => {
      release = resolve;
    });

    render(<ReviewQueue submissions={[submission()]} onLoadDiff={() => pending} />);
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));

    await waitFor(() => expect(screen.getByTestId("diff-loading")).toBeTruthy());
    expect(screen.queryByTestId("diff-empty")).toBeNull();

    release(loaded);
    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
    expect(screen.queryByTestId("diff-loading")).toBeNull();
  });

  test("a rejected load reports the failure and can be retried", async () => {
    let attempt = 0;
    render(
      <ReviewQueue
        submissions={[submission()]}
        onLoadDiff={async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("worktree for sub1 no longer exists");
          return loaded;
        }}
      />,
    );

    const toggle = screen.getByTestId("submission-diff-toggle-sub1");
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("diff-error")).toBeTruthy());
    expect(screen.getByTestId("diff-error").textContent).toContain("worktree for sub1 no longer exists");

    // A failure must not be cached as though it were the answer.
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
    expect(attempt).toBe(2);
    expect(screen.queryByTestId("diff-error")).toBeNull();
  });

  test("a rejection that is not an Error still reports something", async () => {
    render(
      <ReviewQueue
        submissions={[submission()]}
        onLoadDiff={async () => {
          throw "502 from the diff endpoint";
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));
    await waitFor(() => expect(screen.getByTestId("diff-error").textContent).toContain("502 from the diff endpoint"));
  });

  test("each submission opens its own diff", async () => {
    const asked: string[] = [];
    render(
      <ReviewQueue
        submissions={[submission(), submission({ id: "sub2", branch: "agent/auth-frontend" })]}
        onLoadDiff={async (id) => {
          asked.push(id);
          return { files: [{ path: `${id}.ts` }], diff: `+ from ${id}` };
        }}
      />,
    );

    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub2"));
    await waitFor(() => expect(screen.getByTestId("submission-diff-sub2").textContent).toContain("from sub2"));
    expect(asked).toEqual(["sub2"]);
    expect(screen.queryByTestId("submission-diff-sub1")).toBeNull();
  });

  test("the diff is reachable for a merged submission too", async () => {
    // Review is not the only reason to look at what landed.
    render(
      <ReviewQueue
        submissions={[submission({ state: "merged", mergeCommit: "dde7d75c6bb4aaa" })]}
        onLoadDiff={async () => loaded}
      />,
    );
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));
    await waitFor(() => expect(screen.getByTestId("diff-body")).toBeTruthy());
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
    render(
      <ConversationView
        messages={[message({ links: [{ kind: "requirement", id: "AUTH-03" }] })]}
        onOpenLink={(l) => opened.push(l)}
      />,
    );
    fireEvent.click(screen.getByTestId("message-link-m1-requirement"));
    expect(opened).toEqual([{ kind: "requirement", id: "AUTH-03" }]);
  });

  test("a link the shell cannot open is a label, not a dead button", () => {
    // Only requirement links are navigable; a chip that looks clickable and does nothing is a
    // worse lie than a chip that never offered. The traceability V-025 wants stays on screen.
    const opened: Array<{ kind: string; id: string }> = [];
    render(<ConversationView messages={[message()]} onOpenLink={(l) => opened.push(l)} />);

    const artifact = screen.getByTestId("message-link-m1-artifact");
    const branch = screen.getByTestId("message-link-m1-branch");
    expect(artifact.tagName).toBe("SPAN");
    expect(branch.tagName).toBe("SPAN");
    expect(artifact.textContent).toBe("artifact: art_1");
    expect(branch.textContent).toBe("branch: agent/auth-backend");

    fireEvent.click(artifact);
    expect(opened).toEqual([]);
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
