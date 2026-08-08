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
