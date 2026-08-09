/**
 * A mention, drawn.
 *
 * Two states, and the second one is the reason this is a component rather than an anchor tag.
 *
 * **It resolves** — an in-app link in the designs' `link` blue. Clicking it routes: `navigate`
 * writes the URL and the shell re-renders the three regions, so following a mention keeps the
 * session, the transcript and the scroll position. A page load would throw all three away, which
 * is a strange thing to happen when you click a word in your own document.
 *
 * **Its target is gone** — a deleted asset is a normal state, not a crash. The label still renders,
 * because it is what somebody wrote, and it carries the word "missing" as well as a different
 * treatment: colour is never the only signal, and a strikethrough alone says nothing to a reader
 * who cannot see it. It is not a link, because a link to a page that will say "no such asset" is a
 * worse answer than saying it here.
 *
 * Nothing claims the second state until the lists have arrived — see `targets.tsx`.
 */
import type { Mention, MentionKind } from "../designdoc/markdown";
import { parseMentions } from "../designdoc/markdown";
import { workspaceUrl, type PageId } from "../shell/contract";
import { navigate } from "../shell/router";
import { kindLabel, targetName, useMentionTarget } from "./targets";

/** Which page holds a kind. The two schemes and the five pages meet here and nowhere else. */
const PAGE_OF: Record<MentionKind, PageId> = { asset: "assets", doc: "designdocs" };

export function mentionHref(mention: Mention): string {
  return workspaceUrl(PAGE_OF[mention.kind], mention.id);
}

export function MentionLink({ mention }: { mention: Mention }) {
  const { target, missing } = useMentionTarget(mention.kind, mention.id);

  if (missing) {
    return (
      <span
        data-testid={`mention-missing-${mention.id}`}
        data-mention-kind={mention.kind}
        title={`${kindLabel(mention.kind)} ${mention.id} is no longer in this project. The text stays as it was written.`}
        className="text-ink-faint line-through decoration-ink-ghost"
      >
        {mention.label}
        <span className="ml-1 font-mono text-[10px] uppercase tracking-[0.06em] no-underline">
          missing
        </span>
      </span>
    );
  }

  const href = mentionHref(mention);
  // The title names what the id currently points at, so a label that has drifted from the record's
  // title still tells the reader where they are about to go. When the lists are not in, it names
  // the id, which is the one thing we do know.
  const title = target
    ? `${kindLabel(mention.kind)} · ${targetName(target)}`
    : `${kindLabel(mention.kind)} · ${mention.id}`;

  return (
    <a
      data-testid={`mention-${mention.id}`}
      data-mention-kind={mention.kind}
      href={href}
      title={title}
      onClick={(e) => {
        // Plain left click routes. Anything with a modifier is a deliberate "open this elsewhere"
        // and the browser's own handling of the href is the right answer to it.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        e.preventDefault();
        navigate(href);
      }}
      className="text-link underline decoration-link/40 underline-offset-2 hover:decoration-link"
    >
      {mention.label}
    </a>
  );
}

/**
 * A plain string with its mentions made clickable, and every other character left alone.
 *
 * For surfaces that are not documents — an agent transcript above all. See `parseMentions`.
 */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {parseMentions(text).map((run, i) =>
        run.kind === "text" ? (
          <span key={i}>{run.text}</span>
        ) : (
          <MentionLink key={i} mention={run.mention} />
        ),
      )}
    </>
  );
}
