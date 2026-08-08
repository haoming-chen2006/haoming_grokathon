/**
 * The panel's small parts — loops/06-tools-and-cost.md §6, design/mockups/README.md.
 *
 * Every colour here is a token class (`bg-surface`, `text-ink-faint`, `border-border`) and never a
 * hex. The palette is real but it lives in `index.css`; a component that writes `#A78BFA` is a
 * component that stays dark when the light theme lands.
 *
 * The other rule these encode is the mockups' last line: **colour never carries a status on its
 * own.** Every state below is a word first — "Off", "Built in", "next session" — and a colour
 * second, so the panel survives being read on a bad projector or by someone who cannot separate
 * the green from the amber.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Prose is Patrick Hand (the `sans` face); identifiers, paths and figures are IBM Plex Mono. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono ${className}`}>{children}</span>;
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">{children}</h2>
  );
}

export function Button({
  children,
  onClick,
  variant = "quiet",
  type = "button",
  disabled,
  title,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  const styles = {
    primary: "border-accent bg-accent/15 text-accent hover:bg-accent/25",
    quiet: "border-border text-ink-muted hover:bg-surface-hover hover:text-ink",
    // Destructive is a word ("Delete") plus a colour, never the colour alone.
    danger: "border-status-failed text-status-failed hover:bg-status-failed/10",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={`rounded border px-2 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-snug text-ink-faint">{hint}</span> : null}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded border border-border bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent";

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  testId,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  testId?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className={`${INPUT_CLASS} ${mono ? "font-mono" : ""}`}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 5,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  testId?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className={`${INPUT_CLASS} resize-y font-mono leading-relaxed`}
    />
  );
}

/**
 * An error the server actually sent, shown as a sentence.
 *
 * Never a status code on its own: the server's messages are written for a reader ("The description
 * must say WHEN to use this skill"), and replacing them with "400" throws away the only part the
 * user can act on.
 */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      data-testid="tools-error"
      className="rounded border border-status-failed bg-status-failed/10 px-2.5 py-1.5 text-[12px] leading-snug text-status-failed"
    >
      {children}
    </p>
  );
}

/** What the panel says when a list is genuinely empty — never over a list that failed to load. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-1 py-6 text-center text-[13px] text-ink-faint">{children}</p>;
}

/**
 * Copy to the clipboard, and say so.
 *
 * The confirmation is the point: a copy button that looks identical before and after leaves the
 * user pasting to find out whether it worked.
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Button
      testId="tools-copy"
      variant={copied ? "primary" : "quiet"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Clipboard access can be refused; the textarea beside it is still selectable, so this
          // reports failure rather than claiming a copy that did not happen.
          setCopied(false);
          return;
        }
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * A row in one of the three lists.
 *
 * One shape for all three sections, because a prompt, a skill and a workflow are the same kind of
 * thing to the user — something they made, that they can open, change or hand to an agent.
 */
export function ResourceRow({
  name,
  meta,
  detail,
  selected,
  onSelect,
  actions,
  testId,
}: {
  name: ReactNode;
  meta?: ReactNode;
  detail?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-selected={selected ? "true" : undefined}
      className={`flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${
        selected ? "bg-surface-active" : "hover:bg-surface-hover"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
        aria-expanded={selected}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14px] text-ink">{name}</span>
          {meta}
        </span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[12px] text-ink-faint">{detail}</span>
        ) : null}
      </button>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/**
 * A small labelled tag. `tone` tints it; the label carries the meaning on its own.
 */
export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "off";
  title?: string;
}) {
  const styles = {
    neutral: "border-border text-ink-ghost",
    accent: "border-accent/50 text-accent",
    off: "border-status-idle text-status-idle",
  }[tone];
  return (
    <span
      title={title}
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] ${styles}`}
    >
      {children}
    </span>
  );
}

/**
 * The advanced disclosure (TOOL-010).
 *
 * Everything a filesystem makes the user think about — the directory a skill landed in, the
 * variable schema behind a prompt — goes in here. Nothing in the default creation path shows a
 * path, a filename or a line of YAML; this is where it is available for the reader who wants it.
 */
export function Disclosure({
  summary,
  children,
  testId,
}: {
  summary: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <details data-testid={testId} className="group">
      <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.06em] text-ink-ghost hover:text-ink-faint">
        <span className="inline-block w-3 group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="mt-2 flex flex-col gap-2 border-l border-border pl-3">{children}</div>
    </details>
  );
}
