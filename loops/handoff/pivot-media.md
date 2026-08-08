# Handoff — pivot/media

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — the deliverable tools (MEDIA-1 … MEDIA-7)

**Built.** `server/services/mcp/media.ts` and its test; `server/services/xai/images.ts` and
`server/services/xai/speech.ts`; extensions to `server/services/xai/client.ts`,
`server/services/xai/assets.ts` and `server/services/projectMcpServer.ts`.

`bun run typecheck` clean. 81 tests across `server/services/xai` and `server/services/mcp`, all
passing, none of which spends anything. The four suites this touches from outside its own row —
`projectMcpServer.test.ts`, `boundary.test.ts`, `routes/mcp.test.ts`, `routes/mcpTools.test.ts` —
are green unchanged, plus `assetStore.test.ts` and `routes/library.test.ts`: 207 tests.

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

## What is proven, and what is not

**Proven live, against the real store and the real route** (2026-08-08):

```
project    proj_live_media          (a scratch project id, not a real one)
assets     asset_mskzfdnr14ssg1s    pivot/media live proof — document, 1 file
           asset_mskzir1l1cz8nqp    pivot/media live proof — document, 1 file
route      GET /api/assets?projectId=proj_live_media → HTTP 200, both listed
file       files/file_mskzir1m2rv0w9y.md, 84 bytes, text/markdown,
           sha256 5613163923357549…, producedByAgentId agent_live_media
```

Both were created by an agent-shaped caller through the MCP tools and nothing else. They live in
the default data directory (`~/.openui/assets`) and can be deleted; they are left in place as the
evidence for MEDIA-1 and MEDIA-2.

**Not proven: the one real image.** §4 asked for a single $0.02 generation. It did not happen,
because **the credential in `.env` is not an api.x.ai key.** api.x.ai answers it with:

```
HTTP 400  {"code":"invalid-argument","error":"Incorrect API key provided. You can obtain an
           API key from https://console.x.ai."}
```

`xai_api_key` is a 36-character value; issued keys begin `xai-` and are far longer. `x_api_key` is
the literal string `None`. Neither authenticates, and `GET /v1/models` refuses both, so this is the
credential and not the request shape. **Nothing downstream of the HTTP call is verified against a
live response** — in particular:

- whether `/v1/images/generations` honours `response_format: "b64_json"`, or answers with a URL;
- the entire `/v1/tts` response shape. `speech.ts` searches for the base64 audio under five
  plausible names and, finding none, fails with the keys that *did* arrive. **The first live TTS
  call settles this** — record the response verbatim in `VERIFICATION.md`, per §5.4;
- whether `/v1/tts` reports `cost_in_usd_ticks` at all (§5.4 lists it as unverified). Until it
  does, speech is charged from the published per-character rate and labelled `estimated`, never
  `billed`.

Put a real key in `.env` as `xai_api_key` (or `XAI_API_KEY`; both are read) and `generate_image`
should work unchanged — but "should" is the right word, and the run is owed.

## Two defects found in files this worktree may not edit

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
  omit it. The timings are stored as a file of their own, verbatim, because the field names are
  unverified and reshaping them on a guess throws away what it cost to learn — reacquiring them
  means paying for the audio again.
- **Out of scope, deliberately.** Slides and video. There is no xAI slide API and `.pptx` rendering
  is a separate job; video is an async poll with a different lifecycle. `generateImage` also makes
  exactly one image rather than the ten the endpoint allows, because a batch path nothing calls is
  a path nothing tests, and against a priced endpoint that is an untested way to spend ten times as
  much.
