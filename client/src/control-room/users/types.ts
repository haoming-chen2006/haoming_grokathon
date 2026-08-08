/**
 * The client's view of a person — loops/08-users-and-x.md §3.2, §3.4, §3.5.
 *
 * These mirror the records that `server/services/auth.ts` will export (`User`, `Role`,
 * `CapabilityGrant`). They are declared here rather than imported because that module does not
 * exist yet: stage 1 of §3.16 builds it, and this page is stage 7. When it lands, this file
 * becomes a re-export and every field name below has to match it exactly — which is why the names
 * are the loop document's, not the wireframe's.
 *
 * Two shapes deliberately absent, because inventing them here would make them harder to get right
 * later:
 *
 *   - there is no `Session` and no `currentUser`. Nothing in this product knows who is looking at
 *     it (§3.1), so the page has no viewer to reason about and does not pretend to have one. It
 *     renders the same for everybody because it *is* the same for everybody.
 *   - there is no `invitedAt` / `acceptedAt`. An invite needs a credential, a delivery mechanism
 *     and an acceptance, and none of the three exist. The wireframe draws a pending invite; see
 *     `enforcement.ts` for why this page states that gap instead of rendering it.
 */

/**
 * Three roles, each a superset of the one below (§3.4).
 *
 * The wireframe names three different ones — Owner / User / Guest — and models approval as a
 * capability toggle rather than as a rank. That disagreement is recorded in `enforcement.ts` and
 * in the handoff; the loop document wins here because it is the contract this surface is built
 * against, and because "approver" is the word the merge gate and the approval queue already need.
 */
export type Role = "owner" | "approver" | "member";

export const ROLES: Role[] = ["owner", "approver", "member"];

/**
 * What a person may hand to an agent they create (§3.5).
 *
 * Not what an agent holds — 01-agents owns that, and its `AgentCapabilities` is `{images, voice}`.
 * A grant is what a *person* may hand out; an agent capability is what an *agent* holds. The
 * mapping between the two belongs in `server/services/auth.ts` and is flagged in the handoff,
 * because two structures that nearly match are how a field ends up meaning two things.
 */
export interface CapabilityGrant {
  /** /v1/images/* */
  images: boolean;
  /** /v1/videos/* — the expensive one, separable from images on purpose. */
  video: boolean;
  /** /v1/tts, /v1/stt, /v1/realtime */
  voice: boolean;
  /** §3.12. Owner and approver only by default. */
  publishToX: boolean;
}

export interface WorkspaceUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  capabilities: CapabilityGrant;
  /**
   * The monthly cap in dollars, or undefined for no cap.
   *
   * A cap is a number a human writes down. It is NOT a number the product can currently act on:
   * `BudgetSnapshot` (`server/services/agentRegistry.ts:34`) has three scopes — agent, task,
   * project — and no user scope, and the meter that would feed one reads zero for every Grok model
   * (§3.6). The page says both of those things on screen rather than drawing a meter that moves.
   */
  budgetUsd?: number;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Sole owner, per §3.4: there is exactly one, and it cannot be removed or demoted. */
export const isSoleOwner = (user: WorkspaceUser, all: WorkspaceUser[]): boolean =>
  user.role === "owner" && all.filter((u) => u.role === "owner").length === 1;
