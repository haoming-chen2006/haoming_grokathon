import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createProjectMcpServer } from "../services/projectMcpServer";
import { getAgentRegistry } from "../services/agentRegistry";

export const mcpRoutes = new Hono();

/**
 * Project MCP server over HTTP (V-028).
 *
 * Grok advertises `mcpCapabilities: {http: true, sse: true}`, so the server is mounted on the
 * orchestration process rather than spawned as a subprocess. That keeps tools in-process with the
 * project store — no second copy of state, no IPC — and means the agent reaches it at a URL that
 * is already running.
 *
 * The project and agent are taken from the PATH, so the identity a tool sees is fixed by the URL
 * the agent was given at session/new and cannot be altered by anything the agent sends.
 */
mcpRoutes.all("/:projectId/:agentId", async (c) => {
  const projectId = c.req.param("projectId");
  const agentId = c.req.param("agentId");

  // Privilege is read from the agent's STORED permissions, never from a request header.
  // Trusting `x-openui-actor-doc-write` let any caller grant itself write access to the canonical
  // document, defeating V-014 entirely — the header is now ignored.
  let canWriteDocument = false;
  try {
    canWriteDocument = getAgentRegistry().get(agentId).permissions.canWriteDocument === true;
  } catch {
    // An unknown agent gets the safe default: read-only.
  }

  // The agent's own capability decides which media tools exist for it. Without this every agent
  // got the base default and nothing in production could generate anything: the gate was real and
  // nothing could open it (R-2, loops/handoff/pivot-media.md).
  let capabilities: { images: boolean; voice: boolean } | undefined;
  try {
    capabilities = getAgentRegistry().get(agentId).capabilities;
  } catch {
    // An unknown agent keeps the safe default, same as canWriteDocument above.
  }

  const server = createProjectMcpServer({ projectId, agentId, canWriteDocument, capabilities });

  // Stateless mode: each request carries its own transport, so concurrent agents cannot collide
  // on a shared session and a crashed request cannot poison later ones.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  } catch (err) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
        id: null,
      },
      500,
    );
  } finally {
    // Never leak the per-request server/transport pair.
    void server.close().catch(() => {});
  }
});

/** The URL an agent should be handed for this project/agent pair. */
export function projectMcpUrl(port: number, projectId: string, agentId: string): string {
  return `http://127.0.0.1:${port}/mcp/${encodeURIComponent(projectId)}/${encodeURIComponent(agentId)}`;
}
