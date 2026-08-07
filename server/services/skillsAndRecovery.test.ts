import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpConnection } from "./acpClient";
import { grokBinaryPath } from "./grokDetect";
import { AgentRegistry } from "./agentRegistry";
import { PromptLibrary, composeAgentInstructions } from "./promptLibrary";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-skills-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/**
 * The secret is assembled at runtime so the literal never appears in any file the agent could
 * read, and agents run in an EMPTY temp directory rather than the repository. An earlier version
 * used the repo as cwd and the control test caught the agent reading the codename straight out of
 * this test file — which would have made the primary test pass for the wrong reason.
 */
const CODENAME = ["HALYARD", "7781"].join("_");

describe("V-042: assigned skill instructions reach the Grok session", () => {
  test("multiple skills compose into the rules delivered at session/new", () => {
    const library = new PromptLibrary(dir);
    const a = library.createSkill({
      name: "Test-Driven Bug Fix",
      instructions: "Always add a failing regression test before fixing.",
    });
    const b = library.createSkill({
      name: "House Style",
      instructions: `The project codename is ${CODENAME}.`,
    });

    const rules = composeAgentInstructions({
      persona: "Careful Backend Engineer.",
      skills: library.resolveSkills([a.id, b.id]),
    });

    expect(rules).toContain("Careful Backend Engineer");
    expect(rules).toContain("failing regression test");
    expect(rules).toContain(CODENAME);
  });

  test("the instructions demonstrably reach a live session", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const library = new PromptLibrary(dir);
    // A fact the model cannot know from anywhere else — if it answers, the rules arrived.
    const skill = library.createSkill({
      name: "Project Facts",
      instructions: `The internal project codename is ${CODENAME}. Answer questions about it directly.`,
    });
    const rules = composeAgentInstructions({
      persona: "You follow project conventions exactly.",
      skills: library.resolveSkills([skill.id]),
    });

    const isolated = mkdtempSync(join(tmpdir(), "openui-isolated-"));
    const conn = new AcpConnection({ agentId: "skilled", cwd: isolated, requestTimeoutMs: 120_000 });
    try {
      conn.start();
      await conn.initialize();
      await conn.newSession(isolated, [], { rules });

      const reply = await conn.prompt("What is the internal project codename? Reply with only the codename.", {
        timeoutMs: 200_000,
      });
      expect(reply.text).toContain(CODENAME);
    } finally {
      conn.stop();
      rmSync(isolated, { recursive: true, force: true });
    }
  }, 420_000);

  test("without the skill assigned, the agent does not know the fact", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    // The control: proves the previous test measured skill delivery, not model priors.
    const isolated = mkdtempSync(join(tmpdir(), "openui-isolated-"));
    const conn = new AcpConnection({ agentId: "unskilled", cwd: isolated, requestTimeoutMs: 120_000 });
    try {
      conn.start();
      await conn.initialize();
      await conn.newSession(isolated, []);

      const reply = await conn.prompt("What is the internal project codename? Reply with only the codename.", {
        timeoutMs: 200_000,
      });
      expect(reply.text).not.toContain(CODENAME);
    } finally {
      conn.stop();
      rmSync(isolated, { recursive: true, force: true });
    }
  }, 420_000);
});

describe("V-050: failed agent sessions can recover", () => {
  test("a failed session is marked, restartable, and restores its context", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const registry = new AgentRegistry({ persistDir: dir });
    const agent = registry.create({ projectId: "p1", name: "Backend", role: "Backend Engineer" });
    registry.assignTask(agent.id, "task-api", { branch: "agent/backend" });

    // --- a live session that establishes context, then dies unexpectedly ------------------
    const first = new AcpConnection({ agentId: agent.id, cwd: process.cwd(), requestTimeoutMs: 120_000 });
    first.start();
    await first.initialize();
    const sessionId = await first.newSession();
    registry.setAcpSession(agent.id, sessionId);
    registry.setStatus(agent.id, "working", "Implementing endpoints");
    await first.prompt("Remember this ticket number for later: TICKET_5150. Reply with only: noted", {
      timeoutMs: 200_000,
    });

    // Simulate a crash rather than a clean stop.
    first.stop();
    await new Promise((r) => setTimeout(r, 1000));

    // --- the failure is visibly marked ----------------------------------------------------
    registry.markDisconnected(agent.id, "Agent process exited");
    const marked = registry.get(agent.id);
    expect(marked.status).toBe("idle");
    expect(marked.statusDetail).toContain("Agent process exited");
    expect(marked.statusDetail).toContain("reconnectable");

    // --- it is offered for restart, not restarted on its own ------------------------------
    expect(registry.reconnectableAgents("p1").map((a) => a.id)).toContain(agent.id);

    // --- restarting restores the task context ---------------------------------------------
    const second = new AcpConnection({ agentId: agent.id, cwd: process.cwd(), requestTimeoutMs: 120_000 });
    try {
      second.start();
      await second.initialize();
      await second.loadSession(registry.get(agent.id).acpSessionId!);

      const recall = await second.prompt(
        "What ticket number did I ask you to remember? Reply with only the ticket number.",
        { timeoutMs: 200_000 },
      );
      // Duplicate implementation is avoided precisely because the prior context came back —
      // the agent resumes knowing what it already did.
      expect(recall.text).toContain("TICKET_5150");
      expect(second.sessionId).toBe(sessionId);
      expect(registry.get(agent.id).currentTaskId).toBe("task-api");
    } finally {
      second.stop();
    }
  }, 600_000);

  test("an agent can be replaced instead of restarted, without losing the record", () => {
    const registry = new AgentRegistry({ persistDir: dir });
    const failed = registry.create({ projectId: "p1", name: "Backend", role: "Backend Engineer" });
    registry.setAcpSession(failed.id, "sess-old");
    registry.assignTask(failed.id, "task-api", { branch: "agent/backend" });
    registry.markDisconnected(failed.id, "Unrecoverable crash");

    // Replacement: a fresh agent takes the same task and branch.
    const replacement = registry.create({ projectId: "p1", name: "Backend (replacement)", role: "Backend Engineer" });
    registry.assignTask(replacement.id, "task-api", { branch: "agent/backend" });

    expect(registry.get(replacement.id).currentTaskId).toBe("task-api");
    // The failed agent is retained for provenance rather than deleted.
    expect(registry.get(failed.id).statusDetail).toContain("Unrecoverable crash");
    expect(registry.list("p1")).toHaveLength(2);
  });
});
