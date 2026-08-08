// §22.18 placeholder and quality audit.
//
//   bun run audit:quality
//
// The checklist asks for a repository search for unfinished-implementation indicators, with every
// match reviewed and classified. That was done once by hand. It decays the moment new code lands,
// and roughly fifty iterations of new code have landed since — so it is a script now, and part of
// `bun run verify`.
//
// Scope: the code this project added. Files that already exist on `main` are pre-existing OpenUI
// and are not this project's to classify (see open finding Q-2). If this branch is ever merged
// that comparison stops discriminating, and the scope list below should become explicit.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const SOURCE_EXT = new Set(["ts", "tsx", "js", "jsx", "mjs"]);

function gitLines(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT }).toString().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** Tracked and new files under the directories this project works in. */
function candidateFiles() {
  const all = [
    ...gitLines("git ls-files"),
    ...gitLines("git ls-files --others --exclude-standard"),
  ];
  const preExisting = new Set(gitLines("git ls-tree -r --name-only main"));
  return all
    .filter((f) => ["server/", "client/src/", "scripts/", "bin/", "shared/"].some((d) => f.startsWith(d)))
    .filter((f) => SOURCE_EXT.has(f.split(".").pop()))
    .filter((f) => !preExisting.has(f))
    // This script necessarily contains every indicator it searches for.
    .filter((f) => f !== "scripts/audit/quality.mjs")
    .filter((f) => existsSync(join(ROOT, f)));
}

/** The indicators §22.18 names. */
const PATTERNS = {
  // Case-SENSITIVE, and not followed by "-<digits>".
  //
  // These three are markers by convention, and the convention is uppercase. Matching them
  // case-insensitively meant the ordinary word "todo" tripped the audit — a project with a todo
  // list as its domain flagged every mention of `todo.ts`, `addTodo` and "todo service". The
  // "-<digits>" exclusion covers requirement ids like TODO-01, which projects legitimately use.
  TODO: /\bTODO\b(?!-\d)/,
  FIXME: /\bFIXME\b/,
  HACK: /\bHACK\b/,
  placeholder: /\bplaceholder\b/i,
  "mock data": /mock data/i,
  "not implemented": /not implemented/i,
  "coming soon": /coming soon/i,
  "console.log": /console\.log/,
  temporary: /\btemporary\b/i,
  hardcoded: /\bhardcoded\b/i,
};

/**
 * Forms that are not unfinished work. Each needs a reason, and each is narrow on purpose — a broad
 * rule here would hide the very thing the audit exists to find.
 */
const CLASSIFIED = [
  {
    pattern: "placeholder",
    test: (line) => /placeholder[=\-:]|PLACEHOLDER\b/.test(line),
    why: "the JSX input attribute, the Tailwind placeholder- class, or the template-variable regex",
  },
  {
    pattern: "console.log",
    test: (line, f) => /QUIET \? \(\) => \{\} : console\.log/.test(line) || f.startsWith("scripts/") || f.startsWith("bin/"),
    why: "the project's logging idiom (gated behind QUIET), or a CLI script whose job is printing",
  },
  {
    pattern: "not implemented",
    test: (line, f) =>
      f.startsWith("scripts/acceptance/") || /JSONRPC_METHOD_NOT_FOUND|Method not implemented/.test(line),
    why: "the acceptance fixture's deliberately unimplemented function, or a JSON-RPC method-not-found reply",
  },
  // Descriptive English words appearing in a comment or a test name are prose about a concept,
  // not unfinished work. TODO, FIXME and HACK are deliberately excluded: those are markers by
  // convention precisely *because* they appear in comments, so exempting them would gut the audit.
  ...["placeholder", "hardcoded", "temporary", "mock data", "not implemented", "coming soon"].map(
    (pattern) => ({
      pattern,
      // Line comments, block-comment bodies, and JSDoc openers (/** … */ on one line).
      test: (line) => /^\s*(\/\/|\/\*|\*)/.test(line) || /\b(test|describe|it)\(\s*["`']/.test(line),
      why: "prose in a comment or a test name, not a marker",
    }),
  ),
];

function classify(pattern, file, line) {
  return CLASSIFIED.find((c) => c.pattern === pattern && c.test(line, file));
}

// ────────────────────────────────────────────────────────────────────────── scan

const files = candidateFiles();
const findings = [];
const classifiedCounts = new Map();

for (const file of files) {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  lines.forEach((line, idx) => {
    for (const [name, re] of Object.entries(PATTERNS)) {
      if (!re.test(line)) continue;
      const known = classify(name, file, line);
      if (known) {
        classifiedCounts.set(known.why, (classifiedCounts.get(known.why) ?? 0) + 1);
      } else {
        findings.push({ name, file, line: idx + 1, text: line.trim().slice(0, 120) });
      }
    }
  });
}

// ──────────────────────────────────────────── §22.18: no empty buttons, no dead controls

/**
 * "No empty buttons; no controls that do nothing."
 *
 * A button with no handler and no `type="submit"` is decoration that looks operable, and one with
 * no visible text and no aria-label is unusable and unreadable to a screen reader. Both are
 * checked statically over the control-room components, because a rendered-DOM test cannot see
 * whether a React handler is attached.
 */
const controlFindings = [];

/**
 * Find the end of a JSX opening tag.
 *
 * A regex cannot do this: `onClick={() => {}}` contains a `>` inside an arrow function, so a
 * non-greedy match ends the tag in the middle of an attribute. A first version of this check was
 * fooled exactly that way and silently passed an unlabelled button. Track brace depth and quotes
 * and stop at the `>` that is really at depth zero.
 */
function endOfOpeningTag(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

const COMPONENTS = files.filter(
  (f) => f.startsWith("client/src/") && f.endsWith(".tsx") && !/\.test\./.test(f),
);

for (const file of COMPONENTS) {
  const src = readFileSync(join(ROOT, file), "utf8");
  let idx = src.indexOf("<button");
  while (idx !== -1) {
    const tagEnd = endOfOpeningTag(src, idx + "<button".length);
    if (tagEnd === -1) break;
    const attrs = src.slice(idx, tagEnd);
    const selfClosing = src[tagEnd - 1] === "/";
    const close = selfClosing ? tagEnd : src.indexOf("</button>", tagEnd);
    const children = selfClosing || close === -1 ? "" : src.slice(tagEnd + 1, close);
    const lineNo = src.slice(0, idx).split("\n").length;

    if (!/onClick=|type=\{?["']?submit/.test(attrs)) {
      controlFindings.push({ file, line: lineNo, why: "button with no onClick and no type=submit" });
    }
    // Only whitespace is empty; text, an expression or a nested element all count as a label.
    if (children.replace(/\s+/g, "").length === 0 && !/aria-label=/.test(attrs)) {
      controlFindings.push({ file, line: lineNo, why: "button with no visible label and no aria-label" });
    }
    idx = src.indexOf("<button", close === -1 ? tagEnd : close + 1);
  }
}

// ─────────────────────────────────────── optional handler props that no caller ever passes

/**
 * A button can have an `onClick` and still do nothing: if the handler is an optional prop and no
 * render site passes it, the control is decorative. That is not visible to the check above, and it
 * has happened twice — the always-undefined `acpSessionId` ternary (iteration 49) and the header's
 * "Pause All" button, which rendered for the entire life of the project and did nothing.
 *
 * For every optional `onX?: (...) => ...` prop that a component actually uses as a handler, at
 * least one render site must pass it.
 */
for (const file of COMPONENTS) {
  const src = readFileSync(join(ROOT, file), "utf8");
  // The components this file actually exports, not its filename.
  //
  // Deriving the name from the file meant `ReviewQueues.tsx` was searched for as `<ReviewQueues`,
  // which nothing renders — it exports `ReviewQueue` and `SuggestionQueue`. Every prop in every
  // multi-export file was therefore reported as dead. Two of the first nine findings were real and
  // the rest were this.
  const exported = [...src.matchAll(/export function ([A-Z]\w*)/g)].map((m) => m[1]);
  const components = exported.length ? exported : [file.split("/").pop().replace(/\.tsx$/, "")];

  for (const m of src.matchAll(/^\s*(on[A-Z]\w*)\?:/gm)) {
    const prop = m[1];
    // Only props wired to a DOM handler; a merely declared prop is not a control.
    //
    // Both forms count. `onClick={onMerge}` was the only one checked, and the arrow-wrapped form
    // `onClick={() => onMerge?.(s.id)}` is the more common one — which is how an "Approve Merge"
    // button sat wired to a prop no caller passed, with this audit reporting zero dead controls.
    const wiredDirectly = new RegExp(`on[A-Z]\\w*=\\{\\s*${prop}\\s*\\}`).test(src);
    const wiredInArrow = new RegExp(`on[A-Z]\\w*=\\{[^}]*\\b${prop}\\??\\.?\\(`).test(src);
    if (!wiredDirectly && !wiredInArrow) continue;

    const passedSomewhere = COMPONENTS.some((other) => {
      if (other === file) return false;
      const otherSrc = readFileSync(join(ROOT, other), "utf8");
      return components.some((name) => otherSrc.includes(`<${name}`)) && new RegExp(`\\b${prop}=`).test(otherSrc);
    });
    if (!passedSomewhere) {
      const line = src.slice(0, m.index).split("\n").length;
      controlFindings.push({
        file, line,
        why: `${prop} is used as a handler but no render site passes it — the control does nothing`,
      });
    }
  }
}

// ──────────────────────────────────────────── every test file is actually run

/**
 * `package.json`'s test script names the directories `bun test` scans. A test outside them is
 * never executed and reports nothing — the "written but nothing calls it" failure applied to tests
 * themselves. It happened: a suite under `scripts/` sat unrun until the total test count failed to
 * move after adding it.
 */
const testRoots = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts?.test ?? "")
  .split(/\s+/)
  .filter((token) => token && !token.startsWith("-") && token !== "bun" && token !== "test");

const unrunTests = [...gitLines("git ls-files"), ...gitLines("git ls-files --others --exclude-standard")]
  .filter((f) => /\.(test|spec)\.[a-z]+$/.test(f))
  .filter((f) => !testRoots.some((root) => f.startsWith(root.replace(/\/$/, "") + "/")));

// ───────────────────────────────────────────────────────────────────────── report

console.log(`\n  §22.18 quality audit — ${files.length} files added by this project\n`);
console.log(`    classified as legitimate: ${[...classifiedCounts.values()].reduce((a, b) => a + b, 0)}`);
for (const [why, count] of classifiedCounts) console.log(`      ${String(count).padStart(4)}  ${why}`);

console.log(`    interactive controls checked in ${COMPONENTS.length} components`);

if (findings.length) {
  console.log(`\n  UNCLASSIFIED (${findings.length}) — review each, then fix it or classify it:\n`);
  for (const f of findings) console.log(`    [${f.name}] ${f.file}:${f.line}\n        ${f.text}`);
  console.log("");
}

if (unrunTests.length) {
  console.log(`\n  TEST FILES THAT NEVER RUN (${unrunTests.length}) — outside the roots in package.json "test":\n`);
  for (const f of unrunTests) console.log(`    ${f}`);
  console.log(`\n    scanned roots: ${testRoots.join(", ")}\n`);
}

if (controlFindings.length) {
  console.log(`\n  DEAD OR UNLABELLED CONTROLS (${controlFindings.length}):\n`);
  for (const f of controlFindings) console.log(`    ${f.file}:${f.line} — ${f.why}`);
  console.log("");
}

if (findings.length || controlFindings.length || unrunTests.length) process.exit(1);

console.log(`\n  0 unclassified indicators, 0 dead controls, every test file is in a scanned root.\n`);
