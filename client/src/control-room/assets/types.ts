/**
 * What the ASSETS page believes about the records it renders.
 *
 * This file is what is left of `mockAssets.ts` after the fake shelf was deleted. That module held
 * four invented deliverables — a document, a deck, a video and a repository, with invented costs
 * and invented provenance — so a project with nothing in it looked like a project with four
 * things in it. The shapes it declared were real and are kept; the data it declared is gone.
 *
 * The shapes are `Asset`, `AssetFile`, `AssetCharge`, `AssetVersion` and `AssetDeclaredBy` from
 * `server/services/assetStore.ts`, copied structurally rather than imported: the client must not
 * import a server module, and `GET /api/assets` is the surface both sides agree on.
 *
 * Two honesty rules the shapes themselves enforce:
 *   - `costUsd: null` with `costSource: "unknown"` means the model could not be priced. It renders
 *     as "unknown", never as $0.00, and a 60-second generated video is ~$5.52 of media, so the
 *     difference is not academic.
 *   - `producedByAgentId` and `capability` are OPTIONAL, because an uploaded asset has neither.
 *     An absent field is omitted rather than defaulted to a plausible agent.
 */

export type AssetType = "document" | "slides" | "table" | "workflow" | "software";
export type AssetCapability = "base" | "images" | "voice" | "voice+images";
export type AssetOrigin = "generated" | "uploaded" | "imported";

export interface AssetCharge {
  id: string;
  operation: string;
  modelId: string;
  rateKey: string | null;
  costUsd: number | null;
  costSource: "billed" | "estimated" | "unknown";
  units?: { kind: "images" | "video_seconds" | "characters" | "tokens"; count: number };
}

export interface AssetFile {
  id: string;
  role: string;
  path: string;
  bytes: number;
  mime: string;
  durationSec?: number;
}

export interface AssetView {
  id: string;
  projectId: string;
  type: AssetType;
  title: string;
  origin: AssetOrigin;
  producedByAgentId?: string;
  producedByAgentName?: string;
  capability?: AssetCapability;
  declaredBy?: {
    designDocId: string;
    designDocTitle: string;
    designDocVersion: number;
    lineStart: number;
    lineEnd: number;
    stale: boolean;
  };
  files: AssetFile[];
  charges: AssetCharge[];
  currentVersion: number;
  versions: { version: number; authorId: string; changeSummary?: string; createdAt: string }[];
  readBy?: { agentName: string; at: string }[];
  updatedAt: string;
  /** Type-specific body used only to draw a preview that looks like the thing itself. */
  body: AssetBody;
}

export type AssetBody =
  | { kind: "document"; headings: string[]; paragraphs: number[] }
  | { kind: "slides"; slides: { title: string; bullets: number; hasImage: boolean }[] }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "workflow"; steps: { name: string; state: "done" | "running" | "todo" }[]; loops: number }
  | { kind: "software"; entry: string; tree: { path: string; bytes: number }[] };

/** The five types in the order the navigator lists them, with the plain-language label each uses. */
export const TYPE_LABELS: Record<AssetType, string> = {
  document: "Documents",
  slides: "Slides",
  table: "Tables",
  workflow: "Workflows",
  software: "Software",
};

export const TYPE_ORDER: AssetType[] = ["document", "slides", "table", "workflow", "software"];

/**
 * The chips the mockup prints above the list: All · Docs · Slides · Video · More…
 *
 * "Video" is not one of the five types, and that is not an inconsistency to be tidied away. A
 * video is a `workflow` deliverable — the mockup's own `sale_demo_video` card says
 * "VIDEO · 60s · WORKFLOW" — so the chip is a lens over the types rather than a sixth type. The
 * chip vocabulary is the user's; the type vocabulary is the store's; this table is the join.
 */
export interface AssetChip {
  id: string;
  label: string;
  /** The types this chip admits. `undefined` means every type. */
  types?: AssetType[];
}

export const ASSET_CHIPS: AssetChip[] = [
  { id: "all", label: "All" },
  { id: "docs", label: "Docs", types: ["document", "table"] },
  { id: "slides", label: "Slides", types: ["slides"] },
  { id: "video", label: "Video", types: ["workflow"] },
  { id: "more", label: "More…", types: ["software"] },
];

export function chipAdmits(chip: AssetChip, type: AssetType): boolean {
  return !chip.types || chip.types.includes(type);
}
