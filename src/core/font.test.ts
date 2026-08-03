import { readFileSync } from "node:fs";
import path from "node:path";
import subsetFont from "subset-font";
import { beforeAll, describe, expect, it } from "vitest";
import { measureAdvanceWidth, registerFont, textToPathData, UnknownFontError } from "./font.js";

const FONT_NAME = "test-mono";
const SOURCE_FILE = path.join(
  "node_modules",
  "@fontsource",
  "ibm-plex-mono",
  "files",
  "ibm-plex-mono-latin-400-normal.woff2",
);

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

beforeAll(async () => {
  const originalBuffer = readFileSync(SOURCE_FILE);
  const asciiPrintable = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) =>
    String.fromCharCode(0x20 + i),
  ).join("");
  const subsetBuffer = await subsetFont(originalBuffer, asciiPrintable, {
    targetFormat: "sfnt",
  });
  registerFont(FONT_NAME, toArrayBuffer(subsetBuffer));
});

describe("core/font", () => {
  it("throws UnknownFontError for an unregistered font name", () => {
    expect(() => measureAdvanceWidth("does-not-exist", "A", 44)).toThrow(UnknownFontError);
    expect(() => textToPathData("does-not-exist", "A", 0, 0, 44)).toThrow(UnknownFontError);
  });

  it("measureAdvanceWidth returns a positive number for a registered font and non-empty text", () => {
    expect(measureAdvanceWidth(FONT_NAME, "A", 44)).toBeGreaterThan(0);
  });

  it("measureAdvanceWidth returns 0 for empty string without throwing", () => {
    expect(measureAdvanceWidth(FONT_NAME, "", 44)).toBe(0);
  });

  it("textToPathData returns an empty string for empty string input", () => {
    expect(textToPathData(FONT_NAME, "", 0, 0, 44)).toBe("");
  });

  it("textToPathData returns only SVG path-data characters, with decimalPlaces fixed at 2", () => {
    const d = textToPathData(FONT_NAME, "02", 100, 150, 44);
    expect(d.length).toBeGreaterThan(0);
    expect(d).toMatch(/^[MLCQZ0-9.,\-\s]+$/);
    const decimals = d.match(/\.\d+/g) ?? [];
    for (const fraction of decimals) {
      expect(fraction.length - 1).toBeLessThanOrEqual(2);
    }
  });

  it("textToPathData is a pure function: repeated calls with identical args produce byte-identical output", () => {
    const a = textToPathData(FONT_NAME, "readme-atelier", 10, 20, 44);
    const b = textToPathData(FONT_NAME, "readme-atelier", 10, 20, 44);
    expect(a).toBe(b);
  });

  it("does not truncate a surrogate-pair code point mid-character", () => {
    // U+1F600 GRINNING FACE is a UTF-16 surrogate pair (2 code units, 1 code
    // point). The registered font almost certainly has no glyph for it and
    // falls back to .notdef, but the call must not throw or silently corrupt
    // the surrounding ASCII characters.
    const text = "A\u{1F600}B";
    expect(Array.from(text)).toHaveLength(3);
    expect(text.length).toBe(4);

    expect(() => textToPathData(FONT_NAME, text, 0, 0, 44)).not.toThrow();
    expect(() => measureAdvanceWidth(FONT_NAME, text, 44)).not.toThrow();
    expect(measureAdvanceWidth(FONT_NAME, text, 44)).toBeGreaterThan(0);
  });
});
