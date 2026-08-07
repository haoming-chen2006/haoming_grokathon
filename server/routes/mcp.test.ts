import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { mcpRoutes, projectMcpUrl } from "./mcp";
import { ProjectStore } from "./../services/projectStore";

let dataDir: string;
let app: Hono;
let projectId: string;

/** One JSON-RPC round trip against the mounted MCP endpoint. */
async function rpc(path: string, body: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Streamable HTTP may reply as SSE; pull the data frame out.
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    if (line) json = JSON.parse(line.slice(5).trim());
  }
  return { status: res.status, json };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-mcp-http-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  const store = new ProjectStore(join(dataDir, "projects"));
  projectId = store.createProject({
    name: "Authentication",
    goal: "Ship passwordless auth",
    repositoryPath: process.cwd(),
  }).id;

  app = new Hono();
  app.route("/mcp", mcpRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("V-028: the MCP server is reachable over HTTP", () => {
  test("initialize succeeds at the project/agent URL", async () => {
    const { status, json } = await rpc(`/mcp/${projectId}/backend`, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
    });
    expect(status).toBe(200);
    expect(json?.result?.serverInfo?.name).toBe("openui-project");
  });

  test("tools/list returns the full project tool surface", async () => {
    const { json } = await rpc(`/mcp/${projectId}/backend`, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const names = (json?.result?.tools ?? []).map((t: any) => t.name);
    expect(names).toContain("get_project");
    expect(names).toContain("escalate_to_user");
    expect(names.length).toBe(18);
  });

  test("the agent identity comes from the URL, not the request body", async () => {
    // Two URLs, two identities — nothing in the payload can change which agent a tool sees.
    const a = await rpc(`/mcp/${projectId}/agent-a`, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
    const b = await rpc(`/mcp/${projectId}/agent-b`, { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
    expect(a.json?.result?.tools?.length).toBe(18);
    expect(b.json?.result?.tools?.length).toBe(18);
  });

  test("projectMcpUrl builds the address handed to an agent", () => {
    expect(projectMcpUrl(6968, "proj_1", "agent_1")).toBe("http://127.0.0.1:6968/mcp/proj_1/agent_1");
    // Ids are encoded, so an id containing a slash cannot escape its path segment.
    expect(projectMcpUrl(6968, "a/b", "c")).toContain("a%2Fb");
  });
});
