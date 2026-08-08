# Assets — Loop Operating Document

This is the instruction set for one iteration of the Assets loop. Read this file first, act, then
stop. It is deliberately short; the files it points at hold the detail.

| Document | Role |
|---|---|
| `loops/02-assets.md` | This file. The Assets contract, the build order, and the checklist AS-001…AS-016. |
| `grok-workspace.md` | The product contract. What the system must become. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

ASSETS is one of the three headline pages, alongside AGENTS and DESIGN DOCUMENTS. It is every asset
in one place, in five types: **documents · slides · tables · workflows · software**.

> The Assets page holds outputs. It never declares work. The only thing that declares work is a
> design document, and a design document is not an asset.

Read that sentence twice. It is the single distinction this surface exists to keep straight, and §2
is nothing but that distinction.

**What this surface contributes to the canonical demo.** The user says "I need to do this sales
presentation." Four agents are assembled. The research agent reads existing material *out of* the
asset store. The X agent, the Imagine agent and the voice+Imagine agent write documents, slides and
clips *into* it. At the end the user opens ASSETS and sees every artifact with the agent that made
it, the capability that agent held, what it cost, and the lines of the design document that
declared it. If this page is missing, four agents produced work into a void.

---

## 0. Your boundary

**You are in a git worktree, on your own branch, in a checkout that is not the main one.** Seven
sibling worktrees are running at the same time on sibling branches, editing files right now. You
will not see their changes and they will not see yours until a single reconciliation pass at the
end. Everything below exists so that pass is possible.

```text
loop:    02-assets
branch:  pivot/assets
handoff: loops/handoff/pivot-assets.md
```

**The files you own.** Create, edit and delete these freely. Nothing else.

```text
server/services/assetStore.ts     the store: envelope, files, versions, persistence, provenance
server/routes/assets.ts           the HTTP surface, mounted at /api/assets
client/src/control-room/assets/** the page: the grid, the five type views, previews, the file tree
loops/02-assets.md                this file
loops/handoff/pivot-assets.md     your handoff file; only you write it
```

You may create additional files *inside* `client/src/control-room/assets/`, and tests beside the
two server files (`server/services/assetStore.test.ts`, `server/routes/assets.test.ts`). Those are
yours. Anything outside that list is not.

**The files you must not touch, and why.** Each is another worktree's row in the partition. An edit
here is a merge conflict at best and a silent contradiction at worst — two worktrees implementing
the same idea with different field names, discovered at reconciliation when neither can be backed
out.

```text
server/services/workArea.ts, boundary.ts, agentTeam.ts, agentRegistry.ts   01-agents
server/routes/agents.ts, client/src/control-room/agents/**                 01-agents
server/services/designDoc.ts, presence.ts                                  03-design-docs
server/routes/designDocs.ts, client/src/control-room/designdoc/**          03-design-docs
server/services/xai/**, server/services/render/**, server/routes/generation.ts   04-generation
server/services/software/**, client/src/control-room/software/**           05-software
server/services/promptLibrary.ts, usageAccounting.ts, costLedger.ts        06-tools-cost
server/routes/library.ts, client/src/control-room/tools/**                 06-tools-cost
client/src/main.tsx, index.css, tailwind.config.js, control-room/shell/**  07-shell
server/services/auth.ts, x/**, server/routes/users.ts, control-room/users/**  08-users-x
docs/USER-GUIDE.md                                                         guide
```

Read any of them. You must, in fact — every claim in this document is meant to be checkable against
source, and several depend on 03's and 04's shapes.

**The hot-file protocol.** These files are shared by everyone and **no worktree may edit them
directly**, because an eight-way conflict in any one of them costs more than all the feature work
put together:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, **you do not make it.** You append a precise request
to `loops/handoff/pivot-assets.md` — a file only you own — stating the file, the exact change, the
reason, and the signature or event shape other worktrees will depend on. One reconciliation pass
applies every request at the end.

Design your own code so someone else can wire it in with one edit. Export a clean entry point;
never reach into the shell. Concretely, for this loop:

* the `Asset` types cannot live in `server/types/asset.ts` — `server/types/*.ts` is hot. Export them
  from `server/services/assetStore.ts` and request the re-export in your handoff;
* your MCP tools cannot be registered by editing `server/services/projectMcpServer.ts`. Export
  `registerAssetTools(server, ctx)` from a file you own and request the one-line call;
* your routes cannot be mounted by editing `server/routes/api.ts`. Export the Hono router from
  `server/routes/assets.ts` and request the one-line `apiRoutes.route("/assets", assetRoutes)`;
* your events cannot be added by editing the `ControlRoomEvent` union in
  `server/services/controlRoomEvents.ts`. Request the additive members. Three worktrees need
  members on that union; whoever edits it first makes the other two conflict.

`server/services/projectMcpServer.ts`, `server/routes/api.ts` and
`server/services/controlRoomEvents.ts` are **not** in the partition and **not** in the hot list.
That is a gap in the partition, not a licence. Treat all three as hot. Record the gap in your
handoff so reconciliation knows it was deliberate.

**How to raise a cross-boundary concern.** Do not edit. File a suggestion — this is the mechanism
the product itself is built on and it already works: `DesignSuggestion`
(`server/types/project.ts:95-118`), the `submit_design_suggestion` MCP tool, and `SuggestionQueue`
in `client/src/control-room/ReviewQueues.tsx`. Outside the running product, write it in your
handoff file with the file, the line and what you believe is wrong, and stop. A worktree that "just
fixed" a file it does not own is the exact failure this whole product exists to prevent,
demonstrated on itself.

**What you leave behind for reconciliation.** See §9. Write it as you go, not at the end.

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
includes the endpoint audit, and every endpoint you add to `server/routes/assets.ts` must have a
caller in the same iteration or the gate goes red on you.

There is no xAI credential on this machine. `~/.grok/config.toml` points at `api.openai.com` and
`grok models` reports "You are not authenticated." Nothing that calls `api.x.ai` can be tested here
until that is fixed — see §7. This does not block you: uploaded assets, agent-written text assets,
listing, preview, versioning and provenance are all testable without a credential, which is why
this loop is in the first build wave.

---

## 2. The distinction this page exists to keep straight

A **design document** and a **document asset** are different objects, on different pages, owned by
different worktrees. Readers will confuse them. Users will confuse them. The interface must not.

| | DESIGN DOCUMENT | DOCUMENT ASSET |
|---|---|---|
| What it is | the interactive interface where work is declared and watched | an output the work produced |
| Page | DESIGN DOCUMENTS | ASSETS |
| Owned by | `03-design-docs`, `server/services/designDoc.ts` | this loop, `server/services/assetStore.ts` |
| Declares work | **yes — the only thing that does** | **never** |
| Addressed by | line number; agents emit the lines they are reading and the UI highlights them | file; it has no line-level presence |
| Cardinality | one project may follow several design documents; **one design document is followed by at most one project** | one asset belongs to exactly one project |
| Live view | the agent conversation and what each agent is reading, per line | who last wrote it, and a write lease if someone holds it now |
| Deleting it | orphans a project's declaration of what it is doing | removes one output |

Three rules follow, and each is enforceable:

1. **The Assets page offers no action that starts work.** No "build from this", no "make a plan from
   this document". If a user wants work declared, they open a design document. The provenance for
   this rule is in the repository: `Requirement.designSection` (`server/types/project.ts:79`) is a
   free-text link between a requirement and a document section, accepted by the API, stored, and
   mirrored client-side — and **set by nothing**, after 52 passing checklist items. Two surfaces
   that both look like "the doc" produce exactly that: a link that looks real and is never
   populated.
2. **The link runs one way.** An asset carries `declaredBy` — a back-pointer to the design document
   and the line range that declared it. A design document does not carry a list of assets; it is
   derived by querying assets by `declaredBy.designDocId`. One writer, one direction, no two records
   that can disagree about the same fact.
3. **A document asset that looks like a spec is still an output.** An agent may write a document
   asset titled "Q3 plan" full of imperatives. It declares nothing. If it should declare something,
   the user promotes its text into a design document, by hand, on the other page. Promotion is a
   user action. It is never an agent tool.

Slides and tables are further from confusion but the same rule holds: **only documents-on-the-
design-documents-page declare work.** Slides are PPTX rendering, tables are spreadsheet rendering,
and neither has ever declared anything.

---

## 3. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 16 NOT TESTED
Gate: inherited from the control room — 715 tests across 42 suites, both typechecks, the
      production build, four audits. Nothing in this checklist has been attempted.
```

What exists today that this loop builds on, with the lines to read before changing anything:

```text
server/services/projectStore.ts:148-162   the synchronous-mutation invariant. Read this twice.
server/services/projectStore.ts:67-73     VersionConflictError {baseVersion, currentVersion}
server/services/projectStore.ts:294-332   updateDocument — optimistic concurrency, stale sweep
server/types/project.ts:49-57             DesignDocumentVersion — the version record to copy
server/types/project.ts:95-118            DesignSuggestion with baseVersion/stale
server/types/project.ts:234-258           ArtifactKind / CodeArtifact — the weak ancestor of Asset
server/types/project.ts:321-329           changedFiles verified vs claimedChangedFiles
server/services/controlRoomEvents.ts:9-46 the event union (11 members); :67 the 50-event history
server/services/controlRoomEvents.ts:83   publish()
server/index.ts:82-89                     /ws/control-room upgrade, projectId required
server/index.ts:108-123                   subscribe + replay on open
server/routes/repository.ts:44-73         canonical() and assertManagedPath() — reuse verbatim
server/services/repository.ts:403-419     listRepositoryFiles — git ls-files, flat, capped at 500
server/services/projectMcpServer.ts:20-35  ProjectMcpContext — "the identity is not a parameter"
server/services/projectMcpServer.ts:594    create_artifact; :614 attach_artifact_to_requirement
server/services/projectMcpServer.ts:696    DELIBERATELY_USER_ONLY — do not weaken it
server/services/secrets.ts:113            assertNoSecrets, called on every document write
.refs/open-lovable/config/app.config.ts:8  Vercel sandbox timeout 15 minutes
.refs/open-lovable/config/app.config.ts:34 E2B sandbox timeout 30 minutes
.refs/open-lovable/types/sandbox.ts:1-27   SandboxFileCache — held in a process global, lost on restart
```

Open, and not a checklist failure:

```text
X-1   what a `workflow` ASSET is. §8.3. This document takes the reading that survives both
      answers and says which parts change under the other.
X-2   the cost ledger does not exist yet (06-tools-cost). Until it does, an asset carries its own
      charge records. That is a temporary duplication, written down here so it is removed rather
      than forgotten.
X-3   `server/services/projectMcpServer.ts`, `server/routes/api.ts` and
      `server/services/controlRoomEvents.ts` are in no worktree's row and in no hot list. This
      loop treats them as hot. Reconciliation must confirm that.
```

---

## 4. What must be built

### 4.1 One envelope, five types

All five types are the same record with a different `type`. Resist five parallel models: listing,
preview, versioning, provenance, the write lease, the cost roll-up and the boundary check are
identical work five times over if the types diverge.

```text
Asset {
  id, projectId,
  type: "document" | "slides" | "table" | "workflow" | "software",
  title,
  origin: "generated" | "uploaded" | "imported",

  declaredBy?: {                     // §2 rule 2 — the one link to a design document
    designDocId,
    designDocVersion,                // the version the range was read against
    lineStart, lineEnd,
    stale: boolean                   // set when the document moves past designDocVersion
  },

  producedByAgentId?,                // absent for a user upload; never defaulted to a fake agent
  capability?: "base" | "images" | "voice" | "voice+images",

  files: AssetFile[],                // the bytes of record, ordered
  preview?: AssetPreview,
  charges: AssetCharge[],            // §4.5 — individual charges, never a running total

  currentVersion: number,
  versions: AssetVersion[],
  writeLease?: { agentId, since, expiresAt },

  createdAt, updatedAt, deletedAt?
}

AssetFile {
  id, assetId, role,                 // role is type-specific: "body" | "slide" | "narration" | …
  path, bytes, sha256, mime, durationSec?,
  producedByAgentId?, capability?,
  model?, requestId?, prompt?,       // present for generated files, absent for uploaded ones
  createdAt
}

AssetVersion { version, createdAt, authorId, changeSummary?, fileIds: string[] }
AssetPreview { kind: "image" | "text" | "none", path?, text?, reason?, generatedAt }
```

`AssetVersion` is `DesignDocumentVersion` (`server/types/project.ts:49-57`) with the field names
unchanged, plus `fileIds`. Keep them unchanged: `authorId` and `changeSummary` are what make a
version history readable as provenance rather than as a diff.

**`preview.kind: "none"` carries a `reason`.** "Renderer not built yet", "file too large",
"generation failed". A preview pane that is empty and silent is indistinguishable from a broken
one, and this page ships before three of the five renderers exist (§4.8). Never render an empty
box.

What differs per type — and this is the whole of the per-type surface:

| type | the bytes of record | preview | listing shows | rendered by |
|---|---|---|---|---|
| `document` | one text file (`role: "body"`), plus embedded image files | first ~400 chars, rendered | word count, last writer | nobody — an agent writes text through this store |
| `slides` | a deck manifest JSON, one image per slide, narration audio + timings, and the rendered `.pptx` | one PNG per slide, in order | slide count, narrated y/n | **04-generation**, in our own code (§8.1) |
| `table` | a `.csv` and/or `.xlsx`, plus a sheet manifest | first 10 rows × 8 columns, as text | rows × columns | 04-generation |
| `workflow` | the step sequence as JSON, plus any rendered media | the step list; the first frame if video exists | step count, duration | 04-generation |
| `software` | the source tree under the asset directory, plus a zip export and a screenshot | the screenshot | file count, framework | **05-software** |

`document` is the only type that needs no renderer, which is why it is the type this loop can carry
to PASS on its own. Say that in the build order and mean it.

### 4.2 Storage — structured, not a free filesystem

There is no xAI document, slide or table generation API. None. Assembly is entirely our code, which
means the on-disk format is entirely our decision — so choose the one that makes boundaries
enforceable.

```text
<workspace>/assets/<assetId>/
  asset.json                    the envelope: type, title, origin, provenance, versions
  files/<fileId>.<ext>          the persisted bytes
  files/<fileId>.json           the per-file provenance sidecar
  files/<fileId>.timings.json   per-character TTS timings, when the file is narration
  preview/<...>                 generated previews — thumbnails, first-page render, screenshot
  src/                          software assets only: the source tree the agent edits
```

**The listing index is derived, never authoritative.** A `assets/index.json` may exist as a cache,
and it must be rebuildable from the directories by a command anyone can run. The incident that
earns this rule is in the repository: `listRepositoryFiles`
(`server/services/repository.ts:403-419`) answers "what files are here" with `git ls-files`, which
lists **tracked files only** — so a PNG an agent generated ten seconds ago is invisible, and the
answer looks authoritative. An index that can disagree with disk will disagree with disk, and the
lie is always in the direction of the thing that was just created.

**Agents never write these files directly.** Every mutation goes through a tool that carries
`{projectId, agentId, areaId}` bound at server construction — `ProjectMcpContext`
(`server/services/projectMcpServer.ts:20-35`): "the identity is not a parameter". That is the whole
reason to make the asset structured. The alternative — agents writing files wherever they like —
cannot be policed, because **boundaries are enforced nowhere at write time today**:
`assertAgentCanWrite` (`server/services/repository.ts:261`) and the entire `ApprovalQueue`
(`server/services/approvals.ts`) have zero production callers, and `server/hooks/shellSafetyHook.ts`
is not installed by this repository and only classifies shell commands, so a direct file-write tool
walks straight past it. Git worktrees made an out-of-bounds edit *recoverable*; they never
*prevented* one.

**The one exception, stated plainly:** a `software` asset's `src/` holds real files that `grok`
edits with its own tools. For that type only, path-level enforcement is required, it belongs to
`01-agents` (`server/services/boundary.ts`), and it is a PreToolUse hook that canonicalises every
path argument and calls `process.exit(2)` — a deny in stdout JSON is ignored under
`--always-approve`. Do not build it here. Do record on a software asset that its files are
directly-written, so the UI does not claim a guarantee it does not have.

**`assetStore.ts` must stay synchronous.** Read `server/services/projectStore.ts:148-162` before
writing a line of it. A mutation is read-file → change in memory → write-file, and atomicity of the
*write* is not atomicity of the *sequence*. It is safe only because no `await` occurs inside it, so
the event loop cannot interleave two agents' updates and lose one. Several agents writing at once is
this product's normal state. Add an invariant test that fails if any method on the store becomes
`async`, mirroring `server/services/projectStoreInvariants.test.ts` — and make it fail if the
explanation is deleted from the source, because a rule whose reason is gone gets "cleaned up" in six
months.

Persistence of bytes is the one place `await` is unavoidable. Keep it outside the store: a
`persistFile()` free function downloads or writes bytes and returns a descriptor; the synchronous
store method then attaches the descriptor. Downloading inside a mutation is how the invariant dies.

### 4.3 The URL is not the asset

Returned media URLs from `api.x.ai` are temporary. Images come back from
`POST https://api.x.ai/v1/images/generations`. Video is asynchronous —
`POST /v1/videos/generations` returns a `request_id` polled at `GET /v1/videos/{request_id}` with
status `pending | done | expired | failed`. Both expire.

**An asset does not exist until its bytes are on disk.** `persistFile()` accepts bytes, a base64
payload, or a URL it downloads *before* any record is created. There is no code path that stores a
remote URL as a file's reference. A deck that renders from remote URLs is broken by construction and
the breakage appears days later, in front of a customer.

**Agents cannot hand the store a URL at all.** `persistFile()` is an internal server API used by
`04-generation` and `05-software`. It is not an MCP tool, and no MCP tool takes a URL argument. An
agent that could pass a URL could persist anything on the network into a user's asset store.

**This applies to software previews too, and that is not obvious.** In the reference implementation
at `.refs/open-lovable`, the preview is a live sandbox URL whose lifetime is
**15 minutes** on Vercel (`config/app.config.ts:8`) and **30 minutes** on E2B (`:34`). The file
cache backing it lives in a process global (`types/sandbox.ts:1-27`,
`declare global { var activeSandbox }`) and is lost on restart. So a software asset whose reference
is its preview URL is dead in fifteen minutes, exactly like a generated image whose reference is its
generation URL. The asset of record for `software` is the source tree plus a zip export plus a
screenshot; the sandbox URL is a transient view with an expiry the UI must show.

**Store the TTS timings.** `with_timestamps` on `POST https://api.x.ai/v1/tts` returns
per-character timing; write it beside the audio as `<fileId>.timings.json`. It is how narration
syncs to a slide build deterministically, and it is how a duration check runs without
re-synthesising. Re-calling TTS to learn how long a clip is means paying for the clip twice.

### 4.4 Provenance — four questions, answered on every asset

Every asset answers, without the user asking:

1. **Which agent made this.** `producedByAgentId`, from the bound MCP context, never from anything
   the agent wrote in prose. A string a model wrote is not a lookup key: the control room stored
   four unowned tasks by matching a model's phrasing of a role with `===` (iteration 81).
2. **With which capability.** `capability` is one of `base | images | voice | voice+images`, chosen
   at agent creation by `01-agents`, and it decides which `api.x.ai` endpoints the agent may call. A
   `base` agent cannot have produced an image; if a file's `model` says `grok-imagine-image` and its
   agent's capability is `base`, that is a contradiction and the store refuses the write rather than
   recording it. Capability is a budget control at least as much as it is a feature flag.
3. **What it cost.** §4.5.
4. **Which design document declared it.** `declaredBy`, with the version the line range was read
   against.

**`declaredBy` goes stale honestly.** Line numbers move. When the design document advances past
`designDocVersion`, set `stale: true` and show it as "declared by lines 40–52 of *Q3 deck brief*,
as of version 7 — the document has since changed". Do **not** silently re-anchor the range: a
re-anchored range that guesses wrong is worse than a stale one that says so. This is the
`baseVersion` / `stale` behaviour of `DesignSuggestion` (`server/types/project.ts:95-118`, swept at
`server/services/projectStore.ts:324-329`), reused rather than reinvented, and it is the single
best-preserved mechanism in the repository.

**Verified, not claimed.** When an agent's submission lists files it says it produced, check the
list against what is on disk and record the agent's version separately when they disagree. That is
`claimedChangedFiles` (`server/types/project.ts:321-329`), whose comment says it exactly: its
presence means the agent misreported its own work, which is a signal about every other claim in the
submission, all of which are unverifiable. Keep the field name; keep the reason.

### 4.5 Cost on an asset, without a ledger yet

`06-tools-cost` owns `server/services/costLedger.ts`. It does not exist yet. Until it does, an asset
carries its own charges — and the shape must be the ledger's row shape so that adopting the ledger
is a move, not a rewrite:

```text
AssetCharge {
  id, assetId, fileId?,
  agentId, operation,              // "image_generation" | "video_generation" | "tts" | "turn" | …
  modelId, rateKey: string | null,
  units?: { kind: "images" | "video_seconds" | "characters" | "tokens"; count: number },
  costUsd: number | null,
  costSource: "billed" | "estimated" | "unknown",
  at
}
```

* `billed` means the figure came from `usage.cost_in_usd_ticks` on the generation response
  (1 USD = 10¹⁰ ticks), which covers chat, image and video;
* `estimated` means it was derived from a published rate — TTS at $15.00 per 1M characters, STT at
  $0.10/hr;
* `unknown` means `costUsd` is `null`. **It is not zero.** It is not verified that the TTS, STT or
  realtime endpoints return `cost_in_usd_ticks` at all; treat voice as `estimated` until a live
  response proves otherwise, and label it that way.

**Never render a cost without its source, and never render `null` as `$0.00`.** Today every figure
in the shipping product is very likely `$0.00`, because `DEFAULT_RATES`
(`server/services/usageAccounting.ts:31`) has exactly three keys — `gpt-4o`, `gpt-4o-mini`,
`gpt-4.1` — and no Grok model, so an unknown model returns `costUsd: 0` with `rateKey: null`
(`:79`), and `rateKey: null` is surfaced nowhere. A user reads `$0.00` as "cheap", not as "we do not
know the price of this model". An asset with a `null` charge shows `cost unknown`, with the model id
that could not be priced.

Rates, for the forecast and the checks: `grok-imagine-image` $0.02/image,
`grok-imagine-image-quality` $0.05/image, up to 10 images per request, 5 RPS flat across all spend
tiers; `grok-imagine-video` $0.050/sec, `grok-imagine-video-1.5` $0.080/sec, duration 1–15 s default
8, 480p/720p/1080p, audio generated by default, 10 RPS flat. A 60-second generated experience is
about **$5.52 in media alone** — three orders of magnitude more than a text turn, and one careless
retry loop is a $50 mistake. That is why the charge is recorded at the moment the file is persisted,
not waited for from an aggregate somewhere else.

**Per-tool-call attribution is structurally impossible** on the current transport: ACP returns one
usage object per *turn*, and `tool_call` updates carry no usage. A text-writing agent's turn cost
can only be *apportioned* across whatever that turn touched. Label an apportioned figure as
apportioned. Per-task cost *is* tracked (`server/services/projectStore.ts:1217`); do not rebuild it.

### 4.6 Reading assets — the cheap path first

Two read paths, and the difference between them is money.

**Local read — the default.** `list_assets(type?, q?)` and `read_asset(assetId)` MCP tools over the
structured store. Deterministic, free, no upload, and available to a `base` agent with no media
capability at all. Substring and title matching is enough for a workspace of tens of assets; do not
reach for embeddings before a user has complained.

**Remote read — semantic search over uploaded material.** xAI ships a Files API (upload documents,
**max 48 MB each**; text, markdown, code, CSV, JSON, PDF) and Collections for persistent
multi-document semantic search. Attaching a file to a chat implicitly enables the server-side
`attachment_search` tool, which turns the request agentic and **is charged per tool invocation**.
Three consequences, all of which belong in the UI, not in a comment:

1. uploading a user's asset to xAI is an outward-facing operation on someone else's material. It
   requires explicit per-asset consent, recorded on the asset as `xaiFileId` + `uploadedAt` +
   `uploadedBy`. Never upload as a side effect of a search;
2. an agent working through Collections spends money per query; the same agent working through
   `list_assets` spends nothing. Show which one it used;
3. a file over 48 MB cannot be uploaded. Refuse at selection time with the size, not at upload time
   with a provider error.

**Ingest.** A file the user drops onto the page becomes an asset with `origin: "uploaded"`, one
`AssetFile`, and no `producedByAgentId`. **Do not parse it into sections.** Sections belong to the
design document; an asset is bytes. `shared/designDocument.ts` exists because a loose pattern turned
prose into phantom requirements, and the same failure here produces a phantom outline nobody asked
for.

### 4.7 Live view — who wrote it, and who is writing it now

Three additive members on the `ControlRoomEvent` union
(`server/services/controlRoomEvents.ts:9-46`), published through
`getControlRoomBus().publish(projectId, …)` (`:83`) and delivered over `/ws/control-room`
(`server/index.ts:82-89`, subscribe and replay at `:108-123`). **Request them in your handoff; do
not edit the union.**

```text
{ type: "asset_added";   assetId; assetType; byAgentId?; declaredByDesignDocId?; costUsd: number|null; costSource }
{ type: "asset_changed"; assetId; version; byAgentId? }
{ type: "asset_writing"; assetId; agentId; expiresAt }
```

**The write lease is emitted by the mutation, never reported by the agent.** Every write through the
store refreshes `writeLease` for 90 seconds and publishes `asset_writing`. An agent that announces
"I am now working on the deck" is prose, and prose is not a lookup key.

**This is not the design document's line-level presence.** `03-design-docs` owns
`server/services/presence.ts`, where agents are required to emit the line numbers they are reading
inside a design document, and where the honest handling of a model that forgets to emit is 03's
problem to state. Your lease is a different, weaker, and more reliable thing: it is a side effect of
a write that actually happened. Do not build a second presence system, do not import 03's, and do
not label your lease "reading" — it only ever means writing.

**An event stream is not a state store.** The bus keeps 50 events per project
(`server/services/controlRoomEvents.ts:67`), so a client that connects into a busy project sees a
truncated history and a client that reconnects sees a replay it may already have applied. Ship
`GET /api/assets?projectId=` as the snapshot the client fetches on connect and on every reconnect,
with the lease state included. The control room already paid for this lesson: events were published
and dropped by the client — true of the wire, false for the user (iteration 48).

### 4.8 Ordering: this loop ships before the renderers

The owner has fixed the order. **AGENTS, ASSETS and DESIGN DOCUMENTS are built and robustly tested
first. Slide generation, workflow/video generation and software generation come after.** That is not
a preference to be optimised around; it is the build sequence.

For this loop, concretely:

* every checklist item AS-001…AS-016 must be reachable with **zero** renderers built. Use `document`
  assets, uploaded files and fixture bytes;
* the store accepts `slides`, `table`, `workflow` and `software` assets from day one as an envelope
  plus opaque files. It does not know how to make them and does not pretend to;
* the preview for a type whose renderer does not exist is `kind: "none"` with
  `reason: "renderer not built"`. The page says so in words;
* nothing in `server/services/assetStore.ts` may import from `server/services/render/**` or
  `server/services/xai/**`. Those are 04's, they do not exist yet, and a dependency on them would
  put this loop behind the second wave. The direction of the dependency is 04 → you.

### 4.9 The quick file tree

There are two trees, and the product must not conflate them.

**The asset tree — the default, and the one non-technical users see.** Assets → files, grouped by
type, with a lease dot on any node an agent currently holds and a cost figure on any node that has
charges. Served from `assetStore.ts`, not from git. It edits text files in place, through the same
versioned mutation path an agent uses: a user edit is an `Actor {kind: "user"}` write carrying
`expectedVersion`. That is what makes a user and an agent editing the same document collide loudly
instead of one silently overwriting the other.

**The source tree — `software` assets only.** What exists to build on:

```text
server/services/repository.ts:403-419        listRepositoryFiles — git ls-files, flat, cap 500,
                                             reports `truncated`, which nothing renders
server/services/projectMcpServer.ts:164      list_repository_files, MCP only, no HTTP route
server/routes/repository.ts:44-73            canonical() + assertManagedPath() — reuse verbatim
```

Three defects to fix rather than inherit: `git ls-files` lists **tracked files only**, so a file an
agent just generated is invisible — a software asset's `src/` is not a git repository at all, so
read it with a recursive directory walk and drop git entirely; the 500-cap `truncated` flag must be
rendered as "showing 500 of N" or the tree lies by omission; and nesting is client-side work, a trie
over the flat list, with no server change.

Any read-file or write-file endpoint you add routes through `assertManagedPath` and re-checks `..`
*after* canonicalisation. `canonical()` (`server/routes/repository.ts:44-57`) resolves through
symlinks and closes both the macOS `/var`→`/private/var` false refusal and the `<root>/link → /etc`
false approval, each found by a real test. Copy it; do not re-derive it. `GET /api/browse`
(`server/routes/api.ts:64`) is not a starting point: it lists directories only, filters dotfiles, and
has no path confinement at all — it will hand back any path on the machine.

### 4.10 The HTTP and MCP surface

```text
GET    /api/assets?projectId=&type=&q=          list + lease snapshot
GET    /api/assets/:assetId                     the envelope
GET    /api/assets/:assetId/files/:fileId       bytes, streamed, mime from the sidecar
GET    /api/assets/:assetId/preview             preview bytes, or 204 with { reason }
GET    /api/assets/tree?projectId=              the asset tree; ?assetId= for a software src tree
POST   /api/assets                              create — user upload or import
PATCH  /api/assets/:assetId                     title / type fields, requires expectedVersion
POST   /api/assets/:assetId/files               attach bytes (server-side callers only)
DELETE /api/assets/:assetId                     soft delete; user action only
```

MCP tools, exported as `registerAssetTools(server, ctx)`:

```text
list_assets(type?, q?)          free, local, available to a base-capability agent
read_asset(assetId)             envelope + text of text files; binary files return metadata only
create_asset(type, title, declaredBy?)
write_asset_text(assetId, fileId, body, expectedVersion)
```

No tool takes a URL. No tool deletes. No tool starts work. `DELIBERATELY_USER_ONLY`
(`server/services/projectMcpServer.ts:696`) is the precedent and it is the most important design
decision in that file: an agent cannot approve its own work, and by the same reasoning an agent
cannot delete a user's output or promote its own output into a declaration.

### 4.11 Build order

This is the table §5 step 3 refers to. Work top-down; each stage is testable before the next begins.

| # | Stage | Done when |
|---|---|---|
| 1 | Types + store: envelope, five types, synchronous invariant test | AS-001, AS-002 |
| 2 | The design-document distinction: `declaredBy`, staleness, no declare action | AS-003, AS-006 |
| 3 | File persistence: bytes-before-record, sha256, sidecars, timings | AS-004 |
| 4 | Provenance and charges, including capability contradiction refusal | AS-005, AS-016 |
| 5 | Versioning, conflict detection, secret scanning on text writes | AS-007, AS-008 |
| 6 | MCP surface: list/read/create/write, free and local | AS-009 |
| 7 | Consent-gated xAI upload, 48 MB refusal | AS-010 |
| 8 | Lease + events + snapshot endpoint | AS-014 |
| 9 | UI: the grid, five type views, honest previews | AS-011, AS-015 |
| 10 | The quick file tree; software asset survives its preview expiring | AS-012, AS-013 |

### If the loop runs with nothing to do

1. **Composition checks.** List what the server publishes and what the client consumes, and diff
   them. That one command is how the dropped budget events were found. Every endpoint you add needs
   a caller; `bun run audit:endpoints` will tell you.
2. **Re-derive a surprising result.** A suspiciously clean check is a bug in the check. An audit that
   returned all zeros was a broken shell variable, not clean code.
3. **Delete a duplication.** If `CodeArtifact` (`server/types/project.ts:246-258`) and `Asset` both
   survive an iteration, one of them is dead weight and the UI will eventually show both.

---

## 5. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest item in the §4.11 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` against the AS-0NN item.
9. Append anything you need from a hot file to `loops/handoff/pivot-assets.md`.
10. Report honestly, including what did not move and what you were tempted to edit outside §0.

---

## 6. What counts as done

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run. A partially-satisfied item is NOT TESTED, not
PASS; say which clause failed and hold the item.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

#### AS-001: An asset exists in five types and persists

Required result:

* an asset can be created with type `document`, `slides`, `table`, `workflow` or `software`;
* it round-trips through a process restart with its files, order and version history intact;
* an unknown type is refused, not stored.

Evidence:

```text
Created types:
Restart round-trip:
Refusal on unknown type:
```

#### AS-002: Every store mutation is synchronous

Required result:

* no method on `assetStore` is `async` or contains `await`;
* an invariant test fails if one becomes so;
* the reason is written in the source, and deleting the explanation fails the test;
* byte persistence happens outside the store and is proven to do so.

Evidence:

```text
Invariant test:
Deliberate async method → test output:
Explanation removed → test output:
Where the await lives:
```

#### AS-003: A document asset is not a design document

Required result:

* the Assets page exposes no action that declares work — no plan, no build-from-this, no promote;
* an agent has no tool that turns an asset into a design document;
* the only link between the two is `declaredBy` on the asset, and the design document stores no
  list of assets;
* the UI names the two things differently everywhere they appear together.

Evidence:

```text
Actions enumerated on the page:
MCP tools enumerated:
Direction of the link (grep both ways):
Rendered labels:
```

#### AS-004: A generated file is persisted before it is referenced

Required result:

* a file created from a URL has its bytes on disk before the record is written;
* the record stores a local path and a sha256, never the remote URL as the reference;
* a download failure produces no file record at all — no half-file;
* no MCP tool accepts a URL argument.

Evidence:

```text
File record:
Bytes on disk (size, sha256):
Download failure → records created:
MCP tool schemas grepped for url:
```

#### AS-005: Every asset carries its provenance

Required result:

* `producedByAgentId` and `capability` are present on every generated asset and absent — not
  defaulted — on every uploaded one;
* `model`, `prompt` and `requestId` are present on every generated file;
* a file whose `model` requires a capability its agent does not hold is refused, and the refusal
  names the capability;
* the page shows agent, capability and design document on every asset without a click.

Evidence:

```text
Generated asset record:
Uploaded asset record:
Capability contradiction → refusal:
Rendered provenance line:
```

#### AS-006: `declaredBy` points at a design document and goes stale honestly

Required result:

* an asset records `designDocId`, `designDocVersion` and a line range at creation;
* when the design document advances past that version the range is marked `stale`;
* a stale range is displayed as stale, with the version it was read against;
* nothing re-anchors the range automatically.

Evidence:

```text
declaredBy at creation:
Document version bumped → asset record:
Rendered label:
Grep for re-anchoring logic:
```

#### AS-007: Asset writes are versioned with conflict detection

Required result:

* each write appends a version carrying `authorId` and `changeSummary`;
* a write with a stale `expectedVersion` throws `VersionConflictError` carrying both versions;
* two files of one asset can be written concurrently without either conflicting;
* a previous version is restorable and the restore is itself a new version.

Evidence:

```text
Version history after 3 writes:
Stale write error body:
Concurrent two-file write:
Restore → version record:
```

#### AS-008: A credential cannot be written into an asset

Required result:

* `assertNoSecrets` (`server/services/secrets.ts:113`) runs on every text write, agent or user;
* the write is refused and the file is unchanged;
* the error names where the credential was found;
* an uploaded file is scanned too, and a refusal deletes nothing the user already had.

Evidence:

```text
Attempted write:
Refusal:
File version after refusal:
Uploaded-file case:
```

#### AS-009: An agent can find and read assets without spending anything

Required result:

* `list_assets` returns matching assets with id, type, title and a snippet;
* `read_asset` returns the current version and its number;
* a `base`-capability agent can do both;
* the operation records no charge, and the UI says the search was free.

Evidence:

```text
Query and results:
Capability of the calling agent:
Charges recorded:
Rendered cost label:
```

#### AS-010: Uploading to xAI requires consent and respects the limits

Required result:

* no upload occurs as a side effect of a search;
* consent is recorded on the asset with who granted it and when;
* a file over 48 MB is refused at selection with its size;
* a Collections-backed query records a charge with its `costSource`.

Evidence:

```text
Search without consent → uploads:
Consent record:
Oversize refusal:
Collections query charge:
```

#### AS-011: The page lists five types and previews honestly

Required result:

* documents, slides, tables, workflows and software appear on one page, filterable by type;
* each tile shows its type, its owning agent's colour, its state and its cost or `cost unknown`;
* a type whose renderer does not exist shows `preview unavailable` with the reason in words;
* no figure on the page is fabricated when the underlying value is absent.

Evidence:

```text
Rendered page (types, counts):
Tile fields:
No-renderer preview text:
Absent-value rendering:
```

#### AS-012: A software asset survives its preview expiring

Required result:

* the asset's reference is its source tree and its zip export, never a sandbox URL;
* after the sandbox lifetime has elapsed the asset still opens, lists its files and shows its
  screenshot;
* the UI shows the preview's expiry rather than a dead frame;
* the file list is read from disk, not from a process-global cache.

Evidence:

```text
Asset record (reference fields):
Post-expiry open:
Expiry shown as:
Restart → file list:
```

#### AS-013: The quick tree lists and edits

Required result:

* the tree lists assets and files, nested, grouped by type;
* a text file can be edited in place and produces a new version with the user as `authorId`;
* an edit against a stale version is refused with a message naming both versions;
* for a software asset, a file created a moment ago appears, and truncation is stated as
  "showing N of M".

Evidence:

```text
Tree output:
User edit → version record:
Stale edit refusal:
New file visible / truncation label:
```

#### AS-014: The page shows who is writing, without asking the agent

Required result:

* a write through the store publishes `asset_writing` and `asset_changed`;
* the lease expires within 90 s without a further write;
* agent prose claiming a write that did not happen publishes nothing;
* `GET /api/assets` returns the same lease state a fresh WebSocket replay would imply, including
  after 60 intervening events.

Evidence:

```text
Events observed on /ws/control-room:
Lease expiry:
Agent prose containing a false claim → events published:
Snapshot vs replay after 60 events:
```

#### AS-015: Versions are visible and restorable, and deletion is a user action

Required result:

* an asset's version history is visible in the UI with author and change summary;
* any earlier version can be restored;
* no MCP tool can delete an asset;
* deletion is soft, and a deleted asset's bytes survive until a user empties them.

Evidence:

```text
Rendered history:
Restore performed:
MCP tool list:
Deleted asset → bytes on disk:
```

#### AS-016: No cost figure is fabricated

Required result:

* every charge carries `modelId`, `rateKey` and `costSource`;
* a charge with no rate has `costUsd: null` and renders as `cost unknown`, never `$0.00`;
* an asset's total is the sum of its charges, and an asset with no charges renders no total;
* the model id that could not be priced is shown to the user.

Evidence:

```text
Charge records:
Unpriced model → rendered figure:
Asset with no charges → rendered total:
Model id surfaced:
```

---

## 6a. Rules learned the hard way

Each of these exists because it was violated at least once, in this repository or in the research
behind this pivot. No rule without its bug.

- **The URL is not the asset.** Generated image and video URLs from `api.x.ai` expire, and so does a
  software preview: 15 minutes on Vercel, 30 on E2B
  (`.refs/open-lovable/config/app.config.ts:8,34`). Any design that stores a returned URL as a
  reference is broken by construction, and it breaks after the demo, not during it.
- **A link nobody can populate is a link nobody can trust.** `Requirement.designSection`
  (`server/types/project.ts:79`) is declared, accepted by the API, stored, mirrored client-side, and
  set by nothing, after 52 passing checklist items. Before adding a field that connects two things,
  name the code that writes it.
- **A string a model wrote is not a lookup key.** Plan generation stored four unowned tasks by
  matching a model's phrasing of a role with `===` (iteration 81). Agent ids, asset ids and leases
  come from the tool call's bound context, never from the agent's text.
- **An index that can disagree with disk will disagree with disk.** `listRepositoryFiles` answers
  with `git ls-files`, so a file generated ten seconds ago is invisible while the answer looks
  authoritative. Derive the index from disk and make the rebuild a command anyone can run.
- **An event stream is not a state store.** Control-room events were published and dropped by the
  client — true of the wire, false for the user (iteration 48). Every live indicator needs a
  snapshot endpoint beside it.
- **Verified, not the agent's word for it.** `submitCode` checks the agent's changed-file list
  against the repository and records `claimedChangedFiles` only when the agent lied
  (`server/types/project.ts:321-329`). Do the same for files, or provenance is self-reported.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. `$0.00` with no `costSource` is a fabrication: `DEFAULT_RATES`
  (`server/services/usageAccounting.ts:31`) has three OpenAI keys and no Grok model, so an unknown
  model returns `costUsd: 0` with `rateKey: null` (`:79`), and `rateKey: null` is surfaced nowhere.
- **When safety comes from the absence of something, write it down.** The store is concurrency-safe
  only because no mutation contains an `await` — not from locking, not from atomic writes. State it
  in the source and let a test fail if the statement is deleted
  (`server/services/projectStore.ts:148-162` is the model).
- **A suspiciously clean result is a bug in the check.** An audit that returned all zeros was a
  broken shell variable, not clean code. Write a positive control for every check and make it fail
  on demand before believing a pass.
- **Test the failure path.** A download that dies halfway, a file written twice at once, a reconnect
  after the 50-event history has rolled over, a sandbox that expired mid-preview. That is where the
  defects are.

---

## 7. Where the owner's assumptions are wrong

Stated plainly, because designing quietly around them produces a product that cannot be explained.

### 7.1 Slides cannot be delegated to Grok

Two surfaces look like they generate decks, and neither is callable from a server:

* the **"Grok for PowerPoint" Microsoft 365 add-in** — a panel inside Office, driven by a person
  clicking in Office;
* **grok.com producing a downloadable `.pptx`** — the consumer chat product, driven by a person
  typing in a browser.

Both are **user interfaces, not APIs**. There is no xAI slide or document generation API, and none
for PPTX, DOCX, PDF or tables either. Therefore: we generate slide **content** with the chat API as
structured JSON, and we render the `.pptx` **ourselves**, in Node, in `04-generation`. An agent sent
looking for a generation endpoint will burn an iteration finding nothing.

**Video is the opposite case.** `POST https://api.x.ai/v1/videos/generations` is real, documented,
priced and callable from a server — asynchronous, polled at `GET /v1/videos/{request_id}` through
`pending | done | expired | failed`. Do not let the slide finding contaminate the video plan, and do
not let the video finding raise hopes for slides.

### 7.2 "Documents" names two different things

The owner's five asset types include `documents`, and one of the three headline pages is DESIGN
DOCUMENTS. They are not the same object; see §2. This is the most likely thing for a reader — or an
agent implementing against this file — to get wrong, and the cost of getting it wrong is a user
editing their brief on the wrong page and wondering why nothing happened.

### 7.3 What a `workflow` asset is, is not settled

The owner's build-order line groups "workflow/video generation" together, which reads as: a workflow
asset, when rendered, is a video. The product contract elsewhere defines a *workflow* as agent
control logic — a loop, an evolve-loop — which is a different object entirely and already has a home
in `server/services/promptLibrary.ts` (owned by `06-tools-cost`, and never yet called by any client
code).

This document takes the reading that a **workflow asset is an ordered sequence of steps that can be
re-run or rendered, whose rendered form is video**, because that reading survives both answers: the
envelope holds a step list plus media either way, and only the renderer in `04-generation` differs.
**Marked inferred, not demonstrated.** If the owner means control logic, then a workflow asset must
be a *view* onto `promptLibrary`'s workflows rather than a stored asset, and §4.1's row changes —
but nothing else in this document does. Do not build a second workflow store under either reading;
`06-tools-cost` owns that data. §8, X-1.

### 7.4 Media URLs, and voice, and cloning

* returned media URLs are temporary; persist on receipt or lose the asset;
* `with_timestamps` on `/v1/tts` ($15.00 per 1M characters) returns **per-character** timing, which
  is how narration syncs to a slide build. `/v1/tts` is not OpenAI's `/v1/audio/speech`; the OpenAI
  SDK cannot call it;
* **custom voice cloning via API is Enterprise-only**, console-only otherwise, US excluding
  Illinois. Do not put a "clone your voice" control anywhere near this page.

### 7.5 Cost is broken today, not merely incomplete

There is no ledger — only running totals (`agent.costUsd += …`), so there is no time series, no
drill-down and no export, and no chart has source data. The input/output/cache token split is
computed and thrown away. `approvalThreshold` and `maxRetries` are unimplemented. Per-tool-call
attribution is structurally impossible because ACP returns one usage object per turn. Per-task cost
*is* tracked; `HANDOFF.md` is stale on that point. Consequence for this surface: a generated file's
media cost is exact, and a text asset's cost can only be apportioned. Say which.

### 7.6 There is no HTTP client to `api.x.ai` in this project

It speaks ACP (JSON-RPC over stdio) to the `grok` binary and nothing else. Files, Collections,
images, video and TTS all need a net-new HTTP/WebSocket client, and `XAI_API_KEY` is a different
credential from whatever signs the CLI in. That client is `04-generation`'s, not yours. The `grok`
binary is a separate Rust program under `.refs/` that this repository does not build; the launch
flag `grok --common_version` is delivered by *our* wrapper on PATH, not by a flag inside `grok`.

### 7.7 The resources backend already exists and has never been called

`server/services/promptLibrary.ts` and `server/routes/library.ts` serve skills, prompts and
workflows over `/api/library`, and no client code has ever called it. If you find yourself writing a
second store for anything that smells like a prompt, a skill or a workflow, stop and verify first.

---

## 8. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- **X-1: what a `workflow` asset is** — a rendered sequence (this document's reading) or agent
  control logic. One sentence from the owner settles it. §7.3.
- **No xAI credential exists on this machine.** `grok models` reports "You are not authenticated"
  and `~/.grok/config.toml` points at `api.openai.com`. Nothing that touches Files, Collections,
  Imagine or TTS can be evidenced until that is provided. An action that needs credentials that were
  not provided is a stop condition, not a mock.
- **Uploading a user's asset to xAI** is outward-facing and spends money per tool invocation.
  Consent is a product feature, and the decision to make it default-on is the owner's.
- **Deleting a user's asset, or any tracked file.** Irreversible, and the repository has an
  eighty-iteration precedent for stopping on exactly this.
- **A change would fall outside §0.** Append it to your handoff file and stop. Do not edit another
  worktree's files, even when you are certain.
- **Two requirements contradict each other** — for example, a contract section that still describes
  four media and a DOC HUB against this document's five types and three pages. Say which two, and
  stop.

---

## 9. What this worktree hands back

```text
branch:   pivot/assets
handoff:  loops/handoff/pivot-assets.md
merge:    07-shell, then 01/02/03, then 04/05/06, then 08 — the pages are tested first
```

**The public contract this loop adds.** Every item below is what another worktree may depend on;
none of it may change after reconciliation without telling them.

```text
types      Asset, AssetFile, AssetVersion, AssetPreview, AssetCharge
           exported from server/services/assetStore.ts
           (they cannot live in server/types/*.ts — hot; re-export requested in the handoff)

api        GET    /api/assets?projectId=&type=&q=
           GET    /api/assets/:assetId
           GET    /api/assets/:assetId/files/:fileId
           GET    /api/assets/:assetId/preview
           GET    /api/assets/tree?projectId=[&assetId=]
           POST   /api/assets
           PATCH  /api/assets/:assetId
           POST   /api/assets/:assetId/files
           DELETE /api/assets/:assetId

events     asset_added, asset_changed, asset_writing
           additive members on ControlRoomEvent — REQUESTED, not edited

mcp        list_assets, read_asset, create_asset, write_asset_text
           registered by registerAssetTools(server, ctx) — one call, requested in the handoff

server     persistFile(input) -> AssetFile descriptor          used by 04 and 05, never by an agent
           getAssetStore().attachFile(assetId, descriptor)     synchronous
           getAssetStore().recordCharge(assetId, charge)       synchronous
```

**Hot-file requests to be applied at reconciliation** (write each one into the handoff as you need
it, with the exact diff):

```text
server/index.ts                       nothing expected; raise it if the ws path needs a channel
server/routes/api.ts                  apiRoutes.route("/assets", assetRoutes)
server/services/projectMcpServer.ts   registerAssetTools(server, ctx) in the tool registration path
server/services/controlRoomEvents.ts  three additive union members, verbatim from §4.7
server/types/project.ts               re-export of the Asset types; retire CodeArtifact
client/src/control-room/useControlRoom.ts  the /api/assets fetches and the three event handlers
client/src/control-room/ControlRoomApp.tsx mount <AssetsPage/> from control-room/assets/index.tsx
```

**What this loop assumed about other worktrees.** Each is a thing to confirm at reconciliation, not
a thing to build around:

* **01-agents** owns agent identity and `capability` on the agent record, with the four values
  `base | images | voice | voice+images`. This loop reads capability and refuses contradictions; it
  never sets it. It also owns write-time path enforcement for a software asset's `src/`.
* **03-design-docs** owns `designDocId`, its version counter, and the rule that one design document
  is followed by at most one project. This loop stores `designDocId` + `designDocVersion` and needs
  a way to learn the current version to compute staleness — assumed to be a synchronous read on the
  design-doc store, or an event. Confirm which.
* **04-generation** calls `persistFile()` and `recordCharge()` and never writes to the asset
  directory itself. It renders `.pptx`, tables and workflow media *after* this loop ships. The
  dependency direction is 04 → 02, never the reverse.
* **05-software** writes a software asset's `src/` through the boundary, produces the screenshot and
  the zip, and reports the sandbox URL as a transient view with an expiry — not as the asset's
  reference.
* **06-tools-cost** owns `costLedger.ts`. `AssetCharge` is deliberately shaped as a ledger row so
  that adopting the ledger is a move, not a rewrite. When the ledger lands, `Asset.charges` becomes
  a query and the field is deleted. Recorded here so it is removed rather than forgotten (X-2).
* **07-shell** owns the page chrome, the theme tokens and the navigation. This loop exports one
  mount point and imports no shell internals.

---

## 10. Definition of done

Assets is complete when AS-001…AS-016 all read PASS with recorded, re-runnable evidence in
`VERIFICATION.md`; `bun run verify` is green; no item is NOT TESTED and no item is BLOCKED; the
handoff file lists every hot-file change with an exact diff; and the canonical demo runs end to end
on this surface — a project is created, a team assembled, one agent reads existing material out of
the store, three agents write documents, slides and clips into it, every asset lands with its agent,
its capability, its charges and the design document that declared it, and the user can see all of it
without reading a log.

Only then output `Assets is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
