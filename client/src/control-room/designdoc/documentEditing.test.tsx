/**
 * The whole edit path, from a click on a paragraph to the request that leaves the browser.
 *
 * `designDocs.test.tsx` proves the surface computes the right next text; `designDocEdit.test.ts`
 * proves the endpoint stores it. Neither proves anything CALLS the other — and this repository's
 * largest bug was exactly that shape: every module reachable, every module tested, and the one
 * call site passing nothing. So this file drives `DesignDocumentsPage` against a stubbed network
 * and asserts on the request itself.
 *
 * The failure case matters as much as the success one. A save that fails must keep the user's words
 * on screen and say what went wrong; an editor whose only visible response to a rejected write is
 * to carry on looking fine is an editor that loses an afternoon.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesignDocumentsPage } from "./index";

const TEXT = ["# Chair launch", "", "The opening claim.", "", "## Numbers"].join("\n");

interface Call {
  method: string;
  path: string;
  body?: { text?: string; expectedText?: string };
}

let calls: Call[];
/** What the next PUT answers with. Replaced per test; the default is a normal save. */
let putResponse: () => Response;

const realFetch = globalThis.fetch;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function doc(text: string) {
  return {
    id: "chair",
    title: "Chair launch",
    text,
    lineCount: text.split("\n").length,
    sections: [],
    declaration: { ok: true, errors: [] },
  };
}

beforeEach(() => {
  calls = [];
  putResponse = () => json(doc("saved"));
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://workspace.invalid").pathname;
    const method = init?.method ?? "GET";
    calls.push({
      method,
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (method === "PUT") return putResponse();
    if (path === "/api/design-docs") return json([doc(TEXT)]);
    if (path === "/api/coding-agents") return json([]);
    return json(null);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const noop = () => {};

async function openDocument() {
  render(<DesignDocumentsPage projectId="p1" selectionId="chair" onSelect={noop} />);
  await waitFor(() => expect(screen.getByTestId("design-document")).toBeTruthy());
}

async function editOpeningClaim(to: string) {
  fireEvent.click(screen.getByTestId("block-3"));
  const editor = screen.getByTestId("block-editor");
  fireEvent.change(editor, { target: { value: to } });
  fireEvent.keyDown(editor, { key: "Enter", metaKey: true });
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  return calls.find((c) => c.method === "PUT")!;
}

describe("an edit reaches the server", () => {
  test("committing a paragraph PUTs the whole document with only that paragraph changed", async () => {
    await openDocument();
    const put = await editOpeningClaim("A shorter claim.");

    expect(put.path).toBe("/api/design-docs/chair");
    expect(put.body?.text).toBe(TEXT.replace("The opening claim.", "A shorter claim."));
    // Sent so a save that would overwrite somebody else's edit is refused rather than winning.
    expect(put.body?.expectedText).toBe(TEXT);
  });

  test("opening a paragraph and changing nothing sends no request", async () => {
    await openDocument();
    fireEvent.click(screen.getByTestId("block-3"));
    fireEvent.keyDown(screen.getByTestId("block-editor"), { key: "Enter", metaKey: true });
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  test("the page says the save landed", async () => {
    await openDocument();
    await editOpeningClaim("A shorter claim.");
    await waitFor(() => expect(screen.getByTestId("save-state").textContent).toBe("Saved"));
  });
});

describe("a save that does not land", () => {
  test("a conflict is stated in the server's own words, and the text is still there", async () => {
    putResponse = () =>
      json(
        {
          error: "This document changed since you opened it, so the edit was not saved",
          code: "DOCUMENT_CHANGED",
        },
        409,
      );
    await openDocument();
    await editOpeningClaim("A shorter claim.");

    await waitFor(() => expect(screen.getByTestId("save-error")).toBeTruthy());
    expect(screen.getByTestId("save-error").textContent).toContain("changed since you opened it");
    // Never reported as saved, and the words the user typed are still on the page.
    expect(screen.queryByTestId("save-state")).toBeNull();
    expect(screen.getByTestId("document-paper").textContent).toContain("A shorter claim.");
  });

  test("a network failure is reported, not swallowed", async () => {
    putResponse = () => {
      throw new Error("the server is not running");
    };
    await openDocument();
    await editOpeningClaim("A shorter claim.");
    await waitFor(() => expect(screen.getByTestId("save-error")).toBeTruthy());
    expect(screen.getByTestId("save-error").textContent).toContain("the server is not running");
  });
});
