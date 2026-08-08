# Tools and Cost — Loop Operating Document

This is the instruction set for one iteration of the tools-and-cost loop. Read this file first, act,
then stop. It is deliberately short; the files it points at hold the detail.

| Document | Role |
|---|---|
| `loops/06-tools-and-cost.md` | This file. The Tools-panel and cost-engine contract, the build order, and the checklist TOOL-001…TOOL-012, COST-001…COST-015. |
| `grok-workspace.md` | The product contract. What the system must become. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

This worktree owns two subsystems that sit underneath the three headline pages rather than being one
of them:

* the **Tools panel** — prompts, skills and workflows, and the act of injecting one into an agent
  that is already running. It opens over any page; it is used *from* the AGENTS page;
* the **cost engine** — the rate table, the ledger, the budget meter, the drill-down, the approval
  gate and the retry cap.

> A running total is not a ledger, and a zero is not a price. Everything else in this document is a
> consequence of those two sentences.

**What this surface contributes to the canonical demo.** The user says "I need to do this sales
presentation." Four agents are assembled: research, X, slides with Imagine, video with voice and
Imagine.

The Tools panel is where the team's competence comes from. "One agent with Imagine capability
generating the slides" is only convincing if that agent knows this company's deck conventions, and
that knowledge is a skill — a directory of markdown the user wrote once and turned on for this
project. Without the panel, every project starts its agents from zero and the demo produces a
generic deck. Injection is the same idea at a smaller scale: the user watches an agent go the wrong
way, opens the panel over the AGENTS page, and hands that agent a prompt or a skill without
restarting it.

The cost engine is what makes the demo safe to run twice. Two of the four agents hold media
capability. A 60-second generated experience costs about **$5.52 in media alone** and one careless
retry loop is a $50 mistake. The demo ends with a number — *this deck cost $6.20, here is where it
went, and here is what each of the five asset types cost*. Today that number would be `$0.00` and
there would be nothing behind it. §2.4 explains why.

---

## 0. Your boundary

**You are in a git worktree, on your own branch, in a checkout that is not the main one.** Seven
sibling worktrees are running at the same time on sibling branches, editing files right now. You
will not see their changes and they will not see yours until a single reconciliation pass at the
end. Everything in this section exists so that pass is possible.

```text
loop:    06-tools-cost
branch:  pivot/tools-cost
handoff: loops/handoff/pivot-tools-cost.md
```

**The files you own.** Create, edit and delete these freely. Nothing else.

```text
server/services/promptLibrary.ts     prompts, skills, workflows: model, persistence, injection
server/routes/library.ts             the HTTP surface(s) this loop exports
server/services/usageAccounting.ts   token extraction, the rate table, the estimator
server/services/costLedger.ts        the ledger: schema, append-only store, rollups, pre-flight
client/src/control-room/tools/**     the Tools panel, and the cost UI (see the deviation below)
loops/06-tools-and-cost.md           this file
loops/handoff/pivot-tools-cost.md    your handoff file; only you write it
```

Tests beside the owned server files are yours: `server/services/promptLibrary.test.ts`,
`server/routes/library.test.ts`, `server/services/usageAccounting.test.ts`,
`server/services/costLedger.test.ts`. The first three already exist and are green.

**Two deviations from the partition, both deliberate, both recorded in the handoff on iteration 1.**

1. *The partition gives this loop no cost directory in the client.* It names
   `client/src/control-room/tools/**` and nothing else. The cost UI therefore lives at
   `client/src/control-room/tools/cost/`. Do not invent `client/src/control-room/cost/` — a path no
   row claims is a path two worktrees can both create.
2. *The partition gives this loop no `server/routes/cost.ts`.* Rather than claim a new path, export
   a **second Hono router from `server/routes/library.ts`**, which you own, and request its mount in
   the handoff. One file, two routers, zero new claims.

The general rule, because it will come up again: **a new file at a path no row claims may be
created, but the claim goes in the handoff on the iteration you create it.** Two worktrees inventing
`server/services/rates.ts` independently is a reconciliation problem that no merge tool can solve.

**The files you must not touch, and why.** Each is another worktree's row. An edit here is a merge
conflict at best and a silent contradiction at worst — two worktrees implementing the same idea with
different field names, discovered at reconciliation when neither can be backed out.

```text
server/services/workArea.ts, boundary.ts, agentTeam.ts, agentRegistry.ts   01-agents
server/routes/agents.ts, client/src/control-room/agents/**                 01-agents
server/services/assetStore.ts, server/routes/assets.ts                     02-assets
client/src/control-room/assets/**                                          02-assets
server/services/designDoc.ts, presence.ts                                  03-design-docs
server/routes/designDocs.ts, client/src/control-room/designdoc/**          03-design-docs
server/services/xai/**, server/services/render/**, server/routes/generation.ts   04-generation
server/services/software/**, client/src/control-room/software/**           05-software
client/src/main.tsx, index.css, tailwind.config.js, control-room/shell/**   07-shell
server/services/auth.ts, x/**, server/routes/users.ts, control-room/users/**  08-users-x
docs/USER-GUIDE.md                                                         guide
```

Read any of them. You must, in fact — the ledger's ingest contract is consumed by 01, 02, 04 and 05,
and a contract written without reading the consumer is a contract nobody can call.

**Note what is *not* on either list.** `server/services/acpSessionManager.ts`,
`server/routes/projects.ts`, `server/routes/api.ts`, `server/services/projectMcpServer.ts` and
`server/services/controlRoomEvents.ts` appear in no row. Three of them hold cost ingest sites this
loop depends on. **Treat all five as hot.** That is a gap in the partition, not a licence; record it
in the handoff so reconciliation knows it was deliberate.

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
to `loops/handoff/pivot-tools-cost.md` — a file only you own — stating the file, the exact change,
the reason, and the signature or event shape other worktrees will depend on. One reconciliation pass
applies every request at the end.

Design your own code so someone else can wire it in with one edit. Export a clean entry point; never
reach into the shell. Concretely, for this loop:

* the `CostEvent` type cannot live in `server/types/cost.ts` — `server/types/*.ts` is hot. Export it
  from `server/services/costLedger.ts` and request the re-export in your handoff;
* the three existing cost ingest sites are in files you do not own. **The previous revision of this
  document granted itself three "narrow exceptions" to edit them. Those exceptions are withdrawn.**
  Export `getCostLedger().record(input)` and request the call sites in the handoff:
  `server/services/acpSessionManager.ts:370-392` (the per-turn estimate),
  `server/routes/agents.ts:152-219` (the HTTP usage ingest, 01's file), and
  `server/routes/projects.ts:318-330` (the planner turn);
* your routers cannot be mounted by editing `server/routes/api.ts`. Export them from
  `server/routes/library.ts` and request the two one-line `apiRoutes.route(...)` calls;
* your budget meter cannot be placed by editing `ControlRoomApp.tsx`. Export a component and request
  the mount;
* the Tools panel cannot be opened by an import from `client/src/control-room/agents/**`, because
  that is 01's directory and an import both ways is a cycle. Use the DOM-event contract in §4.6.

**How to raise a cross-boundary concern.** Do not edit, and do not work around it. The mechanism
already exists and is the best-preserved thing in the repository: `DesignSuggestion`
(`server/types/project.ts:95-118`), the `submit_design_suggestion` MCP tool, `baseVersion`/`stale`
conflict detection, and the accept / edit / reject / request-revision queue in
`client/src/control-room/ReviewQueues.tsx`. Outside the running product, write the concern into your
handoff file with the file, the line, and what you believe is wrong, then continue with something
inside the boundary. If nothing inside the boundary can proceed until it is answered, stop and
report — see §8.

**What you leave behind.** The branch, the handoff file with every hot-file request written as an
exact diff, and the public contract in §9: types, endpoints, events, exported functions, and every
assumption you made about another worktree's work. Merge order is 07-shell, then 01 / 02 / 03, then
04 / 05 / 06, then 08 — the pages are tested first.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

Confirm the environment. If any check fails, fix that before anything else:

```bash
./node_modules/.bin/grok --version
bun run verify > /tmp/verify-tools.log 2>&1; echo "exit $?"
bun test server/services/promptLibrary.test.ts server/routes/library.test.ts \
         server/services/usageAccounting.test.ts
```

`bun run verify` runs server typecheck → client typecheck → all tests → production build → the four
audits (`package.json`: `typecheck && test && build && audit`). **A red gate is always the
highest-priority work**, ahead of any checklist item.

**Capture verify's output to a file, never `>/dev/null`.** Discarding it means a red gate cannot be
diagnosed without re-running, and with a live-agent flake at roughly one in five the re-run is
usually green and the evidence is gone.

One extra check belongs to this document and to no other:

```bash
[ -n "$XAI_API_KEY" ] && echo "xai credential present" \
  || echo "NO XAI CREDENTIAL — no price in the rate table can be checked against a live response"
```

The research confirms this machine is not on xAI at all: `~/.grok/config.toml` points at
`api.openai.com` and `router.huggingface.co`, and `grok models` reports "You are not authenticated."
Every media price in §2.5 is read from published documentation, not observed. That is a stop
condition for parts of the cost work, not for all of it — see §8.

**Know who owns which process.** The `grok` binary is a separate Rust program (`.refs/grok-build`, a
read-only upstream mirror this repository does not build). We speak ACP — JSON-RPC over NDJSON on
stdio — to `grok agent --always-approve stdio` (`server/services/acpClient.ts:28`). We cannot
instrument the model call. **The only thing we ever see of a turn's cost is the `_meta` that binary
chooses to report.** That is why the turn path can only ever be an estimate, and why the direct
HTTP path 04 builds is the only place a billed figure can come from. §4.2 turns that split into the
ledger's pricing tiers.

---

## 2. State as of iteration 0

```text
TOOL: 0 PASS · 0 FAIL · 0 BLOCKED · 12 NOT TESTED   (TOOL-001…TOOL-012)
COST: 0 PASS · 0 FAIL · 0 BLOCKED · 15 NOT TESTED   (COST-001…COST-015)
Gate: fill this line from the output of `bun run verify` on your first iteration.
```

Do not copy a test count from another document. `loopdesign.md:68-72` says 715 tests across 42
suites; `HANDOFF.md` says 940 across 50 files; `VERIFICATION.md` says 727. They disagree because each
was written at a different iteration and none was rederived. The gate's own output is the only
number worth writing down, and this block is the one place that owns it.

### 2.1 Resources — what exists today, verified

The whole feature is one service, one router, and no client.

| Layer | File | State |
|---|---|---|
| Model and persistence | `server/services/promptLibrary.ts` (373 lines) | Implemented, well tested |
| HTTP | `server/routes/library.ts` (95 lines, 9 endpoints) | Implemented, tested at HTTP level |
| Mount | `server/routes/api.ts:32` — `apiRoutes.route("/library", libraryRoutes)` | Mounted at `/api/library` |
| Client | — | **Does not exist** |

`grep -rn "api/library" client/src` returns nothing. Verified. The only non-test caller anywhere is
`scripts/acceptance/v052.mjs`. The test file says so itself (`server/routes/library.test.ts:12-14`):
every one of the nine endpoints had no caller at all, found by `bun run audit:endpoints`, and the
tests were written to cover that hole rather than close it. **A user of the shipping product cannot
create, view, edit or assign a skill, a prompt or a workflow.**

The three models, exactly as they are:

```text
Skill            promptLibrary.ts:32-39   { id, name, description?, instructions, createdAt }
PromptTemplate   promptLibrary.ts:22-29   { id, name, body, variables[], createdAt }
PromptVariable   promptLibrary.ts:15-20   { name, description?, required, default? }
ProjectWorkflow  promptLibrary.ts:52-59   { id, name, description?, roles[], stages[], createdAt }
WorkflowStage    promptLibrary.ts:41-49   { id, name, role, dependsOn[], reviewGate }
```

Facts that decide the plan:

- **A skill is one string.** `instructions` is the entire payload. No directory, no files, no
  frontmatter, no enable/disable, no version, no scope, no `updatedAt`.
- **`Skill.description` is stored and read by nothing.** `promptLibrary.ts:35` declares it,
  `createSkill` (`:212`) persists it, and no code path anywhere reads it. It is the field that must
  become the discovery prompt.
- **There is no `update*` and no `delete*` for any of the three types.** The library is append-only;
  `library.json` can only be corrected by hand. The owner's "editable in place" is impossible today,
  on the server, before any UI question arises.
- **Injection is eager, total and unconditional.** `rulesForAgent` (`promptLibrary.ts:138`)
  concatenates every assigned skill's full `instructions` through `composeAgentInstructions`
  (`:114`) into the `rules` string handed to `session/new`
  (`server/services/acpSessionManager.ts:104-117`, `:248`; the planner does the same at
  `server/routes/projects.ts:318`). Ten skills of 2,000 words each is 20,000 words of system prompt
  on every session, forever. This is the exact opposite of progressive disclosure.
- **A corrupt library presents as an empty library.** `load()` logs and swallows
  (`promptLibrary.ts:196-198`). A user whose `library.json` was truncated sees no skills and no
  error, and the panel will confidently offer to create the first one.
- **`instantiateWorkflow` milestones hardcode `dependsOn: []`** (`promptLibrary.ts:355`) while tasks
  remap dependencies correctly. The tests assert only the task side. Nothing persists the returned
  plan either — `server/routes/library.ts:83-95` hands the JSON back to whoever asked.
- **`agent.tools` is written and never read.** Whatever the panel does with "tools", it starts from
  zero.
- **Storage is project-independent.** `getPromptLibrary()` (`promptLibrary.ts:366`) resolves one
  `library.json` under `OPENUI_DATA_DIR` or `~/.openui`. A resource is global to the machine, not to
  a project. That is probably right for a personal library and definitely wrong for a per-project
  skill; decide, do not inherit it silently.

### 2.2 The owner's three definitions against the shipped models

| Owner | Shipped | Verdict |
|---|---|---|
| prompt = simple copy-and-paste text, a single line | templated `body` with `{variable}` placeholders, a declared variable schema, a render that 400s on an unresolved required variable | **Richer than asked.** Keep the engine, downscope the default creation form. The single-line prompt is the degenerate case of what already works. |
| skill = a preprocessed directory of markdown fronted by a discovery prompt, turnable up and down, pulled in through the discovery prompt, discoverable later | one string, injected in full at session open, with a `description` nothing reads | **Not built, and inverted.** Every clause of the owner's sentence is absent. |
| workflow = customisable agent control logic — a loop, an evolve-loop, a loop that edits its own loop document | a static DAG of named stages with role labels and review-gate booleans, expanded once into a draft nothing applies | **A different concept with the same word.** `ProjectWorkflow` is a plan template. The owner is describing an interpreter. |

### 2.3 The skill convention to follow, and why not to invent one

The owner's definition is the `SKILL.md` progressive-disclosure convention, close to verbatim.
**Follow it rather than inventing a format, for a reason that is mechanical rather than aesthetic:
the `grok` binary this product drives already implements it.** Reference clone, read-only:

```bash
less /Users/haoming/openui/.refs/grok-build/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md
ls   /Users/haoming/openui/.refs/grok-build/crates/codegen/xai-grok-tools/src/implementations/skills/
```

What is already there, and therefore what we must not rebuild:

- A skill is a directory containing `SKILL.md` — YAML frontmatter plus a markdown body. Required in
  practice: `name` and `description`, where the description states what the skill does *and when to
  use it*. That description is the discovery prompt.
- Discovery roots in priority order: `./.grok/skills/`, `<repo>/.grok/skills/`, `~/.grok/skills/`,
  plus Claude and Cursor compatibility roots and `~/.grok/server-skills/`. Deduplicated by name,
  higher priority wins.
- Three loading tiers: a budget-capped listing of name plus description injected as a system
  reminder; the body injected only when the model invokes the skill; bundled files loaded on demand.
  A fourth, sharper tier exists — a skill with `paths:` globs is held out of the listing entirely
  until a tool touches a matching file. That maps directly onto a work area.
- Turning a skill up and down is `[skills] disabled` and `[skills] ignore` in `~/.grok/config.toml`:
  disabled means still listed but excluded from the system prompt and from invocation; ignore means
  hidden entirely.
- `grok inspect --json` enumerates every discovered skill with name, description, source and whether
  it is user-invocable. That is a ready-made read API for the panel.

So the panel's job is to be **a filesystem editor and a config writer**, not an injector. It is also
the cheapest possible implementation of "discoverable by the agent later": writing
`.grok/skills/<name>/SKILL.md` into an agent's working directory makes it a local-scope skill for
that agent alone, which is exactly the shape of "an agent works inside one area".

**The rule that follows, and it is the one most likely to be got wrong: do not keep the `rules`
bulk-paste and adopt `SKILL.md` at the same time, or every agent receives every skill twice** — once
eagerly in the system prompt and once on invocation. After this work, `rules` carries the persona,
the shared project brief and the work-area boundary, and nothing else. TOOL-007 exists to catch the
double.

**Unverified, and it must be checked before TOOL-004 is designed:** whether an ACP stdio session
(`--no-auto-update agent --always-approve stdio`, `server/services/acpClient.ts:28`) runs the same
skill discovery as the terminal UI. The evidence points to yes — the session setup path calls the
skills bridge and emits an `AvailableCommandsUpdate` carrying skills and workflows — but this
repository has never observed it, and `AcpSessionUpdateKind` (`server/services/acpClient.ts:29-35`)
lists only six update kinds, none of them that one. If the notification is arriving, it is being
received and discarded, and reading it would populate the panel with live, agent-visible skills for
almost nothing. **Spike it: open one session, log every `session/update` kind that arrives, and
record the list verbatim.**

### 2.4 Cost — what exists today, verified, and why it is broken

What works:

| Mechanism | Location |
|---|---|
| Token extraction from ACP `_meta` | `server/services/usageAccounting.ts:47-61`, called at `server/services/acpClient.ts:473` |
| Cost estimate from list prices | `server/services/usageAccounting.ts:77-93`, called at `server/services/acpSessionManager.ts:370` and `server/routes/projects.ts:324` |
| Per-agent cumulative cost and cap | `server/services/agentRegistry.ts:352-398` |
| Per-task cumulative cost and cap | `server/services/projectStore.ts:1217-1248` |
| Warning at 80% then hard stop | `server/services/agentRegistry.ts:31`, `:72-92` |
| Budget events to the UI | `server/routes/agents.ts:190-216`, consumed at `client/src/control-room/useControlRoom.ts:304-311` with a correct severity ratchet — an "exceeded" is never downgraded by a later "warning" |

**Per-task cost is now tracked and enforced. `HANDOFF.md` is stale on that point; do not repeat it.**

Now the part that matters.

```text
DEFAULT_RATES (server/services/usageAccounting.ts:31-35) has exactly three keys:
  gpt-4o, gpt-4o-mini, gpt-4.1.
There is no Grok model in it. The product drives grok.
```

`resolveRate` (`:64-71`) returns `null` for an unknown model. `estimateCost` (`:77-79`) then returns
`{ costUsd: 0, estimated: true, rateKey: null }` — described in its own comment as "an honest zero
the UI can label". **Nothing labels it.** `rateKey` is returned and consumed nowhere: verified, the
only occurrences in the tree are `usageAccounting.ts` itself and its test. What the UI shows instead
is a static caveat string, duplicated verbatim in two files
(`client/src/control-room/ProjectHeader.tsx:30`, `client/src/control-room/CommandCenter.tsx:19`),
rendered at `ProjectHeader.tsx:126-147` and `CommandCenter.tsx:58-77`, plus a per-agent figure at
`client/src/control-room/AgentCard.tsx:72`.

So a user sees `est. $0.00 / $10.00` and reads it as *cheap*. It means *we do not know the price of
this model*. Cost in the shipping product is not incomplete. It is wrong in the one direction that
cannot be noticed.

**There is no ledger.** `recordUsage` does `agent.costUsd += …`
(`server/services/agentRegistry.ts:359`) and `recordTaskCost` does
`task.costUsd = task.costUsd + …` (`server/services/projectStore.ts:1227`). Nothing anywhere
persists an individual charge — no timestamp, no model id, no operation label, no row. The
consequence is not "the charts are missing"; it is that **every chart in the pivot brief has no
source data and cannot be backfilled**, because the information was destroyed at write time.

**The token split is computed and thrown away.** `TokenUsage` carries input, output, cached-read and
reasoning counts plus the model id (`server/services/usageAccounting.ts:9-16`); every caller
collapses it to `{ costUsd, tokens, estimated }` (`server/services/acpSessionManager.ts:381-383`,
`server/routes/projects.ts:327`).

**`approvalThreshold` and `maxRetries` are unimplemented.** Verified: zero occurrences across
`server/ client/ shared/ scripts/ bin/`. The design contract names both.

**`ApprovalQueue` is written, tested, and called by nothing.** `server/services/approvals.ts:133-222`,
with `budget_increase` already in `RESTRICTED_ACTIONS` (`:17-24`) and a full request/resolve
lifecycle. `grep -rn "getApprovalQueue"` returns its own definition (`:225`) and one test file.
Wiring it is the cheapest large win in this document.

**Per-tool-call attribution is structurally impossible and will stay that way.**
`AcpConnection.prompt()` returns one `usage` object per turn (`server/services/acpClient.ts:443`,
`:473`); ACP `tool_call` updates carry no usage. Anything finer than a turn would be an invention.
Say "per turn" in the UI and mean it; do not label a turn's cost as a tool's.

### 2.5 What the media capabilities cost, and why cost is a pillar

All of this is read from published documentation on 2026-08-08 and **not observed on this machine**,
because no xAI credential exists here. Record the source and the date beside every rate you enter.

```text
images   POST /v1/images/generations      grok-imagine-image          $0.02  / image
                                          grok-imagine-image-quality  $0.05  / image
                                          5 RPS flat, up to 10 images per request
video    POST /v1/videos/generations      grok-imagine-video          $0.050 / second
         ASYNC: returns request_id;       grok-imagine-video-1.5      $0.080 / second
         poll GET /v1/videos/{request_id} duration 1-15s, default 8; 480p/720p/1080p
         status pending|done|expired|failed        audio generated by default; 10 RPS flat
speech   POST/WSS /v1/tts                 $15.00 / 1M characters; with_timestamps gives
                                          PER-CHARACTER timing — the deterministic way to
                                          sync narration to a slide build
         POST /v1/stt                     $0.10 / hour REST
         WSS  /v1/realtime                $0.05-0.08 / minute
```

A 60-second generated experience is roughly eight clips at eight seconds: `8 × 8 × $0.080 = $5.12`
of video plus one source image each at `8 × $0.05 = $0.40`, so **about $5.52 in media alone**. One
careless retry loop is a $50 mistake. That is the whole argument for COST-011.

Two API facts constrain the ledger's schema:

- `usage.cost_in_usd_ticks` is returned on chat completions, the Responses API, image generation,
  video generation and the Batch API, at 10^10 ticks to the dollar. That is a **billed** figure, not
  an estimate, and it covers server-side tool invocations in the same number. The ledger must be
  able to record a charge as billed rather than derived, because for those modalities we will have
  the real price. The documentation does **not** state whether TTS, STT or realtime responses carry
  it; treat voice as derived from published rates until a live response proves otherwise.
- **Returned media URLs are temporary.** A ledger row must reference the persisted asset path
  `02-assets` wrote, never the URL it came from, or the row will eventually point at nothing and the
  user cannot see what a charge bought.

### 2.6 Software generation is a different cost shape, and the reference is on disk

Read the reference before writing anything about what software costs. It is cloned, read-only:

```bash
ls /Users/haoming/openui/.refs/open-lovable/app/api
sed -n '1,60p' /Users/haoming/openui/.refs/open-lovable/config/app.config.ts
```

`open-lovable` (github.com/firecrawl/open-lovable) is the Lovable-style reference: a user describes a
web interface, a model writes it, and it runs in a sandbox with a live preview. Three facts from it
change the cost model, and none of them is a media price:

- **Generation is whole-file streaming at a per-request token cap.** `maxTokens: 8192` at
  `.refs/open-lovable/app/api/generate-ai-code-stream/route.ts:1308`, on a route that is 1,895 lines of prompt
  assembly, context selection and file parsing. A software asset is not one turn; it is many large
  turns, and the cost is dominated by output tokens.
- **There is a repair loop.** `check-vite-errors`, `monitor-vite-logs`, `report-vite-error` and
  `clear-vite-errors-cache` are all API routes. A build error feeds back into another generation
  turn. **That is the retry hazard for software, and it is a text-token hazard, not a media one** —
  which means COST-011's cap must be per *operation kind*, not per media job.
- **The sandbox is metered by wall clock, by a third party.** `.refs/open-lovable/config/app.config.ts` sets an E2B
  timeout of 30 minutes and a Vercel Sandbox timeout of 15. Whatever `05-software` chooses, a
  running preview costs money for as long as it is up, on a meter that is not xAI's and returns no
  `cost_in_usd_ticks`. The ledger needs a `sandbox_minutes` unit kind and an operation whose price
  comes from a rate this product configures, not from a response.

**Do not put a sandbox rate in the table with an invented number.** Leave it unpriced, which renders
as "price unknown", until `05-software` names the provider and the published rate. An unpriced row
is honest; a guessed rate is a fabrication that silently understates a bill that runs while nobody
is watching.

### 2.7 Where the owner assumed something that is not true

Stated plainly, because designing quietly around these is how a wrong assumption survives into the
product.

1. **"The resources backend already exists, so the panel is a skin."** Half true, and the wrong half
   is load-bearing. The API works and has never been called, so the client is cheaper than it looks;
   but two of the three models do not match the concepts they are named after. Skills are
   near-greenfield. Workflows are a different object with the same word.
2. **"A prompt is a single line."** The shipped model is richer, not poorer. Nothing needs to be
   simplified on the server; the creation form needs a simple default.
3. **"Cost tracking exists and needs deepening."** It is broken. Every figure in the shipping product
   is very likely `$0.00`, every budget is unreachable, and every budget warning is unfirable,
   because no Grok model is in the rate table. This is a repair before it is a feature.
4. **"A skill can be turned up or down."** Grok's control is not a dial. It is three states: absent,
   listed-but-inactive, active. If a continuous intensity is wanted it has to be invented in our
   layer — as a per-agent allow-list plus a listing budget — and invented things should be argued
   for, not assumed. TOOL-006 takes the three states; propose the dial as a change if you want it.
5. **"A workflow that edits its own loop document to add goals."** Grok's workflow engine is real —
   Rhai scripts with `agent()`, `parallel()`, `budget()`, `pause()` and scratch files, with a journal
   and a child-agent budget — but a same-process resume continues the **original, immutable** script.
   The sanctioned self-editing pattern is: save the returned script as a copy and launch it as a new
   run. A live self-mutating loop is not available. Do not write a checklist item that requires one.
6. **There is no xAI document or slide generation API. None.** Not for PPTX, DOCX, PDF or slides.
   **Slides cannot be delegated to Grok.** The two surfaces that look like they generate decks are
   both user interfaces, not APIs: the "Grok for PowerPoint" Microsoft 365 add-in is a panel inside
   Office, and grok.com producing a downloadable `.pptx` is the consumer chat product. Neither is
   callable from a server. We generate slide **content** with the chat API as structured JSON and we
   render the `.pptx` **ourselves** with a Node library. For the cost engine this is not a
   disappointment — it is a simplification: a deck's model cost is ordinary text turns, its media
   cost is images and narration priced per unit, and **the rendering step costs nothing**, because it
   is our own code. Video is the opposite case: the Imagine video API is real and callable from a
   server, so a workflow asset's cost is a real per-second meter.
7. **This project has no HTTP client to `api.x.ai` today.** It speaks ACP — JSON-RPC over stdio to
   the `grok` binary — and nothing else. `grep -rn "api.x.ai" server/` returns zero hits. Every media
   rate in §2.5 becomes reachable only after `04-generation` builds that client. The cost engine must
   therefore be written so it can be proven correct on text turns alone, and priced media rows simply
   appear later.
8. **Custom voice cloning via API is Enterprise-only**, console-created, US excluding Illinois. The
   panel must not offer "clone your voice" as a resource a user can create.
9. **"Workflow" now names two different things, and the collision is new.** The five asset types
   include `workflow`; the Tools panel also holds workflows. `02-assets` flags this as its open
   question X-1 (`loops/02-assets.md:1034`) and takes the reading that a workflow *asset* is a
   rendered sequence of steps. This document takes the matching reading from the other side: **the
   Tools panel's workflow is the definition — reusable agent control logic — and there is exactly one
   store for it, `server/services/promptLibrary.ts`.** If the owner means the asset is a view onto
   that same object, the panel exposes it read-only over `/api/library/workflows/:id` and nothing
   else in this document changes. Under no reading is a second workflow store built. Marked inferred,
   not demonstrated.

---

## 3. Build order

**The owner has fixed this.** AGENTS, ASSETS and DESIGN DOCUMENTS are built and robustly tested
first. Slide generation, workflow/video generation and software generation come after. That order
is not a preference; it decides what this loop does in what sequence, and it produces one gate that
is not negotiable.

```text
Stage  Items                  Work                                                      Blocks
S1     COST-001               Observe what modelId a live grok turn reports             all of S2-S9
S2     COST-002 COST-003      Unit-aware rate table; unpriced renders as unknown        S3
S3     COST-004..006          The ledger: schema, append-only store, ingest contract    S4, S5, S7
S4     COST-007 013 014       Rollups incl. per-asset-type; metered vs billed           —
S5     COST-008 009 015       Budget meter, drill-down, the single money formatter      — [PAGES]
S6     TOOL-001..003 011      Prompts, the panel, injection from the AGENTS page        — [PAGES]
S7     COST-010..012          approvalThreshold, retry cap, pre-flight estimate         GATE, below
S8     TOOL-004..007          Skills as SKILL.md directories; stop the double-inject    —
S9     TOOL-008..010 012      Workflows: decide, then build or rename honestly          —
```

`[PAGES]` marks the work the three headline pages need from this loop. It is done before S7 because
the pages are tested first.

**The gate, stated once so nobody has to infer it: `04-generation` and `05-software` may not merge
until COST-010 and COST-011 pass.** Those two loops are the ones that spend real money. A generation
backend that merges before the approval threshold and the retry cap exist is a product that can
spend $50 in a loop with nothing to stop it, and the money is gone before anyone reads a chart.
Write this into your handoff; reconciliation enforces merge order, and this is the one ordering
constraint that is about dollars rather than conflicts.

**Why cost comes before the panel.** Within this loop, the ledger outranks the Tools panel because
an unrecorded charge is unrecoverable — the money is gone and there is no row to reconstruct it
from. The panel can be late. The ledger cannot.

**Why COST-001 blocks everything.** A rate table proven by a unit test proves arithmetic. Only a
live turn proves the key matches the model id that actually arrives. Building S2 onward on a guessed
model id produces a green suite and a product that still reports `$0.00`.

**What can be proven without an xAI credential:** all of S1–S9 except a billed media row. The ledger,
the rollups, the formatter, the approval gate, the retry cap and the whole Tools panel are provable
on text turns and synthetic rows. Do not stall the loop on the credential; stall exactly the items
that need it, and say which.

---

## 4. The design

### 4.1 The ledger row

One append-only table. Everything else in the cost engine is a grouping over it.

```text
CostEvent {
  id, at,
  projectId, areaId?, agentId?, taskId?,
  assetId?, assetType?,        "document" | "slides" | "table" | "workflow" | "software"
  designDocId?,                which design document declared the work (03)
  operation,                   "turn" | "injection" | "image_generation" | "video_generation"
                               | "tts" | "stt" | "realtime" | "sandbox"
  modelId?, rateKey: string | null,
  inputTokens?, outputTokens?, cachedTokens?, reasoningTokens?,
  units?: { kind: "tokens" | "images" | "video_seconds" | "characters"
                  | "audio_hours" | "realtime_minutes" | "sandbox_minutes",
            count: number },
  costUsd: number | null,
  pricing: "billed" | "metered" | "estimated" | "unknown",
  meteredDeltaUsd?,            billed minus our own metered arithmetic, when both exist
  providerRequestId?,          request_id for a video job; the response id otherwise
  assetPath?,                  the persisted local path — never a temporary provider URL
  capability?,                 the capability that authorised the spend: base|images|voice|voice+images
  attempt?,                    retry ordinal, so a retry loop is visible as rows rather than a total
  approvalId?                  set when the spend passed the approval gate
}
```

Rules that come with it:

- **`record()` never throws.** By the time it is called the money is already spent. A throw loses the
  row, not the charge. An unpriceable charge is written with `costUsd: null` and
  `pricing: "unknown"`, and the unpriced-charge report (COST-009) is how it gets noticed.
- **Append-only.** No row is updated or deleted. A correction is a new row.
- **The totals are derived.** `agent.costUsd` and `task.costUsd` become sums over the ledger, not a
  second source of truth kept beside it. Two counters that can disagree eventually will.
- **A media row references the persisted path.** Returned media URLs expire; a row pointing at one
  eventually cannot show the user what the charge bought.
- **`capability` is a cross-check, not an enforcement.** `01-agents` enforces that a base-Grok agent
  cannot call a media endpoint. This loop records what capability the spending agent held, so a media
  row from a base agent is *detectable*. Enforcement is a claim; the ledger is the check on the
  claim. Two mechanisms, because one of them is somebody's word.

### 4.2 Four pricing tiers, and why media is exact and model cost is not

This is the distinction the owner asked to be made explicit, and it must be a field on the row, not
a footnote in the UI.

| Tier | Where the number comes from | When |
|---|---|---|
| `billed` | `usage.cost_in_usd_ticks` on the response, 10¹⁰ ticks to the dollar | chat completions, Responses API, image generation, video generation, Batch |
| `metered` | our own arithmetic: units × a published per-unit rate | images per image, video per second, TTS per character, STT per hour, realtime per minute |
| `estimated` | token counts × a per-million-token rate | every ACP turn, and anything else priced from tokens |
| `unknown` | nothing. `costUsd` is `null` | no rate for this model or medium; renders as "price unknown" |

**Why a media charge is exact and a model charge is not.** For media, we choose the unit count — we
asked for *n* images, *d* seconds, *len(text)* characters — and the published price is per unit. The
arithmetic has no estimation step in it; the only way it is wrong is if the published rate drifted.
For a model turn, three separate things can be wrong: the token counts come from the `_meta` the
`grok` binary chooses to report, the rate is per-million and per-model, and the model id is a string
the provider picked which may not match any key in our table — which is exactly the failure the
product is shipping today (§2.4). Three sources of error against one.

**`billed` beats `metered` beats `estimated`, and the gap between the first two is free
instrumentation.** When a response carries `cost_in_usd_ticks` *and* we computed a metered figure,
record `pricing: "billed"` with the ticks figure and store the difference in `meteredDeltaUsd`. A
delta that is consistently non-zero means the rate table has drifted from the published price, and
it shows up as a number instead of as a surprise on an invoice. COST-014 is that check.

**Voice stays `estimated` until proven otherwise.** The documentation does not state whether `/v1/tts`,
`/v1/stt` or `/v1/realtime` return `cost_in_usd_ticks`. Do not assume either way. The exact thing to
check: make one `/v1/tts` call and record whether the response body contains a `usage` object with
`cost_in_usd_ticks`. Until then voice is metered from $15.00/1M characters with the source and the
date recorded beside the rate.

### 4.3 Cost by asset type — the spread, and what dominates each

There are five asset types now and they do not cost remotely the same. The rollup by `assetType` is
the number the owner actually wants at the end of the demo, and it is only possible because
`assetType` is on the row from day one.

| Asset type | What dominates the bill | Tiers on its rows | Notes |
|---|---|---|---|
| `document` | text turns | `estimated`, or `billed` when ticks arrive | The cheapest type. Cost is turns, and a turn's cost is per-turn only — it can be *apportioned* across what the turn touched, never attributed per tool call. |
| `table` | text turns | same as documents | Rendering a spreadsheet is our code and costs nothing. |
| `slides` | images, then narration, then turns | `metered` for images and TTS; `estimated` for turns | Content is structured JSON from the chat API; the `.pptx` is rendered by us (§2.7.6). Twelve slides with eight quality images is `8 × $0.05 = $0.40`; 6,000 characters of narration is `6000 × $15.00/1e6 = $0.09`. |
| `workflow` | video seconds | `metered` | The expensive one. 60 seconds at `grok-imagine-video-1.5` with a source image per clip is **$5.52**. |
| `software` | many large text turns, plus sandbox wall clock | `estimated` for turns; `unknown` for sandbox until a rate is configured (§2.6) | The repair loop is the hazard: a build error feeds another generation turn. Cap by operation kind. |

**The spread, honestly.** A table asset is a handful of turns; a 60-second workflow asset is $5.52 of
metered media. Using `gpt-4o`'s published rate purely to show the shape — **this is not a Grok price
and must not be entered as one** — a 2,000-token turn is roughly $0.01, so the two ends of the range
are about three orders of magnitude apart. The real ratio is unknown until COST-001 reports what a
Grok turn actually costs. Say "unknown" until then rather than repeating the slogan.

The product consequence: **the budget meter must never show one undifferentiated bar.** A user who
has spent $6 on a deck and a user who has spent $6 on eleven seconds of video are in completely
different situations, and only the per-asset-type rollup tells them apart.

### 4.4 What the panel is, and who sees what

The cost engine has two audiences and they must not be served by the same screen.

| Surface | Audience | Content |
|---|---|---|
| Budget meter | non-technical | Spend against the project budget, in plain words, broken by asset type. No token counts, no model names. |
| Per-asset price | non-technical | "This deck has cost $6.20 so far." Rendered by `02-assets` on the asset, using this loop's formatter. |
| Approval prompt | non-technical | Before an expensive job: what it will make, what it will cost, and what a retry would cost. One Approve, one Cancel. |
| Capability cost hint | non-technical | At agent creation: base Grok cannot run up a media bill; voice and images can. Rendered by `01-agents` from a rate summary this loop exports. |
| Ledger drill-down | power user | Every row: timestamp, agent, area, asset, operation, model or media id, token split, units, rateKey, pricing tier, attempt. Filterable, exportable as CSV. |
| Rate table editor | power user | The rates themselves, each with its source URL and the date it was read. |
| Unpriced-charge report | power user | Every row whose pricing is `unknown`, grouped by model id. This is the list that tells you the table has drifted or a new model arrived. |

A salesperson should never see the word `rateKey`; a power user must reach it in two clicks.

The Tools panel splits the same way: creating a prompt or a skill must require **no path, no filename
and no frontmatter syntax** (TOOL-010), while the resulting file location, the YAML and the skill's
scope stay available to whoever wants them.

### 4.5 Injection into a live agent — the contract `01-agents` consumes

This is new, and it is the one place where this loop's work is visible on somebody else's page. The
user is watching an agent on the AGENTS page, opens the Tools panel over it, and hands that agent a
prompt, a skill or a workflow *without restarting it*.

The division of labour is forced by the partition: **this loop resolves, `01-agents` delivers.** This
loop never touches a session; `01-agents` never renders a resource.

```text
// server/services/promptLibrary.ts — exported by 06, called by 01

type InjectionKind = "prompt" | "skill" | "workflow";

InjectionRequest {
  kind, resourceId,
  values?: Record<string,string>,   // prompt variables only
  projectId, agentId
}

InjectionPayload {
  kind, resourceId, resourceName, resourceVersion,
  text: string | null,              // deliver into the live session; null for a mount-only skill
  mounts: SkillMount[],             // files 01 writes through its boundary; [] for prompts
  effective: "this_turn" | "next_session",
  estimatedInputTokens: number,     // what this adds to the next turn's input
  provenance: { libraryVersion, at }
}

SkillMount { relativePath, contents }   // e.g. ".grok/skills/deck-conventions/SKILL.md"

resolveInjection(req: InjectionRequest): InjectionPayload     // pure. No session I/O. Never spawns.
```

How `01-agents` uses it, and what each side owes:

1. `01-agents` exposes the delivery endpoint on its own router and calls `resolveInjection`.
2. If `text` is non-null, `01-agents` delivers it through the existing session message path.
3. If `mounts` is non-empty, **`01-agents` writes them, not this loop** — a mount lands inside the
   agent's own work area and therefore has to pass the boundary that `01-agents` owns. This loop
   hands descriptors; it never writes into a work area.
4. `01-agents` records the resulting turn into the ledger with `operation: "injection"` and the
   `resourceId`, so "what did adding that skill cost?" is answerable.

**The honest part, and it is the thing most likely to be quietly got wrong: a prompt takes effect on
the next turn; a skill mostly does not.** A prompt is text delivered into the open session, so
`effective: "this_turn"`. A skill is a directory that `grok` discovers at session setup, so mounting
it mid-session is `effective: "next_session"` unless we also paste the body once as a one-shot. Both
behaviours are defensible; **what is not defensible is a panel that says "skill enabled" and shows no
difference for an hour.** The panel states which of the two happened, in words, every time. TOOL-011
tests exactly that, and it is `effective` that makes it testable.

**Unverified, and it gates the mount path:** whether a `session/load` reopen re-runs skill discovery.
`loadSession` has no `rules` parameter today (`server/services/acpClient.ts:404-411`) and
`server/services/acpSessionManager.ts:244` reopens through it. The exact thing to check: mount a
skill carrying a run-time-assembled marker, reopen the session, and see whether the agent can name
the marker. Until that is run, the panel says `next_session` and means the next *new* session.

### 4.6 How the panel is opened from a page this loop does not own

`client/src/control-room/agents/**` belongs to `01-agents`. An import in either direction is a
coupling that reconciliation has to unpick, and an import in both is a cycle.

Use a DOM event. The precedent is in this repository: the legacy shell already communicates this way
with `openui:toggle-help`, `openui:toggle-search` and `openui:restart-tour`
(`client/src/App.tsx:308`, `client/src/components/Header.tsx:142-149`).

```text
// client/src/control-room/tools/contract.ts — owned by 06, the ONLY module 01 imports from here
export const OPEN_TOOLS_EVENT = "workspace:open-tools";
export interface OpenToolsDetail { agentId?: string; tab?: "prompts" | "skills" | "workflows" }
```

`01-agents` imports the constant and the type, and dispatches. This loop's panel listens. No
component import crosses the boundary, no hot file is edited, and the event name is typed rather than
a string literal repeated in two worktrees — which is the failure this repository has already had at
larger scale, where budget events were published by the server and dropped by the client because
nothing connected the two ends.

### 4.7 The money formatter

One function formats currency for the whole application, exported from this loop, imported by
`01-agents`, `02-assets`, `03-design-docs` and `07-shell`.

```text
formatCharge({ costUsd, pricing, rateKey, modelId }): string
  billed     "$6.20"
  metered    "$5.52"
  estimated  "$0.41 est."
  unknown    "price unknown"      never "$0.00", never "$—", never blank
```

The reason it is one function and not a convention: `$0.00` is currently rendered in three places
from three different code paths, and every one of them is lying. A single formatter is the only
version of "never fabricate a value in the UI" that survives four worktrees writing components in
parallel. COST-015 enforces it by grepping for any other component that formats a dollar figure.

---

## 5. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the **highest item in the stage table in §3 that is not passing**.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement, inside the §0 boundary.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md`.
9. Append any hot-file change you need to `loops/handoff/pivot-tools-cost.md`, as an exact diff.
10. Commit with a message stating what was verified. Do not push.
11. Report honestly, including what did *not* move.

### 5.1 If the loop runs with nothing to do

In rough order of value:

1. **Diff what one side produces against what the other consumes.** This is how the budget events
   were found to be published by the server and dropped by the client, and how nine library endpoints
   were found to have no caller at all. List what the ledger records, list what the rollups read, and
   diff them. Do the same for the panel and `/api/library`.
2. **Re-run the acceptance flow.** It is the only test that exercises the whole system, and the only
   place that has ever proven a skill reaches a live agent (`scripts/acceptance/v052.mjs`, which
   plants a run-time-assembled codename in a skill and asserts the agent writes it to a file). When
   TOOL-004 changes how skills reach an agent, that step is the one that will catch the break.
3. **Turn a by-inspection check into a test.** A one-time manual verification decays the moment the
   code moves.
4. **Documentation drift.** Update §2's tally when the gate count changes. A stale summary is worse
   than none — that is how the previous gate came to read "BLOCKED / 34 of 52" for twenty-three
   iterations after the blocker had cleared.

---

## 6. The checklist

Two-part form: what an observer would see, then a fenced block of empty labelled fields that becomes
the proof in `VERIFICATION.md`. A partially-satisfied item is NOT TESTED, not PASS.

### 6.1 Cost

#### COST-001: The model id a live turn reports is known

Required result:

* one real `session/prompt` turn is captured together with its `_meta`;
* the `modelId` string is recorded verbatim, not paraphrased;
* `resolveRate` is run against it and the result — a rate key, or `null` — is recorded;
* if the result is `null`, the rate table gains an entry keyed on the observed id.

Evidence:

```text
modelId reported:
resolveRate result:
Rate table entry added:
```

#### COST-002: Every model and medium the product can call has a rate

Required result:

* the rate table names every text model configured for the `grok` binary;
* per-unit rates exist for images (per image), video (per second), speech synthesis (per million
  characters), transcription (per hour) and realtime speech (per minute);
* the rate type can express a per-unit price as well as a per-million-token price — `ModelRate`
  (`server/services/usageAccounting.ts:18-25`) cannot today, and `estimateCost` needs a second,
  non-token code path;
* every rate records the source URL and the date it was read;
* a medium with no established rate — the software sandbox (§2.6) — is absent from the table rather
  than present with a guessed number.

Evidence:

```text
Rate keys:
Per-unit rates:
Source and date on each:
Deliberately absent rates:
```

#### COST-003: An unpriced charge says "price unknown", never "$0.00"

Required result:

* a charge whose `rateKey` is `null` renders as the words "price unknown" everywhere a figure
  appears;
* the token or unit count is still shown, because that part is exact;
* a total containing an unpriced charge is marked incomplete and names how many charges are unpriced,
  rather than silently adding zero;
* a budget is not reported as under its limit when unpriced charges exist.

Evidence:

```text
Unknown-model turn:
Rendered per-agent figure:
Rendered project total:
```

#### COST-004: Every charge is a ledger row

Required result:

* a `CostEvent` is appended for every operation that costs money, priced or not;
* each row carries every field in §4.1 that applies to it;
* the ledger is append-only — no row is ever updated or deleted;
* one agent turn, one image generation and one narration render produce exactly one row each;
* a media row references the persisted asset path, never the temporary provider URL;
* `record()` returns a row rather than throwing when the charge cannot be priced.

Evidence:

```text
Rows after one agent turn:
Rows after one image generation:
Append-only proof:
Unpriceable charge still recorded:
```

#### COST-005: The running totals are derived from the ledger, not kept beside it

Required result:

* `agent.costUsd` and `task.costUsd` equal the sum of their ledger rows;
* a test appends rows, re-derives both totals, and fails if they diverge;
* all three ingest paths land in the ledger — the live turn
  (`server/services/acpSessionManager.ts:370`), the HTTP ingest (`server/routes/agents.ts:152`) and
  the planner turn (`server/routes/projects.ts:324`). None writes a total without a row.

Evidence:

```text
Ledger sum:
Stored total:
All three ingest paths exercised:
```

#### COST-006: The token split survives to the ledger

Required result:

* input, output, cached-read and reasoning counts reach the row distinctly;
* a turn with cached reads shows the cached count separately from full-price input;
* nothing collapses the split to a single `tokens` number before the row is written.

Evidence:

```text
Turn _meta:
Row written:
```

#### COST-007: The ledger answers the questions a chart would ask

Required result:

* spend can be grouped by day, by agent, by area, by model, by operation and by asset;
* each aggregation reports how many of its rows were unpriced;
* the ledger exports as CSV with one row per charge;
* an aggregation over an empty range returns an empty result, not zero — the two are different
  answers.

Evidence:

```text
Group-by results:
Unpriced count per group:
Export sample:
Empty-range result:
```

#### COST-008: A non-technical user can see what has been spent

Required result:

* one budget meter shows spend against the project budget in plain words;
* it breaks spend down by asset type, so eleven seconds of video and a finished deck are not the same
  bar;
* no token count, model name or rate key appears on it;
* an absent figure is omitted, never defaulted to a plausible-looking number.

Evidence:

```text
Budget meter:
Per-asset-type breakdown:
Behaviour with no data:
```

#### COST-009: A power user can see where the money went

Required result:

* every ledger row is reachable in the UI with its rate key and its pricing tier;
* rows can be filtered by agent, area, asset, operation and date;
* the unpriced-charge report lists every distinct unknown model id;
* a retried operation shows its attempts as separate rows, with the attempt ordinal.

Evidence:

```text
Drill-down DOM assertion:
Filter applied:
Unpriced report:
Retry attempts visible:
```

#### COST-010: Spending above a threshold requires a human click

Required result:

* a job whose pre-flight estimate exceeds the configured `approvalThreshold` does not start;
* it raises a request through the existing queue in `server/services/approvals.ts` and waits;
* the prompt names what will be produced, what it is estimated to cost, and what one retry would add;
* denying it produces no charge and no ledger row;
* approving it produces exactly one row per operation, each carrying the `approvalId`.

Evidence:

```text
Threshold configured:
Job blocked:
Prompt text shown:
Charge after denial:
approvalId on the rows after approval:
```

#### COST-011: A retry loop cannot run up a bill

Required result:

* a retry cap exists and is enforced **per operation kind**, because the hazards differ — a failing
  video job and a failing software build loop are capped separately (§2.6);
* a failing job is retried at most that many times;
* exceeding the cap pauses the agent with a stated reason, not a silent stop;
* the reason names the operation, the number of attempts and the total spent on them;
* every attempt is its own ledger row with its `attempt` ordinal.

Evidence:

```text
Caps configured, per operation kind:
Attempts observed:
Pause reason shown:
Total spent on the failed operation:
```

#### COST-012: An expensive job is estimated before it runs

Required result:

* the estimate is computed from the rate table and the requested units — number of images, seconds of
  video, characters of narration, sandbox minutes;
* the estimate is stored on the job and compared with the actual charge on completion;
* the difference between estimate and actual is visible to a power user;
* an operation with no rate produces "price unknown" as its estimate, never zero.

Evidence:

```text
Requested units:
Estimate:
Actual:
Difference shown:
```

#### COST-013: Spend is answerable per asset type

Required result:

* a rollup by `assetType` returns all five types — `document`, `slides`, `table`, `workflow`,
  `software` — with the unpriced count for each;
* a type with no rows returns an empty group, not `$0.00`;
* a charge that belongs to no asset (a planner turn, an injection) is grouped as unattributed rather
  than being silently dropped or arbitrarily assigned;
* the demo deck's total reconciles: the sum of its asset's rows equals the figure `02-assets` renders
  on that asset.

Evidence:

```text
Rollup by asset type:
Empty type:
Unattributed group:
Reconciliation with the asset page figure:
```

#### COST-014: A charge records whether its price was billed, metered, estimated or unknown

Required result:

* every row carries one of the four tiers in §4.2, and the tier is rendered wherever the figure is;
* an image or video charge is `metered` from units × published rate when no ticks are returned, and
  `billed` from `cost_in_usd_ticks` when they are;
* when both exist, the row is `billed` and `meteredDeltaUsd` holds the difference;
* a non-zero delta is surfaced in the unpriced/drift report, because it means the rate table has
  drifted from the published price;
* a turn is never labelled `metered` and a media unit charge is never labelled `estimated`.

Evidence:

```text
Tier on a turn row:
Tier on an image row:
cost_in_usd_ticks observed (or recorded as unverified):
meteredDeltaUsd:
Drift report:
```

#### COST-015: One function formats money, and nothing else does

Required result:

* `formatCharge` (§4.7) is the only place in `client/src` that renders a dollar figure;
* an audit fails the gate when any other component formats currency itself;
* `unknown` renders as "price unknown" through that function, in every consumer;
* the three existing duplicated caveat strings (`client/src/control-room/ProjectHeader.tsx:30`,
  `client/src/control-room/CommandCenter.tsx:19`, and the per-agent figure at
  `client/src/control-room/AgentCard.tsx:72`) are replaced by it or removed.

Evidence:

```text
Formatter call sites:
Audit output:
Duplicate caveat strings remaining:
```

### 6.2 Tools

#### TOOL-001: A resource can be edited and deleted

Required result:

* update and delete exist on the service and on the route for prompts, skills and workflows;
* an edit made in the panel survives a server restart;
* deleting a skill that an agent has been assigned does not stop that agent from launching —
  `rulesForAgent` already skips an unknown id deliberately (`server/services/promptLibrary.ts:144-150`),
  and that behaviour must be preserved and tested;
* a corrupt library file surfaces as an error, not as an empty library
  (`server/services/promptLibrary.ts:196-198` today swallows it).

Evidence:

```text
Edit persisted:
Delete result:
Agent launch after delete:
Corrupt-file behaviour:
```

#### TOOL-002: A prompt can be written without knowing what a variable is

Required result:

* the default creation form is one name field and one body field;
* a prompt with no placeholders creates, lists and copies with no further input;
* variables are an optional disclosure, and the existing unresolved-variable error is unchanged when
  they are used.

Evidence:

```text
Prompt created:
Copy action:
Variable path still errors on a missing required value:
```

#### TOOL-003: The panel opens over any page

Required result:

* the Tools panel opens as an overlay from AGENTS, ASSETS and DESIGN DOCUMENTS, and closes without
  losing the page's state;
* it is dismissible from the keyboard;
* it reads and writes through `/api/library`, which no client code has ever called;
* it opens in response to `OPEN_TOOLS_EVENT` (§4.6) with an `agentId` preselected, and no component
  outside `client/src/control-room/tools/` imports anything else from this loop.

Evidence:

```text
Opened from each page:
State after close:
Network calls observed:
Event-driven open with agentId:
```

#### TOOL-004: A skill is a directory on disk

Required result:

* creating a skill from the panel writes `<root>/<skill-name>/SKILL.md` with YAML frontmatter
  carrying `name` and `description` and a markdown body;
* further markdown files can be added under the same directory from the panel;
* the file on disk is the single source of truth — no second copy of the body is kept in
  `library.json`;
* a skill created outside the panel, by hand, appears in the panel.

Evidence:

```text
Directory written:
Frontmatter:
Hand-created skill listed:
```

#### TOOL-005: The discovery prompt decides what the agent sees

Required result:

* `description` is the field that decides relevance and is no longer stored-and-ignored;
* what the agent is offered contains name and description only, never the skill body;
* the body reaches the model only after the skill is invoked;
* the panel refuses to save a skill whose description does not say *when* to use it, because a
  description that only says what it is cannot be matched against a task.

Evidence:

```text
Listing the agent received:
Body absent from the listing:
Body present after invocation:
```

#### TOOL-006: A skill can be turned down

Required result:

* a skill has three states: absent, listed-but-inactive, and active;
* the state is written to configuration, not held in memory, and survives a restart;
* turning a skill off removes it from the agent's listing on the next session, and this is observable
  in what the session receives rather than only in the UI.

Evidence:

```text
State set:
Config written:
Listing before and after:
```

#### TOOL-007: A skill never arrives twice

Required result:

* an agent's skill reaches it through disk discovery **or** through `rules`, never both;
* `rulesForAgent` carries the persona, the shared project brief and the work-area boundary, and
  nothing else;
* a test asserts the skill body appears exactly once in what the session is opened with;
* the reload path is covered: `loadSession` has no `rules` parameter today
  (`server/services/acpClient.ts:404-411`), so a resumed session must be shown to receive the same
  skills as a fresh one, or the difference must be recorded.

Evidence:

```text
Occurrences of the skill body in session input:
rules content:
Fresh session vs resumed session:
```

#### TOOL-008: A workflow is executable, or it is honestly named

Required result:

* **either** a workflow launches through Grok's workflow engine and its run — phase, child agents,
  budget — is visible in the panel;
* **or** the object is renamed to what it is, a stage template, everywhere in the UI and the API, and
  the words "loop", "evolve-loop" and "control logic" are removed from the product surface;
* whichever is chosen, `instantiateWorkflow`'s hardcoded empty milestone dependencies
  (`server/services/promptLibrary.ts:355`) are either fixed or the milestones are dropped;
* the instantiated plan is persisted by something, or the endpoint is removed — today
  `server/routes/library.ts:83-95` returns a plan nothing applies;
* the decision is recorded against `02-assets`'s open question X-1 (§2.7.9), because the two
  documents must not settle it differently.

This item requires a decision the loop may not take alone. See §8.

Evidence:

```text
Decision recorded:
Behaviour implemented:
Milestone dependencies:
Agreement with 02-assets X-1:
```

#### TOOL-009: Editing a workflow does not mutate a running one

Required result:

* editing a workflow produces a new version;
* a run in progress continues on the version it started with;
* the version a run used is recorded on the run.

Evidence:

```text
Edit during a run:
Version the run used:
```

#### TOOL-010: Nothing in the panel puts a filesystem in front of a non-technical user

Required result:

* creating a prompt, a skill or a workflow requires no path, no filename and no frontmatter syntax;
* the resulting file location is shown only behind an advanced disclosure;
* nowhere in the default path does the user type YAML, JSON or a glob.

Evidence:

```text
Creation flow fields:
Advanced disclosure content:
```

#### TOOL-011: A resource can be injected into an agent that is already running

Required result:

* `resolveInjection` (§4.5) returns a payload for each of the three kinds, and performs no session
  I/O;
* injecting a prompt from the AGENTS page reaches the agent's **next turn**, proved by an effect the
  agent produces, not by the agent saying it received it;
* injecting a skill reports `effective: "next_session"` and the panel says so **in words** — the UI
  never claims an effect that has not happened;
* the injection is one ledger row with `operation: "injection"` and the `resourceId`, so the cost of
  adding that resource is answerable;
* mounts are written by `01-agents` through its boundary; this loop writes no file into a work area,
  and a test asserts that.

Evidence:

```text
Payload for each kind:
Effect observed in the agent's next turn:
Wording shown for a skill injection:
Ledger row:
No work-area write from this loop:
```

#### TOOL-012: A resource carries its own cost history

Required result:

* the panel shows, per resource, how many times it was injected and what those turns cost;
* a resource with no usage shows no figure rather than `$0.00`;
* the figure comes from a ledger query, not from a counter kept beside the resource.

Evidence:

```text
Resource usage count:
Cost attributed:
Behaviour with no usage:
```

---

## 7. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each is
backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Rules for this surface. Each is paid for with the thing in this repository that produced it.

- **A zero is not a price.** `DEFAULT_RATES` (`server/services/usageAccounting.ts:31-35`) holds three
  OpenAI keys and no Grok model, so `estimateCost` returns `costUsd: 0, rateKey: null` for every turn
  the product actually makes. The function is correct and the table is empty of the only model that
  matters. An unlabelled honest zero reads as "free", which is the one misreading that costs money.
- **A running total is not a ledger.** `agent.costUsd += …`
  (`server/services/agentRegistry.ts:359`). After eighty iterations there is not one persisted charge
  anywhere. Sum-only storage cannot be drilled into afterwards — the detail was destroyed at write
  time, which is why no chart the owner imagines has any source data.
- **An exact figure and an estimated figure are different kinds of number.** Media units are chosen
  by us and priced per unit; a turn's tokens are reported by a binary we do not build and priced
  against a model id we did not choose. Recording both as "cost" and letting the UI decide later is
  how the current `$0.00` happened. The tier is a field, not a rendering decision.
- **A field that is stored and never read is not a feature.** `Skill.description`
  (`server/services/promptLibrary.ts:35`), `agent.tools`, `CodingAgent.budgetUsd`,
  `Requirement.designSection`, `CodingAgent.color` — five in this repository, each declared, each
  plumbed, each read by nothing. Before adding a field, name its reader.
- **An endpoint with no caller is untested product, however green its tests are.** All nine
  `/api/library` endpoints have full HTTP coverage and zero client callers; the test file's own
  header records that `bun run audit:endpoints` found it (`server/routes/library.test.ts:12-14`).
  Coverage of a surface is not coverage of its behaviour.
- **A suspiciously clean result is a bug in the check.** A project reporting `$0.00` across a whole
  run is the current state of the product, not a cheap run. Re-derive before believing.
- **Verify through the production code path.** A rate table proven by a unit test proves arithmetic;
  only a live turn proves the key matches the model id that arrives. This is COST-001, and it is
  first for that reason.
- **Never fabricate a value in the UI.** An absent figure is omitted, never defaulted. An unpriced
  charge is labelled, never rendered as zero. This is why COST-015 is a single function rather than a
  guideline: four worktrees writing components in parallel will not all remember a guideline.
- **When a price came from a document, record the document and the date.** Every media rate in §2.5
  was read from published documentation on 2026-08-08 and has never been observed here. A rate with
  no provenance cannot be re-checked when it drifts — and COST-014 exists so drift announces itself.
- **Test the failure path.** The failures that matter here are: an over-budget job, a corrupt
  `library.json` (which today loads as an empty library and tells the user nothing), a video job
  returning `failed` or `expired`, a denied approval, and a software build loop that never converges.
  Each must leave the ledger consistent.
- **Assert the effect, not the reply.** A live agent will describe a skill it did not receive.
  Whether a resource reached a session is proved by what the session was opened with, or by a
  run-time-assembled marker the agent writes to a file — never by the agent saying so. This is the
  whole design of TOOL-011's second clause.
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module`
  patches the registry for the whole process and only reaches importers evaluated after it, so in the
  full suite it is silently inert and the test opens real sessions. A typed seam cannot fail that
  way.
- **Spending is an experiment with a bill.** Before running a media call to exercise the ledger,
  estimate it, and ask. See §8.

---

## 8. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- **An action needs credentials that were not provided.** There is no `XAI_API_KEY` on this machine
  and `grok models` reports "You are not authenticated". Nothing that requires a live media price,
  and nothing that requires observing `cost_in_usd_ticks`, can be verified until that changes.
  COST-001 needs only a working text model and can proceed.
- **Spending.** Every media call in a test costs real money — $0.02 to $0.05 per image, $0.40 to
  $1.20 for a single clip. Estimate the cost of a test run and ask before running it. A retry bug
  discovered by running the retry bug is the expensive way to find it.
- **A change would fall outside the §0 boundary.** Write the request into the handoff and continue
  elsewhere. If nothing inside the boundary can proceed, stop and say which file you need and why.
- **Requirements contradict one another.** TOOL-008 is one now: "customisable agent control logic — a
  loop, an evolve-loop, a loop that edits its own loop document" and "a common user edits it in
  place" pull in opposite directions, and the honest options are a scripting surface a non-technical
  user will not touch, or a stage template that is not control logic. It is entangled with
  `02-assets`'s X-1 — what a `workflow` asset is. Put both to the owner together rather than shipping
  a half of each.
- **A rate has no source.** If a price is needed that is not in the research file, do not invent it.
  Record it as unverified, name the page that must be checked, and let the charge be `unknown` rather
  than wrong. The software sandbox rate (§2.6) is the live instance of this.
- **Deleting tracked files, or anything irreversible or outward-facing.** Ask first. Do not push.

---

## 9. What this worktree hands back

```text
branch     pivot/tools-cost
handoff    loops/handoff/pivot-tools-cost.md

types      CostEvent, CostEventInput, Pricing, UnitKind, Rollup, Preflight
           InjectionKind, InjectionRequest, InjectionPayload, SkillMount
           exported from server/services/costLedger.ts and server/services/promptLibrary.ts
           (they cannot live in server/types/*.ts — hot; re-export requested in the handoff)

api        GET    /api/library/skills | /prompts | /workflows          existing
           POST   /api/library/skills | /prompts | /workflows          existing
           PATCH  /api/library/{skills,prompts,workflows}/:id          new (TOOL-001)
           DELETE /api/library/{skills,prompts,workflows}/:id          new (TOOL-001)
           POST   /api/library/injections/resolve                      new (TOOL-011)
           GET    /api/cost/events?projectId=&assetId=&agentId=&from=&to=
           GET    /api/cost/rollup?projectId=&by=assetType|agent|area|day|model|operation
           GET    /api/cost/export.csv?projectId=
           GET    /api/cost/rates
           PUT    /api/cost/rates
           GET    /api/cost/unpriced?projectId=
           both routers exported from server/routes/library.ts; two mounts requested

server     getCostLedger().record(input) -> CostEvent     synchronous, append-only, never throws
           getCostLedger().query(filter) -> CostEvent[]
           getCostLedger().rollup({ by, filter }) -> Rollup
           getCostLedger().preflight(planned) -> Preflight       used by COST-010 and COST-012
           resolveInjection(req) -> InjectionPayload             pure; 01-agents delivers
           rateSummary() -> per-capability price hints           01-agents renders at agent creation

client     formatCharge(charge) -> string          the ONLY money formatter (COST-015)
           <ToolsPanel/>                           mounted once; opened by OPEN_TOOLS_EVENT
           <BudgetMeter projectId/>                mounted by 07-shell in the header
           OPEN_TOOLS_EVENT + OpenToolsDetail      client/src/control-room/tools/contract.ts
                                                   the only module other loops import from here
```

**Hot-file requests to be applied at reconciliation** (write each into the handoff as you need it,
with the exact diff):

```text
server/routes/api.ts                  apiRoutes.route("/library", libraryRoutes)   (exists)
                                      apiRoutes.route("/cost", costRoutes)         (new)
server/services/acpSessionManager.ts  getCostLedger().record(...) beside :370-392  add a call, change no line
server/routes/agents.ts               getCostLedger().record(...) in POST /:agentId/usage (01's file)
server/routes/projects.ts             getCostLedger().record(...) beside :324
server/types/project.ts               re-export of CostEvent and the injection types
server/services/controlRoomEvents.ts  additive members: cost_recorded, budget_meter
client/src/control-room/ControlRoomApp.tsx  mount <ToolsPanel/> and <BudgetMeter/>
client/src/control-room/useControlRoom.ts   the /api/cost fetches and the new event handlers
```

**What this loop assumed about other worktrees.** Each is a thing to confirm at reconciliation, not a
thing to build around:

* **01-agents** owns agent identity, `capability` with the four values
  `base | images | voice | voice+images`, and write-time boundary enforcement. It delivers every
  injection this loop resolves, writes every skill mount, and calls `record()` on the turn ingest
  path. This loop records `capability` on the row as a cross-check and never sets it.
* **02-assets** owns the asset envelope and, until the ledger lands, `AssetCharge` with
  `costSource: "billed" | "estimated" | "unknown"` (`loops/02-assets.md:430-452`). **The ledger has
  four tiers, not three** (§4.2) — 02's `estimated` splits into `metered` for per-unit media and
  `estimated` for token-derived model cost. When the ledger lands, `Asset.charges` becomes a query,
  the field is deleted, and the migration is: every media row with units becomes `metered`, every
  turn row stays `estimated`. **Confirm this with 02 rather than migrating silently** — the enum is
  in both documents and only one of them can be right.
* **03-design-docs** owns `designDocId` and the rule that one design document is followed by at most
  one project. This loop stores `designDocId` on a row so spend is answerable per design document,
  and reads nothing else. Line-level presence and its staleness handling are entirely 03's.
* **04-generation** calls `record()` for every image, video and speech charge, passes the persisted
  asset path rather than the provider URL, and passes `cost_in_usd_ticks` when the response carries
  it. It may not merge until COST-010 and COST-011 pass (§3).
* **05-software** calls `record()` for its generation turns and for sandbox time, and must name the
  sandbox provider and its published rate before the sandbox line can be priced (§2.6). Same merge
  gate as 04.
* **07-shell** owns the chrome and mounts `<BudgetMeter/>`. This loop exports mount points and
  imports no shell internals.
* **08-users-x** records X posting under an operation kind; whether posting carries a per-request
  cost is unverified and belongs to 08's research, not this loop's rate table.

---

## 10. Definition of done

Tools and cost are complete when TOOL-001…TOOL-012 and COST-001…COST-015 all read PASS with
recorded, re-runnable evidence in `VERIFICATION.md`; `bun run verify` is green; no item is NOT TESTED
and no item is BLOCKED; the handoff file lists every hot-file change with an exact diff; and the
canonical demo runs end to end on this surface.

Run it: create the sales-presentation project, assemble the four-agent team, inject one skill into an
agent that is already running, let the Imagine agent produce slides and the voice agent produce a
clip, and confirm all four of the following at the end.

```text
The injected skill's effect is visible in the agent's work, and the panel said in words
  whether it took effect on the next turn or the next session.
A per-asset price is displayed for the deck, in plain words, with no token counts,
  through the one formatter.
The budget meter breaks the project's spend down by asset type.
Every charge behind those figures is a ledger row that can be listed, filtered and exported,
  with its model or media id, its operation, its area, its agent, its attempt ordinal and
  its pricing tier — billed, metered, estimated or unknown.
```

If any is missing, the surface is not done regardless of how many items pass.

Only then output `Tools and cost are complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item in §3's
stage table is not yet passing.
