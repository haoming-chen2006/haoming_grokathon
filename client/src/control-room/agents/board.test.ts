/**
 * The board's arithmetic, measured.
 *
 * These are the assertions that make the rest of the page checkable without a network: every
 * count, every grouping and every sum on the AGENTS page comes from `board.ts`, so a hand-made
 * record here says exactly what a real one will do.
 *
 * The five agents below are the mockup's own — Scribe, Slidewright, Reel, Voiceover, Ledger — for
 * one reason: `design/mockups/agents-page.html` prints the totals its rail derives from them
 * (1 · 1 · 3), and that printed triple is the only evidence for which status lands in which
 * bucket. They live in this file and are never shipped.
 */
import { describe, expect, test } from "bun:test";
import {
  BUCKET_LABEL,
  accentSlot,
  agentsInArea,
  agentsWithoutArea,
  areaAccent,
  bucketOf,
  countBuckets,
  knownSpend,
  launchRefusal,
  launchableTask,
  needsYou,
} from "./board";
import type { AgentView, AreaView } from "./types";

const agent = (id: string, status: string, extra: Partial<AgentView> = {}): AgentView => ({
  id,
  name: id,
  role: "writer",
  status,
  ...extra,
});

/** The mockup's five, with the statuses its cards print. */
const SCRIBE = agent("scribe", "working");
const SLIDEWRIGHT = agent("slidewright", "waiting");
const REEL = agent("reel", "complete");
const VOICEOVER = agent("voiceover", "idle");
const LEDGER = agent("ledger", "failed");
const EVERYONE = [SCRIBE, SLIDEWRIGHT, REEL, VOICEOVER, LEDGER];

const area = (id: string, extra: Partial<AreaView> = {}): AreaView => ({
  id,
  projectId: "p1",
  name: id,
  ...extra,
});

describe("the three counts the rail prints", () => {
  test("every bucket carries a word, so a dot is never the only signal", () => {
    expect(BUCKET_LABEL).toEqual({ fine: "FINE", working: "WORKING", stopped: "STOPPED" });
  });

  test("done is FINE, working is WORKING, and everything not moving is STOPPED", () => {
    expect(bucketOf("complete")).toBe("fine");
    expect(bucketOf("working")).toBe("working");
    for (const stopped of ["waiting", "needs_review", "idle", "failed"]) {
      expect(`${stopped}:${bucketOf(stopped)}`).toBe(`${stopped}:stopped`);
    }
  });

  test("a status this client has never heard of is counted as stopped, not dropped", () => {
    // A count that silently omits a record is worse than one that puts it in the blunt column:
    // the total stops matching the board, and nobody can tell which agent went missing.
    expect(bucketOf("quarantined")).toBe("stopped");
    expect(countBuckets([agent("x", "quarantined")])).toEqual({ fine: 0, working: 0, stopped: 1 });
  });

  test("the mockup's five agents produce the totals the mockup prints", () => {
    expect(countBuckets(EVERYONE)).toEqual({ fine: 1, working: 1, stopped: 3 });
  });

  test("no agents is three zeroes, not an absent row", () => {
    expect(countBuckets([])).toEqual({ fine: 0, working: 0, stopped: 0 });
  });
});

describe("who is in which area", () => {
  test("the area's owner is the agent inside it", () => {
    const pitch = area("a1", { ownerAgentId: "scribe" });
    expect(agentsInArea(pitch, EVERYONE).map((a) => a.id)).toEqual(["scribe"]);
  });

  test("an agent that names its own area is read too, so the mirror needs no edit here", () => {
    const pitch = area("a1", { ownerAgentId: "scribe" });
    const hired = agent("nib", "idle", { areaId: "a1" });
    expect(agentsInArea(pitch, [...EVERYONE, hired]).map((a) => a.id)).toEqual(["scribe", "nib"]);
  });

  test("an agent named by both the area and itself appears once", () => {
    const pitch = area("a1", { ownerAgentId: "scribe" });
    const scribe = agent("scribe", "working", { areaId: "a1" });
    expect(agentsInArea(pitch, [scribe]).map((a) => a.id)).toEqual(["scribe"]);
  });

  test("an area with nobody in it is an empty list, never a placeholder", () => {
    expect(agentsInArea(area("a1"), EVERYONE)).toEqual([]);
  });

  test("agents no area claims are reported rather than hidden", () => {
    const pitch = area("a1", { ownerAgentId: "scribe" });
    expect(agentsWithoutArea([pitch], EVERYONE).map((a) => a.id)).toEqual([
      "slidewright",
      "reel",
      "voiceover",
      "ledger",
    ]);
  });

  test("with no areas at all, every agent is unplaced", () => {
    expect(agentsWithoutArea([], EVERYONE)).toHaveLength(5);
  });
});

describe("what needs a person", () => {
  test("a question asked and work put up for review both need one", () => {
    const review = agent("nib", "needs_review");
    expect(needsYou([...EVERYONE, review]).map((a) => a.id)).toEqual(["slidewright", "nib"]);
  });

  test("a failed agent is not waiting on you — it is waiting on a fix", () => {
    expect(needsYou([LEDGER])).toEqual([]);
  });
});

describe("money is never invented", () => {
  test("nothing priced is undefined, which renders as unknown and not as zero", () => {
    expect(knownSpend([SCRIBE, REEL])).toBeUndefined();
    expect(knownSpend([])).toBeUndefined();
  });

  test("priced at nothing is zero, which is a different statement from unknown", () => {
    expect(knownSpend([agent("a", "idle", { costUsd: 0 })])).toBe(0);
  });

  test("a partial sum reports what the ledger actually holds", () => {
    const priced = [agent("a", "working", { costUsd: 0.31 }), agent("b", "idle", { costUsd: 1.05 }), SCRIBE];
    expect(knownSpend(priced)).toBeCloseTo(1.36, 10);
  });
});

describe("launching says why it will not", () => {
  const task = (id: string, extra: Partial<{ status: string; assignedAgentId: string; dependsOn: string[] }> = {}) => ({
    id,
    objective: `do ${id}`,
    status: "pending",
    dependsOn: [],
    ...extra,
  });

  test("a draft plan refuses everything, and says so", () => {
    expect(launchRefusal(task("t1", { assignedAgentId: "scribe" }), [], "draft")).toBe(
      "The plan must be approved before anything launches",
    );
  });

  test("an unassigned task names the missing agent rather than failing anonymously", () => {
    expect(launchRefusal(task("t1"), [], "approved")).toBe("No agent is assigned to this work");
  });

  test("an unmet dependency names the task it is waiting on", () => {
    const t1 = task("t1", { status: "pending" });
    const t2 = task("t2", { assignedAgentId: "scribe", dependsOn: ["t1"] });
    expect(launchRefusal(t2, [t1, t2], "approved")).toBe("Waiting on t1");
  });

  test("nothing in the way is undefined — the control is enabled and needs no title", () => {
    const t = task("t1", { assignedAgentId: "scribe" });
    expect(launchRefusal(t, [t], "approved")).toBeUndefined();
  });

  test("the launchable task is this agent's own, and never somebody else's", () => {
    const mine = task("t1", { assignedAgentId: "scribe" });
    const theirs = task("t2", { assignedAgentId: "reel" });
    expect(launchableTask(SCRIBE, [theirs, mine], "approved")?.id).toBe("t1");
    expect(launchableTask(SCRIBE, [theirs], "approved")).toBeUndefined();
  });
});

describe("the area accent", () => {
  /**
   * The eight names `AREA_COLOR_TOKENS` (server/services/workArea.ts) assigns, in its own order.
   * Written out rather than imported: that module opens the filesystem at import time, and a
   * client test that boots a store to read a list of strings is a test that fails for the wrong
   * reasons.
   */
  const SERVER_TOKENS = ["blue", "magenta", "cyan", "orange", "green", "purple", "yellow", "red"];

  test("every colour the server can assign resolves to a published area token", () => {
    for (const token of SERVER_TOKENS) {
      const slot = accentSlot(token);
      expect(`${token}:${slot >= 1 && slot <= 6}`).toBe(`${token}:true`);
      expect(areaAccent({ id: "a", projectId: "p", name: "n", colorToken: token }).rule).toContain(
        `area-${slot}`,
      );
    }
  });

  test("six published hues for eight names collide exactly twice, and only in known pairs", () => {
    // Recorded rather than asserted away: the collision is real, and it is survivable only because
    // the glyph and the name travel with the accent. Two more measured hues would remove it.
    expect(accentSlot("magenta")).toBe(accentSlot("purple"));
    expect(accentSlot("red")).toBe(accentSlot("orange"));
    expect(new Set(SERVER_TOKENS.map(accentSlot)).size).toBe(6);
  });

  test("an area with no colour, or one this client has not heard of, still renders", () => {
    expect(accentSlot(undefined)).toBe(1);
    expect(accentSlot("chartreuse")).toBe(1);
  });
});
