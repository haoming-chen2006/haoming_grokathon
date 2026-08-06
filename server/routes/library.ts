import { Hono } from "hono";
import { UnresolvedVariableError, composeAgentInstructions, getPromptLibrary } from "../services/promptLibrary";

export const libraryRoutes = new Hono();

function fail(c: any, err: unknown) {
  if (err instanceof UnresolvedVariableError) {
    return c.json({ error: err.message, code: err.code, missing: err.missing }, 400);
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
