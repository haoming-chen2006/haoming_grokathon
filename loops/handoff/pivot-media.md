# Handoff — pivot/media

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — the deliverable tools (MEDIA-1 … MEDIA-7)

**Built.** `server/services/mcp/media.ts` and its test; `server/services/xai/images.ts` and
`server/services/xai/speech.ts`; extensions to `server/services/xai/client.ts`,
`server/services/xai/assets.ts` and `server/services/projectMcpServer.ts`.

`bun run typecheck` clean. 82 tests across `server/services/xai` and `server/services/mcp`, all
passing, none of which spends anything — the TTS fixture in `media.test.ts` is the live envelope
reproduced field for field, so the offline tests now assert the real shape rather than a guess. The
four suites this touches from outside its own row — `projectMcpServer.test.ts`, `boundary.test.ts`,
`routes/mcp.test.ts`, `routes/mcpTools.test.ts` — are green unchanged, plus `assetStore.test.ts`.

Five tools:

| tool | registered for | cost |
| --- | --- | --- |
| `create_deliverable(type, title)` | every agent | — |
| `write_text(assetId, filename, text)` | every agent | — |
| `list_deliverables(type?, q?)` | every agent | — |
| `generate_image(assetId, prompt, aspect?)` | `images` capability | $0.02 / image |
| `narrate(assetId, text, voice?)` | `voice` capability | $15 / 1M characters |

### The spec said `generate_speech`; the tool is called `narrate`

`server/services/boundary.ts` already fixes the voice tool names as `narrate` and `transcribe`, and
`boundary.test.ts:249` asserts that every name in `MEDIA_TOOLS` is absent from `PROJECT_MCP_TOOLS`
— the assertion that stops a capability-gated tool from being registered unconditionally. A tool
named `generate_speech` would be a voice endpoint the capability table does not know about, and
therefore one it cannot withhold. `boundary.ts` is outside this worktree's row, so the tool takes
the name the table already grants. Renaming it later is a two-line change in both files at once.

## Proven live

All of it, on 2026-08-08, through the MCP tools and nothing else. Total spend **$0.0218**: one
$0.02 image and three narrations at $0.000585 (two of the five TTS attempts were 422s and free).

```
project  proj_live_media   (a scratch project id, not a real one)

MEDIA-1/2  asset_msl0g24x1wnpx6g   document · "pivot/media live proof"
MEDIA-3    └ file_msl0g5b53wx93x5.jpg   114,258 bytes · image/jpeg
             grok-imagine-image · prompt "a flat grey calibration square on a white background"
             sha256 8c88ff073b00ac33…
             charge $0.02 · costSource "billed" · rateKey grok-imagine-image
           └ file_msl0g24y2syvzel.md      84 bytes · text/markdown
           GET /api/assets?projectId=proj_live_media → HTTP 200, listed

MEDIA-4    asset_msl0licn16ujfje   workflow · "pivot/media live narration"
           └ file_msl0lj9d29y9qqc.mp3    41,088 bytes · audio/mpeg · durationSec 2.57
             frame sync ff f3 → a real MPEG frame; 41,088 B at 128 kbps = 2.57 s, which is the
             duration the endpoint reported, so the audio is complete and not truncated
             charge $0.000585 · costSource "estimated" · 39 characters
           └ file_msl0lj9h3b92m55.timings.json   39 character timings, one per input character
```

The image is a flat grey square on white — it is the picture that was asked for, not a placeholder.
These assets are in the default data directory (`~/.openui/assets`) and can be deleted; they are
left in place as the evidence. Two earlier `pivot/media live proof` documents
(`asset_mskzfdnr14ssg1s`, `asset_mskzir1l1cz8nqp`) are from the credential-blocked attempts and
hold text only.

### What the live calls settled that the docs did not

**`/v1/tts` requires `language`.** §5.3 stars only `text`, but a body without `language` is refused
with `HTTP 422 · missing field \`language\`` — in a `text/plain` body, which is a *third* error
envelope beside the documented nested one and the flat one the images endpoint uses. `speech.ts`
now sends `language: "auto"` and takes an override.

**The `/v1/tts` response shape**, which docs.x.ai does not document at all:

```json
{ "audio": "<base64 mp3>",
  "content_type": "audio/mpeg",
  "audio_timestamps": { "graph_chars": ["D","e","l",…],
                        "graph_times": [[0.08,0.10],[0.14,0.16],…] },
  "duration": 2.64 }
```

`graph_chars` and `graph_times` are parallel arrays, one entry per input character, times in
**seconds** as `[start, end]`. This is the per-character timing §5.3 calls the most valuable field
on the surface. Two things the first guess got wrong and the live call corrected: the mime is under
`content_type`, not `mime_type`; and the timings are nested under `audio_timestamps`, a level below
where a flat scan looks — so they were being stored but reported as "none found".

**`/v1/tts` returns no `usage` block**, so it does not report `cost_in_usd_ticks`. §5.4 lists that
as the one thing not to assume; it is now answered. Speech can only ever be priced from the
published per-character rate, and `costSource: "estimated"` is the honest label, not a gap to close
later. Record this in `VERIFICATION.md`.

**`/v1/images/generations` does report ticks.** The image charge came back `costSource: "billed"`,
and no cost-disagreement warning was logged, so the billed figure agreed with the published $0.02
to within 1%. Two independent derivations of one charge, agreeing.

Still unverified: whether the images endpoint honoured `response_format: "b64_json"` or answered
with a URL. Both paths are implemented and both verify the body before storing, so the outcome is
the same either way — but which one ran was not captured, and a one-line log in `images.ts` would
settle it on the next call.

---

## Iteration 2 — merged forward; R-2 and R-3 landed; one urgent fix going the other way

`grok-control-room` picked up **R-2** (capability wiring) and **R-3** (the `persistFile` sidecar
collision) in commit `2b2eca4`. Both are merged into this branch and the workaround R-3 forced —
`ext: "timings.json"` — is gone; the timings file is plain `.json` again. **R-1 is still open.**

### The wiring now works end to end, and there is a test that says so

`registerMediaTools` gated correctly from the first commit. Nothing stored a capability and nothing
passed one, so every agent silently got the base default and no agent in production could generate
anything. Every part was right and the feature did not exist. That is not something a unit test on
the gate can catch, so `media.test.ts` now asks over the route an agent actually calls:

```
base agent        38 tools   neither generator
images-only       39 tools   generate_image, no narrate
voice+images      40 tools   both — and every base tool as well
unknown agent id  38 tools   the safe default, not a crash
```

The gated tools are additions, never replacements: the test asserts `bothTools.length ===
baseTools.length + 2` and that every base tool survives, so a capability can never quietly *remove*
something an agent needs.

### Going the other way: `narrate` is broken on `grok-control-room`

That branch has `media.ts` from `3690617` but not `654a8fe`, so it sends no `language` field and
**every narration call there returns HTTP 422**. This branch carries the fix. Merging `pivot/media`
into `grok-control-room` resolves it; until that happens, voice on the integration branch is dead
on arrival and the failure looks like a bad request rather than a missing merge.

### R-4 · `client/src/**` — nothing lets a user grant a capability

`GET /api/coding-agents/capabilities` serves the four presets, with the media tools and the spend
note each one carries, and **nothing in the client consumes it**. There is no create-agent form at
all: `App.tsx` only ever GETs `/api/agents`. So a capability can be granted by an API call and by
no other means, which means that in the product as shipped, no user can give an agent media.

`startWork.ts` is explicit that this is deliberate — a seeded team "pre-answered the question the
board exists to ask", and capability is "the user's decision, taken on the box it will work in".
The decision was designed for and the box was never built. The endpoint is ready, the registry
accepts `capabilities`, and the server honours it; what is missing is the picker, and it belongs to
whoever owns the agents board.

---

## Iteration 3 — the read half

`read_text(assetId, fileId?)`, ungated, costs nothing. Round-tripped through the real HTTP MCP
route: `create_deliverable` → `write_text` → `read_text` returns the bytes that went in.

§2's M-5 says agents must be able to **read** assets, not only write them, and `list_deliverables`
only ever returned the shelf — ids, roles, models, prompts, never a byte of content. So an agent
wrote into a place it could not see: it could not revise its own document, could not check what a
deliverable already said before adding to it, and could not use the per-character narration timings
it had just paid for. Every write-only surface eventually produces a second copy of something it
could not find.

Four refusals it makes rather than obliging:

- **An image is not text.** Base64-ing a 114 KB JPEG into the reply would "work" and would spend
  the agent's context to tell it nothing. Refused, naming the mime.
- **Several readable files and no `fileId`** → the ids are listed, not guessed between. A guess is
  invisible once made.
- **Over 256 KB** → refused with the actual size. Not truncated: half a document that does not say
  it is half a document is how an ending gets silently rewritten away by the next `write_text`.
- **Another project's deliverable** → the same words as one that does not exist, as everywhere else
  here.

`application/json` is readable as well as `text/*`, which is what makes the timings sidecar useful
rather than merely stored.

---

## Iteration 4 — a billed generation that fails to store is still a charge

Found by auditing rather than by a failure. `generateImage` and `generateSpeech` return only after
api.x.ai has answered, so **every line after them is money already spent.** Storing could still
fail afterwards, and the ways it fails are not exotic: the returned image URL is expiring by design
(§3.5) so a slow download can 404 on something we paid for; a proxied body can arrive as
`text/html`; a disk can be full. Left alone, each of those produced an asset with no file **and no
charge** — the spend vanished from the page completely.

`client.ts` already holds this line for the cost sink ("a call that failed after being billed is
still a charge, and a charge the ledger never sees is exactly the hole this engine exists to
close"), but that sink is a no-op until 06 wires the ledger, so the `AssetCharge` is the only place
a user can see it. Both generators now store inside `storeAndCharge`, which records the charge on
either path. A charge with **no `fileId`** is the shape of "billed, nothing stored" —
`AssetCharge.fileId` is optional precisely so that state can be recorded rather than implied — and
the refusal says `already billed … Retrying spends again`, so an agent does not read the failure as
"nothing happened".

The failure path obeys MEDIA-6 as well: an unpriced lost generation is still `costUsd: null`, never
a fabricated zero. There is a test for that specifically.

### R-5 · `server/services/xai/**` — a *billed API failure* still loses its charge

Writing the test above made the remaining gap concrete, so it is stated rather than half-fixed.
`storeAndCharge` covers "the call succeeded and storing failed". It does **not** cover "the call
itself failed after being billed" — a moderation block, per §5.2, arrives as `invalid_argument`, and
`client.ts` emits a cost event for it before throwing. That event carries the only record of the
spend, `XaiError` does not carry the event, so no `AssetCharge` can be written and the money is
invisible again.

Two things are needed and neither is guesswork this worktree should do alone:

1. **Evidence.** Does api.x.ai actually bill a moderation refusal? §5.2 says "retrying spends money
   to be refused again", which is suggestive and not proof. The next live `invalid_argument`
   response should be recorded verbatim — if it carries `usage.cost_in_usd_ticks`, the answer is
   yes and this becomes urgent.
2. **A carrier.** `XaiError` would need to hold the `CostEvent` the client already built, so a tool
   can write the charge from the catch block. That is a small extension to `xai/types.ts` and
   `client.ts` — both in this row — but it should not be built before (1) settles whether there is
   anything to record.

## Requests still open

### R-1 · `server/services/assetStore.ts` — `AssetStore` needs `recordCharge()`

**Reason.** The store can create an asset and attach a file, and has no way to record what the file
cost. `Asset.charges` exists, `AssetCharge` is fully specified, `routes/assets.ts` serialises it and
`AssetsInspector.tsx` renders it — and nothing can write one. So a generated image could be stored
with its model and its prompt but not with its price, which is the one number the whole cost
discipline exists to keep.

`server/services/mcp/media.ts:recordCharge` stands in: it reads the envelope through the store's
own public `getAsset`, appends, and writes back through `atomicWriteJson` at
`join(store.assetDir(id), "asset.json")` with **no `await` between the read and the write**, which
is the invariant the note on `AssetStore.persist` describes. It is nonetheless a second writer of a
file the store owns, and it should not stay one.

**Change.** A method on `AssetStore`, synchronous like every other mutation:

```ts
recordCharge(assetId: string, charge: Omit<AssetCharge, "id" | "assetId" | "at">): AssetCharge {
  const asset = this.getAsset(assetId);
  const row: AssetCharge = { id: newId("charge"), assetId, at: nowIso(), ...charge };
  asset.charges.push(row);
  this.persist(asset);
  return row;
}
```

Delete `recordCharge` from `media.ts` when it lands; the call sites take it unchanged.

### R-2 · `server/routes/mcp.ts` — pass the agent's media capability

> **LANDED** in `grok-control-room` `2b2eca4`, as written below plus the `CodingAgent.capabilities`
> field and `AgentRegistry.create` accepting one. Merged into this branch; the regression test is
> "the capability stored on an agent decides the tools it is offered" in `media.test.ts`. The
> paragraph below about being blocked on 01-agents is no longer true and is kept because this file
> is appended to, not rewritten.

**Reason.** `generate_image` and `narrate` are registered per capability, which is `boundary.ts`'s
rule: the enforcement is registration, not refusal, because an advertised tool that always fails
invites a retry and a retry against a priced endpoint is a spend loop. `createProjectMcpServer` now
accepts `capabilities`, and **nothing passes it**, so the default — base Grok, no media — is what
every live agent gets. Today no agent in production can generate anything. The gate is real and
nothing can open it.

**Change.** In the handler, beside the `canWriteDocument` read:

```ts
const capabilities = getAgentRegistry().get(agentId).capabilities ?? BASE_CAPABILITIES;
const server = createProjectMcpServer({ projectId, agentId, canWriteDocument, capabilities });
```

**Blocked on 01-agents.** `AgentPermissions` (`server/types/agent.ts`) has no capability field, so
there is nothing to read yet. `boundary.ts` already has the type (`AgentCapabilities`), the four
presets and the label; what is missing is storing the chosen preset on the agent at creation. Until
that exists, R-2 cannot be written honestly — reading a field that is always `undefined` is the
same gate with more code.

### R-3 · `server/services/assetStore.ts` — `persistFile` overwrites any file whose extension is `json`

> **LANDED** in `grok-control-room` `2b2eca4`, as `<fileId>.meta.json`. Merged here, and the
> `ext: "timings.json"` workaround named in the last paragraph below has been removed — the timings
> file is plain `.json` again. The test still reads the file back and re-hashes it rather than
> trusting the descriptor, which is the only way this class of bug is visible.

**Reason.** `persistFile` writes the bytes to `<fileId>.<ext>` and its provenance sidecar to
`<fileId>.json`. When `ext` is exactly `"json"` those are the same path, and the sidecar overwrites
the file it describes — the content is silently replaced by its own metadata, with a correct
`sha256` and `bytes` in the envelope describing bytes that are no longer on disk. `MIME_EXT` maps
`application/json → json`, so **any** caller storing JSON hits it. Found by storing TTS timings;
the test caught it because it read the file back rather than trusting the descriptor.

**Change.** Give the sidecar a name that cannot collide:

```ts
const sidecar = `${id}.${ext}.meta.json`;   // was `${id}.json`
```

Anything that rebuilds an envelope by scanning the directory has to move with it. `media.ts` steps
around this today by asking for `ext: "timings.json"`, which is a workaround and is commented as
one; remove it when this lands.

## Two fixes made inside this worktree's row, worth knowing about

**`client.ts` reads `xai_api_key` as well as `XAI_API_KEY`.** Lowercase is the name the credential
actually has in this repository's `.env`, and README.md tells developers to `set -a; . ./.env`.
A client that only looked for the uppercase name reported "no credential is configured" on a
machine where the credential was present — which sends someone to fix a key that was never broken.
`XAI_API_KEY` still wins where both are set.

**`client.ts` reads api.x.ai's flat error envelope.** The documented shape nests
(`{error: {code, message}}`); the live images endpoint returns `{code, error}` with the message in
`error` and a hyphenated code. Only the nested shape was read, so every live failure lost its
message and a rejected key was reported as `invalid_argument` with the hint "Moderation blocks
arrive under this code" — a credential problem presented as a bad prompt. Both shapes are read now,
and a rejected key says so, with the console URL. This was found by making the call; it is not
something the offline tests could have caught, and it is the argument for the run that is still
owed.

## Where the rules live, so a later change does not quietly drop one

- **Never `$0.00` for an unpriced call.** `chargeFromCostEvent` (`media.ts`) treats `rateKey ===
  null` as the discriminator, not the number: `client.ts` legitimately carries an unpriced event as
  `costUsd: 0` so a ledger can still sum, and rendering that zero is how a product comes to show
  "$0.00" for every Grok model. Unpriced becomes `costUsd: null`, `costSource: "unknown"`.
  `write_text` records **no** charge at all rather than a zero one.
- **Verify before storing.** Both generators go through `materialiseGenerated`
  (`xai/assets.ts`), which is the download-and-verify half of `persistGenerated` split out so a
  caller filing bytes onto an *existing* deliverable uses the same zero-byte, content-type and
  truncation checks. A second copy of those checks would be a second chance to forget one.
- **Identity is never a parameter.** No tool takes a `projectId` or an `agentId`; there is a test
  that walks the published input schemas and asserts it. A deliverable belonging to another project
  is refused in *exactly* the words used for one that does not exist, so an agent cannot probe
  another project's ids one refusal at a time.
- **`with_timestamps` is always on.** It is not a parameter of `generateSpeech`, so no call site can
  omit it. The timings are stored as a file of their own, **verbatim** — the whole envelope minus
  the audio. That is what saved them: the parser was looking for the character array in the wrong
  place, and because the file is stored as it arrives rather than reshaped, nothing was lost while
  the parser was wrong. Reacquiring them means paying for the audio again.
- **Out of scope, deliberately.** Slides and video. There is no xAI slide API and `.pptx` rendering
  is a separate job; video is an async poll with a different lifecycle. `generateImage` also makes
  exactly one image rather than the ten the endpoint allows, because a batch path nothing calls is
  a path nothing tests, and against a priced endpoint that is an untested way to spend ten times as
  much.
