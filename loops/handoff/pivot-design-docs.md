# Handoff — pivot/design-docs

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — seeded requests (§0.1) and findings

Stage 1 of §3.11 landed: `server/services/designDoc.ts` plus two test files. Nothing outside §0 was
edited. The requests below are known before the wiring is written and are filed now so
reconciliation can apply them in one pass.

### R-1 · EVENTS · `server/services/controlRoomEvents.ts`

Three **additive** members on the `ControlRoomEvent` union (`:9-46`). Never a rename. Three
worktrees need members on this union; whoever edits it first makes the other two conflict, which is
why none of us edits it.

```ts
{ type: "designdoc_presence"; docId: string; agentId: string; areaId?: string;
  source: "derived" | "reported"; granularity: "section" | "lines";
  sectionAnchor?: string; ranges?: Array<{ from: number; to: number }>;
  mode: "reading" | "working"; documentVersion: number;
  reportedAt: string; expiresAt: string; note?: string }

{ type: "designdoc_changed"; docId: string; sectionAnchor?: string;
  version: number; byActorId: string }

{ type: "designdoc_declaration"; docId: string;
  state: "valid" | "invalid" | "applied"; errorCount: number }
```

Reason: the document view renders live presence and must not poll. `reportedAt` is deliberately not
`at` — everything rendered from this record is a past-tense claim about what an agent *said*, and
naming the field after the report is what stops the next person writing "is reading" in the label.

Not yet needed — no publisher exists until stage 6. File now, apply at reconciliation.

### R-2 · MCP · `server/services/projectMcpServer.ts`

One import and one call in the tool registration path:

```ts
import { registerDesignDocTools } from "./designDoc";
registerDesignDocTools(server, ctx);
```

Registers `read_design_document`, `report_document_focus`, `list_design_documents`. Also append
those three names to `PROJECT_MCP_TOOLS` (`:706`).

`registerDesignDocTools` is **not yet exported** — stages 5-7. The signature is fixed now so the
one-line call can be written without waiting: `registerDesignDocTools(server: McpServer, ctx:
ProjectMcpContext): void`.

### R-3 · MCP · `server/services/projectMcpServer.ts:245`

`submit_design_suggestion` gains three **optional** fields: `targetDocId`, `targetSectionAnchor`,
`lineRange {from, to}`. Additive; every existing caller stays valid.

Reason: the suggestion mechanism is the best-preserved thing in the repository — `DesignSuggestion`
(`server/types/project.ts:95-118`) with `baseVersion`/`stale`, and accept/edit/reject/request-revision
in `ReviewQueues.tsx`. This worktree reuses it and does **not** build a second suggestion system.
Three optional fields are the entire change.

### R-4 · RULES · `server/services/acpSessionManager.ts`

`rulesFor()` (`:104`) appends `designDocBriefing({ docs, areaId })`, exported from
`server/services/designDoc.ts`. One import, one concatenation.

Reason: `server/services/taskBriefing.ts:1-15` records why a briefing must exist on day one — before
it, launching an agent opened a session, said nothing, and the agent sat idle. The presence cadence
reaches the agent through here or it reaches it nowhere.

Signature: `designDocBriefing(input: { docs: Array<{ id: string; title: string }>; areaId?: string }): string`.
Not yet exported — stage 7.

### R-5 · TYPES · `server/types/designDoc.ts`

Move the types currently exported from `server/services/designDoc.ts`, unchanged in shape. They live
in the service only because `server/types/*.ts` is hot; the move is a rename.

**Exported as of this iteration** (real, in the tree now):

```ts
DocSectionVersion { version, body, createdAt, authorId, changeSummary?, fromSuggestionId? }
DocSection        { anchor, index, title, areaId?, body, currentVersion, versions, firstLine }
DesignDoc         { id, title, followedByProjectId?, sections, manifestVersion, createdAt, updatedAt }
class DesignDocStore
function renderDocument(doc): string
```

Still to come: `ProjectDeclaration`, `DeclarationError`, `DocumentPresence`, `PresenceState`,
`PresenceStats`, `DocumentAlreadyFollowedError`.

`VersionConflictError` and `NotFoundError` are **imported from `server/services/projectStore.ts`**
and reused unchanged — no second error taxonomy.

### R-6 · CLIENT · `client/src/control-room/ControlRoomApp.tsx`

One import, one page entry:

```ts
import { DesignDocumentsPage } from "./designdoc";
```

Props are `{ projectId }` and nothing else; the page owns everything below it. Not yet exported —
stage 11.

### R-7 · CLIENT · `client/src/control-room/useControlRoom.ts`

Export a `subscribeControlRoom(projectId, fn)` seam so the design-document page can share the
existing socket instead of opening a second one.

Until this exists, `client/src/control-room/designdoc/useDesignDocs.ts` will open its own
subscription to `/ws/control-room?projectId=`. That is a second WebSocket per project, and it is the
honest cost of not touching the hot file — recorded here so reconciliation collapses the two rather
than discovering them.

### R-8 · HOT · `server/services/projectStore.ts` — `deleteProject` must unfollow

`deleteProject` (`:261`) deletes the project file and its message archive. It must also clear the
follow link from every design document that project followed:

```ts
import { getDesignDocStore } from "./designDoc";   // or inject, if a global is unwelcome
// inside deleteProject, before or after the unlinkSync calls:
getDesignDocStore().unfollowProject(projectId);
```

`unfollowProject(projectId): DesignDoc[]` exists, is synchronous, and is tested — it clears
`followedByProjectId` on every document following the project and **deletes none of them**.

Reason: **a design document outlives its project.** The document is where the next project comes
from, and a user who deletes a failed project and loses the brief they spent an hour writing does
not open the product again. Without this call, deleting a project leaves every document it followed
carrying a dangling `followedByProjectId`, which then refuses to be followed by anything else with
`DocumentAlreadyFollowedError` naming a project that no longer exists.

This is the one clause keeping **DD-003 held rather than passed**; see `VERIFICATION.md`.

Note: `designDoc.ts` currently exports the `DesignDocStore` class but no accessor. Reconciliation
should decide whether to add `getDesignDocStore()` alongside the other service singletons or to
inject the store into `ProjectStore`; this worktree did not pick, because the choice belongs to
whoever owns the composition root.

---

## Findings — raised, not fixed

### F-1 · `server/routes/projectReads.test.ts` — three tests fail under parallel load

**Not mine, not edited.** Reported per §7 rather than fixed, because the file belongs to no row of
the partition I own.

Observed at the start of this iteration, on a clean tree at `7f0f011` with nothing of mine in it:

```text
(fail) launching gives the agent an isolated worktree (§9, V-009)
         > an agent with no worktree gets one in the project's repository   [5132ms, timed out at 5000ms]
(fail) launching gives the agent an isolated worktree (§9, V-009)
         > the worktree is on its own branch, leaving the base branch alone [5170ms, timed out at 5000ms]
(fail) a second task must not reuse the merged branch of the first
         > relaunching the SAME task reuses its worktree rather than making another [5171ms, timed out]
```

Diagnosis — it is a timeout, not a regression:

```text
bun test server/routes/projectReads.test.ts                 → 38 pass, 3 fail  (default 5s timeout)
bun test --timeout 60000 server/routes/projectReads.test.ts → 41 pass, 0 fail  exit 0
```

Machine state at the time: **load average 72 on 8 cores**, five sibling `grok` processes at 60-75%
CPU each. The test process was getting 20-24% CPU. These three tests spawn a git worktree and open
an ACP session inside a 5-second budget, and under nine-worktree parallelism they lose that race.
A later full run of `bun run verify` — at load 117 — passed all three, which confirms flakiness
rather than failure.

Proposal for reconciliation, for whoever owns `01-agents`: raise the timeout on these tests to 30s,
or gate them behind a serial lane. Do not "fix" the launch path; there is nothing wrong with it.
**No iteration of this worktree has touched the file.**

**Escalated, iteration 2 — this now fails the gate on every full run.** The blast radius grew from
3 tests to 5, and it no longer clears on a re-run:

```text
iteration 1, load 117 → 3 fail, then a re-run passed
iteration 2, load 117 → 5 fail
iteration 2, load  50 → 5 fail   (same five, all at ~5.14s against the 5000ms default)
```

The five are `an agent with no worktree gets one…`, `the worktree is on its own branch…`,
`an existing worktree is reused…`, `launching another task gives the agent a fresh worktree…`,
and `relaunching the SAME task reuses its worktree…`. All in `server/routes/projectReads.test.ts`;
that file still passes 41/41 at `--timeout 60000`.

Consequence for reconciliation: `bun run verify` cannot be green on this machine while nine
worktrees run in parallel, so no worktree can satisfy "the gate must be green before you record
anything" (§4 step 7). This worktree recorded its evidence with the gate state disclosed at the top
of its ledger section rather than either overclaiming or reporting nothing. **Whoever owns
`01-agents` should treat this as the first thing to fix at reconciliation** — every sibling
worktree is hitting it.

### F-2 · Partition gap · `VERIFICATION.md` is owned by nobody and written by everybody

§4 step 8 instructs this worktree to "Record evidence in `VERIFICATION.md`". The same instruction
appears in every sibling loop document, and `VERIFICATION.md` appears in no worktree's ownership
list and on no hot-file list. Nine branches appending to one 5,400-line file is precisely the
eight-way conflict the hot-file protocol exists to prevent.

What this worktree did, deliberately: appended one clearly-delimited section at the **end** of the
file, under a heading naming the branch, and edited nothing above it. Conflicts should therefore be
additive and mechanically resolvable. Recorded so reconciliation knows it was a decision, not an
oversight.

Proposal: either give each worktree `VERIFICATION-<surface>.md`, or add `VERIFICATION.md` to the
hot list with an append-only exemption. The owner's call.

### R-9 · HOT · `server/services/projectStore.ts:324-329` — scope the sweep to the section

`updateDocument`'s stale sweep is document-wide:

```ts
for (const suggestion of project.suggestions) {
  if (suggestion.state === "pending" && suggestion.baseVersion < version) suggestion.state = "stale";
}
```

For suggestions that target a design-document **section**, delegate instead:

```ts
import { sweepStaleSuggestions } from "./designDoc";
// where a design-doc section write is what moved:
sweepStaleSuggestions(project.suggestions, { docId, sectionAnchor, newVersion });
```

`sweepStaleSuggestions(suggestions, { docId, sectionAnchor, newVersion })` is exported, pure, and
unit-proven. It marks a pending suggestion stale only when it targets that document AND that
section AND was written against an older version, returns the ones it changed, and deliberately
ignores suggestions carrying no `targetDocId` — those stay with the existing document-wide path.

Reason: document-wide staleness is why two agents proposing against two different parts of one
document invalidate each other on every write. Scoping the sweep is the other half of versioning per
section; without it, per-section versions buy nothing.

Depends on R-3 (the three optional target fields), because until those exist no suggestion can name
a section. Together these are the one clause keeping **DD-007 held rather than passed**.

### F-6 · Four checklist items cannot reach PASS before reconciliation

Not a complaint — a scheduling fact the owner should have, because §8 defines this surface as done
only when all seventeen items read PASS.

```text
DD-003  needs ProjectStore.deleteProject to call unfollowProject      hot        R-8
DD-005  needs the agent↔area binding in workArea.ts                   01-agents  F-4
DD-007  needs the section sweep invoked from projectStore's sweep     hot        R-3 + R-9
DD-017  needs assetStore's persist path                               02-assets  X-3
```

Every one has its logic built and unit-proven in this worktree, and every one is a single wiring
edit away. None can be closed from inside the boundary, so **this loop cannot honestly output "The
design document surface is complete: YES" before the reconciliation pass runs** — regardless of how
many iterations it is given. Four items will sit at "held, one clause short" until then.

Recommendation: run the reconciliation pass for R-1…R-9 earlier than the end, or accept that these
four close in a verification pass after the merge rather than during the loop.

### F-4 · DD-005 is blocked on `01-agents`' area model, which does not exist yet

Iteration 3 built the declaration parser (DD-004 PASS). The apply half — DD-005 — cannot be
finished here, and this is a dependency, not an omission.

`DD-005` requires: "removing an area that has an agent bound to it is refused, and the refusal names
the agent." That needs the agent↔area binding, which §0 assigns to `server/services/workArea.ts`
(01-agents). In this worktree:

```text
ls server/services/workArea.ts → No such file or directory
```

Building a second area model here to satisfy the clause is exactly the duplication the partition
exists to prevent, so DD-005 is held with the blocking clause named in `VERIFICATION.md`.

**What 01-agents should know.** The declaration block is the input to team assembly, and this is the
shape the apply path will hand over — an ordered list, names as the user typed them:

```ts
ProjectDeclaration {
  name: string
  category: "documents" | "slides" | "tables" | "workflows" | "software"
  budget?: number
  areas: Array<{ name: string; description?: string; line: number }>   // may be EMPTY
  blockStart: number; blockEnd: number                                  // rendered-doc lines
}
```

Two things this worktree needs back, whenever 01-agents is ready — neither is urgent:

1. a way to ask **which agents are bound to an area**, so the apply path can refuse to remove an
   occupied one and name the agent in the refusal;
2. confirmation that an area's identity is a stable stored `id` with a `colour`, not a name. Area
   **names** come from the user's prose in the declaration block, and a name is not a lookup key —
   the retired product stored four unowned tasks by matching a model's phrasing of a role with
   `===` (iteration 81). If areas are keyed by name, renaming a heading in the block silently
   re-homes agents.

**`areas: []` is legal** and means one implicit area covering the whole document (§3.4). Assembly
must handle the empty list rather than treating it as "not declared".

### F-5 · A probe that never ran reported success

Recorded because it is the exact failure mode `loopdesign.md` warns about, caught here in miniature.

While proving the declaration fuzz test could fail, the first mutation — injecting a `throw` into
`parseDeclaration` — was applied with a `perl -0pi` multiline substitution that **did not match**.
Nothing was mutated, the suite reported `18 pass`, and that reads exactly like "the fuzz harness
tolerates a throwing parser". It was caught only because the script also ran `grep -c` for the
injected text, which returned `0`.

Redone with an edit that verifiably applied, the fuzz harness did catch the throw and printed both
offending inputs with their error text.

Lesson for every worktree, worth repeating at reconciliation: **assert that the probe applied before
believing the probe's result.** A mutation-based control that silently no-ops is indistinguishable
from a passing test.

### F-3 · Test files beside an owned service are not named in §0

§0 grants `server/services/designDoc.ts` but does not mention test files. §4 steps 6-7 require
tests, and §3.2 requires an invariant test "mirroring `projectStoreInvariants.test.ts`". This
worktree created `server/services/designDoc.test.ts` and
`server/services/designDocInvariants.test.ts`, on the reading that a test beside an owned service is
part of that service. No sibling worktree can want those paths. Noted rather than assumed silently.

(The sibling document `loops/02-assets.md` §0 grants its own test files explicitly. The omission
here looks like drift between the two documents, not intent.)
