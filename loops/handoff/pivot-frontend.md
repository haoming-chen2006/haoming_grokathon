# Handoff — pivot/frontend

The structural rebuild of the four pages against `design/mockups/`. This worktree owns
`client/src/control-room/{agents,assets,designdoc,users,shell}/**`, `client/src/index.css` and
`client/tailwind.config.js`, and edits nothing under `server/`.

Append; do not rewrite. Each entry names a **mockup field with no endpoint behind it**, which is
therefore drawn nowhere — the shape is built and typed so the field renders the moment the record
carries it, and nothing is defaulted in the meantime.

---

## AGENTS (iteration 1)

### 1 — an agent record cannot say what capability it holds

```text
FIELD     the card's subtitle, "writer · base Grok" — design/mockups/agents-page.html:94, :110,
          :140, :156, :182
NEEDED    CodingAgent.capabilities?: { images: boolean; voice: boolean }
STATUS    NOT SERVED. server/types/agent.ts:105-143 has no such field, so every real agent renders
          its role alone. The half that is missing is the half that carries the money: "+images"
          and "+voice" are the difference between a bounded token bill and a per-second video one.
FILED BY  pivot/agents already filed the server half — loops/handoff/pivot-agents.md, hot-file
          request 2. This entry is the client's dependency on it, not a second request.
DONE HERE AgentView.capabilities is declared optional (client/src/control-room/agents/types.ts),
          the card renders "role · <label>" when it is present and "role" when it is not, and the
          LABEL comes from GET /api/coding-agents/capabilities rather than from a string typed into
          a component. The day the field lands, the mockup's subtitle appears with no edit here.
```

### 2 — nothing says which lines an agent is working on

```text
FIELD     "in chair_launch_plan · L12–19" — agents-page.html:98, :144
NEEDED    a line range on the agent's activity, e.g.
          AgentActivity.lines?: { start: number; end: number }
STATUS    NOT SERVED. AgentActivity (server/types/agent.ts:73-88) carries `latestFile` and nothing
          about position within it. The DESIGN DOCUMENTS page needs the same range for its inline
          presence highlight, so this is one field two pages want.
DONE HERE the card prints `in <latestFile>` when the activity has one and omits the whole line when
          it does not. The "· L12–19" half is simply absent — not "L0–0", not "L?".
```

### 3 — "Build the team for me" has no endpoint

```text
CONTROL   agents-page.html:65, and §3's rail list
NEEDED    something like POST /api/projects/:id/team, seeding a default team into a project that
          already exists
STATUS    NOT SERVED. `seedDefaultTeam` (server/services/agentTeam.ts) is called from exactly one
          place — the project-creation handler, server/routes/projects.ts:117 — so a team can be
          built only at the instant a project is born. There is no way to ask for one afterwards,
          which is the state of every project whose creation passed `seedTeam: false` or whose
          seeding failed (that handler already returns a `teamError` for the latter).
DONE HERE the control is rendered and DISABLED, with a title saying it is not wired and pointing
          here. Deleting it would have hidden the gap; enabling it would have been a dead button.
          "Add one agent by hand" beside it IS wired — POST /api/coding-agents takes projectId,
          name and role, and the form asks for exactly those two fields.
```

### 4 — the mockup's AGENTS inspector is mostly unbacked, and is not built

```text
REGION    agents-page.html:197-222 — an inspector holding: the selected agent's identity, a
          four-way capability picker with a per-task price beside each tier, the agent's area as a
          dropdown, "Spent so far", and "Started by <person>".
STATUS    NOT BUILT. §3 of this job's brief lists a rail and a main region for AGENTS and no
          inspector, and three of its five blocks have nothing behind them:
            - the capability picker needs entry 1 above to have anything to show as selected, and
              needs a PATCH to change it. GET /api/coding-agents/capabilities already publishes the
              four tiers and their spend notes, so only the record and the write are missing.
            - "Started by Marco Reyes" needs an author on the agent record. There is none, and this
              product has no authentication at all (see the USERS page's own banner), so a name
              here would be invented twice over.
            - the area dropdown needs CodingAgent.areaId (pivot/agents' request 2) to know which
              area is currently selected. `assignArea()` exists on the server and writes the
              relation onto the AREA, so the read is the missing half, not the write.
          "Spent so far" is served today (CodingAgent.costUsd) and the card already prints it.
```

### 5 — six published area hues, eight the server can assign

```text
THIS WORKTREE'S OWN, recorded so it is not mistaken for a server gap.
server/services/workArea.ts assigns one of eight AREA_COLOR_TOKENS; client/src/index.css publishes
six area hues, each measured in both themes by shell/tokens.test.ts. board.ts maps the eight onto
the six, so magenta shares a slot with purple and red shares one with orange.

Survivable, and only because colour is never the signal on its own: every area also prints the
glyph the server issued it (AREA_GLYPHS is eight distinct shapes) and its own name. The proper fix
is two more hues that clear the same measurements — ΔE > 20 from all six existing inks in BOTH
themes, contrast ≥ 4.5 on the surface, and a gutter wash ink still reads at 7:1 over. That is a
token-layer change with a real measurement problem in it, so it is scheduled rather than guessed at
during a page rebuild. `board.test.ts` asserts the collision explicitly so it cannot be forgotten.
```

### 6 — the plan gate has no home in the mockup, and was not deleted

```text
The mockup draws a board whose plan was approved long ago, so it shows no "Generate plan" and no
"Approve plan" — but nothing runs at all until a human approves a plan, and those two buttons were
the only callers of POST /plan/generate and POST /plan/approve in the product.

They are kept in a slim strip below the header that is rendered ONLY while there is a decision to
make. Once the plan is approved and nothing is in flight, the strip is gone and the header is
exactly what the mockup draws. Launching moved onto the card, where the mockup itself puts it: the
idle card's "Give it work" (agents-page.html:163) is wired to
POST /api/projects/:id/tasks/:taskId/launch for the task already assigned to that agent, and states
the server's own refusal in its title when there is one.

If the intended design is that a plan is approved somewhere else entirely, say where and the strip
comes out.
```

### 7 — the page still polls

```text
useAgents refreshes every five seconds. The control-room socket already carries agent_status,
agent_activity, task_status and cost, and subscribing to it is the right end state. The poll is
four lines, cannot silently miss an event type, and is honest about being a placeholder; it is
recorded here rather than left as a surprise.
```

---

## What was NOT invented on this page

Stated because a page can only be checked against it: there is no sample area, no sample agent, no
placeholder card and no fixture anywhere under `client/src/control-room/agents/**` that ships. The
five agents and three areas that appear in the tests are the mockup's own, they live in the test
files, and `agentsPage.test.tsx` asserts that a workspace returning nothing renders no column, no
card and no figure. A cost that was never priced renders "unknown"; one priced at nothing renders
"—"; neither renders "$0.00".
