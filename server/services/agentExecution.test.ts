import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpConnection } from "./acpClient";
import { grokBinaryPath } from "./grokDetect";
import { agentChangedFiles, createAgentWorktree, git } from "./repository";

let repo: string;

function sh(cmd: string, cwd: string) {
  execSync(cmd, { cwd, stdio: "pipe" });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "openui-exec-"));
  sh("git init -b main", repo);
  sh("git config user.email t@e.com", repo);
  sh("git config user.name T", repo);
  writeFileSync(join(repo, "README.md"), "# Fixture repo\n");
  writeFileSync(join(repo, "app.ts"), "export const x = 8317;\n");
  sh("git add .", repo);
  sh("git commit -m initial", repo);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

async function agentIn(worktree: string, agentId: string) {
  const conn = new AcpConnection({ agentId, cwd: worktree, requestTimeoutMs: 120_000 });
  conn.start();
  await conn.initialize();
  await conn.newSession();
  return conn;
}

describe("V-032: agent can modify code in its worktree", () => {
  test("an agent edits files in its own worktree and nowhere else", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    // Two agents, two worktrees — containment cannot be shown without a sibling to contain from.
    const backend = createAgentWorktree(repo, { agentId: "backend", branch: "agent/backend", baseBranch: "main" });
    const frontend = createAgentWorktree(repo, { agentId: "frontend", branch: "agent/frontend", baseBranch: "main" });

    const conn = await agentIn(backend.path, "backend");
    try {
      const reply = await conn.prompt(
        "Create a file named session.ts in the current directory containing exactly:\n" +
          "export const session = true;\n" +
          "Then reply with only the word DONE.",
        { timeoutMs: 240_000 },
      );

      // The agent actually wrote the file.
      const written = join(backend.path, "session.ts");
      expect(existsSync(written)).toBe(true);
      expect(readFileSync(written, "utf8")).toContain("export const session");
      expect(reply.toolCalls.length).toBeGreaterThan(0);

      // Containment: it must not appear in the sibling worktree or on the base checkout.
      expect(existsSync(join(frontend.path, "session.ts"))).toBe(false);
      expect(existsSync(join(repo, "session.ts"))).toBe(false);

      // Changed files are visible to the orchestration server, scoped to this agent's branch.
      const changed = agentChangedFiles(backend.path, "main").map((f) => f.path);
      expect(changed).toContain("session.ts");

      // And the sibling worktree is still clean.
      expect(agentChangedFiles(frontend.path, "main")).toHaveLength(0);
    } finally {
      conn.stop();
    }
  }, 420_000);

  test("an agent can read existing repository files", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const wt = createAgentWorktree(repo, { agentId: "reader", branch: "agent/reader", baseBranch: "main" });

    // Precondition, checked before the model is involved at all.
    //
    // This test fails intermittently with the agent reporting it could not find the value — a
    // claim that is either true (the worktree is missing the fixture, a real defect) or false (the
    // model misread a file that was there). Asserting the fixture first partitions those two, so a
    // future failure is attributable rather than ambiguous.
    const fixture = join(wt.path, "app.ts");
    expect(existsSync(fixture), `the worktree is missing app.ts at ${fixture}`).toBe(true);
    expect(readFileSync(fixture, "utf8"), "the worktree's app.ts does not hold the fixture value")
      .toContain("8317");

    const conn = await agentIn(wt.path, "reader");
    try {
      // Assert an effect on disk, not the wording of a reply.
      //
      // This asked the agent to *say* the value, and once got back "The file app.ts does not
      // contain a line where a numeric value is assigned to x" — a wrong answer in fluent prose,
      // which passed on three re-runs. Prose is not a stable interface. Writing the value to a
      // file is: the agent can only produce 8317 by having read app.ts, and the check is then a
      // string comparison against a real file rather than against a sentence.
      const reply = await conn.prompt(
        "Read the file app.ts in the current directory. Create a file named found.txt in the same " +
          "directory containing only the numeric value assigned to x, and nothing else. " +
          "Reply with only DONE when finished.",
        { timeoutMs: 240_000 },
      );
      const why =
        `stopReason=${reply.stopReason} toolCalls=${reply.toolCalls.length} ` +
        `reply=${JSON.stringify(reply.text.slice(0, 300))}`;

      const found = join(wt.path, "found.txt");
      expect(existsSync(found), `the agent did not create found.txt — ${why}`).toBe(true);
      expect(readFileSync(found, "utf8"), why).toContain("8317");
    } finally {
      conn.stop();
    }
  }, 420_000);
});

describe("V-033: agent can run repository commands", () => {
  test("an approved command executes and its output is captured", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const wt = createAgentWorktree(repo, { agentId: "runner", branch: "agent/runner", baseBranch: "main" });
    // A file whose content the agent can only learn by running a command.
    writeFileSync(join(wt.path, "marker.txt"), "MARKER_9137\n");

    const conn = await agentIn(wt.path, "runner");
    try {
      const reply = await conn.prompt(
        "Run the shell command `cat marker.txt` in the current directory and reply with only its output.",
        { timeoutMs: 240_000 },
      );
      expect(reply.text).toContain("MARKER_9137");
      // A tool call is what proves the command was executed rather than guessed.
      expect(reply.toolCalls.length).toBeGreaterThan(0);
    } finally {
      conn.stop();
    }
  }, 420_000);

  test("a failing command surfaces its failure rather than being reported as success", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const wt = createAgentWorktree(repo, { agentId: "failer", branch: "agent/failer", baseBranch: "main" });
    // Same partition as the read test: prove the worktree is sane before blaming the model.
    expect(existsSync(join(wt.path, "app.ts")), "the worktree is missing its fixture").toBe(true);

    const conn = await agentIn(wt.path, "failer");
    try {
      // The observed exit code is written to a file rather than spoken, for the same reason as
      // the read test above: a reply is prose and prose is not a stable interface. 37 is chosen
      // because "3" would match most replies by chance.
      const reply = await conn.prompt(
        "Run the shell command `exit 37` in the current directory. Then create a file named " +
          "code.txt containing only the numeric exit code you observed, and nothing else. " +
          "Reply with only DONE when finished.",
        { timeoutMs: 240_000 },
      );

      // Asserting the effect is right, but discarding the reply left a failure with no evidence
      // of *why* — an earlier run failed here in 5s flat with nothing recorded. The reply and stop
      // reason go into the message so the next failure diagnoses itself.
      const why =
        `stopReason=${reply.stopReason} toolCalls=${reply.toolCalls.length} ` +
        `reply=${JSON.stringify(reply.text.slice(0, 300))}`;

      const codeFile = join(wt.path, "code.txt");
      expect(existsSync(codeFile), `the agent did not record the exit code — ${why}`).toBe(true);
      expect(readFileSync(codeFile, "utf8"), why).toContain("37");
    } finally {
      conn.stop();
    }
  }, 420_000);
});
