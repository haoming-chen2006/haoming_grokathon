# Generation Engine — Loop Operating Document

This is the instruction set for one iteration of the generation loop. Read this file first, act,
then stop. It is deliberately short; the documents it points at hold the detail.

| Document | Role |
|---|---|
| `grok-workspace.md` | The product contract. What the whole system must become. |
| `loopdesign.md` | The house form and the evidence standards this document inherits. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |

> This worktree owns the engine that calls api.x.ai for images, video and voice, and the code that
> renders **slides, documents and tables** into files. It does not own the pages, the asset store,
> the cost ledger, or software generation. It is built and merged **after** the three pages are
> green.

**What this surface owes the canonical demo.** A user says "I need to do this sales presentation."
The Imagine agent's slide images, the voice+Imagine agent's narration and video clips, and the
`.pptx` the deck exports to are all produced by the code specified here. The Assets page (02)
stores the result; the design document (03) is where the work was declared and where the agents'
progress is watched; the Tools and cost surface (06) shows the spend. This engine is what actually
calls api.x.ai, and what turns a response into a file that still exists tomorrow.

**One sentence you will need repeatedly:** there is no xAI slide, document, PPTX, DOCX or PDF
generation API, and the two Grok surfaces that appear to make decks are user interfaces, not
endpoints (§3.1). We generate slide *content* as structured JSON and we render the file ourselves.

---

## 0. Your worktree

**You are in a git worktree, on your own branch. You are not in the main checkout.** Seven sibling
worktrees are running at the same time on sibling branches, each with its own document, each
editing files inside its own row of the partition. Nothing you do is visible to them until
reconciliation, and nothing they do is visible to you. Assume every file outside your row is
being rewritten under you right now.

```text
document   04-generation
branch     pivot/generation
handoff    loops/handoff/pivot-generation.md
merge slot fourth wave — after 07-shell, after 01/02/03, alongside 05 and 06
```

The handoff filename flattens the slash in the branch name so it is one file per worktree rather
than a directory per prefix. Only you write it.

### 0.1 The files you own

You may create, edit and delete only these:

```text
server/services/xai/**          transport, images, video jobs, speech, and their tests
server/services/render/**       deck, document, table and timeline renderers, and their tests
server/routes/generation.ts     the HTTP surface for the above, and its test
loops/handoff/pivot-generation.md   your requests to the reconciliation pass
```

Suggested contents, so that two of your own modules do not fight over the same name. These paths
are in a fenced block and not in backticks because none of them exists yet, and the docs audit
resolves every backticked path against the repository:

```text
server/services/xai/client.ts        one credential read, one base URL, one rate limiter
server/services/xai/images.ts        /v1/images/generations, /v1/images/edits
server/services/xai/video.ts         /v1/videos/* submit and poll
server/services/xai/mediaJobs.ts     the job record, the poller, restart recovery
server/services/xai/speech.ts        /v1/tts with timestamps, /v1/stt
server/services/xai/structure.ts     chat completions -> validated deck/doc/table JSON
server/services/xai/tools.ts         registerGenerationTools(server, ctx) — one exported function
server/services/xai/types.ts         MediaJob, CostEvent, XaiError — exported from here, not from server/types
server/services/render/deck.ts       deck JSON -> HTML (canonical) and PPTX (export)
server/services/render/document.ts   document JSON -> Markdown (canonical) and DOCX (export)
server/services/render/table.ts      table JSON -> CSV (canonical) and XLSX (export)
server/services/render/timeline.ts   scenes + per-character timings -> a derived timeline
```

### 0.2 The files you must not touch, and why

```text
server/services/assetStore.ts        02 owns persistence of every asset. You produce bytes;
server/routes/assets.ts              you do not decide where they live or how they are indexed.
client/src/control-room/assets/**    Duplicating a store is how two indexes disagree.

server/services/usageAccounting.ts   06 owns the rate table and the ledger. You emit cost events;
server/services/costLedger.ts        06 stores and totals them. Two writers, one ledger, no.
server/services/promptLibrary.ts     06 owns prompts, skills and library workflows (§3.4).
server/routes/library.ts

server/services/designDoc.ts         03 owns the design document and line-level presence. A design
server/services/presence.ts          document is the interface, not an asset (§1.2). You never
server/routes/designDocs.ts          render one and never write one.

server/services/workArea.ts          01 owns the agents page, the team, capability on the agent
server/services/boundary.ts          record and the write boundary. Capability gating is enforced
server/services/agentTeam.ts         at your tool-registration seam (G8) using 01's record; the
server/services/agentRegistry.ts     record itself is theirs.
server/routes/agents.ts

server/services/software/**          05 owns website and app generation, against the reference
client/src/control-room/software/**  implementation at `.refs/open-lovable`. No api.x.ai media
                                     call is involved in it. Software is not your asset type.

client/**                            07 owns the shell; 01/02/03/05/06/08 own their own panels.
                                     This worktree ships no React at all.

server/services/acpClient.ts         Read them — they are the pattern you are copying. Editing
server/services/acpSessionManager.ts them changes the text path underneath 01.
server/services/projectMcpServer.ts  Unassigned in the partition; treat as hot (§0.3).
server/services/controlRoomEvents.ts Unassigned; treat as hot.
server/routes/api.ts                 Unassigned; the mount line is a handoff request.
```

### 0.3 The hot-file protocol

These files are shared by every worktree and **no worktree may edit them directly**, because an
eight-way conflict in them would cost more than all the feature work put together:

```text
client/src/control-room/useControlRoom.ts
client/src/control-room/ControlRoomApp.tsx
server/services/projectStore.ts
server/types/*.ts
server/index.ts
package.json
```

When your work needs a change in one of them, **you do not make it.** You append a precise request
to your handoff file — the one named in §0, which only you own — stating the file, the exact change,
the reason, and the signature or event shape other worktrees will depend on. One reconciliation
pass applies every request at the end.

The same rule applies to the unassigned-but-shared files listed above:
`server/services/projectMcpServer.ts`, `server/services/controlRoomEvents.ts`,
`server/routes/api.ts`. Nobody owns them, which makes them more dangerous, not less.

**Design your code so someone else can wire it in with one edit.** Export a clean entry point;
never reach into the shell. Concretely, this worktree exports exactly four seams and asks for
exactly four edits:

```text
registerGenerationTools(server, ctx)   one call inside projectMcpServer.ts
generationRoutes                       one line: apiRoutes.route("/generation", generationRoutes)
setCostSink(sink)                      06 calls this once at startup; default sink is a no-op
setAssetSink(sink)                     02 calls this once at startup; default sink writes nowhere
                                       and every generation call fails closed until it is set
```

`setAssetSink` failing closed is deliberate. A generation engine that silently drops bytes when the
store is not wired produces a green test run and no assets, which is exactly the failure the
reachability audit exists to catch (`loopdesign.md:249`).

You will need at least three additions to the shared event union in
`server/services/controlRoomEvents.ts` — a media job's progress cannot be shown without them. Do
not add them. Write the exact union members into your handoff file (§12).

### 0.4 What you leave behind

Your worktree hands back the branch, the handoff file, and the public contract in §12. Anything you
had to assume about another worktree's work is written down there too — not fixed silently, not
worked around.

**Raising a cross-boundary concern.** Do not edit another worktree's file to unblock yourself, and
do not build a private copy of it either. State the concern in your handoff file with the file, the
line and what you need, and stop on that item. This mirrors the product's own rule — an agent may
suggest anything about anything and may edit only its own area — and the reason is the same: an
edit made outside your area is invisible to the person who owns it until it breaks.

---

## 1. Where you sit in the product

### 1.1 The build order is fixed, and you are not first

The owner has fixed it:

```text
FIRST, and robustly tested:   AGENTS (01) · ASSETS (02) · DESIGN DOCUMENTS (03)
AFTER that:                   slide generation · workflow/video generation · software generation
```

Slides are yours. Workflow/video generation is yours. Software generation is 05's. All three are in
the *after* half. **This document does not start until the three pages are green**, and that is a
gate, not a preference (§6, G0).

The reason is not politics. Two of your dependencies — the asset store and the cost ledger — are
consumed by pages that must already work before your output means anything: an image that generates
successfully and does not appear on the Assets page is not a feature, it is a receipt. Building the
engine first produces assets nothing can show and costs nothing can total, and every one of those
calls is billable.

### 1.2 The five asset types, and which of them are yours

```text
documents   yours to render        the most worked-on type, and the only type that DECLARES work
slides      yours to render        PPTX rendering, nothing more
tables      yours to render        spreadsheet rendering, nothing more
workflows   yours to render        the composed sequence: scenes, narration, generated clips (§3.4)
software    NOT yours — 05         websites and apps for a non-technical user, in the manner of
                                   Lovable; reference implementation cloned at `.refs/open-lovable`
```

### 1.3 A design document is not a document asset — get this exactly right

This is the distinction most likely to be lost in this worktree, because you render documents.

**A design document is the interactive interface.** It is the surface where work is declared and
watched: clicking into one opens it, and inside it a user sees which project follows it, the agent
conversation, and live highlighting of the lines each agent is currently reading or working on. It
is owned entirely by 03. **You never render one, never write one, and never produce one as an
output.**

**A document asset is an output.** It is a thing an agent produced — a research brief, a one-pager,
the write-up that accompanies the deck. It lands in the Assets page like every other asset. That is
what your document renderer makes.

Two consequences for your code:

- **Never write to a design document.** The only way anything reaches a design document is 03's
  suggestion mechanism, which already exists and is reused as-is: `DesignSuggestion`
  (`server/types/project.ts:95-118`), the `submit_design_suggestion` MCP tool
  (`server/services/projectMcpServer.ts:718`), `baseVersion`/stale conflict detection, and the
  queue UI. If a generated document ought to change the design document, that is a suggestion,
  raised by the agent, resolved by the user.

  One correction while you are here: the contract calls the queue component SuggestionQueue.tsx
  and no file of that name exists. The suggestion queue is rendered today by
  `client/src/control-room/ReviewQueues.tsx`. The mechanism is real and reused as stated; only the
  filename is wrong, and it is 03's to rename or keep.
- **Attribute assets to the project, not to the document.** One project may follow multiple design
  documents; one design document may be followed by at most one project. So a project id does not
  identify a document, and inferring one would be wrong the moment a project follows two. Record
  `designDocId` **only** when 03's caller supplies it. Never infer it.

### 1.4 Your tools must not block, because presence is what the user watches

03 requires agents to emit the line numbers they are reading or working on, periodically, and that
emission is what drives the highlighting in the design document. An agent that is blocked inside a
tool call is not emitting anything, and 03's UI will correctly mark its presence stale.

A video job takes minutes. **Therefore no generation tool may block on it.** `generate_video`
submits and returns a job id immediately; `check_video_job` reads status. The agent keeps its turn,
keeps talking, and keeps emitting presence. This is a hard rule about your MCP surface, and it
exists because the alternative makes the most expensive operation in the product look like a hung
agent.

---

## 2. Before doing anything

```bash
cd /Users/haoming/openui                  # the pivot worktree, not the main checkout
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
test -n "$XAI_API_KEY" && echo "credential present" || echo "NO XAI CREDENTIAL"
git rev-parse --abbrev-ref HEAD           # expect: pivot/generation
```

```bash
./node_modules/.bin/grok --version        # expect: grok 0.2.118
bun run verify                            # expect: exit 0
bun run audit                             # expect: 0 orphans, every endpoint covered
```

**A red gate is always the highest-priority work**, ahead of any item in this document. Capture
verify's output to a file, never `>/dev/null`.

If `git rev-parse` does not say `pivot/generation`, stop. You are in the wrong checkout and
everything below will land in someone else's branch.

### 2.1 Credentials — there are two, and one of them does not exist yet

`XAI_API_KEY` is a **different credential** from whatever signs the `grok` CLI in. Agent text goes
through the existing ACP transport and the CLI's credential; everything this document builds goes
through the new HTTP client and `XAI_API_KEY`. Two auth surfaces, two failure messages, and the
setup panel must report them separately or a user will fix the wrong one.

As researched on 2026-08-08 this machine has neither: `~/.grok/config.toml` points at
`api.openai.com` and `router.huggingface.co`, `grok models` reports "You are not authenticated",
and no `XAI_*` variable is set in the shell. **Every live item in this document is blocked until an
xAI credential exists.** That is a §10 stop, not something to work around with a mock.

The `grok` binary is a separate Rust program under `.refs/grok-build` that this repository does not
build; this repository only spawns it (`server/services/acpClient.ts:28`). Do not describe a flag
or a credential as though it works by magic across that boundary — it is another process, with its
own configuration file, and it is not the process making your HTTP calls.

Never write a key into a config file or any tracked file. The client reads it from the environment
once, at construction, and it must never appear in a log line, an event, an error message or a
persisted record.

### 2.2 The first live call costs money

```bash
curl -s -X POST https://api.x.ai/v1/images/generations \
  -H "Authorization: Bearer $XAI_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"grok-imagine-image","prompt":"a flat grey calibration square","n":1}'
```

Expect a `data[0].url` and a `usage.cost_in_usd_ticks` of about `200000000` ($0.02). That probe is
a spend, and spending needs the user's approval (§10). Ask once, run it once, and record the raw
response in `VERIFICATION.md` — it is the only evidence that the field names in §5 are real on this
account, and it is worth two cents exactly once.

---

## 3. What the brief assumed that is not true

Each of these was assumed somewhere in the founding brief, or is a correction the owner has since
made. Do not quietly design around them; an agent that goes looking for the endpoint in §3.1 will
waste an iteration and then invent one.

### 3.1 Slides cannot be delegated to Grok — both deck surfaces are user interfaces

This is the finding that shapes half this document, so it is stated first and in full.

Two Grok surfaces look as though they generate decks:

```text
"Grok for PowerPoint"      a Microsoft 365 add-in. It is a task pane rendered inside Office,
                           driven by a signed-in user in a running Office host. There is no
                           documented endpoint behind it that a server may call.

grok.com producing .pptx   the consumer chat product. Driving it from a server means browser
                           automation against a logged-in consumer session.
```

**Neither is callable from a server.** An add-in is a UI extension point, not an API; the consumer
web product is a UI. Automating either one would mean: no documented request or response shape, no
`cost_in_usd_ticks` and therefore no line in the ledger, breakage on any front-end change, and a
dependency on a human session for an unattended server. For a product whose headline is accounted
spend, that is not a defensible architecture — it is the same argument that rules out routing media
through the CLI (§3.7), only worse.

**Therefore, everywhere slides are discussed:**

```text
content    generated with the CHAT API, as structured JSON, against a schema we define
render     .pptx produced by OUR code, with a Node library, on our machine, offline
```

Say it out loud in every prompt, every code comment and every error message that touches slide
assembly. An agent that has not been told this will spend an iteration looking for
`/v1/slides/generations`.

**Honest provenance.** The research file independently establishes the load-bearing half: xAI ships
no document, slide, PPTX, DOCX, PDF or presentation generation API — the docs index,
model-capabilities tree and REST reference were all checked, and what exists in that neighbourhood
(Files API, Collections) is *input*-side only. The specific claim that the PowerPoint add-in and
the grok.com download are UI-only surfaces is the **owner's finding, not one I could confirm from
the research file**. It does not change the build: both readings — "there is no API" and "the API
is a user interface" — produce exactly the same code. If you ever find a documented server-callable
deck endpoint, that is a §10 stop; record what you found and do not build on it unasked.

**Video is the opposite case.** `POST /v1/videos/generations` is a real, documented, priced,
server-callable API with an async poll contract (§5.2). Do not let the slide finding leak into
video and produce a needlessly local pipeline; do not let the video reality leak into slides and
produce a search for an endpoint that does not exist.

### 3.2 There is no xAI document, slide, PPTX, DOCX or PDF generation API. None.

The Files API and Collections are input-side only. Slide, document and table assembly are 100% our
own code: Grok text produces structured JSON, our renderer turns it into a file, Imagine fills the
picture slots. This is asserted by a grep in GEN-010.

### 3.3 Custom voice cloning through the API is Enterprise-only

On a standard plan, custom voices are created in the console; API creation requires "contact
sales". It is also US-only, excluding Illinois, for BIPA reasons. **Do not build a feature that
clones a user's voice from the app.** Built-in voices (`eve` default, `ara`, `rex`, listable at
`GET /v1/tts/voices`) are the entire voice palette this product ships with.

### 3.4 "Workflow" names two different things, and one of them is not yours

`workflows` is now one of the five asset types, and it is also the name of a Tools-panel resource
(agent control logic: a loop, an evolve-loop) owned by 06 in `server/services/promptLibrary.ts`.
These are not the same object and the collision is real.

**What this document builds**, on the reading that the owner's own build order pairs "workflow/video
generation" as one item: a **workflow asset is a composed sequence** — scenes, each with narration,
slide content and optionally a generated clip, with a timeline derived from per-character TTS
timings, whose canonical form is timeline JSON and whose export is an MP4. That is the thing the
voice+Imagine agent produces in the canonical demo, and it is the only one of the two readings that
needs a generation engine at all.

**Unresolved, and worth one sentence to the owner:** if a workflow *asset* is instead meant to be a
saved agent-control-logic definition, then the asset type belongs to 06's library model and this
worktree owns only the video pipeline underneath it. Ask; do not decide it silently in code. The
renderer is unaffected either way, because it is addressed by asset kind rather than by name.

### 3.5 Returned media URLs are temporary

Image URLs and video URLs (`https://vidgen.x.ai/...`) expire. Any design that stores a returned URL
as a deck's picture reference is broken by construction — the deck goes blank days later and
nothing in the logs says why. Persist on receipt, before the response is even reported as
successful.

### 3.6 Video generation is asynchronous

`POST /v1/videos/generations` returns a `request_id`; you poll `GET /v1/videos/{request_id}` until
`done`. A video request is a long-lived server-side job, not a request/response. That needs a job
table and a poller, not an `await` — and it is why your MCP tools do not block (§1.4).

### 3.7 This project has no HTTP client to api.x.ai

It speaks ACP — JSON-RPC over stdio — to the `grok` binary and nothing else
(`server/services/acpClient.ts:28`, `:301-333`). Grepping `server/` and `client/src` for `api.x.ai`
returns nothing. The transport is net-new work, and there is **no official xAI TypeScript SDK** —
the official SDK is Python and gRPC-based. You are writing `fetch` and `WebSocket` by hand. That is
fine; the endpoints are simple. Budget for it.

### 3.8 Do not route media through the `grok` CLI

The CLI has `image_gen`, `image_edit`, `image_to_video` and `reference_to_video`, and it is tempting
because the ACP transport already exists. Three reasons not to: those tools are gated on a SuperGrok
subscription and return upsell prose instead of an image on free and X Basic tiers — in headless ACP
mode too, not just the TUI; a remote setting can force them off regardless of local config; and the
CLI's surface is narrower than the API's (video duration 6 or 10 only, no 1080p, no text-to-video
tool). For a product sold to non-technical users, the direct API path with an `XAI_API_KEY` is the
only defensible architecture.

### 3.9 The `grok` CLI's voice feature is speech-to-*text*

The `xai-grok-voice` crate is dictation. There is no TTS anywhere in the CLI. Spoken output is
entirely our `/v1/tts` integration.

### 3.10 Imagine throughput cannot be bought

Image and video rate limits are flat across all spend tiers — 5 RPS for images, 10 RPS for video.
Spending more unlocks text tiers, not media throughput. A deck with 30 images has a ≥6-second
serialised floor before generation latency.

### 3.11 Cost is broken today, and your events are what fix it for media

`DEFAULT_RATES` in `server/services/usageAccounting.ts:31-35` holds only `gpt-4o`, `gpt-4o-mini` and
`gpt-4.1` — no Grok model. An unknown model returns `costUsd: 0` with `rateKey: null`
(`:77-93`), so every figure in the shipping product is very likely $0.00. There is no ledger, only
running totals, so no chart has source data. `ModelRate` (`:18-25`) is per-million-tokens and cannot
express $0.02 per image at all.

06 fixes the ledger. **You fix the media half of the input**, by emitting an event per billable call
with units, unit rate and source on it (§6.1). Do not edit `server/services/usageAccounting.ts` to do it — write to
the `setCostSink` seam and let 06 wire the ledger in.

---

## 4. What exists today

| Thing | Where | State |
|---|---|---|
| ACP transport over stdio | `server/services/acpClient.ts:95` | Works. Copy its shape, not its protocol. |
| Launch args, with the reason recorded | `server/services/acpClient.ts:17-28` | The house standard for a documented constant. |
| Request/response with per-call timeout | `server/services/acpClient.ts:309-333` | The pattern for the xAI client's `request`. |
| A typed error carrying the protocol code | `server/services/acpClient.ts:59-67` | `AcpError`. Write `XaiError` the same way. |
| An error message that says what is actually wrong | `server/services/acpClient.ts:153-167` | Read this comment before writing any error path. |
| One usage object per turn | `server/services/acpClient.ts:434-478` | Why per-tool-call attribution is impossible for text. Per-task cost is tracked; per-tool-call is structurally unavailable. |
| Token rates | `server/services/usageAccounting.ts:31-35` | Three keys, no Grok model. §3.11. |
| Rate shape | `server/services/usageAccounting.ts:18-25` | Per-million-tokens only. Cannot express $/image or $/second. |
| Honest zero on an unknown model | `server/services/usageAccounting.ts:77-93` | `rateKey: null`, `costUsd: 0`. Preserve the principle; surface it. |
| How a turn's cost is recorded | `server/services/acpSessionManager.ts:365-398` | Records the charge *before* enforcing the cap. Copy that ordering. |
| Atomic JSON write, data dir | `server/services/persistence.ts:23`, `:375` | 02's asset index uses both. Yours uses them for the job table. |
| Secret scanning | `server/services/secrets.ts:113` | `assertNoSecrets`. An image prompt is user text going outbound. |
| Event bus to the UI | `server/services/controlRoomEvents.ts:9-46` | Needs new members for job progress. Not yours to edit — §12. |
| Artifact model | `server/types/project.ts:234-257` | `ArtifactKind` is code-specific; `uri` exists. Media kinds are 02's call. |
| The suggestion mechanism | `server/types/project.ts:95-118` | Works today, reused as-is. The only route into a design document. |
| MCP tool registry | `server/services/projectMcpServer.ts:705-740` | 35 tools, none of them media. Identity is bound at construction, never a parameter (`:13-19`). |
| User-only tools | `server/services/projectMcpServer.ts:696-704` | `DELIBERATELY_USER_ONLY`. Never add a spend approval to a tool an agent can call. |
| Route mount block | `server/routes/api.ts:26-32` | You need one line here. It is a handoff request, not an edit. |
| Runtime dependencies | `package.json:50-55` | Four: MCP SDK, `@xai-official/grok`, `bun-pty`, `hono`. **Nothing that renders anything.** |
| An HTTP client to api.x.ai | — | **Does not exist.** |
| Any notion of a long-running generation job | — | **Does not exist.** |
| Any renderer for PPTX, DOCX or XLSX | — | **Does not exist, and cannot until §7 clears.** |

`server/services/testRunner.ts` is dead on arrival for this pivot — a test suite is not acceptance
evidence for a slide. Nothing in it is reusable here. Do not delete it; it is not in your row.

---

## 5. The API surface, exactly

Verified 2026-08-08 against docs.x.ai. Everything in this section is a fact you may build on.
Anything not in this section is unverified; say so rather than inventing it.

### 5.1 Images — synchronous

```text
POST https://api.x.ai/v1/images/generations
POST https://api.x.ai/v1/images/edits

model            grok-imagine-image           $0.02 / image
                 grok-imagine-image-quality   $0.05 / image
                 flat per image, regardless of prompt length; edits are charged for
                 BOTH input and output

generations      model*, prompt*, n, aspect_ratio, resolution, response_format,
                 storage_options, user
edits            prompt*, image | images, model, n, resolution, response_format,
                 storage_options, user

aspect_ratio     1:1 3:4 4:3 9:16 16:9 2:3 3:2 9:19.5 19.5:9 9:20 20:9 1:2 2:1 auto
resolution       1k | 2k
response_format  url (default) | b64_json
batch            up to 10 images per request; multi-image edit takes up to 3 sources
image input      public URL, base64 data URL, or Files-API file id

response         { data: [ { url | b64_json, mime_type, file_output, storage_error } ],
                   usage: { cost_in_usd_ticks, ... }, model, respect_moderation }

limit            5 RPS, flat across all tiers
timeout          the CLI uses 300 s total / 240 s read for exactly this call, because some
                 models expand the prompt before generating and the proxy buffers the image
```

`response_format: "b64_json"` sidesteps the expiring-URL problem at the cost of response size. It
is the safer default for single images; `url` plus immediate download is required for batches.
Decide once, in the client, and write down which and why.

### 5.2 Video — asynchronous

```text
POST https://api.x.ai/v1/videos/generations    text-to-video, image-to-video, reference-to-video
POST https://api.x.ai/v1/videos/edits
POST https://api.x.ai/v1/videos/extensions     continuation segments, 2-10 s
GET  https://api.x.ai/v1/videos/{request_id}   poll

status           pending | done | expired | failed
failure body     { status: "failed", error: { code, message } }
error codes      invalid_argument (includes moderation blocks), permission_denied,
                 failed_precondition, service_unavailable, internal_error
polling          the official SDK defaults to 100 ms interval, 10 minute timeout

model            grok-imagine-video           $0.050 / second
                 grok-imagine-video-1.5       $0.080 / second

duration         1-15 s, default 8
resolution       480p | 720p | 1080p, default 480p; 1080p only for text-to-video and
                 image-to-video on grok-imagine-video-1.5
aspect_ratio     1:1 16:9 9:16 4:3 3:4 3:2 2:3, default 16:9
reference        reference_images OR reference_audios; max 3 reference voices; max 720p;
                 cannot combine `image` with `reference_images`
edit/extend      retains original duration capped at 8.7 s, max 720p
output           MP4, H.265 / H.264 / AV1; image inputs JPEG/PNG/WebP
audio            generated by DEFAULT on all modes

limit            10 RPS, flat across all tiers
urls             temporary (https://vidgen.x.ai/...) — persist on receipt
```

**Unverified:** the CLI references `grok-imagine-video-1.5-preview` as its quality model. The public
models page does not list it. Do not assume `-preview` is GA; if you need it, check
`GET /v1/models` on the live account first and record what came back.

That video already carries audio changes the composition problem. See §6, G7.

### 5.3 Voice

```text
POST https://api.x.ai/v1/tts        WSS wss://api.x.ai/v1/tts
GET  https://api.x.ai/v1/tts/voices

price            $15.00 / 1M characters  (~$0.015 per 1,000 chars; ~$0.09 per 10-minute read)
text             max 15,000 chars over REST; unlimited over WebSocket
params           text*, voice_id, language (BCP-47 or auto), output_format {codec,
                 sample_rate, bit_rate}, speed (0.7-1.5, default 1.0), text_normalization,
                 with_timestamps, optimize_streaming_latency (0-2)
voices           eve (default), ara, rex — ids are case-insensitive
codecs           MP3, WAV, PCM, mu-law, A-law; 8000/16000/22050/24000/44100/48000 Hz;
                 MP3 32k-192k; default MP3 @ 24 kHz / 128 kbps
extras           inline speech tags (laughter, whispers, pauses); 20 languages
limits           50 concurrent WebSocket sessions per team; REST request timeout 15 min

POST https://api.x.ai/v1/stt        WSS wss://api.x.ai/v1/stt
price            $0.10/hr REST, $0.20/hr streaming
input            file (max 500 MB) or url
options          language, format, keyterm (max 100 terms x 50 chars), diarize, multichannel,
                 filler_words, vad_threshold, audio_format, sample_rate
response         { text, language, duration, words: [{text, start, end, speaker?, channel_index?}] }

WSS  wss://api.x.ai/v1/realtime?model=grok-voice-latest
models           grok-voice-latest (alias -> grok-voice-think-fast-2.0 as of 2026-08-05),
                 grok-voice-think-fast-2.0, grok-voice-think-fast-1.0
price            think-fast-1.0 $0.05/min; think-fast-2.0 $0.08/min; +$0.004/text input
codecs           PCM 8k-48k (default 24 kHz), Opus 24 kHz, G.711 mu-law/A-law 8 kHz only
tools            web search, X search, file collections, MCP servers, custom functions
tokens           ephemeral tokens let a browser hold the mic connection directly
```

`/v1/tts` is **not** OpenAI's `/v1/audio/speech`, and `/v1/stt` is not `/v1/audio/transcriptions`.
The parameter names differ (`text`/`voice_id`, not `input`/`voice`). The OpenAI SDK cannot call
either. Only `/v1/images/*` and chat completions are OpenAI-SDK compatible via a `base_url` swap.

**`with_timestamps` returns per-character timing.** This is the most valuable field on the whole
surface for this product: it is what makes narration sync to slide builds *deterministic* rather
than hand-tuned. Ask for it on every narration synthesis, always, even when nothing currently
consumes it — it is free, and regenerating audio to get timings back costs money.

If the browser holds a realtime connection directly with an ephemeral token, the server never sees
the audio and therefore never sees the cost. Either proxy it or reconcile afterwards; do not ship a
path that spends money the ledger cannot see.

### 5.4 Cost, in ticks

```text
usage.cost_in_usd_ticks     present on chat completions, Responses API, image generation,
                            video generation and the Batch API
conversion                  1 USD = 10,000,000,000 ticks (10^10)
example                     37756000 ticks = $0.0038
coverage                    includes all token cost AND all server-side tool invocations
streaming                   via REST you must send stream_options: { include_usage: true },
                            and cost arrives only in the final chunk (the one with empty choices)
```

**Unverified, and the one place not to assume:** the docs do not state whether `/v1/tts`, `/v1/stt`
or the realtime endpoint return `cost_in_usd_ticks`. Treat voice cost as derived from published
rates until a live response proves otherwise, and label it as derived. Record the first live TTS
response verbatim in `VERIFICATION.md` and settle the question there.

There is no server-side spend history to query. The Management API manages keys, ACLs and audit
logs; it does **not** expose historical spend. Every figure the product shows comes from our own
accumulation of per-response cost.

### 5.5 Structured output — the one API detail this document needs and cannot confirm

Slide, document and table content are generated as JSON against a schema we define. Two routes
exist and they are not equivalent:

```text
direct chat API   POST https://api.x.ai/v1/chat/completions through your own client.
                  Returns usage.cost_in_usd_ticks, so the structure call is an EXACT cost line.
                  Schema-constrained output is documented as available; the exact request
                  parameter name and shape is NOT stated in the research file. UNVERIFIED.

over ACP          the existing agent transport. The CLI exposes `--json-schema`, which constrains
                  the model to matching JSON and implies `--output-format json`. Whether that
                  constraint is reachable through `session/prompt` over ACP is UNVERIFIED.
```

**Build against the direct chat API.** It is the owner's stated route for slide content, it returns
billed cost rather than an estimate, and it does not depend on an unproven ACP capability. The
consequence is that this product now has two text spend surfaces — the agent's conversation over
ACP, and structure generation over HTTP — and both must emit cost events or the totals will be
quietly short.

Before writing the request, verify the schema parameter against docs.x.ai and record the exact
field name and the first live response in `VERIFICATION.md`. Until it is verified, implement
prompt-and-validate with a repair loop **bounded to two attempts**, and write the bound's reason
into the code: a repair loop against a model that cannot satisfy the schema is a spend loop.

---

## 6. What must be built, in order

Work the highest stage that is not passing.

```text
G0  the gate           01, 02 and 03 merged and green. Nothing below starts before this.
G1  transport          server/services/xai/client.ts
G2  the asset contract 02's store, consumed through setAssetSink. You persist nothing yourself.
G3  images             generation and edit through G1, landing through G2
G4  video jobs         server/services/xai/mediaJobs.ts — submit, poll, settle, survive restart
G5  voice              server/services/xai/speech.ts — TTS with timestamps, STT
G6  renderers          deck.ts, document.ts, table.ts — slides, documents, tables
G7  workflow asset     server/services/render/timeline.ts — the composed sequence
G8  exposure           server/services/xai/tools.ts, server/routes/generation.ts
```

### G0 — the gate you do not open yourself

```bash
git log --oneline --first-parent | head -20     # expect the three page merges present
bun run verify                                  # expect exit 0 on the merged base
```

The three pages are built and robustly tested first. If they are not merged and green, the correct
work in this worktree is **nothing**: report the gate and stop (§10). Writing the engine against
three moving pages produces integration you will throw away, and every live test in it is billable.

The one exception, and it is narrow: **G1 and G2's seams may be written before the gate opens**,
because they have no dependency on any page and because 02 needs your `setAssetSink` shape in order
to build against it. Nothing that spends money runs before G0.

### G1 — the transport

One module, one credential read, one place that knows the base URL. Hand-rolled `fetch`, for the
same class of reason `server/services/acpClient.ts:85-95` gives for not using the ACP SDK: there is
no official xAI TypeScript SDK at all, the Python one is gRPC, and the third-party JS options cover
text and images only — not video polling, not TTS, not realtime. Write the reason into the file.

It must, from the first commit:

- read `XAI_API_KEY` at construction and never log it, never emit it, never persist it;
- fail with a named error when the key is absent — "no xAI credential is configured; media
  generation is unavailable" — not a 401 from a request that should never have been sent;
- carry timeouts sized for the endpoint: 300 s total / 240 s read for image generation, because
  that is what the CLI uses and it uses it for a reason;
- hold the rate limiter (5 RPS images, 10 RPS video) **in the client**, not at call sites;
- expose a seam (`setXaiTransport`) so tests can supply a recorded response. **Do not use
  `mock.module`** — it patches the registry process-wide and only reaches importers evaluated
  after it, so in the full suite it is silently inert and the test makes real, billable calls
  (`loopdesign.md:257-263`, where exactly this cost six live `grok` children and a run that never
  finished; here it would cost money as well as time);
- run `assertNoSecrets` (`server/services/secrets.ts:113`) on every prompt string before it leaves
  the machine;
- extract `usage.cost_in_usd_ticks` on every response and divide by 10^10;
- emit one cost event per call (§6.1) through `setCostSink`, before returning, even on a partial
  failure that was billed.

### G2 — the asset contract, before anything that generates

Built second and not later, because the moment image generation works there is a temptation to
store the returned URL and move on, and that bug does not show up for days.

**02 owns the store.** You own the discipline of handing it bytes at the right moment. The seam:

```text
interface AssetSink {
  put(input: {
    projectId: string; agentId: string; designDocId?: string;
    bytes: Uint8Array; mimeType: string;
    kind: "image" | "video" | "audio" | "document" | "slides" | "table" | "workflow";
    sourceModel: string; sourcePrompt?: string; params: Record<string, unknown>;
    sourceUrl?: string;          // recorded as provenance only; expired by the time anyone reads it
    requestId?: string; costEventId?: string;
  }): Promise<{ assetId: string; sha256: string; bytes: number }>;

  findByInputHash(hash: string): Promise<{ assetId: string } | null>;
}
```

Rules that are yours regardless of how 02 implements it:

```text
download on receipt   the response is not "successful" until put() has resolved
verify the body       assert byte length and content-type against the response headers; a
                      zero-byte or text/html body is an error page, not an image
never                 return success, emit an asset id, or settle a job before put() resolves
never                 store the returned URL as the durable reference
regeneration cache    hash(model + prompt + params); call findByInputHash first
```

**Never regenerate an asset whose inputs are unchanged.** That single rule is the strongest cost
control in this document — stronger than any budget cap, because it prevents the spend instead of
stopping after it. If 02's store is content-addressed, the cache is free; if it is not, ask for
`findByInputHash` in the handoff file and say why.

### G3 — images

`grok-imagine-image` at $0.02 is the default; `grok-imagine-image-quality` at $0.05 is opt-in and
must be a visible choice, not a silent upgrade, because it is 2.5x. Batch up to 10 per request.
Respect 5 RPS by construction — the token bucket in G1, not a `sleep` at the call site — so a
30-image deck serialises to its ≥6 s floor instead of collecting 429s.

### G4 — video jobs

A video is a job, not a call.

```text
MediaJob { id, projectId, agentId, designDocId?, assetRequestKind,
           model, params, requestId, status: queued|pending|done|failed|expired,
           attempts, submittedAt, lastPolledAt, settledAt,
           assetId?, error?, estimatedCostUsd, actualCostUsd }
```

- persist the job **before** the first poll, so a server restart does not orphan a paid-for video;
- poll with backoff, not the SDK's 100 ms — 100 ms against a 60-second render is 600 pointless
  requests. Start at 2 s, back off to 10 s, give up at 10 minutes and record `expired`;
- handle all four statuses. `expired` and `failed` are not the same thing and one of them means
  you were charged;
- **bound the retries.** A poll loop is a spend loop: a `failed` job that resubmits automatically
  is the $50 mistake this whole cost pillar exists to prevent. Default `maxAttempts: 1`. A retry
  is a user action;
- `invalid_argument` includes moderation blocks. Surface the message, do not retry — retrying a
  moderation refusal spends money to be refused again;
- on `done`, `put()` the bytes *then* mark the job settled. Settling before persisting loses assets;
- publish progress as an event so the Agents page can show it — the union member is a handoff
  request (§12), and until it lands the job is still correct, just invisible.

### G5 — voice

TTS over REST for anything under 15,000 characters; the WebSocket only when streaming latency
actually matters, because 50 concurrent sessions per team is a shared, exhaustible resource.
Always request `with_timestamps`. Persist the audio and the timestamp array together — the
timestamps are worth as much as the audio and cost the same to reacquire.

STT is effectively free at this scale ($0.10/hr) and is what makes "record a voice note, get a
deck" possible. `keyterm` takes up to 100 terms — feed it the project's product and company names.

Custom voices: `POST /v1/custom-voices` must not exist as a code path. If someone adds one, it
returns `permission_denied` on every non-Enterprise account, which reads as a bug rather than as a
plan restriction. Refuse it locally with the real reason (GEN-015).

### G6 — the renderers, which are entirely ours

```text
1. structure   Grok text produces deck / document / table JSON against a schema we define (§5.5)
2. validate    reject content that does not match the schema; never render a half-deck
3. fill        image slots -> G3; motion slots -> G4; narration -> G5
4. render      our code, offline, no network call at render time
```

**Documents are the most worked-on of the three.** Slides are PPTX rendering and tables are
spreadsheet rendering; neither is where this product is differentiated. Spend the care on documents
— and remember that a document *asset* is an output, and the design document is 03's interface
(§1.3). They share a word and nothing else.

Canonical form and export, per type:

```text
documents   canonical  Markdown        export  DOCX
slides      canonical  deck JSON + a self-contained HTML preview   export  PPTX
tables      canonical  CSV + table JSON                            export  XLSX
```

Canonical forms are Markdown, HTML and CSV because they are diffable, greppable, and free to
produce with zero new dependencies. The exports are where the dependencies live.

#### The library question, answered as far as the evidence allows

A renderer library is a **new runtime dependency**, and `package.json` is a hot file this worktree
may not edit (§0.3). It is also a §10 stop. So this section is a recommendation plus the exact
check that would confirm it — not an install instruction.

```text
PPTX   pptxgenjs     named in the research file, as an example, alongside `docx`.
                     NOT VERIFIED: version, licence, Bun compatibility, local-image embedding,
                     speaker-notes support.
DOCX   docx          same status — named as an example in the same sentence, nothing more.
                     NOT VERIFIED: the npm package under that exact bare name, licence, Bun.
XLSX   NO CANDIDATE  the research file names no XLSX library anywhere. Do not guess one.
                     Two names are commonly used for this — `exceljs` and SheetJS — and I can
                     confirm neither from the research file, including whether SheetJS is
                     currently distributed on the npm registry at all.
PDF    NOT IN THE FIRST CUT. A PDF exporter is either a headless browser or a second layout
                     engine. Both are heavy. Ask before proposing one.
```

**Say this plainly in your report: the library choice is not verifiable from the research file.**
The research names `pptxgenjs` and `docx` only as illustrations of "a JS library — none of this is
xAI", which is evidence that a library is needed, not evidence that either is the right one.

Before requesting any of them, and in this order:

```bash
# The house habit is to read the source, not to run an install script.
git clone --depth 1 https://github.com/<org>/<repo> /Users/haoming/openui/.refs/<repo>
```

then check, and record each answer in `VERIFICATION.md`:

1. the package exists on npm under that exact name, and its current version;
2. its licence, written down, not assumed;
3. it runs **under Bun on the server** — these libraries are usually dual-target browser/Node and
   the server write path is the one that breaks. Prove it by rendering a one-slide deck to a file
   under `bun` and opening the file;
4. it embeds an image from a **local file or a buffer**. This is non-negotiable: our images are on
   disk because the returned URL has expired (§3.5). A library that can only take a URL is unusable
   here regardless of everything else;
5. for PPTX only: speaker notes, because narration text belongs in the deck it narrates.

Ship CSV before XLSX and Markdown before DOCX. The canonical forms carry most of the value and
clear no gate. An export that is blocked on a dependency decision should not block the type.

#### The renderer is offline, and that is asserted

No renderer may make a network call. Every image it places is a local path from 02's store. This is
checkable and is checked (GEN-010): run the renderer with the transport seam set to a function that
throws, and the render must still produce a file.

### G7 — the workflow asset, and how it is timed

A workflow asset is a list of scenes with a **derived** timeline. Nothing about the timing is
authored.

```text
Scene { id, order, slideId?, narrationText, narrationAssetId?, imageAssetId?,
        videoAssetId?, cues: [{ atCharIndex, action }], startMs, endMs }
```

- `startMs`/`endMs` come from the TTS per-character timestamps: a scene ends at the timestamp of
  the last character of its narration. Nothing is hand-tuned, so a text edit recomputes the whole
  timeline and there is no stale offset to chase;
- a build cue (bullet appears, image wipes in) is anchored to a **character index**, not a
  millisecond. Milliseconds go stale the moment the narration is re-synthesised at a different
  `speed`; a character index does not;
- **Imagine video generates audio by default.** A scene with both a generated clip and narration
  has two soundtracks. The default is to mute the clip's audio when the scene has narration, and
  the default must be written down — silently mixing two voices is the kind of bug nobody reports
  as a bug, they just say the video "feels wrong";
- a clip is 1-15 s (default 8). A scene longer than 15 s needs `/v1/videos/extensions` (2-10 s
  continuations, retained duration capped at 8.7 s, max 720p) or multiple clips, and the cost
  multiplies linearly with every second;
- **generate in cost-descending, volatility-ascending order**: submit video jobs first because they
  are the longest pole, generate images while they run, synthesise narration last because it is the
  cheapest thing to redo ($0.015 per 1,000 characters against $0.64 for an 8-second clip) and the
  most likely to be edited.

Worked example, so the arithmetic is on the page:

```text
60-second workflow asset, grok-imagine-video-1.5, 8 clips x 8 s   8 x 8 x $0.080 = $5.120
one quality source image per clip                                 8 x $0.05      = $0.400
                                                    media alone   subtotal       = $5.520
900 characters of narration                                       0.0009 x $15   = $0.014
                                                                  total          ≈ $5.53
one text turn, for comparison                                                      ~$0.005
```

Three orders of magnitude. One careless retry loop is a $50 mistake. This is why cost is a pillar
and not decoration, and why a forecast is produced **before** the first media call (GEN-013).

### G8 — exposure

MCP tools, registered through one exported function the MCP owner calls:

```text
generate_image · edit_image · generate_video · check_video_job · narrate · transcribe
draft_deck · draft_document · draft_table · render_asset · compose_workflow · forecast_cost
```

Every one of them takes the `{projectId, agentId}` already bound at server construction and never as
a parameter (`server/services/projectMcpServer.ts:13-19`), plus `areaId` once 01 adds it. None of
them blocks on a long-running job (§1.4). None of them approves a spend: never add anything to
`DELIBERATELY_USER_ONLY`'s neighbourhood on the agent side — approving a spend is a user action
(`server/services/projectMcpServer.ts:696-704`).

**Capability gating lives here.** Agent capability is chosen at agent creation — base Grok, +images,
+voice, +voice+images — and it decides which api.x.ai endpoints that agent may reach. An agent whose
capability is base Grok must not have `generate_image`, `generate_video` or `narrate` registered at
all. Not disabled, not refused at call time — **not registered**, so the agent never learns the tool
exists and cannot argue for it. Capability is a budget control: a base-Grok agent must be
structurally incapable of running up a media bill.

Note what this does *not* protect. Boundaries are enforced nowhere at write time today: isolation is
a cwd handed to the agent, `assertAgentCanWrite` (`server/services/repository.ts:261`) and the whole
of `server/services/approvals.ts` have zero production callers, and
`server/hooks/shellSafetyHook.ts` exists but is not installed by this repository as a hook and only
classifies shell commands. Git worktrees made stray edits
recoverable, never prevented. Capability gating at registration is a *spend* control, not a
filesystem boundary; 01 owns the boundary and it needs a PreToolUse hook that canonicalises every
path argument and calls `process.exit(2)` — a deny in stdout JSON is ignored under
`--always-approve` — or structured MCP-mediated writes carrying `{projectId, agentId, areaId}`. Do
not let anyone read your capability gate as the boundary. Say so in the module comment.

### 6.1 The cost event every generated artifact must emit

```text
CostEvent {
  id, at,
  projectId, areaId, agentId, taskId, designDocId?, assetId?,
  operation:    image_generate | image_edit | video_generate | video_extend |
                tts | stt | realtime | structure_turn,
  provider:     "xai",
  modelId:      "grok-imagine-video-1.5",
  units:        { kind: "images" | "video_seconds" | "characters" | "audio_minutes" | "tokens",
                  count: 8 },
  unitRateUsd:  0.080,
  costUsd:      0.640,
  source:       "ticks" | "unit_rate" | "token_estimate",
  exact:        true | false,
  rateKey:      "grok-imagine-video-1.5" | null,
  assetIds:     ["asset_…"],
  requestId:    "…",          // video jobs, so a charge traces back to its job
  jobId:        "…"
}
```

06 stores these; you produce them; the shape is agreed here because this is where they are born.
Three points that matter more than the field list:

**Media cost is exact where model cost can only be estimated.** A text turn gives you tokens and a
list price that drifts, so `estimateCost` marks every figure `estimated: true`
(`server/services/usageAccounting.ts:37-44`). An image is $0.02. A second of video is $0.080. A
character of speech is $0.000015. Those are per-unit prices and we count the units ourselves, so
`source: "unit_rate"` is exact by construction. `source: "ticks"` is better still — it is what xAI
billed. `source: "token_estimate"` is the only one that carries `exact: false`. The UI must show
the difference; "$5.53" and "about $5.53" are different claims, and the product that says which is
which is more trustworthy than the one that rounds them together.

**When both prices are available, record both and compare them.** Image and video responses carry
`cost_in_usd_ticks` *and* have a published per-unit price. They should agree. If they disagree,
either the published price changed or our unit count is wrong, and both are things you want to find
out from an assertion rather than from a bill. Make the comparison a warning-level log with both
numbers in it, not a silent preference for one.

**Never render an inexact figure as an exact one.** `rateKey: null` today means "we do not know the
price of this model" and is surfaced nowhere, so the shipping product shows $0.00 and a user reads
it as "cheap" (§3.11). Emit `rateKey` and `exact` on every event and require the UI to carry them.
An absent field is omitted, never defaulted to something plausible.

**Per-tool-call attribution is structurally impossible for the ACP text path** — ACP returns one
usage object per turn (`server/services/acpClient.ts:434-478`). Per-task cost is tracked. Your
media events are per-call and therefore *better* than the text path, which is exactly why they must
not be averaged into it.

---

## 7. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Confirm you are on `pivot/generation`. Confirm G0 is open.
3. Run `bun run verify`. If red, fix that and stop.
4. Pick the highest stage in the §6 table that is not passing, and within it the lowest-numbered
   GEN item in §8 that is not PASS.
5. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
6. Implement the smallest change that satisfies the requirement, inside your row of the partition.
7. Write tests that would fail without the change. Default to the recorded-fixture path; mark any
   live test explicitly and gate it behind an env flag, because a live test spends money.
8. Run `bun run verify` again. It must be green before you record anything.
9. Record evidence in `VERIFICATION.md`, including the raw response body for anything §5 marks
   unverified.
10. Append anything you need from another worktree to your handoff file. Do not
    edit their files.
11. Report honestly, including what did *not* move and what it cost.

---

## 8. What counts as done

Each item has an id, a required result of observable clauses, and an evidence block containing the
command that proves it plus the labelled fields to fill in `VERIFICATION.md`. A partially-satisfied
item is NOT TESTED, not PASS; say which clause failed and hold the item.

#### GEN-000: The pages were green before this branch merged

Required result:

* 01, 02 and 03 are merged into the base this branch built on;
* `bun run verify` was green on that base before any generation code was written;
* no file outside the §0.1 list is modified on this branch.

```bash
git log --oneline --first-parent | head -20
git diff --name-only $(git merge-base HEAD main) HEAD
bun run verify > /tmp/gen-gate.txt 2>&1; echo $?
```

```text
Page merges present:
Files touched outside the partition:   (must be empty)
Verify on base:
```

#### GEN-001: The credential path is correct and silent

Required result:

* the key is read from the environment only, never from a tracked file;
* a missing key produces a named error before any request is sent;
* the key appears in no log line, event, error message or persisted record;
* the media credential and the `grok` CLI credential are reported separately in setup status.

```bash
grep -rn "XAI_API_KEY" server/ | grep -v "process.env"
grep -rn "${XAI_API_KEY:0:8}" ~/.openui-data server/ 2>/dev/null   # expect no hits
```

```text
Key absent, error text:
Key present, first call status:
grep of logs and data dir for the key prefix:
```

#### GEN-002: The HTTP client is reachable from the running server

Required result:

* the module is imported from a mounted route, not only from a test;
* `bun run audit` reports zero orphans with the new modules present;
* the request timeout is per-endpoint and asserted.

```bash
bun run audit
grep -rn "xai/client" server/routes/generation.ts
```

```text
Route that imports it:
Audit output:
Timeout asserted for image generation:
```

#### GEN-003: An image is generated and priced

Required result:

* a request to `/v1/images/generations` returns `data[0]`;
* the response's `cost_in_usd_ticks` divided by 10^10 equals the published per-image price;
* one cost event is emitted with `units.kind = "images"`, `source`, `exact` and `rateKey` set.

```bash
XAI_LIVE=1 bun test server/services/xai/images.test.ts    # spends $0.02 — §10 approval first
```

```text
Model used:
Ticks returned:            Derived USD:
Published price:           Agreement:
Cost event:
```

#### GEN-004: A generated asset survives its URL

Required result:

* `put()` resolves before the operation reports success;
* the record stores a local reference, not the returned URL;
* the asset is still readable after the returned URL stops resolving;
* a zero-byte or `text/html` body is rejected as an error, not stored as an image;
* with no asset sink wired, generation fails closed rather than dropping bytes.

```bash
bun test server/services/xai/images.test.ts -t "fails closed"
curl -s -o /dev/null -w "%{http_code}" "<returned url>"    # later: expect a non-200
```

```text
Local reference:           Bytes:              sha256:
Returned URL status at t+N:
Asset readable at t+N:
Rejection case:            No-sink case:
```

#### GEN-005: A video job runs as a job

Required result:

* the job is persisted before the first poll;
* `pending`, `done`, `failed` and `expired` are each handled and distinguishable;
* polling backs off rather than hammering at 100 ms;
* the job survives a server restart mid-flight;
* the submitting MCP tool returns before the job completes.

```bash
bun test server/services/xai/mediaJobs.test.ts
```

```text
request_id:
Status transitions observed:
Poll count and interval:
Restart test:
Tool return latency vs job duration:
```

#### GEN-006: Video is persisted and priced per second

Required result:

* the MP4 reaches the asset store on `done`, before the job is settled;
* the cost event carries `units.kind = "video_seconds"` and the requested duration;
* `costUsd` equals duration x published rate, and agrees with `cost_in_usd_ticks`.

```bash
XAI_LIVE=1 bun test server/services/xai/video.test.ts -t "1 second"   # ~$0.05-0.08 — §10 first
```

```text
Duration requested:        Model:
Ticks:                     Unit-rate derivation:
Agreement:
Asset reference and bytes:
```

#### GEN-007: Narration is synthesised with per-character timings

Required result:

* `with_timestamps` is requested on every synthesis, with no call site able to omit it;
* the timestamp array is persisted alongside the audio;
* character count x $15/1M equals the recorded cost;
* whether the response carried `cost_in_usd_ticks` is recorded either way.

```bash
grep -rn "with_timestamps" server/services/xai/speech.ts
```

```text
Characters:                Derived USD:
Timestamps present:        Count:
Ticks present in response:
```

#### GEN-008: Timing is derived, not authored

Required result:

* each scene's `startMs`/`endMs` is computed from the narration timestamps;
* build cues are stored as character indices, not milliseconds;
* editing the narration text and re-synthesising changes the timeline with no manual step;
* changing `speed` does not invalidate any cue.

```bash
bun test server/services/render/timeline.test.ts
grep -rn "atMs\|offsetMs" server/services/render/timeline.ts   # expect no authored millisecond cue
```

```text
Scene boundaries before edit:
Scene boundaries after edit:
Cue representation:
Speed change result:
```

#### GEN-009: Slide content is generated as structured JSON and validated

Required result:

* deck JSON is produced by a chat-API call against a declared schema;
* invalid content is refused, not rendered;
* the repair loop is bounded, and the bound's reason is in the code;
* the structure call emits a cost event with `source: "ticks"`.

```bash
bun test server/services/xai/structure.test.ts
```

```text
Schema route used (documented parameter / prompt-and-validate):
Rejection case:
Repair attempts allowed:
Cost event source:
```

#### GEN-010: The deck is rendered by us, and no Grok deck surface is reachable

Required result:

* the renderer produces a `.pptx` with the transport seam throwing on any network call;
* every image slot resolves to a local asset;
* no code, comment, prompt or config references an xAI slide/document endpoint, the PowerPoint
  add-in, or grok.com automation.

```bash
grep -rniE "slides/generations|documents/generations|grok for powerpoint|office add-?in|grok\.com" server/ client/src
bun test server/services/render/deck.test.ts -t "offline"
```

```text
Grep result:               (must be empty)
Network calls during render:
Rendered output path:      Opens:
Image slots resolved:
```

#### GEN-011: A document asset renders, and is never a design document

Required result:

* document JSON renders to Markdown as the canonical form;
* the export target produces a file that opens;
* no code in this worktree writes to a design document or imports 03's modules;
* a document asset lands in the Assets page like every other asset.

```bash
grep -rn "designDoc\|presence" server/services/render server/services/xai   # read-only ids at most
bun test server/services/render/document.test.ts
```

```text
Markdown path:
Export path and format:
Design-document write attempts:   (must be zero)
```

#### GEN-012: A table asset renders

Required result:

* table JSON renders to CSV with no new dependency;
* the XLSX export either passes the §7 dependency gate or is explicitly deferred with the reason
  recorded;
* a cell containing a comma, a quote and a newline survives a CSV round trip.

```bash
bun test server/services/render/table.test.ts
```

```text
CSV path:                  Round-trip case:
XLSX status:               Library, licence, Bun check:
```

#### GEN-013: A workflow asset composes and is forecast before it is spent

Required result:

* slides, narration and clips compose into one timeline with a total duration;
* a cost forecast is produced *before* the first media call;
* the actual total is recorded after, and the two are shown together;
* clip audio is muted when the scene has narration, by a written default.

```bash
bun test server/services/render/timeline.test.ts -t "forecast precedes spend"
```

```text
Scenes:                    Total duration:
Forecast USD:              Actual USD:       Delta:
Audio policy applied:
```

#### GEN-014: Every generated artifact emits a cost event

Required result:

* one event per billable call, with every field in §6.1 populated or explicitly absent;
* `source` distinguishes `ticks`, `unit_rate` and `token_estimate`;
* `exact` is true for media and false for token estimates;
* where both ticks and a unit rate exist, both are recorded and compared;
* the structure-generation turn is included, not only the media calls.

```bash
bun test server/services/xai --coverage 2>&1 | grep -i cost
```

```text
Operations covered:
Sample event:
Disagreement check output:
```

#### GEN-015: Custom voice cloning is refused with the real reason

Required result:

* no code path calls `POST /v1/custom-voices`;
* an attempt is refused locally with a message naming the Enterprise-plan restriction and the
  US-excluding-Illinois availability;
* the product offers built-in voices only, listed from `GET /v1/tts/voices`.

```bash
grep -rn "custom-voices" server/     # expect only the refusal message
```

```text
Grep for custom-voices:
Refusal message:
Voices listed:
```

#### GEN-016: Rate limits are respected by construction

Required result:

* image calls are limited to 5 RPS and video to 10 RPS inside the client, not at call sites;
* a 30-image request serialises rather than producing 429s;
* a 429 that does arrive is retried once with backoff and recorded.

```bash
bun test server/services/xai/client.test.ts -t "rate limit"
```

```text
Limiter location:
30-image run: duration, 429 count:
429 handling:
```

#### GEN-017: Nothing secret leaves the machine in a prompt

Required result:

* `assertNoSecrets` runs on every outbound prompt and every narration text;
* a prompt containing a key pattern is refused with the location named;
* the refusal happens before the HTTP call, not after.

```bash
grep -rn "assertNoSecrets" server/services/xai
bun test server/services/xai/client.test.ts -t "secret"
```

```text
Refusal case:
Call made:  yes/no
```

#### GEN-018: Media generation is capability-gated

Required result:

* an agent with base-Grok capability has no media tool registered at all;
* the tool list an agent receives differs by capability, verified at the MCP layer;
* a media call attributable to a base-Grok agent is impossible, not merely refused;
* the module comment states that this is a spend control and not a filesystem boundary.

```bash
bun test server/services/xai/tools.test.ts -t "capability"
```

```text
Base agent tool list:
Imagine agent tool list:
Attempted call result:
```

#### GEN-019: No renderer dependency was added without the gate

Required result:

* `package.json` is unmodified on this branch;
* every proposed renderer dependency is recorded with name, version, licence, a Bun render proof
  and a local-image-embedding proof;
* the request appears in the handoff file, not in a commit to `package.json`.

```bash
git diff --name-only $(git merge-base HEAD main) HEAD -- package.json    # must be empty
```

```text
package.json diff:         (must be empty)
Libraries proposed:
Licence / Bun / local-image evidence:
```

---

## 9. Evidence standards

An item is PASS only when every clause is satisfied and each is backed by a command someone else
could re-run.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

Carried from `loopdesign.md` §5, each with a real incident behind it there:

- **Verify through the production code path**, not a throwaway probe. A `curl` proves the endpoint
  works; only the service proves the product works.
- **A passing test proves a unit works, not that anything calls it.** Three items were once marked
  PASS on evidence that was real but unreachable.
- **A suspiciously clean result is a bug in the check.** An audit returning all zeros was a broken
  shell variable. Here the equivalent is a $0.00 media cost — which is exactly what today's rate
  table produces for every Grok model (`server/services/usageAccounting.ts:31-35`).
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module` is
  silently inert in the full suite. In this area that failure mode is billable, not just slow.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible.
- **Adding a check can invalidate an earlier PASS.** Re-run the whole gate every iteration.

New to this area. These are **predictions from the API contract, not scars** — labelled as such, so
the first recurrence can confirm or refute each one, and so the next agent knows which rules have
been paid for:

- **A generated asset you have not persisted does not exist.** Assert the stored bytes, never the
  response body. The URL in the response is already dying.
- **A poll loop is a spend loop.** Every retry path in this document has a bound and a written
  reason for that bound. An unbounded retry on `failed` is the $50 mistake.
- **A cost figure with no unit count is not checkable.** Record units, unit rate and source
  alongside every dollar amount, or nobody — including you — can tell whether it is right.
- **Two prices that should agree must be compared, not chosen between.** Ticks and unit rate are
  independent derivations of the same charge. A silent preference for one throws away a free check.
- **Never assert on what the model drew, or wrote.** Image content is not a stable interface, any
  more than prose is (`loopdesign.md:163-169`). Assert the envelope: status, mime type, byte length,
  schema validity, cost event, asset reference.
- **Test the failure path.** `expired`, `failed`, a moderation block arriving as `invalid_argument`,
  a 429, a truncated download, an error page served with a 200, a schema the model would not obey.
  Each has a different correct response and at most one of them is "retry".
- **A render that needed the network was never a render.** Prove it offline or the offline claim is
  a hope.

---

## 10. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop.

- **the three pages are not merged and green** — G0 is the owner's ordering, not a suggestion;
- **there is no `XAI_API_KEY`** — an action needs credentials that were not provided, and this one
  blocks every live item in this document;
- **a call would spend money for the first time**, including the §2.2 calibration probe. Spending
  is an irreversible outward-facing operation;
- **a generation request would exceed the remaining budget** for its agent, task or project;
- **a renderer needs a new runtime dependency** in `package.json` — a hot file, and a decision the
  owner makes;
- **an endpoint returns `permission_denied`** — that is a plan or tier restriction, not a bug, and
  guessing at a workaround wastes the iteration;
- **something this document marks unverified turns out to differ** — the `-preview` video model,
  ticks on the voice endpoints, the structured-output parameter name, a server-callable deck
  endpoint. Record what you found and stop before building on the new answer;
- **the workflow asset type means agent control logic rather than a composed sequence** (§3.4);
- **a change would fall outside the partition in §0.1.** Say what you need, from which file, and
  why, in the handoff file.

---

## 11. Definition of done

Every item GEN-000…GEN-019 PASS with recorded evidence, no item NOT TESTED, `bun run verify` green,
`package.json` untouched, and one rehearsal of the canonical demo's generation half recorded in
`VERIFICATION.md`:

```text
A project of type "sales presentation" produces: a deck whose images were generated by
grok-imagine-image and whose .pptx was rendered by our own code with no network call; a
workflow asset whose scene timings were derived from per-character TTS timestamps; and a
cost report in which every media line is `exact: true` with its unit count, its unit rate
and its source, and every text line is honestly labelled. Every asset resolves from the
Assets page with no live api.x.ai URL anywhere in the deck.
```

GEN-015 passes as a refusal, not a feature; that is the correct outcome and must be recorded as
such rather than left BLOCKED.

Only then output `The generation engine is complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not
yet passing.

---

## 12. Reconciliation — what this worktree hands back

```text
branch    pivot/generation
handoff   loops/handoff/pivot-generation.md
merges    fourth wave: after 07-shell, after 01/02/03, alongside 05 and 06
```

### 12.1 The public contract this worktree adds

```text
modules   server/services/xai/**        client, images, video, mediaJobs, speech, structure, tools
          server/services/render/**     deck, document, table, timeline
          server/routes/generation.ts

seams     registerGenerationTools(server, ctx)   for projectMcpServer.ts
          generationRoutes                        for the api.ts mount
          setCostSink(sink)                       06 wires the ledger
          setAssetSink(sink)                      02 wires the store; fails closed until it does
          setXaiTransport(fn)                     tests only, never production

types     MediaJob, CostEvent, XaiError, DeckSpec, DocumentSpec, TableSpec, WorkflowSpec
          exported from server/services/xai/types.ts and server/services/render/types.ts,
          NOT from server/types/*.ts, which is hot

mcp tools generate_image · edit_image · generate_video · check_video_job · narrate · transcribe
          draft_deck · draft_document · draft_table · render_asset · compose_workflow
          forecast_cost
          — none blocking, all capability-gated at registration

http      POST /api/generation/images        GET  /api/generation/jobs/:id
          POST /api/generation/videos        POST /api/generation/render
          POST /api/generation/narrate       POST /api/generation/forecast
```

### 12.2 The requests in the handoff file

Write each of these with the exact signature, not a description:

```text
server/services/projectMcpServer.ts   one call to registerGenerationTools(server, ctx), placed
                                      where the other tool groups register. State the ctx fields
                                      needed: projectId, agentId, areaId, capability.

server/routes/api.ts                  one line: apiRoutes.route("/generation", generationRoutes)

server/services/controlRoomEvents.ts  three union members:
                                        { type: "media_job"; jobId; agentId; status;
                                          kind: "video"; progressNote? }
                                        { type: "asset_created"; assetId; agentId; kind }
                                        { type: "generation_cost"; costEventId; agentId;
                                          costUsd; exact }

package.json                          the renderer dependencies, once §7's checks are recorded —
                                      name, version, licence, Bun proof, local-image proof. If the
                                      checks are not done, request nothing.
```

### 12.3 What was assumed about other worktrees

State each of these in the handoff file, whether or not it turned out to be true:

```text
02-assets       that the asset store exposes put() and findByInputHash() as in G2, and that it
                is content-addressed. If it is not, the regeneration cache — the strongest cost
                control in this document — does not exist and 02 must be told why it matters.

06-tools-cost   that the ledger accepts the §6.1 CostEvent unchanged, including `units`,
                `unitRateUsd`, `source` and `exact`. `ModelRate`
                (`server/services/usageAccounting.ts:18-25`) cannot express $/image, so a
                unit-aware rate row is 06's work, not a per-million-token approximation.

01-agents       that `capability` lives on the agent record and is readable at MCP-server
                construction, and that `areaId` reaches the MCP context. Without the first, tool
                registration cannot be gated and the primary spend control does not exist.

03-design-docs  that `designDocId` is supplied by the caller when work is declared from a design
                document, and is never inferred. One project may follow multiple documents, so a
                project id does not identify one.

05-software     that software generation makes no api.x.ai media call and shares none of this
                engine. If it needs images for a generated site, it calls the same MCP tools
                through the same capability gate rather than opening a second client.

07-shell        that nothing in the shell imports from server/services/xai or
                server/services/render directly; the route surface is the only entry point.
```
