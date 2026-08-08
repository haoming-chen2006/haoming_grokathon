/**
 * The theme switch — loops/07-shell.md §3.7.
 *
 * The token layer (iteration 2) put both palettes in `client/src/index.css` behind the `light`
 * class on <html>. This is the thing that sets it.
 *
 * Three parts, and the split matters:
 *   - the boot script in index.html stamps the class before the first paint (request R-2);
 *   - this module changes it at run time, with no reload;
 *   - `localStorage` is the boot-time cache and `PUT /api/settings` is the durable record.
 *
 * `localStorage` alone would lose the choice when a browser's storage is cleared; the server
 * setting alone cannot be read before the bundle runs, which is the whole reason R-2 exists.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "grok-workspace-theme";

const isTheme = (value: unknown): value is Theme => value === "dark" || value === "light";

/** The stored override, or undefined when the user has never chosen. */
export function storedTheme(): Theme | undefined {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** What the OS asks for. Dark unless the browser says otherwise — the product's default. */
export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * The stored choice wins over the OS **in both directions**: a user who chose light keeps light
 * when the OS goes dark, and a user who chose dark keeps dark when the OS goes light. A resolver
 * that only overrode one way would silently revert half its users.
 */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

/** Stamp the class the CSS reads. Both states are explicit; neither is "the absence of a class". */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(resolveTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A theme that cannot be remembered is still a theme for this session.
    }
    // Durable record. PUT /api/settings merges arbitrary keys into an untyped config, so this
    // needs no server change and no server type. A failure here loses persistence across browsers,
    // never the switch itself, so it is deliberately not surfaced.
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}
