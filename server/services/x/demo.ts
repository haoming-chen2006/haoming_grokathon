/**
 * The demo: an agent drafts, a person confirms, and exactly one post is sent.
 *
 * Run it dry first — it renders, validates and records without calling anything:
 *
 * ```bash
 * X_DRY_RUN=1 bun run server/services/x/demo.ts
 * ```
 *
 * and then, only when a human has read the confirmation and said yes:
 *
 * ```bash
 * bun run server/services/x/demo.ts --send
 * ```
 *
 * `--send` is required even without `X_DRY_RUN`, so that neither forgetting an environment variable
 * nor running the file by reflex can put anything on a real timeline. Two independent gestures,
 * because the action cannot be taken back.
 */

import { XClient, postLength, MAX_POST_CHARACTERS } from "./client";
import { credentialsFromEnv } from "./oauth";
import { publishToX } from "./publish";
import { getPublishRecordStore } from "./publishRecord";

/** What an agent produced. In the product this arrives as a document asset from `draft_x_post`. */
export interface Draft {
  text: string;
  draftedByAgentId: string;
  projectId: string;
  /** What the artefact cost to make. `null` means unpriced — never 0. */
  costUsd: number | null;
}

/**
 * The confirmation, in text (§3.12).
 *
 * It shows the artefact itself, not a summary of it, and it names what cannot be undone. The screen
 * version of this is the same content in the shape `x-page.html` draws; the words are the part that
 * matters and they live here so both surfaces say the same thing.
 */
export function renderConfirmation(draft: Draft, account: { username: string }, dryRun: boolean): string {
  const length = postLength(draft.text);
  const cost = draft.costUsd === null ? "unknown — this could not be priced" : `$${draft.costUsd.toFixed(2)}`;
  const lines = [
    "┌─ Publish to X ─────────────────────────────────────────────────────────────",
    `│ Posting as @${account.username}`,
    "│",
    ...draft.text.split("\n").map((l) => `│   ${l}`),
    "│",
    `│ ${length} / ${MAX_POST_CHARACTERS} characters`,
    `│ Drafted by     ${draft.draftedByAgentId}`,
    `│ Project        ${draft.projectId}`,
    `│ Cost to make   ${cost}`,
    `│ Cost to send   $0.00 — posting is free; the media above is what cost money`,
    "│",
    dryRun
      ? "│ DRY RUN — nothing will be sent. The record will say so."
      : "│ This is public and permanent. Deleting it later does not unsend it.",
    "└────────────────────────────────────────────────────────────────────────────",
  ];
  return lines.join("\n");
}

async function main() {
  const send = process.argv.includes("--send");
  const dryRun = process.env.X_DRY_RUN === "1" || !send;

  const credentials = credentialsFromEnv();
  if ("missing" in credentials) {
    console.error(`Missing X credentials: ${credentials.missing.join(", ")}`);
    process.exit(1);
  }

  const client = new XClient({ credentials, dryRun });
  const account = dryRun
    ? { id: "dryrun", username: "dry_run", name: "Dry run" }
    : await client.verifyCredentials();

  // The draft. In the product this is the agent's output; here it is stated literally so the demo
  // has nothing hidden in it.
  const draft: Draft = {
    text: process.env.X_DEMO_TEXT ?? "",
    draftedByAgentId: "agent_poster",
    projectId: "grok-control-room",
    costUsd: null,
  };

  if (!draft.text) {
    console.error("Set X_DEMO_TEXT to the post. Nothing is invented here.");
    process.exit(1);
  }

  console.log(renderConfirmation(draft, account, dryRun));
  console.log();

  const outcome = await publishToX(
    {
      text: draft.text,
      // The approver is a real user id in the product. This demo runs before the users page is
      // wired, so it is stated as the operator rather than defaulted to the string "user".
      confirmedBy: process.env.X_DEMO_CONFIRMED_BY ?? "operator_cli",
      selfApproved: true,
      draftedByAgentId: draft.draftedByAgentId,
      projectId: draft.projectId,
      costUsd: draft.costUsd,
    },
    client,
    getPublishRecordStore(),
  );

  console.log(`state       ${outcome.record.state}`);
  console.log(`record      ${outcome.record.id}`);
  if (outcome.deduplicated) console.log("deduplicated: this key had already been used; nothing was sent.");
  if (outcome.post) console.log(`post        ${outcome.post.id}${outcome.post.url ? `  ${outcome.post.url}` : ""}`);
  if (outcome.record.error) console.log(`error       ${outcome.record.error}`);
  process.exit(outcome.record.state === "refused" ? 1 : 0);
}

if (import.meta.main) await main();
