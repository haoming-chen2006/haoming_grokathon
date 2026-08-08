# grok-workspace — Product Contract

This is the design contract for grok-workspace (§1–§20). It states what the system must become. It
is the document every loop document points back at, the way `loopdesign.md` points at
`product-design.md` today. It replaces `product-design.md`, which described a different product —
a control room for coding agents — and is being retired.

| Document | Role |
|---|---|
| `grok-workspace.md` | This file. The product contract, §1–§20. What the system must become. |
| `loopdesign.md` | The house form: the voice, the loop procedure, and the evidence standards every loop document inherits. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loops/` | Eight area loop documents, one per worktree. The partition that assigns them is §18.2 and this file is its authority. |
| `docs/USER-GUIDE.md` | The user-facing guide. Owned by the `guide` worktree, which touches no code. |
| `product-design.md` | **Retired.** The coding-agent contract. Read §16 before deleting it — six backticked citations go dangling and the docs audit exits 1. |
| `verifiables.md` | **Retired with it.** V-001…V-052 are checkable statements about the retired product. |

Section numbers are load-bearing. `product-design.md` owned §1–21 and `verifiables.md` owned §22;
roughly 120 bare `§N` citations in `server/`, `client/`, `shared/` and `scripts/` resolve against
that split and will silently point at the wrong text after this replacement. Renumbering is not
free. This file deliberately reuses §1–§20 so that the majority of those citations land on a
section about the same subject, and §16 lists the ones that do not. One section has changed
subject in this revision and it is the most important one: **§4 was "the four media" and is now
"the design document is the interface"**. The asset types moved to §5.2. Anything citing a bare
`§4` for a definition of done now wants `§5.2`.

---

## 0. Your boundary

This worktree owns exactly one file:

```text
grok-workspace.md
```

**You are in a git worktree, on your own branch, and you are not in the main checkout.** Seven
other agents are working at the same time on sibling branches, each on the slice of the repository
assigned to it in §18.2. This file has no row in that partition because it is not code: like the
`guide` worktree, which owns `docs/USER-GUIDE.md` and nothing else, this worktree owns one document
and produces no source change at all.

You may **read** anything in the repository, and you must — every claim in this document is
supposed to be checkable against source. You may **write** nothing else. Not `README.md`, not
`loopdesign.md`, not a sibling loop document in `loops/`, not a source file whose behaviour this
document describes as wrong. In particular you may not touch a hot file (§18.3); you have nothing
to change in one, because you ship no code.

If you believe a sibling loop document is wrong, or that a fact in this file contradicts one in
theirs, do not edit theirs and do not quietly soften yours. Raise it the way the product itself
requires an agent to raise a cross-boundary concern (§8): write the disagreement down, name the
file and line on both sides, and hand it to the user. A suggestion carries the original wording,
the proposed wording, and the reason. A silent edit carries none of those, which is why the
product forbids it.

**What this worktree leaves behind for reconciliation:** this file, at the revision the
reconciliation pass reads to settle any disagreement between two loop documents. No branch merge,
no handoff request, no public code contract. If this worktree ever does need a hot-file change it
writes `loops/handoff/contract.md` and changes nothing itself — but needing one means it has
started writing code, which is out of bounds.

The rule exists because this product is about boundaries. A document family in which every author
edits every file is the failure mode the whole design is meant to prevent, demonstrated on itself.

---

## 1. What the product is, and who it is for

grok-workspace is the common-user face of Grok Build. It is an interface layer over the `grok`
CLI, reached from the terminal with a flag, in which a non-technical person writes a design
document, hands it to a small team of agents, and watches them work through it.

> A visual workspace where a salesperson, marketer or operator writes down what they want in a
> design document, assembles a team of Grok agents against it, and watches documents, slides,
> tables, workflows and software land back in one place — with every dollar accounted for.

### 1.1 The thesis: the design document is the interface

This is the product. Everything else in this contract serves it.

> The design document is not a description of the work. It is the surface on which the work is
> declared, assigned and watched. You do not open a task board and then consult a document; you
> open the document, and the work is in it.

Three consequences, and each one is a rule the rest of this contract enforces:

* **a design document is not an asset.** A document *asset* — §5.2 — is an output: a thing an agent
  produced and a human will read, send or print. A *design document* is the interactive interface.
  They render differently, live in different stores, obey different write rules, and appear on
  different pages. Conflating them is the single most likely way to build the wrong product;
* **documents are the only type that declares work.** Slides are PPTX rendering. Tables are
  spreadsheet rendering. Neither declares anything. A project is defined in exactly one place, and
  that place is a design document (§4);
* **the differentiation is here, not in generation.** Anyone can call an image endpoint. Nobody
  else shows you a document with four agents' cursors moving through it, each in its own colour,
  each bound to the part it is allowed to change.

### 1.2 Who it is for

* sales — decks, one-pagers, follow-up material, prospect research;
* marketing — campaign copy, image and video assets, X posts;
* operations — process documents, internal handbooks, small internal tools.

### 1.3 Who it is not for

This product is deliberately less rich than the control room it replaces. It is not for engineers,
it does not show diffs, branches, worktrees or test counts, and the words "requirement", "merge"
and "worktree" do not appear in its interface. The coding capability survives as **software**
(§5.2.5) but is repositioned as one of five things the workspace can make, not the thing it is
about.

The retired contract named "general-purpose white-collar workflows" as its very first non-goal
(`product-design.md` §20). That is now the product. §2 and §20 of that document are inverted, not
amended.

---

## 2. Relationship to Grok Build, and the Xcode idiom

### 2.1 What we are on top of

grok-workspace is an add-on to the `grok` CLI, shipped as **Grok Build** by xAI. It is not a fork
of OpenUI. That lineage is being unwound: `package.json` still names `@fallom/openui` with a `bin`
of `openui`, the state directory is `~/.openui`, the env prefix is `OPENUI_`, three HTTP headers
are `x-openui-*`, and agent commits are authored by `openui-agent`
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
│  projects    │  the thing being made, or the       │  the selected│
│  documents   │  document the work is declared in:   │  thing:      │
│  work areas  │    a design document with live      │   who owns it│
│  agents      │      agent highlighting,             │   what it    │
│  assets      │    a deck, a table, an app preview   │    cost      │
│              │                                     │   its state  │
└──────────────┴────────────────────────────────────┴──────────────┘
                    Tools panel — overlays any page (§6)
```

Three properties of the idiom are the reason for choosing it, and each one is a rule:

* **the editor area shows the artifact, never a report about the artifact.** A slide is a slide, a
  table is a grid, an app renders, a design document reads like a document. The retired product
  showed a unified diff and a test tally in this position;
* **the inspector is single-selection and always reflects the navigator.** No panel invents its
  own subject;
* **the overlay is enabled by a flag, it does not replace the underlying tool.** Closing
  grok-workspace leaves you in `grok`, with the session intact.

The current shell is a six-tab layout (`client/src/control-room/ControlRoomApp.tsx`) with a 288px
left rail, a tabbed centre and a 320px right rail, no responsive breakpoints, and up to six red
banners stacked above the content. The tabs go, replaced by the three pages of §5. The three-column
skeleton, the WebSocket data layer in `client/src/control-room/useControlRoom.ts`, and the alert
stack — collapsed to one notification surface — stay.

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
new flag.** The `grok` binary is a separate Rust program, mirrored read-only at `.refs/grok-build`,
which this repository does not build and cannot change. `--common_version` is therefore owned by a
wrapper executable of **ours**, installed on PATH ahead of the real binary, which:

* recognises `--common_version` and only that, starting our server and opening the browser;
* forwards every other argv, verbatim and in order, to the resolved `grok` binary via
  `server/services/grokDetect.ts`, and exits with its exit code;
* never mutates the arguments it forwards.

Who owns which process, stated once so no loop document has to guess: **we own the wrapper, the Bun
server and the browser client. xAI owns `grok`. We spawn it; we never patch it.** To the user the
flag is indistinguishable from a `grok` flag, which is the requirement. To us it is a launcher,
which is the truth.

Today there is no argument parser worth the name — `bin/openui.ts` handles `--no-update` and
`--dev` — and `client/src/main.tsx` selects the surface from a URL query parameter
(`?view=control-room`). That URL switch is the seed of the launch path, not a replacement for it.

### 3.2 A project follows one or more design documents

A project carries:

* **one or more followed design documents** — the declaration of what is to be made (§4);
* an **overall project description**: one brief, in the user's own words, that *every* agent in the
  project follows;
* a workspace root on disk where assets land;
* a budget.

**Project creation no longer asks for a capability category.** The previous revision of this
contract had the user pick documents / slides / experiences / software at creation and tailored the
workspace from that choice. §1.1 removes it: the design document declares the work, so the type of
work is a property of the document, not of the project. A project whose document asks for a deck
and a follow-up one-pager is one project with two output types, and forcing a category at creation
would have made that unrepresentable.

The project description is the single shared brief. It reaches every agent's session as part of
`rules` at `session/new` (`server/services/acpSessionManager.ts`), alongside the agent's persona
and its work area. There is exactly one shared brief and one per-agent boundary; anything else an
agent knows, it discovered or read out of the design document.

Today `client/src/control-room/NewProjectPanel.tsx` asks for a repository path, a base branch and
a pasted markdown design document. The first two are wrong for this product. The third is the right
idea attached to the wrong object — a pasted blob with no identity cannot be followed, cannot be
highlighted, and cannot enforce §4's cardinality.

### 3.3 The agent team

One click assembles a team appropriate to the project description and the followed documents. The
user may also create agents by hand. `server/services/agentTeam.ts` already does the assembling —
`seedDefaultTeam` and `resolveAgentForRole` with its exact → normalised → family → fallback
matching survive as code; its roster data (Planner, Backend Engineer, Frontend Engineer, Test
Engineer, Reviewer) does not.

Agent creation is where **capability** is chosen, and capability is the important idea (§9).

### 3.3.1 Every agent is a Grok Build agent — this is not negotiable

**A-0. An agent in this product is a real `grok` process, spoken to over ACP, retaining Grok Build's
entire native surface.** It is not a wrapper around a chat completion, not a bespoke worker loop, and
not a media-generation job with a name. The product is an *interface on top of* Grok Build; anything
that quietly replaces it has removed the reason the product exists.

What an agent inherits by being a `grok` process, and must keep:

```text
file reading and editing         shell execution (under the PreToolUse guard, §7)
web search                       X search
skills                           hooks
subagents                        slash commands
MCP servers                      session persistence and session/load resume
```

The failure this prevents is specific and easy to walk into. A worktree that owns media generation
builds an HTTP client to `api.x.ai`, discovers it can produce an image without an agent at all, and
ships a "generation agent" that is a job runner wearing an agent's name. It works, it is simpler, and
the product silently loses file editing, search, skills and every capability the user was told their
team has. The same trap exists for any surface that finds `grok` inconvenient.

So:

- **Capability adds, it never subtracts.** `base Grok` means the full Grok Build tool surface and no
  media APIs. `+images` means that same surface **plus** our image endpoints. A capability tier is a
  grant on top of a whole agent, never a smaller agent (§9.1).
- **§13.8 is about media only.** Preferring our own `api.x.ai` key over the CLI's `image_gen` and
  `image_to_video` tools is a decision about *where pixels come from*, taken because those tools are
  subscription-gated even in ACP agent mode. It is not permission to route the agent's thinking,
  editing or searching anywhere other than through `grok`.
- **The media endpoints are offered to the agent as tools it may call**, through the project MCP
  server, so the agent decides when to generate as part of its work. A pipeline that generates media
  *instead of* an agent is out of contract.
- **If a surface believes it needs a non-`grok` agent, it stops and asks** (§20) rather than building
  one.

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

## 4. The design document is the interface

This section is the product. Read it before any other.

### 4.1 What a design document is, and what it is not

A **design document** is a structured, versioned, line-addressable document that declares a piece
of work and is watched while that work happens. Opening one is opening the project.

A **document asset** is an output: a deliverable an agent produced under the instruction of a
design document. It lives on the ASSETS page (§5.2.1), it is versioned, it can be exported, and
nothing is declared in it.

They are different objects with different stores, and no code may treat one as the other:

| | design document | document asset |
|---|---|---|
| Purpose | declares and watches work | is the work's output |
| Page | DESIGN DOCUMENTS (§5.3) | ASSETS (§5.2) |
| Who writes it | the user; agents may only suggest (§8) | agents, directly |
| Cardinality | at most one project follows it (D-2) | any number of anything may reference it |
| Live agent presence | yes, line-level (§4.4) | agent-on-deliverable only, no line ranges |
| Store | `server/services/designDoc.ts` (03-design-docs) | `server/services/assetStore.ts` (02-assets) |

### 4.2 The rules, numbered

These are requirements. A loop document may add to them; it may not weaken them.

**D-1. A design document has a stable id, a version chain, and stable line addressing.** Every
edit produces a new version; a presence report (§4.4) and a suggestion (§8) both name the version
they were written against, and a report against a superseded version is shown as stale rather than
silently remapped. `DesignDocumentVersion` (`server/types/project.ts:49-58`) and
`VersionConflictError` (`server/services/projectStore.ts:67-73`) already implement the chain and
the optimistic-concurrency refusal. Reuse them; do not write a second one.

**D-2. Cardinality, exactly: one project may follow MULTIPLE documents. One document may be
followed by AT MOST ONE project. Never two projects on one document.** This is not a UI
convention. It is enforced in the store, at write time, by the same discipline as §9.1: the API
refuses, and the refusal names the project that already follows the document. A second project
attempting to follow raises a typed `DocumentAlreadyFollowedError` carrying `{documentId,
owningProjectId}`; the client renders "Q3 Enterprise Deck already follows this document" with a
link, and offers exactly one remedy — release it from the owning project first, as an explicit
human act, recorded with who did it and when. Hiding the button is not enforcement, for the same
reason that hiding an image tool is not a capability check.

*Why this rule and not the obvious many-to-many:* the document is where work is declared. Two
projects declaring against one document means two teams, two budgets and two approval identities
acting on one set of lines, with no way for a reader of the document to know which team a
highlighted range belongs to. The one-way multiplicity is what keeps a highlight unambiguous.

**D-3. Agents never write a design document. They suggest.** This rule already exists and is
already correct in the code — `client/src/control-room/DesignDocumentPanel.tsx:14-17` states it and
`updateDocument` refuses an agent write unless `actor.canWriteDocument`. §8 is the mechanism.

**D-4. A design document declares work; slides and tables declare nothing.** Any feature that lets
a deck or a spreadsheet define a project is out of scope (§17).

**D-5. Opening a design document shows, in one view: which project follows it, the agent
conversation, and live highlighting of what each agent is reading or working on.** §4.3.

**D-6. Presence is best-effort and must be labelled as such.** §4.4 and §4.5. No product decision,
no boundary check and no gate may read presence.

### 4.3 What you see when you open one

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Q3 Enterprise Deck  ·  followed by 1 project  ·  v14  ·  4 agents inside   │
├──────────────────────────────────────────────┬────────────────────────────┤
│  1  # Q3 Enterprise Deck                     │  ● Research   reading      │
│  2                                           │    lines 41-58 · 6s ago    │
│  3  ## Audience                              │                            │
│ ▌4  Enterprise buyers, 200-2000 seats.       │  ● Slides     working      │
│ ▌5  They have seen the Q2 deck.              │    lines 60-74 · 2s ago    │
│  6                                           │                            │
│  7  ## What the deck must cover              │  ● X          working      │
│ ▐8  - the migration story                    │    lines 4-5 · 1m ago      │
│ ▐9  - three customer proofs                  │                            │
│ 10  - pricing, without a price list          │  ○ Video      last seen    │
│ …                                            │    lines 80-92 · 6m ago    │
│                                              │    presence stale          │
├──────────────────────────────────────────────┴────────────────────────────┤
│ Slides: I have drafted 8 of 12 image prompts against lines 60-74.         │
│ Research: three proofs found; one is under NDA — see my suggestion.        │
└───────────────────────────────────────────────────────────────────────────┘
```

* the header names **the one project that follows this document** (D-2), its version, and how many
  agents are inside it;
* the gutter carries one coloured bar per agent, in that agent's work-area colour, over the lines
  it last reported. Two agents on overlapping lines stack their bars; they do not blend into a
  third colour nobody can name;
* the right rail lists every agent with its mode (`reading` / `working`), its range, and **how long
  ago it said so**. That last field is not decoration — it is the honesty requirement of D-6;
* the conversation is the agents' thread for this document, not a global log
  (`client/src/control-room/ConversationView.tsx` is reusable as-is);
* colour is never the only carrier. Every agent row states its mode in text, per the rule at the
  top of `server/types/agent.ts` and enforced by `client/src/control-room/uiChecklist.test.tsx`.

### 4.4 Line-level presence: the mechanism, in full

Highlighting is only as good as the signal underneath it. The signal is an emission the agent is
required to make, and the whole design of it has to assume the agent will sometimes not make it.

**The tool.** One MCP tool on the project MCP server:

```text
report_document_focus({
  documentId:  string,
  baseVersion: number,               the document version the agent is looking at
  mode:        "reading" | "working",
  startLine:   number,               1-indexed, inclusive
  endLine:     number,               1-indexed, inclusive
  note?:       string                one short sentence, shown in the rail
})  ->  { accepted: true, currentVersion: number, stale: boolean }
```

It follows the property that makes the existing MCP server safe: **the identity is not a
parameter.** Every tool in `server/services/projectMcpServer.ts` is bound to one project and one
agent at construction (`ProjectMcpContext`), so an agent cannot report presence for another agent
or another project. `documentId` is validated against the documents the agent's project follows;
anything else is refused, not recorded.

**The briefing instruction.** The task briefing that opens every session
(`server/services/taskBriefing.ts` — it exists precisely because, before it, launching an agent
opened a session, said nothing, and the agent sat idle) must carry, verbatim in substance:

> Before you read part of the design document, and again whenever you move to a different part,
> call `report_document_focus` with the line range you are on and whether you are reading it or
> working from it. If you are still on the same range after several tool calls, call it again so
> the humans watching know you have not stalled. Do not batch these; a report after the fact is
> worthless.

**The cadence.** Three triggers, no timer inside the agent:

* on entry to a document, before the first read;
* on every change of range;
* at least once every **10 turns or 90 seconds of wall clock**, whichever comes first, while the
  agent remains in the document.

**The TTL and what the UI shows as presence ages.** This is the part that must not be papered over:

```text
< 90s          fresh      solid gutter bar, agent listed as reading/working, range shown
90s - 10m      stale      hatched bar at reduced opacity, rail reads "last reported 4m ago",
                          the mode word is greyed and prefixed "last seen"
> 10m          expired    bar removed. The rail keeps the agent, and reads
                          "in this document, location unknown". It does NOT say idle.
session ends   cleared    bar removed, agent leaves the rail
```

**What happens when an agent stops emitting.** Nothing punitive, and nothing invented:

* the bar decays through the states above. It never freezes solid, because a frozen solid bar is a
  lie that gets more wrong every minute;
* the agent is **not** paused, **not** marked failed, and **not** refused a write. Presence is not
  a lock;
* after two consecutive expiries within one session the server records a `presence_lapsed` note on
  the agent so the pattern is visible in the ledger and to whoever tunes the briefing. It is
  diagnostic data about our prompt, not a fault attributed to the user;
* a fallback, cheaper and weaker: the ACP transcript already carries `tool_call` updates
  (`server/services/acpClient.ts`). If a tool call names the document's backing file, the server may
  mark **document-level** presence — "Research is in this document" — with no range at all. That
  keeps the rail honest when the model forgets the tool, and it must never be drawn as a line
  range. **Unverified:** whether Grok's read tool reports a line range in its `tool_call` payload
  at all. The exact thing to check is one live ACP session: log the raw `session/update` frames for
  a read of a large file and look for a range field. Until someone does, assume it carries a path
  only.

**Say the honest thing in the interface.** A model can forget to call a tool. It will. The rail
therefore always shows an age, never a bare status; and the page's help text says, in plain words,
that highlighting shows where agents last said they were, not where they provably are.

### 4.5 What presence must never do

* it must never gate a write. The boundary is enforced by §7's mechanisms, which do not depend on
  the model's cooperation. An agent that never once called `report_document_focus` is still
  confined;
* it must never be used to resolve D-2 or any other cardinality or ownership question;
* it must never be persisted as a fact about the document. Presence is a live, expiring
  observation, stored beside the document and not inside its version chain;
* it must never be shown without its age.

### 4.6 What exists today to build on

* the version chain, the conflict error and the agents-never-write rule (D-1, D-3) are built and
  tested;
* the suggestion mechanism (§8) is complete and is the only path an agent has into the document;
* what does not exist: document *identity* as a first-class object with its own store and route,
  the follow relation and its enforcement, the presence record, the tool, the briefing clause, and
  every pixel of the gutter. `shared/designDocument.ts` parses `- AUTH-01: description` bullet items
  into requirements — a deliberately strict regex whose comment records that a loose pattern turns
  prose into phantom requirements. Keep the discipline; the atom for this product is a heading and a
  line range, not a bullet with an id.

---

## 5. The three pages, and the two secondary ones

Three headline surfaces. Two secondary pages that exist but do not define the product.

### 5.1 AGENTS

The OpenUI visual panel, re-founded: multi-agent, colour-coded work areas, boundaries, environment,
the Tools panel (§6) for prompt / skill / workflow injection, and cost tracking (§9).

```text
 grok-workspace · Q3 Enterprise Deck · 4 agents · 1 waiting          $2.41 / $25.00
▌● Research      doc lines 41-58 · reading 6 sources   working    12m      $0.38
 ● X             @acme timeline · drafting 3 posts     working     9m      $0.11
 ● Slides        Imagine · 8 of 12 images              working     4m      $1.62
 ○ Video         voice + Imagine · waiting on script   waiting     —       $0.30
```

Each row is one agent bound to one work area, in that area's colour, with its capability named,
one sentence of what it is doing, its state, and its spend. State carries a text label as well as
a colour — `server/types/agent.ts` states the rule at the top of the file and
`client/src/control-room/uiChecklist.test.tsx` enforces it. A more visual product does not get to
trade that away.

The card must not fabricate. `client/src/control-room/AgentCard.tsx` omits every field the server
did not supply rather than defaulting it, and that rule stands: no invented percentage, no
placeholder dollar figure. A cost figure whose rate is unknown reads *unknown*, never `$0.00`
(§9.2).

### 5.2 ASSETS

Every asset in one place. The unit is a deliverable, not a file path; every artifact an agent
produces lands here without a manual step; the agent working on a deliverable is shown on it in its
area colour; versions are visible and restorable.

This is the page the canonical demo ends on, and it is the reason the asset store must be real
rather than a directory listing. `server/services/repository.ts` lists files with `git ls-files`,
which shows only tracked files — a freshly generated PNG would be invisible. That is a correctness
bug for a generation product, not a cosmetic one.

**There are five asset types**, and they replace the four media of the previous revision:

```text
documents · slides · tables · workflows · software
```

Each has a definition of done, and every definition obeys one rule:

> Done is verified against the artifact, never taken from the agent's report of it.

The provenance for that rule is in this repository. `submitCode` in
`server/services/projectStore.ts` checks the agent's claimed file list against what git actually
says and records `claimedChangedFiles` only when the two disagree — written after a real run in
which an agent listed a test file it had never touched. Git goes away; the discipline does not.

**Generated media is not a sixth type.** Images, clips and narration are *component assets*: they
are persisted on receipt (§13.4), listed, costed and attributed like everything else, and they are
referenced by a deliverable of one of the five types. They are never a deliverable on their own,
because "a PNG" is not something a salesperson asked for. This is why video generation is
scheduled with workflow generation in §18.1 rather than as its own page.

#### 5.2.1 Documents

The most worked-on type, and the only type whose *design* counterpart declares work (§4). Done
when:

* the file exists under the project workspace root, has non-zero bytes, and its mtime is after the
  task started;
* every section named in the design document has content;
* no placeholder markers remain (`Lorem`, `TODO`, `{{`, "coming soon");
* `server/services/secrets.ts` finds no secret in it — a shared document leaks further than a
  private repository, and that scanner already runs on every document and message write;
* a named human approver is recorded.

#### 5.2.2 Slides

**Slides are PPTX rendering.** They present content; they declare nothing.

Done when everything in §5.2.1 holds, plus:

* the slide count matches the approved outline;
* every image slot resolves to a **persisted local asset**, not to a returned generation URL
  (§13.4 — those expire);
* the produced `.pptx` opens in a real renderer and its slide count read back matches;
* if narrated, total narration duration is within ±20% of the target.

**Slide generation cannot be delegated to Grok.** §13.5. We generate slide *content* with the chat
API as structured JSON and render the `.pptx` ourselves with a Node library.

#### 5.2.3 Tables

**Tables are spreadsheet rendering.** Same relationship to work as slides: they present, they do
not declare.

Done when everything in §5.2.1 holds, plus:

* the sheet opens and its column headers match the schema the design document asked for;
* every cell that claims a computed value has one — no formula written as text, no `#REF!`;
* row count is reported and matches the source the agent cited.

The renderer is ours, for the same reason as slides: there is no xAI spreadsheet API either.
**Unverified:** which Node library. `exceljs` is the obvious candidate; the 04-generation worktree
picks one, records the exact version, and proves a produced file opens.

#### 5.2.4 Workflows

A workflow asset is reusable agent control logic, saved and runnable: a loop, an evolve-loop, a
loop that edits its own goal document (§10). Done when:

* the script carries a valid `meta` block and passes upstream validation before any run;
* one recorded run reached a terminal state, with its phase history and its child-agent count;
* the run's spend is on the ledger like any other spend.

Do not build a second workflow engine (§10.2, §17).

#### 5.2.5 Software

**Software means websites and apps built for a non-technical user, in the manner of Lovable.** The
existing coding agent is not deleted; it is repositioned as one of five outputs.

Done when:

* the app builds and **a preview renders** — the preview is the evidence a non-technical user
  reads, not a passing test count;
* the preview is verified by fetching it and confirming it is the user's app and not the
  scaffold's default page;
* the checks the agent claims ran are confirmed against the asset store;
* no secret is present;
* a named human approver is recorded.

The reference implementation is cloned at `.refs/open-lovable` (github.com/firecrawl/open-lovable).
Read it before writing about software generation; §13.9 records what it actually does and the three
places it is not a drop-in.

Diffs, branch names, worktree paths and test tallies may exist in the data model. They must not
reach this product's default interface. `client/src/control-room/DiffView.tsx` does not survive as
a user-facing surface.

### 5.3 DESIGN DOCUMENTS

The interactive interface (§4). The page lists every design document the user can see, which
project follows each (D-2), and its version; clicking one opens the reading surface of §4.3.

The page is the product's front door. If a new user opens grok-workspace and does not understand
within one screen that this is where work is declared, the page has failed regardless of how
correct the rest is.

### 5.4 USERS — secondary

User management. Named humans, their projects, and who may approve what. The approval identity is
already load-bearing elsewhere: publication refuses without a named approver, and
`server/services/projectMcpServer.ts` withholds six tools from agents entirely
(`DELIBERATELY_USER_ONLY`, including `approve_code_submission` and `request_merge`) so that an
agent cannot approve its own work. That principle transfers unchanged, and USERS is where the
identity behind it becomes visible.

Secondary means: the product is coherent without this page, it is not a headline surface, and it is
merged last (§18.4). It does not mean half-built.

### 5.5 X — secondary

X API integration: X-native generation, video, and posting. If the page ships, posting is an
outward-facing action and therefore requires human approval every time (§20).

**Unverified.** No X API details are established in the research for this pivot — no endpoint, no
auth flow, no rate limit, no price. Anything a loop document writes about X beyond "the page
exists and posting requires approval" must be checked against X's own developer documentation
first, and marked unverified until it is.

---

## 6. The Tools panel

Openable over any page; its home is AGENTS. It holds prompts, skills and workflows, editable in
place, and it is how a prompt, a skill or a workflow is injected into a running agent.

The panel is an overlay, not a fourth page, because its contents are used *while* doing something
else: you open it over the document you are watching, adjust a skill, and close it.

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
  documentRange?              the part of the followed design document this area answers to
  ownerAgentId,
  deliverableId,
  milestoneId
}
```

`documentRange` is what makes §4.3's highlighting meaningful — an agent's reported focus can be
compared against the range its area is responsible for, and a rail entry can read "outside its
section". It is **not** a write boundary, because agents never write the design document at all
(D-3). The write boundary is `boundaryPaths` and nothing else.

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
strongest argument for a deck being a deck object rather than a directory of loose files.

---

## 8. The suggestion mechanism across boundaries

An agent that believes something outside its area is wrong — including anything in a design
document, which it may never write (D-3) — writes a suggestion. A suggestion carries the original
text, the proposed text, the reason, and the version it was written against. The user accepts,
edits, rejects, or asks for a revision.

**This half already works, and it is the best-preserved thing in the repository.** `DesignSuggestion`
(`server/types/project.ts:95-118`) carries `baseVersion` for conflict detection, `originalText` /
`proposedText`, `reason`, `risks`, and `originalProposedText` — the agent's wording retained after
a user amends it, so provenance is not lost. The `submit_design_suggestion` MCP tool
(`server/services/projectMcpServer.ts:245`) is the agent's end.
`client/src/control-room/ReviewQueues.tsx` is the human's end, with accept / edit / reject /
request-revision and stale detection.

It is exactly "may suggest outside its area". Reuse it as-is. Two additive changes are required and
no more: a `targetAreaId` alongside `requirementId`, so a suggestion can name the area it concerns;
and a line range, so a suggestion against a design document lands in the gutter next to the lines
it is about.

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
  series, no drill-down, no "where did the money go", no export — and no source data for any chart;
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
  document, area, deliverable, task, agent, operation, model id, rate key, token split or unit
  count, dollar amount, whether it is billed or estimated, and a timestamp. Everything else in this
  section is a grouping over that table;
* **a rate table that can express units, not only tokens.** Images are priced per image, video per
  second, speech per character, transcription per hour. The current `ModelRate` is
  per-million-tokens only and cannot express any of them;
* **two trust tiers, distinguished in the UI**: `billed`, from `usage.cost_in_usd_ticks` returned
  on chat, image and video responses (1 USD = 10¹⁰ ticks), and `estimated`, derived from published
  rates. The docs do not state whether TTS, STT or realtime carry `cost_in_usd_ticks`; treat voice
  as estimated until a live response proves otherwise;
* **budget scopes** at document, area, deliverable and project, not only agent and task;
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

* `rules` should carry the persona, the shared project brief, the work-area boundary and the
  presence instruction of §4.4. Nothing else. Skills reach the agent through disk discovery;
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
caveat spans survive the redesign. The agent colours of §4.3 must stay distinguishable on both
grounds; check the four default area colours against a light gutter before shipping either theme.
Test risk is otherwise near zero — of eleven control-room test files, exactly two assert on a class
name and neither asserts a colour.

---

## 12. Onboarding and the greeting

Two distinct things, and the difference matters:

* **a first-run greeting** — shown once, on first launch, before any project exists. It asks what
  kind of work the user does and offers to create the first design document, which is what creating
  the first project now means (§3.2);
* **a welcome guide** — a re-openable explanation of every section, available forever from the
  chrome. Not a one-shot tour that marks itself complete and hides. It lives at `docs/USER-GUIDE.md`
  and is owned by the `guide` worktree.

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
terminal state that includes **expired**. A surface that renders video needs a job table, not a
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
* an asset store is therefore mandatory day-one infrastructure, not a later addition, and it is
  owned by 02-assets — which is why 02 is in the first wave and 04-generation is not (§18.1).

Any design that references a generated URL from a document or a deck is broken by construction.

### 13.5 Slides cannot be delegated to Grok

There is **no xAI document, slide, PPTX, DOCX or PDF generation API**. None. The neighbouring APIs
(Files, Collections) are input-side only.

Two surfaces appear to generate decks, and neither is callable from a server:

* **"Grok for PowerPoint"**, the Microsoft 365 add-in. An add-in is a task pane rendered inside
  Office, driven by the user's clicks in a desktop application. There is no server-side entry
  point, no bearer-authenticated endpoint, and no way for our Bun process to invoke it;
* **grok.com generating a downloadable `.pptx`.** That is the consumer chat product — a user
  interface, behind a consumer session, not the developer platform. A product that drove it would
  be scripting someone's website.

Therefore, and state this plainly wherever slides are discussed:

> We generate slide **content** with the chat API as structured JSON under a schema, and we render
> the `.pptx` **ourselves** with a Node library.

The realistic shape: a Grok text model produces structured JSON — an outline, per-slide copy, image
prompts; our renderer turns that JSON into the artifact; Imagine fills the image slots; video fills
motion slots; TTS narrates with per-character timestamps for sync. `pptxgenjs` is the obvious
library for `.pptx` and `docx` for `.docx`; 04-generation picks and pins them, and adding a
dependency means a `package.json` change, which is a hot file (§18.3) and therefore a handoff
request, not an edit.

Video is the opposite case and the contrast is worth keeping in mind: the Imagine video API is
real, documented, priced and callable from a server (§13.2). "xAI can obviously do X in the app"
is not evidence that X has an API. Check `docs.x.ai` and nothing else.

**What to check before anyone revisits this:** whether `docs.x.ai` has added a slides or documents
endpoint, and whether the Microsoft 365 add-in has published anything beyond a task pane. Until
both are answered on the record, the rendering is ours.

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

### 13.9 Software generation, and what `.refs/open-lovable` actually is

Read it before designing §5.2.5. What it does, verified in the clone:

* the model emits **whole files** inside `<file path="…">…</file>` blocks, parsed by a regex at
  `app/api/apply-ai-code/route.ts:32`. That code exists mostly to cope with a stream that stopped
  mid-file: it tracks whether a block had a closing tag, prefers the complete version, prefers the
  longer of two incompletes, and warns on an ellipsis that suggests truncation. **Truncated
  generations are the normal case, not the edge case** — design for them;
* the pipeline is: create sandbox → generate code (stream) → apply files → detect and install
  packages → run the dev server → monitor logs → report errors back into the next prompt. Those are
  literally the route names under `app/api/`;
* **done is a rendered preview, verified by fetching it.** `lib/build-validator.ts` fetches the
  sandbox URL and fails the validation if the HTML still looks like the scaffold's default page
  ("Vite + React", no `id="root"`). That is exactly the discipline of §5.2 — verify the artifact,
  do not believe the report — arrived at independently by another team.

Three places it is **not** a drop-in, and each is a decision 05-software must make and record:

1. **it runs the app in a remote sandbox.** `config/app.config.ts` configures Vercel Sandbox
   (default, 15-minute timeout, workdir `/app`) or E2B (30 minutes, workdir `/home/user/app`).
   That is a third-party dependency and a credential — a §20 stop, not an implementation detail.
   Running the preview locally under the project workspace root is the cheaper first answer;
2. **there is no xAI provider in it.** Its model list is OpenAI, Anthropic, Google and Groq
   (`config/app.config.ts`). Using its model layer means adding a provider; using ours means taking
   the pipeline shape and leaving the model layer;
3. **it also depends on Firecrawl** (`FIRECRAWL_API_KEY`, required) for the scrape-a-site-and-clone
   -its-style path. That path is optional for us and should be dropped rather than credentialed.

---

## 14. The canonical demo

Every surface is checked against this. Each loop document must state what its surface contributes
to it.

```text
The user creates a project: "I need to do this sales presentation."
The brief becomes a design document; the project follows it.

The team is assembled:
  Research  — base Grok             researching, reading the document's brief section
  X         — base Grok             working against the user's X account
  Slides    — Grok + images         generating the slides with Imagine
  Video     — Grok + voice + images generating video assets

The user watches four coloured bars move down the design document.
Every asset the agents produce lands on the ASSETS page.
```

Read against the rest of this contract, the demo exercises: project creation as document creation
(§3.2); the follow relation and its cardinality (D-2); one-click team assembly (§3.3); capability
chosen per agent, two of four agents deliberately unable to spend media money (§9.1); four coloured
work areas with enforced boundaries (§7); line-level presence driving the highlighting, with an age
on every row (§4.4); the ASSETS page as the place everything lands (§5.2); asset persistence on
receipt, because two agents are producing media behind temporary URLs (§13.4); slides rendered by
us because there is no slide API (§13.5); and a running cost figure that is not $0.00 (§9.2).

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

**2. `grok --common_version` cannot be a flag inside `grok`.** The `grok` binary is a separate Rust
program; `.refs/grok-build` is a read-only upstream mirror that refuses external contributions, and
this repository does not build it.
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
*Consequence:* slide, table and document generation are entirely our code (§13.5). Any plan that
budgets this as an integration is wrong by an order of magnitude. See entry 22 for the two
surfaces that make it look otherwise.

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
`ApprovalQueue` have zero production callers; `server/hooks/shellSafetyHook.ts` is never installed
by this repository and only sees shell commands.
*Consequence:* §7.2. Worktrees made out-of-bounds edits recoverable, never impossible. Removing git
removes the safety net, and the enforcement has to be built for the first time.

**13. The suggestion half already works.** `DesignSuggestion`, `submit_design_suggestion`,
baseVersion/stale conflict detection and `client/src/control-room/ReviewQueues.tsx` are the
boundary-suggestion mechanism, complete.
*Consequence:* reuse it; add `targetAreaId` and a line range (§8). Do not design a new one.

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

**22. The two surfaces that appear to generate decks are user interfaces, not APIs.** The "Grok for
PowerPoint" Microsoft 365 add-in is a task pane inside Office, driven by a human clicking in a
desktop application. grok.com producing a downloadable `.pptx` is the consumer chat product behind
a consumer session. Neither is a bearer-authenticated endpoint and neither can be called from a
server; nothing on `docs.x.ai` generates a slide.
*Consequence:* §13.5. Slide content is generated as structured JSON through the chat API and the
`.pptx` is rendered by our own Node code. Any loop document that says "delegate the deck to Grok"
is describing something that cannot be built. Contrast video, where the API is real (§13.2) — the
existence of a capability in xAI's products says nothing about the existence of an endpoint.

**23. A design document is not a document asset, and the difference is the product.** The brief
uses "document" for both. They are different objects with different stores, pages and write rules
(§4.1).
*Consequence:* one page for each (§5.2, §5.3), and no shared model between them. Slides and tables
are rendering targets and declare nothing; only a design document defines a project.

**24. `.refs/open-lovable` is a reference, not a dependency.** It runs generated apps in a remote
Vercel or E2B sandbox on a 15–30 minute timeout, has no xAI provider in its model list, and
requires a Firecrawl key.
*Consequence:* take the pipeline shape and the preview-is-the-evidence discipline (§13.9); take
neither its sandbox nor its model layer without an explicit decision, because both are credentials
and one is an outward-facing third party (§20).

---

## 16. What the retired product proved, and what carries over

This is a re-founding, not a restart. The control room reached 52 of 52 checklist items with
recorded evidence, a 715-test gate, two typechecks, a production build and four audits. What it
proved is worth more than what it built.

What it proved, and what carries over unchanged:

* **an agent will report work it did not do.** The submission path verifies the claim against the
  artifact and records the discrepancy. That discipline becomes §5.2's rule about done;
* **colour is never the sole carrier of meaning.** Every status has a text label, enforced by a
  test. A product whose headline feature is coloured highlighting does not get to trade this away —
  which is why every row in §4.3 carries a word and an age, not just a hue;
* **never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. This is the reason `$0.00 (estimated)` is a bug rather than a cosmetic complaint, and
  the reason stale presence is drawn differently from fresh presence;
* **a suggestion mechanism with provenance works.** Accept / edit / reject / request-revision, with
  the agent's original wording retained after a user amends it (§8);
* **one human approval gate before work starts is the right amount of ceremony.** The plan approval
  gate survives, re-rendered as a sentence rather than a table;
* **deterministic review beats model-generated review for anything that gates publication.** A
  reviewer that returns a different verdict each run cannot gate anything;
* **a briefing must exist on day one.** Before `server/services/taskBriefing.ts` existed, launching
  an agent opened a session, said nothing, and the agent sat idle. §4.4's presence instruction lives
  in that same briefing, and inherits the same lesson: an instruction that is not delivered is not
  an instruction;
* **path canonicalisation is subtle and already solved here.** `assertManagedPath` closes both a
  false-refusal and a false-approval failure mode, each found by a real test;
* **secrets leak further from a shared deck than from a private repository.** The scanner stays,
  and matters more;
* **the identity is not a parameter.** MCP tools bound to one project and one agent at construction
  are why an agent cannot impersonate another, and are the natural home for both the boundary rule
  and `report_document_focus`;
* **coverage of a surface is not coverage of its behaviour.** Modules were reachable but unwired,
  endpoints declared but uncalled, MCP tools advertised but never invoked, events published and
  dropped. Every new surface in this product needs the same question asked of it — including the
  presence tool, which is exactly the shape of thing that gets registered and never called.

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
* a deck or a spreadsheet that defines a project — only a design document declares work (D-4);
* two projects on one design document, and any UI that implies it is possible (D-2);
* presence as a lock, a lease, or an input to any gate (§4.5);
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

## 18. The build order, the worktree partition, and reconciliation

### 18.1 The order is fixed by the owner

The three pages are built and **robustly tested** first. Generation comes after. This is not a
suggestion and no loop document may reorder it.

```text
WAVE 0  Shell and domain re-founding                       07-shell
        Three-column skeleton, routing, the token layer, the vocabulary,
        WorkArea and the capability field. Deletes nothing, breaks
        everything downstream. Do it first and alone.
        Dead-code amputation rides here: the PTY session stack, the Claude
        Code index, the cost cache, the GitHub client, the legacy shell.
        ~4,000 lines, and every later estimate is wrong until it is done.

WAVE 1  The three pages, built and robustly tested
        01-agents        AGENTS, work areas, and boundary enforcement.
                         Nothing above the boundary line is safe until the
                         PreToolUse hook is installed and denying (§7.2).
        02-assets        ASSETS, the asset store, download-on-receipt.
                         The store lands before anything that references an
                         asset — which is why it precedes 04 (§13.4).
        03-design-docs   DESIGN DOCUMENTS: identity, the follow relation and
                         its cardinality (D-2), presence and highlighting.

        This wave is finished when the three pages are green under the full
        gate, not when they render. "Robustly tested" is the owner's word and
        it means the §19 items for these pages carry evidence, not screenshots.

WAVE 2  Everything that makes something
        06-tools-cost    The Tools panel over the existing library API, the
                         cost ledger, the unit-aware rate table, rateKey
                         surfaced, ApprovalQueue wired.
                         FIRST TASK: observe what modelId a live Grok turn
                         reports (§9.2).
        04-generation    The HTTP client, the video job store and poller, the
                         TTS bridge, and OUR pptx/xlsx/docx renderers (§13.5).
                         Slide generation and video generation both live here
                         and both come after wave 1.
        05-software      Software generation, against .refs/open-lovable's
                         pipeline shape and nothing of its infrastructure
                         without a decision (§13.9).

WAVE 3  08-users-x       USERS and X. Secondary pages, merged last.
                         X stays blocked on verified X API facts (§5.5).
```

The dependency that this ordering deliberately accepts: **wave 1 ships before the cost ledger
exists.** The AGENTS page will therefore show cost figures it cannot price. It must show them as
*unknown*, with the model id, and never as `$0.00` (§9.2). That is the honest rendering of the
truth in wave 1, and it becomes a real number in wave 2 without a UI change.

### 18.2 The file partition — this is the authority

Each row is one worktree, one branch, one loop document. Copy your row into your §0.

| id | branch | owns |
|---|---|---|
| 01-agents | `pivot/agents` | `server/services/workArea.ts`, `server/services/boundary.ts`, `server/services/agentTeam.ts`, `server/services/agentRegistry.ts`, `server/routes/agents.ts`, `client/src/control-room/agents/**` |
| 02-assets | `pivot/assets` | `server/services/assetStore.ts`, `server/routes/assets.ts`, `client/src/control-room/assets/**` |
| 03-design-docs | `pivot/design-docs` | `server/services/designDoc.ts`, `server/services/presence.ts`, `server/routes/designDocs.ts`, `client/src/control-room/designdoc/**` |
| 04-generation | `pivot/generation` | `server/services/xai/**`, `server/services/render/**`, `server/routes/generation.ts` |
| 05-software | `pivot/software` | `server/services/software/**`, `client/src/control-room/software/**` |
| 06-tools-cost | `pivot/tools-cost` | `server/services/promptLibrary.ts`, `server/routes/library.ts`, `server/services/usageAccounting.ts`, `server/services/costLedger.ts`, `client/src/control-room/tools/**` |
| 07-shell | `pivot/shell` | `client/src/main.tsx`, `client/src/index.css`, `client/tailwind.config.js`, `client/src/control-room/shell/**` |
| 08-users-x | `pivot/users-x` | `server/services/auth.ts`, `server/routes/users.ts`, `server/services/x/**`, `client/src/control-room/users/**` |
| guide | `pivot/guide` | `docs/USER-GUIDE.md` only, and no code at all |

### 18.3 The hot-file protocol

These files are shared by everyone and **no worktree may edit them directly**, because eight-way
conflicts in them would cost more than all the feature work:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, you do **not** make it. You append a precise request
to `loops/handoff/<your-branch>.md` — a file only you own — stating the file, the exact change, the
reason, and the signature or event shape other worktrees will depend on. A single reconciliation
pass applies every request at the end.

Design your own code so it can be wired in by someone else in **one edit**: export a clean entry
point rather than reaching into the shell. A route module exports a router the mount line names
once. A page exports one component. A set of MCP tools exports one `registerX(server, ctx)`.

Two practical consequences of `server/types/*.ts` being hot:

* declare new types **inside the service file you own** and export them from there. Only a type two
  worktrees both need goes to `server/types/`, through a handoff request;
* a new dependency is a `package.json` change and therefore a handoff request. This catches
  `pptxgenjs`, any xlsx library, and anything 05-software wants for a sandbox.

**Files the partition does not assign.** Several files everybody needs are in no row above:
`server/services/projectMcpServer.ts`, `server/services/acpSessionManager.ts`,
`server/services/taskBriefing.ts`, `server/services/controlRoomEvents.ts`,
`server/routes/projects.ts`, `server/routes/api.ts`, `shared/**`, `scripts/audit/**`. **Treat an
unassigned shared file as hot.** Request the change in your handoff file, name the exact tool,
event member or briefing clause you need, and keep your own side behind an entry point that one
edit can call. This is how `report_document_focus` (§4.4) reaches `projectMcpServer.ts` and how the
presence instruction reaches `taskBriefing.ts` without two worktrees writing the same file.

### 18.4 Reconciliation

Every loop document ends by stating what its worktree hands back: the branch name, the handoff
file, the public contract it added (types, endpoints, events, MCP tools), and anything it had to
assume about another worktree's work.

Merge order:

```text
07-shell  →  01-agents, 02-assets, 03-design-docs  →  04, 05, 06  →  08-users-x
```

The three pages merge before everything that makes something, because the pages are tested first
(§18.1). A worktree in a later wave that assumed a shape from an earlier one and got it wrong
finds out at merge, which is the cheapest place available.

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

#### P-002: A project follows a design document and carries one shared brief

Required result:

* project creation produces or links a design document, and the project follows it;
* the project description reaches every agent's session rules;
* an agent created after the project can quote the brief without being told it.

```text
Document id:
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

* an agent may submit a suggestion naming an area it does not own, or a range of a design document;
* the suggestion carries original text, proposed text, reason and base version;
* the user can accept, edit, reject or request revision;
* an edited suggestion retains the agent's original wording.

```text
Suggestion id:
Target area / line range:
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
* spend can be broken down by agent, by area, by document and by day;
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

#### P-010: Each asset type reaches done by verification

Required result:

* a document, a deck, a table, a workflow and a software preview each reach done;
* each satisfies its §5.2 clauses;
* in each case the evidence is the artifact, not the agent's report;
* a named human approver is recorded on each.

```text
Document:
Slides:
Table:
Workflow:
Software:
Approver:
```

#### P-011: Everything lands on the ASSETS page

Required result:

* every artifact produced by any agent appears on the page without a manual step;
* the page shows which agent is reading or working on each deliverable;
* an artifact created but not committed to version control still appears;
* a component asset (an image, a clip, a narration) is listed with the deliverable that references
  it and with its own cost.

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
* the agent colours in the document gutter remain distinguishable on both grounds;
* no hard-coded dark value survives in the stylesheet.

```text
Light screenshot:
Dark screenshot:
Override behaviour:
Remaining hard-coded values:
```

#### P-014: A new user is greeted and can find out what anything is

Required result:

* first launch shows a greeting that leads to a first design document;
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

* the §14 scenario runs from project creation to assets on the ASSETS page;
* four agents with the stated capabilities are assembled by one click;
* boundaries hold throughout;
* the design document shows all four agents moving through it;
* a non-zero, itemised cost figure is shown at the end.

```text
Steps completed:
Team assembled:
Boundary violations:
Final cost:
```

#### P-016: A document is followed by at most one project

Required result:

* one project follows two documents, and both appear under it;
* a second project attempting to follow an already-followed document is **refused by the API**, not
  by a disabled button;
* the refusal names the project that already follows it;
* releasing the document from the first project is an explicit human action, and is recorded with
  who did it;
* after release, the second project can follow it.

```text
Project A documents:
Refusal observed (endpoint, status, body):
Owning project named:
Release actor recorded:
Follow after release:
```

#### P-017: Presence is line-level, live, and honest when it is not

Required result:

* an agent calling `report_document_focus` moves a coloured bar to the reported lines within one
  refresh;
* two agents on overlapping ranges are both visible and both identifiable;
* an agent that stops reporting decays fresh → stale → expired on the §4.4 schedule, and the rail
  shows an age at every stage;
* an expired agent reads "location unknown", never "idle";
* a report against a superseded document version is shown as stale, not silently remapped;
* no write is refused, and no gate changes, because presence is stale.

```text
Tool calls observed:
Range rendered:
Overlap case:
Decay timings observed:
Stale-version case:
Write attempted while presence expired:
```

#### P-018: Slides are rendered by us

Required result:

* slide content is produced as structured JSON under a schema by the chat API;
* the `.pptx` is produced by our renderer, with the library and version recorded;
* the file opens in a real renderer and its slide count matches the outline;
* no code path attempts to call an xAI slide or document endpoint.

```text
Schema used:
Renderer library and version:
Slide count in outline / in file:
grep for a slide endpoint:
```

#### P-019: Software is done when a preview renders

Required result:

* a generated app builds and serves;
* the preview is fetched and confirmed to be the user's app, not the scaffold's default page;
* a truncated generation is detected and re-requested rather than written half-formed;
* no secret is present, and a named human approver is recorded;
* where a remote sandbox is used, its credential was granted by the user under §20 and is recorded.

```text
Preview URL:
Validation result:
Truncation case:
Sandbox decision and credential:
Approver:
```

#### P-020: The build order held

Required result:

* the three pages were green under the full gate before any generation surface merged;
* the merge order of §18.4 was followed;
* every hot-file change arrived through a handoff file, and no worktree edited one directly;
* every worktree's loop document states what it handed back.

```text
Gate run for wave 1 (date, result):
Merge order observed:
Handoff files applied:
Direct hot-file edits found:
```

---

## 20. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

* an action needs credentials that were not provided — including the xAI credential this machine
  does not currently have (§15.21), which blocks every generation surface, and any third-party
  sandbox or scraping credential §13.9 would require;
* an irreversible or outward-facing operation needs approval: posting to X, sending anything to a
  third party, publishing a deliverable, deploying, running generated code on someone else's
  infrastructure, or spending above the approval threshold;
* deleting tracked files — including `product-design.md` and `verifiables.md`. That decision is the
  repository owner's, and §16 lists what breaks;
* requirements contradict one another, including a contradiction between this contract and a
  sibling loop document in `loops/`;
* a required external service is unavailable, or a documented endpoint behaves differently from
  §13;
* completing one requirement would violate another;
* a change would fall outside your work area (§0), or would touch a hot file (§18.3). File a
  handoff request; do not edit.

A blocker restated across iterations is wasted work. State it once, with evidence, and stop.
