import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { realpathSync } from "fs";
import { tmpdir } from "os";
import { join, sep } from "path";
import { canonical, isInsideRoot } from "./boundary";

/**
 * AGENTS-001, second clause: a symlink inside the root pointing outside it is resolved before any
 * comparison.
 *
 * Each escape probe here asserts the naive string comparison *first*, so the test records what the
 * guard is actually preventing. A boundary you cannot make fail proves nothing when it passes.
 */

let root: string;
let outside: string;

beforeEach(() => {
  // mkdtemp under macOS /var/folders — which is itself a symlink to /private/var/folders. That is
  // the false-refusal direction, present in every test in this file for free.
  root = mkdtempSync(join(tmpdir(), "openui-area-root-"));
  outside = mkdtempSync(join(tmpdir(), "openui-outside-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("canonical", () => {
  test("resolves a symlinked ancestor, so two names for one directory compare equal", () => {
    // On macOS these differ as strings and name the same directory.
    expect(canonical(root)).toBe(realpathSync(root));
  });

  test("resolves the deepest existing ancestor and appends the rest for a path that does not exist", () => {
    const notYet = join(root, "does", "not", "exist.txt");
    expect(canonical(notYet)).toBe(join(realpathSync(root), "does", "not", "exist.txt"));
  });

  test("returns an absolute path for a relative one", () => {
    expect(canonical("relative/path").startsWith(sep)).toBe(true);
  });
});

describe("isInsideRoot", () => {
  test("the root itself and a file within it are inside", () => {
    writeFileSync(join(root, "brief.md"), "x");
    expect(isInsideRoot(root, root)).toBe(true);
    expect(isInsideRoot(root, join(root, "brief.md"))).toBe(true);
    expect(isInsideRoot(root, join(root, "nested", "not-created-yet.md"))).toBe(true);
  });

  test("a symlink inside the root pointing outside it is refused", () => {
    symlinkSync(outside, join(root, "escape"));
    const target = join(root, "escape", "stolen.txt");

    // The escape probe: as strings this path is inside the root, which is why the naive guard
    // approved `<managed-repo>/link -> /etc` and git then operated on /etc.
    expect(target.startsWith(root + sep)).toBe(true);

    expect(isInsideRoot(root, target)).toBe(false);
  });

  test("a symlinked area root does not falsely refuse a path reported under its real name", () => {
    const real = mkdtempSync(join(tmpdir(), "openui-area-real-"));
    const link = join(root, "by-another-name");
    symlinkSync(real, link);
    try {
      const viaRealName = join(realpathSync(real), "note.md");

      // The false-refusal probe: as strings these have nothing in common.
      expect(viaRealName.startsWith(link + sep)).toBe(false);

      expect(isInsideRoot(link, viaRealName)).toBe(true);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  test("a sibling directory whose name extends the root is outside it", () => {
    const sibling = `${root}-other`;
    mkdirSync(sibling, { recursive: true });
    try {
      // The trailing-separator probe: without `+ sep` this string comparison approves the sibling.
      expect(`${sibling}/file.md`.startsWith(root)).toBe(true);

      expect(isInsideRoot(root, join(sibling, "file.md"))).toBe(false);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  test("an absolute path elsewhere on the machine is outside", () => {
    expect(isInsideRoot(root, "/etc/passwd")).toBe(false);
    expect(isInsideRoot(root, join(outside, "anything.md"))).toBe(false);
  });
});
