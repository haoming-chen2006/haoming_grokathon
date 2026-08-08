import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { mcpRoutes } from "./mcp";
import { ProjectStore } from "../services/projectStore";
import { getAgentRegistry } from "../services/agentRegistry";
import { createAgentWorktree } from "../services/repository";
import { PROJECT_MCP_TOOLS } from "../services/projectMcpServer";
import type { Actor } from "../types/project";

/**
 * Behavioural coverage for the project MCP tools.
 *
 * The existing MCP tests assert `tools/list` and agent identity — that the surface is *advertised*.
 * Nothing invoked a tool. This is the interface agents use for everything they do, so a tool that
 * throws, ignores its arguments, or silently no-ops would have gone unnoticed while the checklist
 * stayed green.
 *
 * Every test here goes through a real `tools/call` over the mounted HTTP endpoint.
 */

const USER: Actor = { kind: "user", id: "user" };
let dataDir: string;
let repo: string;
let app: Hono;
let store: ProjectStore;
let projectId: string;
let BACKEND = "";
let REVIEWER = "";
let rpcId = 0;

async function rpc(agentId: string, body: unknown) {
  const res = await app.request(`/mcp/${projectId}/${agentId}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    if (line) json = JSON.parse(line.slice(5).trim());
  }
  return { status: res.status, json };
}

/** Invoke a tool and return its parsed payload, or the error text if it refused. */
async function call(agentId: string, name: string, args: Record<string, unknown> = {}) {
  const { json } = await rpc(agentId, {
    jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args },
  });
  const content = json?.result?.content?.[0]?.text ?? "";
  const isError = json?.result?.isError === true || json?.error !== undefined;
  let data: any = null;
  try {
    data = content ? JSON.parse(content) : null;
  } catch {
    data = null; // non-JSON payloads are surfaced through `text`
  }
  return { isError, text: String(content), data, raw: json };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-mcptools-"));
  process.env.OPENUI_DATA_DIR = dataDir;

  repo = mkdtempSync(join(tmpdir(), "openui-mcptools-repo-"));
  execSync("git init -b main", { cwd: repo, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: repo, stdio: "pipe" });
  execSync("git config user.name T", { cwd: repo, stdio: "pipe" });
  writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
  writeFileSync(join(repo, "package.json"), '{ "name": "f", "scripts": { "test": "bun test", "build": "tsc" } }\n');
  execSync("git add . && git commit -m init", { cwd: repo, stdio: "pipe" });

  store = new ProjectStore(join(dataDir, "projects"));
  projectId = store.createProject({
    name: "Authentication", goal: "Ship passwordless auth", repositoryPath: repo,
    documentContent: "# Auth Design\n\nTokens rotate hourly.\n", budgetUsd: 10,
  }).id;

  BACKEND = getAgentRegistry().create({ projectId, name: "Backend", role: "Backend Engineer" }).id;
  REVIEWER = getAgentRegistry().create({ projectId, name: "Reviewer", role: "Reviewer" }).id;

  store.addRequirement(projectId, {
    id: "AUTH-01", description: "Login returns a token", ownerAgentId: BACKEND,
    acceptanceCriteria: ["Returns a token", "Covered by a test"],
  }, USER);
  store.createPlan(projectId, { milestones: [{ id: "m1", name: "Auth" }] }, USER);
  store.addTask(projectId, {
    id: "t-auth", objective: "Implement login", assignedAgentId: BACKEND,
    requirementId: "AUTH-01", milestoneId: "m1", requiredTests: ["auth.test.ts"],
  }, USER);
  store.approvePlan(projectId, USER);

  app = new Hono();
  app.route("/mcp", mcpRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("every advertised tool is callable", () => {
  test("no tool fails merely by being invoked with plausible arguments", async () => {
    // A tool that throws on any call is broken regardless of its arguments. Schema rejections are
    // fine here — what must not happen is an unhandled crash.
    const results: string[] = [];
    for (const name of PROJECT_MCP_TOOLS) {
      const { raw } = await call(BACKEND, name, {});
      // A JSON-RPC internal error (-32603) means the handler blew up rather than refusing cleanly.
      if (raw?.error?.code === -32603) results.push(`${name}: ${raw.error.message}`);
    }
    expect(results).toEqual([]);
  });
});

describe("read tools return real project state", () => {
  test("get_project reports goal, repository and budget", async () => {
    const { data } = await call(BACKEND, "get_project");
    expect(data.goal).toBe("Ship passwordless auth");
    expect(data.repositoryPath).toBe(repo);
    expect(data.budgetUsd).toBe(10);
  });

  test("get_technical_design returns the approved document", async () => {
    const { text, data } = await call(BACKEND, "get_technical_design");
    expect(`${text}${JSON.stringify(data)}`).toContain("Tokens rotate hourly");
  });

  test("get_requirements and get_requirement agree", async () => {
    const all = await call(BACKEND, "get_requirements");
    const list = Array.isArray(all.data) ? all.data : all.data?.requirements;
    expect(list).toHaveLength(1);

    const one = await call(BACKEND, "get_requirement", { requirementId: "AUTH-01" });
    expect(one.data.description).toBe("Login returns a token");
  });

  test("get_acceptance_criteria returns the criteria, not the whole requirement", async () => {
    const { text } = await call(BACKEND, "get_acceptance_criteria", { requirementId: "AUTH-01" });
    expect(text).toContain("Returns a token");
    expect(text).toContain("Covered by a test");
  });

  test("an unknown requirement is a handled refusal, not a crash", async () => {
    const { isError, raw } = await call(BACKEND, "get_requirement", { requirementId: "NOPE" });
    expect(raw?.error?.code).not.toBe(-32603);
    expect(isError).toBe(true);
  });

  test("get_repository_summary reports the branch and head", async () => {
    const { data, text } = await call(BACKEND, "get_repository_summary");
    expect(`${text}${JSON.stringify(data)}`).toContain("main");
  });

  test("get_test_commands and get_build_commands surface the project's own scripts", async () => {
    const t = await call(BACKEND, "get_test_commands");
    expect(t.text).toContain("test");
    const b = await call(BACKEND, "get_build_commands");
    expect(b.isError).toBe(false);
  });

  test("get_worktree_status lists worktrees without failing on a fresh repo", async () => {
    const { isError } = await call(BACKEND, "get_worktree_status");
    expect(isError).toBe(false);
  });
});

describe("task progress and completion", () => {
  test("update_task_progress moves a task the agent owns", async () => {
    const { isError, data } = await call(BACKEND, "update_task_progress", {
      taskId: "t-auth", status: "working", branch: "agent/auth",
    });
    expect(isError).toBe(false);
    expect(data.task.status).toBe("working");
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-auth")!.status).toBe("working");
  });

  test("an agent cannot move a task it does not own", async () => {
    // Ownership is the whole point of assigning tasks; without this any agent could mark another's
    // work complete.
    const { isError } = await call(REVIEWER, "update_task_progress", {
      taskId: "t-auth", status: "complete",
    });
    expect(isError).toBe(true);
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-auth")!.status).not.toBe("complete");
  });

  test("record_test_result stores the run against the task", async () => {
    const { isError } = await call(BACKEND, "record_test_result", {
      taskId: "t-auth", command: "bun test", passed: 2, failed: 0, total: 2, exitCode: 0,
    });
    expect(isError).toBe(false);
    const task = store.getProject(projectId).tasks.find((t) => t.id === "t-auth")!;
    expect(task.testRun?.passed).toBe(2);
    expect(task.testRun?.ranByAgentId).toBe(BACKEND);
  });

  test("complete_task is refused while required tests are failing", async () => {
    await call(BACKEND, "record_test_result", {
      taskId: "t-auth", command: "bun test", passed: 0, failed: 1, total: 1, exitCode: 1,
    });

    const { isError } = await call(BACKEND, "complete_task", { taskId: "t-auth" });
    expect(isError).toBe(true);
    expect(store.getProject(projectId).tasks.find((t) => t.id === "t-auth")!.status).not.toBe("complete");
  });

  test("report_blocker sets the agent to waiting and reaches the user", async () => {
    const { isError } = await call(BACKEND, "report_blocker", {
      reason: "No credential for the staging database",
    });
    expect(isError).toBe(false);
    expect(getAgentRegistry().get(BACKEND).status).toBe("waiting");
    expect(store.listEscalations(projectId).length).toBeGreaterThan(0);
  });
});

describe("messaging tools", () => {
  test("ask_agent creates a linked question", async () => {
    const { isError, data } = await call(BACKEND, "ask_agent", {
      toAgentId: REVIEWER, body: "What shape should the token be?",
      linkKind: "requirement", linkId: "AUTH-01",
    });
    expect(isError).toBe(false);
    expect(data.kind).toBe("question");
    expect(data.toAgentId).toBe(REVIEWER);
    expect(data.links[0]).toEqual({ kind: "requirement", id: "AUTH-01" });
  });

  test("reply_to_agent joins the thread it answers", async () => {
    const q = await call(BACKEND, "ask_agent", {
      toAgentId: REVIEWER, body: "?", linkKind: "task", linkId: "t-auth",
    });
    const a = await call(REVIEWER, "reply_to_agent", {
      replyToId: q.data.id, toAgentId: BACKEND, body: "A JWT.",
    });
    expect(a.isError).toBe(false);
    expect(a.data.threadId).toBe(q.data.threadId);
    // The reply inherits the question's links rather than inventing one. Writing the message id
    // in as a task link made every reply point at a task that does not exist.
    expect(a.data.links).toEqual(q.data.links);
    expect(a.data.links.every((l: any) => l.kind !== "task" || l.id !== q.data.id)).toBe(true);
  });

  test("an unlinked message is refused (V-025)", async () => {
    const { isError } = await call(BACKEND, "send_agent_message", {
      toAgentId: REVIEWER, kind: "question", body: "just chatting",
    });
    expect(isError).toBe(true);
  });

  test("report_failing_test reaches the responsible agent with its links", async () => {
    const { isError, data } = await call(REVIEWER, "report_failing_test", {
      toAgentId: BACKEND, testPath: "auth.test.ts",
      details: "fails on refresh", requirementId: "AUTH-01",
    });
    expect(isError).toBe(false);
    expect(data.kind).toBe("failing_test");
    expect(data.links.map((l: any) => l.kind)).toContain("test");
  });

  test("request_agent_review addresses a named reviewer", async () => {
    const { isError, data } = await call(BACKEND, "request_agent_review", {
      toAgentId: REVIEWER, body: "Please review agent/auth", branch: "agent/auth", taskId: "t-auth",
    });
    expect(isError).toBe(false);
    expect(data.kind).toBe("review_request");
    expect(data.toAgentId).toBe(REVIEWER);
  });

  test("escalate_to_user addresses the user, with no recipient agent", async () => {
    const { isError, data } = await call(BACKEND, "escalate_to_user", {
      body: "Two requirements contradict each other", linkKind: "requirement", linkId: "AUTH-01",
    });
    expect(isError).toBe(false);
    expect(data.kind).toBe("escalation");
    expect(data.toAgentId).toBeUndefined();
  });
});

describe("artifact tools", () => {
  test("create_artifact then get_artifact round-trips the content", async () => {
    const made = await call(BACKEND, "create_artifact", {
      name: "auth-contract", kind: "api_contract",
      content: '{"path":"/login"}', requirementId: "AUTH-01", taskId: "t-auth",
    });
    expect(made.isError).toBe(false);
    expect(made.data.producedByAgentId).toBe(BACKEND);

    const got = await call(REVIEWER, "get_artifact", { artifactId: made.data.id });
    expect(got.data.content).toBe('{"path":"/login"}');
  });

  test("handoff_code_artifact delivers the artifact with its context attached", async () => {
    const { isError, data } = await call(BACKEND, "handoff_code_artifact", {
      toAgentId: REVIEWER, body: "Ready for review",
      name: "impl", kind: "diff", content: "a.ts changed",
      requirementId: "AUTH-01", taskId: "t-auth", branch: "agent/auth",
    });
    expect(isError).toBe(false);
    const kinds = (data.message ?? data).links.map((l: any) => l.kind);
    // A bare artifact id would make the receiving agent go hunting for context.
    expect(kinds).toContain("artifact");
    expect(kinds).toContain("requirement");
  });

  test("handoff_api_contract is accepted and linked", async () => {
    const { isError } = await call(BACKEND, "handoff_api_contract", {
      toAgentId: REVIEWER, body: "Contract v2", name: "auth-contract-v2",
      contract: '{"path":"/login","method":"POST"}', requirementId: "AUTH-01",
    });
    expect(isError).toBe(false);
  });

  test("attach_artifact_to_requirement actually attaches it", async () => {
    // It used to only send a message announcing the attachment, so the artifact stayed
    // unfindable from its requirement while the tool reported success.
    const made = await call(BACKEND, "create_artifact", { name: "n", kind: "patch", content: "c" });
    expect(store.listArtifacts(projectId, { requirementId: "AUTH-01" })).toHaveLength(0);

    const { isError } = await call(BACKEND, "attach_artifact_to_requirement", {
      artifactId: made.data.id, requirementId: "AUTH-01",
    });
    expect(isError).toBe(false);

    const attached = store.listArtifacts(projectId, { requirementId: "AUTH-01" });
    expect(attached.map((a) => a.id)).toContain(made.data.id);
  });

  test("attaching to an unknown requirement is refused and changes nothing", async () => {
    const made = await call(BACKEND, "create_artifact", { name: "n2", kind: "patch", content: "c" });
    const { isError } = await call(BACKEND, "attach_artifact_to_requirement", {
      artifactId: made.data.id, requirementId: "NOPE",
    });
    expect(isError).toBe(true);
    expect(store.listArtifacts(projectId, { requirementId: "NOPE" })).toHaveLength(0);
  });
});

describe("the document stays protected (V-014)", () => {
  test("submit_design_suggestion queues a proposal rather than editing", async () => {
    const before = store.getDocument(projectId).version;
    const { isError, data } = await call(BACKEND, "submit_design_suggestion", {
      requirementId: "AUTH-01", originalText: "Tokens rotate hourly.",
      proposedText: "Tokens rotate every 15 minutes.", reason: "Security review",
    });
    expect(isError).toBe(false);
    expect(data.state).toBe("pending");
    // The document itself must be untouched until a human accepts.
    expect(store.getDocument(projectId).version).toBe(before);
    expect(store.getDocument(projectId).content).toContain("hourly");
  });

  test("revise_design_suggestion submits a follow-up after changes were requested", async () => {
    const first = await call(BACKEND, "submit_design_suggestion", {
      requirementId: "AUTH-01", originalText: "Tokens rotate hourly.",
      proposedText: "rough", reason: "r",
    });
    store.resolveSuggestion(projectId, first.data.id, "request_revision", USER, "Say why");

    const { isError } = await call(BACKEND, "revise_design_suggestion", {
      originalText: "Tokens rotate hourly.", proposedText: "Tokens rotate every 15 minutes.",
      reason: "Security review found hourly too long", requirementId: "AUTH-01",
    });
    expect(isError).toBe(false);
    expect(store.getDocument(projectId).content).toContain("hourly");
  });

  test("request_direct_document_permission asks the user instead of granting itself access", async () => {
    const { isError } = await call(BACKEND, "request_direct_document_permission", {
      reason: "Large refactor spanning the whole document",
    });
    expect(isError).toBe(false);

    const escalations = store.listEscalations(projectId);
    expect(escalations.some((e) => e.body.includes("document-write"))).toBe(true);
    // Asking must not itself confer the permission.
    expect(getAgentRegistry().get(BACKEND).permissions.canWriteDocument).toBe(false);
  });
});

describe("code submission carries evidence (V-037)", () => {
  test("a submission without evidence is refused", async () => {
    const { isError } = await call(BACKEND, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: [], branch: "", changedFiles: [], summary: "",
      testsPassed: 0, testsFailed: 0, testsTotal: 0, costUsd: 0,
    });
    expect(isError).toBe(true);
  });

  test("a complete submission is accepted and visible to the reviewer", async () => {
    const { isError, data } = await call(BACKEND, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: ["AUTH-01"], branch: "agent/auth",
      changedFiles: ["a.ts"], summary: "Implement login", knownLimitations: "None",
      testsPassed: 2, testsFailed: 0, testsTotal: 2, costUsd: 0.05,
    });
    expect(isError).toBe(false);
    expect(data.state).toBe("pending");
    expect(store.getProject(projectId).submissions).toHaveLength(1);
  });
});

describe("submitting captures the work as a commit", () => {
  test("an agent's uncommitted worktree changes are committed on submission", async () => {
    // An agent has no way to commit: there is no commit tool, and commitAgentWork is only
    // reachable over HTTP, which the acceptance script calls and an agent cannot. So a submission
    // described work that existed only as uncommitted changes, and the merge behind the review
    // gate refused with "no commits ahead of main" — the gate reachable, the merge not.
    const wt = createAgentWorktree(repo, { agentId: BACKEND, branch: "agent/submit", baseBranch: "main" });
    getAgentRegistry().assignTask(BACKEND, "t-auth", { branch: "agent/submit", worktree: wt.path });
    writeFileSync(join(wt.path, "a.ts"), "export const x = 2;\n");

    const before = execSync("git rev-list --count main..agent/submit", { cwd: repo }).toString().trim();
    expect(before).toBe("0");

    const res = await call(BACKEND, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: ["AUTH-01"], branch: "agent/submit",
      changedFiles: ["a.ts"], summary: "Implement it", knownLimitations: "None",
      testsPassed: 1, testsFailed: 0, testsTotal: 1, costUsd: 0.05,
    });
    expect(res.isError).toBe(false);

    const after = execSync("git rev-list --count main..agent/submit", { cwd: repo }).toString().trim();
    expect(Number(after), "the agent's work was not committed").toBeGreaterThan(0);
  });

  test("the changed files recorded are the repository's, not the agent's claim", async () => {
    // Observed on a real run: an agent that edited only src/cart.ts submitted
    // ["src/cart.ts", "tests/cart.test.ts"], and the review queue showed a test file it had never
    // touched. A reviewer approves on this evidence. Over-reporting is noise; under-reporting
    // hides a change from the only summary the reviewer reads.
    const wt = createAgentWorktree(repo, { agentId: BACKEND, branch: "agent/claim", baseBranch: "main" });
    getAgentRegistry().assignTask(BACKEND, "t-auth", { branch: "agent/claim", worktree: wt.path });
    writeFileSync(join(wt.path, "a.ts"), "export const x = 3;\n");

    const { isError, data } = await call(BACKEND, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: ["AUTH-01"], branch: "agent/claim",
      changedFiles: ["a.ts", "tests/never-touched.test.ts"],
      summary: "Implement it", knownLimitations: "None",
      testsPassed: 1, testsFailed: 0, testsTotal: 1, costUsd: 0.05,
    });

    expect(isError).toBe(false);
    expect(data.changedFiles).toEqual(["a.ts"]);
    // The claim is kept rather than quietly discarded: that the agent misreported its own work
    // bears on the claims in the same submission that nothing can verify.
    expect(data.claimedChangedFiles).toEqual(["a.ts", "tests/never-touched.test.ts"]);
  });

  test("an accurate list is recorded without flagging the agent", async () => {
    const wt = createAgentWorktree(repo, { agentId: BACKEND, branch: "agent/exact", baseBranch: "main" });
    getAgentRegistry().assignTask(BACKEND, "t-auth", { branch: "agent/exact", worktree: wt.path });
    writeFileSync(join(wt.path, "a.ts"), "export const x = 4;\n");

    const { data } = await call(BACKEND, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: ["AUTH-01"], branch: "agent/exact",
      changedFiles: ["a.ts"], summary: "s", knownLimitations: "None",
      testsPassed: 1, testsFailed: 0, testsTotal: 1, costUsd: 0.05,
    });

    expect(data.changedFiles).toEqual(["a.ts"]);
    expect(data.claimedChangedFiles, "an accurate agent must not be flagged").toBeUndefined();
  });

  test("an agent with no worktree still submits, rather than failing", () => {
    // Committing is a convenience, not a precondition: a submission recorded without one is worse
    // than none, but refusing the submission would be worse still.
    const other = getAgentRegistry().create({ projectId, name: "NoTree", role: "Reviewer" });
    return call(other.id, "submit_code_for_review", {
      taskId: "t-auth", requirementIds: ["AUTH-01"], branch: "agent/none",
      changedFiles: ["a.ts"], summary: "s", knownLimitations: "None",
      testsPassed: 1, testsFailed: 0, testsTotal: 1, costUsd: 0.01,
    }).then((r) => expect(r.isError).toBe(false));
  });
});

describe("an agent can see what is in the repository", () => {
  test("list_repository_files returns the tracked files", async () => {
    // The Planner was told to inspect the codebase and had no tool that showed it any: it invented
    // Python paths for a TypeScript repository, and those fabrications reached every briefing.
    const { isError, data } = await call(BACKEND, "list_repository_files", {});
    expect(isError).toBe(false);
    expect(data.files).toContain("a.ts");
    expect(data.total).toBeGreaterThan(0);
    expect(data.truncated).toBe(false);
  });

  test("the listing is capped, and says when it was cut", async () => {
    // A large repository would flood the model's context; orientation is the point, not completeness.
    const { data } = await call(BACKEND, "list_repository_files", { limit: 1 });
    expect(data.files).toHaveLength(1);
    expect(data.truncated).toBe(true);
    expect(data.total).toBeGreaterThan(1);
  });
});
