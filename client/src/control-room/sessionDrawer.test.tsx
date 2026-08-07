import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SessionDrawer,
  sessionStateLabel,
  transcriptKindLabel,
  type TranscriptEntryView,
} from "./SessionDrawer";

afterEach(cleanup);

const TRANSCRIPT: TranscriptEntryView[] = [
  { seq: 1, at: "", kind: "user", text: "List the auth files" },
  { seq: 2, at: "", kind: "thought", text: "Scanning src/auth" },
  { seq: 3, at: "", kind: "tool", text: "Read src/auth/session.ts", status: "completed" },
  { seq: 4, at: "", kind: "agent", text: "There are two: session.ts and token.ts" },
];

function drawer(props: Partial<React.ComponentProps<typeof SessionDrawer>> = {}) {
  return (
    <SessionDrawer
      agentName="Backend Agent"
      agentId="a1"
      acpSessionId="019fda77-47ea-7d52-a874-8c94679d2e14"
      state="ready"
      transcript={TRANSCRIPT}
      {...props}
    />
  );
}

describe("V-023: live session drawer", () => {
  test("shows the agent, its session id and the state as text", () => {
    render(drawer());
    expect(screen.getByTestId("drawer-agent-name").textContent).toBe("Backend Agent");
    expect(screen.getByTestId("drawer-session-id").textContent).toContain("019fda77");
    expect(screen.getByTestId("drawer-state").textContent).toBe("Ready");
    expect(screen.getByTestId("session-drawer").getAttribute("aria-label")).toContain("Backend Agent");
  });

  test("renders transcript and tool activity, each labelled", () => {
    render(drawer());
    expect(screen.getByTestId("transcript-text-1").textContent).toBe("List the auth files");
    expect(screen.getByTestId("transcript-kind-1").textContent).toBe("You");
    expect(screen.getByTestId("transcript-kind-2").textContent).toBe("Thinking");
    // Tool activity carries its status alongside the title.
    expect(screen.getByTestId("transcript-kind-3").textContent).toBe("Tool · completed");
    expect(screen.getByTestId("transcript-text-3").textContent).toBe("Read src/auth/session.ts");
    expect(screen.getByTestId("transcript-kind-4").textContent).toBe("Agent");
  });

  test("every transcript kind and session state has a label", () => {
    for (const kind of ["user", "agent", "thought", "tool", "system"] as const) {
      expect(transcriptKindLabel(kind).length).toBeGreaterThan(0);
    }
    for (const state of ["starting", "ready", "working", "paused", "stopped", "failed"] as const) {
      expect(sessionStateLabel(state).length).toBeGreaterThan(0);
    }
    expect(() => transcriptKindLabel("bogus" as any)).toThrow(/No label defined/);
    expect(() => sessionStateLabel("bogus" as any)).toThrow(/No label defined/);
  });

  test("an empty transcript explains what to do", () => {
    render(drawer({ transcript: [] }));
    expect(screen.getByTestId("drawer-transcript-empty").textContent).toContain("Send a message");
  });

  test("sending passes the typed text and clears the box", () => {
    const sent: string[] = [];
    render(drawer({ onSend: (t) => sent.push(t) }));

    const input = screen.getByTestId("drawer-input") as HTMLTextAreaElement;
    expect((screen.getByTestId("drawer-send") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "run the tests" } });
    fireEvent.click(screen.getByTestId("drawer-send"));

    expect(sent).toEqual(["run the tests"]);
    expect(input.value).toBe("");
  });

  test("send is blocked while the agent is working", () => {
    render(drawer({ state: "working" }));
    fireEvent.change(screen.getByTestId("drawer-input"), { target: { value: "x" } });
    expect((screen.getByTestId("drawer-send") as HTMLButtonElement).disabled).toBe(true);
  });

  test("a paused session refuses messages and offers Resume instead of Pause", () => {
    // Mirrors the backend, which returns 409 SESSION_PAUSED.
    const resumed: string[] = [];
    render(drawer({ state: "paused", onResume: () => resumed.push("resume") }));

    fireEvent.change(screen.getByTestId("drawer-input"), { target: { value: "x" } });
    const send = screen.getByTestId("drawer-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.getAttribute("title")).toContain("Resume the agent");

    expect(screen.queryByTestId("drawer-pause")).toBeNull();
    fireEvent.click(screen.getByTestId("drawer-resume"));
    expect(resumed).toEqual(["resume"]);
  });

  test("pause and stop are wired", () => {
    const calls: string[] = [];
    render(drawer({ onPause: () => calls.push("pause"), onStop: () => calls.push("stop") }));
    fireEvent.click(screen.getByTestId("drawer-pause"));
    fireEvent.click(screen.getByTestId("drawer-stop"));
    expect(calls).toEqual(["pause", "stop"]);
  });

  test("a stopped session disables input and controls", () => {
    render(drawer({ state: "stopped" }));
    expect((screen.getByTestId("drawer-input") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByTestId("drawer-pause") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("drawer-stop") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("drawer-state").textContent).toBe("Stopped");
  });

  test("a failed session surfaces the error as an alert", () => {
    render(drawer({ state: "failed", error: "Agent process exited" }));
    const alert = screen.getByTestId("drawer-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("Agent process exited");
  });

  test("closing is wired", () => {
    let closed = false;
    render(drawer({ onClose: () => (closed = true) }));
    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(closed).toBe(true);
  });
});
