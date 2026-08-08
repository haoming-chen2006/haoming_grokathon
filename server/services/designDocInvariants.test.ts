import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { DesignDocStore } from "./designDoc";

/**
 * The store's concurrency safety rests on one property: every mutation is synchronous, so the event
 * loop cannot interleave two read-modify-write sequences and lose an update.
 *
 * That property is invisible — nothing about `writeSection` announces that making it async would
 * break several agents suggesting while a human edits. This test states it, so the change that would
 * break it fails here rather than showing up as an occasional lost edit in production.
 *
 * Mirrors `projectStoreInvariants.test.ts`, deliberately: two stores with the same invariant should
 * fail the same way, and a reader who has seen one recognises the other.
 */

describe("DesignDocStore stays synchronous", () => {
  test("no method returns a Promise", () => {
    const asyncMethods = Object.getOwnPropertyNames(DesignDocStore.prototype)
      .filter((name) => name !== "constructor")
      .filter((name) => {
        const fn = (DesignDocStore.prototype as any)[name];
        return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
      });

    expect(
      asyncMethods,
      "an async method reintroduces the interleaving that loses concurrent updates — see the class comment",
    ).toEqual([]);
  });

  test("the source contains no await inside the class body", () => {
    // Belt and braces: an async arrow or an awaited helper would not show up as an AsyncFunction on
    // the prototype, but would break the same guarantee.
    const src = readFileSync(join(import.meta.dir, "designDoc.ts"), "utf8");
    const awaits = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bawait\s/.test(line) && !line.startsWith("*") && !line.startsWith("//"));

    expect(awaits.map((a) => `${a.n}: ${a.line}`)).toEqual([]);
  });

  test("the invariant is documented where someone would break it", () => {
    // A rule whose reason has been deleted gets "cleaned up" in six months. When safety comes from
    // the absence of something, the explanation is part of the mechanism, so the test guards it.
    const src = readFileSync(join(import.meta.dir, "designDoc.ts"), "utf8");
    expect(src).toContain("must stay synchronous");
    expect(
      src,
      "the explanation of WHY synchrony is load-bearing was deleted — restore it before deleting this assertion",
    ).toContain("no `await` occurs inside it");
  });

  test("a derived line number is never persisted", () => {
    // A stored line number is a line number that goes wrong on the next edit. `firstLine` is
    // computed on read; if it ever reaches disk, presence and suggestions start pointing at the
    // wrong text after an edit and nothing reports it.
    const src = readFileSync(join(import.meta.dir, "designDoc.ts"), "utf8");
    expect(src).toContain('Omit<DocSection, "firstLine">');
  });
});
