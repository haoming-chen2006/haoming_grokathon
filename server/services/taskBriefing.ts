import type { CodingTask, Project, Requirement } from "../types/project";

/**
 * The opening instruction an agent is given when its task is launched.
 *
 * Launching used to open a session and say nothing, so an agent started in its worktree and sat
 * idle — the user had clicked "Launch" and nothing launched. Every test and the acceptance script
 * typed an instruction by hand afterwards, which is why the gap survived: the product never did
 * what the scripts around it did.
 *
 * What goes in is what §10 says an agent receives: its objective, the requirement and acceptance
 * criteria it is being held to, the files and tests expected of it, and how to report back. The
 * review requirements are stated here rather than left for the agent to discover by having a
 * submission rejected.
 */
export function buildTaskBriefing(params: {
  project: Pick<Project, "goal">;
  task: CodingTask;
  requirement?: Requirement;
}): string {
  const { project, task, requirement } = params;
  const lines: string[] = [];

  lines.push(`You are implementing one task in the project "${project.goal}".`);
  lines.push("");
  lines.push(`Task ${task.id}: ${task.objective}`);

  if (requirement) {
    lines.push("");
    lines.push(`Requirement ${requirement.id}: ${requirement.description}`);
    const criteria = requirement.acceptanceCriteria ?? [];
    if (criteria.length > 0) {
      lines.push("It is accepted only when all of these hold:");
      for (const c of criteria) lines.push(`  - ${c.text}`);
    }
  }

  if (task.expectedFiles?.length) {
    lines.push("");
    lines.push(`Expected to change: ${task.expectedFiles.join(", ")}`);
  }
  if (task.requiredTests?.length) {
    lines.push(`Must be covered by: ${task.requiredTests.join(", ")}`);
  }

  lines.push("");
  lines.push("You are working in an isolated git worktree. Everything you need is in the current");
  lines.push("directory, and nothing you do here affects the base branch.");
  lines.push("");
  lines.push("Use the openui-project MCP tools as you work:");
  lines.push("  - get_technical_design and get_requirements to read what was approved");
  lines.push("  - update_task_progress to report status as you go");
  lines.push("  - record_test_result after running the project's tests");
  lines.push("  - report_blocker if you are stuck, rather than guessing");
  lines.push("  - submit_code_for_review when the work is done");
  lines.push("");
  // Stated up front because the server refuses a submission without it, and an agent that
  // discovers that by being rejected wastes a turn finding out.
  lines.push("A submission is rejected unless it carries the evidence: the branch, the changed");
  lines.push("files, a summary, and real test results. Run the tests before submitting.");
  lines.push("");
  // Observed: an agent implemented its task, ran the suite, saw a failure belonging to a *later*
  // task, and declined to submit at all — so the task sat at "working" with finished work in it.
  // In a plan, earlier tasks routinely cannot make the whole suite green.
  lines.push("Other tasks in this plan may not be implemented yet, so the suite can contain");
  lines.push("failures that are not yours. Submit anyway with the real numbers — reporting an");
  lines.push("honest partial result is right, withholding the submission is not.");
  lines.push("Use report_blocker only if you cannot do your own task.");
  lines.push("");
  lines.push("Start now. Read the existing code before changing it.");

  return lines.join("\n");
}
