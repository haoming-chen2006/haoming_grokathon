import { AcpConnection } from "./acpClient";
import { projectMcpUrl } from "../routes/mcp";
import type { TokenUsage } from "./usageAccounting";

/**
 * The Planner (product-design.md §10 step 4, V-017).
 *
 * The Planner is a Grok agent given the Project MCP server, so it reads the design document and
 * repository through the same tools every other agent uses rather than being handed a summary.
 * Its output is parsed into a structured plan; a plan that cannot be parsed is an error, never a
 * silently empty plan.
 */

export interface PlannedTask {
  id: string;
  objective: string;
  role: string;
  requirementId?: string;
  dependsOn: string[];
  expectedFiles: string[];
  requiredTests: string[];
}

export interface PlannedMilestone {
  id: string;
  name: string;
  role: string;
  dependsOn: string[];
}

export interface GeneratedPlan {
  milestones: PlannedMilestone[];
  tasks: PlannedTask[];
  /** Raw model output, kept so a bad parse can be diagnosed rather than guessed at. */
  raw: string;
  /**
   * What the planning turn consumed.
   *
   * This is a real Grok session costing real money, and it was measured by the ACP layer and
   * discarded here — so the Planner ran for free as far as the ledger was concerned, the project
   * total understated real spending, and the budget caps of V-046 could not see it. It matters
   * more now that the Control Room has a "Generate plan" button, where a user would watch a
   * minute-long agent turn and then read $0.00.
   */
  usage?: TokenUsage;
}

export class PlanParseError extends Error {
  readonly code = "PLAN_PARSE_FAILED";
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = "PlanParseError";
  }
}

export const PLANNER_PROMPT = `You are the Planner for a software project.

Use the openui-project MCP tools to read the project before planning:
- get_project for the goal and repository
- get_technical_design for the approved design document
- get_requirements for the requirements you must cover
- get_repository_summary to see the codebase you are planning against

Then produce an implementation plan. Reply with ONLY a JSON object, no prose and no code fence:

{
  "milestones": [
    {"id": "m1", "name": "Authentication API", "role": "Backend Engineer", "dependsOn": []}
  ],
  "tasks": [
    {
      "id": "t1",
      "objective": "Implement the authentication endpoints",
      "role": "Backend Engineer",
      "requirementId": "AUTH-01",
      "dependsOn": [],
      "expectedFiles": ["src/auth/session.ts"],
      "requiredTests": ["tests/auth/session_test.ts"]
    }
  ]
}

Rules:
- every requirement returned by get_requirements must be covered by at least one task
- task ids referenced in dependsOn must exist in the same plan
- roles must be one of: Planner, Backend Engineer, Frontend Engineer, Test Engineer, Reviewer`;

/** Pull a JSON object out of model output that may be wrapped in prose or a code fence. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new PlanParseError("No JSON object found in the planner's reply", raw);
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new PlanParseError(
      `Planner reply was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }
}

/** Validate and normalise a parsed plan. Rejects a structurally unusable plan. */
export function normalisePlan(parsed: unknown, raw: string): GeneratedPlan {
  const obj = parsed as { milestones?: unknown[]; tasks?: unknown[] };
  const rawTasks = Array.isArray(obj?.tasks) ? obj.tasks : [];
  if (rawTasks.length === 0) {
    throw new PlanParseError("Planner returned no tasks", raw);
  }

  const tasks: PlannedTask[] = rawTasks.map((t: any, i) => ({
    id: String(t?.id ?? `t${i + 1}`),
    objective: String(t?.objective ?? "").trim(),
    role: String(t?.role ?? "Backend Engineer"),
    requirementId: t?.requirementId ? String(t.requirementId) : undefined,
    dependsOn: Array.isArray(t?.dependsOn) ? t.dependsOn.map(String) : [],
    expectedFiles: Array.isArray(t?.expectedFiles) ? t.expectedFiles.map(String) : [],
    requiredTests: Array.isArray(t?.requiredTests) ? t.requiredTests.map(String) : [],
  }));

  const withoutObjective = tasks.filter((t) => !t.objective);
  if (withoutObjective.length > 0) {
    throw new PlanParseError(`${withoutObjective.length} task(s) have no objective`, raw);
  }

  // A dependency on a task that does not exist would produce a permanently blocked graph, so it
  // is dropped here rather than persisted and discovered later as a stuck agent.
  const known = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    task.dependsOn = task.dependsOn.filter((d) => known.has(d) && d !== task.id);
  }

  const milestones: PlannedMilestone[] = (Array.isArray(obj?.milestones) ? obj.milestones : []).map(
    (m: any, i) => ({
      id: String(m?.id ?? `m${i + 1}`),
      name: String(m?.name ?? `Milestone ${i + 1}`),
      role: String(m?.role ?? "Planner"),
      dependsOn: Array.isArray(m?.dependsOn) ? m.dependsOn.map(String) : [],
    }),
  );

  return { milestones, tasks, raw };
}

/** Requirements with no task covering them — reported, not silently tolerated. */
export function uncoveredRequirements(plan: GeneratedPlan, requirementIds: string[]): string[] {
  const covered = new Set(plan.tasks.map((t) => t.requirementId).filter(Boolean) as string[]);
  return requirementIds.filter((id) => !covered.has(id));
}

export interface RunPlannerOptions {
  projectId: string;
  cwd: string;
  port: number;
  agentId?: string;
  /** Persona and skills of the Planner agent, appended to the session's system prompt (§14). */
  rules?: string;
  /**
   * How the connection is built. Injectable so a test can read what `session/new` is actually
   * handed: testing the composer alone proves nothing about the call site, which is how the
   * planner came to open sessions with no rules while every unit test stayed green.
   */
  createConnection?: (opts: ConstructorParameters<typeof AcpConnection>[0]) => AcpConnection;
  timeoutMs?: number;
}

/**
 * Run the Planner against a live Grok session with the Project MCP server attached.
 * Returns the structured plan; the caller decides whether to persist it (always as a draft).
 */
export async function runPlanner(opts: RunPlannerOptions): Promise<GeneratedPlan> {
  const agentId = opts.agentId ?? "planner";
  const build = opts.createConnection ?? ((o: ConstructorParameters<typeof AcpConnection>[0]) => new AcpConnection(o));
  const conn = build({ agentId, cwd: opts.cwd, requestTimeoutMs: 120_000 });
  try {
    conn.start();
    await conn.initialize();
    await conn.newSession(
      opts.cwd,
      [{ type: "http", name: "openui-project", url: projectMcpUrl(opts.port, opts.projectId, agentId), headers: [] }],
      // The Planner's persona was configurable and reached nothing: this path opened its session
      // with no rules, so a persona set by `bun run new` or the Control Room did nothing at all.
      opts.rules ? { rules: opts.rules } : {},
    );

    const reply = await conn.prompt(PLANNER_PROMPT, { timeoutMs: opts.timeoutMs ?? 300_000 });
    return { ...normalisePlan(extractJson(reply.text), reply.text), usage: reply.usage };
  } finally {
    conn.stop();
  }
}
