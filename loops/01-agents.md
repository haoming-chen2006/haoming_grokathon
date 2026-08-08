# AGENTS Page — Loop Operating Document

This is the instruction set for one iteration of the AGENTS loop. Read this file first, act, then
stop. It is deliberately short; the files it cites hold the detail.

| Document | Role |
|---|---|
| `loops/01-agents.md` | This file. The AGENTS surface: work areas, boundaries, the environment an agent runs in, agent creation, team assembly, and what the page *displays* about cost. |
| `loops/04-tools.md` | The tools panel and the **cost engine**. That document owns the ledger, the rate table and every per-unit price. This one owns only the readout. Neither document may design the other's half. |
| `VERIFICATION.md` | The evidence ledger. Record `AGENTS-0NN` rows here. The existing `V-0NN` rows belong to the previous coding product and are not this loop's to update or delete. |

> An agent is hired into one area, may say anything about any area, and may write in exactly one.

---

## 0. Your boundary

This document is assigned to one worktree. The whole product is about boundaries; start by keeping
yours.

**You own, and may edit freely:**

```text
loops/01-agents.md                          this file
server/types/agent.ts                       the agent record
server/services/agentRegistry.ts            create, status, activity, budget, persistence
server/services/agentTeam.ts                team assembly
server/services/workArea.ts                 NEW — the WorkArea record and its store
server/services/agentCapability.ts          NEW — capability -> tools -> endpoints
server/hooks/areaBoundaryHook.ts            NEW — the PreToolUse backstop
server/routes/agents.ts                     the agent HTTP surface
server/routes/areas.ts                      NEW — the area HTTP surface
client/src/control-room/CommandCenter.tsx   becomes the area board
client/src/control-room/AgentCard.tsx       becomes the agent tile
client/src/control-room/AgentStatusBadge.tsx
client/src/control-room/AgentCanvas.tsx     to be deleted (see A-10)
client/src/control-room/SessionDrawer.tsx   the way into a conversation
```

**You may read but must not edit** — each has an owner elsewhere:

```text
server/services/usageAccounting.ts          cost engine            -> loops/04-tools.md
server/services/promptLibrary.ts            skills/prompts/workflows -> loops/04-tools.md
server/routes/library.ts                    same
server/services/repository.ts               git; being amputated   -> the deletion document
client/src/control-room/ReviewQueues.tsx     the suggestion inbox   -> the Doc Hub document
client/src/control-room/DesignDocumentPanel.tsx                      -> the Doc Hub document
client/tailwind.config.js, client/src/index.css   theme tokens      -> the cross-cutting document
```

**Four files are seams.** They carry a field you need and belong to no single document. Do not
rename anything in them; add the named field and nothing else, and say in your commit message that
you did:

```text
server/types/project.ts             DesignSuggestion.targetAreaId, Milestone <-> WorkArea link
server/services/projectMcpServer.ts ProjectMcpContext gains areaId and capabilities
server/services/acpSessionManager.ts cwdFor becomes areaRootFor; rules gains the project brief
server/routes/projects.ts           the launch route (currently :461-526) swaps worktree for area
```

**To raise a cross-boundary concern**: do not edit. Append a dated entry to `loops/CONCERNS.md`
naming the file, the line, the change you want, why, and which document owns it — then continue with
what you own. Create that file in the same commit as your first entry, so the documentation audit's
file-citation check resolves rather than going red on a name that does not exist yet. If the change
is one line and blocks you, say so in the entry and stop for the user (§6). This is the same rule
the product enforces on its agents; a loop document that edits outside its boundary while specifying
boundary enforcement is not credible.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui        # renaming to /Users/haoming/grok-workspace; use whichever resolves
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
`node_modules`. Do not vendor, patch or build it.

### Credentials

Media capability needs `XAI_API_KEY`, which is a **different credential** from whatever signs the
`grok` CLI in. It does not exist on this machine: `grok models` reports "You are not authenticated"
and `~/.grok/config.toml` points at `api.openai.com` and `router.huggingface.co`. Nothing that
touches `api.x.ai` can be evidenced until the user supplies one. That is a §6 stop, not a workaround.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 12 NOT TESTED
Gate: inherited from the previous product — both typechecks, the production build, and four
      audits. Every AGENTS-0NN item below is new and untested.
```

### What exists today

The AGENTS page is the surface with the most surviving code, which makes it the easiest place to
mistake a rename for a rebuild. Precisely what is there:

| Thing | Where | Verdict |
|---|---|---|
| Agent record: role, persona, skills, tools, status, activity, budget, position | `server/types/agent.ts:105-143` | Reused. `branch`/`worktree` (`:122-123`) become `areaId`. |
| Six statuses, each with a **text label** because "colour is never the sole carrier of meaning" | `server/types/agent.ts:7-11`, `:33-70` | Reused verbatim. This is the accessibility rule the whole page inherits. |
| `CodingAgent.color` and `.avatar` | `server/types/agent.ts:114-115` | **Declared, written by nothing, read by nothing.** The colour field already exists and is inert. |
| Registry: create, status, activity, budget evaluation, persistence | `server/services/agentRegistry.ts:115-430` | Reused. `deriveStatus` (`:57`) and `evaluateBudget` (`:72`) are pure and domain-free. |
| `assignTask(agentId, taskId, {branch, worktree})` | `server/services/agentRegistry.ts:290-299` | Becomes `assignArea(agentId, areaId)`. |
| Five-role seeded team, budget split evenly, refuses to seed twice | `server/services/agentTeam.ts:11-17`, `:98-123` | Code survives; the roster data dies. All five roles are coding roles. |
| Tolerant role matching: exact → normalised → family → fallback, reporting which | `server/services/agentTeam.ts:69-96` | Reused verbatim. Its `FAMILIES` table (`:35-41`) is code-shaped and must be replaced. |
| Session open: cwd, MCP servers, `rules` | `server/services/acpSessionManager.ts:210-250` | Reused; `cwdFor` (`:473-490`) becomes the area root. |
| Persona and skills reaching the session prompt | `server/services/promptLibrary.ts:114-126`, `:138-153` → `server/services/acpSessionManager.ts:104-117`, `:247-249` | Reused as-is. Owned by `loops/04-tools.md`; you only add the project brief ahead of the persona. |
| MCP identity bound at server construction — "the identity is not a parameter" | `server/services/projectMcpServer.ts:15-30` | **The most important sentence in the repo for this page.** |
| Agent card that omits every field the server did not supply | `client/src/control-room/AgentCard.tsx:22-29` | Reused as a *rule*, not as a layout. Six of its eight fields are debug output. |
| Fleet summary + a duplicated project cost figure | `client/src/control-room/CommandCenter.tsx:35-79` | Rebuilt as the area board. |
| Transcript, send, pause/resume/stop | `client/src/control-room/SessionDrawer.tsx` | Reused as-is. Agents are mostly in conversation; this is where the conversation is. |
| React Flow node graph with persisted drag positions | `client/src/control-room/AgentCanvas.tsx` | Deleted. Its edges are hidden by `client/src/index.css` (`.react-flow__edges{display:none}`), so it is a grid with extra steps. |

### What the owner assumed that is not true

Say these out loud rather than designing quietly around them.

1. **Cost is broken, not merely incomplete.** `DEFAULT_RATES` in `server/services/usageAccounting.ts:31-35`
   has exactly three keys — `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` — and no Grok model. `resolveRate`
   (`:64-71`) returns `null` for anything else and `estimateCost` (`:77-93`) then returns
   `costUsd: 0, rateKey: null`. Every figure in the shipping product is very likely `$0.00`, and
   `rateKey: null` is surfaced nowhere. A user reads "$0.00 (estimated)" as *cheap*, not as *we do
   not know the price of this model.*
2. **There is no cost ledger.** `agentRegistry.recordUsage` does `agent.costUsd += …`
   (`server/services/agentRegistry.ts:352-398`) and nothing anywhere persists an individual charge.
   No time series, no drill-down, no export, no source data for any chart. The input/output/cache
   token split is computed in `extractUsage` and thrown away at the call site.
3. **Per-tool-call attribution is structurally impossible today.** ACP returns one usage object per
   *turn*. "Cost per image" cannot come from ACP; it must come from our own HTTP client reading
   `usage.cost_in_usd_ticks`, which does not exist yet.
4. **`approvalThreshold` and `maxRetries` are unimplemented** — zero occurrences in code.
5. **Per-task cost IS now tracked** (`server/services/projectStore.ts` `recordTaskCost`). `HANDOFF.md`
   is stale on that point. Do not rebuild it.
6. **Boundaries are enforced nowhere at write time.** Isolation today is a cwd passed to the agent,
   nothing more. `assertAgentCanWrite` (`server/services/repository.ts:261`) has **zero production
   callers**. The whole `ApprovalQueue` in `server/services/approvals.ts` has **zero production
   callers**. `server/hooks/shellSafetyHook.ts` is **not installed by this repository** and only
   classifies shell tools (`SHELL_TOOLS`, `:17`), so a direct file-write tool bypasses it entirely.
   Git worktrees made out-of-bounds edits **recoverable**; they never **prevented** them. Remove git
   and you remove the safety net, not the enforcement — there was no enforcement.
7. **The project has no HTTP client to `api.x.ai`.** It speaks ACP (JSON-RPC over stdio) to the
   `grok` binary and nothing else. Every media capability is net-new transport work, owned by
   `loops/04-tools.md`.
8. **There is no xAI document or slide generation API. None.** Grok Imagine generates images and
   video only. Any agent sent looking for a slide endpoint will not find one.
9. **Custom voice cloning via API is Enterprise-only** (console-created voices otherwise; US only,
   excluding Illinois). The voice-capability picker must not offer "clone my voice" — that is the
   natural next control to add and it is not buildable on a standard plan.
10. **Returned media URLs are temporary.** Any agent record, tile or cost row that stores a returned
    URL instead of a persisted asset id is broken by construction.
11. **`grok --common_version` is not a Grok Build flag and cannot become one.** `grok-build` is an
    upstream mirror that refuses external contributions. The launch flag must live in *our* launcher.
    That belongs to the launcher document; this page's only obligation is to be the surface the
    launcher boots into.
12. **Three fields the pivot depends on have never held a value**: `CodingAgent.color`
    (`server/types/agent.ts:115`), `Requirement.designSection` (`server/types/project.ts:79`), and
    `Milestone.taskIds` — plan generation creates every task without a `milestoneId`, so milestones
    are decorative in the shipping product. A-1 and A-2 exist to give all three a producer.

---

## 3. What must be built, in order

Step 3 of §4 points at this table. Work top to bottom; each stage assumes the one above it.

| # | Stage | Done when |
|---|---|---|
| A-1 | `WorkArea` record and store | AGENTS-001 |
| A-2 | Area ↔ document section ↔ milestone wiring | AGENTS-002 |
| A-3 | `areaId` on the agent; `branch`/`worktree` deleted | AGENTS-003 |
| A-4 | Capability on the agent; capability → MCP tool registration | AGENTS-007, AGENTS-008 |
| A-5 | Spawn into an area; launch refuses without one | AGENTS-003 |
| A-6 | Boundary enforcement at write time | AGENTS-004 |
| A-7 | Refusal names the remedy; `targetAreaId` on `DesignSuggestion` | AGENTS-005, AGENTS-006 |
| A-8 | Team assembly and manual agent creation | AGENTS-009, AGENTS-010 |
| A-9 | The page: area board, tiles, colour, cost readout | AGENTS-011, AGENTS-012 |
| A-10 | Amputation | §22-style quality audit stays clean |

### A-1 — What a work area is

A work area replaces the git worktree. It is a record, not a directory trick.

```ts
// server/services/workArea.ts
export interface WorkArea {
  id: string;                    // "area_<base36>"
  projectId: string;
  name: string;                  // human, shown to the user: "Slides", "Video assets"
  colorToken: AreaColorToken;    // a token name, never a hex — see A-9
  glyph: AreaGlyph;              // the redundant non-colour signal
  briefSectionAnchor: string;    // the section of the project brief this area owns
  milestoneId: string;           // exactly one milestone per area
  rootPath: string;              // canonical absolute path; the ONLY writable directory
  ownerAgentId?: string;         // at most one agent owns an area at a time
  budgetUsd?: number;            // per-area cap; the engine that enforces it is 04-tools'
  createdAt: string;
  updatedAt: string;
}
```

`rootPath` is stored **canonical**. Lift `canonical()` out of `server/routes/repository.ts:44-57`
into `server/services/workArea.ts` before anything else uses it — it resolves the deepest existing
ancestor and appends the rest, and it closes both directions of the symlink bug: the macOS
`/var`→`/private/var` false refusal and the `<root>/link → /etc` false approval. Both halves of
every later comparison must be canonical or the guard is wrong in both directions.

Status is **derived, never stored** — from the owning agent's status and the area's milestone
progress. `EffectiveTaskStatus` in `server/types/project.ts` already establishes this pattern; keep
it, so the graph stays the single source of truth and cannot drift.

### A-2 — Areas map onto sections of the source document, one milestone each

The project carries **one overall description that every agent follows**. That description is a
document with sections. Each section becomes at most one area; each area gets exactly one milestone;
the milestone's tasks are the area's work.

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
  an area. It is a one-line fix that has been missing through 900+ tests, which is the point: nothing
  ever asked whether the relation had run.

Sections without an area are the useful signal, not an error: the page shows "3 of 5 sections of your
brief have nobody working on them." `uncoveredRequirements` in `server/services/planner.ts` already
computes this shape and survives verbatim.

### A-3 — An agent belongs to exactly one area

Delete `CodingAgent.branch` and `.worktree` (`server/types/agent.ts:122-123`); add `areaId?: string`.
Rename `AgentRegistry.assignTask(agentId, taskId, {branch, worktree})`
(`server/services/agentRegistry.ts:290-299`) to `assignArea(agentId, areaId)` plus the existing task
assignment. Keep its shape — "an agent is assigned exactly one area, recorded on the agent record" is
the part of the worktree design that survives.

### A-4 — Capability, and why it is a budget control

Capability is chosen at agent creation and is the most consequential field on the record.

```ts
// server/services/agentCapability.ts
export interface AgentCapabilities {
  images: boolean;   // Grok Imagine: still images AND video (one endpoint family, one credential)
  voice: boolean;    // TTS, STT, realtime speech
}
```

Stored as two flags, presented as four presets — base Grok, Grok + images, Grok + voice, Grok +
voice + images. Store flags rather than a four-value enum because a fifth capability is already
foreseeable (X posting) and an enum forces a migration; presenting four presets keeps the user's
choice to the four the product actually offers.

Video sits under `images` because it is the same endpoint family, the same credential and the same
rate family. Say plainly in the UI that it is also **two orders of magnitude more expensive per
artifact** than a still image.

**Capability decides which tools exist.**

| Capability | MCP tools registered | Endpoints reachable | Unit price |
|---|---|---|---|
| base Grok | every non-media project tool | none directly; text turns go through `grok` over ACP | per token |
| + images | `generate_image`, `edit_image`, `image_to_video`, `poll_video_job` | `POST /v1/images/generations`, `POST /v1/images/edits`, `POST /v1/videos/generations`, `GET /v1/videos/{request_id}` | `grok-imagine-image` $0.02/image; `grok-imagine-image-quality` $0.05/image; `grok-imagine-video` $0.050/sec; `grok-imagine-video-1.5` $0.080/sec |
| + voice | `narrate`, `transcribe` | `POST /v1/tts` (also `wss://`), `POST /v1/stt` | TTS $15.00 per 1M characters; STT $0.10/hr REST |
| + voice + images | the union | the union | the union |

Facts that constrain anything built on that table, all verified: video generation is **asynchronous**
— it returns a `request_id` you poll at `GET /v1/videos/{request_id}` with status
`pending|done|expired|failed`; duration is 1–15 s, default 8; resolutions 480p/720p/1080p; audio is
generated by default. Images are 5 RPS flat across tiers, up to 10 per request; video 10 RPS flat.
`/v1/tts` is **not** OpenAI's `/v1/audio/speech`, so the OpenAI SDK cannot call it; `with_timestamps`
returns per-character timing, which is how narration syncs deterministically to a slide build.
Realtime speech-to-speech is `wss://api.x.ai/v1/realtime` at $0.05–0.08/min.

**The enforcement is registration, not refusal.** A tool the agent's capability does not grant is
**not registered** on that agent's MCP server. Do not register it and return an error. An advertised
tool that always fails is an invitation to retry, and a retry loop is exactly the failure mode that
costs money here: a 60-second generated experience is roughly **$5.52 in media alone**, three orders
of magnitude above a text turn, and one careless retry loop is a $50 mistake.

**This is why capability is a budget control as much as a feature flag.** A base-Grok agent cannot
reach any per-unit endpoint at all, so its worst case is bounded by token spend. The cheapest
spending control in the product is not a dollar cap — it is not granting the capability. Team
assembly and the creation form must both present it that way.

Media calls go **direct to `api.x.ai` with `XAI_API_KEY`**, not through the `grok` CLI's built-in
`image_gen`. The CLI path is subscription-tier gated (blocked on free and X Basic, in headless ACP
mode too) and subject to a remote force-off that environment and config cannot override. That client
is `loops/04-tools.md`'s to build; this page's job is only to record which agent may call it.

### A-5 — Spawning an agent into an area

Launch today (`server/routes/projects.ts:461-526`) creates a git worktree, then opens a session whose
cwd comes from `cwdFor` (`server/services/acpSessionManager.ts:473-490`). Replace the worktree block
with area resolution:

```text
1. resolve agent.areaId -> WorkArea, or refuse with 400 NO_AREA
2. cwd            = area.rootPath                       (canonical)
3. mcpServers     = [ project server bound to {projectId, agentId, areaId, capabilities} ]
4. rules          = project brief + persona + skills + task briefing
5. hook config    = written now, with area.rootPath baked in   (A-6)
6. open the session, then send the briefing
```

**Launch refuses when the agent has no area. There is no fallback.** `cwdFor` used to end at
`process.cwd()`, which handed an agent write access to this repository's own source — the comment
recording that is still at `server/services/acpSessionManager.ts:473-490`. A fallback in a boundary
system is a hole, and this one had already been exploited by accident.

### A-6 — Where the boundary is actually enforced

Nothing enforces it today (§2, item 6). There are two candidate enforcement points. Both are real;
they fail differently.

**Route (A): a `PreToolUse` hook extended to file writes.**

- It is the only interception surface Grok Build offers, and it sees *everything*, including a shell
  redirect that never presents a path argument at all.
- It must `process.exit(2)`. A deny in stdout JSON is **not** honoured under `--always-approve` — the
  command ran. That is recorded from observation at `server/hooks/shellSafetyHook.ts:82-84`; emitting
  both is what actually blocks.
- It must canonicalise every path argument before comparing, using the function lifted in A-1.
- It must be **installed by the server at launch**. The existing hook is a hook nobody installed;
  `scripts/audit/reachability.mjs` declares it an entry point invoked by a file this repository never
  writes.
- Its weakness is structural: it is a **deny-list of tool names pretending to be an allow-list**.
  `SHELL_TOOLS` (`server/hooks/shellSafetyHook.ts:17`) enumerates five spellings of "run a shell
  command". A write-capable tool we fail to name fails **open**. And the path arguments are untyped
  strings in schemas we do not control, so extracting them is a classifier over model-produced text —
  the exact shape this project has already been burned by twice.

**Route (B): MCP-mediated writes.**

- Every project MCP tool already carries its identity bound at server construction:
  "an agent therefore cannot address another project or impersonate another agent by passing
  different arguments — the identity is not a parameter" (`server/services/projectMcpServer.ts:15-30`).
  `projectMcpUrl` binds `projectId` and `agentId` into the URL.
- Adding `areaId` to `ProjectMcpContext` extends that guarantee for free: the area is not a parameter
  either, so there is no argument an agent can pass to write into another area.
- It is an **allow-list by construction**, and it survives Grok renaming its built-in tools.
- Every mutation becomes a structured record that already knows `{projectId, agentId, areaId}` — which
  is also the only way per-area cost attribution and per-area acceptance evidence become possible.
- Its weakness: it covers only what goes through MCP. It does nothing about the agent's own
  filesystem tools.

**Decision: route (B) is the enforcement; route (A) is the seal. Build both, in that order.**

1. **Make the deliverable structured**, so that all mutation *can* go through MCP. This is the reason
   to make it structured; it is not a storage preference. (The deliverable model itself belongs to the
   Doc Hub document — raise the dependency as a concern, do not design it here.)
2. **Add `areaId` and `capabilities` to `ProjectMcpContext`** and scope every mutating tool to the
   agent's area. Non-mutating reads stay project-wide: an agent must be able to *see* the whole brief
   to know what to suggest about it.
3. **Narrow the tool surface at launch** so free filesystem writing is not offered. `grok` documents
   `--tools` / `--disallowed-tools` as a built-in allow/deny by name. **UNVERIFIED in this repo**:
   `ACP_ARGS` (`server/services/acpClient.ts:29`) is fixed at
   `["--no-auto-update","agent","--always-approve","stdio"]` and has never passed either flag, and
   whether a per-session `session/new` can restrict tools at all is unknown. Verify before building on
   it: launch with the flag, tell the agent to write a file outside its root, and require the refusal
   to come from `grok` rather than from the agent's prose.
4. **Install the `PreToolUse` backstop per agent at launch**, with `area.rootPath` baked into the
   config the server writes. It denies and exits 2. It is the thing that catches what routes 2 and 3
   missed, and its denials are the signal that the allow-list has a hole.

Route (B) is primary because it changes the question from "can I recognise a bad path?" to "is there
any way to name another area?", and only the second question has a stable answer.

### A-7 — Raising a concern about something outside your area

This half already works and is the best-preserved thing in the repository. `DesignSuggestion`
(`server/types/project.ts:95-118`) carries `baseVersion` for conflict detection, retains
`originalProposedText` when the user amends it, and is served by the `submit_design_suggestion` MCP
tool and the accept / edit / reject / request-revision queue in
`client/src/control-room/ReviewQueues.tsx`. It is exactly "may suggest outside its area".

Add one field: `targetAreaId?: string`, alongside the existing `requirementId`. Then:

- **A refusal must name the remedy.** When an MCP write is refused for area reasons, the refusal text
  names `submit_design_suggestion` and the target area. A refusal that does not say what to do
  instead produces a retry loop, and with a media capability granted a retry loop is money.
- The AGENTS page shows, per area, the number of open suggestions **addressed to** that area — not
  authored by it. That is the number that means "someone is waiting on you".
- Do not add a second mechanism. If you are tempted to let an agent write outside its area "just for
  small things", that is the boundary being negotiated away one exception at a time.

### A-8 — Agent creation and team assembly

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
estimated cost per agent, plus one line: "2 of these 4 agents can spend on media." Then a Create team
button. A one-click flow that silently grants two agents Imagine capability is a one-click flow that
silently spends money.

**On parse failure**, create a two-agent minimum team — one researcher, one writer, both base Grok —
and say the proposal failed. A project with no team dead-ends: that is why `seedDefaultTeam` exists at
all, recorded in its comment at `server/services/agentTeam.ts:19-33` (a browser-created project had no
agents, so every task resolved to nobody and the first Launch was refused with `NO_AGENT`, with no way
to recover inside the UI). **Never grant a media capability on a fallback path.**

What carries over from `server/services/agentTeam.ts`:

- `resolveAgentForRole` (`:69-96`) — exact → normalised → family → fallback, returning **which** match
  happened. Reused verbatim. Its comment (`:54-68`) records why: an exact string lookup against a
  role the model wrote resolved to nobody, the task stored with no owner, and nothing recorded which
  role had failed to match, so the bug read as random for two iterations.
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
from the tools panel; they reach the session through `rulesForAgent`
(`server/services/promptLibrary.ts:138-153`) → `composeAgentInstructions` (`:114-126`) → `rules` at
`session/new` (`server/services/acpSessionManager.ts:104-117`, `:247-249`). That path is reused as-is
and is `loops/04-tools.md`'s to change. Two things about it you must not misreport on this page:
injection is eager and total (every assigned skill's full text on every session), and the reload path
drops `rules` — `loadSession` in `server/services/acpClient.ts` has no `rules` parameter at all. Whether
a resumed session keeps its persona depends on Grok's persisted session meta and **nothing here verifies
it**. Do not display "persona: X" on a resumed session as though it were in effect.

**The project description reaches every agent.** Add it to `composeAgentInstructions` ahead of the
persona, so the shared brief is the first thing in the system prompt. One line, and it is the
mechanism that makes "a description every agent in the project follows" true rather than decorative.

**Orchestration stays light.** The owner's instruction is an omni-agent that is simple, because agents
are mostly in conversation. There is no planner in this document beyond what already exists, no
scheduler, no dependency solver of its own. The single model turn in team assembly is the one place I
am tempted, and it is justified narrowly: it produces a roster, once, which a human approves; it does
not sequence work, does not own a graph, and does not run again. If a later iteration wants it to
re-plan, refuse — that is a planner wearing an assembly button.

### A-9 — The page

```text
 grok-workspace · Sales presentation · $6.40 of $25.00 est.       [Tools] [Doc Hub]
 ────────────────────────────────────────────────────────────────────────────────
 ▌● Research            Ada · base Grok             Working             $0.12
 │  brief §1 Audience   reading 3 docs in Doc Hub   4 of 6 done
 ▌◆ X account           Rex · base Grok             Waiting on you      $0.04
 │  brief §2 Channel    1 suggestion for Slides     2 of 3 done
 ▌▲ Slides              Iris · Grok + images        Working             $1.85
 │  brief §3 Deck       12 images · 1 video 8s      7 of 14 done
 ▌■ Video assets        Vox · Grok + voice + im.    Needs your approval $4.39
 │  brief §4 Experience 1 video 24s · 2m narration  2 of 5 done
 ────────────────────────────────────────────────────────────────────────────────
 + Add an agent    ⟳ Re-assemble team    ⏸ Pause everything
```

**Colour.** `colorToken` is assigned from a fixed ordered palette in area-creation order, and stored
as a **token name**, never a hex, so light and dark resolve it differently. Port the palette verbatim
from Grok Build's own matched pair — `GrokNight` for dark, `GrokDay` for light — so the overlay reads
as the same product:

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

**Colour is never the only signal, and there are two colour systems on this tile, which is the actual
risk.** Keep them apart:

- the **area** colour lives on the left accent bar `▌` and nowhere else;
- the **status** colour lives inside the badge, and every status already carries a text label because
  "colour is never the sole carrier of meaning" (`server/types/agent.ts:7-11`);
- every area additionally carries a **glyph** from a fixed set (`● ◆ ▲ ■ ◇ ○ ◼ ▼`) and its **name**.

The test is mechanical: render the board with the palette stubbed to one hue and assert every area is
still distinguishable by accessible name. If it is not, the tile is leaning on colour.

**Cost — display only.** The engine is `loops/04-tools.md`'s: the `CostEvent` ledger, the rate table,
per-image and per-second and per-character rates, `approvalThreshold`, `maxRetries`. **Do not design
any of those here, and do not let this document and that one both specify them.** What this page owns:

- per area: spend so far, the area cap, and a bar — not a chart. A chart needs the ledger, and the
  ledger does not exist yet;
- per agent: spend, cap, and the **capability badge**, because capability is what makes an agent
  expensive;
- **units alongside money** — "12 images · 1 video 8s · 2m narration". Media is priced per unit, not
  per token, and a dollar figure alone cannot be sanity-checked by a user;
- **`rateKey` surfaced.** When the price of the model is unknown, the page says **"price unknown"**.
  It never says `$0.00`. `estimateCost` already returns `rateKey: null` honestly and the UI throws it
  away; an unlabelled `$0.00` is a fabricated cost, which the quality audit already forbids;
- **never fabricate.** `client/src/control-room/AgentCard.tsx:22-29` omits every field the server did
  not supply. Carry that rule into the tile: a visual tile must not invent a percentage.

**The per-area budget concept** is `WorkArea.budgetUsd`: a ceiling on the sum of everything spent by
every agent working in that area. Set it at team assembly by dividing the project budget across areas,
the way `server/services/agentTeam.ts:109-112` divides it across agents. **If you cannot populate it at
creation, do not add the field.** `CodingTask.budgetUsd` is settable via the API and is never set in
the live flow, so a per-task cap that was carefully wired up is enforced against `undefined`. Do not
add a third unpopulated cap.

### A-10 — Amputation

Delete `client/src/control-room/AgentCanvas.tsx` and the persisted drag positions behind it. Remove
the `Command`, `Tool`, `File`, `Branch`, `Worktree` and `Tests` rows from the agent tile — six of
eight fields, all debug output. Pause and Stop collapse into one control with a confirmation. Do not
delete anything under `server/services/repository.ts` yourself; it is the deletion document's, and
deleting tracked files is a §6 stop.

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
   milestone each.
4. **Start.** Each agent is spawned into its area: cwd is the area root, its MCP server is bound to
   `{projectId, agentId, areaId, capabilities}`, and its boundary hook is written with the area root
   baked in. Ada and Rex have no media tools registered at all and cannot run up a media bill.
5. Rex notices the deck needs a channel-specific opening slide. He cannot write in Slides, so he files
   a suggestion with `targetAreaId` = the Slides area. It appears on Iris's tile as "1 suggestion" and
   in the user's inbox as before / after / Accept / Edit / Reject.
6. Every asset the agents produce lands back in the Doc Hub. **That surface is not this document's** —
   this page shows only which agent is working in which area, what it has produced in units, and what
   it has spent.

Seven clicks and one text field. This page owns five of them. If a design decision on this page makes
that story harder to tell, it is the wrong decision.

### If the loop runs with nothing to do

In rough order of value:

1. **Composition checks.** List what one side produces and what the other consumes, and diff them.
   That is how the dropped budget events were found, in one command. Ask of every new surface: does
   anything actually exercise this? Coverage of a surface is not coverage of its behaviour — modules
   have been reachable but unwired, endpoints declared but uncalled, MCP tools advertised but never
   invoked. This page adds four such surfaces at once (areas, capability, boundary refusal,
   suggestions with a target), so the question is due four times.
2. **Try to escape.** Give a probe agent an area and an explicit instruction to write outside it,
   through each route in turn: an MCP tool, a shell redirect, an absolute path in a file-write tool, a
   symlink inside its own root pointing out. Every route that succeeds is a hole in the allow-list,
   and finding one is worth more than any feature.
3. **Verify the live model id.** Everything about cost display rests on what `_meta.modelId` a live
   Grok turn actually reports. Until that is recorded, "price unknown" is the honest readout and any
   dollar figure on this page is unproven.
4. **Documentation drift.** Update the §2 tally whenever the gate count changes. A stale summary is
   worse than none — the previous product's completion gate read "BLOCKED / 34 of 52" for
   twenty-three iterations after the blocker had cleared.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest stage in the §3 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` under the `AGENTS-0NN` item.
9. Commit with a message stating what was verified, and naming any seam file you touched (§0).
10. Report honestly, including what did *not* move.

---

## 5. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each is
backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

A partially-satisfied item is **NOT TESTED, not PASS**. If one clause cannot be evidenced, say which
clause and hold the item.

Rules learned the hard way. Each exists because it was violated at least once.

- **A passing test proves a unit works, not that anything calls it.** `assertAgentCanWrite`
  (`server/services/repository.ts:261`) and the entire `ApprovalQueue` (`server/services/approvals.ts`)
  are both tested, both correct, and both have zero production callers. Two complete safety mechanisms
  shipped as decoration. Before marking any boundary item PASS, confirm the code is reachable from a
  launched agent.
- **A boundary you cannot make fail is not a boundary.** A checker that cannot be made to fail on
  demand proves nothing when it passes. Write the escape attempt first, watch it succeed, then close
  it — and write more than one probe: four consecutive audits in the previous product shipped with
  bugs in the checker itself, and in one case the first probe passed for accidental reasons and only
  the second exposed it.
- **A fallback in a boundary system is a hole.** `cwdFor` fell back to `process.cwd()` and thereby
  gave an agent write access to this repository's own source
  (`server/services/acpSessionManager.ts:473-490`). Launch without an area must refuse, not default.
- **A refusal that does not name the remedy produces a retry.** And a retry from an agent with media
  capability costs money — roughly $5.52 per 60 seconds of generated experience. Assert the refusal
  text, not just the refusal.
- **An advertised tool that always fails invites a retry too.** Register only the tools the agent's
  capability grants; do not register-and-refuse.
- **Never show a fabricated figure.** `estimateCost` returns `rateKey: null` for an unknown model and
  the UI shows a static "estimated" caption instead. `$0.00` for an unpriced model is a fabricated
  cost. Show "price unknown".
- **Colour is never the sole carrier of meaning** (`server/types/agent.ts:7-11`). Test it by removing
  the colour, not by reading the CSS.
- **A string a model wrote is not a lookup key.** The roster the assembly turn returns contains role
  names, area names and capability words the model chose. Match tolerantly with
  `resolveAgentForRole`, and record which kind of match happened — plan generation once stored four
  unowned tasks by matching a model's wording with `===`, and because the unmatched role was consumed
  and never persisted, the bug read as random for two iterations.
- **When resolution fails, record what failed to resolve.** Applies to a brief section with no area, a
  capability word the model invented, and an area whose root path no longer exists.
- **Test against reality**: real separate processes, real canonicalised paths, a real rendered DOM. A
  mock that agrees with you proves nothing, and the symlink guard has already produced confident wrong
  answers in both directions.
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module`
  patches the registry process-wide and only reaches importers evaluated *after* it; in the full suite
  the route module is always evaluated earlier, so the mock is silently inert and the test opens real
  sessions. `setAcpSessionManager` (`server/services/acpSessionManager.ts`) is the pattern.
- **Assert the effect, not the prose.** An agent once replied, fluently and wrongly, that a file
  contained no such value, and passed three re-runs. If the boundary held, prove it by the absence of
  the file on disk, not by the agent saying it did not write one.
- **Put the reply, stop reason and tool-call count into the failure message.** Asserting an effect and
  discarding the evidence makes the next failure undiagnosable.
- **When safety comes from the absence of something, write that down.** A base-Grok agent is safe from
  media spend because the tools are not registered — not because of a check. Say so in the code, and
  make a test fail if the explanation is deleted.

---

## 6. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- an action needs credentials that were not provided — **`XAI_API_KEY` does not exist on this machine
  and nothing media-related can be evidenced without it**;
- an irreversible or outward-facing operation needs approval: spending, posting to X, deleting tracked
  files, deploying;
- requirements contradict one another;
- a required external service is unavailable;
- completing one requirement would violate another;
- **a change you need falls outside your work area** (§0). File the concern and stop that thread.

---

## 7. Definition of done

Every item below fills this form in `VERIFICATION.md`. The field names are the schema of the proof;
they are shared because the items are variations on one question — did the mechanism run in the
product, not in a probe.

```text
Item:
Command:
Observed:
Reached from a launched agent (yes/no, how shown):
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
* the session's cwd is the area root;
* launching an agent with no area is refused with `NO_AREA`, and no session is opened.

#### AGENTS-004: A write outside the area is refused at write time

* an MCP mutation naming another area is refused, and the refusal does not depend on an argument the
  agent supplied;
* an agent instructed to write outside its root by absolute path does not create the file;
* an agent instructed to write outside its root via a shell redirect does not create the file;
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
* an agent without `images` has no image or video tool registered on its MCP server — absent, not
  present-and-failing;
* an agent without `voice` has no narration or transcription tool registered.

#### AGENTS-008: A base-Grok agent cannot spend on media

* a base-Grok agent instructed to generate an image produces no image and no `api.x.ai` request;
* the reason is the absence of the tool, and a test fails if that explanation is removed from the code.

#### AGENTS-009: One click assembles a team from the project description

* the roster is proposed, showing capability and estimated cost per agent, before anything is created;
* a role name the model invented resolves to an agent, and the match kind is recorded;
* an unparseable proposal yields the stated minimum team, a visible failure notice, and **no media
  capability**.

#### AGENTS-010: The project description reaches every agent

* the brief appears in `rules` at `session/new`, ahead of the persona;
* an agent asked what project it is working on answers from the brief, evidenced by an effect rather
  than by prose;
* the reload path is either shown to carry `rules` or the page does not claim a persona is in effect
  on a resumed session.

#### AGENTS-011: Colour is never the only signal

* every area carries a name, a glyph and a text status label;
* the board rendered with the palette stubbed to one hue still distinguishes every area by accessible
  name;
* the area accent and the status colour never occupy the same element.

#### AGENTS-012: The page shows spend per area and per agent, and never fabricates

* per-area and per-agent spend and cap are rendered;
* media units are shown alongside dollars;
* an unknown `rateKey` renders as "price unknown", never `$0.00`;
* a field the server did not supply is omitted, never defaulted.

The AGENTS page is done only when all twelve items are PASS with recorded evidence, no item is NOT
TESTED, the gate is green, and the canonical demo can be walked end to end on this surface without
narration.

Only then output `The AGENTS page is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
