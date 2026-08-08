/**
 * The shell↔page contract — loops/07-shell.md §3.3.
 *
 * PUBLISHED ITERATION 1. Additive changes only. Every declaration here is consumed by another
 * worktree, so a new optional field is free and a renamed field is eight broken branches.
 *
 * This worktree (07-shell) merges first and builds the frame the product is seen through: three
 * regions, five pages, one Tools overlay. It owns no domain logic. The pages arrive from
 * 01-agents, 02-assets, 03-design-docs and 08-users-x; the Tools panel's contents arrive from
 * 06-tools-cost. This file is the whole of what they have to agree with.
 *
 * It deliberately imports nothing — not even ./pages — so that it typechecks with no other shell
 * file present, which is what makes it safe to publish before the shell exists.
 */

/** The five pages. Three headline, two secondary; the ranks are in PageDescriptor. */
export type PageId = "agents" | "assets" | "designdocs" | "users" | "x";

/** The three sections of the Tools overlay. Its contents belong to 06-tools-cost. */
export type ToolsSection = "prompts" | "skills" | "workflows";

/** Every page component receives exactly this. The shell passes nothing else, ever. */
export interface WorkspacePageProps {
  /** The active project. Never empty — the shell renders its own empty state instead. */
  projectId: string;
  /** The object selected in the URL for this page, or undefined. Opaque to the shell. */
  selectionId?: string;
  /** Change the selection. Writes the URL; the shell re-renders all three regions. */
  onSelect(selectionId: string | undefined): void;
}

export type WorkspacePageComponent = (props: WorkspacePageProps) => JSX.Element;

export interface PageDescriptor {
  id: PageId;
  /** Navigator label. Plain language. Never a jargon word, never an id. */
  label: string;
  /** URL segment: /agents, /assets, /designdocs, /users, /x */
  segment: string;
  /** headline pages render above the navigator divider; secondary below it. */
  rank: "headline" | "secondary";
  /**
   * The branch that builds this page. ADDED ITERATION 3, additive and optional.
   *
   * Read only by the unmerged-slot notice, so it can say which branch owns the hole rather than
   * leaving the reader to guess. No page component sees it.
   */
  builtBy?: string;
  /** Required once merged. Renders into MAIN. */
  main?: WorkspacePageComponent;
  /** Optional. Renders in the NAVIGATOR beneath the page selector. */
  navigator?: WorkspacePageComponent;
  /** Optional. Renders in the INSPECTOR. Properties only — never navigation. */
  inspector?: WorkspacePageComponent;
}

/** The Tools panel overlays MAIN on every page. One component, three props. */
export interface ToolsPanelProps {
  projectId: string;
  section: ToolsSection;
  onClose(): void;
}

export type ToolsPanelComponent = (props: ToolsPanelProps) => JSX.Element;

/**
 * The URL segment for each page — the single source of the route spelling.
 *
 * workspaceUrl() reads it here rather than from the registry in ./pages, because a deep link in a
 * notification must resolve without the registry having been loaded, and because contract.ts must
 * typecheck alone. pages.ts states its segments as literals so reconciliation's one-line edit
 * reads exactly as §3.3.2 documents it; a test asserts the two agree, so they cannot drift.
 */
export const PAGE_SEGMENTS: Record<PageId, string> = {
  agents: "agents",
  assets: "assets",
  designdocs: "designdocs",
  users: "users",
  x: "x",
};

/**
 * The deep link for a page, an optional selected object, and an optional Tools section.
 *
 * Exported because an agent notification, a cost alert and a presence event all need to point at
 * the thing they are talking about; a notification that cannot be clicked is one the user reads
 * once and then stops reading.
 *
 * Two details that are contract rather than convenience:
 *
 *   - the selection is percent-encoded. Asset and document ids are server-issued and this shell
 *     treats them as opaque, so one containing "/" must not silently become a second path segment.
 *   - Tools is a query parameter, never a path segment, because opening the overlay must not lose
 *     the page underneath — that is the entire argument for it being an overlay (§3.4).
 *
 * An empty selection id is treated as no selection: "/assets/" is a different route from "/assets"
 * and no caller means the former.
 */
export function workspaceUrl(page: PageId, selectionId?: string, tools?: ToolsSection): string {
  const path = selectionId
    ? `/${PAGE_SEGMENTS[page]}/${encodeURIComponent(selectionId)}`
    : `/${PAGE_SEGMENTS[page]}`;
  return tools ? `${path}?tools=${tools}` : path;
}
