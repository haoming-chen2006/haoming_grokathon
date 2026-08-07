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

describe("message archival keeps the hot path bounded", () => {
  const links = [{ kind: "task" as const, id: "t1" }];

  // Distinct threads per message: retention is thread-atomic, so traffic spread over a handful
  // of long-lived threads is deliberately never archived (see the dedicated test below).
  function send(n: number) {
    for (let i = 0; i < n; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b",
        body: `m${i}`, links, threadId: `thread-${i}`,
      });
    }
  }

  test("below the threshold nothing is archived", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    send(100);
    expect(store.listMessages(projectId)).toHaveLength(100);
    expect(store.archivedMessages(projectId)).toHaveLength(0);
  });

  test("above the threshold the oldest move to the sidecar and nothing is lost", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    send(700);

    // The project file keeps a bounded window; the rest is archived, not deleted.
    expect(store.listMessages(projectId)).toHaveLength(500);
    expect(store.archivedMessages(projectId)).toHaveLength(200);
    expect(store.listMessages(projectId, { includeArchived: true })).toHaveLength(700);
    // And the archived half really is the older half.
    expect(store.archivedMessages(projectId)[0].body).toBe("m0");
  });

  test("the archive keeps oldest-first order and precedes current messages", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    send(600);
    const all = store.listMessages(projectId, { includeArchived: true });
    expect(all[0].body).toBe("m0");
    expect(all[all.length - 1].body).toBe("m599");
  });

  test("archived messages survive a restart", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    send(600);
    const reopened = new ProjectStore(dir);
    expect(reopened.archivedMessages(projectId)).toHaveLength(100);
    expect(reopened.listMessages(projectId, { includeArchived: true })).toHaveLength(600);
  });

  test("a reply can still resolve a thread whose parent was archived", () => {
    // Without checking the archive, replying to an older message would silently start a new
    // thread and break the conversation.
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    const first = store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "original", links,
    });
    send(600);
    expect(store.archivedMessages(projectId).some((m) => m.id === first.id)).toBe(true);

    const reply = store.sendMessage(projectId, {
      kind: "answer", fromAgentId: "b", toAgentId: "a", body: "late reply", links,
      replyToId: first.id,
    });
    expect(reply.threadId).toBe(first.threadId);
  });

  test("filters apply to archived messages too when history is requested", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    send(600);
    // thread-0 is old enough to have been archived, so it is invisible without history.
    expect(store.listMessages(projectId, { threadId: "thread-0" })).toHaveLength(0);
    const withHistory = store.listMessages(projectId, { threadId: "thread-0", includeArchived: true });
    expect(withHistory).toHaveLength(1);
    expect(withHistory[0].body).toBe("m0");
  });

  test("a few long-lived threads are kept whole rather than archived", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    for (let i = 0; i < 700; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b",
        body: `m${i}`, links, threadId: `thread-${i % 10}`,
      });
    }
    // Every thread has recent activity, so none may be archived — splitting one would break
    // the loop guard. The window is a floor, not a hard cap.
    expect(store.archivedMessages(projectId)).toHaveLength(0);
    expect(store.listMessages(projectId)).toHaveLength(700);
  });
});

describe("archival must not weaken the loop guard (V-027)", () => {
  const links = [{ kind: "task" as const, id: "t1" }];

  test("a thread is never split across the archive boundary", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 99999, maxUnansweredPerPair: 99999 });
    for (let i = 0; i < 700; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b",
        body: `m${i}`, links, threadId: `thread-${i % 10}`,
      });
    }
    const retainedThreads = new Set(store.listMessages(projectId).map((m) => m.threadId));
    const archivedThreads = new Set(store.archivedMessages(projectId).map((m) => m.threadId));
    for (const t of retainedThreads) {
      expect(archivedThreads.has(t), `thread ${t} was split across the boundary`).toBe(false);
    }
  });

  test("a long-running thread still escalates after archival has kicked in", () => {
    // Without thread-atomic retention the guard would under-count and never escalate.
    store.setMessageLimits(projectId, { maxThreadLength: 20, maxUnansweredPerPair: 99999 });

    // Push plenty of unrelated traffic so archiving is active.
    for (let i = 0; i < 600; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "x", toAgentId: "y",
        body: `noise${i}`, links, threadId: `noise-${i}`,
      });
    }
    expect(store.archivedMessages(projectId).length).toBeGreaterThan(0);

    const hot = "hot-thread";
    const kinds: string[] = [];
    for (let i = 0; i < 25; i++) {
      kinds.push(store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b",
        body: `turn ${i}`, links, threadId: hot,
      }).kind);
    }
    // The 21st message onward is converted to an escalation.
    expect(kinds.slice(0, 20).every((k) => k === "question")).toBe(true);
    expect(kinds.slice(20).every((k) => k === "escalation")).toBe(true);
  });

  test("replying into a fully archived thread still counts that thread's history", () => {
    store.setMessageLimits(projectId, { maxThreadLength: 5, maxUnansweredPerPair: 99999 });
    const old = "ancient";
    let last = store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "t0", links, threadId: old,
    });
    for (let i = 1; i < 5; i++) {
      last = store.sendMessage(projectId, {
        kind: "question", fromAgentId: "a", toAgentId: "b", body: `t${i}`, links, threadId: old,
      });
    }

    // Bury it far enough that the whole thread is archived.
    for (let i = 0; i < 700; i++) {
      store.sendMessage(projectId, {
        kind: "question", fromAgentId: "x", toAgentId: "y",
        body: `noise${i}`, links, threadId: `noise-${i}`,
      });
    }
    expect(store.listMessages(projectId).some((m) => m.threadId === old)).toBe(false);
    expect(store.archivedMessages(projectId).filter((m) => m.threadId === old)).toHaveLength(5);

    // The thread already holds its full limit of 5, entirely in the archive. The next reply must
    // escalate — which is only possible if the guard consults archived history.
    const next = store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b", body: "t5", links, replyToId: last.id,
    });
    expect(next.threadId).toBe(last.threadId);
    expect(next.kind).toBe("escalation");
  });
});
