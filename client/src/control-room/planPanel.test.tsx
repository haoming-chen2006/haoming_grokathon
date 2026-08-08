import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanPanel } from "./PlanPanel";
import type { PlanView, TaskView } from "./useControlRoom";

afterEach(cleanup);

const draft: PlanView = { id: "plan_1", state: "draft", milestones: [] };
const approved: PlanView = { id: "plan_1", state: "approved", approvedBy: "user", milestones: [] };

const tasks: TaskView[] = [
  { id: "t1", objective: "Implement greet", status: "pending", assignedAgentId: "a1", requirementId: "GREET-01", dependsOn: [] },
  { id: "t2", objective: "Cover with tests", status: "pending", assignedAgentId: "a2", requirementId: "GREET-02", dependsOn: ["t1"] },
];

const agentName = (id: string) => ({ a1: "Backend Engineer", a2: "Test Engineer" })[id];

describe("the approval gate is operable from the Control Room (V-018)", () => {
  test("a draft plan says so and offers approval", () => {
    render(<PlanPanel plan={draft} tasks={tasks} onApprove={() => {}} />);
    expect(screen.getByTestId("plan-state").textContent).toBe("Draft");
    expect(screen.getByTestId("plan-approve")).toBeTruthy();
    // The gate is explained, not just enforced.
    expect(screen.getByTestId("plan-gate-note").textContent).toContain("Nothing runs until you approve");
  });

  test("approving calls back exactly once", () => {
    let calls = 0;
    render(<PlanPanel plan={draft} tasks={tasks} onApprove={() => { calls += 1; }} />);
    fireEvent.click(screen.getByTestId("plan-approve"));
    expect(calls).toBe(1);
  });

  test("launch is disabled while the plan is a draft, and says why", () => {
    // Mirrors the server, which returns PLAN_NOT_APPROVED. A control that refuses and explains
    // teaches the gate; one that is missing teaches nothing.
    render(<PlanPanel plan={draft} tasks={tasks} onLaunch={() => {}} />);
    const launch = screen.getByTestId("plan-launch-t1") as HTMLButtonElement;
    expect(launch.disabled).toBe(true);
    expect(launch.title).toContain("approved");
  });

  test("an approved plan hides approval and enables an unblocked task", () => {
    render(<PlanPanel plan={approved} tasks={tasks} onLaunch={() => {}} />);
    expect(screen.getByTestId("plan-state").textContent).toBe("Approved");
    expect(screen.queryByTestId("plan-approve")).toBeNull();
    expect((screen.getByTestId("plan-launch-t1") as HTMLButtonElement).disabled).toBe(false);
  });

  test("a task waiting on an incomplete dependency stays disabled and names it", () => {
    render(<PlanPanel plan={approved} tasks={tasks} onLaunch={() => {}} />);
    const blocked = screen.getByTestId("plan-launch-t2") as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toContain("t1");
  });

  test("the dependency clears once the blocking task completes", () => {
    const done: TaskView[] = [{ ...tasks[0], status: "complete" }, tasks[1]];
    render(<PlanPanel plan={approved} tasks={done} onLaunch={() => {}} />);
    expect((screen.getByTestId("plan-launch-t2") as HTMLButtonElement).disabled).toBe(false);
    // And the completed task cannot be relaunched.
    expect((screen.getByTestId("plan-launch-t1") as HTMLButtonElement).disabled).toBe(true);
  });

  test("launching passes the task id", () => {
    const launched: string[] = [];
    render(<PlanPanel plan={approved} tasks={tasks} onLaunch={(id) => launched.push(id)} />);
    fireEvent.click(screen.getByTestId("plan-launch-t1"));
    expect(launched).toEqual(["t1"]);
  });

  test("owners are shown by name, falling back to the id", () => {
    render(<PlanPanel plan={approved} tasks={tasks} agentName={agentName} />);
    expect(screen.getByTestId("plan-task-owner-t1").textContent).toBe("Backend Engineer");

    cleanup();
    render(<PlanPanel plan={approved} tasks={[{ ...tasks[0], assignedAgentId: "ghost" }]} agentName={agentName} />);
    expect(screen.getByTestId("plan-task-owner-t1").textContent).toBe("ghost");
  });

  test("no plan explains what a plan is rather than showing a blank panel", () => {
    render(<PlanPanel plan={null} tasks={[]} />);
    expect(screen.getByTestId("plan-empty").textContent).toContain("Planner reads the design document");
  });

  test("an approved plan with no tasks says so", () => {
    render(<PlanPanel plan={approved} tasks={[]} />);
    expect(screen.getByTestId("plan-no-tasks")).toBeTruthy();
  });
});

describe("generating a plan from the Control Room (§10 step 4)", () => {
  test("with no plan, the panel offers to generate one instead of naming a CLI command", () => {
    render(<PlanPanel plan={null} tasks={[]} onGenerate={() => {}} />);
    const empty = screen.getByTestId("plan-empty").textContent ?? "";
    expect(screen.getByTestId("plan-generate")).toBeTruthy();
    // The old copy told the user to leave the browser.
    expect(empty).not.toContain("bun run");
    // And it explains the gate before anything runs.
    expect(empty.toLowerCase()).toContain("nothing runs until you approve");
  });

  test("generating calls back once and reports that it is running", () => {
    let calls = 0;
    const { rerender } = render(<PlanPanel plan={null} tasks={[]} onGenerate={() => { calls += 1; }} />);
    fireEvent.click(screen.getByTestId("plan-generate"));
    expect(calls).toBe(1);

    rerender(<PlanPanel plan={null} tasks={[]} onGenerate={() => { calls += 1; }} generating />);
    // A real agent turn takes a minute; silence would read as a broken button.
    expect(screen.getByTestId("plan-generating").textContent).toContain("takes a minute");
    fireEvent.click(screen.getByTestId("plan-generate"));
    expect(calls).toBe(1);
  });

  test("a caller that cannot generate shows no control", () => {
    render(<PlanPanel plan={null} tasks={[]} />);
    expect(screen.queryByTestId("plan-generate")).toBeNull();
  });
});
