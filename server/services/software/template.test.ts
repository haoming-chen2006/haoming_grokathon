/**
 * SW-001 — the template builds before any agent touches it.
 *
 * This is the fixture every later item stands on: if the template does not build, every first run
 * becomes a debugging session in a codebase the user cannot read, and every build failure after
 * that is ambiguous between the scaffold and the agent. So the build is asserted here, with no
 * agent and no project anywhere near it, exactly so a later failure is attributable (§8).
 *
 * The install and the build are real: a real `bun install` and a real `vite build` with a real exit
 * code. They are not mocked, because a mocked build cannot fail the way the thing it stands for
 * fails. The cost is ~2s with a warm package cache, ~6s cold, and a network dependency on the first
 * run of a machine; the alternative is a green test that proves nothing, which is the failure mode
 * §8 names. If the install cannot run at all, this test fails loudly with the captured output rather
 * than skipping — a build that could not be run is an honest unknown, and an unknown must never
 * read as a pass.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Subprocess } from "bun";
import { TEMPLATE_SUFFIX, materializeTemplate, templateFiles, templateRoot } from "./template.ts";
import { waitFor } from "../testSupport.ts";

const WORKSPACE_MANIFEST = join(import.meta.dir, "..", "..", "..", "package.json");

/**
 * 120s. An install of 37 packages takes ~3s warm; the bound is for a cold cache on a slow link,
 * and is a bound rather than an absence of one so a hung registry fails the gate instead of
 * holding it open (§5.6, the retry/timeout rule).
 */
const INSTALL_TIMEOUT_MS = 120_000;

type Ran = { code: number | null; ms: number; stdout: string; stderr: string };

async function run(cmd: string[], cwd: string, timeoutMs: number): Promise<Ran> {
  const started = Date.now();
  // process.execPath, not "bun": the test already runs under the interpreter it needs, and
  // depending on PATH means the gate can fail for a reason that has nothing to do with the template.
  const proc = Bun.spawn([process.execPath, ...cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  clearTimeout(timer);
  return { code, ms: Date.now() - started, stdout, stderr };
}

/** The evidence SW-001 asks for, printed once so a gate run is its own reproduction. */
const evidence: string[] = [];
const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

let dir = "";
let manifestBefore = "";
let install: Ran;
let build: Ran;

beforeAll(async () => {
  manifestBefore = readFileSync(WORKSPACE_MANIFEST, "utf8");
  dir = mkdtempSync(join(tmpdir(), "software-template-"));
  materializeTemplate(dir);
  install = await run(["install"], dir, INSTALL_TIMEOUT_MS);
  build = install.code === 0 ? await run(["run", "build"], dir, INSTALL_TIMEOUT_MS) : install;
  evidence.push(`install exit=${install.code} in ${install.ms}ms`);
  evidence.push(`build   exit=${build.code} in ${build.ms}ms`);
}, INSTALL_TIMEOUT_MS * 2 + 10_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  if (evidence.length) log(`[SW-001] ${evidence.join(" · ")}`);
});

describe("the template a software asset starts from (SW-001)", () => {
  test("materialises as an app, with the .tmpl suffix stripped from every file", () => {
    expect(templateFiles()).toEqual([
      ".gitignore",
      "index.html",
      "package.json",
      "src/App.jsx",
      "src/index.css",
      "src/main.jsx",
      "vite.config.js",
    ]);
    for (const rel of templateFiles()) {
      expect(rel).not.toContain(TEMPLATE_SUFFIX);
      expect(existsSync(join(dir, rel))).toBe(true);
    }
  });

  test("an unsuffixed template file is refused, naming the file", () => {
    // Without this the audit-avoiding rule is a convention nobody enforces, and the first `.js`
    // added without the suffix comes back as a reachability orphan in someone else's gate run.
    const bad = mkdtempSync(join(tmpdir(), "software-template-bad-"));
    writeFileSync(join(bad, "stray.js"), "export const x = 1;\n");
    expect(() => templateFiles(bad)).toThrow(/stray\.js.*\.tmpl/s);
    rmSync(bad, { recursive: true, force: true });
  });

  test("a second copy is refused, so an agent's work cannot be overwritten by the scaffold", () => {
    expect(() => materializeTemplate(dir)).toThrow(/Refusing to overwrite/);
  });

  test("installs from a clean copy", () => {
    expect({ code: install.code, stderr: install.stderr.slice(-2000) }).toMatchObject({ code: 0 });
    expect(existsSync(join(dir, "node_modules", "vite"))).toBe(true);
  });

  test("builds with exit code 0 and produces output files", () => {
    expect({ code: build.code, stderr: build.stderr.slice(-2000) }).toMatchObject({ code: 0 });
    expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
    const assets = readdirSync(join(dir, "dist", "assets"));
    expect(assets.some((f) => f.endsWith(".js"))).toBe(true);
    expect(assets.some((f) => f.endsWith(".css"))).toBe(true);
    // An empty bundle is a build that "succeeded" and shipped nothing.
    for (const f of assets) expect(statSync(join(dir, "dist", "assets", f)).size).toBeGreaterThan(0);
  });

  test("the dev server serves the app's own root element on the loopback interface", async () => {
    let dev: Subprocess<"ignore", "pipe", "pipe"> | undefined;
    try {
      const started = Date.now();
      dev = Bun.spawn([process.execPath, "run", "dev"], { cwd: dir, stdout: "pipe", stderr: "pipe" });

      // Read the port off the dev server's own stdout rather than guessing a free one. Guessing
      // races another test or another worktree; the child already knows the answer and prints it.
      // This is the same channel §5.5 makes the error channel, for the same reason: we own it.
      let url = "";
      const reader = (dev.stdout as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let seen = "";
      while (!url) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value, { stream: true });
        url = seen.match(/http:\/\/127\.0\.0\.1:(\d+)\//)?.[0] ?? "";
      }
      expect(seen).not.toContain("0.0.0.0"); // §5.5: loopback, never the local network
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

      // `Bun.fetch`, not the global: bunfig.toml preloads happy-dom for the UI tests, which
      // registers a DOM `fetch` that enforces the same-origin policy and rejects a request to a
      // dev server on another port. The preview is cross-origin from our page too (§5.5) — this is
      // the first place that bites, and it will not be the last.
      const html = await (await Bun.fetch(url)).text();
      const firstByteMs = Date.now() - started;
      expect(html).toContain('id="app-root"');
      evidence.push(`dev ${url} first byte ${firstByteMs}ms`);

      // The port is free afterwards according to the OS, not according to our record of it (§8):
      // `bun run dev` is the parent of the process that actually listens, so "we killed our child"
      // and "nothing is listening" are different claims.
      const port = Number(url.match(/:(\d+)\//)![1]);
      dev.kill();
      await dev.exited;
      await waitFor(`port ${port} to be free`, () => {
        try {
          Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } }).stop(true);
          return true;
        } catch {
          return false;
        }
      });
    } finally {
      dev?.kill();
    }
  }, 60_000);

  test("the template's package.json is its own, and the workspace's is untouched", () => {
    const app = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const workspace = JSON.parse(manifestBefore);
    expect(app.name).not.toBe(workspace.name);
    expect(app.dependencies).toHaveProperty("react");
    // §5.4: the template's dependencies are not ours. Nothing in this loop may add one to the
    // workspace manifest, which is a hot file besides.
    expect(workspace.dependencies ?? {}).not.toHaveProperty("react");
    expect(workspace.dependencies ?? {}).not.toHaveProperty("vite");
    expect(readFileSync(WORKSPACE_MANIFEST, "utf8")).toBe(manifestBefore);
  });

  test("the template is copied, not generated, and lives in one place", () => {
    // A second template doubles the surface that must be robustly tested (§5.4). This asserts
    // there is exactly one, so adding a second is a decision someone has to make on purpose.
    const templatesDir = join(templateRoot(), "..");
    expect(readdirSync(templatesDir).filter((f) => statSync(join(templatesDir, f)).isDirectory())).toEqual([
      "vite-react",
    ]);
  });
});
