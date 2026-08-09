# Side quest — make an agent produce a real deck and a real PDF

Run this in a worktree. It does not touch anything on the demo's critical path.

```bash
cd /Users/haoming/openui
git worktree add ../openui-decks -b side/decks grok-control-room
cd ../openui-decks
```

Then paste everything below the line into a fresh session.

---

You are working in a git worktree at `../openui-decks` on branch `side/decks`, cut from
`grok-control-room`. Do not merge to `grok-control-room` yourself and do not push — another session
is shipping a demo off that branch right now. Commit on `side/decks` and stop.

`export PATH="$HOME/.bun/bin:$PATH"` before any bun command. `set -a && . ./.env && set +a` for keys.

## The goal

An agent in this workspace must be able to produce a real `.pptx` deck and a real `.pdf`, and have
the file land in the workspace's Assets where a user can open it. Today nothing has ever done this.

## Read this first, because it inverts the obvious plan

`HANDOFF-WORKSPACE.md` §4 used to say ".pptx must be rendered by us and nothing does it" and filed
"pick a Node PPTX library" as work. That was wrong and it was an A-00 violation — the project's
first rule is *drive Grok Build, do not rebuild it*.

`~/.grok/bundled/skills/pptx/` is a complete deck-building skill: `SKILL.md`, `creating.md`,
`editing.md`, `scripts/`, `templates/`, `template_taxonomy.json`, built on PptxGenJS. `pdf/` is the
same for PDF. **Every agent we launch already has both**, because we pass no `--tools` and grok
loads its bundled skills itself.

So this task is *not* "write a renderer". It is "find out why asking has not produced a file, and
fix that". Start by reading both SKILL.md files and `server/services/mcp/media.ts`.

## What to actually do

1. **Prove the path by hand first.** Start the server (`bun run serve`), hire one agent, open a
   session, and ask it in plain words for a three-slide deck. Watch the transcript. Find out exactly
   where it stops: does it not know the skill exists, does the skill's script fail, does it write
   the file into its working directory and never call `create_deliverable`, or does
   `create_deliverable` reject a binary file? Write down what you observed before changing anything.

2. **Fix whatever that turns out to be.** Likely candidates, in the order they are likely:
   - The deliverable tools may have no way to attach BINARY bytes from a path on disk. Check
     `server/services/mcp/media.ts` — `write_text` writes text. If there is no `attach_file`, add
     one: an MCP tool taking a path inside the agent's area and an asset id, reading the bytes and
     storing them through `assetStore` the way `POST /api/assets` does for an upload. Refuse a path
     outside the agent's area, and say so in the refusal.
   - The skills may need enabling per agent. Check how `rulesFor` composes skills in
     `server/services/acpSessionManager.ts` and whether a bundled grok skill is discoverable to an
     agent without being named. If the agent needs telling, the brief in
     `server/services/dispatchWork.ts` (`briefFor`) is where that sentence goes — do not hard-code a
     skill name into the session args.
   - The `pptx` skill's scripts may need Python or `markitdown`. If a dependency is missing, say so
     in the handoff rather than silently installing something global.

3. **Make Assets render it.** A `.pptx` asset must at minimum download and state its type; check
   `client/src/control-room/assets/` — there is already a MIME table and a file route
   (`GET /api/assets/:assetId/files/:fileId`). If a slide preview is out of reach, a labelled
   download is honest and a fake thumbnail is not.

4. **Then do the same for PDF**, which should be much shorter once the binary path exists.

## Rules you will be judged on

- **A-00**: before building any mechanism, check whether grok already has it. Record which flag or
  skill you considered and why it was insufficient. This whole task exists because that was skipped.
- **Never fabricate a value.** No placeholder thumbnails, no invented page counts, no `$0.00`.
- Validate every network body before using it; `Array.isArray` before `.map`.
- Do not use `mock.module` — export an injection seam.
- Comments explain *why*, in prose, at the density of the file around them.
- `.at(-1)` does not typecheck in the client tsconfig; use indexed access there.

## Done means

`bun run typecheck` clean, `bun test server/ client/src` 0 fail, and — the part that matters — a
real `.pptx` and a real `.pdf` produced by a real agent, sitting in Assets, openable. Put the two
asset ids in your final message along with what you found in step 1.

Write what you learned into `loops/handoff/pivot-decks.md`, including anything you found that grok
already does and we were about to rebuild.
