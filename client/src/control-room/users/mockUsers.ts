/**
 * FIXTURE DATA. There is no user service — loops/08-users-and-x.md §3.2.
 *
 * `server/services/auth.ts` and `server/routes/users.ts` are stage 1 and stage 2 of §3.16 and
 * neither is written. This page is stage 7, being built first so the shape of the surface is
 * settled before the record that feeds it is; the four people below are how it is looked at.
 *
 * They are labelled as invented ON SCREEN, not only here. `verifiables.md` §22.18 prohibits
 * fabricated status, and a table of plausible names with no marking is exactly that — the reader
 * has no way to tell a fixture from a workspace with four real people in it. `usersStore.ts`
 * carries the `SOURCE` marker the page renders.
 *
 * Every address is under `.example`, which RFC 2606 reserves and which therefore cannot belong to
 * a real person. That is deliberate: an invented user with a real-looking domain is one
 * copy-and-paste away from a message to a stranger.
 *
 * The one thing NOT invented here is spend. Every other column is made up and says so; a spend
 * figure would be made up and would be *believed*, because it is the number a reader assumes came
 * from a meter. See `enforcement.ts`, gap `spend-not-measured`.
 */
import type { WorkspaceUser } from "./types";

const AT = "2026-06-12T09:00:00.000Z";

export const MOCK_USERS: WorkspaceUser[] = [
  {
    id: "usr_dana",
    email: "dana@aeris.example",
    displayName: "Dana Whitfield",
    role: "owner",
    capabilities: { images: true, video: true, voice: true, publishToX: true },
    // No cap on the owner: §3.4 gives them everything below them, and a cap the same person can
    // raise is a note to self rather than a control. Rendered as "no cap", never as $0.
    budgetUsd: undefined,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "usr_priya",
    email: "priya@aeris.example",
    displayName: "Priya Nandi",
    role: "approver",
    capabilities: { images: true, video: false, voice: true, publishToX: true },
    budgetUsd: 200,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "usr_marco",
    email: "marco@aeris.example",
    displayName: "Marco Reyes",
    role: "member",
    // The case the capability argument exists for: images but not video. Marco cannot create an
    // agent that runs up $0.050 a second, and that holds whether or not the meter works.
    capabilities: { images: true, video: false, voice: false, publishToX: false },
    budgetUsd: 50,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "usr_tom",
    email: "tom@aeris.example",
    displayName: "Tom Okafor",
    role: "member",
    capabilities: { images: false, video: false, voice: false, publishToX: false },
    budgetUsd: undefined,
    // Disabled, not deleted (§3.8). A removed person's approvals and published posts have to stay
    // attributable; deleting the principal orphans the record, and deletion is a stop-and-ask.
    disabled: true,
    createdAt: AT,
    updatedAt: AT,
  },
];
