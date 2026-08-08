# Software — Loop Operating Document

This is the instruction set for one iteration of the software loop. Read this file first, act,
then stop. It is deliberately short; the documents it points at hold the detail.

| Document | Role |
|---|---|
| `grok-workspace.md` | The product contract. What the system must become. |
| `loopdesign.md` | The house form and the evidence standards this document inherits. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

> **Software** is one of the five asset types — documents, slides, tables, workflows, software. It
> means a website or an app, built for someone who cannot read the code, in the manner of Lovable.
> It is the only asset type whose artifact is still source code, and therefore the only one where
> the retired product's machinery — worktrees, briefing, submission verification, review, merge —
> is not vestigial. That machinery is the single thing the retired product got fully working. This
> document's central claim is that software is cheap *because* it is the only surface that gets to
> keep it.

**What this surface owes the canonical demo.** Nothing, directly, and that is deliberate. The demo
is "I need to do this sales presentation": research, X, slides, video. No agent in it writes an
app. Software is what the same team does the *second* time the user opens the workspace — "now I
need a little page where the sales team can pick which deck to send". The obligation this surface
carries into the demo is negative: it must not exist loudly. No branch picker, no diff, no test
tally, no merge button anywhere the demo's user can see them. The software page is a preview of a
running app and a list of what changed in plain English, or it is the wrong product.

**Where you are in the order.** The owner has fixed the build and test order and it is not
negotiable:

```text
FIRST, and robustly tested:   AGENTS   ·   ASSETS   ·   DESIGN DOCUMENTS
THEN:                         slide generation
                              workflow / video generation
                              software generation      <- you
```

You are last. Everything in §7 depends on surfaces three other worktrees are still building. Read
§6 before writing a line of code: most of what this document specifies cannot be started yet, and
knowing which part *can* is the whole of your first iteration.

---

## 0. Your boundary

You are in a **git worktree, on your own branch**. You are not in the main checkout. Seven other
agents are working at this moment on sibling branches off the same base, and none of you can see
each other's files. The whole product is about boundaries; start by honouring your own.

```text
loop      05-software
branch    pivot/software
owns      server/services/software/**
          client/src/control-room/software/**
```

**The files you own.** You may create and edit anything under those two directories and nothing
else. That includes the `.test.ts` file beside each module — tests live next to their subject, in
your area. It also includes your template fixtures.

**The files you must not touch.** Every path owned by another row of the partition below, and
every path owned by nobody. The reason is not politeness: eight agents are producing eight branches
that must merge, and a one-line courtesy edit to a file you do not own is invisible to its owner
until it conflicts, at which point it costs more to untangle than it saved. This is the same rule
the product itself enforces on agents (`grok-workspace.md` §7, §8) — you may read anything, suggest
anything, and write only inside your area.

```text
01-agents        pivot/agents      server/services/workArea.ts, server/services/boundary.ts,
                                   server/services/agentTeam.ts, server/services/agentRegistry.ts,
                                   server/routes/agents.ts, client/src/control-room/agents/**
02-assets        pivot/assets      server/services/assetStore.ts, server/routes/assets.ts,
                                   client/src/control-room/assets/**
03-design-docs   pivot/design-docs server/services/designDoc.ts, server/services/presence.ts,
                                   server/routes/designDocs.ts, client/src/control-room/designdoc/**
04-generation    pivot/generation  server/services/xai/**, server/services/render/**,
                                   server/routes/generation.ts
05-software      pivot/software    server/services/software/**,
                                   client/src/control-room/software/**          <- you
06-tools-cost    pivot/tools-cost  server/services/promptLibrary.ts, server/routes/library.ts,
                                   server/services/usageAccounting.ts, server/services/costLedger.ts,
                                   client/src/control-room/tools/**
07-shell         pivot/shell       client/src/main.tsx, client/src/index.css,
                                   client/tailwind.config.js, client/src/control-room/shell/**
08-users-x       pivot/users-x     server/services/auth.ts, server/routes/users.ts,
                                   server/services/x/**, client/src/control-room/users/**
guide            pivot/guide       docs/USER-GUIDE.md only, and no code at all
```

Note what you were **not** given: any file under `server/routes/`. That is not an oversight to
route around. Your HTTP surface is a Hono router defined inside your own area and exported; the one
line that mounts it is somebody else's edit, requested through the protocol below.

### The hot-file protocol

These files are shared by everyone. **No worktree may edit them directly**, because an eight-way
conflict in any of them would cost more than all of the feature work put together:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, you do not make it. You append a precise request to
a file only you own:

```text
loops/handoff/pivot/software.md
```

Each request states the file, the exact change, the reason, and the signature or event shape other
worktrees will depend on. A single reconciliation pass applies every request at the end. Design
your own code so it can be wired in by one edit: **export a clean entry point rather than reaching
into the shell.** Concretely, you will need at least these four, and you should discover no others:

```text
1  server/index.ts        one line:  app.route("/api/software", softwareRoutes)
2  server/index.ts        one line in the shutdown path: await stopAllPreviews()
                          — a preview is a child process; a server that exits without killing
                          it leaves a Vite instance holding a port until the machine reboots
3  package.json           the template's dependencies are NOT ours (§5.4). If you believe you
                          need a runtime dependency in the workspace itself, that is a §9 stop,
                          not a handoff request
4  server/types/*.ts      the SoftwareAsset shape, IF 02-assets does not already carry it
                          — ask 02-assets first, in your handoff file, before asking for a type
```

### What you leave behind for reconciliation

See §10. Write it as you go, not at the end; the assumptions you make about another worktree on
day one are the ones you will have forgotten by the time anyone merges.

### Naming convention in this file

Files that exist today are in backticks. Files still to be built are named inside fenced blocks.
The documentation audit resolves backticked paths against tracked files, and a backticked path to
a file that does not exist yet is exactly the kind of confident-wrong citation the audit was
written to catch. Today its `DOCS` list is `["VERIFICATION.md", "loopdesign.md", "README.md",
"HANDOFF.md"]` (`scripts/audit/docs.mjs`), so `loops/` is not checked yet — honour the convention
anyway, because it will be. `.refs/` is gitignored (`.gitignore:41`), so nothing under it can be
backticked either; the reference clone is named in fenced blocks throughout §3.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

```bash
./node_modules/.bin/grok --version        # expect: grok 0.2.118
bun run verify                            # expect: exit 0
bun run audit                             # expect: 0 orphans, every endpoint covered
```

**A red gate is always the highest-priority work**, ahead of any item in this document. Capture
verify's output to a file, never `>/dev/null` — a live-agent flake runs at roughly one in five, and
the re-run that goes green destroys the evidence.

Then confirm the reference clone is present and at the commit this document was written against:

```bash
git -C /Users/haoming/openui/.refs/open-lovable log -1 --format='%H %ci %s'
# expect: 69bd93bae7a9c97ef989eb70aabe6797fb3dac89 2025-11-19 -0500 v3
```

If the hash differs, every line number and file count in §3 is suspect. Re-read before trusting.

### Credentials you do not need

This is the only generation surface that needs **no new credential**. Software is produced by the
`grok` binary over the existing ACP transport, using whatever signs the CLI in. You do not call
`api.x.ai`, you do not need `XAI_API_KEY`, and you do not need the Vercel, E2B, Firecrawl, Morph,
Anthropic, OpenAI, Groq or Google keys that the reference implementation requires (§3.2). If you
find yourself writing a `fetch` to any host other than `localhost`, stop and re-read §3.5.

---

## 2. State as of iteration 0

```text
SW-001…SW-016    0 PASS · 0 FAIL · 3 BLOCKED · 13 NOT TESTED
Gate:            inherited green — both typechecks, the production build, four audits.
Surface:         zero. No file under server/services/software/ exists.
Machinery:       substantial, and already proved. See §4.
```

The three BLOCKED items are blocked on other worktrees, not on effort:

```text
SW-002  a software asset is declared in a design document — blocked until 03-design-docs
        ships the read interface. There is no other way to declare one (§5.1).
SW-009  a software asset lands in the Assets page — blocked until 02-assets ships the
        store and can accept kind: "software".
SW-014  two agents, two worktrees, two previews — blocked until 01-agents ships work areas,
        because the second agent has nowhere to live.
```

Everything else is NOT TESTED because it has not been written. Do not mark an item PASS against a
double for another worktree's surface: a stub that agrees with you proves nothing, and three items
in the retired product were once marked PASS on evidence that was real and unreachable.

---

## 3. The reference implementation, read in full

`.refs/open-lovable` is a clone of `github.com/firecrawl/open-lovable`, pinned at
`69bd93bae7a9c97ef989eb70aabe6797fb3dac89` (2025-11-19, tagged "v3"). It is Firecrawl's open
example of the Lovable idea. Everything in this section comes from reading that clone directly —
**none of it appears in the seven research reports**, which predate this direction. Treat §3 as
first-hand reading, verifiable by the commands quoted, not as inherited research.

### 3.1 What it actually does

You type a sentence, or paste a URL. A model writes a whole React app. The app appears, running, in
an iframe next to the chat, within about a minute. You type another sentence and it changes. That
is the entire product, and it is genuinely good at the one thing it does.

Two entry paths:

```text
"build me a landing page for a dog-walking business"     -> generate from a prompt
"clone https://example.com"                              -> Firecrawl scrapes the URL,
                                                            extracts brand styles and a
                                                            screenshot, then generates
```

The second path is why Firecrawl wrote it: the scraper is the demo, the app builder is the
showcase. Four of its twenty-seven API routes exist only to serve it — `scrape-website`,
`scrape-url-enhanced`, `scrape-screenshot`, `extract-brand-styles` — plus `search`, which fans out
to `api.firecrawl.dev/v1/search`.

### 3.2 The architecture, precisely

```text
browser (Next.js App Router page)
   │
   │  POST /api/create-ai-sandbox      -> boots a REMOTE sandbox, scaffolds a Vite+React app
   │  POST /api/generate-ai-code-stream-> streams model output as XML-ish <file> blocks
   │  POST /api/apply-ai-code-stream   -> regex-parses those blocks, writes them into the sandbox
   │  POST /api/detect-and-install-packages -> npm install inside the sandbox
   │  GET  the sandbox's public URL    -> shown in an <iframe>
   ▼
Vercel Sandbox  (default)  or  E2B  — a hosted VM running `vite dev` on a public URL
```

Concrete facts, each checkable in the clone:

* **281 source files** across `app/ lib/ components/ config/ types/ hooks/`, 33,938 lines. The two
  largest are `app/generation/page.tsx` at **3,957 lines** and
  `app/api/generate-ai-code-stream/route.ts` at **1,895 lines**. Both are single files. This is a
  demo's codebase, not a library's.
* **27 route handlers** under `app/api/`, several in `-v2` pairs (`create-ai-sandbox` and
  `create-ai-sandbox-v2`, `run-command` and `run-command-v2`, `install-packages` and
  `install-packages-v2`) with both versions live.
* **The model contract is XML in prose, parsed by regex.** The system prompt instructs the model to
  emit `<file path="src/App.jsx">…</file>` blocks; `parseAIResponse` in
  `app/api/apply-ai-code/route.ts` recovers them with
  `/<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g`, keeps a map keyed by path, and prefers the
  version that has a closing tag, then the longer one. There is explicit truncation detection —
  counting `<file path="` against `</file>` — and a re-prompt that asks the model to resend a file
  it cut off. Truncation *recovery* is switched off in config with the comment "too many false
  positives" (`config/app.config.ts`).
* **The sandbox is remote and hosted.** `lib/sandbox/types.ts` declares an abstract
  `SandboxProvider` with `createSandbox / runCommand / writeFile / readFile / listFiles /
  installPackages / getSandboxUrl / terminate / isAlive`, plus optional `setupViteApp` and
  `restartViteServer`. `lib/sandbox/factory.ts` picks `e2b` or `vercel` from `SANDBOX_PROVIDER`.
  Vercel's sandbox times out after 15 minutes, E2B's after 30.
* **There is exactly one sandbox per server process.** `app/api/create-ai-sandbox/route.ts`
  declares `global.activeSandbox`, `global.sandboxData`, `global.existingFiles`,
  `global.sandboxState`, `global.sandboxCreationInProgress` and `global.sandboxCreationPromise`, and
  `lib/sandbox/sandbox-manager.ts` ends with `global.sandboxManager = sandboxManager`. Creating a
  second sandbox stops the first. Conversation state is a single `global.conversationState`.
* **Model providers are four, and none is xAI.** `lib/ai/provider-manager.ts` wraps
  `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/groq` and `@ai-sdk/google`, with an optional
  Vercel AI Gateway in front. The default model is `google/gemini-3-pro-preview`; the menu is
  GPT-5, Kimi K2 via Groq, Sonnet 4, Gemini 3 Pro. `maxTokens` is 8,000.
* **A fifth paid provider is optional.** `lib/morph-fast-apply.ts` posts `<edit>` blocks to
  `api.morphllm.com/v1/chat/completions` for fast partial edits, behind `MORPH_API_KEY`.
* **Verification is heuristic.** `lib/build-validator.ts` sleeps 3,000 ms, fetches the sandbox URL,
  and string-matches the returned HTML for `"Vercel Sandbox Ready"`, `"Vite + React"`, `id="root"`
  and `vite-error-overlay`. It never runs a build.
* **Error detection scrapes a shadow DOM.** `components/HMRErrorDetector.tsx` polls
  `iframe.contentDocument` every 2,000 ms for a `vite-error-overlay` element, reads
  `.message-body` out of its shadow root, and regex-matches `Failed to resolve import "…"` to
  auto-install the missing package. Its whole body is wrapped in `try { } catch { }` with the
  comment "Cross-origin errors are expected, ignore them" — and the sandbox *is* cross-origin, so
  on the default configuration this component silently detects nothing.
* **There are no tests.** `package.json` declares `test:api`, `test:code` and `test:all` pointing
  at `tests/api-endpoints.test.js` and `tests/code-execution.test.js`. The `tests/` directory does
  not exist in the repository. `test:all` also calls `test:integration`, which is not defined.

### 3.3 The licence — what borrowing is permitted

```bash
cat /Users/haoming/openui/.refs/open-lovable/LICENSE
```

**MIT, "Copyright (c) 2024"**, with no named copyright holder in the notice. MIT grants the right
to use, copy, modify, merge, publish, distribute, sublicense and sell, on one condition: *"The
above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software."*

So, plainly:

* **Ideas, architecture and prompt technique: free.** Copyright does not cover them and nothing is
  owed.
* **Copied source: permitted, with attribution.** Any file or substantial portion you lift must
  carry the MIT notice. Put it at the top of the file *and* record the origin — repo URL, commit
  hash, original path — in a comment, so the next reader can diff against upstream.
* **The blank copyright holder is not an invitation.** Attribute to "the open-lovable authors,
  github.com/firecrawl/open-lovable" and cite the commit; do not paste a notice claiming a
  copyright year with no owner as if it were ours.
* **Our repository is MIT too** (`package.json`), so there is no compatibility problem to solve.
* **Trade dress is not licensed.** Firecrawl's name, logo and the flame artwork under
  `components/shared/` and `public/` are not yours because the code is MIT. Copy none of it.
* This is a licence *reading*, not legal advice. If a substantial verbatim copy is ever proposed,
  that is a §9 stop — the owner decides what ships under someone else's notice.

**The practical answer: you will copy almost nothing.** §3.5 explains why, and it is not a licence
problem.

### 3.4 What is worth borrowing

Five things, in descending order of value. All five are ideas, not files.

1. **One template, pre-installed, never regenerated.** The sandbox is scaffolded with Vite, React,
   Tailwind, a `vite.config.js` and a `package.json` *before* the model is asked for anything, and
   the prompt says, four times and in capitals, never to create `tailwind.config.js`,
   `vite.config.js` or `package.json`. This is the single highest-value decision in the codebase:
   it removes the entire class of failure where the model writes a build configuration that does
   not build. Copy the decision exactly (§5.4).
2. **A file manifest drives context selection, not a full dump.** `lib/context-selector.ts` picks
   *primary* files to edit and *context* files to read, and always includes `App.jsx`, the Tailwind
   config, `index.css` and `package.json` regardless of intent. Our agents get this free — the
   worktree is a real directory with real tools — but the always-include list is a good default for
   the briefing.
3. **Classify the intent before choosing the blast radius.** `lib/edit-intent-analyzer.ts` (509
   lines of regexes) sorts a request into `UPDATE_COMPONENT`, `ADD_FEATURE`, `FIX_ISSUE`,
   `UPDATE_STYLE`, `REFACTOR`, `FULL_REBUILD`, `ADD_DEPENDENCY`. The regexes are brittle and we
   should not copy them; the *distinction* they encode — "change the header colour" must not
   regenerate the app — is exactly right and belongs in our briefing as a rule the agent is told,
   not a classifier we run.
4. **A missing import is a package to install, not an error to show.** Parsing
   `Failed to resolve import "x"` out of the dev server's output and installing `x` turns the most
   common failure into a non-event. Take the idea; take the base-package extraction too (an
   `@scope/name` keeps two segments, a plain `name/sub` keeps one).
5. **Export as a zip.** `app/api/create-zip/route.ts` exists because a non-technical user
   eventually wants the thing off the platform. It is the honest escape hatch when the answer to
   "can you deploy it" is no (§5.7).

### 3.5 What does not transfer, and why

**The model provider layer does not transfer, and we do not want an xAI version of it.**
`lib/ai/provider-manager.ts` exists to turn a model id into a chat client that streams text. Our
product does not have that problem: `server/services/acpClient.ts` speaks ACP — JSON-RPC 2.0 over
NDJSON on stdio — to `grok agent --always-approve stdio`, and `grok` is *already a coding agent*
with real file tools, a working directory, and a session. Adding the Vercel AI SDK would give the
workspace a second model transport with a second credential and a second cost path, to do worse
what the first one already does.

That single difference invalidates the largest part of the reference implementation:

| open-lovable | us | why |
|---|---|---|
| model emits `<file path>` XML in prose | agent writes files with its own tools | the XML pipeline exists only because a chat completion cannot touch a disk. Ours can. |
| regex parser, duplicate resolution, truncation detection, re-prompt recovery | none of it | ~1,600 lines of `apply-ai-code*` and half of `generate-ai-code-stream` are scaffolding around that one limitation |
| 8,000 max tokens forces "generate every file in ONE response" | a multi-turn session | the prompt's shouting about never saying "I'll continue with the remaining components" is a symptom of a single-shot budget |
| `lib/file-parser.ts` regex-extracts imports and exports | the agent reads the files | we do not need a JavaScript parser to tell an agent what it can open itself |

**The sandbox does not transfer either, but for a different reason.** Vercel Sandbox and E2B are
hosted VMs. Each needs its own credential, each bills per minute, each times out (15 and 30
minutes), and E2B's provider cannot even reconnect — `reconnect()` in
`lib/sandbox/providers/e2b-provider.ts` returns `false` with a comment saying so. We do not need
any of it. The user's app is being built on the user's own machine by an agent that already has a
directory there. **Our sandbox is a git worktree and a child process.** What survives is the
*interface shape*: create, write, read, list, install, url, terminate, isAlive — that is the right
set of verbs for a preview, and §5.5 reuses it almost name for name.

**The singleton must not transfer.** One `global.activeSandbox` per process is fine for a
single-user demo and fatal here: this product's first premise is a *team* of agents. Two agents
building two apps must not stop each other's preview. Anything you carry across from `sandbox-
manager.ts` must be keyed by asset id from the first line.

**Three more that would be defects if copied.** `validateBuild`'s string-matching of returned HTML
is unfalsifiable — it cannot distinguish "the app renders" from "the app renders an empty div", and
we have a build command with an exit code. `HMRErrorDetector`'s shadow-DOM scraping is dead on
arrival for the same cross-origin reason it is already dead upstream; read the dev server's own
stderr instead, which is a stream we own. And the `-v2` route pairs with both versions live are the
shape of a codebase with no tests; ours has 715, and a duplicated endpoint would fail the endpoint
audit.

---

## 4. What the machinery already does — the reason this loop is small

The reuse map classifies git worktrees, diffs, test runs and merge as **dead on arrival** for the
pivot. That verdict is correct for slides, documents and tables. **It is wrong for software**, and
noticing that is worth more than anything else in this document: software is the one asset type
whose artifact is still a directory of source files under version control, so the machinery the
retired product built and proved is not being retired here — it is being *scoped down to the one
place it was always right*.

What exists today, is tested, and you must reuse rather than rebuild:

* **Isolation.** `createAgentWorktree` (`server/services/repository.ts:161`) runs
  `git worktree add -b agent/<taskId>` and the launch path calls it
  (`server/routes/projects.ts:493`). `server/services/agentExecution.test.ts` proves an agent edits
  files in its own worktree and that the sibling worktree stays clean — with the fixture asserted
  *before* the model runs, so a failure is attributable to the product or to the model and never to
  both.
* **Briefing.** `buildTaskBriefing` (`server/services/taskBriefing.ts:16`). Its prose is
  code-specific and for every other asset type that is a problem; here it is the point. Read the
  comment at the top of that file before rewriting a word of it: launching used to open a session
  and say nothing, and the agent sat idle. Read the second comment too — an agent finished its work
  and ran `git push origin`, which on a repository with a remote would have published unreviewed
  work. The "do not push, do not contact a remote" paragraph is a scar. Keep it.
* **Submission that does not trust the agent.** `submitCode` checks the agent's claimed file list
  against what git actually says and records `claimedChangedFiles`
  (`server/services/projectStore.ts:754`) only when the two disagree — written after a real run in
  which an agent listed a test file it had never touched.
* **A refusal that names the missing field.** `missingSubmissionFields`
  (`server/services/codeReview.ts:41`).
* **A completion gate that says which clause is unmet.** `evaluateCompletionGate`
  (`server/services/codeReview.ts:70`) returns the gate *and* an `unmet` list, and carries
  `failingTestsAcknowledged` because a requirement merged on an acknowledged partial failure could
  otherwise never complete — observed on a real run, with progress stuck at 50% after both tasks
  were done.
* **A merge with invariants.** `mergeAgentBranch` (`server/services/repository.ts:327`) refuses
  without a named approver, refuses a branch that is zero commits ahead, and aborts and restores on
  conflict.
* **An agent cannot approve its own work.** `DELIBERATELY_USER_ONLY`
  (`server/services/projectMcpServer.ts:696`) withholds `approve_code_submission`,
  `request_code_changes`, `request_merge`, `record_review_result`, `request_requirement_change` and
  `submit_architecture_comment` from every agent. Add nothing to that list and remove nothing from
  it.
* **A deterministic reviewer.** `server/services/designReview.ts` is deterministic on purpose — a
  reviewer that returns a different verdict each run cannot gate anything.
* **A secret scanner.** `assertNoSecrets` (`server/services/secrets.ts:113`), 12 patterns, already
  called on every document and message write.
* **Path canonicalisation.** `canonical` and `assertManagedPath`
  (`server/routes/repository.ts:44`, `:59`) resolve through symlinks and close both the macOS
  `/var`→`/private/var` false refusal and the `<root>/link → /etc` false approval. Each failure mode
  was found by a real test. Copy that function; do not re-derive it.
* **A test process runner.** `runTests` and `detectTestCommand` (`server/services/testRunner.ts:117`,
  `:34`) already spawn a command in a directory with a timeout and parse counts, with `parsed:
  false` as an honest unknown that is never treated as success.

Three corrections to that inheritance, and none of them is optional:

1. **Worktrees never enforced anything.** Isolation today is a `cwd` handed to the agent
   (`server/services/acpSessionManager.ts`), running under `--always-approve`; an absolute path in
   any write tool leaves the directory instantly. `assertAgentCanWrite`
   (`server/services/repository.ts:261`) and the entire `ApprovalQueue`
   (`server/services/approvals.ts`) have **zero production callers**, and
   `server/hooks/shellSafetyHook.ts` is never installed by this repository and only classifies
   shell commands. Git made a stray edit **recoverable** — it landed on a throwaway branch and
   showed up in a diff — and never **prevented** one. Real enforcement is 01-agents' work
   (`server/services/boundary.ts`): a PreToolUse hook that canonicalises every path argument and
   calls `process.exit(2)`, because a deny expressed in stdout JSON is ignored under
   `--always-approve`. **Do not build a second one.** Do say, in every place a user might infer
   otherwise, that the worktree is a recovery net and not a jail.
2. **`testRunner.ts` belongs to nobody.** It is in no row of the partition. Read it, import it,
   and do not edit it. The build check you need is not a test run and belongs in your own area
   (§5.6).
3. **Diffs, branches, worktree paths and test tallies do not reach this product's interface.**
   `client/src/control-room/DiffView.tsx` does not survive as a user-facing surface. They may exist
   in the data model; a salesperson never sees one.

---

## 5. The design

### 5.1 How a user describes an app — in a design document, nowhere else

**A design document is not a document asset.** The document asset is an output; the design document
is the interactive interface — the surface where work is declared and watched — and it is the only
place a project is defined. Software is declared there like everything else:

```text
The user opens a design document and writes, in their own words:

    ## Deck picker
    A little page where the sales team can see every deck we've made and pick one
    to send. Search by customer name. Show the date. Clicking a deck copies a link.

A project follows that document. One agent is assigned. The software asset is created
when the agent starts, not when the user finishes typing.
```

Three consequences you do not get to design around:

* **There is no "new app" form.** If you find yourself specifying a modal with a name field and a
  framework picker, you have built a second place where a project can be defined, and the product
  now has two sources of truth. The declaration is prose in a document.
* **The cardinality is the document's, and it is strict.** One project may follow multiple
  documents; one document may be followed by **at most one** project. Never two. That invariant is
  03-design-docs' to enforce; your code must never create a second project against a document, and
  the read interface you consume must let you check it. Assume you will be handed a
  `projectFollowingDocument(docId) -> projectId | null` and say so in your handoff file if it does
  not exist.
* **Line-level presence is not yours either, but you must emit it.** Agents are required to report
  the line numbers they are reading or working on, periodically, and that emission is what drives
  the highlighting in the document. The mechanism belongs to 03-design-docs
  (`server/services/presence.ts`). Your obligation is that the *software briefing* carries the
  instruction and the cadence, in the same words 03 specifies, and that your MCP tool registration
  does not shadow theirs. Be honest in the UI copy you write: **a model can forget to call a tool.**
  Presence goes stale, and stale presence must render as "last seen 4 min ago", never as a live
  cursor that has stopped moving.

### 5.2 How the agent builds it

Nothing new. This is the existing launch path, with a template instead of an empty repository.

```text
1  the user approves the plan                    one click, one sentence, existing gate
2  createAgentWorktree()                          server/services/repository.ts:161
3  the template is copied into the worktree       §5.4 — only on the first task for this asset
4  buildTaskBriefing()                            server/services/taskBriefing.ts:16, extended
5  the ACP session opens with cwd = worktree      server/services/acpSessionManager.ts
6  the agent edits files with its own tools       already proved by agentExecution.test.ts
7  the agent calls run_build                      §5.6 — deterministic, exit code, no model
8  the agent calls submit_code_for_review         claimed files verified against git
9  the user sees a PREVIEW and a plain-English summary        §5.3, §5.7
10 the user approves; mergeAgentBranch()          named approver, or it refuses
```

Steps 2, 4, 5, 6, 8 and 10 are existing code. Steps 3, 7 and 9 are yours. That is the whole build.

**The briefing needs four additions and no rewrite.** Add them as a software-specific block, not by
editing the general briefing, which you do not own:

```text
- the app you are building is described in the design document; here are the lines
- the template is already installed. Never create or edit package.json, vite.config.js
  or tailwind.config.js. They exist and they work.                    (§3.4 item 1)
- match the blast radius to the request. "make the header black" changes one className.
  Do not regenerate a file you were not asked to change.              (§3.4 item 3)
- report the lines of the design document you are reading, every N turns, with
  <the presence tool 03-design-docs names>                            (§5.1)
```

**Agent capability is `base`.** Capability is chosen at agent creation — base Grok, +images, +voice,
+voice+images — and it decides which `api.x.ai` endpoints an agent may call. A software agent is
base Grok. It cannot generate an image, which means it cannot run up a media bill: a base agent's
whole spend is text turns. If an app needs a picture, that is a media asset produced by a different
agent with the capability, landing in Assets, and referenced from the app. Do not add image
capability to a software agent to save a round trip; that is how a $5.52-per-minute price list
reaches a surface that had no business touching it.

### 5.3 Where the code lives

```text
<project workspace root>/
  assets/
    software/
      <assetId>/          <- a git repository. Its own repo, not a subdirectory of ours.
        .git/
        package.json      from the template, never regenerated
        vite.config.js    from the template, never regenerated
        index.html
        src/
        .agents/          worktrees. excludeAgentsDir (server/services/repository.ts:144)
                          already appends `.agents/` to .git/info/exclude rather than to
                          the tracked .gitignore, so we create no diff in the user's app
```

Decisions, each with its reason:

* **Its own repository, not ours.** The user's app must never share history with the workspace's
  own source. Sharing it means an agent's branch is a branch of our product, `bun run verify` sees
  the user's files, and a merge conflict in their app is a merge conflict in ours.
* **One repository per software asset**, initialised with one commit of the pristine template, so
  the first diff a reviewer sees is the agent's work and not the scaffold.
* **Under the project workspace root**, so it is inside the boundary 01-agents enforces and inside
  the tree 02-assets already walks.
* **Every path is canonicalised before use.** Copy `assertManagedPath`
  (`server/routes/repository.ts:59`). An `assetId` arriving from an HTTP request is untrusted input,
  and `../` in an asset id is the oldest bug in this class.
* **`git ls-files` is not how you list it.** `listRepositoryFiles`
  (`server/services/repository.ts:403`) shows tracked files only, so a newly written file is
  invisible until it is added. Use a real directory walk with the exclusion list.

### 5.4 The template — exactly one, and we own it

```text
server/services/software/templates/vite-react/
```

A minimal Vite + React + Tailwind application, checked into our repository, copied into the asset
repo on creation. The user never sees the words "Vite", "React" or "Tailwind" anywhere in the
interface.

* **One template.** Not three. A second doubles the surface that must be robustly tested, and you
  are last in the build order — the owner is paying for depth here, not breadth.
* **Its dependencies are not ours.** They live in the template's own `package.json`, installed into
  the asset repo. Nothing in this loop adds a runtime dependency to the workspace's `package.json`,
  which is a hot file and a §9 stop besides.
* **The template must build before an agent ever touches it** (SW-001). A template that does not
  build turns every first run into a debugging session in a codebase the user cannot read.
* **Node modules are installed once per asset**, not per worktree, or four agents mean four
  `node_modules` trees. Worktrees share the asset repo's install; state plainly in your tests
  whether that holds for the package manager you pick, because it is an assumption, not a fact.
* **Offline is a first-class case.** The first `install` needs a network. If there is none, say so
  in one sentence — "this needs to download the app's building blocks once" — and stop. Do not
  retry sixteen times.

### 5.5 Preview — a process, not a page

Preview is the evidence a non-technical user reads. It is also the only asset type whose artifact
cannot be looked at without running something, which makes it the only one that needs a process
supervisor.

```text
server/services/software/preview.ts

  start(assetId, worktreePath) -> { port, url, state }
  stop(assetId)
  status(assetId)   -> starting | running | failed | stopped, plus the last 200 lines of output
  stopAllPreviews()                       called from server shutdown (§0 handoff item 2)
```

The verbs are lifted from `lib/sandbox/types.ts` in the reference clone (§3.5); the implementation
is a `bun`/`node` child process running the template's dev server in the worktree, on an ephemeral
port, in the user's own machine.

Rules, each of which is a correction of the reference implementation:

* **Keyed by asset id from the first line.** Never a singleton (§3.5). Two agents, two previews.
* **A concurrency cap and an idle timeout.** A dev server is a few hundred megabytes of resident
  memory. Cap the number of simultaneous previews, stop the least recently viewed first, and say in
  the UI which one was stopped and why. Never kill one silently.
* **The error channel is the dev server's stderr, not the iframe's DOM.** Upstream polls
  `iframe.contentDocument` for an error overlay inside a `try {} catch {}` that swallows the
  cross-origin failure — and the sandbox is cross-origin, so it detects nothing. A dev server on a
  different port is cross-origin from our page too. Read the child process's own output, which we
  own, and stream it to the client over the existing WebSocket. This is strictly better *and*
  simpler, which is the tell that the upstream approach was a workaround for not owning the process.
* **Same-origin proxying is an option, not the plan.** Proxying the dev server through our origin
  would restore DOM access, and would require proxying the HMR WebSocket too. If a later item needs
  it, spike it and record the result; do not assume it works. **Unverified**: whether Hono on Bun
  proxies an upgrade request to a child process cleanly. The exact thing to check is a `vite` HMR
  reconnect surviving one file edit through the proxy.
* **`localhost` only.** The preview binds to the loopback interface. Not `0.0.0.0`. Upstream binds
  `0.0.0.0` because its sandbox is a remote VM that has to be reachable; ours is the user's laptop,
  and a dev server on a café network is an outward-facing surface nobody asked for.
* **A preview is never the gate.** It is what the human looks at. The gate is §5.6.

### 5.6 The gate — the build, not the report

```text
server/services/software/buildRunner.ts

  runBuild(worktreePath, timeoutMs) -> { command, exitCode, stdout, stderr, durationMs, ok }
```

One deterministic check, run in the worktree, whose result is an exit code:

* **`ok` is `exitCode === 0` and nothing else.** No string matching against HTML, no sleep-then-
  fetch, no model judgement. `validateBuild` upstream cannot tell "renders" from "renders an empty
  div"; a build either compiles or it does not.
* **A build that could not be run is `parsed: false`, never a pass.** That is `TaskTestRun`'s
  discipline (`server/types/project.ts`) and it applies here unchanged: an honest unknown is never
  treated as success.
* **The output is captured and kept**, both streams, and attached to the submission. Asserting an
  effect and discarding the evidence makes the next failure undiagnosable — a flake in the retired
  product went unexplained for twenty iterations for exactly this reason.
* **The retry bound is written down with its reason.** A failing build re-prompted forever is a
  spend loop. Two attempts, then it is a blocker the user sees.
* **It duplicates a little of `runTests`.** That is deliberate: `server/services/testRunner.ts` is
  owned by no worktree and you may not edit it. Import what fits, write only the build-specific
  part, and say so in a comment so the reconciliation pass can fold them together later.

The MCP tools your area registers, exported as **one** register function so another worktree can
wire them in a single edit:

```text
registerSoftwareTools(server, ctx)

  run_build            deterministic build, returns the exit code and the tail of the output
  start_preview        returns the preview URL, or the reason it did not start
  get_preview_errors   the dev server's recent stderr
  list_app_files       a real directory walk, not git ls-files
```

Register nothing that approves anything. `DELIBERATELY_USER_ONLY` is the most important design
decision in `server/services/projectMcpServer.ts` and nothing you add may erode it.

### 5.7 What the user sees

```text
┌──────────────────────────────┬───────────────────────────┐
│                              │  Deck picker              │
│      the running app         │  Building · 2 min · $0.04 │
│      in an iframe            │                           │
│                              │  Search now filters by    │
│                              │  customer name.           │
│                              │  Added a date column.     │
│                              │                           │
│  [ Reload ]  [ What changed ]│  [ Approve ]  [ Ask for   │
│                              │               a change ]  │
└──────────────────────────────┴───────────────────────────┘
```

* **The app, never a report about the app.** The editor area shows the artifact — that is the whole
  reason for the idiom.
* **"What changed" is prose, not a diff.** The agent's summary, which the submission already
  requires. If a file list is shown at all it is `src/DeckList.jsx` styled as "the deck list", never
  a unified diff.
* **Failure is a sentence and a preview that says why.** "It didn't build. The app is trying to use
  something called `react-datepicker` that isn't installed." Then one button: try installing it.
* **Nothing is fabricated.** An absent field is omitted, never defaulted to something plausible. No
  invented percentage, no placeholder dollar figure. `$0.00` is not a cost; a missing cost is
  missing.
* **Every state carries a text label as well as a colour.** `server/types/agent.ts` states the rule
  at the top of the file and `client/src/control-room/uiChecklist.test.tsx` enforces it. A more
  visual product does not get to trade that away.
* **There is no deploy button.** Deploying is an irreversible outward-facing operation and requires
  a human decision the product does not yet have a place for. The v1 answer to "can you put this on
  the internet" is **no**, said plainly, with an export-as-zip next to it (§3.4 item 5). Do not
  build a deploy path and gate it; do not build one at all.

---

## 6. The build sequence

**Do not start until all three of these are true.** They are the owner's ordering, and they are not
advisory: the AGENTS, ASSETS and DESIGN DOCUMENTS pages are built and robustly tested first, and
slide, workflow/video and software generation come after.

```text
PRECONDITION 1   the AGENTS page ships work areas and boundary enforcement, tested
PRECONDITION 2   the ASSETS page ships a store that accepts a new asset kind, tested
PRECONDITION 3   the DESIGN DOCUMENTS page ships the read interface and presence, tested
```

Until then, exactly three things in this document can be done, and they are the right three because
none of them touches another worktree:

```text
STAGE 0 — startable today, no dependencies
  0.1  the template, and the proof that it builds                     SW-001
  0.2  buildRunner.ts and its tests, against the template             SW-004
  0.3  preview.ts: start, stop, status, cap, idle timeout, stderr     SW-005, SW-006
       — testable against the template with no agent and no project
```

Then, in order:

```text
STAGE 1 — after the three pages
  1.1  the asset repo: create, template commit, canonicalisation      SW-003
  1.2  the software briefing block                                    SW-002
  1.3  registerSoftwareTools, exported for one wiring edit            SW-004, SW-006
  1.4  the submission path end to end, reusing the existing gates     SW-008
  1.5  the asset record lands in Assets                               SW-009

STAGE 2 — the surface
  2.1  the preview panel, the plain-English summary, approve/ask      SW-007
  2.2  export as zip                                                  SW-015
  2.3  two agents, two worktrees, two previews                        SW-014

STAGE 3 — the honest edges
  3.1  no secret reaches the artifact                                 SW-010
  3.2  nothing deploys, and the refusal is visible                    SW-011
  3.3  install is bounded and offline says so                         SW-012
  3.4  the retry bound holds                                          SW-013
  3.5  licence notices on anything borrowed                           SW-016
```

Stage 0 is a full iteration's work and produces a preview you can open in a browser with no rest of
the product around it. That is the right first deliverable: it is the only part of this loop whose
failure modes are yours alone.

---

## 7. What counts as done

Each item is `Required result:` — observable clauses — and `Evidence:` — a fenced block of empty
labelled fields to be filled in `VERIFICATION.md`. **A partially-satisfied item is NOT TESTED, not
PASS**; say which clause failed and hold the item.

#### SW-001: The template builds before any agent touches it

Required result:

* a fresh copy of the template installs and builds from a clean checkout;
* the build exit code is 0 and the build produces output files;
* the dev server starts and serves a page containing the app's own root element;
* the template's `package.json` is not the workspace's `package.json`.

```text
Install command and duration:
Build exit code:                Output files:
Dev server port and first-byte time:
Workspace package.json unchanged:
```

#### SW-002: An app is declared in a design document, not in a form

Required result:

* the software asset is created from prose in a design document, with no name field and no
  framework picker anywhere in the flow;
* the agent's briefing contains the document lines that describe the app;
* the agent can quote the description without being told it separately;
* creating a second project against the same document is refused.

```text
Document lines used:
Briefing excerpt:
Marker observed in session:
Second-project refusal:
```

#### SW-003: The agent works in a worktree and nowhere else

Required result:

* the agent's session `cwd` is its worktree;
* files it writes appear in its worktree;
* they do not appear in a sibling agent's worktree or on the asset repo's main branch;
* the asset repository's history is separate from the workspace repository's history;
* the fixture is asserted *before* the model runs, so a failure lands on the precondition or after
  it and is attributable either way.

```text
Worktree path:                  Sibling worktree state:
Files written:
Asset repo HEAD vs workspace repo HEAD:
Precondition assertion:
```

#### SW-004: The gate is the build, not the agent's report

Required result:

* `run_build` runs the real build command in the worktree and returns its exit code;
* a deliberately broken source file produces a non-zero exit and the error text is captured;
* an agent claiming success on a failing build cannot pass the gate;
* a build that could not be run at all is recorded as unknown, never as a pass.

```text
Green build exit code:
Red fixture and its error text:
Agent claim vs gate result:
Unrunnable case:
```

#### SW-005: A preview is a process with a lifecycle

Required result:

* `start` returns a URL that serves the app;
* `stop` terminates the child process and frees the port, confirmed by the OS, not by our record
  of it;
* an idle preview stops on its own after the timeout;
* the concurrency cap is enforced and the user is told which preview was stopped and why;
* server shutdown leaves no orphaned process.

```text
URL and port:                   Process id:
Port state after stop:
Idle timeout observed:
Cap behaviour and message shown:
Orphan check after shutdown:
```

#### SW-006: A failing preview reports the real error

Required result:

* a missing package produces an error the user can read, naming the package;
* the error comes from the dev server's own output, not from scraping the iframe;
* the failure is visible in the UI within one polling interval;
* a cross-origin iframe does not cause a silent no-op anywhere in the path.

```text
Injected failure:
Error text surfaced:            Source stream:
Latency to visible:
Cross-origin behaviour:
```

#### SW-007: The user sees the app, never the diff

Required result:

* the software panel shows a running preview and a prose summary;
* no unified diff, branch name, worktree path or test count appears in the default interface;
* every state has a text label as well as a colour;
* no value is fabricated when the server did not supply it.

```text
Screenshot:
Grep of the panel for diff/branch/worktree/tests:
Status labels present:
Absent-field behaviour:
```

#### SW-008: Review and merge reuse the existing gates

Required result:

* a submission missing a required field is refused, and the refusal names the field;
* the claimed file list is verified against git and a discrepancy is recorded;
* merge refuses without a named approver;
* merge refuses a branch that is zero commits ahead;
* a merge conflict aborts and restores;
* no agent can call any tool in `DELIBERATELY_USER_ONLY`.

```text
Missing-field refusal:
Claimed vs actual file list:
Unapproved merge attempt:
Zero-commit merge attempt:
Conflict case:
Agent tool-access check:
```

#### SW-009: A software asset lands in the Assets page

Required result:

* the asset appears in Assets with `kind: "software"` and no manual step;
* it shows a preview thumbnail or a clearly-labelled placeholder, never a fabricated one;
* an uncommitted file in the worktree does not make the asset disappear from the listing;
* opening it from Assets opens the preview.

```text
Asset id and kind:
Listing evidence:
Uncommitted-file case:
Open-from-Assets path:
```

#### SW-010: No secret reaches the artifact

Required result:

* `assertNoSecrets` runs over every file the agent writes into the asset repo;
* a planted key is refused at write time and named in the refusal;
* the refusal reaches the user, not only the log;
* an exported zip is scanned before it is produced.

```text
Planted pattern:
Refusal text and where shown:
Export scan result:
```

#### SW-011: Nothing is deployed

Required result:

* no code path in this area contacts any host other than `localhost` and the package registry;
* the preview binds to the loopback interface only;
* the interface says plainly that publishing is not available, and offers export instead;
* there is no hidden or feature-flagged deploy path.

```text
Grep for outbound hosts:
Bind address observed:
Copy shown to the user:
Flag audit:
```

#### SW-012: Package installation is bounded and offline is honest

Required result:

* installation has a timeout and a written reason for its value;
* a package that cannot be resolved fails with the package name, not a stack trace;
* with no network, the failure says so in one plain sentence and does not retry;
* installs are shared across an asset's worktrees, or the document says why they are not.

```text
Timeout value and reason:
Unresolvable package case:
Offline message:
Sharing behaviour observed:
```

#### SW-013: The retry bound holds

Required result:

* a build that fails twice becomes a blocker the user sees, not a third attempt;
* the bound is a constant with a comment stating why;
* the number of model turns spent on the failure is recorded;
* no path in this area can loop without a bound.

```text
Attempts observed:
Blocker surfaced:
Turns spent:
Loop audit:
```

#### SW-014: Two agents, two apps, no interference

Required result:

* two agents build two software assets at the same time;
* each has its own worktree and its own preview on its own port;
* stopping one preview does not affect the other;
* no global singleton exists anywhere in this area.

```text
Asset ids and ports:
Cross-effect test:
Grep for module-level mutable state:
```

#### SW-015: Export produces something that works

Required result:

* export yields a zip containing the app's source and its `package.json`;
* the zip does not contain `node_modules`, `.git` or the agent worktrees;
* extracting it, installing and building it succeeds outside the workspace;
* the export is scanned for secrets first (SW-010).

```text
Zip contents listing:
Excluded paths confirmed:
Clean-room build result:
Scan result:
```

#### SW-016: Borrowed code carries its licence

Required result:

* every file containing a substantial portion copied from the reference implementation carries the
  MIT notice and names the upstream repository, commit and original path;
* an audit lists every such file;
* nothing copied is Firecrawl trade dress — no logo, no wordmark, no flame artwork;
* if nothing was copied, that is recorded as the finding rather than left blank.

```text
Files with borrowed code:
Notice text and origin comment:
Trade-dress check:
"Nothing copied" recorded:
```

---

## 8. Rules for this area

New to this loop. The first four are **scars inherited** from the retired product and are already
paid for; the rest are **predictions from reading the reference implementation**, labelled as such,
so the first recurrence can confirm or refute each one.

Inherited, and not negotiable:

- **An agent will report work it did not do.** Verify the claim against the artifact. This is why
  `claimedChangedFiles` exists.
- **A passing test proves a unit works, not that anything calls it.** Before marking any item PASS,
  confirm the code is reachable from the running application — mounted route, imported component,
  registered tool. Three items in the retired product were marked PASS on evidence that was real
  and unreachable.
- **Never fabricate a value in the UI.** An absent field is omitted.
- **A suspiciously clean result is a bug in the check.** An audit returning all zeros was a broken
  shell variable, not clean code.

Predicted, from §3:

- **A build validator that cannot fail on demand proves nothing.** Write the red fixture first —
  a source file with a syntax error — and confirm the runner reports non-zero, before you trust a
  green run. Four consecutive audits in the retired product shipped with bugs in the checker
  itself.
- **A child process you did not kill is still running.** Assert the port is free at the OS level
  after `stop`, not that your map no longer has an entry. Upstream's manager deletes from a `Map`
  and calls that termination.
- **Cross-origin failures are silent by design.** Upstream's entire error detector is inside a
  `catch {}` that swallows exactly the exception that always fires. Any `try/catch` you write
  around an iframe must log what it caught, or you will ship the same dead code.
- **A retry against a model is a spend loop.** Every retry path here has a bound and a written
  reason for that bound.
- **Never assert on what the model wrote.** Source text is not a stable interface any more than
  prose is (`loopdesign.md:163-169`). Assert the envelope: the build exit code, the file existing,
  the preview serving, the submission's verified file list.
- **Name the operation, not just the goal, in every briefing line.** "Read the file" was read as
  "grep it" by a real agent and cost three iterations. "Change the header colour" must say which
  file and that nothing else may change.
- **When a test can fail for two reasons, make it say which.** Assert the template builds *before*
  the agent runs, so a failure lands on the fixture or on the model.
- **Reproduce under the conditions where it appeared.** A preview test that passes alone and fails
  when two previews run is the failure that matters; run them together.

---

## 9. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop. A blocker restated
across iterations is wasted work — state it once, with evidence, and stop.

- **a change would fall outside the boundary in §0.** Say what you need, from which file, and why,
  in `loops/handoff/pivot/software.md`. Do not edit another worktree's file to unblock yourself,
  and do not quietly work around it either;
- **a runtime dependency is needed in the workspace's `package.json`.** That is a hot file and a
  product decision;
- **a substantial verbatim copy from the reference implementation is proposed.** Shipping under
  someone else's notice is the owner's call (§3.3);
- **anything would be deployed, published, pushed or sent outward** — including a preview bound to
  anything but loopback, and including `git push` from an asset repository;
- **a precondition in §6 has not shipped** and an item cannot be honestly tested without it. Mark
  it BLOCKED with the worktree it waits on. Do not test against a stub of another team's surface
  and record a PASS;
- **the design document read interface, presence tool or cardinality guarantee differs from what
  §5.1 assumes.** Record what you found and stop before building on the new answer;
- **something this document marks unverified turns out to differ** — the HMR proxy spike, shared
  installs across worktrees;
- **the reference clone is at a different commit** than §1 expects, and a fact in §3 no longer
  holds.

---

## 10. Reconciliation — what this worktree hands back

```text
branch          pivot/software
handoff file    loops/handoff/pivot/software.md
```

**The public contract this worktree adds.** Every item is an export from inside
`server/services/software/**` or `client/src/control-room/software/**`, designed so that wiring it
in is one edit each:

```text
softwareRoutes              a Hono router, mounted with one line at /api/software
registerSoftwareTools(s,c)  registers run_build, start_preview, get_preview_errors,
                            list_app_files — one call site, adds nothing to
                            DELIBERATELY_USER_ONLY
stopAllPreviews()           idempotent, called once from the server shutdown path
SoftwarePanel               one React component, one mount point in the shell
softwareBriefingBlock(...)  a string appended to the task briefing; the general briefing
                            is not edited by this worktree
SoftwareAsset               the asset shape: { assetId, repoPath, entryFile, previewState,
                            lastBuild: { exitCode, at }, thumbnailPath? }
                            — offered to 02-assets, whose store owns it
software.preview_state      one control-room event: { assetId, state, port?, error? }
software.build_finished     one control-room event: { assetId, exitCode, durationMs }
```

**What this worktree assumed about others, each of which must be confirmed at reconciliation:**

1. **02-assets** accepts a new asset kind and stores a record it does not own the shape of. Assumed:
   `assetStore` can hold `kind: "software"` with a `repoPath` rather than a single file, and lists
   an asset whose files are not tracked by git. If it cannot, SW-009 fails and the asset record
   moves into this area with a duplicate listing — a worse outcome, and one to raise before it
   happens.
2. **03-design-docs** exposes a read interface for document lines and a `projectFollowingDocument`
   lookup, and owns the presence tool and its cadence. Assumed: this worktree registers no presence
   tool of its own and only carries the instruction into the software briefing. If the presence tool
   is named differently than assumed, the briefing text changes and nothing else does.
3. **01-agents** enforces boundaries at write time in `server/services/boundary.ts`, and this
   worktree builds no second enforcement. Assumed: the enforcement covers the asset repository
   path, not only the workspace root. The worktree remains a recovery net either way, which is why
   this assumption is survivable and must still be stated.
4. **06-tools-cost** owns the ledger. Assumed: a software agent's turns are recorded by the same
   path as every other agent's, with no media units, and this worktree emits no cost events of its
   own.
5. **07-shell** provides one mount point for `SoftwarePanel` and the theme tokens it renders
   against. Assumed: no colour value is hard-coded in this area, so light mode needs no second pass
   here.

**Merge order** is 07-shell, then 01/02/03, then 04/05/06, then 08 — the pages are tested first.
This worktree merges in the third group. By then all five assumptions above are checkable against
merged code rather than against a document, and any that failed should be recorded in
`VERIFICATION.md` as a finding, not silently patched.

---

## 11. Definition of done

Every item SW-001…SW-016 PASS with recorded evidence, no item NOT TESTED, no item BLOCKED,
`bun run verify` green, and one rehearsal recorded in `VERIFICATION.md`:

```text
A user writes, in a design document, a paragraph describing a small internal page. One
agent is assigned. The template is installed, the agent edits source files in its own
worktree, the build passes on its exit code, and a preview of the running app opens in
the workspace. The user reads a prose summary of what changed, approves it, and the work
merges under their name. The app appears in Assets as a software asset. At no point does
the user see a diff, a branch, a worktree path or a test count, and at no point does
anything leave the machine.
```

SW-011 passes as a refusal, not a feature. Record it that way rather than leaving it open.

Only then output `The software surface is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
