import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getProjectStore, PermissionDeniedError } from "./projectStore";
import { openRepository, agentChangedFiles, getDiff, listWorktrees } from "./repository";
import { detectTestCommand } from "./testRunner";
import { readFileSync } from "fs";
import { join } from "path";
import { getControlRoomBus } from "./controlRoomEvents";
import type { Actor } from "../types/project";
import { commitAgentWork, listRepositoryFiles } from "./repository";
import { getAgentRegistry } from "./agentRegistry";

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
    | "getMessage" | "attachArtifactToRequirement"
    | "submitSuggestion" | "submitCode" | "handoffArtifact"
    | "recordTestRun" | "createArtifact" | "getArtifact"
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
    "list_repository_files",
    {
      description:
        "The files tracked in the project repository. Use this to see what actually exists before " +
        "naming files or tests.",
      inputSchema: { limit: z.number().optional() },
    },
    async ({ limit }) =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        return listRepositoryFiles(project.repositoryPath, { limit });
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
      guard(() => {
        // Capture the work as a commit before recording the submission.
        //
        // An agent edits files in its worktree and has no way to commit them: there is no commit
        // tool, and `commitAgentWork` is only reachable over HTTP, which the acceptance script
        // calls and an agent cannot. So a submission described work that existed only as
        // uncommitted changes, and the merge afterwards refused — correctly — with "no commits
        // ahead of main". The review gate was reachable and the merge behind it was not.
        //
        // A failure here is not fatal: the submission still records what the agent did, and the
        // merge will refuse as before rather than merging something that was never committed.
        try {
          const agent = registry().get(ctx.agentId);
          if (agent?.worktree) {
            commitAgentWork(agent.worktree, `${a.summary} (task ${a.taskId})`, ctx.agentId);
          }
        } catch {
          // Nothing to commit, or the worktree is gone; submitCode still runs.
        }

        return store().submitCode(ctx.projectId, {
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
        });
      }),
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


  // ─────────────────────────── remaining §13 tools (added iteration 32)

  server.registerTool(
    "list_changed_files",
    { description: "Files this agent has changed on its branch.", inputSchema: {} },
    async () =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const agent = registry().get(ctx.agentId);
        if (!agent.worktree) return [];
        return agentChangedFiles(agent.worktree, project.baseBranch);
      }),
  );

  server.registerTool(
    "get_test_commands",
    { description: "The project's test command, configured or detected.", inputSchema: {} },
    async () =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const agent = registry().get(ctx.agentId);
        const detected = detectTestCommand(agent.worktree || project.repositoryPath);
        return detected ?? { command: null, source: null, note: "No test command detected" };
      }),
  );

  server.registerTool(
    "get_build_commands",
    { description: "The project's build command, read from package.json when present.", inputSchema: {} },
    async () =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const agent = registry().get(ctx.agentId);
        const root = agent.worktree || project.repositoryPath;
        try {
          const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
          return { build: pkg.scripts?.build ?? null, scripts: Object.keys(pkg.scripts ?? {}) };
        } catch {
          return { build: null, scripts: [], note: "No package.json found" };
        }
      }),
  );

  server.registerTool(
    "complete_task",
    {
      description: "Mark a task you own as complete. Refused if its required tests are failing.",
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) =>
      guard(() => {
        const project = store().getProject(ctx.projectId);
        const task = project.tasks.find((t) => t.id === taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        // A task with a red suite cannot be completed by the agent that wrote it (V-035).
        if (task.testRun && !(task.testRun.parsed && task.testRun.failed === 0 && task.testRun.total > 0)) {
          throw new Error(
            `Cannot complete ${taskId}: its last test run was ${task.testRun.failed} failing of ${task.testRun.total}`,
          );
        }
        const result = store().updateTask(ctx.projectId, taskId, { status: "complete" }, actor());
        return { task: result.task, unblocked: result.unblocked.map((t) => t.id) };
      }),
  );

  server.registerTool(
    "record_test_result",
    {
      description: "Record a test run against a task you own.",
      inputSchema: {
        taskId: z.string(), command: z.string(),
        passed: z.number(), failed: z.number(), total: z.number(), exitCode: z.number(),
      },
    },
    async ({ taskId, command, passed, failed, total, exitCode }) =>
      guard(() =>
        store().recordTestRun(ctx.projectId, taskId, {
          command, passed, failed, total, exitCode, parsed: true, ranByAgentId: ctx.agentId,
        }),
      ),
  );

  server.registerTool(
    "ask_agent",
    {
      description: "Ask another agent a question.",
      inputSchema: { toAgentId: z.string(), body: z.string(), linkKind: z.string(), linkId: z.string() },
    },
    async ({ toAgentId, body, linkKind, linkId }) =>
      guard(() =>
        store().sendMessage(ctx.projectId, {
          kind: "question", fromAgentId: ctx.agentId, toAgentId, body,
          links: [{ kind: linkKind as any, id: linkId }],
        }),
      ),
  );

  server.registerTool(
    "reply_to_agent",
    {
      description: "Reply to a message from another agent.",
      inputSchema: { replyToId: z.string(), toAgentId: z.string(), body: z.string() },
    },
    async ({ replyToId, toAgentId, body }) =>
      guard(() => {
        // Inherit the links of the message being answered. Previously this wrote
        // `{ kind: "task", id: replyToId }` — labelling a *message* id as a *task* id, so every
        // reply carried a link pointing at a task that does not exist.
        const original = store().getMessage(ctx.projectId, replyToId);
        return store().sendMessage(ctx.projectId, {
          kind: "answer", fromAgentId: ctx.agentId, toAgentId, body,
          links: original.links, replyToId,
        });
      }),
  );

  server.registerTool(
    "handoff_api_contract",
    {
      description: "Hand an API contract to another agent.",
      inputSchema: {
        toAgentId: z.string(), name: z.string(), contract: z.string(),
        body: z.string(), requirementId: z.string().optional(), branch: z.string().optional(),
      },
    },
    async ({ toAgentId, name, contract, body, requirementId, branch }) =>
      guard(() =>
        store().handoffArtifact(ctx.projectId, {
          fromAgentId: ctx.agentId, toAgentId, body,
          artifact: { kind: "api_contract", name, content: contract, requirementId, branch },
        }),
      ),
  );

  server.registerTool(
    "create_artifact",
    {
      description: "Record an artifact you produced.",
      inputSchema: {
        name: z.string(),
        kind: z.enum(["api_contract", "patch", "diff", "test_report", "benchmark", "build_log", "migration", "screenshot"]),
        content: z.string().optional(), requirementId: z.string().optional(), taskId: z.string().optional(),
      },
    },
    async (a) =>
      guard(() => store().createArtifact(ctx.projectId, { ...a, producedByAgentId: ctx.agentId })),
  );

  server.registerTool(
    "get_artifact",
    { description: "Read an artifact by id.", inputSchema: { artifactId: z.string() } },
    async ({ artifactId }) => guard(() => store().getArtifact(ctx.projectId, artifactId)),
  );

  server.registerTool(
    "attach_artifact_to_requirement",
    {
      description: "Attach an existing artifact to a requirement.",
      inputSchema: { artifactId: z.string(), requirementId: z.string() },
    },
    async ({ artifactId, requirementId }) =>
      guard(() => {
        // Actually attach it. This used to send a message announcing the attachment without
        // performing one, so the artifact stayed unfindable from its requirement.
        const artifact = store().attachArtifactToRequirement(ctx.projectId, artifactId, requirementId);
        store().sendMessage(ctx.projectId, {
          kind: "handoff", fromAgentId: ctx.agentId, toAgentId: ctx.agentId,
          body: `Artifact ${artifactId} attached to ${requirementId}`,
          links: [{ kind: "artifact", id: artifactId }, { kind: "requirement", id: requirementId }],
        });
        return artifact;
      }),
  );

  server.registerTool(
    "revise_design_suggestion",
    {
      description: "Submit a revised design suggestion after changes were requested.",
      inputSchema: {
        originalText: z.string(), proposedText: z.string(), reason: z.string(),
        requirementId: z.string().optional(),
      },
    },
    async (a) =>
      guard(() => store().submitSuggestion(ctx.projectId, { ...a, authorAgentId: ctx.agentId })),
  );

  server.registerTool(
    "request_direct_document_permission",
    {
      description: "Ask the user for scoped permission to edit the design document directly.",
      inputSchema: { reason: z.string() },
    },
    async ({ reason }) =>
      guard(() =>
        store().sendMessage(ctx.projectId, {
          kind: "escalation", fromAgentId: ctx.agentId,
          body: `Requesting direct document-write permission: ${reason}`,
          links: [{ kind: "blocker", id: ctx.agentId }],
        }),
      ),
  );


  // Typed attachment helpers. Thin wrappers over create_artifact so an agent reaching for the
  // name the design uses finds a tool rather than having to know the generic form.
  for (const [tool, kind, label] of [
    ["attach_test_report", "test_report", "test report"],
    ["attach_api_contract", "api_contract", "API contract"],
    ["attach_screenshot", "screenshot", "screenshot"],
  ] as const) {
    server.registerTool(
      tool,
      {
        description: `Attach a ${label} to a requirement or task.`,
        inputSchema: {
          name: z.string(),
          content: z.string().optional(),
          uri: z.string().optional(),
          requirementId: z.string().optional(),
          taskId: z.string().optional(),
        },
      },
      async (a) =>
        guard(() => store().createArtifact(ctx.projectId, { ...a, kind, producedByAgentId: ctx.agentId })),
    );
  }

  return server;
}

/** Tool names this server registers, for discovery assertions. */
/**
 * Tools deliberately NOT exposed to agents, with the reason. §13 lists them, but each is a
 * human review or approval action — giving an agent the ability to approve its own work would
 * defeat the review gate the design exists to enforce (§4, V-018, V-039).
 */
export const DELIBERATELY_USER_ONLY = [
  "approve_code_submission",
  "request_code_changes",
  "request_merge",
  "record_review_result",
  "request_requirement_change",
  "submit_architecture_comment",
] as const;

export const PROJECT_MCP_TOOLS = [
  "list_repository_files",
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
  "list_changed_files",
  "get_test_commands",
  "get_build_commands",
  "complete_task",
  "record_test_result",
  "ask_agent",
  "reply_to_agent",
  "handoff_api_contract",
  "create_artifact",
  "get_artifact",
  "attach_artifact_to_requirement",
  "revise_design_suggestion",
  "request_direct_document_permission",
  "attach_test_report",
  "attach_api_contract",
  "attach_screenshot",
] as const;
