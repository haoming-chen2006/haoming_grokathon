/**
 * SW-015 — export produces something that works.
 * SW-010 — no secret reaches the artifact, at the boundary this surface owns.
 *
 * The clean-room build is the point of SW-015 and is done for real: the zip is extracted somewhere
 * that is not the workspace, installed, and built, with a real exit code. A zip asserted only by its
 * file listing is a zip nobody has opened.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ExportRefused, exportApp, scanAppForSecrets } from "./exportApp.ts";
import { createAssetRepo } from "./assetRepo.ts";
import { runBuild } from "./buildRunner.ts";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const evidence: string[] = [];
const temps: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** The refusal an export threw, so its user-facing sentence can be asserted rather than its guts. */
async function refusalFrom(promise: Promise<unknown>): Promise<ExportRefused> {
  try {
    await promise;
  } catch (error) {
    return error as ExportRefused;
  }
  throw new Error("expected the export to be refused");
}

function sh(cmd: string, cwd: string): { code: number; out: string } {
  const r = Bun.spawnSync(["/bin/sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
}

/**
 * A key that matches `SECRET_PATTERNS` but is not one: `xai-` plus letters, in a file an agent
 * might plausibly write. Planted, never real (§8 — a scanner that cannot fire proves nothing).
 */
const PLANTED_KEY = "xai-AAAABBBBCCCCDDDDEEEEFFFF1234";

let workspace = "";
let asset: Awaited<ReturnType<typeof createAssetRepo>>;

beforeAll(async () => {
  workspace = tempDir("export-workspace-");
  asset = await createAssetRepo(workspace, "deck-picker");
}, 300_000);

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  if (evidence.length) log(`[SW-015] ${evidence.join(" · ")}`);
});

describe("exporting an app (SW-015)", () => {
  test("the zip holds the source and its package.json, and none of the machinery", async () => {
    const out = join(tempDir("export-out-"), "deck-picker.zip");
    const result = await exportApp(asset.repoPath, out);

    expect(existsSync(out)).toBe(true);
    const listing = sh(`unzip -Z1 ${JSON.stringify(out)}`, "/").out.split("\n").filter(Boolean);

    expect(listing).toContain("package.json");
    expect(listing).toContain("src/App.jsx");
    expect(listing).toContain("index.html");
    // The lockfile goes with it: an app that installs the same versions somewhere else is the
    // difference between an export and a pile of source.
    expect(listing).toContain("bun.lock");

    for (const machinery of ["node_modules/", ".git/", ".agents/", "dist/"]) {
      expect({ machinery, present: listing.some((f) => f.startsWith(machinery)) }).toEqual({
        machinery,
        present: false,
      });
    }
    expect(result.files).toEqual(expect.arrayContaining(["package.json", "src/App.jsx"]));
    evidence.push(`zip has ${listing.length} entries`);
  }, 180_000);

  test("what comes out of the zip installs and builds outside the workspace", async () => {
    // The clean room is not under the workspace and has no node_modules above it, so nothing it
    // builds with can have been resolved from the machine it was exported from.
    const out = join(tempDir("export-out-"), "clean-room.zip");
    await exportApp(asset.repoPath, out);

    const room = tempDir("export-cleanroom-");
    expect(sh(`unzip -q ${JSON.stringify(out)} -d ${JSON.stringify(room)}`, "/").code).toBe(0);
    expect(existsSync(join(room, "node_modules"))).toBe(false);

    const install = sh(`${process.execPath} install`, room);
    expect({ code: install.code, out: install.out.slice(-500) }).toMatchObject({ code: 0 });

    const built = await runBuild(room);
    expect({ ok: built.ok, exitCode: built.exitCode }).toEqual({ ok: true, exitCode: 0 });
    expect(existsSync(join(room, "dist", "index.html"))).toBe(true);
    evidence.push(`clean-room build exit=${built.exitCode} in ${built.durationMs}ms`);
  }, 300_000);

  test("an app with nothing in it, or no app at all, is refused rather than zipped empty", async () => {
    const nothing = tempDir("export-nothing-");
    const empty = await refusalFrom(exportApp(nothing, join(tempDir("export-out-"), "x.zip")));
    expect(empty.userMessage).toMatch(/no files in it yet/);

    // The sentence the user reads, not the one for the log: `message` carries the path, and a path
    // is one of the things §5.7 says this product never shows.
    const absent = await refusalFrom(
      exportApp(join(tmpdir(), "software-no-such-app-77c"), join(tempDir("export-out-"), "y.zip")),
    );
    expect(absent.userMessage).toBe("There is no app here to export.");
    expect(absent.userMessage).not.toContain(tmpdir());
  }, 60_000);

  test("a zip that could not be written leaves no half-file behind", async () => {
    const out = join(tempDir("export-out-"), "broken.zip");
    const refusal = await refusalFrom(
      exportApp(asset.repoPath, out, { zipCommand: "echo 'zip: command not found' >&2; exit 127" }),
    );
    expect(refusal.userMessage).toMatch(/no zip program/i);
    expect(existsSync(out)).toBe(false);
  }, 60_000);
});

describe("no secret reaches the artifact (SW-010)", () => {
  test("a planted key is found, named by file and kind, and never quoted back", () => {
    const dir = tempDir("export-secret-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", scripts: {} }));
    writeFileSync(join(dir, "config.js"), `export const key = "${PLANTED_KEY}";\n`);

    const findings = scanAppForSecrets(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: "config.js", name: "xai-key" });
    // The preview identifies the shape and cannot be used: three characters and a length.
    expect(findings[0]!.preview).not.toContain(PLANTED_KEY);
    expect(findings[0]!.preview).toMatch(/^xai…\(\d+ chars\)$/);
  });

  test("the scanner fires on what it claims to catch, and not on ordinary source", () => {
    // A scanner that cannot fail on demand proves nothing, and one that fires on everything gets
    // switched off. Both halves are asserted.
    const dir = tempDir("export-clean-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "App.jsx"), 'export default function App() { return <div>Deck picker</div>; }\n');
    writeFileSync(join(dir, "notes.md"), "The API key lives in the environment, not here.\n");
    expect(scanAppForSecrets(dir)).toEqual([]);
  });

  test("a binary file is skipped rather than reported as noise", () => {
    const dir = tempDir("export-binary-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00, 0x03]));
    expect(scanAppForSecrets(dir)).toEqual([]);
  });

  test("an export is scanned before it exists, and refused with the file named", async () => {
    const dir = tempDir("export-refuse-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "src-config.js"), `const token = "${PLANTED_KEY}";\n`);
    const out = join(tempDir("export-out-"), "leaky.zip");

    let refusal: ExportRefused | undefined;
    try {
      await exportApp(dir, out);
    } catch (error) {
      refusal = error as ExportRefused;
    }

    expect(refusal).toBeInstanceOf(ExportRefused);
    // Refused *before* the file exists: a zip written and then checked has already been written.
    expect(existsSync(out)).toBe(false);
    expect(refusal!.userMessage).toContain("src-config.js");
    expect(refusal!.userMessage).toMatch(/password or key/);
    expect(refusal!.userMessage).not.toContain(PLANTED_KEY);
    // Both patterns fire on `const token = "xai-…"` — the key's own shape and the assignment shape.
    // That is the scanner being deliberately broad (secrets.ts: a false positive costs a redacted
    // string, a false negative leaks a key), and the refusal is not weakened by naming it twice.
    expect(refusal!.findings.map((f) => f.name)).toContain("xai-key");
    evidence.push("export refused on a planted key, before the zip existed");
  }, 60_000);

  test("a secret in the machinery does not block an export of the app", async () => {
    // node_modules is full of test fixtures containing key-shaped strings. Scanning it would make
    // every export fail for a reason the user cannot act on, and a check that always fires is a
    // check that gets turned off.
    const machinery = join(asset.repoPath, "node_modules", ".cache-probe.js");
    writeFileSync(machinery, `const k = "${PLANTED_KEY}";\n`);
    try {
      expect(scanAppForSecrets(asset.repoPath)).toEqual([]);
      const out = join(tempDir("export-out-"), "unaffected.zip");
      await expect(exportApp(asset.repoPath, out)).resolves.toBeTruthy();
    } finally {
      rmSync(machinery, { force: true });
    }
  }, 180_000);
});

describe("what SW-010 does not yet prove", () => {
  test("write-time refusal is not this surface's to make, and is not faked here", () => {
    // SW-010's first clause says assertNoSecrets runs over every file the agent writes. An agent is
    // a real `grok` process that edits files with its own tools (contract A-0), so nothing here can
    // sit in front of that write: refusing at write time is a PreToolUse hook, which is 01-agents'
    // `server/services/boundary.ts`. What this surface owns is the checkpoint — the moment the app
    // leaves — and that is what is asserted above. The clause is held, not approximated.
    const source = readFileSync(join(import.meta.dir, "exportApp.ts"), "utf8");
    expect(source).toContain("boundary.ts");
  });
});
