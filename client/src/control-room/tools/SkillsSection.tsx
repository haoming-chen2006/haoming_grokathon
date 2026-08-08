/**
 * SKILLS — TOOL-004, TOOL-005, TOOL-006, TOOL-010, and the A-00 finding.
 *
 * A skill here is a **grok skill directory**: `<root>/<name>/SKILL.md`, with `name` and
 * `description` frontmatter and a markdown body. That is not a format this product invented — it is
 * grok's own, verified by probe before any of this was written (`loops/handoff/pivot-tools.md` §1).
 * The consequence the user sees: a skill made here works in the terminal, and skills they already
 * wrote — in `~/.grok/skills/` or `~/.claude/skills/` — are simply *here*, with no import step.
 *
 * **Nothing in the creation path is a filesystem** (TOOL-010). Three fields: what it is called, when
 * to use it, and what to do. No path, no filename, no YAML. The directory it landed in is a fact
 * available under "Details" for the reader who wants it, and invisible otherwise.
 *
 * The middle of the three states is the interesting one. Upstream turn-down is binary — a skill is
 * discovered or it is not — so "listed but inactive" is ours, and it costs nothing: the panel lists
 * from disk while grok is told to skip the directory via `[skills] ignore`. The skill stays here,
 * editable, and reaches no agent. Because that lives in `config.toml`, it survives a reload without
 * this component storing anything.
 */
import { useState } from "react";
import { createSkill, deleteSkill, updateSkill, type GrokSkill, type SkillState } from "./api";
import {
  Button,
  Disclosure,
  EmptyNote,
  ErrorNote,
  Field,
  Mono,
  ResourceRow,
  Tag,
  TextArea,
  TextInput,
} from "./ui";

const SCOPE_LABEL: Record<GrokSkill["scope"], string> = {
  project: "This project",
  user: "All your projects",
  claude: "From Claude Code",
  bundled: "Built in",
};

/**
 * The same check the server enforces, run as you type.
 *
 * The server is the authority and refuses the save; this only decides whether to show the hint
 * early, so the user is not told what is wrong for the first time by a failed submit.
 */
function saysWhen(description: string): boolean {
  const text = description.trim();
  if (text.split(/\s+/).length < 6) return false;
  return /\b(when|whenever|use (this|it|for)|after|before|if the|for (any|a|an)|asks?|wants?|requests?|during)\b/i.test(
    text,
  );
}

export function SkillsSection({
  skills,
  reload,
  onInject,
  injectDisabled,
}: {
  skills: GrokSkill[];
  reload: () => Promise<void>;
  onInject: (kind: "skill", resource: { id: string; name: string }) => void;
  injectDisabled?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  async function guard(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          testId="new-skill"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setError(null);
          }}
        >
          New skill
        </Button>
        <span className="text-[12px] text-ink-faint">
          Something you know that your agents should know too.
        </span>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {creating ? (
        <SkillForm
          onCancel={() => setCreating(false)}
          onSave={async (values) => {
            const created = await createSkill(values);
            setCreating(false);
            await reload();
            setSelectedId(created.id);
          }}
        />
      ) : null}

      {skills.length === 0 && !creating ? (
        <EmptyNote>No skills yet. Write down something you explain to an agent more than once.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              selected={skill.id === selectedId}
              onSelect={() => {
                setSelectedId(skill.id === selectedId ? null : skill.id);
                setCreating(false);
                setError(null);
              }}
              onToggle={(state) => guard(() => updateSkill(skill.id, { state }))}
              onDelete={() =>
                guard(async () => {
                  await deleteSkill(skill.id);
                  if (selectedId === skill.id) setSelectedId(null);
                })
              }
            />
          ))}
        </div>
      )}

      {selected ? (
        <SkillDetail
          key={selected.id}
          skill={selected}
          reload={reload}
          onInject={() => onInject("skill", { id: selected.id, name: selected.name })}
          injectDisabled={injectDisabled}
        />
      ) : null}
    </div>
  );
}

function SkillRow({
  skill,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  skill: GrokSkill;
  selected: boolean;
  onSelect: () => void;
  onToggle: (state: SkillState) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const off = skill.state === "inactive";

  return (
    <ResourceRow
      testId="skill-row"
      name={<Mono>{skill.name}</Mono>}
      meta={
        <>
          {/* Status is a word, never a colour alone — design/mockups/README.md. */}
          <Tag tone={off ? "off" : "accent"} title={off ? "No agent is offered this" : "Agents can use this"}>
            {off ? "Off" : "On"}
          </Tag>
          {skill.scope !== "user" ? <Tag>{SCOPE_LABEL[skill.scope]}</Tag> : null}
        </>
      }
      detail={skill.description || "No description — agents cannot find this one."}
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
          <>
            <Button
              testId="toggle-skill"
              onClick={() => onToggle(off ? "active" : "inactive")}
              title={off ? "Offer this to agents again" : "Keep it here, but stop offering it to agents"}
            >
              {off ? "Turn on" : "Turn off"}
            </Button>
            {skill.editable ? (
              <Button testId="delete-skill" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            ) : null}
          </>
        )
      }
    />
  );
}

function SkillForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: GrokSkill;
  onSave: (values: { name: string; description: string; body: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const weakDescription = description.trim().length > 0 && !saysWhen(description);

  return (
    <form
      data-testid="skill-form"
      className="flex flex-col gap-3 rounded border border-border bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSave({ name, description, body });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      {/* Editing cannot rename: the directory name is the identity grok invokes by, and renaming it
          would silently orphan every agent that already refers to it. */}
      {initial ? null : (
        <Field label="Called" hint="A short name. Spaces become hyphens.">
          <TextInput value={name} onChange={setName} placeholder="Deck conventions" autoFocus testId="skill-name" />
        </Field>
      )}

      <Field
        label="When should an agent use this?"
        hint="This one sentence is how an agent decides to reach for it. Say the occasion, not just the topic."
      >
        <TextArea
          value={description}
          onChange={setDescription}
          rows={2}
          placeholder="Our slide layout and tone rules. Use whenever building a deck or a client presentation."
          testId="skill-description"
        />
      </Field>

      {weakDescription ? (
        <p data-testid="skill-description-hint" className="text-[12px] leading-snug text-status-waiting">
          This says what it is, but not when to use it. An agent matches a task against this
          sentence — without an occasion in it, it will never be chosen.
        </p>
      ) : null}

      <Field label="What to do" hint="Write it as instructions, the way you would brief a person.">
        <TextArea value={body} onChange={setBody} rows={8} placeholder={"# Deck conventions\n\n1. Title slide uses the house template.\n2. No more than six words per bullet."} testId="skill-body" />
      </Field>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={saving || (!initial && !name.trim()) || !description.trim()}
          testId="save-skill"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function SkillDetail({
  skill,
  reload,
  onInject,
  injectDisabled,
}: {
  skill: GrokSkill;
  reload: () => Promise<void>;
  onInject: () => void;
  injectDisabled?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <SkillForm
        initial={skill}
        onCancel={() => setEditing(false)}
        onSave={async ({ description, body }) => {
          await updateSkill(skill.id, { description, body });
          setEditing(false);
          await reload();
        }}
      />
    );
  }

  return (
    <div data-testid="skill-detail" className="flex flex-col gap-3 rounded border border-border bg-canvas p-3">
      <div className="flex items-center gap-2">
        <Mono className="flex-1 truncate text-[14px] text-ink">{skill.name}</Mono>
        {skill.editable ? (
          <Button testId="edit-skill" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : (
          <Tag title="Ships with grok. Editing it here would be lost on the next upgrade.">Built in</Tag>
        )}
        <Button variant="primary" testId="inject-skill" disabled={Boolean(injectDisabled)} title={injectDisabled} onClick={onInject}>
          Send to agent
        </Button>
      </div>

      <p className="text-[13px] leading-snug text-ink-muted">{skill.description}</p>

      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink">
        {skill.body.trim() || "This skill has no instructions yet."}
      </pre>

      {/* TOOL-010: the filesystem lives here and nowhere else. */}
      <Disclosure summary="Details" testId="skill-advanced">
        <p className="text-[12px] text-ink-faint">
          Kept in <Mono className="text-ink-muted">{skill.dir}</Mono>
        </p>
        <p className="text-[12px] text-ink-faint">
          Available to: {SCOPE_LABEL[skill.scope]}
          {skill.state === "inactive" ? " — but currently turned off, so no agent is offered it." : ""}
        </p>
        {skill.resources.length ? (
          <div className="flex flex-col gap-1">
            <p className="text-[12px] text-ink-faint">Other files in this skill:</p>
            <ul className="flex flex-col gap-0.5">
              {skill.resources.map((r) => (
                <li key={r.path} className="text-[12px]">
                  <Mono className="text-ink-muted">{r.path}</Mono>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {Object.keys(skill.extras).length ? (
          <ul className="flex flex-col gap-0.5">
            {Object.entries(skill.extras).map(([key, value]) => (
              <li key={key} className="text-[12px] text-ink-faint">
                <Mono className="text-ink-muted">{key}</Mono>: {value}
              </li>
            ))}
          </ul>
        ) : null}
      </Disclosure>
    </div>
  );
}
