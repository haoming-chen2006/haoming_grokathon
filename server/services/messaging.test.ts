import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ProjectStore, NotFoundError } from "./projectStore";
import {
  MissingRecipientError,
  UnlinkedMessageError,
  checkLoopGuard,
  requiresRecipient,
  threadMessages,
  unansweredStreak,
} from "./messaging";
import type { AgentMessage } from "../types/project";

let dir: string;
let store: ProjectStore;
let projectId: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openui-msg-"));
  store = new ProjectStore(dir);
  projectId = store.createProject({ name: "Auth", goal: "g", repositoryPath: "/tmp/r" }).id;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function msg(from: string, to: string | undefined, threadId: string): AgentMessage {
  return {
    id: `m${Math.random()}`,
    projectId: "p",
    kind: "question",
    fromAgentId: from,
    toAgentId: to,
    body: "b",
    links: [{ kind: "task", id: "t" }],
    threadId,
    createdAt: "",
  };
}

describe("V-025: structured messages work", () => {
  test("all seven message kinds can be sent", () => {
    const kinds = [
      "question",
      "answer",
      "dependency_request",
      "handoff",
      "failing_test",
      "review_request",
      "escalation",
    ] as const;

    for (const kind of kinds) {
      const sent = store.sendMessage(projectId, {
        kind,
        fromAgentId: "backend-agent",
        toAgentId: requiresRecipient(kind) ? "frontend-agent" : undefined,
        body: `a ${kind}`,
        links: [{ kind: "task", id: "task-1" }],
      });
      expect(sent.kind).toBe(kind);
      expect(sent.id).toBeTruthy();
    }
    expect(store.listMessages(projectId)).toHaveLength(kinds.length);
  });

  test("a message records sender, recipient and linked object", () => {
    const sent = store.sendMessage(projectId, {
      kind: "failing_test",
      fromAgentId: "test-agent",
      toAgentId: "backend-agent",
      body: "Concurrent refresh requests can issue two valid tokens.",
      links: [
        { kind: "test", id: "tests/auth/session_refresh_test.py" },
        { kind: "requirement", id: "AUTH-03" },
        { kind: "branch", id: "agent/auth-backend" },
      ],
    });

    expect(sent.fromAgentId).toBe("test-agent");
    expect(sent.toAgentId).toBe("backend-agent");
    expect(sent.links.map((l) => l.kind)).toEqual(["test", "requirement", "branch"]);
    expect(sent.threadId).toBeTruthy();
  });

  test("an unlinked message is rejected", () => {
    expect(() =>
      store.sendMessage(projectId, {
        kind: "question",
        fromAgentId: "a",
        toAgentId: "b",
        body: "just chatting",
        links: [],
      }),
    ).toThrow(UnlinkedMessageError);
    expect(store.listMessages(projectId)).toHaveLength(0);
  });

  test("a message kind that needs a recipient is rejected without one", () => {
    expect(() =>
      store.sendMessage(projectId, {
        kind: "question",
        fromAgentId: "a",
        body: "to nobody",
        links: [{ kind: "task", id: "t" }],
      }),
    ).toThrow(MissingRecipientError);
  });

  test("escalation may address the user with no recipient agent", () => {
    const sent = store.sendMessage(projectId, {
      kind: "escalation",
      fromAgentId: "backend-agent",
      body: "Need a credential I do not have",
      links: [{ kind: "blocker", id: "B-1" }],
    });
    expect(sent.toAgentId).toBeUndefined();
    expect(store.listEscalations(projectId)).toHaveLength(1);
  });

  test("replies join the thread they answer", () => {
    const question = store.sendMessage(projectId, {
      kind: "question",
      fromAgentId: "frontend-agent",
      toAgentId: "backend-agent",
      body: "What is the login response shape?",
      links: [{ kind: "requirement", id: "AUTH-01" }],
    });

    const answer = store.sendMessage(projectId, {
      kind: "answer",
      fromAgentId: "backend-agent",
      toAgentId: "frontend-agent",
      body: "See artifact auth-contract-v2",
      links: [{ kind: "requirement", id: "AUTH-01" }],
      replyToId: question.id,
    });

    expect(answer.threadId).toBe(question.threadId);
    expect(store.listMessages(projectId, { threadId: question.threadId })).toHaveLength(2);
  });

  test("replying to an unknown message is rejected", () => {
    expect(() =>
      store.sendMessage(projectId, {
        kind: "answer",
        fromAgentId: "a",
        toAgentId: "b",
        body: "x",
        links: [{ kind: "task", id: "t" }],
        replyToId: "does-not-exist",
      }),
    ).toThrow(NotFoundError);
  });

  test("messages can be filtered by agent and marked read", () => {
    const m = store.sendMessage(projectId, {
      kind: "question",
      fromAgentId: "a",
      toAgentId: "b",
      body: "x",
      links: [{ kind: "task", id: "t" }],
    });
    store.sendMessage(projectId, {
      kind: "question",
      fromAgentId: "c",
      toAgentId: "d",
      body: "y",
      links: [{ kind: "task", id: "t" }],
    });

    expect(store.listMessages(projectId, { agentId: "b" })).toHaveLength(1);
    expect(store.listMessages(projectId, { unreadOnly: true })).toHaveLength(2);
    store.markMessageRead(projectId, m.id);
    expect(store.listMessages(projectId, { unreadOnly: true })).toHaveLength(1);
  });

  test("messages survive a restart", () => {
    store.sendMessage(projectId, {
      kind: "question",
      fromAgentId: "a",
      toAgentId: "b",
      body: "persisted?",
      links: [{ kind: "task", id: "t" }],
    });
    expect(new ProjectStore(dir).listMessages(projectId)).toHaveLength(1);
  });
});

describe("V-026: agent handoffs work", () => {
  test("one agent produces an artifact and another receives it with context", () => {
    const { artifact, message } = store.handoffArtifact(projectId, {
      fromAgentId: "backend-agent",
      toAgentId: "frontend-agent",
      body: "Authentication endpoint is ready.",
      artifact: {
        kind: "api_contract",
        name: "auth-contract-v2",
        content: JSON.stringify({ path: "/api/auth/login", method: "POST" }),
        requirementId: "AUTH-01",
        taskId: "task-api",
        branch: "agent/auth-backend",
      },
    });

    expect(artifact.producedByAgentId).toBe("backend-agent");
    expect(artifact.kind).toBe("api_contract");

    expect(message.kind).toBe("handoff");
    expect(message.fromAgentId).toBe("backend-agent");
    expect(message.toAgentId).toBe("frontend-agent");

    // The receiving agent gets the artifact plus its surrounding context, not a bare id.
    const linkKinds = message.links.map((l) => l.kind);
    expect(linkKinds).toContain("artifact");
    expect(linkKinds).toContain("task");
    expect(linkKinds).toContain("requirement");
    expect(linkKinds).toContain("branch");
    expect(message.links.find((l) => l.kind === "artifact")!.id).toBe(artifact.id);
  });

  test("the receiving agent can retrieve the artifact content", () => {
    const { artifact, message } = store.handoffArtifact(projectId, {
      fromAgentId: "backend-agent",
      toAgentId: "frontend-agent",
      body: "contract ready",
      artifact: { kind: "api_contract", name: "c", content: "the-contract" },
    });

    const linkedId = message.links.find((l) => l.kind === "artifact")!.id;
    expect(store.getArtifact(projectId, linkedId).content).toBe("the-contract");
    expect(store.getArtifact(projectId, artifact.id).name).toBe("c");
  });

  test("the handoff is visible in the recipient's message list", () => {
    store.handoffArtifact(projectId, {
      fromAgentId: "backend-agent",
      toAgentId: "frontend-agent",
      body: "ready",
      artifact: { kind: "api_contract", name: "c" },
    });
    const inbox = store.listMessages(projectId, { agentId: "frontend-agent" });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].kind).toBe("handoff");
  });

  test("artifacts can be listed by requirement and task", () => {
    store.createArtifact(projectId, { kind: "test_report", name: "r1", producedByAgentId: "test-agent", requirementId: "AUTH-01" });
    store.createArtifact(projectId, { kind: "diff", name: "d1", producedByAgentId: "backend", taskId: "task-1" });

    expect(store.listArtifacts(projectId, { requirementId: "AUTH-01" })).toHaveLength(1);
    expect(store.listArtifacts(projectId, { taskId: "task-1" })).toHaveLength(1);
    expect(store.listArtifacts(projectId)).toHaveLength(2);
  });
});

describe("V-027: conversations do not loop indefinitely", () => {
  test("unansweredStreak counts consecutive one-way messages", () => {
    const thread = "t1";
    const messages = [msg("a", "b", thread), msg("a", "b", thread), msg("a", "b", thread)];
    expect(unansweredStreak(messages, thread, "a", "b")).toBe(3);
  });

  test("a reply resets the streak", () => {
    const thread = "t1";
    const messages = [msg("a", "b", thread), msg("a", "b", thread), msg("b", "a", thread), msg("a", "b", thread)];
    expect(unansweredStreak(messages, thread, "a", "b")).toBe(1);
  });

  test("streaks are scoped to a thread", () => {
    const messages = [msg("a", "b", "t1"), msg("a", "b", "t2")];
    expect(unansweredStreak(messages, "t1", "a", "b")).toBe(1);
  });

  test("the guard escalates after the configured unanswered limit", () => {
    const thread = "t1";
    const messages = [msg("a", "b", thread), msg("a", "b", thread), msg("a", "b", thread)];
    const verdict = checkLoopGuard(messages, { threadId: thread, fromAgentId: "a", toAgentId: "b" });
    expect(verdict.escalate).toBe(true);
    expect(verdict.reason).toContain("unanswered");
  });

  test("the guard escalates when a thread exceeds its length limit", () => {
    const thread = "t1";
    const messages = Array.from({ length: 20 }, () => msg("a", "b", thread));
    const verdict = checkLoopGuard(messages, { threadId: thread, fromAgentId: "a", toAgentId: "b" });
    expect(verdict.escalate).toBe(true);
    expect(verdict.reason).toContain("20 messages");
  });

  test("a healthy exchange is not escalated", () => {
    const thread = "t1";
    const messages = [msg("a", "b", thread), msg("b", "a", thread)];
    expect(checkLoopGuard(messages, { threadId: thread, fromAgentId: "a", toAgentId: "b" }).escalate).toBe(false);
  });

  test("end to end: a repeating agent is diverted to the user instead of looping", () => {
    const links = [{ kind: "task" as const, id: "task-1" }];
    const first = store.sendMessage(projectId, {
      kind: "dependency_request",
      fromAgentId: "frontend-agent",
      toAgentId: "backend-agent",
      body: "Need the API contract",
      links,
    });
    const thread = first.threadId;

    store.sendMessage(projectId, { kind: "dependency_request", fromAgentId: "frontend-agent", toAgentId: "backend-agent", body: "Still need it", links, threadId: thread });
    store.sendMessage(projectId, { kind: "dependency_request", fromAgentId: "frontend-agent", toAgentId: "backend-agent", body: "Third ask", links, threadId: thread });

    // Fourth attempt trips the guard.
    const fourth = store.sendMessage(projectId, {
      kind: "dependency_request",
      fromAgentId: "frontend-agent",
      toAgentId: "backend-agent",
      body: "Fourth ask",
      links,
      threadId: thread,
    });

    expect(fourth.kind).toBe("escalation");
    expect(fourth.autoEscalated).toBe(true);
    expect(fourth.toAgentId).toBeUndefined(); // now addressed to the user
    expect(fourth.escalationReason).toContain("escalating to the user");
    // The content is preserved, not dropped.
    expect(fourth.body).toBe("Fourth ask");
    expect(store.listEscalations(projectId)).toHaveLength(1);
  });

  test("limits are configurable per project", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 50, maxUnansweredPerPair: 1 });
    const links = [{ kind: "task" as const, id: "t" }];

    const first = store.sendMessage(projectId, { kind: "question", fromAgentId: "a", toAgentId: "b", body: "1", links });
    const second = store.sendMessage(projectId, {
      kind: "question",
      fromAgentId: "a",
      toAgentId: "b",
      body: "2",
      links,
      threadId: first.threadId,
    });

    // With maxUnansweredPerPair = 1, the second message already escalates.
    expect(second.kind).toBe("escalation");
  });

  test("threadMessages returns only that thread, oldest first", () => {
    const messages = [msg("a", "b", "t1"), msg("a", "b", "t2"), msg("a", "b", "t1")];
    expect(threadMessages(messages, "t1")).toHaveLength(2);
  });
});
