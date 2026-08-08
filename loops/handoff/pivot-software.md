# Handoff — pivot/software

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — 2026-08-08

### Requests

**1. Move `server/services/software/VERIFICATION-software.md` into `VERIFICATION.md`.**

- File: `VERIFICATION.md` (owned by no worktree, so this worktree may not write it — §0).
- Change: append the contents of `server/services/software/VERIFICATION-software.md` as the
  SW-001…SW-016 section, and delete the file it came from.
- Reason: §7 says the evidence for SW-### items is recorded in `VERIFICATION.md`, and §0 forbids
  editing a file this worktree does not own. The two instructions conflict; the evidence is written
  in §7's format inside this worktree's own area so the fold is mechanical rather than a rewrite.
- Depends on nothing. Do it last, after the other worktrees' ledgers, so the tallies are added once.

No hot-file request is needed yet, and that is not an oversight. The four §0 anticipates —
`app.route("/api/software", softwareRoutes)`, `await stopAllPreviews()`, a workspace dependency, the
`SoftwareAsset` type — all wire up exports that do not exist yet. A request to mount a router that
is not written would be applied against nothing. They will be appended here in the iteration that
creates the export, with its signature.

### Findings other worktrees need

**2. A payload file checked in under `server/` must not end in `.js`, `.jsx`, `.ts`, `.tsx` or
`.mjs`.** `scripts/audit/reachability.mjs` reads every such file under `server/`, `client/src/`,
`scripts/`, `bin/` and `shared/` as one of *our* modules and fails the gate for the ones no entry
point imports. The software template is the user's app, so it is unreachable by design; checked in
unsuffixed it produced three orphans and a red `bun run audit`:

```text
ORPHANS (3) — tracked, not test files, reachable from nothing:
  server/services/software/templates/vite-react/src/App.jsx
  server/services/software/templates/vite-react/src/main.jsx
  server/services/software/templates/vite-react/vite.config.js
```

Every file in this worktree's template now ends in `.tmpl`, stripped when it is copied, and
`templateFiles()` throws on one that does not, so the rule cannot decay into an unenforced
convention. **04-generation** should expect the same if it checks in render templates or fixtures
that are source files by extension. The alternative — an allowlist entry in the audit — would need
an owner, since `scripts/` belongs to no row of the partition.

**3. `grok --version` reports `grok 1.0.0 (3cd0d0cbcebe)`, not the `grok 0.2.118` §1 of every loop
document expects.** Nothing in this iteration touched an agent, so nothing here is invalidated, but
any worktree about to trust a §1 version claim should re-check it first.

**4. The gate is not reliably green when several worktrees run it at once.** `bun run verify` on an
otherwise untouched checkout of this branch failed 7 tests, every one of them a timeout at ~5.2 s
against bun's 5,000 ms default, in `repository.test.ts`, `projectReads.test.ts`,
`messageHistory.test.ts` and `plannerWiring.test.ts` — all of which spawn git worktrees. Five
`bun run verify` processes were running on the machine at the time. The same four files re-run
alone: **75 pass, 0 fail, 25.09 s**. So it is contention, not a defect, and a red gate seen during
parallel iterations should be attributed before it is fixed. It is also an argument for those tests
carrying an explicit timeout rather than inheriting the default.

### What this worktree assumed about others

Nothing yet. The template and its copier depend on no other worktree's surface, which is why §6
puts them first.

---

## Iteration 2 — 2026-08-08

### Requests

None. `buildRunner.ts` is a plain module with no wiring; `run_build` becomes a hot-file concern only
when `registerSoftwareTools` exists (§6 stage 1.3), and the request will carry its signature then.

### Findings other worktrees need

**5. An asset's git worktrees share the one `node_modules` at the asset root, and no second install
happens.** Measured, not assumed (§5.4 asks for it to be stated either way): a build run by
`createAgentWorktree`'s worktree at `<assetRoot>/.agents/<name>` resolves `vite` upward to
`<assetRoot>/node_modules`, exits 0 in 1,878 ms, writes `dist/` inside the worktree, and never
creates `node_modules` there. **01-agents** may find the same holds for any tooling an agent runs in
a work area, and it is the reason a per-worktree install is not needed anywhere.

**6. `spawnSync` in a request path blocks the whole server, and this product is a team of agents.**
`server/services/testRunner.ts` runs a test suite synchronously; `runBuild` deliberately does not,
because a three-second synchronous build freezes every other agent's events (SW-014). Any worktree
adding a long-running child process to a request path should do the same. The runners are close
enough to fold together at reconciliation, and `buildRunner.ts` says so in a comment — but the fold
must keep the async version, not the synchronous one.

**7. Killing a child process is not killing the work.** `bun run build` spawns vite; `sh -c` spawns
whatever it was given. Killing only the process we spawned leaves the grandchild running, which was
mutation-tested here: swapping `process.kill(-child.pid, signal)` for `child.kill(signal)` makes the
timeout test hang for its full 30 s while the grandchild survives. Anything spawning a child that
outlives a request — previews, dev servers, long commands — should spawn `detached` and signal the
group. This is the concrete form of §8's "a child process you did not kill is still running".

---

## Iteration 3 — 2026-08-08

### Requests

**8. `server/index.ts` — one line in the shutdown path: `await stopAllPreviews()`.**

- File: `server/index.ts` (hot).
- Change: in the shutdown handler, alongside the other cleanup,
  `await stopAllPreviews()`, imported from `server/services/software/preview.ts`.
- Signature: `export async function stopAllPreviews(): Promise<void>` — idempotent, safe to call
  when nothing has started, resolves only once every preview process has been reaped.
- Reason: a preview is a child process running a dev server. A server that exits without stopping
  it leaves vite holding a port until the machine reboots. This is §0's anticipated request 2, and
  unlike the router mount it is requestable now because the export exists and is tested.

**9. `server/services/controlRoomEvents.ts` — two variants on the `ControlRoomEvent` union.**

- File: `server/services/controlRoomEvents.ts` (owned by no worktree, so this worktree may not
  edit it; not on the hot list, but the same rule applies).
- Change: add to the union, exactly as §10 of the loop document names them:

```ts
  | { type: "software.preview_state"; assetId: string; state: "starting" | "running" | "failed" | "stopped"; port?: number; error?: string }
  | { type: "software.build_finished"; assetId: string; exitCode: number; durationMs: number }
```

- Reason: the preview supervisor already reports every state change through an `onChange` callback
  it takes at construction, so publishing these is one call site rather than a change to this area.
  `PreviewSupervisor`'s status carries `state`, `port?` and `message?`; `message` maps to `error`
  when the state is `failed`, and is also what the user is told when a preview was stopped to make
  room for another or after going idle, so a UI that shows it only on failure will drop something
  the user needs.

### Findings other worktrees need

**10. A dev server's advertised address must be forced on the command line, not trusted to config.**
`vite.config.js` in the template sets `host: "127.0.0.1"`, and an agent is told never to edit it —
but §8 says an agent will report work it did not do, and a config file is a file. The preview
supervisor appends `-- --host 127.0.0.1` to the detected dev command, which both `bun run` and
`npm run` forward to the underlying command. Mutating the flag away makes the test fail with
`http://localhost:5173/` from a config asking for `0.0.0.0`. **04-generation** and anything else
that starts a server a user can reach should assume the same: the config is a suggestion, the flag
is the guarantee.

**11. `status()` must not count as viewing, or an idle timeout is decorative.** A client polling a
preview's status every two seconds would keep every preview alive forever if polling reset the
countdown. The supervisor separates them: `status()` reads, `touch()` says a person is looking.
Anything else with an idle bound — sessions, work areas — has the same trap.

---

## Iteration 4 — 2026-08-08

### Requests

**12. `02-assets` — the shape a software asset's record needs, offered rather than assumed.**

- File: whatever `02-assets` uses for the asset record (`server/services/assetStore.ts`, and
  `server/types/*.ts` if the shape lives there — hot either way).
- Change: accept `kind: "software"` with a record shaped as §10 names it:

```ts
  { assetId, repoPath, entryFile, previewState, lastBuild: { exitCode, at }, thumbnailPath? }
```

- Reason and the part that matters: **a software asset is a directory, not a file, and its files are
  not all tracked by git.** `createAssetRepo` produces a repository at
  `<workspace>/assets/software/<assetId>/` whose `node_modules` is installed but never committed and
  whose newest files are typically not yet added. If the store lists an asset by walking tracked
  files, or assumes one file per asset, SW-009 fails and the asset record has to move into this area
  with a duplicate listing — a worse outcome, which is why this is raised before it happens rather
  than after. `listAppFiles(repoPath)` in `server/services/software/assetRepo.ts` is the walk that
  answers "what is in this app", excluding `node_modules`, `.git`, `.agents` and `dist`.

### Findings other worktrees need

**13. Install before the first commit, or a worktree gets a different package manager.** Measured in
iteration 2 and fixed here: `bun install` writes `bun.lock`, a lockfile written *after* the commit is
untracked, and an agent's worktree contains only committed files — so the build there fell back to
`npm` on an asset that had been installed with `bun`. `createAssetRepo` now materialises, installs,
then commits. Anything else that scaffolds a directory an agent will branch from has the same
ordering constraint.

**14. A directory built somewhere else and moved into place cannot half-exist.** `createAssetRepo`
builds in `<path>.creating` and renames. An install that fails leaves nothing, so the next attempt
sees an empty slot rather than "there is already something there" — which is what a partially
created asset looks like to every subsequent call.

---

## Iteration 5 — 2026-08-08

### Findings other worktrees need

**15. A-0 audit of this area: clean.** `grok-workspace.md` §3.3.1 postdates `loops/05-software.md`,
so it was audited against explicitly. Nothing in `server/services/software/**` creates, implies or
makes room for a worker that is not a `grok` process: no `fetch`, no outbound host, no provider SDK,
no model-provider key name, and no capability tier mentioned anywhere — so nothing here can have got
"base Grok" backwards. The five processes it starts are `git`, `bun install`, the app's build script,
the app's dev script and `zip`.

The check is `server/services/software/contract.test.ts`, and it is a test rather than a paragraph
because the temptation A-0 names is nearest to a surface like this one: a template plus a build plus
a preview is most of a "generation pipeline", and the last step — post a prompt somewhere, write the
files back, call it an agent — is the one that quietly removes file editing, shell, search and skills
from the user's team. **Any worktree with a deterministic pipeline should consider the same guard**;
04-generation especially, since §13.8's `api.x.ai` preference gives it a legitimate HTTP client and
therefore no structural reason not to add a second one.

**16. Write-time secret refusal is 01-agents' to make, not ours.** SW-010's first clauses ask that
`assertNoSecrets` run over every file the agent writes and that a planted key be refused at write
time. Under A-0 the agent edits with its own tools and this surface is not in front of those writes.
`scanAppForSecrets(repoPath)` in `server/services/software/exportApp.ts` is the checkpoint scan at
the boundary this surface does own — the moment the app leaves — and the export refuses before the
zip exists. **01-agents**: if `boundary.ts`'s PreToolUse hook can call a scanner on a write's
content, `findSecrets` from `server/services/secrets.ts` is the one already used on every document
and message write, and using the same one keeps the two surfaces from disagreeing about what a
secret is.

**17. Every live-agent test on this machine is failing with a 401, as of 2026-08-08 ~14:10.** Not
contention and not a defect in any worktree's code. The error, identical in every case:

```text
AcpError: Internal error  code: -32603
  message: "Auth recovery succeeded but 4 authenticated inference requests were still rejected
            (401); giving up after 3 retries. Turn ran 7s wall-clock."
  http_status: 401
```

Failing: V-006, V-007, V-032, V-033, V-042, V-050 — 10 tests across `agentExecution.test.ts`,
`skillsAndRecovery.test.ts` and the session suites. It reproduces with a single test file run alone,
so it is not the gate contention reported in finding 4.

**It is new today.** Two full `bun run verify` runs from this worktree earlier in the same session
were 991 pass / 0 fail with those exact tests included, and `skillsAndRecovery.test.ts` passed 5/5
standalone about an hour before. Between then and now the credential started refusing authenticated
inference. 23 `grok` processes were running across the eight worktrees at the time, so a concurrent
session or rate limit is the first thing to check; an expired token is the second.

This is outside every worktree's boundary — it is `acpClient.ts` reporting what the endpoint said,
and the credential itself. **No worktree can mark a live-agent item PASS until it clears**, and any
that did so in the last hour should re-run before trusting it.

---

## Iteration 6 — 2026-08-08 — THE MOUNT REQUEST (reconciliation, read this one)

**18. There is no `software` page in the shell's contract, and that is correct — so someone has to
decide where this page hangs.**

`client/src/control-room/shell/contract.ts` publishes five `PageId`s: agents, assets, designdocs,
users, x. Software is not among them and should not be: software is one of the five **asset types**
(`grok-workspace.md` §5.2), and `loops/05-software.md` opens by saying this surface must not exist
loudly — no sixth tab called "Software" in a product whose demo user is a salesperson.

So 05-software has built its page against the published `WorkspacePageProps` and nothing else, and
offers it three ways. **Any one of them is a single line, and two of them change no contract.**

What is being mounted, from `client/src/control-room/software`:

```ts
import { SoftwarePage, SoftwareNavigator, SoftwareInspector } from "../software";
//  each is (props: WorkspacePageProps) => JSX.Element — main, navigator and inspector regions
```

**Option A — fastest, and it makes the product draw today.** 02-assets has not merged a page;
`client/src/control-room/assets/` does not exist, so the Assets slot renders NotMergedYet. Software
assets *are* assets, so point that slot here for now, in `client/src/control-room/shell/pages.ts`:

```ts
{ id: "assets", label: "Assets", segment: "assets", rank: "headline", builtBy: "02-assets",
  main: SoftwarePage, navigator: SoftwareNavigator, inspector: SoftwareInspector },
```

No contract change, no new page id, one line, and the Assets page stops being a hole. When
02-assets merges its own page it takes the slot back and option B applies.

**Option B — the shape the contract actually wants.** 02-assets renders these three components when
the selected asset is `kind: "software"`, from inside its own page. Nothing in the shell changes.
This is the right long-run answer and it needs 02-assets to exist first.

**Option C — a page of its own**, if reconciliation wants it standing alone to look at. This one
*does* touch `contract.ts` (`PageId` and `PAGE_SEGMENTS` both gain `software`), so it is the least
additive of the three and is offered last for that reason.

**What renders today.** Every region draws in every state — verified by rendering all three
components server-side against all three mock apps, not by assertion. The data is invented and says
so on screen: `client/src/control-room/software/mockSoftware.ts` is the only source, and a banner
reading "Invented data — the software service is built but not mounted yet." sits above the preview
for as long as that file is imported. Deleting it and its imports is the whole of the un-mocking.

The real service is built and tested behind it — `server/services/software/**`, 51 tests — and needs
request 8 (`stopAllPreviews()` in the shutdown path) and a `softwareRoutes` mount that does not exist
yet. The page reads the same shapes it will be given: `types.ts` is written from the server's own
`PreviewStatus`.

---

## Iteration 7 — 2026-08-08 — the mount request, made exact

**19. Request 18's Option A is withdrawn. 02-assets has merged, and the seam it left is the right
one.** `client/src/control-room/assets/` now exists with a real page, and its `AssetPreview.tsx`
already has a `software` branch that draws a framed rectangle, carrying this comment:

```tsx
{/* A framed "app", drawn rather than run: 05-software owns the real preview surface. */}
```

This is that surface. One edit, in **02-assets'** own file — nothing in `shell/**` changes, and
`contract.ts` is untouched:

```tsx
// client/src/control-room/assets/AssetsPage.tsx
import { SoftwarePage } from "../software";

export function AssetsPage({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const selected = assets.find((a) => a.id === selectionId);
  // A software asset cannot be looked at without running it, so opening one shows the app itself
  // rather than a card of it (SW-009's fourth clause: opening it from Assets opens the preview).
  if (selected?.type === "software") {
    return <SoftwarePage projectId={projectId} selectionId={selectionId} onSelect={onSelect} />;
  }
  ... the grid, unchanged ...
}
```

and, if the inspector should follow the main region:

```tsx
// client/src/control-room/assets/AssetsInspector.tsx
if (asset?.type === "software") return <SoftwareInspector {...props} />;
```

**There is no id mapping to do.** The app in `mockSoftware.ts` is keyed to `asset_configurator`,
which is 02-assets' own mock id, and tells the same story their fixture does: a chair configurator
whose finish picker is wired to the price list. Selecting that asset lands on a running
configurator. When both services are real, both sides use the same server-issued assetId and the
alias stops mattering.

**Rendering, checked rather than claimed.** All three regions were rendered server-side against
every state — the configurator, the deck picker, a build in progress with no cost reported, a
failure naming `react-datepicker`, an id that is not here, and an empty list. `bun run build`
succeeds. There are no tests this iteration, deliberately and by instruction.

**One thing to look at with fresh eyes.** The preview iframe is sandboxed `allow-scripts
allow-forms allow-popups` and deliberately *not* `allow-same-origin`. Against a real dev server on
another port that is belt and braces; against the `srcDoc` mock it is load-bearing, because a
same-origin frame running model-written code could reach into the workspace rendering it. If
02-assets or 07-shell ever renders a generated artefact in a frame, the same reasoning applies.
