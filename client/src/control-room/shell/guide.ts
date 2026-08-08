/**
 * The welcome guide's content — loops/07-shell.md §3.8.
 *
 * **No guide prose is authored in this worktree.** The text lives in `docs/USER-GUIDE.md`, owned by
 * the `guide` worktree, and this module only finds the right part of it. Writing prose here would
 * mean two copies that disagree within a week.
 *
 * It is imported with Vite's `?raw`, so the guide is bundled at build time. That avoids a server
 * route — which would be a new endpoint in a file this worktree does not own — and avoids a
 * markdown dependency, which would be a package.json change and therefore a handoff request.
 */
import raw from "../../../../docs/USER-GUIDE.md?raw";
import { PAGES } from "./pages";
import type { PageId } from "./contract";

export interface GuideSection {
  /** The `## ` heading, verbatim. */
  title: string;
  /** Everything under it, up to the next `## `. */
  body: string;
}

/** Split the guide on its top-level sections. Headings deeper than `##` stay inside a body. */
export function guideSections(source: string = raw): GuideSection[] {
  const out: GuideSection[] = [];
  let current: GuideSection | undefined;
  for (const line of source.split("\n")) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      if (current) out.push(current);
      current = { title: heading[1].trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * The section that explains a page.
 *
 * Matched on the page's own label appearing in a section title, because the guide is written for
 * humans and numbers its sections independently of this registry. A missing entry is **reported,
 * never silently skipped** — §7's SHELL-015 requires exactly that, so a drifted heading is visible
 * instead of quietly showing the reader nothing.
 */
export function sectionForPage(page: PageId, sections: GuideSection[] = guideSections()): GuideSection | undefined {
  const label = PAGES.find((p) => p.id === page)?.label ?? page;
  const wanted = label.toLowerCase();
  return sections.find((s) => s.title.toLowerCase().includes(wanted));
}

/** Every page whose guide entry is missing. Rendered to the reader rather than swallowed. */
export function pagesWithoutGuideEntry(sections: GuideSection[] = guideSections()): string[] {
  return PAGES.filter((p) => !sectionForPage(p.id, sections)).map((p) => p.label);
}
