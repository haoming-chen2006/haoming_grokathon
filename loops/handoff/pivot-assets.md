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

Not built yet, and named here so nobody assumes otherwise: `recordCharge`, the write lease, the
`declaredBy` staleness sweep, secret scanning on text writes, `expectedVersion` conflict detection,
restore, soft delete, the preview, and every HTTP and MCP surface.

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
