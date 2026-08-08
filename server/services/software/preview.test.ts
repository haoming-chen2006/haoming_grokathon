/**
 * SW-005 — a preview is a process with a lifecycle.
 * SW-006 — a failing preview reports the real error.
 *
 * Every claim about a dev server is tested against a real dev server, because the failures that
 * matter here are process failures: a port that is still held, a grandchild that outlived its
 * parent, a second preview that stopped the first. §8 — reproduce under the conditions where it
 * appeared, and run two previews together rather than one at a time.
 *
 * Ports are never chosen by this file. Vite picks one, announces it, and moves to the next when it
 * is taken; a test that guesses a free port races the other seven worktrees running their gates.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PreviewSupervisor, getPreviewSupervisor, missingPackagesFrom, stopAllPreviews } from "./preview.ts";
import { materializeTemplate } from "./template.ts";
import { waitFor } from "../testSupport.ts";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const evidence: string[] = [];
const temps: string[] = [];
const supervisors: PreviewSupervisor[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function supervisorFor(options: ConstructorParameters<typeof PreviewSupervisor>[0] = {}): PreviewSupervisor {
  const s = new PreviewSupervisor(options);
  supervisors.push(s);
  return s;
}

/** True when nothing is listening on the port, according to the OS rather than to our records. */
function portIsFree(port: number): boolean {
  try {
    Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } }).stop(true);
    return true;
  } catch {
    return false;
  }
}

/** One installed copy of the template; every app directory below is a copy of it. */
let installed = "";

function appCopy(): string {
  const dir = tempDir("preview-app-");
  // cp -R rather than a second install: the install is the slow part and it is the same bytes.
  Bun.spawnSync(["/bin/sh", "-c", `cp -R ${JSON.stringify(installed)}/. ${JSON.stringify(dir)}/`]);
  return dir;
}

beforeAll(() => {
  installed = tempDir("preview-install-");
  materializeTemplate(installed);
  const r = Bun.spawnSync([process.execPath, "install"], { cwd: installed, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`install failed: ${r.stderr.toString()}`);
}, 300_000);

afterAll(async () => {
  await Promise.all(supervisors.map((s) => s.stopAll()));
  await stopAllPreviews();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  if (evidence.length) log(`[SW-005] ${evidence.join(" · ")}`);
});

describe("a preview's lifecycle (SW-005)", () => {
  test("start serves the app, stop frees the port according to the OS", async () => {
    const supervisor = supervisorFor();
    const status = await supervisor.start("asset-life", appCopy());

    expect(status.state).toBe("running");
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(status.port).toBeGreaterThan(0);

    const html = await (await Bun.fetch(status.url!)).text();
    expect(html).toContain('id="app-root"');
    expect(supervisor.status("asset-life")?.state).toBe("running");
    evidence.push(`served ${status.url}`);

    const port = status.port!;
    expect(portIsFree(port)).toBe(false); // the preview really is holding it
    await supervisor.stop("asset-life");

    // `stop` returning means the OS has reaped the process, not that our map lost an entry (§8).
    expect(portIsFree(port)).toBe(true);
    expect(supervisor.status("asset-life")?.state).toBe("stopped");
    expect(supervisor.status("asset-life")?.url).toBeUndefined();
  }, 120_000);

  test("two agents, two apps, two ports, and stopping one leaves the other alone", async () => {
    // Run together, not one after the other: a preview supervisor that passes alone and fails with
    // two running is exactly the failure that matters (§8), and the singleton upstream would fail
    // here on the first line.
    const supervisor = supervisorFor();
    const [a, b] = await Promise.all([
      supervisor.start("asset-a", appCopy()),
      supervisor.start("asset-b", appCopy()),
    ]);

    expect(a.state).toBe("running");
    expect(b.state).toBe("running");
    expect(a.port).not.toBe(b.port);
    evidence.push(`two previews on ${a.port} and ${b.port}`);

    await supervisor.stop("asset-a");
    expect(supervisor.status("asset-a")?.state).toBe("stopped");
    expect(supervisor.status("asset-b")?.state).toBe("running");
    expect(portIsFree(a.port!)).toBe(true);
    expect(portIsFree(b.port!)).toBe(false);
    expect((await Bun.fetch(b.url!)).ok).toBe(true);
  }, 120_000);

  test("starting the same asset twice returns the running preview rather than a second one", async () => {
    const supervisor = supervisorFor();
    const dir = appCopy();
    const first = await supervisor.start("asset-twice", dir);
    const second = await supervisor.start("asset-twice", dir);
    expect(second.port).toBe(first.port!);
    expect(supervisor.list().filter((p) => p.state === "running")).toHaveLength(1);
  }, 120_000);

  test("the cap stops the least recently viewed preview, and says which and why", async () => {
    const supervisor = supervisorFor({ maxConcurrent: 1 });
    const first = await supervisor.start("asset-old", appCopy());
    const second = await supervisor.start("asset-new", appCopy());

    expect(second.state).toBe("running");
    const evicted = supervisor.status("asset-old")!;
    expect(evicted.state).toBe("stopped");
    // Never killed silently: the message names the preview that took its place and the limit.
    expect(evicted.message).toContain("asset-new");
    expect(evicted.message).toMatch(/1 previews? can run at once/);
    expect(evicted.url).toBeUndefined();
    expect(supervisor.list().filter((p) => p.state === "running")).toHaveLength(1);
    // Not `portIsFree(first.port)`: vite takes the lowest free port, so the preview that replaced
    // this one is usually listening on exactly the port it just released. Nor is the reuse itself
    // asserted — with eight worktrees running their gates at once, whether a freed port is still
    // free a moment later is not this code's behaviour. What is claimed is that one preview is
    // left and it serves.
    expect((await Bun.fetch(second.url!)).ok).toBe(true);
    evidence.push(`cap evicted asset-old (${first.port} -> ${second.port})`);
  }, 120_000);

  test("an idle preview stops on its own, and says so", async () => {
    const supervisor = supervisorFor({ idleTimeoutMs: 700 });
    const started = await supervisor.start("asset-idle", appCopy());
    expect(started.state).toBe("running");

    await waitFor("the idle preview to stop itself", () => supervisor.status("asset-idle")?.state === "stopped");
    expect(supervisor.status("asset-idle")?.message).toMatch(/nobody looking at it/);
    await waitFor(`port ${started.port} to be free`, () => portIsFree(started.port!));
    evidence.push("idle timeout stopped a preview");
  }, 120_000);

  test("touching a preview keeps it alive; polling its status does not", async () => {
    // If status() reset the countdown, a client polling every two seconds would keep every preview
    // alive forever and the idle timeout would be decorative.
    const supervisor = supervisorFor({ idleTimeoutMs: 1_000 });
    await supervisor.start("asset-touch", appCopy());

    for (let i = 0; i < 6; i++) {
      supervisor.touch("asset-touch");
      supervisor.status("asset-touch");
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(supervisor.status("asset-touch")?.state).toBe("running");

    await waitFor("the untouched preview to stop", () => supervisor.status("asset-touch")?.state === "stopped", {
      timeoutMs: 10_000,
    });
  }, 120_000);

  test("shutdown leaves no preview running and no port held", async () => {
    const supervisor = supervisorFor();
    const a = await supervisor.start("asset-shutdown-1", appCopy());
    const b = await supervisor.start("asset-shutdown-2", appCopy());

    await supervisor.stopAll("The workspace shut down.");

    expect(supervisor.list().every((p) => p.state === "stopped")).toBe(true);
    expect(portIsFree(a.port!)).toBe(true);
    expect(portIsFree(b.port!)).toBe(true);
    // Idempotent: shutdown paths get called twice more often than they get called once.
    await supervisor.stopAll();
    await stopAllPreviews();
  }, 120_000);

  test("stopping a preview while it is still starting still resolves", async () => {
    // Not a hypothetical: `start` resolves when the dev server announces a URL, so an early stop
    // has to make it resolve some other way or the caller waits forever.
    const supervisor = supervisorFor();
    const starting = supervisor.start("asset-early", appCopy());
    await supervisor.stop("asset-early", "Stopped before it finished starting.");
    const status = await starting;
    expect(["stopped", "running"]).toContain(status.state);
    expect(supervisor.status("asset-early")?.state).toBe("stopped");
  }, 120_000);
});

describe("a preview that cannot work says why (SW-006)", () => {
  test("a missing package is named, from the dev server's own output", async () => {
    const dir = appCopy();
    writeFileSync(
      join(dir, "src", "App.jsx"),
      'import DatePicker from "react-datepicker";\nexport default function App() { return <DatePicker />; }\n',
    );
    const supervisor = supervisorFor();
    const status = await supervisor.start("asset-missing", dir);
    expect(status.state).toBe("running"); // the server starts; the failure is per-request

    // The request is what makes vite resolve the import, exactly as a browser loading the page
    // would. The error then arrives on the channel we own — the child's own stdout/stderr — and
    // not by reading an error overlay out of an iframe we cannot see into.
    await Bun.fetch(new URL("/src/App.jsx", status.url!).href).catch(() => undefined);
    await waitFor("the dev server to report the unresolved import", () =>
      (supervisor.status("asset-missing")?.missingPackages ?? []).includes("react-datepicker"),
    );

    const after = supervisor.status("asset-missing")!;
    expect(after.missingPackages).toEqual(["react-datepicker"]);
    expect(after.output.join("\n")).toContain("Failed to resolve import");
    evidence.push("missing package named from the dev server's own output");
  }, 120_000);

  test("a dev server that dies is failed, with its last words kept", async () => {
    const supervisor = supervisorFor();
    const dir = tempDir("preview-dead-");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "dead", scripts: { dev: "echo 'EADDRINUSE: port taken' >&2; exit 1" } }),
    );
    const status = await supervisor.start("asset-dead", dir);
    expect(status.state).toBe("failed");
    expect(status.output.join("\n")).toContain("EADDRINUSE");
    expect(status.url).toBeUndefined();
  }, 60_000);

  test("a directory with no app to preview is refused, naming what is missing", async () => {
    const supervisor = supervisorFor();
    const empty = await supervisor.start("asset-empty", tempDir("preview-empty-"));
    expect(empty.state).toBe("failed");
    expect(empty.message).toContain('no "dev" script');

    const absent = await supervisor.start("asset-absent", join(tmpdir(), "software-no-such-preview-dir"));
    expect(absent.state).toBe("failed");
    expect(absent.message).toContain("No such directory");
  }, 60_000);

  test("a preview that announces an address off this machine is stopped", async () => {
    // The rule §5.5 states as loopback-only, held by the supervisor rather than by the template's
    // config alone — a config file is something an agent can edit.
    const supervisor = supervisorFor();
    const status = await supervisor.start("asset-exposed", appCopy());
    expect(status.state).toBe("running");
    await supervisor.stop("asset-exposed");

    // A configured command is passed through untouched, which is how this test can ask for the
    // thing the supervisor otherwise makes impossible.
    const exposed = supervisorFor({ command: `${process.execPath} run dev -- --host 0.0.0.0` });
    const result = await exposed.start("asset-exposed-2", appCopy());

    // vite prints "Local: http://localhost:…" before its "Network: http://192.168…" lines, and
    // they can arrive in separate chunks, so `start` can return `running` a few milliseconds before
    // the line that condemns it. The state that matters is the one it settles on.
    await waitFor("the off-machine preview to be stopped", () => {
      const now = exposed.status("asset-exposed-2");
      return now?.state === "failed" || now?.state === "stopped";
    });
    const settled = exposed.status("asset-exposed-2")!;
    expect(settled.message).toMatch(/not this machine/);
    expect(settled.url).toBeUndefined();
    expect(settled.output.join("\n")).toMatch(/Network:/);
    evidence.push("refused a dev server bound off-machine");
    void result;
  }, 120_000);

  test("the detected dev command forces the loopback host, whatever the config says", async () => {
    // An agent is told never to edit vite.config.js, and §8 says an agent will report work it did
    // not do. The one property that must not depend on that file is where the server listens.
    const dir = appCopy();
    writeFileSync(
      join(dir, "vite.config.js"),
      'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n' +
        'export default defineConfig({ plugins: [react()], server: { host: "0.0.0.0" } });\n',
    );
    const supervisor = supervisorFor();
    const status = await supervisor.start("asset-configured-wide", dir);
    expect(status.state).toBe("running");
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(status.output.join("\n")).not.toMatch(/Network:/);
  }, 120_000);

  test("nothing in this area reads an iframe, so nothing here can fail silently", () => {
    // Upstream's whole error detector sits inside a `catch {}` that swallows the cross-origin
    // exception which always fires, so it detects nothing and says nothing (§3.2). The structural
    // guarantee that we cannot ship the same dead code is that this area never touches an iframe.
    // The test file is excluded because it necessarily contains the pattern it searches for —
    // the same exclusion `scripts/audit/quality.mjs` makes for itself.
    const dir = import.meta.dir;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const source = readFileSync(join(dir, file), "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect({ file, hit: /contentDocument|contentWindow|shadowRoot/.test(code) }).toEqual({ file, hit: false });
    }
  });
});

describe("reading a dev server's complaint (SW-006)", () => {
  test("a base package name is recovered from an unresolved import", () => {
    expect(missingPackagesFrom('Failed to resolve import "react-datepicker" from "src/App.jsx"')).toEqual([
      "react-datepicker",
    ]);
    // A scope keeps two segments, a plain name keeps one — §3.4 item 4.
    expect(missingPackagesFrom('Failed to resolve import "@tanstack/react-table/build" from "x"')).toEqual([
      "@tanstack/react-table",
    ]);
    expect(missingPackagesFrom('Failed to resolve import "lodash/debounce" from "x"')).toEqual(["lodash"]);
    // A relative import that does not resolve is a missing file, not a package to install.
    expect(missingPackagesFrom('Failed to resolve import "./Missing.jsx" from "src/App.jsx"')).toEqual([]);
    expect(missingPackagesFrom("nothing to see here")).toEqual([]);
  });

  test("the same package reported twice is listed once", () => {
    const twice = 'Failed to resolve import "a-pkg" from "x"\nFailed to resolve import "a-pkg" from "y"';
    expect(missingPackagesFrom(twice)).toEqual(["a-pkg"]);
  });
});

describe("the process-wide supervisor (SW-014)", () => {
  test("it is one registry of many previews, not one preview", () => {
    // The distinction the reference implementation gets wrong: `global.activeSandbox` is a single
    // sandbox, so creating a second stops the first.
    expect(getPreviewSupervisor()).toBe(getPreviewSupervisor());
    expect(getPreviewSupervisor()).toBeInstanceOf(PreviewSupervisor);

    const source = readFileSync(join(import.meta.dir, "preview.ts"), "utf8");
    // Module-level mutable state, allowed to be exactly one thing: the registry itself.
    const moduleLevelLet = [...source.matchAll(/^let\s+(\w+)/gm)].map((m) => m[1]);
    expect(moduleLevelLet).toEqual(["supervisor"]);
  });

  test("stopAllPreviews is safe before anything has started", async () => {
    await stopAllPreviews();
    expect(existsSync(join(import.meta.dir, "preview.ts"))).toBe(true);
  });
});
