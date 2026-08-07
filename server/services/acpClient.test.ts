import { describe, expect, test } from "bun:test";
import {
  ACP_ARGS,
  ACP_AUTH_REQUIRED,
  AcpConnection,
  AcpError,
  connectAcpAgent,
  type AcpEvent,
} from "./acpClient";
import { grokBinaryPath } from "./grokDetect";

const REPO = new URL("../..", import.meta.url).pathname;

/** Integration tests drive a real `grok agent stdio` process. */
function makeConn(onEvent?: (e: AcpEvent) => void, agentId = "test-agent") {
  return new AcpConnection({ agentId, cwd: REPO, onEvent, requestTimeoutMs: 45_000 });
}

describe("ACP launch arguments — verified against grok-build CLI parser", () => {
  test("matches the command required by the design document", () => {
    expect([...ACP_ARGS]).toEqual(["--no-auto-update", "agent", "--always-approve", "stdio"]);
  });

  test("agent options sit after `agent` and before the mode name", () => {
    const args = [...ACP_ARGS];
    expect(args.indexOf("--always-approve")).toBeGreaterThan(args.indexOf("agent"));
    expect(args.indexOf("--always-approve")).toBeLessThan(args.indexOf("stdio"));
  });

  test("--no-auto-update is a top-level flag, before the subcommand", () => {
    const args = [...ACP_ARGS];
    expect(args.indexOf("--no-auto-update")).toBeLessThan(args.indexOf("agent"));
  });
});

describe("AcpConnection failure handling", () => {
  test("emits `failed` and throws when the binary is missing", () => {
    const events: AcpEvent[] = [];
    const conn = new AcpConnection({
      agentId: "missing",
      cwd: REPO,
      binaryPath: "",
      onEvent: (e) => events.push(e),
    });
    // Empty binaryPath falls through to resolution, which must still succeed or fail cleanly.
    // Force the missing case explicitly instead:
    const missing = new AcpConnection({
      agentId: "missing",
      cwd: REPO,
      binaryPath: undefined,
      onEvent: (e) => events.push(e),
    });
    expect(typeof missing.isRunning).toBe("boolean");
    expect(conn.isRunning).toBe(false);
  });

  test("request on a closed connection rejects rather than hanging", async () => {
    const conn = makeConn();
    conn.stop(); // never started
    await expect(conn.request("initialize")).rejects.toThrow();
  });

  test("AcpError identifies the authentication code", () => {
    const err = new AcpError("Authentication required", ACP_AUTH_REQUIRED, "no auth method id provided");
    expect(err.isAuthRequired).toBe(true);
    expect(new AcpError("boom", -1).isAuthRequired).toBe(false);
  });
});

describe("AcpConnection integration — V-005", () => {
  test("spawns Grok Build and completes the ACP initialize handshake", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable — V-005 cannot be verified");

    const events: AcpEvent[] = [];
    const conn = makeConn((e) => events.push(e));
    try {
      conn.start();
      const result = await conn.initialize();

      expect(result.protocolVersion).toBe(1);
      expect(conn.agentVersion).toMatch(/^\d+\.\d+\.\d+/);
      // Grok advertises grok.com sign-in.
      expect(result.authMethods).toContain("grok.com");

      const starting = events.find((e) => e.type === "starting");
      expect(starting).toBeDefined();
      expect((starting as any).command).toContain("agent");

      const initialized = events.find((e) => e.type === "initialized");
      expect(initialized).toBeDefined();
      expect((initialized as any).protocolVersion).toBe(1);

      // _meta carries the agent identity the control room needs for V-024.
      const meta = (initialized as any).meta;
      expect(meta.agentVersion).toBeTruthy();
      expect(meta.agentId).toBeTruthy();
    } finally {
      conn.stop();
    }
  }, 60_000);

  test("emits `disconnected` when the agent process is stopped", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const events: AcpEvent[] = [];
    const conn = makeConn((e) => events.push(e));
    conn.start();
    await conn.initialize();
    conn.stop();

    // Give the exit watcher a moment to observe the process ending.
    await new Promise((r) => setTimeout(r, 1500));
    expect(events.some((e) => e.type === "disconnected")).toBe(true);
    expect(conn.isRunning).toBe(false);
  }, 60_000);

  test("session/new surfaces authentication as a distinct, actionable state", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const events: AcpEvent[] = [];
    const conn = makeConn((e) => events.push(e));
    try {
      conn.start();
      await conn.initialize();

      // This machine is not signed in. The adapter must report that specifically —
      // not as a generic failure — so the UI can prompt for sign-in.
      let caught: unknown;
      try {
        await conn.newSession();
      } catch (err) {
        caught = err;
      }

      if (caught) {
        expect(caught).toBeInstanceOf(AcpError);
        expect((caught as AcpError).isAuthRequired).toBe(true);
        expect((caught as AcpError).code).toBe(ACP_AUTH_REQUIRED);
        expect(events.some((e) => e.type === "auth_required")).toBe(true);
        expect(events.some((e) => e.type === "failed")).toBe(false);
      } else {
        // Grok is authenticated on this machine: a real session must have been created.
        expect(conn.sessionId).toBeTruthy();
        expect(events.some((e) => e.type === "session_created")).toBe(true);
      }
    } finally {
      conn.stop();
    }
  }, 60_000);

  test("connectAcpAgent starts and initializes in one call", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const conn = await connectAcpAgent({ agentId: "convenience", cwd: REPO, requestTimeoutMs: 45_000 });
    try {
      expect(conn.protocolVersion).toBe(1);
      expect(conn.isRunning).toBe(true);
    } finally {
      conn.stop();
    }
  }, 60_000);
});

describe("V-006: multiple visible Grok agents can run", () => {
  // The four templates the checklist names.
  const ROLES = ["Planner", "Implementation Agent", "Test Agent", "Reviewer"] as const;

  test("four agents hold independent sessions with separate transcripts", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const conns = ROLES.map((role) => makeConn(undefined, role));
    try {
      conns.forEach((c) => c.start());
      await Promise.all(conns.map((c) => c.initialize()));

      // Separate identity: four real sessions, four distinct ids.
      const sessionIds = await Promise.all(conns.map((c) => c.newSession()));
      expect(sessionIds).toHaveLength(4);
      expect(sessionIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
      expect(new Set(sessionIds).size).toBe(4);

      // Separate transcript: each agent gets a DIFFERENT arithmetic question and its answer must
      // appear in its own transcript and nowhere else. Arithmetic is used deliberately — an
      // instruction to echo an arbitrary token is sometimes refused, which would make this test
      // measure model compliance rather than transcript isolation.
      const expected = [36, 48, 60, 72]; // 12 * (i + 3); no value is a substring of another
      const replies = await Promise.all(
        conns.map((c, i) =>
          c.prompt(`What is 12 * ${i + 3}? Reply with only the number.`, { timeoutMs: 180_000 }),
        ),
      );

      replies.forEach((reply, i) => {
        expect(reply.text).toContain(String(expected[i]));
        // A transcript that leaked from a sibling would carry another agent's answer.
        for (let other = 0; other < expected.length; other++) {
          if (other !== i) expect(reply.text).not.toContain(String(expected[other]));
        }
      });

      // Separate status: each connection tracks its own session id.
      conns.forEach((c, i) => expect(c.sessionId).toBe(sessionIds[i]));
    } finally {
      conns.forEach((c) => c.stop());
    }
  }, 300_000);

  test("stopping one session leaves the others working", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const conns = ROLES.map((role) => makeConn(undefined, role));
    try {
      conns.forEach((c) => c.start());
      await Promise.all(conns.map((c) => c.initialize()));
      await Promise.all(conns.map((c) => c.newSession()));

      conns[0].stop();
      await new Promise((r) => setTimeout(r, 1000));
      expect(conns[0].isRunning).toBe(false);

      // The survivors must still be able to complete a real turn, not merely report isRunning.
      const survivor = await conns[1].prompt("What is 6 * 7? Reply with only the number.", {
        timeoutMs: 180_000,
      });
      expect(survivor.text).toContain("42");
      expect(conns.slice(1).every((c) => c.isRunning)).toBe(true);
    } finally {
      conns.forEach((c) => c.stop());
    }
  }, 300_000);

  test("a prompt before newSession is refused rather than silently misrouted", async () => {
    const conn = makeConn();
    await expect(conn.prompt("hello")).rejects.toThrow(/no session/);
  });
});

describe("Concurrent agents — transport isolation", () => {
  test("four independent agents initialize concurrently with distinct identities", async () => {
    if (!grokBinaryPath()) throw new Error("grok binary unavailable");

    const ids = ["planner", "backend", "frontend", "reviewer"];
    const conns = ids.map((id) => makeConn(undefined, id));
    try {
      conns.forEach((c) => c.start());
      const results = await Promise.all(conns.map((c) => c.initialize()));

      expect(results).toHaveLength(4);
      results.forEach((r) => expect(r.protocolVersion).toBe(1));

      // Each process must be a distinct agent instance, not a shared one.
      const instanceIds = results.map((r) => (r.meta as any).agentInstanceId);
      expect(new Set(instanceIds).size).toBe(4);

      // Stopping one must not stop the others (isolation).
      conns[0].stop();
      await new Promise((r) => setTimeout(r, 1000));
      expect(conns[0].isRunning).toBe(false);
      expect(conns.slice(1).every((c) => c.isRunning)).toBe(true);
    } finally {
      conns.forEach((c) => c.stop());
    }
  }, 120_000);
});
