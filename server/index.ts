import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { apiRoutes } from "./routes/api";
import { mcpRoutes } from "./routes/mcp";
import { sessions, restoreSessions, autoResumeSessions } from "./services/sessionManager";
import { saveState, migrateStateToHome } from "./services/persistence";
import { setAuthBroadcast } from "./services/sessionStartQueue";
import { getControlRoomBus } from "./services/controlRoomEvents";
import type { WebSocketData } from "./types";

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;
const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

const MAX_HISTORY_BYTES = 512 * 1024;

function buildReplayHistory(outputBuffer: string[]): string {
  let history = "";
  let totalBytes = 0;

  for (let i = outputBuffer.length - 1; i >= 0; i--) {
    const chunk = outputBuffer[i];
    if (totalBytes + chunk.length > MAX_HISTORY_BYTES) {
      break;
    }
    history = chunk + history;
    totalBytes += chunk.length;
  }

  if (history.length > 0) {
    history = "\x1b[0m" + history;
  }

  return history;
}

// Middleware
app.use("*", cors({ origin: ["http://localhost:6968", "http://localhost:6969"] }));

// API Routes
app.route("/api", apiRoutes);
// Project MCP server over HTTP, reachable by Grok agents (V-028).
app.route("/mcp", mcpRoutes);

// Serve static files (no-cache on index.html so browser always gets fresh asset references)
app.use("/*", serveStatic({
  root: "./client/dist",
  onFound: (path, c) => {
    if (path.endsWith("index.html")) {
      c.header("Cache-Control", "no-cache");
    }
  },
}));

/**
 * History fallback, so a workspace URL survives being typed or reloaded.
 *
 * The shell routes on real paths (`/agents`, `/assets`, `/designdocs`) with `history.pushState`
 * rather than a query parameter — see `client/src/control-room/shell/router.ts`. Static serving
 * answers those with 404, because no such file exists, so every workspace page 404'd on first load
 * and only worked if you arrived by clicking. No worktree filed this: each one owned a page and saw
 * its own route working under `bun run dev`, where Vite supplies the fallback for free.
 *
 * Anything with a dot in its last segment is a real asset request and must keep its 404 — a missing
 * bundle silently answered with HTML is a blank page and a console error rather than a clear miss.
 */
app.get("/*", async (c) => {
  const path = new URL(c.req.url).pathname;
  // An unmounted API route must 404, not answer with the shell. Serving HTML from /api makes a
  // missing endpoint look like a working one that returned something odd, and the caller debugs
  // its JSON parser instead of reading the route table. Found exactly that way: /api/design-docs
  // answered 200 with the index page while its router did not exist.
  if (/^\/(api|mcp|ws)(\/|$)/.test(path)) return c.notFound();
  if (path.split("/").pop()?.includes(".")) return c.notFound();
  const index = Bun.file("./client/dist/index.html");
  if (!(await index.exists())) return c.notFound();
  c.header("Cache-Control", "no-cache");
  return c.html(await index.text());
});

// Restore sessions BEFORE starting server so API requests find populated sessions Map
const migrationResult = migrateStateToHome();
if (migrationResult.migrated) {
  log(`\x1b[38;5;82m[migration]\x1b[0m Migrated state from ${migrationResult.source}`);
}
restoreSessions();

// Control-room subscribers, keyed by socket so each can be torn down on close.
const controlRoomUnsubscribers = new WeakMap<object, () => void>();

// WebSocket server
Bun.serve<WebSocketData>({
  port: PORT,
  // Loopback by default. The server exposes repository and agent control with no authentication,
  // so binding every interface would put those on the network. Opt in explicitly for remote use
  // (e.g. behind SSH port-forwarding) with OPENUI_HOST=0.0.0.0.
  hostname: process.env.OPENUI_HOST || "127.0.0.1",
  fetch(req, server) {
    const url = new URL(req.url);

    // Control-room status channel: pushes agent/task/progress/cost events so the UI updates
    // without a page refresh (V-019).
    if (url.pathname === "/ws/control-room") {
      const projectId = url.searchParams.get("projectId");
      if (!projectId) return new Response("projectId required", { status: 400 });
      const upgraded = server.upgrade(req, {
        data: { sessionId: "", lastSeq: 0, channel: "control-room", projectId },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found", { status: 404 });

      const lastSeq = Number(url.searchParams.get("lastSeq")) || 0;
      const upgraded = server.upgrade(req, { data: { sessionId, lastSeq } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      if (ws.data.channel === "control-room") {
        const projectId = ws.data.projectId!;
        const unsubscribe = getControlRoomBus().subscribe(projectId, (published) => {
          try {
            if (ws.readyState === 1) ws.send(JSON.stringify(published));
          } catch {}
        });
        controlRoomUnsubscribers.set(ws, unsubscribe);
        log(`\x1b[38;5;245m[ws]\x1b[0m Control room connected to ${projectId}`);
        // Replay recent events so a client that connects mid-flight is not blind.
        for (const published of getControlRoomBus().history(projectId)) {
          try {
            ws.send(JSON.stringify(published));
          } catch {}
        }
        return;
      }

      const { sessionId, lastSeq } = ws.data;
      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId} (lastSeq=${lastSeq}, serverSeq=${session.outputSeq})`);
      session.clients.add(ws);

      if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Spawn Fresh\" to start a new session.\x1b[0m\r\n",
          seq: session.outputSeq,
        }));
      } else if (lastSeq > 0 && lastSeq === session.outputSeq) {
        // Client cache is up to date — skip buffer replay
        log(`\x1b[38;5;245m[ws]\x1b[0m Cache hit for ${sessionId}, skipping buffer`);
        ws.send(JSON.stringify({ type: "output", data: "", seq: session.outputSeq }));
      } else if (lastSeq > 0 && session.outputBuffer.length > 0) {
        // Client has cache — always send as isDelta to preserve scrollback.
        // The client will append (not clear) when it sees isDelta: true.
        const missedChunks = session.outputSeq - lastSeq;
        if (missedChunks > 0 && missedChunks <= session.outputBuffer.length) {
          // Exact delta — send only the chunks the client missed
          const startIndex = session.outputBuffer.length - missedChunks;
          let delta = "";
          for (let i = startIndex; i < session.outputBuffer.length; i++) {
            delta += session.outputBuffer[i];
          }
          log(`\x1b[38;5;245m[ws]\x1b[0m Delta replay for ${sessionId}: ${missedChunks} chunks`);
          ws.send(JSON.stringify({ type: "output", data: delta, seq: session.outputSeq, isDelta: true }));
        } else {
          // Can't compute an exact delta (buffer overflow, seq reset after server
          // restart, or negative missedChunks). Replaying as a delta would append
          // recent output onto a stale client snapshot and corrupt the visible
          // history, so force a clean recent-history replay instead.
          const history = buildReplayHistory(session.outputBuffer);
          log(`\x1b[38;5;245m[ws]\x1b[0m Stale cache fallback for ${sessionId}: replaying recent history (missed=${missedChunks}, bufLen=${session.outputBuffer.length})`);
          ws.send(JSON.stringify({ type: "output", data: history, seq: session.outputSeq }));
        }
      } else if (session.outputBuffer.length > 0) {
        // No cache (lastSeq=0) — full buffer replay for first-time connections
        const history = buildReplayHistory(session.outputBuffer);
        ws.send(JSON.stringify({ type: "output", data: history, seq: session.outputSeq }));
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored,
        currentTool: session.currentTool,
        gitBranch: session.gitBranch,
        longRunningTool: session.longRunningTool || false,
      }));

    },
    message(ws, message) {
      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            if (session.pty) {
              session.pty.write(msg.data);
              session.lastInputTime = Date.now();
            }
            break;
          case "resize":
            if (session.pty) {
              session.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      if (ws.data.channel === "control-room") {
        controlRoomUnsubscribers.get(ws)?.();
        controlRoomUnsubscribers.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Control room disconnected from ${ws.data.projectId}`);
        return;
      }

      const { sessionId } = ws.data;
      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Wire up auth broadcast — notify all connected clients when OAuth is needed/complete
function broadcastToAll(message: object) {
  const json = JSON.stringify(message);
  for (const session of sessions.values()) {
    for (const client of session.clients) {
      try {
        if (client.readyState === 1) client.send(json);
      } catch {}
    }
  }
}

setAuthBroadcast(
  (url) => broadcastToAll({ type: "auth_required", url }),
  () => broadcastToAll({ type: "auth_complete" }),
);

// Auto-resume non-archived sessions after a short delay
setTimeout(() => {
  autoResumeSessions();
}, 1000);

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
process.on("SIGINT", async () => {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
  }
  process.exit(0);
});
