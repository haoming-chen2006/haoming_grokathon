/**
 * PROMPTS — loops/06-tools-and-cost.md TOOL-002, TOOL-005, grok-workspace.md §10.
 *
 * A prompt is "simple copy-and-paste text, a single line". What `promptLibrary.ts` already holds is
 * richer than that — a body with `{variable}` placeholders, a declared schema, and a render that
 * raises rather than emitting a hole — and §10.1's instruction is to **keep the engine and make the
 * default creation path a single textarea with no variables.** That is exactly the shape here: the
 * new-prompt form is a name and a body, nothing else, and variables are something that happens to
 * you only if you type a `{placeholder}`.
 *
 * Rendering goes to the server (`POST /prompts/:id/render`). The rule that a required variable with
 * no value is an error rather than a silent hole lives in `renderPrompt`, and re-implementing it
 * here would be a second place for it to be wrong.
 */
import { useState } from "react";
import {
  LibraryError,
  createPrompt,
  deletePrompt,
  renderPrompt,
  updatePrompt,
  type PromptTemplate,
} from "./api";
import {
  Button,
  CopyButton,
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

/**
 * The placeholders a body references, derived in the browser for display only.
 *
 * Mirrors `referencedVariables` on the server. Duplicated deliberately and narrowly: this drives
 * which input boxes to draw as you type, which cannot wait for a round trip, while the server stays
 * the only thing that decides whether a render is legal.
 */
export function referencedVariables(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export function PromptsSection({
  prompts,
  reload,
  onInject,
  injectDisabled,
}: {
  prompts: PromptTemplate[];
  reload: () => Promise<void>;
  onInject: (kind: "prompt", resource: { id: string; name: string }, values?: Record<string, string>) => void;
  injectDisabled?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = prompts.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          testId="new-prompt"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setError(null);
          }}
        >
          New prompt
        </Button>
        <span className="text-[12px] text-ink-faint">
          Text you reuse. Hand it to an agent, or copy it.
        </span>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {creating ? (
        <PromptForm
          onCancel={() => setCreating(false)}
          onSave={async ({ name, body }) => {
            const created = await createPrompt({ name, body });
            setCreating(false);
            await reload();
            setSelectedId(created.id);
          }}
        />
      ) : null}

      {prompts.length === 0 && !creating ? (
        <EmptyNote>No prompts yet. The first one can be a single sentence.</EmptyNote>
      ) : (
        <div className="overflow-hidden rounded border border-border">
          {prompts.map((prompt) => (
            <PromptRow
              key={prompt.id}
              prompt={prompt}
              selected={prompt.id === selectedId}
              onSelect={() => {
                setSelectedId(prompt.id === selectedId ? null : prompt.id);
                setCreating(false);
                setError(null);
              }}
              onDelete={async () => {
                try {
                  await deletePrompt(prompt.id);
                  if (selectedId === prompt.id) setSelectedId(null);
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
        <PromptDetail
          key={selected.id}
          prompt={selected}
          reload={reload}
          onInject={(values) => onInject("prompt", { id: selected.id, name: selected.name }, values)}
          injectDisabled={injectDisabled}
        />
      ) : null}
    </div>
  );
}

function PromptRow({
  prompt,
  selected,
  onSelect,
  onDelete,
}: {
  prompt: PromptTemplate;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const variables = referencedVariables(prompt.body);

  return (
    <ResourceRow
      testId="prompt-row"
      name={prompt.name}
      meta={
        variables.length ? (
          <Tag title={variables.join(", ")}>
            {variables.length} variable{variables.length === 1 ? "" : "s"}
          </Tag>
        ) : null
      }
      detail={prompt.body}
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
          // Two steps, because delete is the one action in this panel that cannot be undone.
          <Button testId="delete-prompt" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )
      }
    />
  );
}

function PromptForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: PromptTemplate;
  onSave: (values: { name: string; body: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const variables = referencedVariables(body);

  return (
    <form
      data-testid="prompt-form"
      className="flex flex-col gap-3 rounded border border-border bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          await onSave({ name, body });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      {/* TOOL-002: two fields. No variable editor, no schema, no JSON. */}
      <Field label="Called">
        <TextInput value={name} onChange={setName} placeholder="Weekly status update" autoFocus testId="prompt-name" />
      </Field>
      <Field
        label="Text"
        hint="Write it as you would say it. To leave a blank to fill in later, put a word in {braces}."
      >
        <TextArea value={body} onChange={setBody} placeholder="Summarise what changed this week." testId="prompt-body" />
      </Field>

      {variables.length ? (
        <p className="text-[12px] text-ink-faint">
          You will be asked for{" "}
          {variables.map((v, i) => (
            <span key={v}>
              {i > 0 ? ", " : ""}
              <Mono className="text-accent">{v}</Mono>
            </span>
          ))}{" "}
          each time this is used.
        </p>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={saving || !name.trim() || !body.trim()} testId="save-prompt">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function PromptDetail({
  prompt,
  reload,
  onInject,
  injectDisabled,
}: {
  prompt: PromptTemplate;
  reload: () => Promise<void>;
  onInject: (values: Record<string, string>) => void;
  injectDisabled?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const variables = referencedVariables(prompt.body);

  if (editing) {
    return (
      <PromptForm
        initial={prompt}
        onCancel={() => setEditing(false)}
        onSave={async ({ name, body }) => {
          await updatePrompt(prompt.id, { name, body });
          setEditing(false);
          setRendered(null);
          await reload();
        }}
      />
    );
  }

  async function fill() {
    setError(null);
    setMissing([]);
    try {
      const { rendered: text } = await renderPrompt(prompt.id, values);
      setRendered(text);
    } catch (err) {
      setRendered(null);
      if (err instanceof LibraryError) {
        setError(err.message);
        setMissing(err.missing ?? []);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  return (
    <div data-testid="prompt-detail" className="flex flex-col gap-3 rounded border border-border bg-canvas p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-[14px] text-ink">{prompt.name}</span>
        <Button testId="edit-prompt" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      {variables.length ? (
        <div className="flex flex-col gap-2">
          {variables.map((variable) => (
            <Field key={variable} label={variable}>
              <TextInput
                value={values[variable] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [variable]: v }))}
                placeholder={missing.includes(variable) ? "Needed" : ""}
                testId={`variable-${variable}`}
              />
            </Field>
          ))}
          <div>
            <Button variant="primary" onClick={fill} testId="fill-prompt">
              Fill it in
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {/* With no variables there is nothing to resolve, so the body IS the finished text. */}
      {rendered ?? (variables.length === 0 ? prompt.body : null) ? (
        <div className="flex flex-col gap-2">
          <pre
            data-testid="prompt-rendered"
            className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink"
          >
            {rendered ?? prompt.body}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={rendered ?? prompt.body} />
            <Button
              variant="primary"
              testId="inject-prompt"
              disabled={Boolean(injectDisabled)}
              title={injectDisabled}
              onClick={() => onInject(values)}
            >
              Send to agent
            </Button>
          </div>
        </div>
      ) : null}

      <Disclosure summary="Details" testId="prompt-advanced">
        <p className="text-[12px] text-ink-faint">
          Saved <Mono>{new Date(prompt.createdAt).toLocaleString()}</Mono>
        </p>
        {prompt.variables.length ? (
          <ul className="flex flex-col gap-1">
            {prompt.variables.map((v) => (
              <li key={v.name} className="text-[12px] text-ink-faint">
                <Mono className="text-ink-muted">{v.name}</Mono>
                {v.required ? " — required" : ` — optional, defaults to "${v.default ?? ""}"`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-ink-faint">No blanks to fill in.</p>
        )}
      </Disclosure>
    </div>
  );
}
