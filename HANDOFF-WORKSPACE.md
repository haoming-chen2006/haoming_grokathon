# Handoff — grok-workspace

A browser workspace for supervising Grok Build agents that turn a design document into
deliverables. Non-technical audience: sales, marketing, operations. Built as an interface layer on
top of Grok Code, not a fork of anything.

Branch `grok-control-room`. Everything below is on it; there are no open worktrees.

---

## 1. Run it

```bash
cd /Users/haoming/openui
export PATH="$HOME/.bun/bin:$PATH"
set -a && . ./.env && set +a

bun run fresh     # purge everything, rebuild, serve — the usual command
bun run serve     # just serve; reclaims port 6968 from a stale server
bun run reset     # purge but move aside rather than delete (reversible)
```

Then `http://localhost:6968`. Every path is the workspace; `/` resolves to Design Documents.

`.env` is gitignored and holds `xai_api_key`, `OPENAI_API_KEY`, `github_token`, `HF_token`,
supabase keys. **Do not put bare shell commands in it** — sourcing executes them, which cost an
afternoon once.

---

## 2. The two rules that govern everything

**A-00 — drive Grok Build, do not rebuild it.** `grok --help` before building any mechanism.
`--worktree`, `--sandbox`, `--tools`, `--agents`, `--rules`, `--max-turns`, `grok sessions`,
`grok mcp`, `grok trace` already exist. A surface that builds its own must first record which flag
it considered and why it was insufficient. We already reimplemented worktrees and capability
tables before checking. See `grok-workspace.md` §3.3.0.

Two of those are now settled and neither should be relitigated without reading the note first:

- **The area boundary is `--sandbox workspace`**, passed in `acpClient.ts`'s `ACP_ARGS`. Our own
  path comparison is deleted. Seatbelt/Landlock, applied to the whole process, covering `bash` and
  subagents. `GROK_SANDBOX` overrides it; `off` turns the boundary off, deliberately and by name.
- **`--tools` cannot express capability** and the reasons are written into `boundary.ts` with a
  test that fails if they are deleted. It allowlists built-ins, cannot name an MCP tool, and is
  subtractive where A-0 requires addition.

**A-0 — every agent is a real `grok` process over ACP**, retaining grok's whole tool surface.
Never a chat-completion wrapper, never a job runner wearing an agent's name. Capability *adds*
tools; it never subtracts an agent. See §3.3.1.

Proof this holds: sessions the web creates appear in `grok sessions list` and resume with
`grok --resume`. Same store, same ids.

---

## 3. What works, verified live

| | |
|---|---|
| Paste a design document | project, git workspace, requirements, one colour box per declared area |
| The loop | real Planner turn → human approval → launch into a worktree → agent implements, tests, commits, submits |
| Colour boxes | one per area, each with a hue and a glyph, created empty |
| Hire on the box | name an agent, choose capability, it lands in that area |
| Capability gating | base agent gets no media tools; `{images,voice}` gets `generate_image` + `narrate` |
| Media MCP tools | `create_deliverable`, `write_text`, `generate_image`, `narrate`, `list_deliverables` |
| Assets | list, preview PDF/image/video/audio in place, import a file, serve bytes |
| Tools panel (⌘T) | prompts and skills. Skills ARE grok skill directories — one written here works in the terminal |
| Design Documents | rail, document surface, presence entries, declaration parsing |
| Shell | three regions, five pages, dark default, theme toggle, project switcher, error boundaries |

**Gate:** `bun run typecheck` clean · 593 client tests · ~1,070 server tests · build clean.

---

## 4. What does not work

**The pages still do not fully match the mockups**, though the chrome now does. `design/mockups/`
holds the rendered DOM of all four designs — read `design/mockups/README.md`. Done: the toolbar and
the horizontal page strip all four designs draw (the pages used to sit in the navigator, stacking a
global list on top of each page's own), and the AGENTS inspector, which did not exist. Still
interpretation: the assets grid's second column, and the design document's line-range gutter.

**No slide rendering** — see below. Two entries that used to sit here are done:

- *Nothing has ever generated an image* — an image exists. `generate_image` was called over the
  real MCP endpoint by an agent hired with `{images}`: 179 KB of JPEG, 1280×720, `$0.02` recorded
  with `costSource: "billed"`, persisted and served. The base-Grok gate was checked on the same
  server in the same minute: 38 tools, no `generate_image`, no `narrate`.
- *Cost reads `unknown` everywhere* — `DEFAULT_RATES` has held `grok-4.5` for a while; the toolbar
  was passing a literal. `GET /api/projects/:id/spend` sums the token ledger and the media ledger,
  per project and per agent, and the toolbar draws it. Three states, so nothing ever renders
  `$0.00`: `—` for no charges, `unknown` when nothing could be priced, `$x+` for a partial total.

**No slide rendering.** There is no xAI slide API — `Grok for PowerPoint` and grok.com are UI, not
callable. `.pptx` must be rendered by us and nothing does it.

**No authentication at all.** `server/index.ts` says so itself; a request with no headers is the
fully privileged user. The Users page states this rather than implying identity is enforced.

**Agents page polls every 5s** instead of using the control-room socket, which already carries
`agent_status`, `task_status` and `cost`.

**Google Docs / Slides import** — blocked on OAuth credentials from the owner.

---

## 5. Where things are

```text
server/services/
  acpClient, acpSessionManager   grok over ACP (JSON-RPC on stdio)
  projectStore                   projects, documents, requirements, tasks, submissions
  workArea                       the colour boxes; an agent belongs to exactly one
  agentRegistry, agentTeam       agents, roles, budgets, capability
  assetStore                     five types: document, slides, table, workflow, software
  startWork                      a document becomes a project, a workspace and boxes
  designDoc                      the ONE declaration parser; never reimplement it client-side
  xai/{client,images,speech,assets}   api.x.ai, fail-closed until the sink is wired
  generationWiring               the only file importing both the engine and the store
  mcp/media                      the deliverable tools
  projectMcpServer               33 tools handed to every session
server/routes/  projects · agents · assets · design-docs · repository · library · mcp
client/src/control-room/
  shell/    regions, router, contract, pages registry, theme, SlotBoundary
  agents/ assets/ designdoc/ users/ tools/ software/
design/mockups/   the four page designs, as rendered DOM
loops/            the per-surface loop documents
```

---

## 6. Rules this codebase enforces

Each exists because it was violated and cost something.

- **Never fabricate a value.** An absent field is omitted, not defaulted. A price nobody computed
  renders `unknown`; no charges at all renders `—`. Never `$0.00`.
- **Colour is never the only signal.** Every status carries its word. Contrast is measured in
  `shell/tokens.test.ts` — 70 assertions, keep them green.
- **Validate every fetch body.** `as T[]` on a network value threw inside render three times in one
  day and blanked the page. `Array.isArray` before you map.
- **Render slots as elements**, `<Component {...props} />`, never `component(props)`. Calling a
  component puts its hooks on the parent's list and blanks the page on the next switch.
- **A disabled control states why**, in a title.
- **Do not mock a module to keep a live boundary out of a test — export a seam.** `mock.module` is
  process-wide and silently inert when another file imported first; that produced six live `grok`
  children and a suite that never finished.
- **Match a model's words tolerantly.** Roles and statuses come back phrased differently between
  runs; `===` works until it does not.

---

## 7. The next pieces, in order of value

1. **Finish the pages against `design/mockups/`.** Structure only — everything starts empty, and
   the test is whether a real record renders correctly, not whether the page looks full. Do not add
   sample data; three mock modules have already been deleted for exactly that. The chrome and the
   AGENTS inspector are done; the assets grid and the document gutter are not.
2. **Attribute a charge to a person.** Every row belongs to an agent or an asset, so the Users
   page's budget column has nothing to read and says so. It is the last thing between that page and
   a real cap.
3. **Subscribe to the control-room socket** and drop the 5s poll.
4. **Slide rendering** — pick a Node PPTX library, then build it.
5. **Advance `CodingAgent.costUsd` from media charges.** Today `generate_image` writes onto the
   asset only, so an agent's card shows its token spend and the inspector has to sum both ledgers
   through `/spend` to tell the truth. One writer would be better than two readers.

---

## 8. Stop and ask

Credentials that were not provided · an irreversible or outward-facing action (pushing, deleting
tracked files, publishing to X, spending on a live API beyond a single probe) · requirements that
contradict each other · a mockup showing data no endpoint returns.
