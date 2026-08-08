/**
 * The frame — loops/07-shell.md §3.1.
 *
 * Three regions on every page: NAVIGATOR, MAIN, INSPECTOR, with a toolbar above them. It owns no
 * domain logic. The pages arrive through `./pages`, which reconciliation edits and this file never
 * imports around.
 *
 * The shell lives here rather than in `ControlRoomApp.tsx` because that file is hot and shared by
 * eight worktrees; it becomes a five-line re-export at reconciliation (request R-3).
 *
 * **Measurements come from the owner's two wireframes**, assets-page.html and
 * design-document.html, which agree on the chrome to the pixel: a 44px toolbar with 14px padding
 * and a 14px gap, hairline rules, a 15/14/13/11/10 type scale, mono numerals, 24px toolbar
 * controls at radius 5, and headline pages set apart from secondary ones by a rule. Where the
 * wireframes disagree with each other or with §3.1, the decisions are recorded in
 * loops/handoff/pivot-shell.md rather than taken silently.
 */
import { useEffect, useState } from "react";
import type { PageDescriptor, WorkspacePageProps } from "./contract";
import { NotMergedYet } from "./NotMergedYet";
import { PAGES } from "./pages";
import { INSPECTOR, NAVIGATOR, layout, useRegion } from "./regions";
import { useWorkspaceRoute } from "./router";
import { useTheme } from "./theme";
import { UNPRICED, useShellData, type ShellNotification, type ShellSpend } from "./useShellData";

/** Section label: mono, small, tracked, quiet. Both wireframes use it for every region heading. */
function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">{children}</div>
  );
}

/**
 * The running spend.
 *
 * Renders "unknown", never $0.00. usageAccounting's DEFAULT_RATES holds no Grok model, so in wave 1
 * an unpriced turn is the normal case and a plausible-looking zero would be a fabricated figure —
 * the same defect as a fabricated affordance.
 *
 * The label comes from design-document.html, which prefixes the figure with a mono `PROJECT SPEND`
 * where assets-page.html leaves it bare. Labelled won: a bare "$18.40 / $50.00" floating in a
 * toolbar has to be decoded, and it is the one number §3.1 puts on every page precisely because a
 * 60-second generated experience costs ~$5.52 in media alone. It also makes the unpriced case
 * readable — "PROJECT SPEND unknown" says what is unknown, where a bare "unknown" does not.
 */
function Spend({ spend }: { spend: ShellSpend }) {
  return (
    <div data-testid="toolbar-spend" className="flex items-baseline gap-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.07em] text-ink-ghost">
        Project spend
      </span>
      {spend.known ? (
        <>
          <span className="font-mono text-[11px] text-ink-muted">
            ${spend.usd.toFixed(2)}
            {spend.budgetUsd ? ` / $${spend.budgetUsd.toFixed(2)}` : ""}
          </span>
          {spend.budgetUsd ? (
            <span className="h-[7px] w-24 self-center overflow-hidden rounded border border-border-strong">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.min(100, (spend.usd / spend.budgetUsd) * 100)}%` }}
              />
            </span>
          ) : null}
        </>
      ) : (
        <span
          className="font-mono text-[11px] text-ink-faint"
          title="No rate is known for the models this workspace drives, so the total cannot be priced yet."
        >
          unknown
        </span>
      )}
    </div>
  );
}

/**
 * One notification surface, not six.
 *
 * Today's first screen on a fresh install stacks six full-width banners of 11px red text. These are
 * rows in one dismissible stack, one line of plain language each, so two simultaneous alerts are
 * two rows rather than two strips.
 */
export function Notifications({ items }: { items: ShellNotification[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const live = items.filter((n) => !dismissed.includes(n.id));
  if (live.length === 0) return null;
  return (
    <div data-testid="notifications" role="status" className="border-b border-border">
      {live.map((n) => (
        <div
          key={n.id}
          data-testid={`notification-${n.id}`}
          className="flex items-center gap-3 px-3.5 py-2 text-[13px] text-ink-muted"
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              n.tone === "error" ? "bg-status-failed" : "bg-status-waiting"
            }`}
          />
          {/* The tone is also stated in text: colour is never the only signal. */}
          <span className="sr-only">{n.tone === "error" ? "Error:" : "Warning:"}</span>
          <span className="min-w-0 flex-1">{n.message}</span>
          <button
            type="button"
            data-testid={`notification-${n.id}-dismiss`}
            onClick={() => setDismissed((d) => [...d, n.id])}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

/** A draggable rule between two regions. Keyboard-resizable, because a drag handle is not enough. */
function ResizeHandle({
  side,
  onResize,
  onToggle,
  width,
}: {
  side: "left" | "right";
  onResize: (px: number) => void;
  onToggle: () => void;
  width: number;
}) {
  const start = (event: React.MouseEvent) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = width;
    const move = (e: MouseEvent) => {
      const delta = side === "left" ? e.clientX - originX : originX - e.clientX;
      onResize(originWidth + delta);
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      data-testid={`resize-${side}`}
      onMouseDown={start}
      onDoubleClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(width + (side === "left" ? -16 : 16));
        if (e.key === "ArrowRight") onResize(width + (side === "left" ? 16 : -16));
      }}
      className="w-px shrink-0 cursor-col-resize bg-border hover:bg-border-strong"
    />
  );
}

/**
 * The page list.
 *
 * Three headline pages above a divider, two secondary below it. The divider costs one border and
 * is how a first-time user knows where to look; secondary means the product is coherent without
 * those pages, not that they are half-built.
 *
 * Both wireframes give headline pages a bordered pill at the full type size and secondary pages
 * plain quieter text one step down, with a rule between. That treatment is adopted; its
 * *placement* is §3.1's — in the navigator, not in a horizontal strip — because the published
 * contract already says `PageDescriptor.navigator` renders "beneath the page selector".
 */
function PageSelector({
  active,
  onPick,
}: {
  active: string;
  onPick: (page: PageDescriptor) => void;
}) {
  const headline = PAGES.filter((p) => p.rank === "headline");
  const secondary = PAGES.filter((p) => p.rank === "secondary");

  const row = (page: PageDescriptor) => {
    const isActive = page.id === active;
    const base = "flex w-full items-center gap-2 rounded-md px-3 text-left";
    return (
      <button
        key={page.id}
        type="button"
        data-testid={`page-${page.id}`}
        aria-current={isActive ? "page" : undefined}
        onClick={() => onPick(page)}
        className={
          page.rank === "headline"
            ? `${base} border py-[7px] text-[15px] ${
                isActive
                  ? "border-accent bg-accent/10 text-ink"
                  : "border-border text-ink-muted hover:bg-surface-hover"
              }`
            : `${base} py-1.5 text-[14px] ${
                isActive ? "text-ink" : "text-ink-faint hover:bg-surface-hover"
              }`
        }
      >
        {page.label}
      </button>
    );
  };

  return (
    <nav data-testid="page-selector" aria-label="Pages" className="flex flex-col gap-1.5">
      {headline.map(row)}
      <div data-testid="navigator-divider" className="my-1.5 h-px bg-border" />
      {secondary.map(row)}
    </nav>
  );
}

/** Render a page's slot, or state that the branch which builds it has not merged. */
function Slot({
  component,
  page,
  what,
  props,
}: {
  component: PageDescriptor["main"];
  page: PageDescriptor;
  what: string;
  props: WorkspacePageProps;
}) {
  if (!component) return <NotMergedYet what={what} branch={page.builtBy} />;
  return component(props);
}

export function WorkspaceShell() {
  const { route, go, select } = useWorkspaceRoute();
  const { theme, toggle } = useTheme();
  const data = useShellData();
  const navigator = useRegion(NAVIGATOR.key);
  const inspector = useRegion(INSPECTOR.key);

  const [available, setAvailable] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setAvailable(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const widths = layout(available, navigator, inspector);
  const page = PAGES.find((p) => p.id === route.page) ?? PAGES[0];
  const project = data.activeProject;

  // projectId is never empty: a workspace with no project gets the shell's own state, not a page
  // with a blank id. Pages therefore need no "no project" branch.
  const pageProps: WorkspacePageProps = {
    projectId: project?.id ?? "",
    selectionId: route.selectionId,
    onSelect: select,
  };

  return (
    <div data-testid="workspace-shell" className="flex h-screen w-screen flex-col bg-canvas text-ink">
      <header
        data-testid="toolbar"
        className="flex h-11 shrink-0 items-center gap-3.5 border-b border-border px-3.5 text-[15px]"
      >
        <span className="text-ink-muted">grok-workspace</span>
        <span aria-hidden="true" className="text-ink-ghost">·</span>
        <span data-testid="toolbar-project" className="min-w-0 truncate text-ink">
          {project ? project.name : data.loading ? "" : "No project yet"}
        </span>
        <div className="flex-1" />
        <Spend spend={UNPRICED} />
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <button
          type="button"
          data-testid="theme-toggle"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
          className="grid h-6 w-6 place-items-center rounded-[5px] border border-border text-[13px] text-ink-faint hover:bg-surface-hover"
        >
          {theme === "dark" ? "☾" : "☀"}
        </button>
      </header>

      <Notifications items={data.notifications} />

      <div className="flex min-h-0 flex-1">
        {widths.navigator > 0 ? (
          <aside
            data-testid="navigator"
            aria-label="Navigator"
            style={{ width: widths.navigator }}
            className="flex shrink-0 flex-col gap-2.5 overflow-y-auto px-3 py-3.5"
          >
            <PageSelector active={page.id} onPick={(p) => go(p.id)} />
            <div className="h-px bg-border" />
            <SectionLabel>{page.label}</SectionLabel>
            {page.navigator ? (
              page.navigator(pageProps)
            ) : (
              <p className="text-[13px] text-ink-faint">
                This page's list arrives with {page.builtBy ?? "its branch"}.
              </p>
            )}
          </aside>
        ) : null}

        <ResizeHandle
          side="left"
          width={navigator.width}
          onResize={navigator.setWidth}
          onToggle={navigator.toggle}
        />

        <main data-testid="main" className="min-w-0 flex-1 overflow-auto">
          {project ? (
            <Slot component={page.main} page={page} what={page.label} props={pageProps} />
          ) : (
            <div data-testid="no-project" className="flex h-full items-center justify-center p-8">
              <p className="max-w-sm text-center text-[13px] text-ink-faint">
                No project yet. A project starts by writing a design document — describe what you
                need, and a team of agents does the work.
              </p>
            </div>
          )}
        </main>

        <ResizeHandle
          side="right"
          width={inspector.width}
          onResize={inspector.setWidth}
          onToggle={inspector.toggle}
        />

        {widths.inspector > 0 ? (
          <aside
            data-testid="inspector"
            aria-label="Inspector"
            style={{ width: widths.inspector }}
            className="flex shrink-0 flex-col gap-3.5 overflow-y-auto px-3.5 py-4"
          >
            {page.inspector ? (
              page.inspector(pageProps)
            ) : (
              <>
                <SectionLabel>Inspector</SectionLabel>
                <p className="text-[13px] text-ink-faint">
                  Properties of whatever is selected in the middle. This page's inspector arrives
                  with {page.builtBy ?? "its branch"}.
                </p>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
