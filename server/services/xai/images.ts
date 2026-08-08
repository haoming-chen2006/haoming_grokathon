/**
 * `/v1/images/generations` (loops/04-generation.md G3, §5.1).
 *
 * One function, one endpoint, one image. Everything that makes an image expensive or wrong — the
 * rate limit, the timeout, the cost event, the expiring URL — is already handled by `client.ts` and
 * `assets.ts`; this file's whole job is to build a correct request body and to hand back a payload
 * the asset contract can persist.
 *
 * ── Why one image per call ────────────────────────────────────────────────────────────────────
 * The endpoint takes `n` up to 10. This function does not, because the only caller is an MCP tool
 * that makes one picture at a time, and a batch path that nothing calls is a path nothing tests —
 * against a priced endpoint, an untested batch path is an untested way to spend ten times as much.
 * If a caller ever needs a batch, `n` and the `url` response format come back together, because
 * batches cannot use `b64_json` economically. The request for that is in the handoff.
 */

import { XaiError, type CostEvent } from "./types";
import { xaiClient, type XaiCallContext, type XaiClient } from "./client";
import type { GeneratedPayload } from "./assets";

/**
 * The two image models and their published per-image prices (§5.1), flat regardless of prompt
 * length. A model absent from this table has no known price — see `unitRateFor`.
 */
export const IMAGE_MODEL_PRICES_USD: Readonly<Record<string, number>> = {
  "grok-imagine-image": 0.02,
  "grok-imagine-image-quality": 0.05,
};

/** The cheap one. A caller that does not choose pays $0.02, not $0.05. */
export const DEFAULT_IMAGE_MODEL = "grok-imagine-image";

/** The aspect ratios the endpoint documents (§5.1). `auto` lets the model decide. */
export const IMAGE_ASPECT_RATIOS = [
  "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2",
  "9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1", "auto",
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

/**
 * The published price per image, or undefined when this model is not in the table.
 *
 * Undefined travels all the way to the ledger as "we could not price this", which is the whole
 * point: a model we have no rate for must not be charged at zero, and the only way to guarantee
 * that is to have no number to put there rather than a default one.
 */
export function unitRateFor(model: string): number | undefined {
  return IMAGE_MODEL_PRICES_USD[model];
}

export interface GenerateImageArgs {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  /** Who the charge belongs to. Never inferred here. */
  context: XaiCallContext;
  /** Tests only. */
  client?: XaiClient;
}

export interface GeneratedImage {
  /** Ready for `persistGenerated`: base64 when the endpoint honoured the ask, a URL when it did not. */
  payload: GeneratedPayload;
  model: string;
  /** The request body as sent, minus the prompt, for the asset's `params`. */
  params: Record<string, unknown>;
  costEvent: CostEvent | null;
  /** `usage.cost_in_usd_ticks` converted, or null when the response carried none. */
  costUsd: number | null;
}

interface ImagesResponse {
  data?: { url?: unknown; b64_json?: unknown; mime_type?: unknown }[];
  model?: unknown;
}

/**
 * Generate one image and return it as bytes-in-waiting.
 *
 * `response_format: "b64_json"` is asked for deliberately (§5.1): the returned URL expires, and a
 * base64 body sidesteps the expiring link entirely rather than racing it. The `url` branch below is
 * not a fallback we prefer — it is there because an endpoint is free to ignore the parameter, and
 * discarding a picture we have already paid for because it arrived in the other shape would be a
 * silly way to lose $0.02. `persistGenerated` downloads a URL immediately and never stores it.
 */
export async function generateImage(args: GenerateImageArgs): Promise<GeneratedImage> {
  const prompt = args.prompt.trim();
  if (!prompt) throw new XaiError("an image prompt cannot be empty", "invalid_argument");

  const model = args.model ?? DEFAULT_IMAGE_MODEL;
  const aspectRatio = args.aspectRatio;
  if (aspectRatio !== undefined && !(IMAGE_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) {
    throw new XaiError(
      `aspect_ratio "${aspectRatio}" is not one of ${IMAGE_ASPECT_RATIOS.join(", ")}`,
      "invalid_argument",
    );
  }

  const body: Record<string, unknown> = { model, prompt, n: 1, response_format: "b64_json" };
  if (aspectRatio !== undefined) body.aspect_ratio = aspectRatio;

  const response = await (args.client ?? xaiClient()).request<ImagesResponse>({
    endpoint: "image_generate",
    path: "/images/generations",
    body,
    context: args.context,
    billing: {
      operation: "image_generate",
      modelId: model,
      units: { kind: "images", count: 1 },
      // Absent for a model we have no published price for. `client.ts` then records the charge with
      // `rateKey: null`, and the surfaces above must render that as unpriced rather than as free.
      ...(unitRateFor(model) !== undefined ? { unitRateUsd: unitRateFor(model) as number } : {}),
    },
  });

  const first = response.data?.data?.[0];
  if (!first) {
    throw new XaiError(
      `api.x.ai returned no image for a ${model} generation. A response with an empty data array is ` +
        `a billed call with nothing to show for it, not a result.`,
      "bad_response",
      response.status,
      response.data,
    );
  }

  const mimeType = typeof first.mime_type === "string" ? first.mime_type : undefined;
  let payload: GeneratedPayload;
  if (typeof first.b64_json === "string" && first.b64_json.length > 0) {
    payload = { b64: first.b64_json, ...(mimeType ? { mimeType } : { mimeType: "image/png" }) };
  } else if (typeof first.url === "string" && first.url.length > 0) {
    payload = { url: first.url };
  } else {
    throw new XaiError(
      `api.x.ai returned an image entry carrying neither b64_json nor url (keys: ` +
        `${Object.keys(first).join(", ") || "none"}).`,
      "bad_response",
      response.status,
      response.data,
    );
  }

  // The prompt is stored on the file by the caller; repeating it in `params` would give one asset
  // two copies of the same string that can disagree after an edit.
  const params: Record<string, unknown> = { n: 1, response_format: "b64_json" };
  if (aspectRatio !== undefined) params.aspect_ratio = aspectRatio;

  return {
    payload,
    model: typeof response.data?.model === "string" ? response.data.model : model,
    params,
    costEvent: response.costEvent,
    costUsd: response.costUsd,
  };
}
