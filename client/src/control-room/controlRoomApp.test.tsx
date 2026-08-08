import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ControlRoomApp } from "./ControlRoomApp";

/**
 * Renders the real app shell against a stubbed API. These tests exist because the shell was
 * written and wired with no coverage: the components beneath it were each tested, and the thing
 * that assembles them was not — which is how the UI ended up unreachable in the first place.
 */

const PROJECT = {
  id: "p1",
  name: "Greeting Service",
  goal: "Implement the greeting feature",
  repositoryPath: "/tmp/repo",
  budgetUsd: 10,
  document: { currentVersion: 2 },
  requirements: [
    {
      id: "GREET-01", description: "greet(name) returns a greeting",
      acceptanceCriteria: [{ id: "c1", text: "Returns the greeting", met: true }],
      taskIds: [], affectedFiles: ["greet.ts"], status: "in_progress",
      reviewStatus: "pending", baseVersion: 1, ownerAgentId: "a1",
      branch: "agent/greet", testsPassing: 1, testsTotal: 1,
    },
  ],
  suggestions: [
    { id: "s1", authorAgentId: "a1", requirementId: "GREET-01", baseVersion: 1,
      originalText: "old", proposedText: "new", reason: "because", affectedFiles: [], state: "pending" },
  ],
  submissions: [
    { id: "sub1", taskId: "t1", agentId: "a1", requirementIds: ["GREET-01"], branch: "agent/greet",
      changedFiles: ["greet.ts"], summary: "Implement greet", testResults: { passed: 1, failed: 0, total: 1 },
      costUsd: 0.05, state: "pending" },
  ],
  messages: [
    { id: "m1", kind: "handoff", fromAgentId: "a1", toAgentId: "a2", body: "ready",
      links: [{ kind: "branch", id: "agent/greet" }], threadId: "t1", createdAt: "" },
  ],
  plan: { id: "plan_1", state: "draft", milestones: [] },
  tasks: [
    { id: "t1", objective: "Implement greet", assignedAgentId: "a1", status: "working", dependsOn: [] },
    // Unowned on purpose: the Planner cannot always place every role it asks for, and the shell
    // has to be able to give the task an owner.
    { id: "t2", objective: "Test greet", status: "planned", dependsOn: [] },
  ],
  baseBranch: "main",
};

const AGENTS = [
  { id: "a1", projectId: "p1", name: "Backend Engineer", role: "Backend Engineer", skills: [], tools: [],
    status: "working", activity: { command: "bun test" }, costUsd: 0.05, tokensUsed: 100, currentTaskId: "t1" },
  { id: "a2", projectId: "p1", name: "Reviewer", role: "Reviewer", skills: [], tools: [],
    status: "idle", activity: {}, costUsd: 0, tokensUsed: 0 },
];

const calls: Array<{ method: string; url: string; body?: string }> = [];
const sockets: Array<{ onmessage: ((e: { data: string }) => void) | null }> = [];

/**
 * Events the server would replay to a subscriber that connects after they were published. This is
 * what makes a needless reconnect visible: anything already dismissed comes back.
 */
let replayed: unknown[] = [];

/** Deliver a control-room event exactly as the server publishes it. */
function publish(event: unknown) {
  replayed.push(event);
  for (const s of sockets) s.onmessage?.({ data: JSON.stringify({ event }) });
}
let projectsResponse: any = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
let failNext: string | null = null;
/** What GET /api/grok/status answers. Installed by default so the banner stays out of the way. */
let grokStatus: any = { installed: true, version: "0.1.0", binaryPath: "/usr/local/bin/grok" };
/** The submission's worktree, absent when its checkout is gone and there is nothing to diff. */
let submissionWorktree: string | undefined = "/tmp/repo/.agents/a1";
/** The bare array GET /api/repository/changed-files answers with — no additions or deletions. */
let changedFiles: any = [{ path: "greet.ts", status: "M", staged: true }];
const DIFF = "diff --git a/greet.ts b/greet.ts\n@@ -1 +1 @@\n-old line\n+new line\n";
/** The team POST /api/projects reports back, and why it could not be seeded. */
let createdTeam: { agents: any[]; teamError?: string } = { agents: AGENTS };

function stubFetch() {
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string });

    if (failNext && String(url).includes(failNext)) {
      return new Response(JSON.stringify({ error: "stubbed failure" }), { status: 500 });
    }
    const send = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

    // GET lists projects; POST creates one. Returning the list for both made a created project
    // arrive as an array, so nothing could be selected from it.
    if (url === "/api/projects") {
      if (method === "POST") {
        const input = JSON.parse((init?.body as string) ?? "{}");
        // The server seeds the team with the project and reports it (or why it could not).
        return new Response(
          JSON.stringify({ id: "p1", ...input, document: { currentVersion: 1 }, ...createdTeam }),
          { status: 201 },
        );
      }
      return send(projectsResponse);
    }
    if (String(url).startsWith("/api/grok/status")) return send(grokStatus);
    // A bare array, exactly as server/routes/repository.ts answers.
    if (String(url).startsWith("/api/repository/changed-files")) return send(changedFiles);
    if (String(url).startsWith("/api/repository/diff")) return send({ diff: DIFF });
    if (String(url).endsWith("/api/projects/p1")) {
      return send({
        ...PROJECT,
        submissions: PROJECT.submissions.map((s) => ({ ...s, worktree: submissionWorktree })),
      });
    }
    if (String(url).includes("/document")) return send({ title: "Design", version: 2, content: "# Design" });
    if (String(url).includes("/coding-agents?projectId")) return send(AGENTS);
    if (String(url).includes("/progress")) return send({ percent: 50, completed: 1, total: 2 });
    if (String(url).includes("/costs/")) return send({ projectCostUsd: 0.05, projectBudgetUsd: 10 });
    if (String(url).includes("/messages?includeArchived=true")) {
      return send([
        { id: "m0", kind: "question", fromAgentId: "a1", toAgentId: "a2", body: "the archived exchange",
          links: [{ kind: "task", id: "t1" }], threadId: "t0", createdAt: "" },
        ...PROJECT.messages,
      ]);
    }
    if (String(url).includes("/session")) return send({ agentId: "a1", projectId: "p1", acpSessionId: "sess-1", state: "ready", transcript: [] });
    return send({});
  };
  // The shell opens a WebSocket; a stand-in that records its instances lets a test push a real
  // server event through the same path the live channel uses.
  sockets.length = 0;
  (globalThis as any).WebSocket = class {
    onmessage: any; onclose: any;
    constructor(public url: string) {
      sockets.push(this as any);
      // The real bus replays its recent events to every new subscriber, so a client that
      // reconnects for an unrelated reason is handed them a second time.
      queueMicrotask(() => {
        for (const event of replayed) this.onmessage?.({ data: JSON.stringify({ event }) });
      });
    }
    close() {
      const i = sockets.indexOf(this as any);
      if (i >= 0) sockets.splice(i, 1);
    }
  };
}

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  replayed = [];
  grokStatus = { installed: true, version: "0.1.0", binaryPath: "/usr/local/bin/grok" };
  submissionWorktree = "/tmp/repo/.agents/a1";
  changedFiles = [{ path: "greet.ts", status: "M", staged: true }];
  createdTeam = { agents: AGENTS };
  projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
  stubFetch();
});
afterEach(cleanup);

/**
 * Render the shell and wait until its data has arrived.
 *
 * `control-room` appears as soon as `loading` flips false, but the project, document, agents and
 * progress come from four separate fetches. Asserting straight after the frame is a race: it
 * failed as "expected Greeting Service, received —" when a later fetch had not landed. Waiting for
 * the project name means every test below starts from a loaded shell.
 */
async function openShell() {
  render(<ControlRoomApp />);
  await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("project-name").textContent).toBe("Greeting Service"));
}

describe("Control Room shell", () => {
  test("loads a project and renders the header with live figures", async () => {
    await openShell();
    expect(screen.getByTestId("project-name").textContent).toBe("Greeting Service");
    expect(screen.getByTestId("project-goal").textContent).toBe("Implement the greeting feature");
    expect(screen.getByTestId("project-progress-text").textContent).toBe("50% · 1/2 requirements");
    expect(screen.getByTestId("project-cost-summary").textContent).toBe("$0.05 / $10.00");
    // Pending queues are surfaced from the loaded project.
    expect(screen.getByTestId("reviews-pending-badge").textContent).toBe("1 review pending");
    expect(screen.getByTestId("suggestions-pending-badge").textContent).toBe("1 suggestion pending");
  });

  test("with no project, the shell offers the form rather than a curl command", async () => {
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room-no-projects")).toBeTruthy());

    // It used to print a curl command, so the first thing the Control Room asked was that you
    // leave it. Every field §10 step 1 names must be here.
    expect(screen.getByTestId("new-project")).toBeTruthy();
    for (const id of ["np-repo", "np-name", "np-branch", "np-goal", "np-budget", "np-design"]) {
      expect(screen.getByTestId(id), `${id} is missing`).toBeTruthy();
    }
  });

  test("creating a project POSTs it and selects the result", async () => {
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("new-project")).toBeTruthy());

    fireEvent.change(screen.getByTestId("np-repo"), { target: { value: "/tmp/repo" } });
    fireEvent.change(screen.getByTestId("np-name"), { target: { value: "Greeting Service" } });
    fireEvent.change(screen.getByTestId("np-design"), { target: { value: "# Design" } });

    // From here the project exists, so the shell should load it.
    projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
    fireEvent.click(screen.getByTestId("np-submit"));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.url === "/api/projects");
      expect(post, "no POST /api/projects was issued").toBeTruthy();
      expect(JSON.parse(post!.body!)).toMatchObject({
        name: "Greeting Service", repositoryPath: "/tmp/repo", documentContent: "# Design",
      });
    });

    // And the newly created project becomes the selected one.
    await waitFor(() => expect(screen.getByTestId("project-name").textContent).toBe("Greeting Service"));
  });

  test("requirements in the pasted document are imported with the project", async () => {
    // Otherwise a project created in the browser has a document and nothing to track against it,
    // while the same document through `bun run new` yields requirements — the two disagreeing.
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("new-project")).toBeTruthy());

    fireEvent.change(screen.getByTestId("np-repo"), { target: { value: "/tmp/repo" } });
    fireEvent.change(screen.getByTestId("np-name"), { target: { value: "Greeting Service" } });
    fireEvent.change(screen.getByTestId("np-design"), {
      target: { value: "# Design\n\n- GREET-01: greet returns a greeting\n" },
    });

    projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
    fireEvent.click(screen.getByTestId("np-submit"));

    await waitFor(() => {
      const req = calls.find((c) => c.method === "POST" && c.url.endsWith("/requirements"));
      expect(req, "no requirement was posted").toBeTruthy();
      expect(JSON.parse(req!.body!)).toEqual({ id: "GREET-01", description: "greet returns a greeting" });
    });

    // The requirement goes to its own endpoint, not smuggled into the project body.
    const projectPost = calls.find((c) => c.method === "POST" && c.url === "/api/projects");
    expect(JSON.parse(projectPost!.body!).requirements).toBeUndefined();
  });

  test("every tab renders its panel", async () => {
    await openShell();

    // Agents is the default.
    expect(screen.getAllByTestId("agent-card")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("tab-document"));
    expect(screen.getByTestId("document-panel")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-reviews"));
    expect(screen.getByTestId("suggestion-queue")).toBeTruthy();
    expect(screen.getByTestId("review-queue")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-conversations"));
    expect(screen.getByTestId("conversation-view")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-agents"));
    expect(screen.getAllByTestId("agent-card")).toHaveLength(2);
  });

  test("the requirement list drives the implementation panel", async () => {
    await openShell();

    // Nothing selected yet.
    expect(screen.getByTestId("requirement-detail-empty")).toBeTruthy();

    // `control-room` appears as soon as loading ends, but the project, its requirements and the
    // agent list arrive from four separate fetches. Clicking the instant the shell renders is a
    // race: this failed only inside the full suite, where the server tests slow things enough for
    // a later fetch to land after the click and reset the selection. Wait for the data, not the
    // frame.
    await waitFor(() => expect(screen.getByTestId("requirement-GREET-01")).toBeTruthy());
    fireEvent.click(screen.getByTestId("requirement-GREET-01"));

    await waitFor(() => expect(screen.getByTestId("detail-id").textContent).toBe("GREET-01"));
    expect(screen.getByTestId("detail-branch").textContent).toBe("agent/greet");
    // The owning agent is resolved from the agent list, not re-fetched.
    expect(screen.getByTestId("detail-owner").textContent).toContain("Backend Engineer");
  });

  test("opening a session replaces the panel with the drawer and calls the API", async () => {
    await openShell();
    fireEvent.click(screen.getAllByTestId("agent-open-session")[0]);
    await waitFor(() => expect(screen.getByTestId("session-drawer")).toBeTruthy());

    expect(screen.getByTestId("drawer-agent-name").textContent).toBe("Backend Engineer");
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/session"))).toBe(true);

    // Closing returns to the requirement panel.
    fireEvent.click(screen.getByTestId("drawer-close"));
    await waitFor(() => expect(screen.queryByTestId("session-drawer")).toBeNull());
  });

  test("a failed load surfaces as an alert rather than a blank screen", async () => {
    failNext = "/progress";
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room-error")).toBeTruthy());
    expect(screen.getByTestId("control-room-error").getAttribute("role")).toBe("alert");
  });

  test("the canvas tab renders and is wired to persist moves", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-canvas"));
    expect(screen.getByTestId("agent-canvas")).toBeTruthy();
  });

  test("agent status is shown with text, not colour alone", async () => {
    await openShell();
    const labels = screen.getAllByTestId("agent-status-label").map((n) => n.textContent);
    expect(labels).toContain("Working");
    expect(labels).toContain("Idle");
  });
});

describe("the shell can reach archived conversation history", () => {
  async function openConversations() {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-conversations"));
    await waitFor(() => expect(screen.getByTestId("conversation-view")).toBeTruthy());
  }

  test("the panel offers the control, so history is not stranded on disk", async () => {
    // The store archives messages past a window. If the shell never wires the loader, those
    // messages exist in the sidecar and nothing in the running app can display them.
    await openConversations();
    expect(screen.getByTestId("load-message-history")).toBeTruthy();
  });

  test("clicking it fetches history and renders the archived thread", async () => {
    await openConversations();
    expect(screen.queryByText("the archived exchange")).toBeNull();

    fireEvent.click(screen.getByTestId("load-message-history"));

    await waitFor(() => expect(screen.getByText("the archived exchange")).toBeTruthy());
    // It asked the API for archived messages, not just a plain refetch.
    expect(calls.some((c) => c.url.includes("/messages?includeArchived=true"))).toBe(true);
    // And the control is replaced rather than left inviting a second load.
    expect(screen.queryByTestId("load-message-history")).toBeNull();
    expect(screen.getByTestId("message-history-loaded")).toBeTruthy();
  });
});

describe("budget warnings reach the user (V-046)", () => {
  const open = openShell;

  test("a warning published before the limit is shown", async () => {
    // V-046 requires warnings to appear BEFORE the configured threshold. The server publishes
    // budget_warning on this channel; if the shell ignores it the user only ever learns about
    // spending after the cap is already blown.
    await open();
    expect(screen.queryByTestId("budget-alert")).toBeNull();

    act(() => publish({ type: "budget_warning", scope: "project", spent: 8, limit: 10, fraction: 0.8 }));

    await waitFor(() => expect(screen.getByTestId("budget-alert")).toBeTruthy());
    const text = screen.getByTestId("budget-alert").textContent ?? "";
    expect(text).toContain("$8.00");
    expect(text).toContain("$10.00");
    expect(text.toLowerCase()).toContain("project");
  });

  test("a hard stop is distinguishable from a warning", async () => {
    await open();
    act(() => publish({ type: "budget_exceeded", scope: "agent", spent: 3.5, limit: 3 }));

    await waitFor(() => expect(screen.getByTestId("budget-alert")).toBeTruthy());
    const alert = screen.getByTestId("budget-alert");
    // A stop and a warning must not read the same; one means work has halted.
    expect(alert.getAttribute("data-severity")).toBe("exceeded");
    expect((alert.textContent ?? "").toLowerCase()).toContain("paused");
  });

  test("an exceeded alert is not overwritten by a later warning", async () => {
    await open();
    act(() => publish({ type: "budget_exceeded", scope: "agent", spent: 3.5, limit: 3 }));
    await waitFor(() => expect(screen.getByTestId("budget-alert")).toBeTruthy());

    act(() => publish({ type: "budget_warning", scope: "project", spent: 8, limit: 10, fraction: 0.8 }));
    // Downgrading a stop to a warning would hide that execution is halted.
    expect(screen.getByTestId("budget-alert").getAttribute("data-severity")).toBe("exceeded");
  });

  test("the alert can be dismissed", async () => {
    await open();
    act(() => publish({ type: "budget_warning", scope: "project", spent: 8, limit: 10, fraction: 0.8 }));
    await waitFor(() => expect(screen.getByTestId("budget-alert")).toBeTruthy());

    fireEvent.click(screen.getByTestId("budget-alert-dismiss"));
    expect(screen.queryByTestId("budget-alert")).toBeNull();
  });

  test("a dismissed alert stays dismissed when the session drawer is opened", async () => {
    // The socket effect listed the drawer's agent id in its dependencies, so opening the drawer
    // tore the connection down and rebuilt it — and the bus replays recent events to a new
    // subscriber, which re-raised the banner the user had just dismissed.
    await open();
    act(() => publish({ type: "budget_warning", scope: "project", spent: 8, limit: 10, fraction: 0.8 }));
    await waitFor(() => expect(screen.getByTestId("budget-alert")).toBeTruthy());
    fireEvent.click(screen.getByTestId("budget-alert-dismiss"));

    const before = sockets.length;
    fireEvent.click(screen.getAllByTestId("agent-open-session")[0]);
    await waitFor(() => expect(screen.getByTestId("session-drawer")).toBeTruthy());

    expect(sockets.length, "opening the drawer reconnected the control-room socket").toBe(before);
    expect(screen.queryByTestId("budget-alert")).toBeNull();

    // Closing it must not resurrect the banner either.
    fireEvent.click(screen.getByTestId("drawer-close"));
    await waitFor(() => expect(screen.queryByTestId("session-drawer")).toBeNull());
    expect(screen.queryByTestId("budget-alert")).toBeNull();
  });

  test("the drawer still receives its transcript after the dependency was dropped", async () => {
    // The ref that replaced the dependency has to keep routing transcript entries, or the fix
    // above would trade one silent failure for another.
    await open();
    fireEvent.click(screen.getAllByTestId("agent-open-session")[0]);
    await waitFor(() => expect(screen.getByTestId("session-drawer")).toBeTruthy());

    act(() => publish({ type: "transcript", agentId: "a1", entry: { seq: 7, kind: "agent", text: "editing greet.ts" } }));
    await waitFor(() => expect(screen.getByTestId("drawer-transcript").textContent).toContain("editing greet.ts"));

    // An entry for a different agent must not leak into this drawer.
    act(() => publish({ type: "transcript", agentId: "a2", entry: { seq: 8, kind: "agent", text: "not mine" } }));
    expect(screen.getByTestId("drawer-transcript").textContent).not.toContain("not mine");
  });
});

describe("a session blocked on sign-in says so (V-004)", () => {
  test("auth_required surfaces the server's actionable message", async () => {
    await openShell();
    expect(screen.queryByTestId("auth-alert")).toBeNull();

    act(() =>
      publish({
        type: "auth_required",
        agentId: "a1",
        authMethods: ["oauth"],
        message: "Grok has no credentials. Run `grok` in a terminal and sign in, then try again.",
      }),
    );

    await waitFor(() => expect(screen.getByTestId("auth-alert")).toBeTruthy());
    expect(screen.getByTestId("auth-alert-message").textContent).toContain("sign in");
    // Named, because a fleet of five agents needs to say which one is blocked.
    expect(screen.getByTestId("auth-alert-agent").textContent).toBe("Backend Engineer");
    expect(screen.getByTestId("auth-alert").getAttribute("role")).toBe("alert");

    fireEvent.click(screen.getByTestId("auth-alert-dismiss"));
    expect(screen.queryByTestId("auth-alert")).toBeNull();
  });
});

describe("Grok's availability is stated before work is attempted (V-004)", () => {
  test("a missing binary raises the banner with the server's guidance", async () => {
    grokStatus = {
      installed: false,
      version: null,
      binaryPath: null,
      error: "grok: command not found",
      setupMessage: "  npm i -g @x-ai/grok-build\n  grok --version",
    };
    await openShell();

    await waitFor(() => expect(screen.getByTestId("setup-banner")).toBeTruthy());
    expect(screen.getByTestId("setup-banner-error").textContent).toContain("command not found");
    expect(screen.getByTestId("setup-banner-guidance").textContent).toContain("grok --version");
  });

  test("an installed Grok shows nothing", async () => {
    await openShell();
    expect(screen.queryByTestId("setup-banner")).toBeNull();
  });

  test("a failed status request leaves the room usable rather than crying wolf", async () => {
    // Null is "not asked yet", not "broken": claiming Grok is missing because a fetch failed
    // would be a lie, and it must not take the shell down either.
    failNext = "/api/grok/status";
    await openShell();
    expect(screen.queryByTestId("setup-banner")).toBeNull();
    expect(screen.getByTestId("control-room")).toBeTruthy();
  });
});

describe("an unowned task can be given an owner (§10 step 5)", () => {
  test("choosing an agent PATCHes the task and refreshes", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-plan"));
    await waitFor(() => expect(screen.getByTestId("plan-task-assign-t2")).toBeTruthy());

    // Launch is refused until the task has an owner, which is the point of the picker.
    expect((screen.getByTestId("plan-launch-t2") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("plan-task-assign-t2"), { target: { value: "a1" } });

    await waitFor(() => {
      const patch = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/tasks/t2"));
      expect(patch, "no PATCH to the task endpoint").toBeTruthy();
      expect(JSON.parse(patch!.body!)).toEqual({ assignedAgentId: "a1" });
    });

    // The task list is reloaded, otherwise the owner would not appear until the next event.
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.url === "/api/projects/p1").length).toBeGreaterThan(1),
    );
  });

  test("an owned task offers no picker", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-plan"));
    await waitFor(() => expect(screen.getByTestId("plan-task-owner-t1")).toBeTruthy());
    expect(screen.queryByTestId("plan-task-assign-t1")).toBeNull();
    expect(screen.getByTestId("plan-task-owner-t1").textContent).toBe("Backend Engineer");
  });
});

describe("the reviewer can see the changes (V-037)", () => {
  async function openReviews() {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-reviews"));
    await waitFor(() => expect(screen.getByTestId("review-queue")).toBeTruthy());
  }

  test("the two repository shapes are adapted into one diff view", async () => {
    await openReviews();
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));

    await waitFor(() => expect(screen.getAllByTestId("diff-file").length).toBe(1));
    const file = screen.getByTestId("diff-file");
    expect(file.getAttribute("data-path")).toBe("greet.ts");
    // "M" is unreadable on its own, and status must never be colour alone.
    expect(file.textContent).toContain("modified");
    // /changed-files reports no line counts, so none are invented for the file row.
    expect(file.textContent).not.toContain("+0");

    // The unified diff comes from the second endpoint, wrapped in { diff }.
    const body = screen.getByTestId("diff-body").textContent ?? "";
    expect(body).toContain("+new line");
    expect(body).toContain("-old line");

    // Both requests carry the submission's worktree and the project's base branch.
    const changed = calls.find((c) => c.url.startsWith("/api/repository/changed-files"));
    const diff = calls.find((c) => c.url.startsWith("/api/repository/diff"));
    for (const call of [changed, diff]) {
      expect(call, "a repository endpoint was never called").toBeTruthy();
      const query = new URLSearchParams(call!.url.split("?")[1]);
      expect(query.get("worktree")).toBe("/tmp/repo/.agents/a1");
      expect(query.get("base")).toBe("main");
    }
  });

  test("a submission with no worktree reports no changes instead of failing", async () => {
    submissionWorktree = undefined;
    await openReviews();
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));

    await waitFor(() => expect(screen.getByTestId("diff-empty")).toBeTruthy());
    expect(screen.queryByTestId("diff-error")).toBeNull();
    // Nothing to ask git about, so nothing was asked.
    expect(calls.some((c) => c.url.startsWith("/api/repository/"))).toBe(false);
  });

  test("a refused diff is reported rather than shown as an empty change set", async () => {
    failNext = "/api/repository/changed-files";
    await openReviews();
    fireEvent.click(screen.getByTestId("submission-diff-toggle-sub1"));

    await waitFor(() => expect(screen.getByTestId("diff-error")).toBeTruthy());
    expect(screen.getByTestId("diff-error").textContent).toContain("stubbed failure");
  });
});

describe("a refused review action is visible (§22.18)", () => {
  test("a rejected approve leaves an error rather than vanishing", async () => {
    // These two mutations had no error handling and were called from bare arrows, so a server
    // refusal became an unhandled rejection and the screen did not change at all.
    failNext = "/submissions/sub1/approve";
    await openShell();
    fireEvent.click(screen.getByTestId("tab-reviews"));
    await waitFor(() => expect(screen.getByTestId("submission-approve-sub1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("submission-approve-sub1"));

    await waitFor(() => expect(screen.getByTestId("control-room-error")).toBeTruthy());
    expect(screen.getByTestId("control-room-error").textContent).toContain("stubbed failure");
  });

  test("a rejected suggestion resolution leaves an error too", async () => {
    failNext = "/suggestions/s1/resolve";
    await openShell();
    fireEvent.click(screen.getByTestId("tab-reviews"));
    await waitFor(() => expect(screen.getByTestId("suggestion-accept-s1")).toBeTruthy());

    fireEvent.click(screen.getByTestId("suggestion-accept-s1"));

    await waitFor(() => expect(screen.getByTestId("control-room-error")).toBeTruthy());
    expect(screen.getByTestId("control-room-error").textContent).toContain("stubbed failure");
  });

  test("the revision note the user typed is what the agent is sent", async () => {
    // The shell used to drop it and send a hardcoded "Please revise", which told the agent
    // nothing about what to change.
    await openShell();
    fireEvent.click(screen.getByTestId("tab-reviews"));
    await waitFor(() => expect(screen.getByTestId("suggestion-revise-s1")).toBeTruthy());

    fireEvent.change(screen.getByTestId("suggestion-revision-note-s1"), {
      target: { value: "Name the error type this raises" },
    });
    fireEvent.click(screen.getByTestId("suggestion-revise-s1"));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.url.includes("/suggestions/s1/resolve"));
      expect(post, "the resolve endpoint was never called").toBeTruthy();
      expect(JSON.parse(post!.body!)).toEqual({
        action: "request_revision",
        note: "Name the error type this raises",
      });
    });
  });
});

describe("the user can answer an agent from the panel it asked in (§21)", () => {
  async function openConversations() {
    await openShell();
    fireEvent.click(screen.getByTestId("tab-conversations"));
    await waitFor(() => expect(screen.getByTestId("conversation-view")).toBeTruthy());
  }

  test("a reply is posted as an answer on the same thread, carrying the question's links", async () => {
    await openConversations();
    fireEvent.change(screen.getByTestId("message-reply-input-m1"), { target: { value: "Yes, go ahead" } });
    fireEvent.click(screen.getByTestId("message-reply-send-m1"));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.url === "/api/projects/p1/messages");
      expect(post, "no message was posted").toBeTruthy();
      expect(JSON.parse(post!.body!)).toEqual({
        kind: "answer",
        toAgentId: "a1",
        body: "Yes, go ahead",
        // The server rejects an unlinked message, so the reply inherits what was being discussed.
        links: [{ kind: "branch", id: "agent/greet" }],
        threadId: "t1",
        replyToId: "m1",
      });
    });
  });

  test("marking a message read calls the endpoint and refreshes", async () => {
    await openConversations();
    fireEvent.click(screen.getByTestId("message-mark-read-m1"));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "PATCH" && c.url === "/api/projects/p1/messages/m1/read"),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.url === "/api/projects/p1").length).toBeGreaterThan(1),
    );
  });
});

describe("more than one project is reachable from the browser", () => {
  test("the switcher selects another project and loads it", async () => {
    projectsResponse = [
      { id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" },
      { id: "p2", name: "Billing", goal: "g", repositoryPath: "/tmp/other" },
    ];
    await openShell();

    fireEvent.change(screen.getByTestId("project-switcher"), { target: { value: "p2" } });
    await waitFor(() => expect(calls.some((c) => c.url === "/api/projects/p2")).toBe(true));
  });

  test("New project opens the form over the shell, and Back returns to it", async () => {
    // The form existed only in the zero-project empty state, which made every project after the
    // first unreachable without editing the URL.
    await openShell();
    fireEvent.click(screen.getByTestId("new-project-button"));
    await waitFor(() => expect(screen.getByTestId("control-room-new-project")).toBeTruthy());

    fireEvent.click(screen.getByTestId("new-project-cancel"));
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
  });

  test("creating from the shell selects the new project and dismisses the form", async () => {
    await openShell();
    fireEvent.click(screen.getByTestId("new-project-button"));
    await waitFor(() => expect(screen.getByTestId("new-project")).toBeTruthy());

    fireEvent.change(screen.getByTestId("np-repo"), { target: { value: "/tmp/repo" } });
    fireEvent.change(screen.getByTestId("np-name"), { target: { value: "Greeting Service" } });
    fireEvent.click(screen.getByTestId("np-submit"));

    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
    expect(screen.queryByTestId("new-project")).toBeNull();
  });
});

describe("a project created without a team says so", () => {
  test("teamError is surfaced and survives the project load that follows", async () => {
    // The project exists either way, and one with no agents can plan nothing and launch nothing.
    // Silence here is how this class of bug survived before.
    createdTeam = { agents: [], teamError: "agent registry is read-only" };
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("new-project")).toBeTruthy());

    fireEvent.change(screen.getByTestId("np-repo"), { target: { value: "/tmp/repo" } });
    fireEvent.change(screen.getByTestId("np-name"), { target: { value: "Greeting Service" } });
    projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
    fireEvent.click(screen.getByTestId("np-submit"));

    await waitFor(() => expect(screen.getByTestId("team-error")).toBeTruthy());
    expect(screen.getByTestId("team-error").textContent).toContain("agent registry is read-only");

    // It must still be there once the project has loaded — loading clears state.error, and this
    // message would have gone with it.
    await waitFor(() => expect(screen.getByTestId("project-name").textContent).toBe("Greeting Service"));
    expect(screen.getByTestId("team-error")).toBeTruthy();
  });

  test("a seeded team arrives with the project rather than being refetched", async () => {
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("new-project")).toBeTruthy());

    fireEvent.change(screen.getByTestId("np-repo"), { target: { value: "/tmp/repo" } });
    fireEvent.change(screen.getByTestId("np-name"), { target: { value: "Greeting Service" } });
    projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
    fireEvent.click(screen.getByTestId("np-submit"));

    await waitFor(() => expect(screen.getAllByTestId("agent-card").length).toBe(2));
    expect(screen.queryByTestId("team-error")).toBeNull();
  });
});
