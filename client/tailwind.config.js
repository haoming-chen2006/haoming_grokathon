/**
 * The token layer's other half — loops/07-shell.md §3.7.
 *
 * Every colour here resolves through a CSS custom property defined in the two `:root` blocks of
 * `src/index.css`, wrapped as `rgb(var(--token) / <alpha-value>)` so the opacity utilities keep
 * working: `bg-surface/60` and `text-ink/40` still mean what they say against a variable.
 *
 * Nothing in this file is a literal colour, and nothing in `client/src/control-room/shell/**` may
 * be one either — `tokens.test.ts` enforces both. A page that needs a colour this file does not
 * publish files a request with 07-shell; it does not write a hex.
 *
 * `darkMode: 'class'` rather than Tailwind 3's `media` default, so a `dark:` variant follows the
 * user's stored choice instead of the OS. The switch itself is the `dark` / `light` class the boot
 * script stamps on <html>; the variables swap underneath, so most components need no variant at all.
 */

/** rgb(var(--x) / <alpha-value>) — the form that keeps /NN opacity utilities alive. */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

const AREAS = [1, 2, 3, 4, 5, 6];
const STATUSES = ["working", "waiting", "needs-review", "complete", "idle", "failed"];

/** One entry per area or status, built from the token name so the two cannot drift. */
const byName = (names, suffix) =>
  Object.fromEntries(names.map((n) => [n, token(`${n}-${suffix}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ground. The sub-keys are the spellings the legacy shell already uses in 198 places
        // (bg-canvas, bg-surface, border-border); each now points at a token instead of a hex.
        'canvas': {
          DEFAULT: token('canvas'),
          dark: token('canvas'),
          light: token('surface'),
          lighter: token('surface-active'),
        },
        'surface': {
          DEFAULT: token('surface'),
          hover: token('surface-hover'),
          active: token('surface-active'),
        },
        'border': {
          DEFAULT: token('border'),
          light: token('border-strong'),
        },
        'border-strong': token('border-strong'),

        // Ink. Four semantic steps replacing seven text-white/NN opacities.
        'ink': {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          faint: token('ink-faint'),
          ghost: token('ink-ghost'),
        },

        'accent': {
          DEFAULT: token('accent'),
          muted: token('accent-muted'),
        },
      },

      // Status and area resolve to a DIFFERENT value per utility — a pill's fill, its label and
      // its rule are three chosen colours, not one colour at three opacities. Tailwind reads
      // backgroundColor / textColor / borderColor separately, which is exactly that shape:
      // bg-status-working, text-status-working, border-status-working.
      backgroundColor: {
        // The overlay scrim. Not a ground: it darkens whatever is beneath it in both themes.
        'scrim': token('scrim'),
        ...byName(STATUSES.map((s) => `status-${s}`), 'bg'),
        ...byName(AREAS.map((n) => `area-${n}`), 'bg'),
        // The design-document line highlight: the one place colour carries meaning at low
        // opacity, so each wash is pre-blended against its own ground rather than computed.
        ...Object.fromEntries(AREAS.map((n) => [`gutter-area-${n}`, token(`area-${n}-gutter`)])),
      },
      textColor: {
        ...byName(STATUSES.map((s) => `status-${s}`), 'ink'),
        ...byName(AREAS.map((n) => `area-${n}`), 'ink'),
      },
      borderColor: {
        ...byName(STATUSES.map((s) => `status-${s}`), 'border'),
        ...byName(AREAS.map((n) => `area-${n}`), 'border'),
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },
      boxShadow: {
        // Baked rgba(0,0,0,.3) only works on a dark ground; the light ramp is chosen separately.
        'node': 'var(--shadow-node)',
        'node-hover': 'var(--shadow-node-hover)',
        'panel': 'var(--shadow-panel)',
        'glow': '0 0 20px var(--glow-color, rgb(var(--accent)))',
      }
    },
  },
  plugins: [],
}
