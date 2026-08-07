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
};

const AGENTS = [
  { id: "a1", projectId: "p1", name: "Backend Engineer", role: "Backend Engineer", skills: [], tools: [],
    status: "working", activity: { command: "bun test" }, costUsd: 0.05, tokensUsed: 100, currentTaskId: "t1" },
  { id: "a2", projectId: "p1", name: "Reviewer", role: "Reviewer", skills: [], tools: [],
    status: "idle", activity: {}, costUsd: 0, tokensUsed: 0 },
];

const calls: Array<{ method: string; url: string; body?: string }> = [];
const sockets: Array<{ onmessage: ((e: { data: string }) => void) | null }> = [];

/** Deliver a control-room event exactly as the server publishes it. */
function publish(event: unknown) {
  for (const s of sockets) s.onmessage?.({ data: JSON.stringify({ event }) });
}
let projectsResponse: any = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
let failNext: string | null = null;

function stubFetch() {
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body as string });

    if (failNext && String(url).includes(failNext)) {
      return new Response(JSON.stringify({ error: "stubbed failure" }), { status: 500 });
    }
    const send = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

    if (url === "/api/projects") return send(projectsResponse);
    if (String(url).endsWith("/api/projects/p1")) return send(PROJECT);
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
    constructor(public url: string) { sockets.push(this as any); }
    close() {}
  };
}

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  projectsResponse = [{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }];
  stubFetch();
});
afterEach(cleanup);

describe("Control Room shell", () => {
  test("loads a project and renders the header with live figures", async () => {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());

    expect(screen.getByTestId("project-name").textContent).toBe("Greeting Service");
    expect(screen.getByTestId("project-goal").textContent).toBe("Implement the greeting feature");
    expect(screen.getByTestId("project-progress-text").textContent).toBe("50% · 1/2 requirements");
    expect(screen.getByTestId("project-cost-summary").textContent).toBe("$0.05 / $10.00");
    // Pending queues are surfaced from the loaded project.
    expect(screen.getByTestId("reviews-pending-badge").textContent).toBe("1 review pending");
    expect(screen.getByTestId("suggestions-pending-badge").textContent).toBe("1 suggestion pending");
  });

  test("shows an actionable empty state when no project exists", async () => {
    projectsResponse = [];
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room-no-projects")).toBeTruthy());
    // Tells the user how to proceed rather than showing a blank screen.
    expect(screen.getByTestId("control-room-no-projects").textContent).toContain("/api/projects");
  });

  test("every tab renders its panel", async () => {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());

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
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());

    // Nothing selected yet.
    expect(screen.getByTestId("requirement-detail-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("requirement-GREET-01"));
    expect(screen.getByTestId("detail-id").textContent).toBe("GREET-01");
    expect(screen.getByTestId("detail-branch").textContent).toBe("agent/greet");
    // The owning agent is resolved from the agent list, not re-fetched.
    expect(screen.getByTestId("detail-owner").textContent).toContain("Backend Engineer");
  });

  test("opening a session replaces the panel with the drawer and calls the API", async () => {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());

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
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
    fireEvent.click(screen.getByTestId("tab-canvas"));
    expect(screen.getByTestId("agent-canvas")).toBeTruthy();
  });

  test("agent status is shown with text, not colour alone", async () => {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
    const labels = screen.getAllByTestId("agent-status-label").map((n) => n.textContent);
    expect(labels).toContain("Working");
    expect(labels).toContain("Idle");
  });
});

describe("the shell can reach archived conversation history", () => {
  async function openConversations() {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
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
  async function open() {
    render(<ControlRoomApp />);
    await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
  }

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
});
