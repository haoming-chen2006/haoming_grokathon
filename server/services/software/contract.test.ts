/**
 * A-0 — every agent is a Grok Build agent (`grok-workspace.md` §3.3.1).
 *
 * > An agent in this product is a real `grok` process, spoken to over ACP, retaining Grok Build's
 * > entire native surface. It is not a wrapper around a chat completion, not a bespoke worker loop,
 * > and not a media-generation job with a name.
 *
 * The failure that requirement names is easy to walk into from exactly here. This surface owns a
 * template, a build, a preview and an export — all of them deterministic, none of them needing a
 * model. The temptation is the next step: "software generation" as a pipeline that scaffolds a
 * template, posts a prompt somewhere, writes the files back, and calls itself an agent. It would
 * work, it would be simpler, and the user's team would silently lose file editing, shell, search,
 * skills and everything else `grok` gives them.
 *
 * So this area holds one line, asserted here rather than promised in a comment: **it contains tools
 * an agent calls, and no agent.** Nothing in it talks to a model, and nothing in it runs one. The
 * agent is a `grok` process started by the launch path, and `run_build`, `start_preview`,
 * `get_preview_errors` and `list_app_files` are things it may choose to call while it works.
 *
 * This also carries SW-011's first clause — no code path in this area contacts any host other than
 * localhost and the package registry — which is why the two are asserted together.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/** Production sources in this area. Test files are excluded: this file names what it forbids. */
function productionSources(): Array<{ file: string; code: string }> {
  const dir = import.meta.dir;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((file) => {
      const source = readFileSync(join(dir, file), "utf8");
      // Comments are stripped before the search, or this file's own prose — and every honest
      // explanation of what we do *not* do — would read as a violation.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      return { file, code };
    });
}

describe("this surface provides tools for an agent, and is not one (A-0)", () => {
  test("nothing here talks to a model provider, or to any host at all", () => {
    // A "generation job with a name" needs a client to something. There is none, and the moment
    // one appears this fails and the change has to be argued for rather than merged.
    const forbidden = [
      /\bfetch\s*\(/,
      /https?:\/\/(?!127\.0\.0\.1|localhost)/,
      /api\.x\.ai|api\.openai\.com|api\.anthropic\.com|generativelanguage|api\.groq\.com/i,
      /@ai-sdk|openai|anthropic|@google\/gen|langchain/i,
      /XAI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/,
    ];
    for (const { file, code } of productionSources()) {
      for (const pattern of forbidden) {
        expect({ file, pattern: String(pattern), hit: pattern.test(code) }).toEqual({
          file,
          pattern: String(pattern),
          hit: false,
        });
      }
    }
  });

  test("nothing here starts an agent or opens a session of its own", () => {
    // The agent is a `grok` process the launch path starts and speaks ACP to. If this surface ever
    // needs one, that is a §9 stop and a conversation with the owner — not a spawn added quietly to
    // a services directory.
    const forbidden = [/\bgrok\b/i, /acpClient|acpSessionManager|AcpConnection|sessionManager/];
    for (const { file, code } of productionSources()) {
      for (const pattern of forbidden) {
        expect({ file, pattern: String(pattern), hit: pattern.test(code) }).toEqual({
          file,
          pattern: String(pattern),
          hit: false,
        });
      }
    }
  });

  test("processes are started in four places, and adding a fifth is a deliberate act", () => {
    // An allowlist of command *strings* would be theatre: `spawnDetached` takes a string, the dev
    // and build commands come from the app's own package.json, and a literal like "curl …" would
    // simply not match the pattern that was supposed to catch it. What can be checked is where a
    // process is started at all. These are the four, each a build tool doing deterministic work:
    //
    //   assetRepo.ts    bun install, and git
    //   buildRunner.ts  the app's build script
    //   preview.ts      the app's dev script
    //   exportApp.ts    zip
    //
    // A fifth call site fails this test, which is the moment to ask what is being started and why.
    const sites: Record<string, number> = {};
    for (const { file, code } of productionSources()) {
      const count = [...code.matchAll(/\b(?:spawnDetached|spawnSync|spawn)\s*\(/g)].length;
      if (count > 0) sites[file] = count;
    }
    expect(sites).toEqual({
      "assetRepo.ts": 2, // bun install, and the git helper
      "buildRunner.ts": 1,
      "exportApp.ts": 1,
      "preview.ts": 1,
      "processGroup.ts": 2, // the primitive's own declaration, and the one `spawn` it wraps
    });
  });
});
