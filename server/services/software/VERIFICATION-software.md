# Evidence ledger — 05-software (SW-001…SW-016)

Evidence for the items in `loops/05-software.md` §7.

**This file is here because `VERIFICATION.md` is owned by no worktree** and §0 forbids editing a file
this worktree does not own. It is written in §7's format so the reconciliation pass can move it in
whole. That request is recorded in `loops/handoff/pivot-software.md`.

**Last iteration:** 1 (2026-08-08)
**Tally:** 1 PASS · 0 FAIL · 3 BLOCKED · 12 NOT TESTED

```text
SW-001  PASS         the template builds before any agent touches it
SW-002  BLOCKED      waits on 03-design-docs (read interface)
SW-003  NOT TESTED
SW-004  NOT TESTED   next: buildRunner.ts, §6 stage 0.2
SW-005  NOT TESTED   next: preview.ts, §6 stage 0.3
SW-006  NOT TESTED
SW-007  NOT TESTED
SW-008  NOT TESTED
SW-009  BLOCKED      waits on 02-assets (store accepting kind: "software")
SW-010  NOT TESTED
SW-011  NOT TESTED   partial evidence only, recorded under SW-001; not claimed
SW-012  NOT TESTED
SW-013  NOT TESTED
SW-014  BLOCKED      waits on 01-agents (work areas)
SW-015  NOT TESTED
SW-016  PASS-able only once something is borrowed; nothing is yet — see the note at the end
```

---

## SW-001 — The template builds before any agent touches it — PASS

All four required clauses hold. Reproduce with:

```bash
bun test server/services/software/template.test.ts
```

```text
Install command and duration:   bun install, in a clean copy of the template in a fresh temp dir.
                                2,776 ms on a cold-ish cache, 34–46 ms warm (bun hardlinks from its
                                global cache). 37 packages. Exit 0.
Build exit code:                0.  bun run build -> vite build, 1,420–1,780 ms wall.
Output files:                   dist/index.html                 0.39 kB
                                dist/assets/index-*.js        191.27 kB
                                dist/assets/index-*.css         5.33 kB
                                Each asserted non-empty; an empty bundle is a build that
                                "succeeded" and shipped nothing.
Dev server port and first-byte time:
                                http://127.0.0.1:5173/ — port read off the dev server's own stdout,
                                not guessed. First byte 193 ms after spawn in the gate run, 712 ms
                                in the standalone measurement. The served HTML contains
                                id="app-root", the app's own root element.
                                lsof -nP -iTCP:<port> -sTCP:LISTEN reported
                                  node ... TCP 127.0.0.1:5199 (LISTEN)
                                — IPv4 loopback, not 0.0.0.0. After kill, lsof reported nothing and
                                the port could be bound again, checked by binding it, not by
                                consulting our own record of the process.
Workspace package.json unchanged:
                                Byte-compared before and after the whole install+build. The test
                                also asserts the workspace manifest declares neither react nor vite,
                                so a future edit that pulls the template's dependencies into ours
                                fails the gate rather than passing silently (§5.4).
```

**The check can fail on demand.** §8 says a build validator that cannot fail proves nothing, so the
red fixture was run before the green one was trusted: a syntax error written into `src/App.jsx`
(`return <div>unclosed`) gives

```text
RED BUILD exit= 1
error during build: Build failed with 1 error:
[builtin:vite-transform] Unexpected token
   ╭─[ src/App.jsx:1:45 ]
```

The error names the file and the position. That fixture is not committed as a test here — it is
SW-004's subject, and `buildRunner.ts` will carry it.

**What SW-001 does not prove.** The dev server assertions above are the fixture's, not
`preview.ts`'s: there is no preview supervisor yet, no concurrency cap, no idle timeout, and the
kill in the test is a single `kill()` on `bun run dev`, whose *child* holds the port. That the port
freed anyway is an observation about bun's signal forwarding, not a guarantee — SW-005 has to assert
it against a process group. Nothing here is evidence for SW-005, SW-006 or SW-011.

---

## Notes carried forward

**The template is not yet reachable from the running server.** `template.ts` is imported by its test
and by nothing else, and the reachability audit reports it as a test-only helper, which is honest:
it is a fixture until §6 stage 1.1 creates asset repositories with it. No item may be marked PASS on
the strength of it being *reachable* until then (§8).

**Every template file ends in `.tmpl`, and the suffix is stripped on copy.**
`scripts/audit/reachability.mjs` reads every `.js`/`.jsx` under `server/` as one of our modules and
reports the ones no entry point imports. Checked in unsuffixed, the template produced three orphans
and a red gate:

```text
ORPHANS (3) — tracked, not test files, reachable from nothing:
  server/services/software/templates/vite-react/src/App.jsx
  server/services/software/templates/vite-react/src/main.jsx
  server/services/software/templates/vite-react/vite.config.js
```

The template is the user's app, not our server, so it is genuinely unreachable by design. The audit
is not this worktree's to edit, and `template.ts` refuses an unsuffixed file so the rule cannot rot
into a convention nobody enforces.

**SW-016, nothing borrowed.** No file in this area contains a substantial portion of
`.refs/open-lovable`. The template was written here; what was taken from the reference
implementation is the *decision* to pre-install a scaffold and forbid the model from regenerating
it (§3.4 item 1), which is an idea and carries no notice. Recorded as the finding rather than left
blank, per SW-016's fourth clause. It stays true only until something is copied.
