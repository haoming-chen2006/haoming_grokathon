/**
 * SW-005, SW-006 — a preview is a process, not a page.
 *
 * Preview is the evidence a non-technical user reads, and software is the only asset type whose
 * artifact cannot be looked at without running something. So this is a process supervisor, and the
 * verbs are the ones `lib/sandbox/types.ts` in `.refs/open-lovable` chose — create, url, terminate,
 * isAlive — because they are the right set for a preview. Everything under them is different: their
 * sandbox is a hosted VM on a public URL with a credential and a per-minute bill, ours is a child
 * process on the user's own machine (§3.5).
 *
 * Four corrections of the reference implementation, each of which is a rule here:
 *
 *   1. **Keyed by asset id from the first line.** `global.activeSandbox` is one sandbox per process,
 *      and creating a second stops the first. That is fine for a single-user demo and fatal for a
 *      product whose first premise is a team of agents (SW-014).
 *   2. **The error channel is the dev server's own stderr.** `components/HMRErrorDetector.tsx` polls
 *      `iframe.contentDocument` for an error overlay inside a `try {} catch {}` that swallows the
 *      cross-origin exception which always fires — so upstream detects nothing, silently. We own the
 *      child process and read what it prints. Nothing in this file touches an iframe.
 *   3. **Loopback only.** Upstream binds `0.0.0.0` because its sandbox has to be reachable from
 *      outside. Ours is the user's laptop, and a dev server on a café network is an outward-facing
 *      surface nobody asked for. A preview that announces a non-loopback address is stopped.
 *   4. **A cap and an idle timeout, and never a silent kill.** A dev server is a few hundred
 *      megabytes; something has to give when the fourth one starts, and the user has to be told
 *      which preview went away and why.
 *
 * A preview is never the gate. The gate is `buildRunner.ts` and its exit code.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import type { ChildProcess } from "child_process";
import { detectScriptCommand } from "./buildRunner.ts";
import { spawnDetached, terminateGroup } from "./processGroup.ts";

export type PreviewState = "starting" | "running" | "failed" | "stopped";

export interface PreviewStatus {
  assetId: string;
  state: PreviewState;
  url?: string;
  port?: number;
  /** The last lines of the dev server's own output, oldest first. */
  output: string[];
  /**
   * Why a preview is failed, or why a running one was stopped. Present whenever the user needs to
   * be told something; absent otherwise. Never a fabricated default (§5.7).
   */
  message?: string;
  /** Packages the dev server said it could not resolve, as base package names, in first-seen order. */
  missingPackages: string[];
  startedAt?: string;
  lastViewedAt?: string;
}

export interface PreviewOptions {
  /**
   * 3. A vite dev server is a few hundred megabytes resident; three is what a laptop running the
   * workspace, an editor and the agents themselves can hold without swapping. The cap exists at all
   * because agents outnumber previews a user is actually looking at.
   */
  maxConcurrent?: number;
  /**
   * 20 minutes. Long enough that a user reading a page, thinking, and coming back does not lose it;
   * short enough that a preview left open overnight is not still resident in the morning.
   */
  idleTimeoutMs?: number;
  /**
   * 90 seconds. A cold vite start on the template is under a second; the bound is for a large app on
   * a loaded machine, and exists so a dev server that will never come up fails rather than leaving a
   * preview "starting" forever.
   */
  startTimeoutMs?: number;
  /** Lines of output kept per preview. §5.5 asks for the last 200. */
  outputLines?: number;
  /** Override the detected dev command. Tests use it; production does not. */
  command?: string;
  /** Called on every state change, so the control-room event is one wiring edit elsewhere (§10). */
  onChange?: (status: PreviewStatus) => void;
}

const DEFAULTS = {
  maxConcurrent: 3,
  idleTimeoutMs: 20 * 60_000,
  startTimeoutMs: 90_000,
  outputLines: 200,
};

/** Hosts a preview may announce. Anything else is the local network, and is refused. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Every http(s) URL a dev server announces, with its host and port. */
function announcedUrls(text: string): Array<{ url: string; host: string; port: number }> {
  return [...text.matchAll(/https?:\/\/(\[[0-9a-f:]+\]|[^\s/:]+):(\d+)\/?/gi)].map((m) => ({
    url: m[0]!,
    host: m[1]!,
    port: Number(m[2]),
  }));
}

/**
 * Base package names from a dev server's "Failed to resolve import" lines.
 *
 * Taken from §3.4 item 4 — the most common failure in this product is an import of a package that
 * is not installed, and it is a package to install rather than an error to show. A scoped name keeps
 * two segments (`@scope/name`), a plain one keeps the first (`name` from `name/sub`), and a relative
 * import is not a package at all.
 */
export function missingPackagesFrom(output: string): string[] {
  const seen: string[] = [];
  for (const match of output.matchAll(/Failed to resolve import ["']([^"']+)["']/g)) {
    const spec = match[1]!;
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    const parts = spec.split("/");
    const base = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
    if (base && !seen.includes(base)) seen.push(base);
  }
  return seen;
}

interface Entry {
  assetId: string;
  child?: ChildProcess;
  state: PreviewState;
  url?: string;
  port?: number;
  output: string[];
  message?: string;
  missing: string[];
  startedAt?: number;
  lastViewedAt: number;
  idleTimer?: ReturnType<typeof setTimeout>;
  exited: Promise<void>;
}

/**
 * One supervisor holds many previews, keyed by asset id.
 *
 * This is the registry the reference implementation does not have, not the singleton it does: there
 * is one *registry* per server process, and any number of previews inside it. Tests construct their
 * own supervisors, so no test shares state with another (SW-014).
 */
export class PreviewSupervisor {
  private readonly previews = new Map<string, Entry>();
  private readonly opts: Required<Omit<PreviewOptions, "command" | "onChange">> &
    Pick<PreviewOptions, "command" | "onChange">;

  constructor(options: PreviewOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * Start a preview of the app in `worktreePath`, or return the one already running for this asset.
   *
   * Resolves once the dev server has announced a URL, failed, or run out of start time — never
   * before, so a caller that gets `running` back has something a user can open.
   */
  async start(assetId: string, worktreePath: string): Promise<PreviewStatus> {
    const existing = this.previews.get(assetId);
    if (existing && (existing.state === "running" || existing.state === "starting")) {
      this.touch(assetId);
      return this.toStatus(existing);
    }

    const cwd = resolve(worktreePath);
    if (!existsSync(cwd)) return this.record(assetId, "failed", `No such directory: ${cwd}`);

    const detected = detectScriptCommand(cwd, "dev", this.opts.command);
    if (!detected) {
      return this.record(
        assetId,
        "failed",
        `Nothing to run: ${cwd} has no "dev" script, so there is no app to preview.`,
      );
    }

    // Registered before the first await, not after the spawn. A `stop` that arrives while this is
    // still starting has to find something to stop; when the entry appeared only after the
    // eviction await, an early stop found nothing, did nothing, and the preview came up anyway.
    let settle: () => void;
    const exited = new Promise<void>((r) => (settle = r));
    const entry: Entry = {
      assetId,
      state: "starting",
      output: [],
      missing: [],
      startedAt: Date.now(),
      lastViewedAt: Date.now(),
      exited,
    };
    this.previews.set(assetId, entry);
    this.opts.onChange?.(this.toStatus(entry));

    // The cap is enforced before spawning, not after: starting a fourth dev server and then
    // stopping one means the machine holds four for a moment, which is the moment it swaps.
    await this.evictUntilBelowCap(assetId);
    if (entry.state === "stopped") {
      settle!();
      return this.toStatus(entry);
    }

    // The host is forced on the command line rather than trusted to the template's vite.config.js,
    // because a config file is something an agent can edit and this is the one property that must
    // not depend on it. `--` is how both bun and npm forward arguments to the script's own command.
    // A configured command is the caller's own and is left exactly as given.
    const command =
      detected.source === "configured" ? detected.command : `${detected.command} -- --host 127.0.0.1`;
    const child = spawnDetached(command, cwd);
    entry.child = child;

    return await new Promise<PreviewStatus>((resolveStart) => {
      let done = false;
      const conclude = (state: PreviewState, message?: string): void => {
        if (done) return;
        done = true;
        clearTimeout(startTimer);
        entry.state = state;
        if (message) entry.message = message;
        if (state === "running") this.armIdleTimer(entry);
        this.opts.onChange?.(this.toStatus(entry));
        resolveStart(this.toStatus(entry));
      };

      const startTimer = setTimeout(() => {
        terminateGroup(child);
        conclude("failed", `The preview did not start within ${this.opts.startTimeoutMs}ms.`);
      }, this.opts.startTimeoutMs);

      const onOutput = (chunk: Buffer): void => {
        const text = chunk.toString();
        this.appendOutput(entry, text);
        for (const found of missingPackagesFrom(text)) {
          if (!entry.missing.includes(found)) entry.missing.push(found);
        }

        const urls = announcedUrls(text);

        // Checked before any URL is accepted, and on every chunk rather than only until the
        // preview is up: vite prints its "Local" line first and its "Network" line after, so a
        // check that stops at the first usable URL would accept a server bound to 0.0.0.0 and
        // never look at the line that says so.
        const offMachine = urls.find((u) => !LOOPBACK.has(u.host));
        if (offMachine && entry.state !== "stopped" && entry.state !== "failed") {
          const why =
            `The preview tried to listen on ${offMachine.host}, which is not this machine. It has ` +
            `been stopped: a preview is only ever reachable from here.`;
          terminateGroup(child);
          if (!done) conclude("failed", why);
          else this.markFailed(entry, why);
          return;
        }

        if (done) return;
        const first = urls[0];
        if (!first) return;
        entry.url = first.url.endsWith("/") ? first.url : `${first.url}/`;
        entry.port = first.port;
        conclude("running");
      };

      child.stdout.on("data", onOutput);
      child.stderr.on("data", onOutput);

      child.on("error", (err: Error) => {
        settle();
        conclude("failed", `Could not start "${command}": ${err.message}`);
      });
      child.on("close", () => {
        settle();
        if (!done) {
          // Stopped while still starting, or dead before it announced anything. The first case
          // must still resolve `start`, or a caller that stopped a starting preview waits forever.
          if (entry.state === "stopped") conclude("stopped", entry.message);
          else conclude("failed", `The preview stopped on its own. ${this.lastLine(entry) ?? ""}`.trim());
          return;
        }
        if (entry.state === "running") {
          // It came up and then died: the state has to follow, or the panel shows a URL that 404s.
          this.markFailed(entry, `The preview stopped on its own. ${this.lastLine(entry) ?? ""}`.trim());
        }
      });
    });
  }

  /**
   * Stop a preview and wait for the process to be gone.
   *
   * Returning means the OS has reaped it, not that our map no longer has an entry — upstream's
   * manager deletes from a `Map` and calls that termination (§8).
   */
  async stop(assetId: string, message?: string): Promise<PreviewStatus | undefined> {
    const entry = this.previews.get(assetId);
    if (!entry) return undefined;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (entry.child && (entry.state === "running" || entry.state === "starting")) {
      entry.state = "stopped";
      entry.message = message;
      terminateGroup(entry.child);
      await entry.exited;
    } else {
      entry.state = "stopped";
      if (message) entry.message = message;
    }
    entry.url = undefined;
    entry.port = undefined;
    this.opts.onChange?.(this.toStatus(entry));
    return this.toStatus(entry);
  }

  /**
   * What a preview is doing, with the tail of its own output.
   *
   * Deliberately does *not* count as viewing. If polling for status reset the idle timer, a client
   * that polls every two seconds would keep every preview alive forever and the timeout would be
   * decorative. The client says "a person is looking at this" by calling `touch`.
   */
  status(assetId: string): PreviewStatus | undefined {
    const entry = this.previews.get(assetId);
    return entry ? this.toStatus(entry) : undefined;
  }

  /** Record that a person is looking at this preview, and restart its idle countdown. */
  touch(assetId: string): void {
    const entry = this.previews.get(assetId);
    if (!entry) return;
    entry.lastViewedAt = Date.now();
    if (entry.state === "running") this.armIdleTimer(entry);
  }

  list(): PreviewStatus[] {
    return [...this.previews.values()].map((e) => this.toStatus(e));
  }

  /** Stop every preview. Idempotent: called from the server's shutdown path (§0 handoff item 2). */
  async stopAll(message?: string): Promise<void> {
    await Promise.all([...this.previews.keys()].map((id) => this.stop(id, message)));
  }

  // ───────────────────────────────────────────────────────────────────── internals

  private live(): Entry[] {
    return [...this.previews.values()].filter((e) => e.state === "running" || e.state === "starting");
  }

  private async evictUntilBelowCap(incomingAssetId: string): Promise<void> {
    // The incoming preview is already registered, so it is excluded from both the count and the
    // candidates — otherwise a cap of one would evict the very preview it was making room for.
    const others = (): Entry[] => this.live().filter((e) => e.assetId !== incomingAssetId);
    while (others().length >= this.opts.maxConcurrent) {
      // Least recently viewed goes first — the one nobody is looking at.
      const victim = others().sort((a, b) => a.lastViewedAt - b.lastViewedAt)[0]!;
      // Awaited, so the machine never holds cap + 1 dev servers at once — which is the moment it
      // would swap, and the reason the cap exists.
      await this.stop(
        victim.assetId,
        `Stopped to make room for the preview of ${incomingAssetId}. ` +
          `${this.opts.maxConcurrent} previews can run at once; this was the one you had not looked ` +
          `at for longest. Open it again whenever you like.`,
      );
      // stop() is awaited by its own callers; here the entry is already out of `live()` because its
      // state changed synchronously, which is what the loop needs.
      if (others().includes(victim)) break; // defensive: never spin
    }
  }

  private armIdleTimer(entry: Entry): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      void this.stop(
        entry.assetId,
        `Stopped after ${Math.round(this.opts.idleTimeoutMs / 60_000)} minutes with nobody looking ` +
          `at it. Open it again to start it back up.`,
      );
    }, this.opts.idleTimeoutMs);
    entry.idleTimer.unref?.();
  }

  private appendOutput(entry: Entry, text: string): void {
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      entry.output.push(line);
    }
    if (entry.output.length > this.opts.outputLines) {
      entry.output.splice(0, entry.output.length - this.opts.outputLines);
    }
  }

  private markFailed(entry: Entry, message: string): void {
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.state = "failed";
    entry.message = message;
    entry.url = undefined;
    entry.port = undefined;
    this.opts.onChange?.(this.toStatus(entry));
  }

  private lastLine(entry: Entry): string | undefined {
    return entry.output[entry.output.length - 1];
  }

  private record(assetId: string, state: PreviewState, message: string): PreviewStatus {
    const entry: Entry = {
      assetId,
      state,
      output: [],
      missing: [],
      message,
      lastViewedAt: Date.now(),
      exited: Promise.resolve(),
    };
    this.previews.set(assetId, entry);
    this.opts.onChange?.(this.toStatus(entry));
    return this.toStatus(entry);
  }

  private toStatus(entry: Entry): PreviewStatus {
    return {
      assetId: entry.assetId,
      state: entry.state,
      ...(entry.url ? { url: entry.url } : {}),
      ...(entry.port ? { port: entry.port } : {}),
      output: [...entry.output],
      ...(entry.message ? { message: entry.message } : {}),
      missingPackages: [...entry.missing],
      ...(entry.startedAt ? { startedAt: new Date(entry.startedAt).toISOString() } : {}),
      lastViewedAt: new Date(entry.lastViewedAt).toISOString(),
    };
  }
}

let supervisor: PreviewSupervisor | undefined;

/** The server process's supervisor. One registry, many previews. */
export function getPreviewSupervisor(): PreviewSupervisor {
  supervisor ??= new PreviewSupervisor();
  return supervisor;
}

/**
 * Stop every preview this process started.
 *
 * Called once from the server's shutdown path: a preview is a child process, and a server that
 * exits without killing it leaves a dev server holding a port until the machine reboots (§0).
 */
export async function stopAllPreviews(): Promise<void> {
  if (!supervisor) return;
  await supervisor.stopAll("The workspace shut down.");
}
