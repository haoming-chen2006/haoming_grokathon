/**
 * The AGENTS inspector — the region the page did not have.
 *
 * Rendered against hand-made records rather than through the page, because the point of the panel
 * is that one real record renders correctly. Every assertion below is about what it does with a
 * field that is present and what it does with one that is absent; the second is the harder half and
 * the one this codebase keeps getting wrong.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentInspector } from "./AgentInspector";
import type { AgentView, AreaView } from "./types";

const PROJECT = "proj_1";

const AGENT: AgentView = {
  id: "agent_1",
  name: "Slidewright",
  role: "deck maker",
  status: "waiting",
  capabilities: { images: true, voice: false },
  costUsd: 1.05,
};

const AREA: AreaView = {
  id: "area_1",
  projectId: PROJECT,
  name: "Pitch materials",
  colorToken: "purple",
  glyph: "◆",
  ownerAgentId: AGENT.id,
};

/** The four tiers as `GET /api/coding-agents/capabilities` returns them, prices joined at the route. */
const PRESETS = [
  {
    id: "base",
    label: "base Grok",
    capabilities: { images: false, voice: false },
    mediaTools: [],
    spendNote: "The full Grok Build agent and nothing on top.",
    unitPrices: [],
  },
  {
    id: "images",
    label: "Grok + images",
    capabilities: { images: true, voice: false },
    mediaTools: ["generate_image"],
    spendNote: "The full Grok Build agent, plus our image endpoints.",
    unitPrices: [
      { rateKey: "grok-imagine-image", unit: "images", perUnitUsd: 0.02 },
      { rateKey: "grok-imagine-video-1.5", unit: "video_seconds", perUnitUsd: 0.08 },
    ],
  },
  {
    id: "voice",
    label: "Grok + voice",
    capabilities: { images: false, voice: true },
    mediaTools: ["narrate"],
    spendNote: "The full Grok Build agent, plus our speech endpoints.",
    unitPrices: [{ rateKey: "tts", unit: "characters", perUnitUsd: 15 / 1_000_000 }],
  },
  {
    id: "voice+images",
    label: "Grok + voice + images",
    capabilities: { images: true, voice: true },
    mediaTools: ["generate_image", "narrate"],
    spendNote: "The full Grok Build agent, plus both media families.",
    unitPrices: [{ rateKey: "grok-imagine-image", unit: "images", perUnitUsd: 0.02 }],
  },
];

function stubServer(
  over: { agents?: unknown; areas?: unknown; presets?: unknown; spend?: unknown } = {},
) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/capabilities")
      ? { presets: over.presets ?? PRESETS }
      : url.includes("/areas")
        ? (over.areas ?? [AREA])
        : url.includes("/api/coding-agents")
          ? (over.agents ?? [AGENT])
          : url.includes("/spend")
            ? (over.spend ?? {})
            : url.includes("/api/projects/")
              ? { id: PROJECT, name: "Aeris" }
              : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => stubServer());
afterEach(cleanup);

async function mount(selectionId?: string) {
  render(<AgentInspector projectId={PROJECT} selectionId={selectionId} onSelect={() => {}} />);
  await waitFor(() => expect(screen.getByText("Agent")).toBeDefined());
}

describe("the selection", () => {
  test("with nothing selected it says how to select, and invents no agent", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("inspector-empty")).toBeDefined());
    expect(screen.queryByTestId("inspector-name")).toBeNull();
  });

  test("an area id in the selection slot is the other kind of selection, not an error", async () => {
    // One slot serves both on this page: an area filters the board, an agent selects a card.
    await mount(AREA.id);
    await waitFor(() => expect(screen.getByTestId("inspector-empty")).toBeDefined());
  });

  test("a selected agent states its name, its role and its status as a word", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-name").textContent).toBe("Slidewright"));
    const panel = screen.getByTestId("inspector-name").parentElement?.parentElement;
    expect(panel?.textContent).toContain("deck maker");
    // Colour never carries the status alone.
    expect(panel?.textContent).toContain("waiting");
  });
});

describe("the money dial", () => {
  test("all four tiers are shown, and the agent's own is the one marked", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("capability-images")).toBeDefined());
    for (const id of ["base", "images", "voice", "voice+images"]) {
      expect(screen.getByTestId(`capability-${id}`)).toBeDefined();
    }
    expect(screen.getByTestId("capability-images").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("capability-base").getAttribute("aria-current")).toBeNull();
  });

  test("each tier prints the real per-unit price, never an invented per-task average", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("capability-images")).toBeDefined());
    expect(screen.getByTestId("capability-images").textContent).toContain("$0.02 / image");
    expect(screen.getByTestId("capability-images").textContent).toContain("$0.08 / second of video");
    // $15 per million characters, stated per million rather than as $0.000015.
    expect(screen.getByTestId("capability-voice").textContent).toContain("$15.00 / million characters");
  });

  test("base Grok says it has no priced endpoint, which is the whole safety argument", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("capability-base")).toBeDefined());
    expect(screen.getByTestId("capability-base").textContent).toContain("no priced endpoint");
    expect(screen.getByTestId("capability-base").textContent).not.toContain("$0.00");
  });

  test("an agent with no capability recorded reads as base Grok, and exactly one tier is marked", async () => {
    // `boundary.ts`: base Grok is the ABSENCE of a capability, not a pair of falses — the registry
    // sends no `capabilities` for a base agent precisely so that nothing records a decision the
    // user did not make. So an absent field is base here too, and never two marked rows.
    stubServer({ agents: [{ ...AGENT, capabilities: undefined }] });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("capability-base")).toBeDefined());
    const marked = ["base", "images", "voice", "voice+images"].filter(
      (id) => screen.getByTestId(`capability-${id}`).getAttribute("aria-current") === "true",
    );
    expect(marked).toEqual(["base"]);
  });

  test("with no capability vocabulary it says so instead of drawing an empty dial", async () => {
    stubServer({ presets: [] });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-name")).toBeDefined());
    expect(screen.queryByTestId("capability-dial")).toBeNull();
  });
});

describe("the area, and the money", () => {
  test("the area it may write in is named, with its glyph beside the colour", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-area")).toBeDefined());
    expect(screen.getByTestId("inspector-area").textContent).toContain("Pitch materials");
    expect(screen.getByTestId("inspector-area").textContent).toContain("◆");
  });

  test("an agent in no area says so, rather than showing a blank box", async () => {
    stubServer({ areas: [] });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-no-area")).toBeDefined());
    expect(screen.getByTestId("inspector-no-area").textContent).toContain("can suggest");
  });

  test("a priced agent shows its figure; an unpriced one shows unknown, never $0.00", async () => {
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByText("$1.05")).toBeDefined());

    cleanup();
    stubServer({ agents: [{ ...AGENT, costUsd: undefined }] });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByText("unknown")).toBeDefined());
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  test("media an agent bought counts towards its own total, not only the project's", async () => {
    // `generate_image` writes its charge onto the ASSET and never advances `CodingAgent.costUsd`.
    // The first real image cost $0.02, the project's spend rose, and the agent that spent it read
    // "—". The server sums both ledgers per agent; this is the panel reading that.
    stubServer({
      agents: [{ ...AGENT, costUsd: 0 }],
      spend: { byAgent: [{ agentId: AGENT.id, pricedUsd: 0.02, charges: 1, unpriced: 0 }] },
    });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-spend").textContent).toContain("$0.02"));
  });

  test("a total with an unpriced part says it is a floor, and one with none says unknown", async () => {
    stubServer({
      spend: { byAgent: [{ agentId: AGENT.id, pricedUsd: 0.02, charges: 3, unpriced: 2 }] },
    });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-spend").textContent).toContain("$0.02+"));

    cleanup();
    stubServer({ spend: { byAgent: [{ agentId: AGENT.id, pricedUsd: 0, charges: 2, unpriced: 2 }] } });
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-spend").textContent).toContain("unknown"));
    expect(screen.getByTestId("inspector-spend").textContent).not.toContain("$0.00");
  });

  test("no row is drawn for a field no record carries", async () => {
    // The mockup prints "Started by Marco Reyes". Nothing records who created an agent, so the row
    // is absent rather than filled with a plausible name.
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-name")).toBeDefined());
    expect(document.body.textContent).not.toContain("Started by");
  });
});

describe("dismissing an agent", () => {
  /** Records the calls, so a test can assert the method as well as the path. */
  function recordingServer() {
    const calls: Array<{ method: string; url: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url });
      const body = url.includes("/capabilities")
        ? { presets: PRESETS }
        : url.includes("/areas")
          ? [AREA]
          : url.includes("/api/coding-agents")
            ? [AGENT]
            : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    return calls;
  }

  test("it takes two clicks, because none of it can be undone", async () => {
    // The process is stopped, the conversation is deleted from grok's history, and the spend
    // record goes with it. One button beside the harmless "Clear the selection" would put that a
    // misclick away.
    const calls = recordingServer();
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-dismiss")).toBeDefined());

    fireEvent.click(screen.getByTestId("inspector-dismiss"));
    expect(screen.getByTestId("inspector-dismiss-confirm")).toBeDefined();
    // Nothing has been sent yet.
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByTestId("inspector-dismiss-yes"));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith(`/api/coding-agents/${AGENT.id}`))).toBe(true),
    );
  });

  test("keeping it sends nothing and restores the plain control", async () => {
    const calls = recordingServer();
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-dismiss")).toBeDefined());

    fireEvent.click(screen.getByTestId("inspector-dismiss"));
    fireEvent.click(screen.getByTestId("inspector-dismiss-no"));

    expect(screen.queryByTestId("inspector-dismiss-confirm")).toBeNull();
    expect(screen.getByTestId("inspector-dismiss")).toBeDefined();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("the confirmation names the agent and says what else goes with it", async () => {
    recordingServer();
    await mount(AGENT.id);
    await waitFor(() => expect(screen.getByTestId("inspector-dismiss")).toBeDefined());
    fireEvent.click(screen.getByTestId("inspector-dismiss"));

    const text = screen.getByTestId("inspector-dismiss-confirm").textContent ?? "";
    expect(text).toContain("Slidewright");
    expect(text.toLowerCase()).toContain("grok history");
    expect(text.toLowerCase()).toContain("cannot be undone");
  });

  test("nothing offers to dismiss when no agent is selected", async () => {
    recordingServer();
    await mount();
    await waitFor(() => expect(screen.getByTestId("inspector-empty")).toBeDefined());
    expect(screen.queryByTestId("inspector-dismiss")).toBeNull();
  });
});
