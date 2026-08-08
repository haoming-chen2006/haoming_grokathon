/** The parts of GET /api/grok/status the shell needs to decide whether it can run anything. */
export interface GrokStatusView {
  installed: boolean;
  version?: string;
  binaryPath?: string;
  error?: string;
  setupMessage?: string;
}

interface Props {
  status: GrokStatusView | null;
}

/**
 * V-004: a missing or unrunnable Grok Build used to surface only when the user clicked Generate
 * plan and the request failed, which reads as a broken product rather than an unfinished setup.
 * The server already computes the guidance (GROK_SETUP_MESSAGE); this puts it where it is seen
 * before any work is attempted.
 */
export function SetupBanner({ status }: Props) {
  // Null is "not asked yet", not "broken" — warning before the answer arrives would be a lie,
  // and it would flash on every page load.
  if (!status || status.installed) return null;

  return (
    <div
      data-testid="setup-banner"
      role="alert"
      className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
    >
      <div data-testid="setup-banner-headline" className="font-semibold">
        Grok Build is not available — no plan can be generated and no agent can be launched until it is.
      </div>
      {status.error && (
        <div data-testid="setup-banner-error" className="mt-1 text-red-300/80">
          {status.error}
        </div>
      )}
      {status.setupMessage && (
        // Pre-formatted because the guidance is a sequence of indented shell commands; collapsing
        // that whitespace would leave the user with commands they cannot copy.
        <pre
          data-testid="setup-banner-guidance"
          className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-red-200/80"
        >
          {status.setupMessage}
        </pre>
      )}
    </div>
  );
}
