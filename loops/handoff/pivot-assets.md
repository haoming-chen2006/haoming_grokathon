# Handoff — pivot/assets

Requests against hot files. Append; do not rewrite.

---

## Iteration 1 — §4.11 stage 1 (AS-001, AS-002)

Built: `server/services/assetStore.ts` and `server/services/assetStore.test.ts`. Nothing else.
Gate green at `bun run verify` exit 0, 949 tests. Evidence is in `VERIFICATION.md` §23.

Nothing was wired into a hot file, and nothing needs to be for stage 1 to hold: the store is
reached only by its own test, which the reachability audit classifies as a test-only helper rather
than an orphan, so the gate stays green without a mount edit. The requests below become necessary
at stages 6, 8 and 9; they are recorded now so reconciliation has the exact shapes.

### R-1 · `server/types/project.ts` — re-export the asset types

**Reason.** `server/types/*.ts` is hot, so the types cannot live there, but every other worktree
that touches an asset will look for them there first.

**Change.** Append:

```ts
export type {
  Asset, AssetFile, AssetVersion, AssetPreview, AssetCharge,
  AssetType, AssetOrigin, AssetCapability, AssetDeclaredBy, AssetWriteLease,
} from "../services/assetStore";
```

**Signature others depend on.** Exactly the shapes in `loops/02-assets.md` §4.1, implemented
verbatim, plus `AssetDeclaredBy` and `AssetWriteLease` as the names for the two inline object types
that section writes anonymously. `ASSET_TYPES` is exported as a `readonly AssetType[]` and is the
single list any validator must check against.

### R-2 · `server/routes/api.ts` — mount the assets router

**Reason.** The router cannot mount itself, and `server/routes/api.ts` is in no worktree's row.

**Change.** One line, beside the existing routes:

```ts
apiRoutes.route("/assets", assetRoutes);   // import { assetRoutes } from "./assets";
```

**Not needed yet.** `server/routes/assets.ts` does not exist as of iteration 1. Do not apply R-2
before it does — the endpoint audit requires every endpoint to have a caller in the same iteration.

### R-3 · `server/services/projectMcpServer.ts` — register the asset tools

**Reason.** Same: the file is in no row, and three worktrees need a line in it.

**Change.** One call in the tool-registration path:

```ts
registerAssetTools(server, ctx);   // import { registerAssetTools } from "./assetTools";
```

**Not needed yet.** Stage 6. Recorded now so the signature is fixed: `registerAssetTools(server,
ctx: ProjectMcpContext): void`, and no tool it registers takes a URL argument or deletes anything.

### R-4 · `server/services/controlRoomEvents.ts` — three additive union members

**Reason.** Three worktrees need members on `ControlRoomEvent`; whoever edits it first makes the
other two conflict.

**Change.** Add, verbatim from `loops/02-assets.md` §4.7:

```ts
| { type: "asset_added";   assetId: string; assetType: AssetType; byAgentId?: string;
    declaredByDesignDocId?: string; costUsd: number | null; costSource: "billed" | "estimated" | "unknown" }
| { type: "asset_changed"; assetId: string; version: number; byAgentId?: string }
| { type: "asset_writing"; assetId: string; agentId: string; expiresAt: string }
```

**Not needed yet.** Stage 8.

### R-5 · client shell — mount the page and fetch the snapshot

`client/src/control-room/ControlRoomApp.tsx` mounts `<AssetsPage/>` from
`client/src/control-room/assets/index.tsx`; `client/src/control-room/useControlRoom.ts` fetches
`/api/assets` on connect and on every reconnect, and handles the three events from R-4.

**Not needed yet.** Stage 9. Nothing under `client/src/control-room/assets/` exists as of
iteration 1.

---

## The public contract, as actually implemented

Only what exists today. Anything not listed here is not yet real, whatever `loops/02-assets.md` §9
promises.

```text
server/services/assetStore.ts

  class AssetStore
    constructor(dir: string)
    assetDir(assetId): string                 the asset's directory; AssetFile.path is relative to it
    filesDir(assetId): string                 where persistFile writes bytes
    createAsset(params): Asset                refuses a type outside ASSET_TYPES before writing
    getAsset(assetId): Asset                  throws AssetNotFoundError
    listAssets(projectId, {type?, q?, includeDeleted?}): Asset[]     derived from disk, no index
    attachFile(assetId, file, {authorId, changeSummary?}): Asset     appends a version
    sweepDeclarations(projectId, designDocId, currentVersion): {assetId, designDocId,
                                              designDocVersion}[]   iteration 2; see R-6

  async persistFile(input: PersistFileInput, store: AssetStore): Promise<AssetFile>
  getAssetStore(): AssetStore                 rooted at $OPENUI_DATA_DIR/assets

  errors: UnknownAssetTypeError, AssetNotFoundError
```

Two departures from §9's sketch, both deliberate, both needed by 04-generation and 05-software:

* **`attachFile` takes a third argument**, `{ authorId, changeSummary? }`. §9 writes it as
  `attachFile(assetId, descriptor)`. Attaching a file appends a version, and a version with no
  author is not provenance. There is no default author — a fabricated one would be indistinguishable
  from a real one.
* **`persistFile` takes the store as its second argument** rather than reaching for the singleton,
  so it can be pointed at a test directory. `persistFile(input, getAssetStore())` is the production
  call.

Not built yet, and named here so nobody assumes otherwise: `recordCharge`, the write lease, secret
scanning on text writes, `expectedVersion` conflict detection, restore, soft delete, the preview,
and every HTTP and MCP surface. The staleness sweep exists as of iteration 2 but has no caller — see
R-6; treat it as unwired, not as working.

---

## Cross-boundary findings — filed, not fixed

### F-1 · The gate is load-sensitive, in two files outside this row

`server/routes/projectReads.test.ts` times out at 5000ms on the tests that launch real `grok`
worktrees, and `server/services/acpClient.test.ts` V-007 fails when a live model does not recall the
number 4242 across a session resume. Both are intermittent and both are load-dependent — seven
worktrees are running agents on this machine at once.

Measured, with this loop's two new files moved out of the tree entirely, so the comparison is not an
opinion:

```text
control run 1, without the new files:  938 pass / 2 fail    the same worktree-launch tests
control run 2, without the new files:  937 pass / 3 fail    the same worktree-launch tests
with the new files:                    945 pass / 4 fail    the same worktree-launch tests
final run, load average 26:            949 pass / 0 fail    green; recorded in VERIFICATION.md
projectReads.test.ts alone:             41 pass / 0 fail
acpClient.test.ts alone, twice:          17 pass / 0 fail each
```

Note also that `projectReads.test.ts` runs third in file order, before this loop's services-level
test file, so a file that runs later cannot be the cause of an earlier timeout.

Neither file is in this worktree's row, so the timeout constant is not this loop's to change. Two
observations for whoever owns them: a 5000ms budget for a test that spawns a real process is thin on
an unloaded machine and wrong on a loaded one, and asserting that a live model recalls a specific
number is a test of the model, not of session persistence.

### F-2 · The partition has no row for `VERIFICATION.md`

`loops/02-assets.md` §5 step 8 instructs this worktree to record evidence in `VERIFICATION.md`, and
§0 says the files listed there are the only ones to edit. `VERIFICATION.md` is not in that list, not
in the hot list, and not in the must-not-touch list — and every one of the eight loop documents
gives its worktree the same instruction. Eight worktrees appending to one file will conflict.

This loop appended a single `# §23 ASSETS` heading at the end of the file and edited no line above
it, which makes the conflict resolvable by concatenation. Reconciliation should confirm that is what
every other worktree did, or split the ledger per surface.

### F-3 · X-3 confirmed: three shared files are in no row and no hot list

`server/services/projectMcpServer.ts`, `server/routes/api.ts` and
`server/services/controlRoomEvents.ts` are in no worktree's row and in no hot list. This loop treats
all three as hot and has edited none of them — R-2, R-3 and R-4 above are the requests. Recorded so
reconciliation knows the omission was deliberate, not an oversight.

### F-4 · `grok --version` reports 1.0.0, not 0.2.118

`loops/02-assets.md` §1 says to expect `grok 0.2.118`. The binary at `./node_modules/.bin/grok`
reports `grok 1.0.0 (3cd0d0cbcebe)`. Not a blocker for this loop — nothing in stage 1 calls it — but
any loop document asserting the version is stale, and 04-generation should not plan against 0.2.118.

---

## Iteration 2 — §4.11 stage 2, store side (AS-003, AS-006 held)

Added `AssetStore.sweepDeclarations()` and ten tests. Both items stay NOT TESTED: their remaining
clauses are about what the page renders, and the page is stage 9. Details in `VERIFICATION.md` §23.

### R-6 · 03-design-docs — call the staleness sweep from the version bump

**Reason.** `sweepDeclarations` has no caller. An asset's `declaredBy.stale` is therefore never set
in production, which makes it exactly the failure `loops/02-assets.md` §6a names: a link declared,
accepted, stored, and populated by nothing — `Requirement.designSection` (`server/types/project.ts`)
after 52 passing checklist items. The mechanism is built and tested; naming its caller is the part
this worktree cannot do.

**Change.** Wherever 03-design-docs commits a new design-document version, after the version is
persisted:

```ts
getAssetStore().sweepDeclarations(projectId, designDocId, newVersion);
```

**Signature.**

```ts
sweepDeclarations(
  projectId: string,
  designDocId: string,
  currentVersion: number,
): { assetId: string; designDocId: string; designDocVersion: number }[]
```

Synchronous, idempotent, and returns only the assets it changed — so the caller can publish an
`asset_changed` event per entry without diffing anything. It sets one boolean. It never re-anchors
`lineStart`/`lineEnd`, never rewrites `designDocVersion`, and never sets `stale` back to false.

**Open question for 03, from `loops/02-assets.md` §9.** This loop assumed staleness is computed by
*pushing* from the version bump. The alternative is this loop *pulling* the current version on read.
Push was chosen because it needs no dependency from 02 onto 03, and the dependency direction
elsewhere is 04 → 02. If 03 would rather emit an event, the sweep is equally callable from a
subscriber and nothing here changes. **Confirm which at reconciliation.**

### A note on a hot file this worktree did not modify

Proving the one-way link required checking that `DesignDocument` has no asset list. The positive
control for that check adds `assetIds: string[]` to `DesignDocument` in `server/types/project.ts`,
which is hot. It was applied to a scratch copy, the test was observed to fail, and the file was
restored; `git status` is clean on that path and the commit does not touch it. Recorded because
"I edited a hot file and put it back" is exactly the claim that should never be silent.

---

## The generated Assets page design — read, compared, not built against

A page design was generated at `assets-page.html` in the main checkout (bundled React, 258 KB; the
markup is in its `__bundler/template` script). Read and compared against `loops/02-assets.md`. The
MAIN region — left rail, centre card grid, right inspector — is this loop's. The title bar and the
Agents/Assets/Design Documents/Users/X/Tools nav are `07-shell`'s and are not rebuilt here.

Its provenance treatment is close to §4.4 and worth keeping: agent chip, capability chip and cost on
the card face, with Made by / Capability / Cost / Declared by / Updated in the inspector. Four facts,
no click. The disagreements below are recorded so they are settled before any of it is built.

### D-1 · An asset and a design document share a name and a row  — §2

The left rail lists `chair_launch_plan` as `document · Scribe · $0.31` — a searchable asset with a
producing agent and a cost. The inspector then renders `overall_sale_doc` as "Declared by →
chair_launch_plan". Either an asset declares work, or design documents are being mixed into asset
search results. Both are §2 violations. This is the confusion §2 exists to prevent, and it appears
in the first design of the page.

### D-2 · Every cost is a bare figure  — §4.5, AS-016

`$0.31 · $1.05 · $0.12 · $4.06 · $5.52`, each rendered with full confidence and no `costSource`,
no `cost unknown`, and nowhere to surface a model that could not be priced. `DEFAULT_RATES`
(`server/services/usageAccounting.ts`) has three OpenAI keys and no Grok model, so built as drawn
this page shows `$0.00` for every Grok asset. The tile needs a cost *and* its source, or the words
`cost unknown` with the model id.

### D-3 · "READ BY — Reel — now" implies presence the store cannot supply  — §4.7

§4.7: the lease "only ever means writing… do not label your lease 'reading'". Reads are point-in-time
`read_asset` calls, not a lease, so there is no honest source for a live read indicator. "Last read
by Reel, 4 min ago", from a recorded tool call, is supportable. "now" is not.

### D-4 · "Declared by" shows a name only  — AS-006

No line range, no version, no staleness. AS-006 requires "declared by lines 40–52 of *Q3 deck
brief*, as of version 7 — the document has since changed". This is the clause held NOT SATISFIED in
iteration 2; the design confirms nothing renders it.

### D-5 · No `preview unavailable` state  — §4.8, AS-011

Every card carries a rich preview. This page ships before three of the five renderers exist, so on
day one most assets are `preview.kind: "none"` with a reason. The design has no visual for the state
that will be true at launch, which is the one state §4.1 says must never be an empty box.

### D-6 · "Feed to an agent"  — §2 rule 1

Sits close to "no action that starts work". Needs defining as *attach as context to an existing
agent's next turn*, not *dispatch*. If it dispatches, it is prohibited.

### D-7 · Smaller ones

```text
capability chips   "BASE + IMAGES + VOICE" invents a fifth value; the four are
                   base | images | voice | voice+images
listing columns    §4.1 asks for word count + last writer (document), narrated y/n (slides),
                   framework (software); the design shows pages, slide count, file count
search-first       "Nothing is listed until you ask" against AS-011's "five types appear on one
                   page, filterable by type"
```

### The three gaps, and what this loop does about each

```text
tables      A DESIGN OMISSION, and a shallow one. Tables are in the design's model already —
            "chair_price_list · table · Ledger · $0.12" is in the left rail. Only the chip row
            omits them, presumably behind "More…". Covered here: the chips become the five types.

workflows   NOT AN OMISSION. The design has answered X-1, and answered it the other way. There is
            no workflow card. Workflow appears only as "MADE BY WORKFLOW · Script → Storyboard →
            Render · loop ran 3 times, goals fixed" — agent control logic describing how the video
            was made — while the filter chip reads "Video", which is not one of the five types.
            Under that reading §7.3 is explicit: a workflow asset becomes a VIEW onto
            promptLibrary's workflows, owned by 06-tools-cost, not a row in this store, and §4.1's
            workflow row changes. §8 lists X-1 as a stop-and-ask. HELD OPEN. Not built either way.
            06-tools-cost should know its workflow store may acquire a reader on the Assets page.

file tree   SCOPE THIS LOOP MUST STILL COVER. Absent from the design entirely, but §4.9 specifies
            both trees and AS-012/AS-013 depend on them. The 320px inspector is full, so the least
            invasive fit is a search ⇄ tree toggle on the left rail rather than a fourth column.
            Raised with 07-shell only if it needs chrome; it does not.
```
