import { describe, expect, test } from "bun:test";
import {
  detectGrok,
  getGrokDetection,
  grokBinaryCandidates,
  parseGrokVersion,
  GROK_NPM_PACKAGE,
} from "./grokDetect";

describe("parseGrokVersion", () => {
  test("parses the real --version output shape", () => {
    expect(parseGrokVersion("grok 0.2.118 (1e1687c1cf6a)")).toEqual({
      version: "0.2.118",
      commit: "1e1687c1cf6a",
    });
  });

  test("parses a version with no commit", () => {
    expect(parseGrokVersion("grok 0.2.118")).toEqual({ version: "0.2.118", commit: null });
  });

  test("parses a prerelease version", () => {
    expect(parseGrokVersion("grok 0.1.220-alpha.4 (abc1234)")).toEqual({
      version: "0.1.220-alpha.4",
      commit: "abc1234",
    });
  });

  test("returns nulls for unparseable output rather than throwing", () => {
    expect(parseGrokVersion("command not found")).toEqual({ version: null, commit: null });
  });

  test("tolerates surrounding whitespace", () => {
    expect(parseGrokVersion("\n  grok 0.2.118 (1e1687c1cf6a)  \n").version).toBe("0.2.118");
  });
});

describe("grokBinaryCandidates", () => {
  test("prefers the project-local install over PATH", () => {
    const sources = grokBinaryCandidates().map((c) => c.source);
    expect(sources).toEqual(["local", "grok-home", "path"]);
  });

  test("the local candidate points at node_modules/.bin", () => {
    expect(grokBinaryCandidates()[0].path).toContain("node_modules/.bin/grok");
  });

  test("honours a custom binary name", () => {
    expect(grokBinaryCandidates("grok-next")[2].path).toBe("grok-next");
  });
});

describe("detectGrok — V-004", () => {
  test("detects the installed Grok Build binary and reports a version", () => {
    const detection = detectGrok();
    expect(detection.installed).toBe(true);
    expect(detection.binaryPath).toBeTruthy();
    // Must be a real semver, not a placeholder.
    expect(detection.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(detection.raw).toContain("grok");
    expect(detection.error).toBeNull();
    expect(detection.setupMessage).toBeNull();
  });

  test("missing installation reports a useful setup message instead of throwing", () => {
    const detection = detectGrok("openui-nonexistent-binary-xyz");
    expect(detection.installed).toBe(false);
    expect(detection.binaryPath).toBeNull();
    expect(detection.version).toBeNull();
    expect(detection.error).toContain("not found");
    expect(detection.setupMessage).toBeTruthy();
    // The guidance must name the package an operator can actually install.
    expect(detection.setupMessage).toContain(GROK_NPM_PACKAGE);
    expect(detection.setupMessage).toContain("grok --version");
  });

  test("getGrokDetection caches and refreshes", () => {
    const first = getGrokDetection();
    expect(getGrokDetection()).toBe(first); // same object identity => cached
    expect(getGrokDetection(true)).not.toBe(first); // refresh re-probes
  });
});
