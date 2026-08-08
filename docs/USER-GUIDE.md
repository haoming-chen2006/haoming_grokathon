# grok-workspace — User Guide

Every page, every panel, every control, written for someone who has never used a developer tool.
Read it end to end once; after that use the section for the page you are on.

This file is also the source text for the in-app welcome guide. The **What it does** and **When you
would use it** columns of every table below are the copy that goes into the app, word for word, and
the **If you get it wrong** column is the second line of each help popover. Write nothing here you
would not put in front of a user.

| Document | Role |
|---|---|
| `grok-workspace.md` | The product contract, §1–§20. What the system must become. This guide follows it and never contradicts it. |
| `docs/USER-GUIDE.md` | This file. What every control is called, what it does, and what happens if you misuse it. |
| `loopdesign.md` | The house form: voice, loop procedure, evidence standards. Not for users. |
| `loops/*.md` | Eight area loop documents, one per worktree. Not for users. |

---

## Status vocabulary — read this before anything else

Every control in this guide carries one of three tags. A guide that describes unbuilt features as
though they work is how a demo becomes a lie, so the tag is mandatory on every row.

```text
NOW      Built and working today. The words in the row describe a real screen you can open.
PARTIAL  Half exists. The row names what works and what is missing.
PLANNED  Does not exist. The row describes what will be built, so the wording is decided once
         and every worktree uses the same label.
```

When a **PLANNED** control ships, change its tag here in the same commit that ships it. A stale tag
is worse than no tag — `loopdesign.md:203-206` records a summary that read "BLOCKED / 34 of 52" for
twenty-three iterations after the blocker cleared.

---

## 0. Your boundary

**You are in a git worktree, on your own branch, and you are not in the main checkout.** Eight other
agents are working at the same time on sibling branches, each on the slice of the repository
assigned to it by the partition in `grok-workspace.md` §18.2. Your row of that partition is the last
one, and it is the only row that contains no code:

```text
guide     branch pivot/guide     owns: docs/USER-GUIDE.md only, and no code at all
```

### The files you own

```text
docs/USER-GUIDE.md
```

That is the whole list. One file.

### The files you must not touch, and why

Everything else. Not `client/`, not `server/`, not `shared/`, not `scripts/`, not `package.json`,
not `grok-workspace.md`, not `loopdesign.md`, and not a sibling loop document in `loops/`.

The reason is not tidiness. Seven other worktrees are editing the code this guide describes, in
parallel, right now. An edit you make to `client/src/control-room/AgentCard.tsx` conflicts with
01-agents' rewrite of the same surface, and the conflict is discovered at merge, by someone who does
not know why you made it. **You may read everything, and you must** — every claim in this file is
supposed to be checkable against source — but the only thing you produce is prose.

**This document is where user-facing wording is decided.** Other worktrees copy labels from here
rather than inventing their own; that is the whole reason it exists as a separate file. If a button
in the app is called something different from what this file says, one of the two is wrong and the
decision is made here first.

**How to raise a cross-boundary concern.** If reading the code shows this guide describing something
the code cannot do, do not fix the code. Write the discrepancy into §11 with the `file:line` that
proves it, tag the affected row `PARTIAL` or `PLANNED`, and stop. A guide that quietly rewords itself
around a broken feature is how the feature stays broken. This is the same rule the product imposes on
its own agents (§5.7): you may suggest anything, anywhere; you may change only what is yours.

### The hot-file protocol

These files are shared by every worktree and **no worktree may edit them directly**, because
eight-way conflicts in them would cost more than all the feature work:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, you do **not** make it. You append a precise request to
`loops/handoff/pivot-guide.md` — a file only you own — stating the file, the exact change, the
reason, and the signature or event shape other worktrees will depend on. A single reconciliation pass
applies every request at the end.

For this worktree the protocol is nearly vacuous, and that is the point: **a guide that needs a
hot-file change has started writing code and is out of bounds.** The one legitimate case is a label:
if the in-app copy this file decides requires a string constant to move, request it; do not move it.

### What this worktree leaves behind for reconciliation

See §16.

### What this surface contributes to the canonical demo

The demo is: a salesperson creates a project — "I need to do this sales presentation" — a four-agent
team is assembled against a design document, and every asset lands on the ASSETS page. This
document's contribution is that the salesperson can do it without being told what to click, and in
particular that they understand the one idea this product is built on: **the design document is the
interface, not a description of the work.** §10 is that walkthrough, and it is the acceptance test
for the whole guide: if a step in §10 needs a word this guide has not glossed, the guide has failed.

---

## 1. What grok-workspace is, and how you open it

grok-workspace is the common-user face of Grok Build. Grok Build is a tool that engineers run in a
terminal; grok-workspace is the same engine with a screen in front of it, for people who do sales,
marketing and operations rather than code.

### 1.1 The one idea

> You do not open a task board and then consult a document. You open the document, and the work is
> in it.

A **design document** is where you write down what you want. It is not a note to yourself and it is
not a description of a project that lives somewhere else — it *is* the project. Agents read it, work
from it, and appear inside it as coloured bars moving down the lines they are on. Section 5 is the
whole of this idea, and it is the section a new user most needs.

Everything else in this guide serves that. If you read one section, read §5.

### 1.2 The five kinds of thing it makes

The things agents produce are called **assets**, and there are five kinds:

```text
documents    written material — briefs, one-pagers, reports
slides       decks
tables       spreadsheets
workflows    a saved working pattern you can run again
software     websites and apps, described in plain words and built for you
```

Two warnings that save a great deal of confusion later, both spelled out in §5.2:

* a **design document** and a **document asset** are not the same object. One declares work; the
  other is work that came out. They are on different pages;
* generated pictures, clips and narration are **not** a sixth kind. They are pieces that belong to
  one of the five — an image belongs to a deck, narration belongs to a video. Nobody asked for "a
  PNG"; they asked for a deck with a picture on slide 4.

Software is one of the five, not the point of the product. The coding capability is not going away;
it has stopped being the centre.

### 1.3 Opening it

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| `grok --common_version` typed in a terminal | Starts grok-workspace and opens it in your browser. It is not a separate app you install — it is Grok Build with the visual layer turned on. | Every time you want to work. | Nothing bad happens; you get the terminal version of Grok Build, which is the engineers' view. Close it and type the command again with the flag. | **PLANNED** |
| A web address ending `?view=control-room` | Same thing, reached by URL rather than a flag. | Today, this is the only way in. | You land on an older screen called the canvas. There is a small button at the bottom-right that switches between the two. | **NOW** — `client/src/main.tsx:13-15` |

**Honest note about the flag.** There is no `--common_version` flag in Grok Build today, and one
cannot simply be added to it: the `grok` binary is a separate Rust program, mirrored read-only under
`.refs/grok-build`, which this repository does not build and cannot change. The flag has to live in
*our* wrapper — a program of ours, installed on PATH ahead of the real binary, which recognises
`--common_version` and nothing else, starts our server, opens the browser, and forwards every other
argument verbatim to the real `grok` and exits with its exit code. To a user this is invisible and
the wording above stays true. To whoever builds it, it is net-new work, not a one-line addition to
somebody else's program.

### 1.4 Starting a project

**Creating a project is writing a design document.** That is the change a returning user will notice
first. There is no longer a form that asks what kind of work this is; the document says what the
work is, and one project may follow several documents.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **New design document** | Opens an empty document with your cursor in it. | Starting a new piece of work. | Nothing is created anywhere else until you press **Create project** on the strip described below. | **PLANNED** |
| The `project` block | A short block you write near the top of the document naming the project, what kind of thing it makes, a budget, and the areas of work. §5.3 shows one. | Once, when the document is ready to be worked on. | If you misspell a line the strip tells you the line number and the misspelt word, and creates nothing. A budget you thought you set and did not is the expensive version of this mistake, which is why an unrecognised word is an error rather than an ignored line. | **PLANNED** |
| **Create project** on the declaration strip | Reads the block and creates the project, its budget and its work areas, and assembles a team. | When the document says what you want. | This is a human click by design. Nothing is created, no team is assembled and no money is spent until you press it. | **PLANNED** |
| **Project name** | What you will call this in the list. | Always. | Required. | **NOW** in the old form — `client/src/control-room/NewProjectPanel.tsx:83-86` |
| **Objective** (planned label: **What are we making?**) | One line saying what you want. Every agent in the project is given this sentence. | Always. | A vague objective produces a vague plan. This is the shared brief; spend a minute on it. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:96-99` |
| **Budget (USD)** | The most this project may spend before it stops itself. Defaults to 10. | Always — media is expensive, see §3.5. | Too low and work halts mid-deck with a red bar. Too high and a runaway loop can spend real money. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:100-104` |
| **Local repository** | A folder on your computer where the work lives. | Today, required. | The form will not submit without it, and a folder that has since been moved or deleted shows a red strip saying so. | **NOW**, to be replaced by a workspace folder chosen for you — `client/src/control-room/NewProjectPanel.tsx:73-79`; the missing-folder strip is `client/src/control-room/ControlRoomApp.tsx:135-145` |
| **Base branch** | A term from version control. | Never, if you are not an engineer. | Leave it at `main`. | **NOW**, to be removed — `client/src/control-room/NewProjectPanel.tsx:88-91` |
| **Design document** (large text box) | Today: a brief you paste in. Lines written as `- AUTH-01: Login returns a token` become tracked pieces of work. | If you already have a brief. | If your brief is not in that exact list format, the box under it says "No requirements found" and the project starts with nothing to track. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:107-123`; the parser is `shared/designDocument.ts` |
| **Create project** | Creates it and assembles a team. | When the form is filled. | If the team cannot be assembled the project still exists and a red strip explains why; you are not left with a half-made project you cannot see. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:131-139`, `client/src/control-room/useControlRoom.ts:469-484` |

**Why the pasted text box is not the answer.** A pasted blob has no identity. It cannot be followed,
it cannot be highlighted while agents work in it, and it cannot enforce the one-project rule of §5.5,
because there is nothing there to attach a project to. The document has to be an object with a name
and a version before any of §5 is possible.

---

## 2. The greeting and the welcome guide

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **First-run greeting** — a full-screen welcome the first time you open grok-workspace, naming what the product does, the five kinds of asset, where things land, what it costs, and one button | Tells a brand-new user what this is before they see any controls. | Once, automatically. | Skipping is safe. The guide can be reopened from the **?** in the top bar, and the greeting says so on its last line. | **PLANNED** |
| **Show me around** — a short spotlight tour that dims the screen and points at one thing at a time | Names the four or five things that matter, in order. | After your first project exists, not before. | Pressing **Skip** at any point ends it and marks it done. | **PARTIAL** — the mechanism exists and works in `client/src/components/OnboardingTour.tsx`, but it is only ever mounted by the old canvas screen (`client/src/App.tsx:812`), so nobody who opens the workspace has ever seen it |
| **?** button in the top bar | Reopens the guide, and offers per-section help. | Whenever you do not recognise a panel. | Nothing; it is read-only. | **PLANNED** — `client/src/components/HelpModal.tsx` is a usable shell but its content is a keyboard-shortcut table, which is exactly the wrong content for this audience |
| **?** on each panel | Opens a small explanation of just that panel, taken from this file. | When one panel confuses you, rather than the whole app. | Nothing. | **PLANNED** |

**Two traps to avoid when building this.**

The old tour records "done" under a single setting called `tourCompleted`
(`client/src/components/OnboardingTour.tsx:119, 185`). If the new greeting reuses that name, then
anyone who ever finished the old canvas tour will never see the new greeting — and the failure is
silent. The new greeting needs its own setting name. The server stores settings as free-form keys
(`server/routes/api.ts` `/settings`), so a new name costs nothing.

The spotlight tour finds each step by looking for an element in the page and **skips any step whose
target is missing**. On a fresh install with no project, most targets are missing, so the tour would
skip every step, mark itself complete, and never appear again. The greeting is a plain full-page
screen for that reason; the spotlight comes after the first project exists.

---

## 3. The AGENTS page

This is the page you spend most of your time on. It is the current control room, re-founded.

An **agent** is a worker. It has a name, a job, one **work area** it is allowed to change, a
**capability** that decides what it can make, and a running cost. Agents mostly just talk — to you
and to each other. There is no elaborate machinery behind them and there is not meant to be.

### 3.1 The top bar

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| Project name, and the objective under it | Tells you which project you are looking at. | Glance. | — | **NOW** — `client/src/control-room/ProjectHeader.tsx:57-66` |
| Project dropdown (appears only when you have more than one project) | Switches project. | Moving between jobs. | Your previous project keeps running; switching does not stop anything. | **NOW** — `client/src/control-room/ProjectHeader.tsx:75-93` |
| **New project** | Starts §1.4. | New piece of work. | Escapable — **← Back to \<project\>** at the top of the form. | **NOW** — `client/src/control-room/ProjectHeader.tsx:94-101` |
| Green progress bar and **"37% · 3/8 pieces"** | How much of the work is finished. The number is counted from real statuses, not guessed. | Glance. | The word on screen today is "requirements", which is jargon and is being replaced with "pieces". | **NOW** — `client/src/control-room/ProjectHeader.tsx:104-122` |
| **est. $1.42 / $10.00** | What this project has spent, against its budget. **est.** means estimated. | Constantly, once media agents are running. | See §3.5. Today this figure is very probably wrong. | **NOW** — `client/src/control-room/ProjectHeader.tsx:124-147` |
| **"2 working · 1 waiting"** | How many agents are busy and how many are stuck waiting for you. | Glance. | — | **NOW** — `client/src/control-room/ProjectHeader.tsx:149-151` |
| **"3 reviews pending"** / **"1 suggestion pending"** | Something needs your decision. | Click through to §3.6. | Ignoring these stalls the project — agents wait. | **NOW** — `client/src/control-room/ProjectHeader.tsx:153-162` |
| **Pause All** | Pauses every agent in the project at once. | Something looks wrong and you want everything to stop while you read. | It stops everything with no confirmation step. Nothing is lost — each agent resumes from where it was — but a long generation in flight is interrupted. A confirmation is planned. | **NOW** — `client/src/control-room/ProjectHeader.tsx:164-171` |

### 3.2 The message strip

Messages appear as a coloured strip under the top bar.

| On screen | What it means | What to do | If you ignore it | Status |
|---|---|---|---|---|
| **Grok Build is not installed / not runnable** | The engine is missing. | Follow the message; it names the command. | Nothing will run at all. | **NOW** — `client/src/control-room/SetupBanner.tsx` |
| **The project was created, but its agent team could not be set up** | You have a project and no workers. | Create the team by hand, or recreate the project. | The project cannot do anything. | **NOW** — `client/src/control-room/ControlRoomApp.tsx:116-133`, dismissible |
| **This project's folder is missing** | The folder the project points at has been moved or deleted. | Restore the folder, or make a new project. | Nothing can be planned or started. | **NOW** — `client/src/control-room/ControlRoomApp.tsx:135-145` |
| **Spending approaching its limit: $8.10 of $10.00** (amber) | A warning, before the cap. | Raise the budget, or let it finish. | It will become the red one. | **NOW** — `client/src/control-room/ControlRoomApp.tsx:157-184` |
| **Budget reached — execution paused at $10.00 of $10.00** (red) | Work has already stopped. | Raise the budget to continue. | Nothing further happens. A warning never overwrites this red message — a stop cannot be downgraded by a later warning. | **NOW** — same lines; the ratchet is `client/src/control-room/useControlRoom.ts:304-311` |
| **Sign-in needed** | An agent stopped because a credential is missing. | The message names how to sign in. | That agent stays stopped. | **NOW** — `client/src/control-room/ControlRoomApp.tsx:188-211` |

**Known problem, being fixed.** Up to six of these strips can stack at once, all in 11px red text
(`client/src/control-room/ControlRoomApp.tsx:114-211`). On a fresh install with nothing configured,
the first thing a new user sees is a wall of red. The replacement is one notification area with
icons, one line of plain language each, and a count. **PLANNED.**

### 3.3 The work-area board

Today this is a grid of cards, one per agent. It is being rebuilt as coloured area rows.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Area colour** — a coloured bar down the left of the row | Tells you at a glance which agent owns which part of the work. The same colour is the agent's bar in the design document (§5.6). | Constantly. | Colour is never the only signal: every area also carries a name and a shape, and every status carries a word. Do not let anyone reduce these to bare colour swatches. | **PLANNED**. The field already exists and nothing writes it (`server/types/agent.ts:114-115`) |
| **Name** and **job** ("Ada · Slide Designer") | Who this is. | Constantly. | — | **NOW** — `client/src/control-room/AgentCard.tsx:42-48` |
| **Capability badge** — Grok / +images / +voice / +voice+images | What this agent is able to make, and therefore the most it can cost. | Every time you look at a spend figure. | See §3.5. This badge is the money control. | **PLANNED** |
| **Status chip** — Working / Waiting / Blocked / Idle / Done / Failed | What state the agent is in. Every status carries a **word**, never a colour alone. | Constantly. | Do not let anyone "simplify" these into bare colour swatches; the text is the accessible carrier of meaning (`server/types/agent.ts:7-11`). | **NOW** — `client/src/control-room/AgentStatusBadge.tsx` |
| **What it is doing**, one sentence | Plain-language status detail, including which design document it is in and which lines it last reported. | Constantly. | If the server did not supply one, the line is simply absent — the app never invents a plausible-looking status. | **NOW** for the sentence (`client/src/control-room/AgentCard.tsx:52-56`); **PLANNED** for the document and lines |
| **Cost $0.42**, with units beside it — "12 images · 1 video 8s" | What this agent has spent, and on what. Media is priced per image and per second, so the units are what let you sanity-check the money. | Whenever a media agent is running. | See §3.5. A figure whose price is unknown reads **price unknown**, never `$0.00`. | **PARTIAL** — the figure exists (`client/src/control-room/AgentCard.tsx:72`); the units and the honest unknown do not |
| **Blocked: …** amber banner | The agent has hit something it cannot decide alone. | Read it and answer. | The agent waits indefinitely. | **NOW** — `client/src/control-room/AgentCard.tsx:75-82` |
| **Open Session** | Opens the conversation with that agent (§3.4). | To ask it something, or to see what it has been doing. | Harmless. | **NOW** — `client/src/control-room/AgentCard.tsx:85-92` |
| **Pause** | Stops this agent where it is; it can resume. | You want to read before it goes further. | Safe and reversible. | **NOW** — `client/src/control-room/AgentCard.tsx:93-100` |
| **Stop** | Ends this agent's session. | It is doing the wrong thing. | Work already saved is kept; work in flight is lost. **Pause** and **Stop** sit side by side with no confirmation on either — they are being merged into one control with a confirm. | **NOW** — `client/src/control-room/AgentCard.tsx:101-108` |
| **Command · Tool · Task · File · Branch · Worktree · Tests** | Eight rows of engineer's detail in a fixed-width font. | Never, if you are not an engineer. | Nothing — they are read-only. Six of the eight are being removed. | **NOW** — `client/src/control-room/AgentCard.tsx:58-73` |
| **Canvas** — the same cards, draggable | Lets you drag cards around; positions are saved. | Not useful today. | It is the same information twice, and the connecting lines between cards are hidden by a stylesheet rule. Being removed. | **NOW** — `client/src/control-room/AgentCanvas.tsx`, lines hidden at `client/src/index.css:96-103` |

### 3.4 Talking to an agent

Clicking **Open Session** slides a panel in from the right.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| Transcript | Everything the agent has said, thought and done, newest at the bottom. Entries are labelled **You / Agent / Thinking / Tool / System**. | To understand a decision. | — | **NOW** — `client/src/control-room/SessionDrawer.tsx:116-146` |
| **State** chip — Starting / Ready / Working / Paused / Stopped / Failed | Whether it can hear you right now. | Before you type. | — | **NOW** — `client/src/control-room/SessionDrawer.tsx:96-98` |
| Message box and **Send** | Sends the agent an instruction mid-work. | Redirecting it. | **Send** is disabled while the agent is Working, Paused, Stopped or Failed, and hovering it says why. A paused agent must be resumed before it can hear you. | **NOW** — `client/src/control-room/SessionDrawer.tsx:149-173` |
| **Pause** / **Resume** | Same as on the tile. | — | Reversible. | **NOW** — `client/src/control-room/SessionDrawer.tsx:174-193` |
| **Stop** | Ends the session. | — | Not reversible. | **NOW** — `client/src/control-room/SessionDrawer.tsx:195-203` |
| **✕** | Closes the panel; the agent keeps working. | — | Closing is not stopping. | **NOW** — `client/src/control-room/SessionDrawer.tsx:99-107` |

### 3.5 Capability, and why it is the money control

**Capability is chosen when an agent is created, and it is the single most important choice on this
page.** It decides which tools the agent may use — and therefore the most it can possibly cost.

| Capability | What the agent can make | Cost, per unit | Status |
|---|---|---|---|
| **Grok** (base) | Text and reasoning only. Writes, plans, edits, reviews. | Text only. **Cannot run up a media bill at all.** | **PLANNED** as a choice; text agents are what exists today |
| **Grok + images** | Everything above, plus generated pictures. | $0.02 per image, or $0.05 per image at the higher quality setting. Up to 10 images per request; 5 requests per second, and that limit does not rise no matter how much you spend. | **PLANNED** |
| **Grok + voice** | Everything base, plus spoken narration and transcription. | Narration $15.00 per million characters — roughly 9 cents for a ten-minute script. Transcription $0.10 per hour. Live back-and-forth speech $0.05–$0.08 per minute. | **PLANNED** |
| **Grok + voice + images** | Everything, including video. | Video is $0.050 per second, or $0.080 per second on the newer model. Clips are 1–15 seconds, 8 by default. Video comes with its own soundtrack by default. | **PLANNED** |

```text
A 60-second generated experience costs roughly $5.52 in media alone.
A text conversation turn costs a fraction of a cent.
That is three orders of magnitude. One careless retry loop is a $50 mistake.
```

That arithmetic is why capability is a budget control and not a feature flag, and why the guide tells
you to give an agent the least capability that does its job. An outline writer does not need image
capability. A copy editor does not need voice.

**Capability cannot be granted later, and nothing you send an agent can extend it.** If you inject a
skill that says "generate an image" into a base-Grok agent, nothing changes: a skill is text, and
text cannot grant a tool. To get a more capable agent you create one. The Tools panel says this at
the moment you inject (§8).

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Assemble a team** — one button on a project with no agents | Creates a team suited to the project description and the areas named in the design document. | Right after creating a project. | You get a generic team. Remove agents you do not need — an unused image-capable agent costs nothing until it runs, but it is one more thing that can. | **PARTIAL** — a team of five fixed engineering roles is seeded automatically at project creation (`server/services/agentTeam.ts:11-17`); there is no button, no choice, and the roles are Planner / Backend Engineer / Frontend Engineer / Test Engineer / Reviewer |
| **New agent** | Creates one agent by hand: name, job, capability, work area, spending limit. | Building a team yourself, or adding a specialist. | Giving an agent more capability than it needs is the main way projects overspend. The picker shows the cost class of each option at the moment you choose, not in a settings page later. | **PLANNED** |
| **Spending limit** on an agent | The most this one agent may spend. | Always, on media-capable agents. | Without one, the only backstop is the whole-project budget. The field already exists in the data and is shown nowhere (`client/src/control-room/types.ts:40`). | **PARTIAL** |
| **Work area** on an agent | The part of the project this agent may change. | Always. | See the honest warning below. | **PLANNED** |
| **Where the money went** — a breakdown by agent, by area, by day, by kind of thing made | Understanding a bill. | After any expensive run. | — | **PLANNED**. See §11 item 4: there is no record to build this from yet |

**Honest warning about work areas.** The product says an agent works inside one area, may *suggest*
changes anywhere, and may not *change* anything outside it. The suggesting half genuinely works and
is the best-preserved thing in the product (§3.6). **The not-changing half is enforced nowhere at the
moment a change is made.** Today "isolation" is a folder handed to the agent and nothing more. Two
guards exist and neither is connected to anything: `assertAgentCanWrite`
(`server/services/repository.ts:261`) and the whole approval queue (`server/services/approvals.ts`,
`ApprovalQueue` at `:133`) have zero callers in the running product. A third,
`server/hooks/shellSafetyHook.ts`, is not installed by this repository and inspects only terminal
commands (`SHELL_TOOLS` at `:17`), so a tool that writes a file directly walks straight past it.
Out-of-bounds edits have been *recoverable* — version control made them easy to undo — never
*prevented*. Do not describe boundaries to a user as protection until the enforcement exists.

### 3.6 Decisions waiting for you

Two queues. The first is the one that matters most.

**Suggestions** — an agent proposes a change to something outside its own area, including anything in
a design document, which no agent may ever write directly.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| The suggestion, showing the old text in red and the proposed text in green, with the agent's reason | Shows exactly what would change. | Every suggestion. | — | **NOW** — `client/src/control-room/ReviewQueues.tsx:57-100` |
| **Out of date** amber tag | The document changed after the agent wrote this suggestion, so it may no longer make sense. | Read the current text before accepting. | Accepting an out-of-date suggestion can undo someone else's edit. | **NOW** — `client/src/control-room/ReviewQueues.tsx:65-70` |
| **Accept** | Applies it. | You agree. | It becomes a new version of the document; the previous version is kept. | **NOW** — `client/src/control-room/ReviewQueues.tsx:140-148` |
| **Edit** | Lets you change the wording, then **Save** or **Cancel**. | Right idea, wrong words. | The agent's original wording is kept alongside yours, so you can always see what it actually proposed. | **NOW** — `client/src/control-room/ReviewQueues.tsx:83-96, 118-136` |
| **Reject** | Declines it. | You disagree. | The agent is told. | **NOW** — `client/src/control-room/ReviewQueues.tsx:149-156` |
| **Ask for a revision** with a note | Sends it back with an explanation. | Nearly right. | Leave the note empty and the agent gets no guidance — the note is the entire point of this button. | **NOW** — `client/src/control-room/ReviewQueues.tsx:104-116, 168-175` |

**Reviews** — the second queue. Today it shows branch names, test counts and a line-by-line
difference view (`client/src/control-room/ReviewQueues.tsx:244-320`,
`client/src/control-room/DiffView.tsx`). For a non-technical user this is unreadable and it does not
survive as a user-facing surface. Its replacement is a **preview**: see the actual slide, open the
actual spreadsheet, hear the actual narration, load the actual app, then **Approve** or **Send
back**. **PLANNED.**

One thing in that queue is worth keeping in plain sight: when an agent's own account of what it
produced does not match what actually exists, the queue says so
(`client/src/control-room/ReviewQueues.tsx:286-294`). The principle survives into the new world —
**check what was produced, do not take the agent's word for it** — and it is the rule every asset's
definition of finished obeys (§4.2).

### 3.7 Starting work

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Generate plan** | Asks a planning agent to read the brief and propose the pieces of work. Takes about a minute and costs a little. | Once, after creating a project. | If it cannot produce a usable plan it says so rather than silently producing an empty one. | **NOW** — `client/src/control-room/PlanPanel.tsx:48-63` |
| **Draft** / **Approved** chip | Whether the plan has your approval. | Glance. | — | **NOW** — `client/src/control-room/PlanPanel.tsx:78-85` |
| **Approve Plan** (planned label: **Start work**) | Your permission for agents to start. | After reading the proposed work. | **This is the one decision the product insists a human makes.** Nothing runs before it. Read the list first. | **NOW** — `client/src/control-room/PlanPanel.tsx:91-100`, gate note at `:103-108` |
| Owner dropdown on an unassigned task | Chooses which agent does it. | When a task says "unassigned". | A task with no owner cannot start; the **Launch** button stays greyed and hovering it says why. | **NOW** — `client/src/control-room/PlanPanel.tsx:158-179` |
| **Launch** | Starts that piece of work. | After approving. | It refuses, with the reason on hover, when: the plan is not approved; something it depends on is unfinished; nobody owns it; it is already done. A control that explains its refusal teaches the rule. | **NOW** — `client/src/control-room/PlanPanel.tsx:184-193` |

Planned wording: this whole panel becomes one **Start work** confirmation showing the proposed team
and the proposed pieces, not a table of task identifiers and dependency codes. The gate itself
survives unchanged — one human approval before anything runs is the right amount of ceremony, and the
retired product proved it.

---

## 4. The ASSETS page

Everything your agents produce, in one place.

**Status: PLANNED in full. Nothing on this page exists today.** The nearest thing that exists is a
file listing on the server that shows only files version control already knows about
(`server/services/repository.ts:403-419`) — which means a picture an agent just generated would be
invisible. In a product whose whole job is generating files, that is a correctness bug, not a
limitation, and it is why this page needs a real store rather than a directory listing.

### 4.1 The shelf

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **The shelf** — a grid of items with previews, grouped by kind (Documents / Slides / Tables / Workflows / Software) | Everything this project has made. | Constantly. | — | **PLANNED** |
| **A coloured dot with an agent's name on an item** | That agent is writing this item right now. It comes from the write itself, not from the agent saying so. | To see where the team's attention is. | This is a *writing* signal only. Nobody is ever shown as "reading" an asset — that would be a guess. Reading is shown in a design document, where agents are required to report it (§5.6). | **PLANNED** |
| **Open** | Opens the item as itself — a document in a reader, a deck as slides, a table as a grid, an app as a running preview. | Reviewing work. | Opening never changes anything. | **PLANNED** |
| **Preview not available yet** with a reason | Some kinds cannot be previewed until their renderer is built. The box says which reason. | While the product is being built. | An empty preview box with no explanation is indistinguishable from a broken one, so the page never shows one. | **PLANNED** |
| **Version history** | Every previous version, with who or what changed it and a one-line summary. | Something got worse. | You can always go back. The version-and-conflict machinery this rests on already exists and works (`server/types/project.ts:49-58`). | **PARTIAL** — the machinery exists, for one pasted brief only |
| **Publish** | Promotes an agent's approved work into the finished deliverable. | When a piece is done. | Publishing refuses without a named approver, and refuses when the area produced nothing. If publishing fails halfway, the previous version is restored. | **PLANNED** — the equivalent rules are already enforced for code (`server/services/repository.ts:327-389`) and transfer directly |
| **Download** | Saves the file to your computer. | Sending it to someone. | — | **PLANNED** |
| **Delete** | Removes an asset. | Clearing up. | A user action only. An agent can never delete your work. | **PLANNED** |

### 4.2 The five kinds, and what "finished" means for each

One rule governs all five:

> Finished is verified against the thing itself, never taken from the agent's report of it.

That rule was earned here. The submission path already checks an agent's claimed file list against
what actually changed and records the disagreement, written after a real run in which an agent listed
a file it had never touched.

| Kind | What it is | Finished when | Status |
|---|---|---|---|
| **Documents** | Written material. The most worked-on kind. | The file exists and is not empty; every section the design document asked for has content; no `Lorem`, `TODO` or "coming soon" is left; the secret scanner finds nothing (`server/services/secrets.ts`); a named human approved it. | **PLANNED** |
| **Slides** | A deck. Slides present content; they declare nothing. | Everything above, plus: the slide count matches the approved outline; every picture on every slide is a file saved on your computer, never a link to where it was generated; the produced `.pptx` opens and reads back the same slide count; if narrated, the narration is within 20% of the intended length. | **PLANNED** |
| **Tables** | A spreadsheet. Same relationship to work as slides: they present, they do not declare. | Everything under Documents, plus: the sheet opens and its column headings match what the design document asked for; every cell that claims a calculated value has one — no formula written as text, no `#REF!`; the row count is reported and matches the source the agent cited. | **PLANNED** |
| **Workflows** | A saved working pattern you can run again — a loop, a loop that improves its own output, a loop that may add goals to its own instructions. | The pattern is valid before it is ever run; one recorded run reached an end state, with its stages and how many helper agents it used; the run's spend appears in the same place as every other spend. | **PLANNED** |
| **Software** | Websites and apps, described in plain words and built for you, in the manner of Lovable. | The app builds and **a preview renders**; the preview is checked by loading it and confirming it is your app and not the starter template's default page; the checks the agent says it ran are confirmed; no secret is present; a named human approved it. | **PLANNED** |

**Why the software test is "a preview renders" and not "the tests pass".** A passing test count is
evidence an engineer reads. A rendered page is evidence you read. The reference implementation this
is modelled on (`.refs/open-lovable`) reached the same conclusion independently: it fetches the
running app and fails the check if the HTML still looks like the starter template
(`lib/build-validator.ts:35-45`). It is also worth knowing, if you are watching an app being built,
that **a generation stopping half-way through a file is normal, not exceptional** — that reference
implementation spends most of one file coping with it — so an app that appears briefly broken during
generation is expected, and an app still broken when the agent says it is done is not.

### 4.3 What every asset tells you about itself

Four questions, answered without your asking:

```text
who made it        the agent, recorded by the system, never taken from prose
with what          its capability: base / +images / +voice / +voice+images
what it cost       the individual charges, not a running total
what asked for it  the design document and the lines that declared it
```

The last one goes out of date honestly. If the design document has changed since the asset was made,
the line reads "declared by lines 40–52 of *Q3 deck brief*, as of version 7 — the document has since
changed". It does not quietly re-point at whatever is on line 40 now. A re-pointed reference that
guesses wrong is worse than an old one that says it is old.

### 4.4 Three rules this page makes visible

**A generated picture or video is only yours once it is on this page.** When Grok Imagine makes an
image or a video, it hands back a temporary web address that stops working. Anything that stores that
address instead of the file has lost the asset. For a user, the rule reads: *if it is on the shelf, it
is saved; if it is only in a conversation, it is not.*

**Nothing generates a deck, a document or a spreadsheet for us.** There is no xAI slide-generation
service, no document-generation service and no spreadsheet service. None. A text model writes the
structured outline and the copy, Imagine fills the picture slots, narration fills the audio, and **our
own code assembles the file**. §11 item 1 names the two things that make it look otherwise. Anyone who
goes looking for a "make me a PowerPoint" endpoint is looking for something that does not exist.

**A design document is not on this page**, and a user will ask why. The answer the interface must
actually give: *this is where you say what you want; the Assets page is where what you asked for
lands.* You can send a design document here as a document asset — a one-way copy, with a record of
which version it was copied from — but the copy is a photograph, not a link. It does not update, and
editing it does not change the original.

### 4.5 The quick tree

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Files** — a folding tree of your assets and the files inside them | Shows what is actually there. | Checking that something was really produced; finding a stray file. | — | **PLANNED** |
| **Agent markers on files** | Which agent is writing which file. | Seeing multi-agent activity at a glance. | — | **PLANNED** |
| **Click a file to view it** | Opens the contents. | Checking. | — | **PLANNED** |
| **Edit and Save** | Changes a text file directly. | A one-word fix that is not worth asking an agent for. | Your edit goes through the same versioned path an agent's does, so if an agent changed the file while you were typing you are told, loudly, instead of one of you silently overwriting the other. | **PLANNED** |
| **"Showing 500 of 1,240"** | The list is capped. | — | Without this line, a truncated list looks like a complete one. The cap and the truncation flag already exist on the server and are rendered nowhere. | **PLANNED** |

**Two correctness traps for whoever builds this.** Every path a screen sends to the server must go
through the existing path check (`server/routes/repository.ts:59`, with `canonical` at `:44`), which
resolves symbolic links before deciding. It exists because both failure directions have actually
happened: refusing a legitimate path on macOS, and approving a link that pointed outside the project.
It is the best code in the repository for this job; do not write a second, weaker one. And a
directory browser already exists at `/api/browse` (`server/routes/api.ts:64`) with **no path
confinement at all** — it will list any directory on the machine. It must not be the basis of a file
tree.

---

## 5. The DESIGN DOCUMENTS page

**Read this section even if you skip the others.** It is the part of the product that is not obvious,
and the part that is not like anything else you have used.

**Status: PLANNED in full.** What exists today is a single plain-text box holding one pasted brief
(`client/src/control-room/DesignDocumentPanel.tsx`). The version machinery under it is real and
reused; everything you see below is not built yet.

### 5.1 The idea, in plain language

In most tools, you write a brief and then go somewhere else to watch the work: a task board, a chat
window, a folder of files. The brief becomes a thing you occasionally go back and read.

Here, the brief is the place you watch the work.

You write a design document. You press one button. A team is assembled against it. And then the
document you wrote fills up with coloured bars in the left margin — one per agent, each in that
agent's colour — sitting on the lines that agent last said it was reading or working from. Under the
document is the agents' conversation about that document. To find out what is happening, you read
what you wrote, and watch it being read back to you.

That is the product. Everything on the AGENTS page and the ASSETS page is a different view of the
same work.

### 5.2 A design document is not a document asset

These are two different objects with the same word in their names, and confusing them is the fastest
way to misunderstand the product.

| | **design document** | **document asset** |
|---|---|---|
| What it is | the interface — where you say what you want | an output — a thing an agent produced |
| Who writes it | you. Agents may only suggest | agents, directly |
| Which page | DESIGN DOCUMENTS | ASSETS |
| Declares work | **yes — it is the only thing that does** | no |
| Live agent presence | yes, at the level of individual lines | only "an agent is writing this", no lines |
| Example | "Q3 renewal deck — brief" | "Q3 renewal deck v4.pptx" |

Two consequences worth stating outright, because they are the rules the rest of the page enforces:

* **only documents declare work.** Slides are a way of showing content. Tables are a way of showing
  numbers. Neither can define a project, and no feature will let them;
* **agents never edit a design document.** Not ever, not with permission, not in an emergency. An
  agent that wants a line changed writes a suggestion and you decide (§5.7). This rule already exists
  in the code and is already correct (`client/src/control-room/DesignDocumentPanel.tsx:14-17`).

### 5.3 A worked example

Here is a complete, short design document for the sales deck in §10. Everything in it is plain
writing except the one fenced block near the top.

````text
# Q3 renewal pitch — Northwind

```project
name: Q3 renewal pitch — Northwind
category: slides
budget: 15.00
areas:
  - Research: the Q2 support numbers and two customer proofs
  - X: recent public context from the customer's account
  - Slides: deck assembly and imagery
  - Video: the opening clip and narration
```

## Audience

The VP of Operations at Northwind. She has seen the Q2 deck. She is renewing under
pressure from finance and needs numbers she can forward without editing.

## What the deck must cover

- the support-response improvement from Q2, with the actual figures
- three customer proofs, at least one in her industry
- pricing framed as total cost, without a price list slide

## What it must not do

- no roadmap slide
- do not name the competitor
````

That fenced `project` block is the only special thing in the file. When you save the document, a
strip appears at the top of the page:

```text
This document declares a project: Q3 renewal pitch — Northwind, slides, 4 areas.   [ Create project ]
```

Press it and the project exists, the budget is set, four coloured work areas are created, and a team
is assembled. Nothing before that click creates anything or spends anything.

If you had typed `bugdet: 15.00`, the strip would instead read:

```text
This document declares a project, but line 6 has an unknown word: `bugdet`.
```

and nothing would be created. **An unknown word is an error, not an ignored line.** A user who writes
`bugdet` and sees no complaint believes they set a budget, and finds out otherwise from the bill.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| The declaration strip | Reads your `project` block continuously as you type, and tells you what it found or what is wrong with it, by line number. | Every time you edit the block. | Reading is automatic and constant. **Creating is a click.** Nothing happens until you press the button. | **PLANNED** |
| **Create project** | Creates the project, the budget and the work areas, and assembles a team. | Once, when the document is ready. | If a line is wrong the button is not offered; the strip names the line instead. | **PLANNED** |
| **Update project** (the same strip, after a project exists) | Applies changes you made to the block — areas added or removed, budget changed — and shows you the difference before applying. | When the shape of the work changes. | An area with an agent working in it cannot be removed silently; the refusal names the agent. | **PLANNED** |
| **name** and **category** | Required. The category is one of documents / slides / tables / workflows / software, and it names what this project makes. | Always. | Leaving either out is an error with a line number. | **PLANNED** |
| **budget** | Optional, and you should set it. | Always, in practice. | Without it the only limits are per agent, and media agents can spend real money quickly (§3.5). | **PLANNED** |
| **areas** | Optional. Each line becomes one coloured work area with one agent and one part of the document. | When more than one person's worth of work is involved. | Leave it out and the whole document is one area with one agent. That is fine for a one-pager and wrong for a deck. | **PLANNED** |

### 5.4 What you see when you open one

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Q3 renewal pitch — Northwind  ·  followed by 1 project  ·  v14  ·  4 here  │
├──────────────────────────────────────────────┬────────────────────────────┤
│  1  # Q3 renewal pitch — Northwind           │  ● Research   reading      │
│  2                                           │    lines 41-58 · 6s ago    │
│  3  ## Audience                              │                            │
│ ▌4  The VP of Operations at Northwind.       │  ● Slides     working      │
│ ▌5  She has seen the Q2 deck.                │    lines 60-74 · 2s ago    │
│  6                                           │                            │
│  7  ## What the deck must cover              │  ● X          working      │
│ ▐8  - the support-response improvement       │    lines 4-5 · 1m ago      │
│ ▐9  - three customer proofs                  │                            │
│ 10  - pricing, without a price list          │  ○ Video      last seen    │
│ …                                            │    lines 80-92 · 6m ago    │
│                                              │    location out of date    │
├──────────────────────────────────────────────┴────────────────────────────┤
│ Slides: I have drafted 8 of 12 image prompts against lines 60-74.         │
│ Research: three proofs found; one is under NDA — see my suggestion.        │
└───────────────────────────────────────────────────────────────────────────┘
```

Three things are on screen at once, and they are the three things §5 promises:

* **which project follows this document**, in the header, with its version and how many agents are
  inside it right now;
* **the agent conversation**, at the bottom — the agents' thread about *this document*, not a global
  log. A message about particular lines appears next to those lines. You can reply, and a reply is a
  message like any other. If an agent gets stuck, its call for help lands here, beside the lines that
  caused it: "Research cannot find a figure for line 47" is actionable; "Research needs you" is not;
* **the coloured bars**, in the left margin — §5.6, which is the part that needs the most honesty.

### 5.5 One project per document, several documents per project

```text
one project  may follow  SEVERAL documents
one document may be followed by  AT MOST ONE project
never two projects on one document
```

In plain terms: a project can be declared across a brief, a style guide and a customer profile — three
documents, one project, one team. But no document is ever shared between two projects.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Follow this document** | Adds an existing document to the project you are in. | A style guide you want this project to work from too. | If another project already follows it you get a refusal naming that project, with a link to open it. The refusal is real, not a hidden button. | **PLANNED** |
| **Release from project** | Detaches a document from the project that follows it, so another project can. | Reusing a brief for the next quarter. | This is a person's decision, recorded with who did it and when. No agent can do it — an agent that could detach a document could detach itself from its own instructions. | **PLANNED** |
| **"Q3 Enterprise Deck already follows this document"** | The refusal you see when you try to follow a document that is taken. | — | It names the other project and offers exactly one remedy: release it there first. | **PLANNED** |

**Why not simply allow two.** The document is where work is declared. Two projects declaring against
one document means two teams, two budgets and two approval identities acting on the same lines, and no
way for you — reading the document — to know whose team a coloured bar belongs to. The one-way rule is
what keeps every highlight on the page unambiguous.

**Deleting a project does not delete its documents.** A design document outlives the project that
followed it. It is where the next project comes from, and losing an hour of writing because a failed
project was cleared up is not a mistake a user forgives.

### 5.6 The coloured bars, and what they honestly mean

This is the mechanism the whole page rests on, and it has one weakness that must be said out loud
rather than designed around.

**How it works.** Agents are required to say where they are. They call a tool —
`report_document_focus` — naming the document, the line range, and whether they are *reading* it or
*working* from it. The instruction to do so is part of the briefing every agent receives when its
session starts, and it says, in substance: report before you first read, report again whenever you
move to a different part, and report again if you have been on the same lines for a while, so the
humans watching know you have not stalled. Reports arrive at least every 10 turns or 90 seconds,
whichever comes first.

**The weakness.** A model can simply forget to call a tool. It will. No amount of briefing makes it
certain. Any product that treats these reports as ground truth eventually shows a confident bar
sitting on line 41 while the agent is somewhere else entirely, and the user correctly concludes the
product is lying.

**So the interface never shows a bar without saying how old it is.** Four states:

| What you see | What it means | Status |
|---|---|---|
| A filled bar, "Research · reading lines 41-58" | Reported less than 90 seconds ago. As close to live as this can be. | **PLANNED** |
| An outlined bar, "Research · last reported lines 41-58, 4m ago" | Reported between 90 seconds and 10 minutes ago. Probably still true. Possibly not. | **PLANNED** |
| No bar, and a line in the list: "Research is working in this document but has not reported which lines" | The agent is alive — its conversation is moving — but it has not said where it is, or the document has changed since it last said. **The product knows it does not know, and says so.** | **PLANNED** |
| Nothing at all | The agent's session ended, or more than ten minutes passed. The bar is removed rather than left frozen. | **PLANNED** |

Three consequences of that design that are worth understanding as a user:

* **when you edit the document, the bars go quiet.** Adding four lines to section 3 moves every line
  number below it, so every reported position is now wrong — not merely old. The bars disappear and
  the strip says the positions are out of date, until each agent reports again. A bar that stayed put
  would be pointing at the wrong paragraph with complete confidence;
* **a bar is not a lock.** Nothing is reserved. Two agents can be on the same lines, and their bars
  stack rather than blending into a third colour nobody can name. You can edit lines an agent is
  reading. Presence never prevents anything and never grants anything;
* **highlighting shows where agents last said they were, not where they provably are.** The page's own
  help text says this in those words. There is a weaker, more reliable signal underneath — when an
  agent reads part of the document through a tool, the system knows which *section* it read without
  needing the agent's cooperation — and that is shown as a section, never dressed up as a line range.
  A section-wide fact labelled "lines 41-58" would be a fabrication.

**Unverified, and someone must check it:** whether Grok's file-reading tool reports a line range at
all in what it sends back. Until a live session is logged and inspected, assume it reports only which
file, which is why the weaker signal is section-level and not line-level.

### 5.7 Suggestions, in the margin

An agent that thinks a line of your document is wrong cannot change it. It writes a suggestion, and
the suggestion appears beside the lines it is about.

Everything in §3.6 applies — before and after text, the reason, **Accept / Edit / Reject / Ask for a
revision**, and the amber **Out of date** tag when the document moved after the agent wrote it. The
only difference on this page is placement: the suggestion sits next to the lines rather than in a
queue, so you can read it against what it proposes to change.

This mechanism already works today and is reused unchanged. It is the strongest thing in the product.

### 5.8 Sending a document to the Assets page

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Export as a document** | Makes a copy of this design document as a document asset on the ASSETS page, recording which version it was copied from. | Sending the brief to a colleague who does not use the workspace. | The copy is a photograph, not a link. It does not update when the design document changes, and editing the copy changes nothing here. There is deliberately no way back — two objects that sync are two objects that will disagree in front of a customer. | **PLANNED** |

### 5.9 The page itself

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| The document list | Every design document you can see, which project follows each, and its version. | Finding your way in. | — | **PLANNED** |
| **New design document** | Starts an empty one. | New piece of work. | Nothing is created elsewhere until you declare a project in it. | **PLANNED** |
| Version number in the header, and **History** | Every previous version of every section, with who changed it and why. | Something got worse. | You can always go back. | **PARTIAL** — the version machinery exists for one pasted brief (`server/types/project.ts:49-58`) |
| A conflict message naming two version numbers | Someone — you in another window, or an accepted suggestion — changed this while you were editing. | — | You are told, with both numbers, rather than one edit silently winning. | **PARTIAL** — the refusal exists (`server/services/projectStore.ts:67-73`); the message does not |
| The secret warning | The document contains something that looks like a password or an API key. | — | It is refused, not saved and quietly flagged. A shared document leaks further than a private folder. | **NOW** on the server (`server/services/secrets.ts`); **PLANNED** as a message you can read |

---

## 6. The USERS page — secondary

**Status: PLANNED in full.** There is no concept of a user account anywhere in the product today — no
sign-in, no people, no permissions. The only identity that exists is a header the server uses to tell
an agent apart from a person (`x-openui-actor-id`, `server/routes/projects.ts:41-42`).

Secondary means the product is coherent without this page and it is built last. It does not mean
half-built.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **People** list | Everyone who can open this workspace. | Setting up a team. | — | **PLANNED** |
| **Invite** | Adds someone. | New colleague. | — | **PLANNED** |
| **Role** — Owner / Editor / Viewer | What a person may do. Owners can change budgets and approve publishing; editors can run projects; viewers can only look. | Always, on invite. | Giving Owner to everyone means anyone can raise the spending limit. | **PLANNED** |
| **Spending limit per person** | The most one person's projects may spend in a period. | Any shared workspace. | Without it, the only limits are per project. | **PLANNED** |
| **Connected accounts** — X, and any other service | Which outside services this person has linked. | Before an agent can post or read on their behalf. | Removing a connection stops any agent relying on it, mid-work. | **PLANNED** |
| **Remove** | Takes someone's access away. | They have left. | Their work stays; their access does not. | **PLANNED** |

Approval identity is already load-bearing elsewhere and this page is where it becomes visible:
publishing refuses without a named approver, and six tools are withheld from agents entirely
(`DELIBERATELY_USER_ONLY`, `server/services/projectMcpServer.ts:696`) so that an agent cannot approve
its own work.

**Unverified, must be checked before this page is designed.** Whether grok-workspace runs on one
person's machine or as something a team signs in to has not been decided, and the answer changes this
page completely. Today it is a local program with no accounts, reachable over the network only if a
host setting is changed. Ask the owner before building.

---

## 7. The X page — secondary

**Status: PLANNED, and the least verified page in this guide.**

The intention: generate material in X's native shapes, generate video for it, and post it.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Connect X account** | Links your X account so an agent can read and post as you. | Once. | Disconnecting stops any agent that was using it. | **PLANNED** |
| **Draft** | Writes posts in X's format and length. | Campaign work. | Nothing is posted from here. | **PLANNED** |
| **Attach generated video** | Uses the same video capability as a voice+images agent. | A post that needs motion. | Video is the most expensive thing in the product — $0.05–$0.08 per second. Check the cost estimate before generating. | **PLANNED** |
| **Post** | Publishes to X. | When you have approved the draft. | **This is outward-facing and cannot be undone from inside the app.** It sits behind an explicit confirmation naming the account being posted to, and it is never something an agent does without a human click. | **PLANNED** |
| **Scheduled** | Posts queued for later. | Campaigns. | A scheduled post still goes out if you close the app, as long as the workspace is running. | **PLANNED** |

**What is not verified.** The research this guide is built on covers xAI's model APIs — images, video,
speech — in detail, and contains **nothing about the X posting API**: no endpoints, no rate limits, no
pricing, no authentication model, no rules on automated posting. Nothing in this repository touches X
either. Every row above is intent, not specification.

Before any of this page is built, someone must check and write down: the exact posting endpoint and
its authentication; the rate limits; the cost, if any; the terms governing automated posting; and
whether video can be attached by upload or only by reference. Do not design around assumptions here.

---

## 8. The TOOLS panel

A panel you can open over any page. It holds three kinds of reusable thing.

```text
prompt     a line of text you reuse — the copy-and-paste kind
skill      a folder of instructions, fronted by a short description that tells an agent
           when the folder is relevant. Can be turned up or down.
workflow   a working pattern — how many times an agent goes round, when it stops,
           whether it is allowed to add goals of its own
```

**Status: PARTIAL, and unusually cheap to finish.** The server behind this panel is built, tested and
mounted (`server/routes/library.ts`, `server/services/promptLibrary.ts`), and **no screen has ever
called it**. Verify before writing more:

```bash
grep -rn "api/library" client/src   # expect: no output, exit 1
```

The panel is a front-end build against a working service, which is much less work than it looks — but
see the mismatches below.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Prompts** tab, list | Your saved prompts. | Finding one. | — | **PARTIAL** — served by `GET /api/library/prompts`, no screen |
| **New prompt** | Saves a piece of text you reuse. It may contain fill-in-the-blanks written as `{customer}`. | Anything you type more than twice. | If you use a blank you did not declare, it is added for you as required — so a typo becomes a required blank rather than silently rendering as a hole in your text. | **PARTIAL** |
| **Use** on a prompt | Asks for the blanks, produces the finished text, and sends it to the agent you have open. | Every use. | Leave a required blank empty and it refuses, naming which one. It never emits a half-filled prompt. Sending it costs one conversation turn, and the panel says so. | **PARTIAL** |
| **Skills** tab, list | Your saved skills. | Finding one. | — | **PARTIAL** |
| **New skill** | Points at a folder of instructions and writes the short description that tells an agent when the folder applies. | Teaching the team something reusable — your pitch structure, your brand voice, your objection handling. | A vague description means the agent never realises the skill applies. The description is the whole discovery mechanism. | **PLANNED** — today a skill is a single block of text with no folder behind it (`server/services/promptLibrary.ts:31-39`) |
| **On / Listed but off / Hidden** on a skill | How available this skill is to agents. Three states, not a dial. | Tuning what a team knows. | Turning everything on fills the agent's instructions with competing rules and it follows none of them well. | **PLANNED** — no such control exists |
| **Assign to agent** | Gives one agent this skill. | Specialising an agent. | The panel tells you which of two things happened: it reached the running agent now, or it will apply when that agent next starts. It never shows a tick that means neither. | **PARTIAL** — assignment works; the honest report does not |
| **Workflows** tab | Your saved working patterns. | — | — | **PARTIAL** |
| **New workflow** | Defines how an agent works: a plain loop, a loop that improves its own output each pass, or a loop that may add goals to its own instructions. | Repeating work with a quality bar. | A loop with no stopping condition and no budget is exactly the runaway that turns $5 into $50. Always set both. | **PLANNED** — today a workflow is a fixed list of stages with no loop of any kind (`server/services/promptLibrary.ts:41-59`) |
| **Edit in place** on any of the three | Changes the saved item without leaving the panel. | Constantly. | **There is no editing and no deleting today** — the store is add-only, and the only way to change an entry is to edit a file by hand. This is the first thing to build. | **PLANNED** |
| **Injecting into a paused agent** | Refused. | — | You are offered **Resume and send**. An injection that fires minutes later, unattended, into an agent with media capability, is a bill nobody watched being run up. | **PLANNED** |

**A skill cannot make an agent more capable.** The panel says this at the point of injection, because
it is the mistake people make: a skill is text, and text cannot grant a tool. A base-Grok agent given
a skill about generating images is still a base-Grok agent. Capability is chosen at creation (§3.5).

**Two things the underlying engine already does, which we should surface rather than rebuild.** Grok
Build has its own skill system — a folder fronted by a SKILL.md, discovered automatically, shown to
the agent as a short listing first and loaded in full only when it applies, with a setting that keeps
a skill listed but inactive, which is exactly "listed but off". It also has real loops, with budgets,
human gates and persistent notes a loop can keep across a run — which is how a loop edits its own goal
document. Building a parallel system alongside these forks away from the engine's own discovery, and
worse, agents would receive every skill twice.

---

## 9. Light and dark mode

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Appearance** — Light / Dark / Match my computer | Switches the whole workspace. | Preference, or a bright room. | Nothing; it is only appearance. Your choice is remembered. | **PLANNED** |

**Status: dark only.** The dark colours are written directly into every screen — around 333 colour
declarations across sixteen files, plus roughly 24 fixed dark colours and 15 forced overrides in
`client/src/index.css`, and `client/tailwind.config.js` has no light/dark switch configured at all.
Light mode is not a setting that has been left off; it is a real piece of work.

Three things a light theme must not break, all of which are already right or already decided:

* every status carries a **word**, not just a colour (`server/types/agent.ts:7-11`). Do not trade the
  word away in the name of making the product "more visual";
* the hidden explanatory text that screen readers read out — for example the full explanation of what
  "estimated cost" means (`client/src/control-room/ProjectHeader.tsx:143-145`) — must survive any
  redesign;
* the agent colours must stay distinguishable **on both grounds**. They are the same colours in the
  agent list and in the document margin, so a palette that works on black and mushes on white breaks
  the headline feature. Check the four default area colours against a light margin before shipping
  either theme.

The underlying engine ships a matched dark and light pair of its own, and porting those two palettes
verbatim is both cheaper than inventing colours and makes the workspace read as the same product as
the terminal it came from.

---

## 10. Your first fifteen minutes

A salesperson, from opening the app to one finished deck. This is the canonical demo, and every
design decision in the product is checked against it.

**Read this first.** As of today, steps 1, 5, 6 and 8 work in some form; steps 2, 3, 4, 7 and 9
describe the product being built. Nobody can currently produce a deck with this tool. The walkthrough
is written in the finished tense because it is the in-app copy; the tags say what is real.

**1. Open it.** Type `grok --common_version`. The workspace opens in your browser.
*(**PLANNED**; today, open the address ending `?view=control-room`.)*

**2. Write down what you want.** Press **New design document**. Write the brief in §5.3 — audience,
what the deck must cover, what it must not do — and put the `project` block at the top: name it "Q3
renewal pitch — Northwind", category `slides`, budget `15.00`, four areas. A strip appears at the top:
*This document declares a project: Q3 renewal pitch — Northwind, slides, 4 areas.* Press **Create
project**.
*(**PLANNED**. Today there is a form with a repository path and a pasted text box; see §1.4.)*

**3. Let it build a team.** The four areas become four agents, each with a colour:

```text
Research   base Grok             reads the brief and finds the Q2 numbers and the proofs
X          base Grok             works against your X account for recent customer context
Slides     Grok + images         assembles the deck and generates the imagery
Video      Grok + voice + images generates the opening clip and the narration
```

Two of the four cost almost nothing to run. The two that can spend real money are the two that make
pictures and video — that is what the capability badge on each row is telling you.
*(**PLANNED**. Today a fixed team of five engineering roles is created for you automatically.)*

**4. Read the plan and approve it.** The workspace proposes the pieces: research, outline, twelve
slides, an opening clip, narration. Read them. Press **Start work**. Nothing has run until this click,
and that is deliberate.
*(**NOW** as a mechanism — `client/src/control-room/PlanPanel.tsx:91-100` — but the plan it generates
today is about code.)*

**5. Watch the document.** Go back to your design document. Four coloured bars are moving down the
left margin — Research on the audience section, Slides on the "what the deck must cover" list — each
with a line range and how long ago it said so. Underneath, the agents are talking about your brief.
This is the screen you leave open.
*(**PLANNED** in full. The AGENTS page shows the same four agents as rows today, without the document
or the lines.)*

**6. Answer the things that stop.** Slides raises a suggestion against line 22: it wants to change the
headline because the number in your brief does not match the number Research found. The suggestion is
sitting next to line 22. Press **Edit**, adjust the wording, **Save**. Video shows an amber **Blocked**
banner asking which of two openings you prefer. Press **Open Session** and reply in one line.
*(**NOW** — this is the strongest part of the product today, though today it lives in a queue rather
than beside the line.)*

**7. Look at the shelf.** Open **ASSETS**. The deck is there with twelve slide previews, the opening
clip, the narration track, and — because Research wrote one — a short one-page summary as a document.
Play the clip. Everything on the shelf is saved to your computer; anything that exists only inside a
conversation is not.
*(**PLANNED** in full.)*

**8. Watch the money.** The top bar reads **est. $6.10 / $15.00**, and the Video row reads
"1 video 24s · 2m narration" beside its figure. The video is most of the money. If it had crossed $12
you would have seen an amber warning strip, and at $15 work would have paused itself with a red one.
*(**NOW** as a mechanism; but read §11 item 4 before you trust the number.)*

**9. Finish it.** On the ASSETS page, open the deck, review each slide, press **Publish**, then
**Download**.
*(**PLANNED**.)*

Fifteen minutes, four decisions: what you want, start work, answer two questions, publish.

---

## 11. Things the owner assumed that are not true

Written down here rather than quietly designed around, because a guide that hides a false assumption
just moves the disappointment later.

**1. There is no slide, document or spreadsheet generator to call, and two things make it look
otherwise.** xAI ships no service that produces a PowerPoint, a Word file, a spreadsheet, a PDF or a
deck. Images and video, yes. Speech, yes. Documents, slides and tables, no.

Two surfaces appear to contradict this and neither is callable from a server:

* **"Grok for PowerPoint"**, the Microsoft 365 add-in. An add-in is a panel rendered inside Office and
  driven by a person clicking in a desktop application. There is no server-side entry point and no
  authenticated endpoint;
* **grok.com producing a downloadable `.pptx`.** That is the consumer chat product — a user interface
  behind a consumer login, not the developer platform. A product that drove it would be scripting
  somebody's website.

So: a text model produces a structured outline and the copy, our renderer turns it into the file,
Imagine fills the picture slots, narration fills the audio. Every estimate for the ASSETS page must be
made on that basis. Video is the opposite case and worth holding in mind for contrast — the Imagine
video API is real, documented, priced and callable from a server. **The existence of a capability in
xAI's products says nothing about the existence of an endpoint.** Check `docs.x.ai` and nothing else.

**2. Grok Imagine does have a proper public API — and the returned files expire.** Images are made at
`POST /v1/images/generations` and cost $0.02 or $0.05 each, up to 10 per request, at 5 requests per
second. Video is made at `POST /v1/videos/generations`, which does not answer immediately: it hands
back a job number that must be polled at `GET /v1/videos/{request_id}` until the status turns from
*pending* to *done*, *expired* or *failed*. Video costs $0.050 or $0.080 per second, runs 1–15 seconds
(8 by default), comes at 480p, 720p or 1080p, and has sound by default. **The web addresses returned
for both are temporary.** Anything that saves the address instead of downloading the file has lost the
asset. That is a hard architectural constraint, and it is why §4.4 tells users an asset is only theirs
once it is on the shelf.

Neither rate limit rises with spending. A deck with 30 images has a floor of six seconds of
serialised requests before generation time is counted at all, so design the progress display for a
queue rather than for a spinner.

**3. Voice cannot be cloned from inside the app.** Speech generation is real (`POST /v1/tts`, $15.00
per million characters), and it can return **timing for every single character**, which is how
narration is synchronised to slides precisely rather than approximately. Transcription is `/v1/stt` at
$0.10 per hour, and live back-and-forth speech is a WebSocket at $0.05–$0.08 per minute. But
**creating a custom cloned voice through the API is available only on an enterprise plan**; on a
standard plan voices are created in xAI's own console, and only within the United States, excluding
Illinois. Do not write a feature that clones a user's voice from the app. Also note that this speech
service is not the OpenAI-shaped one — `/v1/tts` is not `/v1/audio/speech`, and a general-purpose
OpenAI client library cannot call it.

**4. Cost is broken today, not merely shallow.** This is the most important item in this section,
because cost is the pillar the media capabilities rest on.

```text
DEFAULT_RATES  (server/services/usageAccounting.ts:31)  has exactly three entries:
    gpt-4o, gpt-4o-mini, gpt-4.1
There is no Grok model in it. An unknown model returns a cost of $0.00 with the reason
recorded as "no rate" — and that reason is displayed nowhere.
```

So every dollar figure in the shipping product is very probably $0.00, every budget is unreachable,
every budget warning is unfirable, and the user reads "$0.00 (estimated)" as *cheap* rather than as
*we do not know the price of this*. Beyond that: there is **no record of individual charges at all** —
the product keeps running totals only, so there is no history, no breakdown by day or by agent or by
kind of thing made, no export, and therefore no source data for any of the cost views this guide
describes as planned. The input/output breakdown is calculated and thrown away. Two named controls, an
approval threshold for large spends and a retry limit, do not exist in the code at all. Per-task cost
*is* tracked; an older handover note saying otherwise is out of date. And cost cannot be attributed to
an individual tool call, because the engine reports usage once per conversational turn, not per
action — that one is not a gap to close, it is a limit of the transport.

One piece of good news that changes the design: xAI returns the **actual** cost of every image, video
and text request in the response itself. That means the product can distinguish *measured* cost from
*estimated* cost, and should say which it is showing. Voice is the exception — whether speech
responses carry a cost figure is not documented, so voice cost must be calculated from published rates
and labelled as an estimate until someone checks a live response.

**5. Boundaries protect nothing yet.** See the warning in §3.5. The suggestion half works; the
prevention half does not exist. Version control made out-of-bounds edits *recoverable*, and removing
version control removes the safety net, not the enforcement — there was no enforcement. A real
boundary needs either a check that runs before every write, resolves the path fully, and terminates
the action outright — a refusal written into a reply is ignored, because agents run with approvals
turned off — or, better where the thing being made is structured, every change routed through a tool
call that carries the project, the agent and the area with it.

**6. The workspace cannot talk to xAI at all today.** The product speaks one protocol, over a pipe, to
the `grok` program on this machine, and nothing else. There is no web client to `api.x.ai` anywhere in
it. Every capability in §3.5 requires one to be written, plus a credential that is separate from
whatever signs the `grok` program in. Additionally, the media features inside the `grok` program
itself are gated behind a consumer subscription tier and can be switched off remotely in a way local
settings cannot override, which is why the product must call the API directly rather than going
through the program.

**7. Skills and workflows do not mean today what this guide says they mean.** A skill is currently one
block of text with no folder, no discovery description and no on/off state; its `description` field is
stored and read by no code at all, and it is exactly the field that has to become the discovery
prompt. A workflow is currently a fixed list of stages with no loop of any kind and no ability to
change itself. Both are model changes on the server, not screen work. See §8.

**8. The tools panel has never been opened by anybody.** Its server side is complete and tested; no
screen has ever called it. Verify this yourself before estimating — the command is in §8.

**9. A design document is not a document asset, and the brief uses one word for both.** They have
different stores, different pages, different write rules and different kinds of presence (§5.2). Any
plan that treats them as one object builds the wrong product.

**10. Presence is best-effort, and the interface has to admit it.** Agents are required to report the
lines they are on, and a model can forget. Presence therefore never gates a write, never resolves who
owns what, and is never shown without an age (§5.6).

**11. A sibling document is out of date with this one, and reconciliation must settle it.**
`loops/07-shell.md` still describes **four** pages named AGENTS / DOC HUB / USERS / X, and a first-run
greeting naming the old four media ("Documents · Slides · Experiences · Software"). The contract in
`grok-workspace.md` §5 is three headline pages — AGENTS, ASSETS, DESIGN DOCUMENTS — with USERS and X
secondary, and five asset types. This guide follows the contract. The shell worktree's greeting copy
and navigator labels need updating to match; that is not this worktree's edit to make.

---

## 12. The order this is built in

**Fixed by the owner and not negotiable:** the AGENTS, ASSETS and DESIGN DOCUMENTS pages are built and
robustly tested first. Slide generation, workflow and video generation, and software generation come
after. A page that renders is not a page that is finished; this wave ends when those three pages are
green under the full gate, with evidence rather than screenshots.

```text
WAVE 0   The shell           three regions, routing, the colour token layer, the vocabulary,
                             work areas and the capability field. Dead-code removal rides here.

WAVE 1   The three pages     AGENTS (with boundary enforcement — nothing above the boundary
                             line is safe until a write outside an area is actually refused)
                             ASSETS (the store, and saving generated media on receipt — this
                             lands before anything that can generate, because the URLs expire)
                             DESIGN DOCUMENTS (identity, the follow rule, presence, highlighting)

WAVE 2   Everything that     the Tools panel and the cost ledger; the xAI client, the video
         makes something     job queue, the narration bridge and our own deck, spreadsheet and
                             document renderers; software generation.

WAVE 3   USERS and X         secondary pages, last. X stays blocked on verified X API facts.
```

The consequence wave 1 deliberately accepts: **the pages ship before the cost ledger exists.** The
AGENTS page will therefore show figures it cannot price. It must show them as **price unknown**, with
the model named, and never as `$0.00`. That is the honest rendering of the truth in wave 1, and it
becomes a real number in wave 2 with no change to the screen.

Within the user-visible surface, in order, each step here because the step after it is unwritable
otherwise:

1. **The message strip** (§3.2). One notification area replacing six stacked red bars. One file, the
   largest single improvement a new user experiences, and it makes every screenshot after it
   presentable.
2. **The cost rate table** (§11 item 4). Not a screen — but until a Grok turn produces a real number,
   every cost row in this guide is describing a zero. Observe what a live turn reports first.
3. **Light and dark mode** (§9), done as a token layer rather than as a find-and-replace.
4. **The greeting and the per-panel help** (§2), fed from this file. Do this before the pages change,
   so every later change has somewhere to put its explanation.
5. **Capability on agent creation** (§3.5). The money control. It must exist before any media-capable
   agent can be created at all.
6. **The design document surface** (§5), in the order the page itself needs: identity and the follow
   rule, then the reading view, then the declaration strip, then presence and highlighting last —
   because highlighting on a document nothing follows is a decoration.
7. **The ASSETS shelf** (§4), read-only first: show what has been produced, with who is writing.
   Publishing and version history second.
8. **The Tools panel** (§8), starting with editing and deleting, which are the missing halves.
9. **The quick tree** (§4.5), read-only, behind the existing path check. Writing last.
10. **USERS** (§6) and **X** (§7), after the questions in those sections are answered.

---

## 13. What counts as done

Checkable items in the form the project already uses: an id, a required result whose every clause must
be satisfied, a command that proves it, and an evidence form to fill in. A partially-satisfied item is
NOT TESTED, not PASS.

#### UG-001: Every control in the product appears in this guide

Required result:

* every button, input and menu on every page has a row in §1–§9;
* every row names what it is called on screen, exactly as the screen says it;
* every row carries **NOW**, **PARTIAL** or **PLANNED**;
* a control that exists in the code and not in this guide is a failure of this item, and so is a row
  describing a control that no longer exists.

Command:

```bash
grep -rn "onClick\|<button\|<select\|<input" client/src/control-room --include=*.tsx | grep -v test | wc -l
grep -c "^| \*\*" docs/USER-GUIDE.md
```

Evidence:

```text
Controls counted in the code:
Rows in this guide:
Unmatched in either direction:
```

#### UG-002: No row describes an unbuilt feature as working

Required result:

* every row tagged **NOW** can be demonstrated on a running workspace;
* every row tagged **PARTIAL** names precisely which half is missing;
* every row tagged **PLANNED** is written in the same voice as the rest but is unambiguously tagged;
* no row is untagged.

Command:

```bash
grep -n "^| " docs/USER-GUIDE.md | grep -v -- "---" | grep -cv "NOW\|PARTIAL\|PLANNED\|Status\|Kind\|Capability\|design document"
```

Evidence:

```text
Untagged rows:
NOW rows demonstrated:
NOW rows that could not be demonstrated:
```

#### UG-003: Every cited path resolves

Required result:

* every path in backticks resolves from the repository root, with one deliberate exception —
  `loops/handoff/pivot-guide.md`, which §16 names as a file to be created only if needed and states
  that it does not exist;
* every `file:line` citation points at the thing the sentence claims;
* absolute paths appear only inside fenced bash blocks.

Command:

```bash
bun run audit:docs
grep -o '`[a-zA-Z0-9_./-]*\.\(ts\|tsx\|mjs\|js\|json\|md\|css\)`' docs/USER-GUIDE.md | tr -d '`' | sort -u | while read f; do [ -e "$f" ] || echo "MISSING $f"; done
```

Evidence:

```text
Command run:
Unresolved citations:
```

#### UG-004: No unglossed jargon

Required result:

* no word from the glossary in §15 appears in §1–§10 before being glossed;
* the words *worktree*, *branch*, *merge*, *diff*, *token*, *MCP*, *ACP*, *repository* do not appear
  in any user-facing column except where the guide is explicitly naming a control that still uses them
  and saying it is being replaced.

Command:

```bash
awk '/^## 1\./,/^## 11\./' docs/USER-GUIDE.md | grep -n "worktree\|branch\|merge\|diff\|MCP\|ACP\|repository"
```

Evidence:

```text
Terms found unglossed:
```

#### UG-005: The fifteen-minute walkthrough is executable, or honestly tagged

Required result:

* each of the nine steps names the exact control the user presses;
* each step is tagged with what works today;
* the steps that work today can be performed in order without consulting any other document;
* the walkthrough is the canonical demo — a sales presentation, four agents, assets landing on the
  ASSETS page — and no other story.

Command:

```bash
awk '/^## 10\./,/^## 11\./' docs/USER-GUIDE.md | grep -c "(\*\*NOW\|(\*\*PLANNED\|(\*\*PARTIAL"
```

Evidence:

```text
Steps performed:
Steps blocked, and by what:
```

#### UG-006: The design-document section explains the idea to someone who has not heard it

Required result:

* §5 states in plain language, without a file path or a type name, that the document is the interface
  rather than a description of the work;
* §5 contains a complete worked example a user could copy;
* §5 distinguishes a design document from a document asset in a table, and gives the sentence the
  interface itself must say when a user asks why their design document is not on the ASSETS page;
* §5 states the cardinality rule exactly, and names what the refusal says;
* §5 says what the interface shows when an agent stops reporting, in all four states, and says in
  plain words that highlighting shows where agents last said they were.

Command:

```bash
awk '/^## 5\./,/^## 6\./' docs/USER-GUIDE.md | grep -c "at most one\|last said\|has not reported\|location out of date"
```

Evidence:

```text
Plain-language statement located at:
Worked example present:
Four presence states present:
```

#### UG-007: The guide is liftable into the app

Required result:

* the **What it does** and **When you would use it** text of every row is complete prose that stands
  alone without the surrounding table;
* no row's text refers to "the table above", a section number, or a file path;
* every page and panel in the product has a matching section, so the per-panel **?** has a source.

Evidence:

```text
Rows failing the stand-alone read:
Panels with no matching section:
```

#### UG-008: Every correction in §11 is either still true or removed

Required result:

* each of the eleven items in §11 is re-checked against the code each time this file is touched;
* an item that has been fixed is deleted, not left standing;
* an item that is still true carries the `file:line` or the command that proves it.

Command:

```bash
grep -n "DEFAULT_RATES" server/services/usageAccounting.ts
grep -rn "assertAgentCanWrite\|getApprovalQueue" server client scripts --include=*.ts | grep -v test
grep -rn "api/library" client/src
```

Evidence:

```text
Items re-checked:
Items removed as fixed:
```

#### UG-009: The build order in §12 matches the contract

Required result:

* §12 places AGENTS, ASSETS and DESIGN DOCUMENTS before slide, video, workflow and software
  generation;
* §12 states the consequence that wave 1 ships before the cost ledger and says what the screen shows
  in the meantime;
* no step in §12 contradicts `grok-workspace.md` §18.1.

Command:

```bash
diff <(awk '/^WAVE/,/^$/' docs/USER-GUIDE.md | grep -o "^WAVE [0-9]") <(awk '/^WAVE/,/^$/' grok-workspace.md | grep -o "^WAVE [0-9]")
```

Evidence:

```text
Order stated here:
Order stated in the contract:
Differences:
```

---

## 14. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

- **A page's purpose is unclear.** §6 and §7 both contain a question that must be answered before the
  page can be designed: whether this is single-user or multi-user, and what the X API actually
  permits. Guessing produces a guide that has to be rewritten.
- **A fact is needed that the research does not contain.** Everything factual in this guide traces to
  verified research. If a new claim about a price, an endpoint, a rate limit or a permission is
  needed, mark it unverified, name what must be checked, and stop — do not invent an API detail.
- **This guide and the code disagree about what a control is called.** The wording decision is made
  here, but changing the code is another worktree's job. File the discrepancy in §11, do not fix it.
- **This guide and a sibling loop document disagree.** Say so, name the file and line on both sides,
  and hand it to the user. §11 item 11 is one such disagreement, recorded rather than silently
  resolved.
- **A change would fall outside this worktree.** `docs/USER-GUIDE.md` only. Anything else is a
  handoff request.
- **Something outward-facing or irreversible needs approval** — posting to X, publishing, deleting a
  user's work, spending above a threshold. Those are user decisions by design and must never be
  documented as something the product does on its own.
- **Two requirements contradict each other.** "Simpler and more visual" and "every status must carry a
  word, not just a colour" look like a contradiction and are not; if a real one appears, say which two
  rules collide.

---

## 15. Glossary

Words this guide uses, and words it deliberately avoids.

| Word | What it means here |
|---|---|
| **Design document** | Where you write down what you want. The interface, not a description of it. Only a design document can define a project. |
| **Asset** | Something an agent produced: a document, a deck, a table, a workflow or a piece of software. |
| **Document asset** | An asset that is written material. Not the same thing as a design document. |
| **Follow** | A project follows a design document. One project may follow several; a document is followed by at most one project. |
| **Agent** | A worker. It has a name, a job, one area it may change, and a running cost. |
| **Area** (work area) | The part of the project one agent is allowed to change. Shown as a colour, a shape and a name. |
| **Capability** | What kind of thing an agent can make: text only, text plus images, text plus voice, or everything. Chosen when the agent is created; it decides the agent's maximum possible cost and cannot be extended afterwards. |
| **Brief** | The project description every agent in the project follows. One per project. |
| **Presence** | Where an agent last said it was in a design document. Always shown with an age, because a model can forget to say. |
| **Suggestion** | An agent asking your permission to change something outside its own area, including anything in a design document. |
| **Publish** | Moving an agent's approved work into the finished deliverable. |
| **Estimated cost** | A figure worked out from usage at published prices, not a bill. The real charge differs. |
| **Measured cost** | A figure the provider returned with the response. More trustworthy than an estimate. Not yet distinguished in the product. |
| **Price unknown** | What a cost figure says when the price of the model is not known. It never says `$0.00` for that case. |
| **Prompt** | A saved line of text you reuse. |
| **Skill** | A folder of instructions with a short description telling an agent when it applies. |
| **Workflow** | A working pattern: how many times an agent goes round and when it stops. |

Words the product uses today that will not appear in the finished interface, listed so that anyone
reading the current screens knows what they were looking at:

| Word on screen today | What it was, in plain language |
|---|---|
| **Requirement** | One tracked piece of work. Becoming "piece". |
| **Worktree** | A private copy of the project folder given to one agent. Becoming "area". |
| **Branch** | A named line of changes in version control. Disappearing entirely. |
| **Merge** | Folding one agent's changes into the main copy. Becoming "publish". |
| **Diff** | A line-by-line list of what text changed. Becoming a preview of the actual slide, table, document or app. |
| **Token** | The unit a text model is billed in. Never shown to a user; only dollars and units. |
| **Session** | One continuous conversation with one agent. Becoming "conversation". |
| **MCP / ACP** | The two wire protocols the product speaks — one to give agents tools, one to drive the engine. Never shown to a user, and never named in the interface. |
| **Repository** | The folder holding the project's files. Becoming "project folder", and mostly hidden. |
| **Experience** | The old name for voice-and-video output. Gone: media is a component of a deck, a workflow or a piece of software, never a kind of asset on its own. |

---

## 16. Reconciliation — what this worktree hands back

**Branch:** `pivot/guide`

**Handoff file:** `loops/handoff/pivot-guide.md`, created only if it is ever needed. It does not exist
today and that is the correct state: this worktree ships no code and therefore has no hot-file change
of its own. The one legitimate reason to create it is a label decision that requires a string constant
to move.

**Public contract added:** none in code. What this worktree publishes is **the wording**, and other
worktrees are expected to take it verbatim:

| What | Where it is decided | Who consumes it |
|---|---|---|
| Page names — AGENTS, ASSETS, DESIGN DOCUMENTS, USERS, X | §1, §3–§7 | 07-shell (navigator labels), all page loops |
| The five asset type names, in order | §1.2, §4.2 | 02-assets, 04-generation, 05-software |
| The four capability labels and their cost classes | §3.5 | 01-agents, 06-tools-cost |
| The four presence states and their exact user-facing wording | §5.6 | 03-design-docs, 01-agents |
| "price unknown", never `$0.00` | §3.3, §11 item 4, §12 | 01-agents, 06-tools-cost |
| The three skill states — On / Listed but off / Hidden | §8 | 06-tools-cost |
| The declaration-strip sentences, including the error form | §5.3 | 03-design-docs |
| The cardinality refusal sentence | §5.5 | 03-design-docs |
| The first-run greeting's five lines | §2 | 07-shell |
| Glossary, and the retired-word list | §15 | every worktree writing user-facing copy |

**What this worktree assumed about other worktrees' work**, to be confirmed at reconciliation:

* **03-design-docs** — that the presence tool is called `report_document_focus`, that the three live
  states are separated at 90 seconds and 10 minutes, and that a document edit drops reported positions
  to unknown immediately. §5.6 describes all three to the user. If any threshold changes, §5.6 changes
  with it;
* **03-design-docs** — that the project declaration is a single fenced `project` block with `name`,
  `category`, `budget` and `areas`, that an unknown key is an error with a line number, and that
  applying it is a human click. §5.3 is a worked example a user will copy verbatim;
* **02-assets** — that the agent marker on an asset comes from the write itself and means *writing*
  only, never *reading*. §4.1 tells users that in those words;
* **01-agents** — that capability is fixed at creation and that injection reports
  `capabilityChanged: false`. §8 tells users a skill cannot make an agent more capable;
* **06-tools-cost** — that an unpriced charge renders as "price unknown". §3.3 and §12 both promise it;
* **07-shell** — that the navigator carries three headline pages and two secondary ones. The shell loop
  document currently says four pages and the old four media; §11 item 11 records the disagreement
  rather than resolving it here.

**Merge order:** this worktree merges wherever it is convenient — it touches one markdown file and can
conflict with nothing. The code merge order is 07-shell, then 01/02/03, then 04/05/06, then 08.
