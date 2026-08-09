import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpSessionManager } from "./acpSessionManager";
import { ProjectStore } from "./projectStore";
import { getAgentRegistry } from "./agentRegistry";

/**
 * A streamed reply is ONE message.
 *
 * ACP delivers a reply as a run of `agent_message_chunk`s, and a chunk is frequently a single word.
 * The transcript stored one entry per chunk, so the session panel drew a column of one-word rows
 * each prefixed AGENT — "Hello", "!", "How", "can", "I" — which is what a user saw when they said
 * hello to their first agent. The 500-entry bound was the same bug wearing a different hat: nine
 * entries for one short sentence meant a long reply could evict the whole conversation.
 *
 * These tests fix the joining at the source, where every consumer benefits, rather than in the one
 * renderer that happened to be looked at.
 */

let dataDir: string;
let projectId: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-transcript-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  projectId = new ProjectStore(join(dataDir, "projects")).createProject({
    name: "Legal", goal: "g", repositoryPath: "/tmp/r",
  }).id;
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

/** A manager whose one connection never runs a process, and whose events we drive by hand. */
function harness() {
  let emit: (event: any) => void = () => {};
  const manager = new AcpSessionManager(
    () => "/tmp/wt",
    (opts: any) => {
      emit = opts.onEvent;
      return {
        start() {},
        stop() {},
        async initialize() {},
        get isRunning() { return true; },
        get supportsLoadSession() { return false; },
        get sessionId() { return "sess-1"; },
        async newSession() { return "sess-1"; },
        async prompt() { return { usage: { totalTokens: 0 } }; },
      } as any;
    },
  );
  const agent = getAgentRegistry().create({ projectId, name: "Legal", role: "Researcher" });
  return { manager, agentId: agent.id, say: (event: any) => emit(event) };
}

const chunk = (text: string) => ({
  type: "update",
  update: { sessionUpdate: "agent_message_chunk", content: { text } },
});

describe("a run of chunks is one transcript entry", () => {
  test("nine chunks of one sentence become one message", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    for (const word of ["Hello", "!", " How", " can", " I", " assist", " you", " today", "?"]) {
      say(chunk(word));
    }

    const spoken = manager.transcript(agentId).filter((line) => line.kind === "agent");
    expect(spoken).toHaveLength(1);
    // Concatenated, never joined with a separator we invented: the spacing is in the chunks.
    expect(spoken[0].text).toBe("Hello! How can I assist you today?");
  });

  test("the grown entry keeps its seq, so a consumer replaces rather than appends", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say(chunk("Reading "));
    const first = manager.transcript(agentId).at(-1)!.seq;
    say(chunk("the brief."));

    expect(manager.transcript(agentId).at(-1)!.seq).toBe(first);
  });

  test("a tool call between two runs splits them into separate messages", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say(chunk("Let me look."));
    say({ type: "update", update: { sessionUpdate: "tool_call", title: "read_file", status: "completed" } });
    say(chunk("Found it."));

    const kinds = manager.transcript(agentId).map((line) => `${line.kind}:${line.text}`);
    expect(kinds).toEqual(["agent:Let me look.", "tool:read_file", "agent:Found it."]);
  });

  test("thinking and speech do not merge into each other", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say({ type: "update", update: { sessionUpdate: "agent_thought_chunk", content: { text: "Weighing " } } });
    say({ type: "update", update: { sessionUpdate: "agent_thought_chunk", content: { text: "options." } } });
    say(chunk("Here is my answer."));

    const lines = manager.transcript(agentId);
    expect(lines.map((l) => l.kind)).toEqual(["thought", "agent"]);
    expect(lines[0].text).toBe("Weighing options.");
  });

  test("two turns are two messages even with no tool call between them", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    // A turn ends when `prompt` resolves. Without that seam, the second reply would be appended to
    // the first and the conversation would read as one unbroken wall of text.
    const first = manager.send(agentId, "hi");
    say(chunk("Hello."));
    await first;

    const second = manager.send(agentId, "again");
    say(chunk("Hello again."));
    await second;

    const spoken = manager.transcript(agentId).filter((line) => line.kind === "agent");
    expect(spoken.map((line) => line.text)).toEqual(["Hello.", "Hello again."]);
  });

  test("one tool call is one row, however many updates describe it", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    // Observed verbatim from a real `grok` process asked to list a directory: a call, a retitle,
    // and a completion — three rows, the last of them a raw provider id.
    const id = "call_HWyt8Mw0TufJIbs8Mwetq7jI";
    say({ type: "update", update: { sessionUpdate: "tool_call", toolCallId: id, title: "list_dir" } });
    say({ type: "update", update: { sessionUpdate: "tool_call_update", toolCallId: id, title: "List `.`" } });
    say({ type: "update", update: { sessionUpdate: "tool_call_update", toolCallId: id, status: "completed" } });

    const tools = manager.transcript(agentId).filter((line) => line.kind === "tool");
    expect(tools).toHaveLength(1);
    expect(tools[0].text).toBe("List `.`");
    expect(tools[0].status).toBe("completed");
  });

  test("an untitled call says so rather than showing its provider id", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say({ type: "update", update: { sessionUpdate: "tool_call", toolCallId: "call_abc123" } });

    const tool = manager.transcript(agentId).find((line) => line.kind === "tool")!;
    expect(tool.text).toBe("Tool call");
    expect(tool.text).not.toContain("call_abc123");
  });

  test("two different calls are two rows", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say({ type: "update", update: { sessionUpdate: "tool_call", toolCallId: "a", title: "read_file" } });
    say({ type: "update", update: { sessionUpdate: "tool_call", toolCallId: "b", title: "write_file" } });
    say({ type: "update", update: { sessionUpdate: "tool_call_update", toolCallId: "a", status: "completed" } });

    const tools = manager.transcript(agentId).filter((line) => line.kind === "tool");
    expect(tools.map((t) => `${t.text}:${t.status ?? "-"}`)).toEqual([
      "read_file:completed",
      "write_file:-",
    ]);
  });

  test("a user message ends the agent's open block", async () => {
    const { manager, agentId, say } = harness();
    await manager.open(agentId);

    say(chunk("Working"));
    const done = manager.send(agentId, "stop please");
    say(chunk("Stopped."));
    await done;

    expect(manager.transcript(agentId).map((line) => line.kind)).toEqual(["agent", "user", "agent"]);
  });
});
