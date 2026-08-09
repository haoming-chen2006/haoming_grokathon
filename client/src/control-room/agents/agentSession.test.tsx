/**
 * The session panel's controls, and one distinction in particular.
 *
 * Stop and Delete sit beside each other and do different things on purpose. `stop` retains the
 * session id so `grok --resume <id>` reaches the same conversation (V-007) — right for an agent you
 * are pausing, wrong for one you are clearing out, because starting again would reopen the
 * transcript you thought you had removed. Delete throws it away here AND in grok's own history.
 *
 * The half-failure is the case worth writing down: the workspace always lets go, and
 * `grok sessions delete` may not. A user who is told "deleted" and later finds the conversation in
 * `grok sessions list` has been lied to by a green tick.
 */
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentSession } from "./AgentSession";

afterEach(cleanup);

const SESSION = {
  agentId: "agent_1",
  acpSessionId: "019fe439-2958-7773-a26e-9474bca2967a",
  state: "ready",
  transcript: [
    { seq: 1, kind: "user", text: "hi" },
    { seq: 2, kind: "agent", text: "Hello! How can I assist you today?" },
  ],
};

/** Serves a live session, and whatever the delete should answer. */
function stubServer(deleteBody: unknown = { success: true, sessionDiscarded: true, historyDeleted: true }) {
  const calls: Array<{ method: string; url: string }> = [];
  let deleted = false;
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url });

    if (method === "DELETE" && url.endsWith("/session")) {
      deleted = true;
      return new Response(JSON.stringify(deleteBody), { status: 200 });
    }
    if (url.includes("/session")) {
      // After a delete there is no session, which is how the panel learns to offer to start one.
      if (deleted) return new Response(JSON.stringify({ error: "no session" }), { status: 409 });
      return new Response(JSON.stringify(SESSION), { status: 200 });
    }
    // Mention targets: assets and documents. Empty is a valid answer.
    return new Response(JSON.stringify([]), { status: 200 });
  }) as unknown as typeof fetch;
  return calls;
}

async function mount() {
  render(<AgentSession agentId="agent_1" agentName="Legal research" projectId="proj_1" />);
  await waitFor(() => expect(screen.getByTestId("session-delete")).toBeDefined());
}

describe("deleting a work session", () => {
  test("it asks before it deletes, and sends nothing until confirmed", async () => {
    const calls = stubServer();
    await mount();

    fireEvent.click(screen.getByTestId("session-delete"));
    expect(screen.getByTestId("session-delete-confirm")).toBeDefined();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByTestId("session-delete-yes"));
    });
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.url.endsWith("/api/coding-agents/agent_1/session")),
      ).toBe(true),
    );
  });

  test("the confirmation states what Stop would have done instead", async () => {
    stubServer();
    await mount();
    fireEvent.click(screen.getByTestId("session-delete"));
    const text = screen.getByTestId("session-delete-confirm").textContent ?? "";
    expect(text).toContain("grok history");
    expect(text).toContain("Stop keeps it");
  });

  test("keeping it sends nothing", async () => {
    const calls = stubServer();
    await mount();
    fireEvent.click(screen.getByTestId("session-delete"));
    fireEvent.click(screen.getByTestId("session-delete-no"));
    expect(screen.queryByTestId("session-delete-confirm")).toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("afterwards the panel offers to start a new one, not the old transcript", async () => {
    stubServer();
    await mount();
    fireEvent.click(screen.getByTestId("session-delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-delete-yes"));
    });
    await waitFor(() => expect(screen.getByTestId("session-start")).toBeDefined());
    expect(screen.queryByText("Hello! How can I assist you today?")).toBeNull();
  });

  test("grok keeping its copy is said out loud, not hidden behind a success", async () => {
    stubServer({
      success: true,
      sessionDiscarded: true,
      historyDeleted: false,
      historyError: "leader socket unavailable",
    });
    await mount();
    fireEvent.click(screen.getByTestId("session-delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("session-delete-yes"));
    });

    await waitFor(() => expect(screen.getByTestId("session-error")).toBeDefined());
    const said = screen.getByTestId("session-error").textContent ?? "";
    expect(said).toContain("grok kept its copy");
    expect(said).toContain("leader socket unavailable");
  });

  test("Stop is still there and still says it can be resumed", async () => {
    // The two controls are only worth having if they remain distinguishable.
    stubServer();
    await mount();
    expect(screen.getByTestId("session-stop").getAttribute("title")).toContain("resumed");
    expect(screen.getByTestId("session-delete").getAttribute("title")).toContain("Cannot be undone");
  });
});

describe("the transcript it draws", () => {
  test("a streamed reply reads as one message under the agent's name", async () => {
    stubServer();
    await mount();
    expect(screen.getByText("Hello! How can I assist you today?")).toBeDefined();
    expect(screen.getAllByTestId("transcript-line")).toHaveLength(2);
  });
});
