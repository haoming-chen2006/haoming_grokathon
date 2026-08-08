# grok-workspace — User Guide

Every page, every panel, every control, written for someone who has never used a developer tool.
Read it end to end once; after that use the section for the page you are on.

This file is also the source text for the in-app welcome guide. The **What it does** and **When you
would use it** columns of every table below are the copy that goes into the app, word for word, and
the **If you get it wrong** column is the second line of each help popover. Write nothing here you
would not put in front of a user.

| Document | Role |
|---|---|
| `docs/USER-GUIDE.md` | This file. What every control is called, what it does, and what happens if you misuse it. |
| `loopdesign.md` | The operating document for one iteration of the agent loop. Not for users. |

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

This worktree owns exactly one file:

```text
docs/USER-GUIDE.md
```

It must not create, edit or delete anything else. Not `client/`, not `server/`, not `shared/`, not
`scripts/`, not `package.json`, not `loopdesign.md`, not the sibling documents being written in
parallel worktrees.

**This document is where user-facing wording is decided.** Other worktrees copy labels from here
rather than inventing their own; that is the whole reason it exists as a separate file. If a button
in the app is called something different from what this file says, one of the two is wrong and the
decision is made here first.

**How to raise a cross-boundary concern.** If reading the code shows this guide describing
something the code cannot do, do not fix the code. Write the discrepancy into §11 with the
`file:line` that proves it, tag the affected row `PARTIAL` or `PLANNED`, and stop. A guide that
quietly rewords itself around a broken feature is how the feature stays broken.

**What this surface contributes to the canonical demo.** The demo is: a salesperson creates a
project ("I need to do this sales presentation"), a four-agent team is assembled, and every asset
lands in the Doc Hub. This document's contribution is that the salesperson can do it without being
told what to click. §10 is that walkthrough, and it is the acceptance test for the whole guide: if a
step in §10 needs a word this guide has not glossed, the guide has failed.

---

## 1. What grok-workspace is, and how you open it

grok-workspace is the common-user face of Grok Build. Grok Build is a tool that engineers run in a
terminal; grok-workspace is the same engine with a screen in front of it, for people who do sales,
marketing and operations rather than code.

It produces four kinds of thing:

```text
Documents     written material — briefs, one-pagers, reports
Slides        decks
Experiences   voice and video
Software      you describe a web page or an app in plain words and agents build it
```

Software is one of the four, not the point of the product. The coding capability is not going away;
it has stopped being the centre.

### 1.1 Opening it

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| `grok --common_version` typed in a terminal | Starts grok-workspace and opens it in your browser. It is not a separate app you install — it is Grok Build with the visual layer turned on. | Every time you want to work. | Nothing bad happens; you get the terminal version of Grok Build, which is the engineers' view. Close it and type the command again with the flag. | **PLANNED** |
| A web address ending `?view=control-room` | Same thing, reached by URL rather than a flag. | Today, this is the only way in. | You land on an older screen called the canvas. There is a small button at the bottom-right that switches between the two. | **NOW** — `client/src/main.tsx:13-15` |

**Honest note about the flag.** There is no `--common_version` flag in Grok Build today, and one
cannot simply be added to it: Grok Build is an upstream mirror that does not accept outside changes.
The flag has to live in *our* launcher, which starts our server and opens the browser and then
attaches to Grok Build the normal way. To a user this is invisible and the wording above stays true.
To whoever builds it, it is net-new work in `bin/`, not a one-line addition to somebody else's
program.

### 1.2 Projects

A project decides **what kind of work happens in it**. A sales-deck project does not look like a
software project, and that is deliberate — choosing the kind of work is what tailors the workspace.

A project also carries **one description that every agent in it follows**. This is the single shared
brief. If you change it, you change what every agent believes it is doing.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **New project** | Opens the setup form. | Starting a new piece of work. | Nothing is created until you press **Create project**. There is a **← Back** link at the top of the form. | **NOW** — `client/src/control-room/ProjectHeader.tsx:94-101`, `client/src/control-room/ControlRoomApp.tsx:76-87` |
| **What kind of work is this?** — Document / Slides / Experience / Software | Sets the shape of the workspace and which agents get suggested. | Always, first field. | Pick the wrong one and the suggested team is wrong. You can change it, but agents already at work keep the old brief until you restart them. | **PLANNED** |
| **Project name** | What you will call this in the list. | Always. | Required. Without it the **Create project** button stays greyed out. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:83-86` |
| **Objective** (planned label: **What are we making?**) | One line saying what you want. | Always. | A vague objective produces a vague plan. This is the shared brief; spend a minute on it. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:96-99` |
| **Budget (USD)** | The most this project may spend before it stops itself. Defaults to 10. | Always — media is expensive, see §3.5. | Too low and work halts mid-deck with a red bar. Too high and a runaway loop can spend real money. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:100-104` |
| **Local repository** | A folder on your computer where the work lives. | Today, required. | The form will not submit without it, and a folder that has since been moved or deleted shows a red strip saying so. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:73-79`; the missing-folder strip is `client/src/control-room/ControlRoomApp.tsx:135-145` |
| **Base branch** | A term from version control. | Never, if you are not an engineer. | Leave it at `main`. | **NOW**, to be removed — `client/src/control-room/NewProjectPanel.tsx:88-91` |
| **Design document** (large text box) | A brief you paste in. Lines written as `- AUTH-01: Login returns a token` become tracked pieces of work. | If you already have a brief. | If your brief is not in that exact list format, the box under it says "No requirements found" and the project starts with nothing to track. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:107-123`; the parser is `shared/designDocument.ts` |
| **Create project** | Creates it and assembles a team. | When the form is filled. | If the team cannot be assembled the project still exists and a red strip explains why; you are not left with a half-made project you cannot see. | **NOW** — `client/src/control-room/NewProjectPanel.tsx:131-139`, `client/src/control-room/useControlRoom.ts:469-484` |

**What the setup form becomes.** Repository path, base branch and the pasted markdown are engineers'
inputs. The planned form asks for: what kind of work, a name, the shared brief, a budget, and
nothing else. The folder is chosen for you.

---

## 2. The greeting and the welcome guide

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **First-run greeting** — a full-screen welcome the first time you open grok-workspace, naming the four kinds of work and offering "Show me around" or "Skip" | Tells a brand-new user what this is before they see any controls. | Once, automatically. | Skipping is safe. The guide can be reopened from the **?** in the top bar. | **PLANNED** |
| **Show me around** — a short spotlight tour that dims the screen and points at one thing at a time | Names the four or five things that matter, in order. | Right after the greeting. | Pressing **Skip** at any point ends it and marks it done. | **PARTIAL** — the mechanism exists and works in `client/src/components/OnboardingTour.tsx`, but it is only ever mounted by the old canvas screen (`client/src/App.tsx:812`), so nobody who opens the workspace has ever seen it |
| **?** button in the top bar | Reopens the guide, and offers per-section help. | Whenever you do not recognise a panel. | Nothing; it is read-only. | **PLANNED** — `client/src/components/HelpModal.tsx` is a usable shell but its content is a keyboard-shortcut table, which is exactly the wrong content for this audience |
| **?** on each panel | Opens a small explanation of just that panel, taken from this file. | When one panel confuses you, rather than the whole app. | Nothing. | **PLANNED** |

**One trap to avoid when building this.** The old tour records "done" under a single setting called
`tourCompleted` (`client/src/components/OnboardingTour.tsx:116-123, 180-187`). If the new greeting reuses that name, then
anyone who ever finished the old canvas tour will never see the new greeting — and the failure is
silent. The new greeting needs its own setting name. The server stores settings as free-form keys
(`server/routes/api.ts` `/settings`), so a new name costs nothing.

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
| **New project** | Starts §1.2. | New piece of work. | Escapable — **← Back to \<project\>** at the top of the form. | **NOW** — `client/src/control-room/ProjectHeader.tsx:94-101` |
| Green progress bar and **"37% · 3/8 requirements"** | How much of the work is finished. The number is counted from real statuses, not guessed. | Glance. | The word "requirements" is jargon and is being replaced with "pieces". | **NOW** — `client/src/control-room/ProjectHeader.tsx:104-122` |
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
(`client/src/control-room/ControlRoomApp.tsx:114-211`). On a fresh install with nothing configured, the first thing a new
user sees is a wall of red. The replacement is one notification area with icons, one line of plain
language each, and a count. **PLANNED.**

### 3.3 The work-area board

Today this is a grid of cards, one per agent. It is being rebuilt as coloured area tiles.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Area colour** — a coloured band on the tile | Tells you at a glance which agent owns which part of the work. | Constantly. | — | **PLANNED**. The field already exists and nothing writes it (`server/types/agent.ts:114-115`) |
| **Name** and **job** ("Ada · Slide Designer") | Who this is. | Constantly. | — | **NOW** — `client/src/control-room/AgentCard.tsx:42-48` |
| **Status chip** — Working / Waiting / Blocked / Idle / Done / Failed | What state the agent is in. Every status carries a **word**, never a colour alone. | Constantly. | Do not let anyone "simplify" these into bare colour swatches; the text is the accessible carrier of meaning (`server/types/agent.ts:7-11`). | **NOW** — `client/src/control-room/AgentStatusBadge.tsx` |
| **What it is doing**, one sentence | Plain-language status detail. | Constantly. | If the server did not supply one, the line is simply absent — the app never invents a plausible-looking status. | **NOW** — `client/src/control-room/AgentCard.tsx:52-56` |
| **Cost $0.42** | What this agent has spent. | Whenever a media agent is running. | See §3.5. | **NOW** — `client/src/control-room/AgentCard.tsx:72` |
| **Blocked: …** amber banner | The agent has hit something it cannot decide alone. | Read it and answer. | The agent waits indefinitely. | **NOW** — `client/src/control-room/AgentCard.tsx:75-82` |
| **Open Session** | Opens the conversation with that agent (§3.4). | To ask it something, or to see what it has been doing. | Harmless. | **NOW** — `client/src/control-room/AgentCard.tsx:85-92` |
| **Pause** | Stops this agent where it is; it can resume. | You want to read before it goes further. | Safe and reversible. | **NOW** — `client/src/control-room/AgentCard.tsx:93-100` |
| **Stop** | Ends this agent's session. | It is doing the wrong thing. | Work already saved is kept; work in flight is lost. **Pause** and **Stop** sit side by side with no confirmation on either — they are being merged into one control with a confirm. | **NOW** — `client/src/control-room/AgentCard.tsx:101-108` |
| **Command · Tool · Task · File · Branch · Worktree · Tests** | Eight rows of engineer's detail in a fixed-width font. | Never, if you are not an engineer. | Nothing — they are read-only. Six of the eight are being hidden behind an "advanced" toggle. | **NOW** — `client/src/control-room/AgentCard.tsx:58-73` |
| **Canvas** — the same cards, draggable | Lets you drag cards around; positions are saved. | Not useful today. | It is the same information twice, and the connecting lines between cards are hidden by a stylesheet rule. Being merged into the board or removed. | **NOW** — `client/src/control-room/AgentCanvas.tsx`, lines hidden at `client/src/index.css:98-105` |

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

That arithmetic is why capability is a budget control and not a feature flag, and why the guide
tells you to give an agent the least capability that does its job. An outline writer does not need
image capability. A copy editor does not need voice.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Assemble a team** — one button on an empty project | Creates a team suited to the project description. | Right after creating a project. | You get a generic team. Remove agents you do not need — an unused image-capable agent costs nothing until it runs, but it is one more thing that can. | **PARTIAL** — a team of five fixed engineering roles is seeded automatically at project creation (`server/services/agentTeam.ts:11-17`); there is no button, no choice, and the roles are Planner / Backend Engineer / Frontend Engineer / Test Engineer / Reviewer |
| **New agent** | Creates one agent by hand: name, job, capability, work area, spending limit. | Building a team yourself, or adding a specialist. | Giving an agent more capability than it needs is the main way projects overspend. | **PLANNED** |
| **Spending limit** on an agent | The most this one agent may spend. | Always, on media-capable agents. | Without one, the only backstop is the whole-project budget. The field already exists in the data and is shown nowhere (`client/src/control-room/types.ts:40`). | **PARTIAL** |
| **Work area** on an agent | The part of the project this agent may change. | Always. | See the honest warning below. | **PLANNED** |
| **Where the money went** — a breakdown by agent, by day, by kind of thing made | Understanding a bill. | After any expensive run. | — | **PLANNED**. See §11 item 4: there is no record to build this from yet |

**Honest warning about work areas.** The product says an agent works inside one area, may *suggest*
changes anywhere, and may not *change* anything outside it. The suggesting half genuinely works and
is the best-preserved thing in the product (§3.6). **The not-changing half is enforced nowhere at
the moment a change is made.** Today "isolation" is a folder handed to the agent and nothing more.
Two guards exist and neither is connected to anything: `assertAgentCanWrite`
(`server/services/repository.ts:261`) and the whole approval queue (`server/services/approvals.ts`)
have zero callers in the running product. A third, `server/hooks/shellSafetyHook.ts`, is not
installed by this repository and inspects only terminal commands, so a tool that writes a file
directly walks straight past it. Out-of-bounds edits have been *recoverable* — version control made
them easy to undo — never *prevented*. Do not describe boundaries to a user as protection until the
enforcement exists.

### 3.6 Decisions waiting for you

Two queues. The first is the one that matters most.

**Suggestions** — an agent proposes a change to something outside its own area.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| The suggestion, showing the old text in red and the proposed text in green, with the agent's reason | Shows exactly what would change. | Every suggestion. | — | **NOW** — `client/src/control-room/ReviewQueues.tsx:57-100` |
| **Out of date** amber tag | The document changed after the agent wrote this suggestion, so it may no longer make sense. | Read the current text before accepting. | Accepting an out-of-date suggestion can undo someone else's edit. | **NOW** — `client/src/control-room/ReviewQueues.tsx:65-70` |
| **Accept** | Applies it. | You agree. | It becomes a new version of the document; the previous version is kept. | **NOW** — `client/src/control-room/ReviewQueues.tsx:140-148` |
| **Edit** | Lets you change the wording, then **Save** or **Cancel**. | Right idea, wrong words. | The agent's original wording is kept alongside yours, so you can always see what it actually proposed. | **NOW** — `client/src/control-room/ReviewQueues.tsx:83-96, 118-136` |
| **Reject** | Declines it. | You disagree. | The agent is told. | **NOW** — `client/src/control-room/ReviewQueues.tsx:149-156` |
| **Ask for a revision** with a note | Sends it back with an explanation. | Nearly right. | Leave the note empty and the agent gets no guidance — the note is the entire point of this button. | **NOW** — `client/src/control-room/ReviewQueues.tsx:104-116, 168-175` |

**Code reviews** — the second queue. It shows branch names, test counts and a line-by-line
difference view (`client/src/control-room/ReviewQueues.tsx:244-320`, `client/src/control-room/DiffView.tsx`). For a
non-technical user this is unreadable and it is being moved behind an "advanced" toggle. Its
replacement for documents, slides and experiences is a **preview**: see the actual slide, hear the
actual narration, then **Approve** or **Send back**. **PLANNED.**

One thing in the code-review queue is worth keeping in plain sight: when an agent's own account of
what it changed does not match what actually changed on disk, the queue says so
(`client/src/control-room/ReviewQueues.tsx:286-294`). The principle survives into the new world — check what was produced,
do not take the agent's word for it.

### 3.7 Starting work

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Generate plan** | Asks a planning agent to read the brief and propose the pieces of work. Takes about a minute and costs a little. | Once, after creating a project. | If it cannot produce a usable plan it says so rather than silently producing an empty one. | **NOW** — `client/src/control-room/PlanPanel.tsx:48-63` |
| **Draft** / **Approved** chip | Whether the plan has your approval. | Glance. | — | **NOW** — `client/src/control-room/PlanPanel.tsx:78-85` |
| **Approve Plan** | Your permission for agents to start. | After reading the proposed work. | **This is the one decision the product insists a human makes.** Nothing runs before it. Read the list first. | **NOW** — `client/src/control-room/PlanPanel.tsx:91-100`, gate note at `:103-108` |
| Owner dropdown on an unassigned task | Chooses which agent does it. | When a task says "unassigned". | A task with no owner cannot start; the **Launch** button stays greyed and hovering it says why. | **NOW** — `client/src/control-room/PlanPanel.tsx:158-179` |
| **Launch** | Starts that piece of work. | After approving. | It refuses, with the reason on hover, when: the plan is not approved; something it depends on is unfinished; nobody owns it; it is already done. A control that explains its refusal teaches the rule. | **NOW** — `client/src/control-room/PlanPanel.tsx:184-193` |

Planned wording: this whole panel becomes one **Start work** confirmation showing the proposed team
and the proposed pieces, not a table of task identifiers and dependency codes.

---

## 4. The DOC HUB page

**Status: PLANNED in full. Nothing on this page exists today.** The nearest thing that exists is a
single plain-text box holding one brief (`client/src/control-room/DesignDocumentPanel.tsx`).

The Doc Hub is the home for everything the project produces — documents, slides, experiences and
software — laid out like a familiar office file store, and showing live which agent is reading or
working on what.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **The shelf** — a grid of items with thumbnails, grouped by kind (Documents / Slides / Experiences / Software) | Everything this project has made. | Constantly. | — | **PLANNED** |
| **A coloured dot with an agent's face on an item** | That agent is reading or changing this item right now. | To see where the team's attention is. | — | **PLANNED** |
| **Open** | Opens the item — a document in a reader, a deck in a slide viewer, an experience in a player. | Reviewing work. | Opening never changes anything. | **PLANNED** |
| **Version history** | Every previous version, with who or what changed it. | Something got worse. | You can always go back. The version-and-conflict machinery this rests on already exists and works (`server/types/project.ts:49-58`). | **PARTIAL** — the machinery exists for the single brief only |
| **Publish** | Promotes an agent's approved work into the finished deliverable. | When a piece is done. | Publishing refuses without a named approver, and refuses when the area produced nothing. If publishing fails halfway, the previous version is restored. | **PLANNED** — the equivalent rules are already enforced for code (`server/services/repository.ts:327-389`) and transfer directly |
| **Download** | Saves the file to your computer. | Sending it to someone. | — | **PLANNED** |
| **The brief** — the project description every agent follows | The shared instruction. Agents may read it and propose changes; they may never edit it directly. | When the goal shifts. | Changing it mid-project changes what every agent believes it is doing. Agents already running keep the old brief until restarted. The read-only-to-agents rule is real and already enforced (`client/src/control-room/DesignDocumentPanel.tsx:14-17`). | **PARTIAL** |

### 4.1 Two rules the Doc Hub must make visible

**A generated picture or video is only yours once it is in the Doc Hub.** When Grok Imagine makes an
image or a video, it hands back a temporary web address that stops working. Anything that stores
that address instead of the file is broken by construction. For a user, the rule reads: *if it is on
the shelf, it is saved; if it is only in a conversation, it is not.*

**Nothing generates a document or a deck for us.** There is no xAI slide-generation service and no
xAI document-generation service. None. A text model writes the structured outline and the copy,
Imagine fills the picture slots, narration fills the audio, and **our own code assembles the file**.
Anyone who goes looking for a "make me a PowerPoint" endpoint is looking for something that does not
exist. Say this plainly to anyone estimating this page.

---

## 5. The USERS page

**Status: PLANNED in full.** There is no concept of a user account anywhere in the product today —
no sign-in, no people, no permissions. The only identity that exists is a header the server uses to
tell an agent apart from a person (`x-openui-actor-id`, `server/routes/projects.ts:41-42`).

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **People** list | Everyone who can open this workspace. | Setting up a team. | — | **PLANNED** |
| **Invite** | Adds someone. | New colleague. | — | **PLANNED** |
| **Role** — Owner / Editor / Viewer | What a person may do. Owners can change budgets and approve publishing; editors can run projects; viewers can only look. | Always, on invite. | Giving Owner to everyone means anyone can raise the spending limit. | **PLANNED** |
| **Spending limit per person** | The most one person's projects may spend in a period. | Any shared workspace. | Without it, the only limits are per project. | **PLANNED** |
| **Connected accounts** — X, and any other service | Which outside services this person has linked. | Before an agent can post or read on their behalf. | Removing a connection stops any agent relying on it, mid-work. | **PLANNED** |
| **Remove** | Takes someone's access away. | They have left. | Their work stays; their access does not. | **PLANNED** |

**Unverified, must be checked before this page is designed.** Whether grok-workspace runs on one
person's machine or as something a team signs in to has not been decided, and the answer changes
this page completely. Today it is a local program with no accounts, reachable over the network only
if a host setting is changed. Ask the owner before building.

---

## 6. The X page

**Status: PLANNED, and the least verified page in this guide.** It is marked optional for a reason.

The intention: generate material in X's native shapes, generate video for it, and post it.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Connect X account** | Links your X account so an agent can read and post as you. | Once. | Disconnecting stops any agent that was using it. | **PLANNED** |
| **Draft** | Writes posts in X's format and length. | Campaign work. | Nothing is posted from here. | **PLANNED** |
| **Attach generated video** | Uses the same video capability as an experience agent. | A post that needs motion. | Video is the most expensive thing in the product — $0.05–$0.08 per second. Check the cost estimate before generating. | **PLANNED** |
| **Post** | Publishes to X. | When you have approved the draft. | **This is outward-facing and cannot be undone from inside the app.** It must sit behind an explicit confirmation naming the account being posted to, and it must never be something an agent does without a human click. | **PLANNED** |
| **Scheduled** | Posts queued for later. | Campaigns. | A scheduled post still goes out if you close the app, as long as the workspace is running. | **PLANNED** |

**What is not verified.** The research this guide is built on covers xAI's model APIs — images,
video, speech — in detail, and contains **nothing about the X posting API**: no endpoints, no rate
limits, no pricing, no authentication model, no rules on automated posting. Nothing in this
repository touches X either. Every row above is intent, not specification.

Before any of this page is built, someone must check and write down: the exact posting endpoint and
its authentication; the rate limits; the cost, if any; the terms governing automated posting; and
whether video can be attached by upload or only by reference. Do not design around assumptions here.

---

## 7. The TOOLS panel

A panel you can open over any page. It holds three kinds of reusable thing.

```text
prompt     a line of text you reuse — the copy-and-paste kind
skill      a folder of instructions, fronted by a short description that tells an agent
           when the folder is relevant. Can be turned up or down.
workflow   the agent's working pattern — how many times it goes round, when it stops,
           whether it is allowed to add goals of its own
```

**Status: PARTIAL, and unusually cheap to finish.** The server behind this panel is built, tested
and mounted (`server/routes/library.ts`, `server/services/promptLibrary.ts`), and **no screen has
ever called it**. Verify before writing more: `grep -rn "api/library" client/src` returns nothing.
The panel is a front-end build against a working service, which is much less work than it looks —
but see the mismatches below.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Prompts** tab, list | Your saved prompts. | Finding one. | — | **PARTIAL** — served by `GET /api/library/prompts`, no screen |
| **New prompt** | Saves a piece of text you reuse. It may contain fill-in-the-blanks written as `{customer}`. | Anything you type more than twice. | If you use a blank you did not declare, it is added for you as required — so a typo becomes a required blank rather than silently rendering as a hole in your text. | **PARTIAL** |
| **Use** on a prompt | Asks for the blanks and produces the finished text. | Every use. | Leave a required blank empty and it refuses, naming which one. It never emits a half-filled prompt. | **PARTIAL** |
| **Skills** tab, list | Your saved skills. | Finding one. | — | **PARTIAL** |
| **New skill** | Points at a folder of instructions and writes the short description that tells an agent when the folder applies. | Teaching the team something reusable — your pitch structure, your brand voice, your objection handling. | A vague description means the agent never realises the skill applies. The description is the whole discovery mechanism. | **PLANNED** — today a skill is a single block of text with no folder behind it (`server/services/promptLibrary.ts:31-39`) |
| **Turn up / turn down** on a skill | How strongly this skill influences the agent — off, background, or insisted upon. | Tuning tone. | Turning everything up fills the agent's instructions with competing rules and it follows none of them well. | **PLANNED** — no such dial exists |
| **Assign to agent** | Gives one agent this skill. | Specialising an agent. | Instructions are assembled when the agent starts. Assigning a skill to an already-running agent does nothing until it restarts. | **PARTIAL** — assignment works, the restart rule is real (`server/services/acpSessionManager.ts:104-117`) |
| **Workflows** tab | Your saved working patterns. | — | — | **PARTIAL** |
| **New workflow** | Defines how an agent works: a plain loop, a loop that improves its own output each pass, or a loop that may add goals to its own instructions. | Repeating work with a quality bar. | A loop with no stopping condition and no budget is exactly the runaway that turns $5 into $50. Always set both. | **PLANNED** — today a workflow is a fixed list of stages with no loop of any kind (`server/services/promptLibrary.ts:41-59`) |
| **Edit in place** on any of the three | Changes the saved item without leaving the panel. | Constantly. | **There is no editing and no deleting today** — the store is add-only, and the only way to change an entry is to edit a file by hand. This is the first thing to build. | **PLANNED** |

**Two things the underlying engine already does, which we should surface rather than rebuild.**
Grok Build has its own skill system — a folder fronted by a SKILL.md, discovered automatically,
with a setting that keeps a skill listed but inactive, which is the on/off half of "turn up and
down". It also has real loops: a repeating instruction, and a goal-driven loop with independent
checking before completion is accepted, both with a hard cap on how many helper agents may be
spawned. Building a parallel system alongside these forks away from the engine's own discovery.
Where our model and the engine's model differ — the continuous dial, the self-editing loop document
— those differences are genuinely new and should be written down as such.

---

## 8. The file tree

A quick way to see and edit the actual files, for the times when the polished view is not enough.

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Files** — a folding tree of the project's folder | Shows what is actually there. | Checking that something was really produced; finding a stray file. | — | **PARTIAL** — a flat list of file names exists on the server (`server/services/repository.ts:403-419`) and is reachable only by agents, not by any screen. Nothing anywhere draws a tree. |
| **Agent markers on files** | Which agent is working in which part of the tree. | Seeing multi-agent activity at a glance. | — | **PLANNED** |
| **Click a file to view it** | Opens the contents. | Checking. | — | **PLANNED** — no endpoint reads a file's contents today |
| **Edit and Save** | Changes a file directly. | A one-word fix that is not worth asking an agent for. | Editing a file an agent is working in at that moment can collide with what the agent is doing. Pause the agent first. | **PLANNED** — no write endpoint exists, and this is the risky one |
| **"Showing 500 of 1,240"** | The list is capped. | — | Without this line, a truncated list looks like a complete one. The cap is real and the truncation flag is already reported by the server and rendered nowhere. | **PLANNED** |

**Three correctness traps for whoever builds this.**

The existing listing shows only files that version control already knows about. **A file an agent
just generated does not appear** — which, in a product whose entire job is generating files, is a
real bug, not a limitation.

Every path a screen sends to the server must go through the existing path check
(`server/routes/repository.ts:59-73`), which resolves symbolic links before deciding. It exists
because both failure directions have actually happened: refusing a legitimate path on macOS, and
approving a link that pointed outside the project. It is the best code in the repository for this
job. Do not write a second, weaker one.

A directory browser already exists at `/api/browse` (`server/routes/api.ts:64`) and **has no path
confinement at all** — it will list any directory on the machine. It must not be the basis of a file
tree until that is fixed.

**One question to settle before building either version.** For a product making slides, documents
and videos, a *source-code* file tree may be the wrong object entirely. What users want to browse is
finished things — "deck v3", "script", "opening clip" — which is the Doc Hub (§4), not a folder
listing. Decide which tree is being built before building one.

---

## 9. Light and dark mode

| On screen | What it does | When you would use it | If you get it wrong | Status |
|---|---|---|---|---|
| **Appearance** — Light / Dark / Match my computer | Switches the whole workspace. | Preference, or a bright room. | Nothing; it is only appearance. Your choice is remembered. | **PLANNED** |

**Status: dark only.** The dark colours are written directly into every screen — around 333 colour
declarations across sixteen files, plus roughly 24 fixed dark colours and 15 forced overrides in
`client/src/index.css`, and `client/tailwind.config.js` has no light/dark switch configured at all.
Light mode is not a setting that has been left off; it is a real piece of work.

Two things a light theme must not break, both of which are already right:

- every status carries a **word**, not just a colour (`server/types/agent.ts:7-11`). Do not trade
  the word away in the name of making the product "more visual";
- the hidden explanatory text that screen readers read out — for example the full explanation of
  what "estimated cost" means (`client/src/control-room/ProjectHeader.tsx:143-145`) — must survive any redesign.

The underlying engine ships a matched dark and light pair of its own, and porting those two palettes
verbatim is both cheaper than inventing colours and makes the workspace read as the same product as
the terminal it came from.

---

## 10. Your first fifteen minutes

A salesperson, from opening the app to one finished deck.

**Read this first.** As of today, steps 1, 2, 5, 6 and 8 work; steps 3, 4, 7 and 9 describe the
product being built. Nobody can currently produce a deck with this tool. The walkthrough is written
in the finished tense because it is the in-app copy; the tags say what is real.

**1. Open it.** Type `grok --common_version`. The workspace opens in your browser.
*(**PLANNED**; today, open the address ending `?view=control-room`.)*

**2. Say what you are making.** Press **New project**. Choose **Slides**. Name it "Q3 renewal
pitch — Northwind". In **What are we making?** write one honest sentence: *"A 12-slide renewal deck
for Northwind, aimed at their VP of Operations, leaning on the support-response numbers from Q2."*
Set the budget to $15. Press **Create project**.
*(**PARTIAL**: the form exists; the kind-of-work choice and the plain-language labels do not.)*

**3. Let it build a team.** Press **Assemble a team**. You get four agents, each with a colour:

```text
Researcher    base Grok           reads your Doc Hub for the Q2 numbers
Social        base Grok           works against your X account for recent customer context
Designer      Grok + images       generates the slides
Producer      Grok + voice+images generates the opening video and the narration
```

Two of the four cost almost nothing to run. The two that can spend real money are the two that make
pictures and video — that is what the capability label on each tile is telling you.
*(**PLANNED**. Today a fixed team of five engineering roles is created for you automatically.)*

**4. Read the plan and approve it.** The workspace proposes the pieces: research, outline, twelve
slides, an opening clip, narration. Read them. Press **Approve Plan**. Nothing has run until this
click, and that is deliberate.
*(**NOW** as a mechanism — `client/src/control-room/PlanPanel.tsx:91-100` — but the plan it generates today is about code.)*

**5. Watch the board.** Four coloured tiles, each with one sentence saying what it is doing.
Researcher finishes first. Designer's spend ticks up as images arrive.
*(**NOW** for tiles and status; **PLANNED** for the colours and the plain-language sentence.)*

**6. Answer the things that stop.** Designer raises a suggestion: it wants to change the headline on
slide 3 because the number in your brief does not match the number Researcher found. Press
**Edit**, adjust the wording, **Save**. Producer shows an amber **Blocked** banner asking which of
two openings you prefer. Press **Open Session** and reply in one line.
*(**NOW** — this is the strongest part of the product today.)*

**7. Look at the shelf.** Open the **Doc Hub**. The deck is there, with twelve thumbnails, the
opening clip, and the narration track. Play the clip. Everything on the shelf is saved to your
computer; anything that exists only inside a conversation is not.
*(**PLANNED** in full.)*

**8. Watch the money.** The top bar reads **est. $6.10 / $15.00**. The video is most of it. If it
had crossed $12 you would have seen an amber warning strip, and at $15 work would have paused
itself with a red one.
*(**NOW** as a mechanism; but read §11 item 4 before you trust the number.)*

**9. Finish it.** In the Doc Hub, open the deck, review each slide, press **Publish**, then
**Download**.
*(**PLANNED**.)*

Fifteen minutes, four decisions: what you are making, approve the plan, answer two questions,
publish.

---

## 11. Things the owner assumed that are not true

Written down here rather than quietly designed around, because a guide that hides a false assumption
just moves the disappointment later.

**1. There is no slide or document generator to call.** xAI ships no service that produces a
PowerPoint, a Word file, a PDF or a deck. Images and video, yes. Speech, yes. Documents and slides,
no. Assembling a deck or a document is entirely our own code: a text model produces a structured
outline, our renderer turns it into a file, Imagine fills the picture slots, narration fills the
audio. Every estimate for the Doc Hub must be made on that basis.

**2. Grok Imagine does have a proper public API — and the returned files expire.** Images are made
at `POST /v1/images/generations` and cost $0.02 or $0.05 each. Video is made at
`POST /v1/videos/generations`, which does not answer immediately: it hands back a job number that
must be polled at `GET /v1/videos/{id}` until the status turns from *pending* to *done*, *expired*
or *failed*. Video costs $0.050 or $0.080 per second, runs 1–15 seconds, and comes with sound by
default. **The web addresses returned for both are temporary.** Anything that saves the address
instead of downloading the file has lost the asset. That is a hard architectural constraint, and it
is why §4.1 tells users an asset is only theirs once it is on the shelf.

**3. Voice cannot be cloned from inside the app.** Speech generation is real
(`POST /v1/tts`, $15.00 per million characters), and it can return **timing for every single
character**, which is how narration is synchronised to slides precisely rather than approximately.
But **creating a custom cloned voice through the API is available only on an enterprise plan**; on a
standard plan voices are created in xAI's own console, and only within the United States, excluding
Illinois. Do not write a feature that clones a user's voice from the app. Also note that this
speech service is not the OpenAI-shaped one — a general-purpose OpenAI client library cannot call
it.

**4. Cost is broken today, not merely shallow.** This is the most important item in this section,
because cost is the pillar the media capabilities rest on.

```text
DEFAULT_RATES  (server/services/usageAccounting.ts:31-35)  has exactly three entries:
    gpt-4o, gpt-4o-mini, gpt-4.1
There is no Grok model in it. An unknown model returns a cost of $0.00 with the reason
recorded as "no rate" — and that reason is displayed nowhere.
```

So every dollar figure in the shipping product is very probably $0.00, every budget is unreachable,
every budget warning is unfirable, and the user reads "$0.00 (estimated)" as *cheap* rather than as
*we do not know the price of this*. Beyond that: there is **no record of individual charges at all**
— the product keeps running totals only, so there is no history, no breakdown by day or by agent or
by kind of thing made, no export, and therefore no source data for any of the cost views this guide
describes as planned. The input/output breakdown is calculated and thrown away. Two named controls,
an approval threshold for large spends and a retry limit, do not exist in the code at all.
Per-task cost *is* tracked; an older handover note saying otherwise is out of date. And cost cannot
be attributed to an individual tool call, because the engine reports usage once per conversational
turn, not per action.

One piece of good news that changes the design: xAI returns the **actual** cost of every image,
video and text request in the response itself. That means the product can distinguish *measured*
cost from *estimated* cost, and should say which it is showing. Voice is the exception — whether
speech responses carry a cost figure is not documented, so voice cost must be calculated from
published rates and labelled as an estimate until someone checks a live response.

**5. Boundaries protect nothing yet.** See the warning in §3.5. The suggestion half works; the
prevention half does not exist. Version control made out-of-bounds edits *recoverable*, and removing
version control removes the safety net, not the enforcement — there was no enforcement. A real
boundary needs either a check that runs before every write, resolves the path fully, and terminates
the action outright, or — better where the thing being made is structured — every change routed
through a tool call that carries the project, the agent and the area with it.

**6. The workspace cannot talk to xAI at all today.** The product speaks one protocol, over a pipe,
to the `grok` program on this machine, and nothing else. There is no web client to `api.x.ai`
anywhere in it. Every capability in §3.5 requires one to be written, plus a credential that is
separate from whatever signs the `grok` program in. Additionally, the media features inside the
`grok` program itself are gated behind a consumer subscription tier and can be switched off
remotely, which is why the product should call the API directly rather than going through the
program.

**7. Skills and workflows do not mean today what this guide says they mean.** A skill is currently
one block of text with no folder, no discovery description and no intensity dial. A workflow is
currently a fixed list of stages with no loop of any kind and no ability to change itself. Both are
model changes on the server, not screen work. See §7.

**8. The tools panel has never been opened by anybody.** Its server side is complete and tested; no
screen has ever called it. Verify this yourself before estimating — `grep -rn "api/library"
client/src`.

---

## 12. The order to build the user-visible surface

Each step is here because the step after it is unwritable otherwise.

1. **The message strip** (§3.2). One notification area replacing six stacked red bars. One file,
   the largest single improvement a new user experiences, and it makes every screenshot after it
   presentable.
2. **The cost rate table** (§11 item 4). Not a screen — but until a Grok turn produces a real
   number, every cost row in this guide is describing a zero. Check what a live turn reports first.
3. **Light and dark mode** (§9), done as a token layer rather than as a find-and-replace. It is also
   the work that makes the workspace look like the tool it came from.
4. **The greeting and the per-panel help** (§2), fed from this file. Do this before the pages
   change, so every later change has somewhere to put its explanation.
5. **Capability on agent creation** (§3.5). The money control. It must exist before any
   media-capable agent can be created at all.
6. **The Doc Hub shelf** (§4), read-only first: show what has been produced, with agent presence.
   Publishing and version history second.
7. **The tools panel** (§7), starting with editing and deleting, which are the missing halves.
8. **The file tree** (§8), read-only, behind the existing path check. Writing last, or not at all.
9. **Users** (§5) and **X** (§6), after the questions in those sections are answered.

---

## 13. What counts as done

Checkable items in the form the project already uses: a required result whose every clause must be
satisfied, and an evidence form to fill in. A partially-satisfied item is NOT TESTED, not PASS.

#### UG-001: Every control in the product appears in this guide

Required result:

* every button, input and menu on every page has a row in §3–§9;
* every row names what it is called on screen, exactly as the screen says it;
* every row carries **NOW**, **PARTIAL** or **PLANNED**;
* a control that exists in the code and not in this guide is a failure of this item, and so is a row
  describing a control that no longer exists.

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
* every row tagged **PLANNED** is written in the same voice as the rest but is unambiguously tagged.

Evidence:

```text
NOW rows demonstrated:
NOW rows that could not be demonstrated:
```

#### UG-003: Every cited path resolves

Required result:

* every path in backticks resolves from the repository root;
* every `file:line` citation points at the thing the sentence claims;
* absolute paths appear only inside fenced blocks.

Evidence:

```text
Command run:
Unresolved citations:
```

#### UG-004: No unglossed jargon

Required result:

* no word from the glossary in §15 appears in §1–§10 before being glossed;
* the words *worktree*, *branch*, *merge*, *diff*, *token*, *MCP*, *ACP*, *repository* do not appear
  in any user-facing column except where the guide is explicitly naming a control that still uses
  them and saying it is being replaced.

Evidence:

```text
Terms found unglossed:
```

#### UG-005: The fifteen-minute walkthrough is executable, or honestly tagged

Required result:

* each of the nine steps names the exact control the user presses;
* each step is tagged with what works today;
* the steps that work today can be performed in order without consulting any other document.

Evidence:

```text
Steps performed:
Steps blocked, and by what:
```

#### UG-006: The guide is liftable into the app

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

#### UG-007: Every correction in §11 is either still true or removed

Required result:

* each of the eight items in §11 is re-checked against the code each time this file is touched;
* an item that has been fixed is deleted, not left standing;
* an item that is still true carries the `file:line` that proves it.

Evidence:

```text
Items re-checked:
Items removed as fixed:
```

---

## 14. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

- **A page's purpose is unclear.** §5 and §6 both contain a question that must be answered before
  the page can be designed: whether this is single-user or multi-user, and what the X API actually
  permits. Guessing produces a guide that has to be rewritten.
- **A fact is needed that the research does not contain.** Everything factual in this guide traces
  to verified research. If a new claim about a price, an endpoint, a rate limit or a permission is
  needed, mark it unverified, name what must be checked, and stop — do not invent an API detail.
- **This guide and the code disagree about what a control is called.** The wording decision is made
  here, but changing the code is another worktree's job. File the discrepancy, do not fix it.
- **A change would fall outside this worktree.** This file only. Anything else is a suggestion.
- **Something outward-facing or irreversible needs approval** — posting to X, publishing, deleting
  a user's work, spending above a threshold. Those are user decisions by design and must never be
  documented as something the product does on its own.
- **Two requirements contradict each other.** "Simpler and more visual" and "every status must carry
  a word, not just a colour" look like a contradiction and are not; if a real one appears, say which
  two rules collide.

---

## 15. Glossary

Words this guide uses, and words it deliberately avoids.

| Word | What it means here |
|---|---|
| **Agent** | A worker. It has a name, a job, one area it may change, and a running cost. |
| **Area** (work area) | The part of the project one agent is allowed to change. Shown as a colour. |
| **Capability** | What kind of thing an agent can make: text only, text plus images, text plus voice, or everything. It decides the agent's maximum possible cost. |
| **Brief** | The project description every agent in the project follows. One per project. |
| **Suggestion** | An agent asking your permission to change something outside its own area. |
| **Publish** | Moving an agent's approved work into the finished deliverable. |
| **Estimated cost** | A figure worked out from usage at published prices, not a bill. The real charge differs. |
| **Measured cost** | A figure the provider returned with the response. More trustworthy than an estimate. Not yet distinguished in the product. |
| **Experience** | A generated thing with voice and video in it, as opposed to a document or a deck. |
| **Prompt** | A saved line of text you reuse. |
| **Skill** | A folder of instructions with a short description telling an agent when it applies. |
| **Workflow** | An agent's working pattern: how many times it goes round and when it stops. |

Words the product uses today that will not appear in the finished interface, listed so that anyone
reading the current screens knows what they were looking at:

| Word on screen today | What it was, in plain language |
|---|---|
| **Requirement** | One tracked piece of work. Becoming "piece". |
| **Worktree** | A private copy of the project folder given to one agent. Becoming "area". |
| **Branch** | A named line of changes in version control. Disappearing entirely. |
| **Merge** | Folding one agent's changes into the main copy. Becoming "publish". |
| **Diff** | A line-by-line list of what text changed. Becoming a preview of the actual slide or document. |
| **Token** | The unit a text model is billed in. Never shown to a user; only dollars are. |
| **Session** | One continuous conversation with one agent. Becoming "conversation". |
| **MCP / ACP** | The two wire protocols the product speaks — one to give agents tools, one to drive the engine. Never shown to a user, and never named in the interface. |
| **Repository** | The folder holding the project's files. Becoming "project folder", and mostly hidden. |
