/**
 * The USERS page, inside the real shell, without editing the shell.
 *
 * `client/src/control-room/shell/pages.ts` belongs to 07-shell and its header reserves the mount
 * edit for reconciliation (§0, request R-4). This worktree may not make that edit, and a page
 * nobody can look at is a page nobody has checked — the loop document's own standard of evidence
 * rules out "the component exists" as proof of anything.
 *
 * So this harness does at run time exactly what reconciliation will do at build time: it puts the
 * three slot components into the registry's existing `users` row, and mounts `WorkspaceShell`.
 * Everything else — the toolbar, the page selector, the three resizable regions, the theme switch,
 * the token layer — is 07-shell's own code, unmodified, so what renders here is what will render
 * after the merge and not an approximation of it.
 *
 * Two honest limits of the harness, since it is a harness and not a product:
 *
 *   - it lives in this loop's own directory and is not reachable from the application. Nothing in
 *     `main.tsx` or `index.html` knows it exists, both of which are hot files;
 *   - it rewrites the address bar to `/users` on boot, because the shell's router reads the URL
 *     and Vite serves this file from its own path. Navigating inside the shell works normally
 *     after that; reloading lands back on Vite's path, which is the one seam that would disappear
 *     if this were mounted for real.
 *
 * Run it with `bun run --cwd client dev` and open
 * `/src/control-room/users/preview/index.html`. Two query parameters exist so a screenshot can be
 * taken of a state that normally needs a click — `?person=usr_dana` opens the inspector on
 * somebody, and `?theme=dark` or `?theme=light` pins the palette instead of following the
 * machine. Both belong to the harness and neither exists in the page.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { WorkspaceShell } from "../../shell/WorkspaceShell";
import { PAGES } from "../../shell/pages";
import { THEME_STORAGE_KEY, applyTheme, resolveTheme } from "../../shell/theme";
import { USERS_PAGE_SLOTS } from "../index";
import "../../../index.css";

/** Reconciliation's one line, applied to the live object instead of to the source. */
const usersRow = PAGES.find((page) => page.id === "users");
if (usersRow) Object.assign(usersRow, USERS_PAGE_SLOTS);

const params = new URLSearchParams(location.search);

// The shell's router reads location.pathname, and Vite served this module from a path with four
// segments, which parses as "not a workspace location" and falls back to the default page.
const person = params.get("person");
history.replaceState(null, "", person ? `/users/${encodeURIComponent(person)}` : "/users");

// Pinning writes the same localStorage key the theme toggle writes, rather than only stamping the
// class: `WorkspaceShell` calls `useTheme()`, which re-resolves on mount and would immediately
// overwrite a class this harness set behind its back. Going through the stored choice means the
// harness pins a theme the way a user pins one, and the shell agrees with it.
const pinned = params.get("theme");
if (pinned === "dark" || pinned === "light") localStorage.setItem(THEME_STORAGE_KEY, pinned);
applyTheme(resolveTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceShell />
  </React.StrictMode>,
);
