import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { workspaceUrl } from "./contract";
import { PAGES } from "./pages";
import { navigate } from "./router";
import { Notifications, WorkspaceShell } from "./WorkspaceShell";
import { NAVIGATOR } from "./regions";

const PROJECT = { id: "proj_1", name: "Aeris Chairs — Q3 sales push" };

/** The endpoints the shell reads, all of which exist on the merge base. */
function stubServer(overrides: { projects?: unknown; grok?: unknown } = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("/api/projects")
      ? (overrides.projects ?? [PROJECT])
      : url.includes("/api/grok/status")
        ? (overrides.grok ?? { installed: true })
        : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

async function mount() {
  const result = render(<WorkspaceShell />);
  // The shell resolves its project before a page slot can be given a non-empty projectId.
  await waitFor(() => expect(screen.getByTestId("toolbar-project").textContent).not.toBe(""));
  return result;
}

/**
 * happy-dom starts at `about:blank`, where `location.pathname` is the string "blank" and a
 * relative `history.replaceState` cannot resolve. Every URL assertion below silently passed
 * against the wrong page until this was added — the shell read no path, fell back to the default,
 * and the tests agreed with it. Giving the document a real origin first is what makes the routing
 * assertions mean anything.
 *
 * Done here rather than in `client/happydom.ts`, which is an unassigned shared file and therefore
 * hot; the finding is filed for the other worktrees in loops/handoff/pivot-shell.md.
 */
function atUrl(path: string) {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(
    `http://localhost${path}`,
  );
}

beforeEach(() => {
  localStorage.clear();
  atUrl("/designdocs");
  stubServer();
});
afterEach(cleanup);

describe("the three regions", () => {
  test("navigator, main and inspector render on every page", async () => {
    for (const page of PAGES) {
      atUrl(workspaceUrl(page.id));
      await mount();
      expect(screen.getByTestId("navigator")).toBeDefined();
      expect(screen.getByTestId("main")).toBeDefined();
      expect(screen.getByTestId("inspector")).toBeDefined();
      cleanup();
    }
  });

  test("the shell's own inspector content offers no way to change what MAIN displays", async () => {
    await mount();
    const inspector = screen.getByTestId("inspector");
    // An inspector that can change MAIN is a second navigator, and the user loses their place.
    //
    // Scoped to the shell's OWN content on purpose. Once a sibling mounts a real inspector this
    // element will contain that page's markup, and a blanket "no buttons in the inspector" rule
    // asserted here would fail on their branch for a judgement made on this one. The rule for
    // page-supplied inspectors is stated in loops/handoff/pivot-shell.md, where they can read it.
    expect(PAGES.every((p) => p.inspector === undefined)).toBe(true);
    expect(inspector.querySelectorAll("button").length).toBe(0);
    expect(inspector.querySelectorAll("a").length).toBe(0);
  });

  test("a side region collapses on a double-click and its width survives a remount", async () => {
    await mount();
    expect(screen.getByTestId("navigator")).toBeDefined();

    fireEvent.doubleClick(screen.getByTestId("resize-left"));
    await waitFor(() => expect(screen.queryByTestId("navigator")).toBeNull());
    // Collapsed is a rail, not nothing: the wireframes keep a strip with a way back.
    expect(screen.getByTestId("navigator-rail")).toBeDefined();
    expect(screen.getByTestId("navigator-expand")).toBeDefined();

    cleanup();
    await mount();
    // Reload: the collapse persisted, so the user does not have to re-collapse it every visit.
    expect(screen.queryByTestId("navigator")).toBeNull();
    expect(screen.getByTestId("navigator-rail")).toBeDefined();
  });

  test("the rail's own control expands the region again", async () => {
    await mount();
    fireEvent.doubleClick(screen.getByTestId("resize-left"));
    await waitFor(() => expect(screen.getByTestId("navigator-rail")).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByTestId("navigator-expand"));
    });
    expect(screen.getByTestId("navigator")).toBeDefined();
    expect(screen.queryByTestId("navigator-rail")).toBeNull();
  });

  test("a side region resizes by keyboard, and the new width persists", async () => {
    await mount();
    expect(screen.getByTestId("navigator").style.width).toBe(`${NAVIGATOR.initial}px`);

    fireEvent.keyDown(screen.getByTestId("resize-left"), { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByTestId("navigator").style.width).toBe(`${NAVIGATOR.initial + 16}px`),
    );

    cleanup();
    await mount();
    expect(screen.getByTestId("navigator").style.width).toBe(`${NAVIGATOR.initial + 16}px`);
  });
});

describe("the navigator names the places", () => {
  test("three headline pages sit above the divider and two secondary ones below it", async () => {
    await mount();
    const selector = screen.getByTestId("page-selector");
    const order = [...selector.children].map((el) => el.getAttribute("data-testid") ?? "");
    expect(order).toEqual([
      "page-agents",
      "page-assets",
      "page-designdocs",
      "navigator-divider",
      "page-users",
      "page-x",
    ]);
  });

  test("every page label is plain language, and none is an id", async () => {
    await mount();
    for (const page of PAGES) {
      expect(screen.getByTestId(`page-${page.id}`).textContent).toBe(page.label);
    }
    expect(screen.getByTestId("page-designdocs").textContent).toBe("Design Documents");
  });

  test("nothing else in the shell navigates between pages", async () => {
    await mount();
    // Today's shell has a six-tab strip inside MAIN as well as a left rail. MAIN holds no page
    // switcher at all: the navigator is the only surface that changes which page you are on.
    const main = screen.getByTestId("main");
    for (const page of PAGES) {
      expect(main.querySelector(`[data-testid="page-${page.id}"]`)).toBeNull();
    }
  });
});

describe("location is in the URL", () => {
  test("clicking a page writes its url and renders that page", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("page-assets"));
    });
    expect(location.pathname).toBe("/assets");
    expect(screen.getByTestId("page-assets").getAttribute("aria-current")).toBe("page");
  });

  test("a url restores the page it names, on a cold mount", async () => {
    atUrl(workspaceUrl("users"));
    await mount();
    expect(screen.getByTestId("page-users").getAttribute("aria-current")).toBe("page");
  });

  test("the back button moves between pages", async () => {
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("page-assets"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("page-agents"));
    });
    expect(screen.getByTestId("page-agents").getAttribute("aria-current")).toBe("page");

    // history.back() is asynchronous and happy-dom does not schedule popstate the way a browser
    // does, so the pop is driven directly. What this proves is the shell's half of the contract:
    // it re-reads location on popstate rather than holding its own copy of "which page am I on".
    await act(async () => {
      history.replaceState(null, "", workspaceUrl("assets"));
      window.dispatchEvent(new Event("popstate"));
    });
    expect(screen.getByTestId("page-assets").getAttribute("aria-current")).toBe("page");
  });

  test("a programmatic navigation re-renders, because pushState does not fire popstate", async () => {
    await mount();
    await act(async () => {
      navigate(workspaceUrl("x"));
    });
    expect(screen.getByTestId("page-x").getAttribute("aria-current")).toBe("page");
  });
});

describe("an unmerged page is stated, never faked", () => {
  test("every slot says which branch builds it, and shows no empty list or spinner", async () => {
    for (const page of PAGES) {
      atUrl(workspaceUrl(page.id));
      await mount();
      const notice = screen.getByTestId("not-merged-yet");
      expect(notice.textContent).toContain(page.label);
      expect(notice.textContent).toContain(page.builtBy!);
      expect(notice.textContent).toContain("not in this build");
      cleanup();
    }
  });

  test("the shell imports no sibling page module", async () => {
    // SHELL-017: on this branch alone, with nothing merged, the shell still builds and renders.
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const offenders: string[] = [];
    for (const file of readdirSync(import.meta.dir).filter((f) => /\.tsx?$/.test(f))) {
      const text = readFileSync(join(import.meta.dir, file), "utf8");
      for (const m of text.matchAll(/from\s+"\.\.\/(agents|assets|designdoc|software|tools|users)\//g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("one notification surface, not six", () => {
  test("two simultaneous alerts are two rows in one surface, not two full-width strips", () => {
    // Driven directly rather than through the shell, because the shell has exactly one real alert
    // source today (Grok detection) and a test named "two alerts" that only ever renders one
    // proves nothing about the clause it claims to cover. Today's shell stacks SIX banners here.
    render(
      <Notifications
        items={[
          { id: "a", tone: "error", message: "Grok is not installed, so agents cannot start." },
          { id: "b", tone: "warning", message: "This project has no design document yet." },
        ]}
      />,
    );
    const surfaces = screen.getAllByTestId("notifications");
    expect(surfaces.length).toBe(1);
    expect(surfaces[0].children.length).toBe(2);
    expect(screen.getByTestId("notification-a")).toBeDefined();
    expect(screen.getByTestId("notification-b")).toBeDefined();
  });

  test("dismissing one row leaves the other, and the surface, in place", () => {
    render(
      <Notifications
        items={[
          { id: "a", tone: "error", message: "First." },
          { id: "b", tone: "warning", message: "Second." },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("notification-a-dismiss"));
    expect(screen.queryByTestId("notification-a")).toBeNull();
    expect(screen.getByTestId("notification-b")).toBeDefined();
  });

  test("the surface disappears entirely once every row is dismissed", () => {
    render(<Notifications items={[{ id: "a", tone: "error", message: "Only one." }]} />);
    fireEvent.click(screen.getByTestId("notification-a-dismiss"));
    expect(screen.queryByTestId("notifications")).toBeNull();
  });

  test("a row states its tone in text as well as in colour", () => {
    render(<Notifications items={[{ id: "a", tone: "error", message: "Broken." }]} />);
    const row = screen.getByTestId("notification-a");
    expect(row.textContent).toContain("Error:");
    expect(row.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  test("the shell feeds its one real alert source into that surface", async () => {
    stubServer({ grok: { installed: false, setupMessage: "Grok is not installed." } });
    await mount();
    expect(await screen.findByTestId("notification-grok-missing")).toBeDefined();
  });

  test("no notification surface renders when there is nothing to say", async () => {
    await mount();
    expect(screen.queryByTestId("notifications")).toBeNull();
  });
});

describe("the toolbar", () => {
  test("names the product and the project", async () => {
    await mount();
    expect(screen.getByTestId("toolbar").textContent).toContain("grok-workspace");
    expect(screen.getByTestId("toolbar-project").textContent).toBe(PROJECT.name);
  });

  test("labels the spend and renders it as unknown rather than a fabricated $0.00", async () => {
    await mount();
    const spend = screen.getByTestId("toolbar-spend");
    // Both wireframes put the figure here; design-document.html labels it and assets-page.html
    // does not. Labelled won, and the label is what makes the unpriced case readable.
    expect(spend.textContent).toContain("Project spend");
    expect(spend.textContent).toContain("unknown");
    expect(spend.textContent).not.toContain("$0.00");
  });

  test("the theme control switches the document class with no reload, both ways", async () => {
    await mount();
    const root = document.documentElement;
    // The starting theme is whatever the environment resolves to — happy-dom answers the
    // prefers-color-scheme query, and asserting a hardcoded starting point made this test pass
    // for the wrong reason once already.
    const started = root.classList.contains("light") ? "light" : "dark";
    const other = started === "light" ? "dark" : "light";

    await act(async () => {
      fireEvent.click(screen.getByTestId("theme-toggle"));
    });
    expect(root.classList.contains(other)).toBe(true);
    expect(root.classList.contains(started)).toBe(false);
    expect(localStorage.getItem("grok-workspace-theme")).toBe(other);

    await act(async () => {
      fireEvent.click(screen.getByTestId("theme-toggle"));
    });
    expect(root.classList.contains(started)).toBe(true);
    expect(localStorage.getItem("grok-workspace-theme")).toBe(started);
  });

  test("a stored choice wins over the OS preference in both directions", async () => {
    const { resolveTheme, systemTheme } = await import("./theme");
    const os = systemTheme();
    // The case the feature exists for: the OS says one thing, the user chose the other, and the
    // user wins. A resolver that only overrode one way would silently revert half its users.
    localStorage.setItem("grok-workspace-theme", os === "dark" ? "light" : "dark");
    expect(resolveTheme()).not.toBe(os);
    localStorage.setItem("grok-workspace-theme", os);
    expect(resolveTheme()).toBe(os);
    localStorage.removeItem("grok-workspace-theme");
    expect(resolveTheme()).toBe(os);
  });
});

describe("a workspace with no project", () => {
  test("renders the shell's own state rather than a page with a blank id", async () => {
    stubServer({ projects: [] });
    render(<WorkspaceShell />);
    const empty = await screen.findByTestId("no-project");
    expect(empty.textContent).toContain("design document");
    // No page slot was mounted, so no page had to handle an empty projectId.
    expect(screen.queryByTestId("not-merged-yet")).toBeNull();
  });
});

describe("the Tools overlay", () => {
  test("opens over MAIN from every page, and the page underneath stays mounted", async () => {
    for (const page of PAGES) {
      atUrl(workspaceUrl(page.id));
      await mount();
      await act(async () => {
        fireEvent.click(screen.getByTestId("tools-open"));
      });
      const overlay = screen.getByTestId("tools-overlay");
      const main = screen.getByTestId("main");

      // Over MAIN, not instead of it. Asserting that both elements merely EXIST is not enough —
      // that stays true when the overlay stops overlaying, which a mutation probe demonstrated.
      // Three facts together make it an overlay: it lives inside MAIN, MAIN's own content is
      // still mounted beside it, and it is taken out of flow.
      expect(main.contains(overlay)).toBe(true);
      expect(main.querySelector("[data-testid='not-merged-yet']")).not.toBeNull();
      expect(overlay.className).toContain("absolute");
      expect(overlay.className).toContain("inset-0");
      expect(screen.getByTestId(`page-${page.id}`).getAttribute("aria-current")).toBe("page");
      cleanup();
    }
  });

  test("is a query parameter, so the page underneath is not lost", async () => {
    atUrl(workspaceUrl("assets", "asset_1"));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("tools-open"));
    });
    expect(location.pathname).toBe("/assets/asset_1");
    expect(location.search).toBe("?tools=prompts");
  });

  test("Esc dismisses it and restores the page unchanged, with the parameter removed", async () => {
    atUrl(workspaceUrl("designdocs", "doc_1", "skills"));
    await mount();
    expect(screen.getByTestId("tools-overlay")).toBeDefined();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("tools-overlay")).toBeNull();
    expect(location.pathname).toBe("/designdocs/doc_1");
    expect(location.search).toBe("");
    expect(screen.getByTestId("page-designdocs").getAttribute("aria-current")).toBe("page");
  });

  test("clicking the scrim is the same dismissal as Esc", async () => {
    atUrl(workspaceUrl("agents", undefined, "workflows"));
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("tools-scrim"));
    });
    expect(screen.queryByTestId("tools-overlay")).toBeNull();
    expect(location.search).toBe("");
  });

  test("Cmd-T opens it, the shortcut both wireframes print on the control", async () => {
    await mount();
    await act(async () => {
      fireEvent.keyDown(window, { key: "t", metaKey: true });
    });
    expect(screen.getByTestId("tools-overlay")).toBeDefined();
    expect(location.search).toBe("?tools=prompts");
  });

  test("a url naming a section opens that section on a cold mount", async () => {
    atUrl(workspaceUrl("assets", undefined, "skills"));
    await mount();
    expect(screen.getByTestId("tools-panel").textContent).toContain("skills");
  });

  test("renders the unmerged notice until 06-tools-cost lands, never an empty panel", async () => {
    atUrl(workspaceUrl("agents", undefined, "prompts"));
    await mount();
    // Scoped to the panel: MAIN is also unmerged, so the page carries two of these notices, and
    // an unscoped query would be ambiguous — which is itself the honest signal that both holes
    // are being stated rather than one being faked.
    const notice = screen.getByTestId("tools-panel").querySelector("[data-testid='not-merged-yet']");
    expect(notice?.textContent).toContain("Tools panel");
    expect(notice?.textContent).toContain("06-tools-cost");
    expect(screen.getAllByTestId("not-merged-yet").length).toBe(2);
  });

  test("the shell owns the dismissal, so the panel needs no visibility of its own", async () => {
    atUrl(workspaceUrl("agents", undefined, "prompts"));
    await mount();
    // If the panel rendered its own scrim or Esc handler, two dismissal paths would fight and the
    // query parameter would desynchronise from the DOM. The scrim and the close control are both
    // the shell's, and both write the URL.
    expect(screen.getByTestId("tools-scrim")).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByTestId("tools-close"));
    });
    expect(location.search).toBe("");
  });
});
