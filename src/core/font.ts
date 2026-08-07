import opentype, { type Font } from "opentype.js";

const parseFont = opentype.parse;

/**
 * Fixed decimal-place precision for all path data emitted by this module.
 * RESEARCH.md Pitfall 3: this must be pinned in exactly this one place and
 * never exposed as a caller-configurable parameter, so no call site can
 * bypass it by calling opentype.js's Path.toPathData() directly.
 */
const PATH_DECIMAL_PLACES = 2;

/**
 * Defensive rounding applied to the (x, y) anchor passed into
 * font.getPath() — NOT the same knob as PATH_DECIMAL_PLACES, which governs
 * the *output* string's precision.
 *
 * Discovered during Task 2 (deviation, recorded in SUMMARY.md): a caller
 * that accumulates x positions via repeated floating-point addition (e.g.
 * letter-spacing math: cursorX += advanceWidth + spacing, character by
 * character) can produce a coordinate like 207.20000000000002 whose exact
 * float64 bit pattern triggers a reproducible opentype.js bug — confirmed
 * empirically: `font.getPath("U", 207.20000000000002, 82, 8).toPathData(2)`
 * emits a literal "NaN" into the path data for that one glyph, while
 * 207.2 (and a 2000-point fine scan of neighboring values) render clean.
 * The bug reproduces identically on both the subsetted and the full,
 * unsubsetted font, is deterministic per exact float64 value, is
 * unaffected by toPathData's optimize/kerning/features options, and
 * self-inspecting the raw Path.commands array afterward shows no NaN —
 * meaning the corruption happens inside opentype.js's internal path
 * construction for that specific bit pattern, not in anything this project
 * controls downstream. Rounding the input coordinate destroys the exact bit
 * pattern that triggers it without any visible effect at SVG scale.
 */
const INPUT_COORD_ROUNDING = 1000; // round to 3 decimal places

function roundCoord(value: number): number {
  return Math.round(value * INPUT_COORD_ROUNDING) / INPUT_COORD_ROUNDING;
}

/** Matches SVG path-data output: digits, M/L/C/Q/Z commands, decimal point,
 * spaces, and minus sign — see textToPathData's PathCorruptionError guard. */
const PATH_DATA_CHARSET = /^[MLCQZ0-9.,\-\s]*$/;

export class UnknownFontError extends Error {
  constructor(name: string) {
    super(`UnknownFontError: no font has been registered under the name "${name}".`);
    this.name = "UnknownFontError";
  }
}

export class PathCorruptionError extends Error {
  constructor(fontName: string, text: string, pathData: string) {
    super(
      `PathCorruptionError: textToPathData("${fontName}", ${JSON.stringify(text)}, ...) ` +
        `produced path data outside the valid SVG path-data character set: ${pathData}`,
    );
    this.name = "PathCorruptionError";
  }
}

/**
 * RENDER-05: engine-authored text (chrome strings, mapping-table phrases)
 * that contains a character outside a registered font's coverage is our own
 * bug, not a degrade-to-placeholder case (that's glyphPlaceholderPath's job,
 * for GitHub-API-sourced text on future cards) — 01-UI-SPEC.md's "Text slot
 * budgets" section is explicit that this must fail the build loudly.
 */
export class GlyphCoverageError extends Error {
  constructor(context: string, char: string) {
    super(`Card text exceeds glyph coverage: "${char}" in ${context}`);
    this.name = "GlyphCoverageError";
  }
}

const fontCache = new Map<string, Font>();

/**
 * Register a font under `name` for later lookup by measureAdvanceWidth() and
 * textToPathData(). This module never touches the filesystem — callers
 * (src/node/fonts.ts) are responsible for reading font bytes off disk and
 * handing them here as an ArrayBuffer.
 */
export function registerFont(name: string, buffer: ArrayBuffer): void {
  fontCache.set(name, parseFont(buffer));
}

function getRegisteredFont(name: string): Font {
  const font = fontCache.get(name);
  if (!font) {
    throw new UnknownFontError(name);
  }
  return font;
}

/**
 * Measure the horizontal advance width of `text` set in the font registered
 * under `name`, at `fontSize`. Returns 0 for an empty string without
 * consulting the font. opentype.js's own glyph tokenizer iterates by Unicode
 * code point (Array.from), so surrogate pairs and combining characters are
 * never split across glyph boundaries.
 */
export function measureAdvanceWidth(name: string, text: string, fontSize: number): number {
  if (text === "") {
    return 0;
  }
  const font = getRegisteredFont(name);
  return font.getAdvanceWidth(text, fontSize);
}

/**
 * Convert `text` to SVG path data (`d` attribute contents) using the font
 * registered under `name`, anchored at (x, y) with the given font size.
 * Returns an empty string for an empty string input without calling
 * font.getPath(). decimalPlaces is always PATH_DECIMAL_PLACES — it is never
 * exposed to callers.
 */
export function textToPathData(
  name: string,
  text: string,
  x: number,
  y: number,
  fontSize: number,
): string {
  if (text === "") {
    return "";
  }
  const font = getRegisteredFont(name);
  const pathData = font
    .getPath(text, roundCoord(x), roundCoord(y), fontSize)
    .toPathData(PATH_DECIMAL_PLACES);
  if (!PATH_DATA_CHARSET.test(pathData)) {
    throw new PathCorruptionError(name, text, pathData);
  }
  return pathData;
}

/**
 * RENDER-05 gate for engine-authored text: throws GlyphCoverageError on the
 * first character (left-to-right, by Unicode code point — same iteration
 * discipline as measureAdvanceWidth/textToPathData, so a multi-byte
 * character is never split mid-check) that the font registered under `name`
 * has no glyph for. `context` (e.g. "almanac title (zh-TW)") is threaded
 * into the error message so a build failure names the offending card
 * field, not just the character. A character resolving to glyph index 0
 * (opentype.js's .notdef sentinel) is treated as uncovered. Empty string
 * input returns immediately without consulting the font — there is nothing
 * to check.
 */
export function assertCoverage(fontName: string, text: string, context: string): void {
  if (text === "") {
    return;
  }
  const font = getRegisteredFont(fontName);
  for (const char of Array.from(text)) {
    if (font.charToGlyphIndex(char) === 0) {
      throw new GlyphCoverageError(context, char);
    }
  }
}

/**
 * UI-SPEC "Glyph Coverage Fallback": the chassis-level substitute markup for
 * a character outside a font's coverage (GitHub-API-sourced text on future
 * cards — Almanac's own content never exercises this branch, see
 * 01-UI-SPEC.md's `glyph-placeholder` surface). Returns a rounded-rectangle
 * outline (corner radius 1) with a centered 2x2-unit solid dot, plus the
 * advance width the caller should reserve so the rest of the text run isn't
 * shifted by the substitution.
 *
 * advanceWidth is fontSize * 0.7 — a fixed *proportion* of the current run's
 * em-size (UI-SPEC: "sized to 70% of the em-height"), not a hardcoded
 * absolute width (it scales with fontSize like any other glyph's advance
 * would) and not a font-metrics lookup: the character being replaced is by
 * definition not in the font's coverage, so there is nothing in that font to
 * measure. `fontName` is accepted (and unused today) so a future revision
 * can vary the placeholder's proportions per script without an API change.
 */
export function glyphPlaceholderPath(
  _fontName: string,
  _char: string,
  x: number,
  y: number,
  fontSize: number,
): { path: string; advanceWidth: number } {
  const advanceWidth = fontSize * 0.7;
  const cornerRadius = 1;
  const left = x;
  const right = x + advanceWidth;
  const top = y - advanceWidth / 2;
  const bottom = y + advanceWidth / 2;
  const r = cornerRadius;

  const box =
    `M${left + r},${top} L${right - r},${top} A${r},${r} 0 0 1 ${right},${top + r} ` +
    `L${right},${bottom - r} A${r},${r} 0 0 1 ${right - r},${bottom} ` +
    `L${left + r},${bottom} A${r},${r} 0 0 1 ${left},${bottom - r} ` +
    `L${left},${top + r} A${r},${r} 0 0 1 ${left + r},${top} Z`;

  const cx = x + advanceWidth / 2;
  const cy = y;
  const dot = `M${cx - 1},${cy - 1} L${cx + 1},${cy - 1} L${cx + 1},${cy + 1} L${cx - 1},${cy + 1} Z`;

  return { path: `${box} ${dot}`, advanceWidth };
}
