# Handoff — pivot/frontend

The structural rebuild of the four pages against `design/mockups/`. This worktree owns
`client/src/control-room/{agents,assets,designdoc,users,shell}/**`, `client/src/index.css` and
`client/tailwind.config.js`, and edits nothing under `server/`.

Append; do not rewrite. Each entry names a **mockup field with no endpoint behind it**, which is
therefore drawn nowhere — the shape is built and typed so the field renders the moment the record
carries it, and nothing is defaulted in the meantime.

---

## What was deleted, and what replaced it

Four mock modules shipped in this directory. Each made a page look inhabited on a machine where
nothing was running, which is the failure the whole job exists to correct: a page that looks
populated and is not hides the fact that nothing is wired.

```text
DELETED  designdoc/mockPresence.ts   four invented agents with invented line ranges, ages and
                                     activities — the centrepiece of the product's centre
REPLACED presence.ts:reportsFromAgents() derives presence from `AgentActivity.latestFile` and the
                                     document's own path. Real, and honest about having no range.

DELETED  assets/mockAssets.ts        MOCK_ASSETS — four invented deliverables with invented costs
                                     and invented provenance. `GET /api/assets` had been wired for
                                     some time and `usingMockData` was permanently false; the fake
                                     shelf and the banner that would have announced it both stayed.
REPLACED assets/types.ts             its shapes, which were real, under names that do not say Mock.

DELETED  users/mockUsers.ts          Dana, Marco, Priya and Tom — plausible names and .example
                                     addresses, on the one page whose entire subject is identity.
REPLACED usersStore.ts:THIS_MACHINE  one row, and it is not a fixture: nobody signs in and there
                                     must always be one owner, so the person looking at the screen
                                     IS the owner. It has no name and does not invent one.

NOT SHIPPED  agents/**               the AGENTS rebuild introduced no fixture at any point. The
                                     mockup's five agents and three areas exist only in test files.
```

---

## AGENTS (iteration 1)

### 1 — capability — **LANDED, no longer blocked**

```text
FIELD    the card's subtitle, "writer · base Grok" — agents-page.html:94, :110, :140, :156, :182
WAS      NOT SERVED. `CodingAgent` carried no capability set.
NOW      `server/types/agent.ts:121` has `capabilities?: { images: boolean; voice: boolean }`,
         landed on grok-control-room while this page was being built (2b2eca4).
EFFECT   nothing here changed. `AgentView.capabilities` was already typed optional, the card
         already rendered "role · <label>" when present, and the label already came from
         GET /api/coding-agents/capabilities rather than from a string typed into a component.
         This is the whole claim §1 makes — that a record arriving tomorrow renders as the mockup
         draws it with no further work — actually happening, so it is recorded rather than removed.
```

### 2 — nothing says which lines an agent is working on

```text
FIELD     "in chair_launch_plan · L12–19" — agents-page.html:98, :144
          and "lines 12–19" — design-document.html:59, :167
NEEDED    a line range on the agent's activity, e.g.
          AgentActivity.lines?: { start: number; end: number }
STATUS    NOT SERVED. AgentActivity (server/types/agent.ts) carries `latestFile` and nothing about
          position within it.
WANTED BY two surfaces, which is why it is the highest-value field on this list: the AGENTS card's
          "in <doc> · L12–19", and the DESIGN DOCUMENTS body highlight, which is the product's
          centrepiece and currently draws nothing.
DONE HERE the card prints `in <latestFile>` when the activity has one and omits the whole line when
          it does not — not "L0–0", not "L?". The document body's gutter rule, wash and range
          label are built and tested against hand-made reports; they start drawing the day a
          report carries `lines`.
```

### 3 — "Build the team for me" has no endpoint

```text
CONTROL   agents-page.html:65
NEEDED    something like POST /api/projects/:id/team, seeding a default team into a project that
          already exists
STATUS    NOT SERVED. `seedDefaultTeam` (server/services/agentTeam.ts) is called from exactly one
          place — the project-creation handler, server/routes/projects.ts — so a team can be built
          only at the instant a project is born. There is no way to ask for one afterwards, which
          is the state of every project whose creation passed `seedTeam: false` or whose seeding
          failed (that handler already returns a `teamError` for the latter).
DONE HERE the control is rendered and DISABLED, with a title saying it is not wired and pointing
          here. Deleting it would have hidden the gap; enabling it would have been a dead button.
          "Add one agent by hand" beside it IS wired — POST /api/coding-agents takes projectId,
          name and role, and the form asks for exactly those two fields.
```

### 4 — the mockup's AGENTS inspector is mostly unbacked, and is not built

```text
REGION    agents-page.html:197-222 — the selected agent's identity, a four-way capability picker
          with a per-task price beside each tier, the agent's area as a dropdown, "Spent so far",
          and "Started by <person>".
STATUS    NOT BUILT. §3 lists a rail and a main region for AGENTS and no inspector. Of its five
          blocks:
            - the capability picker can now SHOW a tier (entry 1 landed) but cannot change one:
              there is no PATCH for `capabilities`. GET /api/coding-agents/capabilities already
              publishes the four tiers and their spend notes, so only the write is missing.
            - "Started by Marco Reyes" needs an author on the agent record. There is none, and
              this product has no authentication at all, so a name here would be invented twice.
            - the area dropdown needs `CodingAgent.areaId` to know which area is selected today.
              `assignArea()` exists and writes the relation onto the AREA, so the read is the
              missing half, not the write. `agentsInArea` already reads `areaId` when present.
          "Spent so far" is served (CodingAgent.costUsd) and the card already prints it.
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
themes, contrast ≥ 4.5 on the surface, and ink still reading at 7:1 over the gutter wash. That is a
token-layer change with a real measurement problem in it, so it is scheduled rather than guessed at
during a page rebuild. `board.test.ts` asserts the collision explicitly so it cannot be forgotten.
```

### 6 — the plan gate has no home in the mockup, and was not deleted

```text
The mockup draws a board whose plan was approved long ago, so it shows no "Generate plan" and no
"Approve plan" — but nothing runs at all until a human approves a plan, and those two buttons were
the only callers of POST /plan/generate and POST /plan/approve in the product.

They are kept in a slim strip below the header, rendered ONLY while there is a decision to make.
Once the plan is approved and nothing is in flight, the strip is gone and the header is exactly
what the mockup draws. Launching moved onto the card, where the mockup itself puts it: the idle
card's "Give it work" (agents-page.html:163) is wired to POST /projects/:id/tasks/:taskId/launch
for the task already assigned to that agent, and states the server's own refusal in its title.

If the intended design is that a plan is approved somewhere else entirely, say where and the strip
comes out.
```

### 7 — the page still polls

```text
useAgents refreshes every five seconds. The control-room socket already carries agent_status,
agent_activity, task_status and cost, and subscribing to it is the right end state. The poll is
four lines, cannot silently miss an event type, and is honest about being a placeholder.
```

---

## DESIGN DOCUMENTS (iteration 2)

### 8 — presence has no service, and this is what it would need

```text
FILE      server/services/presence.ts — named in loops/03-design-documents.md §3.8 and absent
NEEDED    a report keyed by (agentId, documentId) carrying: lines {from,to}, reportedAt, the
          document version the claim was made against, and the verb the agent used ("writing",
          "reading"). Written by a `report_document_focus` MCP tool the agent calls; read by
          GET /api/design-docs/:docId/presence.
DONE HERE the client half is complete and tested. `PresenceReport` types all of it;
          `presenceState` resolves live/stale/unknown/ended including the version check;
          `DocumentSurface` draws the gutter rule, the wash and the range label; `PresenceEntry`
          renders the mockup's line in full. `reportsFromAgents` derives what it can today from
          `AgentActivity.latestFile` and the document's path — real entries, no range, so they
          land in `unknown` and the body correctly highlights nothing.
```

### 9 — presence is a view, not a lock, and the tests hold it to that

```text
Recorded because it is the kind of rule that erodes. Nothing on this page is disabled because a
claim went stale: `presenceEntry.test.tsx` asserts that a STALE entry's Open and Pause are both
enabled, and that an UNKNOWN position disables nothing either. The one gate on the entry is Pause,
and its gate is `sessionRunning` — whether there IS a session to pause — which is a session fact
rather than a presence one. A four-minute-old report standing between a person and their own
document is the failure this arrangement exists to prevent.
```

### 10 — the mockup's conversation panel is not built

```text
REGION    design-document.html:210-220 — "CONVERSATION IN THIS DOCUMENT": per-agent message
          bubbles, a "You" turn, and a "Say something to the room…" composer. The mockup's second
          state is the whole page with this panel slid in from the right; its first state is the
          same page with it collapsed to a 46px rail.
STATUS    NOT BUILT, and not in §3's list for this page. The shell already owns region collapse
          and draws that 46px rail (shell/regions.ts, RAIL = 46), so the frame exists. What does
          not exist is a document-scoped conversation: `server/services/messaging.ts` carries
          agent-to-agent messages keyed to a PROJECT, not to a document, and there is no endpoint
          for a human turn addressed to "the room".
```

---

## ASSETS (iteration 3)

### 11 — the chips are a lens, not a sixth type

```text
The mockup's chips are All · Docs · Slides · Video · More…, and the store's types are document ·
slides · table · workflow · software. "Video" is not a type: the mockup's own video card reads
"VIDEO · 60s · WORKFLOW". So ASSET_CHIPS maps chip → types and is the join between the user's
vocabulary and the store's. A test asserts every type stays reachable through some chip, so a
future chip edit cannot make a kind of deliverable unfindable.
```

### 12 — the rail lists at most twelve, and says when it is holding some back

```text
The mockup's rail is search-first and captions itself "Type to search all 212 assets. Nothing is
listed until you ask." ROW_LIMIT is 12 and anything above it prints "N more match. Narrow the
search to see them." A cap that is not said out loud reads as "this is everything".
```

### 13 — a software asset has no single author, and is not given one

```text
AssetRow's one branch is the mockup's own: a software asset prints "software · 24 files" where the
others print their producing agent, because a repository is not a thing one agent wrote in one turn
and naming one would misattribute it. An uploaded asset prints its `origin` for the same reason —
no agent made it, so no agent is named.
```

---

## USERS (iteration 4)

### 14 — there is no user service, and the page now says so with one row instead of four

```text
FILES     server/services/auth.ts, server/routes/users.ts — stages 1 and 2 of loop 08, neither
          written. No GET /api/users, no session, no invite record.
DONE HERE the page seeds `THIS_MACHINE`: one owner, no name, no address, no cap, captioned
          "nobody signs in — this is whoever opened the workspace". That row is a consequence of
          two facts the banner already states, not a fixture.
STILL OUT the mockup's pending-invite row (no invite record, no credential, no delivery), its
          per-person spend bar (no per-user meter — `BudgetSnapshot` has agent, task and project
          scopes and no user scope), and its "WAITING ON APPROVAL … needs Dana or Priya" block
          (the approval queue has no user ids to name). Each is rendered as a stated gap.
```

### 15 — the project cap is now shown, because it is the one figure genuinely served

```text
"BUDGETS TOTAL $X · PROJECT CAP $Y" is the mockup's header and is now the page's. The project cap
comes from GET /api/projects/:id — a number a person wrote down and the store keeps.

What is deliberately NOT done is the mockup's implication: it sets the two totals against each
other to suggest headroom, and this does not, because per-user spend is still unmeasured and a
reader comparing them would conclude something nothing here can support. No budgets set reads
"none set" and no cap reads "not set"; neither reads $0.00.
```

---

## SHELL (iteration 5)

### 16 — the `?` was the last thing missing from the toolbar, and is built

```text
Both wireframes draw ? beside ☾ and neither the control nor a help surface existed. It is now a
popover stating the four things this shell can say without asking anything: the three regions and
that they resize, ⌘T and Esc, the standing area rule, and that identity is not enforced.

The ▾ project switcher §3 also lists was ALREADY BUILT — as a `<select>` reading `?project=`
(shell/useShellData.ts). It is left alone: §3 says fix, do not rebuild, and a second switcher on
component state beside one on the URL would give one fact two sources of truth.
```

---

## One mock left, and it is not this worktree's to delete

```text
FILE   client/src/control-room/software/mockSoftware.ts
WHY    `software/` is outside this worktree's row — the boundary is
       client/src/control-room/{agents,assets,designdoc,users,shell}/**. Named here so the sweep
       reads as deliberate rather than incomplete: three of the four mock datasets under this
       directory are deleted, and this is the fourth, belonging to whoever owns SoftwarePage.
```

---

## What is NOT invented on any of these pages

Stated because a page can only be checked against it. There is no sample area, no sample agent, no
sample asset, no sample document, no invented person and no fixture anywhere under
`client/src/control-room/{agents,assets,designdoc,users,shell}/**` that ships. Every record in the
tests is the mockup's own and lives in a test file.

Money follows one rule in all four places it appears — `AgentCard.Money`, the area column, the
document summary and the asset row: a figure that was never priced renders "unknown", one priced at
nothing renders "—", and neither renders "$0.00".
