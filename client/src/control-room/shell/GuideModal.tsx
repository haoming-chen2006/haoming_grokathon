/**
 * The welcome guide — loops/07-shell.md §3.8.
 *
 * This worktree owns the *affordance*: the `?` in the toolbar, the modal, the per-page entry and
 * the missing-entry report. `docs/USER-GUIDE.md` owns every word inside it.
 *
 * Reached from the `?` on every page, which opens it at the current page's entry — the third of
 * the three routes §3.8 lists, and the one people actually use.
 *
 * The markdown is rendered by a deliberately small formatter: headings, list items, code fences
 * and paragraphs. A real markdown dependency is a package.json change and therefore a handoff
 * request, and the guide is prose rather than a document that needs tables and footnotes.
 */
import { useEffect, useState } from "react";
import type { PageId } from "./contract";
import { PAGES } from "./pages";
import { guideSections, pagesWithoutGuideEntry, sectionForPage } from "./guide";

/** Headings, bullets, fenced code and paragraphs. Everything else renders as its own text. */
function GuideBody({ body }: { body: string }) {
  const blocks: JSX.Element[] = [];
  const lines = body.split("\n");
  let paragraph: string[] = [];
  let fence: string[] | undefined;

  const flush = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={blocks.length} className="text-[13px] leading-relaxed text-ink-muted">
          {paragraph.join(" ")}
        </p>,
      );
      paragraph = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (fence) {
        blocks.push(
          <pre
            key={blocks.length}
            className="overflow-x-auto rounded border border-border bg-surface p-3 font-mono text-[11px] text-ink-faint"
          >
            {fence.join("\n")}
          </pre>,
        );
        fence = undefined;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }
    const heading = /^(#{3,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push(
        <h3 key={blocks.length} className="mt-2 text-[14px] text-ink">
          {heading[2]}
        </h3>,
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      blocks.push(
        <p key={blocks.length} className="pl-4 text-[13px] leading-relaxed text-ink-muted">
          • {bullet[1]}
        </p>,
      );
      continue;
    }
    if (line.trim() === "") flush();
    else paragraph.push(line.trim());
  }
  flush();
  if (fence?.length) {
    blocks.push(
      <pre key={blocks.length} className="overflow-x-auto rounded border border-border bg-surface p-3 font-mono text-[11px] text-ink-faint">
        {fence.join("\n")}
      </pre>,
    );
  }

  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export function GuideModal({ page, onClose }: { page: PageId; onClose: () => void }) {
  const sections = guideSections();
  const [openTitle, setOpenTitle] = useState<string | undefined>(
    () => sectionForPage(page, sections)?.title,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const missing = pagesWithoutGuideEntry(sections);
  const active = sections.find((s) => s.title === openTitle);
  const label = PAGES.find((p) => p.id === page)?.label ?? page;

  return (
    <div data-testid="guide-modal" className="fixed inset-0 z-[200] flex items-center justify-center p-8">
      <button
        type="button"
        data-testid="guide-scrim"
        aria-label="Close the guide"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/50"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Welcome guide"
        className="relative flex h-full max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-canvas"
      >
        <nav
          aria-label="Guide contents"
          className="w-64 shrink-0 overflow-y-auto border-r border-border p-3"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-ghost">
            Contents
          </div>
          <div className="mt-2 flex flex-col">
            {sections.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setOpenTitle(s.title)}
                className={`rounded px-2 py-1 text-left text-[13px] ${
                  s.title === openTitle ? "bg-surface-active text-ink" : "text-ink-faint hover:bg-surface-hover"
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-2">
            <h2 className="min-w-0 flex-1 truncate text-[15px] text-ink">
              {active ? active.title : `Guide — ${label}`}
            </h2>
            <button
              type="button"
              data-testid="guide-close"
              onClick={onClose}
              className="rounded border border-border px-2 py-0.5 text-[11px] text-ink-faint hover:bg-surface-hover"
            >
              Esc
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {active ? (
              <GuideBody body={active.body} />
            ) : (
              /* Reported, never silently skipped: a drifted heading is visible rather than a
                 blank panel that looks like the guide simply has nothing to say. */
              <p data-testid="guide-missing" className="text-[13px] text-ink-faint">
                The guide has no entry for {label} yet. Pick a section on the left, or add one to
                docs/USER-GUIDE.md.
              </p>
            )}
            {missing.length > 0 ? (
              <p data-testid="guide-missing-report" className="mt-6 text-[12px] text-ink-ghost">
                Pages with no guide entry: {missing.join(", ")}.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
