# Handoff — pivot/generation

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — 2026-08-08

Stage worked: **G1, the transport**, under the narrow pre-gate exception in §6 G0. Nothing that
spends money ran. No live api.x.ai call was made.

Files added, all inside the §0.1 partition:

```text
server/services/xai/types.ts        XaiError, CostEvent, CostSink, AssetSink, ticksToUsd
server/services/xai/client.ts       XaiClient, setXaiTransport, setCostSink, XAI_TIMEOUTS
server/services/xai/client.test.ts  24 tests, all offline
```

`bun run verify` — exit 0, 964 pass, 0 fail, 0 orphans, 0 unclassified indicators, every cited
file resolves. Captured, not summarised from memory.

---

### R1 — `server/routes/api.ts`, one mount line

Not yet needed. `server/routes/generation.ts` does not exist, so requesting the mount now would
add a line pointing at nothing. Raised when G8 lands. The line will be, exactly:

```ts
apiRoutes.route("/generation", generationRoutes);
```

Until it lands, `server/services/xai/client.ts` is correctly reported by the reachability audit as
a **test-only helper**, not an orphan. That classification is the truth and should not be
suppressed: the transport is not reachable from the running server yet, and GEN-002 is therefore
NOT TESTED rather than PASS.

### R2 — `server/services/controlRoomEvents.ts`, three union members

Requested now, because 07 and 01 build against the union and a late addition is a second merge.
Add to the event union, verbatim:

```ts
| { type: "media_job"; jobId: string; agentId: string; status: "queued" | "pending" | "done" | "failed" | "expired"; kind: "video"; progressNote?: string }
| { type: "asset_created"; assetId: string; agentId: string; kind: "image" | "video" | "audio" | "document" | "slides" | "table" | "workflow" }
| { type: "generation_cost"; costEventId: string; agentId: string; costUsd: number; exact: boolean }
```

`exact` on `generation_cost` is not decoration. Today every Grok model prices at `costUsd: 0` with
`rateKey: null` (`server/services/usageAccounting.ts:77-93`) and nothing surfaces that, so the
product shows $0.00 and a user reads it as cheap. A consumer that drops `exact` reintroduces
exactly that. The `kind` union on `asset_created` matches `GeneratedAssetKind` in
`server/services/xai/types.ts`; if 02 needs a different set, 02's set wins and I will follow it.

### R3 — `server/services/projectMcpServer.ts`, one registration call

Not yet needed; `server/services/xai/tools.ts` does not exist. Recorded now so the ctx shape is
agreed before either side builds it. The call will be:

```ts
registerGenerationTools(server, { projectId, agentId, areaId, capability });
```

`capability` must be readable at MCP-server construction, because tools are gated by **not being
registered** rather than by refusing at call time. If `capability` is only available later, the
primary spend control does not exist and GEN-018 cannot pass — say so rather than working around
it.

### R4 — `package.json`

**Nothing requested.** §7's dependency checks (npm name, version, licence, a Bun render proof, a
local-image-embedding proof) have not been run, and §12.2 is explicit that an unchecked dependency
is not a request. `git diff` against the merge base shows `package.json` untouched on this branch.

### R5 — the setup panel must report two credentials, not one

Owner unassigned in the partition; `server/services/setupStatus.ts` is not in my row. This is a
request, not an edit.

`XAI_API_KEY` and whatever signs the `grok` CLI in are **different credentials** (§2.1). A setup
panel with one "Grok" row will send a user to fix the wrong one. The client already carries the
distinction in its error text (`NO_CREDENTIAL_MESSAGE` in `server/services/xai/client.ts`), and
`XaiClient.hasCredential` is a boolean the panel can read without ever touching the key itself.

This is GEN-001's fourth clause, and it is why GEN-001 is held at NOT TESTED below.

---

## Cross-boundary concerns raised, not worked around

### C1 — G0 is closed. This branch must not merge before 01, 02 and 03

`git log --oneline --first-parent -20` on this branch shows no page merges: the history is loop
documents and pre-pivot work. §6 G0 is a gate, so the only work done this iteration was the one
thing G0 explicitly permits before it opens — the G1 transport and the G2 seam shape — and nothing
that spends money. G3 onward is not started and should not be.

### C2 — `VERIFICATION.md` is not in my partition, so this file holds my evidence

§7 step 9 and every GEN evidence block say to record evidence in `VERIFICATION.md`. §0.1 does not
list it among the files this worktree may edit, and the loop prompt is explicit that only §0's list
is mine. Seven worktrees appending to one 265 KB tracked file would also be the eight-way conflict
§0.3 exists to prevent.

I have followed §0.1 and recorded the evidence here instead. **Reconciliation should decide one of
two things** and write it into the loop documents: either `VERIFICATION.md` is added to each
worktree's §0.1 row with an agreed per-surface section, or the loop documents stop pointing at it
and point at the handoff file. Right now the two instructions contradict each other and every
worktree will resolve it differently.

### C3 — the machine has a lowercase `xai_api_key`, which `process.env.XAI_API_KEY` will not see

§2.1 records that as of 2026-08-08 no `XAI_*` variable was set. That is no longer accurate: the
main checkout's `.env` defines `xai_api_key` (lowercase), along with `x_api_key`, `OPENAI_API_KEY`,
`github_token` and `HF_token`. `XAI_API_KEY` in the shell is still unset.

Environment variables are case-sensitive, so the client reads `undefined` and fails with the named
no-credential error — correct behaviour, and a confusing one for a user who believes the key is
configured. I did not rename it, did not read its value, and did not make the client fall back to
the lowercase name: silently accepting a second spelling would mean two places a credential can
come from, which is the opposite of §2.1's "one credential read".

**This is a §10 stop for every live item.** GEN-003, GEN-006 and the §2.2 calibration probe stay
blocked until the owner either exports `XAI_API_KEY` or confirms the lowercase variable is the
media key and should be renamed.

### C4 — `server/routes/projectReads.test.ts` fails under parallel-worktree load, not on its own

Observed, because it cost most of an iteration to rule out:

```text
bun run verify         (7 worktrees running at once)  7 fail, 4 errors, 292 s
bun test server/routes/projectReads.test.ts (alone)   41 pass, 0 fail, 16.7 s
bun run verify         (second attempt)               964 pass, 0 fail, exit 0
```

Every failure was a 5000 ms test timeout in that one file, and the file creates real git worktrees
and spawns real `grok` children. The tests are not wrong; the 5 s budget is not survivable when
seven checkouts do this simultaneously.

The file is 01's. **I have not touched it.** If 01 wants a fix, the smallest one is a longer
per-test timeout on the worktree-creating tests, and the reason to write next to it is that the
work is real filesystem I/O whose duration depends on what else is running. Flagging it because a
red gate that is really machine contention will be misread as a real regression by whichever
worktree runs verify next.

---

## What this worktree assumed about the others (§12.3)

**02-assets** — that the asset store exposes `put()` and `findByInputHash()` as in G2, and that it
is content-addressed. The shape is now published as `AssetSink` in
`server/services/xai/types.ts`, so 02 can build against it before merge:

```ts
interface AssetSink {
  put(input: AssetPutInput): Promise<{ assetId: string; sha256: string; bytes: number }>;
  findByInputHash(hash: string): Promise<{ assetId: string } | null>;
}
```

If the store is not content-addressed, `findByInputHash` cannot be free, and the regeneration cache
disappears. That matters more than it sounds: it is the strongest cost control in this engine,
because it prevents a spend rather than stopping after one. A 60-second workflow asset is ≈$5.53
against ≈$0.005 for a text turn — three orders of magnitude — so one careless regeneration is not a
rounding error.

The runtime `setAssetSink` seam is **not** written yet; only the interface. It arrives with G2, and
it will fail closed: with no sink wired, every generation call errors rather than dropping bytes.

**06-tools-cost** — that the ledger accepts `CostEvent` from `server/services/xai/types.ts`
unchanged, including `units`, `unitRateUsd`, `source`, `exact` and `rateKey`. `ModelRate`
(`server/services/usageAccounting.ts:18-25`) is per-million-tokens and cannot express $0.02 per
image or $0.080 per second at all, so a unit-aware rate row is 06's work and not a
per-million-token approximation of it.

Two fields 06 should keep rather than collapse: `ticksUsd` and `unitRateDerivedUsd` are two
independent derivations of the same charge, recorded together on purpose. When they disagree the
client already logs both numbers at warning level; storing only one throws away a free check on
whether a published price moved.

`setCostSink(sink)` exists today in `server/services/xai/client.ts` and defaults to a no-op, so 06
can wire the ledger with one call at startup.

**01-agents** — that `capability` lives on the agent record and is readable at MCP-server
construction, and that `areaId` reaches the MCP context. See R3.

**03-design-docs** — that `designDocId` is supplied by the caller when work is declared from a
design document, and is never inferred. `CostEvent.designDocId` and `AssetPutInput.designDocId` are
both optional and are only ever set from the caller's context; nothing in this worktree derives one
from a project id, because one project may follow several documents.

**05-software** — that software generation makes no api.x.ai media call and shares none of this
engine.

**07-shell** — that nothing in the shell imports `server/services/xai/**` or
`server/services/render/**` directly. The route surface is the only entry point, and it does not
exist yet.

---

## Evidence — GEN item status after iteration 1

Format follows §8. A partially-satisfied item is NOT TESTED, not PASS, and the failing clause is
named.

### GEN-000 — the pages were green before this branch merged — **BLOCKED**

```text
Page merges present:                   none. `git log --oneline --first-parent -20` shows loop
                                       documents and pre-pivot work only.
Files touched outside the partition:   none. Added: server/services/xai/{types,client,client.test}.ts
                                       (the document's own command cannot show this — see GEN-019)
Verify on base:                        exit 0, 964 pass, 0 fail (second run; see C4)
```

G0 is closed. Only the §6 G0 exception was worked.

### GEN-001 — the credential path is correct and silent — **NOT TESTED** (clause 4)

```text
Key absent, error text:   "no xAI credential is configured; media generation is unavailable.
                          Set XAI_API_KEY in the environment. This is a different credential from
                          the one that signs the `grok` CLI in — signing the CLI in does not enable
                          media generation, and setting this does not sign the CLI in."
                          Raised before a request is built: the test asserts the transport received
                          zero calls, so it can never be a 401 from a request that should not have
                          been sent.
Key present, first call:  not run. No credential (C3), and a live call is a §10 stop regardless.
grep of logs and data:    the test captures every console channel across a billed success and a
                          403 failure, asserts the capture is non-empty, then asserts the key
                          appears in none of: the captured output, err.message, err.stack, or
                          JSON.stringify({message, body}).
```

Clause 4 — the media credential and the `grok` CLI credential reported **separately in setup
status** — is not satisfied, because `server/services/setupStatus.ts` is outside this partition.
Requested as R5. The item is held.

The key is read once, at construction, from `process.env.XAI_API_KEY`; `grep -rn "XAI_API_KEY"
server/services/xai` shows the environment read and the error text, nothing else.

### GEN-002 — the HTTP client is reachable from the running server — **NOT TESTED** (clause 1)

```text
Route that imports it:    none. server/routes/generation.ts is G8 and does not exist.
Audit output:             0 orphans; server/services/xai/client.ts and types.ts are classified as
                          test-only helpers — which is the honest state, not a suppression.
Timeout asserted:         yes. image_generate totalMs 300_000 / firstByteMs 240_000, asserted on the
                          request the transport actually received; video_poll asserted at 30_000 and
                          asserted lower than the image budget; every row asserted to carry a
                          provenance string and firstByteMs <= totalMs.
```

Held until the route exists and R1's mount lands. A test-only helper is exactly the failure mode
the reachability audit exists to catch, and calling this PASS would be the "real but unreachable"
mistake `loopdesign.md` records.

### GEN-016 — rate limits are respected by construction — **PASS**

```text
Limiter location:   inside XaiClient (server/services/xai/client.ts). Call sites do no spacing; the
                    30-image test issues all 30 through Promise.all with no waiting of its own.
30-image run:       5800 ms of client-side spacing, 30 requests, 0 429s, measured. Asserted as the invariant
                    that matters rather than as a duration: no 1000 ms window contains more than 5
                    starts. Video asserted separately at its own 10 RPS and finishing sooner.
429 handling:       retried exactly once after a 1000 ms backoff, counted on client.rateLimitCount,
                    and logged with the limit and the fact that it is applied client-side. A second
                    429 is NOT retried — asserted at exactly 2 transport calls.
```

Reproduced before fixing, as required: the first implementation was a token bucket with capacity
equal to the rate, and the test caught it putting **9 starts into the first second** — a burst of 5
plus the steady rate. That is 5 RPS on average and a 429 in practice. Replaced with a spacer.

### GEN-017 — nothing secret leaves the machine in a prompt — **PASS**

```text
Refusal case:  an image prompt containing an `xai-` key and a TTS `text` containing a `ghp_` token
               both raise SecretExposureError, with `where` naming api.x.ai and the endpoint.
Call made:     no. Asserted at zero transport calls in both cases.
```

`assertNoSecrets` runs on the **whole serialised body**, not on a list of prompt fields the caller
passes in. A list is something a call site can forget; the body is not. An ordinary prompt is
asserted not to be refused, so the guard is not vacuously strict.

### GEN-014 — every generated artifact emits a cost event — **PARTIAL, held NOT TESTED**

The client half is done and tested; the item cannot pass until there are operations to cover.

```text
Operations covered:  image_generate, video_generate, structure_turn — as transport-level tests, not
                     as real generation calls. image_edit, video_extend, tts, stt and realtime have
                     no call sites yet.
Sample event:        { source: "ticks", exact: true, rateKey: "grok-imagine-image",
                       units: { kind: "images", count: 1 }, unitRateUsd: 0.02, costUsd: 0.02,
                       ticksUsd: 0.02, unitRateDerivedUsd: 0.02 }
                     from usage.cost_in_usd_ticks = 200_000_000 divided by 10^10.
Disagreement check:  asserted. 900_000_000 ticks against a $0.02 published rate logs
                     "cost disagreement ... billed $0.090000 from ticks, $0.020000 from 1 images at
                     $0.02/unit" and records BOTH on the event.
```

Also asserted: a call billed and then failed (HTTP 500 carrying ticks) still emits its charge
before the error is thrown; an unpriced model emits `rateKey: null`, `exact: false`,
`source: "token_estimate"` rather than a plausible-looking $0.00; and a call that buys nothing
(a job poll) emits no event at all.

### GEN-019 — no renderer dependency was added without the gate — **PASS**

```text
package.json diff:   untouched by this iteration. `git status` lists only the two new xai modules,
                     their test, and this file.
Libraries proposed:  none. §7's checks have not been run, so §12.2 says request nothing, and R4
                     requests nothing.
```

**GEN-019's evidence command as written does not work on this repository**, and it will mislead
the next agent, so it is worth one paragraph. The check is:

```bash
git diff --name-only $(git merge-base HEAD main) HEAD -- package.json    # must be empty
```

It prints `package.json`. Not because this branch touched it, but because `main` is pinned at
`31e5140`, roughly a hundred commits behind this branch's own base, so the merge base predates the
entire pivot and the diff covers essentially every file in the repository — 130 of them, including
`server/index.ts` and all of `client/src`. GEN-000's second clause ("files touched outside the
partition: must be empty") reads the same diff and fails for the same reason.

Reconciliation should repoint both clauses at the branch point of the pivot rather than at `main`.
Until then, the honest per-iteration check is `git status` plus the commit's own diff, which is
what is recorded above.

Not yet started, and not started out of order: **GEN-003 through GEN-013, GEN-015 and GEN-018.**
GEN-003 and GEN-006 additionally need a credential and a §10 spend approval.

---

## Iteration 2 — 2026-08-08

Stage worked: **G2, the asset contract**, the second and last thing §6 G0 permits before the gate
opens. G0 is still closed — `git log --oneline --first-parent` shows no page merges — and
`XAI_API_KEY` is still absent, so nothing live ran and nothing was spent.

File added, inside the §0.1 partition:

```text
server/services/xai/assets.ts        setAssetSink, assetSink, isAssetSinkWired, inputHash,
                                     findCachedAsset, readVerifiedMedia, persistGenerated
server/services/xai/assets.test.ts   24 tests, all offline
```

### R6 — an addition to §0.1's suggested layout

§0.1 suggests eight files under `server/services/xai/` and none of them is where G2's seam belongs.
`setCostSink` lives in `client.ts` because the transport is what extracts ticks, but the asset
discipline — download, verify, cache, persist — is not transport work and would have doubled the
size of a file whose job is one HTTP call. It is in `server/services/xai/assets.ts`.

Recorded because the suggested list exists so two of my own modules do not fight over a name, and
a later iteration adding `images.ts` needs to know this one is taken.

### The seam 02 wires

```ts
setAssetSink(sink: AssetSink | null): void
```

Default is **unwired, and unwired refuses**. `assetSink()` throws `XaiError("failed_precondition")`
carrying `NO_ASSET_SINK_MESSAGE`, and every entry point asks for the store before it touches the
network. `isAssetSinkWired(): boolean` lets the setup panel report the state without triggering the
refusal to find out.

### The defect the tests caught, and it is the one G2 exists to prevent

The first version made the unwired default a sentinel object whose `put()` and `findByInputHash()`
threw. That reads as fail-closed and is not: `persistGenerated` downloaded the entire image and
only discovered at `put()` that there was nowhere to put it. In production the money would already
have been spent by that point, and the bytes would be dropped on the floor — the exact failure
`loopdesign.md:249` describes as a green test run and no assets.

Now the store is demanded first and the download never starts. The test asserting the downloader
was called zero times is what caught it, and it failed before it passed.

---

## Evidence — GEN-004 after iteration 2

### GEN-004 — a generated asset survives its URL — **NOT TESTED** (clause 3)

```text
Local reference:      02's { assetId, sha256, bytes }. Asserted that what the caller receives back
                      contains no "http" and no "vidgen" anywhere in it — the dying link cannot be
                      held onto because it never reaches the caller. It reaches put() as
                      `sourceUrl`, labelled provenance, and nothing reads it.
Returned URL at t+N:  not measured. Needs a live generation call: credential absent (C3) and a §10
                      spend approval not given.
Asset readable t+N:   likewise.
Rejection case:       four, each a distinct real failure with a distinct cause —
                        text/html served with 200   (the proxy answered, not the origin)
                        zero-byte body              (the origin answered with nothing)
                        Content-Length mismatch     (the connection dropped mid-transfer)
                        wrong content-type family   (an audio body offered as video)
                      plus non-2xx. In every case the store is asserted to have received nothing.
No-sink case:         refuses with NO_ASSET_SINK_MESSAGE before any network call. Asserted at zero
                      downloads, not merely at a rejected promise.
put() before success: asserted. A store whose put() rejects makes persistGenerated reject, and no
                      reference is handed out.
```

Clause 3 — "the asset is still readable after the returned URL stops resolving" — is unmeasurable
without spending, so the item is held rather than claimed.

**The regeneration cache** is keyed on `sha256(model + prompt + params)` with object keys sorted at
every depth, because `JSON.stringify` preserves insertion order and a cache that misses on a key
reordering is worse than no cache — it looks like it works. Array order stays significant, because
it is significant to the model. The key deliberately excludes the project and the agent: the same
prompt to the same model produces the same image whoever asked, and keying on the asker would make
a second agent pay again for the picture the first one bought.

---

## C4, settled — the red gate is contention, and here is the proof

Iteration 1 recorded this as a suspicion. It is now measured. Same worktree, same commit, four runs:

```text
bun run verify                                       7 fail   (iteration 1, first attempt)
bun run verify                                       0 fail   (iteration 1, second attempt)
bun run verify                                       1 fail   (iteration 2)
bun run verify                                       2 fail   (iteration 2, retry)
bun run verify                                       1 fail   (iteration 2, retry)
bun test server/ client/src scripts/ shared/ \
  --timeout 30000                                    0 fail   988 pass, 145 s
```

**Every failure across every run was a ~5.1-second timeout, and raising only the per-test budget
turns all of them green.** No assertion has ever failed. The affected tests are in
`server/routes/projectReads.test.ts` and `server/routes/messageHistory.test.ts`; they create real
git worktrees and spawn real `grok` children, and 5000 ms is not survivable when seven checkouts do
that at once.

The other three gate stages were run separately and all pass on this commit: `typecheck` exit 0,
`build` exit 0, `audit` exit 0 with 0 orphans, 0 unclassified indicators and every citation
resolving.

Both files are 01's. **I have not touched either.** The smallest fix is a per-test timeout on the
worktree-creating tests, with a note that the work is real filesystem I/O whose duration depends on
what else is running. Raising the global default in `package.json` would also do it, but that is a
hot file and a decision for reconciliation, not for me.

Flagging it once more because it will cost every worktree an iteration to rediscover, and because a
red gate that is really machine contention is exactly the kind of thing that gets mistaken for
another surface's regression.

---

## Where this worktree now stands

```text
G0  the gate           CLOSED — 01/02/03 not merged. Not mine to open.
G1  transport          done, tested, committed (iteration 1)
G2  asset contract     done, tested, committed (iteration 2)
G3+ everything else    blocked on G0, and G3/G4 additionally on a credential and a spend approval
```

Both of G0's permitted exceptions are now spent. **There is no further work in this worktree that
does not require the gate to open**, so the next iteration's honest outcome may well be to report
the gate and stop. That is §10's instruction and not a failure of the loop.

