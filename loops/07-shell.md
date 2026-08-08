# Shell and Identity — Loop Operating Document

This is the instruction set for one iteration of the shell loop. Read this file first, act, then
stop. It is deliberately short; the documents it points at hold the detail.

| Document | Role |
|---|---|
| `loops/07-shell.md` | This file. The shell contract and the shell checklist, items SHELL-001…SHELL-017. |
| `grok-workspace.md` | The product contract. Read §2.2 (the Xcode idiom), §5 (the pages), §11 (theming), §12 (onboarding), §18 (partition and merge order). |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. Read once; never edit. |

This loop owns the frame the product is seen through: the three-region layout, the launch path that
opens it, the two themes it renders in, the page slots the other seven worktrees mount into, and the
name on the front. It owns no domain logic. There are three headline pages — **AGENTS**, **ASSETS**,
**DESIGN DOCUMENTS** — and two secondary ones, **USERS** and **X**. This worktree builds none of
them. It builds the thing they appear inside.

**This worktree merges first.** Every other worktree renders inside this shell, so the contract in
§3.3 is not something to write up at the end — it is the first artifact of the first iteration, and
seven other agents are blocked until it exists. A shell that is beautiful and late is worse than a
shell that is plain and published on day one.

**What this surface contributes to the canonical demo.** The user types "I need to do this sales
presentation" and four agents — Research in the design document, X on the account, Slides with
Imagine capability, Video with voice plus Imagine — go to work. The shell's whole contribution is
that this is legible at a glance: the navigator names three places and no jargon, the design
document is one click from the front door, the toolbar carries one number that goes up, ASSETS
shows every deliverable landing, and the inspector shows that the Slides agent has Imagine
capability while Research does not. If a shell decision makes any of those five harder to see, it is
the wrong decision.

---

## 0. Your boundary

**You are in a git worktree, on your own branch, in a parallel build.** You are not in the main
checkout. Seven sibling worktrees are editing this repository at the same time on sibling branches.
An edit you make outside the list below is not "a small fix" — it is a merge conflict in someone
else's file, resolved at reconciliation by someone who does not know why you made it.

```text
worktree   07-shell
branch     pivot/shell
handoff    loops/handoff/pivot-shell.md
merge slot FIRST. 07-shell → 01/02/03 → 04/05/06 → 08.
```

**Files and directories you own — create, edit and delete freely:**

```text
client/src/main.tsx                    the boot file: theme stamp, router mount, shell mount
client/src/index.css                   the token blocks, and every hardcoded dark value in it
client/tailwind.config.js              darkMode:'class', the var-backed palettes, the ink ramp
client/src/control-room/shell/**       new — the whole shell: regions, routing, page registry,
                                       toolbar, Tools overlay frame, first-run greeting,
                                       guide affordance, theme provider, contract.ts
bin/grok                               new — the POSIX sh shim (§3.5)
bin/grok-workspace.ts                  new — the launcher (§3.5)
loops/07-shell.md                      this file
loops/handoff/pivot-shell.md           your requests to reconciliation — yours alone
```

`bin/grok` and `bin/grok-workspace.ts` are **new files that the partition does not assign and no
sibling document names** — verified with `grep -rn "bin/grok\|bin/openui" loops/`, which returns only
`./node_modules/.bin/grok --version` in every sibling's environment check. You may create them. You
may **not** edit `bin/openui.ts`, which is the existing launcher and therefore shared; its retirement
is a handoff request (§0.2).

**Files you must not touch, and why.** Each belongs to a worktree that is editing it right now.
Read them — you must, because your job is to leave a hole exactly the right shape — but an edit here
is a conflict at best and a silent contradiction at worst:

```text
server/services/workArea.ts          01-agents  areas, colours, agent↔area binding
server/services/boundary.ts          01-agents  the PreToolUse hook and write-time refusal
server/services/agentTeam.ts         01-agents
server/services/agentRegistry.ts     01-agents
server/routes/agents.ts              01-agents
client/src/control-room/agents/**    01-agents  exports AgentsPage
server/services/assetStore.ts        02-assets
server/routes/assets.ts              02-assets
client/src/control-room/assets/**    02-assets  exports AssetsPage
server/services/designDoc.ts         03-design-docs
server/services/presence.ts          03-design-docs
server/routes/designDocs.ts          03-design-docs
client/src/control-room/designdoc/** 03-design-docs  exports DesignDocumentsPage
server/services/xai/**               04-generation  no api.x.ai call belongs in this worktree
server/services/render/**            04-generation
server/routes/generation.ts          04-generation
server/services/software/**          05-software
client/src/control-room/software/**  05-software  exports SoftwarePanel
server/services/promptLibrary.ts     06-tools-cost
server/routes/library.ts             06-tools-cost
server/services/usageAccounting.ts   06-tools-cost
server/services/costLedger.ts        06-tools-cost
client/src/control-room/tools/**     06-tools-cost  the CONTENTS of the Tools panel
server/services/auth.ts              08-users-x
server/routes/users.ts               08-users-x
server/services/x/**                 08-users-x
client/src/control-room/users/**     08-users-x
```

The Tools panel is the one that will tempt you. **You own the overlay: its mount, its route, its
scrim, its Esc handling, its position over MAIN. 06-tools-cost owns everything inside it.** The line
is the component boundary in §3.3, and it is not negotiable in either direction.

### 0.1 The hot-file protocol

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

When your work needs a change in one of them, you do **not** make it. You append a precise request
to `loops/handoff/pivot-shell.md` — a file only you own — stating the file, the exact change, the
reason, and the signature or event shape other worktrees will depend on. A single reconciliation
pass applies every request at the end.

`grok-workspace.md` §18.3 adds: **treat an unassigned shared file as hot.** For this worktree that
catches `client/index.html`, `client/src/App.tsx`, `client/src/components/**`,
`client/src/control-room/types.ts`, `server/services/grokDetect.ts`, `README.md` and `FEATURES.md` —
every one of which the previous revision of this document assumed was ours. It is not. Each becomes
a handoff request with a diff attached.

This lands hardest on one file. **`ControlRoomApp.tsx` is hot, and it is exactly the file a shell
would naturally be written in.** So it is not written there. The shell lives entirely in
`client/src/control-room/shell/**` and exports one component; `ControlRoomApp.tsx` becomes a
five-line file at reconciliation, and that replacement is request R-3 below. Design so that the one
edit is trivially reviewable:

* **Do not put a fetch in `useControlRoom.ts`.** The shell needs almost no data — the project name,
  the running spend, and the Grok-detection banner. Read them through your own small hook in
  `client/src/control-room/shell/useShellData.ts` against endpoints that already exist. File a
  request for a shared `subscribeControlRoom()` seam and let reconciliation collapse the sockets;
  do not pre-empt it.
* **Do not import a sibling page directly.** Pages arrive through the registry in
  `client/src/control-room/shell/pages.ts` — a file you own, so each sibling's single line lands in
  your file at reconciliation instead of eight worktrees editing one import block.
* **Do not add a type to `server/types/`.** The shell adds no server type at all. If you think it
  needs one, you have put domain logic in the frame.

**What you leave behind for reconciliation** is §9. Write it as you go, not at the end.

### 0.2 Requests filed on iteration 1

Seed `loops/handoff/pivot-shell.md` with these before writing a line of code. They are known now,
and three of them block other people.

```text
R-1  PUBLISH  loops/handoff/pivot-shell.md
     The full text of §3.3 — the page slot interface, the theme token names, the URL scheme —
     copied verbatim into the handoff file on iteration 1, before any shell code exists.
     Seven worktrees consume it. It is the only request that is urgent rather than deferred.

R-2  client/index.html
     line 7:  <title>OpenUI - AI Agent Canvas</title>  ->  <title>grok-workspace</title>
     head:    add the theme boot script of §3.7, verbatim, BEFORE the module script tag.
     Reason:  without the boot script every load flashes the wrong theme, worst for exactly the
              user the feature exists for. It cannot live in main.tsx: the bundle has not run.

R-3  client/src/control-room/ControlRoomApp.tsx
     Replace the whole file with:
         export { WorkspaceShell as ControlRoomApp } from "./shell/WorkspaceShell";
     Reason:  the region layout, routing and page selector are in shell/. Leaving the old
              six-tab shell in place means two shells in one build.
     Depends:  R-4 must be applied in the same commit, or the page registry has no pages.

R-4  client/src/control-room/shell/pages.ts   (MY file — listed so reconciliation knows where)
     One line per page, replacing the placeholder:
         agents:     main: AgentsPage            from ../agents/AgentsPage
         assets:     main: AssetsPage            from ../assets/index
         designdocs: main: DesignDocumentsPage   from ../designdoc/index
         users:      main: UsersPage             from ../users/index
         x:          main: XPage                 from ../x/index          (08, may be absent)
         tools:      panel: ToolsPanel           from ../tools/index
     Reason:  one edit, one file, no conflict. Until applied, each slot renders NotMergedYet.

R-5  package.json
     name        "@fallom/openui"                    -> "grok-workspace"
     description "Visual canvas UI for managing AI…" -> the one-line product description
     author / repository / bugs / homepage / keywords -> this product, not JJ27/openui
     bin         { "openui": "./bin/openui.ts" }     -> { "grok-workspace": "./bin/grok-workspace.ts" }
     Reason:  the bin name is the install-time collision surface with @xai-official/grok's own
              `grok`. It must never be "grok".

R-6  server/services/grokDetect.ts
     grokBinaryCandidates() must skip any candidate whose realpathSync equals the realpath of the
     installed shim. Patch and failing test attached in the handoff file.
     Reason:  the shim is on PATH ahead of the real binary, and grokBinaryCandidates ends in the
              bare name "grok" resolved via PATH (grokDetect.ts:67). Detection would return the
              shim, every ACP session would spawn an extra process, and the day the argv scan
              changes, agent start-up breaks looking like a Grok bug. See §3.5.

R-7  client/src/control-room/types.ts
     STATUS_CLASSES and STATUS_DOT (types.ts:61-77) move to the status tokens of §3.7.
     18 strings, mechanical, listed verbatim in the handoff file.
     Reason:  one file is the single source of status colour for the whole application. Migrating
              it centrally is the difference between 18 edits and 300.

R-8  client/src/App.tsx  /  client/src/components/**  /  FEATURES.md  /  README.md
     Deletions, pending the owner's decision (§6). Two hazards recorded for whoever applies them:
       (a) client/src/App.tsx:14 is the ONLY import of "@xyflow/react/dist/style.css" in the repo.
           Deleting or lazy-loading the legacy shell strips React Flow's CSS from anything that
           still uses it. Move or delete that import in the same commit as the deletion.
       (b) scripts/audit/docs.mjs fails the build on a dangling backticked citation in README.md,
           HANDOFF.md, loopdesign.md or VERIFICATION.md. Delete FEATURES.md and every backticked
           reference to it in one commit, or the gate goes red for an unrelated reason.

R-9  server/services/taskBriefing.ts:60  /  server/services/planner.ts:58
     Both put the literal string "openui-project" into every agent's briefing prompt. The brand is
     inside the model context, not just the UI. Not urgent, not cosmetic, not this loop's file.
```

**The identity strings this loop does not rename**, even though they say "openui": the `OPENUI_*`
environment variables, the `~/.openui` data directory, the `x-openui-*` HTTP headers, the
`openui-project` MCP server name, the `openui-agent` git author, and the localStorage keys
`openui-active-canvas` / `openui-sidebar-pct` / `openui-notifications`. Every one is persisted state
or a wire-level contract with a migration attached. This loop retires the **browser-visible** and
**launch-visible** identity only. §3.6 keeps the inventory so the migration is somebody's job rather
than nobody's.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui          # your worktree checkout of branch pivot/shell
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

Confirm the environment is intact. If any check fails, fix that before anything else:

```bash
./node_modules/.bin/grok --version        # expect: grok 1.0.0 (3cd0d0cbcebe)
bun run verify                            # expect: exit 0
bun run audit                             # expect: 0 orphans, every endpoint covered, every
                                          #         cited file resolves
```

**A red gate is always the highest-priority work**, ahead of any checklist item. Capture the output
to a file, never `>/dev/null` — a red gate you cannot read is a red gate you cannot fix.

Three gate hazards specific to this loop:

- **The docs audit fails on a dangling citation.** `scripts/audit/docs.mjs` resolves every
  backticked path in `README.md`, `HANDOFF.md`, `loopdesign.md` and `VERIFICATION.md`. Renaming or
  deleting a file those four name in backticks turns the gate red for a reason that has nothing to
  do with your change.
- **The theme has no tests, and the suite will not tell you.** Only two class assertions exist in
  the whole control-room suite — `client/src/control-room/diffView.test.tsx:97` asserts
  `overflow-auto`, and `client/src/control-room/controlRoom.test.tsx:62` deliberately sets
  `badge.className = ""` to prove the status text survives without colour. Neither asserts a colour.
  A green suite says nothing about whether the light theme is readable. Look at it.
- **You merge first, so you build against holes.** Every page slot is empty in your worktree. A
  shell that only renders correctly once siblings land is a shell nobody can test. SHELL-017 exists
  for this: the shell must be fully exercisable with zero sibling branches merged.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 17 NOT TESTED
Nothing in SHELL-001…SHELL-017 has been attempted. The shell that exists is the control room's
three-column six-tab shell (client/src/control-room/ControlRoomApp.tsx), reachable only by typing
?view=control-room into a browser.
```

What exists, verified by reading it:

```text
client/src/main.tsx:12-15     the whole "launch": a URLSearchParams read choosing between
                              <App/> (the legacy OpenUI canvas) and <ControlRoomApp/>
client/src/main.tsx:25-33     a fixed bottom-right pill, data-testid="view-toggle"
ControlRoomApp.tsx:17-24      the six tabs: agents, canvas, document, plan, reviews, conversations
ControlRoomApp.tsx:29         the "router": useState<Tab>("agents")
ControlRoomApp.tsx:215        <aside className="w-72 …">    requirement list
ControlRoomApp.tsx:227        <main …>                       tab strip + one of six panes
ControlRoomApp.tsx:346        <aside className="w-80 …">     requirement detail
ControlRoomApp.tsx:118-190    five stacked banners: team-error, repo-missing, control-room-error,
                              budget-alert, auth-alert — plus SetupBanner above them, six in all
client/src/index.css:17-24    html, body pinned to #0f0f0f / #fafafa with overflow:hidden
client/src/index.css          174 lines, of which 30 carry !important
client/tailwind.config.js     38 lines, three literal-hex dark palettes, NO darkMode key
client/index.html:7           <title>OpenUI - AI Agent Canvas</title>
bin/openui.ts:13              PORT 6969
server/index.ts:14,76         PORT 6968, hostname 127.0.0.1 unless OPENUI_HOST is set
server/index.ts:82-89         /ws/control-room upgrade; projectId is required
```

So: the region skeleton is real and reusable, the launch path is a query parameter, the theme is
nailed to the document, the ports have drifted, and the product is called OpenUI.

Two counts worth having in your head before you start:

```text
zero    lucide-react or framer-motion imports in client/src/control-room/  (both are dependencies
        and are used heavily in the legacy shell). Every "icon" in the control room is a literal
        character: ✓ ○ ✕ × → ←
zero    responsive breakpoints in the control room. Fixed chrome is w-72 + w-80 = 608px, or 736px
        with the session drawer open. On a 1280px laptop the main area gets 544px, and
        index.css:23 sets overflow:hidden on body — so what does not fit cannot be scrolled to.
```

### 2.1 What the owner assumed that is not true

Stated plainly, because designing quietly around any of these produces a plan that reads correct and
cannot be built.

1. **`grok --common_version` does not work and cannot be made to work from this repository.**
   Verified by running it:

   ```text
   $ ./node_modules/.bin/grok --common_version
   error: unexpected argument '--common_version' found
     tip: to pass '--common_version' as a value, use '-- --common_version'
   Usage: grok [OPTIONS] [PROMPT] [COMMAND]
   $ echo $?
   2
   ```

   `grok` is a separate Rust program. Its argument surface is a clap definition in
   `.refs/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs`; clap rejects unknown flags.
   `.refs/grok-build` is a read-only reference clone of an upstream mirror that refuses external
   contributions, and this repository does not build it — the binary arrives from `node_modules` via
   `@xai-official/grok` (`server/services/grokDetect.ts:33`). We cannot add a flag, we cannot add a
   subcommand, and no plugin, skill or hook can add a top-level CLI flag either: a plugin adds slash
   commands, skills, agents, hooks and MCP servers, and none of those is argv. §3.5 says what we
   build instead. It is a wrapper. Do not write it up as anything else.

2. **There is no UI to overlay.** Grok Build is a ratatui terminal application. Its own word
   "overlay" means a TUI view stacked over the scrollback — that is what `grok dashboard` does. A
   browser page cannot be laid over a terminal application. In this product "overlay" means the
   Tools panel over MAIN (§3.3), and nothing else. `--common_version` does not decorate the running
   TUI; it starts a different program and does not launch the TUI at all.

3. **The visual idiom is Apple Xcode; the underlying tool is not.** Xcode is the reference for the
   *layout* — navigator, editor, inspector — and nothing more. We are not overlaying Xcode, not
   embedding in it, and not shipping a native app. The only real Xcode↔Grok relationship in the tree
   runs the other way: Grok Build can be embedded *inside* Xcode over ACP
   (`.refs/grok-build/crates/codegen/xai-acp-lib/src/normalize.rs:19`). Say "Xcode-style" and mean
   layout.

4. **"Styled like the underlying tool" is currently false in both directions.** The legacy shell
   uses the semantic tokens `bg-surface` / `border-border` / `bg-canvas` (198 usages across 11
   files); the control room uses **zero** of them and hardcodes `bg-neutral-950`, `text-white/60`,
   `border-white/10`. Converging on tokens and adding a light theme are the same job (§3.7), not two.

5. **Dark/light is not a config flag.** There is no `darkMode` key in `client/tailwind.config.js`,
   no `dark:` variant anywhere in the codebase, no `prefers-color-scheme` rule, no CSS custom
   property, and no theme context. `client/src/index.css:17-24` pins the background on `html, body`
   itself and 30 of its 174 lines carry `!important`, which no Tailwind class can beat.

6. **"Greeting" is an overloaded word in this repository.** `Greeting Service` is the name of the
   demo fixture project (`client/src/control-room/uiChecklist.test.tsx:20`) and of the sample project
   `bun run demo` builds. The onboarding feature in §3.8 is the **first-run greeting**. Never call it
   a greeting service, and never key a test on the string "greeting" alone.

7. **Slides cannot be delegated to Grok, and the shell is where that leaks into copy.** The two
   surfaces that appear to generate decks — the "Grok for PowerPoint" Microsoft 365 add-in and
   grok.com producing a downloadable `.pptx` — are both **user interfaces, not APIs**: an add-in
   panel inside Office, and the consumer chat product. Neither is callable from a server. There is
   no xAI slide or document generation API at all. We generate slide *content* with the chat API as
   structured JSON and render the `.pptx` ourselves with a Node library (04-generation). Consequence
   for this worktree: the greeting and the guide may say the product **makes** slides; neither may
   say or imply that Grok makes them, and no shell control may offer to hand a deck to Grok. Video
   is the opposite case — the Imagine video API is real, asynchronous and callable from a server —
   but it is still 04's, still wave 2, and still not a button the shell ships early.

8. **The previous revision of this document claimed files that are not ours.** It listed
   `client/index.html`, `package.json`, `README.md`, `FEATURES.md`, `ControlRoomApp.tsx`,
   `client/src/components/**` and `server/services/grokDetect.ts` as editable here. Under
   `grok-workspace.md` §18.2 they are not. Everything that used to be an edit is now a handoff
   request (§0.2), and one consequence is real work removed from this loop: **the 243 white/neutral
   class tokens in the legacy control-room components are not this worktree's migration.** Those
   components are being replaced wholesale by 01/02/03. Your job is to make the token layer exist,
   define the ramp, and fence new code so it cannot reintroduce a raw colour (SHELL-010). Migrating
   dying components would be work performed twice and thrown away once.

---

## 3. What must be built

### 3.1 The three regions

One layout, on every page. Borrowed from Xcode because the shape is already understood by anyone who
has used a Mac application, and because it separates *what you are looking at* from *what you are
looking at it with*.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR   grok-workspace · <project name>   ·  spend $1.42 / $10.00  ·  ? ☾  │
├────────────────┬───────────────────────────────────────┬─────────────────────┤
│ NAVIGATOR      │ MAIN                                  │ INSPECTOR           │
│  (w 288, min   │  (flex, min 480)                      │  (w 320, min 260,   │
│   220, collap- │                                       │   collapsible)      │
│   sible)       │                                       │                     │
│                │                                       │                     │
│ ▸ AGENTS       │  the thing itself:                    │ properties of what  │
│ ▸ ASSETS       │    the agent board,                   │ is selected in MAIN │
│ ▸ DESIGN DOCS  │    an asset previewed as itself,      │ — never a second    │
│ ──────────     │    a design document with live        │ navigation surface  │
│ ▸ Users        │      agent highlighting               │                     │
│ ▸ X            │                                       │                     │
│                │                                       │                     │
│ ── the current │                                       │                     │
│    page's list │                                       │                     │
│                │                                       │                     │
├────────────────┴───────────────────────────────────────┴─────────────────────┤
│ ⌥ TOOLS PANEL — slides up over MAIN, over any page, dismissible with Esc     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Rules, each with the failure it prevents:

- **The navigator holds the pages and the current page's list. Nothing else navigates.** Today
  navigation is a six-tab strip inside MAIN (`ControlRoomApp.tsx:17-24`) *and* a requirement list in
  the left rail *and* a session drawer that displaces the inspector. Three navigation surfaces in one
  screen is why the current shell reads as a developer tool.
- **The three headline pages sit above a divider; Users and X sit below it.** Secondary means the
  product is coherent without them, not that they are half-built. The divider is how a first-time
  user knows where to look, and it costs one border.
- **The inspector shows properties, never navigation.** An inspector that can change what MAIN
  displays is a second navigator, and the user loses their place.
- **Every region is collapsible and resizable, and the widths persist.** The current shell is fixed
  at 608px of chrome, 736px with the session drawer open, with `overflow:hidden` on `body`
  (`client/src/index.css:23`) so what does not fit cannot be scrolled to.
- **Location is in the URL** (§3.4).
- **The toolbar carries exactly four things**: where you are, the project, the running spend, and the
  two always-available controls (guide, theme). Spend is on the toolbar on every page because a
  60-second generated experience costs roughly **$5.52 in media alone** — three orders of magnitude
  more than a text turn — and a figure the user has to navigate to is a figure they will not see
  before the retry loop that costs $50.
- **One notification surface, not six.** The six stacked banners collapse into a single dismissible
  stack with one line of plain language each. On a fresh install with no Grok binary and a bad
  project, today's first screen is a wall of red 11px text.

### 3.2 The five pages and the Tools panel

| Page | Rank | Navigator holds | MAIN holds | Inspector holds | Built by |
|---|---|---|---|---|---|
| **AGENTS** | headline | the work areas, colour-coded, one row each | the agent board — who is working, on what, what it has cost | the selected agent: capability, area, boundary, budget | 01-agents |
| **ASSETS** | headline | the five asset types and their deliverables | the selected asset previewed **as itself** — a deck as slides, a table as a grid, an app as a preview | the asset: version, which agent produced it, cost, provenance | 02-assets |
| **DESIGN DOCUMENTS** | headline | every design document, with which project follows it | the document, with live per-agent line highlighting and the agent conversation | the document: version, followed-by, presence rows with staleness | 03-design-docs |
| **Users** | secondary | the user list | the selected user | roles and approval limits | 08-users-x |
| **X** | secondary | accounts and drafts | the draft or thread | posting target, media attached | 08-users-x |

Three things the shell must get right about this table and nothing else:

* **DESIGN DOCUMENTS is the front door.** It is where work is declared, and the product contract is
  explicit that a new user who does not understand that within one screen has been failed by the
  page regardless of what else is correct. The shell's contribution is that the page is one click
  from launch, that the first-run greeting names it, and that a project with no design document says
  so rather than showing an empty grid.
* **A design document is not a document asset.** They are different objects with different stores on
  different pages. The navigator must never list them together, the guide must never call them the
  same thing, and no shell affordance may move one to the other. Slides and tables are rendering;
  the document is the only thing that declares work.
* **Five asset types, not four media**: documents · slides · tables · workflows · software. Software
  means websites and apps built for a non-technical user, in the manner of Lovable. Generated images,
  clips and narration are *component* assets referenced by a deliverable, never a sixth type. The
  greeting and the guide use exactly these five words.

The **Tools panel** is an overlay over MAIN, available on every page, holding prompts, skills and
workflows. It overlays rather than replaces because its whole purpose is to be applied to the thing
you are currently looking at; a panel you must navigate away to reach cannot be. Xcode's Library is
the same idea for the same reason.

This loop builds the panel's **mount, overlay behaviour, scrim, keyboard dismissal and route**, and
nothing inside it. Note before you start: the backend already exists and has never been called.
`server/routes/library.ts` is mounted at `/api/library` (`server/routes/api.ts:32`) and serves nine
endpoints across skills, prompts and workflows; `grep -rn "api/library" client/src` returns nothing.
Verify that yourself before repeating it — it is the most surprising fact in the area, and it belongs
to 06, not to you.

### 3.3 The contract this worktree publishes — write this first

**This is the deliverable that makes the parallel build possible.** It goes into
`loops/handoff/pivot-shell.md` and `client/src/control-room/shell/contract.ts` on iteration 1, before
the regions, before the theme, before the launcher. Seven worktrees are writing components against
it right now. After iteration 1 it changes **additively only** — a new optional field is free, a
renamed field is eight broken branches.

#### 3.3.1 The page slot interface

```ts
// client/src/control-room/shell/contract.ts
// PUBLISHED ITERATION 1. Additive changes only. Every field here is consumed by another worktree.

export type PageId = "agents" | "assets" | "designdocs" | "users" | "x";

/** Every page component receives exactly this. The shell passes nothing else, ever. */
export interface WorkspacePageProps {
  /** The active project. Never empty — the shell renders its own empty state instead. */
  projectId: string;
  /** The object selected in the URL for this page, or undefined. Opaque to the shell. */
  selectionId?: string;
  /** Change the selection. Writes the URL; the shell re-renders all three regions. */
  onSelect(selectionId: string | undefined): void;
}

export type WorkspacePageComponent = (props: WorkspacePageProps) => JSX.Element;

export interface PageDescriptor {
  id: PageId;
  /** Navigator label. Plain language. Never a jargon word, never an id. */
  label: string;
  /** URL segment: /agents, /assets, /designdocs, /users, /x */
  segment: string;
  /** headline pages render above the navigator divider; secondary below it. */
  rank: "headline" | "secondary";
  /** Required once merged. Renders into MAIN. */
  main?: WorkspacePageComponent;
  /** Optional. Renders in the NAVIGATOR beneath the page selector. */
  navigator?: WorkspacePageComponent;
  /** Optional. Renders in the INSPECTOR. Properties only — never navigation. */
  inspector?: WorkspacePageComponent;
}

/** The Tools panel overlays MAIN on every page. One component, three props. */
export interface ToolsPanelProps {
  projectId: string;
  section: "prompts" | "skills" | "workflows";
  onClose(): void;
}
export type ToolsPanelComponent = (props: ToolsPanelProps) => JSX.Element;
```

Five properties of this shape, each written down because each is a bug if it is missing:

- **A page that exports one component is already legal.** Every sibling document promises exactly
  one export taking `{ projectId }` — `AgentsPage`, `AssetsPage`, `DesignDocumentsPage`,
  `SoftwarePanel`. A function of `{projectId: string}` is assignable to `WorkspacePageComponent`,
  so those pages mount into `main` with **no change on their side**, get the full width, and the
  inspector collapses. `navigator` and `inspector` are opt-in later, without touching the mount line.
- **The three regions of a page communicate only through `selectionId` / `onSelect`.** There is no
  shared context, no shell-held page state, and no store the shell owns on a page's behalf. This is
  what makes "location is in the URL" structural instead of aspirational: a navigator row that
  selects an asset writes the URL, and the inspector reads it back.
- **The shell never imports a page module.** It imports `pages.ts`, which is mine. Reconciliation
  edits one file (R-4) rather than eight worktrees editing one import block.
- **A missing page is stated, never faked.** Until a branch merges, its `main` is undefined and the
  slot renders `NotMergedYet`, which says which branch builds this page and that it is not in this
  build. It never renders an empty list, a spinner, or a plausible-looking zero. This is the same
  rule `client/src/control-room/AgentCard.tsx` follows when it omits every field the server did not
  supply, applied one level up.
- **`projectId` is never empty.** A workspace with no project renders the shell's own first-run
  path (§3.8), not a page with a blank id. Pages therefore need no "no project" branch.

#### 3.3.2 The registry

```ts
// client/src/control-room/shell/pages.ts   — OWNED BY 07-shell. Reconciliation edits ONLY this file.
import type { PageDescriptor, ToolsPanelComponent } from "./contract";

export const PAGES: PageDescriptor[] = [
  { id: "agents",     label: "Agents",           segment: "agents",     rank: "headline"  },
  { id: "assets",     label: "Assets",           segment: "assets",     rank: "headline"  },
  { id: "designdocs", label: "Design Documents", segment: "designdocs", rank: "headline"  },
  { id: "users",      label: "Users",            segment: "users",      rank: "secondary" },
  { id: "x",          label: "X",                segment: "x",          rank: "secondary" },
];

export const TOOLS_PANEL: ToolsPanelComponent | undefined = undefined;
```

Note what is deliberately absent: a `component` field with a placeholder import of a path that does
not exist yet. That would fail the client typecheck in this worktree and every worktree that merges
before its sibling. An optional field that is `undefined` typechecks today and takes one line at
reconciliation.

#### 3.3.3 The theme tokens

Published as **names**. Every other worktree writes token names in class strings and defines no hex
anywhere. If a page needs a colour this list does not have, that is a handoff request to me, not a
literal.

```text
ground     canvas · surface · surface-hover · surface-active · border · border-strong
ink        ink · ink-muted · ink-faint · ink-ghost            (four steps; see §3.7)
accent     accent · accent-muted                              (GrokNight magenta / GrokDay purple)
status     status-working · status-waiting · status-needs-review ·
           status-complete · status-idle · status-failed
           each resolving three utilities: bg-*, text-*, border-*
areas      area-1 … area-6, each with:
             bg-area-N        tile and row fills
             text-area-N      the area name
             border-area-N    the row accent bar
             gutter-area-N    the design-document line highlight (§4.3 of the contract)
```

Two rules that come with the tokens, and they are the reason the tokens exist:

- **Status is never conveyed by colour alone**, in either theme. Every status renders a text label;
  the colour element is `aria-hidden`. This is not a preference — `server/types/agent.ts` states it
  at the top of the file, `client/src/control-room/types.ts:46-50` repeats it, `AgentStatusBadge.tsx`
  documents it at the point of rendering, `statusLabel()` (`types.ts:79-83`) throws rather than
  render an empty badge when a new status appears server-side, and `controlRoom.test.tsx:62` blanks a
  badge's `className` to prove the meaning survives without colour. Four independent defences.
- **`gutter-area-N` is the hardest token in the set and must be chosen, not computed.** It is the one
  place in the product where colour carries meaning at low opacity: the design-document line
  highlight. A fill that reads against near-black is frequently invisible against `#f5f5f5`. Pick
  both ends by hand, check all six against both grounds, and remember that every presence row also
  carries a text label, so a failure here is ugly rather than wrong.

#### 3.3.4 The deep-link helper

```ts
export function workspaceUrl(page: PageId, selectionId?: string, tools?: "prompts"|"skills"|"workflows"): string;
```

Exported because an agent notification, a cost alert and a presence event all need to point at the
thing they are talking about. A notification that cannot be clicked is a notification the user reads
once and stops reading.

### 3.4 Routing

`ControlRoomApp.tsx:29` keeps the current tab in a bare `useState`. With five pages, a selected
object per page and a Tools panel, that means no deep link, no browser back, and no way for an
agent's notification to point at anything.

```text
/agents                      /agents/:agentId
/assets                      /assets/:assetId
/designdocs                  /designdocs/:docId
/users                       /users/:userId
/x                           /x/:draftId
?tools=prompts|skills|workflows      the Tools overlay, on any of the above
```

The Tools panel is a query parameter and not a path segment because opening it must not lose the page
underneath — that is the entire argument for it being an overlay. Esc removes the parameter and
restores the page unchanged.

`/` redirects to `/designdocs` when the project has at least one design document, and to the
first-run path otherwise. The front door is where work is declared.

**No router library decision is recorded.** `react-router` is not in `client/package.json` today, and
adding a dependency is a `package.json` change and therefore a handoff request. **Unverified:**
whether to add `react-router-dom` or hand-roll ~80 lines over `history.pushState` + `popstate`. Check
`client/package.json` first, then decide, and record which — a hand-rolled router that later collides
with a library someone else added is a merge cost this partition exists to avoid.

### 3.5 The launch flag, end to end

**Decided:** the workspace opens from the grok terminal as `grok --common_version`.

**True:** that command errors today with exit code 2 (§2.1), and we cannot change the program that
errors.

**Therefore:** we own a `grok` on the user's PATH, ahead of the real one. It is a shim. Everything it
does not recognise it hands to the real binary, unchanged.

#### The three candidate implementations, and why one wins

```text
(a) a shim named `grok` ahead of the real binary on PATH   ← chosen
    the only implementation in which the decided command works as typed.

(b) a separate command, `grok-workspace`
    honest, zero risk, and not the decided spelling. Keep as the fallback if the owner refuses
    PATH shadowing (§6). Note R-5 installs this name as the package `bin` regardless — the
    npm-visible command is never "grok".

(c) a grok plugin: slash command, skill, or SessionStart hook
    rejected. A markdown slash command injects a prompt; it cannot start a server. A SessionStart
    hook can run a command, but it fires on every session, only after the TUI has already started,
    and it never gives us the spelling. A hook that opens a browser on every `grok` is a defect.
```

#### The shim, precisely

Two files, and the split between them matters:

```text
bin/grok               POSIX sh. Scans argv. Two exec targets. No interpreter start-up cost on the
                       ordinary path, and a true exec() so job control, signals, the TTY and the
                       exit code are the real binary's, not ours.
bin/grok-workspace.ts  Bun. Only ever reached on the --common_version branch.
```

```sh
#!/bin/sh
# Installed at ~/.grok-workspace/bin/grok, which the user prepends to PATH.
# REAL_GROK is written at install time as an ABSOLUTE PATH. Never resolved by name.
REAL_GROK=$(cat "${GROK_WORKSPACE_HOME:-$HOME/.grok-workspace}/real-grok-path")
for a in "$@"; do
  [ "$a" = "--" ] && break                 # everything after -- belongs to the wrapped command
  if [ "$a" = "--common_version" ]; then
    exec "${GROK_WORKSPACE_HOME:-$HOME/.grok-workspace}/bin/grok-workspace" "$@"
  fi
done
exec "$REAL_GROK" "$@"
```

Four properties, each written down because each is a bug if it is missing:

- **The scan stops at the first `--`.** `grok wrap -- ./deploy.sh --common_version` must run the
  user's script, not open a browser. clap's own error message advertises `-- --common_version` as the
  way to pass the string as a value; a shim that ignores `--` breaks a documented escape.
- **`REAL_GROK` is an absolute path read from a file, never the name `grok`.** If the shim ever
  resolves `grok` through PATH it finds itself, and `grok` fork-bombs. This is the single most likely
  way to brick a user's terminal, and it costs one line to prevent.
- **Unrecognised argv is forwarded byte-for-byte, and the shim prints nothing.** `grok --version`
  under the shim must produce exactly the output it produces without the shim. A shim that adds a
  banner has changed every script that parses `grok`'s output.
- **`exec`, not spawn-and-wait.** With `exec` there is no residual process, the exit code is the real
  binary's, and Ctrl-C, Ctrl-Z and SIGWINCH reach the TUI. A Bun or Node shim cannot do this —
  neither has a supported `execve` on this platform — which is why the shim is `sh`. *If a future
  version of Bun exposes `execve`, a single-file shim becomes possible; that is unverified and must
  be checked against the installed Bun before anyone proposes it.*

#### Who owns which process

```text
process                                     owner        lifetime
─────────────────────────────────────────── ──────────── ─────────────────────────────────
bin/grok (sh shim)                          us           microseconds; exec()s and is gone
the real `grok` TUI                         xAI          the user's terminal session
                                            (unmodified)
bin/grok-workspace.ts (launcher, Bun)       us           until the server exits
the workspace server (Bun + Hono + WS)      us           one per machine, 127.0.0.1 only
the browser                                 the OS       until the user closes the tab
`grok … agent --always-approve stdio`       us           one per agent session; spawned by
  children                                               server/services/acpClient.ts
```

Read that table as the answer to "is the workspace an overlay on grok?" It is not. On the
`--common_version` branch the TUI is never started. The workspace is a sibling program that speaks to
the *same* binary through ACP, one child process per agent, exactly as the server does today. What
the flag buys is that a user who lives in the grok terminal reaches the common-user face without
being told to install or run something else.

#### Installation, and the two things it must not do

The shim shadows a vendor binary. That is not something to do behind the user's back.

```text
grok-workspace install-shim
  writes  ~/.grok-workspace/bin/grok
  writes  ~/.grok-workspace/real-grok-path   (the absolute path detection resolved)
  PRINTS  the single line to add to the shell profile, and does not edit the profile
  refuses to run if the resolved real binary is already inside ~/.grok-workspace/bin
```

It must not add itself to a shell profile without being asked, and it must not install into a global
npm bin directory where it would collide with `@xai-official/grok`'s own `grok`. `npm i -g` resolving
that collision by overwriting is how the real binary disappears. R-5 exists so the package's own
`bin` name is `grok-workspace`, never `grok`.

#### The detection bug this creates, and its fix

`grokBinaryCandidates` (`server/services/grokDetect.ts:61-69`) probes, in order, the project-local
`node_modules/.bin/grok`, then `$GROK_HOME/bin/grok`, then **the bare name `grok` resolved via
PATH** (`:67`). With the shim installed, that third candidate is the shim. `probe()` (`:71-79`) runs
`--version` on it, the shim execs the real binary, a valid version string comes back, and detection
reports `installed: true` with `binaryPath` pointing at the shim. Every ACP session then spawns
through an extra process for no reason, and the day the argv scan changes, agent start-up breaks in a
way that looks like a Grok bug.

The fix is one condition: skip any candidate whose `realpathSync` matches the realpath of the
installed shim. **`grokDetect.ts` is not this worktree's file.** Write the reproduction here — install
a shim into a temporary `GROK_WORKSPACE_HOME`, put it first on PATH, run detection, observe the shim
path — and attach the patch and the failing test to R-6. SHELL-004 records the reproduction and the
patch; it cannot read PASS inside this worktree, and saying so is the honest form of the item.

#### One server, not one per invocation

`grok --common_version` will be typed repeatedly, from different terminals. The launcher must:

1. read a lockfile under the data directory holding `{pid, port, startedAt}`;
2. if the process is alive, open the browser at its URL and exit 0 — do not start a second server;
3. otherwise pick a free port (do not assume 6968; `server/index.ts:14` defaults to it and
   `bin/openui.ts:13` uses 6969, and they have drifted), start the server, write the lockfile, and
   open the browser;
4. bind `127.0.0.1` and nothing else. `server/index.ts:73-76` already records why: the server exposes
   repository and agent control with no authentication.

A positional prompt survives: `grok --common_version "I need to do this sales presentation"` opens
the workspace with the first design document pre-filled with that brief. It is three lines and it
makes the canonical demo one command. Note what it fills: creating the first project now *means*
creating the first design document, so the prompt lands in the document, not in a project form.

### 3.6 Unwinding the OpenUI lineage

This repository is a fork of OpenUI, which was itself built for Claude Code. Both lineages are still
in the source, and the second is more misleading than the first — the onboarding overlay a new user
sees says *"Manage your Claude Code agents"* while the product drives Grok.

**Browser-visible and launch-visible identity, with who applies it:**

```text
client/src/main.tsx:8       comment: "the original OpenUI terminal canvas"        MINE
client/src/main.tsx:12-15   the ?view=control-room switch — deleted for routes    MINE
client/src/main.tsx:25-33   the floating "Open Control Room →" pill               MINE
client/index.html:7         <title>OpenUI - AI Agent Canvas</title>               R-2
package.json:2,4,5,7-14     name, description, author, repository/bugs/homepage   R-5
package.json:15-23          keywords, including "claude-code" and "opencode"      R-5
package.json:25-27          "bin": { "openui": "./bin/openui.ts" }                R-5
client/package.json:2       "name": "openui-client"                               R-5
OnboardingTour.tsx:226,234  <h1>OpenUI</h1> / "Manage your Claude Code agents"    §3.8 — replaced,
                                                                                  not renamed
README.md:1  FEATURES.md:1  the old product, described end to end                 R-8
```

The view toggle at `client/src/main.tsx:25-33` is the current product's honest admission that it is
two products in one page. Removing it is not cosmetic: it is the moment the workspace stops being a
second view of OpenUI and starts being the thing that is launched. Do it in the same commit as the
routes.

`FEATURES.md` describes a different product end to end and contradicts the current one. It should be
deleted rather than rewritten — but **deleting a tracked file is the owner's decision** (§6), and
`bin/openui.js` has been waiting on exactly that decision for eighty iterations. Ask once, in one
message, for all of them.

**Not yours, and not renamed here, listed so the migration is somebody's job:** `OPENUI_QUIET`,
`OPENUI_HOST`, `OPENUI_DATA_DIR`, `OPENUI_SESSION_ID`, `OPENUI_HOOK_LOG`,
`OPENUI_STARTUP_TIMEOUT_MS`, `OPENUI_POST_SIGNAL_DELAY_MS`; the `~/.openui` data directory and its
in-place migration in `server/services/persistence.ts`; the `x-openui-actor-id`,
`x-openui-actor-kind` and `x-openui-actor-doc-write` headers; the MCP server name `openui-project`;
the git author `openui-agent`; the localStorage keys `openui-active-canvas`, `openui-sidebar-pct`,
`openui-notifications`; and the DOM events `openui:toggle-help`, `openui:toggle-search`,
`openui:restart-tour`. Each is persisted state or a wire contract, and renaming one without its
migration loses a user's data or breaks the actor authorisation the MCP server depends on.

### 3.7 Theming

Only dark exists. Verified by counting, in the 18 non-test files of `client/src/control-room/`:

```text
text-white (incl. /NN opacity)     126      of which /NN opacity variants   109
bg-white/NN                         68
border-white/NN                     32
bg-neutral-950                       9
bg-neutral-900                       5
divide-white/NN                      3
                          ────────────
white / neutral subtotal           243
semantic colour (red/green/yellow/amber/blue/orange/gray)                    90
                          ────────────
TOTAL class tokens in the legacy control room                              333
```

Those 333 are **not this worktree's migration** (§2.1 item 8). They live in components 01/02/03 are
replacing. What is this worktree's is everything underneath them.

`client/tailwind.config.js` has **no `darkMode` key** — Tailwind 3 therefore defaults to `media`, so
`dark:` variants would follow the OS and not a switch, and there are zero `dark:` variants in the
codebase anyway. The three palettes are literal hex, and `boxShadow.node` / `node-hover` bake in
`rgba(0,0,0,.3)` and `.4` — drop shadows that only work on a dark ground. `client/src/index.css` is
174 lines of which **30 carry `!important`**, and `:17-24` pins `background:#0f0f0f; color:#fafafa`
on `html, body` itself. No Tailwind class can beat any of that; the CSS has to change first.

**The token layer.** `darkMode: 'class'`, and every colour in `client/tailwind.config.js` becomes
`rgb(var(--token) / <alpha-value>)` so opacity utilities keep working. Two `:root` blocks in
`client/src/index.css` supply the values. Source both palettes from Grok Build's own matched
first-party pair — `.refs/grok-build/crates/codegen/xai-grok-pager-render/src/theme/groknight.rs`
(bg `#0a0a0a`, main bg `#141414`, fg `#e1e1e1`, accent magenta `#bb9af7`) and `grokday.rs` (bg
`#f5f5f5`, main `#eeeeee`, fg `#262626`, accent purple `#7D4BC6`) — so the workspace and the terminal
read as one product rather than two.

**The ink ramp is the part that cannot be mechanical.** 109 of the 126 white usages are
`text-white/NN`: not colours, but four emphasis levels painted against an implicit black. There is no
mechanical light equivalent — `text-black/40` on white is a different perceptual contrast, and
several of the existing steps (`/25`, `/30`, `/35`) are already at or below WCAG AA *in dark*. Seven
opacity levels collapse into four semantic steps — `ink`, `ink-muted`, `ink-faint`, `ink-ghost` —
and both ends of each are chosen for contrast and measured.

**The migration this worktree actually performs:**

| Work item | Files | Edits |
|---|---|---|
| `client/tailwind.config.js` — `darkMode:'class'`, var-ify 3 palettes, add the `ink` ramp, the status set, the six area colours, var-ify 3 box-shadows | 1 | ~40 lines |
| `client/src/index.css` — the `html, body` pin, the React Flow `!important` block, the two scrollbar blocks, the glow keyframes, plus the two `:root` blocks | 1 | ~50 lines |
| `client/index.html` — the boot script (R-2) | 0 here | request |
| `client/src/control-room/types.ts` — `STATUS_CLASSES` / `STATUS_DOT`, 18 strings (R-7) | 0 here | request |
| `client/src/main.tsx` — the theme provider and control, plus retiring the toggle pill | 1 | ~30 lines |
| `client/src/control-room/shell/**` — every shell component written in tokens from the start | new | — |
| Theme persistence | **0 server files** — `PUT /api/settings` (`server/routes/api.ts:1492-1498`) `Object.assign`s arbitrary keys into an untyped config, so `{"theme":"light"}` needs no schema change | 0 | 0 |

**The boot script is not optional.** An inline script in `client/index.html` stamps the theme class on
`<html>` before the bundle loads. Without it every page load flashes the wrong theme, and the flash
is worst in exactly the case the feature exists for — a light-mode user on a dark default. It is R-2
because `client/index.html` is not ours, and it is the highest-priority request in the file.

Default behaviour: follow `prefers-color-scheme`, with a stored user override that wins **in both
directions** — a user who chose light keeps light when the OS goes dark. Grok Build's own `theme =
"auto"` does the same thing by polling OS appearance every 5s; the browser equivalent is the media
query plus an override, which is cheaper and identical in effect.

#### The standing rule: status is never conveyed by colour alone

Every status renders a text label. The colour is supplementary and is marked `aria-hidden`. The four
places this is already defended are listed in §3.3.3.

**A light theme makes this rule harder, and the pressure runs the wrong way.** In dark, the six
statuses are six hues at 15% alpha on near-black, which reads as six distinct washes. On white,
`text-green-400` and `text-yellow-400` fail contrast outright, so the instinct is to saturate — and
saturating converges the hues: green against teal, yellow against amber, orange against red. Two of
the six pairs collide at low saturation already. So: each status gets a *chosen* light pair, not a
computed one; the label stays; and "make it more visual" never means replacing a labelled pill with a
coloured dot. The area colour-coding on AGENTS and the gutter highlighting on DESIGN DOCUMENTS are
subject to the same rule — an area is identified by its name and its colour, never by its colour.

One finding to put to the owner rather than fix silently: in `client/src/control-room/types.ts:61-77`
`idle` is red and `failed` is orange. That reads backwards, and a light theme is when someone will
notice. Ask; do not swap.

### 3.8 Onboarding

Two separate things, and conflating them is the mistake to avoid: a **first-run greeting** shown
once, and a **welcome guide** that can be opened forever.

**The guide's content is not this worktree's.** It lives at `docs/USER-GUIDE.md` and is owned by the
`guide` worktree, which owns that file and no code at all. This loop owns the affordance: the `?` in
the toolbar, the `?` on each page header, the modal that renders the guide, the per-section anchors,
and the unread marker. Writing guide prose here means two copies that disagree within a week.

#### What exists, and whether it is reusable

`client/src/components/OnboardingTour.tsx` (383 lines) is a two-phase overlay portalled to
`document.body`: a welcome screen driven by a module-level `features` array, then a spotlight tour
that measures a target and cuts a hole around it. The **mechanism is worth keeping**: steps name a
target and the component finds `[data-tour="<target>"]`; `findNextVisible` skips any step whose
target is not in the DOM and calls `complete()` when none remain. That is precisely what a five-page
workspace needs, because on a fresh install most anchors do not exist yet.

The **content is not reusable at all**. The four feature cards are "Persist & Resume", "Fork
Conversations", "Search History" and "Visual Canvas" — the previous product. The title is `OpenUI`
(`:226`) and the subtitle is "Manage your Claude Code agents" (`:234`), which names a third product
neither of the other two is.

`client/src/components/HelpModal.tsx` (157 lines) is the reverse: the shell is reusable, the content
is exactly wrong. Portal, scrim, scrollable body, footer action, fully prop-driven. Its body is a
hardcoded keyboard-shortcut table listing `Alt+T` for a new canvas and `Cmd+K` for conversation
search. A non-technical user needs an explanation of what a page is for; a shortcut table is the
least useful possible content.

Neither is mounted in the control room. Both are imported only from the legacy shell
(`client/src/App.tsx`, `client/src/components/Header.tsx`), and all four `data-tour` anchors are in
the legacy shell; there are zero in `client/src/control-room/`.

**Decision: copy the mechanism into `client/src/control-room/shell/`; do not refactor the legacy
files.** The previous revision of this document planned to lift `features` and `STEPS` into props.
Under this partition `client/src/components/**` is unassigned and therefore hot, the files are
proposed for deletion in R-8, and the mechanism is roughly sixty lines. Refactoring a file that eight
agents may delete, to reuse sixty lines, is the wrong trade. Copy the targeting approach —
`querySelector`, skip-if-absent, complete-when-none-remain — and target the existing `data-testid`
attributes rather than adding `data-tour` ones. Those ids are asserted by
`client/src/control-room/uiChecklist.test.tsx`, so **do not rename them**; a renamed anchor breaks a
checklist test and a tour step at once, and only one of them tells you.

**Do not reuse the completion key.** `tourCompleted` is a single global flag, so a user who ever
finished the canvas tour already has `tourCompleted: true` and a new guide keyed on it would never
fire — for exactly the users most likely to be testing it. New keys, namespaced:
`workspaceGreetedAt` and `workspaceGuideSeen`. `PUT /api/settings` merges arbitrary keys into an
untyped config, so both cost zero server changes.

#### The first-run greeting

Shown once, full-page, on the first load after `grok --common_version` when `workspaceGreetedAt` is
absent. Not a spotlight — a spotlight over an empty workspace explains nothing, and worse, on a fresh
install with no project every anchor is missing, so `findNextVisible` would skip every step, call
`complete()`, mark it done, and the user would never see it again. The tour comes *after* the first
design document exists.

It says five things, in plain language, in this order, and nothing else:

```text
1  What this is        "Describe what you need in a design document. A team of agents does the
                        work, and you watch it happen in the document."
2  What it makes       Documents · Slides · Tables · Workflows · Software.
                        Five things, named, with one example each. Text, not buttons (see below).
3  Where things go     "Everything your agents produce lands on your Assets page."
4  What it costs       "Agents cost money as they work. The running total is always in the top
                        bar." — plainly, on the first screen, not in a settings page.
5  One button          "Write your first design document"
```

No feature grid, no jargon, no second button competing with the first. It does not mention
capabilities, boundaries or worktrees; the guide explains those at the moment the user is looking at
one.

Three constraints on that copy, each of which is a correctness rule rather than a style preference:

* **The single button creates a design document, not a project.** Creating the first project *is*
  creating the first design document. A greeting that offers a project form contradicts the product's
  central claim on the first screen the user ever sees.
* **The five types are named as text until the generators exist.** The build order puts slide,
  workflow/video and software generation in wave 2, after this shell and the three pages have merged
  and been tested. A greeting whose "Slides" card is a button that opens a generator that is not in
  the build is a fabricated affordance, which is the same defect as a fabricated cost figure.
* **Nothing in the greeting or the guide says Grok makes decks.** §2.1 item 7. The product makes
  slides; we render the `.pptx` ourselves. The two surfaces that look like a slide API are a
  Microsoft 365 add-in and the consumer chat product, neither callable from a server.

#### The welcome guide

Re-openable, sectioned, one entry per navigator page and per inspector section, rendered from
`docs/USER-GUIDE.md`. Reached three ways, and the third is the one people actually use:

1. the `?` in the toolbar, present on every page, opening the guide at its contents;
2. a `?` on each page's header, opening the guide scrolled to that page's entry;
3. the last line of the first-run greeting: "You can reopen this any time from the ? in the top bar."
   — a guide the user cannot find again was explained once and then taken away.

`workspaceGuideSeen` records which entries have been read so the `?` can carry a quiet dot on unread
ones. It never hides an entry that has been read.

### 3.9 Build order

Step 3 of §4 points at this table. Take the highest row that is not passing.

| # | Work | Why here | Items |
|---|---|---|---|
| 1 | **Publish the contract**: `shell/contract.ts`, `shell/pages.ts`, and R-1 into the handoff file | Seven worktrees are blocked. Nothing else you do this iteration is worth as much | SHELL-001 |
| 2 | The token layer: `tailwind.config.js`, `index.css`, the `<html>` boot script request, the status pairs request | Before any shell component is written, so no shell code is written twice | SHELL-009, 010, 011 |
| 3 | The region shell: navigator / main / inspector, resizable and collapsible, with real routes and the page selector | This is `WorkspaceShell`; everything downstream mounts into it | SHELL-007 |
| 4 | The five page slots, the `NotMergedYet` placeholder, and the Tools overlay frame | Frames only. Contents belong to other worktrees | SHELL-008, 017 |
| 5 | The shim, the launcher, the lockfile, and the `grokDetect` reproduction | Until the product opens the way it is meant to open, nothing can be demonstrated honestly | SHELL-002…006 |
| 6 | Identity: `main.tsx` strings, the view toggle, and the package/title/README requests | Needs the routes from row 3 before the toggle can go | SHELL-012, 013 |
| 7 | First-run greeting, then the guide affordance | The greeting names the five pages, so they must exist to be named | SHELL-014, 015 |
| 8 | The gate | Every iteration, not once | SHELL-016 |

**The owner's ordering is fixed and this table respects it.** The three pages are built and robustly
tested first; slide generation, workflow/video generation and software generation come after. For
this worktree that means one negative rule with teeth: **the shell ships no generation-facing
control before 04, 05 and 06 merge.** No "Generate deck" button, no video scrubber chrome, no render
progress bar, no preview frame with a spinner in it. The slots exist; the affordances do not.

The dependency this ordering deliberately accepts: **the shell and the three pages ship before the
cost ledger exists** (`server/services/usageAccounting.ts` DEFAULT_RATES holds only `gpt-4o`,
`gpt-4o-mini` and `gpt-4.1` — no Grok model — so unknown models return `costUsd 0` with
`rateKey null`, and every figure in the shipping product is very likely `$0.00`; there is no ledger,
only running totals, so no chart has source data). The toolbar's spend figure is therefore a figure
we cannot price in wave 1. It renders as **unknown**, with the model id, and never as `$0.00`. That
is the honest rendering of the truth now, and it becomes a real number in wave 2 with no shell change.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the **highest row in §3.9 that is not passing**.
4. Reproduce the current behaviour first — know what failure looks like before fixing it. For this
   loop that usually means opening the page in both themes, or running the command and reading its
   exit code.
5. Implement the smallest change that satisfies the requirement.
6. Write a test that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md`.
9. Append any cross-boundary need to `loops/handoff/pivot-shell.md`. Never edit across the line.
10. Commit with a message stating what was verified. Report honestly, including what did *not* move.

---

## 5. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each is
backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Rules that apply with particular force to a shell, each with the failure it guards against:

- **A partially-satisfied item is NOT TESTED, not PASS.** If one clause cannot be evidenced, say
  which clause and hold the item.
- **An item that completes at reconciliation is never PASS here.** SHELL-004, SHELL-012 and
  SHELL-013 all depend on a file this worktree may not edit. Their evidence is the reproduction, the
  exact patch, and the request id — recorded as BLOCKED-ON-RECONCILE, which is a real state and not a
  softer word for done.
- **A theme has no tests, so look at it.** Only two class assertions exist in the whole control-room
  suite and neither asserts a colour. Evidence for a theming item is a rendered screenshot of both
  themes plus a contrast figure for the four `ink` steps, the six statuses and the six area colours.
- **A launch path is proved by running the command, not by reading the script.** `grok --version`
  under the shim must be byte-identical to `grok --version` without it; `echo $?` after a failing
  `grok` must be the real binary's code. Diff the outputs; do not eyeball them.
- **A checker that cannot be made to fail on demand proves nothing when it passes.** Before trusting
  a "no raw colour token remains" grep or a "no OpenUI string remains" grep, plant one and confirm the
  check finds it. Four consecutive audits in this repository shipped with bugs in the checker itself,
  and in one case the first probe passed for accidental reasons and only the second exposed it.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. `AgentCard.tsx` omits every field the server did not supply, and this shell keeps doing
  that one level up: an unmerged page says it is unmerged, and an unpriced spend says unknown.
- **A passing test proves a unit works, not that anything calls it.** The whole `/api/library`
  surface is tested and has never been called by a browser. Before marking a shell item PASS,
  confirm the code is reachable from the running application.
- **Adding a check can invalidate an earlier PASS.** Re-run the whole gate every iteration.

---

## 6. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

- **A tracked file needs deleting.** `FEATURES.md`, `bin/openui.js`, `bin/openui.ts`,
  `client/src/App.tsx` and the legacy `client/src/components/` shell are all deletions this loop
  wants and none of them is the loop's to make. Ask for all of them in one message, with the two
  hazards from R-8 attached.
- **The shim shadows the vendor's `grok` on the user's PATH.** That is an outward-facing change to
  the user's shell environment. Confirm it, and confirm the fallback: if the answer is no, the
  command is `grok-workspace` and the decided spelling does not exist.
- **A router dependency must be added** (§3.4). A new dependency is a `package.json` change and
  therefore a handoff request; adding one that another worktree also adds differently is the exact
  conflict this partition exists to prevent.
- **Two requirements contradict one another** — for example "more visual" against "status is never
  colour alone". State both, propose one, and stop.
- **A change would fall outside this worktree's boundary** (§0). File it in the handoff; do not edit.
- **`idle` is red and `failed` is orange** in `client/src/control-room/types.ts:61-77`. Ask before
  changing status semantics.

---

## 7. What counts as done

Seventeen items. Each has a required result whose clauses are separately observable, and an evidence
form to fill in in `VERIFICATION.md`. A clause that cannot be evidenced holds the whole item.

#### SHELL-001: The contract is published before anything else exists

Required result:

* `client/src/control-room/shell/contract.ts` exports `PageId`, `WorkspacePageProps`,
  `WorkspacePageComponent`, `PageDescriptor`, `ToolsPanelProps`, `ToolsPanelComponent` and
  `workspaceUrl`, and the client typecheck passes with no other shell file present;
* `client/src/control-room/shell/pages.ts` lists all five pages with `main` undefined;
* the same interface text, the token names and the URL scheme are in
  `loops/handoff/pivot-shell.md` as R-1, on the first iteration;
* a component with the exact signature each sibling promises — `(props: { projectId: string })` —
  compiles when assigned to `WorkspacePageComponent`, proved by a compile-time fixture.

Evidence:

```text
Typecheck output with only contract.ts and pages.ts present:
Handoff file, first commit (sha and date):
Assignability fixture, and its output when a required prop is added to WorkspacePageProps:
Token names published, against the list in §3.3.3:
```

#### SHELL-002: The shim forwards everything it does not own

Required result:

* `grok --version` through the shim produces output byte-identical to the real binary's;
* a failing invocation's exit code is the real binary's, not the shim's;
* the shim writes nothing of its own to stdout or stderr on the forwarding path;
* Ctrl-C during a forwarded session reaches the TUI.

Evidence:

```text
Diff of shim vs. direct --version output:
Exit code, direct / via shim:
Bytes written by the shim on the forwarding path:
SIGINT observed by:
```

#### SHELL-003: `--common_version` opens the workspace

Required result:

* `grok --common_version` starts the server and opens a browser at the workspace;
* the real TUI is not started;
* a positional prompt is carried into the first design document;
* the server binds `127.0.0.1` only.

Evidence:

```text
Command run:
Process tree after launch:
URL opened:
Prompt observed in the document:
Listening socket (host:port):
```

#### SHELL-004: The shim cannot recurse

Required result:

* `real-grok-path` holds an absolute path and is never a path inside the shim's own bin directory;
* `install-shim` refuses when the resolved real binary is the shim;
* the detection bug is **reproduced**: with the shim first on PATH, `detectGrok().binaryPath` is the
  shim;
* the patch and a test that fails without it are attached to R-6.

Evidence:

```text
Contents of real-grok-path:
install-shim refusal (command and message):
detectGrok().binaryPath with shim on PATH (the reproduction):
Patch and test attached to R-6 (handoff line numbers):
Status: BLOCKED-ON-RECONCILE — grokDetect.ts is not this worktree's file.
```

#### SHELL-005: `--` ends the flag scan

Required result:

* `grok wrap -- ./x.sh --common_version` runs the wrapped command;
* the workspace is not started;
* a test covers it.

Evidence:

```text
Command run:
Process started:
Test name:
```

#### SHELL-006: A second invocation does not start a second server

Required result:

* a second `grok --common_version` opens the browser at the running instance and exits 0;
* no second server process exists;
* a stale lockfile whose pid is dead does not prevent a fresh start.

Evidence:

```text
Server pids after two invocations:
Second invocation exit code:
Behaviour with a stale lockfile:
```

#### SHELL-007: Three regions, resizable, addressable

Required result:

* navigator, main and inspector render on every page;
* each side region collapses and resizes, and its width survives a reload;
* every page and every selected object has a URL that restores it, and `workspaceUrl()` produces it;
* the browser back button moves between pages and between selections;
* the six stacked banners are replaced by one notification surface, and two simultaneous alerts
  render as two rows in it rather than two full-width strips.

Evidence:

```text
Regions present on each page:
Widths before / after reload:
URLs exercised, and workspaceUrl() output for each:
Back-button behaviour:
Notification surface with two live alerts (screenshot):
```

#### SHELL-008: Five page slots and the Tools overlay

Required result:

* AGENTS, ASSETS and DESIGN DOCUMENTS are reachable above the navigator divider; Users and X below
  it;
* a slot whose `main` is undefined renders `NotMergedYet` naming the branch that builds it, and never
  an empty list, a spinner, or a zero;
* the Tools panel opens over MAIN on all five pages from a query parameter;
* Esc dismisses it and returns to the page underneath, unchanged, with the parameter removed;
* the panel renders `NotMergedYet` until 06 merges, on the same rule.

Evidence:

```text
Pages reachable, and their rank:
NotMergedYet text for each unmerged slot:
Panel opened from each page (URL before / during / after):
State of the underlying page after Esc:
```

#### SHELL-009: Light and dark both render

Required result:

* a theme control switches both themes with no reload;
* the choice persists across a restart and wins over `prefers-color-scheme` in both directions;
* no page load flashes the wrong theme;
* `client/src/index.css` contains no hardcoded colour outside the two `:root` blocks.

Evidence:

```text
Toggle observed:
Persistence mechanism and key:
OS dark + stored light, and OS light + stored dark:
FOUC check (recording or frame timings):
grep for hex literals in index.css:
```

#### SHELL-010: No raw colour token can enter shell-owned code

Required result:

* zero occurrences of `text-white`, `bg-white/`, `border-white/`, `divide-white/`, `bg-neutral-9`
  or a hex literal in `client/src/control-room/shell/**` and `client/src/main.tsx`;
* a check enforces it and runs in `bun run verify`;
* the check is proved to fail: plant one raw token, confirm it is caught, remove it;
* every colour the shell renders resolves through a token published in §3.3.3.

Evidence:

```text
grep counts:
Check name and where it runs:
Planted token, and the failure output:
Tokens used, against the published list:
```

#### SHELL-011: Status is never colour alone, in both themes

Required result:

* every status pill renders its text label in both themes;
* the colour element is `aria-hidden`;
* each of the six statuses has a chosen light pair, and the six are distinguishable from one another
  in both themes;
* the six area colours are distinguishable on both grounds, including as a low-opacity gutter fill;
* the label still renders with the class attribute blanked.

Evidence:

```text
Six statuses, both themes (screenshot):
Contrast ratios, light and dark:
Six area colours as gutter fills on both grounds (screenshot):
aria-hidden confirmed on:
Test asserting label survives className removal:
```

#### SHELL-012: No OpenUI string is reachable from the browser

Required result:

* the page title, the first-run greeting, the guide affordance and every visible shell heading name
  grok-workspace;
* no visible string names OpenUI, Claude Code or the canvas;
* a planted control string proves the check can fail;
* the strings this worktree cannot reach are enumerated with their request ids.

Evidence:

```text
grep pattern and result:
Planted string, and where the check caught it:
Screens inspected:
Strings deferred to R-2 / R-5 / R-8 / R-9:
```

#### SHELL-013: The package identity is grok-workspace

Required result:

* R-5 is filed with the exact `package.json` diff, including `bin`;
* the `bin` name is `grok-workspace` and is never `grok`, so a global install cannot overwrite
  `@xai-official/grok`'s binary;
* `client/package.json`'s name is included in the same request;
* the diff applies cleanly against the merge base and `bun run verify` is green with it applied
  locally, then reverted.

Evidence:

```text
Diff filed (handoff line numbers):
bin entry:
Dry-run apply + gate result:
Status: BLOCKED-ON-RECONCILE — package.json is hot.
```

#### SHELL-014: The first-run greeting shows once and is honest

Required result:

* it appears on the first load when `workspaceGreetedAt` is absent;
* it names the five asset types, the ASSETS page and the cost;
* its single button creates a design document, not a project;
* no card, button or sentence offers a generator that is not in the build, and nothing states or
  implies that Grok produces decks;
* it does not appear on the second load;
* it does not read or write `tourCompleted`.

Evidence:

```text
First load (screenshot):
Second load:
Button target, and the object created:
Copy audit against §2.1 item 7:
Settings keys written:
grep for tourCompleted in the new code:
```

#### SHELL-015: The guide is re-openable and covers every section

Required result:

* the toolbar `?` opens it from every page;
* a per-page `?` opens it at that page's entry;
* every navigator page and every inspector section has an entry in `docs/USER-GUIDE.md`, and a
  missing entry is reported rather than silently skipped;
* it opens after the greeting has been dismissed, and after being read;
* no guide prose is authored in this worktree.

Evidence:

```text
Entries resolved, against the page list:
Missing-entry behaviour:
Opened from:
Reopened after dismissal:
grep: guide prose in client/src/control-room/shell/**:
```

#### SHELL-016: The gate is green

Required result:

* `bun run verify` exits 0;
* `bun run audit` reports zero orphans, full endpoint coverage and no unresolved citation;
* no test was skipped or deleted to achieve it.

Evidence:

```text
verify output file:
audit output:
Test count, before / after:
```

#### SHELL-017: The shell is complete with zero siblings merged

Required result:

* on branch `pivot/shell` alone, with no sibling branch merged, the client builds, the server starts,
  the launcher opens the browser, both themes render, all five pages are reachable, and every slot
  renders `NotMergedYet`;
* the Tools overlay opens and closes with its contents unmerged;
* no shell file imports from `agents/`, `assets/`, `designdoc/`, `software/`, `tools/` or `users/`;
* the shell reads no server endpoint that does not exist today.

Evidence:

```text
Branch state (git log --oneline -1, and the merge base):
Build + start + launch output:
Screenshot of each page slot:
grep for sibling imports in shell/**:
Endpoints called by the shell, against server/routes as of the merge base:
```

---

## 8. Definition of done

The shell is complete only when SHELL-001…SHELL-017 all read PASS or BLOCKED-ON-RECONCILE with
recorded evidence, no item is NOT TESTED, `bun run verify` is green, both themes have been looked at
on all five page slots, the shell has been exercised with zero siblings merged (SHELL-017), and the
launch command has been run from a terminal that had never seen the workspace before.

Only then output `The shell is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.

---

## 9. What this worktree hands back

```text
branch    pivot/shell
handoff   loops/handoff/pivot-shell.md
merges    FIRST. 07-shell → 01-agents / 02-assets / 03-design-docs → 04 / 05 / 06 → 08-users-x.
          Everything renders inside this shell, so a contract change after merge is eight
          rebuilds; a contract published on iteration 1 is eight builds that already fit.
```

**The public contract this worktree adds.**

```text
types      exported from client/src/control-room/shell/contract.ts:
             PageId, WorkspacePageProps, WorkspacePageComponent, PageDescriptor,
             ToolsPanelProps, ToolsPanelComponent
           No server type is added. The shell adds no endpoint and no event.

exports    WorkspaceShell   from client/src/control-room/shell/WorkspaceShell.tsx
                            — the whole frame; ControlRoomApp.tsx re-exports it (R-3)
           PAGES, TOOLS_PANEL from client/src/control-room/shell/pages.ts
                            — the registry reconciliation edits, one line per page (R-4)
           workspaceUrl(page, selectionId?, tools?)  from shell/contract.ts
                            — deep links for notifications, cost alerts and presence events
           NotMergedYet     from shell/NotMergedYet.tsx
                            — the honest placeholder for an unmerged slot

tokens     ground:  canvas, surface, surface-hover, surface-active, border, border-strong
           ink:     ink, ink-muted, ink-faint, ink-ghost
           accent:  accent, accent-muted
           status:  status-{working,waiting,needs-review,complete,idle,failed} × {bg,text,border}
           areas:   area-1…area-6 × {bg,text,border,gutter}
           Every other worktree writes token names and defines no hex anywhere.

routes     /agents · /assets · /designdocs · /users · /x, each with an optional /:selectionId,
           plus ?tools=prompts|skills|workflows on any of them.

binaries   bin/grok               the sh shim (new file, unclaimed by any other row)
           bin/grok-workspace.ts  the launcher (new file, unclaimed by any other row)

requests   R-1 … R-9 in loops/handoff/pivot-shell.md. R-1 is urgent (day one); R-3 and R-4 must be
           applied in the same commit; R-6 carries a patch and a failing test.
```

**What we assumed about other worktrees, and what breaks if the assumption is wrong.**

```text
01/02/03    that each page exports exactly one component taking { projectId: string }, matching
            the names in R-4. If a page instead expects the shell to own its selection state, the
            URL stops being the location and back-button behaviour dies with it.
01-agents   that work areas have stable ids and that six colours are enough. If areas are
            unbounded, area-1…area-6 must become a generated ramp, and the light-ground contrast
            check in SHELL-011 stops being a fixed set of measurements.
03-design-docs  that the design-document gutter highlight uses gutter-area-N at low opacity and
            always carries a text label alongside. This is the one place colour carries meaning
            at low opacity in the whole product, and it is the token most likely to fail in light.
06-tools    that the Tools panel is one component taking { projectId, section, onClose } and owns
            nothing about its own visibility. If it renders its own scrim or its own Esc handler,
            two dismissal paths fight and the query parameter desynchronises from the DOM.
06-tools    that the toolbar's spend figure comes from a value that may be unknown, and that
            unknown is rendered as unknown. usageAccounting's DEFAULT_RATES has no Grok model, so
            in wave 1 it very likely is unknown for every turn.
04/05       that no generation affordance is expected in the shell before those branches merge.
            The slots exist; the buttons do not (§3.9).
08-users-x  that Users and X are secondary and may be absent at merge time without the shell
            changing. Their slots render NotMergedYet like any other.
guide       that docs/USER-GUIDE.md has one entry per navigator page and per inspector section,
            addressable by a stable anchor. The shell reports a missing entry rather than
            skipping it, so a drifted anchor is visible instead of silent.
reconcile   that R-3 and R-4 land in one commit, that R-2's boot script precedes the module script
            tag, and that R-6 is applied before anyone measures ACP start-up cost with a shim
            installed.
```
