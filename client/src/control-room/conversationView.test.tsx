import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConversationView, NAVIGABLE_LINK_KINDS, type MessageView } from "./ConversationView";

afterEach(cleanup);

function message(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: "m1",
    kind: "question",
    fromAgentId: "backend-agent",
    body: "Should refresh tokens rotate on every use?",
    links: [{ kind: "requirement", id: "AUTH-03" }],
    threadId: "t1",
    createdAt: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("answering an agent from the conversations panel", () => {
  test("no reply control is offered when the caller cannot post messages", () => {
    // The panel must not promise a reply the caller has nowhere to send.
    render(<ConversationView messages={[message()]} />);
    expect(screen.queryByTestId("message-reply-input-m1")).toBeNull();
    expect(screen.queryByTestId("message-reply-send-m1")).toBeNull();
  });

  test("a reply carries the message it answers and the typed text", () => {
    const replies: Array<[string, string]> = [];
    render(
      <ConversationView messages={[message()]} onReply={(m, text) => replies.push([m.id, text])} />,
    );

    fireEvent.change(screen.getByTestId("message-reply-input-m1"), {
      target: { value: "Yes — rotate on every use." },
    });
    fireEvent.click(screen.getByTestId("message-reply-send-m1"));

    expect(replies).toEqual([["m1", "Yes — rotate on every use."]]);
  });

  test("a blank reply cannot be sent, and the box clears after one is", () => {
    const replies: string[] = [];
    render(<ConversationView messages={[message()]} onReply={(_m, text) => replies.push(text)} />);

    const send = () => screen.getByTestId("message-reply-send-m1") as HTMLButtonElement;
    const input = () => screen.getByTestId("message-reply-input-m1") as HTMLInputElement;

    expect(send().disabled).toBe(true);
    fireEvent.change(input(), { target: { value: "   " } });
    expect(send().disabled).toBe(true);
    fireEvent.click(send());
    expect(replies).toEqual([]);

    fireEvent.change(input(), { target: { value: "  use the shared session store  " } });
    fireEvent.click(send());
    expect(replies).toEqual(["use the shared session store"]);
    expect(input().value).toBe("");
    expect(send().disabled).toBe(true);
  });

  test("drafts are kept per message, not shared across the thread", () => {
    const replies: Array<[string, string]> = [];
    render(
      <ConversationView
        messages={[message(), message({ id: "m2", kind: "escalation" })]}
        onReply={(m, text) => replies.push([m.id, text])}
      />,
    );

    fireEvent.change(screen.getByTestId("message-reply-input-m1"), { target: { value: "first" } });
    fireEvent.change(screen.getByTestId("message-reply-input-m2"), { target: { value: "second" } });
    expect((screen.getByTestId("message-reply-input-m1") as HTMLInputElement).value).toBe("first");

    fireEvent.click(screen.getByTestId("message-reply-send-m2"));
    expect(replies).toEqual([["m2", "second"]]);
    // Sending one reply must not wipe the other message's half-typed answer.
    expect((screen.getByTestId("message-reply-input-m1") as HTMLInputElement).value).toBe("first");
  });

  test("kinds that invite a response get a reply box; closed ones do not", () => {
    render(
      <ConversationView
        messages={[
          message({ id: "q", kind: "question" }),
          message({ id: "d", kind: "dependency_request" }),
          message({ id: "h", kind: "handoff" }),
          message({ id: "e", kind: "escalation" }),
          message({ id: "a", kind: "answer" }),
          message({ id: "r", kind: "review_request" }),
          message({ id: "f", kind: "failing_test" }),
        ]}
        onReply={() => {}}
      />,
    );

    for (const id of ["q", "d", "h", "e"]) {
      expect(screen.getByTestId(`message-reply-input-${id}`)).toBeTruthy();
    }
    // A review is acted on in the review queue and an answer closes an exchange.
    for (const id of ["a", "r", "f"]) {
      expect(screen.queryByTestId(`message-reply-input-${id}`)).toBeNull();
    }
  });
});

describe("clearing an unread badge", () => {
  test("no mark-read control is offered when the caller cannot persist the receipt", () => {
    render(<ConversationView messages={[message()]} />);
    expect(screen.getByTestId("message-unread-m1")).toBeTruthy();
    expect(screen.queryByTestId("message-mark-read-m1")).toBeNull();
  });

  test("marking read reports the message id", () => {
    const read: string[] = [];
    render(<ConversationView messages={[message()]} onMarkRead={(id) => read.push(id)} />);
    fireEvent.click(screen.getByTestId("message-mark-read-m1"));
    expect(read).toEqual(["m1"]);
  });

  test("an already-read message offers nothing to clear", () => {
    render(
      <ConversationView
        messages={[message({ id: "m9", readAt: "2026-08-06T01:00:00.000Z" })]}
        onMarkRead={() => {}}
      />,
    );
    expect(screen.queryByTestId("message-unread-m9")).toBeNull();
    expect(screen.queryByTestId("message-mark-read-m9")).toBeNull();
  });
});

describe("link chips only look clickable when the shell can follow them", () => {
  test("a navigable link is a button and opens", () => {
    const opened: Array<{ kind: string; id: string }> = [];
    render(<ConversationView messages={[message()]} onOpenLink={(l) => opened.push(l)} />);

    const chip = screen.getByTestId("message-link-m1-requirement");
    expect(chip.tagName).toBe("BUTTON");
    fireEvent.click(chip);
    expect(opened).toEqual([{ kind: "requirement", id: "AUTH-03" }]);
  });

  test("the other seven link kinds are shown as labels, never as buttons", () => {
    // MessageLinkKind defines eight kinds; the shell navigates only to a requirement, so the rest
    // must carry their information without pretending to be actionable.
    const kinds = ["task", "file", "branch", "test", "artifact", "review", "blocker"];
    render(
      <ConversationView
        messages={[message({ links: kinds.map((kind) => ({ kind, id: `${kind}_1` })) })]}
        onOpenLink={() => {}}
      />,
    );

    for (const kind of kinds) {
      expect(NAVIGABLE_LINK_KINDS.includes(kind)).toBe(false);
      const chip = screen.getByTestId(`message-link-m1-${kind}`);
      expect(chip.tagName).toBe("SPAN");
      // The reference is still readable — it is the traceability, not decoration.
      expect(chip.textContent).toBe(`${kind}: ${kind}_1`);
    }
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  test("a navigable link is a plain label when no handler is wired", () => {
    render(<ConversationView messages={[message()]} />);
    expect(screen.getByTestId("message-link-m1-requirement").tagName).toBe("SPAN");
  });
});
