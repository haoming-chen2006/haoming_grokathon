/**
 * The area boundary, and the capability table.
 *
 * **The boundary is `--sandbox`, not this file (A-00).** This module used to export
 * `isInsideRoot(root, candidate)`, a canonicalising path comparison written to answer "may this
 * agent write here?". It was a careful piece of code with four escape probes behind it, and it was
 * never called: no PreToolUse hook was ever installed, and `acpClient.ts` launches every agent with
 * `--always-approve`. The rule the board header prints on every page — an agent can only change
 * things inside its own area — was enforced by nothing at all.
 *
 * `grok --sandbox <profile>` is the flag that already existed. `docs/user-guide/18-sandbox.md`:
 * the profile is applied to the whole process at startup through Seatbelt on macOS and Landlock on
 * Linux, is irreversible once applied, and is saved with the session so a resume comes back under
 * the same confinement. It covers what a tool-call hook structurally cannot — `bash`, `rg`,
 * subagents, and anything a child process does — and it is enforced by the kernel rather than by
 * our agreement with the model. `acpClient.ts`'s `SANDBOX_PROFILE` is where it is passed; the CWD an
 * agent is given is its worktree, so the writable set and the agent's area are the same directory.
 *
 * What remains here is `canonical()`, which `workArea.ts` uses to store an area root under one
 * name, and the capability table below, which is a different subject: which *tools exist*, not
 * which paths are writable.
 */
import { realpathSync } from "fs";
import { basename, dirname, join, resolve } from "path";

/**
 * Resolve a path to its canonical form, following symlinks.
 *
 * Copied deliberately from `server/routes/repository.ts` rather than re-derived: both directions of
 * this bug have actually happened, and a second implementation is a second chance to reintroduce
 * one of them. Both halves of every comparison must be canonical or the guard is wrong in both
 * directions:
 *
 *   - False refusals. On macOS `/var` is a symlink to `/private/var`, so an area stored as
 *     `/var/folders/x/area` and a path reported as `/private/var/folders/x/area` are the same
 *     directory under two names. String comparison rejects the second, which refuses a write the
 *     agent was entitled to make.
 *   - False approvals. `<area-root>/link` pointing at `/etc` starts with the area root as a string,
 *     so it passes — and the write then lands in /etc. Canonicalising closes that.
 *
 * A path that does not exist yet cannot be canonicalised, so the deepest existing ancestor is
 * resolved and the remaining segments are appended. Writes create files that do not exist yet, so
 * this branch is the common one here, not the exception.
 */
export function canonical(path: string): string {
  let head = resolve(path);
  const tail: string[] = [];
  for (;;) {
    try {
      return tail.length === 0 ? realpathSync(head) : join(realpathSync(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) return resolve(path); // reached the root; nothing to canonicalise
      tail.unshift(basename(head));
      head = parent;
    }
  }
}

// ─────────────────────────────────────────────────────────────── capability: which tools exist

/**
 * **A-0 (`grok-workspace.md` §3.3.1): every agent is a real `grok` process spoken to over ACP, and
 * capability adds to it — capability never subtracts.**
 *
 * Every agent in this product, at every tier, keeps Grok Build's entire native surface. `base Grok`
 * is not a smaller agent; it is the whole agent with no media endpoints registered on top. Nothing
 * in this module removes a native tool, and there is deliberately nowhere in the model to express
 * such a removal: a capability is a set of *additional* MCP tools and nothing else.
 *
 * The failure this prevents is easy to walk into. A surface that finds `grok` inconvenient — media
 * generation is the obvious one, since an image can be produced by an HTTP call with no agent at
 * all — ships a job runner wearing an agent's name. It works, it is simpler, and the user silently
 * loses the file editing, search, skills and subagents they were told their team has.
 */
export const GROK_NATIVE_SURFACE = [
  "file reading and editing",
  "shell execution, under the area boundary hook",
  "web search",
  "X search",
  "skills",
  "hooks",
  "subagents",
  "slash commands",
  "MCP servers",
  "session persistence and session/load resume",
] as const;

/** One sentence a creation form can render verbatim, so the product states A-0 and not only this file. */
export const GROK_NATIVE_SURFACE_NOTE =
  "Every agent is a full Grok Build agent, whatever its capability. A capability adds our media " +
  "endpoints as tools the agent may call; it never removes anything.";

/**
 * The media endpoints an agent may call, chosen once at creation. **Additive only** — see
 * `GROK_NATIVE_SURFACE` above.
 *
 * Two flags rather than a four-value enum, because a fifth capability is already foreseeable
 * (posting to X, 08-users-x) and an enum forces a migration. Presented as four presets, because
 * four is what the product actually offers.
 */
export interface AgentCapabilities {
  /** Grok Imagine: still images AND video. One endpoint family, one credential, one rate family. */
  images: boolean;
  /** TTS, STT, realtime speech. */
  voice: boolean;
}

/**
 * The media tools, by the capability that grants them.
 *
 * There is no slide, deck or document tool in this table and there cannot be one. The two surfaces
 * that look like a deck generator — the Microsoft 365 add-in and grok.com's downloadable file — are
 * both user interfaces, neither callable from a server. Slide content comes from the chat API as
 * structured JSON and is rendered by us (04-generation). A badge that implied otherwise would
 * promise a medium the API cannot produce.
 */
export const IMAGE_TOOLS = ["generate_image", "edit_image", "image_to_video", "poll_video_job"] as const;
export const VOICE_TOOLS = ["narrate", "transcribe"] as const;
export const MEDIA_TOOLS = [...IMAGE_TOOLS, ...VOICE_TOOLS] as const;

export const BASE_CAPABILITIES: AgentCapabilities = { images: false, voice: false };

/**
 * The media tools an agent's capability grants — and, by omission, the ones its MCP server must
 * not register.
 *
 * **The enforcement is registration, not refusal.** A tool the capability does not grant is not
 * registered at all, exactly as `DELIBERATELY_USER_ONLY`
 * (`server/services/projectMcpServer.ts`) withholds six tools so an agent cannot approve its own
 * work. Do not register a tool and return an error from it: an advertised tool that always fails is
 * an invitation to retry, and a retry loop from an agent with media capability is the failure mode
 * that costs real money here — a 60-second generated experience is three orders of magnitude above
 * a text turn.
 *
 * This is why capability is a budget control as much as a feature flag. A base-Grok agent cannot
 * reach any per-unit endpoint at all, so its worst case is bounded by token spend. The cheapest
 * spending control in the product is not a dollar cap; it is not granting the capability.
 */
export function mediaToolsForCapability(capabilities: AgentCapabilities): string[] {
  return [
    ...(capabilities.images ? IMAGE_TOOLS : []),
    ...(capabilities.voice ? VOICE_TOOLS : []),
  ];
}

/**
 * The media tools an agent's capability does **not** grant. The absence is the safety.
 *
 * "Withheld" ranges over `MEDIA_TOOLS` and nothing else, by construction. It never names a project
 * MCP tool and never names anything in `GROK_NATIVE_SURFACE` — an empty return from
 * `mediaToolsForCapability` means "no media endpoints", never "no tools".
 */
export function mediaToolsWithheldByCapability(capabilities: AgentCapabilities): string[] {
  const granted = new Set(mediaToolsForCapability(capabilities));
  return MEDIA_TOOLS.filter((tool) => !granted.has(tool));
}

export type CapabilityPresetId = "base" | "images" | "voice" | "voice+images";

export interface CapabilityPreset {
  id: CapabilityPresetId;
  /** Shown on the badge. Names what the agent may call, never what it might produce. */
  label: string;
  capabilities: AgentCapabilities;
  /** The media tools this preset registers. Empty for base Grok. */
  mediaTools: string[];
  /** What the user is choosing, said at the moment of choosing rather than in a settings page. */
  spendNote: string;
}

/**
 * The four choices the product offers, in the order the creation form presents them: cheapest
 * first, so the expensive one is a deliberate step rather than a default.
 *
 * Every one of them is a whole Grok Build agent. The differences below are entirely additions;
 * `mediaTools` is the only field that varies and it ranges over `MEDIA_TOOLS` alone.
 *
 * No per-unit price appears here. The rate table and the ledger are 06-tools-cost's, and two
 * documents specifying the same prices is how they come to disagree.
 */
export const CAPABILITY_PRESETS: CapabilityPreset[] = [
  {
    id: "base",
    label: "base Grok",
    capabilities: { images: false, voice: false },
    mediaTools: [],
    spendNote:
      "The full Grok Build agent and nothing on top. No media endpoint is registered, so it cannot " +
      "spend per image, per second or per character — its worst case is bounded by token spend.",
  },
  {
    id: "images",
    label: "Grok + images",
    capabilities: { images: true, voice: false },
    mediaTools: [...IMAGE_TOOLS],
    spendNote:
      "The full Grok Build agent, plus our image endpoints: still images and video, offered as " +
      "tools it may call as part of its work. Video is priced per second and costs roughly two " +
      "orders of magnitude more per artifact than a still image.",
  },
  {
    id: "voice",
    label: "Grok + voice",
    capabilities: { images: false, voice: true },
    mediaTools: [...VOICE_TOOLS],
    spendNote:
      "The full Grok Build agent, plus our speech endpoints: synthesis and transcription, priced " +
      "per character and per minute.",
  },
  {
    id: "voice+images",
    label: "Grok + voice + images",
    capabilities: { images: true, voice: true },
    mediaTools: [...IMAGE_TOOLS, ...VOICE_TOOLS],
    spendNote:
      "The full Grok Build agent, plus both media families. The most expensive agent to run, and " +
      "the only one that can spend on images and speech alike.",
  },
];

/** The preset matching a capability set. Total: the four presets cover both flags exhaustively. */
export function capabilityPreset(capabilities: AgentCapabilities): CapabilityPreset {
  const found = CAPABILITY_PRESETS.find(
    (p) => p.capabilities.images === capabilities.images && p.capabilities.voice === capabilities.voice,
  );
  if (!found) throw new Error(`No capability preset for ${JSON.stringify(capabilities)}`);
  return found;
}

/** The badge text. Always words, never a colour or an icon alone. */
export function capabilityLabel(capabilities: AgentCapabilities): string {
  return capabilityPreset(capabilities).label;
}

/**
 * Why `--tools` cannot replace the table above (A-00).
 *
 * A-00 requires that a surface which builds its own mechanism first records the flag it considered
 * and why the flag was insufficient. For the path boundary the flag won and this file lost — see
 * the header. For capability it does not, for three separate reasons, and the third is the one that
 * settles it:
 *
 *   1. `--tools <TOOLS>` is documented as "Built-in tools to allow (comma-separated)". It names
 *      grok's own tools — Bash, Read, Edit, Grep, WebSearch. `generate_image` and `narrate` are
 *      not built-ins; they are tools our own MCP server registers. There is no spelling of them
 *      `--tools` accepts.
 *   2. The permission system *can* name them, as `--deny 'MCPTool(media__generate_image)'`
 *      (docs/user-guide/22-permissions-and-safety.md, "MCP Rules"). But that advertises the tool
 *      and then refuses the call, which is precisely the register-and-refuse shape
 *      `mediaToolsForCapability` exists to avoid: a listed tool that always fails invites a retry,
 *      and a retry loop from an agent with media capability is what costs real money here.
 *   3. `--tools` is an allowlist over the built-in surface, so using it for capability would mean
 *      expressing a tier as a *subtraction* from a whole agent. A-0 says capability adds and never
 *      subtracts. A flag whose only mode is subtraction cannot implement a rule that forbids
 *      subtracting, whatever it is pointed at.
 *
 * The two mechanisms are complementary rather than competing: `--sandbox` decides where an agent
 * may write, our registration decides which priced endpoints exist for it to call. Neither can do
 * the other's job.
 */
export const TOOLS_FLAG_NOTE =
  "grok's --tools flag allowlists built-in tools, so it cannot name our MCP media tools; and it " +
  "expresses capability as a subtraction from a whole agent, which A-0 forbids. Capability stays " +
  "a registration decision. The path boundary is grok's --sandbox.";
