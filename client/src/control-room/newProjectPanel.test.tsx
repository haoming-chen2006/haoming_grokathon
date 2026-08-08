import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewProjectPanel, type NewProjectInput } from "./NewProjectPanel";

afterEach(cleanup);

function fill(values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) {
    fireEvent.change(screen.getByTestId(id), { target: { value } });
  }
}

describe("opening a repository from the Control Room (§10 steps 1-2)", () => {
  test("every field the design names is present", () => {
    render(<NewProjectPanel onCreate={() => {}} />);
    for (const id of ["np-repo", "np-name", "np-branch", "np-goal", "np-budget", "np-design"]) {
      expect(screen.getByTestId(id), `${id} is missing`).toBeTruthy();
    }
  });

  test("submit is disabled until a repository and a name are given, and says why", () => {
    render(<NewProjectPanel onCreate={() => {}} />);
    const submit = screen.getByTestId("np-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.title).toContain("required");

    fill({ "np-repo": "/tmp/repo" });
    expect((screen.getByTestId("np-submit") as HTMLButtonElement).disabled).toBe(true);

    fill({ "np-name": "Auth" });
    expect((screen.getByTestId("np-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  test("whitespace alone does not count as a value", () => {
    render(<NewProjectPanel onCreate={() => {}} />);
    fill({ "np-repo": "   ", "np-name": "  " });
    expect((screen.getByTestId("np-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  test("submitting passes exactly what was typed, trimmed", () => {
    const got: NewProjectInput[] = [];
    render(<NewProjectPanel onCreate={(input) => { got.push(input); }} />);

    fill({
      "np-repo": "  /tmp/repo  ", "np-name": " Auth ", "np-goal": " Ship passwordless auth ",
      "np-branch": "develop", "np-budget": "25",
      "np-design": "# Auth\n\n- AUTH-01: login returns a token",
    });
    fireEvent.click(screen.getByTestId("np-submit"));

    expect(got[0]).toEqual({
      name: "Auth",
      goal: "Ship passwordless auth",
      repositoryPath: "/tmp/repo",
      baseBranch: "develop",
      budgetUsd: 25,
      documentContent: "# Auth\n\n- AUTH-01: login returns a token",
      requirements: [{ id: "AUTH-01", description: "login returns a token" }],
    });
  });

  test("an empty design document and branch are omitted rather than sent blank", () => {
    const got: NewProjectInput[] = [];
    render(<NewProjectPanel onCreate={(input) => { got.push(input); }} />);
    fill({ "np-repo": "/tmp/repo", "np-name": "Auth", "np-branch": "" });
    fireEvent.click(screen.getByTestId("np-submit"));

    expect(got[0].baseBranch).toBeUndefined();
    expect(got[0].documentContent).toBeUndefined();
  });

  test("base branch defaults to main", () => {
    const got: NewProjectInput[] = [];
    render(<NewProjectPanel onCreate={(input) => { got.push(input); }} />);
    fill({ "np-repo": "/tmp/repo", "np-name": "Auth" });
    fireEvent.click(screen.getByTestId("np-submit"));
    expect(got[0].baseBranch).toBe("main");
  });

  test("a server error is shown rather than swallowed", () => {
    render(<NewProjectPanel onCreate={() => {}} error="Not a git repository: /tmp/nope" />);
    expect(screen.getByTestId("np-error").textContent).toContain("Not a git repository");
  });

  test("while creating, the control reports it and cannot be double-fired", () => {
    let calls = 0;
    render(<NewProjectPanel onCreate={() => { calls += 1; }} busy />);
    fill({ "np-repo": "/tmp/repo", "np-name": "Auth" });

    const submit = screen.getByTestId("np-submit") as HTMLButtonElement;
    expect(submit.textContent).toContain("Creating");
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(calls).toBe(0);
  });
});

describe("requirements are read from the pasted document", () => {
  test("the form says which requirements it found, before you submit", () => {
    render(<NewProjectPanel onCreate={() => {}} />);
    expect(screen.getByTestId("np-requirements").textContent).toContain("No requirements found");

    fill({ "np-design": "# Auth\n\n- AUTH-01: login returns a token\n- AUTH-02: sessions rotate\n" });
    const preview = screen.getByTestId("np-requirements").textContent ?? "";
    expect(preview).toContain("2 requirements");
    expect(preview).toContain("AUTH-01");
    expect(preview).toContain("AUTH-02");
  });

  test("they are passed with the project, using the same parser as the CLI", () => {
    const got: NewProjectInput[] = [];
    render(<NewProjectPanel onCreate={(input) => { got.push(input); }} />);
    fill({
      "np-repo": "/tmp/repo", "np-name": "Auth",
      "np-design": "- AUTH-01: login returns a token\n- not a requirement\n",
    });
    fireEvent.click(screen.getByTestId("np-submit"));

    expect(got[0].requirements).toEqual([{ id: "AUTH-01", description: "login returns a token" }]);
  });

  test("a document with no requirements passes none rather than an empty list", () => {
    const got: NewProjectInput[] = [];
    render(<NewProjectPanel onCreate={(input) => { got.push(input); }} />);
    fill({ "np-repo": "/tmp/repo", "np-name": "Auth", "np-design": "# Just prose\n" });
    fireEvent.click(screen.getByTestId("np-submit"));
    expect(got[0].requirements).toBeUndefined();
  });
});
