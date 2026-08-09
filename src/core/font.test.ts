import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import subsetFont from "subset-font";
import { beforeAll, describe, expect, it } from "vitest";
import {
  apiSourcedTextPathData,
  assertCoverage,
  GlyphCoverageError,
  glyphPlaceholderPath,
  hasGlyph,
  measureAdvanceWidth,
  registerFont,
  textToPathData,
  truncateToWidth,
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

describe("Regression (2026-08-09 production incident): multi-character PathCorruptionError", () => {
  // Almanac's 危 忌 line ("忌：直接改 production 資料", core/font.ts's
  // CORRUPTION_RETRY_OFFSETS comment) shipped a corrupted SVG path in
  // production: roundCoord only sanitizes the *starting* anchor of a
  // getPath() call, but opentype.js accumulates every subsequent glyph's
  // cursor position internally in unrounded floating point, and that
  // internal accumulation landed on the same poisoned-float64-bit-pattern
  // class the anchor rounding was originally built to dodge — 10 characters
  // into the string, at the "d" in "production", with the exact fixed
  // x=24/y=215/fontSize=17 the real card uses. This pins that exact
  // real-world input against the real committed font asset.
  const COVERAGE_FONT = "test-corruption-noto-tc";

  beforeAll(() => {
    const buffer = readFileSync(path.join("assets", "fonts", "noto-serif-tc.subset.ttf"));
    registerFont(COVERAGE_FONT, toArrayBuffer(buffer));
  });

  it("does not throw for the exact string/coordinates that corrupted in production", () => {
    const text = "忌：直接改 production 資料";
    let result = "";
    expect(() => {
      result = textToPathData(COVERAGE_FONT, text, 24, 215, 17);
    }).not.toThrow();
    expect(result).toMatch(/^[MLCQZ0-9.,\-\s]+$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("is still a pure function after the retry ladder: identical inputs produce byte-identical output", () => {
    const text = "忌：直接改 production 資料";
    const a = textToPathData(COVERAGE_FONT, text, 24, 215, 17);
    const b = textToPathData(COVERAGE_FONT, text, 24, 215, 17);
    expect(a).toBe(b);
  });
});

describe("Plan 03-01 Task 2: hasGlyph / truncateToWidth / apiSourcedTextPathData (API-Sourced Text)", () => {
  const MONO_SUBSET = "test-mono-semibold-t2";

  beforeAll(() => {
    const buffer = readFileSync(path.join("assets", "fonts", "ibm-plex-mono-semibold.subset.ttf"));
    registerFont(MONO_SUBSET, toArrayBuffer(buffer));
  });

  describe("hasGlyph", () => {
    it("is true for a character within the font's subset", () => {
      expect(hasGlyph(MONO_SUBSET, "a")).toBe(true);
    });

    it("is false for a character the build-time subset policy excludes (U+00B7 MIDDLE DOT — outside ASCII-printable)", () => {
      expect(hasGlyph(MONO_SUBSET, "·")).toBe(false);
    });
  });

  describe("truncateToWidth", () => {
    it("returns the original string unchanged when it already fits the budget", () => {
      expect(truncateToWidth(MONO_SUBSET, "short", 8, 999)).toBe("short");
    });

    it("trims and appends a literal three-period ellipsis when the string overflows its budget", () => {
      const long = "a-very-long-github-username-example";
      const result = truncateToWidth(MONO_SUBSET, long, 8, 40);
      expect(result.endsWith("...")).toBe(true);
      expect(result.length).toBeLessThan(long.length);
      expect(measureAdvanceWidth(MONO_SUBSET, result, 8)).toBeLessThanOrEqual(40);
    });

    it("returns the literal ellipsis (not an exception or empty string) for a budget too narrow even for the ellipsis alone", () => {
      const long = "a-very-long-github-username-example";
      expect(() => truncateToWidth(MONO_SUBSET, long, 8, 1)).not.toThrow();
      expect(truncateToWidth(MONO_SUBSET, long, 8, 1)).toBe("...");
    });
  });

  describe("apiSourcedTextPathData", () => {
    it("for a fully-covered string, advances the cursor the same total distance as measureAdvanceWidth reports", () => {
      const text = "octocat";
      const d = apiSourcedTextPathData(MONO_SUBSET, text, 0, 0, 8);
      expect(d.length).toBeGreaterThan(0);
      // Structural equivalence with letterSpacedPath-style (no extra
      // spacing) advance: re-measuring the same text with the font's own
      // metrics must match the width apiSourcedTextPathData's internal
      // cursor accumulates to (verified indirectly: rendering at a shifted
      // x by that exact width must produce byte-identical path data to
      // continuing the run from there).
      const widthSoFar = measureAdvanceWidth(MONO_SUBSET, text, 8);
      const continued = apiSourcedTextPathData(MONO_SUBSET, "!", widthSoFar, 0, 8);
      const combined = apiSourcedTextPathData(MONO_SUBSET, text + "!", 0, 0, 8);
      expect(combined).toBe(d + continued);
    });

    it("does not throw GlyphCoverageError for a mix of covered and uncovered characters, and substitutes a placeholder for the uncovered one", () => {
      // U+00B7 is outside this subset's coverage (see hasGlyph test above).
      const text = "ab·cd";
      let result = "";
      expect(() => {
        result = apiSourcedTextPathData(MONO_SUBSET, text, 0, 0, 8);
      }).not.toThrow();
      expect(result.length).toBeGreaterThan(0);

      // The placeholder path (a rounded-rect outline + centered dot) is
      // present: compare against glyphPlaceholderPath's own output shape by
      // confirming a bare single-uncovered-character call produces the
      // exact same path fragment glyphPlaceholderPath returns for it at the
      // relevant cursor position.
      const beforeWidth = measureAdvanceWidth(MONO_SUBSET, "ab", 8);
      const { path: placeholderPath } = glyphPlaceholderPath(MONO_SUBSET, "·", beforeWidth, 0, 8);
      expect(result).toContain(placeholderPath);
    });
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
