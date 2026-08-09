/**
 * Drafting a design document with an X agent.
 *
 * A project can now be created before anyone has written its brief, which leaves a real gap: the
 * user knows what they want and the product's only way in was a document they had not written. This
 * turns a sentence into a document that PARSES — the fenced `project` block included — so the areas
 * it declares become the board's boxes with no further editing.
 *
 * It generates and returns text. It does not save, and it does not start work: the draft is the
 * agent's, and what lands on disk is the user's decision, taken after reading it. An agent that
 * silently wrote the brief its own team then works from is exactly the review gate this product
 * exists to keep.
 */
import { xaiClient, type XaiResponse } from "./xai/client";
import { DECLARATION_CATEGORIES, parseDeclaration, type DeclarationCategory } from "./designDoc";

/**
 * The drafting model.
 *
 * Overridable because this repository pins no text model anywhere else and guessing one in a
 * constant is how an unverified name becomes a fact. `grok-4.5` is what `~/.grok/config.toml` names
 * on this machine, so it is the default rather than an invention.
 */
export function draftModel(): string {
  return process.env.XAI_DRAFT_MODEL ?? "grok-4.5";
}

/**
 * Who the spend belongs to.
 *
 * Not one of the project's hired agents: nobody hires a drafter, and attributing the cost to an
 * agent the user chose would misreport whose work it was. It is the product's own assistant.
 */
export const DRAFTER_AGENT_ID = "design-doc-drafter";

/** Shape of the chat completion we read. Only the fields used are declared. */
interface ChatCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
}

export interface DraftResult {
  /** The document, ready to be read, edited and saved. Never written to disk here. */
  text: string;
  /**
   * Whether the draft DECLARES the project — a valid `project` block that yields a declaration.
   *
   * Not `declaration.ok`. A document containing no block at all parses perfectly well and declares
   * nothing: `ok: true`, no errors, no declaration. Reporting that as success told the user their
   * draft was ready when it would produce a project with no areas and therefore a board with no
   * boxes. The question this surface has to answer is "will this declare the work", and only a
   * present declaration answers it.
   */
  declares: boolean;
  errors: Array<{ line: number; message: string }>;
  costUsd: number | null;
  model: string;
}

const SYSTEM = [
  "You write design documents for a workspace that turns them into supervised agent work.",
  "",
  "Return ONE markdown document and nothing else — no preamble, no explanation, no code fence",
  "around the whole thing.",
  "",
  "The document MUST contain a fenced block tagged `project`, exactly this shape:",
  "",
  "```project",
  "name: <the project's name>",
  `category: <one of: ${DECLARATION_CATEGORIES.join(", ")}>`,
  "budget: <a number of US dollars>",
  "areas:",
  "  - <Area name>: <what this part of the work covers>",
  "  - <Area name>: <what this part of the work covers>",
  "```",
  "",
  "Rules that matter:",
  "- `category` must be exactly one of the listed words. Pick the kind of thing the project MAKES.",
  "- Each area is one part of the work that one agent can own end to end. Two to five of them.",
  "- Around the block, write a short brief: what this is, who it is for, and a",
  "  '## What good looks like' section saying how you would know it is finished.",
  "- Write what the user asked for. Do not invent scope they did not ask for, and do not pad.",
].join("\n");

function promptFor(params: { projectName: string; brief: string; existing?: string }): string {
  const lines = [`Project name: ${params.projectName}`, "", `What the user wants:`, params.brief];
  if (params.existing?.trim()) {
    lines.push(
      "",
      "There is already a draft. Revise it to take the above into account, keeping what still holds:",
      "",
      params.existing,
    );
  }
  return lines.join("\n");
}

/** The model's reply, or a sentence naming why there is none. Never a half-parsed object. */
function textOf(res: XaiResponse<ChatCompletion>): string {
  const content = res.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("The drafting agent returned no text. Nothing was saved; try again.");
  }
  return content.trim();
}

/**
 * Ask the agent for a document.
 *
 * The result carries its own parse verdict rather than being rejected on failure: a draft whose
 * block is malformed is still the user's best starting point, and throwing it away to report a
 * line number would lose the whole document. The surface shows the errors beside the text.
 */
export async function draftDesignDocument(params: {
  projectName: string;
  brief: string;
  existing?: string;
  projectId?: string;
}): Promise<DraftResult> {
  const model = draftModel();
  const res = await xaiClient().request<ChatCompletion>({
    endpoint: "chat",
    path: "/chat/completions",
    method: "POST",
    body: {
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: promptFor(params) },
      ],
    },
    // `context`, not `billing`. Billing carries a published per-unit rate and a unit count, and
    // this call has neither: the token count is not known before the request and no rate for a
    // text model is recorded anywhere in this repository. `costUsd` still comes back from the
    // ticks the response reports, which is a measured figure rather than a computed one.
    ...(params.projectId
      ? { context: { projectId: params.projectId, agentId: DRAFTER_AGENT_ID } }
      : {}),
  });

  const text = textOf(res);
  const declaration = parseDeclaration(text);
  return {
    text,
    declares: declaration.ok && declaration.declaration !== undefined,
    // A document with no block has no errors to report; the surface says "declares nothing" from
    // `declares` rather than inferring it from an empty list.
    errors: declaration.errors,
    costUsd: res.costUsd,
    model,
  };
}

/** Exported for the route's 400, so the caller is told the valid words rather than guessing. */
export const CATEGORIES: readonly DeclarationCategory[] = DECLARATION_CATEGORIES;
