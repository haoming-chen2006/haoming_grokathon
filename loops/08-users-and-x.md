# Users and X — Loop Operating Document

This is the instruction set for one iteration of the Users/X loop. Read this file first, act, then
stop. It is deliberately short; the files it points at hold the detail.

| Document | Role |
|---|---|
| `loops/06-users-and-x.md` | This file. The contract for the USERS page and the optional X page, the build order, and the checklist USR-001…USR-010 and XAP-001…XAP-008. |
| `VERIFICATION.md` | The evidence ledger. Current status of every item, with reproducible proof. |
| `loopdesign.md` | The house form and the evidence standards every loop document inherits. |
| `loops/02-dochub.md` | The deliverable and asset model. Everything an X post publishes comes from there. |
| `loops/03-generation.md` | The generation engine. This worktree calls it and never reimplements it. |

Two surfaces, one theme: **who is allowed to do the thing, and what happens when the thing cannot be
taken back.** The USERS page answers the first. The X page is the only place in grok-workspace where
an action leaves the machine and reaches other people, so it is where the second question stops
being theoretical.

> A post is not a file. It leaves the machine, strangers see it, and deleting it does not unsend it.
> Everything on the X page is designed backwards from that sentence.

**What these surfaces contribute to the canonical demo.** The demo has one agent working against the
user's X account, and it ends with assets landing in the Doc Hub — some of which the user will want
to publish. USERS supplies the named human whose approval gates that publish and whose budget bounds
the roughly \$5.52 of media the experience agent is about to spend. The X page supplies the account
connection the X agent reads from, and the one confirmation dialog that stands between a generated
draft and the user's real followers. Without USERS, "approved by user" is a string literal and the
demo's approval story is a prop. Without the X page, the second agent in the demo has nothing to
work against.

---

## 0. Your boundary

This worktree owns identity, authentication and X integration, and nothing else. The other loop
documents in `loops/` are assigned to other worktrees and are being written and implemented in
parallel.

**Files and directories you own — create, edit, delete freely:**

```text
server/types/user.ts            new — User, Role, CapabilityGrant, Session
server/services/userStore.ts    new — the store; synchronous, atomic, same invariant as projectStore
server/services/sessionAuth.ts  new — password hashing, session tokens, the fail-closed middleware
server/routes/users.ts          new — HTTP surface, mounted at /api/users
server/services/xAccount.ts     new — OAuth connect/disconnect, per-user token records
server/services/xClient.ts      new — the X HTTP client: read, media upload, post
server/routes/x.ts              new — HTTP surface, mounted at /api/x
client/src/users/**             new — the USERS page
client/src/x/**                 new — the optional X page and the publish confirmation
loops/06-users-and-x.md         this file
```

**Files you may read but must not edit.** Each is owned by another worktree; an edit here is a merge
conflict at best and a silent contradiction at worst:

```text
server/services/agentRegistry.ts      agents loop — agent identity, status, per-agent budgets
server/services/usageAccounting.ts    cost loop — rate tables, the ledger you depend on
server/services/acpSessionManager.ts  agents loop — sessions, transcripts, cost recording
server/services/projectMcpServer.ts   agents loop — you request tools, you rename none
server/hooks/**                       boundary loop — PreToolUse interception
client/src/control-room/**            agents loop
client/src/dochub/**                  doc hub loop
```

**Shared files that need a cross-boundary request before you touch them.** Every one of these is a
one-line edit with product-wide consequences, which is exactly why it is not yours to make alone:

```text
server/routes/projects.ts:41-51       actorFrom — the inversion described in §3.2. Every route in
                                      the product changes behaviour the day this lands. Land it in
                                      one commit, with the agents worktree in agreement.
server/routes/mcp.ts:20-31            identity from the URL path — needs the same treatment
server/routes/repository.ts:188-203   merge's approvedBy must come from the session, not the body
server/services/repository.ts:324-336 the ProtectedBranchError message that names the approver
server/services/controlRoomEvents.ts  the event union. You need `scope` to gain `"user"`, which is a
                                      widening of an existing member, not an addition. Ask.
server/services/approvals.ts          dead today, zero production callers. You want it. So might the
                                      boundary worktree. Claim it explicitly before wiring it.
server/routes/api.ts                  the mount lines for /api/users and /api/x — two lines,
                                      coordinate them
```

**How to raise a cross-boundary concern.** Do not edit. File a suggestion — this is the mechanism the
product itself is built on and it already works: `DesignSuggestion` (`server/types/project.ts:95-118`),
the `submit_design_suggestion` MCP tool, and `SuggestionQueue` in
`client/src/control-room/ReviewQueues.tsx`. Outside the running product, say it in your iteration
report with the file, the line and what you believe is wrong, and stop. A worktree that "just fixed"
a file it does not own is the exact failure this whole product exists to prevent.

---

## 1. Before doing anything

```bash
cd /Users/haoming/openui
set -a; . ./.env; set +a
export PATH="$HOME/.bun/bin:$PATH"
```

```bash
./node_modules/.bin/grok --version   # expect: grok 0.2.118
bun run verify                       # expect: exit 0, typechecks, tests, build, four audits
bun run audit                        # expect: 0 orphans, every endpoint covered
```

Capture verify's output to a file, never `>/dev/null`. **A red gate is always the highest-priority
work, ahead of any checklist item** — including a gate you did not turn red. Every endpoint you add
to `server/routes/users.ts` or `server/routes/x.ts` needs a caller in the same iteration or
`bun run audit:endpoints` goes red on you.

Two credentials this loop needs that do not exist on this machine:

```text
XAI_API_KEY   absent. `grok models` reports "You are not authenticated" and ~/.grok/config.toml
              points at api.openai.com. Not this worktree's credential, but the generation engine
              you publish from cannot run without it.
X_CLIENT_ID   absent. No X developer application exists, no OAuth redirect is registered, no access
X_CLIENT_SECRET  tier is subscribed. Nothing on the X page can be evidenced against the live service
              until the owner supplies these. See §7 — this is a stop condition, not a mock.
```

Everything on the X page that does not touch the network is still testable, because §3.14 requires a
dry-run mode. Build the dry run first and the credential blocker stops blocking most of the work.

---

## 2. State as of iteration 0

```text
0 PASS · 0 FAIL · 0 BLOCKED · 18 NOT TESTED
Gate: inherited from the control room — 715 tests across 42 suites, both typechecks, the
      production build, four audits. Nothing in this checklist has been attempted.
```

What exists today, with the line numbers to read before you change anything:

```text
server/index.ts:43                    the CORS allowlist — two localhost origins
server/index.ts:73-76                 "The server exposes repository and agent control with no
                                      authentication". The product says it about itself.
server/routes/projects.ts:28-51       actorFrom — no headers yields {kind:"user", id:"user"}
server/routes/mcp.ts:20-31            projectId and agentId taken from the URL path
server/types/project.ts:42-47         Actor {kind, id, canWriteDocument}
server/services/projectStore.ts:826   submission.reviewedBy = actor.id
server/services/projectStore.ts:903   the same, on the approval path
server/routes/projects.ts:680         plan approvedBy = actor.id
server/routes/repository.ts:188-203   POST /api/repository/merge — approvedBy read from the body
server/services/repository.ts:324-336 mergeAgentBranch refuses without a named approver
server/services/approvals.ts:9-24     RestrictedAction — six actions, including credential_use,
                                      production_deploy, budget_increase
server/services/approvals.ts:36-50    ApprovalRequest, with resolvedBy
server/services/approvals.ts:133,225  ApprovalQueue and getApprovalQueue — zero production callers
server/services/agentRegistry.ts:17-26  BudgetExceededError, scope "agent"|"task"|"project"
server/services/agentRegistry.ts:33-34  BudgetSnapshot — the same three scopes
server/services/agentRegistry.ts:359  agent.costUsd += usage.costUsd ?? 0 — a running total
server/routes/agents.ts:180-217       where budget_warning and budget_exceeded are published
server/services/controlRoomEvents.ts:29-35  the two budget events in the union
server/services/usageAccounting.ts:30-34    DEFAULT_RATES — three keys, no Grok model
server/services/usageAccounting.ts:79       unknown model → costUsd 0, rateKey null
server/services/secrets.ts:15-31      SECRET_PATTERNS, including bearer-token and jwt
server/services/secrets.ts:113        assertNoSecrets — refuses rather than redacts, and why
server/services/projectStore.ts:148-159  the synchronous-mutation invariant. Read this twice.
server/services/projectMcpServer.ts:695-703  DELIBERATELY_USER_ONLY — the precedent for §3.12
```

What exists for X today: **nothing.** No OAuth client, no token store, no HTTP client to any X host,
no dependency that could serve as one. `package.json:49-54` lists four dependencies —
`@modelcontextprotocol/sdk`, `@xai-official/grok`, `bun-pty`, `hono`. The X page is greenfield in
every layer.

Open, and not a checklist failure:

```text
X-A   whether the workspace is ever served to more than one machine. This document assumes local,
      loopback, one workstation, with multi-user meaning several named people sharing that
      workstation or reaching it over an SSH tunnel. Serving it on a network is a different
      product with a TLS story. See §7.
X-B   the cost ledger does not exist yet (cost loop). USR-009 is blocked on it and says so.
X-C   whether the owner wants X posting at all in the first release, given it is the only
      irreversible surface in the product. The page is optional by construction (XAP-008), so
      shipping without it costs nothing.
```

---

## 3. What must be built

# PART ONE — USERS

### 3.1 The honest position: there is no authentication, of any kind

State this before designing anything, because a users page built on top of it is furniture.

The product has no authentication. It is not weak, or partial, or dev-mode. It is absent. The two
things that look like defences are not defences:

- **Binding 127.0.0.1** (`server/index.ts:76`) limits reach, not privilege. Every process on the
  machine reaches it, including anything an agent runs in a shell. And `OPENUI_HOST=0.0.0.0` turns
  that off with an environment variable, which the same comment invites the user to do.
- **The CORS allowlist** (`server/index.ts:43`) is a browser convention. `curl` has never read a
  CORS header in its life.

Then the shape of the hole. `actorFrom` (`server/routes/projects.ts:28-51`) resolves the caller from
two request headers and defaults to `{kind: "user", id: "user"}` when neither is present. Its own
doc comment is honest about the reasoning: headers are trusted only to *narrow* privilege, so an
agent cannot claim to be the user. That is a correct design — for a world where being the user is not
worth having. It means the only way to be less privileged is to volunteer, and an attacker never
volunteers. Sending no headers at all is the maximum-privilege request.

`server/routes/mcp.ts:20-31` takes both `projectId` and `agentId` from the URL path. Within a session
that is a genuine safety property, and the comment explains it well: the agent cannot alter the
identity it was handed. But the URL is not a secret. Anyone who can reach the port can type any
project id and any agent id and be that agent.

The consequence is already visible in the data the product stores:

```text
server/services/projectStore.ts:826   submission.reviewedBy = actor.id   → "user"
server/services/projectStore.ts:903   submission.reviewedBy = actor.id   → "user"
server/routes/projects.ts:680         plan.approvedBy      = actor.id    → "user"
scripts/acceptance/v052.mjs:437       merge approvedBy: "user"           ← a string literal
```

`mergeAgentBranch` (`server/services/repository.ts:324-336`) refuses to merge without a named
approver, and the refusal is real — there is no code path around it. But the name it demands is the
constant `"user"`, supplied by the caller, and the end-to-end acceptance test types it out by hand.
**The gate exists. The identity does not.** That is the single sentence to keep in mind for the whole
of Part One.

**Shipping a users page over this is theatre.** A table of people with roles, where every request is
already the fully privileged user and no request carries a person, is a control that does nothing —
prohibited outright by the quality audit (`verifiables.md` §22.18: no controls that do nothing, no
fabricated status). Do not build the page first. Build §3.2 first, and let the page be the last
stage, as §3.16 orders it.

### 3.2 What must exist underneath, in this order

Four things, and the third is the one that matters.

**(1) A principal.** A `User` record, persisted the way everything else in this product is persisted:
one JSON file, `atomicWriteJson`, and **every mutation on the store synchronous** — read
`server/services/projectStore.ts:148-159` twice before writing `userStore.ts`. The safety comes from
the absence of `await`, not from locking, and the invariant test that protects it fails if the
explanation is deleted.

```text
User {
  id, email, displayName,
  role: "owner" | "approver" | "member",
  capabilities: CapabilityGrant,        // §3.5
  budgetUsd?: number,                   // §3.6
  disabled: boolean,
  createdAt, updatedAt, lastActiveAt?
}
```

**(2) A credential.** `Bun.password.hash` (argon2id) and `Bun.password.verify` are built into the
runtime — no dependency, and adding a crypto dependency to a four-dependency project would be its own
argument. Store the hash, never the password. There is no password-reset email flow in a local
product; the owner resets a member's password from the users page, and that is an audited action.

**(3) A session, and a middleware that fails closed.** This is the pivot point of the whole document.
A session token is minted on sign-in, stored **hashed** (a session table full of live bearer tokens is
a credential store), delivered as an `HttpOnly; SameSite=Strict; Path=/` cookie, carries an explicit
expiry, and is revocable. Then `actorFrom` inverts:

```text
today   no session, no headers  → {kind:"user", id:"user"}, fully privileged
after   no valid session        → 401. Nothing else. No default actor.
```

Everything downstream becomes meaningful the moment that inversion lands, and nothing downstream
means anything until it does. It is one function body; it is also the most consequential single edit
in this checklist, and it belongs to another worktree's file (§0). Request it, land it in one commit,
and expect every route test in the repository to need a session fixture that day. Write that fixture
first, in `server/services/testSupport.ts`'s style, before you ask.

The MCP path (`server/routes/mcp.ts`) needs the equivalent: the URL identifies *which* agent, and a
per-session bearer secret minted at `session/new` and handed to the agent alongside the URL proves it
*is* that agent. Keep the existing property — identity is not a parameter the agent supplies — and add
the proof.

**(4) Only then, the users page.**

### 3.3 The first-run owner, and why there is no login form on a laptop

The target user is a salesperson opening a tool on their own laptop. A login screen in front of a
local application that is already behind the operating system's login is friction with no security
value, and this product's market will not forgive it.

Resolve it without weakening (3):

- On first run, the workspace has no users. The first-run greeting — owned by another worktree; you
  own only the account step inside it — asks for a display name and an email, mints exactly **one**
  `owner`, and issues a long-lived session cookie to that browser immediately. No password is
  required to create it, because at that moment anyone who can reach the port is already the owner by
  physical possession of the machine.
- A password is required from the moment there is a second user, or the moment `OPENUI_HOST` is not a
  loopback address. Both conditions are checkable at startup and the second one must be checked at
  startup, not at sign-in: a workspace that is exposed to a network and has no passwords should refuse
  to start and say why.
- Sign-out is available always, and after it the login form appears. The absence of a login screen is
  a consequence of already being signed in, not a bypass.

The distinction that keeps this honest: **the middleware always requires a session. First run creates
one; it does not skip the check.** There must be no `if (isLocal) return adminActor` anywhere, ever —
that is the same shape as the bug being fixed, and it will be copied.

### 3.4 Roles — three, and no more

The market is non-technical. Three roles, named for what a salesperson would call them, and each is a
superset of the one below:

| Role | May |
|---|---|
| `owner` | everything below; add and remove users; set roles; set budgets; connect and disconnect the X account and the xAI credential; there is exactly one, it cannot be removed, and it cannot be demoted by anyone else |
| `approver` | approve a publish, a merge, a plan, a budget increase and any other restricted action; spend up to their own budget; create projects and agents |
| `member` | create projects; create agents within the capabilities they hold; spend up to their own budget; request approval for anything restricted; approve nothing |

Do not write a permission matrix with a row per endpoint. It will drift from the code within two
iterations and the drift will be silent. Express the rule once, as a function of role and action, and
route every gate through it.

**Nobody approves their own request.** The requester is not eligible to be the approver, and the
approve control is not merely hidden — the server refuses, because a hidden button is not a rule. The
single-user workspace is the interesting case: the owner is alone, and there is no second pair of
eyes to be had. Do not fake one. The confirmation says so in plain words — "you are approving your own
request; there is no second reviewer in this workspace" — and records `selfApproved: true` on the
record. An honest record of a weak approval beats a fabricated strong one.

### 3.5 Capability grants — the cheapest budget control in the product

Capability is chosen at agent creation and decides which tools and which `api.x.ai` endpoints that
agent may call: base Grok, Grok + images, Grok + voice, or Grok + voice + images. The agents loop owns
that choice. This surface owns **which capabilities a given user is allowed to grant.**

That is the real spending control, and it is worth more than any dollar figure, because it is a
boolean and cannot be wrong:

```text
grok-imagine-image          $0.02  / image
grok-imagine-image-quality  $0.05  / image
grok-imagine-video          $0.050 / second
grok-imagine-video-1.5      $0.080 / second
/v1/tts                     $15.00 / 1M characters
/v1/realtime                $0.05–0.08 / minute
a 60-second generated experience ≈ $5.52 in media alone
```

A base-Grok agent cannot produce any of those lines. A member who may not grant the image capability
cannot create an agent that spends \$5.52, regardless of what the meter says, whether the meter works,
or whether a retry loop went wrong. A dollar cap depends on measurement; a capability grant does not.
**Prefer the control that cannot be defeated by a bug in the measurement.**

```text
CapabilityGrant {
  images: boolean,     // /v1/images/*
  video: boolean,      // /v1/videos/*  — the expensive one; separable from images on purpose
  voice: boolean,      // /v1/tts, /v1/stt, /v1/realtime
  publishToX: boolean  // §3.12; owner and approver only by default
}
```

Two rules the server enforces, not the UI:

- a user cannot grant an agent a capability the user does not hold. Not hidden — refused, with the
  missing capability named;
- raising a user's capability is a restricted action. `RestrictedAction` in
  `server/services/approvals.ts:9-24` already has `budget_increase` and `credential_use`; this is the
  same shape and belongs in the same queue.

### 3.6 Per-user budgets — and why they are blocked, not merely unbuilt

Budgets exist today at three scopes — agent (`server/types/agent.ts:134`), task
(`server/types/project.ts:158`), project (`server/types/project.ts:288`) — enforced in
`server/routes/agents.ts:180-217`, which publishes `budget_warning` before the limit and
`budget_exceeded` at it. The machinery is sound. Add `user` as a fourth scope in `BudgetSnapshot` and
in the two event members (`server/services/controlRoomEvents.ts:29-35`), and roll a user's spend up
from the agents they created.

Then stop, because the meter is broken:

- `DEFAULT_RATES` (`server/services/usageAccounting.ts:30-34`) has exactly three keys — `gpt-4o`,
  `gpt-4o-mini`, `gpt-4.1` — and **no Grok model**. An unknown model returns `costUsd: 0` with
  `rateKey: null` (`:79`), and `rateKey: null` is surfaced nowhere in the UI.
- There is no ledger. `agent.costUsd += usage.costUsd ?? 0` (`server/services/agentRegistry.ts:359`)
  is a running total: no time series, no drill-down, no export, and no source data for a chart.
- The input/output/cache token split is computed and thrown away.

**A \$50 cap on a meter that reads \$0.00 never trips.** Building the per-user budget on today's
accounting produces a control that appears to work and silently does not, which is worse than no
control at all, and is precisely the class of defect this repository's evidence standards exist to
catch.

So USR-009 is BLOCKED on the cost loop delivering a ledger with a media rate table, and it says so in
`VERIFICATION.md` rather than being quietly marked PASS against a zero. Until then the users page
shows a spend column that reads **"not measured"** — never `$0.00`. An absent figure is omitted; a
fabricated one is a defect (`verifiables.md` §22.18).

The capability grant of §3.5 is the control that ships in the meantime, and it is the honest one.

### 3.7 The approver comes from the session, never from the request body

`POST /api/repository/merge` (`server/routes/repository.ts:188-203`) reads `approvedBy` from the
request body and hands it to `mergeAgentBranch`, which refuses only if it is absent. The caller names
its own approver. Once sessions exist, that is an escalation with a form field.

The fix, and the rule it generalises to every gate in the product:

- take the approver from the session;
- **reject** a body that also supplies one, with a 400, rather than ignoring it. Ignoring it leaves one
  permission with two sources of truth, which is the exact bug this repository has already fixed twice
  — once for `x-openui-actor-doc-write` in `server/routes/projects.ts:28-51`, once for the same header
  in `server/routes/mcp.ts:24-31`, both with the comment explaining why. Do not reintroduce it a third
  time in a new field;
- apply it to merge today and to publish tomorrow. Merge may not survive the pivot at all — git as the
  completion mechanism is one of the subsystems being replaced — but the rule outlives the endpoint.

And wire `ApprovalQueue`. Do not write a second approval system. `server/services/approvals.ts`
already models exactly what this page needs — `RestrictedAction` with `credential_use`,
`production_deploy`, `budget_increase`, and `ApprovalRequest.resolvedBy` — and has had **zero
production callers** since it was written. Its `resolvedBy` finally gets a real user id instead of a
string. Claim the file first (§0); it is dead, which makes the claim cheap and the collision expensive.

### 3.8 The users page itself

Small, because the product is deliberately less rich than what it replaces.

```text
┌─ USERS ───────────────────────────────────────────────────── + Add person ─┐
│                                                                            │
│  Name              Role       Can create agents with   Budget    Spend     │
│  ───────────────────────────────────────────────────────────────────────   │
│  Dana Whitfield    owner      text · images · video ·   —         not      │
│    dana@…                     voice · publish to X                measured │
│                                                                            │
│  Sam Okafor        approver   text · images            $200/mo    not      │
│    sam@…                                                          measured │
│                                                                            │
│  Priya Raman       member     text                     $50/mo     not      │
│    priya@…                                             [Edit] [Disable]    │
│                                                                            │
│  Spend is not measured yet — the cost ledger is not built. See §3.6.       │
└────────────────────────────────────────────────────────────────────────────┘
```

Four notes on the mockup, each of which is a rule:

- the capability column, not the budget column, is the wide one. That reflects which control actually
  works today;
- the spend column says "not measured", in the table, with the reason on screen. It does not say
  `$0.00`;
- "Disable", not "Delete". A removed user's approvals and published posts must remain attributable;
  deleting the principal orphans the record. Deletion, if the owner insists on it, is a stop-and-ask
  (§7);
- build it with the theme's semantic tokens. Do not write `text-white/NN` — that is what makes the
  existing control room impossible to light-theme, and this page is new code with no excuse.

---

# PART TWO — X

### 3.9 What X access enables, and what this worktree does not build

Four capabilities, in ascending order of risk:

1. **Read the connected account.** The demo's second agent "works against the user's X account": it
   reads the user's own posts and their engagement to learn what lands, and searches for context. This
   is a research source alongside the Doc Hub, and it is read-only and reversible.
2. **X-native generation.** A post has a character limit, a set of accepted aspect ratios and a video
   duration ceiling. Those are *constraints handed to the generation engine*, not a second engine. The
   X page contributes a constraint profile and nothing else.
3. **Media upload.** Take an asset that is already persisted in the Doc Hub, upload it to X, get a
   media id back. Multi-step and asynchronous for video (§3.11).
4. **Posting.** Create a post, with or without media, possibly as a thread. Irreversible (§3.12).

**What this worktree must not build,** stated as a list because the temptation is real and the
duplication would be expensive:

```text
no image client          — loops/03-generation.md owns /v1/images/*
no video client or poller— loops/03-generation.md owns /v1/videos/* and the job store
no TTS or realtime client— loops/03-generation.md owns /v1/tts and /v1/realtime
no asset store           — loops/02-dochub.md owns download-on-receipt and provenance
no deliverable model     — loops/02-dochub.md owns Deliverable/Section/Asset
no second cost meter     — the cost loop owns the ledger; you read it, you do not keep your own
```

You own exactly: OAuth, the token store, the X HTTP client, the publish confirmation, the published-post
record, and the page. A post is a *view* over an existing deliverable section plus an X-side
identifier. If you find yourself writing a prompt-to-image call, stop; you are in the wrong worktree.

### 3.10 Credentials, and where each one lives

Three distinct credentials, and conflating them is the first mistake available:

```text
XAI_API_KEY        xAI platform key. Generation only. Not this worktree's. Absent on this machine.
X_CLIENT_ID        the X developer application's OAuth client id.       env var, one per install
X_CLIENT_SECRET    the X developer application's OAuth client secret.   env var, one per install
X_REDIRECT_URI     the registered callback. Loopback for a local product; must match the value
                   registered in the X developer portal exactly, or the flow fails at the last step.
X_DRY_RUN          §3.14. Set in every test and in the acceptance script.
```

**Per-user access and refresh tokens are not environment variables.** They are per-user records —
one X account per user, not one per workspace, because the demo posts *as the user* — encrypted at
rest with a key derived from the workspace, never logged, never rendered, never written into a
deliverable section. `assertNoSecrets` (`server/services/secrets.ts:113`) already refuses a write
containing a bearer token or a JWT (`SECRET_PATTERNS`, `:15-31`) and refuses rather than redacting,
because a silently altered document is its own problem. Call it on anything an agent can author that
might quote a token, and add an X-token pattern to that list if the token format is recognisable —
which is one of the things §3.11 must check.

Disconnecting must revoke at X, not merely forget locally. Forgetting a live token leaves a credential
outstanding that the user believes is gone.

### 3.11 What must be checked against docs.x.com before a line of §3.9 is written

The research behind this pivot covered xAI's platform in detail and covered the X API not at all.
Everything below is therefore **unverified**, and this document deliberately does not guess. Each item
names the specific thing to check, and the checks are ordered so the answer that could invalidate the
design comes first.

```text
C-1  MEDIA FORMAT — check first, it can invalidate the pipeline.
     Grok Imagine returns MP4 in H.265, H.264 or AV1, 480p/720p/1080p, 1–15 s, audio by default.
     Does X accept those containers, codecs, durations, bitrates and aspect ratios on upload,
     unchanged? If it does not accept H.265, every generated clip needs a transcode, which means
     ffmpeg, which is a binary dependency nobody has budgeted for and which changes the packaging
     story. Answer this before designing anything else.

C-2  MEDIA UPLOAD ENDPOINT — which one is current.
     Media upload has historically been a separate host and API version from posting, with a
     chunked initialise/append/finalise sequence for video and a processing-status poll after
     finalise. Verify the current host, path, version, the exact step names, the status field and
     its state values, and whether the older endpoint is deprecated or removed. Do not copy an
     endpoint out of a blog post.

C-3  POST CREATION — the exact host, path and request body for creating a post, and the field names
     for attaching uploaded media ids. Also whether threads are a distinct call or a reply chain.

C-4  AUTH — which OAuth flow is required for writes, whether user-context authorisation with PKCE
     covers both posting and media upload or whether they need different credential types, the exact
     scope strings, refresh-token lifetime, and what a revoked token returns.

C-5  ACCESS TIER — which tier permits posting and media upload, the monthly write cap, the per-user
     and per-app rate limits, and the price. This is a recurring cost the owner must agree to before
     the page ships, and a monthly write cap is a product constraint the UI has to show, not a
     surprise at post 501.

C-6  READ ACCESS — whether reading the authenticated user's own posts and their engagement is
     available on the same tier as writing. It frequently is not, and the demo's X agent is a
     *reader* first. If reading costs a higher tier than posting, say so before the demo is scripted
     around it.

C-7  DELETION — whether a post can be deleted via the API. Note what this is and is not: deletion is
     not an undo. §3.12 does not soften because deletion exists.

C-8  ERROR SEMANTICS — the response shape for a rate limit, a duplicate post, a moderation refusal
     and an oversized media file, so §3.13 can distinguish "did not happen" from "may have happened".
```

Record each answer in `VERIFICATION.md` with the docs URL and the date fetched, the way the xAI
figures in this document family are recorded. An API fact with no date is a fact with no shelf life.

### 3.12 Publishing is irreversible, so it stops and asks — every time

This project already has the rule: an irreversible or outward-facing operation stops and asks
(`loopdesign.md:271-282`, `verifiables.md` §22.2). Publishing to X is the most outward-facing action
in the product. The rule applies without exception, and "without exception" is the load-bearing part —
a confirmation with a "don't ask again" checkbox is not a confirmation, it is a delay.

**No agent may publish.** The precedent exists and is enforced today: `DELIBERATELY_USER_ONLY`
(`server/services/projectMcpServer.ts:695-703`) lists six MCP tools an agent can never call. Publishing
joins it. The agent's tool is `draft_x_post`, which writes a deliverable section into the Doc Hub with
the X constraint profile applied and stops. There is no `publish_x_post` MCP tool, and adding one is
not an optimisation available to a later iteration.

The confirmation shows the artefact, not a summary of it:

```text
┌─ Publish to X ─────────────────────────────────────────────────────────────┐
│                                                                            │
│  Posting as  @dana_whitfield        (connected 3 Aug, by Dana Whitfield)    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Q3 pipeline review is live. Three things changed and one of them      │  │
│  │ explains the other two. Full deck in replies.                         │  │
│  │                                                     198 / 280 chars   │  │
│  │ ┌────────────┐ ┌────────────┐                                        │  │
│  │ │ [ slide-1  │ │ [ clip-2   │  8 s · 720p · mp4 · 4.1 MB             │  │
│  │ │   .png ]   │ │   .mp4 ]   │  ▶ plays here, not a filename          │  │
│  │ └────────────┘ └────────────┘                                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Made by  slides-agent (Grok + images) · voice-agent (Grok + voice+images)  │
│  Cost so far  $5.52  ·  from the generation ledger, actual                  │
│                                                                            │
│  This is public and permanent. Deleting it later does not unsend it.       │
│                                                                            │
│  Approving as Dana Whitfield — you are the only person in this workspace,   │
│  so this is a self-approval and will be recorded as one.                    │
│                                                                            │
│                                   [ Cancel ]   [ Publish to @dana_whitfield ]│
└────────────────────────────────────────────────────────────────────────────┘
```

Rules the mockup encodes:

- the media **renders**; a filename is not a preview, and the whole point is that the human sees what
  the followers will see;
- the account handle appears on the button, not just in the header. Posting to the wrong connected
  account is a real failure mode and the button is the last place to catch it;
- the cost appears at the moment of the irreversible click, labelled with its source. This is where
  the cost pillar stops being decoration: the user sees \$5.52 next to a button that cannot be undone;
- the approver is named from the session, and a self-approval says so (§3.4);
- a thread gets one confirmation, but the confirmation shows **every** post in it. One click may cover
  several posts; it may never cover a post the human did not see;
- no batching across drafts, no queue that publishes on a timer, no scheduled posts in the first
  release. A scheduled post is an irreversible action that happens when nobody is watching.

Record on success: the X post id and URL, the account, the confirming user id from the session, the
timestamp, `selfApproved`, the deliverable and section it came from, the asset ids, and the cost as
read from the ledger. That record is what makes "which agent made the thing that went out" answerable
three weeks later.

### 3.13 A timeout is not a failure

The failure that ruins a demo is not a rejected post. It is a post that succeeded while the client
believed it failed, followed by a retry.

- Mint an **idempotency key** when the human confirms, persist it *before* the HTTP call, and store
  the outcome against it. A second publish carrying a key that already has a result returns that
  result and calls nothing.
- On a timeout or a dropped connection you do not know whether the post exists. **Do not retry.**
  Reconcile by reading the account back (C-6) and matching, then either record the existing post or
  surface an explicit "unknown — check your account" state. An unknown state on screen is better than
  a duplicate on a real timeline.
- A 4xx from X is a stop, not a retry. Show the message. Moderation refusals and duplicate-content
  refusals both live here, and both are things the human needs to read rather than have retried
  around.
- A rate limit is a wait with a stated time, surfaced to the user, never a silent loop. The generation
  side already has flat rate limits that cannot be bought around — 5 RPS for images, 10 RPS for video
  — so the habit of showing a queue rather than hiding one is already required elsewhere.

### 3.14 Dry run

`X_DRY_RUN=1` makes the X client render, validate, persist and record everything, and call nothing.
It returns a synthetic post id marked as such, and the published record stores `dryRun: true` so it
can never be mistaken for a real post.

Every test and every acceptance run sets it. **There is no test that posts to a real account.** This
is not only prudence about the owner's timeline: it is what lets most of Part Two be built and
evidenced before `X_CLIENT_ID` exists (§1). Build the dry run in the same stage as the client, not
after it.

### 3.15 The X page is optional, and optional means absent

When no X application credentials are configured, the page does not appear in the navigation. It is
not shown disabled, not shown greyed with a tooltip, not shown with a "connect to enable" empty state
in the nav. A control that does nothing is prohibited (`verifiables.md` §22.18), and the fourth page
is the easiest place in the product to violate that.

The page, when present, is three things and no more: the connected account and its connect/disconnect
control; the drafts agents have written, each with a Publish button that opens §3.12; and the history
of what has been published, with who confirmed it and what it cost.

### 3.16 Build order

This is the table §4 step 3 refers to. Work top-down; each stage is testable before the next begins.
Part One before Part Two, without exception — an X page over no identity publishes to the world on
the authority of nobody.

| # | Stage | Done when |
|---|---|---|
| 1 | `user.ts`, `userStore.ts`, the synchronous invariant test, first-run owner | USR-001, USR-002 |
| 2 | `sessionAuth.ts`: hashing, session records, the fail-closed middleware, the `actorFrom` inversion | USR-003, USR-004 |
| 3 | Roles, the self-approval refusal, `ApprovalQueue` wired | USR-005, USR-006 |
| 4 | Approver from the session on merge; body-supplied approver rejected | USR-007 |
| 5 | Capability grants, and the refusal to grant what you do not hold | USR-008 |
| 6 | Per-user budget scope — BLOCKED on the cost ledger, recorded as such | USR-009 |
| 7 | The USERS page | USR-010 |
| 8 | Answer C-1…C-8 against docs.x.com and record them | prerequisite for 9 |
| 9 | OAuth connect/disconnect, encrypted token store, `xClient.ts` with dry run | XAP-001, XAP-002 |
| 10 | Read path: the X agent reads the connected account | XAP-003 |
| 11 | Media upload, including whatever C-1 turned out to require | XAP-004 |
| 12 | `draft_x_post`; publishing added to `DELIBERATELY_USER_ONLY` | XAP-005 |
| 13 | The publish confirmation, approver from the session, idempotent | XAP-006, XAP-007 |
| 14 | The X page, absent when unconfigured | XAP-008 |

### If the loop runs with nothing to do

1. **Try to reach a privileged endpoint without a session.** Not with the browser — with `curl`, from
   a second terminal, against every route module in `server/routes/`. Coverage of a surface is not
   coverage of its behaviour; a middleware that is mounted is not a middleware that is reached. List
   every mounted route, list every route your fixture exercises, and diff them. That one command is
   how the dropped budget events were found.
2. **Re-derive a surprising result.** A suspiciously clean check is a bug in the check. If every route
   returns 401 on the first attempt, prove the check can fail: point it at a route you have
   deliberately left open and confirm it says so.
3. **Delete a duplication.** If a second approval mechanism has appeared beside
   `server/services/approvals.ts`, one of them is dead weight and the UI will eventually show both.
4. **Re-read C-1…C-8.** X API details move. A recorded answer with a fetch date older than the
   current milestone is worth re-checking before it is built on.

---

## 4. Loop procedure

1. Read `VERIFICATION.md` for current status. Trust it over memory.
2. Run `bun run verify`. If red, fix that and stop.
3. Pick the highest item in the §3.16 table that is not passing.
4. Reproduce or test the required behaviour first — know what failure looks like before fixing it.
5. Implement the smallest change that satisfies the requirement.
6. Write tests that would fail without the change.
7. Run `bun run verify` again. It must be green before you record anything.
8. Record evidence in `VERIFICATION.md` against the USR-0NN or XAP-0NN item.
9. Commit with a message stating what was verified.
10. Report honestly, including what did not move and what you were tempted to edit outside §0.

---

## 5. What counts as done

An item may be marked **PASS** only when every clause of its required result is satisfied and each is
backed by a command someone else could re-run. A partially-satisfied item is NOT TESTED, not PASS; say
which clause failed and hold the item.

**Not evidence:** "this should work", "the implementation appears correct", "the code was added",
"the component exists", "tests were not run but the logic looks valid".

#### USR-001: A user exists, persists, and the store cannot go async

Required result:

* a user can be created with a role, a capability grant and an optional budget;
* the record round-trips through a process restart;
* no method on `userStore.ts` is `async` or contains `await`, an invariant test fails if one becomes
  so, and deleting the explanation from the source fails the test.

Evidence:

```text
Created user:
Restart round-trip:
Deliberate async method → test output:
Explanation removed → test output:
```

#### USR-002: First run mints exactly one owner

Required result:

* with no users on disk, the first-run flow creates one `owner` and issues a session to that browser;
* a second attempt to run first-run setup is refused once an owner exists;
* the owner cannot be deleted or demoted by any request, including its own.

Evidence:

```text
First run → user list:
Second first-run attempt:
Demote-owner attempt:
```

#### USR-003: The server refuses an unauthenticated request

Required result:

* every route under `/api` and `/mcp` returns 401 without a valid session — demonstrated with `curl`,
  not with the browser;
* no route has a local-address or missing-header path that yields a privileged actor;
* the enumeration is derived from the mounted routes, not from a hand-written list, and the check is
  shown failing against a deliberately unprotected route before it is believed.

Evidence:

```text
Routes enumerated / routes probed:
curl without a session, per route:
Positive control (route left open on purpose):
```

#### USR-004: A session expires and can be revoked

Required result:

* a session token is stored hashed — the stored value cannot be replayed as a cookie;
* an expired session is refused;
* revoking a user's sessions takes effect on the next request, not on the next restart.

Evidence:

```text
Stored value replayed as cookie:
Expired session:
Revoke → next request:
```

#### USR-005: Roles decide who may approve

Required result:

* a `member` is refused when approving a restricted action, by the server, with the required role
  named;
* an `approver` succeeds on the same request;
* the decision comes from one function, and every gate in the product routes through it — shown by
  grep, not by assertion.

Evidence:

```text
member → approve:
approver → approve:
Call sites of the role check:
```

#### USR-006: Nobody approves their own request

Required result:

* the requester of a restricted action is refused as its approver, by the server;
* in a one-user workspace the action is still possible, is labelled a self-approval on screen, and
  stores `selfApproved: true`;
* the stored record names a real user id, never the string `"user"`.

Evidence:

```text
Self-approval, two users present:
Self-approval, one user present — record:
Stored approver id:
```

#### USR-007: The approver comes from the session, never from the body

Required result:

* `POST /api/repository/merge` takes the approver from the session;
* a request supplying `approvedBy` in the body is rejected with 400, not silently ignored;
* the merge record and the plan approval both show the session user's id.

Evidence:

```text
Merge with session only:
Merge with approvedBy in body:
Stored approvedBy on merge and on plan:
```

#### USR-008: A user cannot grant a capability they do not hold

Required result:

* creating an agent with a capability the creating user does not hold is refused, with the missing
  capability named;
* raising a user's capabilities requires an approval and is recorded in the approval queue;
* the refusal is server-side — demonstrated with a request that bypasses the UI.

Evidence:

```text
Agent creation beyond the grant:
Capability raise → approval record:
Direct request bypassing the UI:
```

#### USR-009: A per-user budget warns and stops — BLOCKED

Required result:

* a per-user cap can be configured;
* a warning is published before the threshold and execution stops at the limit, both scoped to
  `user`;
* the users page shows measured spend.

Evidence:

```text
Configured cap:
Warning event:
Observed stop:
Spend shown on the page:
```

**This item is BLOCKED, not NOT TESTED, and the reason is recorded in `VERIFICATION.md`:**
`DEFAULT_RATES` (`server/services/usageAccounting.ts:30-34`) has no Grok model, so cost resolves to
`0` with `rateKey: null` (`:79`), and there is no ledger — only the running total at
`server/services/agentRegistry.ts:359`. A cap over a meter reading zero never trips. Do not mark this
PASS against a zero. Until the cost loop lands, the page reads "not measured".

#### USR-010: The users page shows people, roles, capabilities and spend

Required result:

* people, roles, capability grants and disable state are visible and editable by the owner without
  reading a log;
* the spend column reads "not measured" with the reason on screen, and never `$0.00`;
* the page renders correctly in both light and dark theme, using semantic tokens with no
  `text-white/NN`.

Evidence:

```text
Screenshot or DOM assertion, owner view:
Spend column text:
grep for text-white in client/src/users:
```

#### XAP-001: An X account can be connected and disconnected

Required result:

* the OAuth flow completes and stores access and refresh tokens against one user;
* disconnect revokes at X and then removes the local record, in that order;
* a revoked or expired token produces a named, actionable error, not a generic failure.

Evidence:

```text
Connect → stored record (redacted):
Disconnect → revocation call and local state:
Revoked-token request:
```

#### XAP-002: An X token never reaches disk in clear text or a document

Required result:

* tokens are encrypted at rest and absent from every log line;
* a write containing a token into a deliverable section is refused by `assertNoSecrets`, naming where
  it was found;
* a grep of the data directory after a full connect-and-publish cycle finds no token material.

Evidence:

```text
On-disk record:
Section write attempt → refusal:
grep of the data directory:
```

#### XAP-003: An agent can read the connected account

Required result:

* an agent with the X capability can read the connected user's own posts through an MCP tool bound to
  its identity;
* an agent without the capability is refused;
* the tool cannot read an account other than the one connected to the requesting user.

Evidence:

```text
Read as capable agent:
Read as non-capable agent:
Attempt to address another account:
```

#### XAP-004: Generated media is accepted by X, or the transcode is named

Required result:

* C-1 is answered and recorded with its docs URL and fetch date;
* an Imagine-produced MP4 and PNG upload successfully in dry run and, once credentials exist, against
  the live service;
* if a transcode is required, it is implemented and the dependency it introduces is recorded, not
  assumed away.

Evidence:

```text
C-1 answer, URL, date:
Upload of an unmodified Imagine mp4:
Transcode step, if any:
```

#### XAP-005: No agent can publish

Required result:

* the publish path is user-only and appears in `DELIBERATELY_USER_ONLY`;
* an agent calling every tool in the MCP surface cannot reach it — demonstrated by enumerating the
  tool list, not by inspection;
* the agent's `draft_x_post` writes a Doc Hub section and performs no network call to X.

Evidence:

```text
Tool enumeration vs the publish path:
Agent attempt:
draft_x_post → section written, network calls made:
```

#### XAP-006: Publishing stops and asks, every time, showing the artefact

Required result:

* no publish occurs without an explicit confirmation carrying a session user;
* the confirmation renders the final text with its character count, plays or displays every attached
  asset, names the target handle, and shows the cost with its source;
* there is no setting, flag or repeat-confirmation that suppresses it, and a thread's confirmation
  shows every post in the thread.

Evidence:

```text
Publish without confirmation:
Confirmation contents (DOM assertion):
grep for a suppress/remember control:
Thread confirmation:
```

#### XAP-007: A publish cannot happen twice

Required result:

* an idempotency key is persisted before the HTTP call and a repeat with the same key calls nothing;
* a simulated timeout produces an explicit unknown state and no automatic retry;
* reconciliation against the account resolves the unknown state without posting again.

Evidence:

```text
Repeat with the same key:
Simulated timeout → state and calls made:
Reconciliation:
```

#### XAP-008: The X page is optional and absent by default

Required result:

* with no X credentials configured, the page does not appear in the navigation at all — not disabled,
  not greyed;
* with credentials configured, it appears and its connect control works;
* removing the credentials removes the page again without a restart artefact or an orphaned route.

Evidence:

```text
Navigation, unconfigured:
Navigation, configured:
After removal:
```

---

## 5a. Rules learned the hard way

Each of these exists because it was violated at least once, in this repository or in the research
behind this pivot. No rule without its bug.

- **A gate that names its approver is not the same as knowing who approved.**
  `mergeAgentBranch` (`server/services/repository.ts:324-336`) has refused every unapproved merge since
  it was written, and the name it has been given every time is the constant `"user"` —
  `server/routes/projects.ts:680`, `server/services/projectStore.ts:826` and `:903` produce it, and
  `scripts/acceptance/v052.mjs:437` types it out by hand. Before trusting an audit field, name the
  code that populates it and check what it actually contains.
- **A default that grants privilege is not a default, it is the rule.** `actorFrom`
  (`server/routes/projects.ts:28-51`) treats a header-less request as the fully privileged user and
  documents the reasoning honestly. The reasoning is sound and the outcome is that the maximum-privilege
  request is the one that sends nothing. Design the unauthenticated path first, and make it the
  refusal.
- **One permission, one source of truth.** `x-openui-actor-doc-write` was once a header *and* a stored
  permission; the fix and the reason are written into both
  `server/routes/projects.ts:28-51` and `server/routes/mcp.ts:24-31`. Do not reintroduce the same shape
  in `approvedBy`. Reject the second source; ignoring it is how it comes back.
- **Never fabricate a value in the UI.** An absent field is omitted, never defaulted to something
  plausible. A per-user spend of `$0.00` today would be a fabrication: `DEFAULT_RATES`
  (`server/services/usageAccounting.ts:30-34`) has three keys and no Grok model, so an unknown model
  returns `costUsd: 0` with `rateKey: null` (`:79`), and `rateKey: null` is surfaced nowhere.
- **A passing test proves a unit works, not that anything calls it.** `ApprovalQueue`
  (`server/services/approvals.ts:133`) and `assertAgentCanWrite` (`server/services/repository.ts:261`)
  are both tested and both have zero production callers. Before marking an item PASS, confirm the code
  is reachable from the running application.
- **A hidden control is not a rule.** Every refusal in this document is server-side, demonstrated with a
  request that bypasses the UI. The client decides what to show; it never decides what is allowed.
- **A suspiciously clean result is a bug in the check.** An audit that returned all zeros was a broken
  shell variable, not clean code. USR-003 requires a positive control — a route deliberately left open
  — before a clean sweep of 401s is believed.
- **A timeout is not a failure.** You know what you sent; you do not know what happened. Retrying an
  outward-facing call on a timeout is how a demo posts twice to a real account.
- **Deletion is not an undo.** Even where the API supports removing a post, the post was public in the
  interval. Nothing in §3.12 softens because C-7 comes back positive.
- **An API fact with no date is a fact with no shelf life.** Every answer to C-1…C-8 is recorded with
  its docs URL and the date it was fetched, the way the xAI prices in this family are.
- **When safety comes from the absence of something, write it down.** The user store is
  concurrency-safe only because no mutation contains an `await` — not from locking, not from atomic
  writes (`server/services/projectStore.ts:148-159`). State it in the source and let a test fail if the
  statement is deleted.

---

## 6. Where the owner's assumptions are wrong

Stated plainly, because designing quietly around them produces a product that cannot be explained.

1. **"User management" implies users, and there are none.** There is no authentication of any kind —
   the server says so about itself at `server/index.ts:73-76`. There is no user record, no credential,
   no session, no sign-in and no sign-out anywhere in the repository. A USERS page is not a page on
   top of an existing system; it is the visible tenth of a system that has to be built underneath it
   first (§3.2). Building the page before the middleware produces a screen full of controls that
   change nothing, which the quality audit prohibits and which a customer will discover in the first
   week.
2. **The approver requirement that already exists is satisfied by a string literal.** The merge gate is
   real and the name it collects is the constant `"user"`. Treat this as evidence for the pivot rather
   than against it: the enforcement points are already in the right places, and what they are missing
   is an identity to record.
3. **Boundaries are enforced nowhere at write time.** Isolation today is a `cwd` handed to the agent.
   `assertAgentCanWrite` (`server/services/repository.ts:261`) and the whole `ApprovalQueue` have zero
   production callers, and `shellSafetyHook.ts` is not installed by this repository and only classifies
   shell commands, so a direct file-write tool bypasses it entirely. Git worktrees made out-of-bounds
   edits *recoverable*; they never *prevented* them. Roles and per-user budgets do not change that —
   the boundary worktree does, and this document depends on its work rather than duplicating it.
4. **Cost is broken today, not merely incomplete**, and a per-user budget inherits that breakage in
   full (§3.6). There is no ledger, only running totals; the token split is computed and thrown away;
   `approvalThreshold` and `maxRetries` have zero occurrences in the code; per-tool-call attribution is
   structurally impossible because ACP returns one usage object per *turn*. Per-task cost *is* now
   tracked — `HANDOFF.md` is stale on that point.
5. **There is no HTTP client to anything in this project.** It speaks ACP (JSON-RPC over stdio) to the
   `grok` binary and nothing else. Both the xAI client and the X client are net-new, and `XAI_API_KEY`
   and `X_CLIENT_SECRET` are two entirely separate credentials with separate failure modes.
6. **X posting is not a small feature bolted onto generation.** It is the only place in the product
   where an action cannot be undone, and the confirmation flow, the idempotency key, the reconciliation
   path and the dry-run mode are most of the work. The generation half is a call into another
   worktree's engine.
7. **The X API details in this document are unverified.** The research behind this pivot covered
   `api.x.ai` — Imagine, video, TTS, STT, realtime, prices, rate limits — in verified detail, and
   covered `api.x.com` not at all. Every endpoint, scope, tier, price and media constraint on the X
   side is an open question, enumerated as C-1…C-8 in §3.11. Do not let an agent write the client from
   memory; the naming of that API has changed more than once and a confidently wrong endpoint will look
   plausible in review.
8. **Custom voice cloning from the app is not buildable**, in case it appears in an X-native video
   brief. API creation of custom voices is Enterprise-only; on a standard plan voices are created in
   the console, US-only excluding Illinois.
9. **There is no xAI document or slide generation API.** None. Anything published to X that is a
   document or a deck was assembled entirely by our own code.

---

## 7. Stop and ask the user when

Do not work around any of these. Report the blocker with evidence and stop; do not spend iterations
restating a known blocker.

- **No X application credentials exist.** `X_CLIENT_ID`, `X_CLIENT_SECRET` and a registered
  `X_REDIRECT_URI` are not present, no developer application exists, and no access tier is subscribed.
  An action that needs credentials that were not provided is a stop condition, not a mock. Build the
  dry run (§3.14) and stop at the network boundary.
- **The access tier costs money, monthly.** C-5 establishes what posting and reading actually cost.
  That is a recurring commitment and it is the owner's decision, not an implementation detail.
- **X-C: does the first release include X posting at all?** The page is optional by construction, so
  shipping without it costs nothing and removes the product's only irreversible surface. One sentence
  from the owner settles it.
- **X-A: is the workspace ever served beyond this machine?** This document assumes loopback and one
  workstation. Serving it on a network means TLS, a threat model and a deployment story, and it changes
  §3.3 from a convenience into a hole.
- **Deleting a user, rather than disabling one.** It orphans every approval and published post they
  authorised. Irreversible, and this repository has an eighty-iteration precedent for stopping on
  exactly this class of decision.
- **Posting to a real account for a test, or in a demo rehearsal.** Outward-facing and irreversible.
  Every test runs in dry run; a live post is an explicit human decision each time, including yours.
- **The cost ledger is not ready and USR-009 needs it.** Record it BLOCKED with the reason. Do not mark
  it PASS against a zero and do not invent a rate table in this worktree — that file belongs to the cost
  loop.
- **A change would fall outside §0.** File a suggestion and stop. Do not edit another worktree's files,
  even when you are certain — and on `actorFrom` you will be certain.
- **Two requirements contradict each other** — for example, "simpler and more visual, for non-technical
  users" against a sign-in screen on a laptop. Say which two, and stop. §3.3 is this document's answer
  to that particular pair; if the owner disagrees with it, the answer changes here rather than in the
  code.

---

## 8. Definition of done

Users and X are complete when USR-001…USR-010 and XAP-001…XAP-008 all read PASS with recorded,
re-runnable evidence in `VERIFICATION.md`; `bun run verify` is green; no item is NOT TESTED and no item
is BLOCKED; C-1…C-8 are each answered with a docs URL and a fetch date; and the canonical demo runs end
to end across these surfaces — a named person signs in, creates the project, assembles the team, the X
agent reads their account, the media agents spend against that person's capabilities and budget, and the
resulting post reaches X only after that person has looked at the rendered artefact, its cost and its
target handle and pressed a button that says the handle out loud.

Only then output `Users and X are complete: YES`.

Until then, the honest answer is the current tally and the specific reason the next item is not yet
passing.
