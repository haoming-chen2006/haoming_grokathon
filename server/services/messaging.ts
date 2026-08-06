import type { AgentMessage, MessageKind, MessageLimits, MessageLink } from "../types/project";
import { DEFAULT_MESSAGE_LIMITS } from "../types/project";

/** A message carried no link to a project object (V-025). */
export class UnlinkedMessageError extends Error {
  readonly code = "UNLINKED_MESSAGE";
  constructor(kind: MessageKind) {
    super(
      `A ${kind} message must reference a task, requirement, file, branch, test, artifact, review or blocker. ` +
        `Unlinked agent chatter is not accepted.`,
    );
    this.name = "UnlinkedMessageError";
  }
}

/** Kinds that must name a recipient agent; everything else may address the user. */
const REQUIRES_RECIPIENT: MessageKind[] = [
  "question",
  "answer",
  "dependency_request",
  "handoff",
  "review_request",
];

export class MissingRecipientError extends Error {
  readonly code = "MISSING_RECIPIENT";
  constructor(kind: MessageKind) {
    super(`A ${kind} message must name a recipient agent`);
    this.name = "MissingRecipientError";
  }
}

export function requiresRecipient(kind: MessageKind): boolean {
  return REQUIRES_RECIPIENT.includes(kind);
}

export function validateLinks(kind: MessageKind, links: MessageLink[]): void {
  if (!links || links.length === 0) throw new UnlinkedMessageError(kind);
}

/** Messages in a thread, oldest first. */
export function threadMessages(messages: AgentMessage[], threadId: string): AgentMessage[] {
  return messages.filter((m) => m.threadId === threadId);
}

/**
 * Consecutive messages from `from` to `to` in this thread with no intervening reply from `to`.
 * This is the signal that an agent is repeating itself into the void (V-027).
 */
export function unansweredStreak(
  messages: AgentMessage[],
  threadId: string,
  from: string,
  to: string,
): number {
  const thread = threadMessages(messages, threadId);
  let streak = 0;
  for (let i = thread.length - 1; i >= 0; i--) {
    const msg = thread[i];
    if (msg.fromAgentId === to && msg.toAgentId === from) break; // the reply we were waiting for
    if (msg.fromAgentId === from && msg.toAgentId === to) streak += 1;
  }
  return streak;
}

export interface LoopVerdict {
  escalate: boolean;
  reason?: string;
}

/**
 * Decide whether an outgoing message should be diverted to the user instead of the intended
 * agent. Diverting rather than rejecting means the content is never lost — the user simply
 * becomes the recipient once the agents have demonstrably stopped making progress.
 */
export function checkLoopGuard(
  messages: AgentMessage[],
  candidate: { threadId: string; fromAgentId: string; toAgentId?: string },
  limits: MessageLimits = DEFAULT_MESSAGE_LIMITS,
): LoopVerdict {
  const thread = threadMessages(messages, candidate.threadId);

  if (thread.length >= limits.maxThreadLength) {
    return {
      escalate: true,
      reason:
        `Thread reached the configured limit of ${limits.maxThreadLength} messages without resolution; ` +
        `escalating to the user.`,
    };
  }

  if (candidate.toAgentId) {
    const streak = unansweredStreak(messages, candidate.threadId, candidate.fromAgentId, candidate.toAgentId);
    if (streak >= limits.maxUnansweredPerPair) {
      return {
        escalate: true,
        reason:
          `${candidate.fromAgentId} has sent ${streak} unanswered messages to ${candidate.toAgentId}; ` +
          `escalating to the user rather than continuing to retry.`,
      };
    }
  }

  return { escalate: false };
}
