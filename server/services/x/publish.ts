/**
 * The publish step: claim a key, send once, settle the record.
 *
 * This is the only place in the product that posts to X, and it is deliberately not reachable from
 * an MCP tool. `DELIBERATELY_USER_ONLY` already withholds six actions from agents on the grounds
 * that an agent must not approve its own work; publishing to a public timeline is the strongest
 * case of that rule in the product, not an exception to it. An agent's tool is `draft_x_post`, and
 * it stops at the draft.
 *
 * The ordering below is the whole point and is not an implementation detail:
 *
 *   1. claim the idempotency key and **write it to disk**;
 *   2. send, exactly once, with no retry on any outcome;
 *   3. settle the record with what happened, including "I do not know".
 *
 * Step 1 before step 2 is what turns the worst case from a silent duplicate on a real timeline into
 * a record a human can resolve by looking at the account.
 */

import { XClient, XError, type PublishedPost } from "./client";
import { getPublishRecordStore, idempotencyKey, type PublishRecord, type PublishRecordStore } from "./publishRecord";

export interface PublishRequest {
  text: string;
  /** The user id of the person who pressed the button. Never an agent, never the string "user". */
  confirmedBy: string;
  /** True when the only approver in the workspace approved their own request. Recorded, not hidden. */
  selfApproved: boolean;
  draftedByAgentId?: string;
  projectId?: string;
  assetId?: string;
  costUsd?: number | null;
  /** Supply to make a retry deliberate; omitted, it is derived from the text and the approver. */
  key?: string;
}

export interface PublishOutcome {
  record: PublishRecord;
  post?: PublishedPost;
  /** True when this call sent nothing because the key had already been used. */
  deduplicated: boolean;
}

export async function publishToX(
  request: PublishRequest,
  client: XClient = new XClient(),
  store: PublishRecordStore = getPublishRecordStore(),
): Promise<PublishOutcome> {
  const key = request.key ?? idempotencyKey({ text: request.text, confirmedBy: request.confirmedBy });

  const { record, alreadyClaimed } = store.claim({
    id: key,
    text: request.text,
    confirmedBy: request.confirmedBy,
    selfApproved: request.selfApproved,
    dryRun: client.dryRun,
    draftedByAgentId: request.draftedByAgentId,
    projectId: request.projectId,
    assetId: request.assetId,
    costUsd: request.costUsd,
  });

  if (alreadyClaimed) {
    // A second confirmation carrying a key that already has a result returns that result and calls
    // nothing. An `in_flight` record returns as it stands — still not a reason to send again.
    return { record, deduplicated: true };
  }

  try {
    const post = await client.publish(request.text);
    return {
      record: store.settle(key, { state: "published", postId: post.id, url: post.url }),
      post,
      deduplicated: false,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // A timeout or a dropped connection is `unknown`, never `refused`: the post may exist, and
    // calling that a failure is what invites the retry that duplicates it.
    const state = err instanceof XError && err.code === "unknown" ? "unknown" : "refused";
    return { record: store.settle(key, { state, error }), deduplicated: false };
  }
}
