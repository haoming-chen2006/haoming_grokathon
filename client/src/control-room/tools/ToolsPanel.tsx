/**
 * The Tools panel — grok-workspace.md §6, loops/06-tools-and-cost.md §4.5/§4.6.
 *
 * **This component renders the body of the overlay and nothing else.** The shell owns the mount,
 * the scrim, the Esc key, the header and the ⌘T shortcut (`shell/WorkspaceShell.tsx:305-345`), and
 * that line is not negotiable in either direction: a panel that added its own Esc handler would
 * give the overlay two dismissal paths and desynchronise the query parameter from the DOM.
 *
 * Which section shows is the `section` prop, which the shell reads from the URL — so
 * `/agents?tools=skills` deep-links here and the page underneath is never lost, which is the whole
 * argument for this being an overlay rather than a fourth page.
 *
 * The one thing it does that reaches outside itself is injection, and it does that by dispatching a
 * DOM event rather than importing anything: `client/src/control-room/agents/**` belongs to
 * `01-agents`, and the event contract in `./contract.ts` is the only module that crosses. This
 * panel RESOLVES — it asks the server what the payload would be — and `01-agents` DELIVERS. No
 * session is opened here and nothing is written into a work area.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToolsPanelProps } from "../shell/contract";
import {
  listInjectableAgents,
  listPrompts,
  listSkills,

  resolveInjection,
  type GrokSkill,
  type InjectableAgent,
  type InjectionPayload,

  type PromptTemplate,
} from "./api";
import { dispatchInjectResource, onOpenTools, type InjectionKind } from "./contract";
import { PromptsSection } from "./PromptsSection";
import { SkillsSection } from "./SkillsSection";
import { Button, ErrorNote, Mono, Tag } from "./ui";

interface LibraryState {
  prompts: PromptTemplate[];
  skills: GrokSkill[];
  agents: InjectableAgent[];
  loading: boolean;
  /** Set when the server could not be read. Distinct from "the library is empty". */
  error: string | null;
}

const EMPTY: LibraryState = {
  prompts: [],
  skills: [],
  agents: [],
  loading: true,
  error: null,
};

export function ToolsPanel({ projectId, section }: ToolsPanelProps) {
  const [state, setState] = useState<LibraryState>(EMPTY);
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<InjectionPayload | null>(null);
  const [injectError, setInjectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prompts, skills, agents] = await Promise.all([
        listPrompts(),
        listSkills(),
        listInjectableAgents(projectId),
      ]);
      setState({ prompts, skills, agents, loading: false, error: null });
    } catch (err) {
      // A failed read must not render as two empty lists — the user would conclude their work was
      // lost and start again over the top of it.
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * `01-agents` opens the panel from an agent card and names the agent (§4.6).
   *
   * The shell turns the event into a route change; this listener exists only to pick up the
   * `agentId` riding along with it, so "send this to the agent I was just looking at" needs no
   * second selection.
   */
  useEffect(
    () =>
      onOpenTools((detail) => {
        if (detail.agentId) setTargetAgentId(detail.agentId);
      }),
    [],
  );

  const target = useMemo(
    () => state.agents.find((a) => a.id === targetAgentId) ?? null,
    [state.agents, targetAgentId],
  );

  /**
   * Why "Send to agent" is disabled, in words, or undefined when it is not.
   *
   * Returned as a sentence rather than a boolean because it becomes the button's tooltip: a
   * disabled control with no stated reason is the most common way a panel silently strands someone.
   */
  const injectDisabled = useMemo(() => {
    if (state.agents.length === 0) return "No agents are running in this project yet.";
    if (!target) return "Choose which agent to send this to first.";
    return undefined;
  }, [state.agents.length, target]);

  const inject = useCallback(
    async (kind: InjectionKind, resource: { id: string; name: string }, values?: Record<string, string>) => {
      if (!target) return;
      setInjectError(null);
      setOutcome(null);
      try {
        // Resolve on the server, then hand the resolved payload to whoever delivers. Carrying the
        // payload rather than an id means what the user was shown and what is sent cannot diverge.
        const payload = await resolveInjection({
          kind,
          resourceId: resource.id,
          values,
          projectId,
          agentId: target.id,
        });
        dispatchInjectResource({
          kind: payload.kind,
          resourceId: payload.resourceId,
          resourceName: payload.resourceName,
          resourceVersion: payload.resourceVersion,
          agentId: target.id,
          projectId,
          text: payload.text,
          mounts: payload.mounts,
          effective: payload.effective,
          effectNote: payload.effectNote,
          estimatedInputTokens: payload.estimatedInputTokens,
        });
        setOutcome(payload);
      } catch (err) {
        setInjectError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectId, target],
  );

  if (state.loading) {
    return <p className="px-3.5 py-6 text-[13px] text-ink-faint">Reading your library…</p>;
  }

  return (
    <div data-testid="tools-panel-body" className="flex min-h-0 flex-col gap-3 px-3.5 py-3">
      {state.error ? (
        <ErrorNote>
          {state.error} Nothing has been changed — this is a reading problem, not a lost library.
        </ErrorNote>
      ) : null}

      <InjectionTarget
        agents={state.agents}
        target={target}
        onChoose={setTargetAgentId}
        outcome={outcome}
        error={injectError}
        onDismiss={() => {
          setOutcome(null);
          setInjectError(null);
        }}
      />

      {section === "prompts" ? (
        <PromptsSection prompts={state.prompts} reload={load} onInject={inject} injectDisabled={injectDisabled} />
      ) : null}
      {section === "skills" ? (
        <SkillsSection skills={state.skills} reload={load} onInject={inject} injectDisabled={injectDisabled} />
      ) : null}
    </div>
  );
}

/**
 * Who a resource gets handed to, and what happened when it was.
 *
 * The result line is the part TOOL-011 is really about. A skill mounted without a one-shot paste
 * does not reach the running turn, and the server says so in `effectNote`; this renders that
 * sentence verbatim rather than substituting a checkmark. **The panel never claims an effect that
 * has not happened** — "skill enabled" over an agent that will not see it for an hour is the exact
 * failure the field exists to prevent.
 */
function InjectionTarget({
  agents,
  target,
  onChoose,
  outcome,
  error,
  onDismiss,
}: {
  agents: InjectableAgent[];
  target: InjectableAgent | null;
  onChoose: (id: string) => void;
  outcome: InjectionPayload | null;
  error: string | null;
  onDismiss: () => void;
}) {
  if (agents.length === 0 && !outcome && !error) return null;

  return (
    <div className="flex flex-col gap-2">
      {agents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">Send to</span>
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              data-testid="agent-target"
              data-selected={agent.id === target?.id ? "true" : undefined}
              onClick={() => onChoose(agent.id)}
              className={`rounded border px-2 py-0.5 text-[12px] transition-colors ${
                agent.id === target?.id
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-ink-muted hover:bg-surface-hover"
              }`}
            >
              {agent.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {outcome ? (
        <div
          data-testid="injection-outcome"
          className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface px-2.5 py-2"
        >
          <Tag tone={outcome.effective === "this_turn" ? "accent" : "neutral"}>
            {outcome.effective === "this_turn" ? "On its next turn" : "Next time it starts"}
          </Tag>
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-muted">
            <Mono className="text-ink">{outcome.resourceName}</Mono> — {outcome.effectNote}
          </span>
          <Button onClick={onDismiss}>Dismiss</Button>
        </div>
      ) : null}
    </div>
  );
}

export default ToolsPanel;
