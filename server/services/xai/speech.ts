/**
 * `/v1/tts` (loops/04-generation.md G5, §5.3).
 *
 * ── This is not OpenAI's `/v1/audio/speech` ───────────────────────────────────────────────────
 * The parameters are `text` and `voice_id`, not `input` and `voice`, and the OpenAI SDK cannot call
 * this endpoint at all (§5.3). Only `/v1/images/*` and chat completions are SDK-compatible via a
 * base-URL swap. Anyone who "simplifies" this file by reaching for the OpenAI client will find it
 * fails at the parameter names, not at the URL, which is a slower thing to discover.
 *
 * ── `with_timestamps` is always on ────────────────────────────────────────────────────────────
 * It returns per-character timing, which is what makes narration sync to anything deterministic
 * rather than hand-tuned. It is free, and reacquiring it means paying for the audio again — so no
 * call site is given the option to omit it. `withTimestamps` is not a parameter of this function
 * on purpose.
 *
 * ── What is verified and what is not ──────────────────────────────────────────────────────────
 * The price ($15.00 / 1M characters), the voices, the 15,000-character REST ceiling and the
 * parameter names are verified against docs.x.ai (§5.3). The **response shape is not**: the docs do
 * not say what the JSON envelope calls the audio, nor whether `/v1/tts` reports
 * `cost_in_usd_ticks` at all (§5.4). So the extraction below tries the plausible field names and,
 * when none matches, fails with the response's actual top-level keys in the message — one live call
 * then settles the question for good instead of leaving a guess in the code.
 */

import { XaiError, type CostEvent } from "./types";
import { xaiClient, type XaiCallContext, type XaiClient } from "./client";

/** $15.00 per 1,000,000 characters (§5.3). */
export const TTS_USD_PER_CHARACTER = 15 / 1_000_000;

/** The built-in voice palette. Ids are case-insensitive; `eve` is the endpoint's own default. */
export const TTS_VOICES = ["eve", "ara", "rex"] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];
export const DEFAULT_TTS_VOICE: TtsVoice = "eve";

/** REST ceiling (§5.3). Above this the WebSocket surface is required, and that is not built. */
export const TTS_MAX_CHARACTERS = 15_000;

/**
 * The model id recorded against a speech charge.
 *
 * docs.x.ai documents no `model` parameter for `/v1/tts`: the endpoint *is* the model. Naming it
 * after the endpoint is a fact anyone can check; inventing `grok-tts` would be a plausible-looking
 * string that appears in a ledger and corresponds to nothing. If a live response ever carries a
 * `model` field, that field wins — see the return value below.
 */
export const TTS_MODEL_ID = "xai:/v1/tts";

/** Default codec is MP3 at 24 kHz / 128 kbps (§5.3), which is what `output_format` is omitted for. */
export const TTS_DEFAULT_MIME = "audio/mpeg";

export interface GenerateSpeechArgs {
  text: string;
  voice?: string;
  /** Who the charge belongs to. Never inferred here. */
  context: XaiCallContext;
  /** Tests only. */
  client?: XaiClient;
}

export interface GeneratedSpeech {
  /** Base64 audio, exactly as returned. Decoded and verified by the persist path, not here. */
  b64: string;
  mimeType: string;
  modelId: string;
  voice: string;
  characters: number;
  /**
   * The whole response with the audio removed — the per-character timings and whatever else came
   * with them, kept verbatim.
   *
   * Verbatim rather than reshaped into a timings array of our own design, because the field names
   * are unverified: a reshaping that guesses wrong silently discards the most valuable field on the
   * endpoint, and the audio would have to be bought again to get it back.
   */
  timings: Record<string, unknown>;
  /** The per-character array, when it arrived under a name we recognise. Null when it did not. */
  characterTimings: unknown[] | null;
  costEvent: CostEvent | null;
  costUsd: number | null;
}

/** Field names that could plausibly carry the base64 audio, most likely first. */
const AUDIO_KEYS = ["audio", "audio_base64", "audio_content", "b64_json", "audio_b64"] as const;

/** Field names that could plausibly carry the per-character timing array. */
const TIMING_KEYS = ["timestamps", "character_timestamps", "characters", "alignment", "timings"] as const;

export async function generateSpeech(args: GenerateSpeechArgs): Promise<GeneratedSpeech> {
  const text = args.text;
  if (text.trim() === "") throw new XaiError("there is nothing to say: the text is empty", "invalid_argument");
  if (text.length > TTS_MAX_CHARACTERS) {
    throw new XaiError(
      `${text.length} characters exceeds the ${TTS_MAX_CHARACTERS.toLocaleString("en-US")}-character ` +
        `REST limit for /v1/tts. ` +
        `Longer text needs the WebSocket surface, which is not built. Split the narration instead — ` +
        `truncating it here would silently drop the end of what someone asked to be said.`,
      "invalid_argument",
    );
  }

  const voice = (args.voice ?? DEFAULT_TTS_VOICE).toLowerCase();
  if (!(TTS_VOICES as readonly string[]).includes(voice)) {
    throw new XaiError(
      `"${voice}" is not a built-in voice. The palette is ${TTS_VOICES.join(", ")}. Custom voice ` +
        `cloning is Enterprise-only through the API and this product does not offer it (§3.3).`,
      "invalid_argument",
    );
  }

  const response = await (args.client ?? xaiClient()).request<Record<string, unknown>>({
    endpoint: "tts",
    path: "/tts",
    // `output_format` is omitted so the documented default applies. Sending a shape we have not
    // verified risks a 400 on a call that would otherwise have worked.
    body: { text, voice_id: voice, with_timestamps: true },
    context: args.context,
    billing: {
      operation: "tts",
      modelId: TTS_MODEL_ID,
      units: { kind: "characters", count: text.length },
      unitRateUsd: TTS_USD_PER_CHARACTER,
    },
  });

  const payload = response.data;
  if (!payload || typeof payload !== "object") {
    throw new XaiError(
      `api.x.ai /v1/tts returned no JSON body. The audio was billed and nothing arrived.`,
      "bad_response",
      response.status,
    );
  }

  const audioKey = AUDIO_KEYS.find((k) => typeof payload[k] === "string" && (payload[k] as string).length > 0);
  if (!audioKey) {
    throw new XaiError(
      `api.x.ai /v1/tts returned a body with no recognisable base64 audio. Top-level keys were: ` +
        `${Object.keys(payload).join(", ") || "none"}. Tried ${AUDIO_KEYS.join(", ")}. This call was ` +
        `billed — record the shape above in VERIFICATION.md and add the key rather than retrying.`,
      "bad_response",
      response.status,
    );
  }

  // Everything except the audio, kept as it arrived. `usage` stays: it is the only evidence of
  // whether /v1/tts reports ticks, which §5.4 lists as unverified.
  const timings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key !== audioKey) timings[key] = value;
  }

  const timingKey = TIMING_KEYS.find((k) => Array.isArray(payload[k]));
  const characterTimings = timingKey ? (payload[timingKey] as unknown[]) : null;

  const mimeType = typeof payload.mime_type === "string" ? payload.mime_type : TTS_DEFAULT_MIME;

  return {
    b64: payload[audioKey] as string,
    mimeType,
    modelId: typeof payload.model === "string" ? payload.model : TTS_MODEL_ID,
    voice,
    characters: text.length,
    timings,
    characterTimings,
    costEvent: response.costEvent,
    costUsd: response.costUsd,
  };
}
