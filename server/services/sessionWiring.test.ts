import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpSessionManager } from "./acpSessionManager";
import { ProjectStore } from "./projectStore";
import { getAgentRegistry } from "./agentRegistry";
import { getPromptLibrary } from "./promptLibrary";

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
