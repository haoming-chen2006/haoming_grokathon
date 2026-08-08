# Handoff — pivot/users-x

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — the USERS page renders

Branch rebased onto `grok-control-room`. Three commits, tree clean, `bun run typecheck` and
`bun run build` both green. **No tests were written this iteration and the commits say so** — the
instruction was a page that renders before the deadline, and the page renders.

What shipped:

```text
client/src/control-room/users/**        the page: three slots, mock data, the honesty register
client/src/control-room/shell/pages.ts  ONE LINE — the mount (see R-1 below)
```

Not shipped, and not started: `server/services/auth.ts`, `server/routes/users.ts`,
`server/services/x/**`, the X page. Stages 1–6 and 8–14 of §3.16 are untouched. This is stage 7
built ahead of the six stages beneath it, deliberately and on instruction.

---

## R-1 · `client/src/control-room/shell/pages.ts` — APPLIED, not requested

07-shell's file, and its own header reserves this edit for reconciliation. **This iteration made
it**, because the instruction for the iteration was to replace the `NotMergedYet` placeholder
holding the `users` slot. Flagging it here so 07-shell sees it rather than discovers it.

```diff
+import { USERS_PAGE_SLOTS } from "../users";
+
   { id: "designdocs", ... },
-  { id: "users", label: "Users", segment: "users", rank: "secondary", builtBy: "08-users-x" },
+  { id: "users", label: "Users", segment: "users", rank: "secondary", builtBy: "08-users-x", ...USERS_PAGE_SLOTS },
```

The row keeps its id, label, segment and rank — those are the shell's — and gains only the three
components. `USERS_PAGE_SLOTS` is `Pick<PageDescriptor, "main" | "navigator" | "inspector">`, which
is what keeps this to one line and one import. The `x` row is untouched: §3.15 requires the X page
to be **absent** when there are no credentials, and there are none.

---

## R-2 · `client/src/control-room/shell/WorkspaceShell.tsx` — a hazard, for 07-shell to judge

Not a request to change anything today. A page's slots are invoked as plain functions —
`component(props)` in `Slot`, and `page.navigator(pageProps)` directly in the shell's own body. A
slot that calls a hook therefore has its hooks counted against the **caller's** fiber, so switching
between two pages whose slots use different numbers of hooks changes the shell's hook count between
renders, which React treats as an error.

This page works around it: every exported slot is `(props) => <Inner {...props} />`, so the hooks
land on `Inner`'s own fiber. That workaround is invisible, and the other four pages have no reason
to know they need it. Either render slots as elements (`<Component {...props} />`) in
`WorkspaceShell`, or say so in `contract.ts`. 07-shell's call.

---

## R-3 · `client/src/control-room/shell/workspaceShell.test.tsx` — APPLIED, needs 07-shell's eye

Mounting the page turned two of 07-shell's tests red. Neither is about the shell; both assert that
**nothing has merged**, which was true when they were written and is a fact about the calendar.
Fixed rather than left red — a branch handed to reconciliation red is worse — but they are 07's
tests and 07 should agree with the fix.

1. **"every slot says which branch builds it"** iterated all five `PAGES` expecting
   `not-merged-yet` on each. Narrowed to `PAGES.filter(p => !p.main)`, since the rule is that an
   *unmerged* page is stated rather than faked. Added the counterpart it needs to keep meaning
   anything — **a merged page renders itself and the notice is gone rather than behind it** —
   because otherwise deleting `NotMergedYet` outright would leave the suite green.
2. **the inspector test** asserted `PAGES.every(p => p.inspector === undefined)`. Its own comment,
   two lines above, predicts this break and asks for the assertion to be scoped to the page under
   test; it now checks only `DEFAULT_PAGE`'s row, leaving the two DOM assertions beneath it intact.

A third test, "the shell imports no sibling page module", still passes — its regex looks for
`from "../users/…` with a trailing slash and the mount imports `from "../users"`. That is luck, not
design: SHELL-017's intent is that the shell builds with nothing merged, and the registry is
precisely where that import is meant to land. Worth 07-shell restating the rule as "no shell file
except `pages.ts`".

Full suite after the fix: **1391 pass, 0 fail** across 72 files.

---

## R-4 · Still owed, and unchanged from §8 of the loop document

None of these were needed to render the page, and all of them are needed before anything on it is
true. Listed so they are not lost:

```text
server/routes/projects.ts             actorFrom → currentUser(c); no default actor; 401 otherwise
server/routes/mcp.ts                  per-session bearer secret alongside the URL identity
server/routes/repository.ts           merge approver from the session; 400 on a body-supplied one
server/services/approvals.ts          ApprovalQueue wired; resolvedBy a real user id  ← CLAIMED by
                                      this loop, per §0. 01-agents should not wire it independently
server/services/controlRoomEvents.ts  budget scope gains "user" — a WIDENING of an existing member
server/services/testSupport.ts        withSession(fixture) — every route test needs it the day the
                                      inversion lands. §8 says ship this FIRST; it is not shipped
server/routes/api.ts                  apiRoutes.route("/users", userRoutes)
server/index.ts                       app.use("*", requireSession) — one line, after CORS
server/types/project.ts               re-export User, Role, CapabilityGrant, Session, SessionUser
```

---

## What the page assumes about other worktrees

* **06-tools-cost.** The page renders no spend figure anywhere — not `$0.00`, not a percentage, not
  a filled meter. When COST-004…006 land, `UnmeasuredSpend` in `client/src/control-room/users/ui.tsx`
  is the single component to replace, and `enforcement.ts`'s `spend-not-measured` row is the line to
  delete. Two edits, both grep-able.
* **01-agents.** `CapabilityGrant {images, video, voice, publishToX}` is what a *person* may hand
  out. 01's `AgentCapabilities {images, voice}` is what an *agent* holds. They are not the same
  structure and must not be merged into one. The mapping belongs in `server/services/auth.ts`,
  which does not exist yet — **this is the field most likely to end up meaning two things**, and
  nobody has written the mapping down yet.
* **07-shell.** Selection is `selectionId` in the URL, owned by the shell. The page keeps no copy.
  Page state that two regions share lives in a module store (`usersStore.ts`) because the contract
  gives a page three sibling slots and no way to wrap them in a provider — worth stating in
  `contract.ts` if other pages hit it.

---

## THE REPORT ASKED FOR: every place the design assumes an identity model that does not exist

The reference at `/Users/haoming/openui/users-page.html` was read in full. It is a good design for a
product that has authentication. This one has none — not weak, not partial, not dev-mode: absent.
`server/index.ts:72-76` says so in its own comments, and `actorFrom` (`server/routes/projects.ts:39-51`)
resolves a request carrying no headers to `{kind:"user", id:"user"}`, fully privileged. **Sending
nothing is the maximum-privilege request.**

Eleven places, and what the page did about each. The first eight are in
`client/src/control-room/users/enforcement.ts` as data, rendered on screen behind "What this means",
so a reader of the running product learns the same thing a reader of this file does:

| # | The design assumes | What exists | On the page |
|---|---|---|---|
| 1 | People sign in; the product knows who is looking | Nobody signs in. No user record, no credential, no session, no sign-in anywhere in the repo | Permanent, undismissable banner |
| 2 | A role decides what somebody may do | No request carries a person, so no role can be checked. `assertRoleAllows` does not exist | Register row; role is editable and labelled as a note, not a rule |
| 3 | A capability grant is enforced at agent creation | Agent creation checks nothing about who is asking | Register row; the grant is presented as the design of the control |
| 4 | Spend per person is known | Not measured. `usageAccounting.ts:31-35` has no Grok model; `:79` returns `costUsd 0, rateKey null`; there is no ledger, only `agentRegistry.ts:359`'s running total | **No figure at all.** A hatched bar reading "spend not measured" |
| 5 | A per-person cap stops that person | `BudgetSnapshot` scopes are agent, task, project. `user` is not one | Cap is editable and stated as stored intent nothing reads |
| 6 | Somebody can be invited and shows as pending | No invite record, delivery, acceptance or credential | The pending-invite ROW WAS REMOVED. "Invite someone" is a `NotBuilt` statement, not a button |
| 7 | A request waits for a named approver | `approvals.ts:133,225` — `ApprovalQueue` has zero production callers | "Waiting on approval" is a `NotBuilt` statement |
| 8 | Somebody else reviews what you ask for | In a one-person workspace there is no second pair of eyes | Stated; §3.4's `selfApproved` recorded as the intended answer |
| 9 | People belong to a project ("People on this project", a project cap the per-person caps sit under) | §3.2's `User` is a **workspace** record | Page says "People in this workspace"; the disagreement is stated on screen and is **the owner's to settle** |
| 10 | Roles are Owner / User / Guest, with approval on a switch | §3.4 says owner / approver / member, with approval as a **rank** | Built §3.4's three. A read-only guest has no equivalent and needs a sign-in first. Stated in the inspector |
| 11 | "Remove from project" | Removing a principal orphans every approval and published post it authorised | `NotBuilt`. §3.8: Disable, not Delete. §7: deletion is stop-and-ask |

**The device used throughout is not a disabled button.** `verifiables.md` §22.18 prohibits a control
that does nothing, and §3.15 closes the obvious loophole — greyed, with a tooltip, is still a control
that does nothing. Where the wireframe draws a dead affordance the page draws a statement of what
would be there and what has to exist first (`NotBuilt.tsx`). It has no `onClick`, is not focusable,
and when the thing is built somebody has to delete it, which is a real edit and not a flag that
quietly flips.

**What IS interactive:** the role select, the four capability switches, the budget cap field, the
disable toggle, search and the role filter. They change the row in front of you and nothing else,
and the panel says so in as many words — "changes here apply as you make them, to this browser tab;
there is no `/api/users` to save them to yet; nothing on this panel changes what anybody is
permitted to do". That is a control doing exactly what it claims, which is a different thing from a
control that does nothing.

### The one thing to argue with

Per §3.1, the honest position is that this page should not have been built before the middleware
underneath it. It was built first on instruction, and the banner is the compensation, not a fix.
The order in §3.16 has not changed and stages 1–6 are still the work that makes any of this true.

---

## Mock data — one module, obvious, trivial to delete

```text
client/src/control-room/users/mockUsers.ts   four invented people. Every address is under
                                             .example (RFC 2606), so none can reach anybody real
client/src/control-room/users/usersStore.ts  SOURCE = "fixture" and SOURCE_NOTE, rendered on the
                                             page. Flip to "server" and the notice goes with it
```

Deleting the fixture is: point `usersStore`'s initial state at `GET /api/users`, set `SOURCE`, and
delete `mockUsers.ts`. Nothing else imports it.

The one column that is **not** mocked is spend, and that is the point: every other column is
invented and says so, whereas an invented spend figure would be *believed*, because it is the number
a reader assumes came from a meter.

---

## How to look at it

The page is mounted, so `/users` on the running server shows it once this branch is merged. Before
that, from this worktree:

```bash
bun run --cwd client dev
open 'http://localhost:6969/src/control-room/users/preview/index.html?theme=dark&person=usr_marco'
```

`client/src/control-room/users/preview/` is a harness inside this loop's own directory that does at
run time what R-1 does at build time. Both palettes were checked this way — GrokNight and GrokDay,
with a person selected. There is no `text-white/NN` anywhere in the directory.
