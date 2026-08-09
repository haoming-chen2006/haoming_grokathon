/**
 * `@` — the picker, the link it writes, and the link it draws.
 *
 * The parser is proved in `designdoc/markdown.test.ts`. What is proved here is the part that has
 * historically been wrong in this repository: that the two ends are actually connected. So these
 * tests drive real textareas against a stubbed network and assert on the string that comes out —
 * the same shape as `documentEditing.test.tsx`, and for the same reason.
 *
 * Three of them exist because of rules in the handoff rather than because of a feature:
 *
 *   - a body that is not a list must be reported, not mapped over. `as T[]` on a network value has
 *     blanked this page three times;
 *   - a project with nothing in it says so in plain language, and no sample record is ever offered;
 *   - a mention whose target is gone still renders its label, says "missing" in words as well as in
 *     styling, and does NOT say it while the list it would be checked against has not arrived.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BlockEditor } from "../designdoc/BlockEditor";
import { InlineText } from "../designdoc/Prose";
import { parseInline } from "../designdoc/markdown";
import { SessionDrawer } from "../SessionDrawer";
import { MentionPicker } from "./MentionPicker";
import { MentionText } from "./MentionLink";
import { MentionTargetsProvider } from "./targets";
import { useMentionInput } from "./useMentionInput";

const realFetch = globalThis.fetch;

/** Hand-made records in the shape the two endpoints return. Test-only, never shipped. */
const ASSETS = [
  { id: "asset_msl1ykj01m5rlfe", title: "Chair launch deck" },
  { id: "asset_msl2", title: "Price list" },
];
const DOCS = [{ id: "doc_msl1bhow2hwse5d", title: "chair_launch_plan" }];

let assetsBody: () => Response;
let docsBody: () => Response;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  assetsBody = () => json(ASSETS);
  docsBody = () => json(DOCS);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://workspace.invalid").pathname;
    if (path === "/api/assets") return assetsBody();
    if (path === "/api/design-docs") return docsBody();
    if (path === "/api/coding-agents") return json([]);
    return json({ error: `no stub for ${path}` }, 404);
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

/** Set a textarea's text AND its caret, because the picker reads both. */
function type(el: HTMLTextAreaElement, value: string, caret = value.length) {
  fireEvent.change(el, { target: { value, selectionStart: caret, selectionEnd: caret } });
}

// ───────────────────────────────────────────────────────────────────── the picker, on its own

/** A bare textarea with the picker wired to it, so the hook is tested without a host's opinions. */
function Box({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const mentions = useMentionInput(ref, setValue);
  return (
    <div className="relative">
      <textarea
        ref={ref}
        aria-label="box"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          mentions.sync(e.target);
        }}
        onKeyUp={(e) => mentions.sync(e.currentTarget)}
        onKeyDown={(e) => mentions.handleKey(e)}
      />
      <MentionPicker input={mentions} />
      <output data-testid="value">{value}</output>
    </div>
  );
}

function box(projectId = "p1", initial = "") {
  return render(
    <MentionTargetsProvider projectId={projectId}>
      <Box initial={initial} />
    </MentionTargetsProvider>,
  );
}

function textarea(label = "box"): HTMLTextAreaElement {
  return screen.getByLabelText(label) as HTMLTextAreaElement;
}

describe("typing @ offers this project's assets and design documents", () => {
  test("the list holds both kinds, each named and each with its id", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    type(textarea(), "See @");
    const picker = await screen.findByTestId("mention-picker");
    expect(picker.textContent).toContain("Chair launch deck");
    expect(picker.textContent).toContain("chair_launch_plan");
    // The kind is a word, not a colour or a glyph on its own.
    expect(picker.textContent).toContain("Asset");
    expect(picker.textContent).toContain("Design document");
    expect(screen.getByTestId("mention-option-asset_msl1ykj01m5rlfe")).toBeTruthy();
  });

  test("typing filters, and matches on the id as well as the title", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    type(textarea(), "See @price");
    await waitFor(() => expect(screen.getByTestId("mention-option-asset_msl2")).toBeTruthy());
    expect(screen.queryByTestId("mention-option-doc_msl1bhow2hwse5d")).toBeNull();

    type(textarea(), "See @doc_msl1b");
    await waitFor(() => expect(screen.getByTestId("mention-option-doc_msl1bhow2hwse5d")).toBeTruthy());
  });

  test("nothing matching says so, and offers nothing instead", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    type(textarea(), "@zzzz");
    await waitFor(() => expect(screen.getByTestId("mention-no-match")).toBeTruthy());
    expect(screen.queryByRole("option")).toBeNull();
  });

  test("Enter inserts the link form at the caret, id and all, and keeps the rest of the line", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = textarea();
    type(el, "See @price later", 10);
    await waitFor(() => expect(screen.getByTestId("mention-option-asset_msl2")).toBeTruthy());
    fireEvent.keyDown(el, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe(
        "See [@Price list](asset:asset_msl2)  later",
      ),
    );
    expect(screen.queryByTestId("mention-picker")).toBeNull();
  });

  test("clicking a row inserts the same thing", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    type(textarea(), "@chair");
    const option = await screen.findByTestId("mention-option-asset_msl1ykj01m5rlfe");
    fireEvent.click(option);
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe(
        "[@Chair launch deck](asset:asset_msl1ykj01m5rlfe) ",
      ),
    );
  });

  test("up and down move the highlight and Enter takes the highlighted one", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = textarea();
    type(el, "@");
    await screen.findByTestId("mention-picker");
    const selected = () =>
      screen.getAllByRole("option").findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected()).toBe(0);
    fireEvent.keyDown(el, { key: "ArrowDown" });
    expect(selected()).toBe(1);
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(selected()).toBe(0);
    // Wrapping, so the last row is one keystroke away rather than three.
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(selected()).toBe(2);
    fireEvent.keyDown(el, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toContain("(doc:doc_msl1bhow2hwse5d)"),
    );
  });

  test("Escape closes it and leaves the text exactly as typed", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = textarea();
    type(el, "@ch");
    await screen.findByTestId("mention-picker");
    fireEvent.keyDown(el, { key: "Escape" });
    expect(screen.queryByTestId("mention-picker")).toBeNull();
    expect(screen.getByTestId("value").textContent).toBe("@ch");
    // Still shut while the caret is on the same `@`: a dismissal that undid itself on the next
    // keystroke would be no dismissal at all.
    type(el, "@cha");
    expect(screen.queryByTestId("mention-picker")).toBeNull();
  });

  test("an @ inside a word is a character, not a trigger", async () => {
    box();
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    type(textarea(), "write to sales@aeris");
    expect(screen.queryByTestId("mention-picker")).toBeNull();
  });

  test("a project with nothing in it says so, and offers no example", async () => {
    assetsBody = () => json([]);
    docsBody = () => json([]);
    box();
    type(textarea(), "@");
    const empty = await screen.findByTestId("mention-empty");
    expect(empty.textContent).toContain("nothing to link to");
    expect(screen.queryByRole("option")).toBeNull();
  });

  test("a body that is not a list is reported, not mapped over", async () => {
    // The defect this guards is real: `as T[]` on a network value threw inside render and took the
    // page down with it. The picker must survive it and say what it could not read.
    assetsBody = () => json({ error: "projectId is required" });
    box();
    type(textarea(), "@");
    const error = await screen.findByTestId("mention-error");
    expect(error.textContent).toContain("assets");
    // The half that did arrive is still offered, because it is still true.
    expect(screen.getByTestId("mention-option-doc_msl1bhow2hwse5d")).toBeTruthy();
  });

  test("with no project the picker does not open at all", async () => {
    box("");
    type(textarea(), "@");
    expect(screen.queryByTestId("mention-picker")).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────── the link, rendered

function prose(text: string, projectId = "p1") {
  return render(
    <MentionTargetsProvider projectId={projectId}>
      <InlineText nodes={parseInline(text)} />
    </MentionTargetsProvider>,
  );
}

describe("a mention, rendered", () => {
  test("routes in the app instead of loading a page", async () => {
    // happy-dom starts at `about:blank`, where `location.pathname` is the string "blank" and a
    // relative pushState cannot resolve — see the same note in `shell/workspaceShell.test.tsx`.
    // Without a real origin this assertion passes against the wrong page.
    (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(
      "http://localhost/designdocs",
    );
    prose("See [@Chair launch deck](asset:asset_msl1ykj01m5rlfe).");
    const link = await screen.findByTestId("mention-asset_msl1ykj01m5rlfe");
    expect(link.getAttribute("href")).toBe("/assets/asset_msl1ykj01m5rlfe");
    expect(link.textContent).toBe("@Chair launch deck");
    act(() => {
      fireEvent.click(link);
    });
    expect(location.pathname).toBe("/assets/asset_msl1ykj01m5rlfe");
  });

  test("a document mention points at the document page", async () => {
    prose("[@chair_launch_plan](doc:doc_msl1bhow2hwse5d)");
    const link = await screen.findByTestId("mention-doc_msl1bhow2hwse5d");
    expect(link.getAttribute("href")).toBe("/designdocs/doc_msl1bhow2hwse5d");
  });

  test("its title names what the id points at now, not what the label says", async () => {
    // The label is what the author wrote and stays as written; the title is how a reader finds out
    // that the record has since been renamed.
    prose("[@old name](asset:asset_msl2)");
    await waitFor(() =>
      expect(screen.getByTestId("mention-asset_msl2").getAttribute("title")).toBe(
        "Asset · Price list",
      ),
    );
    expect(screen.getByTestId("mention-asset_msl2").textContent).toBe("@old name");
  });

  test("a target that is gone keeps its label, says missing in words, and is not a link", async () => {
    prose("[@deleted deck](asset:asset_gone)");
    const missing = await screen.findByTestId("mention-missing-asset_gone");
    expect(missing.textContent).toContain("@deleted deck");
    expect(missing.textContent).toContain("missing");
    expect(missing.getAttribute("title")).toContain("no longer in this project");
    expect(missing.tagName).toBe("SPAN");
    expect(screen.queryByTestId("mention-asset_gone")).toBeNull();
  });

  test("nothing is called missing while the lists have not arrived", () => {
    // Outside a provider there is no list to check against. Saying "missing" here would be
    // inventing a fact about a record nobody has looked for.
    render(<InlineText nodes={parseInline("[@deck](asset:asset_gone)")} />);
    expect(screen.queryByTestId("mention-missing-asset_gone")).toBeNull();
    expect(screen.getByTestId("mention-asset_gone").textContent).toBe("@deck");
  });

  test("an ordinary link in the same paragraph still opens outward", () => {
    render(<InlineText nodes={parseInline("[spec](https://example.com) [@d](doc:d1)")} />);
    const outward = screen.getByText("spec");
    expect(outward.closest("a")?.getAttribute("target")).toBe("_blank");
    expect(screen.getByTestId("mention-d1").getAttribute("target")).toBeNull();
  });

  test("a plain string shows its mention as a link and nothing else as markup", async () => {
    render(
      <MentionTargetsProvider projectId="p1">
        <MentionText text="run `ls *.md` then read [@deck](asset:asset_msl2)" />
      </MentionTargetsProvider>,
    );
    const link = await screen.findByTestId("mention-asset_msl2");
    expect(link.textContent).toBe("@deck");
    expect(document.body.textContent).toContain("run `ls *.md` then read");
  });
});

// ───────────────────────────────────────────────────────── wired into the two real surfaces

/** The block editor as `DocumentSurface` drives it: a controlled value and a commit. */
function EditorHarness({ onCommit }: { onCommit(value: string): void }) {
  const [value, setValue] = useState("The opening claim.");
  return (
    <MentionTargetsProvider projectId="p1">
      <BlockEditor
        value={value}
        onChange={setValue}
        onCommit={() => onCommit(value)}
        onCancel={() => onCommit("CANCELLED")}
        label="Edit lines 3 to 3"
      />
      <output data-testid="value">{value}</output>
    </MentionTargetsProvider>
  );
}

describe("the design document's block editor", () => {
  test("@ inserts the link form into the paragraph's own markdown", async () => {
    let committed: string | undefined;
    render(<EditorHarness onCommit={(v) => (committed = v)} />);
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = screen.getByTestId("block-editor") as HTMLTextAreaElement;
    type(el, "The opening claim. @price");
    await waitFor(() => expect(screen.getByTestId("mention-option-asset_msl2")).toBeTruthy());
    fireEvent.keyDown(el, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe(
        "The opening claim. [@Price list](asset:asset_msl2) ",
      ),
    );
    // And the source is what a save writes back: still markdown, still the block's own lines.
    fireEvent.blur(el);
    expect(committed).toContain("(asset:asset_msl2)");
  });

  test("Escape closes the picker without cancelling the edit", async () => {
    let committed: string | undefined;
    render(<EditorHarness onCommit={(v) => (committed = v)} />);
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = screen.getByTestId("block-editor") as HTMLTextAreaElement;
    type(el, "The opening claim. @ch");
    await screen.findByTestId("mention-picker");
    fireEvent.keyDown(el, { key: "Escape" });
    expect(screen.queryByTestId("mention-picker")).toBeNull();
    expect(committed).toBeUndefined();
    // A second Escape, with the picker shut, is the editor's own cancel again.
    fireEvent.keyDown(el, { key: "Escape" });
    expect(committed).toBe("CANCELLED");
  });
});

describe("the agent's message box", () => {
  test("@ inserts the link form and Send sends it", async () => {
    const sent: string[] = [];
    render(
      <SessionDrawer
        agentName="Backend Agent"
        agentId="a1"
        state="ready"
        transcript={[]}
        projectId="p1"
        onSend={(text) => sent.push(text)}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId("mention-loading")).toBeNull());
    const el = screen.getByTestId("drawer-input") as HTMLTextAreaElement;
    type(el, "look at @chair");
    await waitFor(() => expect(screen.getByTestId("mention-option-asset_msl1ykj01m5rlfe")).toBeTruthy());
    fireEvent.keyDown(el, { key: "Enter" });
    await waitFor(() => expect(el.value).toContain("(asset:asset_msl1ykj01m5rlfe)"));
    fireEvent.click(screen.getByTestId("drawer-send"));
    expect(sent).toEqual(["look at [@Chair launch deck](asset:asset_msl1ykj01m5rlfe) "]);
  });

  test("a message in the transcript draws its mention as the same link", async () => {
    render(
      <SessionDrawer
        agentName="Backend Agent"
        agentId="a1"
        state="ready"
        projectId="p1"
        transcript={[
          { seq: 1, at: "", kind: "user", text: "look at [@Price list](asset:asset_msl2) please" },
        ]}
      />,
    );
    const link = await screen.findByTestId("mention-asset_msl2");
    expect(link.getAttribute("href")).toBe("/assets/asset_msl2");
    expect(screen.getByTestId("transcript-text-1").textContent).toBe(
      "look at @Price list please",
    );
  });

  test("with no project the message box takes @ as a character", async () => {
    render(<SessionDrawer agentName="Backend Agent" agentId="a1" state="ready" transcript={[]} />);
    const el = screen.getByTestId("drawer-input") as HTMLTextAreaElement;
    type(el, "email sales@");
    expect(screen.queryByTestId("mention-picker")).toBeNull();
  });
});
