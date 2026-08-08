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

## Observation for reconciliation — the suite times out under parallel load

Not a request against a hot file. Recorded because it costs every worktree, and because whoever
sees a red gate next should not spend an iteration hunting a bug that is not there.

`bun test` fails non-deterministically while several agent worktrees run it at once. Every failure
is `this test timed out after 5000ms`; the failing set differs on every run; all of them are in
tests that create real git worktrees and spawn real `grok` ACP child processes:

```text
server/routes/projectReads.test.ts   "launching gives the agent an isolated worktree (§9, V-009)"
                                     "a second task must not reuse the merged branch of the first"
server/services/messaging.test.ts    "message archival keeps the hot path bounded"
```

Measured on `pivot/shell`, iteration 1: exit 0 at load ~5 before any edit; 3 fail at load 125;
**3 fail with the working tree stashed to HEAD, i.e. with no local change present at all**; then
6, 5 and 4 fail on successive runs at load 26–41. The signature is a fixed 5000ms limit against a
machine running seven copies of the suite, not a defect in any branch.

07-shell did not touch it: raising a timeout in a shared test file would be an edit across the
boundary, and it would mask the only signal saying the suite is under-resourced. If reconciliation
wants it fixed rather than tolerated, the change belongs with whoever owns those tests, and the
honest form is an explicit per-test timeout on the process-spawning tests rather than a global one.

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
