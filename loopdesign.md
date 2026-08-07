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
bun run verify                            # expect: exit 0, 360+ tests pass
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

## 2. State as of iteration 19

```text
35 PASS · 0 FAIL · 0 BLOCKED · 17 NOT TESTED
Gate: 360 tests across 16 suites, both typechecks and the build clean.
```

The backend, UI and safety controls are built and tested. B-3 (authentication) is resolved — a live
ACP session is obtainable, verified through the production `AcpConnection`.

**Everything remaining is buildable. Nothing is blocked.**

---

## 3. The 17 remaining items, in dependency order

Work top-down. Each stage unlocks the next; do not skip ahead.

| Stage | Items | What it needs |
|---|---|---|
| **A. Live sessions** | V-006, V-007 | Four concurrent agents each with a real `sessionId`, separate task/status/transcript; stopping one leaves the others running. Then session persistence across restart (`loadSession: true` is advertised). |
| **B. Session drawer** | V-023 | Wire `AcpConnection` events into the UI: streaming transcript, tool activity, send-message, pause, stop. |
| **C. MCP** | V-028…V-031 | Build the Project MCP server, pass it via `session/new`'s `mcpServers`. Read tools return scoped project data; mutation tools enforce permissions; agent-comms tools work end to end. |
| **D. Agent execution** | V-032…V-036 | An agent edits files in its worktree, runs commands, records test results; failing tests block completion; the Reviewer checks design compliance. |
| **E. Skills** | V-042 | Assigned skill instructions verifiably reach the session (`composeAgentInstructions` already produces the text; prove it lands). |
| **F. Recovery** | V-050 | Kill a live session, mark it failed, restart/replace it, restore task context, avoid duplicate work. |
| **G. Acceptance** | V-052 | The full §22.16 flow, end to end. This is the terminal gate. |

---

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
test passing, the §22.17 UI checklist complete (currently 21/22), and the §22.18 quality audit
clean (currently passing, with one open finding — Q-2, a dead Express stack still committed).

Only then output `The project is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not
yet passing.
