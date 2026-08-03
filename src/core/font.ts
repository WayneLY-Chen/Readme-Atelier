import opentype, { type Font } from "opentype.js";

const parseFont = opentype.parse;

/**
 * Fixed decimal-place precision for all path data emitted by this module.
 * RESEARCH.md Pitfall 3: this must be pinned in exactly this one place and
 * never exposed as a caller-configurable parameter, so no call site can
 * bypass it by calling opentype.js's Path.toPathData() directly.
 */
const PATH_DECIMAL_PLACES = 2;

export class UnknownFontError extends Error {
  constructor(name: string) {
    super(`UnknownFontError: no font has been registered under the name "${name}".`);
    this.name = "UnknownFontError";
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
  return font.getPath(text, x, y, fontSize).toPathData(PATH_DECIMAL_PLACES);
}
