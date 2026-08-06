import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesignDocumentPanel } from "./DesignDocumentPanel";
import { RequirementDetail, RequirementList } from "./RequirementPanel";
import { requirementStatusLabel, type DesignDocumentView, type Requirement } from "./projectTypes";
import type { CodingAgent } from "./types";

afterEach(cleanup);

function doc(overrides: Partial<DesignDocumentView> = {}): DesignDocumentView {
  return { title: "Authentication Design", version: 1, content: "# Auth\n\nUsers sign in.", ...overrides };
}

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "AUTH-03",
    description: "Users remain signed in after refreshing the page.",
    acceptanceCriteria: [
      { id: "c1", text: "Session survives reload", met: true },
      { id: "c2", text: "Token rotates", met: false },
    ],
    taskIds: [],
    affectedFiles: [],
    status: "in_progress",
    reviewStatus: "pending",
    baseVersion: 1,
    ...overrides,
  };
}

describe("V-012: design document can be created or imported", () => {
  test("renders the document with its title and version", () => {
    render(<DesignDocumentPanel document={doc()} />);
    expect(screen.getByTestId("document-title").textContent).toBe("Authentication Design");
    expect(screen.getByTestId("document-version").textContent).toBe("v1");
    expect((screen.getByTestId("document-content") as HTMLTextAreaElement).value).toContain("Users sign in.");
  });

  test("an absent document explains both create and import", () => {
    render(<DesignDocumentPanel document={null} />);
    const text = screen.getByTestId("document-empty").textContent!;
    expect(text).toContain("Create one");
    expect(text).toContain("paste an existing design");
  });

  test("editing marks the document dirty and enables save", () => {
    render(<DesignDocumentPanel document={doc()} onSave={() => 2} />);
    expect((screen.getByTestId("document-save") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("document-content"), { target: { value: "# Edited" } });

    expect(screen.getByTestId("document-dirty").textContent).toBe("Unsaved changes");
    expect((screen.getByTestId("document-save") as HTMLButtonElement).disabled).toBe(false);
  });

  test("saving passes the edited content through and clears the dirty flag", async () => {
    const saved: string[] = [];
    render(<DesignDocumentPanel document={doc()} onSave={(c) => { saved.push(c); return 2; }} />);

    fireEvent.change(screen.getByTestId("document-content"), { target: { value: "# Edited" } });
    fireEvent.click(screen.getByTestId("document-save"));

    await waitFor(() => expect(saved).toEqual(["# Edited"]));
    await waitFor(() => expect(screen.queryByTestId("document-dirty")).toBeNull());
  });

  test("importing pasted content is routed to the import handler", async () => {
    const imported: string[] = [];
    render(<DesignDocumentPanel document={doc()} onImport={(c) => { imported.push(c); return 2; }} />);

    fireEvent.change(screen.getByTestId("document-content"), { target: { value: "# Imported PRD" } });
    fireEvent.click(screen.getByTestId("document-import"));

    await waitFor(() => expect(imported).toEqual(["# Imported PRD"]));
  });

  test("a rejected write is surfaced, never swallowed", async () => {
    // e.g. the 409 VERSION_CONFLICT the backend returns for a stale write.
    render(
      <DesignDocumentPanel
        document={doc()}
        onSave={() => {
          throw new Error("Document has moved on: expected version 1, current is 2");
        }}
      />,
    );

    fireEvent.change(screen.getByTestId("document-content"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("document-save"));

    const alert = await screen.findByTestId("document-error");
    expect(alert.textContent).toContain("Document has moved on");
    expect(alert.getAttribute("role")).toBe("alert");
    // The edit is retained so the user can retry rather than losing their work.
    expect(screen.getByTestId("document-dirty")).toBeTruthy();
  });

  test("content persists across a remount — the page-reload path", () => {
    // A reload rebuilds the component from server state; the panel must show the saved content.
    const { unmount } = render(<DesignDocumentPanel document={doc({ content: "# Saved v2", version: 2 })} />);
    expect((screen.getByTestId("document-content") as HTMLTextAreaElement).value).toBe("# Saved v2");
    unmount();

    render(<DesignDocumentPanel document={doc({ content: "# Saved v2", version: 2 })} />);
    expect((screen.getByTestId("document-content") as HTMLTextAreaElement).value).toBe("# Saved v2");
    expect(screen.getByTestId("document-version").textContent).toBe("v2");
  });

  test("an incoming version does not clobber unsaved typing", () => {
    const { rerender } = render(<DesignDocumentPanel document={doc()} onSave={() => 2} />);
    fireEvent.change(screen.getByTestId("document-content"), { target: { value: "my unsaved work" } });

    rerender(<DesignDocumentPanel document={doc({ content: "# Someone else's v2", version: 2 })} onSave={() => 3} />);

    expect((screen.getByTestId("document-content") as HTMLTextAreaElement).value).toBe("my unsaved work");
  });

  test("read-only mode hides the write controls", () => {
    render(<DesignDocumentPanel document={doc()} readOnly />);
    expect(screen.queryByTestId("document-save")).toBeNull();
    expect(screen.queryByTestId("document-import")).toBeNull();
    expect((screen.getByTestId("document-content") as HTMLTextAreaElement).readOnly).toBe(true);
  });
});

describe("V-013: requirements are trackable", () => {
  test("each requirement shows id, status, owner and criteria progress", () => {
    render(<RequirementList requirements={[requirement({ ownerAgentId: "backend-agent" })]} />);

    expect(screen.getByTestId("requirement-AUTH-03")).toBeTruthy();
    expect(screen.getByTestId("requirement-status-AUTH-03").textContent).toBe("In Progress");
    expect(screen.getByTestId("requirement-owner-AUTH-03").textContent).toBe("Owner: backend-agent");
    expect(screen.getByTestId("requirement-criteria-AUTH-03").textContent).toBe("1/2 criteria");
  });

  test("an unassigned requirement says so rather than showing a blank owner", () => {
    render(<RequirementList requirements={[requirement()]} />);
    expect(screen.getByTestId("requirement-owner-AUTH-03").textContent).toBe("Unassigned");
  });

  test("status labels are human-readable, not raw enum values", () => {
    expect(requirementStatusLabel("tests_passing")).toBe("Tests Passing");
    expect(requirementStatusLabel("in_progress")).toBe("In Progress");
    expect(() => requirementStatusLabel("bogus" as any)).toThrow(/No label defined/);
  });

  test("an empty list explains what to do", () => {
    render(<RequirementList requirements={[]} />);
    expect(screen.getByTestId("requirements-empty").textContent).toContain("Break the design document");
  });

  test("selecting a requirement reports it and marks it current", () => {
    const picked: string[] = [];
    const { rerender } = render(
      <RequirementList requirements={[requirement()]} onSelect={(id) => picked.push(id)} />,
    );
    fireEvent.click(screen.getByTestId("requirement-AUTH-03"));
    expect(picked).toEqual(["AUTH-03"]);

    rerender(<RequirementList requirements={[requirement()]} selectedId="AUTH-03" />);
    expect(screen.getByTestId("requirement-AUTH-03").getAttribute("aria-current")).toBe("true");
  });

  test("selecting a requirement reveals the related implementation activity", () => {
    const owner: CodingAgent = {
      id: "a1",
      projectId: "p",
      name: "Backend Agent",
      role: "Backend Engineer",
      skills: [],
      tools: [],
      status: "working",
      activity: {},
      costUsd: 0,
      tokensUsed: 0,
    };

    render(
      <RequirementDetail
        owner={owner}
        requirement={requirement({
          ownerAgentId: "a1",
          branch: "agent/auth-backend",
          worktree: ".agents/agent-auth-backend",
          affectedFiles: ["src/auth/session.ts", "src/auth/token.ts"],
          testsPassing: 4,
          testsTotal: 4,
          reviewStatus: "pending",
        })}
      />,
    );

    expect(screen.getByTestId("detail-id").textContent).toBe("AUTH-03");
    expect(screen.getByTestId("detail-status").textContent).toBe("In Progress");
    expect(screen.getByTestId("detail-owner").textContent).toContain("Backend Agent");
    expect(screen.getByTestId("detail-branch").textContent).toBe("agent/auth-backend");
    expect(screen.getByTestId("detail-worktree").textContent).toBe(".agents/agent-auth-backend");
    expect(screen.getByTestId("detail-tests").textContent).toBe("4/4 passing");
    expect(screen.getByTestId("detail-review").textContent).toBe("pending");
    expect(screen.getByTestId("detail-files").textContent).toContain("src/auth/session.ts");
    // The owning agent's live status is shown with its text label.
    expect(screen.getByTestId("agent-status-label").textContent).toBe("Working");
  });

  test("acceptance criteria show met state with text, not only styling", () => {
    render(<RequirementDetail requirement={requirement()} />);
    const criteria = screen.getByTestId("detail-criteria");
    expect(criteria.textContent).toContain("Session survives reload");
    expect(criteria.textContent).toContain("Token rotates");
    // Screen-reader text carries the met/not-met state, not just a line-through style.
    expect(criteria.textContent).toContain("met");
    expect(criteria.textContent).toContain("not met");
  });

  test("fields the requirement lacks are omitted, not faked", () => {
    render(<RequirementDetail requirement={requirement()} />);
    expect(screen.queryByTestId("detail-branch")).toBeNull();
    expect(screen.queryByTestId("detail-worktree")).toBeNull();
    expect(screen.queryByTestId("detail-tests")).toBeNull();
    expect(screen.queryByTestId("detail-files")).toBeNull();
  });

  test("no selection prompts the user rather than rendering blank", () => {
    render(<RequirementDetail requirement={null} />);
    expect(screen.getByTestId("requirement-detail-empty").textContent).toContain("Select a requirement");
  });
});
