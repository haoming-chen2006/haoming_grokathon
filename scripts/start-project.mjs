// Start a project from a design document, ready to watch in the Control Room.
//
//   bun run new -- --repo /path/to/repo --design ./design.md
//
// The pieces to do this existed — create a project, add requirements, create agents, run the
// Planner, make worktrees — and nothing composed them, so starting a project meant roughly eight
// hand-written curl calls. The Control Room's own empty state printed one of them.
//
// What this deliberately does NOT do is approve the plan or launch anything. The design makes
// human approval the gate before any agent runs (§4, V-018), so this stops exactly there and hands
// you the URL. Stage 1 is scripted; stage 2 is yours to watch and approve.

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { parseRequirements, firstHeading } from "../shared/designDocument.ts";

const BASE = process.env.OPENUI_URL || "http://localhost:6968";

// ─────────────────────────────────────────────────────────────────────── arguments

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const repoArg = arg("repo");
const designArg = arg("design");

if (has("help") || !repoArg || !designArg) {
  console.log(`
  Start a project from a design document.

    bun run new -- --repo <path> --design <file.md> [options]

    --repo <path>       a git repository to work in            (required)
    --design <file>     the design document, markdown          (required)
    --name <text>       project name          (default: the repository's folder name)
    --goal <text>       one-line objective    (default: the design's first heading)
    --budget <usd>      project budget        (default: 10)
    --plan              also run the Planner to propose tasks   (slow: a real agent turn)
    --no-agents         skip creating the agent team

  Requirements are read from the design document: any list item shaped
  "- ID-01: description" or "* ID-01 — description" under any heading.

  The plan is left as a DRAFT and nothing is launched — approving it is yours.
`);
  process.exit(has("help") ? 0 : 1);
}

const REPO = resolve(repoArg);
const DESIGN = resolve(designArg);

// ───────────────────────────────────────────────────────────────────── preflight

function die(message, hint) {
  console.error(`\n  ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

if (!existsSync(REPO)) die(`No such directory: ${REPO}`);
try {
  execSync("git rev-parse --git-dir", { cwd: REPO, stdio: "pipe" });
} catch {
  die(`Not a git repository: ${REPO}`, "Agents work in isolated worktrees, which requires git.");
}
if (!existsSync(DESIGN)) die(`No such file: ${DESIGN}`);

const design = readFileSync(DESIGN, "utf8");

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    die(`Cannot reach the server at ${BASE}`, "Start it first:  bun run dev");
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* reported via text */ }
  return { status: res.status, json, text };
}

// Fail before creating anything if the server is not up.
const health = await api("GET", "/api/projects");
if (health.status !== 200) die(`The server at ${BASE} replied ${health.status}`, "Start it with: bun run dev");

// ───────────────────────────────────────────────────────── read the design document

const requirements = parseRequirements(design);
const heading = firstHeading(design);
const NAME = arg("name", REPO.split("/").filter(Boolean).pop());
const GOAL = arg("goal", heading ?? `Implement ${NAME}`);
const BUDGET = Number(arg("budget", "10"));

console.log(`\n  Repository   ${REPO}`);
console.log(`  Design       ${DESIGN} (${design.split("\n").length} lines)`);
console.log(`  Requirements ${requirements.length} found in the document`);
if (requirements.length === 0) {
  console.log(`               none matched "- ID-01: description"; add them in the document and re-run,`);
  console.log(`               or continue and the project will start with an empty requirement list`);
}

// ─────────────────────────────────────────────────────────────────────── stage 1

let step = 0;
const log = (msg) => console.log(`  ${String(++step).padStart(2)}. ${msg}`);

const created = await api("POST", "/api/projects", {
  name: NAME, goal: GOAL, repositoryPath: REPO, budgetUsd: BUDGET,
  documentTitle: `${NAME} Design`, documentContent: design,
});
if (created.status !== 201) die(`Could not create the project: ${created.text.slice(0, 200)}`);
const P = created.json.id;
log(`Project created — ${P}, document v${created.json.document.currentVersion}`);

for (const r of requirements) {
  const res = await api("POST", `/api/projects/${P}/requirements`, r);
  if (res.status !== 201) console.log(`      warning: requirement ${r.id} was rejected — ${res.text.slice(0, 120)}`);
}
if (requirements.length) log(`Requirements imported — ${requirements.map((r) => r.id).join(", ")}`);

/** The roles §14 names, each with the persona and skills that reach its session at launch. */
const TEAM = [
  { name: "Planner", role: "Planner", persona: "Break work into small, independently reviewable tasks. State dependencies explicitly." },
  { name: "Backend Engineer", role: "Backend Engineer", persona: "Prefer small, reviewable changes. Follow existing repository patterns. Run relevant tests after every change. Do not modify unrelated files." },
  { name: "Frontend Engineer", role: "Frontend Engineer", persona: "Match the existing component conventions. Check accessibility. Keep components testable." },
  { name: "Test Engineer", role: "Test Engineer", persona: "Write the failing test first. Cover the acceptance criteria, not the implementation." },
  { name: "Reviewer", role: "Reviewer", persona: "Be skeptical. Check the change against the approved design and say what is missing." },
];

const agents = [];
if (!has("no-agents")) {
  for (const member of TEAM) {
    const res = await api("POST", "/api/coding-agents", {
      projectId: P, ...member, budgetUsd: Number((BUDGET / TEAM.length).toFixed(2)),
    });
    if (res.status === 201) agents.push(res.json);
    else console.log(`      warning: could not create ${member.name} — ${res.text.slice(0, 120)}`);
  }
  log(`Agent team created — ${agents.map((a) => a.name).join(", ")}`);
}

if (has("plan")) {
  console.log("      running the Planner against the design document — this is a real agent turn…");
  const planned = await api("POST", `/api/projects/${P}/plan/generate`, {});
  if (planned.status !== 201) {
    console.log(`      warning: the Planner did not produce a plan — ${planned.text.slice(0, 200)}`);
  } else {
    log(`Plan drafted — ${planned.json.tasks.length} task(s), state "${planned.json.plan.state}"`);
    if (planned.json.uncoveredRequirements?.length) {
      console.log(`      not covered by any task: ${planned.json.uncoveredRequirements.join(", ")}`);
    }
  }
}

// ──────────────────────────────────────────────────────────────────── stage 2

const uiPort = process.env.OPENUI_UI_PORT || "6969";
console.log(`
  Ready to watch:

    http://localhost:${uiPort}/?view=control-room

  Nothing has been launched. The plan is a draft, which is the point — approving it is the human
  gate before any agent touches the repository (§4, V-018). From the Control Room you can:

    Design Document   read the imported design and the requirements taken from it
    Agents            the team, their personas, status, branch and cost
    Reviews           code submissions and design suggestions, once agents produce them

  To approve the plan and start the first task:

    curl -X POST ${BASE}/api/projects/${P}/plan/approve
    curl -X POST ${BASE}/api/projects/${P}/tasks/<taskId>/launch
`);
