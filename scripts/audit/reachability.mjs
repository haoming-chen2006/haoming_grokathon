// Reachability audit — which source modules can the running application actually reach?
//
//   bun run audit
//
// A passing test proves a unit works, not that anything calls it. This project has been bitten by
// that twice: the whole control-room UI was written, tested and never imported (iteration 33), and
// archived message history was implemented, tested and reachable from nothing (iteration 42). Both
// had green suites.
//
// The audit walks the import graph from the real entry points and reports every source module it
// cannot reach. Anything genuinely reachable by another route is listed in KNOWN below with the
// reason, so the report stays at zero and a new orphan is visible immediately.
//
// It was previously re-typed by hand each iteration and kept nowhere, which is why it is a tracked
// script now.

import { readFileSync, existsSync, statSync } from "fs";
import { join, dirname, resolve, relative, extname } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

/** Every way into this system. A module reachable from none of these is dead to the product. */
const ENTRY_POINTS = [
  ["server/index.ts", "the server process"],
  ["client/src/main.tsx", "the browser bundle"],
  ["server/hooks/shellSafetyHook.ts", "invoked by ~/.grok/hooks/openui-shell-safety.json"],
  ["scripts/acceptance/v052.mjs", "bun run acceptance"],
  ["scripts/audit/reachability.mjs", "bun run audit (this script)"],
];

/**
 * package.json declares entry points too. `bin` is how the CLI is invoked and `main`/`module` are
 * how a consumer imports the package — a module reached only through those is live, not orphaned.
 * Reading them from the manifest rather than hardcoding keeps the audit honest if they change.
 */
function manifestEntryPoints() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const out = [];
  const add = (value, why) => {
    if (typeof value !== "string") return;
    const rel = value.replace(/^\.\//, "");
    if (existsSync(join(ROOT, rel))) out.push([rel, why]);
  };
  for (const [name, target] of Object.entries(pkg.bin ?? {})) add(target, `package.json bin "${name}"`);
  add(pkg.main, "package.json main");
  add(pkg.module, "package.json module");
  return out;
}

ENTRY_POINTS.push(...manifestEntryPoints());

/**
 * Reachable by a route the import graph cannot see — a config file, a hook, an external caller.
 * These are live code. Each needs a reason, not just a name.
 */
const KNOWN = new Map([]);

/**
 * Tracked, genuinely unreachable, and predating this project. These are NOT live code; they are
 * kept separate from KNOWN so the report never implies something dead is wired up.
 *
 * Deleting tracked files that predate this project is the repository owner's decision, not the
 * loop's (§22.2), so they are listed rather than removed and rolled into open finding Q-2.
 */
const AWAITING_OWNER = new Map([
  ["bin/openui.js", "dead Express entry point; the live CLI is bin/openui.ts (package.json bin)"],
  ["server/index.js", "dead Express server; the live server is server/index.ts"],
  ["client/src/components/Terminal.tsx", "xterm view from the original OpenUI shell, never imported"],
]);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const isTest = (f) => /\.(test|spec)\.[a-z]+$/.test(f);

/**
 * Tracked files plus new ones not yet staged, honouring .gitignore.
 *
 * Using only `git ls-files` meant a module you had just written was invisible, so the audit could
 * report zero orphans while an orphan sat in the working tree — precisely when you most want to
 * hear about it. `--others --exclude-standard` adds untracked files without dragging in
 * node_modules, dist or .refs.
 */
function trackedFiles() {
  const tracked = execSync("git ls-files", { cwd: ROOT }).toString();
  const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT }).toString();
  return (tracked + untracked).split("\n")
    .filter(Boolean)
    .filter((f) => ["server/", "client/src/", "scripts/", "bin/"].some((d) => f.startsWith(d)))
    .filter((f) => SOURCE_EXT.has(extname(f)));
}

/** Source files tracked in git — the audit describes the repository, not the working directory. */
function sourceFiles() {
  return trackedFiles().filter((f) => !isTest(f));
}

function testFiles() {
  return trackedFiles().filter((f) => isTest(f));
}

/**
 * Import forms this must catch. The clause may span lines — a first version of this audit required
 * `import` and `from` on one line, so every multi-line `import { a, b } from "./x"` was invisible
 * and the module reported as an orphan. It named three files that were plainly imported.
 */
const IMPORT_PATTERNS = [
  // A named or namespace clause, possibly spanning several lines: the [^;]*? crosses newlines.
  /(?:^|[\n;])\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  // import "./x"  (side effect)
  /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g,
  // await import("./x")
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // require("./x")
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Strip comments before scanning, or example specifiers written in documentation get walked as if
 * they were real imports — this script's own comments did exactly that. The `:` guard keeps
 * "http://..." inside string literals from being treated as the start of a line comment.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function importsOf(file) {
  const text = stripComments(readFileSync(join(ROOT, file), "utf8"));
  const out = new Set();
  for (const re of IMPORT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (m[1]?.startsWith(".")) out.add(m[1]);
    }
  }
  return [...out];
}

/** Resolve a relative specifier the way the bundler and runtime do, including extensionless. */
function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(join(ROOT, fromFile)), spec);
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs"].map((e) => base + e),
    // A ".js" specifier commonly means the ".ts" source (NodeNext style).
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    ...[".ts", ".tsx", ".js", ".jsx"].map((e) => join(base, "index" + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return relative(ROOT, c);
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────── walk the graph

const all = sourceFiles();
const reached = new Set();
const unresolved = [];

const queue = [];
for (const [entry] of ENTRY_POINTS) {
  if (!existsSync(join(ROOT, entry))) {
    console.log(`  ENTRY POINT MISSING: ${entry}`);
    process.exit(1);
  }
  queue.push(entry);
  reached.add(entry);
}

function walk(seeds, seen) {
  const q = [...seeds];
  for (const s of seeds) seen.add(s);
  while (q.length) {
    const file = q.shift();
    for (const spec of importsOf(file)) {
      const target = resolveSpec(file, spec);
      if (!target) {
        unresolved.push(`${file} → ${spec}`);
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        q.push(target);
      }
    }
  }
  return seen;
}

walk(queue, reached);

/**
 * A second graph rooted at the test files. A helper used only by tests is legitimately absent from
 * the production graph — reporting it as dead would be wrong, and padding the allowlist to hide it
 * would be worse. It is reported as test-only instead, so it still has to be accounted for.
 */
const testReached = walk(testFiles(), new Set());

// ────────────────────────────────────────────────────────────────────────── report

const testOnly = all.filter((f) => !reached.has(f) && testReached.has(f));
const orphans = all.filter(
  (f) => !reached.has(f) && !testReached.has(f) && !KNOWN.has(f) && !AWAITING_OWNER.has(f),
);
const knownPresent = all.filter((f) => KNOWN.has(f));
const ownerPresent = all.filter((f) => AWAITING_OWNER.has(f));

// Anything listed as unreachable that the graph now reaches is a stale classification: the file
// was wired up and the list never caught up. Say so rather than quietly keeping it suppressed.
const nowReachable = ownerPresent.filter((f) => reached.has(f));

console.log(`\n  Reachability audit — ${all.length} source modules, ${ENTRY_POINTS.length} entry points\n`);
for (const [entry, why] of ENTRY_POINTS) console.log(`    entry  ${entry.padEnd(38)} ${why}`);
console.log(`\n    reached from an entry point: ${[...reached].filter((f) => all.includes(f)).length}`);
console.log(`    known and classified:        ${knownPresent.length}`);
for (const f of knownPresent) console.log(`      ${f.padEnd(38)} ${KNOWN.get(f)}`);
console.log(`    test-only helpers:           ${testOnly.length}`);
for (const f of testOnly) console.log(`      ${f}`);
console.log(`    dead, awaiting owner (Q-2):  ${ownerPresent.length}`);
for (const f of ownerPresent) console.log(`      ${f.padEnd(38)} ${AWAITING_OWNER.get(f)}`);

if (unresolved.length) {
  console.log(`\n  Unresolvable imports (${unresolved.length}) — the audit cannot see past these:`);
  for (const u of unresolved) console.log(`    ${u}`);
}

// An allowlist entry that no longer exists means the list is rotting and hiding something.
const stale = [...KNOWN.keys(), ...AWAITING_OWNER.keys()].filter((f) => !all.includes(f));
if (stale.length) {
  console.log(`\n  Stale allowlist entries (${stale.length}) — remove them:`);
  for (const f of stale) console.log(`    ${f}`);
}

if (orphans.length) {
  console.log(`\n  ORPHANS (${orphans.length}) — tracked, not test files, reachable from nothing:\n`);
  for (const f of orphans) console.log(`    ${f}`);
  console.log("\n  Each is either dead code, or wired up and the wiring is missing.\n");
  process.exit(1);
}

if (nowReachable.length) {
  console.log(`\n  Misclassified (${nowReachable.length}) — listed as dead but the graph reaches them:`);
  for (const f of nowReachable) console.log(`    ${f}`);
}

if (unresolved.length || stale.length || nowReachable.length) process.exit(1);

console.log(`\n  0 orphans. ${ownerPresent.length} dead file(s) await the owner's decision (Q-2).\n`);
