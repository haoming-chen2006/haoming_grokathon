/**
 * The partition, asserted — loops/06-tools-and-cost.md §0 and §4.6.
 *
 * Eight worktrees are editing this repository at once and none of them sees the others until a
 * single reconciliation pass. The expensive failure is not a bug; it is a coupling that reconciliation
 * has to unpick, or a cycle it cannot. Those are invisible in review — an import line looks like
 * every other import line — and free to catch here.
 *
 * This reads the shipped files rather than a list of what they ought to import, so a violation added
 * next week fails here rather than at the merge.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TOOLS_DIR = import.meta.dir;
const CONTROL_ROOM = join(TOOLS_DIR, "..");

function sourcesIn(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => ({ file: e.name, text: readFileSync(join(dir, e.name), "utf8") }));
}

/** `import ... from "x"` and `export ... from "x"`, which is the one people forget. */
function importsOf(text: string): string[] {
  return [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

const OWN = sourcesIn(TOOLS_DIR);

describe("this loop's imports", () => {
  test("nothing here imports another page's directory", () => {
    // Each belongs to a sibling branch. An import either way is a merge conflict at best and a
    // cycle at worst; §4.6's DOM event exists precisely so this stays empty.
    const forbidden = ["agents/", "assets/", "designdoc/", "software/", "users/"];
    const violations: string[] = [];

    for (const { file, text } of OWN) {
      for (const spec of importsOf(text)) {
        if (forbidden.some((dir) => spec.includes(`/${dir}`) || spec.startsWith(`../${dir}`))) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("the only shell module it depends on is the published contract", () => {
    // `shell/**` is 07-shell's. contract.ts is the one file published for everyone to compile
    // against, and it deliberately imports nothing itself.
    const shellImports = OWN.flatMap(({ file, text }) =>
      importsOf(text)
        .filter((s) => s.includes("shell/"))
        .map((s) => `${file} → ${s}`),
    );
    expect(shellImports.every((s) => s.endsWith("shell/contract"))).toBe(true);
  });

  test("no hot file is imported", () => {
    const hot = ["useControlRoom", "ControlRoomApp"];
    const violations = OWN.flatMap(({ file, text }) =>
      importsOf(text)
        .filter((s) => hot.some((h) => s.includes(h)))
        .map((s) => `${file} → ${s}`),
    );
    expect(violations).toEqual([]);
  });
});

describe("what other loops may import from here", () => {
  test("no sibling page reaches into this directory except through the contract", () => {
    const pages = ["agents", "assets", "designdoc", "software", "users"];
    const violations: string[] = [];

    for (const page of pages) {
      let files: Array<{ file: string; text: string }>;
      try {
        files = sourcesIn(join(CONTROL_ROOM, page));
      } catch {
        continue; // That page has not merged yet. Not a failure.
      }
      for (const { file, text } of files) {
        for (const spec of importsOf(text)) {
          if (!spec.includes("tools/")) continue;
          // `tools/contract` and the index barrel are the published surface; anything deeper —
          // a section, the API client, a UI part — is internal and must not be reached for.
          const published = /tools(\/index)?$/.test(spec) || spec.endsWith("tools/contract");
          if (!published) violations.push(`${page}/${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("the event contract imports nothing, so it compiles alone in any worktree", () => {
    const contract = OWN.find((s) => s.file === "contract.ts");
    expect(contract).toBeDefined();
    expect(importsOf(contract!.text)).toEqual([]);
  });
});
