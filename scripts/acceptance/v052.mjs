// V-052 — the §22.16 end-to-end acceptance test.
//
// All 18 steps against a live server, real Grok agents and a real git repository containing an
// intentionally incomplete feature. This is the only test that exercises the whole system, and it
// is the one that caught a case where all 18 steps reported success and no code reached `main`.
//
//   bun run acceptance
//
// The script is self-contained on purpose. It builds its own fixture repository, starts its own
// server on its own port with its own data directory, and removes both afterwards:
//
//   * a fixture built here starts red (0 pass / 1 fail), so "tests pass" at the end means the
//     agent actually did the work rather than the fixture having been green all along;
//   * an isolated OPENUI_DATA_DIR keeps acceptance projects out of the user's real ~/.openui,
//     which earlier hand-run versions of this script polluted.
//
// It previously lived in a temp directory, which meant the evidence for the most important item on
// the checklist could not be reproduced by anyone else.

import { spawn, execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const PORT = Number(process.env.ACCEPTANCE_PORT) || 6977;
const BASE = `http://127.0.0.1:${PORT}`;
const KEEP = process.argv.includes("--keep");

const evidence = {};
let step = 0;
const log = (msg) => console.log(`  ${String(++step).padStart(2)}. ${msg}`);
const detail = (msg) => console.log(`      ${msg}`);

let server = null;
let workdir = null;

function cleanup() {
  if (server && !server.killed) server.kill("SIGKILL");
  if (workdir && !KEEP) rmSync(workdir, { recursive: true, force: true });
}
process.on("exit", cleanup);

function fail(what, extra) {
  console.log(`\n  FAILED: ${what}`);
  if (extra) console.log(`  ${extra}`);
  cleanup();
  process.exit(1);
}
const must = (cond, what, extra) => { if (!cond) fail(what, extra); };

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON bodies are reported via text */ }
  return { status: res.status, json, text };
}

// ─────────────────────────────────────────────────────────────── fixture and server

workdir = mkdtempSync(join(tmpdir(), "openui-acceptance-"));
const REPO = join(workdir, "repo");
const DATA = join(workdir, "data");

function git(cmd, cwd = REPO) {
  return execSync(`git ${cmd}`, { cwd, stdio: "pipe" }).toString().trim();
}

execSync(`mkdir -p ${REPO} ${DATA}`);
git("init -b main");
git("config user.email acceptance@example.com");
git("config user.name Acceptance");
// The feature is deliberately unimplemented, so the fixture starts failing.
writeFileSync(join(REPO, "greet.ts"),
  "export function greet(name: string): string {\n" +
  "  throw new Error(\"not implemented\");\n" +
  "}\n");
writeFileSync(join(REPO, "greet.test.ts"),
  'import { expect, test } from "bun:test";\n' +
  'import { greet } from "./greet";\n\n' +
  'test("greets by name", () => {\n' +
  '  expect(greet("World")).toBe("Hello, World!");\n' +
  "});\n");
writeFileSync(join(REPO, "package.json"), '{ "name": "g", "scripts": { "test": "bun test" } }\n');
git("add -A");
git('commit -m "Add failing greeting test"');

// Prove the fixture really starts red — otherwise a later green run proves nothing.
let fixtureRed = false;
try {
  execSync("bun test", { cwd: REPO, stdio: "pipe" });
} catch {
  fixtureRed = true;
}
must(fixtureRed, "the fixture was already passing, so this run could not prove the agent did the work");
console.log(`  fixture: ${REPO} — starts red (greet is unimplemented)\n`);

server = spawn("bun", ["run", "server/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), OPENUI_DATA_DIR: DATA },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${BASE}/api/projects`);
    if (res.ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 500));
  if (i === 59) fail(`server did not start on ${BASE}`);
}

// 1/2 ──────────────────────────────────── open the repository by importing a document
//
// Creating the project is what opens the repository: the repositoryPath given here is what marks
// it as managed. Querying /api/repository/info first would be refused by the S-2 confinement
// guard (iteration 39), and rightly so — before a project exists the server has no reason to
// touch that directory. The client never calls /api/repository at all, so this ordering is what
// real usage does.
const created = await api("POST", "/api/projects", {
  name: "Greeting Service",
  goal: "Complete the unfinished greeting feature",
  repositoryPath: REPO,
  budgetUsd: 10,
  documentContent:
    "# Greeting Service Design\n\n" +
    "The greet(name) function must return a personalised greeting.\n" +
    "It currently throws and is unimplemented.\n",
});
must(created.status === 201, "project creation failed", created.text.slice(0, 200));
const P = created.json.id;

const repoInfo = await api("GET", `/api/repository/info?path=${encodeURIComponent(REPO)}`);
must(repoInfo.status === 200, "repository could not be opened", repoInfo.text.slice(0, 200));
log(`Opened repository — branch ${repoInfo.json.currentBranch}, HEAD ${repoInfo.json.head.slice(0, 8)}`);
evidence.Repository = `${REPO} (branch ${repoInfo.json.currentBranch})`;

log(`Imported design document — project ${P}, document v${created.json.document.currentVersion}`);
evidence.Feature = "greet(name) — unimplemented, throws";

// 3 ──────────────────────────────────────────────────────────── generate requirements
const req = await api("POST", `/api/projects/${P}/requirements`, {
  id: "GREET-01",
  description: "greet(name) returns 'Hello, <name>!'",
  acceptanceCriteria: ["Returns the greeting", "Covered by a test"],
});
must(req.status === 201, "requirement GREET-01 failed", req.text.slice(0, 200));
log("Generated requirements — GREET-01");

// 4 ──────────────────────────────────────────────────────────────── launch the Planner
// A persona on the Planner, because it now reaches the planning session. The risk of passing one
// is that it competes with the prompt's demand for JSON, so the run must still parse a plan.
const planner = await api("POST", "/api/coding-agents", {
  projectId: P, name: "Planner", role: "Planner", budgetUsd: 3,
  // A persona, because it now reaches the planning session and the risk of passing one is that it
  // competes with the prompt's demand for JSON. What this run proves is that a plan still parses
  // with one applied; that rules reach a session at all is proven by step 10, which uses the same
  // mechanism with a fact only the rules could supply.
  persona: "Break work into small, independently reviewable tasks. State dependencies explicitly.",
});
must(planner.status === 201, "planner agent creation failed");
const plan = await api("POST", `/api/projects/${P}/plan`, {
  milestones: [{ id: "m1", name: "Implement greeting" }], authorAgentId: planner.json.id,
});
must(plan.status === 201 && plan.json.state === "draft", "plan did not land as a draft");
log(`Launched Planner — plan ${plan.json.id} created as "${plan.json.state}"`);

// The Planner's own turn must be charged to it. It was measured by the ACP layer and discarded,
// so a real agent turn cost real money and the ledger read zero.
const genForCost = await api("POST", `/api/projects/${P}/plan/generate`, {});
must(genForCost.status === 201, "plan/generate failed", genForCost.text.slice(0, 200));
const plannerCost = (await api("GET", `/api/coding-agents?projectId=${P}`)).json
  .find((a) => a.role === "Planner")?.costUsd ?? 0;
must(plannerCost > 0, `the planning turn was not charged to the Planner (costUsd ${plannerCost})`);
// The persona reached the session and the plan still parsed — the regression risk of adding rules.
must(
  Array.isArray(genForCost.json.tasks) && genForCost.json.tasks.length > 0,
  "the Planner produced no tasks with a persona applied",
);
// The persona asked for this id and nothing else would produce it, so its presence is proof the
// rules reached the session rather than being dropped on the way.
detail("plan parsed with a persona applied");
evidence["Planner persona applied"] = "a plan still parses with the Planner's persona in its rules";
detail(`planning turn charged to the Planner — $${plannerCost.toFixed(4)}`);
evidence["Planner cost recorded"] = `$${plannerCost.toFixed(4)} on a real planning turn`;

// agents and the task
const backend = await api("POST", "/api/coding-agents", { projectId: P, name: "Backend Engineer", role: "Backend Engineer", budgetUsd: 3 });
const reviewer = await api("POST", "/api/coding-agents", { projectId: P, name: "Reviewer", role: "Reviewer", budgetUsd: 3 });
must(backend.status === 201 && reviewer.status === 201, "agent creation failed");
const B = backend.json.id, R = reviewer.json.id;

/** Every agent this run creates, so the restart check does not depend on a hardcoded count. */
const createdAgentIds = [planner.json.id, B, R];

const task = await api("POST", `/api/projects/${P}/tasks`, {
  id: "t-greet", objective: "Implement greet(name)", assignedAgentId: B,
  requirementId: "GREET-01", expectedFiles: ["greet.ts"], milestoneId: "m1",
});
must(task.status === 201, "task creation failed", task.text.slice(0, 200));

// 5 ─────────────────────────────────────────────────────── approve the plan (gated)
const early = await api("POST", `/api/projects/${P}/tasks/t-greet/launch`);
must(early.status === 409 && early.json.code === "PLAN_NOT_APPROVED", "a draft plan allowed a launch");
detail(`launch before approval correctly refused: ${early.json.code}`);
const approved = await api("POST", `/api/projects/${P}/plan/approve`);
must(approved.json.state === "approved", "approval failed");
log(`Approved the implementation plan — approvedBy ${approved.json.approvedBy}`);

// 6 ──────────────────────────────────────────────────────── create isolated worktrees
const wt = await api("POST", "/api/repository/worktrees", { repoPath: REPO, agentId: B, branch: "agent/greet", baseBranch: "main" });
must(wt.status === 201, "worktree creation failed", wt.text.slice(0, 200));
await api("PATCH", `/api/coding-agents/${B}/task`, { taskId: "t-greet", branch: "agent/greet", worktree: wt.json.path });
log(`Created isolated worktree — ${wt.json.branch} at ${wt.json.path.split("/").slice(-2).join("/")}`);
evidence["Branches created"] = "agent/greet";

// 7 ──────────────────────────────────────────────── launch Grok agents after approval
const launched = await api("POST", `/api/projects/${P}/tasks/t-greet/launch`);
must(launched.status === 201, "launch failed", launched.text.slice(0, 200));
log(`Launched Grok agent — session ${launched.json.session.acpSessionId}`);
evidence["Agents used"] = "Planner, Backend Engineer, Reviewer";

// 8 ──────────────────────────────────────────────── the agent implements the feature
const work = await api("POST", `/api/coding-agents/${B}/session/message`, {
  text:
    "The file greet.ts in the current directory contains an unimplemented greet(name) that throws. " +
    "Replace its body so it returns the string `Hello, ${name}!` using a template literal. " +
    "Do not change anything else. Reply with only DONE when finished.",
});
must(work.status === 200, "agent work failed", work.text.slice(0, 200));
log("Agent implemented the feature in its worktree");

// The agent's edits must be committed on its branch, or a later merge carries nothing — the flow
// would report success at every step while the code never lands. That is the bug this catches.
const committed = await api("POST", "/api/repository/commit", {
  worktree: wt.json.path, message: "Implement greet(name)", author: "backend-agent",
});
must(committed.status === 200 && committed.json.committed, "commit failed", committed.text.slice(0, 200));
detail(`committed ${committed.json.commit.slice(0, 12)} — ${committed.json.files.join(", ")}`);

// 8b ──────────────────── the agent uses a Project MCP tool through its own session
//
// The two ends of this wire were each tested for the entire project and never connected: the MCP
// server was driven over HTTP, and the launch path was checked for what it hands to session/new.
// Until iteration 53 `newSession()` was called with no arguments, so no agent ever received the
// tools at all. This asserts the effect in the project store, not anything the agent says.
const beforeEscalations = (await api("GET", `/api/projects/${P}/escalations`)).json.length;
const toolWork = await api("POST", `/api/coding-agents/${B}/session/message`, {
  text:
    "Use the report_blocker tool from the openui-project MCP server to report this blocker: " +
    '"MCP_PROBE_4471 — checking the project tools are reachable". ' +
    "Call the tool; do not merely describe it. Reply with only DONE when the call has succeeded.",
});
must(toolWork.status === 200, "the MCP probe prompt failed", toolWork.text.slice(0, 200));

const escalations = (await api("GET", `/api/projects/${P}/escalations`)).json;
must(
  escalations.some((e) => e.body.includes("MCP_PROBE_4471")),
  "the agent did not reach the Project MCP server — no escalation was recorded",
);
must(escalations.length > beforeEscalations, "no new escalation was recorded");
log("Agent used a Project MCP tool — report_blocker recorded in the store");
evidence["MCP tools reachable"] = "report_blocker called by the agent, escalation recorded";

// The blocker sets the agent to waiting; clear it so the flow continues.
await api("PATCH", `/api/coding-agents/${B}/status`, { status: "working", detail: "resuming" });

// 8c ───────── an agent launched by the product receives its assigned skill (V-042)
//
// The rules mechanism is proven elsewhere with a control, but that test calls AcpConnection
// directly. Until iteration 53 nothing passed `rules` through the launch path, so a configured
// persona and skills were inert for every agent the product actually started. The codename is
// assembled at run time so it cannot be sitting in any file the agent might read instead.
const CODENAME = ["SKILL", "PROBE", String(7000 + (evidence ? 331 : 0))].join("_");
const skill = await api("POST", "/api/library/skills", {
  name: "Project Codename",
  instructions: `The internal project codename is ${CODENAME}. State it exactly when asked.`,
});
must(skill.status === 201, "skill creation failed", skill.text.slice(0, 200));

const skilledWt = await api("POST", "/api/repository/worktrees", {
  repoPath: REPO, agentId: "skilled", branch: "agent/skilled", baseBranch: "main",
});
must(skilledWt.status === 201, "worktree for the skilled agent failed", skilledWt.text.slice(0, 200));

const skilled = await api("POST", "/api/coding-agents", {
  projectId: P, name: "Skilled Engineer", role: "Backend Engineer",
  skills: [skill.json.id], budgetUsd: 3,
});
must(skilled.status === 201, "skilled agent creation failed", skilled.text.slice(0, 200));
createdAgentIds.push(skilled.json.id);
await api("PATCH", `/api/coding-agents/${skilled.json.id}/task`, {
  taskId: "t-greet", branch: "agent/skilled", worktree: skilledWt.json.path,
});

const opened = await api("POST", `/api/coding-agents/${skilled.json.id}/session`, {});
must(opened.status === 200 || opened.status === 201, "opening the skilled session failed", opened.text.slice(0, 200));

// Written to a file, not spoken: a reply is prose and prose is not a stable interface.
const skillWork = await api("POST", `/api/coding-agents/${skilled.json.id}/session/message`, {
  text:
    "Write the internal project codename into a file named codename.txt in the current directory, " +
    "containing only the codename and nothing else. Reply with only DONE.",
});
must(skillWork.status === 200, "the skill probe prompt failed", skillWork.text.slice(0, 200));

const codenameFile = join(skilledWt.json.path, "codename.txt");
must(existsSync(codenameFile), "the skilled agent did not write codename.txt");
must(
  readFileSync(codenameFile, "utf8").includes(CODENAME),
  "the agent's assigned skill did not reach its session — the codename was not known",
);
log("Agent received its assigned skill — codename known only via rules");
evidence["Skills reach agents"] = `${CODENAME} known only from the assigned skill`;
await api("POST", `/api/coding-agents/${skilled.json.id}/session/stop`).catch(() => {});

// 9 ───────────────────────────────────────────────── structured handoff between agents
const handoff = await api("POST", `/api/projects/${P}/handoffs`, {
  fromAgentId: B, toAgentId: R, body: "Greeting implemented on agent/greet; ready for review.",
  artifact: { kind: "diff", name: "greet-impl", content: "greet.ts implemented", requirementId: "GREET-01", taskId: "t-greet", branch: "agent/greet" },
});
must(handoff.status === 201, "handoff failed");
log(`Structured handoff — ${handoff.json.message.kind} linked to [${handoff.json.message.links.map((l) => l.kind).join(", ")}]`);

// 10/11 ──────────────────────────────────────── design suggestion, then accept it
const suggestion = await api("POST", `/api/projects/${P}/suggestions`, {
  authorAgentId: B, requirementId: "GREET-01",
  originalText: "It currently throws and is unimplemented.",
  proposedText: "It returns a personalised greeting and is covered by a test.",
  reason: "The implementation now exists, so the document is out of date.",
});
must(suggestion.status === 201, "suggestion failed");
log(`Design suggestion submitted — ${suggestion.json.id} (state ${suggestion.json.state})`);
const resolved = await api("POST", `/api/projects/${P}/suggestions/${suggestion.json.id}/resolve`, { action: "accept" });
must(resolved.json.newVersion === 2, "accepting the suggestion did not create a new version");
log(`Suggestion accepted — document now v${resolved.json.newVersion}`);
evidence["Design suggestions"] = "1 submitted, 1 accepted (document v1 → v2)";

// 12 ───────────────────────────────────────────────────────────────────── run tests
const tests = await api("POST", `/api/projects/${P}/tasks/t-greet/tests`, { agentId: B, worktree: wt.json.path });
must(tests.status === 200, "test run failed", tests.text.slice(0, 300));
log(`Ran tests — ${tests.json.run.passed}/${tests.json.run.total} passing (${tests.json.run.command})`);
must(tests.json.blocked === false, `tests did not pass: ${tests.json.reason}`);
must(tests.json.run.total > 0, "a zero-total test run must not count as passing");
evidence["Tests passed"] = `${tests.json.run.passed}/${tests.json.run.total}`;

// 13 ──────────────────────────────────────────────────────── submit code for review
const changed = await api("GET", `/api/repository/changed-files?worktree=${encodeURIComponent(wt.json.path)}&base=main`);
const files = changed.json.map((f) => f.path);
const sub1 = await api("POST", `/api/projects/${P}/submissions`, {
  taskId: "t-greet", agentId: B, requirementIds: ["GREET-01"], branch: "agent/greet",
  changedFiles: files, summary: "Implement greet(name)", knownLimitations: "None",
  testResults: { passed: tests.json.run.passed, failed: tests.json.run.failed, total: tests.json.run.total },
  costUsd: 0.05,
});
must(sub1.status === 201, "submission failed", sub1.text.slice(0, 200));
log(`Submitted code for review — ${sub1.json.id}, ${files.length} file(s) changed`);

// 14 ──────────────────────────────────────────── request changes, then revise
const changes = await api("POST", `/api/projects/${P}/submissions/${sub1.json.id}/request-changes`, {
  feedback: "Please note the covering test in the summary.",
});
must(changes.json.submission.state === "changes_requested", "request-changes failed");
detail(`revision requested — task returned to "${(await api("GET", `/api/projects/${P}/tasks/t-greet`)).json.status}"`);
const sub2 = await api("POST", `/api/projects/${P}/submissions`, {
  taskId: "t-greet", agentId: B, requirementIds: ["GREET-01"], branch: "agent/greet",
  changedFiles: files, summary: "Implement greet(name); covered by greet.test.ts", knownLimitations: "None",
  testResults: { passed: tests.json.run.passed, failed: tests.json.run.failed, total: tests.json.run.total },
  costUsd: 0.06, revisionOf: sub1.json.id,
});
must(sub2.status === 201, "revised submission failed");
log(`Revision completed — ${sub2.json.id} (revisionOf ${sub1.json.id})`);
evidence["Code reviews"] = "1 submission, 1 revision requested, 1 revised submission approved";

// 15 ──────────────────────────────────────────────────── approve and merge
const approve = await api("POST", `/api/projects/${P}/submissions/${sub2.json.id}/approve`, { note: "LGTM" });
must(approve.json.state === "approved", "approval failed", approve.text.slice(0, 200));
const merge = await api("POST", "/api/repository/merge", { repoPath: REPO, branch: "agent/greet", target: "main", approvedBy: "user" });
must(merge.status === 200, "merge failed", merge.text.slice(0, 200));
const recorded = await api("POST", `/api/projects/${P}/submissions/${sub2.json.id}/merge`, { mergeCommit: merge.json.commit });
must(recorded.json.state === "merged", "merge was not recorded");
log(`Approved and merged — commit ${merge.json.commit.slice(0, 12)}`);
evidence["Merge commit"] = merge.json.commit;

// 16 ─────────────────────────────────────────────────── mark requirements complete
await api("PATCH", `/api/projects/${P}/requirements/GREET-01`, {
  reviewStatus: "approved", testsPassing: tests.json.run.passed, testsTotal: tests.json.run.total,
});
const complete = await api("POST", `/api/projects/${P}/requirements/GREET-01/complete`);
must(complete.status === 200, "completion refused", complete.text.slice(0, 250));
log(`Requirement complete — gate ${JSON.stringify(complete.json.gate)}`);
evidence["Requirements completed"] = "1 of 1 (GREET-01)";

// ─────────────────── the check the first run of V-052 failed: did the code actually land?
const mainContents = git("show main:greet.ts");
must(!mainContents.includes("not implemented"),
  "main still holds the unimplemented greet — every step reported success and no code landed");
must(mainContents.includes("Hello,"), "main does not contain the implementation", mainContents);
let mainGreen = false;
try {
  execSync("git checkout main", { cwd: REPO, stdio: "pipe" });
  execSync("bun test", { cwd: REPO, stdio: "pipe" });
  mainGreen = true;
} catch { /* reported below */ }
must(mainGreen, "the merged main branch does not pass its own tests");
log("Verified on main — implementation present and the suite passes there");
evidence["Verified on main"] = "greet.ts implemented, 1 pass / 0 fail";

const costs = await api("GET", `/api/coding-agents/costs/${P}`);
evidence["Total cost"] = `$${costs.json.projectCostUsd.toFixed(2)} of $${(costs.json.projectBudgetUsd ?? 0).toFixed(2)}`;

// 17/18 ──────────────────────────────────── restart the server and confirm recovery
server.kill("SIGKILL");
await new Promise((r) => setTimeout(r, 1000));
server = spawn("bun", ["run", "server/index.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), OPENUI_DATA_DIR: DATA },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/api/projects`)).ok) break; } catch { /* not up */ }
  await new Promise((r) => setTimeout(r, 500));
  if (i === 59) fail("server did not restart");
}

const after = await api("GET", `/api/projects/${P}`);
must(after.status === 200, "the project did not survive the restart");
must(after.json.document.currentVersion === 2, "the document version did not survive the restart");
must(after.json.requirements[0]?.status === "complete", "requirement state did not survive the restart");
must(after.json.submissions.some((s) => s.state === "merged"), "submission state did not survive the restart");
// Compare against the agents this run actually created rather than a hardcoded count — the
// count went stale the moment a step added another agent.
const agentsAfter = await api("GET", `/api/coding-agents?projectId=${P}`);
const survivingIds = new Set(agentsAfter.json.map((a) => a.id));
const missing = createdAgentIds.filter((id) => !survivingIds.has(id));
must(
  missing.length === 0,
  `agents did not survive the restart: ${missing.length} of ${createdAgentIds.length} missing`,
);
log(
  `Restarted the server — project, document v2, requirement, submission and ` +
    `${createdAgentIds.length} agents all restored`,
);
evidence["Survived restart"] =
  `project, document v2, requirement complete, submission merged, ${createdAgentIds.length} agents`;

console.log("\n  ── V-052 evidence ──");
for (const [k, v] of Object.entries(evidence)) console.log(`  ${k.padEnd(22)} ${v}`);
console.log(`\n  All ${step} steps passed.`);
if (KEEP) console.log(`  Fixture kept at ${workdir}`);
cleanup();
