# Handoff — pivot/tools (the Tools panel)

Branch `pivot/tools`. Owns `client/src/control-room/tools/**`, and extends
`server/routes/library.ts` and `server/services/promptLibrary.ts`.

> **Scope note.** `loops/06-tools-and-cost.md` names this loop `06-tools-cost` on branch
> `pivot/tools-cost` with handoff `loops/handoff/pivot-tools-cost.md`, and gives it *both* the Tools
> panel and the cost engine. The brief for this worktree narrows that to the Tools panel alone, on
> branch `pivot/tools`, with this file as the handoff. That is a scope narrowing, not a
> contradiction: nothing here touches `usageAccounting.ts` or `costLedger.ts`, and the pre-existing
> `pivot-tools-cost.md` is left untouched for whoever builds the cost half. Reconciliation should
> read both files. The one overlap is `client/src/control-room/tools/cost/`, which already exists on
> this branch and which this worktree has not modified.

---

## 1. A-00 finding — grok's skill format IS our skill format (TOOL-8)

**Question (brief §5):** can grok's skill/plugin format BE our skill format, so a skill written in
this panel is one the terminal already understands, and a user's existing grok skills appear in the
panel for free?

**Answer: yes, for skills, completely. Verified by execution, not by reading.**

### Evidence

Environment: `grok 1.0.0 (3cd0d0cbcebe)`, at `~/.grok/bin/grok`.

> Note for the product contract: `grok-workspace.md` §3.3.0 states "as of `grok 0.2.118`". The
> installed CLI is **1.0.0**. Several §10.2 claims do not survive the version bump — see §1.3.

**1.1 The format.** `~/.grok/README.md:1603-1640` — a skill is a *directory* whose entry point is
`SKILL.md`, YAML frontmatter with two required fields, markdown body:

```markdown
---
name: commit
description: Create well-formatted git commits... Use when the user wants to commit changes.
---

# Git Commit Skill
...
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | lowercase, hyphens, max 64 chars |
| `description` | yes | what it does **and when to use it** — this is how grok decides to invoke it |

Bundled skills carry three further optional keys that the README does not document but the shipped
files use (`~/.grok/bundled/skills/design/SKILL.md`): `when-to-use`, `argument-hint`, and a body
that may reference sibling files. `~/.grok/bundled/skills/pdf/` is a real multi-file skill —
`SKILL.md`, `reference.md`, `forms.md`, `tax.md`, `scripts/`, `forms/` — which is exactly §10's
"a preprocessed **directory** of markdown files fronted by a **discovery prompt**", already shipping.

**This maps onto the product's definition with nothing left over.** The `description` field *is* the
discovery prompt. The directory *is* the directory. No format needs inventing.

**1.2 Discovery works with zero code on our side — probed live.**

```console
$ grok inspect | grep 'Skills ('
  Skills (22)                       # baseline, all `bundled`

$ mkdir -p ~/.grok/skills/openui-probe && cat > ~/.grok/skills/openui-probe/SKILL.md   # name + description
$ grok inspect | head -3
  Skills (23)
  └ openui-probe                user     # ← discovered, tagged `user`, no restart, no registration
```

Discovery roots, in priority order (`README.md:1580-1591`) — later entries lose to earlier ones on
a name collision:

| Path | Scope |
|---|---|
| `./.grok/skills/` | Local (highest) |
| `<repo_root>/.grok/skills/` | Repo |
| `~/.grok/skills/` | User |
| `~/.claude/skills/` | User (Claude Code compat, `README.md:2328`) |
| `[skills] paths = [...]` in `config.toml` | extra roots |

So: **writing `<root>/<skill-name>/SKILL.md` is the whole of "create a skill".** A user's existing
grok *and Claude Code* skills appear in the panel for free, because the panel reads the same roots.

**1.3 Where `grok-workspace.md` §10.2/§10.3 is wrong for grok 1.0.0 — this is the one that bites.**

§10.2 claims grok has "a `[skills] disabled` list that keeps a skill listed but out of the system
prompt — literally 'turned down'", and §10.3 builds a three-state control on it.

**There is no `[skills] disabled` key in grok 1.0.0.** `[skills]` accepts `paths` and `ignore` only
(`README.md:1595-1601`). `disabled` is a **`[plugins]`** key (`README.md:1757`) — the section was
misread. Nor does the README mention "progressive disclosure" or a "listing budget" anywhere.

And `ignore` is not a turn-down. Probed:

```console
$ printf '\n[skills]\nignore = ["~/.grok/skills/openui-probe"]\n' >> ~/.grok/config.toml
$ grok inspect | grep 'Skills ('
  Skills (22)                       # ← 23 → 22. Gone from the listing entirely, not dimmed.
```

Upstream turn-down is therefore **binary**: discovered, or not discovered. (Config and probe were
both restored; `~/.grok` is back at 22 skills with no `[skills]` section.)

**Consequence for TOOL-6, which needs three states.** The middle state is *ours* and must be, but it
costs no runtime: the panel lists skills from **disk**, so a skill we add to `[skills] ignore` stays
visible and editable in the panel while being invisible to every agent. That yields exactly the
three states TOOL-6 asks for, with the off-switch enforced by grok itself rather than by us:

| State | On disk | In `[skills] ignore` | In the panel | Agent sees it |
|---|---|---|---|---|
| absent | no | — | no | no |
| listed-but-inactive | yes | yes | yes, marked **Off** | no |
| active | yes | no | yes, marked **On** | yes |

Because the state lives in `config.toml`, it survives a reload and a restart for free — TOOL-6's
"written to configuration, not held in memory".

**1.4 What does NOT map, stated precisely.**

* **Prompts.** grok has no prompt-template concept. The nearest thing is a skill with an
  `argument-hint`, which is a different mechanism (model-invoked, not copy-and-paste).
  `PromptTemplate` + `renderPrompt()` stay ours. No conflict — nothing to unify.
* **Workflows.** `grok --help` on 1.0.0 exposes **no** workflow flag or subcommand, and `grok
  inspect` reports Skills / Agents / Plugins / MCP only — no workflow section. There is a *bundled
  skill* named `create-workflow`, which is a skill about workflows, not a workflow runtime.
  §10.2's "a workflow is a script with a host API… spawn child agents, parallel fan-out, phases, a
  budget query, a human-gate pause" is **not visible in this CLI's surface**. Our `ProjectWorkflow`
  (a static DAG) is therefore not shadowing an upstream engine today. **This is the open question
  that TOOL-008's "executable, or honestly named" hangs on** — see §4.
* **Subagents** are `--agent` / `--agents <JSON>` and `~/.grok/bundled/agents/`; that is the AGENTS
  page's territory, not this panel's.

**1.5 The decision taken.** Skills in this product are grok skill directories. The panel is a
filesystem editor and a config writer over the roots in §1.2 — not a second skill runtime. No skill
format has been invented on this branch.

---

## 2. Requests for hot files — one line, and it is already anticipated

**`client/src/control-room/shell/pages.ts`** — set `TOOLS_PANEL` to this branch's component.
Line 55 already says reconciliation does this.

```ts
import { ToolsPanel } from "../tools/ToolsPanel";
export const TOOLS_PANEL: ToolsPanelComponent | undefined = ToolsPanel;
```

`ToolsPanel` implements `ToolsPanelProps` from `shell/contract.ts` exactly — `{ projectId, section,
onClose }` — and renders **only the body**: no scrim, no Esc handler, no header, no close button.
`WorkspaceShell.tsx:305-345` owns all four, and the panel does not duplicate them.

**Nothing else is requested.** `/api/library` is already mounted at `server/routes/api.ts:34`, so no
mount request is needed — checked rather than assumed.

---

## 3. The event contract — what the shell forwards, and what `01-agents` dispatches

Declared in `client/src/control-room/tools/contract.ts`. **That module is the only thing another
worktree imports from this loop** (re-exported from `tools/index.ts`). No component import crosses
in either direction: `agents/**` is `01-agents`' and an import both ways is a cycle.

### 3.1 Inbound — opening the panel from an agent card (§4.6)

```ts
export const OPEN_TOOLS_EVENT = "workspace:open-tools";
export interface OpenToolsDetail { agentId?: string; tab?: "prompts" | "skills" | "workflows" }
```

`01-agents` dispatches it (`dispatchOpenTools({ agentId })`). **The shell listens** and turns it
into a route change — `workspaceUrl(page, selection, tab ?? "prompts")` — because the shell owns the
route and the overlay must stay deep-linkable. The panel also listens, but only to pick up
`agentId`, so "send this to the agent I was just looking at" needs no second selection.

### 3.2 Outbound — injecting into a running agent (§4.5, TOOL-011) ← **the one this loop needs**

```ts
export const INJECT_RESOURCE_EVENT = "workspace:inject-resource";
export interface InjectResourceDetail {
  kind: "prompt" | "skill" | "workflow";
  resourceId: string; resourceName: string; resourceVersion: string;
  agentId: string; projectId: string;
  text: string | null;                                        // deliver into the live session
  mounts: Array<{ relativePath: string; contents: string }>;  // 01-agents writes these
  effective: "this_turn" | "next_session";
  effectNote: string;                                         // already shown to the user
  estimatedInputTokens: number;
}
```

The panel has **already resolved** against `POST /api/library/injections/resolve` before dispatching,
so every field is the server's own answer. The listener's whole job is:

1. if `text` is non-null, deliver it through the existing session message path;
2. if `mounts` is non-empty, write them **through `01-agents`' boundary** — this loop writes no file
   into a work area, and a test asserts the filesystem is untouched by resolution;
3. record one ledger row, `{ operation: "injection", resourceId, agentId, projectId }`
   (`InjectionLedgerHint`), so "what did adding that skill cost?" is answerable.

**The payload is carried rather than re-resolved from an id, deliberately.** If the event carried
`{kind, resourceId}` the delivering side would resolve a second time and could disagree with what
the user was already shown — and `effectNote` is a sentence they have read by then.

**`effective` is not decoration.** A skill mounted without a one-shot paste reaches nothing until the
agent restarts, and the panel says exactly that. A listener that reports success for a
`next_session` injection re-creates the failure TOOL-011 exists to prevent.

---

## 4. Status

**Iteration 1** — the A-00 finding above, established by probe before any component was written
(brief §5 ordering).

**Iteration 2** — server foundation. Skills became grok skill directories on disk (`GrokSkillStore`),
turn-down became `[skills] ignore` in `config.toml`, PATCH/DELETE landed for all three types, a
corrupt `library.json` stopped looking like an empty one, and `resolveInjection` landed pure.

**Iteration 3** — the panel. Three sections against the real `/api/library`, create/edit/delete for
each, server-side render, turn up/down, and injection by typed event.

| Item | State | Where |
|---|---|---|
| TOOL-1 opens over every page, Esc, URL-driven | **done** — shell's frame, panel renders body only | `ToolsPanel.tsx` |
| TOOL-2 three sections list from `/api/library` | **done** | `api.ts`, `toolsPanel.test.tsx` |
| TOOL-3 create all three in-panel | **done** | the three `*Section.tsx` |
| TOOL-4 edit + delete all three | **done**, new endpoints included | `library.ts`, `promptLibrary.ts` |
| TOOL-5 prompt renders via server `renderPrompt` | **done** | `PromptsSection.tsx` |
| TOOL-6 skill turns up/down, survives reload | **done**, via `config.toml` | `GrokSkillStore.setState` |
| TOOL-7 injection + event contract recorded | **done** | §3.2 above |
| TOOL-8 A-00 finding written with evidence | **done** | §1 above |
| TOOL-9 tests + `bun run typecheck` clean | **done** — 109 tests | see below |

`bun run typecheck` is clean. 109 tests pass across `promptLibrary.test.ts`, `library.test.ts` and
`toolsPanel.test.tsx`. The full gate is deliberately not run: siblings have half-finished edits on
disk (brief §7).

### What is NOT done, and is honestly outstanding

* **TOOL-007, "a skill never arrives twice."** `rulesForAgent` still concatenates every assigned
  legacy skill into `rules` at `session/new`. Now that skills are also discovered from disk, an
  agent assigned a legacy skill *and* holding a mounted directory of the same content would receive
  it twice. Not fixed here because changing `rulesForAgent`'s semantics affects
  `acpSessionManager.ts` and `planner.ts`, both outside this brief's boundary. **Reconciliation
  should treat this as a real defect, not a nicety.**
* **The `session/load` question (§4.5).** Whether reopening a session re-runs skill discovery is
  still unverified, so the panel says `next_session` and means the next *new* session. The probe to
  run is in the loop document.
* **Legacy vs disk skills.** `/api/library/skills` still serves the `library.json` model (agents
  reference those ids); `/api/library/grok-skills` serves the real directories and is what the panel
  uses. Collapsing the two is a migration, and it needs `01-agents` at the table.

---

## 4. Open question for reconciliation — not blocking, but it shapes TOOL-008

`grok 1.0.0` shows no workflow engine (§1.4). `grok-workspace.md` §10.2 asserts a rich one exists
upstream and tells this loop not to build a second. Both cannot be acted on.

The three readings, and what each implies:

1. the engine is real but undocumented in `README.md` and unexposed by `--help` / `inspect`;
2. it landed in a version this machine does not have, or was removed before 1.0.0;
3. §10.2 describes a *different* product's workflow API and was written from memory.

Whoever owns the cost/workflow half should resolve this before building either a runtime or a
renamed DAG. This branch does not resolve it and does not depend on the answer: prompts and skills
are unaffected, and the panel's workflow section is built against the `ProjectWorkflow` that
`promptLibrary.ts` already persists.
