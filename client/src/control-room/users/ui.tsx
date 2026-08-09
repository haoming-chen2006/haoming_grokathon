/**
 * The small pieces the three regions share.
 *
 * Every colour here resolves through 07-shell's token layer — `text-ink-faint`, `border-border`,
 * `bg-status-waiting` — and no white-at-an-opacity utility appears anywhere in this directory.
 * That is §3.8's fourth rule and it is not a style preference: seven such opacities are what make
 * the existing control room impossible to light-theme, because there is no mechanical light
 * equivalent of an opacity. White at 40% on black and black at 40% on white are different
 * perceptual contrasts, so both ends of each step have to be chosen, which is what the four `ink`
 * steps are. This page is new code and has no excuse to reintroduce the problem.
 *
 * The utility is deliberately not spelled out above. USR-010's proof is a grep for it over this
 * directory expecting no output, and a prose mention would fail a check whose whole value is that
 * it is mechanical.
 */
import type { ReactNode } from "react";

/** Mono, small, tracked, quiet. The shell's own region-heading treatment, matched deliberately. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">
      {children}
    </div>
  );
}

/** Initials, because there are no avatars — and no identity to hang one on (§3.1). */
export function Avatar({ name, muted, size = 28 }: { name: string; muted?: boolean; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full border text-[11px] ${
        muted ? "border-border text-ink-ghost" : "border-border-strong text-ink-faint"
      }`}
    >
      {initials}
    </span>
  );
}

/**
 * A capability, granted or not.
 *
 * Both states are always rendered, for all four capabilities, on every row. Showing only what a
 * person holds would make "Marco has no video" invisible — an absence you have to notice is an
 * absence you do not notice, and video is the grant this page exists to make deliberate.
 *
 * The two states differ in border style as well as in weight, so the distinction survives a
 * grayscale screenshot and a reader who does not separate the two inks.
 */
export function CapabilityPill({
  label,
  granted,
  title,
}: {
  label: string;
  granted: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      data-granted={granted}
      className={
        granted
          ? "rounded-full border border-border-strong px-2 py-0.5 text-[12px] text-ink-muted"
          : "rounded-full border border-dashed border-border px-2 py-0.5 text-[12px] text-ink-ghost"
      }
    >
      {granted ? label : `no ${label}`}
    </span>
  );
}

/** Dollars, mono, two places. One formatter so two regions cannot disagree about $50 vs $50.00. */
export const usd = (n: number): string => `$${n.toFixed(2)}`;

export function Money({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] text-ink-muted">{children}</span>;
}
