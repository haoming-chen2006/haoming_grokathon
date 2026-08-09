/**
 * The only data the shell reads — loops/07-shell.md §0.1.
 *
 * Deliberately NOT in `useControlRoom.ts`, which is a hot file every worktree shares. The shell
 * needs three things and nothing else: which project is active, whether Grok is installed, and
 * what the workspace has spent. Everything richer belongs to a page.
 *
 * Every endpoint here exists on the merge base — `GET /api/projects`, `GET /api/grok/status` —
 * which is the SHELL-017 clause "the shell reads no server endpoint that does not exist today".
 * When reconciliation collapses the sockets behind a shared `subscribeControlRoom()` seam, this
 * module is the one place that changes.
 */
import { useEffect, useState } from "react";

export interface ShellProject {
  id: string;
  name: string;
}

export interface ShellNotification {
  id: string;
  /** One line of plain language. Never a stack trace, never an error code on its own. */
  message: string;
  tone: "warning" | "error";
}

export interface ShellData {
  projects: ShellProject[];
  activeProject?: ShellProject;
  notifications: ShellNotification[];
  spend: ShellSpend;
  loading: boolean;
}

/**
 * The running spend — three states, because two of them are not the same absence.
 *
 * `none`  nothing has been charged to this project at all. The toolbar draws "—".
 * `unpriced` money was spent and nothing could price it. The toolbar draws "unknown".
 * `priced` a figure, optionally against a budget — and `unpriced` counts the charges NOT in it, so
 *          a partial total announces itself as a floor rather than passing as a total.
 *
 * This used to be a constant: the toolbar rendered "unknown" on every page whatever had happened,
 * because DEFAULT_RATES held no Grok model and a plausible $0.00 is the same defect as a fabricated
 * affordance. It holds `grok-4.5` now, xAI bills media per unit, and a $0.02 image was invisible
 * one second after it was generated. The rule that produced the constant is intact — what changed
 * is that there is now something real to show, so showing nothing became the dishonest option.
 */
export type ShellSpend =
  | { state: "none" }
  | { state: "unpriced"; charges: number }
  | { state: "priced"; usd: number; unpriced: number; budgetUsd?: number };

/** What the toolbar shows before `GET /api/projects/:id/spend` has answered. */
export const UNPRICED: ShellSpend = { state: "none" };

interface SpendResponse {
  charges?: unknown;
  unpriced?: unknown;
  pricedUsd?: unknown;
  budgetUsd?: unknown;
}

/** Validate the spend body before rendering money from it. `as T` on a network value blanks pages. */
export function readSpend(body: SpendResponse | undefined): ShellSpend {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (!body || typeof body !== "object") return { state: "none" };
  const charges = num(body.charges);
  if (charges === 0) return { state: "none" };
  const unpriced = num(body.unpriced);
  const usd = num(body.pricedUsd);
  if (unpriced >= charges) return { state: "unpriced", charges };
  const budgetUsd = typeof body.budgetUsd === "number" && body.budgetUsd > 0 ? body.budgetUsd : undefined;
  return { state: "priced", usd, unpriced, ...(budgetUsd !== undefined ? { budgetUsd } : {}) };
}

async function getJson<T>(url: string): Promise<T | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

export function useShellData(): ShellData {
  const [data, setData] = useState<ShellData>({
    projects: [],
    notifications: [],
    spend: UNPRICED,
    loading: true,
  });

  useEffect(() => {
    let live = true;

    void (async () => {
      const [projects, grok] = await Promise.all([
        getJson<ShellProject[]>("/api/projects"),
        getJson<{ installed?: boolean; setupMessage?: string }>("/api/grok/status"),
      ]);
      if (!live) return;

      const notifications: ShellNotification[] = [];
      if (grok && grok.installed === false) {
        notifications.push({
          id: "grok-missing",
          tone: "error",
          message:
            grok.setupMessage ??
            "Grok is not installed, so agents cannot start. Install it and reload this page.",
        });
      }

      const list = Array.isArray(projects) ? projects : [];
      // `?project=<id>` wins over "the first one in the list".
      //
      // The list is oldest-first, so `list[0]` is the oldest project a machine has ever had. On a
      // machine with twenty-three of them, creating a new project appeared to do nothing: it was
      // created, and the shell kept showing the oldest. The id is in the URL rather than in state
      // so that a reload, a pasted link and the switcher are all the same code path.
      const wanted = new URLSearchParams(location.search).get("project");
      const active = list.find((p) => p.id === wanted) ?? list[0];
      setData({
        projects: list,
        activeProject: active,
        notifications,
        spend: UNPRICED,
        loading: false,
      });

      // Spend is fetched second and per project, so the shell renders the moment the project list
      // arrives rather than waiting on a figure. There is nothing to ask for with no project.
      if (!active) return;
      const spend = await getJson<SpendResponse>(
        `/api/projects/${encodeURIComponent(active.id)}/spend`,
      );
      if (!live) return;
      setData((d) => ({ ...d, spend: readSpend(spend) }));
    })();

    return () => {
      live = false;
    };
  }, []);

  return data;
}
