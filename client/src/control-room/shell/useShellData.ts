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
  loading: boolean;
}

/**
 * The running spend.
 *
 * `usageAccounting`'s DEFAULT_RATES holds only gpt-4o, gpt-4o-mini and gpt-4.1 — no Grok model —
 * so an unknown model returns costUsd 0 with rateKey null, and there is no ledger, only running
 * totals. In wave 1 every figure the product could show is very likely a fabricated $0.00.
 *
 * So the toolbar renders **unknown**, and this type has no number in it at all. That is not a
 * missing feature; a fabricated cost figure is the same defect as a fabricated affordance, and
 * `AgentCard.tsx` omits every field the server did not supply for the same reason. It becomes a
 * real number in wave 2 when 06-tools-cost lands the ledger, with no change to the shell.
 */
export type ShellSpend = { known: false } | { known: true; usd: number; budgetUsd?: number };

export const UNPRICED: ShellSpend = { known: false };

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
  const [data, setData] = useState<ShellData>({ projects: [], notifications: [], loading: true });

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
        loading: false,
      });
    })();

    return () => {
      live = false;
    };
  }, []);

  return data;
}
