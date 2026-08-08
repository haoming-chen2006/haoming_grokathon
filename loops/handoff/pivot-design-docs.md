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

Proposal for reconciliation, for whoever owns `01-agents`: raise the timeout on these three tests
to 30s, or gate them behind a serial lane. Do not "fix" the launch path; there is nothing wrong
with it. **This iteration did not touch the file.**

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

### F-3 · Test files beside an owned service are not named in §0

§0 grants `server/services/designDoc.ts` but does not mention test files. §4 steps 6-7 require
tests, and §3.2 requires an invariant test "mirroring `projectStoreInvariants.test.ts`". This
worktree created `server/services/designDoc.test.ts` and
`server/services/designDocInvariants.test.ts`, on the reading that a test beside an owned service is
part of that service. No sibling worktree can want those paths. Noted rather than assumed silently.

(The sibling document `loops/02-assets.md` §0 grants its own test files explicitly. The omission
here looks like drift between the two documents, not intent.)
