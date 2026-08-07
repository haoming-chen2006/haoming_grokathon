import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { repositoryRoutes } from "./repository";
import { ProjectStore } from "../services/projectStore";
import type { Actor } from "../types/project";

/**
 * HTTP coverage for project and repository endpoints that `bun run audit:endpoints` found with no
 * caller anywhere. The stores beneath them are tested; these assert the routes in front — status
 * codes, query handling and the shape a client would actually receive.
 */

const USER: Actor = { kind: "user", id: "user" };
let dataDir: string;
let repo: string;
let app: Hono;
let store: ProjectStore;
let projectId: string;

async function req(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-preads-"));
  process.env.OPENUI_DATA_DIR = dataDir;

  repo = mkdtempSync(join(tmpdir(), "openui-preads-repo-"));
  execSync("git init -b main", { cwd: repo, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: repo, stdio: "pipe" });
  execSync("git config user.name T", { cwd: repo, stdio: "pipe" });
  writeFileSync(join(repo, "a.ts"), "export const x = 1;\n");
  execSync("git add . && git commit -m init", { cwd: repo, stdio: "pipe" });

  store = new ProjectStore(join(dataDir, "projects"));
  projectId = store.createProject({
    name: "Reads", goal: "g", repositoryPath: repo, documentContent: "# v1", budgetUsd: 10,
  }).id;

  app = new Hono();
  app.route("/api/projects", projectRoutes);
  app.route("/api/repository", repositoryRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("document versions", () => {
  test("an earlier version is retrievable after the document moves on", async () => {
    store.updateDocument(projectId, "# v2", USER, { changeSummary: "second" });

    const v1 = await req("GET", `/api/projects/${projectId}/document/versions/1`);
    expect(v1.status).toBe(200);
    expect(v1.json.content).toBe("# v1");

    const v2 = await req("GET", `/api/projects/${projectId}/document/versions/2`);
    expect(v2.json.content).toBe("# v2");
  });

  test("a version that does not exist is a 404, not an empty document", async () => {
    // Returning empty content would let a diff view silently show everything as deleted.
    const res = await req("GET", `/api/projects/${projectId}/document/versions/99`);
    expect(res.status).toBe(404);
    expect(typeof res.json.error).toBe("string");
  });
});

describe("execution order", () => {
  test("tasks come back in dependency order", async () => {
    store.createPlan(projectId, { milestones: [] }, USER);
    store.addTask(projectId, { id: "a", objective: "A" }, USER);
    store.addTask(projectId, { id: "b", objective: "B", dependsOn: ["a"] }, USER);
    store.addTask(projectId, { id: "c", objective: "C", dependsOn: ["b"] }, USER);

    const { status, json } = await req("GET", `/api/projects/${projectId}/execution-order`);
    expect(status).toBe(200);
    expect(json).toEqual(["a", "b", "c"]);
  });

  test("a dependency cycle is reported rather than returning a partial order", async () => {
    store.createPlan(projectId, { milestones: [] }, USER);
    store.addTask(projectId, { id: "x", objective: "X" }, USER);
    store.addTask(projectId, { id: "y", objective: "Y", dependsOn: ["x"] }, USER);
    try {
      store.updateTask(projectId, "x", { dependsOn: ["y"] }, USER);
    } catch {
      return; // the store refuses the cycle outright, which is at least as good
    }
    const res = await req("GET", `/api/projects/${projectId}/execution-order`);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("submissions and the completion gate", () => {
  function submit() {
    store.createPlan(projectId, { milestones: [] }, USER);
    store.addTask(projectId, { id: "t1", objective: "o" }, USER);
    store.approvePlan(projectId, USER);
    store.addRequirement(projectId, { id: "R-1", description: "d" }, USER);
    return store.submitCode(projectId, {
      taskId: "t1", agentId: "a1", requirementIds: ["R-1"], branch: "agent/x",
      changedFiles: ["a.ts"], summary: "s", testResults: { passed: 1, failed: 0, total: 1 }, costUsd: 0.1,
    });
  }

  test("a single submission is retrievable with the evidence a reviewer needs", async () => {
    const sub = submit();
    const { status, json } = await req("GET", `/api/projects/${projectId}/submissions/${sub.id}`);
    expect(status).toBe(200);
    expect(json.id).toBe(sub.id);
    for (const field of ["taskId", "agentId", "requirementIds", "branch", "changedFiles", "summary", "testResults"]) {
      expect(json).toHaveProperty(field);
    }
  });

  test("an unknown submission is a 404", async () => {
    submit();
    expect((await req("GET", `/api/projects/${projectId}/submissions/sub_nope`)).status).toBe(404);
  });

  test("the completion gate reports each condition separately", async () => {
    submit();
    const { status, json } = await req("GET", `/api/projects/${projectId}/requirements/R-1/completion-gate`);
    expect(status).toBe(200);
    // A single boolean would not tell the user which condition is holding completion back, so the
    // gate reports each one and names the unmet ones alongside.
    for (const key of ["implementationAccepted", "testsPassing", "reviewPassed", "merged"]) {
      expect(json.gate).toHaveProperty(key);
      expect(typeof json.gate[key]).toBe("boolean");
    }
    expect(Array.isArray(json.unmet)).toBe(true);
    // This submission has not been reviewed or merged, so completion must be blocked and say why.
    expect(json.unmet.length).toBeGreaterThan(0);
    expect(json.unmet.join(" ")).toMatch(/review|merge/i);
  });

  test("the gate for an unknown requirement is a 404", async () => {
    expect((await req("GET", `/api/projects/${projectId}/requirements/R-nope/completion-gate`)).status).toBe(404);
  });
});

describe("messages, escalations and limits", () => {
  const links = [{ kind: "task" as const, id: "t1" }];

  test("a message can be marked read over HTTP", async () => {
    const m = store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "?", links,
    });
    expect(store.listMessages(projectId, { unreadOnly: true })).toHaveLength(1);

    const { status } = await req("PATCH", `/api/projects/${projectId}/messages/${m.id}/read`);
    expect(status).toBe(200);
    expect(store.listMessages(projectId, { unreadOnly: true })).toHaveLength(0);
  });

  test("marking an unknown message read is a 404", async () => {
    expect((await req("PATCH", `/api/projects/${projectId}/messages/msg_nope/read`)).status).toBe(404);
  });

  test("escalations are listed separately from ordinary messages", async () => {
    store.sendMessage(projectId, { kind: "question", fromAgentId: "a", toAgentId: "b", body: "?", links });
    store.sendMessage(projectId, {
      kind: "escalation", fromAgentId: "a", body: "need a credential",
      links: [{ kind: "blocker", id: "B-1" }],
    });

    const { status, json } = await req("GET", `/api/projects/${projectId}/escalations`);
    expect(status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].kind).toBe("escalation");
  });

  test("message limits can be configured and take effect (V-027)", async () => {
    const { status, json } = await req("PUT", `/api/projects/${projectId}/message-limits`, {
      maxThreadLength: 3, maxUnansweredPerPair: 99,
    });
    expect(status).toBe(200);
    expect(json.maxThreadLength).toBe(3);

    // The configured limit must actually govern the loop guard, not just be stored.
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) {
      kinds.push(store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b", body: `t${i}`, links, threadId: "th",
      }).kind);
    }
    expect(kinds.slice(0, 3).every((k) => k === "question")).toBe(true);
    expect(kinds.slice(3).every((k) => k === "escalation")).toBe(true);
  });
});

describe("artifacts", () => {
  test("an artifact can be created, listed, filtered and fetched", async () => {
    const created = await req("POST", `/api/projects/${projectId}/artifacts`, {
      kind: "api_contract", name: "auth-v2", content: '{"path":"/login"}',
      producedByAgentId: "a1", requirementId: "R-1", taskId: "t1",
    });
    expect(created.status).toBe(201);
    expect(created.json.id).toBeTruthy();

    expect((await req("GET", `/api/projects/${projectId}/artifacts`)).json).toHaveLength(1);

    // The filters are what make an artifact findable from a requirement or task.
    expect((await req("GET", `/api/projects/${projectId}/artifacts?requirementId=R-1`)).json).toHaveLength(1);
    expect((await req("GET", `/api/projects/${projectId}/artifacts?requirementId=other`)).json).toHaveLength(0);
    expect((await req("GET", `/api/projects/${projectId}/artifacts?taskId=t1`)).json).toHaveLength(1);

    const one = await req("GET", `/api/projects/${projectId}/artifacts/${created.json.id}`);
    expect(one.status).toBe(200);
    expect(one.json.content).toBe('{"path":"/login"}');
  });

  test("an unknown artifact is a 404", async () => {
    expect((await req("GET", `/api/projects/${projectId}/artifacts/art_nope`)).status).toBe(404);
  });
});

describe("editing a suggestion before resolving it", () => {
  test("the proposed text can be edited, and the edit is what gets stored", async () => {
    store.addRequirement(projectId, { id: "R-1", description: "d" }, USER);
    const s = store.submitSuggestion(projectId, {
      authorAgentId: "a1", originalText: "old", proposedText: "rough draft",
      reason: "r", requirementId: "R-1",
    });

    const { status, json } = await req("PATCH", `/api/projects/${projectId}/suggestions/${s.id}`, {
      proposedText: "polished wording",
    });
    expect(status).toBe(200);
    expect(json.proposedText).toBe("polished wording");
    expect(json.state).toBe("pending");
  });

  test("editing an unknown suggestion is a 404", async () => {
    const res = await req("PATCH", `/api/projects/${projectId}/suggestions/sug_nope`, { proposedText: "x" });
    expect(res.status).toBe(404);
  });
});

describe("repository diff", () => {
  test("the diff for a changed file is returned as text", async () => {
    writeFileSync(join(repo, "a.ts"), "export const x = 2;\n");
    const { status, json } = await req(
      "GET",
      `/api/repository/diff?worktree=${encodeURIComponent(repo)}&file=a.ts`,
    );
    expect(status).toBe(200);
    const text = typeof json === "string" ? json : JSON.stringify(json);
    expect(text).toContain("x = 2");
  });

  test("a diff outside a managed repository is refused (S-2)", async () => {
    const outside = mkdtempSync(join(tmpdir(), "openui-preads-outside-"));
    try {
      const { status } = await req(
        "GET",
        `/api/repository/diff?worktree=${encodeURIComponent(outside)}&file=a.ts`,
      );
      expect(status).toBe(403);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("requirement-to-conversation traceability (§21)", () => {
  const links = (reqId: string) => [{ kind: "requirement" as const, id: reqId }];

  beforeEach(() => {
    store.addRequirement(projectId, { id: "R-1", description: "one" }, USER);
    store.addRequirement(projectId, { id: "R-2", description: "two" }, USER);
    store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "about one", links: links("R-1"),
    });
    store.sendMessage(projectId, {
      kind: "answer", fromAgentId: "b", toAgentId: "a", body: "also one", links: links("R-1"),
    });
    store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "about two", links: links("R-2"),
    });
  });

  test("messages can be retrieved by the requirement they reference", async () => {
    // V-025 requires every message to carry links, and nothing could query them — so the core
    // value statement's "requirement to conversations" was captured and unreachable.
    const { status, json } = await req(
      "GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-1`,
    );
    expect(status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json.map((m: any) => m.body).sort()).toEqual(["about one", "also one"]);
  });

  test("a different requirement returns only its own conversations", async () => {
    const { json } = await req(
      "GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-2`,
    );
    expect(json).toHaveLength(1);
    expect(json[0].body).toBe("about two");
  });

  test("a requirement with no conversations returns an empty list, not everything", async () => {
    // A filter that silently matches nothing must not fall back to returning all messages.
    const { json } = await req(
      "GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-none`,
    );
    expect(json).toEqual([]);
  });

  test("the filter composes with the other filters", async () => {
    const { json } = await req(
      "GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-1&kind=answer`,
    );
    expect(json).toHaveLength(1);
    expect(json[0].kind).toBe("answer");
  });

  test("linkKind alone matches every message referencing that kind of object", async () => {
    const { json } = await req("GET", `/api/projects/${projectId}/messages?linkKind=requirement`);
    expect(json).toHaveLength(3);
  });

  test("archived conversations are reachable for a requirement too", async () => {
    for (let i = 0; i < 700; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "x", toAgentId: "y",
        body: `noise${i}`, links: [{ kind: "task", id: "t1" }], threadId: `n-${i}`,
      });
    }
    const live = await req("GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-1`);
    expect(live.json).toHaveLength(0); // pushed out of the retention window

    const all = await req(
      "GET", `/api/projects/${projectId}/messages?linkKind=requirement&linkId=R-1&includeArchived=true`,
    );
    expect(all.json).toHaveLength(2);
  });
});
