// Endpoint coverage audit — which HTTP endpoints does anything actually call?
//
//   bun run audit:endpoints
//
// The reachability audit answers this for modules. Routes need the same question asked of them:
// an endpoint can be declared, typecheck, and be reached by nothing — no test, no client code, no
// script. That is the shape of the archived-history regression in iteration 42, where the store
// and the UI each worked and nothing connected them.
//
// "Covered" here means *something calls it*: a test, the client, or a tracked script. That is a
// weaker claim than "correct", and deliberately so — this audit finds the endpoints nobody has
// ever exercised, which is where untested wiring hides.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

/** Route files whose endpoints this project owns. api.ts is pre-existing OpenUI (see Q-2). */
const OWNED = ["agents.ts", "library.ts", "mcp.ts", "projects.ts", "repository.ts"];

/** Endpoints reached by something the audit cannot see. Each needs a reason. */
const KNOWN = new Map([
  ["ALL /mcp/:projectId/:agentId", "called by Grok over MCP, not by our own code"],
]);

function tracked() {
  const a = execSync("git ls-files", { cwd: ROOT }).toString();
  const b = execSync("git ls-files --others --exclude-standard", { cwd: ROOT }).toString();
  return (a + b).split("\n").filter(Boolean);
}

// ─────────────────────────────────────────────────────── mount prefixes from server/index.ts

/**
 * Mount prefixes are nested: server/index.ts mounts apiRoutes at /api, and api.ts mounts the rest
 * beneath it. Reading only index.ts found two mounts and reported every other router as unmounted.
 * Resolve the chain so a route's real public path is what gets audited.
 */
const ROUTER_SOURCES = ["server/index.ts", ...OWNED.map((f) => `server/routes/${f}`), "server/routes/api.ts"];

const edges = []; // { parent, prefix, child }
for (const rel of ROUTER_SOURCES) {
  if (!existsSync(join(ROOT, rel))) continue;
  const src = readFileSync(join(ROOT, rel), "utf8");
  for (const m of src.matchAll(/(\w+)\.route\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g)) {
    edges.push({ parent: m[1], prefix: m[2], child: m[3] });
  }
}

const mounts = new Map();
// `app` is the root; walk outward until nothing new resolves.
const prefixOf = new Map([["app", ""]]);
for (let pass = 0; pass < 10; pass++) {
  for (const { parent, prefix, child } of edges) {
    if (prefixOf.has(parent) && !prefixOf.has(child)) {
      prefixOf.set(child, prefixOf.get(parent) + prefix);
    }
  }
}
for (const [name, prefix] of prefixOf) if (name !== "app") mounts.set(name, prefix);

// ───────────────────────────────────────────────────────────────── declared endpoints

const DECL = /^\s*(\w+)\.(get|post|put|patch|delete|all)\(\s*["']([^"']*)["']/gm;

const endpoints = [];
for (const file of OWNED) {
  const rel = `server/routes/${file}`;
  const src = readFileSync(join(ROOT, rel), "utf8");
  for (const m of src.matchAll(DECL)) {
    const [, varName, method, path] = m;
    const prefix = mounts.get(varName);
    if (prefix === undefined) continue; // not mounted on the app; reported below
    const full = (prefix + (path === "/" ? "" : path)) || "/";
    endpoints.push({ method: method.toUpperCase(), path: full, file: rel, varName });
  }
}

// Any router declared in a route file but never mounted is dead by definition.
const declaredVars = new Set(endpoints.map((e) => e.varName));
const unmounted = [];
for (const file of OWNED) {
  const src = readFileSync(join(ROOT, `server/routes/${file}`), "utf8");
  for (const m of src.matchAll(/^\s*(\w+)\.(get|post|put|patch|delete|all)\(/gm)) {
    if (!mounts.has(m[1]) && !declaredVars.has(m[1])) unmounted.push(`${file}: ${m[1]}`);
  }
}

// ────────────────────────────────────────────────── URLs that callers actually use

const CALLER_FILES = tracked().filter(
  (f) =>
    (f.startsWith("server/") && /\.(test|spec)\.[a-z]+$/.test(f)) ||
    (f.startsWith("client/src/")) ||
    (f.startsWith("scripts/")),
);

/** Normalise a URL written in code to a comparable shape: dynamic segments become "*". */
function normalise(url) {
  return url
    .replace(/\$\{[^}]*\}/g, "*") // template holes
    .replace(/\?.*$/, "") // query string
    .replace(/\/+$/, "") || "/";
}

const calls = new Set();
for (const f of CALLER_FILES) {
  const src = readFileSync(join(ROOT, f), "utf8");
  // Any string or template literal that looks like one of our API paths.
  for (const m of src.matchAll(/["'`](\/(?:api|mcp)\/[^"'`\s]*)["'`]/g)) {
    calls.add(normalise(m[1]));
  }
}

/** Does any observed call match this route pattern? */
function isCovered(ep) {
  const pattern = new RegExp(
    "^" +
      ep.path
        .split("/")
        .map((seg) => (seg.startsWith(":") ? "(?:[^/]+|\\*)" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/") +
      "$",
  );
  for (const c of calls) if (pattern.test(c)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────── report

const seen = new Set();
const unique = endpoints.filter((e) => {
  const k = `${e.method} ${e.path}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const uncovered = unique.filter((e) => !isCovered(e) && !KNOWN.has(`${e.method} ${e.path}`));
const knownPresent = unique.filter((e) => KNOWN.has(`${e.method} ${e.path}`));

console.log(`\n  Endpoint coverage — ${unique.length} endpoints across ${OWNED.length} route files`);
console.log(`  ${calls.size} distinct API URLs found in tests, client and scripts\n`);
console.log(`    covered by a caller:  ${unique.length - uncovered.length - knownPresent.length}`);
console.log(`    known and classified: ${knownPresent.length}`);
for (const e of knownPresent) console.log(`      ${e.method} ${e.path} — ${KNOWN.get(`${e.method} ${e.path}`)}`);

if (unmounted.length) {
  console.log(`\n  Routers never mounted on the app (${unmounted.length}):`);
  for (const u of unmounted) console.log(`    ${u}`);
}

// A KNOWN entry for an endpoint that no longer exists hides a rename.
const stale = [...KNOWN.keys()].filter((k) => !seen.has(k));
if (stale.length) {
  console.log(`\n  Stale allowlist entries (${stale.length}) — remove them:`);
  for (const k of stale) console.log(`    ${k}`);
}

if (uncovered.length) {
  console.log(`\n  UNCOVERED (${uncovered.length}) — declared, and nothing calls them:\n`);
  for (const e of uncovered) console.log(`    ${e.method.padEnd(6)} ${e.path.padEnd(52)} ${e.file}`);
  console.log("\n  Each is either dead, or live and untested. Both are worth knowing.\n");
}

if (uncovered.length || unmounted.length || stale.length) process.exit(1);
console.log("\n  Every endpoint has at least one caller.\n");
