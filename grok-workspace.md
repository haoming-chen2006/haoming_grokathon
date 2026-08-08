# grok-workspace — Product Contract

This is the design contract for grok-workspace (§1–§20). It states what the system must become. It
is the document every loop document points back at, the way `loopdesign.md` points at
`product-design.md` today. It replaces `product-design.md`, which described a different product —
a control room for coding agents — and is being retired.

| Document | Role |
|---|---|
| `grok-workspace.md` | This file. The product contract, §1–§20. What the system must become. |
| `loopdesign.md` | The operating document for one iteration of one area loop. |
| `VERIFICATION.md` | The evidence ledger. Current status of every checklist item, with reproducible proof. |
| `product-design.md` | **Retired.** The coding-agent contract. Read §16 before deleting it — six backticked citations go dangling and the docs audit exits 1. |
| `verifiables.md` | **Retired with it.** V-001…V-052 are checkable statements about the retired product. |

Section numbers are load-bearing. `product-design.md` owned §1–21 and `verifiables.md` owned §22;
roughly 120 bare `§N` citations in `server/`, `client/`, `shared/` and `scripts/` resolve against
that split and will silently point at the wrong text after this replacement. Renumbering is not
free. This file deliberately reuses §1–§20 so that the majority of those citations land on a
section about the same subject, and §16 lists the ones that do not.

---

## 0. Your boundary

This worktree owns exactly one file:

```text
grok-workspace.md
```

You may **read** anything in the repository, and you must — every claim in this document is
supposed to be checkable against source. You may **write** nothing else. Not `README.md`, not
`loopdesign.md`, not a sibling area document, not a source file whose behaviour this document
describes as wrong.

The sibling area documents are being written at the same time, in their own worktrees, by other
agents. If you believe one of them is wrong, or that a fact in this file contradicts one in
theirs, do not edit theirs and do not quietly soften yours. Raise it the way the product itself
requires an agent to raise a cross-boundary concern (§8): write the disagreement down, name the
file and line on both sides, and hand it to the user. A suggestion carries the original wording,
the proposed wording, and the reason. A silent edit carries none of those, which is why the
product forbids it.

The rule exists because this product is about boundaries. A document family in which every author
edits every file is the failure mode the whole design is meant to prevent, demonstrated on itself.

---

## 1. What the product is, and who it is for

grok-workspace is the common-user face of Grok Build. It is an interface layer over the `grok`
CLI, reached from the terminal with a flag, in which a non-technical person describes a piece of
work and watches a small team of agents produce it.

> A visual workspace where a salesperson, marketer or operator assembles a team of Grok agents,
> gives them one shared brief, and watches documents, slides, experiences and software land back
> in one place — with every dollar accounted for.

Who it is for:

* sales — decks, one-pagers, follow-up material, prospect research;
* marketing — campaign copy, image and video assets, X posts;
* operations — process documents, internal handbooks, small internal tools.

Who it is **not** for. This product is deliberately less rich than the control room it replaces.
It is not for engineers, it does not show diffs, branches, worktrees or test counts, and the words
"requirement", "merge" and "worktree" do not appear in its interface. The coding capability
survives (§4.4) but is repositioned as one of four things the workspace can make, not the thing it
is about.

The retired contract named "general-purpose white-collar workflows" as its very first non-goal
(`product-design.md` §20). That is now the product. §2 and §20 of that document are inverted, not
amended.

---

## 2. Relationship to Grok Code, and the Xcode idiom

### 2.1 What we are on top of

grok-workspace is an add-on to Grok Code — the `grok` CLI, shipped as **Grok Build** by xAI. It is
not a fork of OpenUI. That lineage is being unwound: `package.json` still names `@fallom/openui`
with a `bin` of `openui`, the state directory is `~/.openui`, the env prefix is `OPENUI_`, three
HTTP headers are `x-openui-*`, and agent commits are authored by `openui-agent`
(`server/services/repository.ts`). A second, older lineage is worse: `claude-code-plugin/`,
`server/services/sessionManager.ts` and `server/services/conversationIndex.ts` exist only to serve
Claude Code, a product this repository does not drive at all.

Two rules govern the relationship, and they are not negotiable:

* the `grok` binary keeps coming from `node_modules` — resolution is already correct in
  `server/services/grokDetect.ts` (local → `~/.grok` → PATH);
* `.refs/grok-build` stays a **read-only reference clone**. It is an upstream Apache-2.0 mirror
  that refuses external contributions. Nothing in this product may require a change to it, and no
  loop document may propose one.

The transport stays as it is. `server/services/acpClient.ts` speaks ACP — JSON-RPC 2.0 over
NDJSON on stdio — to `grok agent --always-approve stdio`, and it is content-agnostic. It survives
the pivot unchanged.

### 2.2 The Xcode idiom

The visual idiom is Apple Xcode, borrowed for its shape, not its subject matter:

```text
┌──────────────┬────────────────────────────────────┬──────────────┐
│  NAVIGATOR   │            EDITOR                   │  INSPECTOR   │
│              │                                     │              │
│  projects    │  the thing being made:              │  the selected│
│  work areas  │    a document, a deck, a clip,      │  thing:      │
│  agents      │    a running app preview            │   who owns it│
│  files       │                                     │   what it    │
│              │                                     │    cost      │
│              │                                     │   its state  │
└──────────────┴────────────────────────────────────┴──────────────┘
                    Tools panel — overlays any page (§6)
```

Three properties of the idiom are the reason for choosing it, and each one is a rule:

* **the editor area shows the artifact, never a report about the artifact.** A slide is a slide, a
  clip plays, a document renders. The retired product showed a unified diff and a test tally in
  this position, and §2.3 of the UI research is blunt about who that reads for;
* **the inspector is single-selection and always reflects the navigator.** No panel invents its
  own subject;
* **the overlay is enabled by a flag, it does not replace the underlying tool.** Closing
  grok-workspace leaves you in `grok`, with the session intact.

The current shell is a six-tab layout (`client/src/control-room/ControlRoomApp.tsx`) with a 288px
left rail, a tabbed centre and a 320px right rail, no responsive breakpoints, and up to six red
banners stacked above the content. The tabs go. The three-column skeleton, the WebSocket data
layer in `client/src/control-room/useControlRoom.ts`, and the alert stack — collapsed to one
notification surface — stay.

---

## 3. Launch, projects and the agent team

### 3.1 Launch

grok-workspace is opened from the grok terminal with an additional tag:

```text
grok --common_version
```

It is not a separate application you install. It is the common-user face of Grok Build, reached by
a flag. In the owner's words: pivoting back to this idea of Grok Build for common users.

The honest mechanism, because it matters and is easy to get wrong: **`grok` itself cannot learn a
new flag.** `.refs/grok-build` is a read-only mirror. `--common_version` is therefore owned by a
wrapper executable of ours, installed on PATH ahead of the real binary, which:

* recognises `--common_version` and only that, starting our server and opening the browser;
* forwards every other argv, verbatim and in order, to the resolved `grok` binary via
  `server/services/grokDetect.ts`, and exits with its exit code;
* never mutates the arguments it forwards.

To the user this is indistinguishable from a `grok` flag, which is the requirement. To us it is a
launcher, which is the truth. Today there is no argument parser worth the name — `bin/openui.ts`
handles `--no-update` and `--dev` — and `client/src/main.tsx` selects the surface from a URL query
parameter (`?view=control-room`). That URL switch is the seed of the launch path, not a
replacement for it.

### 3.2 A project defines what type of work is done in it

A project carries:

* a **capability category** — documents, slides, experiences, or software — chosen at creation;
* an **overall project description**: one brief, in the user's own words, that *every* agent in the
  project follows;
* a workspace root on disk where deliverables land;
* a budget.

Choosing the type of work is what tailors the workspace. A sales-deck project does not look like a
software project: different navigator sections, different default team, different editor, a
different set of tools offered in the Tools panel. Same shell, different furniture.

The project description is the single shared brief. It reaches every agent's session as part of
`rules` at `session/new` (`server/services/acpSessionManager.ts`), alongside the agent's persona
and its work area. There is exactly one shared brief and one per-agent boundary; anything else an
agent knows, it discovered.

Today `client/src/control-room/NewProjectPanel.tsx` asks for a repository path, a base branch and
a pasted markdown design document. All three are wrong for this product.

### 3.3 The agent team

One click assembles a team appropriate to the project description. The user may also create agents
by hand. `server/services/agentTeam.ts` already does the assembling — `seedDefaultTeam` and
`resolveAgentForRole` with its exact → normalised → family → fallback matching survive as code;
its roster data (Planner, Backend Engineer, Frontend Engineer, Test Engineer, Reviewer) does not.

Agent creation is where **capability** is chosen, and capability is the important idea (§9).

### 3.4 Orchestration is deliberately light

An omni-agent, but simple, because agents are mostly in conversation. A quick file tree exists for
edits and for seeing multi-agent activity, and that is about it.

Do not design a heavy orchestration engine. Where a loop document is tempted to add planning
machinery, it should prefer conversation plus a visible team. The evidence for this is in the
repository: `server/services/planner.ts` produces a plan, `client/src/control-room/PlanPanel.tsx`
renders it as a task table with dependency ids and a disabled Launch button, and milestones —
which the plan generator creates — are never attached to the tasks it creates, so
`plan.milestones[].taskIds` is empty in every shipping project. The heavy half was built and is
decorative. The light half — a message thread per pair of agents, with link validation and a loop
guard (`server/services/messaging.ts`) — works.

What survives from the planning machinery: `server/services/taskGraph.ts` (pure functions over
`dependsOn`, zero git, zero code assumptions), and the **approval gate** — the single human
decision before work starts. That gate is genuinely good product and must survive, rendered as one
plain "Start work" confirmation rather than a table.

---

## 4. The four media, and what done means for each

The workspace produces four kinds of thing. Each has a definition of done, and every definition
obeys one rule:

> Done is verified against the artifact, never taken from the agent's report of it.

The provenance for that rule is in this repository. `submitCode` in
`server/services/projectStore.ts` checks the agent's claimed file list against what git actually
says and records `claimedChangedFiles` only when the two disagree — written after a real run in
which an agent listed a test file it had never touched. Git goes away; the discipline does not.

### 4.1 Documents

Done when:

* the file exists under the project workspace root, has non-zero bytes, and its mtime is after the
  task started;
* every section named in the project brief has content;
* no placeholder markers remain (`Lorem`, `TODO`, `{{`, "coming soon");
* `server/services/secrets.ts` finds no secret in it — a shared document leaks further than a
  private repository, and that scanner already runs on every document and message write;
* a named human approver is recorded.

### 4.2 Slides

Done when everything in §4.1 holds, plus:

* the slide count matches the approved outline;
* every image slot resolves to a **persisted local asset**, not to a returned generation URL
  (§13.4 — those expire);
* if narrated, total narration duration is within ±20% of the target.

There is no xAI slide API (§13.5). Slide assembly is our code end to end.

### 4.3 Experiences (voice + video)

Done when:

* every generation job reached `done` — not `pending`, not `expired`, not `failed`;
* every returned media URL was downloaded and persisted on receipt;
* clip durations match what was requested;
* the cost of every asset is recorded with its model id and unit count (§9).

An experience is the only medium where "the agent said it finished" and "the artifact exists" can
diverge for minutes, because video generation is asynchronous. Treat every clip as a job with a
state, not as a function call.

### 4.4 Software

Lovable-style: a common user describes a web interface or an app, and agents build it. The
existing coding agent is **not deleted**; it is repositioned as one capability among four, offered
when the user picks the software category at project creation.

Done when:

* the app builds and a preview renders — the preview is the evidence a non-technical user reads,
  not a passing test count;
* the checks the agent claims ran are confirmed against the artifact store;
* no secret is present;
* a named human approver is recorded.

Diffs, branch names, worktree paths and test tallies may exist in the data model. They must not
reach this product's default interface. `client/src/control-room/DiffView.tsx` does not survive as
a user-facing surface.

---

## 5. The four pages

### 5.1 AGENTS

The current control room, re-founded. Colour-coded work areas, boundaries, environment, cost.

```text
 grok-workspace · Q3 Enterprise Deck · 4 agents · 1 waiting          $2.41 / $25.00
▌● Research      Doc Hub · reading 6 sources          working    12m      $0.38
 ● X             @acme timeline · drafting 3 posts    working     9m      $0.11
 ● Slides        Imagine · 8 of 12 images             working     4m      $1.62
 ○ Video         voice + Imagine · waiting on script  waiting     —       $0.30
```

Each row is one agent bound to one work area, in that area's colour, with its capability named,
one sentence of what it is doing, its state, and its spend. State carries a text label as well as
a colour — `server/types/agent.ts` states the rule at the top of the file and
`client/src/control-room/uiChecklist.test.tsx` enforces it. A more visual product does not get to
trade that away.

The card must not fabricate. `client/src/control-room/AgentCard.tsx` omits every field the server
did not supply rather than defaulting it, and that rule stands: no invented percentage, no
placeholder dollar figure.

### 5.2 DOC HUB

A Google-Workspace-like home for everything the workspace has made — documents, slides,
experiences and software — showing visually which agent is reading or working on what.

* the unit is a deliverable, not a file path;
* every artifact an agent produces lands here (§14);
* an agent currently reading or writing a deliverable is shown on it, in its area colour;
* versions are visible and restorable.

This is the page the canonical demo ends on, and it is the reason the artifact store must be real
rather than a directory listing. `server/services/repository.ts` lists files with `git ls-files`,
which shows only tracked files — a freshly generated PNG would be invisible. That is a correctness
bug for a generation product, not a cosmetic one.

### 5.3 USERS

User management. Named humans, their projects, and who may approve what. The approval identity is
already load-bearing elsewhere: publication refuses without a named approver, and
`server/services/projectMcpServer.ts` withholds six tools from agents entirely
(`DELIBERATELY_USER_ONLY`, including `approve_code_submission` and `request_merge`) so that an
agent cannot approve its own work. That principle transfers unchanged, and USERS is where the
identity behind it becomes visible.

### 5.4 X (optional fourth page)

X API integration: X-native generation, video, and posting. Optional means the product is complete
without it; it does not mean half-built. If the page ships, posting is an outward-facing action and
therefore requires human approval every time (§20).

**Unverified.** No X API details are established in the research for this pivot — no endpoint, no
auth flow, no rate limit, no price. Anything a loop document writes about X beyond "the page
exists and posting requires approval" must be checked against X's own developer documentation
first, and marked unverified until it is.

---

## 6. The Tools panel

Openable over any page. It holds prompts, skills and workflows, editable in place.

The panel is an overlay, not a seventh page, because its contents are used *while* doing something
else: you open it over the deck you are building, adjust a skill, and close it.

The backend is already there and has never been called. `server/routes/library.ts` mounts nine
endpoints under `/api/library` — skills, prompts and workflows, list and create, plus compose,
render and instantiate — and `grep -rn "api/library" client/src` returns nothing. The panel is a
pure front-end build against an API that already works, which makes it much cheaper than it looks.
Verify that grep before writing an estimate; it is the single most surprising fact in this section.

What the backend does **not** have: any `update` or `delete`, for any of the three types
(`server/services/promptLibrary.ts` has no such methods, `server/routes/library.ts` has no
PUT/PATCH/DELETE). "Editable in place" is therefore blocked on new endpoints, not on new UI.

---

## 7. Work areas and the boundary rule

An agent spawns in exactly one work area. It may read widely. It may write only inside its area.
Anything it wants changed outside its area, it suggests (§8).

A work area is:

```text
WorkArea {
  id, name, colour,
  boundaryPaths: string[]     the only places this area's agent may write
  ownerAgentId,
  deliverableId,
  milestoneId
}
```

`server/types/agent.ts` already declares `color` and `avatar` on an agent. Both are written by
nothing and read by nothing. The colour-coding field exists and is inert.

### 7.1 What isolation actually is today, stated plainly

**Boundaries are enforced nowhere at write time.** Isolation today is a `cwd` passed to the agent
and nothing more (`server/services/acpSessionManager.ts`). The agent runs with
`--always-approve`; an absolute path in any file-write tool leaves the directory instantly.

Three mechanisms look like enforcement and are not:

* `assertAgentCanWrite` (`server/services/repository.ts:261`) refuses a write when HEAD is a
  protected branch. It has **zero production callers** — the only references are its own tests;
* the whole `ApprovalQueue` (`server/services/approvals.ts:133`, with `RESTRICTED_ACTIONS` at
  `:17`) is written, tested, and called by nothing;
* `server/hooks/shellSafetyHook.ts` is the one real runtime guard, and **this repository never
  installs it**. It also only classifies shell commands (`SHELL_TOOLS` at `:17`), so a direct
  file-write tool bypasses it entirely.

Git worktrees made an out-of-bounds edit **recoverable** — it landed on a throwaway branch and
showed up in a diff. They never **prevented** one. Remove git and you remove the safety net, not
the enforcement, because there was no enforcement.

### 7.2 What a real boundary needs

Two mechanisms, not one:

* **a PreToolUse hook, installed by us at startup**, extended from shell commands to file-write
  tools, which resolves and canonicalises every path argument before deciding, and calls
  `process.exit(2)` to deny. A deny expressed in stdout JSON is ignored under `--always-approve`;
  the existing hook already knows this and does both (`server/hooks/shellSafetyHook.ts:85`). The
  canonicalisation must be the real one — `assertManagedPath` in `server/routes/repository.ts:59`
  resolves through symlinks and closes both the macOS `/var`→`/private/var` false refusal and the
  `<root>/link → /etc` false approval. Copy that function, do not re-derive it;
* **MCP-mediated writes**, and prefer these when the deliverable is structured. Every tool in
  `server/services/projectMcpServer.ts` is bound to one project and one agent at construction —
  the identity is not a parameter, so an agent cannot address another project or impersonate
  another agent. Add `areaId` to that context and every mutation carries
  `{projectId, agentId, areaId}` by construction.

A structured deliverable is therefore a safety decision as much as a product one. That is the
strongest argument for slides being a deck object rather than a directory of loose files.

---

## 8. The suggestion mechanism across boundaries

An agent that believes something outside its area is wrong writes a suggestion. A suggestion
carries the original text, the proposed text, the reason, and the version it was written against.
The user accepts, edits, rejects, or asks for a revision.

**This half already works, and it is the best-preserved thing in the repository.** `DesignSuggestion`
(`server/types/project.ts:95-118`) carries `baseVersion` for conflict detection, `originalText` /
`proposedText`, `reason`, `risks`, and `originalProposedText` — the agent's wording retained after
a user amends it, so provenance is not lost. The `submit_design_suggestion` MCP tool
(`server/services/projectMcpServer.ts:245`) is the agent's end. `client/src/control-room/ReviewQueues.tsx`
is the human's end, with accept / edit / reject / request-revision and stale detection.

It is exactly "may suggest outside its area". Reuse it as-is. The only change required is a
`targetAreaId` alongside `requirementId`, so a suggestion can name the area it concerns rather
than only the document section.

One thing to raise, and it is a policy change rather than a rename: today, an out-of-bounds edit is
noticed only after the fact, by `unrelated_changes` in `server/services/designReview.ts`, at
severity `warning`. Under §7 it becomes a blocking finding, because under §7 it should have been
impossible.

---

## 9. Capability, and cost as a first-class pillar

### 9.1 Capability is chosen when an agent is created

An agent is one of exactly four things:

```text
base            Grok text and reasoning only
+images         Grok Imagine — image generation and editing
+voice          TTS, STT, realtime speech
+voice +images  both
```

Capability decides which tools and which `api.x.ai` endpoints an agent may call. It is therefore
the primary cost surface: image, video and voice are the expensive capabilities, and a base-Grok
agent **cannot** run up a media bill at all, by construction rather than by budget.

> Capability is a budget control at least as much as it is a feature flag.

Two consequences for the design:

* the capability picker must show the cost class of each option at the moment of choosing, not in a
  settings page later;
* the enforcement is the same enforcement as §7: capability is part of the agent's MCP context, and
  a media tool refuses for an agent that does not hold the capability. Do not implement it as a
  hidden button.

### 9.2 What cost is today: broken, not merely incomplete

This is a correction, not a gap list. `DEFAULT_RATES` in `server/services/usageAccounting.ts:31`
has exactly three keys — `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` — and **no Grok model**. `resolveRate`
returns `null` for an unknown model and `estimateCost` then returns
`{costUsd: 0, estimated: true, rateKey: null}`, described in its own comment as an honest zero the
UI can label. The UI does not label it: `client/src/control-room/ProjectHeader.tsx` and
`client/src/control-room/CommandCenter.tsx` render a static "estimated" caveat string, never the
actual `rateKey`. A user sees `$0.00 (estimated)` and reads "cheap" where the system meant "we do
not know the price of this model".

Unless a live Grok turn happens to report a `modelId` beginning `gpt-4o` or `gpt-4.1`, **every cost
figure in the shipping product is $0.00, every budget is unreachable, and no budget warning can
ever fire.** Verifying what `modelId` a live turn actually reports is the first task of the cost
workstream, before anything else is built.

Also verified absent:

* **there is no ledger.** `server/services/agentRegistry.ts:359` does `agent.costUsd += …` and
  `server/services/projectStore.ts:1217` does the same for a task. Nothing anywhere persists an
  individual charge with a timestamp, a model id and an operation label. Consequence: no time
  series, no drill-down, no "where did the money go", no export — and no source data for any chart
  the owner is imagining;
* the input / output / cache / reasoning token split is computed in
  `server/services/usageAccounting.ts` and collapsed to a single total at every call site;
* `approvalThreshold` and `maxRetries` are unimplemented — zero occurrences in code, one occurrence
  in `product-design.md`;
* per-tool-call attribution is **structurally impossible** on the current transport: ACP returns
  one usage object per turn, and `tool_call` updates carry no usage. Do not put per-tool-call cost
  in a checklist; it needs a provider change.

Per-task cost **is** tracked and capped (`server/services/projectStore.ts:1217`). `HANDOFF.md` is
stale on that one point.

### 9.3 What cost must become

* **a cost ledger**: an append-only, queryable record of individual charges, carrying project,
  area, deliverable, task, agent, operation, model id, rate key, token split or unit count, dollar
  amount, whether it is billed or estimated, and a timestamp. Everything else in this section is a
  grouping over that table;
* **a rate table that can express units, not only tokens.** Images are priced per image, video per
  second, speech per character, transcription per hour. The current `ModelRate` is
  per-million-tokens only and cannot express any of them;
* **two trust tiers, distinguished in the UI**: `billed`, from `usage.cost_in_usd_ticks` returned
  on chat, image and video responses (1 USD = 10¹⁰ ticks), and `estimated`, derived from published
  rates. The docs do not state whether TTS, STT or realtime carry `cost_in_usd_ticks`; treat voice
  as estimated until a live response proves otherwise;
* **budget scopes** at area, deliverable and project, not only agent and task;
* **an approval threshold**: spend above a set figure requires a human click. `ApprovalQueue`
  already has `budget_increase` in `RESTRICTED_ACTIONS` and a complete request / resolve /
  assert lifecycle. Wiring it is the cheapest large win in this workstream.

### 9.4 Why this is a pillar and not decoration

```text
one 60-second generated experience, media only
  8 clips × 8s × $0.080/s   grok-imagine-video-1.5     $5.12
  8 source images × $0.05   grok-imagine-image-quality $0.40
                                                       -----
                                                       $5.52
```

That is three orders of magnitude more than a text turn. One careless retry loop is a $50 mistake,
made by a user who has never seen a token count and has no reason to expect one. Cost visibility is
the feature that keeps this product safe to hand to a salesperson.

---

## 10. The resource model: prompts, skills, workflows

Three kinds of reusable thing, with precise definitions:

* **prompt** — simple copy-and-paste text, a single line;
* **skill** — a preprocessed **directory** of markdown files fronted by a **discovery prompt**. It
  can be turned up or down. Its contents reach the prompt *through* the discovery prompt, and it
  is discoverable by the agent later;
* **workflow** — customisable agent control logic: a loop, an evolve-loop, a loop that edits its
  own loop document to add goals.

### 10.1 Against what exists

`server/services/promptLibrary.ts` holds all three today, in one JSON file:

* `PromptTemplate` (`:22`) is a body with `{variable}` placeholders, a declared variable schema, and
  a render that raises rather than emitting a hole. That is **richer** than "a single line", not
  poorer. Keep the engine, make the default creation path a single textarea with no variables;
* `Skill` (`:32`) is `{id, name, description?, instructions: string}` — one string. There is no
  directory, no file loader, no discovery prompt, no dial. `description` is stored and **read by no
  code path**, and it is precisely the field that must become the discovery prompt. Worse, the
  current injection is the inverse of what is wanted: `rulesForAgent` concatenates every assigned
  skill's full text into `rules` at `session/new`, eagerly and unconditionally, before the agent has
  seen the task;
* `ProjectWorkflow` (`:52`) is a static DAG of named stages with role labels and review-gate
  booleans. It has no loop, no condition, no iteration, no termination criterion, and nothing
  executes it. The word is the same; the concept is unrelated.

### 10.2 The decision that saves the most work

Grok Build already implements skills and workflows, upstream, with the exact semantics asked for:

* a skill is a directory containing SKILL.md, discovered from `./.grok/skills/`,
  `<root>/.grok/skills/`, `~/.grok/skills/` and Claude/Cursor compatibility roots, with three-tier
  progressive disclosure (listing → invocation → bundled resources), a listing budget, and a
  `[skills] disabled` list that keeps a skill listed but out of the system prompt — literally
  "turned down";
* a workflow is a script with a host API that includes spawning child agents, parallel fan-out,
  phases, a budget query, a human-gate pause, and persistent scratch files across a run. The
  scratch file is how a loop edits its own goal document.

So: **the workspace's job is to be a filesystem editor and a config writer for those directories,
plus a run dashboard — not to build a second skill runtime or a second workflow engine.** If both
systems exist, agents receive every skill twice.

Two corollaries:

* `rules` should carry the persona, the shared project brief and the work-area boundary. Nothing
  else. Skills reach the agent through disk discovery;
* writing a skill directory into one agent's own area makes it local to that agent alone. That is a
  mechanical fit for "an agent spawns inside one work area", and it costs no new discovery code.

**Unverified, and it gates the whole approach:** whether an ACP stdio session runs the same skill
discovery as the terminal UI. The evidence points that way — grok's session setup emits an
available-commands update carrying skills and workflows — but `server/services/acpClient.ts` has no
handler for that notification, so if it is arriving today, it is being discarded. Spike this before
any loop document commits to it.

### 10.3 Turn-up / turn-down

The upstream control is binary: a skill is enabled, listed-but-disabled, or ignored entirely. It is
not a continuous dial. Present it as three states with plain-language labels. Do not draw a slider
for a control that has three positions.

---

## 11. Theming

Dark **and** light. Only dark exists today.

* `client/tailwind.config.js` has no `darkMode` key at all, so Tailwind defaults to `media`, and the
  three custom palettes are hard-coded dark hexes;
* `client/src/index.css` nails dark to the document rather than to a class: `html, body` are set
  directly, and there are roughly fifteen `!important` overrides that no Tailwind class can beat;
* the control-room components carry roughly 333 colour tokens, of which about 243 are
  white/neutral. 109 of those are `text-white/NN` opacity variants — not colours but *emphasis
  levels* painted against an implicit dark ground. A find-and-replace to `dark:` variants doubles
  every class string and produces an unaudited light theme.

The required shape:

* CSS custom properties behind Tailwind semantic tokens, with `darkMode: 'class'`;
* the seven opacity levels collapse into a four-step semantic ramp (default / muted / faint /
  ghost);
* the eighteen status colour strings in `client/src/control-room/types.ts` are centralised first —
  that one file covers every status badge in the application;
* the theme follows `prefers-color-scheme` by default with a user override that wins in both
  directions. `PUT /api/settings` in `server/routes/api.ts` merges arbitrary keys into an untyped
  config object, so persisting a theme needs no schema change;
* Grok Build ships a matched first-party dark/light pair (GrokNight and GrokDay). Port those values
  rather than inventing a palette — it is the cheapest way to look like the same product.

Two things a light theme must not break: every status keeps its **text** label, and the `sr-only`
caveat spans survive the redesign. Test risk is otherwise near zero — of eleven control-room test
files, exactly two assert on a class name and neither asserts a colour.

---

## 12. Onboarding and the greeting

Two distinct things, and the difference matters:

* **a first-run greeting** — shown once, on first launch, before any project exists. It asks what
  kind of work the user does and offers to create the first project;
* **a welcome guide** — a re-openable explanation of every section, available forever from the
  chrome. Not a one-shot tour that marks itself complete and hides.

What exists: `client/src/components/OnboardingTour.tsx` is a two-phase overlay with a genuinely
reusable spotlight mechanism — steps name a target, the tour resolves it in the DOM, and it skips
any step whose target is not mounted, which is exactly what a workspace with optional pages needs.
`client/src/components/HelpModal.tsx` provides a usable modal shell whose content (a keyboard
shortcut table) is precisely wrong for this audience.

Both are mounted only in the legacy shell. A user who lands on the control room never mounts either.
Worse, completion is stored under one global key, so a user who completed the canvas tour would
never see a workspace guide keyed on the same flag.

To reuse: lift the step and feature arrays out of the component into props, namespace the
completion key, and de-brand the header, which currently reads "OpenUI" and "Manage your Claude
Code agents" — the wrong product name and the wrong product.

**Note for anyone reading old documents:** "greeting service" in `HANDOFF.md` is the name of the
demo fixture project — a three-requirement service whose tests start red — and "Greeting Service"
is also the fixture name in `client/src/control-room/uiChecklist.test.tsx`. Neither is this
feature.

---

## 13. The generation backends, and their real constraints

Every figure here is verified against xAI's documentation as of 2026-08-08. Anything not stated
here is unverified and must be checked before use.

### 13.1 Images

```text
POST https://api.x.ai/v1/images/generations
POST https://api.x.ai/v1/images/edits

grok-imagine-image            $0.02 per image
grok-imagine-image-quality    $0.05 per image

5 RPS, flat across all spend tiers.  Up to 10 images per request.
Edits are charged for both input and output.
```

### 13.2 Video — asynchronous

```text
POST https://api.x.ai/v1/videos/generations   -> { request_id }
GET  https://api.x.ai/v1/videos/{request_id}  -> pending | done | expired | failed

grok-imagine-video        $0.050 per second
grok-imagine-video-1.5    $0.080 per second

duration 1-15s, default 8.  480p / 720p / 1080p.
Audio is generated by default on all modes.
10 RPS, flat across all spend tiers.
```

Every video is a long-lived server-side job with a poll loop, a persisted `request_id` and a
terminal state that includes **expired**. A work area that renders video needs a job table, not a
request/response.

### 13.3 Voice

```text
POST/WSS https://api.x.ai/v1/tts        $15.00 per 1M characters
POST     https://api.x.ai/v1/stt        $0.10/hr REST, $0.20/hr streaming
WSS      https://api.x.ai/v1/realtime   $0.05-$0.08 per minute
```

`with_timestamps` on TTS returns **per-character timing**. That is how narration syncs
deterministically to slide builds, and it is the single most useful field in this section.

`/v1/tts` is **not** OpenAI's `/v1/audio/speech`. The paths differ, the parameters differ, and the
OpenAI SDK cannot call it. The same is true of `/v1/stt`. Image generation *is* OpenAI-SDK
compatible via a base-URL swap; video, TTS, STT and realtime are not.

### 13.4 Returned media URLs are temporary

Download and persist on receipt or lose the asset. This is a hard architectural constraint, not an
optimisation:

* no deliverable may store a returned generation URL as its reference to an image or a clip;
* persistence happens at the moment of receipt, in the same code path, before anything else;
* an asset store is therefore mandatory day-one infrastructure, not a later addition.

Any design that references a generated URL from a document or a deck is broken by construction.

### 13.5 There is no xAI document or slide generation API

None. Not for PPTX, DOCX, PDF or slides. The neighbouring APIs are input-side only.

Slide assembly and document generation are **100% our own code**. The realistic shape: a Grok text
model produces structured JSON under a schema — an outline, per-slide copy, image prompts — our
renderer turns that JSON into the artifact, Imagine fills the image slots, video fills motion
slots, and TTS narrates with per-character timestamps for sync. Say this plainly in every loop
document that touches slides, or an agent will spend an iteration looking for an endpoint that does
not exist.

### 13.6 There is no HTTP client to api.x.ai today

The project speaks ACP to the `grok` binary and nothing else. `grep -rn "api.x.ai" server/` returns
zero hits. A bearer-authenticated HTTP client, a WebSocket bridge, a video job store and poller,
and an asset store are **net-new work**, in TypeScript, with no official xAI TypeScript SDK to lean
on — the official SDK is Python and gRPC-based. The endpoints are simple; the work is real. Budget
for it as construction, not as wiring.

Two credentials exist, and they are different: whatever signs the `grok` CLI in, and `XAI_API_KEY`
for direct API calls.

### 13.7 Custom voice cloning is not available to us

Custom voices exist, but **creation via API is Enterprise-plan only**; on a standard plan they are
created in the console. Availability is US-only, excluding Illinois.

Do not write a feature that clones a user's voice from the app. It is not buildable on the plan
this product will ship on.

### 13.8 Prefer the direct API over the CLI for media

The `grok` CLI has media tools, and they are gated: image and video generation are unavailable on
the free and X Basic subscription tiers, the gate applies in headless/ACP agent mode as well as the
terminal UI, and a remote setting can force the capability off in a way that local configuration
cannot override. The CLI's tool surface is also narrower than the raw API — fewer durations, no
1080p, no text-to-video.

For a product sold to non-technical users, the direct API path with our own key is the only
defensible architecture. Treat the CLI's media tools as a developer convenience, never as the
product's media engine.

---

## 14. The canonical demo

Every surface is checked against this. Each loop document must state what its surface contributes
to it.

```text
The user creates a project: "I need to do this sales presentation."

The team is assembled:
  Research  — base Grok            researching in the user's Grok Doc Hub
  X         — base Grok            working against the user's X account
  Slides    — Grok + images        generating the slides with Imagine
  Video     — Grok + voice + images generating video assets

Every asset the agents produce lands back in the Doc Hub.
```

Read against the rest of this contract, the demo exercises: project creation with a capability
category (§3.2); one-click team assembly (§3.3); capability chosen per agent, two of four agents
deliberately unable to spend media money (§9.1); four coloured work areas with enforced boundaries
(§7); the Doc Hub as the place everything lands (§5.2); asset persistence on receipt, because two
agents are producing media behind temporary URLs (§13.4); and a running cost figure that is not
$0.00 (§9.2).

If a design decision makes that story harder to tell, it is the wrong decision.

---

## 15. What the brief assumed that is not true

This is the most valuable section in the document. Each entry is a premise the owner is making
decisions on, the correction, and what it changes.

**1. "Grok Code" is not a product name.** The CLI is Grok Build, by xAI; `grok-code-fast-1` is a
model id and `grok_code` is a telemetry schema namespace. There is no product called Grok Code and
no product called X Code.
*Consequence:* the wordmark is "built on xAI's Grok Build". Do not print a product name that
cannot be cited.

**2. `grok --common_version` cannot be a flag inside `grok`.** `.refs/grok-build` is a read-only
upstream mirror that refuses external contributions.
*Consequence:* §3.1. The flag is delivered by our wrapper on PATH, which forwards everything else
verbatim. The user experience is unchanged; the architecture is not.

**3. Grok Build has no GUI to overlay.** It is a terminal UI. "Overlay" in its own vocabulary means
a terminal view stacked over the scrollback. A browser application cannot overlay it.
*Consequence:* the Xcode idiom is *our* layout language (§2.2), not a skin over someone else's
window. grok-workspace replaces the terminal surface for the session in which it is launched.

**4. Grok Imagine has a public REST API — and the owner's doubt on this point was misplaced.**
Images and video, GA, documented, priced per unit (§13.1, §13.2).
*Consequence:* media generation is buildable today. It is also *asynchronous* for video, which is a
job store, not a function call.

**5. Returned media URLs are temporary.**
*Consequence:* an asset store is day-one infrastructure and no deliverable may hold a generation
URL (§13.4). This invalidates the obvious implementation of "put the generated image in the deck".

**6. There is no xAI document or slide generation API.** None.
*Consequence:* slide and document generation are entirely our code (§13.5). Any plan that budgets
this as an integration is wrong by an order of magnitude.

**7. Custom voice cloning via API is Enterprise-only, US excluding Illinois.**
*Consequence:* no "clone your voice" feature. Built-in voices only (§13.7).

**8. The project has no HTTP client to api.x.ai today.** It speaks ACP over stdio and nothing else.
*Consequence:* the client, the WebSocket bridge, the video poller and the asset store are net-new
(§13.6). There is no official xAI TypeScript SDK.

**9. Cost is broken today, not merely incomplete.** `DEFAULT_RATES` has three OpenAI keys and no
Grok model, so unknown models yield `costUsd 0` with `rateKey: null`, and `rateKey` is surfaced
nowhere. Every figure in the shipping product is very likely $0.00.
*Consequence:* "deepen cost tracking" is not deepening. It is repair, then construction (§9.2).
The first task is to observe what `modelId` a live turn reports.

**10. There is no cost ledger — only running totals.** No time series, no drill-down, no export, no
source data for any chart. The token split is computed and discarded. `approvalThreshold` and
`maxRetries` have zero occurrences in code. Per-tool-call attribution is structurally impossible
because ACP returns one usage object per turn.
*Consequence:* every cost visualisation in the brief needs a ledger built first (§9.3). Per-tool-
call cost must not appear in any checklist.

**11. Per-task cost *is* tracked.** `HANDOFF.md` says otherwise and is stale on that point.
*Consequence:* do not rebuild it.

**12. Boundaries are enforced nowhere at write time.** `assertAgentCanWrite` and the entire
`ApprovalQueue` have zero production callers; `server/hooks/shellSafetyHook.ts` is never installed by this
repository and only sees shell commands.
*Consequence:* §7.2. Worktrees made out-of-bounds edits recoverable, never impossible. Removing git
removes the safety net, and the enforcement has to be built for the first time.

**13. The suggestion half already works.** `DesignSuggestion`, `submit_design_suggestion`,
baseVersion/stale conflict detection and `client/src/control-room/ReviewQueues.tsx` are the boundary-suggestion mechanism,
complete.
*Consequence:* reuse it; add `targetAreaId` (§8). Do not design a new one.

**14. The resources backend exists and has never been called.** `server/services/promptLibrary.ts`
and `server/routes/library.ts` serve skills, prompts and workflows; no client code has ever called
`/api/library`.
*Consequence:* the Tools panel is cheaper than it looks, and blocked only on missing update/delete
endpoints (§6). Verify the grep before writing the estimate.

**15. Skills and workflows already exist upstream, with better semantics than ours.** A skill is a
SKILL.md directory with progressive disclosure and an enable/disable list; a workflow is a script
with a real host API including child agents, budgets, human gates and persistent scratch state.
*Consequence:* be a filesystem editor and a run dashboard, not a second runtime (§10.2). Building a
parallel system means agents get every skill twice.

**16. The turn-up/turn-down control is three states, not a dial.**
*Consequence:* three labelled states, no slider (§10.3).

**17. Roughly 45% of the server survives.** What dies is everything assuming the artifact is source
code: worktrees as isolation, diffs as review evidence, test runs as acceptance evidence, merge as
completion.
*Consequence:* those are four separate replacement subsystems, not four renames. Any plan that
schedules them as renames is wrong.

**18. Voice in the CLI is input only.** The `grok` voice crate is streaming speech-to-text. There is
no text-to-speech in the CLI at all.
*Consequence:* all spoken output is our own `/v1/tts` integration.

**19. Video already generates audio by default.**
*Consequence:* TTS earns its place mainly for slide narration, where per-character timestamps give
deterministic sync — not for putting sound on clips.

**20. Media throughput cannot be bought.** Imagine RPS is flat across spend tiers: 5 RPS images, 10
RPS video.
*Consequence:* a deck with 30 images has a serialised floor before generation latency even starts.
Design the progress UI for that, and do not plan around a rate-limit increase.

**21. This machine is not currently authenticated to xAI.** The local grok configuration points at
OpenAI and HuggingFace endpoints, and `grok models` reports "You are not authenticated."
*Consequence:* nothing in §13 works until an xAI credential exists. This will bite on day one, and
it is a credential question for the user, not a task (§20).

---

## 16. What the retired product proved, and what carries over

This is a re-founding, not a restart. The control room reached 52 of 52 checklist items with
recorded evidence, a 715-test gate, two typechecks, a production build and four audits. What it
proved is worth more than what it built.

What it proved, and what carries over unchanged:

* **an agent will report work it did not do.** The submission path verifies the claim against the
  artifact and records the discrepancy. That discipline becomes §4's rule about done;
* **colour is never the sole carrier of meaning.** Every status has a text label, enforced by a
  test. A more visual product does not get to trade this away;
* **never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. This is the reason `$0.00 (estimated)` is a bug rather than a cosmetic complaint;
* **a suggestion mechanism with provenance works.** Accept / edit / reject / request-revision, with
  the agent's original wording retained after a user amends it (§8);
* **one human approval gate before work starts is the right amount of ceremony.** The plan approval
  gate survives, re-rendered as a sentence rather than a table;
* **deterministic review beats model-generated review for anything that gates publication.** A
  reviewer that returns a different verdict each run cannot gate anything;
* **a briefing must exist on day one.** Before `server/services/taskBriefing.ts` existed, launching
  an agent opened a session, said nothing, and the agent sat idle;
* **path canonicalisation is subtle and already solved here.** `assertManagedPath` closes both a
  false-refusal and a false-approval failure mode, each found by a real test;
* **secrets leak further from a shared deck than from a private repository.** The scanner stays,
  and matters more;
* **the identity is not a parameter.** MCP tools bound to one project and one agent at construction
  are why an agent cannot impersonate another, and are the natural home for the boundary rule;
* **coverage of a surface is not coverage of its behaviour.** Modules were reachable but unwired,
  endpoints declared but uncalled, MCP tools advertised but never invoked, events published and
  dropped. Every new surface in this product needs the same question asked of it.

What carries over as code: the ACP transport, the agent registry, the task graph, the event bus,
the secret scanner, the messaging layer with its link validation and loop guard, the permissioned
mutation store with version-conflict detection, the MCP server's identity binding, the suggestion
queue, the WebSocket data layer, and the path canonicaliser.

What does not carry over: git worktrees as isolation, diffs as evidence, test runs as acceptance,
merge as completion, the PTY session stack, the Claude Code conversation index and cost cache, the
GitHub client, and roughly 80% of the legacy API surface.

Retiring the old documents has a mechanical cost that must be paid in the same commit as the
deletion. `scripts/audit/docs.mjs` runs inside `bun run verify` and exits 1 on a dangling backticked
citation. Deleting `product-design.md` breaks six citations; deleting `verifiables.md` breaks six
more, plus 291 `V-0NN` references in source; roughly 120 bare `§N` citations lose their referent
silently, and the audit will never tell you about those because it validates filenames, not
section numbers. Deleting tracked files is the owner's decision (§20).

---

## 17. Explicitly out of scope

The product will not include:

* per-tool-call cost attribution — structurally impossible on ACP, which reports one usage object
  per turn;
* voice cloning from user-supplied audio — Enterprise-plan only, US excluding Illinois (§13.7);
* a second skill runtime or a second workflow engine (§10.2);
* a visual workflow builder — workflows are scripts, and a self-mutating live loop is not supported;
* diffs, branch pickers, worktree paths, test tallies or merge-conflict resolution in the default
  interface;
* deep agent hierarchies, or any orchestration heavier than conversation plus a visible team (§3.4);
* Google Docs integration — no OAuth flow, no token store, no client library exists anywhere in this
  repository or upstream, and it is a full subsystem, not a connector;
* a public skill or template marketplace;
* enterprise access controls beyond the USERS page;
* mobile;
* automatic outward-facing actions of any kind — posting, sending, publishing or deploying without
  a human click (§20).

---

## 18. The order to build it in

Each numbered item is one worktree with one loop document and one boundary. The order is a
dependency order, not a priority order.

```text
1  Domain re-founding
   Vocabulary, WorkArea, Deliverable, capability on the agent record.
   Touches the type modules and the mutation store. Deletes nothing,
   breaks everything downstream. Do it first and alone.

2  Dead-code amputation
   The PTY session stack, the Claude Code index, the cost cache, the
   GitHub client, the legacy API surface, the legacy client shell.
   ~4,000 lines. Early, because every later estimate is wrong until it
   is done, and the reachability audit keeps it honest.

3  Boundary enforcement
   PreToolUse hook extended to file writes AND installed at startup;
   areaId in the MCP context; unrelated_changes raised to blocking.
   Nothing above this line is safe until this ships.

4  Cost ledger
   FIRST TASK: observe what modelId a live Grok turn reports.
   Then the ledger, the unit-aware rate table, billed-vs-estimated,
   rateKey surfaced, ApprovalQueue wired to approvalThreshold.

5  Generation backends
   HTTP client, video job store and poller, asset store, TTS bridge.
   The asset store lands before anything that references an asset.

6  The four media
   Document and slide renderers, the checklist evaluator replacing the
   test runner, artifact-on-disk verification.

7  Pages and shell
   Xcode three-column skeleton, AGENTS, DOC HUB, USERS, the Tools panel
   over the existing library API, the file tree.

8  Theming, onboarding, greeting
   Token layer and light mode; the guide and the first-run greeting.

9  X page
   Optional. Blocked on verified X API facts (§5.4).
```

---

## 19. What counts as done

Contract-level gates. Each area loop document derives its own checklist with its own prefix; these
are the items that prove the *product* exists rather than one area of it. The format follows the
retired `verifiables.md` §22.1: a required result of observable clauses, and an evidence form of
empty labelled fields to be filled in `VERIFICATION.md`.

#### P-001: The launch flag works

Required result:

* `grok --common_version` opens the workspace in a browser;
* every other argument reaches the real `grok` binary unchanged, in order;
* the wrapper exits with the forwarded process's exit code;
* closing the workspace leaves the underlying session usable.

```text
Command run:
Browser opened at:
Forwarded argv observed:
Exit code:
```

#### P-002: A project carries one shared brief

Required result:

* project creation asks for a capability category and a description;
* the description reaches every agent's session rules;
* an agent created after the project can quote the brief without being told it.

```text
Project description set:
Agents launched:
Marker observed in each session:
```

#### P-003: Capability is enforced, not decorative

Required result:

* an agent's capability is chosen at creation from the four values in §9.1;
* a base-Grok agent's attempt to generate an image is refused by the server, not hidden in the UI;
* the refusal names the capability required.

```text
Agent capability:
Tool attempted:
Refusal observed:
```

#### P-004: A boundary refuses a write

Required result:

* an agent writing inside its area succeeds;
* the same agent writing outside its area is refused **at write time**, not at review time;
* the refusal survives a symlink pointing out of the area;
* the refusal survives an absolute path.

```text
In-bounds write:
Out-of-bounds write:
Symlink case:
Absolute path case:
```

#### P-005: A suggestion crosses a boundary

Required result:

* an agent may submit a suggestion naming an area it does not own;
* the suggestion carries original text, proposed text, reason and base version;
* the user can accept, edit, reject or request revision;
* an edited suggestion retains the agent's original wording.

```text
Suggestion id:
Target area:
Resolution:
Original wording retained:
```

#### P-006: Cost is a real number

Required result:

* a live Grok turn produces a non-zero cost figure;
* the model id and rate key are recorded on the charge;
* a charge whose rate is unknown displays as unknown, never as `$0.00`;
* the figure is labelled billed or estimated.

```text
modelId observed:
rateKey:
costUsd:
Trust tier shown:
```

#### P-007: The ledger answers "where did the money go"

Required result:

* every charge is persisted individually with a timestamp, an operation and a scope;
* spend can be broken down by agent, by area and by day;
* the breakdown is exportable;
* the totals reconcile with the project figure shown in the header.

```text
Charges recorded:
Breakdown by area:
Export produced:
Reconciliation:
```

#### P-008: Media is persisted on receipt

Required result:

* a generated image and a generated clip are downloaded and stored locally at the moment of
  receipt;
* no deliverable stores a generation URL;
* the artifact still resolves after the returned URL has expired.

```text
Generation request id:
Local path:
Deliverable reference:
Post-expiry resolution:
```

#### P-009: A video job survives its own asynchrony

Required result:

* a submitted video job is persisted with its request id;
* the poller reaches a terminal state;
* `expired` and `failed` are handled distinctly from `done`;
* the user sees the job's state, not a spinner with no end.

```text
request_id:
States observed:
Terminal state:
UI state shown:
```

#### P-010: Each medium reaches done by verification

Required result:

* a document, a deck, an experience and a software preview each reach done;
* each satisfies its §4 clauses;
* in each case the evidence is the artifact, not the agent's report;
* a named human approver is recorded on each.

```text
Document:
Slides:
Experience:
Software:
Approver:
```

#### P-011: Everything lands in the Doc Hub

Required result:

* every artifact produced by any agent appears in the Doc Hub without a manual step;
* the Doc Hub shows which agent is reading or working on each deliverable;
* an artifact created but not committed to version control still appears.

```text
Artifacts produced:
Artifacts visible:
Agent attribution shown:
Uncommitted artifact case:
```

#### P-012: The Tools panel edits in place

Required result:

* prompts, skills and workflows can be listed, created, edited and deleted from the panel;
* a skill can be turned up, turned down, or ignored;
* an edited skill's new content reaches the next agent session;
* the panel opens over every page.

```text
Edits performed:
Skill state changed:
Effect observed in session:
Pages covered:
```

#### P-013: Light mode is real

Required result:

* the whole workspace renders in light and in dark;
* the theme follows the operating system by default and a user override wins in both directions;
* every status still carries a text label in both themes;
* no hard-coded dark value survives in the stylesheet.

```text
Light screenshot:
Dark screenshot:
Override behaviour:
Remaining hard-coded values:
```

#### P-014: A new user is greeted and can find out what anything is

Required result:

* first launch shows a greeting that leads to a first project;
* every section has a re-openable explanation;
* the guide's completion state is namespaced to this product;
* nothing in the greeting names a retired product.

```text
First-run path:
Sections documented:
Settings key used:
Brand strings checked:
```

#### P-015: The canonical demo runs end to end

Required result:

* the §14 scenario runs from project creation to assets in the Doc Hub;
* four agents with the stated capabilities are assembled by one click;
* boundaries hold throughout;
* a non-zero, itemised cost figure is shown at the end.

```text
Steps completed:
Team assembled:
Boundary violations:
Final cost:
```

---

## 20. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

* an action needs credentials that were not provided — including the xAI credential this machine
  does not currently have (§15.21), which blocks every generation surface;
* an irreversible or outward-facing operation needs approval: posting to X, sending anything to a
  third party, publishing a deliverable, deploying, or spending above the approval threshold;
* deleting tracked files — including `product-design.md` and `verifiables.md`. That decision is the
  repository owner's, and §16 lists what breaks;
* requirements contradict one another, including a contradiction between this contract and a
  sibling area document;
* a required external service is unavailable, or a documented endpoint behaves differently from
  §13;
* completing one requirement would violate another;
* a change would fall outside your work area (§0). File a suggestion; do not edit.

A blocker restated across iterations is wasted work. State it once, with evidence, and stop.
