import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ProjectStore } from "./projectStore";
import { AgentRegistry } from "./agentRegistry";
import { PromptLibrary } from "./promptLibrary";
import { createAgentWorktree, git, openRepository } from "./repository";
import type { Actor } from "../types/project";

const USER: Actor = { kind: "user", id: "user" };

let dataDir: string;
let repo: string;

function sh(command: string, cwd: string) {
  execSync(command, { cwd, stdio: "pipe" });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "openui-persist-repo-"));
  sh("git init -b main", dir);
  sh("git config user.email t@e.com", dir);
  sh("git config user.name T", dir);
  writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
  sh("git add .", dir);
  sh("git commit -m initial", dir);
  return dir;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-persist-"));
  repo = initRepo();
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

/** Build a project exercising every entity §22.15 requires to survive a restart. */
function buildFullState() {
  const projects = new ProjectStore(join(dataDir, "projects"));
  const agents = new AgentRegistry({ persistDir: dataDir });
  const library = new PromptLibrary(dataDir);

  const project = projects.createProject({
    name: "Authentication",
    goal: "Ship auth",
    repositoryPath: repo,
    documentContent: "# Auth Design\n\nUsers sign in with a modal.",
    budgetUsd: 10,
  });

  projects.addRequirement(
    project.id,
    { id: "AUTH-03", description: "Stay signed in", acceptanceCriteria: ["Survives reload"], ownerAgentId: "backend" },
    USER,
  );

  projects.createPlan(project.id, { milestones: [{ id: "m1", name: "Auth API" }] }, USER);
  projects.addTask(project.id, { id: "api", objective: "Auth API", assignedAgentId: "backend" }, USER);
  projects.addTask(project.id, { id: "ui", objective: "Login UI", assignedAgentId: "frontend", dependsOn: ["api"] }, USER);
  projects.approvePlan(project.id, USER);

  // A design suggestion, accepted → produces a new document version.
  const suggestion = projects.submitSuggestion(project.id, {
    authorAgentId: "frontend",
    originalText: "Users sign in with a modal.",
    proposedText: "Users sign in via a full-page OAuth redirect.",
    reason: "Provider blocks embedded auth.",
  });
  projects.resolveSuggestion(project.id, suggestion.id, "accept", USER);

  // A handoff: artifact + message.
  const handoff = projects.handoffArtifact(project.id, {
    fromAgentId: "backend",
    toAgentId: "frontend",
    body: "Contract ready",
    artifact: { kind: "api_contract", name: "auth-contract-v2", content: "POST /api/auth/login", requirementId: "AUTH-03" },
  });

  // A real worktree and branch for the agent.
  const worktree = createAgentWorktree(repo, { agentId: "backend", branch: "agent/auth-backend", baseBranch: "main" });
  writeFileSync(join(worktree.path, "session.ts"), "export const session = true;\n");
  sh("git add .", worktree.path);
  sh("git commit -m 'agent work'", worktree.path);

  // A submission carrying test results and cost.
  const submission = projects.submitCode(project.id, {
    taskId: "api",
    agentId: "backend",
    requirementIds: ["AUTH-03"],
    branch: "agent/auth-backend",
    changedFiles: ["session.ts"],
    summary: "Refresh token rotation",
    testResults: { passed: 22, failed: 0, total: 22, command: "bun test" },
    costUsd: 0.84,
  });

  // An agent with position, task, branch and cost.
  const agent = agents.create({ projectId: project.id, name: "Backend", role: "Backend Engineer", budgetUsd: 5 });
  agents.setPosition(agent.id, { x: 512, y: 128 });
  agents.assignTask(agent.id, "api", { branch: "agent/auth-backend", worktree: worktree.path });
  agents.updateActivity(agent.id, { command: "bun test", latestFile: "session.ts", testsPassing: 22, testsTotal: 22 });
  agents.recordUsage(agent.id, { costUsd: 0.84, tokens: 1200 });

  // Library entries.
  const skill = library.createSkill({ name: "Test-Driven Bug Fix", instructions: "1. Reproduce." });
  const prompt = library.createPrompt({ name: "impl", body: "Implement {requirement_id}." });

  return { project, agent, submission, suggestion, handoff, worktree, skill, prompt };
}

describe("V-049: project state survives restart", () => {
  test("every entity the checklist lists is restored", () => {
    const before = buildFullState();

    // Fresh instances over the same directory — what a server restart actually does.
    const projects = new ProjectStore(join(dataDir, "projects"));
    const agents = new AgentRegistry({ persistDir: dataDir });
    const library = new PromptLibrary(dataDir);

    // project
    const project = projects.getProject(before.project.id);
    expect(project.name).toBe("Authentication");
    expect(project.budgetUsd).toBe(10);

    // design document, including every version
    const doc = projects.getDocument(project.id);
    expect(doc.version).toBe(2);
    expect(doc.content).toContain("full-page OAuth redirect");
    expect(projects.getDocumentVersion(project.id, 1).content).toContain("sign in with a modal");

    // requirements
    const requirement = projects.getRequirement(project.id, "AUTH-03");
    expect(requirement.acceptanceCriteria).toHaveLength(1);
    expect(requirement.ownerAgentId).toBe("backend");

    // task graph, including derived status after restore
    const tasks = projects.listTasks(project.id);
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.id === "ui")!.effectiveStatus).toBe("blocked");
    expect(tasks.find((t) => t.id === "ui")!.blockedBy).toEqual(["api"]);
    expect(projects.getProject(project.id).plan!.state).toBe("approved");

    // suggestions
    expect(projects.listSuggestions(project.id, "accepted")).toHaveLength(1);

    // messages and artifacts
    expect(projects.listMessages(project.id)).toHaveLength(1);
    const artifact = projects.getArtifact(project.id, before.handoff.artifact.id);
    expect(artifact.content).toBe("POST /api/auth/login");

    // test results and costs, carried on the submission
    const submission = projects.getSubmission(project.id, before.submission.id);
    expect(submission.testResults.passed).toBe(22);
    expect(submission.costUsd).toBeCloseTo(0.84, 6);

    // agents: identity, branch, worktree, task, activity, cost, canvas layout
    const agent = agents.get(before.agent.id);
    expect(agent.name).toBe("Backend");
    expect(agent.position).toEqual({ x: 512, y: 128 });
    expect(agent.branch).toBe("agent/auth-backend");
    expect(agent.worktree).toBe(before.worktree.path);
    expect(agent.currentTaskId).toBe("api");
    expect(agent.activity.latestFile).toBe("session.ts");
    expect(agent.costUsd).toBeCloseTo(0.84, 6);
    expect(agent.tokensUsed).toBe(1200);

    // branches and worktrees still exist on disk
    expect(existsSync(before.worktree.path)).toBe(true);
    expect(git(["rev-parse", "--verify", "agent/auth-backend"], repo).ok).toBe(true);

    // reusable library
    expect(library.getSkill(before.skill.id).name).toBe("Test-Driven Bug Fix");
    expect(library.getPrompt(before.prompt.id).name).toBe("impl");
  });

  test("project cost aggregation is restored, not recomputed from zero", () => {
    const before = buildFullState();
    const agents = new AgentRegistry({ persistDir: dataDir });
    expect(agents.costSummary(before.project.id, 10).projectCostUsd).toBeCloseTo(0.84, 6);
    expect(agents.costSummary(before.project.id, 10).remainingUsd).toBeCloseTo(9.16, 6);
  });
});

describe("V-051: partial work is not lost", () => {
  test("an agent branch survives an abrupt loss of the process", () => {
    const before = buildFullState();

    // Simulate a crash: nothing is flushed, nothing is cleaned up — the worktree and its commit
    // live in git, independent of the server's lifetime.
    const branchHead = git(["rev-parse", "agent/auth-backend"], repo).stdout.trim();
    expect(branchHead).toMatch(/^[0-9a-f]{40}$/);

    // A new process reads the repository fresh.
    const reopened = openRepository(repo);
    expect(reopened.root).toBeTruthy();
    expect(git(["rev-parse", "agent/auth-backend"], repo).stdout.trim()).toBe(branchHead);
    expect(git(["show", "agent/auth-backend:session.ts"], repo).stdout).toContain("session = true");
    expect(existsSync(join(before.worktree.path, "session.ts"))).toBe(true);
  });

  test("uncommitted work in progress also survives, and is still reported", () => {
    const before = buildFullState();
    // Work the agent had not yet committed when the process died.
    writeFileSync(join(before.worktree.path, "wip.ts"), "// half-finished\n");

    const changed = openRepository(before.worktree.path).changedFiles.map((f) => f.path);
    expect(changed).toContain("wip.ts");
    expect(existsSync(join(before.worktree.path, "wip.ts"))).toBe(true);
  });

  test("submitted artifacts remain accessible after restart", () => {
    const before = buildFullState();
    const projects = new ProjectStore(join(dataDir, "projects"));

    const artifact = projects.getArtifact(before.project.id, before.handoff.artifact.id);
    expect(artifact.content).toBe("POST /api/auth/login");
    expect(artifact.producedByAgentId).toBe("backend");
    // And the submission that carried the work.
    expect(projects.getSubmission(before.project.id, before.submission.id).changedFiles).toContain("session.ts");
  });

  test("accepted document changes remain versioned after restart", () => {
    const before = buildFullState();
    const projects = new ProjectStore(join(dataDir, "projects"));

    // Both the accepted change and the text it replaced are still retrievable.
    expect(projects.getDocumentVersion(before.project.id, 2).content).toContain("full-page OAuth redirect");
    expect(projects.getDocumentVersion(before.project.id, 1).content).toContain("sign in with a modal");
    expect(projects.getDocumentVersion(before.project.id, 2).fromSuggestionId).toBe(before.suggestion.id);
  });

  test("a truncated project file does not destroy the other projects", () => {
    const before = buildFullState();
    const projects = new ProjectStore(join(dataDir, "projects"));
    const second = projects.createProject({ name: "Other", goal: "g", repositoryPath: repo });

    // Corrupt one project's file, as a mid-write crash might.
    writeFileSync(join(dataDir, "projects", `${second.id}.json`), "{ truncated");

    // The healthy project is unaffected.
    const reopened = new ProjectStore(join(dataDir, "projects"));
    expect(reopened.getProject(before.project.id).name).toBe("Authentication");
    expect(() => reopened.getProject(second.id)).toThrow();
  });

  test("atomic writes mean a project file is never left partially written", () => {
    const before = buildFullState();
    // tmp+rename: no .tmp file should survive a completed write.
    const dir = join(dataDir, "projects");
    const leftovers = existsSync(join(dir, `${before.project.id}.json.tmp`));
    expect(leftovers).toBe(false);
    expect(existsSync(join(dir, `${before.project.id}.json`))).toBe(true);
  });
});
