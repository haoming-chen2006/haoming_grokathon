/**
 * The AGENTS inspector, as `design/mockups/agents-page.html` draws its right-hand region.
 *
 * The page had no inspector at all — `AGENTS_PAGE_SLOTS` named a main and a navigator and stopped
 * — so a third of every screen said "this page's inspector arrives with 01-agents", which had
 * merged. The mockup gives that region four things: who is selected, what it may spend on, which
 * area it may write in, and what it has cost.
 *
 * **The money dial is the point of this panel.** The mockup prints "~$0.90 / task" beside each
 * choice; there is no such figure and inventing an average would be a fabricated cost. What is real
 * is the per-unit price the tier unlocks, which is also what actually bounds the decision — an
 * agent with no image endpoint registered cannot spend $0.02 however it is asked to. Those prices
 * come from `/api/coding-agents/capabilities`, which joins the tiers to the rate table; nothing
 * here transcribes a price.
 *
 * Everything absent is omitted. The mockup's "Started by Marco Reyes" has no field behind it — no
 * record says who created an agent — so no row is drawn rather than a plausible name.
 */
import { useEffect, useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { Money } from "./AgentCard";
import { areaAccent, bucketOf } from "./board";
import { useAgents } from "./useAgents";
import type { AgentCapabilities, AgentView, AreaView } from "./types";

/** Mono, small, tracked — the heading every region in every mockup is divided by. */
function Label({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">{children}</div>
  );
}

function Rule() {
  return <div aria-hidden="true" className="h-px bg-border" />;
}

/** One published rate, as the server states it. Never rounded into a different unit. */
interface UnitPrice {
  rateKey: string;
  unit: string;
  perUnitUsd: number;
  source?: { url?: string; readOn?: string };
}

interface Preset {
  id: string;
  label: string;
  capabilities: AgentCapabilities;
  mediaTools: string[];
  spendNote: string;
  unitPrices?: UnitPrice[];
}

/** "$0.02 / image", "$15.00 per million characters" — whichever the unit makes readable. */
function priceText(price: UnitPrice): string {
  const unit = price.unit;
  if (unit === "characters") {
    return `$${(price.perUnitUsd * 1_000_000).toFixed(2)} / million characters`;
  }
  if (unit === "images") return `$${price.perUnitUsd.toFixed(2)} / image`;
  if (unit === "video_seconds") return `$${price.perUnitUsd.toFixed(2)} / second of video`;
  if (unit === "audio_hours") return `$${price.perUnitUsd.toFixed(2)} / hour of audio`;
  // A unit this component has no phrasing for still renders its figure rather than vanishing.
  return `$${price.perUnitUsd.toFixed(2)} / ${unit.replace(/_/g, " ")}`;
}

/** The four tiers, with what each one can be charged for. Fetched once; it is a static table. */
function useCapabilityPresets(): Preset[] {
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/coding-agents/capabilities");
        if (!res.ok) return;
        const body = (await res.json()) as { presets?: unknown };
        if (!live) return;
        // Validated, not cast: an error body is an object and an object has no `.map`.
        setPresets(Array.isArray(body?.presets) ? (body.presets as Preset[]) : []);
      } catch {
        // A vocabulary that will not load leaves the dial unlisted rather than blanking the panel.
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return presets;
}

/** One agent's share of the two ledgers, from `GET /api/projects/:id/spend`. */
interface AgentSpend {
  pricedUsd: number;
  charges: number;
  unpriced: number;
}

/**
 * What one agent has actually cost.
 *
 * Not `agent.costUsd`, which is the registry's TOKEN total: `generate_image` writes its charge onto
 * the asset it bought and never advances the agent record. So the first real image cost $0.02, the
 * project's spend went up, and the agent that spent it read "—". The two ledgers are summed by the
 * server, which is the only place that can see both.
 */
function useAgentSpend(projectId: string, agentId: string | undefined): AgentSpend | undefined {
  const [spend, setSpend] = useState<AgentSpend | undefined>();
  useEffect(() => {
    setSpend(undefined);
    if (!projectId || !agentId) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/spend`);
        if (!res.ok) return;
        const body = (await res.json()) as { byAgent?: unknown };
        if (!live) return;
        const rows = Array.isArray(body?.byAgent) ? (body.byAgent as Array<AgentSpend & { agentId?: string }>) : [];
        setSpend(rows.find((row) => row.agentId === agentId));
      } catch {
        // Left undefined, which renders the record's own figure rather than nothing.
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId, agentId]);
  return spend;
}

const sameCapability = (a?: AgentCapabilities, b?: AgentCapabilities) =>
  (a?.images ?? false) === (b?.images ?? false) && (a?.voice ?? false) === (b?.voice ?? false);

/**
 * The money dial.
 *
 * Read-only, and it says so. Capability is chosen once at creation because it decides which tools
 * the agent's MCP server REGISTERS — `boundary.ts`: "the enforcement is registration, not refusal"
 * — and a live session's tool list is fixed at `session/new`. Changing it on a running agent would
 * either do nothing until a restart or silently restart the agent mid-task. The control that would
 * do it honestly does not exist yet, so no control is drawn that looks like it does.
 */
function CapabilityDial({ agent, presets }: { agent: AgentView; presets: Preset[] }) {
  const selected = presets.find((p) => sameCapability(p.capabilities, agent.capabilities));

  if (presets.length === 0) {
    return (
      <p className="text-[12px] leading-snug text-ink-faint">
        The capability list has not loaded, so what this agent may spend on cannot be shown.
      </p>
    );
  }

  return (
    <>
      <div data-testid="capability-dial" className="flex flex-col gap-[7px]">
        {presets.map((preset) => {
          const isThis = preset.id === selected?.id;
          return (
            <div
              key={preset.id}
              data-testid={`capability-${preset.id}`}
              aria-current={isThis ? "true" : undefined}
              title={preset.spendNote}
              className={`flex items-center gap-2.5 rounded-[7px] border px-2.5 py-2 ${
                isThis ? "border-status-waiting bg-status-waiting/10 text-ink" : "border-border text-ink-faint"
              }`}
            >
              {/* The mockup's filled ring. The word beside it carries the same fact. */}
              <span
                aria-hidden="true"
                className={`h-3 w-3 shrink-0 rounded-full border ${
                  isThis ? "border-4 border-status-waiting" : "border-border-strong"
                }`}
              />
              {/* Not truncated: the widest tier's four prices squeezed "Grok + voice + images"
                  down to "Grok + voic…", which hides the very word that says what it may spend on. */}
              <span className="min-w-0 flex-1">{preset.label}</span>
              <span className="shrink-0 text-right font-mono text-[10px] leading-tight">
                {preset.unitPrices && preset.unitPrices.length > 0 ? (
                  preset.unitPrices.map((price) => (
                    <span key={price.rateKey} className="block">
                      {priceText(price)}
                    </span>
                  ))
                ) : (
                  <span className="text-ink-ghost">no priced endpoint</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] leading-snug text-ink-faint">
        This is the money dial. An agent with no image or voice endpoint registered cannot run up a
        picture or voice bill, whatever it is asked to do. It is chosen when the agent is created,
        because it decides which tools its session is handed.
      </p>
    </>
  );
}

/** Where this agent may write — the one rule the whole board is built on. */
function AreaRow({ area }: { area?: AreaView }) {
  if (!area) {
    return (
      <p data-testid="inspector-no-area" className="text-[12px] leading-snug text-ink-faint">
        Not in an area yet. Until it is, it can suggest changes and make none.
      </p>
    );
  }
  const accent = areaAccent(area);
  return (
    <>
      <div
        data-testid="inspector-area"
        className="flex items-center gap-2 rounded-md border border-border-strong px-2.5 py-2"
      >
        <span aria-hidden="true" className={`text-[11px] leading-none ${accent.ink}`}>
          {area.glyph ?? "●"}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink">{area.name}</span>
      </div>
      <p className="text-[12px] leading-snug text-ink-faint">
        Its work happens inside this area and the sandbox refuses a write anywhere else. Outside it,
        an agent can only suggest.
      </p>
    </>
  );
}

/**
 * Dismissing an agent, in two clicks.
 *
 * Two rather than one because this is not reversible in any part: the `grok` process is stopped,
 * the work session is deleted from grok's own history, and the agent's spend record goes with it.
 * A single button beside "Clear the selection" — which is harmless — would put a permanent action
 * one misclick from a routine one.
 *
 * `window.confirm` would do the same job and is worse: it is a modal the page cannot style, cannot
 * word carefully, and cannot show the agent's name inside.
 */
function DismissAgent({ agent, onDelete }: { agent: AgentView; onDelete: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        data-testid="inspector-dismiss"
        onClick={() => setAsking(true)}
        title={`Dismiss ${agent.name}: stop it, delete its conversation, and release its work`}
        className="rounded-md border border-border px-2 py-2 text-center text-[13px] text-ink-faint hover:border-status-failed hover:text-status-failed-ink"
      >
        Dismiss this agent
      </button>
    );
  }

  return (
    <div data-testid="inspector-dismiss-confirm" className="flex flex-col gap-1.5">
      <p className="text-[12px] leading-snug text-ink-faint">
        Stop {agent.name}, delete its conversation from your grok history, and hand back any task it
        is holding. This cannot be undone.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          data-testid="inspector-dismiss-yes"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onDelete().finally(() => setBusy(false));
          }}
          className="flex-1 rounded-md border border-status-failed px-2 py-1.5 text-[13px] text-status-failed-ink disabled:opacity-40"
        >
          {busy ? "Dismissing…" : "Dismiss"}
        </button>
        <button
          type="button"
          data-testid="inspector-dismiss-no"
          disabled={busy}
          onClick={() => setAsking(false)}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-[13px] text-ink-faint hover:bg-surface-hover disabled:opacity-40"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}

/**
 * The agent's instructions, editable here and not only at hire time.
 *
 * It was write-once: a one-line form, filled in before you had watched the agent do anything, and
 * then fixed forever. Watching an agent misread its job and having no way to correct it except
 * deleting and re-hiring is the version of this that shipped.
 *
 * The note about when it applies is not a hedge. The text composes into `rules`, handed over at
 * `session/new`, so a running agent keeps the instructions it started with — saying "saved" and
 * nothing else would have the user watch it go on ignoring the words on its own card.
 */
function Description({ agent, onSave }: { agent: AgentView; onSave: (text: string) => Promise<void> }) {
  const [draft, setDraft] = useState(agent.persona ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Follow the record when a different agent is selected, or when the value changes underneath.
  useEffect(() => {
    setDraft(agent.persona ?? "");
    setSaved(false);
  }, [agent.id, agent.persona]);

  const dirty = draft.trim() !== (agent.persona ?? "").trim();

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        data-testid="inspector-description"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        rows={4}
        placeholder="Nothing yet. Say what this agent is for and it will read it when it next starts."
        aria-label={`What ${agent.name} should do`}
        className="resize-none rounded border border-border bg-surface px-2 py-1.5 text-[13px] leading-snug text-ink placeholder:text-ink-ghost"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="inspector-description-save"
          disabled={!dirty || busy}
          title={dirty ? "Save these instructions" : "Nothing has changed"}
          onClick={() => {
            setBusy(true);
            void onSave(draft)
              .then(() => setSaved(true))
              .finally(() => setBusy(false));
          }}
          className="rounded border border-border-strong bg-surface-active px-2 py-1 text-[12px] text-ink disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span data-testid="inspector-description-saved" className="text-[11px] leading-snug text-ink-faint">
            Saved. It reads this the next time its session starts.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AgentInspector({ projectId, selectionId, onSelect }: WorkspacePageProps) {
  const { agents, areas, vocabulary, deleteAgent, setPersona } = useAgents(projectId);
  const presets = useCapabilityPresets();

  // One selection slot serves two kinds of object on this page — an area id filters the board, an
  // agent id selects a card — so an id that is not an agent is not an error, it is the other kind.
  const agent = agents.find((a) => a.id === selectionId);
  // Called unconditionally: hooks may not sit behind the early return below.
  const spend = useAgentSpend(projectId, agent?.id);
  if (!agent) {
    return (
      <>
        <Label>Agent</Label>
        <p data-testid="inspector-empty" className="text-[13px] leading-snug text-ink-faint">
          {agents.length === 0
            ? "No agents yet. Hire one on a box and its properties appear here."
            : "Pick an agent on the board to see what it may spend on and where it may write."}
        </p>
      </>
    );
  }

  const area = areas.find(
    (a) => a.ownerAgentId === agent.id || (agent.areaId && agent.areaId === a.id),
  );
  const word = vocabulary.statusLabel(agent.status) ?? agent.status.replace(/_/g, " ");
  const stopped = bucketOf(agent.status) === "stopped";

  return (
    <>
      <Label>Agent</Label>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`h-[34px] w-[34px] shrink-0 rounded-lg border ${
            stopped ? "border-border bg-surface-active" : "border-status-working bg-status-working/20"
          }`}
        />
        <span className="min-w-0">
          <span data-testid="inspector-name" className="block truncate text-[17px] text-ink">
            {agent.name}
          </span>
          {/* The role always, the status always as a word. Colour never carries it alone. */}
          <span className="block truncate text-[12px] capitalize text-ink-ghost">
            {agent.role} · {word}
          </span>
        </span>
      </div>

      <Rule />
      <Label>What it should do</Label>
      <Description agent={agent} onSave={(text) => setPersona(agent.id, text)} />

      <Rule />
      <Label>What it can use</Label>
      <CapabilityDial agent={agent} presets={presets} />

      <Rule />
      <Label>Area</Label>
      <AreaRow area={area} />

      <Rule />
      <div data-testid="inspector-spend" className="flex justify-between text-[14px]">
        <span className="text-ink-faint">Spent so far</span>
        <span
          className="font-mono text-[12px]"
          title={
            spend && spend.unpriced > 0
              ? `${spend.unpriced} of ${spend.charges} charges could not be priced, so this is a floor rather than the total.`
              : "Token turns and metered media together."
          }
        >
          {/* The server's figure when it has answered — it is the only view of both ledgers — and
              the record's own token figure until then. Neither is ever a fabricated zero. */}
          {spend ? (
            spend.charges === 0 ? (
              <span className="text-ink-faint">—</span>
            ) : spend.unpriced >= spend.charges ? (
              <span className="text-ink-faint">unknown</span>
            ) : (
              <span className="text-ink">
                ${spend.pricedUsd.toFixed(2)}
                {spend.unpriced > 0 ? "+" : ""}
              </span>
            )
          ) : (
            <Money usd={agent.costUsd} />
          )}
        </span>
      </div>
      {typeof agent.budgetUsd === "number" ? (
        <div className="flex justify-between text-[14px]">
          <span className="text-ink-faint">Its budget</span>
          <span className="font-mono text-[12px] text-ink">${agent.budgetUsd.toFixed(2)}</span>
        </div>
      ) : null}

      <div className="flex-1" />

      {/*
        The conversation is MAIN's, not this column's. `AgentSession.tsx` renders it in place of the
        board when a card is opened, which is where a transcript is readable; a second entry point
        here would be a second conversation surface on one page, and two of anything with one name
        is the defect this page has already deleted twice.
      */}
      <button
        type="button"
        data-testid="inspector-deselect"
        onClick={() => onSelect(undefined)}
        title={`Stop showing ${agent.name}`}
        className="rounded-md border border-border px-2 py-2 text-center text-[13px] text-ink-faint hover:bg-surface-hover"
      >
        Clear the selection
      </button>

      <DismissAgent
        agent={agent}
        onDelete={async () => {
          await deleteAgent(agent.id);
          // The selection would otherwise point at an agent that no longer exists, and the
          // inspector would fall back to "pick an agent" without saying anything happened.
          onSelect(undefined);
        }}
      />
    </>
  );
}
