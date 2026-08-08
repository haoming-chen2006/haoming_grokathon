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

None yet. Iteration 1 (AGENTS-001) needed no hot-file change: the work-area store is the authority
for which area an agent is hired into (`WorkArea.ownerAgentId`), so nothing on `CodingAgent` had to
change to build it.

The requests foreseen by `loops/01-agents.md` §9 — `CodingAgent.areaId` and `.capabilities`,
`DesignSuggestion.targetAreaId`, `ProjectMcpContext.areaId`, the launch route's `NO_AREA` refusal —
will be filed here as the stages that need them land (A-3, A-5, A-6, A-7), each with the signature
other worktrees depend on. Filing them before they are built would state signatures nothing has
exercised.

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

Not caused by this branch: it reproduces with this branch's changes removed, and a different pair of
tests failed in each run. The file is adjacent to `server/routes/projects.ts`, which the partition
assigns to nobody, so raising the timeout or making the launch wait explicit is not this worktree's
edit to make. Recorded rather than worked around.

**Suggested fix for whoever owns it at reconciliation:** these tests await the HTTP launch and then
read the registry; the 5000 ms default is a guess about process-spawn scheduling on an idle machine.
`waitFor` (`server/services/testSupport.ts`) exists for exactly this and is already the house
pattern.
