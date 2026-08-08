/**
 * The area boundary — the one place that decides whether a path is inside a work area.
 *
 * Isolation used to be a git worktree: a cwd handed to the agent and nothing more. A worktree made
 * an out-of-bounds edit *recoverable*; it never *prevented* one. This module is the prevention, and
 * everything that compares a path against an area root goes through it so there is exactly one
 * implementation to get right.
 */
import { realpathSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";

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
 * What an agent may call, chosen once at creation.
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
export function toolsForCapability(capabilities: AgentCapabilities): string[] {
  return [
    ...(capabilities.images ? IMAGE_TOOLS : []),
    ...(capabilities.voice ? VOICE_TOOLS : []),
  ];
}

/** The media tools an agent's capability does **not** grant. The absence is the safety. */
export function toolsWithheldByCapability(capabilities: AgentCapabilities): string[] {
  const granted = new Set(toolsForCapability(capabilities));
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
 * No per-unit price appears here. The rate table and the ledger are 06-tools-cost's, and two
 * documents specifying the same prices is how they come to disagree.
 */
export const CAPABILITY_PRESETS: CapabilityPreset[] = [
  {
    id: "base",
    label: "base Grok",
    capabilities: { images: false, voice: false },
    mediaTools: [],
    spendNote: "Cannot reach any per-unit endpoint. Its worst case is bounded by token spend.",
  },
  {
    id: "images",
    label: "Grok + images",
    capabilities: { images: true, voice: false },
    mediaTools: [...IMAGE_TOOLS],
    spendNote:
      "Can generate still images and video. Video is priced per second and costs roughly two " +
      "orders of magnitude more per artifact than a still image.",
  },
  {
    id: "voice",
    label: "Grok + voice",
    capabilities: { images: false, voice: true },
    mediaTools: [...VOICE_TOOLS],
    spendNote: "Can synthesise and transcribe speech, priced per character and per minute.",
  },
  {
    id: "voice+images",
    label: "Grok + voice + images",
    capabilities: { images: true, voice: true },
    mediaTools: [...IMAGE_TOOLS, ...VOICE_TOOLS],
    spendNote:
      "Everything the other three can call. The most expensive agent to run, and the only one " +
      "that can spend on both media families.",
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
 * Is `candidate` the area root itself, or inside it?
 *
 * Canonicalises both halves before comparing — that is the whole point of the function, and the
 * reason no caller is allowed to do this comparison itself. The trailing separator matters: without
 * it `/area-other/file` starts with `/area` as a string and a sibling area would be judged inside
 * this one.
 */
export function isInsideRoot(root: string, candidate: string): boolean {
  const canonicalRoot = canonical(root);
  const canonicalCandidate = canonical(candidate);
  return canonicalCandidate === canonicalRoot || canonicalCandidate.startsWith(canonicalRoot + sep);
}
