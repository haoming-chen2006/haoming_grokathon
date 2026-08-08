# Design Documents — Loop Operating Document

This is the instruction set for one iteration of the design-document loop. Read this file first,
act, then stop. It is deliberately short; the files it points at hold the detail.

| Document | Role |
|---|---|
| `loops/03-design-documents.md` | This file. The contract, the build order, and the checklist DD-001…DD-017. |
| `grok-workspace.md` | The product contract. Read §7 (boundaries), §8 (suggestions), §9 (capability and cost). |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. Read once; never edit. |

The product has three headline pages — AGENTS, ASSETS, DESIGN DOCUMENTS — and two secondary ones,
USERS and X. This worktree owns the third, and the third is the one that makes the product
different from a chat window with a file browser attached.

> A design document is not a file the product stores. It is the interface — the surface where work
> is declared, and the surface where work is watched. A document *asset* is an output. A design
> document is the place a project comes from.

Five kinds of asset exist: documents, slides, tables, workflows, software. Only one of them is
worked on continuously, and only one of them declares anything. Slides are PPTX rendering. Tables
are spreadsheet rendering. Software is a build. The document is where a human states what they want
and watches four agents converge on it, and that is the whole differentiator.

**What this surface contributes to the canonical demo.** The user writes one paragraph — "I need to
do this sales presentation" — into a design document. That document declares the project and its
four areas, so team assembly has something to assemble *against*. While Research reads, X drafts,
Slides generates and Video narrates, the user sits in the document and watches coloured highlights
move down the page: which agent is on which lines, right now. The assets land on the ASSETS page;
the *watching* happens here. Without this surface the demo is a progress bar and four log tails.

---

## 0. Your boundary

**You are in a git worktree, on your own branch, in a parallel build.** You are not in the main
checkout. Seven sibling worktrees are editing this repository at the same time on sibling branches.
An edit you make outside the list below is not "a small fix" — it is a merge conflict in someone
else's file, resolved by someone who does not know why you made it.

```text
worktree   03-design-docs
branch     pivot/design-docs
handoff    loops/handoff/pivot/design-docs.md
```

**Files and directories you own — create, edit and delete freely:**

```text
server/services/designDoc.ts        new — the store, the declaration parser, the MCP tool
                                          registration, and (for now) the exported types
server/services/presence.ts         new — the lease table, both presence sources, the metric
server/routes/designDocs.ts         new — HTTP surface, mounted at /api/design-docs
client/src/control-room/designdoc/**  new — the page, the document view, the presence layer,
                                          the in-document conversation, its own data hook
loops/03-design-documents.md        this file
loops/handoff/pivot/design-docs.md  your requests to the reconciliation pass — yours alone
```

**Files you must not touch, and why.** Every one of these belongs to another worktree that is
editing it right now. Read them — you must, because half the design below is a citation — but an
edit here is a conflict at best and a silent contradiction at worst:

```text
server/services/workArea.ts        01-agents   areas, colours, agent↔area binding
server/services/boundary.ts        01-agents   the PreToolUse hook and write-time refusal
server/services/agentTeam.ts       01-agents   roster and assembly
server/services/agentRegistry.ts   01-agents   identity, status, budgets
server/routes/agents.ts            01-agents
client/src/control-room/agents/**  01-agents
server/services/assetStore.ts      02-assets   the five asset types and their bytes
server/routes/assets.ts            02-assets
client/src/control-room/assets/**  02-assets
server/services/xai/**             04-generation   no api.x.ai call belongs in this worktree
server/services/render/**          04-generation
server/routes/generation.ts        04-generation
server/services/software/**        05-software
server/services/promptLibrary.ts   06-tools-cost   skills, prompts, workflows
server/services/usageAccounting.ts 06-tools-cost   rates and the ledger
server/services/costLedger.ts      06-tools-cost
client/src/control-room/shell/**   07-shell    the frame, the page selector, theming
server/services/auth.ts            08-users-x
server/services/x/**               08-users-x
```

Three more files are shared by several worktrees without being on the hot list. They are not yours
either. Every change you need in them goes in the handoff file with the exact shape:

```text
server/services/controlRoomEvents.ts   the event union — you add three members, by request
server/services/projectMcpServer.ts    tool registration — you add three tools, by request,
                                       through a single exported function (see §3.8)
server/services/acpSessionManager.ts   session rules — the briefing text reaches an agent
                                       through here, by request
```

### The hot-file protocol

These files are shared by everyone, and **no worktree may edit them directly**, because an
eight-way conflict in any of them would cost more than all the feature work put together:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, you do not make it. You append a precise request to
`loops/handoff/pivot/design-docs.md` — a file only you own — stating the file, the exact change, the
reason, and the signature or event shape other worktrees will depend on. A single reconciliation
pass applies every request at the end.

Design your own code so someone else can wire it in with one edit. Export a clean entry point;
never reach into the shell. Concretely, for this worktree:

* **Do not put a fetch in `useControlRoom.ts`.** Your data layer is
  `client/src/control-room/designdoc/useDesignDocs.ts`, and it opens its own subscription to
  `/ws/control-room?projectId=`. That is a second WebSocket per project, and it is the honest cost
  of not touching the hot file. File a request for a shared `subscribeControlRoom()` seam and let
  reconciliation collapse the two.
* **Do not add a page to `ControlRoomApp.tsx`.** Export exactly one component,
  `DesignDocumentsPage`, from `client/src/control-room/designdoc/index.ts`, taking
  `{ projectId }` and nothing else. The shell's wiring is then one import and one line.
* **Do not add a type to `server/types/`.** Export your types from `server/services/designDoc.ts`
  and request their move to `server/types/designDoc.ts` at reconciliation. A type in the wrong file
  is a rename; a conflict in `server/types/project.ts` is an afternoon.
* **Do not extend `server/routes/uiContract.test.ts`.** Guard your UI↔API shapes in
  `client/src/control-room/designdoc/designDocContract.test.tsx` and request the fold-in. The
  shapes still get guarded in the same iteration as the call; only the file differs.

**What you leave behind for reconciliation** is in §9. Write it as you go, not at the end.

### 0.1 Requests filed so far

Seed the handoff file with these on the first iteration; they are known before a line is written.

```text
EVENTS   server/services/controlRoomEvents.ts — three additive members, never a rename:
         { type: "designdoc_presence"; docId; agentId; areaId?; source: "derived" | "reported";
           granularity: "section" | "lines"; sectionAnchor?; ranges?: Array<{from:number;to:number}>;
           mode: "reading" | "working"; documentVersion: number; reportedAt: string;
           expiresAt: string; note?: string }
         { type: "designdoc_changed"; docId; sectionAnchor?; version: number; byActorId: string }
         { type: "designdoc_declaration"; docId; state: "valid" | "invalid" | "applied";
           errorCount: number }

MCP      server/services/projectMcpServer.ts — one import and one call:
           import { registerDesignDocTools } from "./designDoc";
           registerDesignDocTools(server, ctx);
         Registers read_design_document, report_document_focus, list_design_documents.
         Also append those three names to PROJECT_MCP_TOOLS (:706).

MCP      server/services/projectMcpServer.ts:245 — submit_design_suggestion gains three
         optional fields: targetDocId, targetSectionAnchor, lineRange {from,to}. Additive.
         Do NOT write a second suggestion system; see §3.9.

RULES    server/services/acpSessionManager.ts — rulesFor() (:104) appends
           designDocBriefing({ docs, areaId })  exported from server/services/designDoc.ts
         so the presence cadence reaches the agent. One import, one concatenation.

TYPES    server/types/designDoc.ts — move the types currently exported from
         server/services/designDoc.ts, unchanged in shape.

CLIENT   client/src/control-room/ControlRoomApp.tsx — one import, one page entry:
           import { DesignDocumentsPage } from "./designdoc";
         The page takes { projectId } and owns everything below it.

CLIENT   client/src/control-room/useControlRoom.ts — export a subscribeControlRoom(projectId, fn)
         seam so the design-document page can share the existing socket instead of opening
         a second one.
```

**How to raise anything else.** Do not edit across the line and do not work around it. Append it to
the handoff file with the `file:line`, what you observed, and what you propose. This is the same
mechanism the product itself is built on: `DesignSuggestion` (`server/types/project.ts:95-118`),
the `submit_design_suggestion` MCP tool (`server/services/projectMcpServer.ts:245`), and the
accept / edit / reject / request-revision queue in `client/src/control-room/ReviewQueues.tsx`. A
worktree that "just fixed" a file it does not own is the exact failure this product exists to
prevent, demonstrated on the product's own source.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

```bash
./node_modules/.bin/grok --version   # expect: a version line, not an error
bun run verify                       # expect: exit 0 — typechecks, tests, build, four audits
bun run audit                        # expect: 0 orphans, every endpoint covered
```

Capture verify's output to a file, never `>/dev/null`. **A red gate is always the highest-priority
work, ahead of any checklist item** — including a gate you did not turn red. `bun run audit`
includes the endpoint audit, so every route you add to `server/routes/designDocs.ts` needs a caller
in the same iteration or the gate goes red on you.

There is no xAI credential on this machine. `~/.grok/config.toml` points at `api.openai.com` and
`grok models` reports "You are not authenticated." **Nothing in this worktree needs one.** If you
find yourself blocked on an xAI key, you have wandered into worktree 04's work — stop and re-read
§0.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 17 NOT TESTED
Gate: inherited — both typechecks, the production build, four audits, and the existing suite.
      Nothing in DD-001…DD-017 has been attempted.
```

What exists today that this loop builds on, with the lines to read before changing anything:

```text
server/types/project.ts:49-58        DesignDocumentVersion — version, content, authorId,
                                     changeSummary, fromSuggestionId. Keep these names.
server/types/project.ts:60-65        DesignDocument — id, title, currentVersion, versions[]
server/types/project.ts:273-291      Project.document — ONE document, embedded. This is the
                                     shape the new cardinality inverts. Read §3.3.
server/types/project.ts:79           Requirement.designSection — a section link with no producer.
                                     The scar §3.5 exists to avoid.
server/types/project.ts:95-118       DesignSuggestion with baseVersion / stale. Reuse as-is.
server/types/project.ts:135-136      TaskTestRun.parsed — "an honest unknown, never treated as
                                     success". §3.8 borrows this exact idea for presence.
server/types/project.ts:214-231      AgentMessage — kind, links, threadId, replyToId
server/services/projectStore.ts:151  why every mutation is synchronous. Read it twice.
server/services/projectStore.ts:294  updateDocument — optimistic concurrency, VersionConflictError
server/services/projectStore.ts:327  the stale sweep on pending suggestions
server/services/secrets.ts:113       assertNoSecrets, already called on every document write
server/services/controlRoomEvents.ts:67   the 50-event replay history — a bus, not a store
server/index.ts:82                   /ws/control-room upgrade; projectId required
server/services/projectMcpServer.ts:20    ProjectMcpContext — "the identity is not a parameter"
server/services/projectMcpServer.ts:692   DELIBERATELY_USER_ONLY — do not weaken it
server/services/acpSessionManager.ts:104  rulesFor — where a briefing reaches a session
server/services/taskBriefing.ts:1-15      why a briefing must exist on day one
shared/designDocument.ts:14-21       why a loose parse turns prose into phantom requirements
client/src/control-room/DesignDocumentPanel.tsx  the whole surface today: one textarea
```

Open, and not a checklist failure:

```text
X-1  the current UI is a monospace `<textarea>` with Save and Import
     (`client/src/control-room/DesignDocumentPanel.tsx:78-88`). Its *comment* at :14-17 encodes
     the rule that matters — agents never write here, they suggest — and that rule survives
     verbatim. The textarea does not. Do not extend it; replace it.
X-2  `Project.document` is singular and embedded. Until the reconciliation pass moves the
     document out of `Project`, this worktree keeps its own store and treats the embedded
     document as legacy. §3.3 says how, and §9 lists it as a handback.
X-3  export to a document asset (DD-017) depends on `server/services/assetStore.ts`, owned by
     02-assets. It is the last stage of §3.11 and the only item that may be held.
```

---

## 3. What must be built

### 3.1 A design document is not a document asset

Get this distinction exactly right; everything else follows from it.

| | design document | document asset |
|---|---|---|
| what it is | the interactive interface | an output |
| who writes it | the user, plus agent suggestions | an agent, through the asset store |
| lives in | `server/services/designDoc.ts` (this worktree) | `server/services/assetStore.ts` (02) |
| declares work | **yes — it is the only thing that does** | no |
| has presence | yes, at line granularity | at deliverable granularity |
| versioned | yes, per section, restorable | yes, by the asset store |
| appears on | the DESIGN DOCUMENTS page | the ASSETS page |

They meet in exactly one place, in one direction: a design document can be **exported** to a
document asset (§3.10). That is a one-way copy with provenance. There is no import back, no
sync, and no shared record. Two objects that sync are two objects that disagree, and the
disagreement surfaces in front of a customer.

A user will ask why their design document is not on the ASSETS page. The answer is a sentence the
UI must actually say: *this is where you say what you want; the Assets page is where what you asked
for lands.*

### 3.2 The object model

```text
DesignDoc {
  id, title,
  followedByProjectId?: string      // AT MOST ONE. §3.3. The whole cardinality rule is this field.
  sections: DocSection[]            // ordered
  manifestVersion: number           // bumps only on add / remove / reorder of sections
  declaration?: ProjectDeclaration  // the parsed block, or absent. §3.4
  createdAt, updatedAt
}

DocSection {
  anchor,                    // minted at creation, NEVER derived from the title. §3.5
  index, title,
  areaId?,                   // the single link to a colour-coded work area
  body,                      // markdown
  currentVersion: number,
  versions: DocSectionVersion[],
  firstLine: number          // derived on read, never stored. §3.8 explains why.
}

DocSectionVersion { version, body, createdAt, authorId, changeSummary?, fromSuggestionId? }
```

`DocSectionVersion` is `DesignDocumentVersion` (`server/types/project.ts:49-58`) with the field
names unchanged, and `body` in place of `content` because a section is not a document. Keep
`authorId` and `fromSuggestionId`: they are what make a version history readable as provenance
rather than as a diff.

**Why sections and not one blob.** Today the document is a single markdown blob per version. One
blob means two agents proposing against two different parts of the document conflict with each
other every time, and the stale sweep (`server/services/projectStore.ts:327`) marks both stale when
one lands. Version at the section; keep `manifestVersion` on the document for structural change,
which is rarer and may be coarse.

**`designDoc.ts` must stay synchronous.** Read `server/services/projectStore.ts:151` before writing
a line of it. A mutation is read-file → change in memory → write-file, and atomicity of the *write*
is not atomicity of the *sequence*. It is safe only because no `await` occurs inside it, so the
event loop cannot interleave two updates and lose one. Several agents and one human editing at
once is this product's normal state. Add an invariant test that fails if any method on the store
becomes `async`, mirroring `projectStoreInvariants.test.ts`, and make it also fail if the
explanation is deleted from the source.

### 3.3 Cardinality: one project per document, many documents per project

The rule, stated exactly:

```text
one project  may follow  MANY documents
one document may be followed by  AT MOST ONE project
never two projects on one document
```

**Where it is enforced: in the shape, not in a check.** `DesignDoc.followedByProjectId` is a single
optional string on the document. A single field cannot hold two projects, so the illegal state is
unrepresentable. The project's list of documents is a *derived query* —
`listDocumentsForProject(projectId)` scans the store and filters — and is never stored.

This is the same decision as `section.areaId` in the assets model, and it is made for the same two
reasons: the link lives on the object whose cardinality is "at most one", and a check is one lookup
on the record being mutated with no traversal and no ambiguity about which of two records is
authoritative.

The alternative — `Project.documentIds: string[]` — is representable, wrong, and silent. Two
projects both listing document `d7` is a legal array on both sides. Nothing fails. The UI shows the
document under two projects, two teams read it as their brief, and the first person to notice is the
user. **Add an invariant test that fails if a `documentIds` array is ever added to the project
type.** That test is cheap and it is the only thing standing between this design and the obvious
refactor someone will propose in three weeks.

Operations:

* `followDocument(docId, projectId, actor)` — refuses when `followedByProjectId` is already set to
  a different project, throwing `DocumentAlreadyFollowedError {docId, currentProjectId,
  requestedProjectId}`. The error carries all three ids because "already followed" alone cannot be
  rendered into anything a user can act on — the UI must be able to offer "open the other project"
  as the next click.
* `unfollowDocument(docId, actor)` — **a user action only.** It is never an agent tool. An agent
  that could detach a document from its project could detach itself from its own brief.
* re-following the same project is idempotent and not an error.
* deleting a project unfollows its documents; it does not delete them. **A design document outlives
  its project.** The document is where the next project comes from, and a user who deletes a failed
  project and loses the brief they spent an hour writing will not open the product again.

### 3.4 How a project declares itself in a document

Documents are the only asset type that declares work, and this is the mechanism.

A design document may contain **exactly one** fenced `project` block:

````text
```project
name: Q3 Enterprise Deck
category: slides
budget: 25.00
areas:
  - Research: prospect and competitor material
  - X: the @acme timeline
  - Slides: deck assembly and imagery
  - Video: narration and motion assets
```
````

Parsing rules, all of them deliberate:

* **strictly delimited, never inferred from prose.** `shared/designDocument.ts:14-21` records why:
  a loose pattern turns ordinary bullets into requirements, and a project full of phantom
  requirements is worse than a project with none. The same failure here produces a team assembled
  against areas nobody asked for, each one spending money;
* `name` and `category` are required. `category` is one of the five asset types —
  `documents`, `slides`, `tables`, `workflows`, `software` — because the category names the kind of
  thing the project makes;
* an **unknown key is an error**, not an ignored line. A user who writes `bugdet: 25` and sees no
  error believes they set a budget;
* a **second `project` block is an error** naming both line numbers;
* `budget` is optional. `areas` is optional; zero areas means one implicit area covering the whole
  document;
* the parser is **pure and total**. It returns `{ ok, declaration?, errors: Array<{line, message}> }`
  and never throws. Every error carries a line number, because an error without a line number in a
  200-line document is a scavenger hunt;
* there is **one parser, on the server**, exported from `server/services/designDoc.ts` and reached
  by the client through `GET /api/design-docs/:docId/declaration`. Do not write a client copy.
  `shared/designDocument.ts` exists in this repository precisely because the CLI and the browser had
  two parsers and drifted about what a project's requirements were.

**Parsing is automatic and continuous. Applying is a human click.** The document view shows a strip:
"This document declares a project: Q3 Enterprise Deck, 4 areas — Create project" or "This document
declares a project, but line 14 has an unknown key `bugdet`." Nothing is created, no team is
assembled and no money is spent until a person presses the button. That preserves the one human
approval gate the retired product proved was the right amount of ceremony, rendered as a sentence
rather than a table.

Re-applying after the block changes is also a click, and the diff is shown: areas added, areas
removed, budget changed. An area with an agent in it cannot be silently removed — removal is
refused while an agent is bound to it, and the refusal names the agent.

### 3.5 Sections, anchors and areas

A section is a `##`-heading-anchored region. Anchors are **minted at creation and never derived
from the title.**

The scar is in this repository, in the open: `Requirement.designSection`
(`server/types/project.ts:79`) is a free-text section name, accepted by the API, stored, mirrored
client-side — and set by nothing, in a product that closed 52 checklist items. A heading-derived
anchor is the same failure with an extra step: it works until a user renames a heading, and then the
area mapping detaches silently and nothing reports it.

**A link nobody can populate is a link nobody can trust. Before adding a field that connects two
things, name the code that writes it.** For `section.areaId`, that code is the area assignment
control on the document view and the declaration-apply path, and nothing else.

Rules for `areaId`, matching the boundary rule in `grok-workspace.md` §7:

* one area may own many sections; a section has at most one owning area;
* a section with no `areaId` is user-writable only;
* reassigning a section between areas is a user action, never an agent tool;
* an agent never writes a section, with or without a matching area — see §3.9. The `areaId` on a
  section is what scopes *presence* and *suggestions*, not a write permission. Write-time
  enforcement is `server/services/boundary.ts`, owned by 01-agents, and this worktree must not
  reimplement it.

### 3.6 Versioning, conflict and secrets — carried over unchanged in shape

* integer `currentVersion` plus an append-only `versions[]`, per section;
* `expectedVersion` on every write, and `VersionConflictError {baseVersion, currentVersion}`
  (`server/services/projectStore.ts:67-73`) when it does not match. The error carries both numbers
  because "conflict" alone renders into nothing a user can act on;
* the stale sweep (`server/services/projectStore.ts:327`): a pending suggestion written against an
  older version of *that section* becomes `stale` automatically. Scope the sweep to the section —
  today it is document-wide, and document-wide is why two agents working on two different parts
  invalidate each other;
* `assertNoSecrets` (`server/services/secrets.ts:113`) on every section write, agent or user. A
  design document is read by every agent on the project and exported to shared assets. A secret
  leaks further from here than from a private repository;
* `authorId` on every version, including user edits.

### 3.7 The in-document agent conversation

Clicking into a design document opens it, and inside you see three things at once: which project
follows this document, the agent conversation, and live highlighting of what each agent is reading
or working on. This section is the second of those.

**Reuse `AgentMessage` (`server/types/project.ts:214-231`) and `server/services/messaging.ts`.** The
message model already carries `kind`, `threadId`, `replyToId`, and a `links[]` array whose
validation rejects unlinked chatter (`validateLinks`) and whose loop guard escalates a runaway
thread to the user (`checkLoopGuard`). Both matter more in a product a salesperson operates than in
one an engineer operates, not less. Do not write a second message system.

What this worktree adds:

* a **document thread**: messages whose `links[]` contains `{kind: "document", id: docId}` and
  optionally `{kind: "document_line", id: "<docId>#<from>-<to>"}`. Both link kinds are additive
  members of `MessageLinkKind` (`server/types/project.ts:201-209`) and therefore a handoff request,
  not an edit;
* rendering the thread **anchored to the document**, not in a separate global log. A message with a
  line link renders beside those lines; a message without one renders in the document's thread
  column. `client/src/control-room/ConversationView.tsx:40` records that seven of eight link kinds
  render as dead chips today — a link that is not navigable is decoration. If you add a link kind,
  make it click through to the lines it names in the same iteration;
* the user can reply in the thread, and a reply is an `AgentMessage` with `kind: "answer"` from an
  `Actor {kind: "user"}`. The conversation is two-way or it is a log.

**Escalations belong here.** `escalate_to_user` already flips an agent to `waiting` on the event
bus. In a document-centred product the escalation should land *in the document*, next to the lines
that caused it, because "Research needs you" is useless and "Research cannot find a figure for
line 47" is actionable.

### 3.8 Line-level presence

This is the centrepiece of the surface and the part most likely to be built dishonestly. Read all
of it before writing any of it.

The requirement: agents must be forced to emit the line numbers they are reading or working on,
periodically, within a session, and that emission drives the highlighting.

The reality: **a model can simply forget to call a tool.** No amount of briefing makes it certain.
Any design that treats reported presence as ground truth will show a stale highlight sitting on
line 41 while the agent is somewhere else entirely, and the user's conclusion — correctly — is that
the product is lying. This section is mostly about that.

#### 3.8.1 Two sources, never conflated

```text
derived   emitted by the tool call itself. Section granularity. Reliable.
reported  emitted by the agent calling report_document_focus. Line granularity. Best-effort.
```

**Derived presence** is published by the server when a design-document MCP tool runs:
`read_design_document` publishes `reading` for the section range it returned; an accepted suggestion
against a section publishes `working`. This needs no cooperation from the model at all — it is a
consequence of the call, in the same way the assets surface derives presence from `read_section`.

**Reported presence** is the only way to get line granularity, and only the model can supply it.

`DocumentPresence` carries `source` and `granularity`, and the UI renders them differently. **Never
present reported presence as if it were derived, and never fill a gap in reported presence with a
derived guess.** A section highlight and a line highlight are different claims; showing the
section-wide one while labelling it "lines 41-58" is a fabrication, and
`verifiables.md` §22.18's rule against fabricated values is the reason the retired product's cost
figures were treated as a bug rather than a cosmetic complaint.

#### 3.8.2 The tool

Registered by `registerDesignDocTools(server, ctx)`, exported from `server/services/designDoc.ts`
and called from `server/services/projectMcpServer.ts` by handoff request.

```text
report_document_focus({
  docId: string,
  ranges: Array<{ from: number, to: number }>,   // 1-based, inclusive, max 20 ranges
  mode: "reading" | "working",
  note?: string                                   // one short phrase, shown to the user
})
```

`projectId`, `agentId` and `areaId` are **not parameters**. They are bound to the MCP server at
construction (`ProjectMcpContext`, `server/services/projectMcpServer.ts:20-35`: "the identity is not
a parameter"), which is why an agent cannot report presence as another agent or in another project.
Keep that property; it is the same property the boundary rule depends on.

Validation, all of it recorded rather than silently swallowed:

* ranges are clamped to the document's current line count. A range past the end is a report the
  agent got wrong: clamp it, set `outOfRange: true` on the record, and count it. Dropping it
  silently means the metric in §3.8.6 says the agent is reporting fine while it reports nonsense;
* more than 20 ranges, or more than 2000 lines total, is truncated with `truncated: true`;
* `note` is capped and rendered as the agent's phrasing, never parsed. **A string a model wrote is
  not a lookup key** — the retired product stored four unowned tasks by matching a model's phrasing
  of a role with `===` (iteration 81). The note is prose for the human; the ranges are the data.

Two companion tools, both of which also publish derived presence:

```text
read_design_document({ docId, fromLine?, toLine? })   // returns numbered lines, version, sections
list_design_documents()                                // docs this project follows, with anchors
```

`read_design_document` **returns line numbers in its output**. That is not a convenience: an agent
cannot report a line range it was never shown. If the tool returns bare prose, every subsequent
focus report is the model counting newlines, and it will be wrong.

#### 3.8.3 The briefing and the cadence

The instruction reaches the agent through `rules` at `session/new`, via `designDocBriefing()`
exported from `server/services/designDoc.ts` and concatenated in
`server/services/acpSessionManager.ts:104` by handoff request.

`server/services/taskBriefing.ts:1-15` records why this must exist on day one: before it, launching
an agent opened a session, said nothing, and the agent sat idle while the user watched a button
they had already pressed. A capability nobody was told about is a capability nobody uses.

The cadence the briefing states, in these words or better:

```text
The people watching this project are reading the same document you are, and they can see where
you are working — but only because you tell them. Call report_document_focus:

  - immediately after you first read the document, before you do anything else;
  - whenever you move to a different part of it;
  - at least once a minute while you keep working in the same part;
  - once more, with mode "working", before you finish your turn.

read_design_document gives you numbered lines. Report those numbers, not your estimate of them.
This is not optional bookkeeping: a person is waiting to see it move.
```

Then the honest part, which belongs in this document and not in the briefing: **that instruction
will be followed most of the time and not all of the time.** Plan the UI for the miss rate, measure
it (§3.8.6), and do not write a checklist item that asserts an agent always reports.

#### 3.8.4 The lease, and the three states

Presence is held in `server/services/presence.ts` as a lease table, keyed by
`(docId, agentId)`, refreshed by every report and every derived emission, and cleared when the
session stops.

```text
DocumentPresence {
  docId, agentId, areaId?,
  source: "derived" | "reported",
  granularity: "section" | "lines",
  sectionAnchor?, ranges?: Array<{from, to}>,
  mode: "reading" | "working",
  note?, outOfRange?, truncated?,
  documentVersion: number,      // the version the ranges were reported against
  reportedAt, expiresAt
}
```

The field is `reportedAt`, not `at`. The name is doing work: everything the UI renders from this
record is a past-tense claim about what an agent said, and naming the field after the report rather
than after the state is what keeps the next person from writing "is reading" in the label.

Three states, each rendered differently, and a fourth that is not a state at all:

| state | condition | what the document shows |
|---|---|---|
| `live` | last emission ≤ 90 s ago, session running | filled highlight in the area colour, label "Research · reading lines 41-58" |
| `stale` | last emission 90 s – 10 min ago, session running | outline only, no fill, label "Research · last reported lines 41-58, 4m ago" |
| `unknown` | session running, never reported, or the document version moved (§3.8.5) | **no highlight at all**, one row in the presence strip: "Research is working in this document but has not reported which lines" |
| `ended` | session stopped, or > 10 min | the highlight is removed entirely |

**`unknown` is the important one, and it is `TaskTestRun.parsed` under a new name**
(`server/types/project.ts:135-136`: "False when counts could not be parsed — an honest unknown,
never treated as success"). The product knows the agent is alive, because the session is running
and the transcript is moving. It does not know where. Saying so costs one row and buys the user's
trust in every other highlight on the page.

**A `reading` lease with no expiry leaves a ghost dot forever after an agent crashes.** The TTL is
not an optimisation.

#### 3.8.5 The bug a naive implementation ships: line numbers move

The user edits the document while an agent is working in it. Section 3 gains four lines. Every
reported range for that document now points at the wrong text, and the highlight sits confidently
over the wrong paragraph.

The rule: **when the document's version advances, every reported presence record for that document
drops to `unknown` immediately, regardless of its TTL.** Not stale — `unknown`, because the ranges
are not merely old, they are wrong. The presence strip says "line positions are out of date; waiting
for the next report." Derived presence is unaffected: it is anchored to a section, and a section
anchor is minted and stable (§3.5).

That is why `documentVersion` is on the record, and why `firstLine` on a section is derived on read
and never stored. A stored line number is a line number that goes wrong on the next edit.

#### 3.8.6 Measure the report rate; do not assert it

An event stream is not a state store, and an instruction is not a guarantee. Both need evidence.

```text
presenceStats(docId, since?) -> {
  turnsWithDocumentRead: number,      // turns in which read_design_document was called
  turnsWithFocusReport: number,       // of those, turns with at least one report
  reportRate: number,                 // the ratio — the number that says how good this is
  medianGapSec: number,               // between consecutive reports within a session
  outOfRangeReports: number,
  agents: Array<{agentId, reportRate}>
}
```

Render it in the document's diagnostics strip, plainly labelled. Three reasons this is not
instrumentation vanity:

1. it converts "models sometimes forget" from a belief into a number, and a number can be improved
   by rewording the briefing and re-measured;
2. a report rate that collapses after a briefing change is a regression the gate can catch;
3. **a suspiciously clean result is a bug in the check.** A report rate of 1.00 across every agent
   is far more likely to mean the metric is counting derived emissions as reports than that eight
   models never forgot. Write a positive control: run an agent whose briefing omits the cadence and
   confirm the rate drops.

#### 3.8.7 The nudge, honestly labelled

When a turn calls `read_design_document` and has not reported focus for three minutes, the server
may append one reminder line to the next tool result:

```text
(You have not reported which lines you are working on for 3 minutes. Call report_document_focus.)
```

State plainly what this is: a nudge inside a tool result, which the model may or may not act on.
It is not enforcement, it cannot be enforcement, and the only thing that tells you whether it works
is the metric in §3.8.6 moving. Ship the metric before the nudge, or you are tuning blind.

**What is not allowed, in any form:** inferring a line range from the agent's prose, from its
transcript, from a file path it mentioned, or from where it was last time. The presence layer reads
tool calls and nothing else.

#### 3.8.8 A snapshot endpoint beside the stream

`GET /api/design-docs/:docId/presence` returns the live lease table. The client fetches it on
connect and on every reconnect.

**An event stream is not a state store.** The bus keeps 50 events per project
(`server/services/controlRoomEvents.ts:67`), so a client joining a busy project sees a truncated
history, and one that reconnects sees a replay it may already have applied. The retired product paid
for this lesson once: control-room events were published and dropped by the client — true of the
wire and false for the user (iteration 48).

### 3.9 What an agent may do to a document

```text
read        read_design_document, list_design_documents            yes
presence    report_document_focus                                  yes, and it is asked to
suggest     submit_design_suggestion, targeting a doc + line range  yes, for any section
write       nothing                                                 no. Not in its own area either.
follow      followDocument / unfollowDocument                      no. User only.
declare     applying the declaration block                         no. User only.
```

**Agents never write a design document.** Not through a tool, not inside their own area, not with a
scoped grant. The current panel's comment already encodes this
(`client/src/control-room/DesignDocumentPanel.tsx:14-17`) and it survives verbatim. The design
document is where the human states intent; an agent that can rewrite the brief can rewrite the
brief to match what it already did.

The suggestion path is the whole of the agent's write surface, and **it already works — it is the
best-preserved thing in the repository.** `DesignSuggestion` (`server/types/project.ts:95-118`)
carries `baseVersion` for conflict detection, `originalText` / `proposedText` / `reason` / `risks`,
and `originalProposedText` — the agent's wording retained after a user amends it, so provenance
survives editing. `submit_design_suggestion` (`server/services/projectMcpServer.ts:245`) is the
agent's end and `client/src/control-room/ReviewQueues.tsx` is the human's, with accept / edit /
reject / request-revision and stale detection.

Reuse it as-is. The only change is three optional fields — `targetDocId`, `targetSectionAnchor`,
`lineRange` — filed as a handoff request. **Do not write a second suggestion system.** If you find
yourself designing accept/reject buttons, stop and read `ReviewQueues.tsx:43-183` first.

One rendering requirement that is this worktree's job: a suggestion with a `lineRange` renders
**in the margin beside those lines**, not only in a queue on another page. A suggestion about line
47 that a user can only find by leaving the document is a suggestion that gets accepted without
being read.

### 3.10 Export to a document asset

One direction, one moment, full provenance.

`POST /api/design-docs/:docId/export` renders the current document to markdown and hands the bytes
to the asset store, producing an asset of type `document` with `origin: "exported"`, the source
`docId`, and the exact `manifestVersion` and per-section versions it was taken from. The design
document is unchanged. There is no back-sync and no live link: the asset is a photograph, and the
record says which moment it is a photograph of.

This is the last stage of §3.11 and the only one that may be held, because it calls
`server/services/assetStore.ts`, which 02-assets owns. Until that lands, do not ship a route that
returns a fake success and do not ship a button that does nothing —
`verifiables.md` §22.18 forbids both, and a control that does nothing is the fastest way to lose a
non-technical user. Hold the stage and say so in `VERIFICATION.md`.

### 3.11 Build order

This is the table §4 step 3 points at. Work top-down; each stage is testable before the next
begins.

**The owner has fixed the order across worktrees: AGENTS, ASSETS and DESIGN DOCUMENTS are built and
robustly tested first. Slide generation, workflow and video generation, and software generation come
after.** This worktree is in the first wave. Two consequences, both binding:

* nothing in stages 1–11 may import from `server/services/xai/**`, `server/services/render/**` or
  `server/services/software/**`. If a stage seems to need generation, it is specified wrong;
* stages 1–11 must be green, with recorded evidence, before worktrees 04 and 05 merge. A design
  document surface that is still moving underneath a generation pipeline is a debugging session with
  two unknowns.

| # | Stage | Done when |
|---|---|---|
| 1 | Types + store: `designDoc.ts`, the synchronous invariant, sections with minted anchors | DD-001, DD-006 |
| 2 | Cardinality: `followedByProjectId`, follow / unfollow, the refusal, the derived query | DD-002, DD-003 |
| 3 | Declaration: the strict parser, errors with line numbers, the human apply gate | DD-004, DD-005 |
| 4 | Versioning: per-section versions, conflict, the section-scoped stale sweep, secrets | DD-007, DD-008 |
| 5 | The agent's read/suggest surface and the refusal to write | DD-009 |
| 6 | Derived presence, emitted by the tool call | DD-010 |
| 7 | `report_document_focus`, the briefing, the lease | DD-011 |
| 8 | Staleness: the three states, version invalidation, the snapshot endpoint | DD-012, DD-013 |
| 9 | The report-rate metric and its positive control | DD-014 |
| 10 | The in-document conversation, anchored to lines | DD-015 |
| 11 | The page: open a document, see project + conversation + live presence together | DD-016 |
| 12 | Export to a document asset — depends on 02-assets | DD-017 |

### If the loop runs with nothing to do

1. **Composition checks.** List what the server publishes and what the client consumes, and diff
   them. That one command is how the dropped budget events were found. Every endpoint you added
   needs a caller — `bun run audit:endpoints` will tell you — and every new UI call needs its shape
   guarded in `client/src/control-room/designdoc/designDocContract.test.tsx` in the same iteration.
   The recurring lesson across iterations 42–47 is that **coverage of a surface is not coverage of
   its behaviour**: modules were reachable but unwired, endpoints declared but uncalled, MCP tools
   advertised but never invoked, events published and dropped.
2. **Re-derive a surprising result.** A presence report rate of 1.00, a conflict test that never
   conflicts, a parser that accepts everything you throw at it. Make each check fail on demand
   before believing it when it passes — and check the probes too. One round of audit probes in the
   retired product silently passed everything because the harness escaped its own backticks.
3. **Attack the line-number problem.** Edit a document while three agents hold presence in it, and
   look at what the screen claims. That is where this surface's defects are.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest item in the §3.11 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` against the DD-0NN item.
9. Commit with a message stating what was verified. Do not push.
10. Report honestly, including what did not move, and append anything you were tempted to edit
    outside §0 to the handoff file.

---

## 5. What counts as done

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run. A partially-satisfied item is NOT TESTED, not
PASS; say which clause failed and hold the item.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

#### DD-001: A design document exists independently of any project

Required result:

* a document can be created, retitled and read with no project in existence;
* it round-trips through a process restart with sections, order and versions intact;
* every method on the store is synchronous, and an invariant test fails if one becomes `async`;
* the reason is written in the source and deleting the explanation fails the test.

Evidence:

```text
Document created with no project:
Restart round-trip:
Deliberate async method → test output:
Explanation removed → test output:
```

#### DD-002: A document may be followed by at most one project

Required result:

* the link is a single field on the document, not an array on the project;
* following a document already followed by another project is refused with
  `DocumentAlreadyFollowedError` carrying all three ids;
* the refusal leaves `followedByProjectId` unchanged;
* an invariant test fails if a `documentIds` array is added to the project type;
* unfollow is refused for an agent actor and permitted for a user.

Evidence:

```text
Second follow attempt → error body:
followedByProjectId before/after:
documentIds invariant test output:
Agent unfollow attempt:
```

#### DD-003: A project may follow many documents

Required result:

* one project can follow three documents;
* `listDocumentsForProject` is derived by scan and nothing stores the list;
* deleting the project unfollows all three and deletes none of them;
* each document is still readable and re-followable afterwards.

Evidence:

```text
Documents followed:
Derived list:
After project deletion — documents present / followedByProjectId:
Re-follow:
```

#### DD-004: The declaration block is parsed strictly or refused with a line number

Required result:

* a valid block yields a declaration with name, category and areas;
* an unknown key is an error naming its line, not an ignored line;
* a second `project` block is an error naming both lines;
* a category outside the five asset types is refused;
* the parser never throws, on any input, including an empty document and a truncated fence.

Evidence:

```text
Valid block → declaration:
Unknown key → error:
Duplicate block → error:
Bad category → error:
Fuzz/edge inputs run, exceptions thrown:
```

#### DD-005: Creating the project from a declaration is a human action

Required result:

* parsing happens automatically and creates nothing;
* the project is created only by an explicit user action carrying the user's id;
* re-applying after an edit shows the diff of areas and budget before it is applied;
* removing an area that has an agent bound to it is refused, and the refusal names the agent.

Evidence:

```text
Documents parsed, projects created without a click:
Apply action actor id:
Re-apply diff shown:
Occupied-area removal refusal:
```

#### DD-006: Section anchors are minted and survive a retitle

Required result:

* an anchor is minted at section creation and is not derived from the title;
* renaming a section's heading leaves its anchor, its `areaId` and its version history intact;
* reordering sections bumps `manifestVersion` and changes no anchor;
* an area assignment survives both operations.

Evidence:

```text
Anchor at creation:
Anchor after retitle:
areaId after retitle and reorder:
manifestVersion before/after reorder:
```

#### DD-007: Section writes are versioned, conflict-detected and independent

Required result:

* each write appends a version carrying `authorId` and `changeSummary`;
* a write with a stale `expectedVersion` throws `VersionConflictError` carrying both versions;
* two different sections can be written concurrently without either conflicting;
* a suggestion pending against section A does **not** go stale when section B is written.

Evidence:

```text
Version history after 3 writes:
Stale write error body:
Concurrent two-section write:
Cross-section stale sweep result:
```

#### DD-008: A credential cannot be written into a design document

Required result:

* `assertNoSecrets` runs on every section write, agent-originated or user;
* the write is refused and the section's version is unchanged;
* the error names where the credential was found;
* an accepted suggestion carrying a credential is refused on the same path.

Evidence:

```text
Attempted write:
Refusal:
Section version after refusal:
Suggestion-accept path refusal:
```

#### DD-009: An agent cannot write a design document, and suggests instead

Required result:

* no MCP tool in this worktree writes a section, and a direct attempt is refused;
* the refusal names the suggestion path — a refusal that does not say what to do instead produces a
  stuck agent;
* a suggestion carries `targetDocId`, `targetSectionAnchor`, `lineRange` and `baseVersion`;
* accepting it produces a new section version with `fromSuggestionId` set and
  `originalProposedText` retained when the user edited the wording;
* the suggestion renders in the margin beside the lines it names.

Evidence:

```text
Direct write attempt → refusal text:
Suggestion record:
Version produced on accept:
Margin rendering (line range, screenshot or DOM assertion):
```

#### DD-010: Derived presence is emitted by the tool call, never by the agent's prose

Required result:

* `read_design_document` publishes `designdoc_presence` with `source: "derived"` and
  `mode: "reading"`;
* an accepted suggestion publishes `source: "derived"`, `mode: "working"`;
* an agent that says "I am now working on section 3" in prose, and calls nothing, publishes
  nothing;
* the client renders derived presence at section granularity without a page refresh.

Evidence:

```text
Events observed on /ws/control-room:
Agent prose containing a false claim → events published:
Rendered indicator and its granularity:
```

#### DD-011: `report_document_focus` produces line-level highlighting

Required result:

* the tool accepts ranges and publishes `source: "reported"`, `granularity: "lines"`;
* `projectId`, `agentId` and `areaId` come from the bound MCP context and cannot be passed as
  arguments;
* a range past the end of the document is clamped and recorded as `outOfRange`, not dropped;
* more than 20 ranges is truncated and recorded as `truncated`;
* the reported lines are highlighted in the owning area's colour within one second.

Evidence:

```text
Tool call and published event:
Attempt to pass a different agentId:
Out-of-range report → stored record:
Highlight latency:
```

#### DD-012: Presence goes stale honestly and never ghosts

Required result:

* a lease with no refresh moves to `stale` at 90 s and to `ended` at 10 minutes;
* a `stale` highlight loses its fill and its label reads in the past tense with an elapsed time;
* killing an agent mid-read removes its highlight entirely;
* an agent that is running and has never reported shows the `unknown` row and **no highlight**;
* a document version bump drops every reported record for that document to `unknown` immediately,
  regardless of TTL, and derived presence is unaffected.

Evidence:

```text
Lease at 0s / 95s / 11m:
Rendered label in each state:
Killed agent → presence after 90s:
Never-reported agent → rendered output:
Version bump → reported and derived records:
```

#### DD-013: Presence has a snapshot beside the stream

Required result:

* `GET /api/design-docs/:docId/presence` returns the live lease table;
* the snapshot matches what a fresh WebSocket replay would imply;
* a client reconnecting after more than 50 events on the bus shows correct presence;
* the client fetches the snapshot on connect and on every reconnect.

Evidence:

```text
Snapshot body:
Snapshot vs replay:
Reconnect after 60 events:
Fetches observed on reconnect:
```

#### DD-014: The report rate is measured, and the metric can fail

Required result:

* `presenceStats` reports turns with a document read, turns with a focus report, the ratio, the
  median gap and the out-of-range count;
* the figure is rendered, labelled as what it is, and is never rounded up to 1.00;
* a positive control — an agent briefed without the cadence — measurably lowers the rate;
* derived emissions are excluded from the numerator, proven by the positive control.

Evidence:

```text
Stats over a normal run:
Stats over the no-cadence control:
Difference:
Numerator excludes derived (how proven):
```

#### DD-015: The conversation lives in the document

Required result:

* a message linked to a document renders in that document's thread, not only in a global log;
* a message with a line link renders beside those lines and clicking it scrolls to them;
* the user can reply, and the reply is stored as an `AgentMessage` authored by the user;
* an escalation from an agent appears in the document at the lines that caused it;
* the existing link validation and loop guard still run on these messages.

Evidence:

```text
Document thread rendering:
Line-linked message and its navigation:
User reply record:
Escalation placement:
Loop guard fired on a runaway thread:
```

#### DD-016: Opening a document shows the project, the conversation and live presence together

Required result:

* clicking a document opens it and shows which project follows it, or that none does;
* the agent conversation and the live highlighting are visible on the same screen as the text;
* every agent shown carries a text label as well as a colour;
* no figure or state on the page is fabricated when the underlying value is absent.

Evidence:

```text
Rendered page (project, conversation, presence):
Text labels present on every agent indicator:
Absent-value rendering:
```

#### DD-017: Export to a document asset is one-way and carries provenance

Required result:

* export produces a `document` asset whose bytes are on disk before the record exists;
* the asset records the source `docId`, `manifestVersion` and per-section versions;
* the design document is unchanged and there is no back-sync path;
* until `server/services/assetStore.ts` is merged, the route and its button do not exist at all —
  no stub returning success, no control that does nothing.

Evidence:

```text
Asset record and provenance:
Document version before/after export:
Back-sync paths in code (expect: none):
Pre-merge state of route and button:
```

---

## 5a. Rules learned the hard way

Each exists because it was violated at least once, in this repository or in the research behind
this pivot. No rule without its bug.

- **A link nobody can populate is a link nobody can trust.** `Requirement.designSection`
  (`server/types/project.ts:79`) is declared, accepted by the API, stored, mirrored client-side, and
  set by nothing, after 52 passing checklist items. Before adding a field that connects two things,
  name the code that writes it.
- **A string a model wrote is not a lookup key.** Plan generation stored four unowned tasks by
  matching a model's phrasing of a role with `===` (iteration 81). Presence ranges, section anchors,
  area ids and agent ids come from the tool call's bound context, never from the agent's text.
- **An event stream is not a state store.** Control-room events were published and dropped by the
  client — true of the wire, false for the user (iteration 48). Every live indicator on this page
  needs a snapshot endpoint beside it.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. A stale line highlight is a fabricated value with a colour on it. The same rule is why
  `$0.00 (estimated)` counts as a bug in this repository: `DEFAULT_RATES`
  (`server/services/usageAccounting.ts:31`) holds `gpt-4o`, `gpt-4o-mini` and `gpt-4.1` and no Grok
  model, so an unknown model returns `costUsd: 0` with `rateKey: null`, and `rateKey: null` is
  surfaced nowhere.
- **A loose parse turns prose into phantom objects.** `shared/designDocument.ts:14-21` says it about
  requirements. The declaration block is fenced and strict for the same reason, and the failure mode
  here is worse: phantom areas assemble a team, and a team spends money.
- **When safety comes from the absence of something, write it down.** The store is concurrency-safe
  only because no mutation contains an `await` — not from locking, not from atomic writes. State it
  in the source and let a test fail if the statement is deleted, exactly as
  `server/services/projectStore.ts:151` and `projectStoreInvariants.test.ts` do.
- **Verify through the production code path.** A probe proves the protocol works; only the real
  service proves the product works. Three items in the retired product were once marked PASS on
  evidence that was real but unreachable.
- **Test the failure path.** A user editing while three agents hold presence, a reconnect after the
  50-event history rolled over, a document followed twice, a `project` block with a truncated fence.
  Those are where the defects are, not in the happy path.
- **A suspiciously clean result is a bug in the check.** An audit that returned all zeros was a
  broken shell variable, not clean code. A presence report rate of 1.00 is the same shape of claim.
- **Assert the effect, not the prose.** A live test in which an agent replied fluently and wrongly
  that a file contained no such value passed three re-runs (iteration 56). For presence, the effect
  is the published event and the stored lease — never the agent's sentence about where it is.
- **Put the reply, stop reason and tool-call count in the failure message.** Asserting an effect and
  discarding the evidence makes the next failure undiagnosable; one flake went unexplained for
  twenty iterations that way (iteration 61).
- **A live test that flakes may be measuring a badly-posed instruction, not the model.** A
  long-standing flake was finally captured as an agent correctly reading an ambiguous instruction
  (iteration 63). If focus reports stop arriving, suspect the briefing's wording before the model.

---

## 6. Where the owner's assumptions are wrong

Stated plainly, because designing quietly around them produces a product that cannot be explained.

1. **Model-driven presence cannot be made reliable, only measured.** The brief asks that agents "be
   forced" to emit line numbers. Nothing in the transport can force a tool call: the agent runs
   `grok agent --always-approve stdio` (`server/services/acpClient.ts:28`) and chooses its own
   tool calls. This document specifies the strongest available version — a bound-identity MCP tool,
   an explicit cadence in `rules`, a nudge in the tool result, a lease with honest expiry, and a
   measured report rate — and it will still miss. The design that follows from that is §3.8.4's
   `unknown` state, not a better prompt.
2. **A design document is not one of the five asset types, and the UI must say so.** The five
   asset types include `documents`, which is what makes this confusing rather than obvious. A
   document asset is an output; a design document is the interface. §3.1 is the answer, and the
   product has to state it in words, not imply it with placement.
3. **Slides cannot be delegated to Grok.** Two surfaces appear to generate decks and neither is
   callable from a server: the "Grok for PowerPoint" Microsoft 365 add-in is an add-in panel inside
   Office, and grok.com producing a downloadable `.pptx` is the consumer chat product. Both are
   user interfaces. **There is no xAI slide or document generation API — none, for PPTX, DOCX or
   PDF.** We generate slide *content* with the chat API as structured JSON and render the `.pptx`
   ourselves with a Node library. That is worktree 04's build, not this one's; it appears here only
   because a document may declare `category: slides`, and declaring a category declares intent, not
   a capability that exists in wave one. Video is the opposite case: the Imagine video API is real,
   documented, priced and callable from a server.
4. **`Project.document` is singular today, and the cardinality change inverts it.**
   `server/types/project.ts:281` embeds one document in the project. The new rule is many documents
   per project and one project per document, so the link has to move onto the document and the
   embedded field has to be retired. That is a hot-file change (`server/types/project.ts`), which is
   why §9 hands it to reconciliation rather than doing it here.
5. **Line numbers are not stable identifiers.** Any design in which a stored record points at a line
   number is wrong on the next edit. Ranges are transient presence data with a `documentVersion`
   stamp; anchors are the stable identifiers. §3.8.5.
6. **The suggestion mechanism already exists and must not be rebuilt.** `DesignSuggestion`,
   `submit_design_suggestion`, the `baseVersion`/`stale` conflict detection and `SuggestionQueue`
   are complete and working. Adding three optional fields is the entire change.
7. **Boundaries are enforced nowhere at write time, and this worktree does not fix that.**
   `assertAgentCanWrite` (`server/services/repository.ts:261`) and the whole `ApprovalQueue`
   (`server/services/approvals.ts`) have zero production callers, and
   `server/hooks/shellSafetyHook.ts` is not installed by this repository and only classifies shell
   commands. Git worktrees made a stray edit *recoverable*, never *prevented*. A real boundary needs
   a PreToolUse hook that canonicalises every path argument **and** calls `process.exit(2)` — a deny
   in stdout JSON is ignored under `--always-approve` — or structured MCP-mediated writes carrying
   `{projectId, agentId, areaId}`. That work is `server/services/boundary.ts`, owned by 01-agents.
   This surface is safe from it by construction, because agents cannot write a design document at
   all (§3.9), and it must not claim a guarantee it does not own.
8. **The resources backend exists and no client code has ever called `/api/library`.** If you find
   yourself building a prompt or skill editor into the document view, stop: that is worktree 06's
   Tools panel, and the backend it needs is already written.
9. **Cost.** This surface spends nothing directly — reading and suggesting are text turns. It must
   still never render a cost figure without its source, because every figure in the shipping product
   today is very likely `$0.00`, and per-tool-call attribution is structurally impossible on ACP,
   which returns one usage object per *turn*. Per-task cost is tracked. Do not put per-tool-call
   cost on this page or in this checklist.

---

## 7. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

* **a change would fall outside §0.** Append it to `loops/handoff/pivot/design-docs.md` and
  continue with your own work. Do not edit another worktree's files, even when you are certain, and
  do not run git commands beyond committing your own branch;
* **an action needs credentials that were not provided.** Nothing here should, and if something
  does, it is misplaced work;
* **an irreversible or outward-facing operation needs approval** — deleting a user's design
  document, deleting a tracked file, publishing, or spending. Deleting a design document destroys
  the only record of what a user asked for and this repository has an eighty-iteration precedent
  for stopping on exactly this;
* **two requirements contradict each other**, including between this document and a sibling loop
  document, or between this document and `grok-workspace.md`. Name both sides with `file:line` and
  stop;
* **the cardinality rule conflicts with a real user need** — for example, two teams wanting to work
  from one brief. The answer is probably a second document, not a second project on one document,
  but that is the owner's call and it changes the store shape;
* **the presence report rate is so low that the feature misleads.** If DD-014 measures a rate that
  makes the highlighting worse than no highlighting, say the number and stop. Shipping a feature
  that is wrong most of the time is worse than shipping the `unknown` row alone.

---

## 8. Definition of done

The design-document surface is complete when DD-001…DD-017 all read PASS with recorded, re-runnable
evidence in `VERIFICATION.md`; `bun run verify` is green; no item is NOT TESTED and no item is
BLOCKED; and the canonical demo runs end to end on this surface — a user writes one brief into one
document, the document declares the project and its four areas, one click assembles the team, and
the user watches four coloured highlights move through the text while the agents work, with the
`unknown` row shown honestly whenever an agent has not said where it is.

Only then output `The design document surface is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.

---

## 9. What this worktree hands back

```text
branch    pivot/design-docs
handoff   loops/handoff/pivot/design-docs.md
merges    07-shell first, then 01 / 02 / 03 together, then 04 / 05 / 06, then 08.
          The three pages merge as one wave because they are tested first.
```

**The public contract this worktree adds.**

```text
types      exported from server/services/designDoc.ts, for the move to server/types/designDoc.ts:
             DesignDoc, DocSection, DocSectionVersion, ProjectDeclaration,
             DeclarationError, DocumentPresence, PresenceState, PresenceStats
           errors: DocumentAlreadyFollowedError {docId, currentProjectId, requestedProjectId}
                   (VersionConflictError is reused unchanged from projectStore)

endpoints  GET    /api/design-docs
           POST   /api/design-docs
           GET    /api/design-docs/:docId
           PUT    /api/design-docs/:docId/sections/:anchor        {body, expectedVersion}
           POST   /api/design-docs/:docId/sections                {title, afterAnchor?}
           POST   /api/design-docs/:docId/follow                  {projectId}
           DELETE /api/design-docs/:docId/follow
           GET    /api/design-docs/:docId/declaration
           POST   /api/design-docs/:docId/declaration/apply       {actorId}
           GET    /api/design-docs/:docId/presence
           GET    /api/design-docs/:docId/presence/stats
           GET    /api/design-docs/:docId/conversation
           POST   /api/design-docs/:docId/conversation            {body, replyToId?, lineRange?}
           POST   /api/design-docs/:docId/export                  (held until 02 merges)

events     designdoc_presence, designdoc_changed, designdoc_declaration
           (shapes verbatim in §0.1; additive members only, never a rename)

mcp tools  read_design_document, report_document_focus, list_design_documents
           registered by registerDesignDocTools(server, ctx) from server/services/designDoc.ts
           plus three optional fields on submit_design_suggestion

exports    designDocBriefing({ docs, areaId }): string   — for acpSessionManager rulesFor()
           registerDesignDocTools(server, ctx): void     — for projectMcpServer
           DesignDocumentsPage from client/src/control-room/designdoc/index.ts, props { projectId }
```

**What we assumed about other worktrees, and what breaks if the assumption is wrong.**

```text
01-agents   that a work area has a stable `id` and a `colour`, and that an agent's area is
            resolvable from its id. Presence renders in the area colour; if areas turn out to be
            derived rather than stored, every presence record needs a different key.
01-agents   that write-time boundary enforcement lives in server/services/boundary.ts and that
            this surface is out of its scope, because agents cannot write documents at all.
02-assets   that assetStore exposes a persist path taking bytes plus provenance. DD-017 is the
            only item that depends on it, and it is last for that reason.
06-tools    that nothing in the Tools panel injects a second copy of the presence cadence into
            `rules`. If a skill also tells agents to report focus, the metric in DD-014 becomes
            uninterpretable — two instructions, one number.
07-shell    that the page selector mounts one component per page and passes `projectId`.
07-shell    that theme tokens exist for area colours in both light and dark. Presence highlights
            are the one place in this product where colour carries meaning at low opacity, and a
            fill that reads in dark can be invisible in light. Every indicator also carries a
            text label, so a failure here is ugly rather than wrong.
reconcile   that Project.document (server/types/project.ts:281) is retired in favour of the
            document store, and that the three MCP/rules/event wiring requests in §0.1 are applied
            in one pass. Until then this worktree's store is authoritative and the embedded
            document is legacy.
```
