/**
 * An asset previewed **as itself** — loops/02-assets.md, and §3.2 of the product contract.
 *
 * A deck renders as slides, a table as a grid, a document as prose, a workflow as its step chain,
 * software as its files. The one thing this must never be is a row in a list with a type label
 * next to it: the whole argument for an ASSETS page is that the user sees the deliverable, not a
 * record of the deliverable.
 *
 * These are structural previews drawn from the asset's own shape, not thumbnails of real files —
 * there are no real files yet. Every one of them is deliberately drawn in tokens with no imagery,
 * so nothing here can be mistaken for a rendered artefact.
 */
import type { MockAsset, MockBody, MockFile } from "./mockAssets";

/** The bytes of a file on a deliverable — `server/routes/assets.ts` serves these. */
const fileUrl = (assetId: string, fileId: string) => `/api/assets/${assetId}/files/${fileId}`;

/** Pick the file a preview should show: the source a user uploaded, else the first one there is. */
function primaryFile(asset: MockAsset): MockFile | undefined {
  const files = asset.files ?? [];
  return files.find((f) => f.role === "source") ?? files[0];
}

/**
 * A deliverable that holds real bytes, shown as itself.
 *
 * The structural previews below draw an asset from its *shape* and were written when no real file
 * existed. The first genuine upload — a PDF — had no shape at all: `asset.body` was undefined and
 * the page stopped working. A real file is previewed from the file, and only an asset without one
 * falls through to the structural drawing.
 *
 * Four kinds are shown directly, which is what the owner asked for: PDF, slides, video and audio.
 * Anything else states what it is and offers to open it, rather than rendering a broken frame.
 */
export function FilePreview({ asset }: { asset: MockAsset }) {
  const file = primaryFile(asset);
  if (!file) return null;
  const src = fileUrl(asset.id, file.id);
  const mime = file.mime ?? "";

  if (mime === "application/pdf") {
    return (
      <object data-testid="preview-pdf" data={src} type="application/pdf" className="h-full w-full">
        {/* A browser that will not embed a PDF gets a link, never a blank frame. */}
        <a href={src} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">
          Open {asset.title}
        </a>
      </object>
    );
  }

  if (mime.startsWith("image/")) {
    return (
      <img data-testid="preview-image" src={src} alt={asset.title} className="h-full w-full object-contain" />
    );
  }

  if (mime.startsWith("video/")) {
    return <video data-testid="preview-video" src={src} controls className="h-full w-full" />;
  }

  if (mime.startsWith("audio/")) {
    return (
      <div data-testid="preview-audio" className="flex h-full items-center justify-center p-4">
        <audio src={src} controls className="w-full" />
      </div>
    );
  }

  // Slides and documents in Office formats cannot be rendered in a browser without a converter we
  // do not have. Saying so and offering the file is the honest answer; an empty frame is not.
  return (
    <div data-testid="preview-file" className="flex h-full flex-col items-center justify-center gap-2 p-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-ink-ghost">
        {mime || "unknown type"}
      </span>
      <a href={src} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">
        Open {asset.title}
      </a>
      <span className="text-[11px] text-ink-ghost">No in-page preview for this format yet.</span>
    </div>
  );
}

/** A line of "text" in a preview. Width varies so a paragraph reads as prose at a glance. */
function Line({ w, strong }: { w: string; strong?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[5px] rounded-sm ${strong ? "bg-ink/45" : "bg-ink/20"}`}
      style={{ width: w }}
    />
  );
}

const WIDTHS = ["96%", "88%", "92%", "78%", "84%"];

export function AssetPreview({ body }: { body?: MockBody }) {
  // An uploaded asset has no structural body. Undefined here used to throw on `body.kind` and take
  // the region down; callers now prefer FilePreview, and this stays defensive because the shape
  // arrives over a network.
  if (!body) return null;

  if (body.kind === "document") {
    return (
      <div className="flex h-full flex-col gap-2.5 overflow-hidden p-4">
        {body.headings.map((heading, i) => (
          <div key={heading} className="flex flex-col gap-1.5">
            <div className="truncate text-[11px] text-ink-muted">{heading}</div>
            {Array.from({ length: body.paragraphs[i] ?? 2 }).map((_, j) => (
              <Line key={j} w={WIDTHS[(i + j) % WIDTHS.length]} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (body.kind === "slides") {
    return (
      <div className="grid h-full grid-cols-3 content-start gap-2 overflow-hidden p-3">
        {body.slides.map((slide, i) => (
          <div
            key={slide.title}
            className={`flex aspect-[16/9] flex-col gap-1 rounded-sm border p-1.5 ${
              i === 0 ? "border-accent/60 bg-accent/5" : "border-border bg-canvas"
            }`}
          >
            <div className="truncate text-[8px] leading-tight text-ink-muted">{slide.title}</div>
            {slide.hasImage ? (
              <div aria-hidden="true" className="flex-1 rounded-[2px] bg-ink/12" />
            ) : (
              <div className="flex flex-1 flex-col justify-center gap-[3px]">
                {Array.from({ length: slide.bullets }).map((_, j) => (
                  <Line key={j} w={WIDTHS[j % WIDTHS.length]} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (body.kind === "table") {
    return (
      <div className="h-full overflow-hidden p-3">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              {body.columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-border px-1.5 py-1 text-left font-mono text-[9px] uppercase tracking-[0.06em] text-ink-ghost"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.rows.map((row, i) => (
              <tr key={i} className={i % 2 ? "bg-ink/[0.03]" : undefined}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`truncate px-1.5 py-[3px] ${j === 0 ? "text-ink-muted" : "text-ink-faint"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (body.kind === "workflow") {
    return (
      <div className="flex h-full flex-col justify-center gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {body.steps.map((step, i) => (
            <div key={step.name} className="flex items-center gap-2">
              <span
                className={`rounded-md border px-2.5 py-1 text-[11px] ${
                  step.state === "running"
                    ? "border-status-working bg-status-working text-status-working"
                    : step.state === "done"
                      ? "border-border text-ink-muted"
                      : "border-border text-ink-ghost"
                }`}
              >
                {step.name}
              </span>
              {i < body.steps.length - 1 ? (
                <span aria-hidden="true" className="text-ink-ghost">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="text-[11px] text-ink-faint">
          {/* The state is in words as well as colour, in both themes. */}
          loop ran {body.loops} times · {body.steps.filter((s) => s.state === "done").length} of{" "}
          {body.steps.length} steps done
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-3 p-3">
      <div className="flex w-1/2 flex-col gap-1 overflow-hidden">
        {body.tree.map((file) => (
          <div key={file.path} className="flex items-baseline gap-2 text-[10px]">
            <span
              className={`truncate ${file.path === body.entry ? "text-ink-muted" : "text-ink-faint"}`}
            >
              {file.path}
            </span>
          </div>
        ))}
      </div>
      {/* A framed "app", drawn rather than run: 05-software owns the real preview surface. */}
      <div className="flex flex-1 flex-col gap-1.5 rounded-sm border border-border bg-canvas p-2">
        <div aria-hidden="true" className="h-1.5 w-1/3 rounded-sm bg-ink/30" />
        <div aria-hidden="true" className="h-8 rounded-sm bg-ink/10" />
        <div className="flex gap-1.5">
          <div aria-hidden="true" className="h-4 flex-1 rounded-sm bg-ink/10" />
          <div aria-hidden="true" className="h-4 w-8 rounded-sm bg-accent/40" />
        </div>
      </div>
    </div>
  );
}
