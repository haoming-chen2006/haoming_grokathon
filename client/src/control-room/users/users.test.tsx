/**
 * The USERS page, after the fixture was deleted.
 *
 * `mockUsers.ts` held four invented colleagues with plausible names and `.example` addresses. On
 * the one page whose entire subject is who may do what, a reader had no way to tell four fictional
 * people from four real ones. It is gone, and these assertions are what stop it returning.
 *
 * What replaced it is not a smaller fixture. It is the truth about this product's access model:
 * nobody signs in, and there must always be exactly one owner, so the person looking at the screen
 * is the owner. That row is real. What it lacks is a name, and it does not invent one.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { UsersPage } from "./index";
import { SOURCE, SOURCE_NOTE, THIS_MACHINE, roleCounts, visibleUsers } from "./usersStore";
import { isSoleOwner, type WorkspaceUser } from "./types";

const realFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const noop = () => {};

function stubProject(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("nobody is invented", () => {
  test("the page starts with exactly one person, and it is the owner", () => {
    const users = visibleUsers({ users: [THIS_MACHINE], query: "", roleFilter: "all" });
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("owner");
    expect(isSoleOwner(users[0], users)).toBe(true);
  });

  test("that person has no address, because nobody signs in", () => {
    expect(THIS_MACHINE.email).toBeUndefined();
  });

  test("no invented name reaches the page", () => {
    // The four the fixture shipped. Named here so the assertion is legible, and so a future
    // reviewer can see exactly what was deleted rather than taking it on trust.
    const deleted = ["Dana Whitfield", "Marco Reyes", "Priya Nandi", "Tom Okafor"];
    expect(deleted).not.toContain(THIS_MACHINE.displayName);
    expect(THIS_MACHINE.displayName).toBe("You");
  });

  test("the source says unauthenticated, not fixture", () => {
    expect(SOURCE).toBe("unauthenticated");
    expect(SOURCE_NOTE).toContain("nobody signs in");
  });

  test("the owner has no cap, which renders as no cap and never as $0", () => {
    expect(THIS_MACHINE.budgetUsd).toBeUndefined();
  });
});

describe("the counts are over the people who are actually there", () => {
  test("one owner and nobody else", () => {
    expect(roleCounts([THIS_MACHINE])).toEqual({ all: 1, owner: 1, approver: 0, member: 0 });
  });

  test("nobody at all is four zeroes, not an absent row", () => {
    expect(roleCounts([])).toEqual({ all: 0, owner: 0, approver: 0, member: 0 });
  });
});

describe("the page as it renders on a fresh install", () => {
  test("one owner and nobody else, with the reason under the name", async () => {
    stubProject({ id: "p1" });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    const row = await screen.findByTestId(`user-row-${THIS_MACHINE.id}`);
    expect(within(row).getByText("You")).toBeTruthy();
    expect(row.textContent).toContain("nobody signs in");
    expect(row.textContent).toContain("no cap");
    expect(screen.queryAllByTestId(/^user-row-/)).toHaveLength(1);
  });

  test("the banner still says nothing here is enforced", async () => {
    stubProject({ id: "p1" });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    expect(await screen.findByTestId(`user-row-${THIS_MACHINE.id}`)).toBeTruthy();
    expect(document.body.textContent).toContain("enforced");
  });

  test("no budgets set and no project cap say so, rather than saying $0.00", async () => {
    stubProject({ id: "p1" });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    const totals = await screen.findByTestId("users-totals");
    expect(totals.textContent).toContain("Budgets total none set");
    expect(totals.textContent).toContain("Project cap not set");
    expect(totals.textContent).not.toContain("$0.00");
  });

  test("a project that HAS a cap prints it, because that figure is really served", async () => {
    stubProject({ id: "p1", budgetUsd: 50 });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    await waitFor(() =>
      expect(screen.getByTestId("users-totals").textContent).toContain("Project cap $50.00"),
    );
  });

  test("an error body where the project belongs leaves the cap unset, not zero", async () => {
    stubProject({ error: "no such project" });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    const totals = await screen.findByTestId("users-totals");
    expect(totals.textContent).toContain("Project cap not set");
  });

  test("spend is still not shown at all — not even a zero", async () => {
    stubProject({ id: "p1" });
    render(<UsersPage projectId="p1" onSelect={noop} />);
    const row = await screen.findByTestId(`user-row-${THIS_MACHINE.id}`);
    expect(row.textContent).not.toMatch(/\$\d/);
  });
});

describe("the sole owner cannot be demoted away", () => {
  const other = (id: string): WorkspaceUser => ({
    id,
    displayName: id,
    role: "member",
    capabilities: { images: false, video: false, voice: false, publishToX: false },
    disabled: false,
    createdAt: "",
    updatedAt: "",
  });

  test("with one owner, that owner is the sole owner", () => {
    const all = [THIS_MACHINE, other("b")];
    expect(isSoleOwner(THIS_MACHINE, all)).toBe(true);
  });

  test("with two, neither is sole", () => {
    const second: WorkspaceUser = { ...other("b"), role: "owner" };
    const all = [THIS_MACHINE, second];
    expect(isSoleOwner(THIS_MACHINE, all)).toBe(false);
  });
});
