// Turn a design document into a project with a team standing in a workspace.
//
// This is the one action the product is built around: a user arrives with a document and everything
// downstream is derived from it. Before this, getting from a document to a working agent took eight
// HTTP calls in the right order, which is why only a script ever did it.
//
// What it deliberately does NOT do is launch anything. The plan lands as a draft and a human
// approves it, because that gate is the whole reason this product supervises agents rather than just
// running them. `bun run new` has stopped at the same line since the first version.
//
// THE WORKSPACE PROBLEM, AND WHY GIT IS STILL HERE
//
// Every agent is a `grok` process (A-0) and a `grok` process needs a working directory. For a
// software project that directory is the user's repository. For a sales deck there is no repository
// — and yet `--worktree` isolation, which is how one agent is kept out of another's work, is a git
// feature. So a project without a repository gets one: an empty git repository under the data
// directory, holding the design document that declared it. That is not ceremony. It is what makes
// the isolation mechanism the same in both cases, rather than two mechanisms with one tested.

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getProjectStore } from "./projectStore";
import { parseDeclaration } from "./designDoc";
import { getWorkAreaStore } from "./workArea";
import type { CodingAgent } from "../types/agent";

function workspacesDir(): string {
  return join(process.env.OPENUI_DATA_DIR || join(homedir(), ".openui"), "workspaces");
}

const git = (args: string[], cwd: string) =>
  execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();

/**
 * A git repository for a project that did not bring one.
 *
 * Idempotent: called twice for the same project it returns the same directory rather than a second
 * repository, because a retry after a failed plan must not strand the first workspace.
 */
export function ensureWorkspace(documentId: string, documentTitle: string, documentText: string): string {
  const dir = join(workspacesDir(), documentId);
  if (existsSync(join(dir, ".git"))) return dir;

  mkdirSync(dir, { recursive: true });
  git(["init", "-b", "main"], dir);
  // A committer that is obviously this product, so `git log` in a worktree reads honestly rather
  // than borrowing whatever global identity the machine happens to have.
  git(["config", "user.email", "workspace@grok-workspace.local"], dir);
  git(["config", "user.name", "grok-workspace"], dir);

  writeFileSync(join(dir, "design.md"), documentText, "utf8");
  writeFileSync(
    join(dir, "README.md"),
    `# ${documentTitle}\n\nThe workspace for this project. \`design.md\` is the document that declared it.\n`,
    "utf8",
  );
  git(["add", "-A"], dir);
  git(["commit", "-m", `Open the workspace for ${documentTitle}`], dir);
  return dir;
}

export interface StartWorkResult {
  projectId: string;
  workspace: string;
  agents: CodingAgent[];
  requirementIds: string[];
  areaIds: string[];
  areaNames: string[];
  /** Present when the document's `project` block did not parse; the project is still created. */
  declarationErrors?: { line: number; message: string }[];
}

/**
 * Create the project a document declares, seed its team, and stand it in a workspace.
 *
 * `repositoryPath` wins when the caller supplies one — a software project works in the user's own
 * repository, and inventing a second one beside it would be the wrong answer. Everything else gets
 * the managed workspace above.
 */
export function startWork(params: {
  documentId: string;
  documentTitle: string;
  documentText: string;
  repositoryPath?: string;
}): StartWorkResult {
  const parsed = parseDeclaration(params.documentText);
  const declared = parsed.declaration;

  // The workspace is keyed by the DOCUMENT, not the project, because the document id exists before
  // the project does — so the repository path can be passed to createProject rather than patched on
  // afterwards. It also reads correctly: one project follows a document, so one workspace per
  // document is the same cardinality by another name.
  const workspace = params.repositoryPath
    ?? ensureWorkspace(params.documentId, params.documentTitle, params.documentText);

  const store = getProjectStore();
  const project = store.createProject({
    name: declared?.name ?? params.documentTitle,
    goal: declared ? `${declared.category} — ${declared.areas.length} area(s)` : "",
    repositoryPath: workspace,
    documentTitle: params.documentTitle,
    documentContent: params.documentText,
    budgetUsd: declared?.budget,
  });

  // Requirements come from the declared areas: an area is the unit of work a milestone hangs off,
  // and it is what an agent is confined to. A document that declared none yields none rather than a
  // requirement invented from a heading.
  const requirementIds: string[] = [];
  for (const area of declared?.areas ?? []) {
    const id = area.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    try {
      store.addRequirement(
        project.id,
        { id, description: area.description ?? area.name, acceptanceCriteria: [] },
        { kind: "user", id: "user" },
      );
      requirementIds.push(id);
    } catch {
      // A duplicate or rejected id must not lose the project; the panel reports what landed.
    }
  }

  /**
   * One colour box per declared area, created empty.
   *
   * The board is areas, and an area is what an agent is confined to — so a project with none is a
   * board with nothing to click and no boundary to enforce. They are created here, at the moment the
   * document declares them, rather than when a plan is generated: the areas are the user's own
   * headings and exist whether or not anyone has planned anything yet.
   *
   * Each one is EMPTY: a name, a colour, a milestone, and no agent. Clicking it is how an agent gets
   * put inside.
   */
  const areaIds: string[] = [];
  const areaStore = getWorkAreaStore();
  for (const [i, area] of (declared?.areas ?? []).entries()) {
    try {
      const created = areaStore.create({
        projectId: project.id,
        name: area.name,
        // The line the area was declared on is its anchor in the document — that is what makes an
        // area a region of the brief rather than a label beside it.
        briefSectionAnchor: `L${area.line}`,
        milestoneId: `m${i + 1}`,
        rootPath: workspace,
      });
      areaIds.push(created.id);
    } catch {
      // A rejected area must not lose the project; the board shows what landed.
    }
  }

  /**
   * No team is seeded. The areas ARE the project's shape, and an agent is hired into one.
   *
   * Five agents used to appear the moment a document was pasted — Planner, Backend, Frontend, Test,
   * Reviewer — which was the retired coding product's roster arriving in a workspace that makes
   * slides. It also pre-answered the question the board exists to ask: an agent's capability is
   * what it may spend on, and choosing that is the user's decision, taken on the box it will work
   * in. A seeded agent is one nobody chose.
   *
   * `seedDefaultTeam` is still used by POST /api/projects, where a caller that wants the old
   * behaviour can still ask for it.
   */
  const agents: CodingAgent[] = [];

  return {
    projectId: project.id,
    workspace,
    agents,
    requirementIds,
    areaIds,
    areaNames: (declared?.areas ?? []).map((a) => a.name),
    declarationErrors: parsed.ok ? undefined : parsed.errors,
  };
}
