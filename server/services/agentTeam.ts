import { getAgentRegistry, type AgentRegistry } from "./agentRegistry";
import type { CodingAgent } from "../types/agent";

export interface TeamMember {
  name: string;
  role: string;
  persona: string;
}

/** The roles §14 names, each with the persona that reaches its session at launch. */
export const DEFAULT_TEAM: readonly TeamMember[] = [
  { name: "Planner", role: "Planner", persona: "Break work into small, independently reviewable tasks. State dependencies explicitly." },
  { name: "Backend Engineer", role: "Backend Engineer", persona: "Prefer small, reviewable changes. Follow existing repository patterns. Run relevant tests after every change. Do not modify unrelated files." },
  { name: "Frontend Engineer", role: "Frontend Engineer", persona: "Match the existing component conventions. Check accessibility. Keep components testable." },
  { name: "Test Engineer", role: "Test Engineer", persona: "Write the failing test first. Cover the acceptance criteria, not the implementation." },
  { name: "Reviewer", role: "Reviewer", persona: "Be skeptical. Check the change against the approved design and say what is missing." },
];

/**
 * Give a new project the five-role team.
 *
 * A project created from the browser had no agents at all, and nothing in the product created one.
 * So the Planner resolved every task's role to nobody, the plan came back entirely unassigned, and
 * the first click on Launch was refused with NO_AGENT — the loop dead-ended with no way to recover
 * inside the UI. The team existed only in scripts/start-project.mjs, which is why every scripted
 * run looked healthy while the browser path did not.
 *
 * The definition lives here rather than in that script so the CLI and the HTTP route cannot drift
 * into two different teams, and so a role the Planner assigns is a role some agent actually holds.
 *
 * The project budget is split evenly, because an agent with no cap of its own can spend the whole
 * project budget on one task (§16).
 */
/** The role families the team is built around, and the words a model reaches for to name them. */
const FAMILIES: ReadonlyArray<{ family: string; words: readonly string[] }> = [
  { family: "test", words: ["test", "qa", "quality"] },
  { family: "review", words: ["review", "critic"] },
  { family: "plan", words: ["plan", "architect", "lead"] },
  { family: "frontend", words: ["frontend", "front end", "ui", "client", "web", "design"] },
  { family: "backend", words: ["backend", "back end", "server", "api", "service", "engineer", "developer"] },
];

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Back-End Developer" and "backend engineer" are the same role; "test" beats "engineer". */
function familyOf(role: string): string | undefined {
  const n = normalise(role);
  // Ordered most specific first: "Test Engineer" contains "engineer", but it is a tester.
  return FAMILIES.find((f) => f.words.some((w) => n.includes(w)))?.family;
}

export type RoleMatch = "exact" | "normalised" | "family" | "fallback";

/**
 * Resolve the role the Planner wrote onto a task to an agent that actually exists.
 *
 * This was an exact string lookup, and the Planner is a model: it is asked for one of five role
 * names and usually complies, but a run that answered "Backend Developer" or "backend engineer"
 * resolved to nobody. The task was then stored with no owner, Launch refused it with NO_AGENT, and
 * nothing anywhere recorded which role had failed to match — the plan simply came back unassigned
 * and inert. Two projects planned minutes apart from the same document differed only in that one
 * run's wording, which is why it read as random.
 *
 * So: match exactly, then ignoring case and punctuation, then by role family — and if none of that
 * lands, hand the task to an implementer anyway. An owner the user can reassign is worth more than
 * a plan that cannot be launched, and `match` tells the caller which of those happened so a wording
 * the Planner keeps inventing leaves a trace instead of a silent gap.
 */
export function resolveAgentForRole(
  role: string,
  agents: ReadonlyArray<Pick<CodingAgent, "id" | "role" | "name">>,
): { agentId?: string; match: RoleMatch } {
  if (agents.length === 0) return { match: "fallback" };

  const exact = agents.find((a) => a.role === role);
  if (exact) return { agentId: exact.id, match: "exact" };

  const wanted = normalise(role);
  const loose = agents.find((a) => normalise(a.role) === wanted || normalise(a.name) === wanted);
  if (loose) return { agentId: loose.id, match: "normalised" };

  const family = familyOf(role);
  if (family) {
    const kin = agents.find((a) => familyOf(a.role) === family);
    if (kin) return { agentId: kin.id, match: "family" };
  }

  // Nothing matched. Prefer whoever writes the code: an unowned task cannot launch at all, and
  // planning and reviewing are not implementation roles.
  const implementer =
    agents.find((a) => familyOf(a.role) === "backend") ??
    agents.find((a) => familyOf(a.role) === "frontend") ??
    agents.find((a) => !["plan", "review"].includes(familyOf(a.role) ?? "")) ??
    agents[0];
  return { agentId: implementer?.id, match: "fallback" };
}

export function seedDefaultTeam(
  projectId: string,
  options: { budgetUsd?: number; registry?: AgentRegistry } = {},
): CodingAgent[] {
  const registry = options.registry ?? getAgentRegistry();

  // Seeding twice would leave ten agents and two candidates for every role, so a project that
  // already has a team keeps it.
  const existing = registry.list(projectId);
  if (existing.length > 0) return existing;

  const share =
    options.budgetUsd === undefined || options.budgetUsd <= 0
      ? undefined
      : Number((options.budgetUsd / DEFAULT_TEAM.length).toFixed(2));

  return DEFAULT_TEAM.map((member) =>
    registry.create({
      projectId,
      name: member.name,
      role: member.role,
      persona: member.persona,
      budgetUsd: share,
    }),
  );
}
