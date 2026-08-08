# AGENTS Page — Loop Operating Document

This is the instruction set for one iteration of the AGENTS loop. Read this file first, act, then
stop. It is deliberately short; the files it cites hold the detail.

| Document | Role |
|---|---|
| `loops/01-agents.md` | This file. The AGENTS page: work areas, boundaries, capability, team assembly, the Tools-panel injection endpoint, the presence readout, and what the page *displays* about cost. |
| `grok-workspace.md` | The product contract. When this file and that one disagree, that one wins and you file the disagreement, you do not soften either. |
| `loops/03-design-documents.md` | The design document — the interactive interface. It owns presence. This page **consumes** presence and designs none of it. |
| `loops/06-tools-and-cost.md` | The prompt/skill/workflow library and the **cost engine**. It owns the ledger, the rate table and every per-unit price. This page owns the readout and the delivery. |
| `loops/02-assets.md` | The ASSETS page. Everything an agent produces lands there. This page shows only who made it and what it cost. |
| `loops/07-shell.md` | The shell. It mounts this page in one edit. It does not reach inside it. |
| `VERIFICATION.md` | The evidence ledger. Record `AGENTS-0NN` rows here. The existing `V-0NN` rows belong to the retired coding product and are not this loop's to update or delete. |

> An agent is hired into one area, may say anything about any area, and may write in exactly one.

**What this page contributes to the canonical demo.** The user types "I need to do this sales
presentation" and presses one button; this page is what turns that sentence into four named agents
with four capabilities in four areas, and it is the only surface that shows, continuously, which of
them is spending money and on what. Take this page away and the demo is a prompt box. Get the
capability picker wrong and the demo's researcher can generate video.

---

## 0. Your boundary

**You are in a git worktree, on your own branch. You are not in the main checkout.** Seven sibling
worktrees are running at the same time on sibling branches, each with its own loop document, each
editing files at the same time as you. Nothing you do is visible to them until reconciliation, and
nothing they do is visible to you. Assume every file outside your row is being rewritten right now.

```text
branch:  pivot/agents
handoff: loops/handoff/pivot-agents.md      (yours alone; create it in your first commit)
```

### The files you own

Create, edit and delete these freely. This is your row of the partition and it is the authority:

```text
server/services/workArea.ts        NEW — the WorkArea record, its store, and resolveAgentEnvironment()
server/services/boundary.ts        NEW — capability→tools, path canonicalisation, the write guard,
                                         and the PreToolUse hook body
server/services/agentTeam.ts       team assembly
server/services/agentRegistry.ts   create, status, activity, budget, persistence
server/routes/agents.ts            the agent HTTP surface, mounted at /api/coding-agents
client/src/control-room/agents/**  NEW — the whole AGENTS page
```

Test files adjacent to a file you own are yours: `server/services/workArea.test.ts`,
`server/services/boundary.test.ts`, `server/services/agentTeam.test.ts`,
`server/services/agentRegistry.test.ts`, `server/routes/agentRoutes.test.ts`,
`client/src/control-room/agents/*.test.tsx`. Record that claim in your handoff file on day one, so a
sibling worktree that also wants `agentRoutes.test.ts` finds out before the merge rather than during
it.

Two things the partition does not give you a file for, and where they go instead:

- **there is no `agentCapability.ts` in your row.** Capability decides which endpoints an agent may
  reach, which makes it a boundary. It lives in `server/services/boundary.ts`. Do not create a
  top-level service outside the partition; a file nobody owns is a file nobody merges.
- **there is no `server/routes/areas.ts` in your row**, and creating one costs a mount edit in
  `server/routes/api.ts`, which no row owns. Areas are therefore served by the agents router, with
  the literal segments registered **before** the `/:agentId` routes — exactly the way `/statuses`
  (`server/routes/agents.ts:34`) and `/templates` (`:55`) already are. Registration order is the
  whole mechanism; get it wrong and `GET /areas` resolves as an agent id.

### The files you must not touch

Each belongs to another worktree. An edit here is a merge conflict at best and a silent
contradiction at worst:

```text
server/services/designDoc.ts, server/services/presence.ts,
server/routes/designDocs.ts, client/src/control-room/designdoc/**     03-design-docs
server/services/assetStore.ts, server/routes/assets.ts,
client/src/control-room/assets/**                                     02-assets
server/services/xai/**, server/services/render/**,
server/routes/generation.ts                                           04-generation
server/services/software/**, client/src/control-room/software/**      05-software
server/services/promptLibrary.ts, server/routes/library.ts,
server/services/usageAccounting.ts, server/services/costLedger.ts,
client/src/control-room/tools/**                                      06-tools-cost
client/src/main.tsx, client/src/index.css, client/tailwind.config.js,
client/src/control-room/shell/**                                      07-shell
server/services/auth.ts, server/routes/users.ts, server/services/x/** 08-users-x
docs/USER-GUIDE.md                                                    guide
```

You may **read** all of them, and for `server/services/promptLibrary.ts` you will: the injection
endpoint imports `getPromptLibrary()` and calls it. Importing is not editing. Adding a method to it
is editing, and that is a handoff request.

### The hot-file protocol

These files are shared by everyone. **No worktree edits them directly**, because an eight-way
conflict in any of them costs more than all the feature work:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, **you do not make it.** You append a precise request
to `loops/handoff/pivot-agents.md`, stating the file, the exact change, the reason, and the
signature or event shape other worktrees will depend on. A single reconciliation pass applies every
request at the end.

Treat these four as hot too, and say so in your handoff file — they carry agent-shaped changes but
no row owns them, and two worktrees each believing they own `acpSessionManager.ts` is the same
accident the partition exists to prevent:

```text
server/services/acpSessionManager.ts   session open, cwd, mcpServers, rules
server/services/projectMcpServer.ts    ProjectMcpContext, the tool set
server/services/controlRoomEvents.ts   the event union on /ws/control-room
server/routes/projects.ts              the launch route (currently :461-526)
```

**Design so that each of those is a one-line wiring.** `workArea.ts` exports one function that
returns everything a session needs; `boundary.ts` exports one guard and one hook entry. The
reconciler's edit to `acpSessionManager.ts` should be a call, not a rewrite. If your design requires
someone else to understand your module to wire it, the design is wrong.

**Deleting a tracked file is never yours.** `client/src/control-room/AgentCanvas.tsx` is dead (§3,
A-11) and it is not in your row; the deletion is a handoff request and a §6 stop, not an edit.

### What you leave behind

Your branch, your handoff file, and a public contract that someone who has not read this document
can wire in. Stated in full in **§8. Reconciliation**.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui        # your worktree, not the main checkout — confirm with git rev-parse --show-toplevel
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

```bash
./node_modules/.bin/grok --version    # expect: a version prints; the binary comes from node_modules
bun run verify                        # expect: exit 0
bun run audit                         # expect: 0 orphans, every endpoint covered
```

**A red gate is always the highest-priority work**, ahead of any item in §3. Capture verify's output
to a file, never `>/dev/null` — a discarded failure cannot be diagnosed without re-running it, and a
re-run is usually green.

`grok-build` stays a read-only reference clone under `.refs/`. The `grok` binary keeps coming from
`node_modules`. Do not vendor, patch or build it. The `grok` binary is a separate Rust program that
this repository does not build; when you write about launch, name which process owns which flag
rather than describing behaviour that appears by magic.

### Credentials — and why this page does not need them

Media capability needs `XAI_API_KEY`, a **different credential** from whatever signs the `grok` CLI
in. It does not exist on this machine: `grok models` reports "You are not authenticated" and
`~/.grok/config.toml` points at `api.openai.com` and `router.huggingface.co`.

**Nothing in this document is blocked by that**, and that is not an accident — it is why this page is
in the first build wave. Every capability item here asserts the **absence** of a registered tool,
which is observable in an MCP `tools/list` response with no credential and no network. If you find
yourself needing `XAI_API_KEY` to close an AGENTS item, you have written the item wrong: you are
testing 04-generation's engine through this page's surface.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 18 NOT TESTED
Gate: inherited from the retired product — both typechecks, the production build, and four
      audits. Every AGENTS-0NN item below is new and untested.
```

### What exists today

The AGENTS page is the surface with the most surviving code, which makes it the easiest place to
mistake a rename for a rebuild. Precisely what is there:

| Thing | Where | Verdict |
|---|---|---|
| Agent record: role, persona, skills, tools, status, activity, budget, position | `server/types/agent.ts:105-143` | Reused. `branch`/`worktree` (`:122-123`) become `areaId`. **Hot file — handoff.** |
| Six statuses, each with a **text label** because "colour is never the sole carrier of meaning" | `server/types/agent.ts:7-11`, `:33-70` | Reused verbatim. This is the accessibility rule the whole page inherits. |
| `CodingAgent.color` and `.avatar` | `server/types/agent.ts:114-115` | **Declared, written by nothing, read by nothing.** The colour field already exists and is inert. |
| Registry: create, status, activity, budget evaluation, persistence | `server/services/agentRegistry.ts:115-430` | Yours. `deriveStatus` (`:57`) and `evaluateBudget` (`:72`) are pure and domain-free. |
| `assignTask(agentId, taskId, {branch, worktree})` | `server/services/agentRegistry.ts:290-299` | Becomes `assignArea(agentId, areaId)`. |
| Five-role seeded team, budget split evenly, refuses to seed twice | `server/services/agentTeam.ts:11-17`, `:98-123` | Code survives; the roster data dies. All five roles are coding roles. |
| Tolerant role matching: exact → normalised → family → fallback, reporting which | `server/services/agentTeam.ts:69-96` | Reused verbatim. Its `FAMILIES` table (`:35-41`) is code-shaped and must be replaced. |
| Session open: cwd, MCP servers, `rules` | `server/services/acpSessionManager.ts:210-250` | **Hot.** `cwdFor` (`:77`, `:228`, `:247`) becomes one call into `workArea.ts`. |
| Live message into a running session | `server/routes/agents.ts:263-271` → `AcpSessionManager.send` | **The only path that reaches a live agent.** Everything the Tools panel injects goes through it (A-8). |
| `rules` delivered only at `session/new` | `server/services/acpSessionManager.ts:247-249`; `loadSession` (`server/services/acpClient.ts:404-411`) has **no `rules` parameter at all** | The fact that shapes injection. A skill assigned after start does not reach the agent by this route. |
| MCP identity bound at server construction — "the identity is not a parameter" | `server/services/projectMcpServer.ts:15-30` | **The most important sentence in the repo for this page.** |
| Six tools withheld from agents entirely | `DELIBERATELY_USER_ONLY`, `server/services/projectMcpServer.ts:696-703` | The precedent for capability: a tool an agent must not have is *not registered*. |
| Agent card that omits every field the server did not supply | `client/src/control-room/AgentCard.tsx:22-29` | Reused as a *rule*, not as a layout. Six of its eight fields are debug output. |
| The control-room WebSocket, `/ws/control-room?projectId=` | `server/index.ts:82-89`, consumed at `client/src/control-room/useControlRoom.ts:141` | Your page opens its **own** socket to the same path. `useControlRoom.ts` is hot; do not extend it. |
| React Flow node graph with persisted drag positions | `client/src/control-room/AgentCanvas.tsx` | Dead. Its edges are hidden by `client/src/index.css` (`.react-flow__edges{display:none}`), so it is a grid with extra steps. Deletion is a handoff request. |

### What the owner assumed that is not true

Say these out loud rather than designing quietly around them.

1. **Cost is broken, not merely incomplete.** `DEFAULT_RATES` in
   `server/services/usageAccounting.ts:30-34` has exactly three keys — `gpt-4o`, `gpt-4o-mini`,
   `gpt-4.1` — and no Grok model. `resolveRate` returns `null` for anything else and `estimateCost`
   then returns `costUsd: 0, rateKey: null`. Every figure in the shipping product is very likely
   `$0.00`, and `rateKey: null` is surfaced nowhere. A user reads "$0.00 (estimated)" as *cheap*,
   not as *we do not know the price of this model*.
2. **There is no cost ledger.** `agentRegistry.recordUsage` does `agent.costUsd += …`
   (`server/services/agentRegistry.ts:352-398`) and nothing anywhere persists an individual charge.
   No time series, no drill-down, no export, no source data for any chart. The input/output/cache
   token split is computed in `extractUsage` and thrown away at the call site.
3. **Per-tool-call attribution is structurally impossible today.** ACP returns one usage object per
   *turn*, and `tool_call` updates carry no usage. "Cost per image" cannot come from ACP; it must
   come from 04-generation's own HTTP client. Do not put per-tool-call cost on this page.
4. **`approvalThreshold` and `maxRetries` are unimplemented** — zero occurrences in code.
5. **Per-task cost IS tracked** (`server/services/projectStore.ts` `recordTaskCost`). Do not rebuild it.
6. **Boundaries are enforced nowhere at write time.** Isolation today is a cwd passed to the agent,
   nothing more. `assertAgentCanWrite` (`server/services/repository.ts:261`) has **zero production
   callers**. The whole `ApprovalQueue` (`server/services/approvals.ts`) has **zero production
   callers**. `server/hooks/shellSafetyHook.ts` is **not installed by this repository** and only
   classifies shell tools (`SHELL_TOOLS`, `:17`), so a direct file-write tool bypasses it entirely.
   Git worktrees made out-of-bounds edits **recoverable**; they never **prevented** them.
7. **The project has no HTTP client to `api.x.ai`.** It speaks ACP (JSON-RPC over stdio) to the
   `grok` binary and nothing else. Every media capability is net-new transport work, owned by
   04-generation. This page records *which agent may call it*, and nothing more.
8. **There is no xAI document, slide, PPTX, DOCX or PDF generation API. None.** Two surfaces look
   like one and neither is callable from a server: the **"Grok for PowerPoint" Microsoft 365
   add-in** is a panel inside Office, and **grok.com producing a downloadable .pptx** is the
   consumer chat product. Both are user interfaces. Slide *content* comes from the chat API as
   structured JSON and we render the `.pptx` **ourselves** with a Node library, in 04-generation.
   The consequence for this page: **`+images` does not mean "can make a deck."** Never label an
   agent "Slide generator" as though an endpoint existed; the capability badge names what the agent
   may *call*, which is image and video generation. Video is the opposite case — the Imagine video
   API is real, asynchronous, and callable from a server.
9. **Custom voice cloning via API is Enterprise-only** (console-created voices otherwise; US only,
   excluding Illinois). The voice-capability picker must not offer "clone my voice" — it is the
   natural next control to add and it is not buildable on a standard plan.
10. **Returned media URLs are temporary.** Any agent record, tile or cost row that stores a returned
    URL instead of a persisted asset id from 02-assets is broken by construction.
11. **A design document is not an asset, and there is more than one of them.** A project may follow
    **multiple** design documents; a document may be followed by **at most one** project. So this
    page never renders "the design document" in the singular and never implies an agent owns one.
    An agent row names *which* document it is reading. The cardinality rule is enforced in
    03-design-docs; this page must not create a second path that could attach a second project to a
    document (A-9).
12. **Three fields the pivot depends on have never held a value**: `CodingAgent.color`
    (`server/types/agent.ts:115`), `Requirement.designSection` (`server/types/project.ts:79`), and
    `Milestone.taskIds` — plan generation creates every task without a `milestoneId`, so milestones
    are decorative in the shipping product. A-1 and A-2 exist to give all three a producer.
13. **The control-room event bus has a transport, and the shell already drops events on it.**
    `budget_warning` and `budget_exceeded` were published by the server and ignored by the client
    for the whole of the retired product's life, so the only spending signal a user ever saw was the
    header turning red after the cap was blown (`client/src/control-room/useControlRoom.ts:145-151`).
    Publishing an event is not delivering it. Every event this page depends on needs a test that a
    rendered component changed, not that the bus emitted.

---

## 3. What must be built, in order

Step 3 of §5 points at this table. Work top to bottom; each stage assumes the one above it.

| # | Stage | Done when |
|---|---|---|
| A-1 | `WorkArea` record, store, and `resolveAgentEnvironment()` | AGENTS-001 |
| A-2 | Area ↔ brief section ↔ milestone wiring | AGENTS-002 |
| A-3 | `areaId` and capability on the agent record (handoff) | AGENTS-003 |
| A-4 | Capability → registered MCP tools | AGENTS-007, AGENTS-008 |
| A-5 | Spawn into an area; launch refuses without one | AGENTS-003 |
| A-6 | Boundary enforcement at write time | AGENTS-004 |
| A-7 | Refusal names the remedy; `targetAreaId` on `DesignSuggestion` | AGENTS-005, AGENTS-006 |
| A-8 | The Tools-panel injection endpoint | AGENTS-011, AGENTS-012, AGENTS-013 |
| A-9 | Presence consumed and rendered | AGENTS-014, AGENTS-015 |
| A-10 | Team assembly and manual agent creation | AGENTS-009, AGENTS-010 |
| A-11 | The page: area board, tiles, colour, cost readout, single entry point | AGENTS-016, AGENTS-017, AGENTS-018 |
| A-12 | The wave-1 robustness gate | §7's gate block |

### Where this page sits in the build order, and why it is not negotiable

The owner fixed the order. **AGENTS, ASSETS and DESIGN DOCUMENTS are built and robustly tested
first. Slide generation, workflow/video generation and software generation come after.** Three
consequences bind this document:

- **no AGENTS item may be closed by way of a generation call.** The capability items assert absent
  tools, not successful ones. If your evidence contains an `api.x.ai` response, it belongs to
  04-generation's checklist, not this one;
- **do not build a media affordance you cannot exercise.** A "Generate images" button on an agent
  tile in wave 1 is a dead control, which the quality audit forbids outright. The capability badge
  is a *label*; the tools it names are registered on the MCP server and invoked by the agent, not by
  a button on this page;
- **06-tools-cost merges after you.** Your cost readout must render correctly against the engine as
  it exists today — which means "price unknown" and unit counts, not a chart — and must not break
  when the ledger lands. Read the ledger through one adapter (A-11) so the upgrade is one file.

### A-1 — What a work area is

A work area replaces the git worktree. It is a record, not a directory trick.

```ts
// server/services/workArea.ts
export interface WorkArea {
  id: string;                    // "area_<base36>"
  projectId: string;
  name: string;                  // human, shown to the user: "Slides", "Video assets"
  colorToken: AreaColorToken;    // a token name, never a hex — see A-11
  glyph: AreaGlyph;              // the redundant non-colour signal
  briefSectionAnchor: string;    // the section of the project brief this area owns
  milestoneId: string;           // exactly one milestone per area
  rootPath: string;              // canonical absolute path; the ONLY writable directory
  ownerAgentId?: string;         // at most one agent owns an area at a time
  budgetUsd?: number;            // per-area cap; the engine that enforces it is 06's
  createdAt: string;
  updatedAt: string;
}
```

`rootPath` is stored **canonical**. Copy `canonical()` from `server/routes/repository.ts:44-56` into
`server/services/boundary.ts` before anything else uses it — do not re-derive it. It resolves the
deepest existing ancestor and appends the rest, and it closes both directions of the symlink bug:
the macOS `/var`→`/private/var` false refusal and the `<root>/link → /etc` false approval, both of
which are recorded in its own comment at `:33-42` because both actually happened. Both halves of
every later comparison must be canonical or the guard is wrong in both directions.

Status is **derived, never stored** — from the owning agent's status and the area's milestone
progress. `EffectiveTaskStatus` in `server/types/project.ts` already establishes this pattern; keep
it, so the graph stays the single source of truth and cannot drift.

**The one function everything else calls:**

```ts
// server/services/workArea.ts — the single seam into the session path
export interface AgentEnvironment {
  cwd: string;                       // area.rootPath, canonical
  areaId: string;
  capabilities: AgentCapabilities;
  mcpContext: { projectId: string; agentId: string; areaId: string; capabilities: AgentCapabilities };
  rules: string;                     // project brief, then persona, then area boundary
  hookConfigPath: string;            // written by this call, with area.rootPath baked in (A-6)
}
export function resolveAgentEnvironment(agentId: string): AgentEnvironment;  // throws NoAreaError
```

That signature is the contract you hand to reconciliation. `acpSessionManager.ts` changes by one
call; `projectMcpServer.ts` gains three fields on its context. Nothing else in the session path
learns what an area is.

### A-2 — Areas map onto sections of the brief, one milestone each

The project carries **one overall description that every agent follows**. That description has
sections. Each section becomes at most one area; each area gets exactly one milestone; the
milestone's tasks are the area's work.

```text
project brief §1 Audience     -> area "Research"       -> milestone m1
project brief §2 Channel      -> area "X account"      -> milestone m2
project brief §3 Deck         -> area "Slides"         -> milestone m3
project brief §4 Experience   -> area "Video assets"   -> milestone m4
```

Two fields that exist and have never held a value become live here:

- `Requirement.designSection` (`server/types/project.ts:79`) is settable, stored, mirrored
  client-side and **set by nothing**. Area creation is its producer.
- `Milestone.taskIds` is populated only when a task carries a `milestoneId`, and plan generation
  creates every task without one. Set `milestoneId = area.milestoneId` when a task is created inside
  an area. It is a one-line fix that has been missing through 900+ tests, which is the point:
  nothing ever asked whether the relation had run.

Both fields live in `server/types/project.ts` — hot. The producer is yours; the field is a handoff
note confirming nothing needs to change in the type.

Sections without an area are the useful signal, not an error: the page shows "3 of 5 sections of
your brief have nobody working on them." `uncoveredRequirements` in `server/services/planner.ts`
already computes this shape and survives verbatim.

### A-3 — An agent belongs to exactly one area

`server/types/agent.ts` is hot. Your handoff request, exactly:

```text
FILE   server/types/agent.ts
DELETE CodingAgent.branch   (:122)   — git is gone; nothing may read it
DELETE CodingAgent.worktree (:123)
ADD    areaId?: string
ADD    capabilities?: { images: boolean; voice: boolean }
WHY    an agent is assigned exactly one area and one capability set; both are read by
       server/services/workArea.ts resolveAgentEnvironment() and by the AGENTS page
```

Rename `AgentRegistry.assignTask(agentId, taskId, {branch, worktree})`
(`server/services/agentRegistry.ts:290-299`) to `assignArea(agentId, areaId)` plus the existing task
assignment. Keep its shape — "an agent is assigned exactly one area, recorded on the agent record"
is the part of the worktree design that survives.

### A-4 — Capability, and why it is a budget control

Capability is chosen at agent creation and is the most consequential field on the record.

```ts
// server/services/boundary.ts
export interface AgentCapabilities {
  images: boolean;   // Grok Imagine: still images AND video (one endpoint family, one credential)
  voice: boolean;    // TTS, STT, realtime speech
}
```

Stored as two flags, presented as four presets — base Grok, Grok + images, Grok + voice, Grok +
voice + images. Store flags rather than a four-value enum because a fifth capability is already
foreseeable (X posting, 08-users-x) and an enum forces a migration; presenting four presets keeps
the user's choice to the four the product actually offers.

Video sits under `images` because it is the same endpoint family, the same credential and the same
rate family. Say plainly in the UI that it is also **two orders of magnitude more expensive per
artifact** than a still image.

**Capability decides which tools exist.**

| Capability | MCP tools registered | Endpoints reachable | Unit price |
|---|---|---|---|
| base Grok | every non-media project tool | none directly; text turns go through `grok` over ACP | per token |
| + images | `generate_image`, `edit_image`, `image_to_video`, `poll_video_job` | `POST /v1/images/generations`, `POST /v1/videos/generations`, `GET /v1/videos/{request_id}` | `grok-imagine-image` $0.02/image; `grok-imagine-image-quality` $0.05/image; `grok-imagine-video` $0.050/sec; `grok-imagine-video-1.5` $0.080/sec |
| + voice | `narrate`, `transcribe` | `POST /v1/tts` (also `wss://api.x.ai/v1/realtime`), `POST /v1/stt` | TTS $15.00 per 1M characters; STT $0.10/hr REST; realtime $0.05–0.08/min |
| + voice + images | the union | the union | the union |

Facts that constrain anything built on that table, all verified, all owned by 04-generation and
merely *named* here: video generation is **asynchronous** — it returns a `request_id` you poll at
`GET /v1/videos/{request_id}` with status `pending|done|expired|failed`; duration is 1–15 s, default
8; resolutions 480p/720p/1080p; audio is generated by default. Images are 5 RPS, up to 10 per
request; video 10 RPS. `/v1/tts` is **not** OpenAI's `/v1/audio/speech`, so the OpenAI SDK cannot
call it; `with_timestamps` returns per-character timing, which is how narration syncs
deterministically to a slide build. **There is no slide tool in that table and there cannot be one**
(§2, item 8).

**The enforcement is registration, not refusal.** A tool the agent's capability does not grant is
**not registered** on that agent's MCP server. The repository already does exactly this for a
different reason: `DELIBERATELY_USER_ONLY` (`server/services/projectMcpServer.ts:696-703`) withholds
six tools from every agent so an agent cannot approve its own work. Follow that precedent. Do not
register a tool and return an error from it — an advertised tool that always fails is an invitation
to retry, and a retry loop is exactly the failure mode that costs money here: a 60-second generated
experience is roughly **$5.52 in media alone** (8 clips × 8 s × $0.080/s = $5.12, plus 8 quality
images × $0.05 = $0.40), three orders of magnitude above a text turn, and one careless retry loop is
a $50 mistake.

**This is why capability is a budget control as much as a feature flag.** A base-Grok agent cannot
reach any per-unit endpoint at all, so its worst case is bounded by token spend. The cheapest
spending control in the product is not a dollar cap — it is not granting the capability. Team
assembly and the creation form must both present it that way, at the moment of choosing, not in a
settings page later.

Media calls go **direct to `api.x.ai` with `XAI_API_KEY`**, not through the `grok` CLI's built-in
`image_gen`. The CLI path is subscription-tier gated (blocked on free and X Basic, in headless ACP
mode too) and subject to a remote force-off that environment and config cannot override. That client
is 04-generation's to build; this page's job is only to record which agent may call it.

### A-5 — Spawning an agent into an area

Launch today (`server/routes/projects.ts:461-526`) creates a git worktree, then opens a session
whose cwd comes from `cwdFor` (`server/services/acpSessionManager.ts:77`, `:228`, `:247`). The
replacement is one call:

```text
1. env = resolveAgentEnvironment(agentId)     -> throws NoAreaError; route maps it to 400 NO_AREA
2. cwd        = env.cwd                        (canonical)
3. mcpServers = [ project server bound to env.mcpContext ]
4. rules      = env.rules
5. hook       = env.hookConfigPath             already written, area root baked in   (A-6)
6. open the session, then send the briefing
```

**Launch refuses when the agent has no area. There is no fallback.** `cwdFor` used to end at
`process.cwd()`, which handed an agent write access to this repository's own source — the comment
recording that is still in `server/services/acpSessionManager.ts`. A fallback in a boundary system
is a hole, and this one had already been exploited by accident.

### A-6 — Where the boundary is actually enforced

Nothing enforces it today (§2, item 6). There are two candidate enforcement points. Both are real;
they fail differently.

**Route (A): a `PreToolUse` hook extended to file writes.**

- It is the only interception surface Grok Build offers, and it sees *everything*, including a shell
  redirect that never presents a path argument at all.
- It must `process.exit(2)`. A deny in stdout JSON is **not** honoured under `--always-approve` —
  the command ran. That is recorded from observation at `server/hooks/shellSafetyHook.ts:82-84`;
  emitting both is what actually blocks.
- It must canonicalise every path argument before comparing, using the function copied in A-1.
- It must be **installed by the server at launch**. The existing hook is a hook nobody installed;
  `scripts/audit/reachability.mjs` declares it an entry point invoked by a file this repository never
  writes. `resolveAgentEnvironment()` writes the config **and** a two-line executable stub into the
  runtime data directory (`OPENUI_DATA_DIR`), pointing at an exported
  `runAreaBoundaryHook()` in `server/services/boundary.ts`. The logic is a tracked, tested module;
  the stub is a runtime artifact, so nothing new appears at a path no row owns.
- Its weakness is structural: it is a **deny-list of tool names pretending to be an allow-list**.
  `SHELL_TOOLS` (`server/hooks/shellSafetyHook.ts:17`) enumerates five spellings of "run a shell
  command". A write-capable tool we fail to name fails **open**. And the path arguments are untyped
  strings in schemas we do not control, so extracting them is a classifier over model-produced text.

**Route (B): MCP-mediated writes.**

- Every project MCP tool already carries its identity bound at server construction: "an agent
  therefore cannot address another project or impersonate another agent by passing different
  arguments — the identity is not a parameter" (`server/services/projectMcpServer.ts:15-30`).
- Adding `areaId` to `ProjectMcpContext` extends that guarantee for free: the area is not a
  parameter either, so there is no argument an agent can pass to write into another area.
- It is an **allow-list by construction**, and it survives Grok renaming its built-in tools.
- Every mutation becomes a structured record that already knows `{projectId, agentId, areaId}` —
  which is also the only way per-area cost attribution and per-area acceptance evidence become
  possible.
- Its weakness: it covers only what goes through MCP. It does nothing about the agent's own
  filesystem tools.

**Decision: route (B) is the enforcement; route (A) is the seal. Build both, in that order.**

1. **Make the deliverable structured**, so that all mutation *can* go through MCP. This is the
   reason to make it structured; it is not a storage preference. The deliverable model itself is
   02-assets' and the design document is 03's — file the dependency, do not design either here.
2. **Add `areaId` and `capabilities` to `ProjectMcpContext`** (handoff) and scope every mutating
   tool to the agent's area. Non-mutating reads stay project-wide: an agent must be able to *see*
   the whole brief, and every design document the project follows, to know what to suggest about it.
3. **Narrow the tool surface at launch** so free filesystem writing is not offered. `grok` documents
   `--tools` / `--disallowed-tools` as a built-in allow/deny by name. **UNVERIFIED in this repo**:
   `ACP_ARGS` (`server/services/acpClient.ts:28`) is fixed at
   `["--no-auto-update","agent","--always-approve","stdio"]` and has never passed either flag, and
   whether a per-session `session/new` can restrict tools at all is unknown. **Exact thing to
   check:** launch with the flag, instruct the agent to write a file outside its root, and require
   the refusal to come from `grok` rather than from the agent's prose.
4. **Install the `PreToolUse` backstop per agent at launch**, with `area.rootPath` baked into the
   config the server writes. It denies and exits 2. It catches what steps 2 and 3 missed, and its
   denials are the signal that the allow-list has a hole.

Route (B) is primary because it changes the question from "can I recognise a bad path?" to "is there
any way to name another area?", and only the second question has a stable answer.

### A-7 — Raising a concern about something outside your area

This half already works and is the best-preserved thing in the repository. `DesignSuggestion`
(`server/types/project.ts:95-118`) carries `baseVersion` for conflict detection, retains
`originalProposedText` when the user amends it, and is served by the `submit_design_suggestion` MCP
tool and the accept / edit / reject / request-revision queue in
`client/src/control-room/ReviewQueues.tsx`. It is exactly "may suggest outside its area". Reuse it
as-is.

Add one field: `targetAreaId?: string`, alongside the existing `requirementId` — `server/types/project.ts`
is hot, so this is a handoff request with the field name and the reason. Then:

- **A refusal must name the remedy.** When an MCP write is refused for area reasons, the refusal
  text names `submit_design_suggestion` and the target area. A refusal that does not say what to do
  instead produces a retry loop, and with a media capability granted a retry loop is money.
- The AGENTS page shows, per area, the number of open suggestions **addressed to** that area — not
  authored by it. That is the number that means "someone is waiting on you".
- Do not add a second mechanism. If you are tempted to let an agent write outside its area "just for
  small things", that is the boundary being negotiated away one exception at a time.

### A-8 — The Tools panel injects into a live agent

06-tools-cost owns the panel and the library. **This page owns the delivery**, because delivery is
an operation on an agent and the only route into a running session is
`AcpSessionManager.send` (`server/routes/agents.ts:263-271`).

One endpoint, on the agents router:

```text
POST /api/coding-agents/:agentId/inject
  body { kind: "prompt" | "skill" | "workflow", resourceId: string, values?: Record<string,string> }
  200  { deliveredAs: "message" | "next_start" | "both",
         recordedOnAgent: boolean,
         transcriptEntryId?: string,
         capabilityChanged: false }
  400  UNRESOLVED_VARIABLE   { missing: string[] }     (from renderPromptById)
  404  UNKNOWN_RESOURCE
  409  SESSION_PAUSED
```

**The fact that shapes all of it:** `rules` is delivered only at `session/new`
(`server/services/acpSessionManager.ts:247-249`), and `AcpConnection.loadSession`
(`server/services/acpClient.ts:404-411`) has **no `rules` parameter at all** — it sends only
`{sessionId, cwd, mcpServers}`. Nothing you assign to an agent reaches a session that is already
open by way of `rules`. Anything that must reach a live agent arrives as a message.

Three kinds, three different truths, and the endpoint must report which one happened:

- **prompt** — render it through 06's engine (`renderPromptById`, which raises
  `UnresolvedVariableError` rather than emitting a hole) and `send()` the rendered text as a user
  turn. `deliveredAs: "message"`. It costs a turn. Say so in the UI.
- **skill** — record the skill id on the agent record *and* send a short activation message naming
  the skill and pasting its instructions. `deliveredAs: "both"`. The record is what makes the next
  session carry it in `rules`; the message is what makes it true now. **Do not claim it will apply
  on reload**: the reload path drops `rules`, and whether a resumed session keeps its persona
  depends on Grok's persisted session meta, which nothing here verifies.
- **workflow** — a `ProjectWorkflow` is a static DAG of named stages
  (`server/services/promptLibrary.ts`); nothing executes it, it has no loop, no condition and no
  termination criterion. Injecting one means sending its stage list as a briefing message and
  creating the tasks in the agent's area. **Do not describe it as a runtime**, and do not build one
  here — the workflow engine question belongs to 06 and to the upstream `grok` binary, which already
  has one.

Rules this endpoint exists to enforce:

- **an injection that changes stored state and does not reach the running session is a dead
  control.** The quality audit forbids controls that do nothing. When the agent has no live session,
  return `deliveredAs: "next_start"` and the panel says "will apply when this agent next starts" —
  the honest sentence, not a checkmark.
- **injecting into a paused agent refuses.** `SessionPausedError`
  (`server/services/acpSessionManager.ts:45`) already exists; map it to 409 and offer resume. A
  queued injection that fires minutes later, unattended, on an agent with media capability, is a
  bill nobody watched being run up.
- **a skill is text. Text cannot grant a tool.** Injecting a skill that says "generate an image"
  into a base-Grok agent changes nothing about what tools are registered. The response always
  carries `capabilityChanged: false`, and the panel must never present injection as a way to extend
  an agent. Capability is chosen at creation and changed only by creating a new agent — say that in
  the UI at the point of injection.
- **an unknown skill id is not skipped silently.** `rulesForAgent`
  (`server/services/promptLibrary.ts:138-153`) swallows unknown ids in a try/catch, which is right
  for session start and wrong for a user action. Return 404 and say which id.

**What the AGENTS page shows for it:** an injection is a transcript entry like any other. The tile
shows nothing special; `SessionDrawer` shows the message. Resist adding a badge. The Tools panel is
the surface that reports the outcome, and it is 06's.

### A-9 — Presence: consumed, never designed

03-design-docs owns `server/services/presence.ts`, the MCP tool the agent must call, the cadence,
and the staleness rule. **This page renders what that service reports and interpolates nothing.**

The contract this page consumes — **assumed, to be confirmed against 03 at reconciliation**:

```ts
// server/services/presence.ts — 03-design-docs. Read here, never written here.
export interface AgentPresence {
  agentId: string;
  documentId: string;
  documentTitle: string;                        // the page shows a title, never an id
  lines: Array<{ from: number; to: number }>;
  activity: "reading" | "working";
  reportedAt: string;                           // ISO
  stale: boolean;                               // 03 decides what stale means; this page does not
}
export function listPresence(projectId: string): AgentPresence[];
// plus a control-room event on /ws/control-room:
//   { type: "agent_presence"; agentId: string; documentId: string; stale: boolean }
```

Put one adapter, `client/src/control-room/agents/presenceAdapter.ts`, between that shape and your
view model. If 03 ships something different, one file absorbs it and the board does not change.

What the row shows, exactly:

```text
▌▲ Slides   Iris · Grok + images   Working   $1.85
│  reading "Q3 Deck brief" lines 120–148                 <- presence.stale === false
│  last seen 6m ago in "Q3 Deck brief"                   <- presence.stale === true
│  (nothing at all)                                      <- no presence record
```

Three rules, and each one is a way this readout can lie:

- **presence is a report, not a measurement.** A model can forget to call the tool. An agent that
  stops emitting has not stopped reading — it has stopped saying so. Never render a stale record as
  a live highlight, and never let the row say "idle" because presence went quiet. Status comes from
  the session; presence comes from the agent's own claim; they are different facts and this page
  must not merge them.
- **no presence record renders as nothing**, not as a default. That is `AgentCard.tsx:22-29`'s rule
  (omit every field the server did not supply) applied to the one field most likely to be missing.
- **name the document.** A project may follow several. "reading the design document" is a sentence
  this page is not allowed to write.

### A-10 — Agent creation and team assembly

This is the heart of the page.

**One-click team assembly.** The user has already written the project description; assembly reads it
and proposes a team. Mechanism, reusing the planner's shape rather than its prose: one real agent
turn, constrained with `--json-schema` so the roster comes back as JSON, parsed once. An unparseable
result is a hard error, never a silently empty team.

```json
[{ "name": "...", "role": "...", "capability": "base|images|voice|voice+images",
   "areaName": "...", "briefSectionAnchor": "..." }]
```

**It proposes; the user creates.** The page shows the proposed roster with a capability badge and an
estimated cost per agent, plus one line: "2 of these 4 agents can spend on media." Then a Create
team button. A one-click flow that silently grants two agents Imagine capability is a one-click flow
that silently spends money.

**On parse failure**, create a two-agent minimum team — one researcher, one writer, both base Grok —
and say the proposal failed. A project with no team dead-ends: that is why `seedDefaultTeam` exists
at all, recorded in its comment at `server/services/agentTeam.ts:19-33` (a browser-created project
had no agents, so every task resolved to nobody and the first Launch was refused with `NO_AGENT`,
with no way to recover inside the UI). **Never grant a media capability on a fallback path.**

What carries over from `server/services/agentTeam.ts`:

- `resolveAgentForRole` (`:69-96`) — exact → normalised → family → fallback, returning **which**
  match happened. Reused verbatim. Its comment (`:54-68`) records why: an exact string lookup
  against a role the model wrote resolved to nobody, the task stored with no owner, and nothing
  recorded which role had failed to match, so the bug read as random for two iterations.
- `seedDefaultTeam` (`:98-123`) — including both of its invariants: seeding twice is refused
  (`:106-107`), and the project budget is split so that an agent with no cap of its own cannot spend
  the whole project budget.
- **`DEFAULT_TEAM` (`:11-17`) dies entirely.** Planner, Backend Engineer, Frontend Engineer, Test
  Engineer, Reviewer are five coding roles. The new team is capability-shaped and comes from the
  description, not from a constant.
- **`FAMILIES` (`:35-41`) is replaced**, not amended: `research`, `writing`, `slides`, `voice`,
  `video`, `social`, `review`. Keep the ordering discipline — most specific first, because
  "Voice Producer" contains "producer".

**Manual creation** asks for: name, role, area, **capability**, and a budget. Persona and skills come
from the Tools panel; they reach the session through `rulesForAgent`
(`server/services/promptLibrary.ts:138-153`) → `composeAgentInstructions` (`:114-126`) → `rules` at
`session/new`. That path is reused as-is and is 06's to change. Two things about it you must not
misreport on this page: injection at session start is **eager and total** (every assigned skill's
full text on every session), and the reload path drops `rules`. Do not display "persona: X" on a
resumed session as though it were in effect.

**The project description reaches every agent.** `resolveAgentEnvironment()` puts the brief ahead of
the persona in `rules`. One line, and it is the mechanism that makes "a description every agent in
the project follows" true rather than decorative.

**Assembly may attach a project to design documents. It may not implement the attachment.** The
cardinality is exact and it is 03's to enforce: **one project may follow multiple documents; one
document may be followed by at most one project.** Assembly calls 03's API and handles its refusal;
it never writes a follow link itself. Two writers of the same relation is how the second project on
one document gets created.

**Orchestration stays light.** The owner's instruction is an omni-agent that is simple, because
agents are mostly in conversation. There is no planner in this document beyond what already exists,
no scheduler, no dependency solver of its own. The single model turn in team assembly is the one
place I am tempted, and it is justified narrowly: it produces a roster, once, which a human
approves; it does not sequence work, does not own a graph, and does not run again. If a later
iteration wants it to re-plan, refuse — that is a planner wearing an assembly button.

### A-11 — The page

```text
 grok-workspace · Sales presentation · $6.40 of $25.00 est.       [Tools] [Documents]
 ────────────────────────────────────────────────────────────────────────────────
 ▌● Research            Ada · base Grok             Working             $0.12
 │  brief §1 Audience   reading "Q3 Deck brief" 120–148     4 of 6 done
 ▌◆ X account           Rex · base Grok             Waiting on you      $0.04
 │  brief §2 Channel    1 suggestion for Slides              2 of 3 done
 ▌▲ Slides              Iris · Grok + images        Working             $1.85
 │  brief §3 Deck       12 images · 1 video 8s               7 of 14 done
 ▌■ Video assets        Vox · Grok + voice + im.    Needs your approval $4.39
 │  brief §4 Experience 1 video 24s · 2m narration           2 of 5 done
 ────────────────────────────────────────────────────────────────────────────────
 + Add an agent    ⟳ Re-assemble team    ⏸ Pause everything
```

**One entry point.** The whole page is exported from
`client/src/control-room/agents/AgentsPage.tsx` as `<AgentsPage projectId={…} />`, with its own data
hook `client/src/control-room/agents/useAgentsPage.ts` doing its own fetches and opening its own
socket to `/ws/control-room?projectId=`. **Do not extend `useControlRoom.ts`** — it is hot, and a
page that needs a hot-file edit to render is a page that merges last. 07-shell mounts you in one
line.

**Colour.** `colorToken` is assigned from a fixed ordered palette in area-creation order, and stored
as a **token name**, never a hex, so light and dark resolve it differently. 07-shell owns the token
layer; you consume token names. Port the palette from Grok Build's own matched pair — `GrokNight`
for dark, `GrokDay` for light — so the overlay reads as the same product:

```text
token     dark       light
blue      #7aa2f7    #2F64D2
magenta   #bb9af7    #7D4BC6
cyan      #7dcfff    #0082AA
orange    #ff9e64    #C3691E
green     #9ece6a    #378E23
purple    #9d7cd8    #6C3EB2
yellow    #e0af68    #A27612
red       #f7768e    #CD3048
```

Assign in that order. Red and green are last and non-adjacent deliberately — they are the common
confusion pair, and two areas created back to back must not land on them.

**Colour is never the only signal, and there are two colour systems on this tile, which is the
actual risk.** Keep them apart:

- the **area** colour lives on the left accent bar `▌` and nowhere else;
- the **status** colour lives inside the badge, and every status already carries a text label
  because "colour is never the sole carrier of meaning" (`server/types/agent.ts:7-11`);
- every area additionally carries a **glyph** from a fixed set (`● ◆ ▲ ■ ◇ ○ ◼ ▼`) and its **name**.

The test is mechanical: render the board with the palette stubbed to one hue and assert every area
is still distinguishable by accessible name. If it is not, the tile is leaning on colour.

**Cost — display only.** The engine is 06-tools-cost's: the `CostEvent` ledger, the rate table,
per-image and per-second and per-character rates, `approvalThreshold`, `maxRetries`. **Do not design
any of those here, and do not let this document and that one both specify them.** Read the numbers
through one adapter, `client/src/control-room/agents/costAdapter.ts`, so that when the ledger lands
after you, one file changes. What this page owns:

- per area: spend so far, the area cap, and a bar — not a chart. A chart needs the ledger, and in
  wave 1 the ledger does not exist yet;
- per agent: spend, cap, and the **capability badge**, because capability is what makes an agent
  expensive;
- **units alongside money** — "12 images · 1 video 8s · 2m narration". Media is priced per unit, not
  per token, and a dollar figure alone cannot be sanity-checked by a user;
- **`rateKey` surfaced.** When the price of the model is unknown, the page says **"price unknown"**.
  It never says `$0.00`. `estimateCost` already returns `rateKey: null` honestly and the UI throws
  it away; an unlabelled `$0.00` is a fabricated cost, which the quality audit already forbids;
- **never fabricate.** `client/src/control-room/AgentCard.tsx:22-29` omits every field the server did
  not supply. Carry that rule into the tile: a visual tile must not invent a percentage.

**The per-area budget concept** is `WorkArea.budgetUsd`: a ceiling on the sum of everything spent by
every agent working in that area. Set it at team assembly by dividing the project budget across
areas, the way `server/services/agentTeam.ts:109-112` divides it across agents. **If you cannot
populate it at creation, do not add the field.** `CodingTask.budgetUsd` is settable via the API and
is never set in the live flow, so a per-task cap that was carefully wired up is enforced against
`undefined`. Do not add a third unpopulated cap.

**Amputation is a request, not an edit.** `client/src/control-room/AgentCanvas.tsx` and the
persisted drag positions behind it are dead; `Command`, `Tool`, `File`, `Branch`, `Worktree` and
`Tests` are six of eight fields on the old card and all six are debug output. None of those files
are in your row. Write the deletion list into your handoff file with a one-line reason each, and
build the new page beside them.

### A-12 — What "robustly tested" means here

The owner fixed the order: this page is tested before generation work begins. "Robustly tested" is
not a feeling. It is these seven gates, each with a command:

```text
G-1  Every AGENTS-0NN item is PASS with a re-runnable command recorded in VERIFICATION.md,
     and no item is NOT TESTED.
       bun test server/services/workArea.test.ts server/services/boundary.test.ts \
                server/services/agentTeam.test.ts server/services/agentRegistry.test.ts \
                server/routes/agentRoutes.test.ts
G-2  bun run verify is green, including both typechecks and the production build.
G-3  Reachability: 0 orphans. Every module you added is reachable from a mounted route or
     from AgentsPage.tsx.
       bun run scripts/audit/reachability.mjs
G-4  Endpoint coverage: every endpoint you added has a caller in
     client/src/control-room/agents/**, not only in a test. A test-only caller is an
     endpoint the product does not use.
       bun run audit:endpoints
       grep -rn "/api/coding-agents" client/src/control-room/agents | sort -u
G-5  Two escape probes per boundary route (MCP tool naming another area; absolute path in a
     file-write tool; shell redirect; symlink inside the root pointing out), each shown to
     FAIL before the guard and PASS after. A guard you cannot make fail proves nothing.
G-6  Determinism: five consecutive green runs of the agent suites, no fixed sleeps, waitFor
     from server/services/testSupport.ts, and every live assertion carrying the reply, the
     stop reason and the tool-call count in its failure message.
       for i in 1 2 3 4 5; do bun test server/services/ server/routes/agentRoutes.test.ts || break; done
G-7  Quality audit clean for this page: no dead control, no fabricated cost, no fabricated
     status, no "coming soon".
       bun run audit:quality
```

Two of those exist because the retired product shipped without them. G-4 exists because nine
`/api/library` endpoints were fully tested at HTTP level and **no client code has ever called one of
them** — coverage of a surface is not coverage of its use. G-5 exists because `assertAgentCanWrite`
and the entire `ApprovalQueue` are both tested, both correct, and both have zero production callers:
two complete safety mechanisms shipped as decoration.

### The canonical demo, walked through this page

> A user creates a project: "I need to do this sales presentation."

1. **New project** → choose the category of work (this is what tailors the workspace; a sales-deck
   project must not look like a software project) → paste the description → set a budget of $25.
2. **Assemble team.** One click. One model turn reads the description and proposes:

   | Agent | Capability | Area | Accent | Glyph |
   |---|---|---|---|---|
   | Ada, Researcher | base Grok | Research | blue | ● |
   | Rex, X Analyst | base Grok | X account | cyan | ◆ |
   | Iris, Deck Designer | Grok + images | Slides | magenta | ▲ |
   | Vox, Experience Producer | Grok + voice + images | Video assets | orange | ■ |

3. The proposal shows a capability badge per agent and the line "2 of 4 agents can spend on media."
   The user presses **Create team**. Four areas are created, one per section of the brief, one
   milestone each. Iris's badge says *images and video*, not *slides* — there is no slide endpoint
   and the badge must not imply one.
4. **Start.** Each agent is spawned into its area: cwd is the area root, its MCP server is bound to
   `{projectId, agentId, areaId, capabilities}`, and its boundary hook is written with the area root
   baked in. Ada and Rex have no media tools registered at all and cannot run up a media bill.
5. Ada opens the brief and begins reading. Her row shows `reading "Q3 Deck brief" lines 120–148`,
   from 03's presence service. Six minutes later she stops emitting; the row says `last seen 6m ago`
   and stops highlighting. It does not say she is idle — her session is still working.
6. The user opens the **Tools** panel over the board, picks the "Competitive framing" prompt and
   injects it into Ada. It arrives as a message on her live session and the panel says so. It does
   not change what Ada may call.
7. Rex notices the deck needs a channel-specific opening slide. He cannot write in Slides, so he
   files a suggestion with `targetAreaId` = the Slides area. It appears on Iris's tile as
   "1 suggestion" and in the user's inbox as before / after / Accept / Edit / Reject.
8. Every asset the agents produce lands on the ASSETS page. **That surface is not this document's** —
   this page shows only which agent is working in which area, which document it is reading, what it
   has produced in units, and what it has spent.

Seven clicks and one text field. This page owns five of them. If a design decision on this page
makes that story harder to tell, it is the wrong decision.

### If the loop runs with nothing to do

In rough order of value:

1. **Composition checks.** List what one side produces and what the other consumes, and diff them.
   That is how the dropped budget events were found, in one command. Ask of every new surface: does
   anything actually exercise this? Modules have been reachable but unwired, endpoints declared but
   uncalled, MCP tools advertised but never invoked, and events published and dropped by the client.
   This page adds six such surfaces at once (areas, capability, boundary refusal, targeted
   suggestions, injection, presence), so the question is due six times.
2. **Try to escape.** Give a probe agent an area and an explicit instruction to write outside it,
   through each route in turn: an MCP tool, a shell redirect, an absolute path in a file-write tool,
   a symlink inside its own root pointing out. Every route that succeeds is a hole in the allow-list,
   and finding one is worth more than any feature.
3. **Verify the live model id.** Everything about cost display rests on what `_meta.modelId` a live
   Grok turn actually reports. Until that is recorded, "price unknown" is the honest readout and any
   dollar figure on this page is unproven. Record it and hand it to 06.
4. **Spike the tool-restriction flags** (A-6, step 3). It is the difference between a boundary with
   one seal and a boundary with two.
5. **Documentation drift.** Update the §2 tally whenever the gate count changes. A stale summary is
   worse than none — the retired product's completion gate read "BLOCKED / 34 of 52" for
   twenty-three iterations after the blocker had cleared.

---

## 4. Where the owner's picture and the code disagree

Collected here so no one has to find them by being surprised.

1. **"Slides" is not a capability.** The two surfaces that appear to generate decks — the "Grok for
   PowerPoint" Microsoft 365 add-in and grok.com producing a downloadable `.pptx` — are both user
   interfaces. An add-in panel inside Office and a consumer chat product; neither is callable from a
   server. There is no xAI slide or document generation API. Slide content comes from the chat API
   as structured JSON and the `.pptx` is rendered by us with a Node library (04-generation). This
   page must never label a capability, badge or agent role in a way that implies otherwise. Video is
   the opposite case: the Imagine video API is real, asynchronous, and callable from a server.
2. **Presence cannot be made reliable by this page.** The mechanism is an MCP tool the agent is
   briefed to call periodically. A model can forget. There is no way to observe what an agent is
   reading other than what it says it is reading. The honest UI is a timestamp and a stale state,
   not a promise. Anyone who wants certainty here is asking for a different transport.
3. **"Show cost per image" is not available on this page in wave 1.** ACP returns one usage object
   per turn; per-tool-call attribution needs 04-generation's own HTTP client reading
   `usage.cost_in_usd_ticks`. Until that lands, per-agent and per-area totals plus unit counts are
   the whole truth.
4. **`grok --common_version` is not a Grok Build flag and cannot become one.** `.refs/grok-build` is
   an upstream mirror that refuses external contributions, and the `grok` binary is a separate Rust
   program this repository does not build. The flag belongs to a wrapper of ours on PATH that
   recognises `--common_version`, starts our server, and forwards every other argv verbatim to the
   resolved binary. That wrapper is not this page's; this page's only obligation is to be the
   surface it boots into.
5. **The Tools panel cannot grant capability.** Injecting a skill is injecting text. If the owner
   expects "give this agent image generation" to be a Tools-panel action, the answer is that it is
   an agent-creation action, by construction, and that construction is the budget control.

---

## 5. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest stage in the §3 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` under the `AGENTS-0NN` item.
9. If the work needed a hot file, append the request to `loops/handoff/pivot-agents.md` in the same
   commit. A hot-file change discovered and not written down is a change that does not happen.
10. Commit with a message stating what was verified. Do not push; reconciliation merges branches.
11. Report honestly, including what did *not* move.

---

## 6. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each is
backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

A partially-satisfied item is **NOT TESTED, not PASS**. If one clause cannot be evidenced, say which
clause and hold the item.

Rules learned the hard way. Each exists because it was violated at least once.

- **A passing test proves a unit works, not that anything calls it.** `assertAgentCanWrite`
  (`server/services/repository.ts:261`) and the entire `ApprovalQueue` (`server/services/approvals.ts`)
  are both tested, both correct, and both have zero production callers. Two complete safety
  mechanisms shipped as decoration. Before marking any boundary item PASS, confirm the code is
  reachable from a launched agent.
- **An endpoint with only a test caller is not shipped.** All nine `/api/library` endpoints are
  tested at HTTP level and no client code has ever called one. Their own test file says so in its
  header comment. Do not repeat it on this page.
- **A boundary you cannot make fail is not a boundary.** A checker that cannot be made to fail on
  demand proves nothing when it passes. Write the escape attempt first, watch it succeed, then close
  it — and write more than one probe: four consecutive audits in the retired product shipped with
  bugs in the checker itself, and in one case the first probe passed for accidental reasons and only
  the second exposed it.
- **A fallback in a boundary system is a hole.** `cwdFor` fell back to `process.cwd()` and thereby
  gave an agent write access to this repository's own source. Launch without an area must refuse,
  not default.
- **A refusal that does not name the remedy produces a retry.** And a retry from an agent with media
  capability costs money — roughly $5.52 per 60 seconds of generated experience. Assert the refusal
  text, not just the refusal.
- **An advertised tool that always fails invites a retry too.** Register only the tools the agent's
  capability grants; do not register-and-refuse.
- **Publishing an event is not delivering it.** `budget_warning` and `budget_exceeded` were
  published by the server and ignored by the client for the whole of the retired product's life
  (`client/src/control-room/useControlRoom.ts:145-151`). Every event this page consumes needs a test
  that a rendered component changed.
- **Never show a fabricated figure.** `estimateCost` returns `rateKey: null` for an unknown model and
  the UI shows a static "estimated" caption instead. `$0.00` for an unpriced model is a fabricated
  cost. Show "price unknown".
- **A stale report is not a live one.** Presence goes stale silently and the difference is invisible
  unless the UI draws it. Test the stale branch by advancing the clock, not by hoping.
- **Colour is never the sole carrier of meaning** (`server/types/agent.ts:7-11`). Test it by removing
  the colour, not by reading the CSS.
- **A string a model wrote is not a lookup key.** The roster the assembly turn returns contains role
  names, area names and capability words the model chose. Match tolerantly with
  `resolveAgentForRole`, and record which kind of match happened — plan generation once stored four
  unowned tasks by matching a model's wording with `===`, and because the unmatched role was
  consumed and never persisted, the bug read as random for two iterations.
- **When resolution fails, record what failed to resolve.** Applies to a brief section with no area,
  a capability word the model invented, a skill id the panel injected, and an area whose root path no
  longer exists.
- **Test against reality**: real separate processes, real canonicalised paths, a real rendered DOM. A
  mock that agrees with you proves nothing, and the symlink guard has already produced confident
  wrong answers in both directions.
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module`
  patches the registry process-wide and only reaches importers evaluated *after* it; in the full
  suite the route module is always evaluated earlier, so the mock is silently inert and the test
  opens real sessions. `setAcpSessionManager` (`server/services/acpSessionManager.ts:504`) is the
  pattern.
- **Assert the effect, not the prose.** An agent once replied, fluently and wrongly, that a file
  contained no such value, and passed three re-runs. If the boundary held, prove it by the absence of
  the file on disk, not by the agent saying it did not write one.
- **Put the reply, stop reason and tool-call count into the failure message.** Asserting an effect and
  discarding the evidence makes the next failure undiagnosable.
- **When safety comes from the absence of something, write that down.** A base-Grok agent is safe from
  media spend because the tools are not registered — not because of a check. Say so in the code, and
  make a test fail if the explanation is deleted.

---

## 7. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- an action needs credentials that were not provided — **`XAI_API_KEY` does not exist on this
  machine**, and nothing on this page should need it (§1);
- an irreversible or outward-facing operation needs approval: spending, posting to X, deleting
  tracked files, deploying;
- requirements contradict one another;
- a required external service is unavailable;
- completing one requirement would violate another;
- **a change you need falls outside your row** (§0) and is not a hot file either — that is a gap in
  the partition, not a licence. Write it in the handoff file and stop that thread.

---

## 8. Definition of done

Every item below fills this form in `VERIFICATION.md`. The field names are the schema of the proof;
they are shared because the items are variations on one question — did the mechanism run in the
product, not in a probe.

```text
Item:
Command:
Observed:
Reached from a launched agent or a rendered component (yes/no, how shown):
Clause not evidenced (if any):
```

#### AGENTS-001: A work area is a record

* a `WorkArea` exists with an id, name, colour token, glyph, brief-section anchor, milestone id and a
  canonical root path;
* `rootPath` is stored canonicalised, and a symlink inside the root pointing outside it is resolved
  before any comparison;
* area status is derived, never stored.

#### AGENTS-002: Every area maps to one section and one milestone

* creating an area sets `Requirement.designSection` for the requirements it covers;
* every task created inside an area carries that area's `milestoneId`, and the milestone's `taskIds`
  is non-empty;
* sections of the brief with no area are listed on the page as uncovered.

#### AGENTS-003: An agent is spawned into an area

* the agent record carries `areaId`; `branch` and `worktree` no longer exist on it;
* the session's cwd is the area root, obtained from `resolveAgentEnvironment`;
* launching an agent with no area is refused with `NO_AREA`, and no session is opened.

#### AGENTS-004: A write outside the area is refused at write time

* an MCP mutation naming another area is refused, and the refusal does not depend on an argument the
  agent supplied;
* an agent instructed to write outside its root by absolute path does not create the file;
* an agent instructed to write outside its root via a shell redirect does not create the file;
* the `PreToolUse` hook is installed by the server, not by a hand-edited config, and exits 2;
* the refusal is observable in the transcript, not only in a log.

#### AGENTS-005: A refusal names the remedy

* the refusal text names the suggestion tool and the target area;
* the agent's next action is a suggestion, not a retry of the same write.

#### AGENTS-006: A cross-area concern reaches the user

* `DesignSuggestion.targetAreaId` is set by the tool and stored;
* the suggestion appears in the user's queue with before / after and Accept / Edit / Reject;
* the target area's tile shows the count of suggestions addressed to it.

#### AGENTS-007: Capability is chosen at creation and bounds the agent

* agent creation records `{images, voice}`;
* an agent without `images` has no image or video tool in its MCP `tools/list` response — absent,
  not present-and-failing;
* an agent without `voice` has no narration or transcription tool;
* no clause of this item requires a network call or `XAI_API_KEY`.

#### AGENTS-008: A base-Grok agent cannot spend on media

* a base-Grok agent instructed to generate an image produces no image and no `api.x.ai` request;
* the reason is the absence of the tool, and a test fails if that explanation is removed from the code.

#### AGENTS-009: One click assembles a team from the project description

* the roster is proposed, showing capability and estimated cost per agent, before anything is created;
* a role name the model invented resolves to an agent, and the match kind is recorded;
* an unparseable proposal yields the stated minimum team, a visible failure notice, and **no media
  capability**;
* no capability badge names a medium the API cannot produce — in particular, no badge says "slides".

#### AGENTS-010: The project description reaches every agent

* the brief appears in `rules` at `session/new`, ahead of the persona;
* an agent asked what project it is working on answers from the brief, evidenced by an effect rather
  than by prose;
* the reload path is either shown to carry `rules` or the page does not claim a persona is in effect
  on a resumed session.

#### AGENTS-011: The Tools panel injects a prompt into a live agent

* `POST /api/coding-agents/:agentId/inject` with `kind: "prompt"` renders through the library and
  sends the text on the live session;
* the injected text appears in the transcript and the response names the transcript entry;
* an unresolved variable is refused with `UNRESOLVED_VARIABLE` and the missing names, not sent with a
  hole;
* injecting into a paused agent returns `SESSION_PAUSED` and sends nothing.

#### AGENTS-012: A skill assignment reaches the agent, and the page says how

* injecting a skill records it on the agent record **and** sends it on the live session;
* with no live session the response is `next_start` and the UI says "will apply when this agent next
  starts" — no checkmark, no claim of effect;
* an unknown resource id returns 404 naming the id, and is not silently skipped.

#### AGENTS-013: Injection never grants capability

* injecting a skill that instructs image generation into a base-Grok agent leaves `tools/list`
  unchanged;
* the response carries `capabilityChanged: false` and the UI states that capability is set at
  creation.

#### AGENTS-014: The page shows which design document each agent is reading

* an agent with a fresh presence record renders the document **title** and the line range;
* the document is named, never referred to as "the design document";
* an agent with no presence record renders nothing in that slot, not a default.

#### AGENTS-015: Stale presence is shown as stale

* when 03 reports `stale: true`, the row shows a last-seen time and no live highlight;
* stale presence never changes the agent's status; a working agent that stopped reporting still reads
  as working;
* the stale branch is exercised by advancing the clock in a test, not by waiting.

#### AGENTS-016: Colour is never the only signal

* every area carries a name, a glyph and a text status label;
* the board rendered with the palette stubbed to one hue still distinguishes every area by accessible
  name;
* the area accent and the status colour never occupy the same element.

#### AGENTS-017: The page shows spend per area and per agent, and never fabricates

* per-area and per-agent spend and cap are rendered;
* media units are shown alongside dollars;
* an unknown `rateKey` renders as "price unknown", never `$0.00`;
* a field the server did not supply is omitted, never defaulted;
* the numbers are read through `costAdapter.ts` and no component reads the accounting service
  directly.

#### AGENTS-018: The page is wired in one edit

* `client/src/control-room/agents/AgentsPage.tsx` renders the whole page given a `projectId`;
* it does not import `useControlRoom.ts` or `ControlRoomApp.tsx`;
* every endpoint it calls has a caller under `client/src/control-room/agents/**` and passes
  `bun run audit:endpoints`;
* `loops/handoff/pivot-agents.md` lists every hot-file change the page needs, with signatures.

The AGENTS page is done only when all eighteen items are PASS with recorded evidence, no item is NOT
TESTED, all seven gates of A-12 hold, and the canonical demo can be walked end to end on this
surface without narration.

Only then output `The AGENTS page is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.

---

## 9. Reconciliation — what this worktree hands back

```text
branch    pivot/agents
handoff   loops/handoff/pivot-agents.md
merge     07-shell, then 01/02/03, then 04/05/06, then 08
          (the three pages merge before the generation work because they are tested first)
```

**Public contract added.** Anyone wiring this in needs only these:

```ts
// server/services/workArea.ts
export interface WorkArea { … }                                  // A-1
export interface AgentEnvironment { … }
export function resolveAgentEnvironment(agentId: string): AgentEnvironment;   // throws NoAreaError
export function listAreas(projectId: string): WorkArea[];
export function createArea(input: CreateAreaInput): WorkArea;

// server/services/boundary.ts
export interface AgentCapabilities { images: boolean; voice: boolean }
export function canonical(path: string): string;                 // copied from routes/repository.ts:44-56
export function toolsForCapability(c: AgentCapabilities): string[];
export function assertWriteAllowed(a: { agentId: string; areaId: string; path: string }): string;
export function runAreaBoundaryHook(): never;                    // exits 0 or 2

// client/src/control-room/agents/AgentsPage.tsx
export function AgentsPage(props: { projectId: string }): JSX.Element;
```

```text
HTTP, all on the existing agents router, literal segments registered before /:agentId
  GET    /api/coding-agents/areas?projectId=
  POST   /api/coding-agents/areas
  PATCH  /api/coding-agents/:agentId/area
  POST   /api/coding-agents/:agentId/inject
  POST   /api/coding-agents/team/propose
  POST   /api/coding-agents/team/create
```

**Hot-file requests filed** (the reconciler applies these; this worktree makes none of them):

```text
server/types/agent.ts        drop branch/worktree; add areaId, capabilities
server/types/project.ts      add DesignSuggestion.targetAreaId
server/services/acpSessionManager.ts   replace cwdFor/rulesFor with one resolveAgentEnvironment call
server/services/projectMcpServer.ts    ProjectMcpContext gains areaId + capabilities; register
                                       media tools only when the capability grants them
server/services/controlRoomEvents.ts   no addition requested by this worktree; presence events are 03's
server/routes/projects.ts              launch route :461-526 — worktree creation replaced by
                                       area resolution; 400 NO_AREA when absent
client/src/control-room/ControlRoomApp.tsx   mount <AgentsPage projectId={…} /> (07-shell)
DELETE client/src/control-room/AgentCanvas.tsx and its persisted positions
```

**What this worktree assumed about someone else's work.** Each is a place the merge can go wrong
quietly, so each is checked at reconciliation before this branch is called done:

1. **03-design-docs ships `listPresence(projectId)` and an `agent_presence` event with the fields in
   A-9.** If the shape differs, `presenceAdapter.ts` absorbs it. If presence does not ship at all,
   AGENTS-014 and AGENTS-015 are BLOCKED, not silently passed with an empty slot.
2. **03 enforces the document cardinality** — one project may follow multiple documents, one
   document at most one project. Team assembly calls 03's API and surfaces its refusal; it never
   writes the link.
3. **06-tools-cost keeps `getPromptLibrary()`, `renderPromptById` and `getSkill` importable** with
   their current signatures. The injection endpoint imports them and edits nothing.
4. **06 lands the ledger after this branch**, so the cost readout must be correct against today's
   `usageAccounting.ts` and upgrade through `costAdapter.ts` alone.
5. **02-assets owns the persisted asset id.** This page renders unit counts and ids from 02 and never
   a returned media URL, because returned media URLs expire.
6. **07-shell owns the colour tokens.** This page emits token names; it defines no hex outside the
   palette table in A-11, which is the specification, not the implementation.
7. **`server/services/acpSessionManager.ts`, `server/services/projectMcpServer.ts`,
   `server/services/controlRoomEvents.ts` and `server/routes/projects.ts` are unassigned by the
   partition.** This worktree treats them as hot and touches none of them. If another worktree
   edited them directly, the partition has a hole and reconciliation must arbitrate before merging.
