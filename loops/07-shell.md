# Shell and Identity — Loop Operating Document

This is the instruction set for one iteration of the shell loop. Read this file first, act, then
stop. It is deliberately short; the documents it points at hold the detail.

This loop owns the frame the product is seen through: the three-region layout, the launch path
that opens it, the two themes it renders in, and the name on the front. It owns no domain logic.
If a change to this surface requires a change to a project, an agent, a cost figure or a tool, it
belongs to another loop — see §0.

| Document | Role |
|---|---|
| `loops/05-shell.md` | This file. The shell contract and the shell checklist, items SHELL-001…SHELL-015. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loopdesign.md` | The house form. Read it once for register and evidence standards; do not edit it. |

---

## 0. Your boundary

You own the frame. You do not own anything inside it.

**Files and directories this worktree may edit:**

```text
bin/grok                              (new — the shim; see §3.3)
bin/grok-workspace.ts                 (new — the launcher)
bin/openui.ts                         (retired or renamed by this loop)
client/index.html
client/package.json
client/tailwind.config.js
client/src/index.css
client/src/main.tsx
client/src/control-room/ControlRoomApp.tsx     (region layout, routing, page selector,
                                                Tools-panel mount point — NOT panel contents)
client/src/control-room/types.ts               (ONLY STATUS_LABELS / STATUS_CLASSES / STATUS_DOT)
client/src/workspace/**                        (new — Greeting, Guide, theme provider)
client/src/components/OnboardingTour.tsx       (to lift its data to props)
client/src/components/HelpModal.tsx            (to lift its shell out of legacy)
server/services/grokDetect.ts                  (ONLY the self-exclusion in grokBinaryCandidates)
package.json                                   (ONLY name, description, author, repository,
                                                bugs, homepage, keywords, bin)
README.md
FEATURES.md
```

**Files this worktree must read and must NOT edit:**

```text
server/services/acpClient.ts          ACP_ARGS (:29) is the agent-runtime loop's
server/services/acpSessionManager.ts  session lifecycle — agent-runtime loop
server/services/usageAccounting.ts    cost loop
server/services/projectStore.ts       domain loop
server/services/projectMcpServer.ts   domain loop
server/services/promptLibrary.ts      Tools-panel loop owns the model; you own only
server/routes/library.ts              where the panel opens FROM
server/routes/**                      API loop (you may read /api/settings at api.ts:1481-1498)
verifiables.md  product-design.md     owner-written; never edited by a loop
```

**The identity strings this loop does NOT own**, even though they say "openui": the `OPENUI_*`
environment variables, the `~/.openui` data directory, the `x-openui-*` HTTP headers, the
`openui-project` MCP server name, and the `openui-agent` git author. Every one of those is a
persisted or wire-level contract with a migration attached. This loop retires the *browser-visible*
and *launch-visible* identity only. §3.4 lists the rest so the identity-migration loop has an
inventory; do not rename them here.

**How to raise a cross-boundary concern.** Do not edit across the line and do not work around it.
Append the concern to §0.1 of this file — what you observed, the `file:line`, what you propose,
and which loop owns it — and continue with your own work. The product itself does exactly this:
`DesignSuggestion` (`server/types/project.ts:95-118`) and the `submit_design_suggestion` MCP tool
are "may suggest outside its area, may not edit outside it", and `SuggestionQueue` in
`client/src/control-room/ReviewQueues.tsx` is where a human accepts, edits, rejects or asks for a
revision. Use the same shape; the rule the agents follow is the rule you follow.

### 0.1 Raised to other loops

```text
AGENT-RUNTIME   server/services/acpClient.ts:29 spawns grokBinaryPath(). Once the shim exists
                (§3.3), grokBinaryPath() can resolve to the shim rather than the real binary,
                because grokBinaryCandidates ends in the bare name "grok" resolved via PATH
                (server/services/grokDetect.ts:67). The shim forwards, so this works today and
                breaks silently the day the shim's argv scan changes. This loop adds the
                self-exclusion; the agent-runtime loop should assert in its own tests that the
                path it spawns is the real binary.

IDENTITY        server/services/taskBriefing.ts:60 puts the literal string "openui-project" into
                every agent's briefing prompt, and server/services/planner.ts:58 does the same.
                The brand is inside the model context, not just the UI.

CANVAS          client/src/App.tsx:14 is the only import of "@xyflow/react/dist/style.css" in the
                repo. client/src/control-room/AgentCanvas.tsx imports no stylesheet. Deleting or
                lazy-loading the legacy shell silently strips React Flow's CSS from the control
                room. Whoever retires AgentCanvas.tsx must move or delete that import in the same
                commit as the deletion, not after it.
```

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui          # the repository, pending its rename to grok-workspace
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

Confirm the environment is intact. If any check fails, fix that before anything else:

```bash
./node_modules/.bin/grok --version        # expect: grok 1.0.0 (3cd0d0cbcebe) [stable]
bun run verify                            # expect: exit 0
bun run audit                             # expect: 0 orphans, every endpoint covered, every
                                          #         cited file resolves
```

**A red gate is always the highest-priority work**, ahead of any checklist item. Capture the
output to a file, never `>/dev/null` — a red gate you cannot read is a red gate you cannot fix.

Two gate hazards specific to this loop:

- `scripts/audit/docs.mjs` fails the build on a **dangling backticked citation** in `README.md`,
  `HANDOFF.md`, `loopdesign.md` or `VERIFICATION.md`. Deleting `FEATURES.md` while any of those
  four still names it in backticks turns the gate red. Delete the file and its citations in one
  commit.
- The class-token migration in §3.5 touches 16 files and ~341 class strings. Only **two** class
  assertions exist in the whole control-room test suite — `client/src/control-room/diffView.test.tsx:97`
  asserts `overflow-auto`, and `client/src/control-room/controlRoom.test.tsx:62` deliberately sets
  `badge.className = ""` to prove the status text survives without colour. Neither asserts a
  colour. The migration will not break the suite, which means **the suite will not catch a
  migration that produces an unreadable theme.** Screenshot both themes and look at them.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 15 NOT TESTED
Nothing in SHELL-001…SHELL-015 has been attempted. The shell that exists is the control room's
three-column tab shell (client/src/control-room/ControlRoomApp.tsx, 359 lines), reachable only
by typing ?view=control-room into a browser.
```

What exists, verified by reading it:

```text
client/src/main.tsx:13-15     the whole "launch": a URLSearchParams read choosing between
                              <App/> (the legacy OpenUI canvas) and <ControlRoomApp/>
client/src/main.tsx:26-33     a fixed bottom-right pill, data-testid="view-toggle"
ControlRoomApp.tsx:213        the three regions already exist in skeleton:
ControlRoomApp.tsx:215          <aside className="w-72 …">   requirement list
ControlRoomApp.tsx:227          <main …>                     tab strip + one of six panes
ControlRoomApp.tsx:346          <aside className="w-80 …">   requirement detail
ControlRoomApp.tsx:29         the "router": useState<Tab>, six tabs at :17-24
client/src/index.css:17-24    html, body pinned to #0f0f0f / #fafafa with overflow:hidden
client/tailwind.config.js     38 lines, three literal-hex dark palettes, NO darkMode key
bin/openui.ts:243,271,399     the entire argument parser: --no-update and --dev
server/index.ts:14,75         PORT 6968, hostname 127.0.0.1 unless OPENUI_HOST is set
```

So: the region skeleton is real and reusable, the launch path is a query parameter, the theme is
nailed to the document, and the product is called OpenUI.

### 2.1 What the owner assumed that is not true

Stated plainly, because designing quietly around any of these produces a plan that reads
correct and cannot be built.

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
   contributions, and this repository does not build it — the binary arrives from `node_modules`
   via `@xai-official/grok` (`server/services/grokDetect.ts:33`). We cannot add a flag, we cannot
   add a subcommand, and no plugin, skill or hook can add a top-level CLI flag either: a plugin
   adds slash commands, skills, agents, hooks and MCP servers, and none of those is argv.
   §3.3 says what we build instead. It is a wrapper. Do not write it up as anything else.

2. **There is no UI to overlay.** Grok Build is a ratatui terminal application. Its own word
   "overlay" means a TUI view stacked over the scrollback — that is what `grok dashboard` does.
   A browser page cannot be laid over a terminal application. In this product "overlay" means the
   Tools panel over a page (§3.2), and nothing else. `--common_version` does not decorate the
   running TUI; it starts a different program and does not launch the TUI at all.

3. **The visual idiom is Apple Xcode; the underlying tool is not.** Xcode is the *reference for
   the layout* — navigator, editor, inspector — and nothing more. We are not overlaying Xcode, not
   embedding in it, and not shipping a native app. The only real Xcode↔Grok relationship in the
   tree is the reverse direction: Grok Build can be embedded *inside* Xcode over ACP
   (`.refs/grok-build/crates/codegen/xai-acp-lib/src/normalize.rs:19`). Say "Xcode-style" and mean
   layout.

4. **"Styled like the underlying tool" is currently false in both directions.** The legacy shell
   uses the semantic tokens `bg-surface` / `border-border` / `bg-canvas` (198 usages across 11
   files); the control room uses **zero** of them and hardcodes `bg-neutral-950`, `text-white/60`,
   `border-white/10`. Converging on tokens and adding a light theme are the same job (§3.5), not
   two.

5. **Dark/light is not a config flag.** There is no `darkMode` key in `client/tailwind.config.js`,
   no `dark:` variant anywhere in the codebase, no `prefers-color-scheme` rule, no CSS custom
   property, and no theme context. `client/src/index.css` pins the background on `html, body`
   (`:17-24`) and carries `!important` on 30 lines that no Tailwind class can beat.

6. **"Greeting" is an overloaded word in this repository.** `Greeting Service` is the name of the
   demo fixture project (`client/src/control-room/uiChecklist.test.tsx:20`) and of the sample
   project `bun run demo` builds. The onboarding feature in §3.6 is the **first-run greeting**.
   Never call it a greeting service, and never key a test on the string "greeting" alone.

---

## 3. What must be built

### 3.1 The three regions

One layout, on every page. Borrowed from Xcode because the shape is already understood by anyone
who has used a Mac application, and because it separates *what you are looking at* from *what you
are looking at it with*.

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
│ ▸ DOC HUB      │    the work-area board,               │ is selected in MAIN │
│ ▸ USERS        │    a document, a deck, a video,       │ — never a second    │
│ ▸ X            │    a running app preview              │ navigation surface  │
│                │                                       │                     │
│ ── list for    │                                       │                     │
│    the current │                                       │                     │
│    page ──     │                                       │                     │
│                │                                       │                     │
├────────────────┴───────────────────────────────────────┴─────────────────────┤
│ ⌥ TOOLS PANEL — slides up over MAIN, over any page, dismissible with Esc     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Rules, each with the failure it prevents:

- **The navigator holds the four pages and the current page's list. Nothing else navigates.**
  Today navigation is a six-tab strip inside `MAIN` (`ControlRoomApp.tsx:17-24, 227-241`) *and* a
  requirement list in the left rail *and* a session drawer that displaces the inspector. Three
  navigation surfaces in one screen is why the current shell reads as a developer tool.
- **The inspector shows properties, never navigation.** An inspector that can change what `MAIN`
  displays is a second navigator and the user loses their place.
- **Every region is collapsible and resizable, and the widths persist.** The current shell is
  fixed: `w-72` + `w-80` = 608px of chrome, or 736px with the session drawer (`w-[28rem]`) open.
  On a 1280px laptop that leaves 544px for the main area, and `client/src/index.css:23` sets
  `overflow:hidden` on `body`, so what does not fit cannot be scrolled to — it is simply gone.
  There are zero responsive breakpoints in the control room today.
- **Location is in the URL.** `client/src/control-room/ControlRoomApp.tsx:29` keeps the current
  tab in a bare `useState`. With four pages, a selected object per page and a Tools panel, that
  means no deep link, no browser back, and no way for an agent's notification to point at the
  thing it is talking about. Real routes: `/agents`, `/agents/:areaId`, `/hub`, `/hub/:docId`,
  `/users`, `/x`, with the Tools panel as a query parameter (`?tools=skills`) so opening it does
  not lose the page underneath.
- **The toolbar carries exactly four things**: where you are, the project, the running spend, and
  the two always-available controls (guide, theme). Spend is on the toolbar on every page because
  a 60-second generated experience costs about $5.52 in media alone — three orders of magnitude
  more than a text turn — and a figure the user has to navigate to is a figure they will not see
  before the retry loop that costs $50.

### 3.2 The four pages and the Tools panel

| Page | Navigator holds | Main holds | Inspector holds |
|---|---|---|---|
| **AGENTS** | the work areas, colour-coded, one row each | the area board — who is working, on what, and what it has cost | the selected agent: capability, boundary, environment, budget |
| **DOC HUB** | a folder tree of documents, slides, experiences and software | the selected artefact, previewed as itself — not as a diff | the artefact: which agent is reading it, which is writing it, version, size |
| **USERS** | the user list | the selected user | the selected user's roles and limits |
| **X** (optional) | X accounts and drafts | the draft or thread being composed | posting target, media attached |

The Tools panel is an **overlay over `MAIN`, available on all four pages**, holding prompts,
skills and workflows, editable in place. It overlays rather than replaces because its whole purpose
is to be applied to the thing you are currently looking at; a panel you have to navigate away to
reach cannot be. Xcode's Library is the same idea for the same reason.

This loop builds the panel's **mount point, overlay behaviour, keyboard dismissal and route**, and
nothing inside it. The contents are the Tools loop's. Note before you start: the backend already
exists and has never been called. `server/routes/library.ts` is mounted at `/api/library`
(`server/routes/api.ts:32`) and serves skills, prompts and workflows; `grep -rn "api/library"
client/src` returns nothing. Verify that yourself before repeating it.

**What this surface contributes to the canonical demo.** The user types "I need to do this sales
presentation", and four agents — one researching in the Doc Hub, one on the X account, one with
Imagine generating slides, one with voice plus Imagine generating video — go to work. The shell's
whole contribution is that this is legible: the navigator shows four coloured areas, the main area
shows all four moving at once, the inspector shows that the slide agent has Imagine capability and
the researcher does not, the toolbar shows one number going up, and the Doc Hub shows every asset
landing. If a shell decision makes any of those five things harder to see at a glance, it is the
wrong decision.

### 3.3 The launch flag, end to end

**Decided:** the workspace opens from the grok terminal as `grok --common_version`.

**True:** that command errors today with exit code 2 (§2.1), and we cannot change the program that
errors.

**Therefore:** we own a `grok` on the user's PATH, ahead of the real one. It is a shim. Everything
it does not recognise it hands to the real binary, unchanged.

#### The three candidate implementations, and why one wins

```text
(a) a shim named `grok` ahead of the real binary on PATH   ← chosen
    the only implementation in which the decided command works as typed.

(b) a separate command, `grok-workspace`
    honest, zero risk, and not the decided spelling. Keep as the fallback if the owner
    refuses PATH shadowing (§6).

(c) a grok plugin: slash command, skill, or SessionStart hook
    rejected. A markdown slash command injects a prompt; it cannot start a server. A
    SessionStart hook can run a command, but it fires on every session, only after the TUI has
    already started, and it never gives us the spelling. A hook that opens a browser on every
    `grok` is a defect, not a feature.
```

#### The shim, precisely

Two files, and the split between them matters:

```text
bin/grok               POSIX sh. Scans argv. Two exec targets. No interpreter start-up cost
                       on the ordinary path, and a true exec() so job control, signals, the
                       TTY and the exit code are the real binary's, not ours.
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
  user's script, not open a browser. clap's own error message advertises `-- --common_version` as
  the way to pass the string as a value; a shim that ignores `--` breaks a documented escape.
- **`REAL_GROK` is an absolute path read from a file, never the name `grok`.** If the shim ever
  resolves `grok` through PATH it finds itself, and `grok` forks bombs. This is the single most
  likely way to brick a user's terminal, and it costs one line to prevent.
- **Unrecognised argv is forwarded byte-for-byte, and the shim prints nothing.** `grok --version`
  under the shim must produce exactly the output it produces without the shim. A shim that adds a
  banner has changed every script that parses `grok`'s output.
- **`exec`, not spawn-and-wait.** With `exec` there is no residual process, the exit code is the
  real binary's, and Ctrl-C, Ctrl-Z and SIGWINCH reach the TUI. A Bun or Node shim cannot do this
  — neither has a supported `execve` on this platform — which is why the shim is `sh`. *If a
  future version of Bun exposes `execve`, a single-file shim becomes possible; that is unverified
  and must be checked against the installed Bun before anyone proposes it.*

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
  children                                               server/services/acpClient.ts:29
```

Read that table as the answer to "is the workspace an overlay on grok?" It is not. On the
`--common_version` branch the TUI is never started. The workspace is a sibling program that speaks
to the *same* binary through ACP, one child process per agent, exactly as the server does today.
What the flag buys is that a user who lives in the grok terminal reaches the common-user face
without being told to install or run something else.

#### Installation, and the two things it must not do

The shim shadows a vendor binary. That is not something to do behind the user's back.

```text
grok-workspace install-shim
  writes  ~/.grok-workspace/bin/grok
  writes  ~/.grok-workspace/real-grok-path   (the absolute path detection resolved)
  PRINTS  the single line to add to the shell profile, and does not edit the profile
  refuses to run if the resolved real binary is already inside ~/.grok-workspace/bin
```

It must not add itself to a shell profile without being asked, and it must not install into a
global npm bin directory where it would collide with `@xai-official/grok`'s own `grok`. `npm i -g`
resolving that collision by overwriting is how the real binary disappears.

#### The detection bug this creates, and its fix

`grokBinaryCandidates` (`server/services/grokDetect.ts:61-69`) probes, in order, the project-local
`node_modules/.bin/grok`, then `$GROK_HOME/bin/grok`, then **the bare name `grok` resolved via
PATH** (`:67`). With the shim installed, that third candidate is the shim. `probe()` (`:71-79`)
runs `--version` on it, the shim execs the real binary, a valid version string comes back, and
detection reports `installed: true` with `binaryPath` pointing at the shim. Every ACP session then
spawns through an extra process for no reason, and the day the argv scan changes, agent start-up
breaks in a way that looks like a Grok bug.

Fix: `grokBinaryCandidates` skips any candidate whose `realpathSync` matches the realpath of the
installed shim. Write the test first — install a shim into a temporary `GROK_WORKSPACE_HOME`, put
it on PATH, and assert `detectGrok().binaryPath` is not it. The test must fail before the fix.

#### One server, not one per invocation

`grok --common_version` will be typed repeatedly, from different terminals. The launcher must:

1. read a lockfile under the data directory holding `{pid, port, startedAt}`;
2. if the process is alive, open the browser at its URL and exit 0 — do not start a second server;
3. otherwise pick a free port (do not assume 6968; `server/index.ts:14` defaults to it and
   `bin/openui.ts:13` uses 6969, and they have drifted), start the server, write the lockfile, and
   open the browser;
4. bind `127.0.0.1` and nothing else. `server/index.ts:70-76` already records why: the server
   exposes repository and agent control with no authentication.

A positional prompt survives: `grok --common_version "I need to do this sales presentation"` opens
the workspace with the new-project form pre-filled with that brief. It is three lines and it makes
the canonical demo one command.

### 3.4 Unwinding the OpenUI lineage

This repository is a fork of OpenUI, which was itself built for Claude Code. Both lineages are
still in the source, and the second is more misleading than the first — the onboarding overlay a
new user sees says *"Manage your Claude Code agents"* while the product drives Grok.

**Yours to change (browser-visible and launch-visible):**

```text
package.json:2          "name": "@fallom/openui"
package.json:4          "description": "Visual canvas UI for managing AI coding agents locally"
package.json:5          "author": "JJ27"
package.json:7-14       repository / bugs / homepage → github.com/JJ27/openui
package.json:15-23      keywords, including "claude-code" and "opencode"
package.json:25-27      "bin": { "openui": "./bin/openui.ts" }   ← becomes the shim entry
client/package.json:2   "name": "openui-client"
client/index.html:7     <title>OpenUI - AI Agent Canvas</title>
client/src/main.tsx:8   comment: "the original OpenUI terminal canvas"
client/src/main.tsx:13-15   the ?view=control-room switch — deleted, replaced by routes (§3.1)
client/src/main.tsx:26-33   the floating "Open Control Room →" pill, data-testid="view-toggle"
OnboardingTour.tsx:226  <h1>OpenUI</h1>
OnboardingTour.tsx:234  "Manage your Claude Code agents"
README.md:1             # OpenUI
FEATURES.md:1           # OpenUI — The AI Agent Command Center
```

`FEATURES.md` describes a different product end to end and contradicts the current one. It should
be deleted rather than rewritten — but **deleting a tracked file is the owner's decision** (§6),
and `bin/openui.js` has been waiting on exactly that decision for eighty iterations. Ask once, in
the same message, for all of them.

The view toggle at `client/src/main.tsx:26-33` is the current product's honest admission that it is
two products in one page. Removing it is not cosmetic: it is the moment the workspace stops being
a second view of OpenUI and starts being the thing that is launched. Do it in the same commit as
the routes, and read the CANVAS note in §0.1 before you touch `client/src/App.tsx`.

**Not yours, listed so the identity-migration loop has the inventory:** `OPENUI_QUIET`,
`OPENUI_HOST`, `OPENUI_DATA_DIR`, `OPENUI_SESSION_ID`, `OPENUI_HOOK_LOG`,
`OPENUI_STARTUP_TIMEOUT_MS`, `OPENUI_POST_SIGNAL_DELAY_MS`; the `~/.openui` data directory and its
in-place migration in `server/services/persistence.ts`; the `x-openui-actor-id`,
`x-openui-actor-kind` and `x-openui-actor-doc-write` headers; the MCP server name
`openui-project`; the git author `openui-agent`; the localStorage keys `openui-active-canvas`,
`openui-sidebar-pct`, `openui-notifications`; and the DOM events `openui:toggle-help`,
`openui:toggle-search`, `openui:restart-tour`. Each of those is either persisted state or a wire
contract, and renaming one without its migration loses a user's data or breaks the actor
authorisation the MCP server depends on.

### 3.5 Theming

Only dark exists. Verified by counting, in the 18 non-test files of `client/src/control-room/`:

```text
text-white (incl. /NN opacity)     126
bg-white/NN                         68
border-white/NN                     32
bg-neutral-950                       9
bg-neutral-900                       5
divide-white/NN                      3
                          ────────────
white / neutral subtotal           243

bg|text|border-{red,green,yellow,amber,blue,orange,gray,…}-NNN    98
                          ────────────
TOTAL class tokens to migrate      341
```

`client/tailwind.config.js` has **no `darkMode` key** — Tailwind 3 therefore defaults to `media`,
so `dark:` variants would follow the OS and not a switch, and there are zero `dark:` variants in
the codebase anyway. The three palettes are literal hex, and `boxShadow.node` / `node-hover` bake
in `rgba(0,0,0,.3)` and `.4` — drop shadows that only work on a dark ground.
`client/src/index.css` is 174 lines of which **30 carry `!important`**, and `:17-24` pins
`background:#0f0f0f; color:#fafafa` on `html, body` itself. No Tailwind class can beat any of
that; the CSS has to change first.

**The token layer.** `darkMode: 'class'`, and every colour in `client/tailwind.config.js` becomes
`rgb(var(--token) / <alpha-value>)` so opacity utilities keep working. Two `:root` blocks in
`client/src/index.css` supply the values. Source both palettes from Grok Build's own matched pair —
`.refs/grok-build/crates/codegen/xai-grok-pager-render/src/theme/groknight.rs` and
`grokday.rs` — so the workspace and the terminal read as one product rather than two.

The ramp that matters is the text one. 109 of the 126 white usages are `text-white/NN` — those are
not colours, they are four emphasis levels painted against an implicit black. There is no
mechanical light equivalent: `text-black/40` on white is a different perceptual contrast, and
several of the existing steps (`/25`, `/30`, `/35`) are already at or below WCAG AA *in dark*. A
find-and-replace to `dark:` variants would double 341 class strings and produce an unaudited light
theme. Collapse seven opacity levels into four semantic steps — `ink`, `ink-muted`, `ink-faint`,
`ink-ghost` — and pick both ends of each for contrast.

**Migration cost, honestly:**

| Work item | Files | Edits |
|---|---|---|
| `client/tailwind.config.js` — `darkMode:'class'`, var-ify 3 palettes, add the `ink` ramp, var-ify 3 box-shadows | 1 | ~25 lines |
| `client/src/index.css` — the `html, body` pin, the React Flow `!important` block, the two scrollbar blocks, the glow keyframes, plus the two `:root` blocks | 1 | ~45 lines |
| `client/src/control-room/types.ts` — `STATUS_CLASSES` / `STATUS_DOT`, 18 strings. **Do this first**: it is the single source of status colour for the whole application | 1 | 18 |
| Control-room components — 243 white/neutral tokens | 12 | 243 |
| Remaining semantic colour outside `types.ts` | ~7 | ~80 |
| `client/src/main.tsx` — the theme control itself, plus retiring the toggle pill | 1 | ~20 lines |
| Theme persistence | **0 server files** — `PUT /api/settings` (`server/routes/api.ts:1491-1498`) merges arbitrary keys into an untyped config, so `{"theme":"light"}` needs no schema change | 0 | 0 |

**Total: 16 files, ~341 class tokens, ~90 lines of new CSS and config.**

One thing this list does not contain and must be built anyway: **an inline script in
`client/index.html` that stamps the theme class on `<html>` before the bundle loads.** Without it
every page load flashes the wrong theme, and the flash is worst in exactly the case the feature
exists for — a light-mode user on a dark default.

#### The standing rule: status is never conveyed by colour alone

Every status renders a text label. The colour is supplementary and is marked `aria-hidden`.

This is not a preference. `server/types/agent.ts:7-11` and `client/src/control-room/types.ts:46-50`
both state it in the source; `AgentStatusBadge.tsx:8-11` documents it at the point of rendering;
`statusLabel()` (`types.ts:78-83`) throws rather than render an empty badge when a new status
appears server-side; and `controlRoom.test.tsx:62` blanks a badge's `className` to prove the
meaning survives with the colour removed. Four independent places, because it was worth defending
four times.

**A light theme makes this rule harder, not easier, and the pressure runs the wrong way.** In dark,
the six statuses are six hues at 15% alpha on near-black, which reads as six distinct washes. On
white, `text-green-400` and `text-yellow-400` fail contrast outright, so the instinct is to
saturate — and saturating converges the hues: green against teal, yellow against amber, orange
against red. Two of the six pairs collide at low saturation already. So: each status gets a
*chosen* light pair, not a computed one; the label stays; and "make it more visual" never means
replacing a labelled pill with a coloured dot. The area colour-coding on the AGENTS page is subject
to the same rule — an area is identified by its name and its colour, never by its colour.

One finding to put to the owner rather than fix silently: in `client/src/control-room/types.ts:60-77`
`idle` is red and `failed` is orange. That reads backwards, and a light theme is when someone will
notice. Ask; do not swap.

### 3.6 Onboarding

Two separate things, and conflating them is the mistake to avoid: a **first-run greeting** that is
shown once, and a **welcome guide** that can be opened forever.

#### What exists, and whether it is reusable

`client/src/components/OnboardingTour.tsx` (383 lines) is a two-phase overlay portalled to
`document.body`: a welcome screen (`:193-286`) driven by a module-level `features` array
(`:13-38`), then a spotlight tour (`:288-378`) that measures a target and cuts a hole around it.

The **mechanism is worth keeping**. Steps name a target and the component finds
`[data-tour="<target>"]` (`:136-143`); `findNextVisible` (`:155-160`) skips any step whose target
is not in the DOM and calls `complete()` when none remain (`:164-166`). That is precisely what a
four-page workspace needs, because on a fresh install most anchors do not exist yet.

The **content is not reusable at all**. The four feature cards are "Persist & Resume", "Fork
Conversations", "Search History" and "Visual Canvas" — the previous product. The title is
`OpenUI` (`:226`) and the subtitle is "Manage your Claude Code agents" (`:234`), which names a
third product neither of the other two is.

`client/src/components/HelpModal.tsx` (157 lines) is the reverse: **the shell is reusable, the
content is exactly wrong.** Portal, scrim, scrollable body, footer action, fully prop-driven
(`:21-28`) — a good base. Its body is a hardcoded keyboard-shortcut table (`:9-19`) listing
`Alt+T` for a new canvas and `Cmd+K` for conversation search. A non-technical user needs an
explanation of what a page is for; a shortcut table is the least useful possible content.

Neither is mounted in the control room. `OnboardingTour` is imported at `client/src/App.tsx:24` and
rendered at `client/src/App.tsx:812`; `HelpModal` at `client/src/components/Header.tsx:8` and
`:380`. Both are in the legacy shell only. All four `data-tour` anchors are in the legacy shell;
there are zero in `client/src/control-room/`.

**Verdict: reuse the targeting mechanism and the modal shell; write new content; and do not reuse
the completion key.** `tourCompleted` is a single global flag read at `OnboardingTour.tsx:115-123`.
A user who ever finished the canvas tour already has `tourCompleted: true`, so a new guide keyed on
it would never fire, for exactly the users most likely to be testing it. New keys, namespaced:
`workspaceGreetedAt` and `workspaceGuideSeen`. `PUT /api/settings`
(`server/routes/api.ts:1491-1498`) `Object.assign`s arbitrary keys into an untyped config, so both
cost zero server changes.

The refactor is small: lift `features` and `STEPS` out of module scope into props, add a
`settingsKey` prop, and target the existing `data-testid` attributes rather than adding `data-tour`
ones — every anchor already has a stable `data-testid`. Those same ids are asserted by
`client/src/control-room/uiChecklist.test.tsx`, so **do not rename them**; a renamed anchor breaks
a checklist test and a tour step at once, and only one of them tells you.

#### The first-run greeting

Shown once, full-page, on the first load after `grok --common_version` when `workspaceGreetedAt` is
absent. Not a spotlight — a spotlight over an empty workspace explains nothing, and worse, on a
fresh install with no project three of four anchors are missing, so `findNextVisible` would skip
every step, call `complete()`, mark it done, and the user would never see it again. The tour comes
*after* the first project exists.

It says five things, in plain language, in this order, and nothing else:

```text
1  What this is        "Describe what you need. A team of agents does the work, and you
                        review it."
2  What it makes       Documents · Slides · Experiences (voice and video) · Software.
                        Four things, named, with one example each.
3  Where things go     "Everything your agents produce lands in your Doc Hub."
4  What it costs       "Agents cost money as they work. The running total is always in the
                        top bar." — plainly, on the first screen, not in a settings page.
5  One button          "Create your first project"
```

No feature grid, no jargon, no second button competing with the first. It does not mention agents'
capabilities, boundaries or worktrees; those are explained by the guide, at the moment the user is
looking at one.

#### The welcome guide

Re-openable, sectioned, one entry per navigator page and per inspector section. Reached three
ways, and the third is the one people actually use:

1. the `?` in the toolbar, present on every page, opening the guide at its contents;
2. a `?` on each page's header, opening the guide scrolled to that page's entry;
3. the last line of the first-run greeting: "You can reopen this any time from the ? in the top
   bar." — a guide the user cannot find again was explained once and then taken away.

Each entry is three sentences and one screenshot-free diagram: what this page is for, what the one
thing you do here is, and what it costs if anything. `workspaceGuideSeen` records which entries
have been read so the `?` can carry a quiet dot on unread ones. It never hides an entry that has
been read.

### 3.7 Build order

Step 3 of §4 points at this table. Take the highest row that is not passing.

| # | Work | Why here | Items |
|---|---|---|---|
| 1 | The shim, the launcher, the lockfile, and the `grokDetect` self-exclusion | Until the product opens the way it is meant to open, nothing else can be demonstrated honestly — and the self-exclusion bug arrives the moment the shim does | SHELL-001…005 |
| 2 | The token layer: `tailwind.config.js`, `index.css`, the `<html>` boot script, `types.ts` status pairs | Before any component is touched, so the 341 edits happen once | SHELL-008, 010 |
| 3 | The region shell: navigator / main / inspector, resizable and collapsible, with real routes and the page selector | Rewrites `ControlRoomApp.tsx` anyway; doing it after the component token migration would redo it | SHELL-006 |
| 4 | The four pages as frames, and the Tools panel mount | Frames only. Contents belong to other loops | SHELL-007 |
| 5 | Component token migration, 243 tokens across 12 files, plus the ~80 semantic ones | Mechanical; do it in one pass and look at both themes | SHELL-009 |
| 6 | Identity: package fields, titles, README, the view toggle, `FEATURES.md` (pending §6) | Needs the routes from row 3 before the toggle can go | SHELL-011, 012 |
| 7 | First-run greeting, then the guide | The greeting needs the four pages to exist to name them | SHELL-013, 014 |

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the **highest row in §3.7 that is not passing**.
4. Reproduce the current behaviour first — know what failure looks like before fixing it. For this
   loop that usually means opening the page in both themes, or running the command and reading its
   exit code.
5. Implement the smallest change that satisfies the requirement.
6. Write a test that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md`.
9. Commit with a message stating what was verified.
10. Report honestly, including what did *not* move.

---

## 5. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Rules that apply with particular force to a shell, each with the failure it is guarding against:

- **A partially-satisfied item is NOT TESTED, not PASS.** If one clause cannot be evidenced, say
  which clause and hold the item.
- **A theme has no tests, so look at it.** Only two class assertions exist in the whole
  control-room suite (`diffView.test.tsx:97`, `controlRoom.test.tsx:62`) and neither asserts a
  colour. A green suite says nothing about whether the light theme is readable. Evidence for a
  theming item is a rendered screenshot of both themes, plus a contrast figure for the four `ink`
  steps and the six statuses.
- **A launch path is proved by running the command, not by reading the script.** `grok --version`
  under the shim must be byte-identical to `grok --version` without it; `echo $?` after a failing
  `grok` must be the real binary's code. Diff the outputs; do not eyeball them.
- **A checker that cannot be made to fail on demand proves nothing when it passes.** Before
  trusting a "no OpenUI strings remain" grep, plant one and confirm the grep finds it. Four
  consecutive audits in this repository shipped with bugs in the checker itself.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. `AgentCard.tsx` omits every field the server did not supply, and the redesign must
  keep doing that: a visual tile must not invent a percentage to fill a progress ring.
- **A passing test proves a unit works, not that anything calls it.** The whole `/api/library`
  surface is tested and has never been called by a browser. Before marking a shell item PASS,
  confirm the code is reachable from the running application.
- **Adding a check can invalidate an earlier PASS.** Re-run the whole gate every iteration.

---

## 6. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

- **A tracked file needs deleting.** `FEATURES.md`, `bin/openui.js`, `client/src/App.tsx` and the
  legacy `client/src/components/` shell are all deletions this loop wants and none of them is the
  loop's to make. Ask for all of them in one message.
- **The shim shadows the vendor's `grok` on the user's PATH.** That is an outward-facing change to
  the user's shell environment. Confirm it, and confirm the fallback: if the answer is no, the
  command is `grok-workspace` and the decided spelling does not exist.
- **A required credential or external service is missing.**
- **Two requirements contradict one another** — for example "more visual" against "status is never
  colour alone". State both, propose one, and stop.
- **A change would fall outside this worktree's boundary** (§0). File it in §0.1; do not edit.
- **`idle` is red and `failed` is orange** in `client/src/control-room/types.ts:60-77`. Ask before
  changing status semantics.

---

## 7. What counts as done

Fifteen items. Each has a required result whose clauses are separately observable, and an evidence
form to fill in in `VERIFICATION.md`. A clause that cannot be evidenced holds the whole item.

#### SHELL-001: The shim forwards everything it does not own

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

#### SHELL-002: `--common_version` opens the workspace

Required result:

* `grok --common_version` starts the server and opens a browser at the workspace;
* the real TUI is not started;
* a positional prompt is carried into the new-project form;
* the server binds `127.0.0.1` only.

Evidence:

```text
Command run:
Process tree after launch:
URL opened:
Prompt observed in the form:
Listening socket (host:port):
```

#### SHELL-003: The shim cannot recurse

Required result:

* `real-grok-path` holds an absolute path and is never a path inside the shim's own bin directory;
* `install-shim` refuses when the resolved real binary is the shim;
* `detectGrok()` does not return the shim, with the shim first on PATH;
* a test asserts this and fails when the self-exclusion is reverted.

Evidence:

```text
Contents of real-grok-path:
install-shim refusal (command and message):
detectGrok().binaryPath with shim on PATH:
Test name, and its output with the fix reverted:
```

#### SHELL-004: `--` ends the flag scan

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

#### SHELL-005: A second invocation does not start a second server

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

#### SHELL-006: Three regions, resizable, addressable

Required result:

* navigator, main and inspector render on every page;
* each side region collapses and resizes, and its width survives a reload;
* every page and every selected object has a URL that restores it;
* the browser back button moves between pages.

Evidence:

```text
Regions present on each page:
Widths before / after reload:
URLs exercised:
Back-button behaviour:
```

#### SHELL-007: Four pages and the Tools panel

Required result:

* AGENTS, DOC HUB, USERS and X are reachable from the navigator;
* the Tools panel opens over `MAIN` on all four pages;
* Esc dismisses it and returns to the page underneath, unchanged;
* the panel's open state is in the URL.

Evidence:

```text
Pages reachable:
Panel opened from each page:
State of the underlying page after Esc:
URL with the panel open:
```

#### SHELL-008: Light and dark both render

Required result:

* a theme control switches both themes with no reload;
* the choice persists across a restart;
* no page load flashes the wrong theme;
* `client/src/index.css` contains no hardcoded colour outside the two `:root` blocks.

Evidence:

```text
Toggle observed:
Persistence mechanism and key:
FOUC check (recording or frame timings):
grep for hex literals in index.css:
```

#### SHELL-009: No raw white/neutral token remains

Required result:

* zero occurrences of `text-white`, `bg-white/`, `border-white/`, `divide-white/`, `bg-neutral-9`
  in the workspace client;
* every colour resolves through a token;
* both themes screenshotted, side by side, on all four pages.

Evidence:

```text
grep counts, before / after:
Files touched:
Screenshots:
```

#### SHELL-010: Status is never colour alone, in both themes

Required result:

* every status pill renders its text label in both themes;
* the colour element is `aria-hidden`;
* each of the six statuses has a light pair chosen for contrast, and the six are distinguishable
  from one another in both themes;
* the label still renders with the class attribute blanked.

Evidence:

```text
Six statuses, both themes (screenshot):
Contrast ratios, light:
aria-hidden confirmed on:
Test asserting label survives className removal:
```

#### SHELL-011: No OpenUI string is reachable from the browser

Required result:

* the page title, the first-run greeting, the guide and every visible heading name grok-workspace;
* no visible string names OpenUI, Claude Code or the canvas;
* a planted control string proves the check can fail.

Evidence:

```text
grep pattern and result:
Planted string, and where the check caught it:
Screens inspected:
```

#### SHELL-012: The package identity is grok-workspace

Required result:

* `package.json` name, description, author, repository, bugs, homepage and keywords describe this
  product;
* `bin` maps to the shim entry;
* `client/package.json` name matches;
* `bun run verify` is green after the change.

Evidence:

```text
package.json diff:
bin entry:
Gate result:
```

#### SHELL-013: The first-run greeting shows once

Required result:

* it appears on the first load when `workspaceGreetedAt` is absent;
* it names the four media, the Doc Hub and the cost;
* it does not appear on the second load;
* it does not read or write `tourCompleted`.

Evidence:

```text
First load (screenshot):
Second load:
Settings keys written:
grep for tourCompleted in the new code:
```

#### SHELL-014: The guide is re-openable and covers every section

Required result:

* every navigator page and every inspector section has an entry;
* the toolbar `?` opens it from any page;
* a per-page `?` opens it at that page's entry;
* it opens after the greeting has been dismissed, and after being read.

Evidence:

```text
Entries, against the section list:
Opened from:
Reopened after dismissal:
```

#### SHELL-015: The gate is green

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

---

## 8. Definition of done

The shell is complete only when SHELL-001…SHELL-015 all pass with recorded evidence, no item is
NOT TESTED, `bun run verify` is green, both themes have been looked at on all four pages, and the
launch command has been run from a terminal that had never seen the workspace before.

Only then output `The shell is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
