import { spawnSync } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

/** Where the resolved `grok` binary came from, in resolution order. */
export type GrokBinarySource = "local" | "grok-home" | "path";

export interface GrokDetection {
  installed: boolean;
  binaryPath: string | null;
  /** Semantic version, e.g. "0.2.118". */
  version: string | null;
  /** Build commit reported alongside the version, e.g. "1e1687c1cf6a". */
  commit: string | null;
  /** Unparsed `--version` output, retained as evidence. */
  raw: string | null;
  source: GrokBinarySource | null;
  /** Why detection failed. Null when installed. */
  error: string | null;
  /** Actionable operator guidance. Null when installed. */
  setupMessage: string | null;
}

/**
 * The npm package that ships prebuilt per-platform binaries. Grok Build's source
 * (github.com/xai-org/grok-build) is Rust and needs a toolchain to compile, so the
 * npm distribution is the supported way to obtain a runnable binary.
 */
export const GROK_NPM_PACKAGE = "@xai-official/grok";

export const GROK_SETUP_MESSAGE = [
  `Grok Build was not found.`,
  ``,
  `Install it as a project dependency:`,
  `    bun add ${GROK_NPM_PACKAGE}`,
  ``,
  `Or install it globally and ensure it is on your PATH:`,
  `    npm install -g ${GROK_NPM_PACKAGE}`,
  ``,
  `Verify with:`,
  `    grok --version`,
].join("\n");

/** `grok 0.2.118 (1e1687c1cf6a)` -> version + commit. Commit is optional. */
export function parseGrokVersion(raw: string): { version: string | null; commit: string | null } {
  const text = raw.trim();
  const version = text.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null;
  const commit = text.match(/\(([0-9a-f]{7,40})\)/i)?.[1] ?? null;
  return { version, commit };
}

/**
 * Candidate binary locations, most specific first. A project-local install wins so the
 * control room is pinned to the version recorded in package.json rather than whatever
 * happens to be on the operator's PATH.
 */
export function grokBinaryCandidates(binaryName = "grok"): Array<{ path: string; source: GrokBinarySource }> {
  const repoRoot = join(import.meta.dir || __dirname, "..", "..");
  const grokHome = process.env.GROK_HOME ?? join(homedir(), ".grok");
  return [
    { path: join(repoRoot, "node_modules", ".bin", binaryName), source: "local" },
    { path: join(grokHome, "bin", binaryName), source: "grok-home" },
    { path: binaryName, source: "path" },
  ];
}

function probe(path: string): { ok: boolean; raw: string } {
  try {
    const result = spawnSync([path, "--version"], { stdout: "pipe", stderr: "pipe" });
    const raw = result.stdout.toString().trim() || result.stderr.toString().trim();
    return { ok: result.exitCode === 0 && raw.length > 0, raw };
  } catch {
    return { ok: false, raw: "" };
  }
}

/**
 * Detect Grok Build. Never throws — a missing binary is a reported state, not an error,
 * so the UI can render a setup message instead of failing to load (V-004).
 */
export function detectGrok(binaryName = "grok"): GrokDetection {
  const missing: GrokDetection = {
    installed: false,
    binaryPath: null,
    version: null,
    commit: null,
    raw: null,
    source: null,
    error: `\`${binaryName}\` executable not found`,
    setupMessage: GROK_SETUP_MESSAGE,
  };

  for (const candidate of grokBinaryCandidates(binaryName)) {
    // A bare name is resolved by the OS via PATH; explicit paths must exist first.
    if (candidate.source !== "path" && !existsSync(candidate.path)) continue;

    const { ok, raw } = probe(candidate.path);
    if (!ok) continue;

    const { version, commit } = parseGrokVersion(raw);
    return {
      installed: true,
      binaryPath: candidate.path,
      version,
      commit,
      raw,
      source: candidate.source,
      error: null,
      setupMessage: null,
    };
  }

  return missing;
}

let cached: GrokDetection | null = null;

/** Cached detection for hot paths. Pass refresh to re-probe after an install. */
export function getGrokDetection(refresh = false): GrokDetection {
  if (!cached || refresh) {
    cached = detectGrok();
    if (cached.installed) {
      log(`\x1b[38;5;141m[grok]\x1b[0m Detected grok ${cached.version ?? "?"} (${cached.source}) at ${cached.binaryPath}`);
    } else {
      log(`\x1b[38;5;245m[grok]\x1b[0m Grok Build not found — agent features unavailable`);
    }
  }
  return cached;
}

/** Resolved binary path, or null when Grok Build is unavailable. */
export function grokBinaryPath(): string | null {
  return getGrokDetection().binaryPath;
}
