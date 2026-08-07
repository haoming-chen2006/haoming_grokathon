import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ControlRoomApp } from "./ControlRoomApp";

/**
 * A standing guard for the §22.17 UI acceptance checklist.
 *
 * Those 22 rows were verified once, by hand, in iteration 33 — after the previous iterations had
 * recorded them as "rendered" when the components existed but nothing imported them. Since then
 * the shell has been edited repeatedly and **nothing re-checked that the rows are still mounted**.
 * A row could disappear and every other test would stay green, which is the exact failure the
 * original correction was about.
 *
 * Each row here is asserted against the assembled app, reaching it the way a user would: switching
 * tabs, selecting a requirement, opening the session drawer.
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
      taskIds: ["t1"], affectedFiles: ["greet.ts"], status: "in_progress",
      reviewStatus: "pending", baseVersion: 1, ownerAgentId: "a1",
      branch: "agent/greet", worktree: "/tmp/repo/.agents/a1", testsPassing: 1, testsTotal: 1,
    },
  ],
  suggestions: [
    { id: "s1", authorAgentId: "a1", requirementId: "GREET-01", baseVersion: 1,
      originalText: "old", proposedText: "new", reason: "because", affectedFiles: [], state: "pending" },
  ],
  submissions: [
    { id: "sub1", taskId: "t1", agentId: "a1", requirementIds: ["GREET-01"], branch: "agent/greet",
      changedFiles: ["greet.ts"], summary: "Implement greet", testResults: { passed: 1, failed: 0, total: 1 },
      costUsd: 0.05, state: "pending", knownLimitations: "None" },
  ],
  messages: [
    { id: "m1", kind: "handoff", fromAgentId: "a1", toAgentId: "a2", body: "ready",
      links: [{ kind: "branch", id: "agent/greet" }], threadId: "t1", createdAt: "" },
  ],
  tasks: [{ id: "t1", objective: "Implement greet", assignedAgentId: "a1", status: "working", dependsOn: [] }],
};

const AGENTS = [
  { id: "a1", projectId: "p1", name: "Backend Engineer", role: "Backend Engineer", skills: [], tools: [],
    status: "working", statusDetail: "Implementing greet", activity: { command: "bun test", file: "greet.ts" },
    costUsd: 0.05, tokensUsed: 100, currentTaskId: "t1", branch: "agent/greet",
    worktree: "/tmp/repo/.agents/a1", position: { x: 10, y: 20 } },
  { id: "a2", projectId: "p1", name: "Reviewer", role: "Reviewer", skills: [], tools: [],
    status: "waiting", statusDetail: "Blocked on the API contract",
    activity: { blocker: "Waiting on the API contract" },
    costUsd: 0, tokensUsed: 0 },
];

function stubFetch() {
  (globalThis as any).fetch = async (url: string) => {
    const send = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    const u = String(url);
    if (u === "/api/projects") return send([{ id: "p1", name: "Greeting Service", goal: "g", repositoryPath: "/tmp/repo" }]);
    if (u.endsWith("/api/projects/p1")) return send(PROJECT);
    if (u.includes("/document")) return send({ title: "Design", version: 2, content: "# Design" });
    if (u.includes("/coding-agents?projectId")) return send(AGENTS);
    if (u.includes("/progress")) return send({ percent: 50, completed: 1, total: 2 });
    if (u.includes("/costs/")) return send({ projectCostUsd: 4.12, projectBudgetUsd: 10 });
    if (u.includes("/session")) {
      return send({
        agentId: "a1", projectId: "p1", acpSessionId: "sess-1", state: "ready",
        transcript: [{ seq: 1, kind: "agent", text: "Working on greet.ts" }],
      });
    }
    return send({});
  };
  (globalThis as any).WebSocket = class {
    onmessage: any; onclose: any;
    constructor(public url: string) {}
    close() {}
  };
}

async function openApp() {
  render(<ControlRoomApp />);
  await waitFor(() => expect(screen.getByTestId("control-room")).toBeTruthy());
}

async function openTab(id: string) {
  fireEvent.click(screen.getByTestId(`tab-${id}`));
}

beforeEach(stubFetch);
afterEach(cleanup);

describe("§22.17: every checklist row is reachable in the assembled app", () => {
  test("project goal, overall progress and overall cost are on the header", async () => {
    await openApp();
    expect(screen.getByTestId("project-goal").textContent).toBe("Implement the greeting feature");
    // Progress is text, not only a bar — a bar alone is imprecise and unreadable to a screen reader.
    expect(screen.getByTestId("project-progress-text").textContent).toContain("50%");
    expect(screen.getByTestId("project-progress").getAttribute("role")).toBe("progressbar");
    expect(screen.getByTestId("project-cost-summary").textContent).toBe("$4.12 / $10.00");
  });

  test("active agents show role, status, branch, worktree, task and blocker", async () => {
    await openApp();
    await openTab("agents");
    await waitFor(() => expect(screen.getAllByTestId("agent-card").length).toBeGreaterThan(0));

    const text = screen.getByTestId("command-center").textContent ?? "";
    expect(screen.getAllByTestId("agent-role").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("agent-status-label").length).toBeGreaterThan(0);
    expect(text).toContain("agent/greet");           // branch
    expect(text).toContain(".agents/a1");            // worktree
    expect(screen.getAllByTestId("agent-blocker").length).toBeGreaterThan(0); // current blocker
  });

  test("pause and stop controls are present on an agent", async () => {
    await openApp();
    await openTab("agents");
    await waitFor(() => expect(screen.getAllByTestId("agent-card").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("agent-pause").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("agent-stop").length).toBeGreaterThan(0);
  });

  test("the agent canvas renders", async () => {
    await openApp();
    await openTab("canvas");
    await waitFor(() => expect(screen.getByTestId("agent-canvas")).toBeTruthy());
  });

  test("the design document renders with its version", async () => {
    await openApp();
    await openTab("document");
    await waitFor(() => expect(screen.getByTestId("document-panel")).toBeTruthy());
    expect(screen.getByTestId("document-version").textContent).toContain("2");
  });

  test("the requirement list renders, and a selected requirement shows its detail", async () => {
    await openApp();
    await openTab("document");
    await waitFor(() => expect(screen.getByTestId("requirement-list")).toBeTruthy());

    fireEvent.click(screen.getByText("GREET-01"));
    await waitFor(() => expect(screen.getByTestId("requirement-detail")).toBeTruthy());
    const detail = screen.getByTestId("requirement-detail").textContent ?? "";
    expect(detail).toContain("greet.ts");   // changed/affected files
    expect(detail).toMatch(/1\s*\/\s*1|1 of 1/); // test results
  });

  test("pending design suggestions render with all four actions", async () => {
    await openApp();
    await openTab("reviews");
    await waitFor(() => expect(screen.getByTestId("suggestion-queue")).toBeTruthy());

    const q = screen.getByTestId("suggestion-queue").textContent ?? "";
    expect(q).toContain("because");   // reason
    expect(q).toContain("old");       // original
    expect(q).toContain("new");       // proposed
    for (const label of [/accept/i, /reject/i, /edit/i, /revision/i]) {
      expect(screen.getByTestId("suggestion-queue").innerHTML).toMatch(label);
    }
  });

  test("pending code reviews render with the evidence a reviewer needs", async () => {
    await openApp();
    await openTab("reviews");
    await waitFor(() => expect(screen.getByTestId("review-queue")).toBeTruthy());

    const q = screen.getByTestId("review-queue").textContent ?? "";
    expect(q).toContain("agent/greet");        // branch
    expect(q).toContain("Implement greet");    // summary
    expect(q).toContain("1 file");             // changed-file count, per the §22.17 row
    expect(q).toContain("None");               // known limitations
  });

  test("request revision and approve merge are both offered", async () => {
    await openApp();
    await openTab("reviews");
    await waitFor(() => expect(screen.getByTestId("review-queue")).toBeTruthy());
    const html = screen.getByTestId("review-queue").innerHTML;
    expect(html).toMatch(/request changes/i);
    expect(html).toMatch(/approve/i);
  });

  test("agent conversations render grouped by thread with their links", async () => {
    await openApp();
    await openTab("conversations");
    await waitFor(() => expect(screen.getByTestId("conversation-view")).toBeTruthy());
    const text = screen.getByTestId("conversation-view").textContent ?? "";
    expect(text).toContain("ready");
    expect(text).toContain("agent/greet"); // the linked object, not just the body
  });

  test("a live Grok session can be opened, showing state and transcript", async () => {
    // The one row that could not pass before B-3 cleared.
    await openApp();
    await openTab("agents");
    await waitFor(() => expect(screen.getAllByTestId("agent-open-session").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByTestId("agent-open-session")[0]);
    await waitFor(() => expect(screen.getByTestId("session-drawer")).toBeTruthy());
    expect(screen.getByTestId("drawer-session-id").textContent).toContain("sess-1");
    expect(screen.getByTestId("drawer-state").textContent).toMatch(/ready/i);
    await waitFor(() => expect(screen.getByTestId("drawer-transcript").textContent).toContain("greet.ts"));
  });

  test("every tab in the shell reaches a panel rather than an empty frame", async () => {
    // Guards against a tab being left wired to nothing after a refactor.
    await openApp();
    const panels: Record<string, string> = {
      agents: "command-center",
      canvas: "agent-canvas",
      document: "document-panel",
      reviews: "review-queue",
      conversations: "conversation-view",
    };
    for (const [tab, testid] of Object.entries(panels)) {
      await openTab(tab);
      await waitFor(() => expect(screen.getByTestId(testid)).toBeTruthy());
    }
  });
});
