/**
 * The agent card, against one hand-made record — loops/handoff/pivot-frontend.md §6.
 *
 * The record below is Scribe, the first card in `design/mockups/agents-page.html`, written out
 * here field by field. It exists in this file and nowhere else: the point of the exercise is to
 * prove that a REAL record renders the way the mockup draws it, and a fixture that shipped
 * alongside the page would prove the opposite — that the page looks full whether or not anything
 * is wired.
 *
 * So every assertion is either "the mockup prints this and the record supplies it" or "the record
 * does not supply this, and nothing is drawn".
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AgentCard, Money } from "./AgentCard";
import type { AgentView } from "./types";

afterEach(cleanup);

/** design/mockups/agents-page.html, the "Working" card. Test-only, and never shipped. */
const SCRIBE: AgentView = {
  id: "agent_scribe",
  name: "Scribe",
  role: "writer",
  status: "working",
  statusDetail: "Rewriting the opening claim",
  activity: { latestFile: "chair_launch_plan", tool: "write" },
  costUsd: 0.31,
  capabilities: { images: false, voice: false },
};

const noop = () => {};

function renderCard(agent: AgentView, props: Partial<Parameters<typeof AgentCard>[0]> = {}) {
  render(
    <AgentCard
      agent={agent}
      statusLabel="Working"
      capabilityLabel="base Grok"
      onOpen={noop}
      onPause={noop}
      {...props}
    />,
  );
  return screen.getByTestId(`agent-card-${agent.id}`);
}

describe("one record, rendered as the mockup draws it", () => {
  test("the card states who, at what capability, doing what, where, and for how much", () => {
    const card = renderCard(SCRIBE);
    expect(within(card).getByTestId("agent-card-name").textContent).toBe("Scribe");
    // "writer · base Grok" — the role from the record, the capability from the server's vocabulary.
    expect(within(card).getByTestId("agent-card-subtitle").textContent).toBe("writer · base Grok");
    expect(within(card).getByTestId("agent-card-doing").textContent).toBe("Rewriting the opening claim");
    expect(within(card).getByTestId("agent-card-in").textContent).toContain("chair_launch_plan");
    expect(within(card).getByTestId("agent-card-cost").textContent).toContain("$0.31");
  });

  test("the status is a word, and the colour beside it is not the only signal", () => {
    const card = renderCard(SCRIBE);
    expect(within(card).getByTestId("agent-card-status").textContent).toBe("Working");
    expect(card.getAttribute("data-status")).toBe("working");
  });

  test("without the server's vocabulary it prints the record's own status word, not a guess", () => {
    const card = renderCard({ ...SCRIBE, status: "needs_review" }, { statusLabel: undefined });
    expect(within(card).getByTestId("agent-card-status").textContent).toBe("needs review");
  });

  test("Open and Pause are both there, and both say what they do", () => {
    const card = renderCard(SCRIBE);
    expect(within(card).getByTestId(`agent-open-${SCRIBE.id}`).getAttribute("title")).toBe("Open Scribe");
    const pause = within(card).getByTestId(`agent-pause-${SCRIBE.id}`) as HTMLButtonElement;
    expect(pause.disabled).toBe(false);
  });

  test("Open selects and Pause pauses", () => {
    let opened = 0;
    let paused = 0;
    const card = renderCard(SCRIBE, { onOpen: () => (opened += 1), onPause: () => (paused += 1) });
    fireEvent.click(within(card).getByTestId(`agent-open-${SCRIBE.id}`));
    fireEvent.click(within(card).getByTestId(`agent-pause-${SCRIBE.id}`));
    expect([opened, paused]).toEqual([1, 1]);
  });

  test("a disabled Pause states why, in a title", () => {
    const card = renderCard({ ...SCRIBE, status: "idle" });
    const pause = within(card).getByTestId(`agent-pause-${SCRIBE.id}`) as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
    expect(pause.getAttribute("title")).toBe("Only a working agent can be paused");
  });
});

describe("an absent field draws nothing at all", () => {
  /** Everything the API guarantees and not one thing more. */
  const BARE: AgentView = { id: "agent_bare", name: "Nib", role: "writer", status: "idle" };

  test("no capability means the subtitle is the role alone, never a default tier", () => {
    const card = renderCard(BARE, { statusLabel: "Idle", capabilityLabel: undefined });
    expect(within(card).getByTestId("agent-card-subtitle").textContent).toBe("writer");
  });

  test("no activity means no doing line, no in line and no tool", () => {
    const card = renderCard(BARE, { statusLabel: "Idle" });
    expect(within(card).queryByTestId("agent-card-doing")).toBeNull();
    expect(within(card).queryByTestId("agent-card-in")).toBeNull();
    expect(within(card).queryByTestId("agent-card-tool")).toBeNull();
  });

  test("a cost that was never priced says unknown, and never $0.00", () => {
    const card = renderCard(BARE, { statusLabel: "Idle" });
    expect(within(card).getByTestId("agent-card-cost").textContent).toContain("unknown");
    expect(within(card).getByTestId("agent-card-cost").textContent).not.toContain("$");
  });

  test("with no work assigned there is no launch control to press", () => {
    const card = renderCard(BARE, { statusLabel: "Idle", onLaunch: noop });
    expect(within(card).queryByTestId(`agent-launch-${BARE.id}`)).toBeNull();
  });
});

describe("the launch control the mockup puts on an idle card", () => {
  const IDLE: AgentView = { id: "agent_voice", name: "Voiceover", role: "narrator", status: "idle" };

  test("assigned and unblocked, it launches that task", () => {
    let launched: string | undefined;
    const card = renderCard(IDLE, {
      statusLabel: "Idle",
      launchable: { id: "t1", objective: "Read the script", status: "pending", dependsOn: [] },
      onLaunch: (id) => (launched = id),
    });
    const button = within(card).getByTestId(`agent-launch-${IDLE.id}`) as HTMLButtonElement;
    expect(button.getAttribute("title")).toBe("Read the script");
    fireEvent.click(button);
    expect(launched).toBe("t1");
  });

  test("refused, it is disabled and the title is the refusal", () => {
    const card = renderCard(IDLE, {
      statusLabel: "Idle",
      launchRefusal: "The plan must be approved before anything launches",
      onLaunch: noop,
    });
    const button = within(card).getByTestId(`agent-launch-${IDLE.id}`) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("The plan must be approved before anything launches");
  });
});

describe("Money says which of the three things is true", () => {
  test("never priced is unknown", () => {
    render(<Money />);
    expect(screen.getByText("unknown")).toBeTruthy();
  });

  test("priced at nothing is a dash, because no charges is not a charge of zero", () => {
    render(<Money usd={0} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  test("priced is the money, to the cent", () => {
    render(<Money usd={5.5} />);
    expect(screen.getByText("$5.50")).toBeTruthy();
  });
});
