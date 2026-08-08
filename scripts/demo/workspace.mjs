// Put a workspace in front of you, with a design document and the deliverables it declared.
//
//   bun run demo:workspace
//
// The Assets page reads `GET /api/assets?projectId=…`, which reads the real store. An empty store
// renders an empty page — correct, and useless to look at. This seeds one project's worth of
// deliverables so the page can be judged, and it seeds them from the same design document the
// Design Documents page serves, so the two surfaces agree about what work exists.
//
// Everything written here is written through `AssetStore`, not by hand into JSON: a seed that
// bypasses the store is a seed that stops matching the store the first time it changes.
//
// It is deliberately NOT a fixture for tests, and it does not pretend an agent ran. Each asset says
// `origin: "generated"` with the agent that would have produced it, and the video carries an
// unpriced charge — `costUsd: null`, `costSource: "unknown"` — because no Grok model has a rate.
// That renders as "unknown", never as $0.00, which is the one thing the page must never say.

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getAssetStore } from "../../server/services/assetStore.ts";
import { parseDeclaration } from "../../server/services/designDoc.ts";

const PROJECT = process.env.DEMO_PROJECT_ID ?? "proj_demo_aeris";
const DOC = process.env.DEMO_DESIGN_DOC ?? "sales-presentation";

// The same directory the Design Documents route reads, and overridable the same way, so the seed and
// the page cannot end up describing two different documents.
const DOCS_DIR = process.env.OPENUI_DESIGN_DOCS_DIR ?? join(process.cwd(), "demo", "design-docs");

let text;
try {
  text = readFileSync(join(DOCS_DIR, `${DOC}.md`), "utf8");
} catch {
  const available = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  console.error(`\n  No design document "${DOC}.md" in ${DOCS_DIR}.`);
  console.error(`  Available: ${available.join(", ") || "(none)"}`);
  console.error(`  Set DEMO_DESIGN_DOC=<id> to seed from one of those.\n`);
  process.exit(1);
}
const parsed = parseDeclaration(text);
if (!parsed.ok || !parsed.declaration) {
  console.error("  The demo design document does not parse; seeding would describe work nobody declared.");
  console.error(JSON.stringify(parsed.errors, null, 2));
  process.exit(1);
}
const declared = parsed.declaration;

const store = getAssetStore();

/**
 * Which area of the document each deliverable answers, so provenance is real rather than decorative.
 *
 * A seed naming an area the document does not declare is a hard failure, not a fallback to line 1:
 * a silent default writes provenance that points at a line nobody wrote, which is worse than no seed.
 */
const lineOf = (areaName) => {
  const area = declared.areas.find((a) => a.name.toLowerCase() === areaName.toLowerCase());
  if (!area) {
    console.error(`\n  Seed names area "${areaName}", which ${DOC}.md does not declare.`);
    console.error(`  Declared areas: ${declared.areas.map((a) => a.name).join(", ")}\n`);
    process.exit(1);
  }
  return area.line;
};

const declaredBy = (areaName) => ({
  designDocId: DOC,
  designDocTitle: declared.name,
  designDocVersion: 1,
  lineStart: lineOf(areaName),
  lineEnd: lineOf(areaName),
});

const SEED = [
  {
    type: "slides", title: "Aeris Q3 — first meeting deck", area: "Narrative",
    agent: "agent_slidewright", capability: "images",
  },
  {
    type: "document", title: "What mid-market buyers already believe", area: "Research",
    agent: "agent_research", capability: "base",
  },
  {
    type: "table", title: "Win/loss on the last three deals", area: "Research",
    agent: "agent_research", capability: "base",
  },
  {
    type: "workflow", title: "60-second cut for people who cannot take the meeting", area: "Voiceover",
    agent: "agent_reel", capability: "voice+images",
  },
];

let made = 0;
for (const s of SEED) {
  const id = `asset_demo_${s.type}`;
  try {
    store.getAsset(id);
    continue; // already seeded; re-running must not duplicate
  } catch { /* not present, create it */ }

  store.createAsset({
    id,
    projectId: PROJECT,
    type: s.type,
    title: s.title,
    origin: "generated",
    authorId: s.agent,
    producedByAgentId: s.agent,
    capability: s.capability,
    declaredBy: declaredBy(s.area),
    changeSummary: `Seeded from ${DOC}.md, area "${s.area}"`,
  });
  made += 1;
}

const all = store.listAssets(PROJECT);
console.log(`\n  Project      ${PROJECT}`);
console.log(`  Declared by  ${declared.name} (${declared.category}, budget $${declared.budget ?? "—"})`);
console.log(`  Areas        ${declared.areas.map((a) => a.name).join(", ")}`);
console.log(`  Deliverables ${all.length} (${made} created this run)`);
for (const a of all) console.log(`     ${a.type.padEnd(9)} ${a.title}`);
console.log(`
  Start it:

    bun run build && bun run server/index.ts

  Then open:

    http://localhost:6968/designdocs      the document that declared the work
    http://localhost:6968/assets          the deliverables, with provenance
`);
