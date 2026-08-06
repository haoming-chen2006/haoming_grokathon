import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AgentStatusBadge } from "./AgentStatusBadge";
import { AgentCard } from "./AgentCard";
import { CommandCenter } from "./CommandCenter";
import {
  AGENT_RUNTIME_STATUSES,
  STATUS_CLASSES,
  STATUS_LABELS,
  statusLabel,
  type CodingAgent,
} from "./types";

afterEach(cleanup);

function agent(overrides: Partial<CodingAgent> = {}): CodingAgent {
  return {
    id: "agent_1",
    projectId: "proj_1",
    name: "Backend Agent",
    role: "Backend Engineer",
    skills: [],
    tools: [],
    status: "working",
    activity: {},
    costUsd: 0,
    tokensUsed: 0,
    ...overrides,
  };
}

describe("V-022: agent states are accurate — rendered", () => {
  test("every status renders visible text, not just colour", () => {
    // The core V-022 requirement, asserted against real rendered DOM.
    for (const status of AGENT_RUNTIME_STATUSES) {
      const { unmount } = render(<AgentStatusBadge status={status} />);
      const badge = screen.getByTestId("agent-status");
      const label = screen.getByTestId("agent-status-label");

      expect(badge.getAttribute("data-status")).toBe(status);
      expect(label.textContent).toBe(STATUS_LABELS[status]);
      expect(label.textContent!.trim().length).toBeGreaterThan(0);
      unmount();
    }
  });

  test("the six required states are all supported", () => {
    expect(AGENT_RUNTIME_STATUSES).toEqual([
      "working",
      "waiting",
      "needs_review",
      "complete",
      "idle",
      "failed",
    ]);
  });

  test("status text survives with styling stripped", () => {
    // If colour were the only signal, removing classes would erase the meaning.
    render(<AgentStatusBadge status="needs_review" />);
    const badge = screen.getByTestId("agent-status");
    badge.className = "";
    expect(badge.textContent).toContain("Needs Review");
  });

  test("the coloured dot is hidden from assistive technology", () => {
    render(<AgentStatusBadge status="working" />);
    const dot = screen.getByTestId("agent-status").querySelector("[aria-hidden='true']");
    expect(dot).not.toBeNull();
  });

  test("the badge exposes an accessible name including the detail", () => {
    render(<AgentStatusBadge status="waiting" detail="Waiting for API contract" />);
    expect(screen.getByTestId("agent-status").getAttribute("aria-label")).toBe(
      "Waiting: Waiting for API contract",
    );
  });

  test("every status has a distinct colour class", () => {
    const classes = AGENT_RUNTIME_STATUSES.map((s) => STATUS_CLASSES[s]);
    expect(new Set(classes).size).toBe(AGENT_RUNTIME_STATUSES.length);
  });

  test("an unknown status throws rather than rendering an empty badge", () => {
    expect(() => statusLabel("bogus" as any)).toThrow(/No label defined/);
  });
});

describe("client and server status vocabularies do not drift", () => {
  test("the client mirrors the server's statuses and labels exactly", async () => {
    // The client duplicates the enum for bundle reasons; if the server adds or renames a status
    // and the client is not updated, an agent would render with no label at all.
    const server = await import("../../../server/types/agent");

    expect(AGENT_RUNTIME_STATUSES).toEqual(server.AGENT_RUNTIME_STATUSES);
    for (const status of server.AGENT_RUNTIME_STATUSES) {
      expect(STATUS_LABELS[status]).toBe(server.AGENT_STATUS_PRESENTATION[status].label);
    }
  });
});

describe("V-024: current coding activity is visible — rendered", () => {
  test("all activity fields the design names are displayed", () => {
    render(
      <AgentCard
        agent={agent({
          currentTaskId: "task-api",
          branch: "agent/auth-backend",
          worktree: ".agents/agent-auth-backend",
          costUsd: 0.71,
          activity: {
            command: "bun test",
            tool: "shell",
            latestFile: "src/auth/session.ts",
            testsPassing: 18,
            testsTotal: 20,
          },
        })}
      />,
    );

    expect(screen.getByTestId("agent-command").textContent).toBe("bun test");
    expect(screen.getByTestId("agent-tool").textContent).toBe("shell");
    expect(screen.getByTestId("agent-task").textContent).toBe("task-api");
    expect(screen.getByTestId("agent-file").textContent).toBe("src/auth/session.ts");
    expect(screen.getByTestId("agent-branch").textContent).toBe("agent/auth-backend");
    expect(screen.getByTestId("agent-worktree").textContent).toBe(".agents/agent-auth-backend");
    expect(screen.getByTestId("agent-tests").textContent).toBe("18/20 passing");
    expect(screen.getByTestId("agent-cost").textContent).toBe("$0.71");
  });

  test("a blocker is displayed prominently", () => {
    render(<AgentCard agent={agent({ status: "waiting", activity: { blocker: "Needs API contract" } })} />);
    expect(screen.getByTestId("agent-blocker").textContent).toContain("Needs API contract");
  });

  test("fields the server did not supply are omitted, not faked", () => {
    // §22.18 forbids fabricated status and fabricated cost — an absent value must not render
    // as a plausible-looking placeholder.
    render(<AgentCard agent={agent()} />);
    expect(screen.queryByTestId("agent-command")).toBeNull();
    expect(screen.queryByTestId("agent-tool")).toBeNull();
    expect(screen.queryByTestId("agent-file")).toBeNull();
    expect(screen.queryByTestId("agent-branch")).toBeNull();
    expect(screen.queryByTestId("agent-tests")).toBeNull();
    expect(screen.queryByTestId("agent-blocker")).toBeNull();
  });

  test("a partial test count does not render a half-formed ratio", () => {
    render(<AgentCard agent={agent({ activity: { testsPassing: 18 } })} />);
    expect(screen.queryByTestId("agent-tests")).toBeNull();
  });

  test("cost is always shown, including zero", () => {
    render(<AgentCard agent={agent({ costUsd: 0 })} />);
    expect(screen.getByTestId("agent-cost").textContent).toBe("$0.00");
  });

  test("the card shows the agent name and role", () => {
    render(<AgentCard agent={agent()} />);
    expect(screen.getByTestId("agent-name").textContent).toBe("Backend Agent");
    expect(screen.getByTestId("agent-role").textContent).toBe("Backend Engineer");
  });
});

describe("V-021: agent command center", () => {
  const fleet = [
    agent({ id: "a1", name: "Planner", status: "waiting" }),
    agent({ id: "a2", name: "Backend", status: "working" }),
    agent({ id: "a3", name: "Frontend", status: "working" }),
    agent({ id: "a4", name: "Reviewer", status: "idle" }),
  ];

  test("renders one card per agent", () => {
    render(<CommandCenter agents={fleet} />);
    expect(screen.getAllByTestId("agent-card")).toHaveLength(4);
    expect(screen.getByTestId("agent-total").textContent).toBe("4 agents");
  });

  test("summarises the fleet by status using text labels", () => {
    render(<CommandCenter agents={fleet} />);
    expect(screen.getByTestId("summary-working").textContent).toBe("2 Working");
    expect(screen.getByTestId("summary-waiting").textContent).toBe("1 Waiting");
    expect(screen.getByTestId("summary-idle").textContent).toBe("1 Idle");
    // Statuses with no agents are not shown at all.
    expect(screen.queryByTestId("summary-failed")).toBeNull();
  });

  test("shows project cost against budget", () => {
    render(<CommandCenter agents={fleet} projectCostUsd={4.12} projectBudgetUsd={10} />);
    expect(screen.getByTestId("project-cost").textContent).toBe("$4.12 / $10.00");
  });

  test("an empty fleet explains what to do rather than showing a blank canvas", () => {
    render(<CommandCenter agents={[]} />);
    expect(screen.getByTestId("command-center-empty").textContent).toContain("Approve an implementation plan");
    expect(screen.queryByTestId("agent-card")).toBeNull();
  });

  test("singular wording for one agent", () => {
    render(<CommandCenter agents={[fleet[0]]} />);
    expect(screen.getByTestId("agent-total").textContent).toBe("1 agent");
  });

  test("session controls fire with the agent id", () => {
    const opened: string[] = [];
    const paused: string[] = [];
    const stopped: string[] = [];
    render(
      <CommandCenter
        agents={[fleet[1]]}
        onOpenSession={(id) => opened.push(id)}
        onPause={(id) => paused.push(id)}
        onStop={(id) => stopped.push(id)}
      />,
    );

    fireEvent.click(screen.getByTestId("agent-open-session"));
    fireEvent.click(screen.getByTestId("agent-pause"));
    fireEvent.click(screen.getByTestId("agent-stop"));

    expect(opened).toEqual(["a2"]);
    expect(paused).toEqual(["a2"]);
    expect(stopped).toEqual(["a2"]);
  });

  test("controls are real buttons, not decorative elements", () => {
    // §22.18: "no empty buttons; no controls that do nothing".
    render(<CommandCenter agents={[fleet[1]]} />);
    for (const id of ["agent-open-session", "agent-pause", "agent-stop"]) {
      const el = screen.getByTestId(id);
      expect(el.tagName).toBe("BUTTON");
      expect(el.textContent!.trim().length).toBeGreaterThan(0);
    }
  });
});
