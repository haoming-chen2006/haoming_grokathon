/**
 * WORKFLOWS — TOOL-008's "executable, or honestly named", and it is the second of the two.
 *
 * §10 wants a workflow to be "customisable agent control logic: a loop, an evolve-loop, a loop that
 * edits its own loop document". What `promptLibrary.ts` persists is a static DAG of named stages
 * with roles and review gates: no loop, no condition, no termination criterion, and nothing that
 * executes it. §10.1 says as much — "the word is the same; the concept is unrelated".
 *
 * §10.2 tells this loop not to build a second engine because grok has one upstream. **That premise
 * did not survive checking.** `grok --help` on 1.0.0 exposes no workflow flag or subcommand and
 * `grok inspect` reports Skills / Agents / Plugins / MCP and no workflows; the only thing bearing
 * the name is a *bundled skill* called `create-workflow`. The evidence is in the handoff §1.4 and
 * §4, flagged for reconciliation.
 *
 * So this section does not pretend. It calls a workflow **a running order**, describes it as
 * something an agent is asked to follow rather than something the workspace runs, and its one real
 * capability is the honest one: hand those stages to an agent as instructions. Nothing here claims
 * a scheduler, a gate that blocks, or a loop that iterates, because none of those exist. Building
 * the UI for a runtime that has not been decided on would be the more expensive mistake.
 */
import { useState } from "react";
import {
  createWorkflow,
  deleteWorkflow,
  updateWorkflow,
  type ProjectWorkflow,
  type WorkflowStage,
} from "./api";
import { Button, Disclosure, EmptyNote, ErrorNote, Field, Mono, ResourceRow, Tag, TextInput } from "./ui";

interface DraftStage {
  id?: string;
  name: string;
  role: string;
  reviewGate: boolean;
}

const EMPTY_STAGE: DraftStage = { name: "", role: "", reviewGate: false };

export function WorkflowsSection({
  workflows,
  reload,
  onInject,
  injectDisabled,
}: {
  workflows: ProjectWorkflow[];
  reload: () => Promise<void>;
  onInject: (kind: "workflow", resource: { id: string; name: string }) => void;
  injectDisabled?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = workflows.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          testId="new-workflow"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setError(null);
          }}
        >
          New running order
        </Button>
        <span className="text-[12px] text-ink-faint">
          The steps a job goes through, and who does each one.
        </span>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {creating ? (
        <WorkflowForm
          onCancel={() => setCreating(false)}
          onSave={async (values) => {
            const created = await createWorkflow(values);
            setCreating(false);
            await reload();
            setSelectedId(created.id);
          }}
        />
      ) : null}

      {workflows.length === 0 && !creating ? (
        <EmptyNote>No running orders yet. Write down the steps you repeat for every job.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          {workflows.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              selected={workflow.id === selectedId}
              onSelect={() => {
                setSelectedId(workflow.id === selectedId ? null : workflow.id);
                setCreating(false);
                setError(null);
              }}
              onDelete={async () => {
                setError(null);
                try {
                  await deleteWorkflow(workflow.id);
                  if (selectedId === workflow.id) setSelectedId(null);
                  await reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          ))}
        </div>
      )}

      {selected ? (
        <WorkflowDetail
          key={selected.id}
          workflow={selected}
          reload={reload}
          onInject={() => onInject("workflow", { id: selected.id, name: selected.name })}
          injectDisabled={injectDisabled}
        />
      ) : null}
    </div>
  );
}

function WorkflowRow({
  workflow,
  selected,
  onSelect,
  onDelete,
}: {
  workflow: ProjectWorkflow;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <ResourceRow
      testId="workflow-row"
      name={workflow.name}
      meta={
        <Tag>
          {workflow.stages.length} step{workflow.stages.length === 1 ? "" : "s"}
        </Tag>
      }
      detail={workflow.stages.map((s) => s.name).join(" → ")}
      selected={selected}
      onSelect={onSelect}
      actions={
        confirming ? (
          <>
            <Button variant="danger" testId="confirm-delete" onClick={onDelete}>
              Delete
            </Button>
            <Button onClick={() => setConfirming(false)}>Keep</Button>
          </>
        ) : (
          <Button testId="delete-workflow" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )
      }
    />
  );
}

function WorkflowForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ProjectWorkflow;
  onSave: (values: {
    name: string;
    description?: string;
    stages: Array<{ id?: string; name: string; role: string; dependsOn?: string[]; reviewGate?: boolean }>;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stages, setStages] = useState<DraftStage[]>(
    initial?.stages.map((s) => ({ id: s.id, name: s.name, role: s.role, reviewGate: s.reviewGate })) ?? [
      { ...EMPTY_STAGE },
    ],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(index: number, next: Partial<DraftStage>) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }

  const usable = stages.filter((s) => s.name.trim() && s.role.trim());

  return (
    <form
      data-testid="workflow-form"
      className="flex flex-col gap-3 rounded border border-border bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          // Each step follows the one before it. A general dependency graph is expressible in the
          // stored model but there is no honest UI for editing one here, and inventing a node
          // editor for a structure nothing executes would be the wrong place to spend it.
          await onSave({
            name,
            stages: usable.map((s, i) => ({
              id: s.id,
              name: s.name.trim(),
              role: s.role.trim(),
              reviewGate: s.reviewGate,
              dependsOn: i > 0 && usable[i - 1].id ? [usable[i - 1].id!] : [],
            })),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Called">
        <TextInput value={name} onChange={setName} placeholder="Client presentation" autoFocus testId="workflow-name" />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">Steps</span>
        {stages.map((stage, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2" data-testid="stage-row">
            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-ghost">{index + 1}</span>
            <div className="min-w-[140px] flex-1">
              <TextInput
                value={stage.name}
                onChange={(v) => patch(index, { name: v })}
                placeholder="Research the client"
                testId={`stage-name-${index}`}
              />
            </div>
            <div className="min-w-[120px] flex-1">
              <TextInput
                value={stage.role}
                onChange={(v) => patch(index, { role: v })}
                placeholder="Researcher"
                testId={`stage-role-${index}`}
              />
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink-faint">
              <input
                type="checkbox"
                checked={stage.reviewGate}
                onChange={(e) => patch(index, { reviewGate: e.target.checked })}
                data-testid={`stage-gate-${index}`}
                className="accent-current"
              />
              Check with me
            </label>
            {stages.length > 1 ? (
              <Button onClick={() => setStages((prev) => prev.filter((_, i) => i !== index))} testId={`remove-stage-${index}`}>
                Remove
              </Button>
            ) : null}
          </div>
        ))}
        <div>
          <Button onClick={() => setStages((prev) => [...prev, { ...EMPTY_STAGE }])} testId="add-stage">
            Add a step
          </Button>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving || !name.trim() || usable.length === 0} testId="save-workflow">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function WorkflowDetail({
  workflow,
  reload,
  onInject,
  injectDisabled,
}: {
  workflow: ProjectWorkflow;
  reload: () => Promise<void>;
  onInject: () => void;
  injectDisabled?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <WorkflowForm
        initial={workflow}
        onCancel={() => setEditing(false)}
        onSave={async (values) => {
          await updateWorkflow(workflow.id, values);
          setEditing(false);
          await reload();
        }}
      />
    );
  }

  return (
    <div data-testid="workflow-detail" className="flex flex-col gap-3 rounded border border-border bg-canvas p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-[14px] text-ink">{workflow.name}</span>
        <Button testId="edit-workflow" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="primary" testId="inject-workflow" disabled={Boolean(injectDisabled)} title={injectDisabled} onClick={onInject}>
          Send to agent
        </Button>
      </div>

      <ol className="flex flex-col gap-1.5">
        {workflow.stages.map((stage: WorkflowStage, i) => (
          <li key={stage.id} className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-ghost">{i + 1}</span>
            <span className="text-ink">{stage.name}</span>
            <Mono className="text-[11px] text-ink-faint">{stage.role}</Mono>
            {stage.reviewGate ? <Tag tone="accent">Checks with you</Tag> : null}
          </li>
        ))}
      </ol>

      {/* The honest note TOOL-008 asks for. The panel does not run this, and says so. */}
      <p className="text-[12px] leading-snug text-ink-faint">
        The workspace does not run these steps on its own. Sending this to an agent hands it the
        list as instructions to work through.
      </p>

      <Disclosure summary="Details" testId="workflow-advanced">
        <p className="text-[12px] text-ink-faint">
          Saved <Mono>{new Date(workflow.createdAt).toLocaleString()}</Mono>
        </p>
        <p className="text-[12px] text-ink-faint">
          Roles: {workflow.roles.length ? workflow.roles.join(", ") : "none named"}
        </p>
      </Disclosure>
    </div>
  );
}
