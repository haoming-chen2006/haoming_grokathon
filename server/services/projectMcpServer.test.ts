import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProjectMcpServer, PROJECT_MCP_TOOLS } from "./projectMcpServer";
import { ProjectStore } from "./projectStore";
import { AgentRegistry } from "./agentRegistry";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };

let dataDir: string;
let repo: string;
let projectId: string;
let backendId: string;
let frontendId: string;
let store: ProjectStore;
let registry: AgentRegistry;

function sh(cmd: string, cwd: string) {
  execSync(cmd, { cwd, stdio: "pipe" });
}

async function connect(ctx: { projectId: string; agentId: string; canWriteDocument?: boolean }) {
  // Stores are injected, so the server under test reads the fixture rather than a process-wide
  // singleton whose initialisation order tests cannot control.
  const server = createProjectMcpServer({ ...ctx, store, registry });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

function textOf(result: any): any {
  const raw = result.content?.[0]?.text ?? "{}";
  return JSON.parse(raw);
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-mcp-"));
  repo = mkdtempSync(join(tmpdir(), "openui-mcp-repo-"));
  sh("git init -b main", repo);
  sh("git config user.email t@e.com", repo);
  sh("git config user.name T", repo);
  writeFileSync(join(repo, "app.ts"), "export const x = 1;\n");
  sh("git add .", repo);
  sh("git commit -m initial", repo);

  store = new ProjectStore(join(dataDir, "projects"));
  const project = store.createProject({
    name: "Authentication",
    goal: "Ship auth",
    repositoryPath: repo,
    documentContent: "# Auth Design\n\nUsers sign in with a modal.",
    budgetUsd: 10,
  });
  projectId = project.id;
  store.addRequirement(
    projectId,
    { id: "AUTH-03", description: "Stay signed in", acceptanceCriteria: ["Survives reload"], ownerAgentId: "backend" },
    USER,
  );
  store.createPlan(projectId, { milestones: [] }, USER);
  store.addTask(projectId, { id: "api", objective: "Auth API", assignedAgentId: "backend" }, USER);
  store.approvePlan(projectId, USER);

  registry = new AgentRegistry({ persistDir: dataDir });
  backendId = "backend";
  frontendId = "frontend";
  // Ids are fixed so tool calls can address them deterministically.
  (registry as any).agents.set(backendId, {
    id: backendId, projectId, name: "Backend", role: "Backend Engineer", skills: [], tools: [],
    status: "idle", activity: {}, permissions: { canWriteDocument: false, shellApproval: "auto", allowedPaths: [] },
    costUsd: 0, tokensUsed: 0, createdAt: "", updatedAt: "",
  });
  (registry as any).agents.set(frontendId, {
    id: frontendId, projectId, name: "Frontend", role: "Frontend Engineer", skills: [], tools: [],
    status: "idle", activity: {}, permissions: { canWriteDocument: false, shellApproval: "auto", allowedPaths: [] },
    costUsd: 0, tokensUsed: 0, createdAt: "", updatedAt: "",
  });
  (registry as any).save?.();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("V-028: project MCP server exposes its tools", () => {
  test("every declared tool is discoverable", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    expect(names).toEqual([...PROJECT_MCP_TOOLS].sort());
    // A tool with no description is unusable to a model.
    expect(tools.every((t) => (t.description ?? "").length > 0)).toBe(true);
  });

  test("tools declare input schemas so the agent can call them correctly", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const { tools } = await client.listTools();
    const getRequirement = tools.find((t) => t.name === "get_requirement")!;
    expect(getRequirement.inputSchema.properties).toHaveProperty("requirementId");
  });
});

describe("V-029: read tools return scoped project context", () => {
  test("get_project returns this project", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(await client.callTool({ name: "get_project", arguments: {} }));
    expect(data.name).toBe("Authentication");
    expect(data.goal).toBe("Ship auth");
    expect(data.budgetUsd).toBe(10);
    expect(data.requirementCount).toBe(1);
  });

  test("get_technical_design returns the current document version", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(await client.callTool({ name: "get_technical_design", arguments: {} }));
    expect(data.version).toBe(1);
    expect(data.content).toContain("Users sign in with a modal");
  });

  test("get_requirements and get_requirement agree", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const all = textOf(await client.callTool({ name: "get_requirements", arguments: {} }));
    expect(all).toHaveLength(1);
    const one = textOf(await client.callTool({ name: "get_requirement", arguments: { requirementId: "AUTH-03" } }));
    expect(one.id).toBe("AUTH-03");
    expect(one.ownerAgentId).toBe("backend");
  });

  test("get_acceptance_criteria returns the criteria", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(await client.callTool({ name: "get_acceptance_criteria", arguments: { requirementId: "AUTH-03" } }));
    expect(data).toHaveLength(1);
    expect(data[0].text).toBe("Survives reload");
  });

  test("get_repository_summary reads the real repository", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(await client.callTool({ name: "get_repository_summary", arguments: {} }));
    expect(data.currentBranch).toBe("main");
    expect(data.head).toMatch(/^[0-9a-f]{40}$/);
    expect(data.protectedBranches).toContain("main");
  });

  test("an unknown requirement returns an error result rather than throwing", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const result: any = await client.callTool({ name: "get_requirement", arguments: { requirementId: "NOPE" } });
    expect(result.isError).toBe(true);
    expect(textOf(result).error).toContain("not found");
  });
});

describe("V-030: mutation tools enforce permissions", () => {
  test("an agent may update a task it owns", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({ name: "update_task_progress", arguments: { taskId: "api", status: "working" } }),
    );
    expect(data.task.status).toBe("working");
  });

  test("an agent may NOT update a task owned by another agent", async () => {
    // Identity comes from the server context, not the arguments — it cannot be spoofed.
    const { client } = await connect({ projectId, agentId: frontendId });
    const result: any = await client.callTool({
      name: "update_task_progress",
      arguments: { taskId: "api", status: "complete" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result).error).toContain("PERMISSION_DENIED");
  });

  test("submit_code_for_review refuses incomplete evidence", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const result: any = await client.callTool({
      name: "submit_code_for_review",
      arguments: {
        taskId: "api", requirementIds: ["AUTH-03"], branch: "agent/backend",
        changedFiles: [], summary: "", testsPassed: 1, testsFailed: 0, testsTotal: 1, costUsd: 0.1,
      },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result).error).toContain("missing required evidence");
  });

  test("an agent proposes a design change rather than editing the document", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({
        name: "submit_design_suggestion",
        arguments: {
          originalText: "Users sign in with a modal.",
          proposedText: "Users sign in via a redirect.",
          reason: "Provider blocks embedded auth.",
        },
      }),
    );
    expect(data.state).toBe("pending");
    expect(data.authorAgentId).toBe(backendId);
    // The document itself is untouched — only the user can accept.
    const doc = textOf(await client.callTool({ name: "get_technical_design", arguments: {} }));
    expect(doc.version).toBe(1);
  });
});

describe("V-031: agent communication tools work through MCP", () => {
  test("send_agent_message requires and records a link", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({
        name: "send_agent_message",
        arguments: {
          toAgentId: frontendId, kind: "question", body: "What shape is the login response?",
          linkKind: "requirement", linkId: "AUTH-03",
        },
      }),
    );
    expect(data.fromAgentId).toBe(backendId);
    expect(data.toAgentId).toBe(frontendId);
    expect(data.links[0]).toEqual({ kind: "requirement", id: "AUTH-03" });
  });

  test("handoff_code_artifact produces an artifact and a linked handoff", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({
        name: "handoff_code_artifact",
        arguments: {
          toAgentId: frontendId, name: "auth-contract-v2", kind: "api_contract",
          content: "POST /api/auth/login", body: "Contract ready", requirementId: "AUTH-03",
        },
      }),
    );
    expect(data.artifact.name).toBe("auth-contract-v2");
    expect(data.artifact.producedByAgentId).toBe(backendId);
    expect(data.message.kind).toBe("handoff");
    expect(data.message.links.map((l: any) => l.kind)).toContain("artifact");
  });

  test("report_failing_test links the test and requirement", async () => {
    const { client } = await connect({ projectId, agentId: "test-agent" });
    const data = textOf(
      await client.callTool({
        name: "report_failing_test",
        arguments: {
          toAgentId: backendId, testPath: "tests/auth/session_test.py",
          details: "Concurrent refresh issues two tokens", requirementId: "AUTH-03",
        },
      }),
    );
    expect(data.kind).toBe("failing_test");
    expect(data.links.map((l: any) => l.id)).toContain("tests/auth/session_test.py");
  });

  test("request_agent_review addresses a branch", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({
        name: "request_agent_review",
        arguments: { toAgentId: "reviewer", branch: "agent/auth-backend", body: "Ready for review" },
      }),
    );
    expect(data.kind).toBe("review_request");
    expect(data.links[0]).toEqual({ kind: "branch", id: "agent/auth-backend" });
  });

  test("escalate_to_user addresses the user, not an agent", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({ name: "escalate_to_user", arguments: { body: "Need a credential I do not have" } }),
    );
    expect(data.kind).toBe("escalation");
    expect(data.toAgentId).toBeUndefined();
  });

  test("report_blocker escalates and marks the agent waiting", async () => {
    const { client } = await connect({ projectId, agentId: backendId });
    const data = textOf(
      await client.callTool({ name: "report_blocker", arguments: { reason: "Waiting for the API contract", taskId: "api" } }),
    );
    expect(data.acknowledged).toBe(true);
    expect(data.messageId).toBeTruthy();
  });
});
