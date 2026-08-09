/**
 * The transcript, drawn as a conversation.
 *
 * The panel used to render one row per transcript entry with an AGENT prefix on each, and the
 * entries were one per ACP chunk — so a nine-word greeting arrived as nine labelled rows. The
 * joining is fixed on the server; what is proved here is the rest of the reading experience: a
 * message is prose under a speaker, an agent's markdown is rendered rather than shown as markers,
 * and a tool call is a row rather than a speech.
 *
 * The last case is the one with teeth. Agents write shell commands, and `rm *.txt and *.log` has
 * two asterisks on one line: interpreting single-asterisk italic would eat the middle of a command
 * the reader may be about to run.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Transcript, splitFences } from "./Transcript";

afterEach(cleanup);

const draw = (entries: Array<{ seq: number; kind: string; text?: string; status?: string }>) =>
  render(<Transcript entries={entries} agentName="Legal research" />);

describe("who said it", () => {
  test("the agent's own name heads its messages, not the word AGENT", () => {
    draw([{ seq: 1, kind: "agent", text: "Hello! How can I assist you today?" }]);
    expect(screen.getByText("Legal research")).toBeDefined();
    expect(screen.getByText("Hello! How can I assist you today?")).toBeDefined();
  });

  test("a whole sentence is one block, not one row per word", () => {
    draw([
      { seq: 1, kind: "user", text: "hi" },
      { seq: 2, kind: "agent", text: "Hello! How can I assist you today?" },
    ]);
    expect(screen.getAllByTestId("transcript-line")).toHaveLength(2);
  });

  test("thinking is set apart from speech", () => {
    draw([{ seq: 1, kind: "thought", text: "Weighing the options." }]);
    expect(screen.getByText("Thinking")).toBeDefined();
  });

  test("a tool call is a row, not a message with a speaker", () => {
    draw([{ seq: 1, kind: "tool", text: "read_file", status: "completed" }]);
    expect(screen.getByTestId("transcript-tool")).toBeDefined();
    // The word as well as the colour — a status shown only as a dot says nothing to a reader who
    // cannot see it.
    expect(screen.getByText("completed")).toBeDefined();
  });

  test("an unknown kind keeps its own name rather than vanishing", () => {
    draw([{ seq: 1, kind: "plan_update", text: "Step 2 of 4" }]);
    expect(screen.getByText("plan_update")).toBeDefined();
    expect(screen.getByText("Step 2 of 4")).toBeDefined();
  });
});

describe("what they wrote", () => {
  test("a fenced block is drawn as code, with its language named", () => {
    draw([{ seq: 1, kind: "agent", text: "Try this:\n\n```bash\nbun run fresh\n```" }]);
    const code = screen.getByTestId("transcript-code");
    expect(code.textContent).toContain("bun run fresh");
    expect(code.textContent).toContain("bash");
  });

  test("bullets become a list rather than lines beginning with a hyphen", () => {
    const { container } = draw([{ seq: 1, kind: "agent", text: "Next:\n- read the brief\n- draft the deck" }]);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("read the brief")).toBeDefined();
  });

  test("inline code and bold lose their markers", () => {
    const { container } = draw([{ seq: 1, kind: "agent", text: "Run `bun test` — it is **required**." }]);
    expect(container.querySelector("code")?.textContent).toBe("bun test");
    expect(container.querySelector("strong")?.textContent).toBe("required");
    expect(container.textContent).not.toContain("**");
  });

  test("the asterisks in a shell command stay asterisks", () => {
    const { container } = draw([{ seq: 1, kind: "agent", text: "rm *.txt and *.log" }]);
    expect(container.textContent).toContain("rm *.txt and *.log");
    expect(container.querySelector("em")).toBeNull();
  });

  test("blank lines separate paragraphs", () => {
    const { container } = draw([{ seq: 1, kind: "agent", text: "First point.\n\nSecond point." }]);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  test("an entry with no text does not throw", () => {
    expect(() => draw([{ seq: 1, kind: "agent" }])).not.toThrow();
  });
});

describe("splitFences", () => {
  test("prose, code, prose", () => {
    expect(splitFences("before\n```\nx()\n```\nafter")).toEqual([
      { type: "prose", text: "before" },
      { type: "code", language: undefined, text: "x()" },
      { type: "prose", text: "after" },
    ]);
  });

  test("a fence still streaming runs to the end rather than showing as literal backticks", () => {
    // Otherwise live output flickers between two renderings of the same words as the closing
    // fence arrives.
    const [segment] = splitFences("```ts\nconst a = 1");
    expect(segment).toEqual({ type: "code", language: "ts", text: "const a = 1" });
  });

  test("text with no fence is one segment", () => {
    expect(splitFences("just words")).toEqual([{ type: "prose", text: "just words" }]);
  });
});
