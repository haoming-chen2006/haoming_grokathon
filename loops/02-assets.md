# Doc Hub — Loop Operating Document

This is the instruction set for one iteration of the Doc Hub loop. Read this file first, act, then
stop. It is deliberately short; the files it points at hold the detail.

| Document | Role |
|---|---|
| `loops/02-dochub.md` | This file. The Doc Hub contract, the build order, and the checklist DH-001…DH-016. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. |

The Doc Hub is the page a salesperson opens first. It is a Google-Workspace-like home for the four
media grok-workspace produces — documents, slides, experiences, software — showing which agent is
reading what and which agent is writing what, live.

> The Doc Hub is both the destination every agent writes into and the source every agent reads
> from. Anything that is only one of those is not the Doc Hub.

**What this surface contributes to the canonical demo.** The research agent reads the user's
existing material *out of* the hub. The X agent, the Imagine agent and the voice+Imagine agent
write slides, images, clips and narration *into* it. The user watches four coloured dots move over
a grid of slides. Every asset carries which agent made it, with which capability, and what it cost.
If the hub is missing, the demo is four agents talking into a void.

---

## 0. Your boundary

This worktree owns the Doc Hub and nothing else. The other loop documents in `loops/` are assigned
to other worktrees and are being written and implemented in parallel.

**Files and directories you own — create, edit, delete freely:**

```text
server/types/dochub.ts          new — Deliverable, DeliverableSection, Asset, CheckRun
server/services/docHub.ts       new — the store; synchronous, versioned, atomic
server/services/assetStore.ts   new — download-on-receipt persistence + provenance sidecars
server/services/docHubChecks.ts new — the deterministic check evaluator (acceptance evidence)
server/routes/dochub.ts         new — HTTP surface, mounted at /api/dochub
client/src/dochub/**            new — the page, the grid, the deliverable view, the quick tree
loops/02-dochub.md              this file
```

**Files you may read but must not edit.** Each is owned by another worktree; an edit here is a
merge conflict at best and a silent contradiction at worst:

```text
server/services/agentRegistry.ts      agents loop — agent identity, status, budgets
server/services/acpSessionManager.ts  agents loop — sessions, transcripts, cost recording
server/services/usageAccounting.ts    cost loop — rate tables, the ledger
server/hooks/**                       boundary loop — PreToolUse interception
client/src/control-room/**            agents loop — except the one mount point named below
```

**Shared files that need a cross-boundary request before you touch them:**

```text
server/services/controlRoomEvents.ts  the event union — additive members ONLY, never a rename
server/types/project.ts               the domain model — the agents loop renames it; wait
server/services/projectMcpServer.ts   the tool surface — you add tools, you rename none
server/routes/api.ts:32-area          the mount line for /api/dochub — one line, coordinate it
```

**How to raise a cross-boundary concern.** Do not edit. File a suggestion — this is the mechanism
the product itself is built on and it already works: `DesignSuggestion`
(`server/types/project.ts:95-118`), the `submit_design_suggestion` MCP tool, and `SuggestionQueue`
in `client/src/control-room/ReviewQueues.tsx`. Outside the running product, say it in your
iteration report with the file, the line and what you believe is wrong, and stop. A worktree that
"just fixed" a file it does not own is the exact failure this whole product exists to prevent.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

```bash
./node_modules/.bin/grok --version   # expect: grok 0.2.118
bun run verify                       # expect: exit 0, typechecks, tests, build, four audits
bun run audit                        # expect: 0 orphans, every endpoint covered
```

Capture verify's output to a file, never `>/dev/null`. **A red gate is always the highest-priority
work, ahead of any checklist item** — including a gate you did not turn red. `bun run audit`
includes the endpoint audit, and every endpoint you add to `server/routes/dochub.ts` must have a
caller in the same iteration or the gate goes red on you.

There is no xAI credential on this machine. `~/.grok/config.toml` points at `api.openai.com` and
`grok models` reports "You are not authenticated." Nothing that calls `api.x.ai` can be tested here
until that is fixed — see §6.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 16 NOT TESTED
Gate: inherited from the control room — 715 tests across 42 suites, both typechecks, the
      production build, four audits. Nothing in this checklist has been attempted.
```

What exists today that this loop builds on, with the line numbers to read before you change
anything:

```text
server/services/projectStore.ts:294-332   updateDocument — optimistic concurrency, stale sweep
server/services/projectStore.ts:67-73     VersionConflictError {baseVersion, currentVersion}
server/services/projectStore.ts:148-159   the synchronous-mutation invariant. Read this twice.
server/types/project.ts:49-65             DesignDocumentVersion / DesignDocument
server/types/project.ts:95-118            DesignSuggestion with baseVersion/stale
server/types/project.ts:130-141           TaskTestRun, including `parsed: boolean`
server/types/project.ts:234-258           ArtifactKind / CodeArtifact — the weak ancestor of Asset
server/types/project.ts:318-329           changedFiles verified vs claimedChangedFiles
server/services/controlRoomEvents.ts:9-48 the event union (11 members)
server/services/controlRoomEvents.ts:83-99 publish(); :67 the 50-event replay history
server/index.ts:82-90                     /ws/control-room upgrade, projectId required
server/index.ts:109-124                   subscribe + replay on open; :211-215 unsubscribe
server/routes/repository.ts:44-73         canonical() and assertManagedPath() — reuse verbatim
server/routes/repository.ts:153           GET /api/repository/changed-files
server/services/repository.ts:403-419     listRepositoryFiles — git ls-files, flat, capped at 500
server/services/projectMcpServer.ts:14-30 ProjectMcpContext — identity is not a parameter
server/services/projectMcpServer.ts:164-176 the list_repository_files tool
server/services/projectMcpServer.ts:594-628 create_artifact / attach_artifact_to_requirement
server/services/projectMcpServer.ts:695-703 DELIBERATELY_USER_ONLY — do not weaken it
server/services/secrets.ts:113            assertNoSecrets, called on every document write
server/services/designReview.ts:5-10      why review must be deterministic
```

Open, and not a checklist failure:

```text
X-1   whether the "Google-Workspace-like" home means an actual Google Docs integration or only
      the look and feel. This document assumes the latter. See §6.
X-2   the cost ledger does not exist yet (cost loop). Until it does, an Asset carries its own
      costUsd. That is a temporary duplication, recorded here so it is removed, not forgotten.
```

---

## 3. What must be built

### 3.1 The object model — one envelope, four kinds

All four media are the same record with a different `kind`. Resist four parallel models: the
presence indicator, the version history, the boundary check, the check run and the cost roll-up are
identical work four times over if the kinds diverge.

```text
Deliverable {
  id, projectId, kind: "document" | "deck" | "experience" | "software",
  title, origin: "generated" | "uploaded" | "x",
  sections: DeliverableSection[],       // ordered
  manifestVersion: number,              // bumps on add/remove/reorder of sections only
  createdAt, updatedAt
}

DeliverableSection {
  id, deliverableId, index, title,
  anchor,                    // stable, minted at creation, NEVER derived from the title
  areaId?,                   // the single link to a colour-coded work area
  requirementId?, ownerAgentId?,
  body,                      // text: prose, slide copy, narration script, or a file manifest
  currentVersion: number, versions: SectionVersion[],
  assetIds: string[],
  checkRun?: SectionCheckRun,
  status: "empty" | "drafting" | "submitted" | "checks_passing" | "reviewed" | "published"
}

SectionVersion { version, body, createdAt, authorId, changeSummary?, fromSuggestionId? }
```

`SectionVersion` is `DesignDocumentVersion` (`server/types/project.ts:49-58`) with the field names
unchanged. Keep them unchanged: `authorId` and `fromSuggestionId` are what make a version history
readable as provenance rather than as a diff.

**`anchor` is minted, never derived.** A heading-derived anchor breaks the instant a user renames a
slide, and the area mapping silently detaches. The repository already has the scar:
`Requirement.designSection` (`server/types/project.ts:79`) is a free-text section name, accepted by
the API, stored, mirrored client-side — and set by nothing, in a product that shipped 52 checklist
items. A link nobody can populate is a link nobody can trust.

What a section *is*, per kind:

| kind | a section is | its assets |
|---|---|---|
| `document` | a heading-anchored block of prose | images, attached files |
| `deck` | exactly one slide | background/illustration, narration audio + timings, thumbnail render |
| `experience` | one shot or segment | source image, mp4 clip, narration audio + per-character timings |
| `software` | one screen or route | source files under the workspace, screenshot render |

### 3.2 Storage — structured, not a free filesystem

There is no xAI document or slide API. None. Assembly is entirely our code, which means the on-disk
format is entirely our decision — so choose the one that makes boundaries enforceable.

```text
<workspace>/deliverables/<deliverableId>/
  deliverable.json          the manifest: kind, title, ordered section ids, manifestVersion
  sections/<sectionId>.json the section, with its full version array
  assets/<assetId>.<ext>    the persisted bytes
  assets/<assetId>.json     the provenance sidecar
```

**Agents never write these files.** Every mutation goes through an MCP tool that carries
`{projectId, agentId, areaId}` bound at server construction — `ProjectMcpContext`
(`server/services/projectMcpServer.ts:14-30`): "the identity is not a parameter". That is the whole
reason to make the deliverable structured. The alternative — agents writing markdown wherever they
like — cannot be policed, because boundaries are enforced nowhere at write time today:
`assertAgentCanWrite` (`server/services/repository.ts:261`) and the entire `ApprovalQueue`
(`server/services/approvals.ts`) have zero production callers, and `server/hooks/shellSafetyHook.ts`
is not installed by this repository and only classifies shell commands, so a direct file-write tool
walks straight past it. Git worktrees made an out-of-bounds edit *recoverable*; they never
*prevented* one. Remove git and you remove the safety net, not the enforcement.

**The one exception, stated plainly:** a `software` deliverable's sections point at real files in
the workspace, because `grok` edits code with its own tools. For that kind only, path-level
enforcement is required and it belongs to the boundary loop — a PreToolUse hook that canonicalises
every path argument and calls `process.exit(2)`, because a deny in stdout JSON is ignored under
`--always-approve`. Do not build it here. Do record on the software deliverable that its sections
are file-backed, so the UI does not claim a guarantee it does not have.

**`docHub.ts` must stay synchronous.** Read `server/services/projectStore.ts:148-159` before writing
a line of it. A mutation is read-file → change in memory → write-file, and atomicity of the *write*
is not atomicity of the *sequence*. It is safe only because no `await` occurs inside it, so the
event loop cannot interleave two agents' updates and lose one. Several agents writing at once is
this product's normal state. Add an invariant test that fails if any method on the store becomes
`async`, mirroring `projectStoreInvariants.test.ts`.

### 3.3 Sections map to work areas

`section.areaId` is the only link, and it is stored on the section, not on the area. Two reasons,
both concrete: reordering or retitling the deliverable cannot lose it; and a boundary check is a
single lookup on the object being mutated, with no traversal and no ambiguity about which of two
records is authoritative.

Rules:

- one area may own many sections; a section has at most one owning area;
- a mutation is refused when `ctx.areaId !== section.areaId`, and the refusal names the suggestion
  path in its error text — a refusal that does not say what to do instead produces a stuck agent;
- a section with no `areaId` is user-writable only; an agent gets a suggestion, not a write;
- reassigning a section between areas is a user action. It is never an agent tool.

The suggestion half already works and is the best-preserved thing in the repo. `DesignSuggestion`
(`server/types/project.ts:95-118`) carries `baseVersion`, goes `stale` automatically when the
document moves on (`server/services/projectStore.ts:324-329`), retains `originalProposedText` when
the user edits the agent's wording, and has a working accept/edit/reject/request-revision queue.
Reuse it as-is and add `targetSectionId`. Do not write a second suggestion system.

### 3.4 Assets — the URL is not the asset

Returned media URLs from `api.x.ai` are temporary. Images come back from
`POST https://api.x.ai/v1/images/generations`; video is asynchronous — `POST /v1/videos/generations`
returns a `request_id` polled at `GET /v1/videos/{request_id}` with status
`pending | done | expired | failed`, and the finished URL is on `vidgen.x.ai`. Both expire.

**An asset does not exist until its bytes are on disk.** `assetStore.persist()` accepts bytes, a
base64 payload, or a URL it downloads *before* the record is created. There is no code path that
stores a remote URL as a section's reference. A deck that renders from remote URLs is broken by
construction and the breakage appears days later, in front of a customer.

```text
Asset {
  id, deliverableId, sectionId?, kind: "image" | "video" | "audio" | "file",
  path, bytes, sha256, mime, durationSec?,
  producedByAgentId, capability: "text" | "image" | "voice" | "voice+image",
  model, requestId?, prompt,
  costUsd, costSource: "actual" | "estimated", rateKey,
  createdAt
}
```

`costSource: "actual"` means the figure came from `usage.cost_in_usd_ticks` on the generation
response (1 USD = 10^10 ticks), which covers images and video. `"estimated"` means it was derived
from a published rate: TTS at $15.00 per 1M characters. **It is not verified that the TTS, STT or
realtime endpoints return `cost_in_usd_ticks` at all** — treat voice cost as estimated until a live
response proves otherwise, and label it that way in the UI. Never show a number without its
`costSource`; a user who sees `$0.00` reads "cheap", not "we do not know".

Rates, for the check evaluator and the forecast: `grok-imagine-image` $0.02/image,
`grok-imagine-image-quality` $0.05/image, up to 10 images per request, 5 RPS flat across all spend
tiers; `grok-imagine-video` $0.050/sec, `grok-imagine-video-1.5` $0.080/sec, duration 1–15 s default
8, 480p/720p/1080p, audio generated by default, 10 RPS flat. A 60-second experience is about $5.52
in media alone — three orders of magnitude more than a text turn, and one careless retry loop is a
$50 mistake. That is why every asset carries its cost at creation rather than waiting for an
aggregate somewhere else.

**Store the TTS timings.** `with_timestamps` on `POST https://api.x.ai/v1/tts` returns per-character
timing; write it beside the audio as `<assetId>.timings.json`. It is how narration syncs to a slide
build deterministically, and it is how the duration check runs without re-synthesising. Re-calling
TTS to learn how long a clip is means paying for the clip twice.

### 3.5 The Doc Hub as a source

Two read paths, and the difference between them is money.

**Local read — the default.** `search_dochub(query, kinds?, deliverableIds?)` and
`read_section(sectionId)` MCP tools over the structured store. Deterministic, free, no upload, and
available to a base-Grok agent with no media capability at all. Start here. Substring and title
matching over sections is enough for a workspace of tens of documents; do not reach for embeddings
before a user has complained.

**Remote read — semantic search over uploaded material.** xAI ships a Files API (upload documents,
**max 48 MB each**; text, markdown, code, CSV, JSON, PDF) and Collections for persistent
multi-document semantic search. Attaching a file to a chat implicitly enables the server-side
`attachment_search` tool, which turns the request agentic, **is charged per tool invocation**, and
requires an agentic model. Three consequences, all of which belong in the UI, not in a comment:

1. uploading a user's document to xAI is an outward-facing operation on someone else's material.
   It requires an explicit per-deliverable consent, recorded on the deliverable as
   `xaiFileId` + `uploadedAt` + `uploadedBy`. Never upload as a side effect of a search.
2. a research agent working through Collections spends money per query; the same agent working
   through `search_dochub` spends nothing. Show which one it used.
3. a file over 48 MB cannot be uploaded. Refuse at selection time with the size, not at upload time
   with a provider error.

**Ingest.** A file the user drops into the hub becomes a deliverable with `origin: "uploaded"` and
one section per detected heading — or one section for the whole file when no headings are found.
Never invent sections. `shared/designDocument.ts` exists because a loose pattern turned prose into
phantom requirements; the same failure here produces a deck outline nobody asked for.

### 3.6 Live presence — who is reading, who is editing

Three new members on the `ControlRoomEvent` union (`server/services/controlRoomEvents.ts:9-48`),
published through `getControlRoomBus().publish(projectId, …)` (`:83`) and delivered over
`/ws/control-room` (`server/index.ts:82-90`, subscribe and replay at `:109-124`):

```text
{ type: "dochub_presence"; agentId; deliverableId; sectionId?; mode: "reading" | "editing" }
{ type: "dochub_changed";  deliverableId; sectionId?; version; byAgentId }
{ type: "dochub_asset";    deliverableId; sectionId?; assetId; assetKind; costUsd; costSource }
```

**Presence is emitted by the tool call, never reported by the agent.** `read_section` publishes
`reading`; a section write publishes `editing`. An agent that announces "I am now working on slide
4" is prose, and a string a model wrote is not a lookup key — the control room learned this when
plan generation stored four unowned tasks by matching a model's phrasing with `===` (iteration 81).

**Presence needs a lease.** The bus is stateless: it publishes and forgets. A `reading` event with
no expiry leaves a ghost dot on a slide forever after an agent crashes, and the user's conclusion is
that the product is lying. Hold presence in `docHub.ts` as `{agentId, sectionId, mode, expiresAt}`
with a 90-second TTL, refreshed by each tool call, and cleared when the session stops.

**An event stream is not a state store.** The bus keeps 50 events per project
(`server/services/controlRoomEvents.ts:67`), so a client that connects into a busy project sees a
truncated history and a client that reconnects sees a replay it may already have applied. Ship
`GET /api/dochub/presence?projectId=` returning the live lease table, and have the client fetch it
on connect and on every reconnect. The control room already paid for this lesson once: events were
published and dropped by the client — true of the wire, false for the user (iteration 48).

### 3.7 Versioning and review — what replaces git

Carried over from `server/services/projectStore.ts` unchanged in shape:

- integer `currentVersion` plus an append-only `versions[]` array, per section;
- `expectedVersion` on every write, and `VersionConflictError {baseVersion, currentVersion}`
  (`:67-73`) when it does not match. The error carries both numbers because "conflict" alone cannot
  be rendered into anything a user can act on;
- the stale sweep (`:324-329`): a pending suggestion written against an older version becomes
  `stale` automatically rather than being applied against text that has moved;
- `assertNoSecrets` (`server/services/secrets.ts:113`) on every section write. A shared deck leaks
  further than a private repo, not less;
- `authorId` on every version, including user edits.

**What does not carry over:** today the document is a single markdown blob
(`DesignDocument.content` per version, `server/types/project.ts:49-65`). One blob means two agents
editing two different slides conflict with each other, every time. Version at the *section*, and
keep a separate `manifestVersion` on the deliverable that bumps only when sections are added,
removed or reordered. Conflict granularity is the section; structural changes are rarer and may be
coarse.

**Acceptance evidence for a slide.** Test results were the old acceptance evidence and they are
gone — `server/services/testRunner.ts` spawns `bun test` and parses its output, which means nothing
for a deck. What replaces them is a deterministic check run, not a reviewer's opinion; a reviewer
that returns a different verdict each run cannot gate a publish
(`server/services/designReview.ts:5-10`).

```text
SectionCheckRun {
  checks: Array<{ id, label, result: "pass" | "fail" | "unevaluated", detail? }>,
  passed, failed, unevaluated,
  evaluated: boolean,        // false when the run could not execute at all
  ranAt, ranByAgentId
}
```

`evaluated: false` is `TaskTestRun.parsed` (`server/types/project.ts:135-136`) under a new name: an
honest unknown, never treated as success. The seven checks:

```text
C1  every assetId on the section resolves to a file on disk with non-zero bytes
C2  every asset's mtime is later than the task's start — no stale asset re-presented as new
C3  no placeholder text in the body: Lorem, TODO, {{, "coming soon", "placeholder"
C4  the section count for this area matches the outline it was assigned
C5  every brief section mapped to this area has at least one deliverable section
C6  narration duration within ±20% of target, computed from the stored TTS timings
C7  assertNoSecrets passes over the body and over every text asset
```

C1 and C2 are the direct analogue of `changedFiles` verified against git rather than taken from the
agent: keep the trick at `server/types/project.ts:318-329` — when the agent's claimed asset list
disagrees with what is on disk, record `claimedAssets` alongside the verified list. Its presence
means the agent misreported its own work, which is a signal about every other claim in the
submission, all of which are unverifiable.

A render — a PNG thumbnail per slide — is what replaces the diff at review time. It is our own
renderer; nothing in xAI produces it. Until it exists, the review UI shows the section body and its
assets and says so, rather than showing an empty preview pane.

### 3.8 The quick file tree

There are two trees, and the product must not conflate them.

**The deliverable tree — the default, and the one non-technical users see.** Deliverables →
sections → assets, with a presence dot on any node an agent currently holds and a cost figure on any
node that has assets. It is served from `docHub.ts`, not from git. It edits text sections in place,
through the same versioned mutation path an agent uses: a user edit is an `Actor {kind: "user"}`
write carrying `expectedVersion`. That is what makes a user and an agent editing the same slide
collide loudly instead of one silently overwriting the other.

**The repository tree — `software` deliverables only.** What exists to build on:

```text
server/services/repository.ts:403-419   listRepositoryFiles — git ls-files, flat paths, cap 500,
                                        reports `truncated`, which nothing renders
server/services/projectMcpServer.ts:164-176  list_repository_files, MCP only, no HTTP route
server/routes/repository.ts:153         GET /api/repository/changed-files
server/routes/repository.ts:44-73       canonical() + assertManagedPath() — reuse verbatim
```

Three defects to fix rather than inherit: `git ls-files` lists **tracked files only**, so a file an
agent just generated is invisible — union in `git ls-files --others --exclude-standard`; the 500-cap
`truncated` flag must be rendered as "showing 500 of N" or the tree lies by omission; and nesting is
client-side work, a trie over the flat list, with no server change.

Any new read-file or write-file endpoint routes through `assertManagedPath` and re-checks `..`
*after* canonicalisation. `GET /api/browse` (`server/routes/api.ts:64`) is not a starting point: it
lists directories only, filters dotfiles, and has no path confinement at all — it will hand back any
path on the machine. Confine it or delete it; do not build the tree on it.

### 3.9 Build order

This is the table §4 step 3 refers to. Work top-down; each stage is testable before the next
begins.

| # | Stage | Done when |
|---|---|---|
| 1 | Types + store: `dochub.ts`, `docHub.ts`, synchronous invariant test | DH-001, DH-002 |
| 2 | Versioning + conflict + secrets on section writes | DH-003, DH-004 |
| 3 | Asset persistence and provenance | DH-005, DH-006 |
| 4 | MCP mutation surface with the `areaId` refusal | DH-007, DH-008 |
| 5 | Presence: events, lease, snapshot endpoint | DH-009, DH-010 |
| 6 | Read path: local search, then Files/Collections behind consent | DH-011, DH-012 |
| 7 | Check runs and the publish gate | DH-013, DH-014 |
| 8 | UI: home grid, deliverable view, quick tree | DH-015, DH-016 |

### If the loop runs with nothing to do

1. **Composition checks.** List what the server publishes and what the client consumes, and diff
   them. That one command is how the dropped budget events were found. Every endpoint you added
   needs a caller; `bun run audit:endpoints` will tell you, and `server/routes/uiContract.test.ts`
   is where a new UI call gets its shape guarded — extend it in the same iteration as the call.
2. **Re-derive a surprising result.** A suspiciously clean check is a bug in the check. An audit
   that returned all zeros was a broken shell variable, not clean code.
3. **Delete a duplication.** If `CodeArtifact` (`server/types/project.ts:246-258`) and `Asset` both
   survive an iteration, one of them is dead weight and the UI will eventually show both.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest item in the §3.9 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` against the DH-0NN item.
9. Commit with a message stating what was verified.
10. Report honestly, including what did not move and what you were tempted to edit outside §0.

---

## 5. What counts as done

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run. A partially-satisfied item is NOT TESTED, not
PASS; say which clause failed and hold the item.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

#### DH-001: A deliverable exists in four kinds and persists

Required result:

* a deliverable can be created with kind `document`, `deck`, `experience` or `software`;
* it round-trips through a process restart with sections and order intact;
* an unknown kind is refused, not stored.

Evidence:

```text
Created kinds:
Restart round-trip:
Refusal on unknown kind:
```

#### DH-002: Every store mutation is synchronous

Required result:

* no method on the store is `async` or contains `await`;
* an invariant test fails if one becomes so;
* the reason is written in the source, and deleting the explanation fails the test.

Evidence:

```text
Invariant test:
Deliberate async method → test output:
Explanation removed → test output:
```

#### DH-003: Section writes are versioned with conflict detection

Required result:

* each write appends a version carrying `authorId` and `changeSummary`;
* a write with a stale `expectedVersion` throws `VersionConflictError` carrying both versions;
* two sections of one deliverable can be written concurrently without either conflicting.

Evidence:

```text
Version history after 3 writes:
Stale write error body:
Concurrent two-section write:
```

#### DH-004: A credential cannot be written into a section

Required result:

* `assertNoSecrets` runs on every section write, agent or user;
* the write is refused and the section is unchanged;
* the error names where the credential was found.

Evidence:

```text
Attempted write:
Refusal:
Section version after refusal:
```

#### DH-005: A generated asset is persisted before it is referenced

Required result:

* an asset created from a URL has its bytes on disk before the record is written;
* the record stores a local path and a sha256, never the remote URL as the reference;
* a download failure produces no asset record at all — no half-asset.

Evidence:

```text
Asset record:
File on disk (bytes, sha256):
Download failure → records created:
```

#### DH-006: Every asset carries its provenance and its cost source

Required result:

* `producedByAgentId`, `capability`, `model` and `prompt` are present on every asset;
* `costUsd` is accompanied by `costSource` of `actual` or `estimated`;
* the UI never renders a cost figure without its source.

Evidence:

```text
Image asset (actual, from cost_in_usd_ticks):
TTS asset (estimated, chars × rate):
Rendered label:
```

#### DH-007: An agent cannot write a section outside its area

Required result:

* a section write is refused when the calling agent's `areaId` differs from `section.areaId`;
* the refusal text names the suggestion path;
* the section's version is unchanged after the refusal;
* a section with no `areaId` refuses every agent write.

Evidence:

```text
Cross-area write attempt:
Refusal text:
Version before/after:
Unowned-section attempt:
```

#### DH-008: An agent can suggest a change to a section it does not own

Required result:

* a suggestion carries `targetSectionId` and the `baseVersion` it was written against;
* it becomes `stale` when that section is written by someone else;
* accepting it produces a new version with `fromSuggestionId` set.

Evidence:

```text
Suggestion record:
State after intervening write:
Version produced on accept:
```

#### DH-009: The hub shows which agent is reading and which is editing

Required result:

* a read tool call publishes `dochub_presence` with `mode: "reading"`;
* a section write publishes `mode: "editing"` and a `dochub_changed`;
* presence is emitted by the tool call, not by anything the agent says;
* the client renders it on the section without a page refresh.

Evidence:

```text
Events observed on /ws/control-room:
Agent prose containing a false claim → events published:
Rendered indicator:
```

#### DH-010: Presence expires and can be re-fetched

Required result:

* a lease expires within 90 s without a refreshing tool call;
* killing an agent mid-read clears its presence;
* `GET /api/dochub/presence` returns the same state a fresh WebSocket replay would imply;
* a client reconnecting after more than 50 events shows correct presence.

Evidence:

```text
Lease expiry:
Killed agent → presence after 90 s:
Snapshot vs replay:
Reconnect after 60 events:
```

#### DH-011: An agent can find existing material in the hub

Required result:

* `search_dochub` returns matching sections with deliverable, section id and a snippet;
* `read_section` returns the current version and its number;
* a base-Grok agent with no media capability can do both;
* a search costs nothing and the UI says so.

Evidence:

```text
Query and results:
Capability of the calling agent:
Cost recorded for the search:
```

#### DH-012: Uploading to xAI requires explicit consent and respects the limits

Required result:

* no upload occurs as a side effect of a search;
* consent is recorded on the deliverable with who granted it and when;
* a file over 48 MB is refused at selection with its size;
* a Collections-backed query records a cost with `costSource` set.

Evidence:

```text
Search without consent → uploads:
Consent record:
Oversize refusal:
Collections query cost:
```

#### DH-013: A section produces acceptance evidence without any tests

Required result:

* C1–C7 run and produce per-check pass/fail/unevaluated;
* a check that could not run is `unevaluated` and sets `evaluated: false`, never a pass;
* a missing asset file fails C1 and names the asset;
* narration duration is computed from stored timings, with no second TTS call.

Evidence:

```text
Check run output:
Deleted asset → C1 result:
Unevaluatable check → run summary:
TTS calls during a check run:
```

#### DH-014: Publishing refuses without evidence

Required result:

* publish is refused when the check run failed, is missing, or has `evaluated: false`;
* publish is refused without a named approver;
* publish is refused for a section that produced no artifact;
* a failed publish leaves the previous published version intact and restorable.

Evidence:

```text
Refusals, one per condition:
Published version before/after a failed publish:
```

#### DH-015: The hub home shows the four media and live agent activity

Required result:

* documents, slides, experiences and software appear on one page, grouped by kind;
* each tile shows its owning area colour, its status and its cost to date;
* an agent's presence appears on the tile within one second of the tool call;
* no figure on the page is fabricated when the underlying value is absent.

Evidence:

```text
Rendered page (kinds, counts):
Presence latency:
Absent-value rendering:
```

#### DH-016: The quick tree lists and edits

Required result:

* the tree lists deliverables, sections and assets, nested;
* a text section can be edited in place and produces a new version with the user as `authorId`;
* an edit against a stale version is refused with a message naming both versions;
* for a software deliverable, generated-but-untracked files appear, and truncation is stated.

Evidence:

```text
Tree output:
User edit → version record:
Stale edit refusal:
Untracked file visible / truncation label:
```

---

## 5a. Rules learned the hard way

Each of these exists because it was violated at least once, in this repository or in the research
behind this pivot. No rule without its bug.

- **A link nobody can populate is a link nobody can trust.** `Requirement.designSection`
  (`server/types/project.ts:79`) is declared, accepted by `POST /:id/requirements`, stored, mirrored
  client-side, and set by nothing, after 52 passing checklist items. Before adding a field that
  connects two things, name the code that writes it.
- **A string a model wrote is not a lookup key.** Plan generation stored four unowned tasks by
  matching a model's phrasing of a role with `===` (iteration 81). Presence, section ids and area
  ids come from the tool call's bound context, never from the agent's text.
- **An event stream is not a state store.** Control-room events were published and dropped by the
  client — true of the wire, false for the user (iteration 48). Every live indicator needs a
  snapshot endpoint beside it.
- **Verify through the production code path.** A probe proves the protocol works; only the real
  service proves the product works. Three items were once marked PASS on evidence that was real but
  unreachable.
- **Verified, not the agent's word for it.** `submitCode` checks the agent's changed-file list
  against the repository and records `claimedChangedFiles` only when the agent lied
  (`server/types/project.ts:318-329`). Do the same for assets, or the check run is self-reported.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. A cost of `$0.00` with no `costSource` is a fabrication: today every figure in the
  shipping product is very likely `$0.00` because `DEFAULT_RATES`
  (`server/services/usageAccounting.ts`) has three keys — `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` — and
  no Grok model, so an unknown model returns `costUsd: 0` with `rateKey: null`, and `rateKey: null`
  is surfaced nowhere.
- **A suspiciously clean result is a bug in the check.** An audit that returned all zeros was a
  broken shell variable, not clean code. Write a positive control for every check in C1–C7 and make
  each fail on demand before believing a pass.
- **Test the failure path.** A download that dies halfway, a section written twice at once, a
  reconnect after the 50-event history has rolled over. Those are where the defects are.
- **When safety comes from the absence of something, write it down.** The store is concurrency-safe
  only because no mutation contains an `await` — not from locking, not from atomic writes. State it
  in the source and let a test fail if the statement is deleted.

---

## 6. Where the owner's assumptions are wrong

Stated plainly, because designing quietly around them produces a product that cannot be explained.

1. **There is no xAI document or slide generation API. None.** Nothing on the platform emits PPTX,
   DOCX, PDF or slides. Grok produces structured JSON; our code renders it. Slide assembly,
   document assembly and every preview thumbnail are 100% our own code. An agent sent looking for a
   generation endpoint will burn an iteration finding nothing.
2. **"Google-Workspace-like" is a look, not an integration.** There is no OAuth flow, no token
   store, no `googleapis` dependency anywhere in this repository. Real Google Docs sync is a full
   greenfield subsystem — OAuth 2.0, a refresh-token store, `documents.get` parsing, and change
   detection via Drive `changes.watch` into Cloud Pub/Sub. This document assumes the look. If the
   owner meant the integration, stop and ask (§7).
3. **Media URLs are temporary.** Any design that stores a returned URL in a deck is broken by
   construction, and it breaks after the demo, not during it.
4. **Custom voice cloning from the app is not buildable.** API creation of custom voices is
   Enterprise-only; on a standard plan voices are created in the console, US-only excluding
   Illinois. Do not put a "clone your voice" control in the hub.
5. **Cost is broken today, not merely incomplete.** There is no ledger — only running totals
   (`agent.costUsd += …`), so there is no time series, no drill-down and no export. The
   input/output/cache token split is computed and thrown away. `approvalThreshold` and `maxRetries`
   are unimplemented. Per-tool-call attribution is structurally impossible because ACP returns one
   usage object per *turn*. Per-task cost *is* tracked — `HANDOFF.md` is stale on that point.
   Consequence for this surface: an asset's media cost is exact, and a section's *text* cost can
   only be apportioned across whatever the turn touched. Label an apportioned figure as
   apportioned.
6. **There is no HTTP client to `api.x.ai` in this project.** It speaks ACP (JSON-RPC over stdio) to
   the `grok` binary and nothing else. Files, Collections, images, video and TTS all need a net-new
   HTTP/WebSocket client, and `XAI_API_KEY` is a different credential from whatever signs the CLI
   in. That client is not owned by this worktree.
7. **The resources backend already exists and has never been called.**
   `server/services/promptLibrary.ts` and `server/routes/library.ts` serve skills, prompts and
   workflows, and no client code has ever called `/api/library`. If you find yourself writing a
   second one, verify first.

---

## 7. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- **X-1: "Google-Workspace-like" — look, or integration?** This document assumes look-and-feel and a
  hub we own. Real Google Docs sync changes the object model, the versioning story and the boundary
  story. One sentence from the owner settles it.
- **No xAI credential exists on this machine.** `grok models` reports "You are not authenticated"
  and `~/.grok/config.toml` points at `api.openai.com`. Nothing that touches Files, Collections,
  Imagine or TTS can be evidenced until that is provided. An action that needs credentials that were
  not provided is a stop condition, not a mock.
- **Uploading a user's documents to xAI** is outward-facing and spends money per tool invocation.
  Consent is a product feature, and the decision to make it default-on is the owner's, not yours.
- **Deleting a user's deliverable, or any tracked file.** Irreversible, and the repository has an
  eighty-iteration precedent for stopping on exactly this.
- **A change would fall outside §0.** File a suggestion and stop. Do not edit another worktree's
  files, even when you are certain.
- **Two requirements contradict each other** — for example, "simpler and more visual" against a
  check run that needs seven results on screen. Say which two, and stop.

---

## 8. Definition of done

The Doc Hub is complete when DH-001…DH-016 all read PASS with recorded, re-runnable evidence in
`VERIFICATION.md`; `bun run verify` is green; no item is NOT TESTED and no item is BLOCKED; and the
canonical demo runs end to end on this surface — a project is created, a team assembled, one agent
researches in the hub, three agents write slides, images, clips and narration into it, every asset
lands with its agent, its capability and its cost, and the user can watch it happen without reading
a log.

Only then output `The Doc Hub is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
