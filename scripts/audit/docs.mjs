// Documentation-integrity audit — do the evidence ledger's citations still resolve?
//
//   bun run audit:docs
//
// VERIFICATION.md is the project's deliverable: ~3,200 lines asserting what was verified and how.
// Its value depends entirely on a reader being able to follow it. Over fifty iterations the code
// moved repeatedly and nothing re-checked the citations, so the ledger could — and did — tell a
// reader to look at a file that no longer exists.
//
// This checks the mechanically checkable claims: every source file and every `bun run` script the
// docs name must resolve. It cannot check whether the prose is *true*; that is what the tests and
// the other audits are for.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
/**
 * Documents whose file citations are *evidence* and must resolve.
 *
 * product-design.md and verifiables.md are specifications full of illustrative examples
 * (`src/auth/session.ts` and the like). Those are not claims about this repository, so checking
 * them would produce noise and train the reader to ignore this audit.
 */
const DOCS = ["VERIFICATION.md", "loopdesign.md", "README.md"];

/** Scripts are checked everywhere, since a documented command either exists or it does not. */
const SCRIPT_DOCS = [...DOCS, "product-design.md", "verifiables.md"];

/**
 * Citations that legitimately do not resolve to a file in this repository. Each needs a reason —
 * an unexplained entry here is how a real stale reference gets hidden.
 */
const CLASSIFIED = new Map([
  ["agents.json", "a runtime data file in the OPENUI_DATA_DIR, not a repository path"],
  ["scratchpad/v052.mjs", "the pre-iteration-43 location, cited in the narrative that describes moving it"],
  ["Cargo.toml", "in the cloned grok-build reference repo under .refs/, which is gitignored"],
  ["rust-toolchain.toml", "in the cloned grok-build reference repo under .refs/, which is gitignored"],
]);

function tracked() {
  const out = (cmd) => {
    try { return execSync(cmd, { cwd: ROOT }).toString().split("\n").filter(Boolean); } catch { return []; }
  };
  return [...out("git ls-files"), ...out("git ls-files --others --exclude-standard")];
}

const files = tracked();
const byBasename = new Map();
for (const f of files) {
  const base = f.split("/").pop();
  if (!byBasename.has(base)) byBasename.set(base, []);
  byBasename.get(base).push(f);
}

/**
 * The docs cite files both fully (`server/services/repository.ts`) and by bare name
 * (`repository.test.ts`). A bare name resolves if some tracked file has it; a path with
 * directories must match a real suffix, so `scratchpad/v052.mjs` does not resolve just because
 * a `v052.mjs` exists elsewhere. A first version of this check ignored that and reported 38
 * false positives, nearly all of them bare filenames that were perfectly fine.
 */
function resolves(cited) {
  if (existsSync(join(ROOT, cited))) return true;
  const candidates = byBasename.get(cited.split("/").pop()) ?? [];
  if (cited.includes("/")) return candidates.some((c) => c.endsWith("/" + cited));
  return candidates.length > 0;
}

const PATH_RE = /`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|js|json|md|toml))`/g;
const SCRIPT_RE = /`bun run ([a-z:]+)`/g;

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const badPaths = [];
const badScripts = [];
const classifiedHits = new Map();

for (const doc of DOCS) {
  if (!existsSync(join(ROOT, doc))) continue;
  const text = readFileSync(join(ROOT, doc), "utf8");
  const lineOf = (i) => text.slice(0, i).split("\n").length;

  for (const m of text.matchAll(PATH_RE)) {
    const cited = m[1];
    if (resolves(cited)) continue;
    const why = CLASSIFIED.get(cited) ?? CLASSIFIED.get(cited.split("/").pop());
    if (why) {
      classifiedHits.set(why, (classifiedHits.get(why) ?? 0) + 1);
      continue;
    }
    badPaths.push({ doc, line: lineOf(m.index), cited });
  }

}

for (const doc of SCRIPT_DOCS) {
  if (!existsSync(join(ROOT, doc))) continue;
  const text = readFileSync(join(ROOT, doc), "utf8");
  for (const m of text.matchAll(SCRIPT_RE)) {
    if (!pkg.scripts?.[m[1]]) {
      badScripts.push({ doc, line: text.slice(0, m.index).split("\n").length, script: m[1] });
    }
  }
}

// A classification for something the docs no longer mention is dead weight that hides nothing —
// but it also means the list is drifting, so say so.
const allText = SCRIPT_DOCS.filter((d) => existsSync(join(ROOT, d)))
  .map((d) => readFileSync(join(ROOT, d), "utf8"))
  .join("\n");
const staleClassifications = [...CLASSIFIED.keys()].filter((k) => !allText.includes(k));

console.log(`\n  Documentation integrity — ${DOCS.filter((d) => existsSync(join(ROOT, d))).length} documents\n`);
console.log(`    citations classified as non-repository: ${[...classifiedHits.values()].reduce((a, b) => a + b, 0)}`);
for (const [why, n] of classifiedHits) console.log(`      ${String(n).padStart(3)}  ${why}`);

if (badPaths.length) {
  console.log(`\n  UNRESOLVED FILE CITATIONS (${badPaths.length}) — a reader following these finds nothing:\n`);
  for (const b of badPaths) console.log(`    ${b.doc}:${b.line}  ${b.cited}`);
  console.log("");
}
if (badScripts.length) {
  console.log(`\n  UNKNOWN SCRIPTS (${badScripts.length}) — documented but not in package.json:\n`);
  for (const b of badScripts) console.log(`    ${b.doc}:${b.line}  bun run ${b.script}`);
  console.log("");
}
if (staleClassifications.length) {
  console.log(`\n  Stale classifications (${staleClassifications.length}) — no longer cited anywhere:`);
  for (const k of staleClassifications) console.log(`    ${k}`);
  console.log("");
}

if (badPaths.length || badScripts.length || staleClassifications.length) process.exit(1);
console.log("\n  Every cited file and script resolves.\n");
