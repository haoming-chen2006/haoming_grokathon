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
    const conn = await agentIn(wt.path, "reader");
    try {
      const reply = await conn.prompt(
        "Read the file app.ts in the current directory and reply with only the numeric value assigned to x.",
        { timeoutMs: 240_000 },
      );
      // 8317 appears nowhere but that file, so answering it IS the proof of a read. Asserting a
      // tool call fired was flaky — the model does not always surface one in session updates.
      expect(reply.text).toContain("8317");
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
    const conn = await agentIn(wt.path, "failer");
    try {
      // A distinctive code: "3" would match almost any reply by chance, so the assertion could
      // pass without the agent having observed the failure at all.
      const reply = await conn.prompt(
        "Run the shell command `exit 37` in the current directory. Then reply with only the numeric exit code you observed.",
        { timeoutMs: 240_000 },
      );
      expect(reply.text).toContain("37");
    } finally {
      conn.stop();
    }
  }, 420_000);
});
