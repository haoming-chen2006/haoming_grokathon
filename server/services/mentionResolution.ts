/**
 * Turning an `@`-mention the user typed into something the agent can act on.
 *
 * ── What was broken ───────────────────────────────────────────────────────────────────────────
 * `acpSessionManager.send` passed the user's draft to `session/prompt` verbatim. A person who
 * picked two PDFs out of the mention picker sent this:
 *
 * ```text
 * summarise [@Musk_v_Altman_Case_Analysis.pdf](asset:asset_msl4a82c3to8pho)
 * ```
 *
 * and the agent received exactly that: a markdown link, a scheme that means nothing outside this
 * product, and an opaque id. It had no tool that took an asset id, no path, and no way to discover
 * either. The picker worked, the link rendered, the mention was decoration.
 *
 * ── What this does ────────────────────────────────────────────────────────────────────────────
 * Appends a short resolved block naming each mentioned deliverable and the tool that opens it. The
 * user's own text is never rewritten — it is what they wrote and it is what the transcript shows —
 * so the block goes after it, clearly attributed to the control room rather than to the person.
 *
 * ── The id is checked against the project ─────────────────────────────────────────────────────
 * A mention naming another project's asset resolves to "could not be resolved", the same answer a
 * deleted one gets, which is `mcp/media.ts`'s rule and for its reason: an agent that could tell the
 * two apart could probe another project's ids one message at a time. Here the caller is a user
 * rather than an agent, but the text lands in an agent's context either way.
 *
 * ── Design documents ──────────────────────────────────────────────────────────────────────────
 * `doc:` mentions are listed by id and nothing more. The honest reason is that there is no tool to
 * point them at: `get_technical_design` takes no id and reads the *project store's* document, which
 * is a different record from the ones on the DESIGN DOCUMENTS page. Naming a tool that would answer
 * about a different document is worse than saying it is not reachable yet.
 */
import { uniqueMentions, type Mention } from "../../shared/mentions";
import { AssetNotFoundError, getAssetStore, type Asset, type AssetStore } from "./assetStore";

/** One mention, after we went and looked. */
export interface ResolvedMention {
  mention: Mention;
  /** Absent when the id names nothing this project can see. */
  asset?: Asset;
}

export function resolveMentions(
  text: string,
  projectId: string,
  store: AssetStore = getAssetStore(),
): ResolvedMention[] {
  return uniqueMentions(text).map((mention) => {
    if (mention.kind !== "asset") return { mention };
    try {
      const asset = store.getAsset(mention.id);
      // Belongs to another project: unresolved, indistinguishably from missing. See the header.
      if (asset.projectId !== projectId) return { mention };
      return { mention, asset };
    } catch (err) {
      if (err instanceof AssetNotFoundError) return { mention };
      throw err;
    }
  });
}

/** One deliverable, described in the one line an agent needs to go and open it. */
function assetLine(asset: Asset): string {
  const files = asset.files.length === 1 ? "1 file" : `${asset.files.length} files`;
  const kinds = [...new Set(asset.files.map((f) => f.mime))].join(", ");
  const detail = asset.files.length ? `${files}: ${kinds}` : "no files on it yet";
  return `- ${asset.id} — "${asset.title}" (${asset.type}, ${detail}). Open it with read_deliverable.`;
}

/**
 * The block appended to a message that mentions something, or empty when it mentions nothing.
 *
 * Empty is the common case and it must cost nothing: the overwhelming majority of messages contain
 * no mention at all, and a footer explaining that would be noise in every one of them.
 */
export function mentionBlock(resolved: ResolvedMention[]): string {
  if (resolved.length === 0) return "";

  const assets = resolved.filter((r) => r.asset).map((r) => r.asset!);
  const docs = resolved.filter((r) => r.mention.kind === "doc").map((r) => r.mention);
  const missing = resolved.filter((r) => r.mention.kind === "asset" && !r.asset).map((r) => r.mention);

  const lines: string[] = [];
  if (assets.length) {
    lines.push(
      "Deliverables referenced above, on this project's ASSETS page:",
      ...assets.map(assetLine),
    );
  }
  if (docs.length) {
    lines.push(
      "",
      "Design documents referenced above. There is no agent tool that reads one by id yet — say so " +
        "rather than guessing at their contents:",
      ...docs.map((m) => `- ${m.id} (written as "${m.label}")`),
    );
  }
  if (missing.length) {
    lines.push(
      "",
      "Referenced above and not found on this project. Do not invent what they contain:",
      ...missing.map((m) => `- ${m.id} (written as "${m.label}")`),
    );
  }
  if (lines.length === 0) return "";

  // Fenced off and attributed. An agent reading its own context has to be able to tell what the
  // person wrote from what we added underneath, or it will quote our sentences back as theirs.
  return ["", "---", "[resolved by the control room, not written by the user]", ...lines].join("\n");
}

/** The text to send: what the user wrote, plus the resolved block when there is one. */
export function withResolvedMentions(
  text: string,
  projectId: string,
  store?: AssetStore,
): string {
  const block = mentionBlock(resolveMentions(text, projectId, store));
  return block ? `${text}\n${block}` : text;
}
