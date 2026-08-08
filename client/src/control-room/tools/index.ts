/**
 * What the rest of the workspace may import from this loop.
 *
 * Two things only: the panel itself, which reconciliation wires into `shell/pages.ts` as
 * TOOLS_PANEL, and the event contract, which `01-agents` uses to open the panel and to receive an
 * injection. Everything else here — the sections, the API client, the UI parts — is internal, and
 * an import of one from another worktree is a coupling reconciliation would have to unpick.
 */
export { ToolsPanel } from "./ToolsPanel";
export {
  OPEN_TOOLS_EVENT,
  INJECT_RESOURCE_EVENT,
  dispatchOpenTools,
  dispatchInjectResource,
  onOpenTools,
  onInjectResource,
  type OpenToolsDetail,
  type InjectResourceDetail,
  type InjectionKind,
  type InjectionLedgerHint,
} from "./contract";
