/**
 * MOCK DATA — DELETE THIS FILE WHEN presence.ts's SERVER SIDE EXISTS.
 *
 * Everything in here is invented. Nothing else in `designdoc/**` invents anything: the documents,
 * their text, their sections, their declaration and their areas are all real, parsed by the one
 * server-side parser and served by `server/routes/designDocs.ts`.
 *
 * This exists because `server/services/presence.ts` and the `report_document_focus` MCP tool are
 * not built, so there is no honest source of line-level presence yet — and line-level presence is
 * the centrepiece of this surface. A page that showed nothing there would misrepresent the design
 * as much as fake numbers would.
 *
 * So the fake is quarantined to one file with one export, named for what it is. When presence
 * lands, delete this file; the only import of it is in `index.tsx`, and the components take
 * `PresenceReport[]` either way.
 *
 * The reports below are shaped to exercise every state the encoding has, because the states are
 * the thing worth looking at: one live, one stale, one ended, one that is alive but has not said
 * where it is.
 */
import type { PresenceReport } from "./presence";

const MINUTE = 60_000;

/** Deterministic, and relative to the moment it is called so the ages read sensibly on screen. */
export function mockPresence(now: number, documentVersion: number): PresenceReport[] {
  return [
    {
      agentId: "agent_scribe",
      agentName: "Scribe",
      areaIndex: 1,
      activity: "Rewriting the opening claim",
      lines: { from: 12, to: 19 },
      reportedAt: now - 8_000,
      sessionRunning: true,
      documentVersion,
    },
    {
      agentId: "agent_slidewright",
      agentName: "Slidewright",
      areaIndex: 2,
      activity: "Pulling the price table",
      lines: { from: 21, to: 24 },
      reportedAt: now - 4 * MINUTE,
      sessionRunning: true,
      documentVersion,
    },
    {
      // Alive, and honest about not knowing where. The state the wireframe has no picture for.
      agentId: "agent_research",
      agentName: "Research",
      areaIndex: 3,
      activity: "Reading prior wins",
      reportedAt: now - 30_000,
      sessionRunning: true,
      documentVersion,
    },
    {
      agentId: "agent_reel",
      agentName: "Reel",
      areaIndex: 4,
      activity: "Made sale_demo_video",
      lines: { from: 26, to: 28 },
      reportedAt: now - 22 * MINUTE,
      sessionRunning: false,
      documentVersion,
    },
  ];
}
