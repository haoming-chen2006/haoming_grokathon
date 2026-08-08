/**
 * The Tools panel, measured — loops/06-tools-and-cost.md TOOL-001…TOOL-011.
 *
 * These render the real component against a stubbed `/api/library`, and the stub is a small
 * in-memory server rather than a table of canned responses: the panel's job is to create, edit,
 * delete and reload, and a stub that returns a fixed list would let every one of those pass while
 * writing nothing. What is asserted is what the user would see after the round trip.
 *
 * The one thing deliberately NOT asserted here is the overlay frame — the scrim, the Esc key, the
 * header. `shell/WorkspaceShell.tsx` owns all four and has its own tests; duplicating them here
 * would assert a behaviour this component must never implement.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { INJECT_RESOURCE_EVENT, OPEN_TOOLS_EVENT, type InjectResourceDetail } from "./contract";
import { ToolsPanel } from "./ToolsPanel";

// ────────────────────────────────────────────────────────────── a small in-memory /api/library

interface Server {
  prompts: any[];
  skills: any[];
  workflows: any[];
  agents: any[];
  calls: string[];
}

let server: Server;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Mirrors the server's own rule: a description must say when, not only what. */
function saysWhen(text: string) {
  return text.trim().split(/\s+/).length >= 6 && /\b(when|whenever|use (this|it|for)|asks?)\b/i.test(text);
}

function stubServer() {
  let counter = 0;
  const id = (p: string) => `${p}_${++counter}`;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://workspace.invalid");
    const path = url.pathname.replace("/api/library", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    server.calls.push(`${method} ${url.pathname}`);

    if (url.pathname.startsWith("/api/coding-agents")) return json(server.agents);

    // ── prompts
    if (path === "/prompts" && method === "GET") return json(server.prompts);
    if (path === "/prompts" && method === "POST") {
      const created = { id: id("prompt"), createdAt: new Date().toISOString(), variables: [], ...body };
      server.prompts.push(created);
      return json(created, 201);
    }
    const promptMatch = /^\/prompts\/([^/]+)(\/render)?$/.exec(path);
    if (promptMatch) {
      const found = server.prompts.find((p) => p.id === promptMatch[1]);
      if (!found) return json({ error: "Prompt template not found", code: "NOT_FOUND" }, 404);
      if (promptMatch[2] === "/render") {
        const missing = [...String(found.body).matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
          .map((m) => m[1])
          .filter((name) => !body.values?.[name]);
        if (missing.length) {
          return json({ error: `unresolved: ${missing.join(", ")}`, code: "UNRESOLVED_VARIABLE", missing }, 400);
        }
        return json({
          rendered: String(found.body).replace(/\{(\w+)\}/g, (_w, n) => body.values[n]),
        });
      }
      if (method === "PATCH") {
        Object.assign(found, body);
        return json(found);
      }
      if (method === "DELETE") {
        server.prompts = server.prompts.filter((p) => p.id !== promptMatch[1]);
        return new Response(null, { status: 204 });
      }
    }

    // ── skills, in grok's on-disk shape
    if (path === "/grok-skills" && method === "GET") return json(server.skills);
    if (path === "/grok-skills" && method === "POST") {
      if (!saysWhen(body.description ?? "")) {
        return json({ error: "The description must say WHEN to use this skill" }, 400);
      }
      const name = String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const created = {
        id: `user:${name}`,
        name,
        description: body.description,
        body: body.body ?? "",
        extras: {},
        dir: `/home/u/.grok/skills/${name}`,
        scope: "user",
        state: "active",
        resources: [],
        editable: true,
      };
      server.skills.push(created);
      return json(created, 201);
    }
    const skillMatch = /^\/grok-skills\/([^/]+)$/.exec(path);
    if (skillMatch) {
      const found = server.skills.find((s) => s.id === decodeURIComponent(skillMatch[1]));
      if (!found) return json({ error: "Skill not found", code: "NOT_FOUND" }, 404);
      if (method === "PATCH") {
        Object.assign(found, body);
        return json(found);
      }
      if (method === "DELETE") {
        server.skills = server.skills.filter((s) => s.id !== found.id);
        return new Response(null, { status: 204 });
      }
    }

    // ── workflows
    if (path === "/workflows" && method === "GET") return json(server.workflows);
    if (path === "/workflows" && method === "POST") {
      const created = {
        id: id("wf"),
        createdAt: new Date().toISOString(),
        roles: [...new Set(body.stages.map((s: any) => s.role))],
        ...body,
        stages: body.stages.map((s: any, i: number) => ({ id: `stage_${i}`, dependsOn: [], reviewGate: false, ...s })),
      };
      server.workflows.push(created);
      return json(created, 201);
    }
    const wfMatch = /^\/workflows\/([^/]+)$/.exec(path);
    if (wfMatch) {
      const found = server.workflows.find((w) => w.id === wfMatch[1]);
      if (!found) return json({ error: "Workflow not found", code: "NOT_FOUND" }, 404);
      if (method === "PATCH") {
        Object.assign(found, body);
        return json(found);
      }
      if (method === "DELETE") {
        server.workflows = server.workflows.filter((w) => w.id !== wfMatch[1]);
        return new Response(null, { status: 204 });
      }
    }

    // ── injection: resolve only. Never delivers, never opens a session.
    if (path === "/injections/resolve" && method === "POST") {
      if (body.kind === "prompt") {
        const found = server.prompts.find((p) => p.id === body.resourceId);
        if (!found) return json({ error: "not found", code: "NOT_FOUND" }, 404);
        return json({
          kind: "prompt", resourceId: found.id, resourceName: found.name, resourceVersion: "v1",
          text: String(found.body).replace(/\{(\w+)\}/g, (_w, n) => body.values?.[n] ?? ""),
          mounts: [], effective: "this_turn", estimatedInputTokens: 12,
          effectNote: "Sent to the agent. It arrives on its next turn.",
          provenance: { libraryVersion: "1", at: "now" },
        });
      }
      const found = server.skills.find((s) => s.id === body.resourceId);
      return json({
        kind: "skill", resourceId: body.resourceId, resourceName: found?.name ?? "?", resourceVersion: "v1",
        text: `# Skill: ${found?.name}`,
        mounts: [{ relativePath: `.grok/skills/${found?.name}/SKILL.md`, contents: "---\n" }],
        effective: "this_turn", estimatedInputTokens: 30,
        effectNote: "Sent to the agent now, and saved so its next session discovers it on its own.",
        provenance: { libraryVersion: "1", at: "now" },
      });
    }

    return json({ error: `unstubbed ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;
}

beforeEach(() => {
  server = { prompts: [], skills: [], workflows: [], agents: [{ id: "agent_1", name: "Researcher" }], calls: [] };
  stubServer();
});

afterEach(cleanup);

function mount(section: "prompts" | "skills" | "workflows" = "prompts") {
  return render(<ToolsPanel projectId="proj_1" section={section} onClose={() => {}} />);
}

async function settled() {
  await waitFor(() => expect(screen.getByTestId("tools-panel-body")).toBeTruthy());
}

// ═════════════════════════════════════════════════════════════════════════════════ TOOL-002

describe("TOOL-002/003: the panel reads the real library", () => {
  test("each section lists what the server holds, from /api/library", async () => {
    server.prompts = [{ id: "p1", name: "Weekly update", body: "What changed?", variables: [], createdAt: "2026-01-01" }];
    mount("prompts");
    await settled();

    expect(await screen.findByText("Weekly update")).toBeTruthy();
    // Not a mock: the panel asked the server for it.
    expect(server.calls).toContain("GET /api/library/prompts");
    expect(server.calls).toContain("GET /api/library/grok-skills");
    expect(server.calls).toContain("GET /api/library/workflows");
  });

  test("the section prop, which the URL carries, chooses what is shown", async () => {
    const { rerender } = mount("prompts");
    await settled();
    expect(screen.queryByTestId("new-prompt")).toBeTruthy();
    expect(screen.queryByTestId("new-skill")).toBeNull();

    rerender(<ToolsPanel projectId="proj_1" section="skills" onClose={() => {}} />);
    expect(screen.queryByTestId("new-skill")).toBeTruthy();
    expect(screen.queryByTestId("new-prompt")).toBeNull();
  });

  test("a prompt is created from two fields, with no mention of a variable", async () => {
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByTestId("new-prompt"));
    const form = screen.getByTestId("prompt-form");
    // TOOL-002/TOOL-010: the whole default creation path. No schema, no JSON, no path.
    expect(within(form).getAllByRole("textbox")).toHaveLength(2);

    fireEvent.change(screen.getByTestId("prompt-name"), { target: { value: "Weekly update" } });
    fireEvent.change(screen.getByTestId("prompt-body"), { target: { value: "Summarise the week." } });
    fireEvent.click(screen.getByTestId("save-prompt"));

    await waitFor(() => expect(server.prompts).toHaveLength(1));
    expect(server.prompts[0].name).toBe("Weekly update");
    // Twice over: once in the list, once in the detail the panel opens onto after creating.
    expect(await screen.findAllByText("Weekly update")).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════ TOOL-001, TOOL-005

describe("TOOL-001: edit and delete, in the panel", () => {
  test("a prompt can be edited, and the change is what is listed afterwards", async () => {
    server.prompts = [{ id: "p1", name: "Old name", body: "Body.", variables: [], createdAt: "2026-01-01" }];
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByText("Old name"));
    fireEvent.click(await screen.findByTestId("edit-prompt"));
    fireEvent.change(screen.getByTestId("prompt-name"), { target: { value: "New name" } });
    fireEvent.click(screen.getByTestId("save-prompt"));

    await waitFor(() => expect(server.prompts[0].name).toBe("New name"));
    expect(within(await screen.findByTestId("prompt-row")).getByText("New name")).toBeTruthy();
    expect(screen.queryByText("Old name")).toBeNull();
  });

  test("deleting asks first, then removes it", async () => {
    server.prompts = [{ id: "p1", name: "Doomed", body: "x", variables: [], createdAt: "2026-01-01" }];
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByTestId("delete-prompt"));
    // One click is not enough: this is the only irreversible action in the panel.
    expect(server.prompts).toHaveLength(1);

    fireEvent.click(screen.getByTestId("confirm-delete"));
    await waitFor(() => expect(server.prompts).toHaveLength(0));
    expect(screen.queryByText("Doomed")).toBeNull();
  });

  test("a skill can be created and edited without ever naming a file", async () => {
    mount("skills");
    await settled();

    fireEvent.click(screen.getByTestId("new-skill"));
    const form = screen.getByTestId("skill-form");
    expect(within(form).queryByText(/SKILL\.md/)).toBeNull();
    expect(within(form).queryByText(/\.grok/)).toBeNull();

    fireEvent.change(screen.getByTestId("skill-name"), { target: { value: "Deck conventions" } });
    fireEvent.change(screen.getByTestId("skill-description"), {
      target: { value: "Our slide rules. Use whenever building a client deck." },
    });
    fireEvent.change(screen.getByTestId("skill-body"), { target: { value: "Use the house template." } });
    fireEvent.click(screen.getByTestId("save-skill"));

    await waitFor(() => expect(server.skills).toHaveLength(1));
    expect(server.skills[0].name).toBe("deck-conventions");
  });

  test("TOOL-005: a description that never says when is refused, and says why", async () => {
    mount("skills");
    await settled();

    fireEvent.click(screen.getByTestId("new-skill"));
    fireEvent.change(screen.getByTestId("skill-name"), { target: { value: "vague" } });
    fireEvent.change(screen.getByTestId("skill-description"), { target: { value: "Formats notes." } });

    // Warned before submitting, and refused by the server if submitted anyway.
    expect(screen.getByTestId("skill-description-hint")).toBeTruthy();
    fireEvent.click(screen.getByTestId("save-skill"));
    expect(await screen.findByTestId("tools-error")).toBeTruthy();
    expect(server.skills).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════ TOOL-005

describe("TOOL-005: a prompt renders through the server", () => {
  test("variables are asked for, filled by the server, and copyable", async () => {
    server.prompts = [
      { id: "p1", name: "Focus", body: "Work on {area} only.", variables: [], createdAt: "2026-01-01" },
    ];
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByText("Focus"));
    fireEvent.change(await screen.findByTestId("variable-area"), { target: { value: "the parser" } });
    fireEvent.click(screen.getByTestId("fill-prompt"));

    const rendered = await screen.findByTestId("prompt-rendered");
    expect(rendered.textContent).toBe("Work on the parser only.");
    // The server did the resolving — the rule lives in renderPrompt and only there.
    expect(server.calls).toContain("POST /api/library/prompts/p1/render");
  });

  test("a missing value reports the server's own error rather than a prompt with a hole", async () => {
    server.prompts = [{ id: "p1", name: "Focus", body: "Work on {area}.", variables: [], createdAt: "2026-01-01" }];
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByText("Focus"));
    fireEvent.click(await screen.findByTestId("fill-prompt"));

    expect(await screen.findByTestId("tools-error")).toBeTruthy();
    expect(screen.queryByTestId("prompt-rendered")).toBeNull();
  });

  test("a prompt with no variables is finished text already", async () => {
    server.prompts = [{ id: "p1", name: "Plain", body: "Just do it.", variables: [], createdAt: "2026-01-01" }];
    mount("prompts");
    await settled();

    fireEvent.click(screen.getByText("Plain"));
    expect((await screen.findByTestId("prompt-rendered")).textContent).toBe("Just do it.");
    expect(screen.getByTestId("tools-copy")).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════ TOOL-006

describe("TOOL-006: a skill turns up and down", () => {
  const SKILL = {
    id: "user:deck", name: "deck", description: "Slide rules. Use when building a deck.",
    body: "x", extras: {}, dir: "/home/u/.grok/skills/deck", scope: "user",
    state: "active", resources: [], editable: true,
  };

  test("turning it off keeps it listed and tells the server", async () => {
    server.skills = [{ ...SKILL }];
    mount("skills");
    await settled();

    expect(await screen.findByText("On")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toggle-skill"));

    await waitFor(() => expect(server.skills[0].state).toBe("inactive"));
    // Still there — that is the whole point of the middle state.
    expect(screen.getByText("deck")).toBeTruthy();
    expect(await screen.findByText("Off")).toBeTruthy();
  });

  test("the state comes from the server on every load, so a reload shows it", async () => {
    server.skills = [{ ...SKILL, state: "inactive" }];
    mount("skills");
    await settled();

    // Nothing was clicked; this is purely what the server reported.
    expect(await screen.findByText("Off")).toBeTruthy();
  });

  test("a bundled skill offers no delete, because grok owns it", async () => {
    server.skills = [{ ...SKILL, id: "bundled:pdf", name: "pdf", scope: "bundled", editable: false }];
    mount("skills");
    await settled();

    expect(await screen.findByText("Built in")).toBeTruthy();
    expect(screen.queryByTestId("delete-skill")).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════ TOOL-008

describe("TOOL-008: workflows, named for what they actually do", () => {
  test("a running order can be created from steps and roles", async () => {
    mount("workflows");
    await settled();

    fireEvent.click(screen.getByTestId("new-workflow"));
    fireEvent.change(screen.getByTestId("workflow-name"), { target: { value: "Client deck" } });
    fireEvent.change(screen.getByTestId("stage-name-0"), { target: { value: "Research" } });
    fireEvent.change(screen.getByTestId("stage-role-0"), { target: { value: "Researcher" } });
    fireEvent.click(screen.getByTestId("add-stage"));
    fireEvent.change(screen.getByTestId("stage-name-1"), { target: { value: "Draft" } });
    fireEvent.change(screen.getByTestId("stage-role-1"), { target: { value: "Writer" } });
    fireEvent.click(screen.getByTestId("save-workflow"));

    await waitFor(() => expect(server.workflows).toHaveLength(1));
    expect(server.workflows[0].stages.map((s: any) => s.name)).toEqual(["Research", "Draft"]);
  });

  test("the panel does not claim to run it", async () => {
    server.workflows = [{
      id: "wf1", name: "Client deck", roles: ["Researcher"], createdAt: "2026-01-01",
      stages: [{ id: "s1", name: "Research", role: "Researcher", dependsOn: [], reviewGate: false }],
    }];
    mount("workflows");
    await settled();

    fireEvent.click(screen.getByText("Client deck"));
    expect((await screen.findByTestId("workflow-detail")).textContent).toContain(
      "does not run these steps on its own",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════════ TOOL-011

describe("TOOL-011: injecting into an agent that is already running", () => {
  const SKILL = {
    id: "user:deck", name: "deck", description: "Slide rules. Use when building a deck.",
    body: "x", extras: {}, dir: "/home/u/.grok/skills/deck", scope: "user",
    state: "active", resources: [], editable: true,
  };

  function captureInjections() {
    const seen: InjectResourceDetail[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<InjectResourceDetail>).detail);
    window.addEventListener(INJECT_RESOURCE_EVENT, listener);
    return { seen, stop: () => window.removeEventListener(INJECT_RESOURCE_EVENT, listener) };
  }

  test("a resolved resource is published as a typed event, not an import", async () => {
    server.skills = [{ ...SKILL }];
    const { seen, stop } = captureInjections();
    mount("skills");
    await settled();

    fireEvent.click(screen.getByTestId("agent-target"));
    fireEvent.click(screen.getByText("deck"));
    fireEvent.click(await screen.findByTestId("inject-skill"));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].kind).toBe("skill");
    expect(seen[0].agentId).toBe("agent_1");
    expect(seen[0].mounts[0].relativePath).toBe(".grok/skills/deck/SKILL.md");
    // Resolved by the server, and this panel delivers nothing itself.
    expect(server.calls).toContain("POST /api/library/injections/resolve");
    stop();
  });

  test("the panel reports the effect in the server's own words", async () => {
    server.skills = [{ ...SKILL }];
    mount("skills");
    await settled();

    fireEvent.click(screen.getByTestId("agent-target"));
    fireEvent.click(screen.getByText("deck"));
    fireEvent.click(await screen.findByTestId("inject-skill"));

    const outcome = await screen.findByTestId("injection-outcome");
    expect(outcome.textContent).toContain("next session discovers it");
  });

  test("with no agent chosen, sending is disabled and says why", async () => {
    server.agents = [];
    server.skills = [{ ...SKILL }];
    mount("skills");
    await settled();

    fireEvent.click(screen.getByText("deck"));
    const button = (await screen.findByTestId("inject-skill")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("No agents are running");
  });

  test("OPEN_TOOLS_EVENT preselects the agent it names", async () => {
    server.agents = [{ id: "agent_1", name: "Researcher" }, { id: "agent_2", name: "Writer" }];
    server.skills = [{ ...SKILL }];
    const { seen, stop } = captureInjections();
    mount("skills");
    await settled();

    window.dispatchEvent(new CustomEvent(OPEN_TOOLS_EVENT, { detail: { agentId: "agent_2" } }));

    fireEvent.click(screen.getByText("deck"));
    fireEvent.click(await screen.findByTestId("inject-skill"));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].agentId).toBe("agent_2");
    stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════ an unreadable library

describe("a failed read never looks like an empty library", () => {
  test("the panel says the server could not be read, and does not offer an empty list as fact", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) =>
      json({ error: "Could not read the library", code: "LIBRARY_UNREADABLE" }, 500)) as typeof fetch;
    mount("prompts");
    await settled();

    const error = await screen.findByTestId("tools-error");
    expect(error.textContent).toContain("Could not read the library");
    expect(error.textContent).toContain("not a lost library");
  });
});
