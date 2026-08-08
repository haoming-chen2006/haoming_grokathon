import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesignDocumentPanel } from "./DesignDocumentPanel";
import { ProjectHeader } from "./ProjectHeader";
import { RequirementDetail, RequirementList } from "./RequirementPanel";
import { SetupBanner, type GrokStatusView } from "./SetupBanner";
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

describe("reaching another project, and starting one", () => {
  const two = [
    { id: "p1", name: "Authentication" },
    { id: "p2", name: "Billing" },
  ];

  test("every project is offered, not just the one that happens to be open", () => {
    render(<ProjectHeader name="Authentication" projects={two} projectId="p1" onSelectProject={() => {}} />);

    const switcher = screen.getByTestId("project-switcher") as HTMLSelectElement;
    expect([...switcher.options].map((o) => o.textContent)).toEqual(["Authentication", "Billing"]);
    expect(switcher.value).toBe("p1");
  });

  test("choosing a different project reports the id that was chosen", () => {
    const picked: string[] = [];
    render(<ProjectHeader name="Authentication" projects={two} projectId="p1" onSelectProject={(id) => picked.push(id)} />);

    fireEvent.change(screen.getByTestId("project-switcher"), { target: { value: "p2" } });

    expect(picked).toEqual(["p2"]);
  });

  test("a single project renders no switcher — it could only reselect what is already open", () => {
    render(<ProjectHeader name="Authentication" projects={[two[0]!]} projectId="p1" />);
    expect(screen.queryByTestId("project-switcher")).toBeNull();
    // The name still says which project this is, so nothing is lost by dropping the control.
    expect(screen.getByTestId("project-name").textContent).toBe("Authentication");
  });

  test("an unknown selection shows a prompt rather than silently displaying the wrong project", () => {
    render(<ProjectHeader name="—" projects={two} projectId={null} />);
    const switcher = screen.getByTestId("project-switcher") as HTMLSelectElement;
    expect(switcher.value).toBe("");
    expect(switcher.options[0]!.textContent).toContain("Select a project");
  });

  test("a new project can be started even though one is already open", () => {
    // The old shell only offered this when zero projects existed, so a second one was unreachable.
    let started = 0;
    render(<ProjectHeader name="Authentication" projects={two} projectId="p1" onNewProject={() => (started += 1)} />);

    fireEvent.click(screen.getByTestId("new-project-button"));

    expect(started).toBe(1);
  });

  test("the new-project control is present with a single project too", () => {
    render(<ProjectHeader name="Authentication" projects={[two[0]!]} projectId="p1" onNewProject={() => {}} />);
    expect(screen.getByTestId("new-project-button")).toBeTruthy();
  });
});

describe("V-045: a cost that is not exact says so", () => {
  test("the figure is visibly marked as an estimate", () => {
    render(<ProjectHeader name="P" costUsd={4.12} budgetUsd={10} />);

    expect(screen.getByTestId("project-cost-estimated").textContent).toBe("est.");
    // The number itself is unchanged — the label is what was missing.
    expect(screen.getByTestId("project-cost-summary").textContent).toBe("$4.12 / $10.00");
  });

  test("the caveat names why it is an estimate, in text and in a title", () => {
    render(<ProjectHeader name="P" costUsd={4.12} />);

    const caveat = screen.getByTestId("project-cost-caveat").textContent!;
    expect(caveat).toContain("Estimated");
    expect(caveat).toContain("list prices");
    expect(caveat).toContain("not from billed amounts");
    expect(screen.getByTestId("project-cost-estimate").getAttribute("title")).toBe(caveat);
  });

  test("the caveat is not the only signal, and it is not lost when over budget", () => {
    render(<ProjectHeader name="P" costUsd={12.5} budgetUsd={10} />);
    expect(screen.getByTestId("project-cost-summary").textContent).toContain("over budget");
    expect(screen.getByTestId("project-cost-estimated")).toBeTruthy();
  });

  test("no cost means no estimate marker rather than a labelled zero", () => {
    render(<ProjectHeader name="P" />);
    expect(screen.queryByTestId("project-cost-estimate")).toBeNull();
    expect(screen.queryByTestId("project-cost-estimated")).toBeNull();
  });
});

describe("V-004: a broken Grok install is visible before it is needed", () => {
  const SETUP = [
    "Grok Build was not found.",
    "",
    "Install it as a project dependency:",
    "    bun add @xai-official/grok",
  ].join("\n");

  function status(overrides: Partial<GrokStatusView> = {}): GrokStatusView {
    return { installed: false, error: "`grok` executable not found", setupMessage: SETUP, ...overrides };
  }

  test("a missing install names the consequence and repeats the server's guidance", () => {
    render(<SetupBanner status={status()} />);

    const banner = screen.getByTestId("setup-banner");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("setup-banner-headline").textContent).toContain("Grok Build is not available");
    expect(screen.getByTestId("setup-banner-error").textContent).toContain("executable not found");
    expect(screen.getByTestId("setup-banner-guidance").textContent).toBe(SETUP);
  });

  test("an unknown status renders nothing — a warning before the answer arrives would be a lie", () => {
    const { container } = render(<SetupBanner status={null} />);
    expect(container.innerHTML).toBe("");
  });

  test("a working install renders nothing", () => {
    const { container } = render(<SetupBanner status={{ installed: true, version: "0.2.118", binaryPath: "/usr/bin/grok" }} />);
    expect(container.innerHTML).toBe("");
  });

  test("a status with no guidance still explains the problem rather than rendering an empty alert", () => {
    render(<SetupBanner status={{ installed: false }} />);
    expect(screen.getByTestId("setup-banner-headline").textContent).toContain("no agent can be launched");
    expect(screen.queryByTestId("setup-banner-guidance")).toBeNull();
    expect(screen.queryByTestId("setup-banner-error")).toBeNull();
  });

  test("the banner reappears when a previously working install goes away", () => {
    // The status is polled; a refresh that reports a broken install must not be swallowed.
    const { rerender } = render(<SetupBanner status={{ installed: true, version: "0.2.118" }} />);
    expect(screen.queryByTestId("setup-banner")).toBeNull();

    rerender(<SetupBanner status={status()} />);
    expect(screen.getByTestId("setup-banner")).toBeTruthy();
  });
});
