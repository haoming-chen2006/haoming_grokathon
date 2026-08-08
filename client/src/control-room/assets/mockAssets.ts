/**
 * MOCK DATA — DELETE THIS FILE WHEN `/api/assets` IS WIRED.
 *
 * Everything the ASSETS page renders today comes from here and from nowhere else. It exists so the
 * page can be looked at before `server/routes/assets.ts` exists; it is not a fixture, not a seed,
 * and nothing may come to depend on it.
 *
 * Deleting it is meant to be a two-step job with no archaeology:
 *   1. delete this file;
 *   2. `useAssets()` in ./useAssets.ts is the only importer — point it at `GET /api/assets`.
 *
 * The shapes are `Asset`, `AssetFile`, `AssetCharge`, `AssetVersion` and `AssetDeclaredBy` from
 * `server/services/assetStore.ts`, copied structurally rather than imported: the client must not
 * import a server module, and the real fix is the HTTP surface, not a shared type.
 *
 * Two honesty rules the fake data deliberately keeps, because a mock that lies teaches the page to
 * render a lie:
 *   - `costUsd: null` with `costSource: "unknown"` appears on the video, because no Grok model has
 *     a rate yet. It renders as "unknown", never as $0.00.
 *   - the uploaded asset has NO `producedByAgentId` and NO `capability`. An absent field is
 *     omitted by the inspector rather than defaulted to a plausible agent.
 */

export type MockAssetType = "document" | "slides" | "table" | "workflow" | "software";
export type MockCapability = "base" | "images" | "voice" | "voice+images";
export type MockOrigin = "generated" | "uploaded" | "imported";

export interface MockCharge {
  id: string;
  operation: string;
  modelId: string;
  rateKey: string | null;
  costUsd: number | null;
  costSource: "billed" | "estimated" | "unknown";
  units?: { kind: "images" | "video_seconds" | "characters" | "tokens"; count: number };
}

export interface MockFile {
  id: string;
  role: string;
  path: string;
  bytes: number;
  mime: string;
  durationSec?: number;
}

export interface MockAsset {
  id: string;
  projectId: string;
  type: MockAssetType;
  title: string;
  origin: MockOrigin;
  producedByAgentId?: string;
  producedByAgentName?: string;
  capability?: MockCapability;
  declaredBy?: {
    designDocId: string;
    designDocTitle: string;
    designDocVersion: number;
    lineStart: number;
    lineEnd: number;
    stale: boolean;
  };
  files: MockFile[];
  charges: MockCharge[];
  currentVersion: number;
  versions: { version: number; authorId: string; changeSummary?: string; createdAt: string }[];
  readBy?: { agentName: string; at: string }[];
  updatedAt: string;
  /** Type-specific body used only to draw a preview that looks like the thing itself. */
  body: MockBody;
}

export type MockBody =
  | { kind: "document"; headings: string[]; paragraphs: number[] }
  | { kind: "slides"; slides: { title: string; bullets: number; hasImage: boolean }[] }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "workflow"; steps: { name: string; state: "done" | "running" | "todo" }[]; loops: number }
  | { kind: "software"; entry: string; tree: { path: string; bytes: number }[] };

const PROJECT = "proj_aeris";

export const MOCK_ASSETS: MockAsset[] = [
  {
    id: "asset_overall_sale_doc",
    projectId: PROJECT,
    type: "document",
    title: "overall_sale_doc",
    origin: "generated",
    producedByAgentId: "agent_scribe",
    producedByAgentName: "Scribe",
    capability: "base",
    declaredBy: {
      designDocId: "doc_chair_launch",
      designDocTitle: "chair_launch_plan",
      designDocVersion: 4,
      lineStart: 12,
      lineEnd: 28,
      stale: false,
    },
    files: [{ id: "f1", role: "body", path: "overall_sale_doc.md", bytes: 8140, mime: "text/markdown" }],
    charges: [
      {
        id: "c1",
        operation: "turn",
        modelId: "grok-4",
        rateKey: null,
        costUsd: 0.31,
        costSource: "estimated",
        units: { kind: "tokens", count: 41200 },
      },
    ],
    currentVersion: 3,
    versions: [
      { version: 1, authorId: "agent_scribe", changeSummary: "First draft from the plan", createdAt: "2026-08-08T09:02:00Z" },
      { version: 2, authorId: "agent_scribe", changeSummary: "Pricing section rewritten", createdAt: "2026-08-08T10:41:00Z" },
      { version: 3, authorId: "agent_scribe", changeSummary: "Objection handling added", createdAt: "2026-08-08T13:20:00Z" },
    ],
    readBy: [{ agentName: "Reel", at: "now" }],
    updatedAt: "2026-08-08T13:20:00Z",
    body: {
      kind: "document",
      headings: ["The pitch in one line", "Who we are selling to", "Pricing", "Handling objections"],
      paragraphs: [3, 2, 4, 3],
    },
  },
  {
    id: "asset_sales_deck",
    projectId: PROJECT,
    type: "slides",
    title: "sales_deck_for_chairs",
    origin: "generated",
    producedByAgentId: "agent_slidewright",
    producedByAgentName: "Slidewright",
    capability: "images",
    declaredBy: {
      designDocId: "doc_chair_launch",
      designDocTitle: "chair_launch_plan",
      designDocVersion: 3,
      lineStart: 30,
      lineEnd: 44,
      stale: true,
    },
    files: [
      { id: "f2", role: "deck", path: "sales_deck_for_chairs.pptx", bytes: 2_410_880, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
      { id: "f3", role: "slide", path: "media/hero.png", bytes: 512_004, mime: "image/png" },
    ],
    charges: [
      { id: "c2", operation: "turn", modelId: "grok-4", rateKey: null, costUsd: 0.44, costSource: "estimated", units: { kind: "tokens", count: 58000 } },
      { id: "c3", operation: "image_generation", modelId: "grok-2-image", rateKey: "grok-2-image", costUsd: 0.61, costSource: "billed", units: { kind: "images", count: 6 } },
    ],
    currentVersion: 2,
    versions: [
      { version: 1, authorId: "agent_slidewright", changeSummary: "14 slides from the document", createdAt: "2026-08-08T11:15:00Z" },
      { version: 2, authorId: "agent_slidewright", changeSummary: "Hero images regenerated", createdAt: "2026-08-08T12:50:00Z" },
    ],
    updatedAt: "2026-08-08T12:50:00Z",
    body: {
      kind: "slides",
      slides: [
        { title: "Aeris Chairs", bullets: 0, hasImage: true },
        { title: "The problem with office seating", bullets: 3, hasImage: false },
        { title: "How Aeris is different", bullets: 4, hasImage: true },
        { title: "Pricing", bullets: 3, hasImage: false },
        { title: "What happens next", bullets: 2, hasImage: false },
      ],
    },
  },
  {
    id: "asset_price_list",
    projectId: PROJECT,
    type: "table",
    title: "chair_price_list",
    origin: "generated",
    producedByAgentId: "agent_ledger",
    producedByAgentName: "Ledger",
    capability: "base",
    declaredBy: {
      designDocId: "doc_chair_launch",
      designDocTitle: "chair_launch_plan",
      designDocVersion: 4,
      lineStart: 46,
      lineEnd: 52,
      stale: false,
    },
    files: [{ id: "f4", role: "sheet", path: "chair_price_list.xlsx", bytes: 18_220, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    charges: [{ id: "c4", operation: "turn", modelId: "grok-4", rateKey: null, costUsd: 0.12, costSource: "estimated", units: { kind: "tokens", count: 16400 } }],
    currentVersion: 1,
    versions: [{ version: 1, authorId: "agent_ledger", changeSummary: "Priced from the supplier sheet", createdAt: "2026-08-08T11:58:00Z" }],
    updatedAt: "2026-08-08T11:58:00Z",
    body: {
      kind: "table",
      columns: ["Model", "Finish", "List", "Trade", "Lead time"],
      rows: [
        ["Aeris One", "Graphite", "$740", "$592", "3 weeks"],
        ["Aeris One", "Bone", "$740", "$592", "3 weeks"],
        ["Aeris Task", "Graphite", "$515", "$412", "2 weeks"],
        ["Aeris Task", "Moss", "$515", "$412", "5 weeks"],
        ["Aeris Stool", "Graphite", "$305", "$244", "In stock"],
      ],
    },
  },
  {
    id: "asset_demo_video",
    projectId: PROJECT,
    type: "workflow",
    title: "sale_demo_video",
    origin: "generated",
    producedByAgentId: "agent_reel",
    producedByAgentName: "Reel",
    capability: "voice+images",
    declaredBy: {
      designDocId: "doc_chair_launch",
      designDocTitle: "chair_launch_plan",
      designDocVersion: 4,
      lineStart: 54,
      lineEnd: 71,
      stale: false,
    },
    files: [
      { id: "f5", role: "video", path: "sale_demo_video.mp4", bytes: 41_800_112, mime: "video/mp4", durationSec: 60 },
      { id: "f6", role: "narration", path: "media/narration.mp3", bytes: 962_400, mime: "audio/mpeg", durationSec: 60 },
    ],
    charges: [
      { id: "c5", operation: "video_generation", modelId: "grok-video-1", rateKey: null, costUsd: null, costSource: "unknown", units: { kind: "video_seconds", count: 60 } },
      { id: "c6", operation: "tts", modelId: "grok-tts-1", rateKey: null, costUsd: null, costSource: "unknown", units: { kind: "characters", count: 1180 } },
    ],
    currentVersion: 3,
    versions: [
      { version: 1, authorId: "agent_reel", changeSummary: "Script and storyboard", createdAt: "2026-08-08T12:05:00Z" },
      { version: 2, authorId: "agent_reel", changeSummary: "Re-cut after goal review", createdAt: "2026-08-08T12:44:00Z" },
      { version: 3, authorId: "agent_reel", changeSummary: "Narration re-recorded", createdAt: "2026-08-08T13:31:00Z" },
    ],
    updatedAt: "2026-08-08T13:31:00Z",
    body: {
      kind: "workflow",
      steps: [
        { name: "Script", state: "done" },
        { name: "Storyboard", state: "done" },
        { name: "Render", state: "running" },
      ],
      loops: 3,
    },
  },
  {
    id: "asset_configurator",
    projectId: PROJECT,
    type: "software",
    title: "chair_configurator",
    origin: "generated",
    producedByAgentId: "agent_forge",
    producedByAgentName: "Forge",
    capability: "base",
    files: [
      { id: "f7", role: "entry", path: "index.html", bytes: 2_140, mime: "text/html" },
      { id: "f8", role: "source", path: "src/App.tsx", bytes: 9_802, mime: "text/typescript" },
      { id: "f9", role: "source", path: "src/config.ts", bytes: 1_450, mime: "text/typescript" },
      { id: "f10", role: "style", path: "src/styles.css", bytes: 3_310, mime: "text/css" },
    ],
    charges: [{ id: "c7", operation: "turn", modelId: "grok-4", rateKey: null, costUsd: 4.06, costSource: "estimated", units: { kind: "tokens", count: 512_000 } }],
    currentVersion: 7,
    versions: [{ version: 7, authorId: "agent_forge", changeSummary: "Finish picker wired to the price list", createdAt: "2026-08-08T13:05:00Z" }],
    updatedAt: "2026-08-08T13:05:00Z",
    body: {
      kind: "software",
      entry: "index.html",
      tree: [
        { path: "index.html", bytes: 2_140 },
        { path: "src/App.tsx", bytes: 9_802 },
        { path: "src/config.ts", bytes: 1_450 },
        { path: "src/styles.css", bytes: 3_310 },
      ],
    },
  },
  {
    id: "asset_showroom_shots",
    projectId: PROJECT,
    type: "document",
    title: "showroom_shot_list",
    origin: "uploaded",
    // No producedByAgentId and no capability: a user uploaded this. The inspector omits both
    // rather than inventing an agent, which is the rule AgentCard.tsx follows for every field.
    files: [{ id: "f11", role: "body", path: "showroom_shot_list.md", bytes: 1_902, mime: "text/markdown" }],
    charges: [],
    currentVersion: 1,
    versions: [{ version: 1, authorId: "user", changeSummary: "Uploaded", createdAt: "2026-08-08T08:40:00Z" }],
    updatedAt: "2026-08-08T08:40:00Z",
    body: {
      kind: "document",
      headings: ["Shots we still need", "Locations"],
      paragraphs: [4, 2],
    },
  },
];

/** The five types in the order the navigator lists them, with the plain-language label each uses. */
export const TYPE_LABELS: Record<MockAssetType, string> = {
  document: "Documents",
  slides: "Slides",
  table: "Tables",
  workflow: "Workflows",
  software: "Software",
};

export const TYPE_ORDER: MockAssetType[] = ["document", "slides", "table", "workflow", "software"];
