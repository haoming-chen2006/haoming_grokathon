# OpenUI

Visual command center for managing multiple AI coding agents in parallel on an infinite canvas.

Each agent runs in its own git worktree with real-time status tracking, full terminal access, and automatic session persistence.

![OpenUI Canvas](app-demo.png)

## Quick Start

```bash
# Prerequisites: Claude Code (isaac claude)

# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc  # or restart your shell

# Install OpenUI
cd ~/universe/openui
bun install && cd client && bun install && cd ..
bun link

# Run from any project directory
cd ~/your-project
openui
# Open http://localhost:6969
```

If on a remote machine (e.g. arca), add port forwarding to your local `~/.ssh/config`:

```
Host arca*
  LocalForward 6969 localhost:6969
```

Then SSH in as usual — `http://localhost:6969` will work in your local browser.

## Features

- **Infinite canvas** — agents displayed as live cards on a ReactFlow canvas with real-time status (working, needs input, idle, error), current tool, git branch, and working directory. Pan, zoom, and drag to organize.
- **Multiple workspaces** — separate canvas tabs for different projects or workflows
- **Git worktree isolation** — each agent gets its own worktree automatically, no merge conflicts between parallel agents
- **Session persistence** — close OpenUI, reboot, come back — all agents resume where they left off with terminal history preserved
- **Real-time status** — Claude Code plugin reports agent state via lifecycle hooks (thinking, using tools, waiting for input, idle)
- **Full terminal access** — click any card to open xterm.js terminal with bidirectional I/O, ANSI colors, clickable links, 10K line scrollback
- **Conversation search** — full-text search across Claude Code history using SQLite FTS5, resume or fork past conversations
- **GitHub integration** — start sessions from issues, auto-create branches, issue info displayed on agent cards
- **Batch spawning** — spin up 1-20 agents at once, queued to avoid OAuth port conflicts
- **Permission detection** — flags agents waiting for permission approval or tool calls running longer than 5 minutes
- **Self-updating** — auto-updates on startup via git pull, choose `stable` or `beta` channel in settings

## Development

```bash
bun run dev  # Vite HMR + server watch mode on port 6969
```

## Project Structure

```
openui/
├── bin/              # CLI entry point
├── server/           # Hono + WebSocket + PTY management
├── client/           # React + React Flow + xterm.js
├── claude-code-plugin/  # Auto-installed status tracking plugin
└── package.json
```

State is persisted to `~/.openui/` (sessions, buffers, plugin).

## Tech Stack

Bun, Hono, React, React Flow, xterm.js, Zustand, Framer Motion

## Troubleshooting

- **Sessions disconnected**: Verify `isaac claude` works, click Resume
- **Port in use**: `PORT=7000 openui`
- **Plugin issues**: Delete `~/.openui/claude-code-plugin/` and restart
- **Auto-update**: Runs on startup via git pull; skip with `--no-update`

## Contact

Maintained by the Mosaic Research team. For questions or feedback, post in [#ai-devtools](https://databricks.slack.com/channels/ai-devtools) or [#ai-dev-hacks](https://databricks.slack.com/channels/ai-dev-hacks).

## Acknowledgements

Based on [OpenUI](https://github.com/JJ27/openui), originally forked from [Fallomai/openui](https://github.com/Fallomai/openui).

---

## Grok Build Control Room

A visual control layer for supervising multiple Grok Build coding agents against a design
document. Built on top of the OpenUI canvas; the two views share one app.

```bash
set -a; . ./.env; set +a          # OPENAI_API_KEY (or XAI_API_KEY) for the agent backend
bun run dev
```

Then open **http://localhost:6969/?view=control-room** — or use the toggle in the bottom-right to
switch between the Control Room and the original terminal canvas.

### Creating a project

The Control Room shows an empty state until a project exists:

```bash
curl -X POST http://localhost:6968/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"My Project","goal":"Ship the feature",
       "repositoryPath":"/absolute/path/to/a/git/repo","budgetUsd":10}'

curl -X POST http://localhost:6968/api/coding-agents \
  -H 'content-type: application/json' \
  -d '{"projectId":"<id>","name":"Backend Engineer","role":"Backend Engineer","budgetUsd":3}'
```

### Views

| Tab | What it shows |
|---|---|
| Agents | Agent cards: role, status, branch, worktree, current task, tests, cost, blocker |
| Canvas | The same agents on a draggable canvas; layout persists across restarts |
| Design Document | The canonical design document, versioned. Agents may read it but not edit it |
| Reviews | Pending design suggestions and code submissions, with approve / request-changes / merge |
| Conversations | Agent-to-agent messages, grouped by thread, each linked to a project object |

Click **Open Session** on an agent card for a live drawer: streaming transcript, tool activity, a
message box, and pause / stop.

### Agent model backend

Agents run through the real `grok` binary over ACP. The model behind it is configured in
`~/.grok/config.toml`, which supports any OpenAI-compatible endpoint:

```toml
[model.gpt-4o]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
env_key = "OPENAI_API_KEY"     # keys resolve from the environment, never written to the file

[models]
default = "gpt-4o"
```

### Safety controls

- Agents work in isolated git worktrees; protected branches reject direct writes
- Merging requires a named approver — there is no anonymous merge path
- Destructive shell commands are refused by a `PreToolUse` hook before they run
- Credentials are refused on any durable write (design document, messages, artifacts)
- Per-agent and per-project spending caps warn, then pause execution

### Verifying

```bash
bun run verify     # server typecheck, client typecheck, tests, production build
bun run acceptance # the §22.16 end-to-end flow: real agent, real git, verified on main
```

`VERIFICATION.md` records the evidence for every item in `verifiables.md`, and
`product-design.md` is the design contract the implementation is audited against.
