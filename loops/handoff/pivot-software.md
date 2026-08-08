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
