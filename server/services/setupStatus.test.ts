import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AcpSessionManager } from "./acpSessionManager";
import { AcpError, ACP_AUTH_REQUIRED } from "./acpClient";
import { getAgentRegistry } from "./agentRegistry";
import { getControlRoomBus, type ControlRoomEvent } from "./controlRoomEvents";
import { ProjectStore } from "./projectStore";

/**
 * What the control room learns when Grok is installed but signed out (V-004).
 *
 * The `auth_required` ACP event fell through `default: break` in the session manager, so the only
 * agent that ever saw it was the legacy terminal UI. The control room therefore looked perfectly
 * healthy until someone pressed Launch, and then reported a JSON-RPC error against the agent for
 * what is a one-time sign-in. These tests follow the chain the browser depends on — ACP event ->
 * bus -> subscriber — with an injected connection, so no grok process and no credentials are
 * needed to run them.
 */

let dataDir: string;
let projectId: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-setup-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  projectId = new ProjectStore(join(dataDir, "projects")).createProject({
    name: "Auth", goal: "g", repositoryPath: "/tmp/r",
  }).id;
});

afterEach(() => {
  getControlRoomBus().clear(projectId);
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

/**
 * A connection that behaves exactly as AcpConnection does when session/new is refused for want of
 * credentials: emit `auth_required`, then rethrow. The rethrow is half the point — it is what
 * drives open()'s catch, which used to overwrite the sign-in message with the protocol error.
 */
function signedOutManager(authMethods: string[] = ["oauth", "api-key"]) {
  return new AcpSessionManager(
    () => "/tmp/wt",
    (opts) =>
      ({
        start() {}, stop() {},
        async initialize() {},
        get supportsLoadSession() { return false; },
        get sessionId() { return null; },
        get isRunning() { return true; },
        async newSession() {
          opts.onEvent?.({ type: "auth_required", agentId: opts.agentId, authMethods });
          throw new AcpError("Authentication required", ACP_AUTH_REQUIRED);
        },
      }) as any,
  );
}

/** A connection that fails for an ordinary reason, to prove the auth path did not swallow those. */
function brokenManager() {
  return new AcpSessionManager(
    () => "/tmp/wt",
    () =>
      ({
        start() {}, stop() {},
        async initialize() {
          throw new Error("agent process died during initialize");
        },
        get supportsLoadSession() { return false; },
        get sessionId() { return null; },
        async newSession() { return "s"; },
      }) as any,
  );
}

function collect(): { seen: ControlRoomEvent[]; stop: () => void } {
  const seen: ControlRoomEvent[] = [];
  const stop = getControlRoomBus().subscribe(projectId, (p) => seen.push(p.event));
  return { seen, stop };
}

async function openExpectingFailure(mgr: AcpSessionManager, agentId: string): Promise<Error> {
  try {
    await mgr.open(agentId);
  } catch (err) {
    return err as Error;
  }
  throw new Error("open() resolved; a signed-out agent must not report a working session");
}

describe("a signed-out Grok reaches the control room (V-004)", () => {
  test("auth_required is published to the project's subscribers", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    const { seen, stop } = collect();
    try {
      await openExpectingFailure(signedOutManager(), agent.id);

      const event = seen.find((e) => e.type === "auth_required") as any;
      expect(event, "nothing told the browser Grok was signed out").toBeTruthy();
      expect(event.agentId).toBe(agent.id);
      expect(event.authMethods).toEqual(["oauth", "api-key"]);
      // The message has to be actionable on its own — it is what the banner renders.
      expect(event.message).toContain("sign in");
      expect(event.message).toContain("oauth");
    } finally {
      stop();
    }
  });

  test("an agent with no advertised sign-in methods still publishes a usable message", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "Plain", role: "Reviewer" });
    const { seen, stop } = collect();
    try {
      await openExpectingFailure(signedOutManager([]), agent.id);

      const event = seen.find((e) => e.type === "auth_required") as any;
      expect(event.authMethods).toEqual([]);
      expect(event.message).toContain("sign in");
      expect(event.message).not.toContain("Sign-in methods offered");
    } finally {
      stop();
    }
  });

  test("a late-joining client still finds it in the replayed history", async () => {
    // The browser usually connects after the failed launch, so the event has to survive in history
    // or the banner would only ever appear for someone already watching.
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    await openExpectingFailure(signedOutManager(), agent.id);

    const replayed = getControlRoomBus().history(projectId).map((p) => p.event);
    expect(replayed.some((e) => e.type === "auth_required")).toBe(true);
  });

  test("the event does not leak into another project's channel", async () => {
    const other = new ProjectStore(join(dataDir, "projects")).createProject({
      name: "Other", goal: "g", repositoryPath: "/tmp/r2",
    }).id;
    const seen: ControlRoomEvent[] = [];
    const stop = getControlRoomBus().subscribe(other, (p) => seen.push(p.event));
    try {
      const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
      await openExpectingFailure(signedOutManager(), agent.id);
      expect(seen).toHaveLength(0);
    } finally {
      stop();
      getControlRoomBus().clear(other);
    }
  });
});

describe("a signed-out agent reads as blocked, not idle", () => {
  test("the agent is left waiting on the user with the sign-in instruction attached", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    await openExpectingFailure(signedOutManager(), agent.id);

    const after = getAgentRegistry().get(agent.id);
    // Blocked on the user, not broken: a sign-in fixes it, and "failed" reads as the agent's fault.
    expect(after.status).toBe("waiting");
    expect(after.statusDetail ?? "").toContain("sign in");
  });

  test("the raw protocol error does not overwrite the sign-in instruction", async () => {
    // session/new emits then rethrows, so open()'s catch runs immediately afterwards. Left ungated
    // it replaced the one message a user can act on with "Authentication required".
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    const { seen, stop } = collect();
    try {
      const err = await openExpectingFailure(signedOutManager(), agent.id);
      expect(err.message).toBe("Authentication required");

      expect(getAgentRegistry().get(agent.id).statusDetail ?? "").not.toBe("Authentication required");

      const states = seen.filter((e) => e.type === "session_state") as any[];
      const last = states[states.length - 1];
      expect(last.state).toBe("failed");
      expect(last.error).toContain("sign in");
    } finally {
      stop();
    }
  });

  test("the transcript records the block, so the drawer explains itself", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    const mgr = signedOutManager();
    await openExpectingFailure(mgr, agent.id);

    const lines = mgr.transcript(agent.id);
    expect(lines.some((l) => l.kind === "system" && l.text.includes("sign in"))).toBe(true);
  });

  test("an ordinary failure is still reported as a failure", async () => {
    // The auth gate must not become a blanket excuse for every failed open.
    const agent = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" });
    const { seen, stop } = collect();
    try {
      await openExpectingFailure(brokenManager(), agent.id);

      expect(getAgentRegistry().get(agent.id).status).toBe("failed");
      expect(seen.some((e) => e.type === "auth_required")).toBe(false);
      const states = seen.filter((e) => e.type === "session_state") as any[];
      expect(states[states.length - 1].error).toContain("died during initialize");
    } finally {
      stop();
    }
  });
});
