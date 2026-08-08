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
import type { PageDescriptor, ToolsSection, WorkspacePageProps } from "./contract";
import { NotMergedYet } from "./NotMergedYet";
import { SlotBoundary } from "./SlotBoundary";
import { PAGES, TOOLS_PANEL } from "./pages";
import { INSPECTOR, NAVIGATOR, RAIL, layout, useRegion } from "./regions";
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

/**
 * A collapsed region, reduced to a rail rather than to nothing.
 *
 * Both wireframes take this shape for the third region: a 46px strip with a chevron back to the
 * expanded state and a vertical label naming what is folded away. design-document.html captions
 * it "the document gets the full width; the rail keeps presence visible" — the point of the rail
 * is that you can still see something is in there.
 */
function CollapsedRail({
  side,
  label,
  onExpand,
}: {
  side: "navigator" | "inspector";
  label: string;
  onExpand: () => void;
}) {
  return (
    <aside
      data-testid={`${side}-rail`}
      aria-label={`${label} (collapsed)`}
      style={{ width: RAIL }}
      className={`flex shrink-0 flex-col items-center gap-3.5 py-3 ${
        side === "navigator" ? "border-r" : "border-l"
      } border-border`}
    >
      <button
        type="button"
        data-testid={`${side}-expand`}
        onClick={onExpand}
        aria-label={`Expand the ${label.toLowerCase()}`}
        className="grid h-7 w-7 place-items-center rounded-md border border-border text-[13px] text-ink-faint hover:bg-surface-hover"
      >
        {side === "navigator" ? "›" : "‹"}
      </button>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-ghost"
        style={{ writingMode: "vertical-rl" }}
      >
        {label}
      </span>
    </aside>
  );
}

/**
 * The Tools overlay — loops/07-shell.md §3.2.
 *
 * It overlays MAIN rather than replacing it because its whole purpose is to be applied to the
 * thing you are currently looking at; a panel you must navigate away to reach cannot be. Xcode's
 * Library is the same idea for the same reason.
 *
 * **This worktree owns the mount, the scrim, the Esc key and the route. 06-tools-cost owns
 * everything inside.** The line is not negotiable in either direction: if the panel renders its
 * own scrim or its own Esc handler, two dismissal paths fight and the query parameter
 * desynchronises from the DOM.
 *
 * It is a query parameter and not a path segment so that opening it does not lose the page
 * underneath — that is the entire argument for it being an overlay.
 */
function ToolsOverlay({
  section,
  projectId,
  onClose,
}: {
  section: ToolsSection;
  projectId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Panel = TOOLS_PANEL;

  return (
    <div data-testid="tools-overlay" className="absolute inset-0 z-50 flex flex-col">
      {/* The scrim dims MAIN without unmounting it: the page underneath is still there, and
          clicking the scrim is the same dismissal as Esc. */}
      <button
        type="button"
        data-testid="tools-scrim"
        aria-label="Close the Tools panel"
        onClick={onClose}
        // Two alphas, not one. 50% black is right over near-black — it reads as a dim — and
        // wrong over near-white, where it renders a flat mid-grey that looks like a component
        // that failed to load rather than a page that is still there underneath. Caught by
        // opening the overlay in the light theme and looking at it.
        className="absolute inset-0 bg-scrim/20 dark:bg-scrim/50"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Tools"
        data-testid="tools-panel"
        className="relative mt-auto max-h-[70%] overflow-auto border-t border-border bg-surface"
      >
        <header className="flex items-center gap-3 border-b border-border px-3.5 py-2">
          <SectionLabel>Tools</SectionLabel>
          <span className="text-[13px] text-ink-muted">{section}</span>
          <div className="flex-1" />
          <button
            type="button"
            data-testid="tools-close"
            onClick={onClose}
            aria-label="Close the Tools panel"
            className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover"
          >
            Esc
          </button>
        </header>
        {Panel ? (
          <Panel projectId={projectId} section={section} onClose={onClose} />
        ) : (
          <NotMergedYet what="The Tools panel" branch="06-tools-cost" />
        )}
      </section>
    </div>
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
  // `<Component {...props} />`, never `component(props)`.
  //
  // Calling it runs its body inside THIS component's render, so its hooks join the shell's own hook
  // list. Switching from a page whose slot uses no hooks to one that does then changes the shell's
  // hook count between two renders, React throws, and the whole tree unmounts — the page goes blank
  // and only a reload brings it back, because a fresh mount starts from a consistent list. That was
  // the "pages blank when I switch" bug, and it was in all three slots.
  const Component = component;
  return (
    <SlotBoundary what={what}>
      <Component {...props} />
    </SlotBoundary>
  );
}

export function WorkspaceShell() {
  const { route, go, select, openTools, closeTools } = useWorkspaceRoute();
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

  // Cmd/Ctrl-T opens the Tools overlay, the shortcut both wireframes print on the Tools control.
  // Esc lives inside the overlay, so there is exactly one dismissal path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openTools("prompts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTools]);

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
          data-testid="tools-open"
          onClick={() => openTools("prompts")}
          aria-expanded={route.tools !== undefined}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1 text-[14px] text-ink-muted hover:bg-surface-hover"
        >
          Tools
          <span aria-hidden="true" className="font-mono text-[10px] text-ink-ghost">⌘T</span>
        </button>
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
        {navigator.collapsed ? (
          <CollapsedRail side="navigator" label="Navigator" onExpand={navigator.toggle} />
        ) : (
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
              // Rendered as an element, not called — see Slot. A navigator with hooks called inline
              // would put them on the shell's hook list and blank the page on the next switch.
              <Slot component={page.navigator} page={page} what={`${page.label}'s list`} props={pageProps} />
            ) : (
              <p className="text-[13px] text-ink-faint">
                This page's list arrives with {page.builtBy ?? "its branch"}.
              </p>
            )}
          </aside>
        )}

        <ResizeHandle
          side="left"
          width={navigator.width}
          onResize={navigator.setWidth}
          onToggle={navigator.toggle}
        />

        <main data-testid="main" className="relative min-w-0 flex-1 overflow-auto">
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
          {route.tools ? (
            <ToolsOverlay
              section={route.tools}
              projectId={pageProps.projectId}
              onClose={closeTools}
            />
          ) : null}
        </main>

        <ResizeHandle
          side="right"
          width={inspector.width}
          onResize={inspector.setWidth}
          onToggle={inspector.toggle}
        />

        {inspector.collapsed ? (
          <CollapsedRail side="inspector" label="Inspector" onExpand={inspector.toggle} />
        ) : (
          <aside
            data-testid="inspector"
            aria-label="Inspector"
            style={{ width: widths.inspector }}
            className="flex shrink-0 flex-col gap-3.5 overflow-y-auto px-3.5 py-4"
          >
            {page.inspector ? (
              <Slot component={page.inspector} page={page} what={`${page.label}'s inspector`} props={pageProps} />
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
        )}
      </div>
    </div>
  );
}
