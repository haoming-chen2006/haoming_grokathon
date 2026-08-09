/**
 * The ASSETS row and rail, against hand-made records.
 *
 * `mockAssets.ts` shipped four invented deliverables with invented costs and invented provenance,
 * so a project with nothing in it looked like a project with four things in it. It is deleted, and
 * the records below live in this file only. The empty suites are what stop it coming back.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AssetRow, rowSubtitle } from "./AssetRow";
import { AssetsInspector } from "./AssetsInspector";
import { ROW_LIMIT, matchingAssets, recentAssets } from "./AssetsNavigator";
import { ASSET_CHIPS, chipAdmits, type AssetType, type AssetView } from "./types";
import { formatCost } from "./useAssets";

afterEach(cleanup);

const asset = (id: string, extra: Partial<AssetView> = {}): AssetView => ({
  id,
  projectId: "p1",
  type: "document",
  title: id,
  origin: "generated",
  files: [],
  charges: [],
  currentVersion: 1,
  versions: [],
  updatedAt: "2026-08-01T00:00:00.000Z",
  body: { kind: "document", headings: [], paragraphs: [] },
  ...extra,
});

/** design/mockups/assets-page.html, the first row of its rail. Test-only, never shipped. */
const PLAN = asset("chair_launch_plan", {
  producedByAgentName: "Scribe",
  charges: [
    { id: "c1", operation: "turn", modelId: "grok-4", rateKey: null, costUsd: 0.31, costSource: "estimated" },
  ],
});

const noop = () => {};

describe("one record, rendered as the mockup draws it", () => {
  test("the name in mono, the type, the producing agent and the cost", () => {
    render(<AssetRow asset={PLAN} onSelect={noop} />);
    const row = screen.getByTestId(`asset-row-${PLAN.id}`);
    expect(within(row).getByTestId("asset-row-name").textContent).toBe("chair_launch_plan");
    expect(within(row).getByTestId("asset-row-name").className).toContain("font-mono");
    expect(within(row).getByTestId("asset-row-subtitle").textContent).toBe("document · Scribe");
    expect(within(row).getByTestId("asset-row-cost").textContent).toBe("$0.31");
  });

  test("a software asset prints its file count where the others print an agent", () => {
    const repo = asset("chair_configurator", {
      type: "software",
      producedByAgentName: "Ledger",
      files: Array.from({ length: 24 }, (_, i) => ({
        id: `f${i}`,
        role: "source",
        path: `src/${i}.ts`,
        bytes: 10,
        mime: "text/plain",
      })),
    });
    expect(rowSubtitle(repo)).toBe("software · 24 files");
  });

  test("one file reads as one file", () => {
    const repo = asset("tiny", {
      type: "software",
      files: [{ id: "f", role: "source", path: "a.ts", bytes: 1, mime: "text/plain" }],
    });
    expect(rowSubtitle(repo)).toBe("software · 1 file");
  });

  test("an upload names its origin rather than borrowing a plausible agent", () => {
    expect(rowSubtitle(asset("brand_guide", { origin: "uploaded" }))).toBe("document · uploaded");
  });

  test("picking a row selects it", () => {
    let picked: string | undefined;
    render(<AssetRow asset={PLAN} onSelect={(id) => (picked = id)} />);
    fireEvent.click(screen.getByTestId(`asset-row-${PLAN.id}`));
    expect(picked).toBe("chair_launch_plan");
  });
});

describe("cost is never invented", () => {
  test("no charges at all is a dash — an upload cost nothing because no agent ran", () => {
    expect(formatCost(asset("uploaded"))).toBe("—");
  });

  test("a charge nobody could price is unknown, never $0.00", () => {
    const video = asset("sale_demo_video", {
      charges: [
        { id: "c", operation: "video", modelId: "grok-video", rateKey: null, costUsd: null, costSource: "unknown" },
      ],
    });
    expect(formatCost(video)).toBe("unknown");
  });

  test("a partly priced asset says so rather than under-reporting", () => {
    const mixed = asset("mixed", {
      charges: [
        { id: "a", operation: "turn", modelId: "grok-4", rateKey: "k", costUsd: 1.2, costSource: "billed" },
        { id: "b", operation: "video", modelId: "grok-video", rateKey: null, costUsd: null, costSource: "unknown" },
      ],
    });
    expect(formatCost(mixed)).toBe("$1.20 + unpriced");
  });
});

describe("the chips are a lens over the types, not a sixth type", () => {
  test("All admits every type", () => {
    const all = ASSET_CHIPS[0];
    const types: AssetType[] = ["document", "slides", "table", "workflow", "software"];
    expect(types.every((t) => chipAdmits(all, t))).toBe(true);
  });

  test("Video admits workflows, because a video IS a workflow deliverable", () => {
    const video = ASSET_CHIPS.find((c) => c.id === "video")!;
    expect(chipAdmits(video, "workflow")).toBe(true);
    expect(chipAdmits(video, "slides")).toBe(false);
  });

  test("every type is reachable through some chip, so nothing is unfindable", () => {
    const types: AssetType[] = ["document", "slides", "table", "workflow", "software"];
    for (const t of types) {
      const reachable = ASSET_CHIPS.some((c) => c.types?.includes(t));
      expect(`${t} reachable: ${reachable}`).toBe(`${t} reachable: true`);
    }
  });
});

describe("the match count is derived from the data", () => {
  const shelf = [
    PLAN,
    asset("sales_deck_for_chairs", { type: "slides", producedByAgentName: "Slidewright" }),
    asset("chair_price_list", { type: "table", producedByAgentName: "Ledger" }),
  ];

  test("no query and no chip matches everything", () => {
    expect(matchingAssets(shelf, "", "all")).toHaveLength(3);
  });

  test("a query narrows by title, type or producing agent", () => {
    expect(matchingAssets(shelf, "chair", "all").map((a) => a.id)).toEqual([
      "chair_launch_plan",
      "sales_deck_for_chairs",
      "chair_price_list",
    ]);
    expect(matchingAssets(shelf, "slidewright", "all").map((a) => a.id)).toEqual(["sales_deck_for_chairs"]);
    expect(matchingAssets(shelf, "table", "all").map((a) => a.id)).toEqual(["chair_price_list"]);
  });

  test("a chip narrows by type", () => {
    expect(matchingAssets(shelf, "", "slides").map((a) => a.id)).toEqual(["sales_deck_for_chairs"]);
    expect(matchingAssets(shelf, "", "docs").map((a) => a.id)).toEqual([
      "chair_launch_plan",
      "chair_price_list",
    ]);
  });

  test("an empty shelf matches nothing, and that is 0 of 0 rather than an error", () => {
    expect(matchingAssets([], "", "all")).toEqual([]);
    expect(matchingAssets([], "chair", "all")).toEqual([]);
  });

  test("the cap is real, so anything above it must be said out loud", () => {
    const many = Array.from({ length: ROW_LIMIT + 3 }, (_, i) => asset(`a${i}`));
    expect(matchingAssets(many, "", "all")).toHaveLength(ROW_LIMIT + 3);
  });
});

describe("RECENT is the store's own updatedAt, newest first", () => {
  test("ordered by when the record last moved", () => {
    const older = asset("older", { updatedAt: "2026-08-01T00:00:00.000Z" });
    const newer = asset("newer", { updatedAt: "2026-08-08T00:00:00.000Z" });
    expect(recentAssets([older, newer]).map((a) => a.id)).toEqual(["newer", "older"]);
  });

  test("an empty shelf has nothing recent, rather than a placeholder row", () => {
    expect(recentAssets([])).toEqual([]);
  });
});

describe("a deliverable is credited to whoever actually made it", () => {
  /**
   * The first real generated image rendered as "Uploaded by you".
   *
   * Nothing resolved `producedByAgentId` into a name, so every generated asset fell through the
   * has-a-name branch straight into the upload branch, and the page credited a person who did not
   * make it. That is a fabricated value wearing an attribution — the class of defect this page
   * deleted a mock module over — and it needed a third branch, not a better fallback.
   */
  const stub = (assets: AssetView[]) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(assets), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
  };

  const named = asset("first_real_image", {
    producedByAgentId: "agent_1",
    producedByAgentName: "Firstlight",
  });
  const unnamed = asset("orphaned", { producedByAgentId: "agent_gone" });
  const uploaded = asset("brought_in", { origin: "uploaded" });

  const madeBy = async (a: AssetView) => {
    stub([a]);
    render(<AssetsInspector projectId="p1" selectionId={a.id} onSelect={noop} />);
    await waitFor(() => expect(screen.getByTestId("assets-inspector")).toBeDefined());
    return screen.getByTestId("assets-inspector").textContent ?? "";
  };

  test("an agent the registry can name is named", async () => {
    expect(await madeBy(named)).toContain("Firstlight");
  });

  test("an agent made it, so it is never described as an upload", async () => {
    // The middle case: the id is there and the name is not. "You uploaded this" would be wrong in
    // exactly the direction nobody checks.
    const text = await madeBy(unnamed);
    expect(text).not.toContain("uploaded");
    expect(text).toContain("no longer has a record of");
  });

  test("only an asset with no producing agent at all is an upload", async () => {
    expect(await madeBy(uploaded)).toContain("uploaded");
  });
});
