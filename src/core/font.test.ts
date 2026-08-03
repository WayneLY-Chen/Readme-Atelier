import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import subsetFont from "subset-font";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertCoverage,
  GlyphCoverageError,
  glyphPlaceholderPath,
  measureAdvanceWidth,
  registerFont,
  textToPathData,
  UnknownFontError,
} from "./font.js";

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

describe("Plan 02 Task 1: Source Serif 4 + Noto Serif TC subset fonts", () => {
  // These assert against the real, already-built assets/fonts/*.subset.ttf
  // committed by `npm run build:fonts` (Pitfall 1 self-verification, the
  // same style of check Plan 01 wrote for IBM Plex Mono) — not against a
  // freshly-subsetted fixture, since these two files are themselves the
  // artifact under test.
  it("assets/fonts/source-serif-4.subset.ttf is parseable and non-empty", () => {
    const buffer = readFileSync(path.join("assets", "fonts", "source-serif-4.subset.ttf"));
    const font = opentype.parse(toArrayBuffer(buffer));
    expect(font.numGlyphs).toBeGreaterThan(0);
    registerFont("test-serif", toArrayBuffer(buffer));
    expect(measureAdvanceWidth("test-serif", "AV", 44)).toBeGreaterThan(0);
  });

  it("assets/fonts/noto-serif-tc.subset.ttf is parseable and non-empty", () => {
    const buffer = readFileSync(path.join("assets", "fonts", "noto-serif-tc.subset.ttf"));
    const font = opentype.parse(toArrayBuffer(buffer));
    expect(font.numGlyphs).toBeGreaterThan(0);
    registerFont("test-noto-tc", toArrayBuffer(buffer));
    expect(measureAdvanceWidth("test-noto-tc", "中文", 17)).toBeGreaterThan(0);
    // The merged-in fullwidth colon (see scripts/build-fonts.ts's
    // mergeSupplementalPunctuation) must be a real glyph, not .notdef.
    expect(font.charToGlyphIndex("：")).toBeGreaterThan(0);
  });
});

describe("Plan 02 Task 2: assertCoverage + glyphPlaceholderPath", () => {
  const COVERAGE_FONT = "test-coverage-noto-tc";

  beforeAll(() => {
    const buffer = readFileSync(path.join("assets", "fonts", "noto-serif-tc.subset.ttf"));
    registerFont(COVERAGE_FONT, toArrayBuffer(buffer));
  });

  it("assertCoverage does not throw for a fully-covered string", () => {
    expect(() => assertCoverage(COVERAGE_FONT, "正常中文", "title")).not.toThrow();
  });

  it("assertCoverage does not throw for an empty string, and does not consult the font", () => {
    expect(() => assertCoverage("does-not-exist", "", "title")).not.toThrow();
  });

  it("assertCoverage throws GlyphCoverageError naming the context and the out-of-coverage character", () => {
    // U+D55C (한, Hangul) is outside D-03's coverage set (no Hangul).
    let caught: unknown;
    try {
      assertCoverage(COVERAGE_FONT, "正한常", "title");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GlyphCoverageError);
    const message = (caught as Error).message;
    expect(message).toContain("title");
    expect(message).toContain("한");
  });

  it("assertCoverage reports only the first out-of-coverage character (left to right), not the second", () => {
    // Two distinct out-of-coverage characters: 한 (Hangul) then み (kana).
    let caught: unknown;
    try {
      assertCoverage(COVERAGE_FONT, "한正み", "title");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GlyphCoverageError);
    const message = (caught as Error).message;
    expect(message).toContain("한");
    expect(message).not.toContain("み");
  });

  it("glyphPlaceholderPath returns a positive, finite advanceWidth proportional to fontSize (not a fixed constant)", () => {
    const small = glyphPlaceholderPath("serif", "X", 10, 20, 17);
    const large = glyphPlaceholderPath("serif", "X", 10, 20, 44);
    expect(small.advanceWidth).toBeGreaterThan(0);
    expect(Number.isFinite(small.advanceWidth)).toBe(true);
    expect(small.advanceWidth).toBeCloseTo(17 * 0.7, 5);
    expect(large.advanceWidth).toBeCloseTo(44 * 0.7, 5);
    expect(large.advanceWidth).toBeGreaterThan(small.advanceWidth);
  });

  it("glyphPlaceholderPath does not depend on the font actually having a glyph for `char`", () => {
    // "does-not-exist" is not a registered font at all, yet this must not throw
    // — the whole point of the placeholder is for characters/fonts that
    // can't otherwise resolve a real glyph.
    expect(() => glyphPlaceholderPath("does-not-exist", "한", 0, 0, 17)).not.toThrow();
    const { path: d } = glyphPlaceholderPath("does-not-exist", "한", 0, 0, 17);
    expect(d.length).toBeGreaterThan(0);
  });
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
