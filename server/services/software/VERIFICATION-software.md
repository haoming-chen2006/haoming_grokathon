# Evidence ledger — 05-software (SW-001…SW-016)

Evidence for the items in `loops/05-software.md` §7.

**This file is here because `VERIFICATION.md` is owned by no worktree** and §0 forbids editing a file
this worktree does not own. It is written in §7's format so the reconciliation pass can move it in
whole. That request is recorded in `loops/handoff/pivot-software.md`.

**Last iteration:** 5 (2026-08-08)
**Tally:** 3 PASS · 0 FAIL · 3 BLOCKED · 10 NOT TESTED

```text
SW-001  PASS         the template builds before any agent touches it
SW-002  BLOCKED      waits on 03-design-docs (read interface)
SW-003  NOT TESTED   3 of 5 clauses evidenced; HELD on the two that need a live agent session
SW-004  NOT TESTED   3 of 4 clauses evidenced; HELD on the 4th, which needs the submission path
SW-005  PASS         a preview is a process with a lifecycle
SW-006  NOT TESTED   3 of 4 clauses evidenced; HELD on the 4th, which needs the UI (stage 2.1)
SW-007  NOT TESTED
SW-008  NOT TESTED
SW-009  BLOCKED      waits on 02-assets (store accepting kind: "software")
SW-010  NOT TESTED   1 of 4 clauses (the export scan); HELD on the three that need write-time
                     refusal, which contract A-0 puts outside this surface, and the UI
SW-011  NOT TESTED   3 of 4 clauses evidenced; HELD on the one that needs the UI's own words
SW-012  NOT TESTED   two clauses (shared installs, offline) evidenced elsewhere; not claimed
SW-013  NOT TESTED   the build timeout is bounded and tested; the *retry* bound is not built
SW-014  BLOCKED      waits on 01-agents (work areas)
SW-015  PASS         export produces something that works
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

## SW-004 — The gate is the build, not the agent's report — NOT TESTED, held on one clause

Three of the four required clauses hold. The item is held, not marked PASS, because a
partially-satisfied item is NOT TESTED (§7). Reproduce with:

```bash
bun test server/services/software/buildRunner.test.ts
```

```text
Green build exit code:          0.  runBuild(<asset>) detected `bun run build` from the template's
                                package.json and the presence of bun.lock, ran it in the asset
                                directory, and returned exitCode 0, ok true, parsed true,
                                timedOut false, in 3,679 ms. dist/index.html was produced.

                                Also run inside a real agent worktree created by the production
                                createAgentWorktree (server/services/repository.ts:161): exit 0 in
                                1,878 ms, dist written inside the worktree, and **no node_modules
                                was created there**. §5.4 asks for this to be stated plainly rather
                                than assumed: an asset's worktrees share the one install at the
                                asset root, because node resolution walks up and the worktree lives
                                at <assetRoot>/.agents/<name>. Observed, for bun-installed packages
                                resolved by vite. It is evidence for one clause of SW-012 and
                                SW-012 is not claimed on it.

Red fixture and its error text: one source file broken, nothing else changed —
                                  src/App.jsx: export default function App() { return <div>unclosed
                                exitCode 1, ok false, parsed **true** (the build ran and gave its
                                own answer), and the captured output names `src/App.jsx` and the
                                token that failed. "Failed" and "could not be run" are different
                                claims and the result keeps them apart.

                                The gate also refuses to read the output: a build that prints
                                "Build succeeded! 0 errors." and exits 1 is ok false. `ok` is
                                `exitCode === 0` and nothing else — the direct correction of
                                validateBuild in .refs/open-lovable, which string-matches HTML.

Agent claim vs gate result:     NOT TESTED. runBuild takes no claim from anyone, so nothing here
                                *can* be fooled by one — but the clause is about the submission
                                path refusing an agent that claims success on a failing build, and
                                that path is §6 stage 1.4. This is the clause the item is held on.

Unrunnable case:                Three, each ok false, parsed false, exitCode -1, and each naming
                                what was missing rather than only that something was:
                                  no package.json      "there is no package.json in <dir>"
                                  no "build" script    'declares no "build" script'
                                  no such directory    "No such directory: <dir>"
                                A build that timed out is also parsed false, never a failure of the
                                app's own: the exit code is not the build's, so it is not reported
                                as one.
```

**The timeout kills the process group, and that is what the test measures.** A build times out at
`DEFAULT_BUILD_TIMEOUT_MS` (300,000 ms — five minutes, with the reason written beside the constant
and asserted by a test, because a bound with no stated reason is the one the next person doubles).
The fixture spawns a grandchild, times out at 1,500 ms, and asserts the grandchild is gone by
`process.kill(pid, 0)` — the OS's answer, not our record of it.

The kill was mutation-tested rather than assumed: replacing `process.kill(-child.pid, signal)` with
`child.kill(signal)` makes that test hang until its 30 s timeout, because the `sleep` survives its
dead parent. So the assertion depends on the group kill, and `bun run build` → `vite` has the same
shape as the fixture.

A second fixture covers the escalation: a descendant that traps and ignores SIGTERM is killed by the
SIGKILL that follows 2,000 ms later. That test exists because the first version of this code was
wrong in a way that reads as tidy — it cancelled the pending SIGKILL as soon as the process it had
spawned closed. `/bin/sh` exiting says nothing about the `vite` that `sh` started, so cancelling
drops the kill in exactly the case the escalation is for. Mutating the escalation away
(`if (false && groupExists())`) fails that test, and leaves two `sh` processes running on the
machine afterwards, which is the defect made visible.

---

## SW-005 — A preview is a process with a lifecycle — PASS

All five required clauses hold, each against a real vite dev server. Reproduce with:

```bash
bun test server/services/software/preview.test.ts
```

```text
URL and port:                   http://127.0.0.1:5173/ — the port is read off the dev server's own
                                stdout, never chosen by us. Fetching it returns the app's own root
                                element, id="app-root". Two previews started together took 5173 and
                                5174 and served independently.
Process id:                     not exposed. `stop` waits on the child's close event, so a returned
                                `stop` means the OS reaped it; a pid in the status would be a
                                process detail on its way to a surface that shows none (§4.3).
Port state after stop:          free, checked by binding it — the OS's answer, not our map's. The
                                dev server is a grandchild (sh -> bun -> vite), so this is also the
                                proof the process *group* is signalled rather than the child alone.
Idle timeout observed:          a preview with a 700 ms idle bound stopped itself, its port freed,
                                and its message reads "Stopped after 0 minutes with nobody looking
                                at it." Polling `status` deliberately does not count as looking:
                                a client polling every two seconds would otherwise keep every
                                preview alive forever and the timeout would be decorative. The
                                client says a person is watching by calling `touch`, and a test
                                touches for 1.5 s against a 1 s bound to prove it holds, then stops
                                touching and watches it die.
Cap behaviour and message shown:
                                with a cap of 1, starting a second preview stopped the first and
                                left it with: "Stopped to make room for the preview of asset-new.
                                1 previews can run at once; this was the one you had not looked at
                                for longest. Open it again whenever you like." Never a silent kill.
Orphan check after shutdown:    stopAll() left both previews stopped and both ports bindable, and
                                is idempotent — shutdown paths get called twice more often than
                                once. stopAllPreviews() is safe before anything has started.
```

**Defects this found in its own subject, before the gate saw them.** Three, each fixed:

* **A `stop` arriving while a preview was starting did nothing at all.** The entry was registered
  after the first `await`, so an early `stop` looked the asset up, found nothing, and returned —
  and the preview came up anyway, unstoppable by the caller that had already asked for it to go.
  The entry is now registered before any await.
* **A cap of one evicted the preview it was making room for.** The incoming entry counted itself in
  `live()`. It is excluded from both the count and the candidates.
* **`start` could resolve `running` before the line that condemned it.** vite prints `Local:` before
  `Network:`, in a separate chunk; a check that stopped at the first usable URL accepted a server
  bound to `0.0.0.0`. Every chunk is now checked for an off-machine address, before any URL is
  accepted and for as long as the preview runs.

---

## SW-006 — A failing preview reports the real error — NOT TESTED, held on one clause

Three of four clauses hold; the fourth needs a UI that does not exist yet.

```text
Injected failure:               src/App.jsx rewritten to import "react-datepicker", which is not
                                installed. The dev server starts — the failure is per request, not
                                at boot — and requesting /src/App.jsx is what makes it resolve, the
                                same thing a browser loading the page does.
Error text surfaced:            "Failed to resolve import "react-datepicker" from "src/App.jsx"",
                                kept in the preview's output, and the package named on its own:
                                missingPackages === ["react-datepicker"]. A scoped name keeps two
                                segments, a plain one keeps the first, and a relative import is a
                                missing file rather than a package to install (§3.4 item 4).
Source stream:                  the child process's own stdout/stderr. Nothing in this area reads
                                an iframe, and a test greps every non-test file in it for
                                contentDocument, contentWindow and shadowRoot so it stays that way.
                                Upstream's whole detector sits in a `catch {}` that swallows the
                                cross-origin exception which always fires, so it reports nothing,
                                silently; the structural guarantee against shipping the same dead
                                code is not having the code.
Latency to visible:             NOT TESTED. There is no UI yet (§6 stage 2.1), so "visible within
                                one polling interval" cannot be honestly measured. This is the
                                clause the item is held on.
Cross-origin behaviour:         the preview is cross-origin from the workspace page by construction
                                — a different port is a different origin — and nothing in the path
                                depends on reading into it. Noted from the first iteration: bun's
                                test preload registers happy-dom, whose `fetch` enforces the same
                                origin policy and rejects a request to a dev server on another
                                port. It is the first place this bites and it will not be the last;
                                the client will need the preview's own URL in an iframe and its
                                errors over our WebSocket, never by reaching into the frame.
```

**The preview binds to the loopback interface, and does not rely on the template to.** The dev
command is run with `-- --host 127.0.0.1` appended, because `vite.config.js` is a file an agent can
edit and this is the one property that must not depend on it. Mutating the flag away makes a test
fail with `Received: "http://localhost:5173/"` from a config asking for `0.0.0.0` — so the flag is
load-bearing, not decorative. A preview that announces an address off this machine is stopped, and
says so. This is evidence toward SW-011 and SW-011 is not claimed on it.

---

## SW-003 — The agent works in a worktree and nowhere else — NOT TESTED, held on two clauses

Three of five clauses hold with no agent and no model in the picture. Reproduce with:

```bash
bun test server/services/software/assetRepo.test.ts
```

```text
Worktree path:                  <workspace>/assets/software/<assetId>/.agents/agent-a1, made by the
                                production createAgentWorktree (server/services/repository.ts:161).
Sibling worktree state:         clean. A file written into agent-a1 is in neither agent-a2 nor the
                                asset's main branch, and `git status --porcelain` at the asset root
                                is empty — the worktrees are not a diff in the user's app, because
                                `.agents/` goes in .git/info/exclude rather than in the app's own
                                .gitignore.
Files written:                  src/DeckList.jsx in one worktree, src/Fresh.jsx never `git add`-ed.
                                listAppFiles finds the second; `git ls-files` does not. That is why
                                the walk exists: an app must not appear to lose files at the moment
                                it gains them (§5.3).
Asset repo HEAD vs workspace repo HEAD:
                                different commits, different repositories. The workspace used in the
                                test is itself a git repository — the case that could go wrong — and
                                after the asset is created it still has one commit and one tracked
                                file, its own. `git rev-parse --show-toplevel` inside the asset
                                answers with the asset.
Precondition assertion:         the fresh asset builds (`bun run build`, exit 0) before any agent
                                exists, so a later failure lands on the fixture or on the model and
                                is attributable either way (§8).
```

**Held clauses:** "the agent's session `cwd` is its worktree" and "files it writes appear in its
worktree" are claims about a live ACP session, which needs the launch path from §6 stage 1.4.
Asserting them against a double would be recording a PASS about our own stub (§9).

**Installing before committing was the point.** The measured finding from iteration 2 — a worktree
detecting `npm` because `bun.lock` is written after the template is committed — is fixed at the
source: `createAssetRepo` materialises, installs, and *then* makes the one commit, so the lockfile is
in it. A worktree of a real asset now reports `bun run build`, asserted. The buildRunner fixture,
which commits first and installs afterwards, still reports `npm run build` and now says why in a
comment — it is what keeps the fallback itself honest.

**A failed create leaves nothing behind.** The repository is built in `<path>.creating` and moved
into place, so an install that fails does not leave a half-scaffolded directory that the next
attempt would refuse as "something is already there". Two failure shapes are asserted: an install
that cannot reach the registry gets the single sentence "This app needs to download its building
blocks once, and there is no internet connection right now.", and one attempt only — no retries
(§5.4). An install that hangs is killed by the timeout. This is evidence toward SW-012 and SW-012 is
not claimed on it.

**An asset id from a request is untrusted.** `../escape`, `..`, `a/../../b`, `/etc/passwd`,
`sub/dir`, `""` and `.hidden` are all refused, and the sentence the user sees says nothing about
paths. `canonical` is copied from `server/routes/repository.ts:44` on §5.3's instruction rather than
re-derived, and both of its failure modes are covered: a symlink planted at
`assets/software/linked-out` pointing outside the root is refused, and the macOS `/var` →
`/private/var` case is the ordinary path every test here runs on.

---

## SW-015 — Export produces something that works — PASS

All four clauses hold. Reproduce with:

```bash
bun test server/services/software/exportApp.test.ts
```

```text
Zip contents listing:           9 entries — package.json, bun.lock, index.html, vite.config.js,
                                .gitignore, src/ and its three files. The lockfile goes with it: an
                                app that installs the same versions somewhere else is the difference
                                between an export and a pile of source.
Excluded paths confirmed:       node_modules/, .git/, .agents/ and dist/ — asserted absent by
                                prefix, from `unzip -Z1` rather than from our own file list, so the
                                claim is about the archive and not about our intention.
Clean-room build result:        extracted into a directory that is not under the workspace and has
                                no node_modules above it, then `bun install` (exit 0) and
                                `runBuild` (ok true, exit 0, ~1.5 s), producing dist/index.html.
                                Nothing it built with can have been resolved from the machine it
                                was exported from.
Scan result:                    clean, and the scan runs *before* the zip is written — a zip
                                written and then checked has already been written.
```

**The zip is produced by the system `zip`, not a library.** A zip writer would be a runtime
dependency in the workspace's own `package.json`, which is a hot file and a §9 stop besides. When
`zip` is missing the user is told exactly that, and no partial file is left behind.

---

## SW-010 — No secret reaches the artifact — NOT TESTED, held on three clauses

```text
Planted pattern:                xai-AAAABBBBCCCCDDDDEEEEFFFF1234, written into a source file of a
                                real asset. `findSecrets` (server/services/secrets.ts:52) is used
                                unchanged — a scanner that disagrees with itself between surfaces is
                                worse than one that is too broad. Both its patterns fire on
                                `const token = "xai-…"`: the key's shape and the assignment's.
Refusal text and where shown:   "This app was not exported because it has what looks like a password
                                or key in src-config.js. Take it out and keep it somewhere the app
                                reads at runtime, then try again." The finding names the file and the
                                kind; the preview is three characters and a length, so the value is
                                never quoted into a second place. **Where it is shown is NOT TESTED**
                                — there is no UI yet (§6 stage 2.1).
Export scan result:             refused before the zip existed, asserted by the file's absence.
                                A secret planted in node_modules does *not* block the export: that
                                tree is full of key-shaped test fixtures, and a check that always
                                fires is a check that gets switched off.
```

**Three clauses are held, and one of them is held for a contract reason rather than a scheduling
one.** SW-010's first two clauses say `assertNoSecrets` runs over every file *the agent writes* and
that a planted key is refused *at write time*. Under `grok-workspace.md` §3.3.1 (A-0) an agent is a
real `grok` process editing files with its own tools — this surface is not in front of those writes
and must not insert itself there. Write-time refusal is a PreToolUse concern and belongs to
01-agents' `server/services/boundary.ts`. What this surface owns is the checkpoint where the app
leaves, and that is what is asserted. Recorded rather than approximated with a scan that pretends to
be an interceptor.

---

## A-0 audit — every agent is a Grok Build agent

`grok-workspace.md` §3.3.1 was added after `loops/05-software.md` was written. This area was audited
against it in iteration 5. **Nothing here creates, implies or makes room for a worker that is not a
`grok` process, and nothing here treats a capability tier as a reduced agent.** Specifically:

```text
outbound HTTP clients in this area              none. zero fetch, zero http(s) URL, zero provider SDK
processes this area starts                      git, bun install, the app's build script, the app's
                                                dev script, zip — all deterministic build tools
anything that runs or wraps a model             none
mentions of capability tiers anywhere in it     none, so nothing can have got them backwards
```

The audit is now a test rather than a paragraph — `contract.test.ts` fails if a `fetch`, a provider
host or SDK, a model-provider key name, or a `grok` spawn appears in this area, and if the number of
places a process is started changes. Both halves were mutation-tested: adding
`fetch("https://api.x.ai/v1/chat/completions", …)` fails the first; adding
`spawnDetached("grok agent --always-approve stdio", …)` fails the second *and* the call-site count.

The temptation A-0 names is real from exactly here, and worth writing down: this surface owns a
template, a build, a preview and an export, all deterministic. "Software generation" as a pipeline
that scaffolds the template, posts a prompt somewhere, writes files back and calls itself an agent
would work and would be simpler. It would also silently remove file editing, shell, search, skills
and session resume from a team the user was told they had. The build and the preview are **tools an
agent calls**; they are not a substitute for one.

---

## Notes carried forward

**Neither module is reachable from the running server yet.** `template.ts` and `buildRunner.ts` are
imported by their tests and by nothing else, and the reachability audit reports both as test-only
helpers, which is honest: they are fixtures until §6 stage 1.1 creates asset repositories and stage
1.3 registers `run_build` as an MCP tool. No item may be marked PASS on the strength of code being
*reachable* until then (§8).

**The asset repository's first commit must include the lockfile.** `bun install` writes `bun.lock`
after the template is committed, so a worktree — which only ever has committed files — does not have
it, and `detectBuildCommand` falls back to `npm run build` there. The build works either way (exit 0,
1,878 ms, measured), but the runner that installs and the runner that builds should be the same one.
The fix belongs in stage 1.1, where the asset repository is created: install first, then commit the
template *and* the lockfile. Widening detection to search ancestors would be fixing the symptom, and
in this layout the ancestors include the workspace's own repository.

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
