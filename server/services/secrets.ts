/**
 * Secret detection and redaction (V-048).
 *
 * The control room stores agent transcripts, design documents and messages on disk and shows them
 * in a browser, so a credential that reaches any of those is exposed. Detection is deliberately
 * broad: a false positive costs a redacted string, a false negative leaks a key.
 */

export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

/** Ordered most-specific first, so a recognisable provider key is labelled rather than generic. */
export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "xai-key", pattern: /\bxai-[A-Za-z0-9]{16,}\b/g },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "google-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "private-key-block", pattern: /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/g },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi },
  // KEY=value / "password": "…" style assignments, the common .env leak.
  {
    name: "assigned-secret",
    pattern:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z0-9_]*)\s*[:=]\s*["']?([^\s"',;]{6,})["']?/gi,
  },
  { name: "url-credentials", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]+@/gi },
];

export const REDACTION = "[REDACTED]";

export interface SecretFinding {
  name: string;
  /** Character offset of the match, for pointing at the source. */
  index: number;
  /** A short, non-reversible preview — never the secret itself. */
  preview: string;
}

function preview(match: string): string {
  // Show only enough to identify the shape. Never enough to use.
  const head = match.slice(0, 3);
  return `${head}…(${match.length} chars)`;
}

/** Find secrets without revealing them. */
export function findSecrets(text: string): SecretFinding[] {
  if (!text) return [];
  const findings: SecretFinding[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    // Fresh regex per call — a shared /g regex carries lastIndex between calls.
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      findings.push({ name, index: match.index, preview: preview(match[0]) });
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

export function containsSecret(text: string): boolean {
  return findSecrets(text).length > 0;
}

/**
 * Replace secrets with a marker. For assignment-style matches only the *value* is replaced, so
 * `API_KEY=xxx` becomes `API_KEY=[REDACTED]` — the reader can still see which variable was set.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let result = text;
  for (const { name, pattern } of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    result = result.replace(re, (whole, ...groups) => {
      if (name === "assigned-secret") {
        const key = groups[0];
        return `${key}=${REDACTION}`;
      }
      if (name === "url-credentials") {
        const scheme = whole.slice(0, whole.indexOf("://") + 3);
        return `${scheme}${REDACTION}@`;
      }
      return REDACTION;
    });
  }
  return result;
}

/** A secret was about to be written somewhere it would be exposed. */
export class SecretExposureError extends Error {
  readonly code = "SECRET_EXPOSURE";
  constructor(readonly where: string, readonly findings: SecretFinding[]) {
    super(
      `Refusing to store a credential in ${where}: detected ${findings
        .map((f) => f.name)
        .join(", ")}. Reference it from the environment instead.`,
    );
    this.name = "SecretExposureError";
  }
}

/**
 * Guard a write into durable, user-visible storage — design documents, messages, artifacts.
 * Refuses rather than redacting, because a silently-altered design document is its own problem:
 * the author needs to know their credential did not land.
 */
export function assertNoSecrets(text: string, where: string): void {
  const findings = findSecrets(text);
  if (findings.length > 0) throw new SecretExposureError(where, findings);
}
