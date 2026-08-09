/**
 * Reading a live session off the wire.
 *
 * Every one of the four session endpoints answers 409 with `{error, code}` when no session is open,
 * and "no session open" is the ordinary state of an agent nobody has spoken to yet. So the parse is
 * where this breaks if it is going to: an error body is an object, an object has no `.map`, and
 * `as T` on a network value has blanked this page before.
 */
import { describe, expect, test } from "bun:test";
import { readSession } from "./useAgentSession";

describe("a session is read, never cast", () => {
  test("a real session keeps its state, its id and its lines", () => {
    const session = readSession(
      {
        agentId: "agent_1",
        acpSessionId: "sess_1",
        state: "working",
        transcript: [
          { seq: 1, at: "2026-08-09T00:00:00.000Z", kind: "user", text: "look at @deck" },
          { seq: 2, at: "2026-08-09T00:00:01.000Z", kind: "agent", text: "reading it" },
        ],
      },
      "agent_1",
    );
    expect(session?.state).toBe("working");
    expect(session?.acpSessionId).toBe("sess_1");
    expect(session?.transcript.map((e) => e.text)).toEqual(["look at @deck", "reading it"]);
  });

  test("a 409 body is not a session, so nothing renders from it", () => {
    // The ordinary case, not a failure: an agent nobody has opened a conversation with.
    expect(readSession({ error: "Agent agent_1 has no open session.", code: "NO_LIVE_SESSION" }, "agent_1"))
      .toBeUndefined();
    expect(readSession(null, "agent_1")).toBeUndefined();
    expect(readSession("nope", "agent_1")).toBeUndefined();
  });

  test("a state the drawer has no label for is refused rather than rendered", () => {
    // sessionStateLabel throws on an unknown state, and it would throw inside render.
    expect(readSession({ state: "vibing", transcript: [] }, "agent_1")).toBeUndefined();
  });

  test("a transcript that is not a list becomes no lines, not a crash", () => {
    const session = readSession({ state: "ready", transcript: { error: "boom" } }, "agent_1");
    expect(session?.transcript).toEqual([]);
  });

  test("a line with no text is dropped, because the drawer renders text", () => {
    const session = readSession(
      { state: "ready", transcript: [{ seq: 1, kind: "agent" }, { seq: 2, kind: "agent", text: "ok" }] },
      "agent_1",
    );
    expect(session?.transcript.map((e) => e.text)).toEqual(["ok"]);
  });

  test("a missing session id is null, never the string 'null'", () => {
    expect(readSession({ state: "starting", transcript: [] }, "agent_1")?.acpSessionId).toBeNull();
  });

  test("an error the session carries survives, so the drawer can show it", () => {
    expect(readSession({ state: "failed", transcript: [], error: "grok exited" }, "a")?.error).toBe(
      "grok exited",
    );
  });

  test("no error field means no error, rather than an empty string", () => {
    expect(readSession({ state: "ready", transcript: [] }, "a")).not.toHaveProperty("error");
  });
});
