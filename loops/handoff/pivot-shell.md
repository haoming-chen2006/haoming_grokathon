# Handoff — pivot/shell

Requests against hot files. Append; do not rewrite.

Merge slot: **FIRST**. 07-shell → 01-agents / 02-assets / 03-design-docs → 04 / 05 / 06 → 08-users-x.

| id | target | state | iteration |
|---|---|---|---|
| R-1 | *(publication, not a request)* | **PUBLISHED** — the contract below is live on `pivot/shell` | 1 |
| R-2 | `client/index.html` | seeded; boot script text lands with SHELL-009 | 1 |
| R-3 | `client/src/control-room/ControlRoomApp.tsx` | seeded; blocked on `WorkspaceShell` existing (SHELL-007) | 1 |
| R-4 | `client/src/control-room/shell/pages.ts` *(my file)* | seeded; the exact one-line-per-page edit is below | 1 |
| R-5 | `package.json` | seeded; exact diff lands with SHELL-013 | 1 |
| R-6 | `server/services/grokDetect.ts` | seeded; patch + failing test land with SHELL-004 | 1 |
| R-7 | `client/src/control-room/types.ts` | seeded; the 18 strings land with SHELL-011 | 1 |
| R-8 | deletions | seeded; **owner decision required** (§6) | 1 |
| R-9 | `server/services/taskBriefing.ts`, `server/services/planner.ts` | seeded; not urgent | 1 |

---

## R-1 — PUBLISH: the shell↔page contract

**Urgent, and the only request here that is. Seven worktrees consume it.** This is not a request
against a hot file; it is the publication that unblocks the parallel build. The text below is the
verbatim content of `client/src/control-room/shell/contract.ts` and
`client/src/control-room/shell/pages.ts` as committed on `pivot/shell` on iteration 1.

**After iteration 1 this changes additively only.** A new optional field is free. A renamed field
is eight broken branches — proved, not asserted: renaming `projectId` fails the client typecheck in
four places (see SHELL-001 in `VERIFICATION.md`).

### R-1.1 The page slot interface — `client/src/control-room/shell/contract.ts`

```ts
/** The five pages. Three headline, two secondary; the ranks are in PageDescriptor. */
export type PageId = "agents" | "assets" | "designdocs" | "users" | "x";

/** The three sections of the Tools overlay. Its contents belong to 06-tools-cost. */
export type ToolsSection = "prompts" | "skills" | "workflows";

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
  section: ToolsSection;
  onClose(): void;
}

export type ToolsPanelComponent = (props: ToolsPanelProps) => JSX.Element;

export const PAGE_SEGMENTS: Record<PageId, string> = {
  agents: "agents",
  assets: "assets",
  designdocs: "designdocs",
  users: "users",
  x: "x",
};

export function workspaceUrl(page: PageId, selectionId?: string, tools?: ToolsSection): string;
```

One difference from `loops/07-shell.md` §3.3.1, stated so nobody has to diff it: the inline union
`"prompts" | "skills" | "workflows"` is named `ToolsSection` and used in both `ToolsPanelProps` and
`workspaceUrl`. It is the identical type; the name exists so 06-tools-cost can import it instead of
re-spelling it. `PAGE_SEGMENTS` and `ToolsSection` are additions to §3.3.1; nothing was removed or
renamed.

**What each consuming worktree needs to know, in one line each:**

* **01 / 02 / 03 / 05 / 08 — you already satisfy this.** A component of `{ projectId: string }` is
  assignable to `WorkspacePageComponent`, so `AgentsPage`, `AssetsPage`, `DesignDocumentsPage`,
  `SoftwarePanel` and `UsersPage` mount into `main` **with no change on your side**, get the full
  MAIN width, and the inspector collapses. There is a compile-time fixture proving exactly this at
  `client/src/control-room/shell/contract.test.tsx`.
* **`navigator` and `inspector` are opt-in later**, without touching the mount line. Take them when
  your page has a list or a properties view; until then MAIN gets the width.
* **The three regions of a page communicate only through `selectionId` / `onSelect`.** There is no
  shared context, no shell-held page state, and no store the shell owns on your behalf. That is
  what makes "location is in the URL" structural rather than aspirational.
* **`projectId` is never empty.** A workspace with no project renders the shell's own first-run
  path, so no page needs a "no project" branch.
* **The shell never imports a page module.** It imports `pages.ts` (R-4). Do not import anything
  from `client/src/control-room/shell/**` other than `contract.ts`.
* **06-tools-cost:** the Tools panel owns nothing about its own visibility. The shell owns the
  mount, the route (`?tools=`), the scrim and Esc. If the panel renders its own scrim or its own Esc
  handler, two dismissal paths fight and the query parameter desynchronises from the DOM.

### R-1.2 The registry — `client/src/control-room/shell/pages.ts`

```ts
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

`main` is undefined for every page on purpose: an import of a path that does not exist yet would
fail the client typecheck in this worktree and in every worktree that merges before its sibling.

### R-1.3 The URL scheme

```text
/agents                      /agents/:agentId
/assets                      /assets/:assetId
/designdocs                  /designdocs/:docId
/users                       /users/:userId
/x                           /x/:draftId
?tools=prompts|skills|workflows      the Tools overlay, on any of the above

/                            → /designdocs when the project has at least one design document,
                               → the first-run path otherwise
```

`workspaceUrl(page, selectionId?, tools?)` is the only supported way to build one of these. It
percent-encodes the selection id — ids are server-issued and opaque to the shell, so one containing
`/` must not become a second path segment — and treats an empty selection id as no selection. Tools
is a query parameter and never a path segment, because opening the overlay must not lose the page
underneath.

Use it for every deep link you emit: an agent notification, a cost alert and a presence event all
need to point at the thing they are talking about.

### R-1.4 The theme token names

Published as **names**. Every other worktree writes token names in class strings and defines no hex
anywhere. If a page needs a colour this list does not have, that is a request to 07-shell, not a
literal.

```text
ground     canvas · surface · surface-hover · surface-active · border · border-strong
ink        ink · ink-muted · ink-faint · ink-ghost            (four steps, not seven opacities)
accent     accent · accent-muted                              (GrokNight magenta / GrokDay purple)
status     status-working · status-waiting · status-needs-review ·
           status-complete · status-idle · status-failed
           each resolving three utilities: bg-*, text-*, border-*
areas      area-1 … area-6, each with:
             bg-area-N        tile and row fills
             text-area-N      the area name
             border-area-N    the row accent bar
             gutter-area-N    the design-document line highlight
```

Two rules that come with them:

* **Status is never conveyed by colour alone, in either theme.** Every status renders a text label;
  the colour element is `aria-hidden`. An area is identified by its name and its colour, never by
  its colour. "Make it more visual" never means replacing a labelled pill with a coloured dot.
* **`gutter-area-N` is chosen, not computed.** It is the one place in the product where colour
  carries meaning at low opacity, and a fill that reads against near-black is frequently invisible
  against `#f5f5f5`.

**Not yet implemented — the token layer itself lands with SHELL-009/010/011 (`tailwind.config.js`
and `index.css`).** The names above are frozen now so nobody writes a hex literal while waiting.
Writing `bg-surface` today compiles to nothing visible until that iteration; writing `#0a0a0a`
today is a migration for someone later.

---

## R-2 — `client/index.html`

```text
line 7:  <title>OpenUI - AI Agent Canvas</title>   ->   <title>grok-workspace</title>
head:    add the theme boot script BEFORE the module script tag
```

**Reason:** without the boot script every page load flashes the wrong theme, and the flash is worst
in exactly the case the feature exists for — a light-mode user on a dark default. It cannot live in
`client/src/main.tsx`: the bundle has not run yet.

The exact script text lands with SHELL-009, because it must name the stored key and the class the
theme provider actually reads, and neither exists yet. Filing the slot now so the reconciliation
pass expects it.

## R-3 — `client/src/control-room/ControlRoomApp.tsx`

Replace the whole file with:

```ts
export { WorkspaceShell as ControlRoomApp } from "./shell/WorkspaceShell";
```

**Reason:** the region layout, routing and page selector live in `shell/`. Leaving the old six-tab
shell in place means two shells in one build.

**Depends:** R-4 must be applied in the same commit, or the page registry has no pages.
**Blocked:** `shell/WorkspaceShell.tsx` does not exist yet (SHELL-007). Do not apply R-3 before it
does — this line is recorded now so the shape of the reconciliation edit is known, not so it can be
applied early.

## R-4 — `client/src/control-room/shell/pages.ts` *(my file — listed so reconciliation knows where)*

One line per page. Set `main` on each descriptor and `TOOLS_PANEL` once:

```text
agents:     main: AgentsPage            from ../agents/AgentsPage
assets:     main: AssetsPage            from ../assets/index
designdocs: main: DesignDocumentsPage   from ../designdoc/index
users:      main: UsersPage             from ../users/index
x:          main: XPage                 from ../x/index          (08, may be absent)
tools:      TOOLS_PANEL = ToolsPanel    from ../tools/index
```

**Reason:** one edit, one file, no conflict. Until applied, each slot renders the honest statement
that the branch has not merged.

A page that also wants the navigator or inspector slot sets `navigator:` / `inspector:` on the same
descriptor in the same edit. Nothing else in the file changes.

## R-5 — `package.json`

```text
name        "@fallom/openui"                    -> "grok-workspace"
description "Visual canvas UI for managing AI…" -> the one-line product description
author / repository / bugs / homepage / keywords -> this product, not JJ27/openui
bin         { "openui": "./bin/openui.ts" }     -> { "grok-workspace": "./bin/grok-workspace.ts" }
```

Also `client/package.json` line 2: `"name": "openui-client"`.

**Reason:** the `bin` name is the install-time collision surface with `@xai-official/grok`'s own
`grok`. It must never be `grok`, or a global install can overwrite the vendor's binary.

The exact diff, dry-run applied and gate-checked, lands with SHELL-013.

## R-6 — `server/services/grokDetect.ts`

`grokBinaryCandidates()` must skip any candidate whose `realpathSync` equals the realpath of the
installed shim.

**Reason:** `grokBinaryCandidates` probes the project-local `node_modules/.bin/grok`, then
`$GROK_HOME/bin/grok`, then **the bare name `grok` resolved via PATH**. With the shim installed
that third candidate is the shim: `probe()` runs `--version`, the shim execs the real binary, a
valid version string comes back, and detection reports `installed: true` with `binaryPath` pointing
at the shim. Every ACP session then spawns through an extra process for no reason, and the day the
argv scan changes, agent start-up breaks in a way that looks like a Grok bug.

The patch and a test that fails without it are attached when SHELL-004 reproduces it. **SHELL-004
cannot read PASS inside this worktree**; its honest state is BLOCKED-ON-RECONCILE.

## R-7 — `client/src/control-room/types.ts`

`STATUS_CLASSES` and `STATUS_DOT` (types.ts:61-77) move to the status tokens of R-1.4. 18 strings,
mechanical; listed verbatim here when SHELL-011 has chosen each light pair.

**Reason:** one file is the single source of status colour for the whole application. Migrating it
centrally is the difference between 18 edits and 300.

**Open question for the owner, filed here so it is not lost:** in `client/src/control-room/types.ts`
`idle` is red and `failed` is orange. That reads backwards, and a light theme is when someone will
notice. Asked, not changed — status semantics are not a shell decision.

## R-8 — deletions, pending the owner's decision

```text
client/src/App.tsx
client/src/components/**        (the legacy OpenUI shell)
FEATURES.md
README.md                       (rewrite rather than delete)
bin/openui.ts, bin/openui.js    (the latter already dead — VERIFICATION.md Q-2)
```

Two hazards for whoever applies them:

* `client/src/App.tsx:14` is the **only** import of `@xyflow/react/dist/style.css` in the repo.
  Deleting or lazy-loading the legacy shell strips React Flow's CSS from anything that still uses
  it. Move or delete that import in the same commit as the deletion.
* `scripts/audit/docs.mjs` fails the build on a dangling backticked citation in `README.md`,
  `HANDOFF.md`, `loopdesign.md` or `VERIFICATION.md`. Delete `FEATURES.md` and every backticked
  reference to it in one commit, or the gate goes red for an unrelated reason.

## R-9 — `server/services/taskBriefing.ts:60` / `server/services/planner.ts:58`

Both put the literal string `openui-project` into every agent's briefing prompt. The old brand is
inside the model context, not just the UI. Not urgent, not cosmetic, not this loop's file.

---

## Identity strings this loop deliberately does **not** rename

Every one is persisted state or a wire-level contract with a migration attached, so renaming one
without its migration loses a user's data or breaks the actor authorisation the MCP server depends
on. Listed so the migration is somebody's job rather than nobody's:

```text
OPENUI_QUIET · OPENUI_HOST · OPENUI_DATA_DIR · OPENUI_SESSION_ID · OPENUI_HOOK_LOG ·
OPENUI_STARTUP_TIMEOUT_MS · OPENUI_POST_SIGNAL_DELAY_MS
~/.openui data directory and its in-place migration in server/services/persistence.ts
x-openui-actor-id · x-openui-actor-kind · x-openui-actor-doc-write
MCP server name openui-project · git author openui-agent
localStorage openui-active-canvas · openui-sidebar-pct · openui-notifications
DOM events openui:toggle-help · openui:toggle-search · openui:restart-tour
```

This loop retires the **browser-visible** and **launch-visible** identity only.

---

## Owner decisions this worktree is waiting on (§6)

Not requests against hot files — questions only the owner can answer. Recorded here so they are
asked once and answered together.

1. **The deletions in R-8.** Deleting a tracked file is the owner's call. `bin/openui.js` has been
   waiting on exactly this decision since VERIFICATION.md Q-2.
2. **The `grok` shim shadows the vendor binary on the user's PATH.** That is an outward-facing
   change to the user's shell environment. If the answer is no, the command is `grok-workspace` and
   the decided `grok --common_version` spelling does not exist. Either way R-5 stands: the npm-
   visible bin name is never `grok`.
3. **The router.** `react-router` is not in `client/package.json`. A new dependency is a
   `package.json` change and therefore a handoff request; hand-rolling ~80 lines over
   `history.pushState` + `popstate` adds none. Needed before SHELL-007. A hand-rolled router that
   later collides with a library another worktree added is exactly the conflict this partition
   exists to prevent.
4. **`idle` is red and `failed` is orange** (R-7). Status semantics, not shell styling.

---

## CORRECTED — the suite does not time out under parallel load; I had no `.env`

**This section previously told every worktree that `bun test` is flaky under parallel load and that
the failures should be tolerated. That was wrong, and tolerating them would have hidden a real
setup error. Retracted in full; the correct finding follows.**

`loops/07-shell.md` §1 opens with:

```bash
set -a; . ./.env; set +a
```

I never ran it. `.env` is gitignored, so it exists in the main checkout and in **no worktree**.
Without `OPENAI_API_KEY` the ACP tests reach a live inference endpoint unauthenticated:

```text
AcpError: Internal error  code: -32603
  message: "Auth recovery succeeded but 4 authenticated inference requests were still rejected
            (401); giving up after 3 retries. Turn ran 7s wall-clock."
  http_status: 401
```

With the key sourced from the main checkout, the same file goes green immediately, and so does
everything else:

```text
$ set -a; . /Users/haoming/openui/.env; set +a
$ bun test server/services/agentExecution.test.ts     4 pass, 0 fail, exit 0
$ bun run verify                                      1065 pass, 0 fail, exit 0, 0 timeouts
```

**What I got wrong, precisely.** The earlier claim rested on a real reproduction — the failures
persisted with my working tree stashed to HEAD — and I concluded from that they were environmental
contention. The reproduction was sound; the conclusion was not. Stashing the tree does not change
the *shell environment*, so it could never have distinguished "my code broke it" from "my
environment is missing a key". Load average correlated by coincidence: other worktrees were busy at
the same times.

**What every worktree should do:** source the key before running the gate. In a worktree the file
is not local, so point at the main checkout:

```bash
set -a; . /Users/haoming/openui/.env; set +a
```

The two failure shapes to recognise, because neither says "missing credential" on its face:

* `AcpError ... http_status: 401` from `acpClient.ts` — unauthenticated inference.
* `this test timed out after 5000ms` in any test that opens an ACP session
  (`projectReads.test.ts`, `messaging.test.ts`) — a session that never completes rather than one
  that fails fast. These have not recurred once since the key was sourced, including at the same
  load that "reproduced" them before, so the load explanation is not supported.

Worth a shared fix that is nobody's file right now: nothing in the repository tells you the key is
missing. The tests reach the network and fail eight different ways instead. A one-line guard in the
test setup that skips-with-a-reason when `OPENAI_API_KEY` is unset would have saved this entirely,
and would belong in `client/happydom.ts`'s server-side equivalent or in a shared test helper.

---

## R-1 addendum (iteration 2) — the token layer is live, and here is how to write against it

R-1.4 published the token **names** on iteration 1 and said the layer itself did not exist yet. It
exists now: `client/tailwind.config.js` and `client/src/index.css` on `pivot/shell`. Writing
`bg-surface`, `text-ink-muted`, `text-status-working` or `bg-gutter-area-3` today produces the right
colour in both themes. Nothing about the published names changed; this only tells you the spellings
are real.

**54 tokens, defined twice** — once in `:root` (GrokNight, the default) and once in `:root.light`
(GrokDay). The utility for each:

```text
ground   bg-canvas · bg-surface · bg-surface-hover · bg-surface-active
         border-border · border-border-light        (border-light is the strong rule)
ink      text-ink · text-ink-muted · text-ink-faint · text-ink-ghost
accent   text-accent · bg-accent · border-accent · text-accent-muted
status   bg-status-<s> · text-status-<s> · border-status-<s>
           s ∈ working | waiting | needs-review | complete | idle | failed
           NOTE the hyphen: needs-review, not needs_review, which is the server's spelling.
areas    bg-area-N · text-area-N · border-area-N · bg-gutter-area-N     (N = 1…6)
```

`bg-gutter-area-N` is the one utility whose name differs from its token name (`gutter-area-N`), for
the mundane reason that a wash is applied as a background.

Opacity utilities still work — every value is `rgb(var(--token) / <alpha-value>)`, so `bg-surface/60`
and `text-ink/40` mean what they say. Prefer the four `ink` steps to an opacity: the steps are
measured on both grounds, an arbitrary opacity is not.

**Two things this bought that are worth knowing before you style anything:**

* **Deriving a light colour from a dark one does not work, and the tests say so with numbers.**
  GrokDay's own GREEN (`#378E23`), ORANGE (`#C3691E`) and YELLOW (`#A27612`) all fall below 4.5:1 on
  this ground; each was deepened until it cleared AA against both the page and its own fill. If you
  need a colour, ask — do not compute one.
* **The warm statuses are the fragile ones.** `waiting` (gold) against `failed` (orange), and
  `area-4` against `area-6`, are the two pairs that converge as they deepen. They are separated now
  and `tokens.test.ts` fails if a future edit pushes them back together.

## R-2 — `client/index.html` (now complete, was seeded on iteration 1)

```text
line 7:  <title>OpenUI - AI Agent Canvas</title>   ->   <title>grok-workspace</title>
head:    insert this script BEFORE the module script tag, verbatim:
```

```html
<script>
  (function () {
    try {
      var stored = localStorage.getItem("grok-workspace-theme");
      var theme = stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      document.documentElement.classList.add(theme);
    } catch (e) {
      document.documentElement.classList.add("dark");
    }
  })();
</script>
```

**Reason:** the class must be on `<html>` before the first paint. It cannot live in
`client/src/main.tsx` — the bundle has not run — and without it every load flashes the wrong theme,
worst for exactly the user the feature exists for.

Four properties, each a bug if it is missing:

* **The stored value wins over the OS in both directions.** A user who chose light keeps light when
  the OS goes dark. That is why the stored check comes first and why it tests for both spellings
  rather than for truthiness.
* **`dark` and `light` are both stamped explicitly**, never "dark is the absence of a class". A
  class that only appears in one state cannot be toggled off reliably by a provider that did not
  set it.
* **The `try` matters.** `localStorage` throws outright in a blocked-cookies context, and an
  uncaught throw here runs before the bundle and takes the whole page down. The catch stamps the
  default rather than nothing.
* **`localStorage` is the boot-time cache, not the record of truth.** The durable setting is
  `{"theme":"light"}` through `PUT /api/settings`, which merges arbitrary keys into an untyped
  config and so needs no server change. The provider writes both: the server so the choice survives
  a cleared browser, `localStorage` so the next load can read it synchronously.

## R-7 — `client/src/control-room/types.ts` (now complete, was seeded on iteration 1)

Replace `STATUS_CLASSES` and `STATUS_DOT` (types.ts:61-77) with:

```ts
/** Tailwind classes per status. Paired with a label at every call site, never used alone. */
export const STATUS_CLASSES: Record<AgentRuntimeStatus, string> = {
  working: "bg-status-working text-status-working border-status-working",
  waiting: "bg-status-waiting text-status-waiting border-status-waiting",
  needs_review: "bg-status-needs-review text-status-needs-review border-status-needs-review",
  complete: "bg-status-complete text-status-complete border-status-complete",
  idle: "bg-status-idle text-status-idle border-status-idle",
  failed: "bg-status-failed text-status-failed border-status-failed",
};

/** The dot takes the label's colour, not the pill's fill, so it reads at 6px on both grounds. */
export const STATUS_DOT: Record<AgentRuntimeStatus, string> = {
  working: "bg-current text-status-working",
  waiting: "bg-current text-status-waiting",
  needs_review: "bg-current text-status-needs-review",
  complete: "bg-current text-status-complete",
  idle: "bg-current text-status-idle",
  failed: "bg-current text-status-failed",
};
```

**Reason:** one file is the single source of status colour for the whole application. Migrating it
centrally is the difference between 18 edits and 300.

Three notes for whoever applies it:

* **The hue assignment is unchanged** — working green, waiting yellow, needs_review blue, complete
  gray, idle red, failed orange — so this is mechanical and reviewable line by line. Every one of
  the twelve strings above resolves to a colour measured against both grounds by
  `client/src/control-room/shell/tokens.test.ts`.
* **`needs_review` → `needs-review`** in the class name only. The server's status value keeps its
  underscore; a Tailwind class cannot.
* **The `/15` and `/30` opacities are gone on purpose.** Each pill's fill, label and rule are now
  three chosen colours rather than one colour at three opacities, because an alpha that reads on
  near-black is invisible on near-white. Do not reintroduce an opacity suffix here.

**The open question stands and this request does not settle it:** `idle` is red and `failed` is
orange, which reads backwards. The tokens preserve it so the migration stays mechanical. Swapping
them is a one-line change to the two blocks above *and* to the two `--status-idle-*` /
`--status-failed-*` groups in `index.css`, on the day the owner says so.

---

## The owner's wireframe, extracted and compared against §3.1 (iteration 3)

Reference: `assets-page.html` in the main checkout — a bundled React page whose markup is
server-rendered inline-styled HTML. **Not copied into the repository.** What follows is everything
this worktree took from it, and every place it and `loops/07-shell.md` §3.1 disagree.

### First, a correction to the brief

The task described the design as containing "no toolbar, no inspector and no visible spend figure".
All three are present. Quoting the file:

```html
<!-- toolbar: 44px, and it carries the spend -->
<div style="display:flex;align-items:center;gap:14px;height:44px;padding:0 14px;
            border-bottom:1px solid rgba(255,255,255,.1);font-size:15px">
  … <div>Aeris Chairs — Q3 sales push</div> <div style="flex:1"></div>
  <div style="font:500 11px 'IBM Plex Mono',monospace">$18.40 / $50.00</div>
  <div style="width:96px;height:7px;border:1px solid rgba(255,255,255,.28)">
    <div style="width:37%;height:100%;background:#8fb0ff"></div></div>
  <div style="width:1px;height:16px;background:rgba(255,255,255,.15)"></div>
  <div …>?</div><div …>☾</div>
</div>

<!-- inspector: 320px, right-hand -->
<div style="width:320px;flex:none;border-left:1px solid rgba(255,255,255,.13);padding:16px 14px">
  ASSET / overall_sale_doc / PROVENANCE / Made by · Capability · Cost · Declared by · Updated
  / READ BY / Open · Export · Feed to an agent
</div>
```

So the design and §3.1 **agree** on all three — including the inspector's width, 320px, exactly the
spec's figure. Recorded rather than quietly worked around, because a decision taken to reconcile a
conflict that does not exist is a decision taken for no reason.

### What was adopted

Structure and measurement, which is what a wireframe is for:

```text
toolbar        height 44 · padding 0/14 · gap 14 · hairline bottom rule · 15px
spend          mono 11px, right-aligned, with a 96×7 meter beside it
controls       24×24, radius 5, 1px rule, separated from the spend by a 1×16 divider
regions        navigator | main | inspector, hairline rules between
navigator      padding 14/12 · gap 10 · 14px
inspector      width 320 · padding 16/14 · gap 14 · 14px
section label  mono 10px · uppercase · letter-spacing .08em · quietest ink
type scale     18 title · 16 card · 15 toolbar/headline · 14 body/secondary · 13 meta ·
               11 mono numerals · 10 mono labels
page treatment headline = bordered pill, full size; secondary = plain, one step down, quieter;
               active = accent rule + a ~14% accent wash
divider        1px rule between the three headline pages and the two secondary ones
```

### Where they disagree, and which one won

**1. Where the pages live. THE SPEC WON.**
The wireframe selects pages in a horizontal strip spanning the full width, above all three regions,
and gives the 262px left rail entirely to the current page's list. §3.1 puts both in the navigator:
"The navigator holds the pages and the current page's list. Nothing else navigates."

Spec, for two reasons that are not stylistic. First, the published contract already assumes it:
`PageDescriptor.navigator` is documented as rendering "in the NAVIGATOR beneath the page selector",
and seven worktrees have had that text since iteration 1 — moving the selector out of the navigator
changes what that slot means, which is a contract change after publication. Second, §3.1's stated
failure is "three navigation surfaces in one screen", and the fix it names is consolidation into
one rail.

Worth saying plainly: the wireframe's arrangement is not the defect §3.1 describes. Its strip is
above all three regions, not a tab bar inside MAIN. If the owner prefers it, it is a legitimate
alternative — but it is a contract change, so it is a decision, not an implementation detail.
**The wireframe's treatment was adopted inside the spec's placement**: headline pages are bordered
rows at 15px, secondary are plain rows at 14px in a quieter ink, with a rule between them.

**2. Navigator width. THE SPEC WON, and it barely matters.** Wireframe 262, spec 288 default /
220 minimum. 262 is inside the resizable range either way.

**3. The inspector contains actions and a link. UNRESOLVED — owner's call.**
The wireframe's inspector ends in `Open · Export · Feed to an agent` and includes
`Declared by → chair_launch_plan` as an `<a href>`. §3.1: "The inspector shows properties, never
navigation. An inspector that can change what MAIN displays is a second navigator."

Actions that operate on the current selection (Open, Export) do not change what MAIN displays and
read as compatible. `Declared by → chair_launch_plan` is a jump from the ASSETS page to a design
document, which is navigation by any reading. It is also genuinely useful, and it is the
provenance link the product's whole "the document declares the work" claim depends on.

Not decided here, and not enforced on anybody: **02-assets and 03-design-docs, you own your
inspector's markup.** The shell asserts nothing about it. The rule as this worktree reads it: an
inspector may act on the selection freely, and may deep-link with `workspaceUrl()`, but a link
should be a deliberate, labelled jump rather than a second list of things to pick from.

**4. Fonts. THE SPEC WON by default — the wireframe is a wireframe.**
It sets `font-family:'Patrick Hand'`, a handwriting face, with outline-only boxes and no fills.
That is sketch notation, not a visual specification, and reading its typography literally would
ship a handwritten UI. `'IBM Plex Mono'` for numerals is a real and good idea, but adding a webfont
is a `client/index.html` change and therefore a hot-file request; the existing `font-mono` stack
(JetBrains Mono / Fira Code / SF Mono) carries the same intent at no cost. Filed as a possible
future R-request rather than taken.

**5. The accent colour. NOT TAKEN — owner's call, and it is one line either way.**
The wireframe's accent is `#8fb0ff`, a periwinkle blue. The published palette's accent is
GrokNight's magenta `#bb9af7` / GrokDay's purple `#7D4BC6`.

Token *names* are the contract and token *values* are this worktree's, so changing it breaks
nothing on anyone's branch — `--accent` in the two `:root` blocks, twice. Not taken because the
stated reason for sourcing both palettes from `groknight.rs` and `grokday.rs` was that the
workspace and the terminal should read as one product, and a blue accent abandons that for a
wireframe's placeholder. Say the word and it is a two-line change with a re-measured contrast pair.

**6. Everything the wireframe cannot express.** It is a static 1320×700 mock: dark only, fixed
widths, no resize handles, no collapse, no light theme, no empty states, no unmerged slots. §3.1
requires every region collapsible and resizable with persisted widths, and both themes. Built to
the spec; nothing inferred from the mock's silence.

### Signals passed on to other worktrees

* **02-assets** — the wireframe's Assets navigator is search-first: a search field, filter chips
  (All · Docs · Slides · Video · More…), a `4 OF 212 MATCH` count, then results, then a RECENT
  group, and the footer line "Type to search all 212 assets. Nothing is listed until you ask."
  That is a deliberate stance about a 212-item list and it is yours, not the shell's.
* **02-assets** — its inspector is ASSET → PROVENANCE (Made by · Capability · Cost · Declared by ·
  Updated) → READ BY → actions. Cost per asset is shown at `$0.31` / `$1.05` / `$4.06` / `$5.52`
  precision.
* **06-tools-cost** — the wireframe shows spend as `$18.40 / $50.00` with a 37%-filled meter. That
  is the shape the toolbar takes the day a ledger exists. Until then it renders "spend unknown",
  per §3.9; the slot and the meter are already written.
* **06-tools-cost** — the Tools affordance in the wireframe is a labelled button with a `⌘T`
  shortcut. The shell owns the shortcut and the overlay; you own what is inside.

## Finding for every worktree: happy-dom starts at `about:blank`

Not a request. `client/happydom.ts` calls `GlobalRegistrator.register()` with no URL, so in every
test `location.href` is `about:blank` and **`location.pathname` is the string `"blank"`**. A
relative `history.replaceState(null, "", "/assets")` cannot resolve against it.

The failure mode is quiet: a component that reads the path sees nothing, falls back to its default,
and a test asserting the default passes while proving nothing. Three of this worktree's routing
tests did exactly that before it was noticed.

Fix inside your own test file, no shared edit needed:

```ts
(window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL("http://localhost/assets");
```

After that, relative `pushState` / `replaceState` work normally. Adding a `url` option to
`GlobalRegistrator.register()` in `client/happydom.ts` would fix it once for everyone, but that
file is unassigned and therefore hot, so it is recorded here rather than changed.

---

## A-0 audit of the shell (iteration 3)

`grok-workspace.md` §3.3.1 was added after `loops/07-shell.md` was written. Audited everything this
worktree has built against it. **Result: no violation, and nothing that makes room for one.**

What was checked and what was found:

```text
grep -rniE "agent|capability|worker|job|generat|model|api.x.ai|completion|imagine"
    over client/src/control-room/shell/**, client/src/main.tsx, client/src/index.css,
    client/tailwind.config.js

  every "agent" hit is one of: the page id "agents", the URL segment /agents, the label
  "Agents", the branch name 01-agents, a file path (AgentCard.tsx), or prose about where a
  notification points. No hit is an executor.
  zero  worker / job runner / task queue of any kind
  zero  api.x.ai, image_gen, image_to_video, or any media call
  zero  chat-completion client
  two   fetch() calls in shell code, both to endpoints that exist on the merge base:
          useShellData.ts  GET /api/projects, GET /api/grok/status
          theme.ts         PUT /api/settings
```

The shell owns no domain logic by construction (§0), so it has no agent to get wrong. Two positive
signals rather than mere absence:

* `useShellData.ts` raises exactly one alert, and its text is **"Grok is not installed, so agents
  cannot start."** The shell already treats a `grok` binary as the precondition for an agent
  existing at all, which is A-0 stated as a user-facing consequence.
* The spend slot renders "unknown" rather than `$0.00` because no Grok model has a rate. That is
  the opposite of the A-0 trap: it refuses to make a number up rather than quietly substituting
  something cheaper and plausible.

**Two places where the vocabulary could be walked into the trap by someone reading my notes, now
corrected rather than left ambiguous:**

1. The wireframe extraction above passes `PROVENANCE → Capability` to 02-assets, and the wireframe
   labels assets `BASE + IMAGES` and `BASE + IMAGES + VOICE`. Read under A-0 that notation is
   already right and should be kept literally: **`+` means added to the whole agent.** A capability
   row must never be rendered as a *type* of agent, a tier name that replaces "Grok agent", or a
   badge that implies Research can do less than Slides. Research is a full Grok Build agent that
   has not been granted media endpoints; that is the only difference.
2. `loops/07-shell.md`'s demo paragraph said the inspector "shows that the Slides agent has Imagine
   capability while Research does not", which reads as two kinds of agent. Rewritten this iteration
   to say Slides holds the Imagine grant *on top of* what every agent can already do.

**One forward-looking risk this worktree's contract names but does not own.** `ToolsPanelProps`
has `section: "prompts" | "skills" | "workflows"`, and "workflows" is also one of the five asset
types. That word is the most natural place in the whole product for a job runner to be smuggled in
wearing an agent's name — the wireframe even shows `MADE BY WORKFLOW · Script → Storyboard → Render
· loop ran 3 times`. **04-generation, 05-software, 06-tools-cost:** a workflow is a thing an agent
runs, not a runner that replaces one. If a workflow step executes without a `grok` process, that is
the exact failure A-0 describes. The shell asserts nothing here — it cannot see how a workflow
executes — so this is a flag, not a check.

**Nothing needs fixing in shell code.** No file was changed for A-0 this iteration; two documents
were.

---

## SUPERSEDED: "the suite times out under parallel load"

The observation filed earlier in this file — that `bun test` fails non-deterministically with
5000ms timeouts because seven worktrees run it at once — was **the right measurement and the wrong
diagnosis**. Read that section with this correction attached.

The real cause is that a worktree has no `.env`. It is gitignored, so `git worktree add` never
copied it, and `loops/07-shell.md` §1 names the main checkout's path (`cd /Users/haoming/openui`)
rather than the worktree's. Every test that spawns a `grok` process was therefore running
unauthenticated. Once the machine quietened enough for those tests to fail fast rather than hang,
the actual error appeared:

```text
"Auth recovery succeeded but 4 authenticated inference requests were still rejected (401);
 giving up after 3 retries."   http_status: 401       ← 22 of these in one run
```

**An ACP test with no credentials hangs on a retrying auth handshake until the 5s limit**, so the
missing key produced timeouts as well as 401s. **But it is not the only cause, and a later
measurement corrected this note:** with `.env` sourced throughout, the full parallel suite still
produced three 5000ms timeouts, while the same file run alone at load 8.5 passed 41/41 twice. The
401s were the missing key. The timeouts are load-dependent and happen with or without credentials.
Source `.env` first; if timeouts remain, check the load before believing them.

**If your gate is red with `timed out after 5000ms` in tests that spawn agents, do this first:**

```bash
set -a; . /Users/haoming/openui/.env; set +a
bun run verify
```

On `pivot/shell` that takes the suite from 4–6 failures to `exit 0`, 1065 pass, 0 fail — at a load
average of 17–26, which is inside the range that was previously failing.

Worth someone's decision at reconciliation, and not this worktree's to make: either each worktree
symlinks the main checkout's `.env`, or the loop documents' §1 stops naming a path that only exists
in one checkout. Two iterations of this loop attributed a red gate to the environment and left it
alone; that is the cost of the current arrangement.

---

## The second wireframe, and where the two disagree (iteration 3)

`design-document.html` joins `assets-page.html` in the main checkout. Both are bundled React pages
whose markup is server-rendered inline-styled HTML; neither is copied into the repository. This
reconciles them against each other and against §3.1.

### The chrome is identical, to the pixel

Everything below is byte-for-byte the same in both files. It is therefore not a judgement call, and
it is what `WorkspaceShell.tsx` implements:

```text
toolbar        height 44 · padding 0 14 · gap 14 · bottom rule rgba(255,255,255,.1) · 15px
               two 13px window squares · project · spacer · spend · 1×16 divider · ? · ☾
spend          mono 11px, with a 96×7 meter at 37%, meter fill = the accent
controls       24×24, radius 5, 1px rule
page strip     padding 8 14 · bottom rule .13 · 15px
headline page  1px rule, radius 7, padding 7 16, gap 8, with a 14px leading square
active page    accent rule + accent wash at 14%
divider        1×22, margin 0 6
secondary page plain text, padding 7 12, 14px, quieter — no rule, one size down
Tools          right-aligned, 1px rule, radius 7, padding 7 14, with ⌘T in mono 10px
region rules   1px rgba(255,255,255,.13)
section label  mono 10px · uppercase · letter-spacing .08em · quietest ink
```

Two identical files disagreeing about nothing is itself evidence: this chrome is settled, and a
future change to it should be suspicious rather than routine.

### Four disagreements, and the decision on each

**1. The third region. RESOLVED — they are not actually in conflict.**

`assets-page.html` draws a 320px inspector: `ASSET → PROVENANCE → READ BY → Open · Export · Feed to
an agent`. `design-document.html` draws a **46px rail** carrying a `‹`, a vertical `CONVERSATION`
label, three presence dots and the count `3`, captioned *"Conversation closed — the document gets
the full width; the rail keeps presence visible"*. Its second state, `B`, is *"Conversation open —
same document, panel slides in from the right"*.

So the 46px strip is the inspector **collapsed**, not a different region. Read together the two
files specify something §3.1 leaves out: **collapsed means a rail, not absence.** Implemented this
iteration — `layout()` reserves 46px for a collapsed region, the rail carries a chevron back and a
vertical label, and a rail is never squeezed below itself to satisfy MAIN's minimum. Collapsing to
zero, which is what the shell did before reading this file, left a 1px drag handle as the only way
back and threw away the presence the caption exists to preserve.

**One §3.1 tension this surfaces, for 03-design-docs rather than for me.** §3.1 says the inspector
holds properties and never navigation. `design-document.html` puts the *agent conversation* there.
A conversation is closer to content than to properties, and it is certainly not navigation — it
does not change what MAIN displays. Reading it as compatible; flagging it because it stretches the
word "properties", and the region is yours to fill.

**2. The project name. UNRESOLVED — owner's call, and it is a real question.**

`assets-page.html`: `<div>Aeris Chairs — Q3 sales push</div>` — a plain label.
`design-document.html`: the same text inside a bordered control with a `▾` and `cursor:pointer` — a
**project switcher**.

This is the disagreement that matters most, because §3.1 says the navigator holds the pages "and
nothing else navigates", and a project switcher in the toolbar is a third navigation surface by the
same argument that removed the six-tab strip. But switching project is not switching *page* — it
changes what every page is about, which is arguably chrome rather than navigation, and there is
currently no other way to change project at all.

The shell renders the plain label today, because that is the option that cannot be wrong: a label
is a strict subset of a switcher, and adding the `▾` later costs one component and no contract
change. **Not decided.** If the answer is "switcher", it also needs an answer to what happens to
the URL, which today carries no project.

**3. The navigator's width. NEITHER — the disagreement is the answer.**

`assets-page.html` draws 262. `design-document.html` draws 196, and 184 in its second state. Three
different widths across two files and two states, for the same rail.

Nobody is wrong: a list of assets with type, agent and cost wants more room than a list of document
titles, and the same page wants less when a conversation panel is open. That is the argument for
§3.1's resizable, persisted rail rather than for picking a fourth number, so the 288 default stands.

**Recorded honestly: 196 and 184 are below §3.1's 220 minimum**, so a user could not drag the rail
as narrow as the design draws it. A test asserts that gap rather than papering over it. Lowering
the minimum to ~180 is a one-line change; it was not taken unilaterally because 220 is the figure
in the product contract.

**4. The page frame. NEITHER — one of them is not a page.**

`assets-page.html` is a single full-bleed 1320px surface. `design-document.html` wraps the same
surface in a rounded 1px card inside a 36/40-padded page, and stacks two lettered states with
captions. The card and the padding are a spec sheet's presentation of its own examples, not chrome.
Taking them literally would have shipped a 1320px window floating on a background.

### What did not change, and why

The palette and the typography still come from GrokNight/GrokDay rather than from either wireframe.
Both files set `font-family:'Patrick Hand'`, a handwriting face, with outline-only boxes and
`#8fb0ff` as the single accent. Two files agreeing on a wireframe convention is still a wireframe
convention. The accent remains an owner decision worth two lines, as recorded above.

---

## R-10 — the guide affordance is blocked on the reachability audit

**Filed because it was built, worked, and had to be reverted — not because it is hard.**

`docs/USER-GUIDE.md` has merged, so §3.1's fourth toolbar control (the `?`) and SHELL-015 are
buildable. They were built this iteration (`shell/guide.ts`, `shell/GuideModal.tsx`, a `?` in the
toolbar, per-page entry, and a missing-entry report) and reverted, because there is no way to get
the guide's text into the client from inside this worktree's boundary without turning the gate red:

```text
attempt 1   import raw from "../../../../docs/USER-GUIDE.md?raw"   (Vite's raw loader)
            + an ambient declare module "*.md?raw" in shell/raw-md.d.ts
  ->  ORPHANS (1) client/src/control-room/shell/raw-md.d.ts
      A .d.ts is reachable from nothing BY CONSTRUCTION — nothing imports an ambient
      declaration — so scripts/audit/reachability.mjs reports every one as dead code. This is
      the repository's ONLY .d.ts, so the case has never come up.

attempt 2   drop the .d.ts, use @ts-expect-error on the import instead
  ->  Unresolvable imports (2)
        client/src/control-room/shell/guide.ts -> ../../../../docs/USER-GUIDE.md?raw
      resolveSpec() cannot resolve a Vite query suffix, and unresolved imports also exit 1.
```

Both failures are in `scripts/audit/reachability.mjs`, which §18.3 makes hot. Reverted rather than
shipped red: a missing `?` button costs less than a red gate at reconciliation.

**Any ONE of these unblocks it, and the first is three lines:**

```text
(a) scripts/audit/reachability.mjs — ignore .d.ts files in trackedFiles(), and strip a `?...`
    query from a specifier before resolving it in resolveSpec(). Both are correct in general,
    not special cases for this: an ambient declaration is never imported, and Vite query
    suffixes are a normal part of a Vite client.
(b) a static route serving docs/USER-GUIDE.md, so the modal fetches it at run time. Needs a new
    endpoint in a file this worktree does not own.
(c) client/src/vite-env.d.ts with the standard Vite triple-slash reference, which is where this
    declaration conventionally lives — still blocked by (a)'s first half.
```

The reverted code is in commit `e134df6` and its follow-ups; `git revert` of the revert plus fix
(a) is the whole job. The component split was: `guide.ts` finds the `##` section matching the
current page's label and reports every page that has no entry; `GuideModal.tsx` is scrim, Esc, a
contents rail and the section body. **No guide prose was authored in this worktree**, per §3.8 —
the words stay the guide worktree's.

---

## For whoever screenshots this product next

Two things cost this worktree most of an iteration; both are cheap to avoid.

**1. The server serves `./client/dist` relative to its own working directory.** The instance on
:6968 is the main checkout on `grok-control-room`. Rebuilding in your worktree does not change one
pixel of what it serves, and a screenshot of it is evidence about *that* build, not about your
branch. To see your own work:

```bash
set -a; . /Users/haoming/openui/.env; set +a
bun run build
PORT=6979 bun run server/index.ts        # then screenshot :6979
```

The first two captures this iteration showed the Tools overlay missing entirely and were within a
minute of being reported as a bug in code that was correct.

**2. No browser driver is installed** — no playwright, no puppeteer, no chromium-cli. Headless
Chrome is present and enough:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --window-size=1440,900 --screenshot=out.png --virtual-time-budget=4000 http://localhost:6979/agents
```

For anything that needs *driving* rather than loading — setting a theme, opening an overlay,
clicking through pages — add `--remote-debugging-port=9222 --user-data-dir=/tmp/prof` and talk CDP
over the WebSocket at `http://localhost:9222/json`. `Page.navigate`, `Runtime.evaluate`,
`Page.captureScreenshot` are the only three methods needed. That is how both themes and all five
pages were captured this iteration.

**A note on the unmerged-slot notice.** It no longer says a branch "has not merged yet", because
that claim was false for 06-tools-cost while it was on screen. It now says nothing is mounted and
names the branch as provenance. If your page is merged but its slot still shows this notice, the
missing piece is R-4 — one line in `client/src/control-room/shell/pages.ts` setting `main:` on your
descriptor. That file is mine; the line is yours.
