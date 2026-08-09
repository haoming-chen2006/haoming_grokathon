/**
 * The token layer, measured — loops/07-shell.md §3.7, items SHELL-009/010/011.
 *
 * A theme has no tests, and the suite will not tell you: only two class assertions exist in the
 * whole control-room suite and neither asserts a colour, so a green suite says nothing about
 * whether the light theme is readable. This file is the instrument that makes it say something.
 *
 * It reads the shipped files — `src/index.css` and `tailwind.config.js` — rather than a copy of
 * their values, so a token edited in one place and not the other fails here rather than in a
 * user's browser. Every threshold below is a WCAG contrast ratio or a CIE76 colour difference
 * computed from those files; none is a number typed twice.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLIENT = join(import.meta.dir, "../../..");
const CSS_PATH = join(CLIENT, "src/index.css");
const TAILWIND_PATH = join(CLIENT, "tailwind.config.js");
const SHELL_DIR = import.meta.dir;

const css = readFileSync(CSS_PATH, "utf8");

// ───────────────────────────────────────────────────────────────────── colour maths

type Rgb = [number, number, number];

/** The two forms a token can take: "10 10 10" in the CSS, or a #hex when a probe supplies one. */
function parseRgb(value: string): Rgb {
  const triple = value.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (triple) return [Number(triple[1]), Number(triple[2]), Number(triple[3])];
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  throw new Error(`not a colour this test can measure: ${value}`);
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.1 contrast ratio, 1…21. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB → CIE L*a*b*, D65. Used only for the perceptual-difference checks below. */
function lab([r, g, b]: Rgb): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/**
 * CIE76 ΔE. Blunter than CIEDE2000, and deliberately so: it is easy to re-derive by hand from the
 * numbers printed here, which matters more for an evidence ledger than the last few percent of
 * perceptual accuracy.
 */
function deltaE(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// ───────────────────────────────────────────────────────────────── the two :root blocks

/**
 * Pull one declaration block out of index.css by its exact selector.
 *
 * There are two token blocks and two behaviour blocks sharing the `:root` and `:root.light`
 * selectors, so this takes the first match, which is the token block in both cases. A test that
 * silently matched the wrong one would report an empty palette as a passing palette, so the
 * completeness assertions below are what stop that: an empty block fails every one of them.
 */
function block(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} block in index.css`);
  const out = new Map<string, string>();
  for (const decl of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out.set(decl[1], decl[2].trim());
  return out;
}

const DARK = block(":root");
const LIGHT = block(":root.light");
const THEMES: [string, Map<string, string>][] = [
  ["dark", DARK],
  ["light", LIGHT],
];

const colour = (theme: Map<string, string>, name: string): Rgb => {
  const value = theme.get(name);
  if (!value) throw new Error(`no --${name} in this theme`);
  return parseRgb(value);
};

// ───────────────────────────────────────────────────────────── the published token list

/** loops/07-shell.md §3.3.3, published verbatim as R-1.4. This is the contract, not a summary. */
const GROUND = ["canvas", "surface", "surface-hover", "surface-active", "border", "border-strong"];
const INK = ["ink", "ink-muted", "ink-faint", "ink-ghost"];
const ACCENT = ["accent", "accent-muted", "link"];
const STATUSES = ["working", "waiting", "needs-review", "complete", "idle", "failed"];
const AREAS = [1, 2, 3, 4, 5, 6];

const STATUS_TOKENS = STATUSES.flatMap((s) => [
  `status-${s}-bg`,
  `status-${s}-ink`,
  `status-${s}-border`,
]);
const AREA_TOKENS = AREAS.flatMap((n) => [
  `area-${n}-bg`,
  `area-${n}-ink`,
  `area-${n}-border`,
  `area-${n}-gutter`,
]);
const PUBLISHED = [...GROUND, ...INK, ...ACCENT, ...STATUS_TOKENS, ...AREA_TOKENS];

describe("the token layer is complete in both themes", () => {
  for (const [name, theme] of THEMES) {
    test(`${name} defines every published token`, () => {
      const missing = PUBLISHED.filter((t) => !theme.has(t));
      expect(missing).toEqual([]);
    });

    test(`${name} defines every token as a measurable rgb triple`, () => {
      for (const t of PUBLISHED) expect(() => colour(theme, t)).not.toThrow();
    });
  }

  test("the two themes define exactly the same token names, so neither can drift", () => {
    expect([...DARK.keys()].filter((k) => k.startsWith("shadow")).length).toBeGreaterThan(0);
    const darkColours = [...DARK.keys()].filter((k) => !k.startsWith("shadow")).sort();
    const lightColours = [...LIGHT.keys()].filter((k) => !k.startsWith("shadow")).sort();
    expect(lightColours).toEqual(darkColours);
  });

  test("the dark and light values actually differ — a copied block is not a second theme", () => {
    const identical = PUBLISHED.filter((t) => DARK.get(t) === LIGHT.get(t));
    expect(identical).toEqual([]);
  });
});

describe("index.css states no colour outside the two token blocks", () => {
  /**
   * Comments are stripped first: the header explains why a 15% fill that reads on near-black is
   * invisible on #f5f5f5, and naming the ground it is talking about is prose, not a rendered
   * colour. Everything else — hex, rgb() with numbers, hsl() — must sit inside a token block.
   */
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const darkBlock = withoutComments.match(/(?:^|\n):root\s*\{[^}]*\}/)?.[0] ?? "";
  const lightBlock = withoutComments.match(/(?:^|\n):root\.light\s*\{[^}]*\}/)?.[0] ?? "";
  const rest = withoutComments.replace(darkBlock, "").replace(lightBlock, "");

  test("both token blocks were actually found, or the scan below proves nothing", () => {
    expect(darkBlock).toContain("--canvas:");
    expect(lightBlock).toContain("--canvas:");
    expect(rest).not.toContain("--canvas:");
  });

  test("no hex, numeric rgb() or hsl() survives outside them", () => {
    const literals = [
      ...rest.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...rest.matchAll(/\brgba?\(\s*[\d.]/g),
      ...rest.matchAll(/\bhsla?\(/g),
    ].map((m) => m[0]);
    expect(literals).toEqual([]);
  });

  test("the grounds and the ink the page itself paints come from tokens", () => {
    expect(css).toContain("background: rgb(var(--canvas));");
    expect(css).toContain("color: rgb(var(--ink));");
  });
});

describe("tailwind resolves every colour through a token", () => {
  const config = readFileSync(TAILWIND_PATH, "utf8");

  /**
   * Asserted on the LOADED config, not on the file's text.
   *
   * The first version of this test matched /darkMode:\s*'class'/ against the source, and passed
   * with the setting deleted — because the file's own doc comment explains why darkMode: 'class'
   * is set, and prose about a setting is not a setting. Caught by planting the deletion, which is
   * the only reason it is not still wrong.
   */
  test("darkMode is 'class', so a dark: variant follows the switch and not the OS", async () => {
    const loaded = (await import(TAILWIND_PATH)).default;
    expect(loaded.darkMode).toBe("class");
  });

  test("no literal colour is left in the config", () => {
    const body = config.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const literals = [
      ...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
      ...body.matchAll(/\brgba\(/g),
      ...body.matchAll(/\brgb\(\s*[\d.]/g),
    ].map((m) => m[0]);
    expect(literals).toEqual([]);
  });

  test("every colour is var-backed with <alpha-value>, so the /NN opacity utilities keep working", async () => {
    const loaded = (await import(TAILWIND_PATH)).default;
    const values: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string") values.push(node);
      else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(loaded.theme.extend.colors);
    walk(loaded.theme.extend.backgroundColor);
    walk(loaded.theme.extend.textColor);
    walk(loaded.theme.extend.borderColor);
    // Exact, not a floor: ten ground spellings + four ink steps + two accents, then three
    // utilities each for six statuses and six areas, then the six gutter washes. A wrong count
    // means a token was added to the config and to nothing else, which a floor would hide.
    // +1 for the overlay scrim, which is a background and belongs to no published group.
    const expected =
      10 + INK.length + ACCENT.length + STATUSES.length * 3 + AREAS.length * 3 + AREAS.length + 1;
    expect(values.length).toBe(expected);
    for (const v of values) expect(v).toMatch(/^rgb\(var\(--[\w-]+\) \/ <alpha-value>\)$/);
  });

  test("every var the config names is defined in both themes", async () => {
    const loaded = (await import(TAILWIND_PATH)).default;
    const used = new Set<string>();
    const walk = (node: unknown) => {
      if (typeof node === "string") {
        for (const m of node.matchAll(/var\(--([\w-]+)\)/g)) used.add(m[1]);
      } else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(loaded.theme.extend);
    // --glow-color is set per node at run time by the component that glows, not by a theme.
    used.delete("glow-color");
    for (const name of used) {
      expect(`dark:${name}:${DARK.has(name)}`).toBe(`dark:${name}:true`);
      expect(`light:${name}:${LIGHT.has(name)}`).toBe(`light:${name}:true`);
    }
  });

  test("the status and area utilities siblings were promised all exist", async () => {
    const loaded = (await import(TAILWIND_PATH)).default;
    for (const s of STATUSES) {
      expect(loaded.theme.extend.backgroundColor[`status-${s}`]).toBeDefined();
      expect(loaded.theme.extend.textColor[`status-${s}`]).toBeDefined();
      expect(loaded.theme.extend.borderColor[`status-${s}`]).toBeDefined();
    }
    for (const n of AREAS) {
      expect(loaded.theme.extend.backgroundColor[`area-${n}`]).toBeDefined();
      expect(loaded.theme.extend.textColor[`area-${n}`]).toBeDefined();
      expect(loaded.theme.extend.borderColor[`area-${n}`]).toBeDefined();
      expect(loaded.theme.extend.backgroundColor[`gutter-area-${n}`]).toBeDefined();
    }
  });
});

describe("the ink ramp is readable on both grounds", () => {
  // Four semantic steps replacing seven text-white/NN opacities. The floors are WCAG 2.1: AAA
  // body text, AAA for the secondary step, AA for the tertiary, and the 3:1 UI-component
  // threshold for the ghost step, which never carries prose.
  const FLOOR: Record<string, number> = { ink: 12, "ink-muted": 7, "ink-faint": 4.5, "ink-ghost": 3 };

  for (const [name, theme] of THEMES) {
    for (const ground of ["canvas", "surface"]) {
      for (const step of INK) {
        test(`${name}: ${step} on ${ground} clears ${FLOOR[step]}:1`, () => {
          const ratio = contrast(colour(theme, step), colour(theme, ground));
          expect(`${step}/${ground} ${ratio.toFixed(2)}`).toBe(
            `${step}/${ground} ${Math.max(ratio, FLOOR[step]).toFixed(2)}`,
          );
        });
      }
    }

    test(`${name}: the four steps are four distinct steps, in order`, () => {
      const ratios = INK.map((s) => contrast(colour(theme, s), colour(theme, "surface")));
      for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
    });
  }

  test("the accent is readable on both grounds in both themes", () => {
    for (const [, theme] of THEMES) {
      for (const ground of ["canvas", "surface"]) {
        expect(contrast(colour(theme, "accent"), colour(theme, ground))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("the link colour is readable on both grounds, and is not the accent", () => {
    for (const [, theme] of THEMES) {
      for (const ground of ["canvas", "surface"]) {
        expect(contrast(colour(theme, "link"), colour(theme, ground))).toBeGreaterThanOrEqual(4.5);
      }
      // Two published colours doing two jobs. If they converge, the selected page pill becomes
      // indistinguishable from an area tint, which is the confusion the second token exists to fix.
      expect(deltaE(colour(theme, "link"), colour(theme, "accent"))).toBeGreaterThan(20);
    }
  });
});

describe("status colour is supplementary, and never the only difference", () => {
  for (const [name, theme] of THEMES) {
    for (const s of STATUSES) {
      test(`${name}: ${s} reads on its own pill and on the page`, () => {
        const ink = colour(theme, `status-${s}-ink`);
        expect(contrast(ink, colour(theme, `status-${s}-bg`))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(ink, colour(theme, "surface"))).toBeGreaterThanOrEqual(4.5);
      });
    }

    test(`${name}: the six pill fills are distinguishable from the page and from each other`, () => {
      for (const s of STATUSES) {
        expect(deltaE(colour(theme, `status-${s}-bg`), colour(theme, "surface"))).toBeGreaterThan(3);
      }
      for (let i = 0; i < STATUSES.length; i++) {
        for (let j = i + 1; j < STATUSES.length; j++) {
          const d = deltaE(
            colour(theme, `status-${STATUSES[i]}-bg`),
            colour(theme, `status-${STATUSES[j]}-bg`),
          );
          expect(`${STATUSES[i]}~${STATUSES[j]} ${d > 3}`).toBe(`${STATUSES[i]}~${STATUSES[j]} true`);
        }
      }
    });

    test(`${name}: the six labels are distinguishable from one another`, () => {
      for (let i = 0; i < STATUSES.length; i++) {
        for (let j = i + 1; j < STATUSES.length; j++) {
          const d = deltaE(
            colour(theme, `status-${STATUSES[i]}-ink`),
            colour(theme, `status-${STATUSES[j]}-ink`),
          );
          expect(`${STATUSES[i]}~${STATUSES[j]} ${d > 12}`).toBe(`${STATUSES[i]}~${STATUSES[j]} true`);
        }
      }
    });
  }
});

describe("the six area colours survive both grounds", () => {
  for (const [name, theme] of THEMES) {
    test(`${name}: every area name is readable on the page`, () => {
      for (const n of AREAS) {
        expect(contrast(colour(theme, `area-${n}-ink`), colour(theme, "surface"))).toBeGreaterThanOrEqual(4.5);
      }
    });

    test(`${name}: the six area hues are distinguishable from one another`, () => {
      for (let i = 0; i < AREAS.length; i++) {
        for (let j = i + 1; j < AREAS.length; j++) {
          const d = deltaE(colour(theme, `area-${AREAS[i]}-ink`), colour(theme, `area-${AREAS[j]}-ink`));
          expect(`area-${AREAS[i]}~area-${AREAS[j]} ${d > 20}`).toBe(
            `area-${AREAS[i]}~area-${AREAS[j]} true`,
          );
        }
      }
    });

    /**
     * The hardest token in the set: the design-document line highlight is the one place in the
     * product where colour carries meaning at low opacity. A wash that reads against near-black is
     * frequently invisible against #f5f5f5, so both ends are chosen by hand and both are measured
     * here — visible against the ground, and separable from each other.
     */
    test(`${name}: every gutter wash is visible against the page and distinct from its neighbours`, () => {
      for (const n of AREAS) {
        const ratio = contrast(colour(theme, `area-${n}-gutter`), colour(theme, "surface"));
        expect(`area-${n} gutter ${ratio > 1.1}`).toBe(`area-${n} gutter true`);
      }
      for (let i = 0; i < AREAS.length; i++) {
        for (let j = i + 1; j < AREAS.length; j++) {
          const d = deltaE(
            colour(theme, `area-${AREAS[i]}-gutter`),
            colour(theme, `area-${AREAS[j]}-gutter`),
          );
          expect(`gutter ${AREAS[i]}~${AREAS[j]} ${d > 2}`).toBe(`gutter ${AREAS[i]}~${AREAS[j]} true`);
        }
      }
    });

    test(`${name}: a gutter wash never becomes a second ground`, () => {
      for (const n of AREAS) {
        // Ink must still read over the highlight, or a highlighted line becomes unreadable.
        expect(contrast(colour(theme, "ink"), colour(theme, `area-${n}-gutter`))).toBeGreaterThanOrEqual(7);
      }
    });
  }
});

describe("no raw colour token can enter shell-owned code", () => {
  /**
   * SHELL-010. The checker excludes itself the way scripts/audit/quality.mjs does, because the
   * patterns it forbids have to appear in it to be forbidden. That exclusion is exactly why the
   * planted-token probe recorded in VERIFICATION.md is planted in a DIFFERENT shell file.
   */
  const SELF = "tokens.test.ts";
  const files = [
    ...readdirSync(SHELL_DIR)
      .filter((f) => f !== SELF && /\.tsx?$/.test(f))
      .map((f) => ({ label: `shell/${f}`, text: readFileSync(join(SHELL_DIR, f), "utf8") })),
    { label: "main.tsx", text: readFileSync(join(CLIENT, "src/main.tsx"), "utf8") },
  ];

  // Built from fragments so this file does not contain the strings it bans, and so the ban is on
  // the class prefix rather than on any word that happens to contain it.
  const W = "white";
  const FORBIDDEN: [string, RegExp][] = [
    [`text-${W}`, new RegExp(`\\btext-${W}\\b`)],
    [`bg-${W}/`, new RegExp(`\\bbg-${W}/`)],
    [`border-${W}/`, new RegExp(`\\bborder-${W}/`)],
    [`divide-${W}/`, new RegExp(`\\bdivide-${W}/`)],
    ["bg-neutral-9", /\bbg-neutral-9/],
    ["a hex literal", /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/],
  ];

  test("the scan actually sees the shell's files", () => {
    expect(files.map((f) => f.label)).toContain("main.tsx");
    expect(files.filter((f) => f.label.startsWith("shell/")).length).toBeGreaterThan(1);
  });

  for (const { label, text } of files) {
    test(`${label} names no colour of its own`, () => {
      const found = FORBIDDEN.filter(([, re]) => re.test(text)).map(([name]) => name);
      expect(`${label}: ${found.join(", ")}`).toBe(`${label}: `);
    });
  }
});
