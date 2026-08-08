/**
 * MOCK DATA. Delete this file and the four imports of it, and nothing else changes.
 *
 * Everything here is invented. It exists because `softwareRoutes` is not mounted yet — the server
 * side of this surface is built and tested (`server/services/software/**`) but the one line that
 * mounts it is a reconciliation edit in `server/index.ts`, which this worktree may not make. A page
 * that draws with fake data is worth more right now than a correct service nobody can see.
 *
 * Two rules this file follows so it cannot be mistaken for the real thing:
 *
 *   1. every value here is reachable only through `MOCK_APPS`, and the page renders a banner saying
 *      the data is invented for as long as this module is imported;
 *   2. the shapes are the *real* ones. `SoftwareAppView` is what the route will return, so wiring
 *      it up is a change of source, not a rewrite of the page.
 *
 * The states were chosen to cover what §5.7 of loops/05-software.md requires the page to survive:
 * a running preview, a build in progress with no cost known yet (so the page must omit the field
 * rather than print $0.00), and a failure whose sentence names the actual cause.
 */

import type { SoftwareAppView } from "./types";

export const MOCK_NOTICE = "Invented data — the software service is built but not mounted yet.";

/**
 * A stand-in for the dev server's page.
 *
 * The real preview is an iframe pointing at `http://127.0.0.1:<port>/`, served by a vite process
 * this product supervises (`server/services/software/preview.ts`). There is no such process in this
 * build, so the iframe is given a `srcDoc` instead: same element, same idiom, no network. It looks
 * like an app because the whole argument of this surface is that the user looks at the app rather
 * than at a report about it.
 */
export const MOCK_PREVIEW_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body { margin:0; font: 14px/1.5 Inter, system-ui, sans-serif; background:#f8fafc; color:#0f172a }
  header { padding:20px 24px; border-bottom:1px solid #e2e8f0; background:#fff }
  h1 { margin:0; font-size:18px; font-weight:600 }
  .sub { color:#64748b; font-size:13px; margin-top:2px }
  .search { margin:20px 24px 0; display:flex; gap:8px }
  input { flex:1; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font:inherit; background:#fff }
  table { width:calc(100% - 48px); margin:16px 24px; border-collapse:collapse; background:#fff;
          border:1px solid #e2e8f0; border-radius:10px; overflow:hidden }
  th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#64748b;
       padding:10px 14px; background:#f1f5f9; border-bottom:1px solid #e2e8f0 }
  td { padding:11px 14px; border-bottom:1px solid #f1f5f9 }
  tr:last-child td { border-bottom:0 }
  button { padding:5px 11px; border:1px solid #cbd5e1; border-radius:7px; background:#fff; font:inherit;
           font-size:12px; cursor:pointer }
</style></head><body>
  <header><h1>Deck picker</h1><div class="sub">Every deck we have made, newest first</div></header>
  <div class="search"><input placeholder="Search by customer name" value="north" /></div>
  <table>
    <tr><th>Deck</th><th>Customer</th><th>Date</th><th></th></tr>
    <tr><td>Q3 platform overview</td><td>Northwind</td><td>2 August</td><td><button>Copy link</button></td></tr>
    <tr><td>Pricing, revised</td><td>Northwind</td><td>28 July</td><td><button>Copy link</button></td></tr>
    <tr><td>Onboarding walkthrough</td><td>Northgate</td><td>19 July</td><td><button>Copy link</button></td></tr>
  </table>
</body></html>`;

export const MOCK_APPS: SoftwareAppView[] = [
  {
    assetId: "deck-picker",
    name: "Deck picker",
    state: "ready-for-review",
    preview: { state: "running", previewHtml: MOCK_PREVIEW_HTML },
    summary: [
      "Search now filters by customer name as you type.",
      "Added a date column, newest first.",
      "Each row has a button that copies a link to the deck.",
    ],
    changedFiles: ["the deck list", "the search box"],
    workedFor: "2 min",
    costUsd: 0.04,
  },
  {
    assetId: "expenses",
    name: "Expense claims",
    state: "working",
    preview: { state: "starting" },
    summary: [],
    changedFiles: [],
    workedFor: "35 sec",
    // No costUsd. The agent has not reported a cost yet, and $0.00 is not a cost — a missing one is
    // missing (§5.7). The page must omit the line, not print a zero.
  },
  {
    assetId: "signup",
    name: "Signup form",
    state: "blocked",
    preview: {
      state: "failed",
      message:
        "It didn't build. The app is trying to use something called react-datepicker that isn't installed.",
      missingPackages: ["react-datepicker"],
    },
    summary: ["Started on the date-of-birth field."],
    changedFiles: ["the signup form"],
    workedFor: "1 min",
    costUsd: 0.02,
  },
];
