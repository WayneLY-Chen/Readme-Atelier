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

/**
 * Deterministic retry ladder for the opentype.js bug described above
 * roundCoord. roundCoord only sanitizes the *starting* anchor passed into
 * font.getPath() — for a multi-character call (every real card string; only
 * letterSpacedPath-style manual per-character callers get roundCoord applied
 * on every glyph) opentype.js accumulates each subsequent glyph's cursor
 * position internally, in unrounded floating point, and that internal
 * accumulation can independently land on the same class of poisoned float64
 * bit pattern for a glyph anywhere in the string — confirmed in production
 * (2026-08-09): Almanac's 危 忌 line, "忌：直接改 production 資料" at the
 * card's fixed x=24, corrupts starting at the "d" in "production" (10th
 * character) even though x=24 itself is already an integer. Since the bug is
 * exact-value-specific, shifting the whole run's starting x by a tiny,
 * sub-visual offset changes every downstream glyph's accumulated position
 * and reliably escapes the poisoned value — empirically, the real-world case
 * above was still corrupt at x=24±0.001 and x=24±0.002 but clean by
 * x=24±0.003, so this ladder carries margin past that. Order tries the
 * unmodified anchor first so the overwhelming majority of calls (which never
 * hit this bug) pay zero extra cost.
 */
const CORRUPTION_RETRY_OFFSETS = [0, 0.001, -0.001, 0.002, -0.002, 0.003, -0.003, 0.005, -0.005, 0.01, -0.01, 0.02, -0.02];

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
  const roundedX = roundCoord(x);
  const roundedY = roundCoord(y);
  let pathData = "";
  for (const offset of CORRUPTION_RETRY_OFFSETS) {
    pathData = font
      .getPath(text, roundCoord(roundedX + offset), roundedY, fontSize)
      .toPathData(PATH_DECIMAL_PLACES);
    if (PATH_DATA_CHARSET.test(pathData)) {
      return pathData;
    }
  }
  throw new PathCorruptionError(name, text, pathData);
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

/**
 * Whether the font registered under `name` has a real glyph (not the
 * `.notdef` sentinel, glyph index 0) for `char`. Extracted as its own
 * reusable export (Phase 3, MAST-01/CARD-03) from the same check
 * `assertCoverage`'s internal loop already performs — `assertCoverage`
 * itself is deliberately left as an independent implementation rather than
 * rewritten to call this, so the already-shipped, already-tested
 * fail-loud path for engine-authored text is never touched by this addition.
 */
export function hasGlyph(fontName: string, char: string): boolean {
  const font = getRegisteredFont(fontName);
  return font.charToGlyphIndex(char) !== 0;
}

/** Three literal ASCII periods — UI-SPEC "API-Sourced Text: Truncation
 * Policy": deliberately NOT the single Unicode ellipsis glyph (U+2026), to
 * avoid certifying a new punctuation mark's glyph coverage just for this. */
const ELLIPSIS = "...";

/**
 * UI-SPEC "API-Sourced Text: Truncation Policy" (Phase 3): degrade
 * GitHub-API-sourced text (a login, a repo name) that overflows its slot's
 * width budget by trimming from the end and appending a literal `"..."`,
 * rather than failing the build (RENDER-05's fail-loud policy is reserved
 * for engine-authored text, which this is not — the offending string is the
 * end user's own prior naming choice, not a copy bug within engine control).
 *
 * Returns `text` unchanged if it already fits. Otherwise trims by Unicode
 * code point (never splitting a surrogate pair) until
 * `measured(trimmed + "...") <= budgetPx`, returning the first fit found
 * starting from the full length and working down. If even the bare
 * ellipsis alone does not fit an extremely narrow budget, returns the
 * literal `"..."` rather than throwing or returning an empty string — a
 * truncation policy that itself can fail the build would defeat UX-06's
 * whole "degrade gracefully" purpose.
 */
export function truncateToWidth(
  fontName: string,
  text: string,
  fontSize: number,
  budgetPx: number,
): string {
  if (measureAdvanceWidth(fontName, text, fontSize) <= budgetPx) {
    return text;
  }

  const chars = Array.from(text);
  for (let end = chars.length; end > 0; end--) {
    const candidate = chars.slice(0, end).join("") + ELLIPSIS;
    if (measureAdvanceWidth(fontName, candidate, fontSize) <= budgetPx) {
      return candidate;
    }
  }
  return ELLIPSIS;
}

/**
 * Convert API-sourced `text` (a GitHub login, a repo name) to SVG path data,
 * substituting `glyphPlaceholderPath`'s designed fallback glyph for any
 * character outside `fontName`'s coverage instead of throwing.
 *
 * Deliberately does NOT call `assertCoverage` — that is RENDER-05's hard
 * build-failure gate reserved for engine-authored text (chrome strings,
 * copy tables), a semantically different, mutually exclusive path from this
 * one. Mixing the two would make API-sourced text also fail the build the
 * moment a GitHub user's own name/login contains an out-of-coverage
 * character, which is exactly the failure mode UX-06's "degrade gracefully"
 * contract exists to prevent.
 */
export function apiSourcedTextPathData(
  fontName: string,
  text: string,
  x: number,
  y: number,
  fontSize: number,
): string {
  let cursorX = x;
  let d = "";
  for (const char of Array.from(text)) {
    if (hasGlyph(fontName, char)) {
      d += textToPathData(fontName, char, cursorX, y, fontSize);
      cursorX += measureAdvanceWidth(fontName, char, fontSize);
    } else {
      const placeholder = glyphPlaceholderPath(fontName, char, cursorX, y, fontSize);
      d += placeholder.path;
      cursorX += placeholder.advanceWidth;
    }
  }
  return d;
}
