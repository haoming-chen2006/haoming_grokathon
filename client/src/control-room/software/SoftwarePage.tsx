/**
 * The software surface — loops/05-software.md §5.7.
 *
 * The rule this page is built to, above every other: **the app, never a report about the app.** The
 * main region is the running thing in an iframe. What changed is prose the agent wrote. There is no
 * diff, no branch name, no worktree path and no test count anywhere on it — those exist in the data
 * model and a salesperson never sees one (§4, correction 3).
 *
 * Three more, each from §5.7:
 *
 *   - **Failure is a sentence, and then one button.** "It didn't build. The app is trying to use
 *     something called react-datepicker that isn't installed." — then: try installing it.
 *   - **Nothing is fabricated.** A cost the server has not reported is omitted. `$0.00` is not a
 *     cost, and a plausible-looking zero is worse than a gap because it cannot be questioned.
 *   - **There is no deploy button.** Publishing is an irreversible outward-facing operation the
 *     product has no place for yet, so the answer is *no*, said plainly, with export beside it.
 *
 * Colour never carries meaning alone: every state pill has a word in it, which
 * `client/src/control-room/uiChecklist.test.tsx` enforces for the rest of the product and this page
 * has no business trading away.
 */

import { useState } from "react";
import type { WorkspacePageProps } from "../shell/contract";
import { MOCK_APPS, MOCK_NOTICE } from "./mockSoftware";
import type { AppState, SoftwareAppView } from "./types";

const STATE_LABEL: Record<AppState, string> = {
  working: "Building",
  "ready-for-review": "Ready for you",
  blocked: "Needs a decision",
  approved: "Approved",
};

/** Colour *and* a word, always. The word is the label above; this is only the palette. */
const STATE_TONE: Record<AppState, string> = {
  working: "bg-status-working text-status-working border-status-working",
  "ready-for-review": "bg-status-needs-review text-status-needs-review border-status-needs-review",
  blocked: "bg-status-failed text-status-failed border-status-failed",
  approved: "bg-status-complete text-status-complete border-status-complete",
};

function StatePill({ state }: { state: AppState }) {
  return (
    <span
      data-testid="app-state"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_TONE[state]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATE_LABEL[state]}
    </span>
  );
}

function apps(): SoftwareAppView[] {
  return MOCK_APPS;
}

/**
 * The app the URL is pointing at.
 *
 * Three outcomes rather than one, because they are three different facts and a page that collapses
 * them lies about two of them: there are no apps at all; the URL names one that is not here (a link
 * from a message about an app since deleted); or here it is. Falling back to "the first app" for an
 * unknown id would show the user a different app as though it were the one they asked for.
 */
type Resolution =
  | { kind: "none" }
  | { kind: "unknown"; assetId: string }
  | { kind: "app"; app: SoftwareAppView };

function resolveApp(selectionId: string | undefined): Resolution {
  const all = apps();
  if (all.length === 0) return { kind: "none" };
  if (selectionId === undefined) return { kind: "app", app: all[0]! };
  const found = all.find((a) => a.assetId === selectionId);
  return found ? { kind: "app", app: found } : { kind: "unknown", assetId: selectionId };
}

/** The same sentence in all three regions, so a broken link reads the same wherever it is seen. */
function Absent({ resolution }: { resolution: Exclude<Resolution, { kind: "app" }> }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <p className="max-w-xs text-center text-sm text-ink-faint">
        {resolution.kind === "none"
          ? "No apps here yet. One appears when an agent starts building what a design document describes."
          : "That app isn't in this project."}
      </p>
    </div>
  );
}

/** The banner that stops anyone reading this page as if it were live. */
function MockBanner() {
  return (
    <div className="border-b border-border bg-surface-active px-4 py-1.5 text-xs text-ink-muted">
      {MOCK_NOTICE}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────── main

/**
 * The running app, and the two controls that belong under it.
 *
 * The iframe is the point. Everything else on this page is in service of the user believing what
 * they are looking at, which is why the failure states below replace it with a sentence rather than
 * an empty frame — a blank iframe and a broken app look identical, and only one of them is true.
 */
export function SoftwarePage({ selectionId }: WorkspacePageProps) {
  const resolution = resolveApp(selectionId);
  const [reloadKey, setReloadKey] = useState(0);
  const [showChanges, setShowChanges] = useState(false);

  if (resolution.kind !== "app") {
    return (
      <div className="flex h-full flex-col bg-canvas">
        <MockBanner />
        <Absent resolution={resolution} />
      </div>
    );
  }

  const app = resolution.app;
  const { preview } = app;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <MockBanner />

      <div className="relative flex-1 overflow-hidden">
        {preview.state === "running" && (preview.previewHtml || preview.url) ? (
          <iframe
            key={reloadKey}
            data-testid="software-preview"
            title={`${app.name}, running`}
            className="h-full w-full border-0 bg-white"
            /*
             * The app in here is code a model wrote, and it runs in the user's browser.
             *
             * Against a real preview that is a dev server on another port, so it is cross-origin
             * and already walled off. Against `srcDoc` it would be **same-origin** — the mock is a
             * document of ours, so without this attribute an app could reach into the workspace
             * that is displaying it. `allow-scripts` because an app that cannot run scripts is not
             * the app; `allow-same-origin` is deliberately absent, which is what keeps the frame in
             * its own opaque origin. Deliberately not `allow-top-navigation`: a preview must not be
             * able to navigate the workspace away from itself.
             */
            sandbox="allow-scripts allow-forms allow-popups"
            {...(preview.previewHtml ? { srcDoc: preview.previewHtml } : { src: preview.url })}
          />
        ) : (
          <PreviewAbsent app={app} />
        )}

        {/*
          The wireframe's second control. The inspector carries the same prose, but it is a region
          the user can collapse — and on a narrow window the summary is the first thing to go. This
          puts it over the app on demand without navigating away from it.
        */}
        {showChanges && (
          <div className="absolute inset-x-0 bottom-0 max-h-[50%] overflow-y-auto border-t border-border bg-surface/95 px-4 py-3">
            <h3 className="text-xs uppercase tracking-wide text-ink-faint">What changed</h3>
            {app.summary.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {app.summary.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-ink-muted">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-faint">Nothing yet — this app is still being worked on.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-2.5">
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={preview.state !== "running"}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:text-ink-ghost"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setShowChanges((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-ink hover:bg-surface-hover"
        >
          {showChanges ? "Hide what changed" : "What changed"}
        </button>
        <span className="text-xs text-ink-faint">
          {preview.state === "running"
            ? "This is the app itself, running on your machine."
            : "The app is not running just now."}
        </span>
      </div>
    </div>
  );
}

/**
 * What stands in for the app when there is no app to show.
 *
 * Never an empty frame and never a spinner alone: each state says what is true, and the failed one
 * says what would fix it. The repair button appears only when the dev server actually named a
 * package — an offer to install nothing is worse than no offer.
 */
function PreviewAbsent({ app }: { app: SoftwareAppView }) {
  const { preview } = app;
  const missing = preview.missingPackages ?? [];

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        {preview.state === "starting" ? (
          <>
            <p className="text-sm text-ink">Starting {app.name} up…</p>
            <p className="mt-2 text-xs text-ink-faint">
              It takes a moment the first time. The app will appear here by itself.
            </p>
          </>
        ) : preview.state === "failed" ? (
          <>
            <p className="text-sm text-ink">{preview.message ?? "The app stopped running."}</p>
            {missing.length > 0 && (
              <button
                type="button"
                className="mt-4 rounded-md border border-accent bg-accent-muted px-3 py-1.5 text-xs text-ink hover:bg-surface-hover"
              >
                Try installing {missing.join(" and ")}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-ink">{app.name} is not running.</p>
            {preview.message && <p className="mt-2 text-xs text-ink-faint">{preview.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── navigator

/** Every app in this project. The list is names and states — never branches. */
export function SoftwareNavigator({ selectionId, onSelect }: WorkspacePageProps) {
  const resolution = resolveApp(selectionId);
  if (resolution.kind === "none") return <Absent resolution={resolution} />;
  const selectedId = resolution.kind === "app" ? resolution.app.assetId : undefined;
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <p className="px-3 pb-1 pt-3 text-xs uppercase tracking-wide text-ink-faint">Apps</p>
      {apps().map((app) => (
        <button
          key={app.assetId}
          type="button"
          onClick={() => onSelect(app.assetId)}
          className={`flex flex-col items-start gap-1 border-l-2 px-3 py-2 text-left hover:bg-surface-hover ${
            app.assetId === selectedId
              ? "border-accent bg-surface-active"
              : "border-transparent"
          }`}
        >
          <span className="text-sm text-ink">{app.name}</span>
          <StatePill state={app.state} />
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── inspector

/**
 * What changed, in prose, and the two decisions the user can make about it.
 *
 * "What changed" is the agent's own summary, which the submission already requires. If files are
 * named at all they are named the way a person would say them — "the deck list", never
 * `src/DeckList.jsx` and never a unified diff.
 */
export function SoftwareInspector({ selectionId }: WorkspacePageProps) {
  const resolution = resolveApp(selectionId);
  if (resolution.kind !== "app") return <Absent resolution={resolution} />;
  const app = resolution.app;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-ink">{app.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatePill state={app.state} />
          {/* Each fact appears only if there is one. No zeroes standing in for unknowns. */}
          {app.workedFor && <span className="text-xs text-ink-faint">{app.workedFor}</span>}
          {app.costUsd !== undefined && (
            <span className="text-xs text-ink-faint">${app.costUsd.toFixed(2)}</span>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-3">
        <h3 className="text-xs uppercase tracking-wide text-ink-faint">What changed</h3>
        {app.summary.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {app.summary.map((line) => (
              <li key={line} className="text-sm leading-relaxed text-ink-muted">
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-faint">
            Nothing yet — this app is still being worked on.
          </p>
        )}

        {app.changedFiles.length > 0 && (
          <p className="mt-3 text-xs text-ink-faint">Touched {app.changedFiles.join(", ")}.</p>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={app.state !== "ready-for-review"}
            className="flex-1 rounded-md border border-accent bg-accent-muted px-3 py-2 text-xs text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-ink-ghost"
          >
            Approve
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-border px-3 py-2 text-xs text-ink hover:bg-surface-hover"
          >
            Ask for a change
          </button>
        </div>

        {/*
          SW-011 passes as a refusal, not a feature, so the refusal has to be visible. There is no
          deploy button anywhere on this page and none hidden behind a flag — the honest answer is
          said in words, with the thing we *can* do next to it.
        */}
        <p className="mt-3 text-xs text-ink-faint">
          Putting this on the internet isn't something this can do yet. You can save a copy to your
          computer instead.
        </p>
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-border px-3 py-2 text-xs text-ink hover:bg-surface-hover"
        >
          Save a copy
        </button>
      </div>
    </div>
  );
}
