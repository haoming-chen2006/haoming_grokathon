import { describe, expect, test } from "bun:test";
import { workspaceUrl } from "./contract";
import { PAGES } from "./pages";
import { DEFAULT_PAGE, isWorkspacePath, parseWorkspaceUrl } from "./router";
import { INSPECTOR, MAIN_MIN, NAVIGATOR, layout, readRegion } from "./regions";

describe("parseWorkspaceUrl", () => {
  test("reads every page from its own url", () => {
    for (const page of PAGES) {
      expect(parseWorkspaceUrl(workspaceUrl(page.id))).toEqual({
        page: page.id,
        selectionId: undefined,
        tools: undefined,
      });
    }
  });

  test("round-trips a selection, including one that needed encoding", () => {
    for (const id of ["asset_1", "deck/v2 final", "a+b", "100%"]) {
      const url = workspaceUrl("assets", id);
      expect(parseWorkspaceUrl(url)?.selectionId).toBe(id);
    }
  });

  test("round-trips the Tools section on any page, with and without a selection", () => {
    expect(parseWorkspaceUrl(workspaceUrl("agents", undefined, "prompts"))).toEqual({
      page: "agents",
      selectionId: undefined,
      tools: "prompts",
    });
    expect(parseWorkspaceUrl(workspaceUrl("designdocs", "doc_1", "skills"))).toEqual({
      page: "designdocs",
      selectionId: "doc_1",
      tools: "skills",
    });
  });

  test("resolves / to the front door, where work is declared", () => {
    expect(parseWorkspaceUrl("/")?.page).toBe(DEFAULT_PAGE);
    expect(DEFAULT_PAGE).toBe("designdocs");
  });

  test("rejects a path that is not a workspace location, rather than defaulting it", () => {
    // Returning a default here would silently swallow the legacy canvas's own paths.
    for (const url of ["/canvas", "/settings", "/agentsx", "/assets/a/b"]) {
      expect(`${url} -> ${parseWorkspaceUrl(url)}`).toBe(`${url} -> null`);
    }
    expect(isWorkspacePath("/agents")).toBe(true);
    expect(isWorkspacePath("/canvas")).toBe(false);
  });

  test("ignores a tools value that is not one of the three sections", () => {
    expect(parseWorkspaceUrl("/agents?tools=everything")?.tools).toBeUndefined();
  });

  test("survives a hand-mangled escape instead of taking the page down", () => {
    // decodeURIComponent throws on "%zz". A link somebody edited by hand should not be a crash.
    expect(() => parseWorkspaceUrl("/assets/%zz")).not.toThrow();
    expect(parseWorkspaceUrl("/assets/%zz")?.page).toBe("assets");
    expect(parseWorkspaceUrl("/assets/%zz")?.selectionId).toBeUndefined();
  });

  test("treats an empty selection segment as no selection", () => {
    expect(parseWorkspaceUrl("/assets/")?.selectionId).toBeUndefined();
  });
});

describe("region geometry", () => {
  test("the published bounds are the contract's, not the layout's", () => {
    expect(NAVIGATOR.initial).toBe(288);
    expect(NAVIGATOR.min).toBe(220);
    expect(INSPECTOR.initial).toBe(320);
    expect(INSPECTOR.min).toBe(260);
    expect(MAIN_MIN).toBe(480);
  });

  test("a wide window gives both side regions their stored width", () => {
    const l = layout(1600, { width: 288, collapsed: false }, { width: 320, collapsed: false });
    expect(l).toEqual({ navigator: 288, main: 1600 - 288 - 320, inspector: 320 });
  });

  test("main's minimum outranks both side regions, and the inspector yields first", () => {
    // 1280 - 288 - 320 = 672, still above MAIN_MIN, so nothing yields yet.
    expect(layout(1280, { width: 288, collapsed: false }, { width: 320, collapsed: false }).main)
      .toBeGreaterThanOrEqual(MAIN_MIN);

    // At 1000px the two regions plus MAIN_MIN do not fit: the inspector gives up the difference.
    const tight = layout(1000, { width: 288, collapsed: false }, { width: 320, collapsed: false });
    expect(tight.navigator).toBe(288);
    expect(tight.inspector).toBe(232);
    expect(tight.main).toBe(MAIN_MIN);

    // At 600px the inspector is gone and the navigator yields too.
    const tiny = layout(600, { width: 288, collapsed: false }, { width: 320, collapsed: false });
    expect(tiny.inspector).toBe(0);
    expect(tiny.navigator).toBe(120);
  });

  test("a collapsed region takes no width and gives it all to main", () => {
    const l = layout(1600, { width: 288, collapsed: true }, { width: 320, collapsed: true });
    expect(l).toEqual({ navigator: 0, main: 1600, inspector: 0 });
  });

  test("a stored width outside the bounds is clamped, not honoured", () => {
    localStorage.setItem("grok-workspace-region-navigator", JSON.stringify({ width: 40 }));
    expect(readRegion("navigator").width).toBe(NAVIGATOR.min);
    localStorage.setItem("grok-workspace-region-navigator", JSON.stringify({ width: 9000 }));
    expect(readRegion("navigator").width).toBe(NAVIGATOR.max);
    localStorage.removeItem("grok-workspace-region-navigator");
  });

  test("unreadable stored geometry falls back to the default rather than throwing", () => {
    localStorage.setItem("grok-workspace-region-inspector", "not json");
    expect(readRegion("inspector")).toEqual({ width: INSPECTOR.initial, collapsed: false });
    localStorage.removeItem("grok-workspace-region-inspector");
  });

  test("it does not reuse the legacy canvas's own splitter key", () => {
    // openui-sidebar-pct is live persisted state for a surface this loop does not own.
    localStorage.setItem("openui-sidebar-pct", "25");
    expect(readRegion("navigator").width).toBe(NAVIGATOR.initial);
    localStorage.removeItem("openui-sidebar-pct");
  });
});
