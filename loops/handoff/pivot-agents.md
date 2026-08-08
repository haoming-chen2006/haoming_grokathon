# Handoff — pivot/agents

Requests against hot files. Append; do not rewrite.

---

## Claims (iteration 1)

**Test files this worktree owns.** Recorded here so a sibling worktree that also wants one finds
out before the merge rather than during it:

```text
server/services/workArea.test.ts        NEW, created iteration 1
server/services/boundary.test.ts        NEW, created iteration 1
server/services/agentTeam.test.ts       existing
server/services/agentRegistry.test.ts   existing
server/routes/agentRoutes.test.ts       existing — iteration 1 appended a "work areas over HTTP"
                                        describe block at the end of the file and one import
                                        (realpathSync) at the top. Nothing else in it was touched,
                                        so a merge conflict here should be resolvable by keeping
                                        both blocks.
client/src/control-room/agents/*.test.tsx   not yet created
```

**Files this worktree treats as hot although the partition assigns them to nobody.** No edit to any
of them has been made or will be made on this branch:

```text
server/services/acpSessionManager.ts   session open, cwd, mcpServers, rules
server/services/projectMcpServer.ts    ProjectMcpContext, the tool set
server/services/controlRoomEvents.ts   the event union on /ws/control-room
server/routes/projects.ts              the launch route (currently :461-526)
```

If another worktree edited any of them directly, the partition has a hole and reconciliation must
arbitrate before merging.

---

## Deletion requests (not edits — this worktree deletes no tracked file)

```text
DELETE client/src/control-room/AgentCanvas.tsx
WHY    the React Flow node graph is dead: its edges are hidden by client/src/index.css
       (.react-flow__edges{display:none}), so it renders a grid with extra steps. The AGENTS board
       replaces it. Not in this worktree's row, so the deletion is a request.
DELETE the persisted drag positions behind it (CodingAgent.position, server/types/agent.ts:139,
       plus PATCH /api/coding-agents/:agentId/position in server/routes/agents.ts)
WHY    a canvas coordinate has no meaning once the canvas is gone. The route IS in this worktree's
       row and will be removed here once 07-shell confirms nothing else calls it; the field is on a
       hot type, so its removal is a request.
```

---

## Hot-file requests

### 1 — `Requirement.designSection` has no update path (filed iteration 2, blocks AGENTS-002)

```text
FILE      server/services/projectStore.ts
CHANGE    add "designSection" to the Pick<> allow-list in updateRequirement's patch type
          (currently: status | ownerAgentId | branch | worktree | affectedFiles | reviewStatus |
           testsPassing | testsTotal | taskIds)
SIGNATURE updateRequirement(
            projectId: string,
            requirementId: string,
            patch: Partial<Pick<Requirement,
              "status" | "ownerAgentId" | "branch" | "worktree" | "affectedFiles" |
              "reviewStatus" | "testsPassing" | "testsTotal" | "taskIds" | "designSection">>,
            actor: Actor,
          ): Requirement
WHY       AGENTS-002 clause 1 — "creating an area sets Requirement.designSection for the
          requirements it covers". loops/01-agents.md A-2 says the field is settable and set by
          nothing, and names area creation as its producer. It is settable only at
          addRequirement (server/services/projectStore.ts, and the body of
          POST /api/projects/:projectId/requirements at server/routes/projects.ts:203).
          Requirements normally exist before areas do — they are imported from the design
          document by parseRequirements (shared/designDocument.ts) — so the producer needs the
          update path, not the create path. Object.assign already writes whatever the patch
          carries; the Pick list is the only thing refusing it.
NOT DONE  server/types/project.ts needs no change: the field is already declared at :79.
CONSUMER  server/services/workArea.ts will call it from createArea() once the field is patchable,
          stamping briefSectionAnchor onto each requirement the area covers. Nothing on this
          branch calls it yet, and no half-built control was added in its place.
```

### 2 — `CodingAgent` still describes a git worktree (filed iteration 3, blocks AGENTS-003)

```text
FILE      server/types/agent.ts
DELETE    CodingAgent.branch    (:122)   — git is gone; nothing may read it
DELETE    CodingAgent.worktree  (:123)
ADD       areaId?: string
ADD       capabilities?: { images: boolean; voice: boolean }
WHY       an agent is hired into exactly one area and holds one capability set. Both are read by
          server/services/workArea.ts and by the AGENTS page.
```

**`areaId` is a mirror, not the authority.** The relation is written today by `assignArea()` in
`server/services/workArea.ts` onto `WorkArea.ownerAgentId`, because one writer of a relation is the
whole point and `CodingAgent` is hot. When the field lands, `assignArea` should set it in the same
call so the record can be read without a join; nothing should ever write it independently.

**Deleting `branch`/`worktree` is not free — two callers pass them today**, and both are outside
this worktree's row:

```text
server/routes/projects.ts:498   registry.assignTask(agent.id, taskId, { branch, worktree: created.path })
                                the launch route; dies with the worktree creation it belongs to (A-5)
server/routes/agents.ts:240     PATCH /api/coding-agents/:agentId/task passes body.branch/body.worktree
                                THIS worktree's file. Removing the pass-through here is a one-line
                                edit that will be made in the same iteration the type change lands,
                                not before — removing it first would leave the launch route setting
                                fields through a route that no longer forwards them.
server/services/agentRegistry.ts:290   assignTask(agentId, taskId, { branch?, worktree? })
                                THIS worktree's file. The opts parameter goes when both callers do.
```

`loops/01-agents.md` A-3 asks for `assignTask` to be renamed `assignArea`. It is not a rename in
practice: task assignment and area assignment are different relations with different lifetimes — an
agent keeps its area across many tasks — so `assignTask` keeps its name and its task, and
`assignArea` is the separate function above. Recorded here because the loop document says otherwise.

### Foreseen, not yet filed

The requests `loops/01-agents.md` §9 anticipates — `CodingAgent.areaId` and `.capabilities`,
`DesignSuggestion.targetAreaId`, `ProjectMcpContext.areaId`, the launch route's `NO_AREA` refusal —
will be filed here as the stages that need them land (A-3, A-5, A-6, A-7), each with the signature
other worktrees depend on. Filing them before they are built would state signatures nothing has
exercised.

---

## Additions to the §9 public contract

`loops/01-agents.md` §9 lists the HTTP surface this worktree hands back. Two routes were added that
the list does not name. Both are on the agents router, both are literal segments registered before
`/:agentId`, and neither needs a mount edit:

```text
GET    /api/coding-agents/areas/coverage?projectId=      which sections of the brief have no area
POST   /api/coding-agents/areas/:areaId/tasks            create a task inside an area; the area's
                                                         milestone is not a parameter
```

`GET /areas/coverage` is registered before `POST /areas/:areaId/tasks` so "coverage" is never read
as an area id.

**Assumption about 03-design-docs.** Coverage reads the brief from
`ProjectStore.getDocument(projectId).content` and parses ATX headings, because that is the only
brief-shaped text that exists today. `loops/01-agents.md` §2 item 11 says a project may follow
several documents, so if 03 ships a section parser or a multi-document brief, `briefSections()` in
`server/services/workArea.ts` should be replaced by it rather than kept alongside it — two parsers
of one document drift, which is the reason `shared/designDocument.ts` exists at all.

---

## Notices to the reconciler

**A test flake under machine load, outside this worktree's row.** Every failure is a 5000 ms
timeout in `server/routes/projectReads.test.ts`, in a test that spawns a real `grok` process through
`POST /api/projects/:projectId/tasks/:taskId/launch`.

```text
observed   iteration 1, 2026-08-08
  bun run verify at the start of the iteration       exit 0 — 940 pass, 0 fail
  bun run verify with this branch's changes          972 pass, 2 fail
    "a second task must not reuse the merged branch of the first" ×2
  the same file with this branch's changes stashed   40 pass, 1 fail
  bun run verify with this branch's changes, again   972 pass, 2 fail
    "launching gives the agent an isolated worktree (§9, V-009)" ×1
    "a second task must not reuse the merged branch of the first" ×1
  machine   load average 43.28 / 61.50 / 45.86, 18 grok and 13 bun processes
            (seven worktrees running at once)
```

Iteration 2, as the machine got busier:

```text
  bun run verify with iteration 2's changes          986 pass, 6 fail — all the same shape
  the same file with every change of this branch
    stashed (four files)                             36 pass, 5 fail
  machine   load average 35.83 / 42.92 / 41.14
```

Not caused by this branch: it reproduces with this branch's changes removed, and a different set of
tests fails on each run — the set grows and shrinks with the load, which is what contention looks
like and what a regression does not. The file is adjacent to `server/routes/projects.ts`, which the
partition assigns to nobody, so raising the timeout or making the launch wait explicit is not this
worktree's edit to make. Recorded rather than worked around.

**Settled, iteration 3.** `bun run verify` ran green — **992 pass, 0 fail, exit 0, 114s** — at load
average 19.28, with nothing changed to make it so. It was contention, not a defect. The suggestion
below still stands as a robustness improvement, but it is no longer blocking anything.

**Suggested fix for whoever owns it at reconciliation:** these tests await the HTTP launch and then
read the registry; the 5000 ms default is a guess about process-spawn scheduling on an idle machine.
`waitFor` (`server/services/testSupport.ts`) exists for exactly this and is already the house
pattern.
