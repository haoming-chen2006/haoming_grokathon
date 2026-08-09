/**
 * Put a design document to work.
 *
 * Starting a project already created the areas — that is `startWork` — and hiring already puts an
 * agent in a box. What did not exist was the step between "there is a team" and "the team is
 * working": every agent had to be opened by hand and told what to do, in a product whose whole
 * claim is that you write a brief and watch it get done.
 *
 * This composes each agent's own brief from the document and sends it. The composition is the
 * interesting part and it lives in `briefFor`, tested on its own, because a brief that names the
 * wrong section is how an agent writes over somebody else's work.
 *
 * **It does not wait for the replies.** A turn can run for minutes; three of them in series is an
 * HTTP request that times out while the work is going fine. Sessions are opened and briefs are
 * sent, and then this returns — the transcript, the status and the cost arrive the way they always
 * do, over the bus and the poll.
 */
import { getAcpSessionManager } from "./acpSessionManager";
import { getAgentRegistry } from "./agentRegistry";
import { getProjectStore } from "./projectStore";
import { getWorkAreaStore } from "./workArea";
import { assignArea } from "./workArea";
import type { WorkArea } from "./workArea";

export interface DispatchedAgent {
  agentId: string;
  agentName: string;
  areaId: string;
  areaName: string;
  /** True when this agent was created by the dispatch rather than hired by the user beforehand. */
  hired: boolean;
  /** Set when this agent could not be started. The others still are. */
  error?: string;
}

export interface DispatchResult {
  projectId: string;
  documentId: string;
  dispatched: DispatchedAgent[];
  /** Areas that had nobody in them and were left alone because hiring was not asked for. */
  emptyAreaNames: string[];
}

/**
 * The line the area was declared on, from the anchor `startWork` wrote.
 *
 * Returns undefined for an area added by hand, whose anchor is the words "by hand" — there is no
 * line, and pointing at line 1 would tell an agent its section is the top of the document.
 */
export function anchorLine(area: Pick<WorkArea, "briefSectionAnchor">): number | undefined {
  const match = /^L(\d+)$/.exec(area.briefSectionAnchor ?? "");
  if (!match) return undefined;
  const line = Number(match[1]);
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

/** The document, with every line numbered, so a brief and a reported range mean the same thing. */
export function numberLines(text: string): string {
  const lines = text.split("\n");
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width)} | ${line}`).join("\n");
}

/**
 * What one agent is told, and it is told about the WHOLE document.
 *
 * Handing an agent only its own section looked tempting and is wrong: every one of these briefs
 * says "read the lane above you, because its output is your input", and an agent that cannot see
 * the other lanes cannot honour that. What confines it is the sandbox and the instruction, not a
 * truncated copy of the brief — and a truncated copy would also silently drop the shared rules a
 * document states once at the top.
 *
 * The line numbers are not decoration. They are the shared coordinate system: the agent is asked to
 * report the range it is working on, the document surface highlights that range, and both are
 * counting the same lines because the brief it read was numbered.
 */
export function briefFor(params: {
  agentName: string;
  areaName: string;
  areaLine?: number;
  projectName: string;
  documentId: string;
  documentTitle: string;
  documentText: string;
}): string {
  const where =
    params.areaLine === undefined
      ? `Your area, "${params.areaName}", is not anchored to a line in the document — find the section that describes it by name.`
      : `Your area, "${params.areaName}", is declared on line ${params.areaLine}. Your section is that heading and everything under it until the next heading at the same level.`;

  return [
    `You are ${params.agentName}, working in the "${params.areaName}" area of "${params.projectName}".`,
    "",
    `# The brief: ${params.documentTitle}`,
    "",
    "Every line is numbered. The numbers are how you and the people watching refer to the same text.",
    "",
    numberLines(params.documentText),
    "",
    "# Your part of it",
    "",
    where,
    "",
    "Read the whole document, because the sections above yours produce what yours consumes. Write",
    "only in your own. If you think another area is wrong, say so — do not fix it.",
    "",
    "# Say where you are",
    "",
    `As you work, call \`report_document_focus\` with documentId "${params.documentId}" and the line`,
    "range you are on, before you read a section and again when you start writing one. Somebody is",
    "watching this document and that call is the only thing that shows them where you are.",
    "",
    "# What you produce",
    "",
    "Deliverables are created with the project tools — `create_deliverable`, `write_text`, and",
    "`generate_image` or `narrate` if your capability includes them. A file written only into your",
    "working directory is not delivered; it has to be created as a deliverable to reach the",
    "workspace's Assets.",
    "",
    "Work now. Do not ask which section to start with — it is named above.",
  ].join("\n");
}

/**
 * The capability an area's own name asks for.
 *
 * A guess, and it is made visible rather than silently: the dispatch reports every agent it hired
 * so the user can see what it chose and change it. The alternative was hiring every agent as base
 * Grok, which would leave an area plainly called "Meme Production" unable to make an image, and
 * the user discovering that only from a failed tool call several minutes in.
 */
export function capabilityForArea(name: string): { images: boolean; voice: boolean } | undefined {
  const text = name.toLowerCase();
  const images = /\b(image|imagine|meme|slide|deck|visual|picture|photo|art|design|video|frame)/.test(text);
  const voice = /\b(voice|narrat|audio|speech|podcast|voiceover|video)/.test(text);
  return images || voice ? { images, voice } : undefined;
}

/** A role from an area name, so a hired agent's card does not read "Agent". */
function roleForArea(name: string): string {
  return name.trim() || "Contributor";
}

export function dispatchWork(params: {
  projectId: string;
  documentId: string;
  /** Hire one agent into every area that has none. Off means those areas are reported, not filled. */
  hire: boolean;
}): DispatchResult {
  const project = getProjectStore().getProject(params.projectId);
  const registry = getAgentRegistry();
  const areas = getWorkAreaStore().list(params.projectId);

  // The project's own copy of the brief, which `startWork` filled from the document it followed.
  // A document is versioned, and the CURRENT version is the one an agent must be briefed from —
  // briefing from `versions[0]` would hand out the paste the user has since edited.
  const doc = project.document;
  const current = doc?.versions?.find((v) => v.version === doc.currentVersion) ?? doc?.versions?.[0];
  const documentText = current?.content ?? "";
  const documentTitle = doc?.title ?? project.name;

  const dispatched: DispatchedAgent[] = [];
  const emptyAreaNames: string[] = [];

  for (const area of areas) {
    let inside = registry.list(params.projectId).filter((a) => a.areaId === area.id);

    if (inside.length === 0) {
      if (!params.hire) {
        emptyAreaNames.push(area.name);
        continue;
      }
      try {
        const capabilities = capabilityForArea(area.name);
        const created = registry.create({
          projectId: params.projectId,
          name: area.name,
          role: roleForArea(area.name),
          ...(capabilities ? { capabilities } : {}),
        });
        assignArea(created.id, area.id);
        inside = [registry.get(created.id)];
        dispatched.push({
          agentId: created.id,
          agentName: created.name,
          areaId: area.id,
          areaName: area.name,
          hired: true,
        });
      } catch (err) {
        emptyAreaNames.push(area.name);
        continue;
      }
    } else {
      for (const agent of inside) {
        dispatched.push({
          agentId: agent.id,
          agentName: agent.name,
          areaId: area.id,
          areaName: area.name,
          hired: false,
        });
      }
    }

    const brief = (agentName: string) =>
      briefFor({
        agentName,
        areaName: area.name,
        areaLine: anchorLine(area),
        projectName: project.name,
        documentId: params.documentId,
        documentTitle,
        documentText,
      });

    for (const agent of inside) {
      const record = dispatched.find((d) => d.agentId === agent.id);
      try {
        // Opening is awaited — it is a spawn and a handshake, and a failure here is the one the
        // user must be told about immediately, because nothing else will happen.
        void getAcpSessionManager()
          .open(agent.id)
          .then(() =>
            // Deliberately not awaited: a turn runs for minutes and three in series would time the
            // request out while the work was going fine.
            getAcpSessionManager().send(agent.id, brief(agent.name)),
          )
          .catch((err) => {
            // The agent's own status carries the failure, which is where the board reads it.
            try {
              registry.setStatus(
                agent.id,
                "failed",
                err instanceof Error ? err.message : String(err),
              );
            } catch {}
          });
      } catch (err) {
        if (record) record.error = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return { projectId: params.projectId, documentId: params.documentId, dispatched, emptyAreaNames };
}
