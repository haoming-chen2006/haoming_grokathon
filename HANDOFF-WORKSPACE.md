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

**The pages do not look like the mockups.** Palette and fonts match; layout is interpretation.
`design/mockups/` holds the rendered DOM of all four designs, recovered from the bundles'
`__bundler/template` block — read `design/mockups/README.md`. This is the largest open piece.

**Nothing has ever generated an image.** The client, the tools and the capability gate are all
wired and tested with an injected transport. No real call has been made. First one costs $0.02.

**Cost reads `unknown` everywhere.** `usageAccounting.ts` `DEFAULT_RATES` has three OpenAI models
and no Grok model, so every figure is unpriced. Real token counts DO flow (2M tokens recorded), so
this is a rate table, not a plumbing problem.

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

1. **Rebuild the pages against `design/mockups/`.** Structure only — everything starts empty, and
   the test is whether a real record renders correctly, not whether the page looks full. Do not add
   sample data; three mock modules have already been deleted for exactly that.
2. **Make one real image.** Hire an agent with images, call `generate_image`, confirm the asset
   lands with its charge. Everything is wired; nothing has been spent.
3. **Add Grok rates** to `DEFAULT_RATES` so cost stops reading `unknown`.
4. **Swap our boundary code for `--sandbox`, and our capability table for `--tools`** (A-00).
5. **Subscribe to the control-room socket** and drop the poll.
6. **Slide rendering** — pick a Node PPTX library, then build it.

---

## 8. Stop and ask

Credentials that were not provided · an irreversible or outward-facing action (pushing, deleting
tracked files, publishing to X, spending on a live API beyond a single probe) · requirements that
contradict each other · a mockup showing data no endpoint returns.
