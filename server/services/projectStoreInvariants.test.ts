import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { ProjectStore } from "./projectStore";

/**
 * The store's concurrency safety rests on one property: every mutation is synchronous, so the
 * event loop cannot interleave two read-modify-write sequences and lose an update.
 *
 * That property is invisible — nothing about `updateTask` announces that making it async would
 * break several agents writing at once. This test states it, so the change that would break it
 * fails here rather than showing up as an occasional missing message in production.
 */

describe("ProjectStore stays synchronous", () => {
  test("no method returns a Promise", () => {
    const asyncMethods = Object.getOwnPropertyNames(ProjectStore.prototype)
      .filter((name) => name !== "constructor")
      .filter((name) => {
        const fn = (ProjectStore.prototype as any)[name];
        return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
      });

    expect(
      asyncMethods,
      "an async method reintroduces the interleaving that loses concurrent updates — see persist()",
    ).toEqual([]);
  });

  test("the source contains no await inside the class body", () => {
    // Belt and braces: an async arrow or an awaited helper would not show up as an AsyncFunction
    // on the prototype, but would break the same guarantee.
    const src = readFileSync(join(import.meta.dir, "projectStore.ts"), "utf8");
    const awaits = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bawait\s/.test(line) && !line.startsWith("*") && !line.startsWith("//"));

    expect(awaits.map((a) => `${a.n}: ${a.line}`)).toEqual([]);
  });

  test("the invariant is documented where someone would break it", () => {
    // A rule nobody can find is a rule that gets broken.
    const src = readFileSync(join(import.meta.dir, "projectStore.ts"), "utf8");
    expect(src).toContain("must stay synchronous");
  });
});
