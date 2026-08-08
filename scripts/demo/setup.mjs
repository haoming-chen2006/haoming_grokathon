// Build the demo repository the Control Room is demonstrated against.
//
//   bun run demo
//
// `bun run new` needs two things that do not ship with this repository: a git repository to work
// in, and a design document to work from. Without them the documented launch command has
// placeholder paths in it and cannot be pasted, which is the difference between a product you can
// show someone and one you can only describe.
//
// The fixture starts RED on purpose — greet() throws and its three tests fail. A green run at the
// end of the demo therefore proves the agents did the work, exactly as `bun run acceptance` does
// for the automated path. Re-running with --force resets it to red so the demo can be repeated.

import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

if (has("help")) {
  console.log(`
  Build the demo repository for the Control Room.

    bun run demo [options]

    --at <path>   where to build it       (default: ~/grok-demo)
    --force       delete and rebuild it if it already exists
    --quiet       print only the launch command
`);
  process.exit(0);
}

const REPO = resolve(arg("at", join(homedir(), "grok-demo")));
const QUIET = has("quiet");
const say = (msg = "") => { if (!QUIET) console.log(msg); };

if (existsSync(REPO)) {
  if (!has("force")) {
    say(`\n  ${REPO} already exists.`);
    say(`  Re-run with --force to reset it to its failing starting state.\n`);
    printLaunch();
    process.exit(0);
  }
  rmSync(REPO, { recursive: true, force: true });
}

mkdirSync(REPO, { recursive: true });
const git = (cmd) => execSync(`git ${cmd}`, { cwd: REPO, stdio: "pipe" }).toString().trim();

// ─────────────────────────────────────────────────────────────────── the repository

git("init -b main");
git("config user.email demo@example.com");
git("config user.name 'Control Room Demo'");

// Three requirements, three failing tests, one unimplemented function. Small enough that a demo
// finishes in minutes; real enough that the tests are the acceptance criteria.
writeFileSync(join(REPO, "greet.ts"), `/**
 * Greet someone by name.
 *
 * Unimplemented on purpose — this is what the agents are asked to complete.
 */
export function greet(name: string): string {
  throw new Error("not implemented");
}
`);

writeFileSync(join(REPO, "greet.test.ts"), `import { expect, test } from "bun:test";
import { greet } from "./greet";

// GREET-01
test("greets by name", () => {
  expect(greet("World")).toBe("Hello, World!");
});

// GREET-02
test("trims surrounding whitespace from the name", () => {
  expect(greet("  Ada  ")).toBe("Hello, Ada!");
});

// GREET-03
test("rejects an empty name with a clear error", () => {
  expect(() => greet("   ")).toThrow(/name/i);
});
`);

writeFileSync(join(REPO, "package.json"), `{
  "name": "grok-demo",
  "private": true,
  "type": "module",
  "scripts": { "test": "bun test" }
}
`);

writeFileSync(join(REPO, "design.md"), `# Greeting Service

A tiny library with one exported function, \`greet\`. It is deliberately unfinished: \`greet.ts\`
throws \`not implemented\` and all three tests in \`greet.test.ts\` fail. The work is to make them
pass without changing the tests.

## Requirements

- GREET-01: greet(name) returns "Hello, <name>!" for a normal name
- GREET-02: greet trims surrounding whitespace from the name before greeting
- GREET-03: greet rejects an empty or whitespace-only name with a clear error naming the argument

## Constraints

- Do not modify \`greet.test.ts\` — the tests are the acceptance criteria.
- Keep the public signature \`greet(name: string): string\`.
- \`bun test\` must pass with 3 of 3 before submitting for review.
`);

writeFileSync(join(REPO, "README.md"), `# grok-demo

The fixture repository for the Grok Build Control Room demo. It starts red on purpose; see
\`design.md\` for the three requirements the agents implement.
`);

git("add -A");
git('commit -m "Add the failing greeting tests"');

// ────────────────────────────────────────────────── prove it starts red, as the demo assumes

let red = false;
try {
  execSync("bun test", { cwd: REPO, stdio: "pipe" });
} catch {
  red = true;
}
if (!red) {
  console.error(`\n  The demo fixture is already passing, so a green run would prove nothing.`);
  console.error(`  This is a bug in ${import.meta.url}.\n`);
  process.exit(1);
}

say(`\n  Demo repository built — ${REPO}`);
say(`  Starts red: greet() throws, 0 of 3 tests pass.`);
say(`  Design document: ${join(REPO, "design.md")} — 3 requirements (GREET-01…03)\n`);

printLaunch();

function printLaunch() {
  const design = join(REPO, "design.md");
  if (QUIET) {
    console.log(`bun run new -- --repo ${REPO} --design ${design} --plan`);
    return;
  }
  console.log(`  Start the app in one terminal:

    cd ${process.cwd()}
    export PATH="$HOME/.bun/bin:$PATH"
    set -a; . ./.env; set +a
    bun run dev

  Then create the project in another:

    bun run new -- --repo ${REPO} --design ${design} --plan

  Then open:

    http://localhost:6969/?view=control-room
`);
}
