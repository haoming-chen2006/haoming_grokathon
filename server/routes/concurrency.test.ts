import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { projectRoutes } from "./projects";
import { ProjectStore } from "../services/projectStore";
import type { Actor } from "../types/project";

/**
 * Concurrent writes to one project.
 *
 * This product's premise is several agents working at once, and every mutation reads the whole
 * project file, changes it in memory, and writes it back. `atomicWriteJson` makes each *write*
 * atomic — no torn file — but says nothing about two read-modify-write sequences interleaving. If
 * they can, one agent's update silently overwrites another's, which would be invisible in every
 * single-threaded test written so far.
 *
 * These drive the real HTTP handlers concurrently and assert nothing is lost.
 */

const USER: Actor = { kind: "user", id: "user" };
let dataDir: string;
let app: Hono = new Hono();
let store: ProjectStore;
let projectId: string;

async function post(path: string, body: unknown) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-conc-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  store = new ProjectStore(join(dataDir, "projects"));
  projectId = store.createProject({ name: "Busy", goal: "g", repositoryPath: "/tmp/r" }).id;

  app = new Hono();
  app.route("/api/projects", projectRoutes);
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.OPENUI_DATA_DIR;
});

describe("concurrent writes to one project do not lose data", () => {
  test("40 concurrent messages all persist", async () => {
    const sends = Array.from({ length: 40 }, (_, i) =>
      post(`/api/projects/${projectId}/messages`, {
        kind: "question", fromAgentId: `a${i}`, toAgentId: "b",
        body: `message ${i}`, links: [{ kind: "task", id: "t1" }],
      }),
    );
    const results = await Promise.all(sends);
    expect(results.every((r) => r.status === 201)).toBe(true);

    // Re-read from disk, not from memory, so a lost write cannot hide in a cached object.
    const persisted = new ProjectStore(join(dataDir, "projects")).listMessages(projectId);
    expect(persisted).toHaveLength(40);
    for (let i = 0; i < 40; i++) {
      expect(persisted.some((m) => m.body === `message ${i}`), `message ${i} was lost`).toBe(true);
    }
  });

  test("40 concurrent requirements all persist", async () => {
    const adds = Array.from({ length: 40 }, (_, i) =>
      post(`/api/projects/${projectId}/requirements`, { id: `R-${i}`, description: `req ${i}` }),
    );
    await Promise.all(adds);

    const persisted = new ProjectStore(join(dataDir, "projects")).getProject(projectId).requirements;
    expect(persisted).toHaveLength(40);
    for (let i = 0; i < 40; i++) {
      expect(persisted.some((r) => r.id === `R-${i}`), `R-${i} was lost`).toBe(true);
    }
  });

  test("concurrent updates to different tasks all survive", async () => {
    store.createPlan(projectId, { milestones: [] }, USER);
    for (let i = 0; i < 20; i++) store.addTask(projectId, { id: `t${i}`, objective: `o${i}` }, USER);
    store.approvePlan(projectId, USER);

    // Each request touches a different task, so nothing here is a genuine conflict — losing any of
    // them would be pure write-clobbering.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        app.request(`/api/projects/${projectId}/tasks/t${i}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedFiles: [`file-${i}.ts`] }),
        }),
      ),
    );

    const tasks = new ProjectStore(join(dataDir, "projects")).getProject(projectId).tasks;
    for (let i = 0; i < 20; i++) {
      const task = tasks.find((t) => t.id === `t${i}`)!;
      expect(task.expectedFiles, `t${i} lost its update`).toContain(`file-${i}.ts`);
    }
  });

  test("mixed concurrent writes of different kinds all survive", async () => {
    // Messages, requirements and artifacts at once — the realistic shape when several agents are
    // working, and the case where one collection could be clobbered by another's write.
    await Promise.all([
      ...Array.from({ length: 15 }, (_, i) =>
        post(`/api/projects/${projectId}/messages`, {
          kind: "question", fromAgentId: "a", toAgentId: "b",
          body: `m${i}`, links: [{ kind: "task", id: "t1" }],
        }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        post(`/api/projects/${projectId}/requirements`, { id: `RR-${i}`, description: "d" }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        post(`/api/projects/${projectId}/artifacts`, {
          kind: "patch", name: `art-${i}`, content: "c", producedByAgentId: "a",
        }),
      ),
    ]);

    const project = new ProjectStore(join(dataDir, "projects")).getProject(projectId);
    expect(project.messages).toHaveLength(15);
    expect(project.requirements).toHaveLength(15);
    expect(project.artifacts).toHaveLength(15);
  });
});
