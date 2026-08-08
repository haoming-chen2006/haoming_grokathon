import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpSessionManager } from "./acpSessionManager";
import { ProjectStore, getProjectStore } from "./projectStore";
import { getAgentRegistry } from "./agentRegistry";
import { getPromptLibrary, rulesForAgent } from "./promptLibrary";
import { AcpConnection } from "./acpClient";

/**
 * What a launched agent is actually handed at session/new.
 *
 * The Project MCP server and the agent's persona and skills were configurable, stored, and
 * verified in isolation — and neither reached a launched session. Only the planner passed
 * `mcpServers`; nothing passed `rules` at all. So V-028…V-031 held for the MCP endpoint but not
 * for any agent that ran, and V-042's "assigned skill instructions reach the Grok session" was
 * true of the composer and false of every session.
 *
 * These tests read the arguments the manager builds, so they fail if that wiring is removed
 * without needing a live model.
 */

let dataDir: string;
let projectId: string;
let manager: AcpSessionManager;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-wiring-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  projectId = new ProjectStore(join(dataDir, "projects")).createProject({
    name: "Auth", goal: "g", repositoryPath: "/tmp/r",
  }).id;
  manager = new AcpSessionManager(() => "/tmp/r");
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
  delete process.env.PORT;
});

/** The private builders are what session/new receives; read them directly. */
const mcpFor = (id: string) => (manager as any).mcpServersFor(id, projectId) as any[];
const rulesFor = (id: string) => (manager as any).rulesFor(id) as string | undefined;

describe("the Project MCP server reaches a launched agent", () => {
  test("an agent is handed the project MCP server at its own URL", () => {
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    const servers = mcpFor(agent.id);

    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe("http");
    expect(servers[0].name).toBe("openui-project");
    // Identity comes from the URL, so it must carry this agent and this project.
    expect(servers[0].url).toContain(encodeURIComponent(projectId));
    expect(servers[0].url).toContain(encodeURIComponent(agent.id));
  });

  test("the URL follows the configured port", () => {
    process.env.PORT = "7100";
    const agent = getAgentRegistry().create({ projectId, name: "B", role: "Backend Engineer" });
    expect(mcpFor(agent.id)[0].url).toContain(":7100/");
  });

  test("two agents get distinct URLs", () => {
    const a = getAgentRegistry().create({ projectId, name: "A", role: "Backend Engineer" });
    const b = getAgentRegistry().create({ projectId, name: "B", role: "Reviewer" });
    expect(mcpFor(a.id)[0].url).not.toBe(mcpFor(b.id)[0].url);
  });
});

describe("persona and skills reach a launched agent (V-042)", () => {
  test("an agent with neither persona nor skills contributes no rules", () => {
    const agent = getAgentRegistry().create({ projectId, name: "Plain", role: "Backend Engineer" });
    expect(rulesFor(agent.id)).toBeUndefined();
  });

  test("a persona is composed into the rules", () => {
    const agent = getAgentRegistry().create({
      projectId, name: "Careful", role: "Backend Engineer",
      persona: "Prefer small, reviewable changes.",
    });
    const rules = rulesFor(agent.id)!;
    expect(rules).toContain("# Persona");
    expect(rules).toContain("Prefer small, reviewable changes.");
  });

  test("assigned skills are composed in, after the persona", () => {
    const skill = getPromptLibrary().createSkill({
      name: "Test-Driven Bug Fix", instructions: "Add a failing regression test first.",
    });
    const agent = getAgentRegistry().create({
      projectId, name: "TDD", role: "Backend Engineer",
      persona: "Be careful.", skills: [skill.id],
    });

    const rules = rulesFor(agent.id)!;
    expect(rules).toContain("# Skill: Test-Driven Bug Fix");
    expect(rules).toContain("Add a failing regression test first.");
    // Persona frames the role, skills add procedure — order is part of the contract.
    expect(rules.indexOf("# Persona")).toBeLessThan(rules.indexOf("# Skill:"));
  });

  test("an unknown skill id does not stop the agent from starting", () => {
    // Refusing to launch because a skill was deleted would strand the agent entirely.
    const skill = getPromptLibrary().createSkill({ name: "Real", instructions: "Do the thing." });
    const agent = getAgentRegistry().create({
      projectId, name: "Mixed", role: "Backend Engineer",
      persona: "P", skills: [skill.id, "skill_deleted"],
    });

    const rules = rulesFor(agent.id)!;
    expect(rules).toContain("# Skill: Real");
    expect(rules).toContain("# Persona");
  });

  test("an unknown agent yields no rules rather than throwing", () => {
    expect(rulesFor("agent_nope")).toBeUndefined();
  });
});

describe("session/new actually receives them", () => {
  /** Records what the manager hands to session/new, without needing a real agent process. */
  function recordingManager() {
    const calls: Array<{ cwd: unknown; mcpServers: unknown[]; opts: any }> = [];
    const mgr = new AcpSessionManager(
      () => "/tmp/wt",
      () =>
        ({
          start() {},
          stop() {},
          async initialize() {},
          get supportsLoadSession() { return false; },
          get sessionId() { return "sess-1"; },
          async newSession(cwd: unknown, mcpServers: unknown[] = [], opts: any = {}) {
            calls.push({ cwd, mcpServers, opts });
            return "sess-1";
          },
        }) as any,
    );
    return { mgr, calls };
  }

  test("a launched agent is handed the MCP server and its composed rules", async () => {
    const skill = getPromptLibrary().createSkill({ name: "Careful Review", instructions: "Read twice." });
    const agent = getAgentRegistry().create({
      projectId, name: "Backend", role: "Backend Engineer",
      persona: "Prefer small changes.", skills: [skill.id],
    });

    const { mgr, calls } = recordingManager();
    await mgr.open(agent.id);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.cwd).toBe("/tmp/wt");

    // The project tools, at this agent's own URL.
    expect(call.mcpServers).toHaveLength(1);
    expect((call.mcpServers[0] as any).name).toBe("openui-project");
    expect((call.mcpServers[0] as any).url).toContain(encodeURIComponent(agent.id));

    // The persona and skill text, appended to the system prompt.
    expect(call.opts.rules).toContain("Prefer small changes.");
    expect(call.opts.rules).toContain("Read twice.");
  });

  test("a session opened for an agent mid-task states the task in it", async () => {
    // The remedy the product offers for an agent that stopped short is "open the session and ask it
    // to continue". Sessions do not survive a restart (§17), and a reopened one was given the
    // persona and the tools and nothing about the work — so, asked to submit its finished task, a
    // real agent replied by asking which requirements it covered, which branch it was on and which
    // files it had changed. All of it already known to the product, and already told to a session
    // that no longer existed.
    const store = getProjectStore();
    store.addRequirement(projectId, { id: "S-1", description: "totalWithTax adds 8% tax" }, { kind: "user", id: "user" });
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "s1", objective: "Implement totalWithTax", requirementId: "S-1" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "s1", { status: "working" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "s1");

    const { mgr, calls } = recordingManager();
    await mgr.open(agent.id);

    const rules = calls[0].opts.rules ?? "";
    expect(rules, "the session was opened knowing nothing about the task").toContain("s1");
    expect(rules).toContain("Implement totalWithTax");
    // The two things it had to ask a human for.
    expect(rules).toContain("S-1");
    expect(rules).toContain("submit_code_for_review");
  });

  test("a finished task is not restated in a later session", async () => {
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "s2", objective: "Done already" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "s2", { status: "working" }, { kind: "user", id: "user" });
    store.updateTask(projectId, "s2", { status: "complete" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "Idle", role: "Reviewer" });
    getAgentRegistry().assignTask(agent.id, "s2");

    const { mgr, calls } = recordingManager();
    await mgr.open(agent.id);
    expect(calls[0].opts.rules ?? "").not.toContain("Done already");
  });

  test("an agent with no persona or skills still gets the MCP server", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "Plain", role: "Reviewer" });
    const { mgr, calls } = recordingManager();
    await mgr.open(agent.id);

    expect((calls[0].mcpServers[0] as any).name).toBe("openui-project");
    expect(calls[0].opts.rules).toBeUndefined();
  });
});

describe("a resumed session keeps its tools", () => {
  function recordingManager(supportsLoad = true) {
    const loads: Array<{ sessionId: string; mcpServers: unknown[] }> = [];
    const news: Array<{ mcpServers: unknown[] }> = [];
    const mgr = new AcpSessionManager(
      () => "/tmp/wt",
      () =>
        ({
          start() {}, stop() {},
          async initialize() {},
          get supportsLoadSession() { return supportsLoad; },
          get sessionId() { return "sess-1"; },
          async loadSession(sessionId: string, mcpServers: unknown[] = []) {
            loads.push({ sessionId, mcpServers });
            return sessionId;
          },
          async newSession(_cwd: unknown, mcpServers: unknown[] = []) {
            news.push({ mcpServers });
            return "sess-new";
          },
        }) as any,
    );
    return { mgr, loads, news };
  }

  test("reopening a session re-supplies the Project MCP server", async () => {
    // session/load takes mcpServers precisely because they must be re-supplied; omitting it left
    // a resumed agent with no tools at all.
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    getAgentRegistry().setAcpSession(agent.id, "sess-old");

    const { mgr, loads } = recordingManager();
    await mgr.open(agent.id, { resume: true });

    expect(loads).toHaveLength(1);
    expect(loads[0].sessionId).toBe("sess-old");
    expect(loads[0].mcpServers).toHaveLength(1);
    expect((loads[0].mcpServers[0] as any).name).toBe("openui-project");
    expect((loads[0].mcpServers[0] as any).url).toContain(encodeURIComponent(agent.id));
  });

  test("without loadSession support it falls back to a new session, still with tools", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "B", role: "Reviewer" });
    getAgentRegistry().setAcpSession(agent.id, "sess-old");

    const { mgr, loads, news } = recordingManager(false);
    await mgr.open(agent.id, { resume: true });

    expect(loads).toHaveLength(0);
    expect(news).toHaveLength(1);
    expect((news[0].mcpServers[0] as any).name).toBe("openui-project");
  });
});

describe("live turns record cost against the task (§16)", () => {
  /**
   * A connection whose prompt reports a fixed token usage, so cost accounting can be observed.
   *
   * `modelId` matters: estimateCost returns an honest zero for an unknown model rather than
   * guessing a price, so a usage object without one produces no cost at all.
   */
  function managerReporting(totalTokens: number) {
    return new AcpSessionManager(
      () => "/tmp/wt",
      () =>
        ({
          start() {}, stop() {},
          async initialize() {},
          get supportsLoadSession() { return false; },
          get sessionId() { return "sess-1"; },
          get isRunning() { return true; },
          async newSession() { return "sess-1"; },
          async prompt() {
            return {
              text: "done", thoughts: [], toolCalls: [], stopReason: "end_turn",
              usage: {
                inputTokens: totalTokens / 2,
                outputTokens: totalTokens / 2,
                totalTokens,
                cachedReadTokens: 0,
                reasoningTokens: 0,
                modelId: "gpt-4o",
              },
            };
          },
        }) as any,
    );
  }

  function projectWithTask(budgetUsd?: number) {
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "t-live", objective: "o", budgetUsd }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    return store;
  }

  test("a live turn accumulates cost onto the agent's task", async () => {
    // recordTaskCost has two call sites: the /usage route, which is tested, and this one, which
    // was wired in iteration 52 and never exercised — the same shape as the loadSession branch.
    const store = projectWithTask();
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "t-live");

    const mgr = managerReporting(100_000);
    await mgr.open(agent.id);
    await mgr.send(agent.id, "do the thing");

    const task = store.getProject(projectId).tasks.find((t) => t.id === "t-live")!;
    expect(task.costUsd).toBeGreaterThan(0);
    // The agent's own total must move too, and by the same amount.
    expect(getAgentRegistry().get(agent.id).costUsd).toBeCloseTo(task.costUsd, 10);
  });

  test("a live turn that passes the task cap pauses the session and surfaces the error", async () => {
    // The catch around this deliberately re-throws: a budget stop must not be swallowed by the
    // message path, or work would continue past the cap in silence.
    const store = projectWithTask(0.000001);
    const agent = getAgentRegistry().create({ projectId, name: "Spender", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "t-live");

    const mgr = managerReporting(500_000);
    await mgr.open(agent.id);

    let thrown: unknown = null;
    try {
      await mgr.send(agent.id, "expensive turn");
    } catch (err) {
      thrown = err;
    }

    expect(thrown, "the budget stop was swallowed instead of surfaced").not.toBeNull();
    expect(String((thrown as Error).message)).toContain("budget");
    // The cost is still recorded — the tokens were spent — and the session is paused.
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-live")!.costUsd).toBeGreaterThan(0);
  });

  test("an agent with no task records no task cost but still records its own", async () => {
    const store = projectWithTask();
    const agent = getAgentRegistry().create({ projectId, name: "Free", role: "Reviewer" });

    const mgr = managerReporting(50_000);
    await mgr.open(agent.id);
    await mgr.send(agent.id, "think about it");

    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-live")!.costUsd).toBe(0);
    expect(getAgentRegistry().get(agent.id).costUsd).toBeGreaterThan(0);
  });
});

describe("one composer serves both session paths (§14)", () => {
  test("persona and skills compose in order, with the persona first", () => {
    const skill = getPromptLibrary().createSkill({ name: "Decompose", instructions: "Small tasks." });
    const rules = rulesForAgent(
      { persona: "Break work into reviewable pieces.", skills: [skill.id] },
      getPromptLibrary(),
    )!;
    expect(rules).toContain("# Persona");
    expect(rules).toContain("# Skill: Decompose");
    expect(rules.indexOf("# Persona")).toBeLessThan(rules.indexOf("# Skill:"));
  });

  test("an agent with neither yields nothing rather than an empty header", () => {
    expect(rulesForAgent({}, getPromptLibrary())).toBeUndefined();
    expect(rulesForAgent(undefined, getPromptLibrary())).toBeUndefined();
  });

  test("a deleted skill is skipped, not fatal", () => {
    // Refusing to open a session because a skill was removed would strand the agent.
    const skill = getPromptLibrary().createSkill({ name: "Real", instructions: "Do it." });
    const rules = rulesForAgent({ persona: "P", skills: [skill.id, "skill_gone"] }, getPromptLibrary())!;
    expect(rules).toContain("# Skill: Real");
  });

  test("the session manager and the planner get identical rules for the same agent", () => {
    // Two composers would drift, and the drift would show as a persona working in one path and
    // not the other — which is exactly the state this replaced.
    const skill = getPromptLibrary().createSkill({ name: "Shared", instructions: "Same text." });
    const agent = getAgentRegistry().create({
      projectId, name: "Planner", role: "Planner", persona: "Plan carefully.", skills: [skill.id],
    });

    const manager = new AcpSessionManager(() => "/tmp/wt");
    const viaManager = (manager as any).rulesFor(agent.id) as string;
    const viaPlanner = rulesForAgent(getAgentRegistry().get(agent.id), getPromptLibrary());

    expect(viaManager).toBe(viaPlanner!);
    expect(viaManager).toContain("Plan carefully.");
  });
});

describe("a missing working directory is named for what it is", () => {
  test("starting an agent in a directory that does not exist explains that", () => {
    // posix_spawn reports this as ENOENT against the *executable*, so the real message read
    // "no such file or directory … /node_modules/.bin/grok" while the binary was fine. That cost
    // an evening of looking for a missing binary.
    const conn = new AcpConnection({ agentId: "x", cwd: "/path/to/nowhere" });
    expect(() => conn.start()).toThrow(/working directory does not exist/);
  });

  test("the message names the directory, not the binary", () => {
    const conn = new AcpConnection({ agentId: "x", cwd: "/path/to/nowhere" });
    try {
      conn.start();
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("/path/to/nowhere");
      expect(message).not.toContain("posix_spawn");
    }
  });
});

describe("an agent that stops short of submitting says so", () => {
  function managerThatJustTalks() {
    return new AcpSessionManager(
      () => "/tmp/wt",
      () =>
        ({
          start() {}, stop() {},
          async initialize() {},
          get supportsLoadSession() { return false; },
          get sessionId() { return "s"; },
          get isRunning() { return true; },
          async newSession() { return "s"; },
          async prompt() {
            return {
              text: "I had a look.", thoughts: [], toolCalls: [], stopReason: "end_turn",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o" },
            };
          },
        }) as any,
    );
  }

  test("an open task with no submission is called out on the agent", async () => {
    // Observed for real: the agent implemented the change, went idle, and never called
    // submit_code_for_review. The task then read "working" forever with nothing to tell the user.
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "u1", objective: "o" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "u1", { status: "working" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "B", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "u1");

    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "do the task");

    const after = getAgentRegistry().get(agent.id);
    expect(after.status).toBe("idle");
    expect(after.statusDetail, "nothing told the user the agent stopped short").toContain("Stopped without submitting");
    expect(after.statusDetail).toContain("u1");
  });

  test("an agent that did submit is left alone", async () => {
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "u2", objective: "o" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "u2", { status: "working" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "C", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "u2");
    // A submission needs real evidence; the store refuses one without it (V-037).
    store.addRequirement(projectId, { id: "U-2", description: "d" }, { kind: "user", id: "user" });
    store.submitCode(projectId, {
      taskId: "u2", agentId: agent.id, requirementIds: ["U-2"], branch: "agent/u2",
      changedFiles: ["a.ts"], summary: "s", testResults: { passed: 1, failed: 0, total: 1 }, costUsd: 0.01,
    });

    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "anything else?");

    expect(getAgentRegistry().get(agent.id).statusDetail ?? "").not.toContain("Stopped without submitting");
  });

  test("a task marked ready for review with nothing submitted is called out", async () => {
    // Observed on a two-agent run: the agent implemented the change, called update_task_progress to
    // mark the task `needs_review`, and stopped without submitting. The guard tested
    // `status !== "working"` and so said nothing — the task advertised a review that did not exist,
    // the queue was empty, the work sat uncommitted in the worktree, and the agent carried no
    // detail. It is the status that most makes a user stop looking, so it is the worst one to miss.
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "u4", objective: "o" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "u4", { status: "working" }, { kind: "user", id: "user" });
    store.updateTask(projectId, "u4", { status: "needs_review" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "E", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "u4");

    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "do the task");

    const detail = getAgentRegistry().get(agent.id).statusDetail ?? "";
    expect(detail, "a review that does not exist was announced with no warning").toContain("never submitted it");
    expect(detail).toContain("u4");
  });

  test("a task that reached review with a real submission is left alone", async () => {
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "u5", objective: "o" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "u5", { status: "working" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "F", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "u5");
    store.addRequirement(projectId, { id: "U-5", description: "d" }, { kind: "user", id: "user" });
    store.submitCode(projectId, {
      taskId: "u5", agentId: agent.id, requirementIds: ["U-5"], branch: "agent/u5",
      changedFiles: ["a.ts"], summary: "s", testResults: { passed: 1, failed: 0, total: 1 }, costUsd: 0.01,
    });

    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "anything else?");

    expect(getAgentRegistry().get(agent.id).statusDetail ?? "").toBe("");
  });

  test("a completed task says nothing", async () => {
    const store = getProjectStore();
    store.createPlan(projectId, { milestones: [] }, { kind: "user", id: "user" });
    store.addTask(projectId, { id: "u6", objective: "o" }, { kind: "user", id: "user" });
    store.approvePlan(projectId, { kind: "user", id: "user" });
    store.updateTask(projectId, "u6", { status: "working" }, { kind: "user", id: "user" });
    store.updateTask(projectId, "u6", { status: "complete" }, { kind: "user", id: "user" });

    const agent = getAgentRegistry().create({ projectId, name: "G", role: "Backend Engineer" });
    getAgentRegistry().assignTask(agent.id, "u6");

    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "hello");
    expect(getAgentRegistry().get(agent.id).statusDetail ?? "").toBe("");
  });

  test("an agent with no task is left alone", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "D", role: "Reviewer" });
    const mgr = managerThatJustTalks();
    await mgr.open(agent.id);
    await mgr.send(agent.id, "hello");
    expect(getAgentRegistry().get(agent.id).statusDetail ?? "").not.toContain("Stopped without submitting");
  });
});
