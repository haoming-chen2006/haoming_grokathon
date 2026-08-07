import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectStore, PermissionDeniedError } from "./projectStore";
import { getAgentRegistry } from "./agentRegistry";
import { openRepository, agentChangedFiles, getDiff, listWorktrees } from "./repository";
import { getControlRoomBus } from "./controlRoomEvents";
import type { Actor } from "../types/project";

/**
 * The Project MCP server (product-design.md §13).
 *
 * Every tool is scoped to one project and one calling agent, both bound when the server is
 * created. An agent therefore cannot address another project or impersonate another agent by
 * passing different arguments — the identity is not a parameter.
 */
export interface ProjectMcpContext {
  projectId: string;
  agentId: string;
  /** Scoped grant allowing this agent to write the canonical document. Off by default (§4). */
  canWriteDocument?: boolean;
  /**
   * Stores the tools read and write. Injected so a server can be pointed at a test fixture, and
   * so this module does not depend on process-wide singletons being initialised in a given order.
   */
  store?: Pick<
    ReturnType<typeof getProjectStore>,
    | "getProject" | "getDocument" | "getRequirement" | "updateTask" | "sendMessage"
    | "submitSuggestion" | "submitCode" | "handoffArtifact"
  >;
  registry?: Pick<ReturnType<typeof getAgentRegistry>, "get" | "updateActivity">;
}

/** Uniform tool result. MCP expects content blocks; errors are returned, not thrown. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function failed(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/** Run a tool body, converting a permission failure into a clear, non-throwing result. */
async function guard<T>(fn: () => T | Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof PermissionDeniedError) return failed(`PERMISSION_DENIED: ${err.message}`);
    return failed(err instanceof Error ? err.message : String(err));
  }
}

export function createProjectMcpServer(ctx: ProjectMcpContext): McpServer {
  const server = new McpServer(
    { name: "openui-project", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  const actor = (): Actor => ({
    kind: "agent",
    id: ctx.agentId,
    canWriteDocument: ctx.canWriteDocument === true,
  });
  const store = () => ctx.store ?? getProjectStore();
  const registry = () => ctx.registry ?? getAgentRegistry();

  // ------------------------------------------------------------ read tools (V-029)

  server.registerTool(
    "get_project",
    { description: "Get the current project: goal, repository, base branch and budget.", inputSchema: {} },
    async () =>
      guard(() => {
        const p = store().getProject(ctx.projectId);
        return {
          id: p.id,
          name: p.name,
          goal: p.goal,
          repositoryPath: p.repositoryPath,
          baseBranch: p.baseBranch,
          budgetUsd: p.budgetUsd,
          documentVersion: p.document.currentVersion,
          requirementCount: p.requirements.length,
          taskCount: p.tasks.length,
        };
      }),
  );

  server.registerTool(
    "get_technical_design",
    { description: "Read the approved design document. Read-only for agents.", inputSchema: {} },
    async () => guard(() => store().getDocument(ctx.projectId)),
  );

  server.registerTool(
    "get_requirements",
    { description: "List every requirement with status, owner and test counts.", inputSchema: {} },
    async () => guard(() => store().getProject(ctx.projectId).requirements),
  );

  server.registerTool(
    "get_requirement",
    {
      description: "Get one requirement by id, including its acceptance criteria.",
      inputSchema: { requirementId: z.string().describe("e.g. AUTH-03") },
    },
    async ({ requirementId }) => guard(() => store().getRequirement(ctx.projectId, requirementId)),
  );

  server.registerTool(
    "get_acceptance_criteria",
    {
      description: "Get just the acceptance criteria for a requirement.",
      inputSchema: { requirementId: z.string() },
    },
    async ({ requirementId }) =>
      guard(() => store().getRequirement(ctx.projectId, requirementId).acceptanceCriteria),
  );

  server.registerTool(
    "get_repository_summary",
    { description: "Repository root, current branch, HEAD and working-tree status.", inputSchema: {} },
    async () =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const info = openRepository(project.repositoryPath);
        return {
          root: info.root,
          currentBranch: info.currentBranch,
          baseBranch: project.baseBranch,
          head: info.head,
          isClean: info.isClean,
          changedFileCount: info.changedFiles.length,
          protectedBranches: info.protectedBranches,
        };
      }),
  );

  server.registerTool(
    "get_branch_status",
    { description: "This agent's branch, worktree and the files it has changed.", inputSchema: {} },
    async () =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const agent = registry().get(ctx.agentId);
        if (!agent.worktree) return { branch: agent.branch ?? null, worktree: null, changedFiles: [] };
        return {
          branch: agent.branch ?? null,
          worktree: agent.worktree,
          changedFiles: agentChangedFiles(agent.worktree, project.baseBranch),
        };
      }),
  );

  server.registerTool(
    "get_worktree_status",
    { description: "All worktrees in the project repository.", inputSchema: {} },
    async () => guard(() => listWorktrees(store().getProject(ctx.projectId).repositoryPath)),
  );

  server.registerTool(
    "get_diff",
    {
      description: "Diff of this agent's branch against the project base branch.",
      inputSchema: { file: z.string().optional().describe("Limit the diff to one file") },
    },
    async ({ file }) =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const agent = registry().get(ctx.agentId);
        if (!agent.worktree) throw new Error("This agent has no worktree assigned");
        return { diff: getDiff(agent.worktree, { baseBranch: project.baseBranch, file }) };
      }),
  );

  // ------------------------------------------------------ mutation tools (V-030)

  server.registerTool(
    "update_task_progress",
    {
      description: "Report progress on a task you own.",
      inputSchema: {
        taskId: z.string(),
        status: z.enum(["pending", "working", "needs_review", "complete", "failed"]).optional(),
        branch: z.string().optional(),
        expectedFiles: z.array(z.string()).optional(),
      },
    },
    async ({ taskId, status, branch, expectedFiles }) =>
      guard(() => {
        // Ownership is enforced in the store: an agent may only touch tasks assigned to it.
        const result = store().updateTask(
          ctx.projectId,
          taskId,
          { status, branch, expectedFiles },
          actor(),
        );
        return { task: result.task, unblocked: result.unblocked.map((t) => t.id) };
      }),
  );

  server.registerTool(
    "report_blocker",
    {
      description: "Report that you are blocked. Sets your status to waiting and notifies the user.",
      inputSchema: { reason: z.string(), taskId: z.string().optional() },
    },
    async ({ reason, taskId }) =>
      guard(() => {
        registry().updateActivity(ctx.agentId, { blocker: reason, taskId });
        const message = store().sendMessage(ctx.projectId, {
          kind: "escalation",
          fromAgentId: ctx.agentId,
          body: reason,
          links: taskId ? [{ kind: "task", id: taskId }] : [{ kind: "blocker", id: ctx.agentId }],
        });
        return { acknowledged: true, messageId: message.id };
      }),
  );

  server.registerTool(
    "submit_design_suggestion",
    {
      description:
        "Propose a change to the design document. Agents may not edit it directly (§4); this is the sanctioned path.",
      inputSchema: {
        originalText: z.string(),
        proposedText: z.string(),
        reason: z.string(),
        requirementId: z.string().optional(),
        risks: z.string().optional(),
      },
    },
    async (args) =>
      guard(() =>
        store().submitSuggestion(ctx.projectId, { ...args, authorAgentId: ctx.agentId }),
      ),
  );

  server.registerTool(
    "submit_code_for_review",
    {
      description: "Submit completed work. Rejected unless it carries the required evidence.",
      inputSchema: {
        taskId: z.string(),
        requirementIds: z.array(z.string()),
        branch: z.string(),
        changedFiles: z.array(z.string()),
        summary: z.string(),
        testsPassed: z.number(),
        testsFailed: z.number(),
        testsTotal: z.number(),
        costUsd: z.number(),
        knownLimitations: z.string().optional(),
        diff: z.string().optional(),
      },
    },
    async (a) =>
      guard(() =>
        store().submitCode(ctx.projectId, {
          taskId: a.taskId,
          agentId: ctx.agentId,
          requirementIds: a.requirementIds,
          branch: a.branch,
          changedFiles: a.changedFiles,
          summary: a.summary,
          knownLimitations: a.knownLimitations,
          diff: a.diff,
          testResults: { passed: a.testsPassed, failed: a.testsFailed, total: a.testsTotal },
          costUsd: a.costUsd,
        }),
      ),
  );

  // ------------------------------------------- agent communication tools (V-031)

  server.registerTool(
    "send_agent_message",
    {
      description: "Send a structured message to another agent. Must reference a project object.",
      inputSchema: {
        toAgentId: z.string(),
        kind: z.enum(["question", "answer", "dependency_request", "review_request", "failing_test"]),
        body: z.string(),
        linkKind: z.enum(["task", "requirement", "file", "branch", "test", "artifact", "review", "blocker"]),
        linkId: z.string(),
      },
    },
    async ({ toAgentId, kind, body, linkKind, linkId }) =>
      guard(() =>
        store().sendMessage(ctx.projectId, {
          kind,
          fromAgentId: ctx.agentId,
          toAgentId,
          body,
          links: [{ kind: linkKind, id: linkId }],
        }),
      ),
  );

  server.registerTool(
    "handoff_code_artifact",
    {
      description: "Produce an artifact and hand it to another agent with its context attached.",
      inputSchema: {
        toAgentId: z.string(),
        name: z.string(),
        kind: z.enum(["api_contract", "patch", "diff", "test_report", "benchmark", "build_log", "migration"]),
        content: z.string().optional(),
        body: z.string(),
        requirementId: z.string().optional(),
        taskId: z.string().optional(),
        branch: z.string().optional(),
      },
    },
    async ({ toAgentId, name, kind, content, body, requirementId, taskId, branch }) =>
      guard(() =>
        store().handoffArtifact(ctx.projectId, {
          fromAgentId: ctx.agentId,
          toAgentId,
          body,
          artifact: { kind, name, content, requirementId, taskId, branch },
        }),
      ),
  );

  server.registerTool(
    "report_failing_test",
    {
      description: "Tell the responsible agent that a test is failing.",
      inputSchema: {
        toAgentId: z.string(),
        testPath: z.string(),
        details: z.string(),
        requirementId: z.string().optional(),
      },
    },
    async ({ toAgentId, testPath, details, requirementId }) =>
      guard(() =>
        store().sendMessage(ctx.projectId, {
          kind: "failing_test",
          fromAgentId: ctx.agentId,
          toAgentId,
          body: details,
          links: [
            { kind: "test", id: testPath },
            ...(requirementId ? [{ kind: "requirement" as const, id: requirementId }] : []),
          ],
        }),
      ),
  );

  server.registerTool(
    "request_agent_review",
    {
      description: "Ask another agent to review work on a branch.",
      inputSchema: { toAgentId: z.string(), branch: z.string(), body: z.string() },
    },
    async ({ toAgentId, branch, body }) =>
      guard(() =>
        store().sendMessage(ctx.projectId, {
          kind: "review_request",
          fromAgentId: ctx.agentId,
          toAgentId,
          body,
          links: [{ kind: "branch", id: branch }],
        }),
      ),
  );

  server.registerTool(
    "escalate_to_user",
    {
      description: "Escalate to the human when agents cannot resolve something.",
      inputSchema: { body: z.string(), linkKind: z.string().optional(), linkId: z.string().optional() },
    },
    async ({ body, linkKind, linkId }) =>
      guard(() => {
        const message = store().sendMessage(ctx.projectId, {
          kind: "escalation",
          fromAgentId: ctx.agentId,
          body,
          links: [{ kind: (linkKind as any) ?? "blocker", id: linkId ?? ctx.agentId }],
        });
        getControlRoomBus().publish(ctx.projectId, {
          type: "agent_status",
          agentId: ctx.agentId,
          status: "waiting",
          statusDetail: "Escalated to user",
        });
        return message;
      }),
  );

  return server;
}

/** Tool names this server registers, for discovery assertions. */
export const PROJECT_MCP_TOOLS = [
  "get_project",
  "get_technical_design",
  "get_requirements",
  "get_requirement",
  "get_acceptance_criteria",
  "get_repository_summary",
  "get_branch_status",
  "get_worktree_status",
  "get_diff",
  "update_task_progress",
  "report_blocker",
  "submit_design_suggestion",
  "submit_code_for_review",
  "send_agent_message",
  "handoff_code_artifact",
  "report_failing_test",
  "request_agent_review",
  "escalate_to_user",
] as const;
