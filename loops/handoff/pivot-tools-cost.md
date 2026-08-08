# Handoff — pivot/tools-cost

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — 2026-08-08

Item worked: **COST-001** (S1 in §3's stage table). It blocks S2–S9. It now passes.

### 1. Boundary deviations claimed, per §0

Recorded on the iteration they were decided, as §0 requires. Neither is exercised in code yet —
both are claims on paths so that no second worktree invents the same file.

* **`client/src/control-room/tools/cost/`** is where this loop's cost UI will live. The partition
  gives this loop no cost directory in the client; `client/src/control-room/tools/**` is its row,
  so the cost UI goes under it. **Do not create `client/src/control-room/cost/`** — a path no row
  claims is a path two worktrees can both create.
* **A second Hono router exported from `server/routes/library.ts`** rather than a new
  `server/routes/cost.ts`. One file, two routers, zero new claims. The mount request is item 3
  below.

### 2. Files treated as hot although no row lists them

§0 names five files that appear in no row and instructs that they be treated as hot. Recorded as
deliberate: `server/services/acpSessionManager.ts`, `server/routes/projects.ts`,
`server/routes/api.ts`, `server/services/projectMcpServer.ts`,
`server/services/controlRoomEvents.ts`. Nothing in them was edited this iteration.

**`VERIFICATION.md` is a sixth.** §5.8 tells this loop to record evidence there; §0 says the owned
list is exhaustive and `VERIFICATION.md` is not on it. Eight worktrees appending to one ledger is
precisely the conflict the partition exists to prevent, so it was treated as hot and **not
edited**. The COST-001 evidence block for it is in section 5 below, ready to paste. If
reconciliation would rather each loop wrote its own rows directly, say so and this loop will.

### 3. Hot-file requests — none required yet

No hot-file change is needed for COST-001; the whole change is inside
`server/services/usageAccounting.ts`, which this loop owns. The requests foreseen in §9 (the two
`apiRoutes.route(...)` mounts, the three `getCostLedger().record(...)` ingest sites, the `CostEvent`
re-export, the `<ToolsPanel/>` and `<BudgetMeter/>` mounts) arrive with COST-003 onward and will be
appended here as exact diffs when the code that needs them exists.

One request is worth flagging early because another worktree may want it sooner than this loop does
— see section 6.

### 4. Gate status, and a failure this loop cannot fix

`bun run verify` on 7f0f011 with a clean tree, before any change:

```text
935 pass · 5 fail · 4 errors · 2844 expect() calls · 940 tests across 50 files · 343.35s
```

All five failures are the same one, in **`server/routes/projectReads.test.ts`** — not this loop's
file:

```text
(fail) launching gives the agent an isolated worktree (§9, V-009) > an agent with no worktree gets one …
(fail) launching gives the agent an isolated worktree (§9, V-009) > the worktree is on its own branch …
(fail) launching gives the agent an isolated worktree (§9, V-009) > an existing worktree is reused …
(fail) a second task must not reuse the merged branch of the first > launching another task gives …
(fail) a second task must not reuse the merged branch of the first > relaunching the SAME task reuses …
  ^ each: this test timed out after 5000ms
```

Each timeout leaves an agent half-registered, which produces the four `Agent not found: agent_…`
unhandled errors between tests (`server/services/agentRegistry.ts:253`).

Three full runs, and the failure set moves between them — the mark of a timeout, not a defect:

```text
run 1  parent commit, clean tree   935/940  5 fail   projectReads x5
run 2  after this iteration        939/943  4 fail   projectReads x2, messaging x2
run 3  after this iteration        938/943  5 fail   projectReads x5
```

Every failure in all three is a 5000–6700ms timeout. `server/services/messaging.test.ts` is a
second file with the same symptom. **Both files pass when run alone**
(`bun test server/routes/projectReads.test.ts server/services/messaging.test.ts` → 76 pass, 0 fail,
42.6s). These tests launch real `grok` processes against a 5-second timeout while eight worktrees
run suites on one machine.

The other three gate stages are green after this iteration's change, run separately because the
test failure short-circuits them: `bun run typecheck` exit 0, `bun run build` exit 0,
`bun run audit` exit 0 (all four audits, "Every cited file and script resolves").

For **01-agents**, whose file this is: the fix is a timeout that reflects what a real agent launch
costs under load, or a seam that keeps the launch out of the assertion. This loop did not touch it.
It is reported rather than worked around, per §0.

### 5. COST-001 — evidence, for VERIFICATION.md

Method: raw ACP NDJSON to the same binary with the same args the product spawns
(`server/services/acpClient.ts:28`), every frame logged, the `session/prompt` `_meta` captured
whole, then fed through the production `extractUsage` and `resolveRate`.

```text
modelId reported:     "grok-4.5"          (verbatim, from _meta.modelId; modelUsage is keyed the same)
                      "gpt-4o"            (second turn, default model; modelUsage keyed "gpt-4o-2024-08-06")
resolveRate result:   null                for grok-4.5  — the $0.00 failure, reproduced live
                      ["gpt-4o", {…}]     for gpt-4o
Rate table entry added:
    "grok-4.5": { inputPerMillion: 2, outputPerMillion: 6, cachedInputPerMillion: 0.3 }
    source https://docs.x.ai/docs/models, read 2026-08-08, tier "< 200k prompt tokens"
    proven, not just sourced: the live turn reported inputTokens 12306, cachedReadTokens 1408,
    outputTokens 20 and its own billed usage.costUsdTicks 223384000 = $0.0223384.
    (12306-1408)x$2 + 1408x$0.30 + 20x$6 per million = $0.0223384. Exact.
Tests:  server/services/usageAccounting.test.ts, describe "COST-001: the model a live turn reports
        has a rate" — 3 tests, all three fail on the parent commit (null / undefined / $0.00).
Known limit: xAI doubles all three figures at >=200k prompt tokens and ModelRate cannot express a
        tier, so a session above 200k under-prices by 2x. COST-002 owns the tiered rate type.
```

### 6. Two findings other worktrees need, both from the same capture

**(a) An ACP turn can carry a billed cost. `04-generation` and `01-agents` should both know.**

`_meta.usage.costUsdTicks: 223384000` arrived on the grok-4.5 turn — 10^10 ticks to the dollar, a
billed figure, with no `XAI_API_KEY` and no HTTP client to `api.x.ai`. The same spike's gpt-4o turn
carried none. So:

* the ledger's `billed` tier is reachable for turns today, not only for `04`'s media calls;
* `pricing` must be decided per row from whether that response carried ticks — never from which
  code path wrote the row;
* `extractUsage` (`server/services/usageAccounting.ts:47-61`) currently drops the field. This loop
  will surface it when COST-004 gives it a reader, and not before (§7: a field with no reader is
  not a feature). **If `01-agents` or `04-generation` wants it sooner, ask here rather than adding
  a second extractor** — the signature will be an added optional `costUsdTicks?: number` on
  `TokenUsage`, nothing removed.

**(b) `available_commands_update` is arriving on `session/update` and is being discarded.**

Every kind observed across two turns, verbatim:

```text
available_commands_update, user_message_chunk, agent_thought_chunk, agent_message_chunk
```

`AcpSessionUpdateKind` (`server/services/acpClient.ts:29-35`) lists six kinds and this is not one,
so `AcpConnection`'s collector drops it silently. Payload shape:
`{ sessionId, update: { sessionUpdate: "available_commands_update", availableCommands: [{ name, description, input }] } }`.

**Request, when it is needed — `server/services/acpClient.ts` is in no row and is shared:**

```diff
 export type AcpSessionUpdateKind =
   | "agent_message_chunk"
   | "agent_thought_chunk"
   | "user_message_chunk"
   | "tool_call"
   | "tool_call_update"
-  | "plan";
+  | "plan"
+  | "available_commands_update";
```

Additive, and it changes no behaviour on its own — `AcpSessionUpdate` already carries an index
signature, so the payload survives; only the union is too narrow. This loop needs it for TOOL-004
and TOOL-005 (it is the channel a discovered skill's name and description arrive on) and will
re-request it with a consumer attached at that point. Raised now because `01-agents` renders
session updates and may want it first.

Also from the same capture, so nobody re-runs the spike to find out: `_x.ai/models/update` carries
the model roster with context windows and reasoning efforts but **no prices** — it is not a rate
source. Full notification list:
`_x.ai/mcp/servers_updated, _x.ai/models/update, _x.ai/settings/update, _x.ai/announcements/update,
_x.ai/mcp_initialized, session/update, _x.ai/sessions/changed, _x.ai/queue/changed,
_x.ai/session_notification, _x.ai/session/prompt_complete`.

### 7. Correction to this loop's own §1, which other documents may have copied

§1 stated that this machine "is not on xAI at all" and that `grok models` reports "You are not
authenticated". **Both are false as of 2026-08-08.** `grok models` reports *"You are logged in with
grok.com"* and lists `grok-4.5`, `gpt-4o` (default) and `hf-qwen-coder`. `OPENAI_API_KEY` is absent
from the environment, so the *default* model is the one that cannot run, while `-m grok-4.5`
completes real turns through the grok.com login.

`XAI_API_KEY` is still absent, so §2.5's media prices remain unobserved and a billed *media* row
remains blocked. The turn path is not blocked and was never blocked in the way §1 claimed.

### 8. Merge-order constraint, restated here because §3 asks for it

**`04-generation` and `05-software` may not merge until COST-010 and COST-011 pass.** Those are the
two loops that spend real money; without the approval threshold and the per-operation-kind retry
cap, a failing job can loop through $50 with nothing to stop it. Neither item is started. This is
the one ordering constraint that is about dollars rather than conflicts.

---

## Iteration 2 — 2026-08-08

Item worked: **COST-002**. It passes. Nothing outside this loop's rows was edited; no new hot-file
request. S2 is done, so S3 (the ledger) is unblocked.

### 1. COST-002 — evidence, for VERIFICATION.md

```text
Rate keys (token, server/services/usageAccounting.ts DEFAULT_RATES):
    grok-4.5      $2.00 in / $0.30 cached / $6.00 out  per million, and a longPrompt tier at
                  >=200k input tokens of $4.00 / $0.60 / $12.00
    gpt-4o        $2.50 / $1.25 / $10.00
    gpt-4o-mini   $0.15 / $0.075 / $0.60
    gpt-4.1       $2.00 / $0.50 / $8.00
    `grok models` lists three configured text models: grok-4.5, gpt-4o, hf-qwen-coder.
    The first two are priced; the third is deliberately absent, below.

Per-unit rates (DEFAULT_UNIT_RATES, a second non-token code path via meterCost):
    grok-imagine-image          $0.02  / image
    grok-imagine-image-quality  $0.05  / image
    grok-imagine-video          $0.050 / video second
    grok-imagine-video-1.5      $0.080 / video second
    tts                         $15.00 / 1M characters, held per-character
    stt                         $0.10  / audio hour   (REST)
    stt-streaming               $0.20  / audio hour   (streaming)
    grok-voice-think-fast-1.0   $0.05  / realtime minute
    grok-voice-think-fast-2.0   $0.08  / realtime minute

Source and date on each: a required `source: { url, readOn }` on every rate, enforced by a test
    that walks both tables. https://docs.x.ai/docs/models for the xAI rates and
    https://developers.openai.com/api/docs/pricing for the OpenAI ones, both read 2026-08-08.
    Each figure was re-read from the live page this iteration, not copied from §2.5.

Deliberately absent rates (UNPRICED_BY_DESIGN, each with a reason and the page to check):
    hf-qwen-coder    configured for the binary, but Hugging Face publishes no fixed per-token
                     price — it passes through whatever third-party provider serves the request,
                     so there is nothing to tabulate. Page quoted: "we just pass through the
                     provider costs directly."
    sandbox_minutes  05-software has not named a provider, so there is no published rate to read.
    A test asserts both resolve to null through both resolvers, so a guessed number cannot be
    added without deleting the test.

Also deliberately unpriced, inside a rate that does exist: xAI lists "$0.004 / text input" beside
    each speech-to-speech model and does not say what one text input is. A realtime charge is
    metered on audio minutes and is knowingly incomplete by that component.

Tests: server/services/usageAccounting.test.ts, describe "COST-002: …" — 9 tests. All fail on the
    parent commit (the four new exports do not exist). Two of them price the documents' own
    worked examples: §4.3's 60-second workflow asset at $5.12 video + $0.40 images = $5.52, and
    6,000 characters of narration at $0.09.
```

### 2. For 04-generation — the call shape, so it is not invented twice

```text
meterCost({ rateKey, unit, count }) -> {
  costUsd: number | null,          // null, never 0, when nothing could price it
  pricing: "metered" | "unknown",
  rateKey: string | null,
  units: { kind, count },          // exact whether or not the price is known
}
```

Two things about it that are deliberate and matter to a caller:

* **the caller declares the unit** and a resolved rate must agree. A key whose unit disagrees comes
  back `unknown` rather than priced, because pricing video seconds off the image rate would be
  wrong in the direction nobody notices. Pass `unit: "video_seconds"` with a video key;
* **`tts`, `stt` and `stt-streaming` are this product's keys, not xAI model ids.** The pricing page
  lists those two as services and names no model. Pass the key explicitly; nothing will resolve
  from a provider id.

### 3. For 05-software — one number is needed from you

`sandbox_minutes` is in the unit vocabulary and has **no rate**, so every sandbox charge will price
as "price unknown" until that loop names the provider and its published rate. That is the honest
state and it is not a blocker for the ledger, but the demo's software asset will show an incomplete
total until it is answered. `https://e2b.dev/docs/pricing` is recorded as the page to read *if* E2B
is the choice; it is a placeholder for where to look, not a decision.
