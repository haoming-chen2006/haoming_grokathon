import { Hono } from "hono";
import {
  LibraryUnreadableError,
  UnresolvedVariableError,
  composeAgentInstructions,
  getGrokSkillStore,
  getPromptLibrary,
  resolveInjection,
} from "../services/promptLibrary";

export const libraryRoutes = new Hono();

function fail(c: any, err: unknown) {
  if (err instanceof UnresolvedVariableError) {
    return c.json({ error: err.message, code: err.code, missing: err.missing }, 400);
  }
  // A library we could not read is a server-side fault, not a bad request: answering 400 would
  // have the panel render it as "your input was wrong" over a file the user never touched.
  if (err instanceof LibraryUnreadableError) {
    return c.json({ error: err.message, code: err.code }, 500);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("not found")) return c.json({ error: message, code: "NOT_FOUND" }, 404);
  return c.json({ error: message }, 400);
}

// ------------------------------------------------------------------- skills

libraryRoutes.get("/skills", (c) => c.json(getPromptLibrary().listSkills()));

libraryRoutes.post("/skills", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(getPromptLibrary().createSkill(body), 201);
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.patch("/skills/:skillId", async (c) => {
  try {
    return c.json(getPromptLibrary().updateSkill(c.req.param("skillId"), await c.req.json()));
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.delete("/skills/:skillId", (c) => {
  try {
    getPromptLibrary().deleteSkill(c.req.param("skillId"));
    return c.body(null, 204);
  } catch (err) {
    return fail(c, err);
  }
});

/** V-042: the exact instruction text that would be handed to a Grok session. */
libraryRoutes.post("/skills/compose", async (c) => {
  try {
    const body = await c.req.json();
    return c.json({
      instructions: composeAgentInstructions({
        persona: body?.persona,
        skills: getPromptLibrary().resolveSkills(body?.skillIds ?? []),
        prompt: body?.prompt,
      }),
    });
  } catch (err) {
    return fail(c, err);
  }
});

// ------------------------------------------------------------------ prompts

libraryRoutes.get("/prompts", (c) => c.json(getPromptLibrary().listPrompts()));

libraryRoutes.post("/prompts", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(getPromptLibrary().createPrompt(body), 201);
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.patch("/prompts/:promptId", async (c) => {
  try {
    return c.json(getPromptLibrary().updatePrompt(c.req.param("promptId"), await c.req.json()));
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.delete("/prompts/:promptId", (c) => {
  try {
    getPromptLibrary().deletePrompt(c.req.param("promptId"));
    return c.body(null, 204);
  } catch (err) {
    return fail(c, err);
  }
});

/** V-043: render a template; unresolved required variables are a 400, never a silent hole. */
libraryRoutes.post("/prompts/:promptId/render", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json({
      rendered: getPromptLibrary().renderPromptById(c.req.param("promptId"), body?.values ?? {}),
    });
  } catch (err) {
    return fail(c, err);
  }
});

// ---------------------------------------------------------------- workflows

libraryRoutes.get("/workflows", (c) => c.json(getPromptLibrary().listWorkflows()));

libraryRoutes.post("/workflows", async (c) => {
  try {
    const body = await c.req.json();
    return c.json(getPromptLibrary().createWorkflow(body), 201);
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.patch("/workflows/:workflowId", async (c) => {
  try {
    return c.json(getPromptLibrary().updateWorkflow(c.req.param("workflowId"), await c.req.json()));
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.delete("/workflows/:workflowId", (c) => {
  try {
    getPromptLibrary().deleteWorkflow(c.req.param("workflowId"));
    return c.body(null, 204);
  } catch (err) {
    return fail(c, err);
  }
});

/** V-044: turn a saved workflow into an editable draft plan for a project. */
libraryRoutes.post("/workflows/:workflowId/instantiate", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    return c.json(
      getPromptLibrary().instantiateWorkflow(c.req.param("workflowId"), {
        stageNames: body?.stageNames,
        roleAssignments: body?.roleAssignments,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});

// ═══════════════════════════════════════════ skills on disk, in grok's own format (A-00)
//
// `/skills` above is the legacy `library.json` model: one string of instructions, no directory, no
// discovery prompt. Agents still reference those by id through `rulesForAgent`, so it stays.
//
// These are the real ones — grok skill directories, discovered from the roots grok itself reads, so
// a skill created here works in the terminal and a skill the user already wrote appears here with
// no import step. The panel's Skills section is built on these. See `loops/handoff/pivot-tools.md`
// §1 for the probe that settled the format.

/** The project a skill is scoped to; absent means the user-level root. */
function storeFor(c: any) {
  return getGrokSkillStore(c.req.query("projectRoot") || undefined);
}

libraryRoutes.get("/grok-skills", (c) => {
  try {
    return c.json(storeFor(c).list());
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.post("/grok-skills", async (c) => {
  try {
    return c.json(storeFor(c).create(await c.req.json()), 201);
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.patch("/grok-skills/:skillId", async (c) => {
  try {
    const body = await c.req.json();
    const store = storeFor(c);
    const id = decodeURIComponent(c.req.param("skillId"));
    // Turning a skill up or down is a different write from editing its text — one lands in
    // config.toml and the other in SKILL.md — but both are a PATCH of the same resource.
    const afterState = body.state ? store.setState(id, body.state) : store.get(id);
    const touchesText = body.description !== undefined || body.body !== undefined || body.extras !== undefined;
    return c.json(touchesText ? store.update(id, body) : afterState);
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.delete("/grok-skills/:skillId", (c) => {
  try {
    storeFor(c).remove(decodeURIComponent(c.req.param("skillId")));
    return c.body(null, 204);
  } catch (err) {
    return fail(c, err);
  }
});

/** The rest of the directory §10 calls for: a skill is more than its SKILL.md. */
libraryRoutes.put("/grok-skills/:skillId/resources/:path{.+}", async (c) => {
  try {
    const { content } = await c.req.json();
    return c.json(
      storeFor(c).writeResource(decodeURIComponent(c.req.param("skillId")), c.req.param("path"), content ?? ""),
    );
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.get("/grok-skills/:skillId/resources/:path{.+}", (c) => {
  try {
    return c.json({
      content: storeFor(c).readResource(decodeURIComponent(c.req.param("skillId")), c.req.param("path")),
    });
  } catch (err) {
    return fail(c, err);
  }
});

libraryRoutes.delete("/grok-skills/:skillId/resources/:path{.+}", (c) => {
  try {
    return c.json(
      storeFor(c).deleteResource(decodeURIComponent(c.req.param("skillId")), c.req.param("path")),
    );
  } catch (err) {
    return fail(c, err);
  }
});

// ═══════════════════════════════════════════════════ injection into a live agent (§4.5, TOOL-011)
//
// This loop RESOLVES; `01-agents` DELIVERS. This endpoint opens no session and writes into no work
// area — it answers "what would this resource be, handed to that agent?" and stops. `01-agents`
// calls `resolveInjection` directly from its own router for the delivery half.

libraryRoutes.post("/injections/resolve", async (c) => {
  try {
    const body = await c.req.json();
    if (!body?.kind || !body?.resourceId) {
      return c.json({ error: "kind and resourceId are required" }, 400);
    }
    return c.json(
      resolveInjection({
        kind: body.kind,
        resourceId: body.resourceId,
        values: body.values,
        projectId: body.projectId ?? "",
        agentId: body.agentId ?? "",
        oneShot: body.oneShot,
      }),
    );
  } catch (err) {
    return fail(c, err);
  }
});
