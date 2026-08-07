import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { ProjectStore } from "../services/projectStore";

/**
 * Archived message history must be reachable from the running application.
 *
 * Messages beyond the retention window move to a sidecar file. They are still on disk, but if no
 * route exposes them the user simply loses their conversation history once a project gets busy —
 * V-049 requires messages survive, and bytes on disk nobody can read do not satisfy that.
 */

let dataDir: string;
let app: Hono;
let projectId: string;
let store: ProjectStore;

async function get(path: string) {
  const res = await app.request(path);
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-history-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  store = new ProjectStore(join(dataDir, "projects"));
  projectId = store.createProject({ name: "Busy", goal: "g", repositoryPath: "/tmp/r" }).id;

  // 700 finished conversations: enough that the oldest are archived.
  for (let i = 0; i < 700; i++) {
    store.sendMessage(projectId, {
      kind: "question", fromAgentId: "a", toAgentId: "b",
      body: `msg-${i}`, links: [{ kind: "task", id: "t1" }], threadId: `thread-${i}`,
    });
  }

  app = new Hono();
  app.route("/api/projects", projectRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("archived message history is reachable over HTTP", () => {
  test("the setup really did archive the oldest messages", () => {
    expect(store.archivedMessages(projectId).length).toBeGreaterThan(0);
    expect(store.listMessages(projectId)).toHaveLength(500);
  });

  test("the default listing stays bounded", async () => {
    const { status, json } = await get(`/api/projects/${projectId}/messages`);
    expect(status).toBe(200);
    expect(json).toHaveLength(500);
  });

  test("history can be requested and returns every message ever sent", async () => {
    const { status, json } = await get(`/api/projects/${projectId}/messages?includeArchived=true`);
    expect(status).toBe(200);
    expect(json).toHaveLength(700);
    // The very first message must be retrievable, not just recent ones.
    expect(json[0].body).toBe("msg-0");
  });

  test("a specific archived message is retrievable by thread", async () => {
    const { json } = await get(
      `/api/projects/${projectId}/messages?threadId=thread-3&includeArchived=true`,
    );
    expect(json).toHaveLength(1);
    expect(json[0].body).toBe("msg-3");
  });

  test("without the flag that same archived thread is invisible", async () => {
    const { json } = await get(`/api/projects/${projectId}/messages?threadId=thread-3`);
    expect(json).toHaveLength(0);
  });
});
