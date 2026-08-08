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

/**
 * A second stand-in, for the asset 02-assets already has in its own mock set.
 *
 * `client/src/control-room/assets/mockAssets.ts` carries `asset_configurator`, a chair configurator,
 * and its `AssetPreview` draws it as a framed rectangle with the comment "a framed 'app', drawn
 * rather than run: 05-software owns the real preview surface". This is that surface. Keying an app
 * here to *their* asset id is what makes the integration a single line with no id mapping — and
 * when both services are real, both sides use the same server-issued assetId and the alias stops
 * mattering. It disappears with this file.
 */
export const MOCK_CONFIGURATOR_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body { margin:0; font: 14px/1.5 Inter, system-ui, sans-serif; background:#faf9f7; color:#1c1917;
         display:flex; min-height:100vh }
  .stage { flex:1; display:flex; align-items:center; justify-content:center; padding:32px }
  .chair { width:180px }
  .back { height:120px; border-radius:14px 14px 4px 4px; background:var(--fabric,#7c6a58) }
  .seat { height:26px; margin-top:8px; border-radius:6px; background:var(--fabric,#7c6a58) }
  .legs { display:flex; justify-content:space-between; padding:0 18px }
  .leg { width:10px; height:64px; border-radius:0 0 4px 4px; background:var(--wood,#a8763e) }
  aside { width:236px; border-left:1px solid #e7e5e4; background:#fff; padding:20px }
  h1 { margin:0 0 2px; font-size:15px; font-weight:600 }
  .muted { color:#78716c; font-size:12px }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#78716c; margin:18px 0 8px }
  .swatches { display:flex; gap:8px }
  .sw { width:30px; height:30px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px #d6d3d1 }
  .sw.on { box-shadow:0 0 0 2px #1c1917 }
  .price { margin-top:20px; padding-top:14px; border-top:1px solid #e7e5e4; display:flex;
           justify-content:space-between; align-items:baseline }
  .price b { font-size:19px }
  button { margin-top:14px; width:100%; padding:9px; border:0; border-radius:8px; background:#1c1917;
           color:#fff; font:inherit; font-size:13px; cursor:pointer }
</style></head><body>
  <div class="stage"><div class="chair" style="--fabric:#7c6a58;--wood:#a8763e">
    <div class="back"></div><div class="seat"></div>
    <div class="legs"><div class="leg"></div><div class="leg"></div></div>
  </div></div>
  <aside>
    <h1>Ellis lounge chair</h1><div class="muted">Made to order</div>
    <h2>Fabric</h2>
    <div class="swatches">
      <span class="sw on" style="background:#7c6a58"></span>
      <span class="sw" style="background:#4a5c52"></span>
      <span class="sw" style="background:#8f4a3c"></span>
    </div>
    <h2>Legs</h2>
    <div class="swatches">
      <span class="sw on" style="background:#a8763e"></span>
      <span class="sw" style="background:#3f3a36"></span>
    </div>
    <div class="price"><span class="muted">Total</span><b>£1,240</b></div>
    <button>Add to basket</button>
  </aside>
</body></html>`;

export const MOCK_APPS: SoftwareAppView[] = [
  {
    // The id 02-assets uses in its own mock set, so opening that asset lands here.
    assetId: "asset_configurator",
    name: "chair_configurator",
    state: "ready-for-review",
    preview: { state: "running", previewHtml: MOCK_CONFIGURATOR_HTML },
    summary: [
      "The finish picker is wired to the price list.",
      "Choosing a fabric or a leg finish updates the total straight away.",
      "The chair redraws in the chosen finish rather than showing a swatch.",
    ],
    changedFiles: ["the finish picker", "the price list"],
    workedFor: "6 min",
    costUsd: 4.06,
  },
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
