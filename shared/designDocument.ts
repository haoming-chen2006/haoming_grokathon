/**
 * Reading a design document as a project specification.
 *
 * Shared by the CLI (`bun run new`) and the browser form, because both import a design document
 * and both need the same answer. Two copies of a parser drift, and the drift would show up as the
 * command line and the UI disagreeing about what a project's requirements are.
 */

export interface ParsedRequirement {
  id: string;
  description: string;
}

/**
 * Requirements written as list items: "- AUTH-01: description", "* AUTH-01 — description".
 *
 * The id shape is deliberately strict — uppercase prefix, dash, digits — because a loose pattern
 * turns ordinary prose bullets into requirements, and a project full of phantom requirements is
 * worse than one with none. Later duplicates of an id are ignored so a document that mentions a
 * requirement twice does not fail the import.
 */
export function parseRequirements(markdown: string | undefined | null): ParsedRequirement[] {
  const out: ParsedRequirement[] = [];
  for (const line of String(markdown ?? "").split("\n")) {
    const m = line.match(/^\s*[-*]\s+([A-Z][A-Z0-9]*-\d+)\s*[:—-]\s*(.+?)\s*$/);
    if (m && !out.some((r) => r.id === m[1])) out.push({ id: m[1], description: m[2] });
  }
  return out;
}

/** The document's first level-one heading, used as the project goal when none is given. */
export function firstHeading(markdown: string | undefined | null): string | undefined {
  return (String(markdown ?? "").match(/^#\s+(.+?)\s*$/m) ?? [])[1];
}
