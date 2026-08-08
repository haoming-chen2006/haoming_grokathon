import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runPlanner } from "./planner";

/**
 * What the planning session is actually handed.
 *
 * The persona and skills composer has its own tests, and they stayed green when the route stopped
 * passing `rules` — the same mistake iteration 53 recorded and this repeated: a test of the
 * argument builder proves nothing about the call site. These read the arguments `session/new`
 * receives, without a live model.
 */

let dataDir: string;

/** A connection that records what it is asked to open, and returns a valid plan. */
function recorder() {
  const calls: Array<{ cwd: unknown; mcpServers: unknown[]; opts: any }> = [];
  const factory = () =>
    ({
      start() {}, stop() {},
      async initialize() {},
      get sessionId() { return "sess-1"; },
      get isRunning() { return true; },
      async newSession(cwd: unknown, mcpServers: unknown[] = [], opts: any = {}) {
        calls.push({ cwd, mcpServers, opts });
        return "sess-1";
      },
      async prompt() {
        return {
          text: JSON.stringify({ milestones: [{ id: "m1", name: "M" }], tasks: [{ id: "t1", objective: "O" }] }),
          thoughts: [], toolCalls: [], stopReason: "end_turn",
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20, cachedReadTokens: 0, reasoningTokens: 0, modelId: "gpt-4o" },
        };
      },
    }) as any;
  return { calls, factory };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-planner-"));
  process.env.OPENUI_DATA_DIR = dataDir;
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("the planning session receives what it was configured with", () => {
  test("rules reach session/new when supplied", async () => {
    const { calls, factory } = recorder();
    await runPlanner({
      projectId: "p1", cwd: "/tmp/repo", port: 6968,
      rules: "# Persona\n\nBreak work into reviewable pieces.",
      createConnection: factory,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].opts.rules).toContain("Break work into reviewable pieces.");
  });

  test("no rules are sent when the agent has none, rather than an empty string", () => {
    const { calls, factory } = recorder();
    return runPlanner({ projectId: "p1", cwd: "/tmp/repo", port: 6968, createConnection: factory })
      .then(() => {
        expect(calls[0].opts.rules).toBeUndefined();
      });
  });

  test("the project MCP server is handed over at the planner's own URL", async () => {
    const { calls, factory } = recorder();
    await runPlanner({ projectId: "p1", cwd: "/tmp/repo", port: 7777, agentId: "agent_x", createConnection: factory });

    expect(calls[0].mcpServers).toHaveLength(1);
    expect((calls[0].mcpServers[0] as any).name).toBe("openui-project");
    expect((calls[0].mcpServers[0] as any).url).toContain(":7777/");
    expect((calls[0].mcpServers[0] as any).url).toContain("agent_x");
  });

  test("the turn's usage is returned so it can be charged", async () => {
    const { factory } = recorder();
    const plan = await runPlanner({ projectId: "p1", cwd: "/tmp/repo", port: 6968, createConnection: factory });
    // Discarding this is what let the Planner run for free (iteration 70).
    expect(plan.usage?.totalTokens).toBe(20);
    expect(plan.tasks).toHaveLength(1);
  });

  test("the session opens in the repository it was told to plan for", async () => {
    const { calls, factory } = recorder();
    await runPlanner({ projectId: "p1", cwd: "/some/repo", port: 6968, createConnection: factory });
    expect(calls[0].cwd).toBe("/some/repo");
  });
});
