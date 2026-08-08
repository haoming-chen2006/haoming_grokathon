import { useState } from "react";
import { parseRequirements } from "../../../shared/designDocument";

export interface NewProjectInput {
  /** Requirements read out of the document, imported after the project is created. */
  requirements?: Array<{ id: string; description: string }>;
  name: string;
  goal: string;
  repositoryPath: string;
  baseBranch?: string;
  budgetUsd?: number;
  documentContent?: string;
}

interface Props {
  onCreate: (input: NewProjectInput) => Promise<void> | void;
  busy?: boolean;
  error?: string | null;
}

/**
 * Opening a repository and importing its design document (§10 steps 1-2).
 *
 * The empty state used to print a `curl` command, which meant the first thing the Control Room
 * asked of a user was to leave it. The design names exactly what is chosen here: local repository,
 * base branch, project name, objective, budget, and an existing issue, PRD or technical design.
 *
 * "Optional deadline" is the one field in that list with nowhere to go — the API does not store
 * one — so it is deliberately absent rather than collected and dropped.
 */
export function NewProjectPanel({ onCreate, busy, error }: Props) {
  const [repositoryPath, setRepositoryPath] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [budget, setBudget] = useState("10");
  const [documentContent, setDocumentContent] = useState("");

  // A project without a repository has nothing to work in, and one without a name is unfindable.
  const ready = repositoryPath.trim().length > 0 && name.trim().length > 0;

  // The same parser the CLI uses, so the two cannot disagree about what a document contains.
  const found = parseRequirements(documentContent);

  const field = "w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm text-white placeholder-white/25 focus:border-white/30 focus:outline-none";
  const label = "mb-1 block text-[11px] uppercase tracking-wide text-white/40";

  return (
    <form
      data-testid="new-project"
      className="max-w-2xl p-6 text-white"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        void onCreate({
          name: name.trim(),
          goal: goal.trim(),
          repositoryPath: repositoryPath.trim(),
          baseBranch: baseBranch.trim() || undefined,
          budgetUsd: budget.trim() ? Number(budget) : undefined,
          documentContent: documentContent.trim() || undefined,
          requirements: found.length ? found : undefined,
        });
      }}
    >
      <div className="mb-1 text-base font-semibold">Open a repository</div>
      <p className="mb-4 text-xs text-white/50">
        Point at a local git repository and describe what you want built. Agents work in isolated
        worktrees off the base branch, so nothing touches it without your approval.
      </p>

      <div className="mb-3">
        <label className={label} htmlFor="np-repo">Local repository</label>
        <input
          id="np-repo" data-testid="np-repo" className={field} value={repositoryPath}
          onChange={(e) => setRepositoryPath(e.target.value)}
          placeholder="/absolute/path/to/a/git/repo"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="np-name">Project name</label>
          <input id="np-name" data-testid="np-name" className={field} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Authentication" />
        </div>
        <div>
          <label className={label} htmlFor="np-branch">Base branch</label>
          <input id="np-branch" data-testid="np-branch" className={field} value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)} placeholder="main" />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-[1fr_8rem] gap-3">
        <div>
          <label className={label} htmlFor="np-goal">Objective</label>
          <input id="np-goal" data-testid="np-goal" className={field} value={goal}
            onChange={(e) => setGoal(e.target.value)} placeholder="Ship passwordless auth" />
        </div>
        <div>
          <label className={label} htmlFor="np-budget">Budget (USD)</label>
          <input id="np-budget" data-testid="np-budget" className={field} value={budget}
            inputMode="decimal" onChange={(e) => setBudget(e.target.value)} />
        </div>
      </div>

      <div className="mb-4">
        <label className={label} htmlFor="np-design">Design document</label>
        <textarea
          id="np-design" data-testid="np-design" className={`${field} h-40 font-mono text-xs`}
          value={documentContent} onChange={(e) => setDocumentContent(e.target.value)}
          placeholder={"# Authentication\\n\\n## Requirements\\n\\n- AUTH-01: Login returns a token"}
        />
        <div className="mt-1 text-[11px] text-white/35">
          Paste a PRD, an issue or a technical design. It becomes version 1 of the project document,
          which agents may read and propose changes to, but never edit directly.
        </div>
        <div data-testid="np-requirements" className="mt-1 text-[11px] text-white/45">
          {found.length === 0
            ? 'No requirements found. Write them as list items — "- AUTH-01: Login returns a token" — to track implementation against them.'
            : `${found.length} requirement${found.length === 1 ? "" : "s"} will be imported: ${found.map((r) => r.id).join(", ")}`}
        </div>
      </div>

      {error && (
        <div data-testid="np-error" role="alert" className="mb-3 rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        data-testid="np-submit"
        disabled={!ready || busy}
        title={ready ? undefined : "A repository path and a project name are required"}
        className="rounded bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
