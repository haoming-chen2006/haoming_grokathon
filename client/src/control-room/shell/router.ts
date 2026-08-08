/**
 * The workspace router — loops/07-shell.md §3.4.
 *
 * `ControlRoomApp.tsx:29` keeps the current tab in a bare `useState`. With five pages, a selected
 * object per page and a Tools overlay that must not lose the page underneath, that means no deep
 * link, no browser back, and no way for an agent's notification to point at anything.
 *
 * **Hand-rolled rather than react-router, and the reason is the partition, not the code size.**
 * `react-router` is in neither `package.json`, and adding a dependency is a hot-file change and
 * therefore a handoff request. Checked before deciding: no sibling branch has added one either
 * (`for b in pivot/*; do git show $b:client/package.json | grep -c router; done` → 0 on all eight).
 * Hand-rolling keeps the routing inside `shell/**`, which this worktree owns outright, and costs
 * one file. If the owner later adds a router library, this module is the seam to delete: the shell
 * calls `useWorkspaceRoute()` and `navigate()` and nothing else.
 *
 * What this deliberately does NOT do: nested routes, route guards, lazy segments, or a match
 * ranking algorithm. There are five flat segments and one query parameter. A router that can do
 * more than the URL scheme allows is a second place for the URL scheme to be defined.
 */
import { useCallback, useEffect, useState } from "react";
import { PAGE_SEGMENTS, workspaceUrl, type PageId, type ToolsSection } from "./contract";

export interface WorkspaceRoute {
  page: PageId;
  selectionId?: string;
  tools?: ToolsSection;
}

const SEGMENT_TO_PAGE = new Map<string, PageId>(
  (Object.keys(PAGE_SEGMENTS) as PageId[]).map((id) => [PAGE_SEGMENTS[id], id]),
);

const TOOLS_SECTIONS: ToolsSection[] = ["prompts", "skills"];

/** The page `/` resolves to. The front door is where work is declared (§3.2). */
export const DEFAULT_PAGE: PageId = "designdocs";

/**
 * Read a route out of a URL, or null if the URL is not a workspace location.
 *
 * Returning null rather than a default is what lets `main.tsx` keep the legacy canvas mounted at
 * its own paths while the workspace owns its five: a parser that answered "agents" for every
 * unknown path would silently swallow them.
 *
 * `/` is the one exception — it IS a workspace location, and it resolves to DEFAULT_PAGE.
 */
export function parseWorkspaceUrl(url: string): WorkspaceRoute | null {
  const parsed = new URL(url, "http://workspace.invalid");
  const [first, second, ...rest] = parsed.pathname.split("/").filter(Boolean);

  // A third segment is not a route this scheme has. Say so rather than ignoring it, or
  // /assets/a/b would quietly render /assets/a and the user's link would lie to them.
  if (rest.length > 0) return null;

  const page = first === undefined ? DEFAULT_PAGE : SEGMENT_TO_PAGE.get(first);
  if (!page) return null;

  const rawTools = parsed.searchParams.get("tools");
  const tools = TOOLS_SECTIONS.find((s) => s === rawTools);

  // decodeURIComponent throws on a malformed escape ("%zz"), which is a link somebody mangled by
  // hand rather than one we produced. Treat it as no selection instead of taking down the page.
  let selectionId: string | undefined;
  if (second !== undefined) {
    try {
      selectionId = decodeURIComponent(second) || undefined;
    } catch {
      selectionId = undefined;
    }
  }

  return { page, selectionId, tools };
}

/** True when this path belongs to the workspace rather than to the legacy canvas. */
export function isWorkspacePath(pathname: string): boolean {
  return parseWorkspaceUrl(pathname) !== null;
}

/**
 * Fired after a programmatic navigation.
 *
 * `history.pushState` does not fire `popstate` — that event is the *browser's* back and forward
 * only. Without this, clicking a navigator row would change the URL and nothing would re-render,
 * which is the single most common bug in a hand-rolled router.
 */
const NAVIGATED = "grok-workspace:navigated";

export function navigate(url: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  window.dispatchEvent(new Event(NAVIGATED));
}

/**
 * The current route, and a setter that writes the URL.
 *
 * Location is in the URL and nowhere else: there is no shell-held copy of "which page am I on",
 * so back, forward, a pasted link and a notification's deep link are all the same code path.
 */
export function useWorkspaceRoute(): {
  route: WorkspaceRoute;
  go: (page: PageId, selectionId?: string, tools?: ToolsSection) => void;
  select: (selectionId: string | undefined) => void;
  openTools: (section: ToolsSection) => void;
  closeTools: () => void;
} {
  const read = () => parseWorkspaceUrl(location.pathname + location.search) ?? { page: DEFAULT_PAGE };
  const [route, setRoute] = useState<WorkspaceRoute>(read);

  useEffect(() => {
    const sync = () => setRoute(read());
    window.addEventListener("popstate", sync);
    window.addEventListener(NAVIGATED, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAVIGATED, sync);
    };
  }, []);

  const go = useCallback((page: PageId, selectionId?: string, tools?: ToolsSection) => {
    navigate(workspaceUrl(page, selectionId, tools));
  }, []);

  // Selecting keeps the page and the Tools section: the overlay is applied TO the thing you are
  // looking at, so picking a different asset underneath it must not close it.
  const select = useCallback(
    (selectionId: string | undefined) => {
      navigate(workspaceUrl(route.page, selectionId, route.tools));
    },
    [route.page, route.tools],
  );

  const openTools = useCallback(
    (section: ToolsSection) => {
      navigate(workspaceUrl(route.page, route.selectionId, section));
    },
    [route.page, route.selectionId],
  );

  // Esc removes the parameter and restores the page unchanged. replace:true so that dismissing an
  // overlay does not leave a history entry the back button walks the user back into.
  const closeTools = useCallback(() => {
    navigate(workspaceUrl(route.page, route.selectionId), { replace: true });
  }, [route.page, route.selectionId]);

  return { route, go, select, openTools, closeTools };
}
