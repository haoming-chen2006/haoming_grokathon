import type { AgentActivity, AgentRuntimeStatus } from "../types/agent";
import type { EffectiveTaskStatus, RequirementStatus, TaskStatus } from "../types/project";

/**
 * Events pushed to the control room so status transitions are visible without a page refresh
 * (V-019). Every event names the project it belongs to at publish time; subscribers only receive
 * their own project's traffic.
 */
export type ControlRoomEvent =
  | { type: "agent_status"; agentId: string; status: AgentRuntimeStatus; statusDetail?: string }
  | { type: "agent_activity"; agentId: string; activity: AgentActivity }
  /**
   * The agent is gone — deleted, not stopped.
   *
   * Its own event rather than an `agent_status`, because there is no runtime status for "no longer
   * exists" and inventing one would have every board that reads a status draw a card for an agent
   * that has none. A listener should drop the agent, not restyle it.
   */
  | { type: "agent_removed"; agentId: string }
  | {
      type: "task_status";
      taskId: string;
      status: TaskStatus;
      effectiveStatus: EffectiveTaskStatus;
      /** Tasks that became runnable because this one completed. */
      unblocked: string[];
    }
  | { type: "requirement_status"; requirementId: string; status: RequirementStatus }
  | { type: "progress"; percent: number; completed: number; total: number }
  | {
      type: "cost";
      projectCostUsd: number;
      projectBudgetUsd?: number;
      byAgent: Array<{ agentId: string; name: string; costUsd: number }>;
    }
  | {
      type: "budget_warning";
      scope: "agent" | "task" | "project";
      spent: number;
      limit: number;
      fraction: number;
    }
  | { type: "budget_exceeded"; scope: "agent" | "task" | "project"; spent: number; limit: number }
  /** A line appended to an agent's live transcript (V-023). */
  | {
      type: "transcript";
      agentId: string;
      entry: { seq: number; at: string; kind: string; text: string; status?: string };
    }
  | { type: "session_state"; agentId: string; state: string; error?: string }
  /**
   * Grok is installed but has no credentials, so no session can open (V-004). Its own event type
   * because the remedy is a sign-in, not a retry: routed through the generic failure path the
   * control room showed a protocol error nobody could act on.
   */
  | { type: "auth_required"; agentId: string; authMethods: string[]; message: string };

export interface PublishedEvent {
  projectId: string;
  event: ControlRoomEvent;
  at: string;
}

type Subscriber = (published: PublishedEvent) => void;

/**
 * A tiny per-project pub/sub. Deliberately synchronous and in-process: the control room is a
 * local single-user app, so a broker would be overhead without benefit.
 */
export class ControlRoomBus {
  private subscribers = new Map<string, Set<Subscriber>>();
  /** Recent events per project, so a client that connects late is not blind. */
  private recent = new Map<string, PublishedEvent[]>();

  constructor(private readonly historyLimit = 50) {}

  subscribe(projectId: string, fn: Subscriber): () => void {
    const set = this.subscribers.get(projectId) ?? new Set<Subscriber>();
    set.add(fn);
    this.subscribers.set(projectId, set);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(projectId);
    };
  }

  subscriberCount(projectId: string): number {
    return this.subscribers.get(projectId)?.size ?? 0;
  }

  publish(projectId: string, event: ControlRoomEvent): PublishedEvent {
    const published: PublishedEvent = { projectId, event, at: new Date().toISOString() };

    const history = this.recent.get(projectId) ?? [];
    history.push(published);
    if (history.length > this.historyLimit) history.splice(0, history.length - this.historyLimit);
    this.recent.set(projectId, history);

    for (const fn of this.subscribers.get(projectId) ?? []) {
      try {
        fn(published);
      } catch {
        // One bad subscriber must not stop the others from being notified.
      }
    }
    return published;
  }

  history(projectId: string): PublishedEvent[] {
    return [...(this.recent.get(projectId) ?? [])];
  }

  clear(projectId?: string): void {
    if (projectId) {
      this.subscribers.delete(projectId);
      this.recent.delete(projectId);
      return;
    }
    this.subscribers.clear();
    this.recent.clear();
  }
}

let bus: ControlRoomBus | null = null;
export function getControlRoomBus(): ControlRoomBus {
  if (!bus) bus = new ControlRoomBus();
  return bus;
}
