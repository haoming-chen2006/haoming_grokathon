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
