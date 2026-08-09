/**
 * USR-001, third clause: the identity store cannot go async, and the reason cannot be deleted.
 *
 * `UserStore`'s concurrency safety rests on one property — every mutation is synchronous, so the
 * event loop cannot interleave two read-modify-write sequences and lose an update. Two people added
 * at once would otherwise become one, and a revoked session could come back.
 *
 * That property is invisible: nothing about `createUser` announces that making it async breaks it.
 * This file states it, so the change that would break it fails here rather than showing up as an
 * occasional vanished user.
 *
 * Modelled on `projectStoreInvariants.test.ts`, deliberately — a second implementation of the same
 * idea is a second chance to get it subtly different.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { UserStore } from "./auth";

const SOURCE = readFileSync(join(import.meta.dir, "auth.ts"), "utf8");

describe("UserStore stays synchronous", () => {
  test("no method returns a Promise", () => {
    const asyncMethods = Object.getOwnPropertyNames(UserStore.prototype)
      .filter((name) => name !== "constructor")
      .filter((name) => {
        const fn = (UserStore.prototype as any)[name];
        return typeof fn === "function" && fn.constructor.name === "AsyncFunction";
      });

    expect(
      asyncMethods,
      "an async store method reintroduces the interleaving that loses concurrent updates — see the header",
    ).toEqual([]);
  });

  test("no await appears inside the class body", () => {
    // An async arrow, or an awaited helper, would not show up as an AsyncFunction on the prototype
    // but would break the same guarantee. So the source is read directly, and only between the
    // class's own braces — `hashPassword` above it is legitimately async and must stay that way.
    const start = SOURCE.indexOf("export class UserStore");
    expect(start, "UserStore was renamed; this invariant no longer guards anything").toBeGreaterThan(-1);
    const end = SOURCE.indexOf("\nfunction pruneExpired", start);
    expect(end, "the marker this test slices on has moved").toBeGreaterThan(start);

    const body = SOURCE.slice(start, end).split("\n");
    const offenders = body
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bawait\s/.test(line) || /\basync\s/.test(line))
      .filter(({ line }) => !line.startsWith("*") && !line.startsWith("//"));

    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });

  test("the hashing that must be async is outside the store, and still async", () => {
    // The other half of the rule. argon2id cannot be synchronous, so it lives outside the class as
    // a free function — the same split `persistFile` uses against `AssetStore`. If someone "fixed"
    // the invariant by making hashing synchronous, that would be a much worse bug than the one it
    // solved, so it is asserted from the other direction too.
    const hashPassword = SOURCE.slice(SOURCE.indexOf("export async function hashPassword"));
    expect(hashPassword.startsWith("export async function hashPassword")).toBe(true);
    expect(SOURCE.indexOf("export async function hashPassword")).toBeLessThan(SOURCE.indexOf("export class UserStore"));
  });

  /**
   * USR-001 asks for this explicitly: "deleting the explanation from the source fails the test".
   *
   * An invariant nobody understands is an invariant somebody deletes. The sentences below are load
   * bearing — each one is the reason a future reader does not "simplify" this store into losing
   * data — so they are asserted like any other behaviour.
   */
  test("the explanation of why cannot be deleted", () => {
    for (const sentence of [
      "The safety comes from the absence of `await`, not from locking",
      "read-whole-file → change in memory → write-whole-file",
      "two users created at once become one",
    ]) {
      expect(SOURCE, `the explanation "${sentence}" was removed from auth.ts`).toContain(sentence);
    }
  });

  /**
   * §3.3's hard rule, asserted as text because it is a rule about code that must never be written.
   *
   * "There must be no `if (isLocal) return adminActor` anywhere, ever — that is the same shape as
   * the bug being fixed, and it will be copied." `isLoopbackHost` legitimately exists here, but only
   * to decide whether a *password* is required and whether the server should refuse to start. It
   * must never appear in a function that returns a principal.
   */
  test("being local never produces a principal", () => {
    const principalFns = ["principalFor", "principalFromCookie", "requirePermission"];
    for (const name of principalFns) {
      const start = SOURCE.indexOf(name + "(");
      const slice = SOURCE.slice(start, start + 1200);
      expect(slice, `${name} makes a privilege decision from the host address`).not.toMatch(
        /isLoopbackHost|127\.0\.0\.1|localhost/,
      );
    }
  });
});
