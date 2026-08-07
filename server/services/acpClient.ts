import { grokBinaryPath } from "./grokDetect";
import { extractUsage, type TokenUsage } from "./usageAccounting";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

/** JSON-RPC error code Grok returns when no credentials are present. */
export const ACP_AUTH_REQUIRED = -32000;
/** JSON-RPC "method not found" — used to refuse agent→client requests we do not implement. */
export const JSONRPC_METHOD_NOT_FOUND = -32601;

export const ACP_PROTOCOL_VERSION = 1;

/**
 * Launch arguments for Grok Build in ACP mode.
 *
 * Verified against the CLI parser in grok-build:
 *   `--no-auto-update` is a top-level flag on PagerArgs (app/cli.rs:729-730, hidden from --help)
 *   `agent` -> AgentArgs (cli.rs:254) -> AgentCmd::stdio (cli.rs:331)
 *
 * `--always-approve` is required for unattended operation: without it, tool calls block on
 * interactive permission prompts (docs/user-guide/15-agent-mode.md:9-17). Agent options must
 * appear after `agent` and before the mode name (agent-mode.md:57).
 */
export const ACP_ARGS = ["--no-auto-update", "agent", "--always-approve", "stdio"] as const;

export type AcpSessionUpdateKind =
  | "agent_message_chunk"
  | "agent_thought_chunk"
  | "user_message_chunk"
  | "tool_call"
  | "tool_call_update"
  | "plan";

export interface AcpSessionUpdate {
  sessionUpdate: AcpSessionUpdateKind;
  content?: { type: string; text?: string };
  title?: string;
  status?: string;
  toolCallId?: string;
  [key: string]: unknown;
}

export type AcpEvent =
  | { type: "starting"; agentId: string; command: string }
  | { type: "initialized"; agentId: string; protocolVersion: number; agentVersion: string | null; authMethods: string[]; meta: Record<string, unknown> }
  | { type: "auth_required"; agentId: string; authMethods: string[] }
  | { type: "session_created"; agentId: string; sessionId: string }
  | { type: "session_loaded"; agentId: string; sessionId: string }
  | { type: "update"; agentId: string; sessionId: string; update: AcpSessionUpdate }
  | { type: "notification"; agentId: string; method: string; params: unknown }
  | { type: "stderr"; agentId: string; text: string }
  | { type: "failed"; agentId: string; error: string }
  | { type: "disconnected"; agentId: string; code: number | null; signal: string | null };

export class AcpError extends Error {
  constructor(message: string, readonly code: number, readonly data?: unknown) {
    super(message);
    this.name = "AcpError";
  }
  get isAuthRequired(): boolean {
    return this.code === ACP_AUTH_REQUIRED;
  }
}

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}

export interface AcpConnectionOptions {
  agentId: string;
  cwd: string;
  /** Overrides binary resolution. Primarily for tests. */
  binaryPath?: string;
  args?: readonly string[];
  onEvent?: (event: AcpEvent) => void;
  /** Milliseconds to wait for a JSON-RPC response before rejecting. */
  requestTimeoutMs?: number;
}

/**
 * A long-lived ACP connection to one Grok Build process.
 *
 * Deliberately a thin JSON-RPC/NDJSON layer rather than @agentclientprotocol/sdk: the SDK's
 * `client().connectWith(stream, cb)` scopes the connection to a callback that ends the session
 * when it returns, which suits one-shot clients. The control room supervises many persistent
 * agents that must be externally paused, messaged, and stopped, so it needs the connection to
 * outlive any single prompt. Grok's own documented TypeScript client is hand-rolled the same way
 * (docs/user-guide/15-agent-mode.md:224-308).
 */
export class AcpConnection {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private closed = false;
  /** Per-prompt update collectors, active only for the duration of a prompt() call. */
  private promptCollectors = new Set<(event: AcpEvent) => void>();

  readonly agentId: string;
  readonly cwd: string;

  /** Populated after initialize() resolves. */
  protocolVersion: number | null = null;
  agentVersion: string | null = null;
  authMethods: string[] = [];
  sessionId: string | null = null;
  /** Whether the agent advertises `session/load` (ACP loadSession capability). */
  supportsLoadSession = false;

  constructor(private readonly options: AcpConnectionOptions) {
    this.agentId = options.agentId;
    this.cwd = options.cwd;
  }

  private emit(event: AcpEvent): void {
    for (const collect of this.promptCollectors) {
      try {
        collect(event);
      } catch {
        // A collector must never break the event stream for other listeners.
      }
    }
    try {
      this.options.onEvent?.(event);
    } catch (err) {
      logError(`\x1b[38;5;203m[acp]\x1b[0m onEvent handler threw:`, err);
    }
  }

  get isRunning(): boolean {
    return this.proc !== null && !this.closed;
  }

  /** Spawn the agent process. Throws if no grok binary is available. */
  start(): void {
    if (this.proc) throw new Error(`ACP connection for ${this.agentId} already started`);

    const bin = this.options.binaryPath ?? grokBinaryPath();
    if (!bin) {
      const error = "Grok Build is not installed — cannot start an ACP session";
      this.emit({ type: "failed", agentId: this.agentId, error });
      throw new Error(error);
    }

    const args = [...(this.options.args ?? ACP_ARGS)];
    this.emit({ type: "starting", agentId: this.agentId, command: `${bin} ${args.join(" ")}` });

    try {
      this.proc = Bun.spawn([bin, ...args], {
        cwd: this.cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      const error = `Failed to spawn Grok Build: ${err instanceof Error ? err.message : String(err)}`;
      this.emit({ type: "failed", agentId: this.agentId, error });
      throw new Error(error);
    }

    void this.readStdout();
    void this.readStderr();
    void this.watchExit();
  }

  private async readStdout(): Promise<void> {
    const stdout = this.proc?.stdout;
    if (!stdout || typeof stdout === "number") return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stdout as ReadableStream<Uint8Array>) {
        this.buffer += decoder.decode(chunk, { stream: true });
        let idx: number;
        while ((idx = this.buffer.indexOf("\n")) !== -1) {
          const line = this.buffer.slice(0, idx).trim();
          this.buffer = this.buffer.slice(idx + 1);
          if (line) this.handleLine(line);
        }
      }
    } catch (err) {
      if (!this.closed) logError(`\x1b[38;5;203m[acp]\x1b[0m stdout read error:`, err);
    }
  }

  private async readStderr(): Promise<void> {
    const stderr = this.proc?.stderr;
    if (!stderr || typeof stderr === "number") return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stderr as ReadableStream<Uint8Array>) {
        const text = decoder.decode(chunk, { stream: true }).trim();
        if (text) this.emit({ type: "stderr", agentId: this.agentId, text });
      }
    } catch {
      // stderr closing early is not itself an error
    }
  }

  private async watchExit(): Promise<void> {
    if (!this.proc) return;
    const code = await this.proc.exited;
    const signal = (this.proc as any).signalCode ?? null;
    this.closed = true;
    // Fail any in-flight requests so callers are never left hanging on a dead process.
    for (const [, pending] of this.pending) {
      pending.reject(new Error(`Grok Build exited (code=${code} signal=${signal ?? "none"})`));
    }
    this.pending.clear();
    this.emit({ type: "disconnected", agentId: this.agentId, code, signal });
  }

  private handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      // Non-JSON output on stdout is not protocol traffic; surface it rather than dropping it.
      this.emit({ type: "stderr", agentId: this.agentId, text: line });
      return;
    }

    // Response to one of our requests.
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        pending.reject(new AcpError(msg.error.message ?? "ACP error", msg.error.code ?? -1, msg.error.data));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // Request from the agent. Anything we do not implement must be refused explicitly,
    // or the agent blocks waiting for a reply.
    if (msg.id !== undefined && msg.method) {
      this.send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Method not implemented: ${msg.method}` },
      });
      return;
    }

    // Notification.
    if (msg.method) {
      if (msg.method === "session/update" && msg.params?.update) {
        this.emit({
          type: "update",
          agentId: this.agentId,
          sessionId: msg.params.sessionId ?? this.sessionId ?? "",
          update: msg.params.update as AcpSessionUpdate,
        });
      } else {
        this.emit({ type: "notification", agentId: this.agentId, method: msg.method, params: msg.params });
      }
    }
  }

  private send(payload: unknown): void {
    const stdin = this.proc?.stdin;
    if (!stdin || typeof stdin === "number") throw new Error("ACP connection has no stdin");
    (stdin as any).write(JSON.stringify(payload) + "\n");
    (stdin as any).flush?.();
  }

  /** Issue a JSON-RPC request. Rejects with AcpError on a protocol error. */
  request<T = any>(method: string, params: unknown = {}, timeoutOverrideMs?: number): Promise<T> {
    if (this.closed) return Promise.reject(new Error("ACP connection is closed"));
    const id = this.nextId++;
    const timeoutMs = timeoutOverrideMs ?? this.options.requestTimeoutMs ?? 60_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** ACP handshake. Succeeds without credentials. */
  async initialize(): Promise<{ protocolVersion: number; authMethods: string[]; meta: Record<string, unknown> }> {
    const result = await this.request<any>("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });

    this.protocolVersion = result?.protocolVersion ?? null;
    this.supportsLoadSession = result?.agentCapabilities?.loadSession === true;
    const meta = (result?._meta ?? {}) as Record<string, unknown>;
    this.agentVersion = (meta.agentVersion as string) ?? null;
    this.authMethods = (result?.authMethods ?? []).map((m: any) => m?.id ?? String(m));

    this.emit({
      type: "initialized",
      agentId: this.agentId,
      protocolVersion: this.protocolVersion ?? ACP_PROTOCOL_VERSION,
      agentVersion: this.agentVersion,
      authMethods: this.authMethods,
      meta,
    });

    return { protocolVersion: this.protocolVersion ?? ACP_PROTOCOL_VERSION, authMethods: this.authMethods, meta };
  }

  /**
   * Create a session. Requires credentials — emits `auth_required` and rethrows when Grok is
   * not signed in, so the UI can surface a sign-in prompt instead of a generic failure.
   */
  async newSession(
    cwd = this.cwd,
    mcpServers: unknown[] = [],
    opts: { rules?: string } = {},
  ): Promise<string> {
    try {
      const result = await this.request<any>("session/new", {
        cwd,
        mcpServers,
        // `rules` is appended to the system prompt, which is how an agent's persona and assigned
        // skill instructions actually reach the session (agent-mode.md:180, V-042).
        _meta: { yoloMode: true, ...(opts.rules ? { rules: opts.rules } : {}) },
      });
      this.sessionId = result?.sessionId ?? null;
      if (!this.sessionId) throw new Error("session/new returned no sessionId");
      this.emit({ type: "session_created", agentId: this.agentId, sessionId: this.sessionId });
      return this.sessionId;
    } catch (err) {
      if (err instanceof AcpError && err.isAuthRequired) {
        this.emit({ type: "auth_required", agentId: this.agentId, authMethods: this.authMethods });
      } else {
        this.emit({
          type: "failed",
          agentId: this.agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  /**
   * Reattach to a session Grok already persisted to disk (V-007). Only valid when the agent
   * advertises `loadSession` in its initialize capabilities — checked rather than assumed, so an
   * agent build without it fails with a clear message instead of a protocol error.
   *
   * Loading replays the conversation, so the reattached session retains its history. It does not
   * resume any work that was in flight: the design requires that expensive work not restart
   * automatically, so the caller decides what to prompt next.
   */
  async loadSession(sessionId: string, mcpServers: unknown[] = []): Promise<string> {
    if (!this.supportsLoadSession) {
      throw new Error(
        `Agent ${this.agentId} does not advertise the loadSession capability; a session cannot be reopened`,
      );
    }
    try {
      await this.request("session/load", { sessionId, cwd: this.cwd, mcpServers }, 120_000);
      this.sessionId = sessionId;
      this.emit({ type: "session_loaded", agentId: this.agentId, sessionId });
      return sessionId;
    } catch (err) {
      // A session that cannot be reopened must be reported as such, not silently replaced with a
      // fresh one — that would lose the history the user expects to find.
      this.emit({
        type: "failed",
        agentId: this.agentId,
        error: `Could not reopen session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  }

  /**
   * Send a prompt and collect the reply. Returns the assembled `agent_message_chunk` text along
   * with the reasoning and tool activity seen during the turn, so a caller can render a
   * transcript (V-023) or assert on it (V-006).
   *
   * Each connection owns exactly one session, so transcripts cannot bleed between agents.
   */
  async prompt(
    text: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<{
    text: string;
    thoughts: string;
    toolCalls: string[];
    stopReason: string | null;
    /** Exact token counts reported by the agent for this turn (V-045). */
    usage: TokenUsage;
  }> {
    if (!this.sessionId) throw new Error(`Agent ${this.agentId} has no session; call newSession() first`);

    let reply = "";
    let thoughts = "";
    const toolCalls: string[] = [];

    // Collect only this session's updates. The handler is removed in `finally` so a later prompt
    // cannot accumulate output from an earlier one.
    const collector = (event: AcpEvent) => {
      if (event.type !== "update" || event.sessionId !== this.sessionId) return;
      const update = event.update;
      if (update.sessionUpdate === "agent_message_chunk") reply += update.content?.text ?? "";
      else if (update.sessionUpdate === "agent_thought_chunk") thoughts += update.content?.text ?? "";
      else if (update.sessionUpdate === "tool_call" && update.title) toolCalls.push(update.title);
    };

    this.promptCollectors.add(collector);
    try {
      const result = await this.request<any>(
        "session/prompt",
        { sessionId: this.sessionId, prompt: [{ type: "text", text }] },
        opts.timeoutMs ?? 180_000,
      );
      return {
        text: reply.trim(),
        thoughts: thoughts.trim(),
        toolCalls,
        stopReason: result?.stopReason ?? null,
        usage: extractUsage(result?._meta),
      };
    } finally {
      this.promptCollectors.delete(collector);
    }
  }

  /** Terminate the agent process. Idempotent. */
  stop(): void {
    if (!this.proc || this.closed) return;
    this.closed = true;
    try {
      this.proc.kill();
    } catch (err) {
      logError(`\x1b[38;5;203m[acp]\x1b[0m failed to kill ${this.agentId}:`, err);
    }
  }
}

/** Convenience: start a connection and complete the handshake. */
export async function connectAcpAgent(options: AcpConnectionOptions): Promise<AcpConnection> {
  const conn = new AcpConnection(options);
  conn.start();
  await conn.initialize();
  log(`\x1b[38;5;141m[acp]\x1b[0m ${options.agentId} initialized (grok ${conn.agentVersion ?? "?"})`);
  return conn;
}
