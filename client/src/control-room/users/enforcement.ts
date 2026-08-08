/**
 * What this page shows that the product does not yet enforce — loops/08-users-and-x.md §3.1.
 *
 * Read §3.1 before reading anything else here. The product has no authentication. Not weak, not
 * partial, not dev-mode: absent. `server/index.ts:72-76` says so in its own comments, and
 * `actorFrom` (`server/routes/projects.ts:39-51`) resolves a request carrying no headers to
 * `{kind:"user", id:"user"}` — fully privileged. **Sending nothing is the maximum-privilege
 * request.**
 *
 * A table of people with roles, sitting on top of that, is furniture. §3.1 is blunt about it:
 * shipping a users page over this is theatre, and `verifiables.md` §22.18 prohibits a control that
 * does nothing outright.
 *
 * This module is how the page ships anyway without lying. Every row below is one assumption the
 * wireframe makes, what actually exists instead, and the file and line where anybody can check.
 * The page renders these rows; it does not paraphrase them. That has two consequences worth
 * stating:
 *
 *   - a reader of the running product learns the same thing a reader of this file learns. There is
 *     no gap between what the screen implies and what the repository contains;
 *   - when a gap closes, the row is deleted here and the screen stops claiming it. The statement
 *     cannot drift from the code without somebody deleting a line that names the code.
 *
 * The device the page uses for an affordance that does not work is NOT a disabled button. §3.15
 * and §22.18 both rule that out — a greyed control with a tooltip is still a control that does
 * nothing. Where the wireframe draws a dead button, this page draws a statement of what would be
 * there and which loop builds it. See `NotBuilt.tsx`.
 */

export type GapArea = "identity" | "roles" | "capabilities" | "budget" | "invites" | "approval";

export interface Gap {
  id: string;
  area: GapArea;
  /** What the wireframe — or any reasonable reader of the screen — would assume is true. */
  assumed: string;
  /** What is actually the case, in plain language. */
  actual: string;
  /** Where to check. A claim about this repository that names no line is not a claim. */
  evidence: string;
  /** Which stage of §3.16, or which sibling loop, closes it. */
  closedBy: string;
}

/**
 * The register. Ordered by how much damage the assumption does if a reader believes it.
 *
 * The first two are the ones that matter: without identity, every row below them is decoration on
 * decoration.
 */
export const GAPS: Gap[] = [
  {
    id: "no-authentication",
    area: "identity",
    assumed: "People sign in, and the product knows which of them is looking at it.",
    actual:
      "Nobody signs in. There is no user record, no credential, no session and no sign-in " +
      "anywhere in the repository. Every request is already the fully privileged user, and a " +
      "request that sends no headers at all is the most privileged one.",
    evidence: "server/index.ts:72-76 · server/routes/projects.ts:39-51",
    closedBy: "loop 08 stages 1–2 — the User record, the session, and the actorFrom inversion",
  },
  {
    id: "roles-not-gated",
    area: "roles",
    assumed: "A role decides what a person may do, and a member cannot approve.",
    actual:
      "No request carries a person, so no role can be checked. The role on each row is a note " +
      "somebody wrote down, not a rule the server applies.",
    evidence: "there is no assertRoleAllows() in server/ — the function is stage 3, unwritten",
    closedBy: "loop 08 stage 3 — one role gate every route is made to pass through",
  },
  {
    id: "capabilities-not-gated",
    area: "capabilities",
    assumed:
      "A person can only create an agent with capabilities they hold, and raising a grant needs " +
      "an approval.",
    actual:
      "Agent creation checks nothing about who is asking. The grant below is the design of the " +
      "control, recorded ahead of the code that will read it.",
    evidence: "server/services/approvals.ts:133,225 — ApprovalQueue has zero production callers",
    closedBy: "loop 08 stage 5 — assertCanGrant(), refusing server-side and naming what is missing",
  },
  {
    id: "spend-not-measured",
    area: "budget",
    assumed: "The product knows what each person has spent, so a cap can be checked against it.",
    actual:
      "Spend is not measured. The rate table holds gpt-4o, gpt-4o-mini and gpt-4.1 and no Grok " +
      "model, so an unknown model prices at zero with no rate key, and there is no ledger behind " +
      "it — only a running total on each agent. A cap over a meter reading zero never trips, so " +
      "this page shows no spend figure at all rather than a plausible $0.00.",
    evidence:
      "server/services/usageAccounting.ts:31-35 and :79 · server/services/agentRegistry.ts:359",
    closedBy: "06-tools-cost, COST-004…006 — the ledger and a media rate table. USR-009 is BLOCKED on it",
  },
  {
    id: "no-user-budget-scope",
    area: "budget",
    assumed: "A per-person cap stops that person's agents when it is reached.",
    actual:
      "Budgets are enforced at three scopes — agent, task and project — and `user` is not one of " +
      "them. The cap on each row is stored intent; nothing reads it yet, so nothing stops.",
    evidence:
      "server/services/agentRegistry.ts:17-26,34 · server/services/controlRoomEvents.ts:28-35",
    closedBy: "loop 08 stage 6 — `user` added as a fourth scope, once the ledger exists to feed it",
  },
  {
    id: "no-invites",
    area: "invites",
    assumed: "Somebody can be invited by email and appears here as pending until they accept.",
    actual:
      "There is no invite record, no delivery, no acceptance and no credential for the invited " +
      "person to hold. An invite is a promise about a sign-in that does not exist.",
    evidence: "no invite type, table or endpoint exists in server/",
    closedBy:
      "nothing in this checklist. Invites need §3.2's credential first, and USERS is a secondary " +
      "surface that merges last",
  },
  {
    id: "approval-queue-dead",
    area: "approval",
    assumed: "A request for more capability or a higher budget waits for a named approver.",
    actual:
      "The queue exists and is tested, and nothing in the running product calls it. Its " +
      "`resolvedBy` has never held a user id because there are no user ids.",
    evidence: "server/services/approvals.ts:9-24,133,225",
    closedBy: "loop 08 stages 3–4 — the queue wired, the approver taken from the session",
  },
  {
    id: "self-approval",
    area: "approval",
    assumed: "Somebody else reviews what you ask for.",
    actual:
      "In a one-person workspace there is no second pair of eyes, and the product will not " +
      "fabricate one. When approval exists it will say 'you are approving your own request' out " +
      "loud and record selfApproved on the record.",
    evidence: "loops/08-users-and-x.md §3.4",
    closedBy: "loop 08 stage 3",
  },
];

/**
 * The wireframe scopes people to a project — "People on this project", a project cap that the
 * per-person caps are measured against. §3.2's `User` is a workspace record.
 *
 * Kept separate from GAPS because it is a disagreement between two documents rather than a hole in
 * the code, and it is the owner's to settle. The page states the reading it took.
 */
export const SCOPE_NOTE =
  "People belong to the workspace, not to one project — that is the record §3.2 describes. " +
  "The wireframe scopes them to a project and measures each cap against a project cap; if that " +
  "is the intent, the record gains a project id and this page gains a filter.";

/** One line for the banner. Deliberately not softened, and deliberately not dismissible. */
export const BANNER_HEADLINE = "Nothing on this page is enforced yet";

export const BANNER_BODY =
  "Nobody signs in, so no request carries a person and no rule here can be applied. Everything " +
  "below is written down and shown — it is the design of the controls, recorded before the code " +
  "that will read them.";
