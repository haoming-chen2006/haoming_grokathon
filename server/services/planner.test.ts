import { describe, expect, test } from "bun:test";
import { PlanParseError, extractJson, normalisePlan, uncoveredRequirements } from "./planner";

const VALID = JSON.stringify({
  milestones: [{ id: "m1", name: "Auth API", role: "Backend Engineer", dependsOn: [] }],
  tasks: [
    { id: "t1", objective: "Implement endpoints", role: "Backend Engineer", requirementId: "AUTH-01", dependsOn: [], expectedFiles: ["src/auth.ts"], requiredTests: ["t/auth.test.ts"] },
    { id: "t2", objective: "Build login UI", role: "Frontend Engineer", requirementId: "AUTH-02", dependsOn: ["t1"], expectedFiles: [], requiredTests: [] },
  ],
});

describe("V-017: planner output is parsed structurally", () => {
  test("parses a bare JSON reply", () => {
    const plan = normalisePlan(extractJson(VALID), VALID);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.milestones).toHaveLength(1);
    expect(plan.tasks[1].dependsOn).toEqual(["t1"]);
  });

  test("parses JSON wrapped in a code fence", () => {
    const raw = "Here is the plan:\n```json\n" + VALID + "\n```\nLet me know.";
    expect(normalisePlan(extractJson(raw), raw).tasks).toHaveLength(2);
  });

  test("parses JSON surrounded by prose", () => {
    const raw = "Sure! " + VALID + " Hope that helps.";
    expect(normalisePlan(extractJson(raw), raw).tasks).toHaveLength(2);
  });

  test("a reply with no JSON is an error, not an empty plan", () => {
    // Silently returning an empty plan would look like "the Planner found nothing to do".
    expect(() => extractJson("I could not access the repository.")).toThrow(PlanParseError);
  });

  test("malformed JSON reports why", () => {
    let caught: unknown;
    try {
      extractJson("{ tasks: [ }");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlanParseError);
    expect((caught as PlanParseError).raw).toContain("tasks");
  });

  test("a plan with no tasks is rejected", () => {
    const raw = JSON.stringify({ milestones: [], tasks: [] });
    expect(() => normalisePlan(JSON.parse(raw), raw)).toThrow(/no tasks/);
  });

  test("a task with no objective is rejected", () => {
    const raw = JSON.stringify({ tasks: [{ id: "t1", objective: "   " }] });
    expect(() => normalisePlan(JSON.parse(raw), raw)).toThrow(/no objective/);
  });

  test("dependencies on unknown tasks are dropped, not persisted", () => {
    // Keeping one would create a permanently blocked graph discovered later as a stuck agent.
    const raw = JSON.stringify({ tasks: [{ id: "t1", objective: "a", dependsOn: ["ghost", "t1"] }] });
    const plan = normalisePlan(JSON.parse(raw), raw);
    expect(plan.tasks[0].dependsOn).toEqual([]);
  });

  test("missing optional fields are defaulted, not fatal", () => {
    const raw = JSON.stringify({ tasks: [{ objective: "do the thing" }] });
    const plan = normalisePlan(JSON.parse(raw), raw);
    expect(plan.tasks[0].id).toBe("t1");
    expect(plan.tasks[0].role).toBe("Backend Engineer");
    expect(plan.tasks[0].dependsOn).toEqual([]);
  });

  test("raw output is retained so a bad parse can be diagnosed", () => {
    const plan = normalisePlan(extractJson(VALID), VALID);
    expect(plan.raw).toContain("Implement endpoints");
  });

  test("uncovered requirements are reported", () => {
    const plan = normalisePlan(extractJson(VALID), VALID);
    expect(uncoveredRequirements(plan, ["AUTH-01", "AUTH-02", "AUTH-03"])).toEqual(["AUTH-03"]);
    expect(uncoveredRequirements(plan, ["AUTH-01", "AUTH-02"])).toEqual([]);
  });
});
