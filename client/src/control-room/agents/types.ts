/**
 * What the AGENTS page believes about the records it renders.
 *
 * Every field here is one the server actually returns today — `GET /api/projects/:id`,
 * `GET /api/coding-agents`, `GET /api/coding-agents/areas`, and the two vocabulary endpoints. The
 * two exceptions are marked, and both are OPTIONAL, which is the whole point of writing them down:
 * an agent record that gains `capabilities` tomorrow renders its capability the moment it arrives,
 * with no further work here. A field that is absent is omitted from the page, never defaulted.
 *
 * Kept in its own module rather than beside the hook so the item components can import the shape
 * without importing the fetch loop — a card that pulls in `useAgents` cannot be rendered in a test
 * without a fake network, and a card that cannot be rendered alone is a card nobody checks.
 */

/** `server/services/boundary.ts` — the two dials that decide which media tools an agent gets. */
export interface AgentCapabilities {
  images: boolean;
  voice: boolean;
}

/**
 * `DocumentFocus`, `server/types/agent.ts` — the lines an agent said it is working in, written by
 * the `report_document_focus` MCP tool and carried here unchanged by `GET /api/coding-agents`.
 *
 * `kind` is `string` here where the server has a two-value union, and that is deliberate: this
 * shape describes a JSON body that arrived over a network, and narrowing it to `"reading" |
 * "writing"` would be a claim about bytes nothing in the browser has checked. `presence.ts`
 * validates the numbers before any of it reaches a highlight.
 */
export interface DocumentFocusView {
  documentId: string;
  /** 1-based and inclusive at both ends. */
  from: number;
  to: number;
  kind?: string;
  /** The document version the range was measured against. Absent means the claim named none. */
  documentVersion?: number;
  /** When the claim itself was made — not when the agent was last active at all. */
  reportedAt?: string;
}

/** `AgentActivity`, `server/types/agent.ts`. Every field optional, by that type's own design. */
export interface AgentActivityView {
  command?: string;
  tool?: string;
  taskId?: string;
  latestFile?: string;
  /** Where in a design document this agent last claimed to be. Absent until it reports one. */
  documentFocus?: DocumentFocusView;
  blocker?: string;
  testsPassing?: number;
  testsTotal?: number;
  updatedAt?: string;
}

export interface AgentView {
  id: string;
  name: string;
  role: string;
  status: string;
  statusDetail?: string;
  activity?: AgentActivityView;
  currentTaskId?: string;
  costUsd?: number;
  budgetUsd?: number;
  acpSessionId?: string;
  /**
   * NOT SERVED YET. `CodingAgent` carries no capability set, so the card's "· base Grok" half is
   * absent on every real record today and is therefore not drawn. The request is filed in
   * loops/handoff/pivot-frontend.md; pivot/agents filed the server half in pivot-agents.md.
   */
  capabilities?: AgentCapabilities;
  /**
   * NOT SERVED YET. The relation is written onto the AREA (`WorkArea.ownerAgentId`) today, so the
   * board groups by that. When the mirror lands, `agentsInArea` reads it with no other change.
   */
  areaId?: string;
  /** What this agent is for, in the user's words. Composes into its session rules. */
  persona?: string;
}

export interface TaskView {
  id: string;
  objective: string;
  status: string;
  assignedAgentId?: string;
  requirementId?: string;
  milestoneId?: string;
  dependsOn: string[];
}

/** One entry of `GET /api/coding-agents/areas` — the record plus the status derived on read. */
export interface AreaView {
  id: string;
  projectId: string;
  name: string;
  /** One of AREA_COLOR_TOKENS, `server/services/workArea.ts`. A token name, never a colour. */
  colorToken?: string;
  /** The redundant non-colour signal that travels with the accent: ● ◆ ▲ ■ ◇ ○ ◼ ▼. */
  glyph?: string;
  briefSectionAnchor?: string;
  milestoneId?: string;
  rootPath?: string;
  ownerAgentId?: string;
  budgetUsd?: number;
  status?: string;
  statusPresentation?: { status: string; label: string; description?: string };
  tasksTotal?: number;
  tasksComplete?: number;
  /** Set when the area points at an agent that no longer exists. Said out loud, never swallowed. */
  unresolvedOwnerAgentId?: string;
}

export interface MilestoneView {
  id: string;
  name: string;
}

export interface ProjectView {
  /** Where the project's work happens. A hand-made area roots itself here. */
  repositoryPath?: string;
  id: string;
  name: string;
  goal?: string;
  budgetUsd?: number;
  tasks?: TaskView[];
  plan?: { id: string; state: string; milestones?: MilestoneView[] };
}

/**
 * The words for a status and for a capability set, as the SERVER spells them.
 *
 * `/api/coding-agents/statuses` and `/api/coding-agents/capabilities` publish both vocabularies
 * precisely so the UI never has to invent text for a colour. Both functions return `undefined`
 * rather than a guess when the vocabulary has not loaded or the record does not say — the caller
 * then falls back to the record's own status word, which is a value, not an invention.
 */
export interface AgentVocabulary {
  statusLabel(status: string): string | undefined;
  capabilityLabel(capabilities?: AgentCapabilities): string | undefined;
}

/** Knows nothing and says so. The default for any component rendered without a loaded vocabulary. */
export const NO_VOCABULARY: AgentVocabulary = {
  statusLabel: () => undefined,
  capabilityLabel: () => undefined,
};
