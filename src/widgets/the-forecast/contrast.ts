import type { Theme } from "../../core/model.js";

/**
 * WCAG 2.x relative-luminance contrast arithmetic (06-UI-SPEC.md "Rule C-2 —
 * the numeral fill is decided by contrast, not by symbolism"). Self-contained
 * (~15 lines of real arithmetic): hex -> sRGB channel -> linearize -> relative
 * luminance `L = 0.2126R + 0.7152G + 0.0722B` -> ratio `(L1+0.05)/(L2+0.05)`
 * with the lighter luminance always in the numerator.
 *
 * This is the project's FIRST widget-side contrast computation
 * (06-PATTERNS.md "No Analog Found" — nothing in `src/core/` or any shipped
 * widget computes contrast; `src/core/theme.ts` only records in a comment
 * that its palettes were "WCAG-contrast-verified", with the conclusion
 * hardcoded, never computed). Deliberately kept in `src/widgets/the-forecast/`
 * and NOT extracted to `src/core/` — 06-UI-SPEC.md Watch Item B names this
 * "the strongest future core-primitive candidate in the batch" and instructs:
 * count it as copy #1, do not extract it. A SECOND card needing this
 * arithmetic is the signal to propose `core/contrast.ts`; that signal has not
 * happened yet.
 */

/** sRGB gamma decode of a single 0-255 channel value to its linear-light
 * equivalent, per the WCAG 2.x relative-luminance formula. */
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/** WCAG 2.x relative luminance of a `#RRGGBB` hex color. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const rLin = srgbChannelToLinear(r);
  const gLin = srgbChannelToLinear(g);
  const bLin = srgbChannelToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * WCAG 2.x contrast ratio between two `#RRGGBB` colors, symmetric in its two
 * arguments (the lighter of the pair's relative luminance always ends up in
 * the numerator, regardless of argument order). `contrastRatio("#FFFFFF",
 * "#000000") === 21` (the WCAG-defined maximum).
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface NumeralFillResult {
  fill: string;
  source: "muted" | "ink";
  ratio: number;
}

/**
 * Rule C-2's contrast fallback: `numeralFill = contrastRatio(theme.muted,
 * theme.paper) >= 4.5 ? theme.muted : theme.ink`. Reads the theme's own hex
 * VALUES, never `theme.mode` — this is what keeps the light/dark structural
 * invariant intact (`renderPair` still calls `renderBody` twice with only
 * `Theme` differing, and the widget still cannot ask which of the two calls
 * it is in) and keeps the result byte-stable per theme (QA-02 snapshot
 * safety), while still answering a real, deterministic question about the
 * palette it was handed. Measured 2026-08-28 against all five shipped theme
 * entries (V-05, pinned by a named unit test in `contrast.test.ts`):
 * editorial light 5.80, editorial dark 5.55, nord 9.25 -> `muted`; dracula
 * 3.03, tokyonight 2.76 -> falls back to `ink`.
 */
export function numeralFillFor(theme: Theme): NumeralFillResult {
  const ratio = contrastRatio(theme.muted, theme.paper);
  if (ratio >= 4.5) {
    return { fill: theme.muted, source: "muted", ratio };
  }
  return { fill: theme.ink, source: "ink", ratio };
}
