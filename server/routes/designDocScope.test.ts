import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { designDocRoutes } from "./designDocs";
import { projectRoutes } from "./projects";
import { getProjectStore } from "../services/projectStore";
import { setXaiTransport, resetXaiClient } from "../services/xai/client";

/**
 * Two things the product refused to represent, and now does.
 *
 * **A project's documents are its own.** The page listed every document on the machine regardless of
 * which project was open, so switching project switched the assets and left the brief behind —
 * twenty-three projects all showing whichever document sorted first on disk.
 *
 * **A project can exist before its brief does.** The document was the only way in, which made "I
 * know what I am building and have not written it up" impossible to hold.
 *
 * The drafting test stubs the transport. `setXaiTransport` is a seam rather than `mock.module` for
 * the reason the client documents: a module mock is silently inert in a full suite, and the test
 * that looks stubbed makes the real call. Here that spends money on every run.
 */

let dataDir: string;
let docsDir: string;
let repo: string;
let app: Hono;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "openui-scope-"));
  docsDir = mkdtempSync(join(tmpdir(), "openui-scope-docs-"));
  repo = mkdtempSync(join(tmpdir(), "openui-scope-repo-"));
  process.env.OPENUI_DATA_DIR = dataDir;
  process.env.OPENUI_DESIGN_DOCS_DIR = docsDir;

  app = new Hono();
  app.route("/api/design-docs", designDocRoutes);
  app.route("/api/projects", projectRoutes);
});

afterEach(() => {
  setXaiTransport(null);
  resetXaiClient();
  delete process.env.OPENUI_DESIGN_DOCS_DIR;
  for (const dir of [dataDir, docsDir, repo]) rmSync(dir, { recursive: true, force: true });
});

describe("a project's design documents are its own", () => {
  test("?projectId= returns this project's document and not another project's", async () => {
    writeFileSync(join(docsDir, "mine.md"), "# Mine\n");
    writeFileSync(join(docsDir, "theirs.md"), "# Theirs\n");

    const mine = getProjectStore().createProject({
      name: "Mine",
      goal: "",
      repositoryPath: repo,
      designDocId: "mine",
    });
    getProjectStore().createProject({
      name: "Theirs",
      goal: "",
      repositoryPath: repo,
      designDocId: "theirs",
    });

    const res = await call("GET", `/api/design-docs?projectId=${mine.id}`);
    expect(res.status).toBe(200);
    const ids = res.json.map((d: any) => d.id);
    expect(ids).toContain("mine");
    expect(ids).not.toContain("theirs");
  });

  test("an unclaimed document travels with every project, so nothing on disk becomes unreachable", async () => {
    writeFileSync(join(docsDir, "nobodys.md"), "# Nobody's\n");
    const project = getProjectStore().createProject({ name: "P", goal: "", repositoryPath: repo });

    const res = await call("GET", `/api/design-docs?projectId=${project.id}`);
    expect(res.json.map((d: any) => d.id)).toEqual(["nobodys"]);
    // And it is honest about being unclaimed rather than implying this project owns it.
    expect(res.json[0].followedByProjectId).toBeUndefined();
  });

  test("without the parameter every document still comes back — the CLI reads the whole set", async () => {
    writeFileSync(join(docsDir, "a.md"), "# A\n");
    writeFileSync(join(docsDir, "b.md"), "# B\n");
    const p = getProjectStore().createProject({
      name: "P",
      goal: "",
      repositoryPath: repo,
      designDocId: "a",
    });
    expect(p.designDocId).toBe("a");

    const res = await call("GET", "/api/design-docs");
    expect(res.json.map((d: any) => d.id).sort()).toEqual(["a", "b"]);
  });
});

describe("a project can start without a document", () => {
  test("POST /api/projects/blank creates a project with a workspace and no document", async () => {
    const res = await call("POST", "/api/projects/blank", { name: "No brief yet" });
    expect(res.status).toBe(201);
    expect(res.json.projectId).toBeTruthy();

    const project = getProjectStore().getProject(res.json.projectId);
    expect(project.name).toBe("No brief yet");
    expect(project.designDocId).toBeUndefined();
    // A real git repository, not a promise of one: the loop cannot open a worktree without it.
    expect(existsSync(join(res.json.workspace, ".git"))).toBe(true);
  });

  test("no design.md is written, because no document declared this project", async () => {
    const res = await call("POST", "/api/projects/blank", { name: "Bare" });
    expect(existsSync(join(res.json.workspace, "design.md"))).toBe(false);
    expect(existsSync(join(res.json.workspace, "README.md"))).toBe(true);
  });

  test("a nameless project is refused rather than created as an empty string", async () => {
    const res = await call("POST", "/api/projects/blank", { name: "   " });
    expect(res.status).toBe(400);
  });

  test("two projects with the same name get two workspaces, not one shared repository", async () => {
    const first = await call("POST", "/api/projects/blank", { name: "Untitled" });
    const second = await call("POST", "/api/projects/blank", { name: "Untitled" });
    expect(first.json.workspace).not.toBe(second.json.workspace);
  });
});

describe("writing the brief afterwards attaches it to the project", () => {
  test("POST with a projectId makes the project follow the new document", async () => {
    const created = await call("POST", "/api/projects/blank", { name: "Later" });
    const projectId = created.json.projectId;

    const saved = await call("POST", "/api/design-docs", {
      title: "Later",
      text: "# Later\n\nWhat it is.\n",
      projectId,
    });
    expect(saved.status).toBe(201);
    expect(saved.json.followedByProjectId).toBe(projectId);
    expect(getProjectStore().getProject(projectId).designDocId).toBe(saved.json.id);

    // And the scoped list now shows it as this project's own.
    const listed = await call("GET", `/api/design-docs?projectId=${projectId}`);
    expect(listed.json.find((d: any) => d.id === saved.json.id).followedByProjectId).toBe(projectId);
  });

  test("a failed link still saves the document — the user's text is never the thing that is lost", async () => {
    const created = await call("POST", "/api/projects/blank", { name: "Taken" });
    const projectId = created.json.projectId;
    await call("POST", "/api/design-docs", { title: "First", text: "# First\n", projectId });

    const second = await call("POST", "/api/design-docs", {
      title: "Second",
      text: "# Second\n",
      projectId,
    });
    expect(second.status).toBe(201);
    expect(second.json.linkError).toContain("already follows");
    // Written to disk regardless, and adoptable: it comes back as an unclaimed document.
    const listed = await call("GET", `/api/design-docs?projectId=${projectId}`);
    expect(listed.json.map((d: any) => d.id)).toContain(second.json.id);
  });
});

describe("drafting with an X agent", () => {
  /** A stubbed chat completion, shaped like the one api.x.ai returns. */
  const reply = (content: string) =>
    setXaiTransport(async () =>
      Response.json({ choices: [{ message: { content } }] }, { status: 200 }),
    );

  const DECLARING = [
    "# Aeris chairs",
    "",
    "A push for Q3.",
    "",
    "```project",
    "name: Aeris chairs",
    "category: slides",
    "budget: 20",
    "areas:",
    "  - Deck: the slides themselves",
    "  - Pricing: what it costs",
    "```",
    "",
  ].join("\n");

  test("returns the draft and reports that it parses, without writing anything", async () => {
    process.env.XAI_API_KEY = "xai-testonlyABCDEFGHIJKLMNOP0123456789";
    resetXaiClient();
    reply(DECLARING);

    const res = await call("POST", "/api/design-docs/draft", {
      projectName: "Aeris chairs",
      brief: "A slide deck for the Q3 push",
    });
    expect(res.status).toBe(200);
    expect(res.json.text).toContain("category: slides");
    expect(res.json.declares).toBe(true);

    // Nothing on disk: the draft is the agent's, and saving is the user's separate decision.
    const listed = await call("GET", "/api/design-docs");
    expect(listed.json).toEqual([]);
    delete process.env.XAI_API_KEY;
  });

  /**
   * The distinction that caught a real bug: a document with NO project block parses cleanly —
   * `ok: true`, no errors — and declares nothing. Reporting that as a good draft would tell the
   * user their brief was ready when it would produce a board with no boxes.
   */
  test("a draft with no project block declares nothing, even though it parses", async () => {
    process.env.XAI_API_KEY = "xai-testonlyABCDEFGHIJKLMNOP0123456789";
    resetXaiClient();
    reply("# No block here\n\nJust prose.\n");

    const res = await call("POST", "/api/design-docs/draft", { brief: "something" });
    expect(res.status).toBe(200);
    expect(res.json.declares).toBe(false);
    expect(res.json.errors).toEqual([]);
    expect(res.json.text).toContain("No block here");
    delete process.env.XAI_API_KEY;
  });

  test("a draft whose block IS malformed comes back with the lines to fix", async () => {
    process.env.XAI_API_KEY = "xai-testonlyABCDEFGHIJKLMNOP0123456789";
    resetXaiClient();
    reply("# Bad\n\n```project\nname: Bad\ncategory: \n```\n");

    const res = await call("POST", "/api/design-docs/draft", { brief: "something" });
    expect(res.json.declares).toBe(false);
    expect(res.json.errors.length).toBeGreaterThan(0);
    expect(res.json.errors[0]).toHaveProperty("line");
    delete process.env.XAI_API_KEY;
  });

  test("an empty brief is refused before any money is spent", async () => {
    let called = false;
    setXaiTransport(async () => {
      called = true;
      return Response.json({}, { status: 200 });
    });
    const res = await call("POST", "/api/design-docs/draft", { brief: "  " });
    expect(res.status).toBe(400);
    expect(called).toBe(false);
  });

  test("no credential is a sentence the user can act on, not a stack trace", async () => {
    delete process.env.XAI_API_KEY;
    delete process.env.xai_api_key;
    resetXaiClient();
    const res = await call("POST", "/api/design-docs/draft", { brief: "a deck" });
    expect(res.status).toBe(502);
    expect(typeof res.json.error).toBe("string");
    expect(res.json.error.length).toBeGreaterThan(20);
  });
});
