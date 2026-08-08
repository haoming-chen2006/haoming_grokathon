# Tools and Cost — Loop Operating Document

This is the instruction set for one iteration of the tools-and-cost loop. Read this file first,
act, then stop. It is deliberately short; the documents it points at hold the detail.

| Document | Role |
|---|---|
| `loopdesign.md` | The house form. Every loop document copies its structure and its register. |
| `verifiables.md` | The existing checklist, items V-001…V-052. The format §5 below reproduces. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

The sibling loop documents live in `loops/` and are being written concurrently by other agents in
other worktrees. Read them for context. Do not edit them. Their filenames are theirs to choose.

### The demo, and what this surface owes it

> A user creates a project: "I need to do this sales presentation." A team is assembled — one agent
> researching in the Doc Hub, one against the user's X account, one with Imagine generating slides,
> one with voice and Imagine generating video. Every asset lands back in the Doc Hub.

Two things in that story belong to this document.

The **Tools panel** is where the team's competence comes from. "One agent with Imagine capability
generating the slides" is only convincing if that agent knows this company's deck conventions, and
that knowledge is a skill: a directory of markdown the user wrote once and can turn on for this
project. Without the panel, every project starts the agents from zero and the demo is a generic
deck.

The **cost engine** is what makes the demo safe to run twice. Four agents, two of them with media
capability, produce a bill. A 60-second generated experience costs roughly $5.52 in media alone —
three orders of magnitude more than a text turn — and one careless retry loop is a $50 mistake.
The demo ends with a number: *this deck cost $6.20, here is where it went*. Today that number would
be $0.00 and there would be nothing behind it. §2 explains why.

---

## 0. Your boundary

This worktree owns two subsystems and nothing else. Every other page and service belongs to a
sibling loop running at the same time.

**Files this worktree owns outright — create, edit, delete:**

```text
server/services/promptLibrary.ts          and promptLibrary.test.ts
server/routes/library.ts                  and library.test.ts
server/services/usageAccounting.ts        and usageAccounting.test.ts
server/services/skillStore.ts             (new)
server/services/costLedger.ts             (new)
server/routes/cost.ts                     (new)
client/src/control-room/tools/            (new directory — the Tools panel)
client/src/control-room/cost/             (new directory — the budget meter and the drill-down)
loops/04-tools.md                         (this file)
```

**Files this worktree may read but must not edit**, because a sibling loop owns them: every page
shell (AGENTS, DOC HUB, USERS, X), `server/services/projectMcpServer.ts`,
`server/services/acpClient.ts`, `server/services/agentRegistry.ts`,
`server/services/projectStore.ts`, `server/services/approvals.ts`,
`server/services/repository.ts`, `server/hooks/shellSafetyHook.ts`, and any new
`server/services/xaiClient.ts`.

**Three narrow, enumerated exceptions.** The cost ledger is useless unless the existing spend paths
write to it, and those paths live in files this worktree does not own. You may append a ledger
write — and nothing else — at exactly these three sites:

```text
server/services/acpSessionManager.ts:370-392   the per-turn estimate and its two accumulators
server/routes/agents.ts:152-219                POST /:agentId/usage, the HTTP cost ingest
server/routes/projects.ts:318-330              the planner turn's estimate
```

The rule at those sites: **add a call, change no existing line.** If the fix you want requires
editing a line that is already there, it is a cross-boundary concern, not an exception.

**Media loops call in, they do not reach in.** The image, video and voice loops must record their
charges. They do that by calling the ingest function this worktree publishes from
`server/services/costLedger.ts`; they do not construct `CostEvent` rows themselves and they do not
touch the rate table. Publish that function's signature in the first iteration that writes the
ledger, so the sibling loops can code against it before it is finished.

**How to raise a cross-boundary concern.** Do not edit outside the boundary and do not work around
it. The mechanism already exists and is the best-preserved thing in the repository:
`DesignSuggestion` (`server/types/project.ts:95-118`), the `submit_design_suggestion` MCP tool, the
`baseVersion`/`stale` conflict detection, and the accept/edit/reject/request-revision queue in
`client/src/control-room/ReviewQueues.tsx`. File a suggestion naming the file, the line, and what
you believe is wrong, then continue with something inside your boundary. If nothing inside the
boundary can proceed until the suggestion is answered, stop and report — see §7.

---

## 1. Before doing anything

```bash
cd /Users/haoming/grok-workspace 2>/dev/null || cd /Users/haoming/openui
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

`bun run verify` runs server typecheck → client typecheck → all tests → production build → the
four audits. **A red gate is always the highest-priority work**, ahead of any checklist item.

**Capture verify's output to a file, never `>/dev/null`.** Discarding it means a red gate cannot be
diagnosed without re-running, and with a live-agent flake at roughly one in five the re-run is
usually green and the evidence is gone.

One extra check belongs to this document and to no other:

```bash
[ -n "$XAI_API_KEY" ] && echo "xai credential present" \
  || echo "NO XAI CREDENTIAL — no price in the rate table can be checked against a live response"
```

The research confirms this machine is not on xAI at all: `~/.grok/config.toml` points at
`api.openai.com` and `router.huggingface.co`, and `grok models` reports "You are not
authenticated." Every media price in §2 is read from published documentation, not observed. That
is a stop condition for parts of the cost work, not for all of it — see §7.

---

## 2. State as of iteration 0

```text
TOOL: 0 PASS · 0 FAIL · 0 BLOCKED · 22 NOT TESTED   (TOOL-001…TOOL-010, COST-001…COST-012)
Gate: fill this line from the output of `bun run verify` on your first iteration.
```

Do not copy a test count from another document. `loopdesign.md:68-72` says 715 tests across 42
suites; `HANDOFF.md` says 940 across 50 files; `VERIFICATION.md` says 727. They disagree because
each was written at a different iteration and none was rederived. The gate's own output is the
only number worth writing down, and this block is the one place that owns it.

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
  `createSkill` (`:212-219`) persists it, and no code path anywhere reads it. It is the field that
  must become the discovery prompt.
- **There is no `update*` and no `delete*` for any of the three types.** The library is
  append-only; `library.json` can only be corrected by hand. The owner's "editable in place" is
  impossible today, on the server, before any UI question arises.
- **Injection is eager, total and unconditional.** `rulesForAgent` (`promptLibrary.ts:138-153`)
  concatenates every assigned skill's full `instructions` through `composeAgentInstructions`
  (`:114-126`) into the `rules` string handed to `session/new`
  (`server/services/acpSessionManager.ts:104-117`, `:248`; the planner does the same at
  `server/routes/projects.ts:318`). Ten skills of 2,000 words each is 20,000 words of system prompt
  on every session, forever. This is the exact opposite of progressive disclosure.
- **A corrupt library presents as an empty library.** `load()` logs and swallows
  (`promptLibrary.ts:196-198`). A user whose `library.json` was truncated sees no skills and no
  error, and the panel will confidently offer to create the first one.
- **`instantiateWorkflow` milestones hardcode `dependsOn: []`** (`promptLibrary.ts:351-356`) while
  tasks remap dependencies correctly (`:343-349`). The tests assert only the task side. Nothing
  persists the returned plan either — `server/routes/library.ts:83-95` hands the JSON back to
  whoever asked.
- **`agent.tools` is written and never read.** Whatever the panel does with "tools", it starts from
  zero.

### 2.2 The owner's three definitions against the shipped models

| Owner | Shipped | Verdict |
|---|---|---|
| prompt = simple copy-and-paste text, a single line | templated `body` with `{variable}` placeholders, a declared variable schema, a render that 400s on an unresolved required variable | **Richer than asked.** Keep the engine, downscope the default creation form. The single-line prompt is the degenerate case of what already works. |
| skill = a preprocessed directory of markdown fronted by a discovery prompt, turnable up and down, pulled in through the discovery prompt, discoverable later | one string, injected in full at session open, with a `description` nothing reads | **Not built, and inverted.** Every clause of the owner's sentence is absent. |
| workflow = customisable agent control logic — a loop, an evolve-loop, a loop that edits its own loop document | a static DAG of named stages with role labels and review-gate booleans, expanded once into a draft nothing applies | **A different concept with the same word.** `ProjectWorkflow` is a plan template. The owner is describing an interpreter. |

### 2.3 The skill convention to follow, and why not to invent one

The owner's definition — a preprocessed directory of markdown fronted by a discovery prompt,
turnable up and down, whose contents reach the prompt through the discovery prompt and which the
agent can discover later — is the `SKILL.md` progressive-disclosure convention, close to verbatim.
**Follow it rather than inventing a format, for a reason that is mechanical rather than
aesthetic: the `grok` binary this product drives already implements it.** Reference clone, read-only:

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
  reminder; the body injected only when the model invokes the skill; bundled files loaded on
  demand. A fourth, sharper tier exists — a skill with `paths:` globs is held out of the listing
  entirely until a tool touches a matching file. That maps directly onto a work area.
- Turning a skill up and down is `[skills] disabled` and `[skills] ignore` in `~/.grok/config.toml`:
  disabled means still listed but excluded from the system prompt and from invocation; ignore means
  hidden entirely.
- `grok inspect --json` enumerates every discovered skill with name, description, source and
  whether it is user-invocable. That is a ready-made read API for the panel.

So the panel's job is to be **a filesystem editor and a config writer**, not an injector. This is
also the cheapest possible implementation of "discoverable by the agent later": writing
`.grok/skills/<name>/SKILL.md` into an agent's working directory makes it a local-scope skill for
that agent alone, which is exactly the shape of "an agent works inside one area".

**The rule that follows, and it is the one most likely to be got wrong: do not keep the `rules`
bulk-paste and adopt `SKILL.md` at the same time, or every agent receives every skill twice** —
once eagerly in the system prompt and once on invocation. After this work, `rules` carries the
persona and the work-area boundary and nothing else. TOOL-007 exists to catch the double.

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
the UI can label". **Nothing labels it.** `rateKey` is returned and consumed nowhere: verified,
the only occurrences in the tree are `usageAccounting.ts` itself and its test. What the UI shows
instead is a static caveat string, duplicated verbatim in two files
(`client/src/control-room/ProjectHeader.tsx:30`, `client/src/control-room/CommandCenter.tsx:19`),
rendered at `ProjectHeader.tsx:126-147` and `CommandCenter.tsx:58-77`, plus a per-agent figure at
`client/src/control-room/AgentCard.tsx:72`.

So a user sees `est. $0.00 / $10.00` and reads it as *cheap*. It means *we do not know the price of
this model*. Cost in the shipping product is not incomplete. It is wrong in the one direction that
cannot be noticed.

**There is no ledger.** `recordUsage` does `agent.costUsd += …` (`server/services/agentRegistry.ts:359`)
and `recordTaskCost` does `task.costUsd = task.costUsd + …` (`server/services/projectStore.ts:1227`).
Nothing anywhere persists an individual charge — no timestamp, no model id, no operation label, no
row. The consequence is not "the charts are missing"; it is that **every chart in the pivot brief
has no source data and cannot be backfilled**, because the information was destroyed at write time.

**The token split is computed and thrown away.** `TokenUsage` carries input, output, cached-read and
reasoning counts plus the model id (`server/services/usageAccounting.ts:9-16`); every caller
collapses it to `{ costUsd, tokens, estimated }` (`server/services/acpSessionManager.ts:381-383`,
`server/routes/projects.ts:327`).

**`approvalThreshold` and `maxRetries` are unimplemented.** Verified: zero occurrences across
`server/ client/ shared/ scripts/ bin/`. The design contract names both.

**`ApprovalQueue` is written, tested, and called by nothing.** `server/services/approvals.ts:133-222`,
with `budget_increase` already in `RESTRICTED_ACTIONS` (`:17-24`) and a full request/resolve
lifecycle. `grep -rn "getApprovalQueue"` returns its own definition and one test file. Wiring it is
the cheapest large win in this document.

**Per-tool-call attribution is structurally impossible and will stay that way.**
`AcpConnection.prompt()` returns one `usage` object per turn (`server/services/acpClient.ts:443`,
`:473`); ACP `tool_call` updates carry no usage at all. Anything finer than a turn would be an
invention. Say "per turn" in the UI and mean it; do not label a turn's cost as a tool's.

### 2.5 What the media capabilities will cost, and why cost is a pillar

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
of video plus one source image each at `8 × $0.05 = $0.40`, so **about $5.52 in media alone** — three
orders of magnitude above a text turn. One careless retry loop is a $50 mistake. That is the whole
argument for COST-011.

Two API facts that constrain the ledger's schema:

- `usage.cost_in_usd_ticks` is returned on chat completions, the Responses API, image generation,
  video generation and the Batch API, at 10^10 ticks to the dollar. That is a **billed** figure, not
  an estimate, and it covers server-side tool invocations in the same number. The ledger must be
  able to record a charge as exact rather than estimated, because for those modalities we will have
  the real price. The documentation does **not** state whether TTS, STT or realtime responses carry
  it; treat voice as estimated from published rates until a live response proves otherwise.
- **Returned media URLs are temporary.** A ledger row must reference the persisted asset path the
  media loop wrote, never the URL it came from, or the row will eventually point at nothing and the
  user cannot see what a charge bought.

### 2.6 Where the owner assumed something that is not true

Stated plainly, because designing quietly around these is how a wrong assumption survives into the
product.

1. **"The resources backend already exists, so the panel is a skin."** Half true, and the wrong
   half is load-bearing. The API works and has never been called, so the client is cheaper than it
   looks; but two of the three models do not match the concepts they are named after. Skills are
   near-greenfield. Workflows are a different object with the same word.
2. **"A prompt is a single line."** The shipped model is richer, not poorer. Nothing needs to be
   simplified on the server; the creation form needs a simple default.
3. **"Cost tracking exists and needs deepening."** It is broken. Every figure in the shipping
   product is very likely `$0.00`, every budget is unreachable, and every budget warning is
   unfirable, because no Grok model is in the rate table. This is a repair before it is a feature.
4. **"A skill can be turned up or down."** Grok's control is not a dial. It is three states:
   absent, listed-but-inactive, active. If a continuous intensity is wanted it has to be invented in
   our layer — as a per-agent allow-list plus a listing budget — and invented things should be
   argued for, not assumed. TOOL-006 takes the three states; propose the dial as a change if you
   want it.
5. **"A workflow that edits its own loop document to add goals."** Grok's workflow engine is real —
   Rhai scripts with `agent()`, `parallel()`, `budget()`, `pause()` and scratch files, with a
   journal and a child-agent budget — but a same-process resume continues the **original, immutable**
   script. The sanctioned self-editing pattern is: save the returned script as a copy and launch it
   as a new run. A live self-mutating loop is not available. Do not write a checklist item that
   requires one.
6. **There is no xAI document or slide generation API. None.** Not for PPTX, DOCX, PDF or slides.
   Slide assembly and document generation are 100% our own code: a Grok text model emits structured
   JSON, our renderer turns it into the artefact. Nothing in the Tools panel may offer a workflow
   primitive that implies an endpoint exists, or an agent will spend a turn looking for it.
7. **This project has no HTTP client to `api.x.ai` today.** It speaks ACP — JSON-RPC over stdio to
   the `grok` binary — and nothing else. Every media rate in §2.5 becomes reachable only after a
   sibling loop builds that client. The cost engine must therefore be written so that it can be
   proven correct on text turns alone, and priced media rows simply appear later.
8. **Custom voice cloning via API is Enterprise-only**, console-created, US excluding Illinois. The
   panel must not offer "clone your voice" as a resource a user can create.

---

## 3. What is actually left

Everything. This is the stage table §4 step 3 points at. Work top-down; do not start a lower stage
while a higher one is failing.

```text
Stage  Items              Work                                                    Blocks
S1     COST-001           Observe what modelId a live grok turn reports           all of S2-S6
S2     COST-002           A rate table with Grok text models and per-unit media   S4
S3     COST-003           rateKey null renders as "price unknown", not $0.00      —
S4     COST-004..006      The cost ledger: schema, append-only store, 3 writes    S5, S6
S5     COST-007..009      Aggregations, the budget meter, the drill-down          —
S6     COST-010..012      approvalThreshold, maxRetries, pre-flight estimate      —
S7     TOOL-001..003      Prompts: update/delete, one-field create, the panel     —
S8     TOOL-004..007      Skills as SKILL.md directories; stop the double-inject  —
S9     TOOL-008..010      Workflows: decide, then build or rename honestly        —
```

**Why cost comes before the panel.** The media loops will begin spending before a Tools panel
matters, and an unrecorded media charge is unrecoverable: the money is gone and there is no row to
reconstruct it from. The panel can be late. The ledger cannot.

**Why COST-001 blocks everything.** A rate table proven by a unit test proves arithmetic. Only a
live turn proves the key matches the model id that actually arrives. Building S2 onward on a guessed
model id would produce a green suite and a product that still reports $0.00.

### 3.1 Who sees what

The cost engine has two audiences and they must not be served by the same screen.

| Surface | Audience | Content |
|---|---|---|
| Budget meter | non-technical | One bar: spent against the project budget, in plain words. No token counts, no model names. |
| Per-deliverable price | non-technical | "This deck has cost $6.20 so far." Attached to the thing in the Doc Hub, not to an agent. |
| Approval prompt | non-technical | Before an expensive job: what it will make, what it will cost, and what a retry would cost. One Approve, one Cancel. |
| Capability cost hint | non-technical | At agent creation: base Grok cannot run up a media bill; voice and images can. Say the price per unit in the capability picker, because capability is the primary cost control. |
| Ledger drill-down | power user | Every row: timestamp, agent, area, operation, model or media id, token split, units, rateKey, exact-or-estimated. Filterable, exportable as CSV. |
| Rate table editor | power user | The rates themselves, each with its source URL and the date it was read. |
| Unpriced-charge report | power user | Every row whose pricing is "unknown", grouped by model id. This is the list that tells you the rate table has drifted. |

The non-technical surfaces are three numbers and one dialogue. Everything else is behind an
"advanced" affordance. A salesperson should never see the word `rateKey`; a power user must be able
to reach it in two clicks.

The Tools panel splits the same way: creating a prompt or a skill must require **no path, no
filename and no frontmatter syntax** (TOOL-010), while the resulting file location, the YAML and the
skill's scope stay available to whoever wants them.

### 3.2 If the loop runs with nothing to do

In rough order of value:

1. **Diff what one side produces against what the other consumes.** This is how the budget events
   were found to be published and dropped by the client, and how nine library endpoints were found
   to have no caller at all. List what the ledger records, list what the aggregations read, and diff
   them. Do the same for the panel and `/api/library`.
2. **Re-run the acceptance flow.** It is the only test that exercises the whole system, and it is
   the only place that has ever proven a skill reaches a live agent
   (`scripts/acceptance/v052.mjs`, which plants a run-time-assembled codename in a skill and asserts
   the agent writes it to a file). When TOOL-004 changes how skills reach an agent, that step is the
   one that will catch a break.
3. **Turn a by-inspection check into a test.** A one-time manual verification decays the moment the
   code moves.
4. **Documentation drift.** Update §2's tally when the gate count changes. A stale summary is worse
   than none — that is how the previous gate came to read "BLOCKED / 34 of 52" for twenty-three
   iterations after the blocker had cleared.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the **highest item in the stage table in §3 that is not passing**.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement, inside the §0 boundary.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` using the §22.1 format.
9. Commit with a message stating what was verified.
10. Report honestly, including what did *not* move, and list any cross-boundary suggestion you filed.

---

## 5. The checklist

Same two-part form as `verifiables.md`: what an observer would see, then a fenced block of empty
labelled fields that becomes the proof. A partially-satisfied item is NOT TESTED, not PASS.

### 5.1 Cost

#### COST-001: The model id a live turn reports is known

Required result:

* one real `session/prompt` turn is captured together with its `_meta`;
* the `modelId` string is recorded verbatim, not paraphrased;
* `resolveRate` is run against it and the result — a rate key, or `null` — is recorded.

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
* every rate records the source URL and the date it was read.

Evidence:

```text
Rate keys:
Per-unit rates:
Source and date on each:
```

#### COST-003: An unpriced charge says "price unknown", never "$0.00"

Required result:

* a charge whose `rateKey` is `null` renders as the words "price unknown" everywhere a figure
  appears;
* the token or unit count is still shown, because that part is exact;
* a total containing an unpriced charge is marked incomplete and names how many charges are
  unpriced, rather than silently adding zero;
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
* each row carries: id, timestamp, projectId, areaId, agentId, taskId, deliverableId, operation,
  modelId, rateKey, inputTokens, outputTokens, cachedTokens, reasoningTokens, units, unitKind,
  costUsd, pricing (`exact` | `estimated` | `unknown`), and the provider request id where one exists;
* the ledger is append-only — no row is ever updated or deleted;
* one agent turn, one image generation and one narration render produce exactly one row each;
* a media row references the persisted asset path, never the temporary provider URL.

Evidence:

```text
Rows after one agent turn:
Rows after one image generation:
Append-only proof:
```

#### COST-005: The running totals are derived from the ledger, not kept beside it

Required result:

* `agent.costUsd` and `task.costUsd` equal the sum of their ledger rows;
* a test appends rows, re-derives both totals, and fails if they diverge;
* a charge recorded through the HTTP ingest and a charge recorded from a live turn both land in the
  ledger — neither path writes a total without a row.

Evidence:

```text
Ledger sum:
Stored total:
Both ingest paths exercised:
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

* spend can be grouped by day, by agent, by area, by model, by operation and by deliverable;
* each aggregation reports how many of its rows were unpriced;
* the ledger exports as CSV with one row per charge;
* an aggregation over an empty range returns an empty result, not zero — the two are different
  answers.

Evidence:

```text
Group-by results:
Unpriced count per group:
Export sample:
```

#### COST-008: A non-technical user can see what a deliverable cost

Required result:

* one budget meter shows spend against the project budget in plain words;
* a per-deliverable price is shown beside the deliverable itself;
* no token count, model name or rate key appears on either;
* an absent figure is omitted, never defaulted to a plausible-looking number.

Evidence:

```text
Budget meter:
Per-deliverable price:
Behaviour with no data:
```

#### COST-009: A power user can see where the money went

Required result:

* every ledger row is reachable in the UI with its rate key and its pricing tier;
* rows can be filtered by agent, area, operation and date;
* the unpriced-charge report lists every distinct unknown model id.

Evidence:

```text
Drill-down screenshot or DOM assertion:
Filter applied:
Unpriced report:
```

#### COST-010: Spending above a threshold requires a human click

Required result:

* a job whose pre-flight estimate exceeds the configured `approvalThreshold` does not start;
* it raises a request through the existing queue in `server/services/approvals.ts` and waits;
* the prompt names what will be produced, what it is estimated to cost, and what one retry would
  add;
* denying it produces no charge and no ledger row;
* approving it produces exactly one row per operation, as COST-004 requires.

Evidence:

```text
Threshold configured:
Job blocked:
Prompt text shown:
Charge after denial:
```

#### COST-011: A retry loop cannot run up a bill

Required result:

* a per-task retry cap exists and is enforced per operation kind;
* a failing media job is retried at most that many times;
* exceeding the cap pauses the agent with a stated reason, not a silent stop;
* the reason names the operation, the number of attempts and the total spent on them.

Evidence:

```text
Cap configured:
Attempts observed:
Pause reason shown:
Total spent on the failed operation:
```

#### COST-012: An expensive job is estimated before it runs

Required result:

* the estimate is computed from the rate table and the requested units — number of images, seconds
  of video, characters of narration;
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

### 5.2 Tools

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
* variables are an optional disclosure, and the existing unresolved-variable error is unchanged
  when they are used.

Evidence:

```text
Prompt created:
Copy action:
Variable path still errors on a missing required value:
```

#### TOOL-003: The panel opens over any page

Required result:

* the Tools panel opens as an overlay from every page and closes without losing the page's state;
* it is dismissible from the keyboard;
* it reads and writes through `/api/library`, which no client code has ever called.

Evidence:

```text
Opened from each page:
State after close:
Network calls observed:
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
* the panel refuses to save a skill whose description does not say when to use it, because a
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
* turning a skill off removes it from the agent's listing on the next session, and this is
  observable in what the session receives rather than only in the UI.

Evidence:

```text
State set:
Config written:
Listing before and after:
```

#### TOOL-007: A skill never arrives twice

Required result:

* an agent's skill reaches it through disk discovery **or** through `rules`, never both;
* `rulesForAgent` carries the persona and the work-area boundary and nothing else;
* a test asserts the skill body appears exactly once in what the session is opened with;
* the reload path is covered: `loadSession` has no `rules` parameter today
  (`server/services/acpSessionManager.ts` reopens through it), so a resumed session must be shown
  to receive the same skills as a fresh one, or the difference must be recorded.

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
* **or** the object is renamed to what it is, a stage template, everywhere in the UI and the API,
  and the words "loop", "evolve-loop" and "control logic" are removed from the product surface;
* whichever is chosen, `instantiateWorkflow`'s hardcoded empty milestone dependencies
  (`server/services/promptLibrary.ts:351-356`) are either fixed or the milestones are dropped;
* the instantiated plan is persisted by something, or the endpoint is removed — today
  `server/routes/library.ts:83-95` returns a plan nothing applies.

This item requires a decision the loop may not take alone. See §7.

Evidence:

```text
Decision recorded:
Behaviour implemented:
Milestone dependencies:
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

---

## 6. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Rules for this surface. Each is paid for with the thing in this repository that produced it.

- **A zero is not a price.** `DEFAULT_RATES` (`server/services/usageAccounting.ts:31-35`) holds three
  OpenAI keys and no Grok model, so `estimateCost` returns `costUsd: 0, rateKey: null` for every
  turn the product actually makes. The function is correct and the table is empty of the only model
  that matters. An unlabelled honest zero reads as "free", which is the one misreading that costs
  money.
- **A running total is not a ledger.** `agent.costUsd += …`
  (`server/services/agentRegistry.ts:359`). After eighty iterations there is not one persisted
  charge anywhere. Sum-only storage cannot be drilled into afterwards — the detail was destroyed at
  write time, which is why no chart the owner imagines has any source data.
- **A field that is stored and never read is not a feature.** `Skill.description`
  (`server/services/promptLibrary.ts:35`), `agent.tools`, `CodingAgent.budgetUsd`,
  `Requirement.designSection`, `CodingAgent.color` — five in this repository, each declared, each
  plumbed, each read by nothing. Before adding a field, name its reader.
- **An endpoint with no caller is untested product, however green its tests are.** All nine
  `/api/library` endpoints have full HTTP coverage and zero client callers; the test file's own
  header records that `bun run audit:endpoints` found it (`server/routes/library.test.ts:12-14`).
  Coverage of a surface is not coverage of its behaviour.
- **A suspiciously clean result is a bug in the check.** A project reporting $0.00 across a whole
  run is the current state of the product, not a cheap run. Re-derive before believing.
- **Verify through the production code path.** A rate table proven by a unit test proves arithmetic;
  only a live turn proves the key matches the model id that arrives. This is COST-001, and it is
  first for that reason.
- **Never fabricate a value in the UI** (`verifiables.md` §22.18). An absent figure is omitted, never
  defaulted. An unpriced charge is labelled, never rendered as zero.
- **When a price came from a document, record the document and the date.** Every media rate in §2.5
  was read from published documentation on 2026-08-08 and has never been observed here. A rate with
  no provenance cannot be re-checked when it drifts.
- **Test the failure path.** The failures that matter here are: an over-budget job, a corrupt
  `library.json` (which today loads as an empty library and tells the user nothing), a video job
  returning `failed` or `expired`, and a denied approval. Each must leave the ledger consistent.
- **Assert the effect, not the reply.** A live agent will describe a skill it did not receive.
  Whether a skill reached a session is proved by what the session was opened with, or by a
  run-time-assembled marker the agent writes to a file — never by the agent saying so.
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module`
  patches the registry for the whole process and only reaches importers evaluated after it, so in
  the full suite it is silently inert and the test opens real sessions. A typed seam cannot fail
  that way.
- **Spending is an experiment with a bill.** Before running a media call to exercise the ledger,
  estimate it, and ask. See §7.

---

## 7. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- **An action needs credentials that were not provided.** There is no `XAI_API_KEY` on this machine
  and `grok models` reports "You are not authenticated". Nothing that requires a live media price,
  and nothing that requires observing `cost_in_usd_ticks`, can be verified until that changes.
  COST-001 needs only a working text model and can proceed.
- **Spending.** Every media call in a test costs real money — $0.02 to $0.05 per image, $0.40 to
  $1.20 for a single clip. Estimate the cost of a test run and ask before running it. A retry bug
  discovered by running the retry bug is the expensive way to find it.
- **A change would fall outside the §0 boundary.** File a suggestion and continue elsewhere. If
  nothing inside the boundary can proceed, stop and say which file you need and why.
- **Requirements contradict one another.** TOOL-008 is one now: "customisable agent control logic —
  a loop, an evolve-loop, a loop that edits its own loop document" and "a common user edits it in
  place" pull in opposite directions, and the honest options are a scripting surface a
  non-technical user will not touch, or a stage template that is not control logic. Put both to the
  owner rather than shipping a half of each.
- **A rate has no source.** If a price is needed that is not in the research file, do not invent it.
  Record it as unverified, name the page that must be checked, and let the charge be `unknown`
  rather than wrong.
- **Deleting tracked files, or anything irreversible or outward-facing.** Ask first.

---

## 8. Definition of done

```text
TOOL-001…TOOL-010 and COST-001…COST-012 all PASS, with recorded evidence, no item NOT TESTED,
no item BLOCKED, `bun run verify` green, and the canonical demo run end to end.
```

The demo is the last check and the only one that is not a unit. Run it: create a sales-presentation
project, assemble the four-agent team, let the Imagine agent produce slides and the voice agent
produce a clip, and confirm both of the following at the end.

```text
A per-deliverable price is displayed for the deck, in plain words, with no token counts.
Every charge behind that price is a ledger row that can be listed, filtered and exported,
  with its model or media id, its operation, its area, its agent and its pricing tier.
```

If either is missing, the surface is not done regardless of how many items pass.

Only then output `Tools and cost are complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item in §3's
stage table is not yet passing.
