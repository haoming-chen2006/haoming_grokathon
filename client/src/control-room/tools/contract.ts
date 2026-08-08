/**
 * The Tools panel's outward contract — loops/06-tools-and-cost.md §4.6.
 *
 * **This is the only module another worktree imports from this loop.** The panel lives over the
 * AGENTS page but `client/src/control-room/agents/**` belongs to `01-agents`; an import in either
 * direction is a coupling reconciliation has to unpick, and an import in both is a cycle. So the
 * two surfaces speak in DOM events, and this file is the one place their names and payloads are
 * written down.
 *
 * The precedent is already in this repository — the legacy shell uses `openui:toggle-help`,
 * `openui:toggle-search` and `openui:restart-tour` the same way (`client/src/App.tsx:308`).
 *
 * The failure a typed constant prevents has already happened here at larger scale: budget events
 * were published by the server and dropped by the client because nothing connected the two ends
 * and the string was written twice. A constant and an interface make that a compile error.
 */

/** The three sections of the overlay. Mirrors `shell/contract.ts`, not imported, to stay standalone. */
export type ToolsSection = "prompts" | "skills" | "workflows";

export type InjectionKind = "prompt" | "skill" | "workflow";

// ───────────────────────────────────────────────────────────── opening the panel (inbound)

/**
 * Ask the shell to open the Tools panel, optionally preselecting an agent to inject into.
 *
 * Dispatched by `01-agents` from an agent card; listened for by the shell, which owns the route.
 * The panel is opened by writing the URL, not by a component flag, so the overlay stays deep
 * linkable and the browser's back button still closes it.
 */
export const OPEN_TOOLS_EVENT = "workspace:open-tools";

export interface OpenToolsDetail {
  /** Preselect this agent as the injection target. */
  agentId?: string;
  tab?: ToolsSection;
}

// ─────────────────────────────────────────────────────────── injecting a resource (outbound)

/**
 * A resolved resource, on its way to an agent that is already running.
 *
 * The division of labour is §4.5's and it is not negotiable in either direction: **this panel
 * resolves, `01-agents` delivers.** The panel has already called `POST /api/library/injections/
 * resolve`, so every field here is the server's answer; the listener's whole job is to put `text`
 * into the live session and write `mounts` through the boundary it owns. The panel never opens a
 * session and never writes into a work area.
 *
 * Carrying the resolved payload rather than just an id is deliberate. If the event carried
 * `{kind, resourceId}` the listener would have to resolve it again, which means the rendering side
 * and the delivering side could disagree about what was sent — and `effectNote` is a sentence the
 * user has already been shown by the time this is dispatched.
 */
export const INJECT_RESOURCE_EVENT = "workspace:inject-resource";

export interface InjectResourceDetail {
  kind: InjectionKind;
  resourceId: string;
  resourceName: string;
  resourceVersion: string;
  /** The agent to deliver to. Always set: the panel refuses to dispatch without a target. */
  agentId: string;
  projectId: string;
  /** Deliver into the live session. Null for a mount-only skill — then `mounts` is the whole of it. */
  text: string | null;
  /** Files to write through `01-agents`' boundary, relative to the agent's work area. */
  mounts: Array<{ relativePath: string; contents: string }>;
  /**
   * When the user will actually see a difference.
   *
   * `next_session` means the agent picks this up when it next starts, and the panel has already
   * said so in words. A listener that reports "done" for a `next_session` injection re-creates
   * exactly the failure TOOL-011 exists to prevent.
   */
  effective: "this_turn" | "next_session";
  /** The sentence the user was shown. Generated with `effective` so the two cannot disagree. */
  effectNote: string;
  estimatedInputTokens: number;
}

/**
 * The ledger row `01-agents` is asked to record once delivery succeeds (§4.5 step 4).
 *
 * Stated here rather than left to the listener so that "what did adding that skill cost?" has one
 * answer shape. This loop does not own the ledger and writes no row itself.
 */
export interface InjectionLedgerHint {
  operation: "injection";
  resourceId: string;
  agentId: string;
  projectId: string;
}

// ───────────────────────────────────────────────────────────────────────── typed dispatch

/** Dispatch helpers, so neither end writes the event name as a string literal. */
export function dispatchOpenTools(detail: OpenToolsDetail = {}): void {
  window.dispatchEvent(new CustomEvent<OpenToolsDetail>(OPEN_TOOLS_EVENT, { detail }));
}

export function dispatchInjectResource(detail: InjectResourceDetail): void {
  window.dispatchEvent(new CustomEvent<InjectResourceDetail>(INJECT_RESOURCE_EVENT, { detail }));
}

/** Subscribe, returning the unsubscribe. The typed `detail` is the point. */
export function onOpenTools(handler: (detail: OpenToolsDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<OpenToolsDetail>).detail ?? {});
  window.addEventListener(OPEN_TOOLS_EVENT, listener);
  return () => window.removeEventListener(OPEN_TOOLS_EVENT, listener);
}

export function onInjectResource(handler: (detail: InjectResourceDetail) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<InjectResourceDetail>).detail);
  window.addEventListener(INJECT_RESOURCE_EVENT, listener);
  return () => window.removeEventListener(INJECT_RESOURCE_EVENT, listener);
}
