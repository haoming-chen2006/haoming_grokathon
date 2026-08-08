import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { DiffView, type DiffFileView } from "./DiffView";

afterEach(cleanup);

const DIFF = [
  "diff --git a/src/session.ts b/src/session.ts",
  "index 1234567..89abcde 100644",
  "--- a/src/session.ts",
  "+++ b/src/session.ts",
  "@@ -1,4 +1,5 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  "+const c = 4;",
  "",
].join("\n");

function lines(kind: string): HTMLElement[] {
  return screen.getAllByTestId("diff-line").filter((l) => l.getAttribute("data-diff-kind") === kind);
}

describe("V-037: a reviewer sees the code, not just a file count", () => {
  const files: DiffFileView[] = [
    { path: "src/session.ts", status: "M", additions: 2, deletions: 1 },
    { path: "src/token.ts", status: "A" },
  ];

  test("every changed file is listed with its path", () => {
    render(<DiffView files={files} diff={DIFF} />);
    const rows = screen.getAllByTestId("diff-file");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute("data-path")).toBe("src/session.ts");
    expect(rows[1]!.getAttribute("data-path")).toBe("src/token.ts");
  });

  test("git's status codes are translated, and counts are labelled in text", () => {
    // "M" and "+2" mean nothing announced on their own, and colour is not available to everyone.
    render(<DiffView files={files} diff={DIFF} />);
    const [session, token] = screen.getAllByTestId("diff-file");
    expect(session!.textContent).toContain("modified");
    expect(session!.textContent).toContain("+2 added");
    expect(session!.textContent).toContain("−1 removed");
    expect(token!.textContent).toContain("added");
  });

  test("a file the server sent no counts for still renders", () => {
    // GET /api/repository/changed-files returns {path, status, staged} — never any counts.
    render(<DiffView files={[{ path: "src/only.ts", status: "??" }]} diff="" />);
    const row = screen.getAllByTestId("diff-file")[0]!;
    expect(row.textContent).toContain("src/only.ts");
    expect(row.textContent).toContain("untracked");
    expect(screen.getByTestId("diff-body-empty").textContent).toContain("No line changes");
  });

  test("the unified diff is rendered line by line", () => {
    render(<DiffView files={files} diff={DIFF} />);
    const body = screen.getByTestId("diff-body");
    expect(body.textContent).toContain("const b = 3;");
    expect(body.textContent).toContain("@@ -1,4 +1,5 @@");
  });

  test("added and removed lines are distinguishable without colour", () => {
    render(<DiffView files={files} diff={DIFF} />);

    const addedLines = lines("added");
    const removedLines = lines("removed");
    expect(addedLines).toHaveLength(2);
    expect(removedLines).toHaveLength(1);

    // The signal is text a screen reader reads out, not the green/red wash.
    expect(addedLines[0]!.textContent).toContain("added line");
    expect(addedLines[0]!.textContent).toContain("const b = 3;");
    expect(removedLines[0]!.textContent).toContain("removed line");
    expect(removedLines[0]!.textContent).toContain("const b = 2;");
  });

  test("file headers and hunk headers are not counted as changes", () => {
    // "---"/"+++" start with a - and a +; treating them as content inflates every file by one each.
    render(<DiffView files={files} diff={DIFF} />);
    expect(screen.getByTestId("diff-summary").textContent).toContain("2 added");
    expect(screen.getByTestId("diff-summary").textContent).toContain("1 removed");
    expect(screen.getByTestId("diff-summary").textContent).toContain("2 files changed");
    expect(lines("hunk")).toHaveLength(1);
    expect(lines("meta")).toHaveLength(4);
  });

  test("one changed file is not '1 files'", () => {
    render(<DiffView files={[files[0]!]} diff={DIFF} />);
    expect(screen.getByTestId("diff-summary").textContent).toContain("1 file changed");
  });

  test("the diff scrolls inside its own container", () => {
    // Wide source lines must not make the whole control room scroll sideways.
    render(<DiffView files={files} diff={DIFF} />);
    expect(screen.getByTestId("diff-body").className).toContain("overflow-auto");
  });

  test("a huge diff is truncated and says so rather than freezing the browser", () => {
    const huge = Array.from({ length: 2500 }, (_, i) => `+line ${i}`).join("\n");
    render(<DiffView files={files} diff={huge} />);
    expect(screen.getAllByTestId("diff-line")).toHaveLength(2000);
    expect(screen.getByTestId("diff-truncated").textContent).toContain("first 2000 lines of 2500");
  });

  test("loading says so and shows no stale body", () => {
    render(<DiffView files={files} diff={DIFF} loading />);
    expect(screen.getByTestId("diff-loading").textContent).toContain("Loading changes");
    expect(screen.queryByTestId("diff-body")).toBeNull();
    expect(screen.getByTestId("diff-view")).toBeTruthy();
  });

  test("a failed load reports the reason instead of an empty panel", () => {
    // An empty diff and a diff that failed to load are not the same thing to a reviewer.
    render(<DiffView files={[]} diff="" error="worktree is required" />);
    const alert = screen.getByTestId("diff-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("worktree is required");
    expect(screen.queryByTestId("diff-empty")).toBeNull();
  });

  test("no changes at all says so explicitly", () => {
    render(<DiffView files={[]} diff="" />);
    expect(screen.getByTestId("diff-empty").textContent).toContain("No changes");
    expect(screen.queryByTestId("diff-body")).toBeNull();
    expect(screen.queryByTestId("diff-summary")).toBeNull();
  });

  test("whitespace-only diff text is treated as no changes", () => {
    render(<DiffView files={[]} diff={"\n  \n"} />);
    expect(screen.getByTestId("diff-empty")).toBeTruthy();
  });
});
