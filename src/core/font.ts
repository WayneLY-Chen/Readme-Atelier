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
