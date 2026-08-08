/**
 * The one template every software asset starts from.
 *
 * The single highest-value decision in the reference implementation (`.refs/open-lovable`,
 * `app/api/create-ai-sandbox/route.ts`) is that the app is scaffolded *before* the model is asked
 * for anything, and the model is then told never to write a build configuration. That removes the
 * whole class of failure where an agent invents a `vite.config.js` that does not build. We copy the
 * decision, not the code: everything below is ours, and there is exactly one template (§5.4) —
 * a second one doubles the surface that has to be robustly tested.
 *
 * ## Why every template file ends in `.tmpl`
 *
 * `scripts/audit/reachability.mjs` treats every `.js`/`.jsx`/`.ts` file under `server/` as a module
 * of *our* server and reports the ones no entry point can reach. A template file is the user's app,
 * not our server: `vite.config.js`, `src/main.jsx` and `src/App.jsx` are unreachable from our entry
 * points by design, and checking them in unsuffixed made the audit fail with three orphans. The
 * suffix says "payload, not module" in the filename, and is stripped on copy. It is applied to
 * every file, without exception, so a template file added later cannot silently trip the audit.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

/** The suffix marking a file as template payload. Stripped when the file is written out. */
export const TEMPLATE_SUFFIX = ".tmpl";

/** The only template. Named, because the asset record records which one it was built from. */
export const TEMPLATE_NAME = "vite-react";

/** Absolute path to the template's source directory, resolved relative to this module. */
export function templateRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "templates", TEMPLATE_NAME);
}

/**
 * The paths the template will write, relative to the destination, sorted.
 *
 * A file without the suffix is an error rather than a file copied verbatim: the alternative is a
 * `.js` that lands in the repository unsuffixed, trips the reachability audit, and is then
 * "fixed" by an allowlist entry in a file this worktree does not own.
 */
export function templateFiles(sourceDir: string = templateRoot()): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(TEMPLATE_SUFFIX)) {
        throw new Error(
          `Template file "${relative(sourceDir, full)}" does not end in "${TEMPLATE_SUFFIX}". ` +
            `Every file under ${sourceDir} must, or the reachability audit will read it as one of ` +
            `our modules.`,
        );
      }
      out.push(relative(sourceDir, full).slice(0, -TEMPLATE_SUFFIX.length));
    }
  };
  walk(sourceDir);
  return out.sort();
}

/**
 * Copy the template into `destDir`, stripping the suffix. Returns the paths written, relative to
 * `destDir`, sorted.
 *
 * Existing files are overwritten only if `overwrite` is set. The default refuses, because copying
 * the template a second time over an asset an agent has already edited would silently destroy its
 * work — the template is written once, when the asset repository is created (§5.2 step 3).
 */
export function materializeTemplate(
  destDir: string,
  { sourceDir = templateRoot(), overwrite = false }: { sourceDir?: string; overwrite?: boolean } = {},
): string[] {
  const root = resolve(destDir);
  const written = templateFiles(sourceDir);

  for (const rel of written) {
    const target = resolve(root, rel);
    // The names come from our own repository, not from a request, but a template file called
    // `../x` would escape the asset repository and there is no reason to find that out later.
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`Template file "${rel}" would be written outside ${root}`);
    }
    if (existsSync(target) && !overwrite) {
      throw new Error(`Refusing to overwrite existing file: ${target}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(sourceDir, rel + TEMPLATE_SUFFIX)));
  }

  return written;
}
