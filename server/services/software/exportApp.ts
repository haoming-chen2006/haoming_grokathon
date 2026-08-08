/**
 * SW-010, SW-015 — taking the app off the platform, with nothing in it that should not leave.
 *
 * Export exists because the honest answer to "can you put this on the internet" is no (§5.7), and a
 * refusal with nothing beside it is a dead end. `app/api/create-zip/route.ts` in `.refs/open-lovable`
 * exists for the same reason, and it is the one place upstream's shape is worth keeping: a
 * non-technical user eventually wants the thing they made, on their own disk, openable by someone
 * else.
 *
 * Two rules the zip enforces:
 *
 *   - **Scan before the file exists, not after.** A zip written and then checked has already been
 *     written; the failure mode is a credential sitting in a file the user is about to email. The
 *     scan runs over the app's files and refuses to produce anything if it finds a key.
 *   - **Ship the app, not the machinery.** `node_modules`, `.git`, `.agents` and `dist` are excluded
 *     — the same set `listAppFiles` walks past — so what extracts is source plus its `package.json`.
 *
 * Where this can and cannot be enforced: an agent is a real `grok` process that edits files with its
 * own tools (contract A-0), so nothing here intercepts a write. This is a checkpoint scan at the
 * boundary the product owns — the moment the app leaves. Refusing at write time is a PreToolUse
 * concern and belongs to 01-agents' `server/services/boundary.ts`, which is why this file makes no
 * attempt at it.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "fs";
import { dirname, join } from "path";
import { findSecrets, type SecretFinding } from "../secrets.ts";
import { canonical, listAppFiles, NOT_THE_APP } from "./assetRepo.ts";
import { spawnDetached } from "./processGroup.ts";

/**
 * 2 MB. Source files are kilobytes; anything larger in an app's tree is an asset, and reading a
 * megabyte of binary as text produces false positives rather than findings. Bounded because the
 * scan runs over every file at every export.
 */
const MAX_SCANNED_BYTES = 2 * 1024 * 1024;

/** 60s. Zipping a source tree takes milliseconds; the bound is so a stuck process is not waited on. */
const ZIP_TIMEOUT_MS = 60_000;

export interface FileSecretFinding {
  /** Path relative to the app's root. Never the secret, and never the line's text. */
  file: string;
  name: string;
  preview: string;
}

export class ExportRefused extends Error {
  constructor(
    message: string,
    /** One sentence for the user, naming what was found and where, but never the value. */
    readonly userMessage: string,
    readonly findings: FileSecretFinding[] = [],
  ) {
    super(message);
    this.name = "ExportRefused";
  }
}

/** True for a file that is not text, so a scan does not report noise from a binary. */
function looksBinary(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 4096);
  for (const byte of sample) if (byte === 0) return true;
  return false;
}

/**
 * Every credential-shaped string in the app's own files.
 *
 * Uses `findSecrets` (`server/services/secrets.ts:52`) unchanged — twelve patterns already called on
 * every document and message write, and a scanner that disagrees with itself between surfaces is
 * worse than one that is too broad.
 */
export function scanAppForSecrets(repoPath: string): FileSecretFinding[] {
  const root = canonical(repoPath);
  const out: FileSecretFinding[] = [];
  for (const rel of listAppFiles(root)) {
    const full = join(root, rel);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue; // a symlink to nowhere is not a secret
    }
    if (!stats.isFile() || stats.size > MAX_SCANNED_BYTES) continue;
    const bytes = readFileSync(full);
    if (looksBinary(bytes)) continue;
    for (const finding of findSecrets(bytes.toString("utf8")) as SecretFinding[]) {
      out.push({ file: rel, name: finding.name, preview: finding.preview });
    }
  }
  return out;
}

export interface ExportResult {
  zipPath: string;
  /** The app's files, relative paths, sorted — what a reader will find inside. */
  files: string[];
  scannedFiles: number;
}

/**
 * Produce a zip of the app at `repoPath`, or refuse and produce nothing.
 *
 * The system `zip` is used rather than a library, because a zip writer would be a runtime
 * dependency in the workspace's own `package.json` — a hot file and a §9 stop. If `zip` is missing,
 * that is said plainly rather than half-worked-around.
 */
export async function exportApp(
  repoPath: string,
  zipPath: string,
  { zipCommand }: { zipCommand?: string } = {},
): Promise<ExportResult> {
  const root = canonical(repoPath);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new ExportRefused(`No app at ${root}`, "There is no app here to export.");
  }

  const files = listAppFiles(root);
  if (files.length === 0) {
    throw new ExportRefused(`${root} has no files`, "This app has no files in it yet, so there is nothing to send.");
  }

  const findings = scanAppForSecrets(root);
  if (findings.length > 0) {
    // Named, and never quoted. The user has to know which file to fix; nobody needs the value
    // repeated into a second place (§5.7, and `secrets.ts`'s own refusal-not-redaction rule).
    const where = [...new Set(findings.map((f) => f.file))];
    throw new ExportRefused(
      `Refusing to export ${root}: ${findings.map((f) => `${f.name} in ${f.file}`).join(", ")}`,
      `This app was not exported because it has what looks like a password or key in ` +
        `${where.length === 1 ? where[0] : `${where.length} files, including ${where[0]}`}. ` +
        `Take it out and keep it somewhere the app reads at runtime, then try again.`,
      findings,
    );
  }

  mkdirSync(dirname(canonical(zipPath)), { recursive: true });
  rmSync(zipPath, { force: true });

  const excludes = [...NOT_THE_APP].map((d) => `-x '${d}/*' '*/${d}/*' '${d}'`).join(" ");
  const command = zipCommand ?? `zip -q -r ${JSON.stringify(zipPath)} . ${excludes}`;
  const child = spawnDetached(command, root);
  let output = "";
  child.stdout.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr.on("data", (d: Buffer) => (output += d.toString()));

  const code = await new Promise<number>((settle) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(-1);
    }, ZIP_TIMEOUT_MS);
    child.on("close", (c: number | null) => {
      clearTimeout(timer);
      settle(c ?? -1);
    });
    child.on("error", () => {
      clearTimeout(timer);
      settle(-1);
    });
  });

  if (code !== 0 || !existsSync(zipPath)) {
    rmSync(zipPath, { force: true });
    const missingTool = /not found|no such file/i.test(output);
    throw new ExportRefused(
      `zip failed in ${root} (exit ${code}): ${output.slice(-1000)}`,
      missingTool
        ? "This computer has no zip program, so the app could not be packed up."
        : "The app could not be packed up, so nothing was saved.",
    );
  }

  return { zipPath, files, scannedFiles: files.length };
}
