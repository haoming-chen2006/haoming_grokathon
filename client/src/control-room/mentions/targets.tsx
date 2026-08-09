/**
 * What an `@` can point at: this project's assets, and this project's design documents.
 *
 * Two endpoints that already exist — `GET /api/assets?projectId=` and
 * `GET /api/design-docs?projectId=` — read once for the whole surface and put in a context, because
 * three things need the same list and must agree about it: the picker offers it, a rendered mention
 * checks itself against it, and the "this one is gone" treatment is only honest if the list is
 * known to have arrived.
 *
 * That last point is why `loaded` exists separately from `loading`. A mention whose target is not
 * in a list we never managed to fetch is not a deleted asset; it is a list we do not have. Saying
 * "no longer exists" there would be inventing a fact, so nothing says it until both lists are in.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MentionKind } from "../designdoc/markdown";

export interface MentionTarget {
  kind: MentionKind;
  id: string;
  /**
   * The record's own title. OPTIONAL, and absent rather than defaulted: a record that arrived
   * without one is listed by its id, which is a real value, instead of a plausible invention.
   */
  title?: string;
}

export interface MentionTargets {
  /** The project these targets belong to. Empty means there is no project to link inside. */
  projectId: string;
  targets: MentionTarget[];
  loading: boolean;
  /** Both lists came back. Only then can anything claim a target is missing. */
  loaded: boolean;
  /** What failed, in the server's own words. A partial failure still lists what did arrive. */
  error: string | null;
}

const NOTHING: MentionTargets = {
  projectId: "",
  targets: [],
  loading: false,
  loaded: false,
  error: null,
};

async function listJson(url: string): Promise<unknown[]> {
  const res = await fetch(url);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `${url} returned ${res.status}`;
    throw new Error(message);
  }
  // Checked, never asserted. `as T[]` on a value that came over a network has thrown inside render
  // and blanked this page three times; `Array.isArray` is the whole fix and it belongs at every
  // fetch in this product.
  if (!Array.isArray(body)) throw new Error(`${url} did not return a list`);
  return body;
}

/** One record, kept only if it carries the one field a link cannot be built without. */
function targetsFrom(kind: MentionKind, rows: unknown[]): MentionTarget[] {
  const out: MentionTarget[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { id?: unknown; title?: unknown };
    if (typeof record.id !== "string" || record.id === "") continue;
    const title = typeof record.title === "string" && record.title.trim() !== "" ? record.title : undefined;
    out.push({ kind, id: record.id, title });
  }
  return out;
}

/**
 * Read both lists for one project.
 *
 * A failure in one does not hide the other: a broken assets endpoint still leaves every design
 * document linkable, and the picker states what it could not read rather than pretending the
 * shelf is empty.
 */
export function useProjectMentionTargets(projectId: string): MentionTargets {
  const [state, setState] = useState<MentionTargets>({ ...NOTHING, projectId });

  useEffect(() => {
    if (!projectId) {
      setState({ ...NOTHING, projectId: "" });
      return;
    }
    let live = true;
    setState({ projectId, targets: [], loading: true, loaded: false, error: null });
    const scope = `projectId=${encodeURIComponent(projectId)}`;
    void (async () => {
      const failures: string[] = [];
      const read = async (url: string, kind: MentionKind, what: string) => {
        try {
          return targetsFrom(kind, await listJson(url));
        } catch (e) {
          failures.push(`${what}: ${(e as Error).message}`);
          return [];
        }
      };
      // Both at once, but assembled in a fixed order rather than in the order they land: a list
      // whose rows move between reads is a list nobody can pick from by muscle memory.
      const [assets, docs] = await Promise.all([
        read(`/api/assets?${scope}`, "asset", "assets"),
        read(`/api/design-docs?${scope}`, "doc", "design documents"),
      ]);
      if (!live) return;
      setState({
        projectId,
        targets: [...assets, ...docs],
        loading: false,
        loaded: failures.length === 0,
        error: failures.length === 0 ? null : `Could not read ${failures.join("; ")}`,
      });
    })();
    return () => {
      live = false;
    };
  }, [projectId]);

  return state;
}

const MentionTargetsContext = createContext<MentionTargets>(NOTHING);

/**
 * What `@` can reach, for everything below.
 *
 * Outside a provider the value is `NOTHING`, whose `projectId` is empty — so the picker does not
 * open and a rendered mention makes no claim about whether its target still exists. A surface that
 * has not been given a project is not a surface with nothing in it.
 */
export function MentionTargetsProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const value = useProjectMentionTargets(projectId);
  return <MentionTargetsContext.Provider value={value}>{children}</MentionTargetsContext.Provider>;
}

export function useMentionTargets(): MentionTargets {
  return useContext(MentionTargetsContext);
}

/** What a target is called on screen: its title, or its id when it has none. */
export function targetName(target: MentionTarget): string {
  return target.title ?? target.id;
}

/** The plain word for a kind. Never the scheme — `doc:` is spelling, not language. */
export function kindLabel(kind: MentionKind): string {
  return kind === "asset" ? "Asset" : "Design document";
}

/**
 * The targets a query admits, in the order they were listed.
 *
 * Matched on both the name and the id, because half the ids in this product ARE names
 * (`chair_launch_plan`) and a user who types the one they can see should find it either way.
 */
export function matchTargets(targets: MentionTarget[], query: string): MentionTarget[] {
  const q = query.trim().toLowerCase();
  if (q === "") return targets;
  return targets.filter(
    (t) => targetName(t).toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
  );
}

/** The target a mention names, if this project still has it. */
export function useMentionTarget(kind: MentionKind, id: string): {
  target?: MentionTarget;
  /** True only when the lists are in and the target is not among them. */
  missing: boolean;
} {
  const { targets, loaded } = useMentionTargets();
  return useMemo(() => {
    const target = targets.find((t) => t.kind === kind && t.id === id);
    return { target, missing: loaded && !target };
  }, [targets, loaded, kind, id]);
}
