import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PAGE_SEGMENTS,
  workspaceUrl,
  type PageDescriptor,
  type PageId,
  type ToolsPanelComponent,
  type ToolsPanelProps,
  type WorkspacePageComponent,
  type WorkspacePageProps,
} from "./contract";
import { PAGES, TOOLS_PANEL } from "./pages";

afterEach(cleanup);

const ALL_PAGE_IDS: PageId[] = ["agents", "assets", "designdocs", "users", "x"];

/**
 * The assignability fixture SHELL-001 requires.
 *
 * Every sibling loop document promises exactly one export taking `{ projectId: string }` —
 * AgentsPage, AssetsPage, DesignDocumentsPage, SoftwarePanel. This is the compile-time proof that
 * such a component mounts into a page slot with no change on the sibling's side: a function of
 * fewer props is assignable to one of more, so `selectionId` and `onSelect` are opt-in later
 * without touching the mount line.
 *
 * This breaks if `projectId` is ever renamed or removed — which is the change the contract exists
 * to prevent, and the reason it is additive-only after iteration 1.
 */
const SiblingShapedPage = ({ projectId }: { projectId: string }) => <div>project {projectId}</div>;
const mountedAsMain: WorkspacePageComponent = SiblingShapedPage;

/**
 * The other direction: the shell must supply every required prop. This object literal is what
 * fails if a required field is added to WorkspacePageProps, so the two fixtures together say
 * exactly which kind of change costs a sibling rebuild (a rename) and which costs a shell edit
 * (a new required prop).
 */
const shellSuppliedProps: WorkspacePageProps = { projectId: "proj_1", onSelect: () => {} };

/** A page may also opt into the navigator and inspector slots. Same component shape, three uses. */
const fullyMountedDescriptor: PageDescriptor = {
  id: "agents",
  label: "Agents",
  segment: "agents",
  rank: "headline",
  main: mountedAsMain,
  navigator: mountedAsMain,
  inspector: mountedAsMain,
};

/** 06-tools-cost's side of the contract: one component, three props, no visibility of its own. */
const ToolsPanelShaped: ToolsPanelComponent = ({ projectId, section }: ToolsPanelProps) => (
  <div>
    {section} for {projectId}
  </div>
);

describe("the page slot contract", () => {
  test("a component taking only { projectId } mounts into a page slot and renders", () => {
    render(mountedAsMain(shellSuppliedProps));
    expect(screen.getByText("project proj_1")).toBeDefined();
  });

  test("the same component satisfies all three region slots of a descriptor", () => {
    expect(fullyMountedDescriptor.main).toBe(mountedAsMain);
    expect(fullyMountedDescriptor.navigator).toBe(mountedAsMain);
    expect(fullyMountedDescriptor.inspector).toBe(mountedAsMain);
  });

  test("the Tools panel takes projectId, section and onClose, and nothing about its own visibility", () => {
    render(ToolsPanelShaped({ projectId: "proj_1", section: "prompts", onClose: () => {} }));
    expect(screen.getByText(/prompts for proj_1/)).toBeDefined();
  });
});

describe("the page registry", () => {
  test("lists all five pages exactly once", () => {
    expect(PAGES.map((p) => p.id).sort()).toEqual([...ALL_PAGE_IDS].sort());
  });

  test("ranks agents, assets and design documents headline; users and X secondary", () => {
    const rank = Object.fromEntries(PAGES.map((p) => [p.id, p.rank]));
    expect(rank).toEqual({
      agents: "headline",
      assets: "headline",
      designdocs: "headline",
      users: "secondary",
      x: "secondary",
    });
  });

  test("orders every headline page above every secondary one, so the divider is one boundary", () => {
    const firstSecondary = PAGES.findIndex((p) => p.rank === "secondary");
    expect(firstSecondary).toBeGreaterThan(-1);
    expect(PAGES.slice(firstSecondary).every((p) => p.rank === "secondary")).toBe(true);
  });

  test("gives every page a plain-language label that is not its id", () => {
    for (const page of PAGES) {
      expect(page.label.length).toBeGreaterThan(0);
      if (page.id !== "x") expect(page.label).not.toBe(page.id);
    }
  });

  test("states its segments identically to PAGE_SEGMENTS, so routes cannot drift", () => {
    for (const page of PAGES) expect(page.segment).toBe(PAGE_SEGMENTS[page.id]);
  });

  test("leaves the Tools panel unset until 06-tools-cost merges", () => {
    expect(TOOLS_PANEL).toBeUndefined();
  });
});

describe("workspaceUrl", () => {
  test("addresses every page by its segment", () => {
    expect(ALL_PAGE_IDS.map((id) => workspaceUrl(id))).toEqual([
      "/agents",
      "/assets",
      "/designdocs",
      "/users",
      "/x",
    ]);
  });

  test("addresses a selected object as a path segment", () => {
    expect(workspaceUrl("assets", "asset_1")).toBe("/assets/asset_1");
    expect(workspaceUrl("designdocs", "doc_1")).toBe("/designdocs/doc_1");
  });

  test("percent-encodes an opaque selection id rather than letting it become a second segment", () => {
    expect(workspaceUrl("assets", "deck/v2 final")).toBe("/assets/deck%2Fv2%20final");
  });

  test("treats an empty selection id as no selection", () => {
    expect(workspaceUrl("assets", "")).toBe("/assets");
  });

  test("carries the Tools overlay as a query parameter, so the page underneath is not lost", () => {
    expect(workspaceUrl("agents", undefined, "prompts")).toBe("/agents?tools=prompts");
    expect(workspaceUrl("designdocs", "doc_1", "skills")).toBe("/designdocs/doc_1?tools=skills");
    expect(workspaceUrl("x", "draft_1", "workflows")).toBe("/x/draft_1?tools=workflows");
  });

  test("produces the same url the registry describes, for every page", () => {
    for (const page of PAGES) expect(workspaceUrl(page.id)).toBe(`/${page.segment}`);
  });
});
