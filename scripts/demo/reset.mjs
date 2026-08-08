// Clear the workspace: every project, deliverable, agent and design document.
//
//   bun run reset          move it all aside, reversibly
//   bun run reset --purge  delete it instead of moving it
//   bun run reset --dry    say what would go, touch nothing
//
// A demo you cannot reset is a demo you get one run of. This exists because a machine that has been
// used accumulates projects, and the workspace shows one of them — so the state you are showing
// someone is whatever you happened to make first.
//
// **It moves rather than deletes by default.** Everything lands in a timestamped folder beside the
// data directory, so a reset taken by mistake costs a `mv` to undo. `--purge` is the destructive
// form and says so.
//
// What it does NOT touch: `~/.grok`, so agent sessions stay resumable from the terminal; the
// repository; and `.env`.

import { existsSync, mkdirSync, renameSync, rmSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DATA = process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
const DOCS = process.env.OPENUI_DESIGN_DOCS_DIR || join(process.cwd(), "demo", "design-docs");

const has = (f) => process.argv.includes(`--${f}`);
const PURGE = has("purge");
const DRY = has("dry");

if (has("help")) {
  console.log(`
  Clear every project, deliverable, agent and design document.

    bun run reset           move it aside (reversible)
    bun run reset --purge   delete it
    bun run reset --dry     show what would go

  Leaves ~/.grok alone, so sessions stay resumable with \`grok sessions list\`.
`);
  process.exit(0);
}

/** Each thing the workspace remembers, and what it is, so the report is readable. */
const TARGETS = [
  { path: join(DATA, "projects"), what: "projects" },
  { path: join(DATA, "assets"), what: "deliverables" },
  { path: join(DATA, "workspaces"), what: "project workspaces (git repos)" },
  { path: join(DATA, "agents.json"), what: "agents, their status and their cost" },
  { path: DOCS, what: "design documents" },
];

function countOf(path) {
  if (!existsSync(path)) return 0;
  return statSync(path).isDirectory() ? readdirSync(path).length : 1;
}

const present = TARGETS.filter((t) => existsSync(t.path));
if (present.length === 0) {
  console.log("\n  Already clear — nothing to reset.\n");
  process.exit(0);
}

console.log("");
for (const t of present) console.log(`  ${String(countOf(t.path)).padStart(4)}  ${t.what}`);

if (DRY) {
  console.log(`\n  --dry: nothing was touched.\n`);
  process.exit(0);
}

// A single timestamp for the whole reset, so one run is one folder rather than five.
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const attic = join(DATA, `.reset-${stamp}`);

if (!PURGE) mkdirSync(attic, { recursive: true });

for (const t of present) {
  if (PURGE) {
    rmSync(t.path, { recursive: true, force: true });
  } else {
    renameSync(t.path, join(attic, t.path.split("/").pop()));
  }
}

// The design-document directory is read on every request and its absence is not an error, but an
// empty directory reads better than a missing one for anyone looking at the tree.
mkdirSync(DOCS, { recursive: true });

console.log(
  PURGE
    ? `\n  Deleted. The workspace is empty.\n`
    : `\n  Moved to ${attic}\n  Undo with:  mv ${attic}/* ${DATA}/\n`,
);
console.log(`  Restart the server, then open http://localhost:6968 — you should land on the paste box.\n`);
