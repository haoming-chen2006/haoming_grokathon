# Control Room — Loop Operating Document

This is the instruction set for one iteration of the agent loop. Read this file first, act, then
stop. It is deliberately short; the two documents it points at hold the detail.

| Document | Role |
|---|---|
| `product-design.md` | The product design contract (§1–21). What the system must become. |
| `verifiables.md` | The completion checklist (§22), items V-001…V-052. What counts as done. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a          # OPENAI_API_KEY — the model backend needs it
export PATH="$HOME/.bun/bin:$PATH"
```

Confirm the environment is intact. If either check fails, fix that before anything else:

```bash
./node_modules/.bin/grok --version        # expect: grok 0.2.118
bun run verify                            # expect: exit 0, 540+ tests, 0 orphans
bun run acceptance                        # expect: all 18 steps pass (the §22.16 flow)
bun run audit                             # expect: 0 orphans, every endpoint covered
```

`bun run verify` runs, in order: server typecheck → client typecheck → all tests → production
build. **A red gate is always the highest-priority work**, ahead of any checklist item.

### Model backend

Grok Build runs against an OpenAI-compatible endpoint, configured in `~/.grok/config.toml`
(outside the repo). Credentials resolve from environment variables — **never write a key into a
config file or any tracked file**.

```toml
[model.gpt-4o]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"

[models]
default = "gpt-4o"
```

This satisfies the design contract: the `grok` binary is still the agent backbone (`product-design.md`
§5, §9), only the inference endpoint differs. The checklist never names a model.

Known non-fatal noise: an internal grok call targets `grok-4.5` and logs a 404 to stderr. It does
not affect session creation or prompt results. Do not spend iterations on it.

---

## 2. State as of iteration 46

```text
52 PASS · 0 FAIL · 0 BLOCKED · 0 NOT TESTED
Gate: 590 tests across 34 suites, both typechecks, the production build, and both
      audits (85 modules 0 orphans; 84 endpoints all covered) clean.
```

Two items are open but neither is a checklist failure:

```text
Q-2    the dead Express stack — awaiting the owner's decision (§3 below)
FLAKE  one unreproduced test failure in 14 runs, recorded in VERIFICATION.md
```

Every checklist item V-001…V-052 passes with recorded evidence, including V-052, the §22.16
end-to-end acceptance test. The §22.17 UI checklist is 22/22 and the §22.18 quality audit passes.

---

## 3. What is actually left

**One item, and it is not a coding task.**

```text
Q-2  bin/openui.js and server/index.js are a dead Express stack, committed since the initial
     commit, importing express/ws/node-pty/cors — none of which are dependencies. Running
     `node bin/openui.js` fails with a cryptic module error while reading like a supported
     entry point.

     Deleting tracked files that predate this project is the repository owner's decision.
     Awaiting: "delete them" or "keep them". Either answer closes the final §22.19 gate.
```

Do **not** delete them unilaterally (see §6). Do not spend iterations restating this.

### If the loop runs with nothing to do

The checklist is complete. Useful work still available, in rough order of value:

1. **Composition checks.** Four iterations of these each found real bugs: unreachable modules,
   untested wiring, UI↔API contract drift. The reachability audit is now `bun run audit` and runs
   as part of `bun run verify`, so a new orphan fails the gate rather than waiting to be noticed.
   Endpoint coverage is `bun run audit:endpoints`, also part of `verify`. Both audits are only
   as good as their own correctness — each has had real bugs that produced confident wrong
   answers, so verify a surprising result before acting on it.
2. **Re-run V-052** — `bun run acceptance`. It is the only test that exercises the whole system.
   It caught a case where all 18 steps reported success and no code reached `main`, and on being
   made reproducible in iteration 43 it immediately found two more (a symlink-canonicalisation
   bug in the S-2 path guard, in both the false-refusal and false-approval directions). It builds
   its own red fixture and runs against an isolated data directory, so it is safe to re-run.
3. **Flakiness.** Live-agent tests depend on model behaviour. A test that passes on re-run is a
   defect in the test, not a pass — make it deterministic. Fixed sleeps were removed in iteration
   45; use `waitFor` from `server/services/testSupport.ts` rather than sleeping, and key
   assertions on distinctive tokens so they cannot pass by chance. Audit for nondeterminism by
   construction rather than waiting for a failure to reproduce.
4. **Documentation drift.** This file and `README.md` describe how to run the system; both go
   stale as the code moves. Update the tally in §2 whenever the gate count changes — a stale
   summary is worse than none, which is how the §22.19 gate came to read "BLOCKED / 34 of 52"
   for twenty-three iterations after the blocker cleared.

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the **highest item in the stage table above that is not passing**.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` using the §22.1 format.
9. Commit with a message stating what was verified.
10. Report honestly, including what did *not* move.

---

## 5. Evidence standards

An item may be marked **PASS** only when every clause of its required result is satisfied and each
is backed by a command someone else could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Specific rules learned the hard way in iterations 1–19 — these exist because each was violated at
least once:

- **A partially-satisfied item is NOT TESTED, not PASS.** If one clause of the required result
  cannot be evidenced, say which clause and hold the item.
- **Verify through the production code path**, not a throwaway probe. A probe proves the protocol
  works; only the real service proves the product works.
- **Test against reality**: real git repositories, real separate processes, real rendered DOM. A
  mock that agrees with you proves nothing.
- **Test the failure path**, not only the happy one. Uncommitted work surviving a crash, a merge
  that conflicts, a zero-total test run — those are where defects hide.
- **A suspiciously clean result is a bug in the check.** An audit returning all zeros was a broken
  shell variable, not clean code. Re-derive before believing.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible (`verifiables.md` §22.18).
- **Adding a check can invalidate an earlier PASS.** Re-run the whole gate every iteration.
- **A passing test proves a unit works, not that anything calls it.** Before marking an item PASS,
  confirm the code is reachable from the running application — mounted route, imported component,
  wired endpoint. Three items were once marked PASS on evidence that was real but unreachable.

---

## 6. Stop and ask the user when

Per §22.2 — do not work around any of these:

- an action needs credentials that were not provided;
- an irreversible or outward-facing operation needs approval (pushing, deleting tracked files,
  deploying, spending);
- requirements contradict one another;
- a required external service is unavailable;
- completing one requirement would violate another.

Report the blocker with evidence and stop. Do not spend iterations restating a known blocker.

---

## 7. Definition of done

The project is complete only when §22.19's gate passes in full: every required item PASS, no item
NOT TESTED, no critical item BLOCKED, build green, tests green, the §22.16 end-to-end acceptance
test passing, the §22.17 UI checklist complete (22/22 as of iteration 33), and the §22.18 quality
audit clean (passing, with one open finding — Q-2, awaiting the owner's decision).

Only then output `The project is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not
yet passing.
