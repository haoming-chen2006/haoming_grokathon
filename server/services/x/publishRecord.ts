/**
 * The publish record — what was sent, who confirmed it, and what it cost
 * (loops/08-users-and-x.md §3.13).
 *
 * ── Why the key is written before the call and not after ──────────────────────────────────────
 * A record written *after* a successful post cannot describe the only case that matters: the post
 * that succeeded while the client believed it failed. Between "send" and "record" there is a window,
 * and a crash inside it leaves a real post on a real timeline that this program has never heard of —
 * so the next attempt sends it again.
 *
 * Writing the key first inverts that. The worst case becomes a record marked `in_flight` with no
 * post id, which is a question a human can answer by looking at the account. That is strictly better
 * than a silent duplicate, and it is the whole reason this file exists rather than a boolean on the
 * asset.
 *
 * ── Synchronous, like every other store here ──────────────────────────────────────────────────
 * Same rule as `UserStore` and `ProjectStore`: read-modify-write with no `await` in between, so two
 * concurrent confirmations cannot interleave and lose one. `x/publishRecord.test.ts` fails if a
 * method becomes async.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWriteJson } from "../persistence";

/**
 * `in_flight` is not a transient bookkeeping state. It is the honest answer to "did this post?"
 * when the connection dropped, and it is the state a human resolves by looking, never one the
 * program resolves by resending.
 */
export type PublishState = "in_flight" | "published" | "refused" | "unknown";

export interface PublishRecord {
  /** The idempotency key. Minted at the moment a human confirms, and unique to that confirmation. */
  id: string;
  state: PublishState;
  text: string;
  /** Who pressed the button. A user id, never an agent, and never the string "user". */
  confirmedBy: string;
  /** True when the only available approver approved their own request (§3.4). Never hidden. */
  selfApproved: boolean;
  /** Which agent drafted it, and which project it belongs to. */
  draftedByAgentId?: string;
  projectId?: string;
  assetId?: string;
  /** X's post id, once there is one. */
  postId?: string;
  url?: string;
  dryRun: boolean;
  /** What it cost to make the artefact, carried through so the record is auditable on its own. */
  costUsd?: number | null;
  /** Set when the attempt ended badly, in the words X used. */
  error?: string;
  confirmedAt: string;
  settledAt?: string;
}

/**
 * A key derived from the exact content and the exact confirmation.
 *
 * Deliberately **not** random: two presses of the same button on the same draft by the same person
 * within the same second produce the same key and therefore the same record, which is what makes a
 * double-click harmless. A different draft, a different approver or a later confirmation is a
 * different intention and gets a different key.
 */
export function idempotencyKey(input: { text: string; confirmedBy: string; at?: string }): string {
  const stamp = input.at ?? new Date().toISOString();
  return (
    "pub_" +
    createHash("sha256")
      .update(JSON.stringify({ text: input.text, confirmedBy: input.confirmedBy, second: stamp.slice(0, 19) }))
      .digest("hex")
      .slice(0, 24)
  );
}

/** For a caller that genuinely wants a fresh attempt at identical text — a deliberate act. */
export function freshKey(): string {
  return "pub_" + randomBytes(12).toString("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PublishRecordStore {
  private readonly path: string;

  constructor(dir: string) {
    // `atomicWriteJson` writes `<path>.tmp` and renames; neither step creates a missing directory,
    // so a first run against a fresh data directory would fail at the moment it claims a key —
    // which is the one moment in this file that must not fail. `AssetStore` does the same thing in
    // its own constructor.
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, "x-publishes.json");
  }

  private read(): PublishRecord[] {
    if (!existsSync(this.path)) return [];
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as PublishRecord[];
    } catch {
      // Reading a corrupt file as "nothing has been published" would let every past post be sent
      // again. Refusing is the safe direction.
      throw new Error(`the publish record at ${this.path} is unreadable; refusing to risk a duplicate post`);
    }
  }

  private write(records: PublishRecord[]): void {
    atomicWriteJson(this.path, records);
  }

  get(id: string): PublishRecord | undefined {
    return this.read().find((r) => r.id === id);
  }

  list(): PublishRecord[] {
    return this.read().sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  }

  /**
   * Claim a key before anything is sent.
   *
   * Returns the existing record when the key is already known — that is the idempotency, and the
   * caller must treat a returned `published` record as "already done" and send nothing.
   */
  claim(input: {
    id: string;
    text: string;
    confirmedBy: string;
    selfApproved: boolean;
    dryRun: boolean;
    draftedByAgentId?: string;
    projectId?: string;
    assetId?: string;
    costUsd?: number | null;
  }): { record: PublishRecord; alreadyClaimed: boolean } {
    const records = this.read();
    const existing = records.find((r) => r.id === input.id);
    if (existing) return { record: existing, alreadyClaimed: true };

    const record: PublishRecord = {
      id: input.id,
      state: "in_flight",
      text: input.text,
      confirmedBy: input.confirmedBy,
      selfApproved: input.selfApproved,
      dryRun: input.dryRun,
      confirmedAt: nowIso(),
    };
    if (input.draftedByAgentId !== undefined) record.draftedByAgentId = input.draftedByAgentId;
    if (input.projectId !== undefined) record.projectId = input.projectId;
    if (input.assetId !== undefined) record.assetId = input.assetId;
    if (input.costUsd !== undefined) record.costUsd = input.costUsd;

    records.push(record);
    this.write(records);
    return { record, alreadyClaimed: false };
  }

  /** Record the outcome against a key that was claimed first. */
  settle(
    id: string,
    outcome:
      | { state: "published"; postId: string; url?: string }
      | { state: "refused"; error: string }
      | { state: "unknown"; error: string },
  ): PublishRecord {
    const records = this.read();
    const record = records.find((r) => r.id === id);
    if (!record) throw new Error(`no publish record ${id} — settle() must follow claim(), never precede it`);

    record.state = outcome.state;
    record.settledAt = nowIso();
    if (outcome.state === "published") {
      record.postId = outcome.postId;
      if (outcome.url !== undefined) record.url = outcome.url;
    } else {
      record.error = outcome.error;
    }
    this.write(records);
    return record;
  }

  /** Everything still in flight — what a human is asked to reconcile after a dropped connection. */
  unsettled(): PublishRecord[] {
    return this.read().filter((r) => r.state === "in_flight" || r.state === "unknown");
  }
}

let store: PublishRecordStore | null = null;
let storeDir: string | null = null;

export function getPublishRecordStore(): PublishRecordStore {
  const dir = process.env.OPENUI_DATA_DIR || join(homedir(), ".openui");
  if (!store || storeDir !== dir) {
    store = new PublishRecordStore(dir);
    storeDir = dir;
  }
  return store;
}

export function resetPublishRecordStore(): void {
  store = null;
  storeDir = null;
}
