import { describe, expect, test } from "bun:test";
import { AgentRegistry } from "./agentRegistry";
import { DEFAULT_TEAM, seedDefaultTeam, resolveAgentForRole } from "./agentTeam";

const PROJECT = "proj_team";

function fresh(): AgentRegistry {
  return new AgentRegistry();
}

describe("the default team (§14)", () => {
  test("it is the five roles the loop needs", () => {
    expect(DEFAULT_TEAM.map((m) => m.role)).toEqual([
      "Planner",
      "Backend Engineer",
      "Frontend Engineer",
      "Test Engineer",
      "Reviewer",
    ]);
  });

  test("every role appears exactly once", () => {
    // Plan generation resolves a task's role through a Map keyed by role, and a launch resolves an
    // agent id from it. Two agents sharing a role would make that resolution arbitrary.
    expect(new Set(DEFAULT_TEAM.map((m) => m.role)).size).toBe(DEFAULT_TEAM.length);
  });

  test("every member carries a persona, which is what reaches its session", () => {
    for (const member of DEFAULT_TEAM) {
      expect(member.persona.length).toBeGreaterThan(0);
      expect(member.name.length).toBeGreaterThan(0);
    }
  });

  test("it includes a Planner, the role plan generation looks for by name", () => {
    expect(DEFAULT_TEAM.some((m) => m.role === "Planner")).toBe(true);
  });
});

describe("seeding a project with the team", () => {
  test("a project with no agents gets all five, with their personas", () => {
    const registry = fresh();
    const agents = seedDefaultTeam(PROJECT, { registry });

    expect(agents).toHaveLength(5);
    expect(agents.map((a) => a.role)).toEqual(DEFAULT_TEAM.map((m) => m.role));
    expect(agents.map((a) => a.persona)).toEqual(DEFAULT_TEAM.map((m) => m.persona));
    expect(registry.list(PROJECT)).toHaveLength(5);
  });

  test("the agents belong to the project and start idle", () => {
    // A seeded agent has no session yet; anything else would show a team that looks busy on a
    // project where nothing has been launched (V-022).
    const registry = fresh();
    for (const agent of seedDefaultTeam(PROJECT, { registry })) {
      expect(agent.projectId).toBe(PROJECT);
      expect(agent.status).toBe("idle");
      expect(agent.currentTaskId).toBeUndefined();
      expect(agent.worktree).toBeUndefined();
    }
  });

  test("the project budget is split evenly and does not exceed it", () => {
    const registry = fresh();
    const agents = seedDefaultTeam(PROJECT, { registry, budgetUsd: 10 });

    expect(agents.map((a) => a.budgetUsd)).toEqual([2, 2, 2, 2, 2]);
    expect(agents.reduce((sum, a) => sum + (a.budgetUsd ?? 0), 0)).toBeLessThanOrEqual(10);
  });

  test("an awkward budget is rounded to cents rather than left at full precision", () => {
    const registry = fresh();
    const agents = seedDefaultTeam(PROJECT, { registry, budgetUsd: 7 });
    expect(agents.map((a) => a.budgetUsd)).toEqual([1.4, 1.4, 1.4, 1.4, 1.4]);
  });

  test("a project with no budget gives its agents no cap", () => {
    // An undefined cap is what evaluateBudget reads as "unlimited"; a zero would read as one too,
    // but it would also render as "$0.00 budget" on every card.
    const registry = fresh();
    for (const agent of seedDefaultTeam(PROJECT, { registry })) {
      expect(agent.budgetUsd).toBeUndefined();
    }
    for (const agent of seedDefaultTeam("proj_zero", { registry, budgetUsd: 0 })) {
      expect(agent.budgetUsd).toBeUndefined();
    }
  });

  test("seeding twice leaves five agents, not ten", () => {
    const registry = fresh();
    const first = seedDefaultTeam(PROJECT, { registry, budgetUsd: 10 });
    const again = seedDefaultTeam(PROJECT, { registry, budgetUsd: 10 });

    expect(registry.list(PROJECT)).toHaveLength(5);
    expect(again.map((a) => a.id)).toEqual(first.map((a) => a.id));
  });

  test("a project that already has an agent of its own is left alone", () => {
    const registry = fresh();
    const mine = registry.create({ projectId: PROJECT, name: "Solo", role: "Backend Engineer" });

    expect(seedDefaultTeam(PROJECT, { registry }).map((a) => a.id)).toEqual([mine.id]);
    expect(registry.list(PROJECT)).toHaveLength(1);
  });

  test("seeding one project does not touch another", () => {
    const registry = fresh();
    seedDefaultTeam("proj_a", { registry });
    seedDefaultTeam("proj_b", { registry });

    expect(registry.list("proj_a")).toHaveLength(5);
    expect(registry.list("proj_b")).toHaveLength(5);
    expect(registry.list()).toHaveLength(10);
  });
});

describe("resolving a Planner's role to an agent", () => {
  // The observed failure: a project with all five roles produced four tasks, every one unassigned,
  // because that run of the Planner wrote role wordings the exact lookup did not have.
  const team = () => {
    const registry = fresh();
    return seedDefaultTeam(PROJECT, { registry });
  };
  const roleOf = (agents: ReturnType<typeof team>, id?: string) =>
    agents.find((a) => a.id === id)?.role;

  test("the five roles it is asked for resolve exactly", () => {
    const agents = team();
    for (const member of DEFAULT_TEAM) {
      const got = resolveAgentForRole(member.role, agents);
      expect(got.match).toBe("exact");
      expect(roleOf(agents, got.agentId)).toBe(member.role);
    }
  });

  test.each([
    ["backend engineer", "Backend Engineer"],
    ["BACKEND ENGINEER", "Backend Engineer"],
    ["Back-End Engineer", "Backend Engineer"],
    ["  Backend   Engineer  ", "Backend Engineer"],
    ["Backend Developer", "Backend Engineer"],
    ["Server Engineer", "Backend Engineer"],
    ["API Engineer", "Backend Engineer"],
    ["Frontend Developer", "Frontend Engineer"],
    ["UI Engineer", "Frontend Engineer"],
    ["front-end", "Frontend Engineer"],
    ["QA Engineer", "Test Engineer"],
    ["Tester", "Test Engineer"],
    ["Quality Engineer", "Test Engineer"],
    ["Code Reviewer", "Reviewer"],
    ["Architect", "Planner"],
    ["Tech Lead", "Planner"],
  ])("%o resolves to the %o on the team", (written, expected) => {
    const agents = team();
    const got = resolveAgentForRole(written, agents);
    expect(roleOf(agents, got.agentId)).toBe(expected);
    expect(got.match).not.toBe("fallback");
  });

  test("a role nobody holds still gets an owner, reported as a fallback", () => {
    // An unowned task cannot be launched at all, so a guess the user can reassign beats a plan that
    // dead-ends at NO_AGENT. `match` is what tells the caller to say so.
    const agents = team();
    const got = resolveAgentForRole("Database Administrator", agents);

    expect(got.match).toBe("fallback");
    expect(got.agentId).toBeDefined();
    expect(roleOf(agents, got.agentId)).toBe("Backend Engineer");
  });

  test("the fallback prefers an implementer over the Planner or the Reviewer", () => {
    const registry = fresh();
    const reviewer = registry.create({ projectId: "p", name: "R", role: "Reviewer" });
    const planner = registry.create({ projectId: "p", name: "P", role: "Planner" });
    const writer = registry.create({ projectId: "p", name: "W", role: "Frontend Engineer" });

    const got = resolveAgentForRole("Data Scientist", registry.list("p"));
    expect(got.agentId).toBe(writer.id);
    expect(got.agentId).not.toBe(reviewer.id);
    expect(got.agentId).not.toBe(planner.id);
  });

  test("with only a Planner and a Reviewer it still assigns somebody", () => {
    const registry = fresh();
    registry.create({ projectId: "p", name: "P", role: "Planner" });
    registry.create({ projectId: "p", name: "R", role: "Reviewer" });

    expect(resolveAgentForRole("Database Administrator", registry.list("p")).agentId).toBeDefined();
  });

  test("a project with no team resolves to nobody rather than inventing one", () => {
    const got = resolveAgentForRole("Backend Engineer", []);
    expect(got.agentId).toBeUndefined();
    expect(got.match).toBe("fallback");
  });

  test("an agent is matched by its name when its role is unrecognisable", () => {
    const registry = fresh();
    const odd = registry.create({ projectId: "p", name: "Backend Engineer", role: "worker-3" });
    expect(resolveAgentForRole("Backend Engineer", registry.list("p")).agentId).toBe(odd.id);
  });

  test("\"Test Engineer\" is a tester, not matched on the word \"engineer\"", () => {
    // The families are ordered so the specific word wins; a naive scan would send every test task
    // to the Backend Engineer, which is the failure this whole resolver exists to prevent.
    const agents = team();
    expect(roleOf(agents, resolveAgentForRole("Test engineer", agents).agentId)).toBe("Test Engineer");
    expect(roleOf(agents, resolveAgentForRole("QA engineer", agents).agentId)).toBe("Test Engineer");
  });
});
