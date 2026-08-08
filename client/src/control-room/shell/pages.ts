/**
 * The page registry — OWNED BY 07-shell. Reconciliation edits ONLY this file (request R-4).
 *
 * The shell never imports a page module. It imports this one, so each sibling worktree's single
 * mount line lands in one file instead of eight worktrees editing one import block.
 *
 * Note what is deliberately absent: a `main` field holding an import of a path that does not exist
 * yet. That would fail the client typecheck in this worktree and in every worktree that merges
 * before its sibling. An optional field left undefined typechecks today, and costs one line at
 * reconciliation. Until then the slot renders the honest statement that the branch has not merged
 * — never an empty list, never a spinner, never a plausible-looking zero.
 */
import type { PageDescriptor, ToolsPanelComponent } from "./contract";
import { USERS_PAGE_SLOTS } from "../users";

export const PAGES: PageDescriptor[] = [
  { id: "agents", label: "Agents", segment: "agents", rank: "headline", builtBy: "01-agents" },
  { id: "assets", label: "Assets", segment: "assets", rank: "headline", builtBy: "02-assets" },
  { id: "designdocs", label: "Design Documents", segment: "designdocs", rank: "headline", builtBy: "03-design-docs" },
  // 08-users-x, mounted. The row keeps its id, label, segment and rank — those are the shell's —
  // and gains only the three components, which is why the page exports them as one object.
  { id: "users", label: "Users", segment: "users", rank: "secondary", builtBy: "08-users-x", ...USERS_PAGE_SLOTS },
  { id: "x", label: "X", segment: "x", rank: "secondary", builtBy: "08-users-x" },
];

/** Set by reconciliation to 06-tools-cost's ToolsPanel. The overlay frame itself is the shell's. */
export const TOOLS_PANEL: ToolsPanelComponent | undefined = undefined;
