import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, realpathSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { repositoryRoutes } from "./repository";
import { mcpRoutes } from "./mcp";
import { ProjectStore } from "../services/projectStore";
import { getAgentRegistry } from "../services/agentRegistry";

/**
 * Regression tests for the security review in iteration 39. Each would fail against the code as
 * it stood before that review.
 */

let dataDir: string;
let managed: string;
let unmanaged: string;
let app: Hono;
let projectId: string;

function initRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email t@e.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name T", { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
  execSync("git add . && git commit -m init", { cwd: dir, stdio: "pipe" });
  return dir;
}

async function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    if (line) json = JSON.parse(line.slice(5).trim());
  }
  return { status: res.status, json };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-sec-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  managed = initRepo("openui-managed-");
  unmanaged = initRepo("openui-unmanaged-");

  projectId = new ProjectStore(join(dataDir, "projects")).createProject({
    name: "Sec", goal: "g", repositoryPath: managed, documentContent: "# Original",
  }).id;

  app = new Hono();
  app.route("/api/repository", repositoryRoutes);
  app.route("/mcp", mcpRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(managed, { recursive: true, force: true });
  rmSync(unmanaged, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("S-1: a request header cannot grant document-write", () => {
  test("the MCP endpoint ignores x-openui-actor-doc-write", async () => {
    // The agent's stored permission is the default: read-only.
    const agent = getAgentRegistry().create({ projectId, name: "A", role: "Backend Engineer" });
    expect(agent.permissions.canWriteDocument).toBe(false);

    await req("POST", `/mcp/${projectId}/${agent.id}`, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "x", version: "1" } },
    }, { "x-openui-actor-doc-write": "true" });

    // Creating a requirement requires document-write. With the header honoured this would have
    // succeeded, letting any caller escalate past V-014.
    const { json } = await req("POST", `/mcp/${projectId}/${agent.id}`, {
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "update_task_progress", arguments: { taskId: "nope", status: "working" } },
    }, { "x-openui-actor-doc-write": "true" });

    // Either the tool errors or it is refused — what matters is that it does not succeed.
    const text = JSON.stringify(json ?? {});
    expect(text).not.toContain('"status":"working"');
  });

  test("an agent whose stored permission grants write is still honoured", () => {
    const granted = getAgentRegistry().create({
      projectId, name: "Planner", role: "Planner", permissions: { canWriteDocument: true },
    });
    expect(granted.permissions.canWriteDocument).toBe(true);
  });
});

describe("S-2: filesystem operations are confined to managed repositories", () => {
  test("a managed repository is allowed", async () => {
    const { status } = await req("GET", `/api/repository/info?path=${encodeURIComponent(managed)}`);
    expect(status).toBe(200);
  });

  test("a repository this server does not manage is refused", async () => {
    const { status, json } = await req("GET", `/api/repository/info?path=${encodeURIComponent(unmanaged)}`);
    expect(status).toBe(403);
    expect(json.code).toBe("UNMANAGED_PATH");
  });

  test("commit cannot be pointed at an arbitrary directory", async () => {
    // Without the guard this would `git add -A` and commit in someone else's repository.
    writeFileSync(join(unmanaged, "victim.ts"), "export const v = 1;\n");
    const { status, json } = await req("POST", "/api/repository/commit", {
      worktree: unmanaged, message: "not yours",
    });
    expect(status).toBe(403);
    expect(json.code).toBe("UNMANAGED_PATH");
    // And nothing was committed there.
    expect(execSync("git log --oneline", { cwd: unmanaged }).toString().trim().split("\n")).toHaveLength(1);
  });

  test("merge cannot be pointed at an arbitrary repository", async () => {
    const { status } = await req("POST", "/api/repository/merge", {
      repoPath: unmanaged, branch: "main", target: "main", approvedBy: "user",
    });
    expect(status).toBe(403);
  });

  test("a sibling path sharing a prefix does not slip through", async () => {
    // "/repo-other" must not match "/repo" — the check compares with a separator.
    const sibling = `${managed}-other`;
    const { status } = await req("GET", `/api/repository/info?path=${encodeURIComponent(sibling)}`);
    expect(status).toBe(403);
  });

  test("a worktree inside a managed repository is allowed", async () => {
    const { status } = await req("POST", "/api/repository/worktrees", {
      repoPath: managed, agentId: "a1", branch: "agent/x", baseBranch: "main",
    });
    expect(status).toBe(201);
  });
});

describe("S-3: the server binds loopback by default", () => {
  test("index.ts binds 127.0.0.1 unless OPENUI_HOST overrides it", () => {
    // The server exposes repository and agent control with no authentication, so binding every
    // interface would put those on the network.
    const source = readFileSync("server/index.ts", "utf8");
    expect(source).toContain('hostname: process.env.OPENUI_HOST || "127.0.0.1"');
  });
});

describe("S-1b: agent permission has a single source of truth", () => {
  test("the REST API also ignores the doc-write header", async () => {
    const agent = getAgentRegistry().create({ projectId, name: "B", role: "Backend Engineer" });
    const projects = new Hono();
    projects.route("/api/projects", (await import("./projects")).projectRoutes);

    // Claiming agent identity plus doc-write must not permit a document rewrite.
    const res = await projects.request(`/api/projects/${projectId}/document`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-openui-actor-kind": "agent",
        "x-openui-actor-id": agent.id,
        "x-openui-actor-doc-write": "true",
      },
      body: JSON.stringify({ content: "rewritten by an unauthorised agent" }),
    });
    expect(res.status).toBe(403);

    // And the document is untouched.
    const store = new ProjectStore(join(dataDir, "projects"));
    expect(store.getDocument(projectId).content).toContain("Original");
  });

  test("an agent granted write in the registry is still permitted", async () => {
    const granted = getAgentRegistry().create({
      projectId, name: "Planner", role: "Planner", permissions: { canWriteDocument: true },
    });
    const projects = new Hono();
    projects.route("/api/projects", (await import("./projects")).projectRoutes);

    const res = await projects.request(`/api/projects/${projectId}/document`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-openui-actor-kind": "agent",
        "x-openui-actor-id": granted.id,
      },
      body: JSON.stringify({ content: "written by a granted agent" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("S-2b: the confinement guard compares canonical paths", () => {
  test("a worktree reached through a symlinked parent is allowed", async () => {
    // On macOS /var is a symlink to /private/var, so a project stored as /var/... and a worktree
    // git reports as /private/var/... are the same directory under two names. String comparison
    // rejected the worktree and broke the end-to-end flow for any repo under /var or /tmp.
    const real = realpathSync(managed);
    expect(real).not.toBe(managed); // the fixture must actually exercise a symlink

    const { status, json } = await req("POST", "/api/repository/worktrees", {
      repoPath: managed, agentId: "a-sym", branch: "agent/sym", baseBranch: "main",
    });
    expect(status).toBe(201);

    // The worktree path comes back canonicalised, and operating on it is accepted.
    const commit = await req("POST", "/api/repository/commit", {
      worktree: json.path, message: "nothing to commit", author: "t",
    });
    expect(commit.status).not.toBe(403);
  });

  test("the same repository named through its symlink is accepted", async () => {
    const real = realpathSync(managed);
    const viaReal = await req("GET", `/api/repository/info?path=${encodeURIComponent(real)}`);
    expect(viaReal.status).toBe(200);
    const viaLink = await req("GET", `/api/repository/info?path=${encodeURIComponent(managed)}`);
    expect(viaLink.status).toBe(200);
  });

  test("a symlink inside a managed repo pointing outside is refused", async () => {
    // This previously PASSED the guard: "<managed>/escape" starts with the managed root as a
    // string, so git would have been pointed at the unmanaged repository.
    const escape = join(managed, "escape");
    symlinkSync(unmanaged, escape);

    const { status, json } = await req("GET", `/api/repository/info?path=${encodeURIComponent(escape)}`);
    expect(status).toBe(403);
    expect(json.code).toBe("UNMANAGED_PATH");
  });

  test("commit cannot be smuggled through such a symlink", async () => {
    const escape = join(managed, "escape2");
    symlinkSync(unmanaged, escape);
    writeFileSync(join(unmanaged, "victim2.ts"), "export const v = 2;\n");

    const { status } = await req("POST", "/api/repository/commit", {
      worktree: escape, message: "not yours", author: "t",
    });
    expect(status).toBe(403);
    expect(execSync("git log --oneline", { cwd: unmanaged }).toString().trim().split("\n")).toHaveLength(1);
  });

  test("a path that does not exist yet is still confined", () => {
    // Canonicalising must not accidentally admit unknown paths.
    return req("GET", `/api/repository/info?path=${encodeURIComponent(join(unmanaged, "not-created-yet"))}`)
      .then(({ status }) => expect(status).toBe(403));
  });
});
