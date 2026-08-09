/**
 * What the DESIGN DOCUMENTS page reads.
 *
 * Two endpoints, both of which exist: `GET /api/design-docs` for every document with its
 * declaration already parsed, and `GET /api/coding-agents?projectId=` for the agents of whatever
 * project follows the open one. There is no third: presence has no service, and `presence.ts`
 * derives what it can from the second rather than inventing a source.
 *
 * The client never re-parses a document. `shared/designDocument.ts` exists because the CLI and the
 * browser once had two parsers and drifted about what a project's requirements were.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentView } from "../agents/types";
import { reportsFromAgents, type PresenceReport } from "./presence";

export interface DeclaredArea {
  name: string;
  description?: string;
  line: number;
}

export interface ProjectDeclaration {
  name: string;
  category: string;
  budget?: number;
  areas: DeclaredArea[];
  blockStart: number;
  blockEnd: number;
}

export interface DeclarationResult {
  ok: boolean;
  declaration?: ProjectDeclaration;
  errors: Array<{ line: number; message: string }>;
}

export interface DocSectionView {
  title: string;
  body: string;
  firstLine: number;
}

export interface DesignDocView {
  id: string;
  title: string;
  text: string;
  lineCount: number;
  sections: DocSectionView[];
  declaration: DeclarationResult;
  followedByProjectId?: string;
}

export interface DesignDocsData {
  docs: DesignDocView[];
  /** The open document: the URL's selection when it resolves, otherwise the first. */
  doc?: DesignDocView;
  /** The agents of the project that follows the open document. Empty when none does. */
  agents: AgentView[];
  /** Who is inside the open document, derived — see `reportsFromAgents`. */
  reports: PresenceReport[];
  loading: boolean;
  error?: string;
  /** Re-read the list. Called after drafting writes a new document. */
  refresh(): void;
  /**
   * Put a saved document back into the list, in place.
   *
   * An edit can change a document's title — the title IS its first heading — and its declaration,
   * so the rail and the inspector are stale the moment a save lands. The saved document comes back
   * in the PUT's response, already parsed by the server's parser, so this replaces rather than
   * refetches: a second GET would be a second parse of the same bytes and a visible flicker.
   */
  replaceDoc(saved: DesignDocView): void;
}

async function getJson(url: string): Promise<unknown> {
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
  return body;
}

/**
 * @param projectId the ACTIVE project. Scopes the list, so switching project switches the document
 *   rather than leaving every project looking at whichever document sorted first on disk.
 */
export function useDesignDocs(projectId: string, selectionId?: string): DesignDocsData {
  const [docs, setDocs] = useState<DesignDocView[]>([]);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const body = await getJson(
          projectId ? `/api/design-docs?projectId=${encodeURIComponent(projectId)}` : "/api/design-docs",
        );
        // Checked, not asserted. `as DesignDocView[]` is a claim about a value that arrived over a
        // network, and when the body was anything else — an error object, a stubbed fetch in a test
        // — `docs.map` threw during render. With no error boundary above, that unmounted the whole
        // shell: the page went blank and only a reload brought it back.
        if (!Array.isArray(body)) {
          throw new Error("GET /api/design-docs returned something that is not a list of documents");
        }
        if (!live) return;
        setDocs(body as DesignDocView[]);
        setError(undefined);
      } catch (e) {
        // Stated, never swallowed into an empty list: "no documents" and "could not load documents"
        // are different facts and the page must not conflate them.
        if (live) setError(String((e as Error).message ?? e));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, nonce]);

  const doc = docs.find((d) => d.id === selectionId) ?? docs[0];
  // The project that follows the OPEN document, which is not always the active one: an unclaimed
  // draft travels with every project and is followed by none, and it has no team to show.
  const docProjectId = doc?.followedByProjectId;

  useEffect(() => {
    let live = true;
    if (!docProjectId) {
      setAgents([]);
      return;
    }
    void (async () => {
      try {
        const body = await getJson(`/api/coding-agents?projectId=${encodeURIComponent(docProjectId)}`);
        if (live) setAgents(Array.isArray(body) ? (body as AgentView[]) : []);
      } catch {
        // A document still renders without its team. The failure that matters on this page is a
        // document that will not load, and that one is reported above.
        if (live) setAgents([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [docProjectId]);

  const reports = useMemo(() => (doc ? reportsFromAgents(agents, doc.id) : []), [agents, doc]);

  const replaceDoc = useCallback((saved: DesignDocView) => {
    setDocs((prev) => prev.map((d) => (d.id === saved.id ? saved : d)));
  }, []);

  return { docs, doc, agents, reports, loading, error, refresh, replaceDoc };
}
