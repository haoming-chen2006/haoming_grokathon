import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { realpathSync } from "fs";
import { tmpdir } from "os";
import { join, sep } from "path";
import {
  BASE_CAPABILITIES,
  CAPABILITY_PRESETS,
  GROK_NATIVE_SURFACE,
  IMAGE_TOOLS,
  MEDIA_TOOLS,
  VOICE_TOOLS,
  canonical,
  capabilityLabel,
  capabilityPreset,
  mediaToolsForCapability,
  mediaToolsWithheldByCapability,
} from "./boundary";
import { ACP_ARGS, SANDBOX_PROFILE } from "./acpClient";
import { PROJECT_MCP_TOOLS } from "./projectMcpServer";

/**
 * AGENTS-001, second clause: a symlink is resolved before an area root is ever stored or compared.
 *
 * The path *comparison* this file used to hold is gone — the boundary is `--sandbox`, asserted at
 * the bottom of this file. What survives is `canonical`, which `workArea.ts` uses to store one
 * directory under one name, and the reasons it has to: on macOS `/var` is a symlink to
 * `/private/var`, so one area has two spellings unless something resolves them.
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

describe("canonical resolves the two ways one area gets two names", () => {
  test("a symlink inside the root resolves to where it actually points", () => {
    symlinkSync(outside, join(root, "escape"));
    const target = join(root, "escape", "stolen.txt");

    // The escape probe: as strings this path is inside the root. It is not — the link leaves it,
    // which is why `<managed-repo>/link -> /etc` once had git operating on /etc.
    expect(target.startsWith(root + sep)).toBe(true);
    expect(canonical(target).startsWith(canonical(root) + sep)).toBe(false);
  });

  test("a symlinked root and a path under its real name resolve to the same place", () => {
    const real = mkdtempSync(join(tmpdir(), "openui-area-real-"));
    const link = join(root, "by-another-name");
    symlinkSync(real, link);
    try {
      const viaRealName = join(realpathSync(real), "note.md");

      // The false-refusal probe: as strings these have nothing in common.
      expect(viaRealName.startsWith(link + sep)).toBe(false);
      expect(canonical(viaRealName).startsWith(canonical(link) + sep)).toBe(true);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  test("canonicalising does not merge a sibling whose name extends the root", () => {
    const sibling = `${root}-other`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(join(root, "brief.md"), "x");
    try {
      expect(canonical(join(sibling, "file.md")).startsWith(canonical(root) + sep)).toBe(false);
      expect(canonical(join(root, "brief.md")).startsWith(canonical(root) + sep)).toBe(true);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------- A-00: the boundary is grok's, not ours

describe("the area boundary is --sandbox", () => {
  test("every agent process is launched under a sandbox profile", () => {
    // The rule the board header prints was enforced by nothing until this flag was passed: no
    // PreToolUse hook was ever installed, and --always-approve approves every tool call.
    expect(SANDBOX_PROFILE).not.toBe("off");
    expect([...ACP_ARGS]).toContain("--sandbox");
    expect([...ACP_ARGS]).toContain(SANDBOX_PROFILE);
  });

  test("--sandbox precedes the subcommand, because it is a top-level flag", () => {
    // It is absent from `grok agent --help`; placed after `agent` the process fails to start.
    const args = [...ACP_ARGS];
    expect(args.indexOf("--sandbox")).toBeLessThan(args.indexOf("agent"));
    expect(args.indexOf(SANDBOX_PROFILE)).toBe(args.indexOf("--sandbox") + 1);
  });

  test("this file no longer exports a path comparison of its own", async () => {
    // A-00: we wrote one, it was never called, and the flag does the job better. Re-adding it would
    // be the second implementation of a boundary the kernel already enforces.
    const boundary = await import("./boundary");
    expect(Object.keys(boundary)).not.toContain("isInsideRoot");
  });

  test("why --tools was rejected for capability is recorded, not merely decided", () => {
    const src = readFileSync(join(import.meta.dir, "boundary.ts"), "utf8");
    expect(src, "the --tools finding was removed from boundary.ts").toContain(
      "Built-in tools to allow",
    );
    expect(src, "the register-and-refuse reason was removed").toContain("MCPTool(media__generate_image)");
    expect(src, "the A-0 subtraction argument was removed").toContain(
      "cannot implement a rule that forbids",
    );
  });
});

// ------------------------------------------------- capability: which tools exist (AGENTS-007/008)

describe("capability decides which tools exist", () => {
  test("base Grok grants no media tool at all", () => {
    expect(mediaToolsForCapability(BASE_CAPABILITIES)).toEqual([]);
    // And every media tool is withheld — the list is exhaustive, not a sample.
    expect(mediaToolsWithheldByCapability(BASE_CAPABILITIES).sort()).toEqual([...MEDIA_TOOLS].sort());
  });

  test("images grants image and video tools; voice grants neither", () => {
    expect(mediaToolsForCapability({ images: true, voice: false })).toEqual([...IMAGE_TOOLS]);
    for (const tool of VOICE_TOOLS) {
      expect(mediaToolsForCapability({ images: true, voice: false })).not.toContain(tool);
    }
  });

  test("voice grants narration and transcription; images grants neither", () => {
    expect(mediaToolsForCapability({ images: false, voice: true })).toEqual([...VOICE_TOOLS]);
    for (const tool of IMAGE_TOOLS) {
      expect(mediaToolsForCapability({ images: false, voice: true })).not.toContain(tool);
    }
  });

  test("voice + images grants the union and withholds nothing", () => {
    expect(mediaToolsForCapability({ images: true, voice: true }).sort()).toEqual([...MEDIA_TOOLS].sort());
    expect(mediaToolsWithheldByCapability({ images: true, voice: true })).toEqual([]);
  });

  test("granted and withheld always partition the media tools, for every capability", () => {
    for (const images of [true, false]) {
      for (const voice of [true, false]) {
        const capabilities = { images, voice };
        const both = [...mediaToolsForCapability(capabilities), ...mediaToolsWithheldByCapability(capabilities)];
        expect(both.sort()).toEqual([...MEDIA_TOOLS].sort());
      }
    }
  });

  test("video is granted by images, because it is the same endpoint family", () => {
    // Not a separate flag: one credential, one rate family. A capability picker offering "video"
    // separately would imply a credential boundary that does not exist.
    expect(mediaToolsForCapability({ images: true, voice: false })).toContain("image_to_video");
    expect(mediaToolsForCapability({ images: true, voice: false })).toContain("poll_video_job");
  });
});

describe("the four presets", () => {
  test("every combination of the two flags has exactly one preset", () => {
    expect(CAPABILITY_PRESETS).toHaveLength(4);
    const seen = new Set<string>();
    for (const images of [true, false]) {
      for (const voice of [true, false]) {
        const preset = capabilityPreset({ images, voice });
        expect(seen.has(preset.id)).toBe(false);
        seen.add(preset.id);
        expect(preset.mediaTools.sort()).toEqual(mediaToolsForCapability({ images, voice }).sort());
      }
    }
  });

  test("the cheapest choice is first, so the expensive one is a deliberate step", () => {
    expect(CAPABILITY_PRESETS[0]!.id).toBe("base");
    expect(CAPABILITY_PRESETS[0]!.mediaTools).toEqual([]);
    expect(CAPABILITY_PRESETS.at(-1)!.id).toBe("voice+images");
  });

  test("every preset carries a text label and a note about what it can spend on", () => {
    for (const preset of CAPABILITY_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.spendNote.trim().length).toBeGreaterThan(0);
    }
    expect(capabilityLabel(BASE_CAPABILITIES)).toBe("base Grok");
    expect(capabilityLabel({ images: true, voice: true })).toBe("Grok + voice + images");
  });

  test("no badge names a medium the API cannot produce", () => {
    // There is no xAI slide, deck or document generation endpoint, and there cannot be one: the two
    // surfaces that look like it are a Microsoft 365 add-in and a consumer chat product, both user
    // interfaces. A badge naming one would promise an endpoint that does not exist.
    const forbidden = ["slide", "deck", "pptx", "powerpoint", "presentation", "docx", "pdf"];
    for (const preset of CAPABILITY_PRESETS) {
      const text = `${preset.id} ${preset.label} ${preset.spendNote}`.toLowerCase();
      for (const word of forbidden) expect(text).not.toContain(word);
    }
    for (const tool of MEDIA_TOOLS) {
      for (const word of forbidden) expect(tool.toLowerCase()).not.toContain(word);
    }
  });
});

describe("the safety is the absence of the tool, and the code says so", () => {
  test("the explanation is in the source, and this test fails if it is deleted", () => {
    // AGENTS-008: "when safety comes from the absence of something, write that down — say so in
    // the code, and make a test fail if the explanation is deleted." Without the explanation, the
    // next reader sees a function returning a list and adds a register-and-refuse path, which is
    // the retry loop that costs money.
    const src = readFileSync(join(import.meta.dir, "boundary.ts"), "utf8");
    expect(src, "the registration-not-refusal explanation was removed from boundary.ts").toContain(
      "The enforcement is registration, not refusal",
    );
    expect(src, "the reason register-and-refuse is forbidden was removed").toContain(
      "an advertised tool that always fails is",
    );
    expect(src, "the DELIBERATELY_USER_ONLY precedent was removed").toContain("DELIBERATELY_USER_ONLY");
    expect(src, "the no-slide-endpoint explanation was removed").toContain("There is no slide, deck or document tool");
  });
});

// ------------------------------------------------- A-0: capability adds, it never subtracts

describe("every agent is a whole Grok Build agent (A-0)", () => {
  test("no capability tier can express the removal of anything", () => {
    // The model has exactly one varying field and it ranges over MEDIA_TOOLS. There is nowhere to
    // put a subtraction, which is the point: a tier is a grant on top of a whole agent.
    for (const preset of CAPABILITY_PRESETS) {
      expect(Object.keys(preset).sort()).toEqual(["capabilities", "id", "label", "mediaTools", "spendNote"]);
      for (const tool of preset.mediaTools) expect(MEDIA_TOOLS).toContain(tool as any);
    }
  });

  test("granted and withheld both range over the media tools and nothing else", () => {
    for (const images of [true, false]) {
      for (const voice of [true, false]) {
        for (const tool of mediaToolsForCapability({ images, voice })) expect(MEDIA_TOOLS).toContain(tool as any);
        for (const tool of mediaToolsWithheldByCapability({ images, voice })) {
          expect(MEDIA_TOOLS).toContain(tool as any);
        }
      }
    }
  });

  test("a media tool never collides with a project MCP tool, so the media list is purely additive", () => {
    // If a name in MEDIA_TOOLS matched a project tool, gating "media" registration would silently
    // gate a tool every agent must have.
    for (const tool of MEDIA_TOOLS) expect(PROJECT_MCP_TOOLS).not.toContain(tool as any);
  });

  test("the native surface is the same at every tier, and base Grok is not a smaller agent", () => {
    expect(GROK_NATIVE_SURFACE.length).toBeGreaterThan(0);
    for (const expected of ["file reading and editing", "web search", "X search", "skills", "subagents"]) {
      expect(GROK_NATIVE_SURFACE).toContain(expected as any);
    }
    // Nothing in the model is per-tier, so there is no way for one tier to have less of it.
    expect(CAPABILITY_PRESETS.every((p) => !("nativeSurface" in p))).toBe(true);
  });

  test("base Grok is described by what it is, before what it cannot spend on", () => {
    // "Cannot reach any per-unit endpoint" alone reads as a stripped-down agent, which is the
    // picture A-0 forbids. Every tier says it is the full Grok Build agent first.
    for (const preset of CAPABILITY_PRESETS) {
      expect(preset.spendNote, `${preset.id} does not say it is a full Grok Build agent`).toContain(
        "full Grok Build agent",
      );
    }
    expect(CAPABILITY_PRESETS[0]!.spendNote.indexOf("full Grok Build agent")).toBeLessThan(
      CAPABILITY_PRESETS[0]!.spendNote.indexOf("cannot"),
    );
  });

  test("the A-0 explanation is in the source, and this test fails if it is deleted", () => {
    const src = readFileSync(join(import.meta.dir, "boundary.ts"), "utf8");
    expect(src, "the A-0 statement was removed from boundary.ts").toContain(
      "capability adds to it — capability never subtracts",
    );
    expect(src, "the job-runner-wearing-an-agent's-name warning was removed").toContain(
      "ships a job runner wearing an agent's name",
    );
    expect(src, "the note that base Grok is not a smaller agent was removed").toContain(
      "is not a smaller agent",
    );
  });
});
