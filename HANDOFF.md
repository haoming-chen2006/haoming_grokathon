# Handoff — Grok Build Project Control Room

A visual workspace for supervising Grok Build coding agents that turn a design document into
reviewed, tested, merge-ready code. Built on a fork of OpenUI.

Branch **`grok-control-room`**, 90 commits, pushed to `github.com/haoming-chen2006/openui`.
Never merged to `main`.

---

## 1. Start here

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a          # OPENAI_API_KEY — the model backend needs it
export PATH="$HOME/.bun/bin:$PATH"

bun run verify                    # typechecks, 745 tests, build, four audits
bun run dev                       # UI on :6969, API on :6968
```

Then open **`http://localhost:6969/?view=control-room`**.

### The whole loop, from the browser

1. **Open a repository** — the empty state is a form: repository path, base branch, name,
   objective, budget, and the design document itself. Requirements are read from list items shaped
   `- AUTH-01: description` and previewed before you submit.
2. **Plan** tab → **Generate plan**. A real Planner agent reads the design and the repository and
   proposes tasks. It lands as a **draft**.
3. **Approve Plan**. Nothing runs before this — launching first is refused with
   `PLAN_NOT_APPROVED`, and the Launch buttons say so.
4. **Launch** a task. This creates an isolated worktree on its own branch, opens a Grok session in
   it, and briefs the agent with its objective, acceptance criteria, expected files and tests. The
   agent then works on its own: implements, runs the tests, records the result, commits, and
   submits for review.
5. **Reviews** tab → **Approve**, then **Approve Merge**. Merging completes the task, unblocks
   whatever depended on it, and completes the requirement if its gate is satisfied.

The command line does step 1 and 2 in one go, against a real repository:

```bash
bun run new -- --repo /path/to/repo --design ./design.md --plan
```

---

## 2. What the commands are

| Command | What it does |
|---|---|
| `bun run verify` | typecheck (server + client) → tests → production build → the four audits. **The gate.** |
| `bun run dev` | Vite on 6969 proxying the API on 6968 |
| `bun run new` | create a project from a design document; `--plan` also runs the Planner |
| `bun run acceptance` | the §22.16 end-to-end flow, 20 steps, against a fixture it builds itself |
| `bun run audit` | reachability + endpoints + §22.18 quality + doc citations |

`bun run acceptance` is the only test that exercises the whole system with a real agent. It builds
a repository that **starts red**, so a green run means the agent did the work.

---

## 3. The four documents

| File | Role |
|---|---|
| `product-design.md` | the product contract, §1–21. What the system must become. |
| `verifiables.md` | the completion checklist, V-001…V-052. What counts as done. |
| `VERIFICATION.md` | the evidence ledger — every item's status with a reproducible command, plus a record of every bug found and how. ~4,800 lines. |
| `loopdesign.md` | the loop operating document: how to pick the next piece of work, and the rules learned the hard way. |

`VERIFICATION.md` is the deliverable. If you read one thing, read its §22.19 gate and the
iteration entries from 73 onward — those are where the product's real failures were found.

---

## 4. Where the code is

```text
server/services/     acpClient, acpSessionManager   Grok over ACP (JSON-RPC on stdio)
                     projectStore                   projects, requirements, tasks, messages, artifacts
                     projectMcpServer               31 MCP tools the agents use
                     repository                     worktrees, diffs, merges, branch protection
                     planner, taskBriefing          what the Planner and each agent are told
                     agentRegistry, usageAccounting agents, cost and budget caps
                     codeReview, designReview       submission evidence and the completion gate
server/routes/       projects, agents, repository, library, mcp
client/src/control-room/   the three-panel UI: ProjectHeader, AgentCanvas, PlanPanel,
                           ReviewQueues, ConversationView, SessionDrawer, NewProjectPanel
shared/              designDocument.ts — the requirement parser, used by the CLI and the browser
scripts/acceptance/  the 20-step end-to-end run
scripts/audit/       reachability, endpoints, quality, docs
```

---

## 5. State of the work

```text
52 of 52 checklist items PASS
745 tests across 44 files, 0 fail
four audits clean: 0 orphans, every endpoint has a caller,
                   0 unclassified quality indicators, every doc citation resolves
bun run acceptance: 20 of 20 steps
115 files changed, ~30,700 insertions
```

### Open, and needing your decision

**Q-2 — three tracked files that predate this project and are reachable from nothing.**

```text
bin/openui.js                       dead Express entry point; the live CLI is bin/openui.ts
server/index.js                     dead Express server; the live one is server/index.ts
client/src/components/Terminal.tsx  491-line xterm view from the original OpenUI shell
```

Deleting tracked files that predate this work is the repository owner's call, not the loop's. One
word — `delete` or `keep` — closes the last §22.19 gate item. They are listed in
`scripts/audit/reachability.mjs` so the audit stays at zero orphans meanwhile.

### Open, and unresolved

**One unreproduced test failure.** A UI test failed once in the full suite and not in 20+ runs
since. The instrumentation to attribute the next occurrence is in place (the failure now carries
the agent's reply, stop reason and tool-call count, and asserts its fixture before blaming the
model). It is **not** fixed. Two *other* intermittent failures were chased to root cause and fixed
— see iterations 63 and 66 — so this one is genuinely separate.

### Deviations — recorded deliberately, not oversights

| Where | What |
|---|---|
| §9 | internal Grok subagents as expandable child tasks — not implemented; the design marks it optional |
| §10 | "optional deadline" on a project — the API has nowhere to store one, so the form does not ask |
| §13 | 6 of 40 MCP tools are deliberately user-only (approve, request changes, merge…) — giving an agent the ability to approve its own work defeats the review gate |
| §14 | `agent.tools` is stored and consulted by nothing; no interface offers it |
| §16 | cost is not tracked per requirement, branch, tool call or test run; approval threshold, max retries and max tool-call count are unimplemented |
| §21 | requirement→cost is the one traversal of the core-value sentence that is not reachable |

**Known limitation:** the API and MCP endpoints have **no authentication**. Defensible for a
loopback single-user tool, and §20 lists enterprise access controls as an explicit non-goal — but
it is why the server binds `127.0.0.1` by default. Do not set `OPENUI_HOST` without adding auth.

**Costs are estimates.** Every figure carries `estimated: true` and a `rateKey`; the transport
reports tokens, not billed dollars.

---

## 6. What to know before changing anything

These are the rules that actually caught bugs. The long version is §5 of `loopdesign.md`.

**Reachability is not configuration.** The audits prove a module is imported. They cannot see that
it is imported by the wrong caller, or that a function with optional parameters is called with none
of them. The largest bug in the project was `newSession()` called bare, so no agent ever received
its MCP tools or persona — while every module involved was reachable and tested.

**Test the call site, not the argument builder.** Testing what a function *would* pass proves
nothing about whether anything calls it. `AcpSessionManager` and `runPlanner` both take an
injectable connection factory so a test can read what `session/new` actually receives. Use it.

**The bugs are in the user-driven path.** Nearly every real defect since iteration 73 was found by
running the product as a user, not by testing it — because the tests set up state the product is
supposed to set up itself. Launch not creating a worktree, Launch not briefing the agent, merging
settling nothing: all invisible to a 700-test suite, all obvious within one minute of clicking.

**Write a positive control for every checker, and more than one.** Five audits shipped with bugs in
the checker itself. In one case the first probe passed for accidental reasons and only the second
exposed it. A checker that cannot be made to fail on demand proves nothing when it passes.

**A surprising result is usually the checker.** An audit reporting nine dead controls had two real
findings and seven caused by deriving component names from filenames. Verify before acting.

**If the behaviour has an effect, assert the effect.** A live test that asserts on model prose is
measuring phrasing. Where the reply *is* the behaviour — session memory, isolation — the reply is
the right assertion, and those five are listed in the ledger as irreducibly model-dependent.

**Capture the gate's output.** `bun run verify > file 2>&1` before committing, never `>/dev/null`.
With an occasional live-agent failure, the re-run is usually green and the evidence is gone.

---

## 7. If you keep going

In rough order of value:

1. **Keep clicking.** The user path is still the richest source. Multi-task plans with real
   dependencies, two agents working at once, and an agent that gets stuck are all unexercised.
2. **A provider registry.** Everything is bound to Grok over ACP with one OpenAI-compatible
   endpoint configured in `~/.grok/config.toml`. MLflow's AI Gateway is cloned to `.refs/mlflow`
   for reference — its `ProviderRegistry` is the pattern that would let these agents run on
   something else. That is the single biggest architectural limitation.
3. **Agent-to-agent handoffs in anger.** The tools exist and are tested; no run has yet had one
   agent block on another's contract and resolve it.
4. **The §21 cost traversal**, if per-requirement cost is worth having.

Do not add features to close checklist items — they are all closed. Add them because using the
product made something obviously missing.
