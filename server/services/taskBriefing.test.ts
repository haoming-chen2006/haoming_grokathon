import { describe, expect, test } from "bun:test";
import { buildTaskBriefing } from "./taskBriefing";
import type { CodingTask, Requirement } from "../types/project";

const task = {
  id: "t1", objective: "Implement addTodo", requirementId: "TODO-01",
  dependsOn: [], expectedFiles: ["todo.ts"], completionCriteria: [], requiredTests: ["todo.test.ts"],
  status: "pending", costUsd: 0, reviewStatus: "pending", createdAt: "", updatedAt: "",
} as unknown as CodingTask;

const requirement = {
  id: "TODO-01", description: "addTodo returns a Todo with a unique id",
  acceptanceCriteria: [
    { id: "c1", text: "returns done=false", met: false },
    { id: "c2", text: "appends to the list", met: false },
  ],
  status: "defined", reviewStatus: "pending", baseVersion: 1, taskIds: [], affectedFiles: [],
  createdAt: "", updatedAt: "",
} as unknown as Requirement;

describe("what an agent is told when its task is launched (§10)", () => {
  const brief = buildTaskBriefing({ project: { goal: "Ship the todo service" }, task, requirement });

  test("it states the objective and the project it serves", () => {
    expect(brief).toContain("Ship the todo service");
    expect(brief).toContain("t1: Implement addTodo");
  });

  test("it carries the requirement and every acceptance criterion", () => {
    // An agent judged against criteria it was never shown will fail the completion gate for
    // reasons it could not have known.
    expect(brief).toContain("TODO-01");
    expect(brief).toContain("addTodo returns a Todo with a unique id");
    expect(brief).toContain("returns done=false");
    expect(brief).toContain("appends to the list");
  });

  test("it names the expected files and required tests", () => {
    expect(brief).toContain("todo.ts");
    expect(brief).toContain("todo.test.ts");
  });

  test("it names the tools and the submission evidence the server will demand", () => {
    // The server rejects a submission without evidence; discovering that by being rejected wastes
    // a turn.
    expect(brief).toContain("submit_code_for_review");
    expect(brief).toContain("record_test_result");
    expect(brief).toContain("report_blocker");
    expect(brief).toMatch(/rejected unless it carries the evidence/i);
  });

  test("it says the worktree is isolated, so the agent does not hedge about the base branch", () => {
    expect(brief).toMatch(/isolated git worktree/i);
  });

  test("a task with no requirement still produces a usable briefing", () => {
    const bare = buildTaskBriefing({
      project: { goal: "g" },
      task: { ...task, requirementId: undefined, expectedFiles: [], requiredTests: [] } as CodingTask,
    });
    expect(bare).toContain("Implement addTodo");
    expect(bare).not.toContain("Requirement undefined");
    expect(bare).toContain("submit_code_for_review");
  });
});
