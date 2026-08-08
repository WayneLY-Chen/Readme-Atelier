import { beforeAll, describe, expect, it } from "vitest";
import { measureAdvanceWidth } from "../../core/font.js";
import { loadAllFonts } from "../../node/fonts.js";
import { assertColumnBudget, COLUMN_BUDGET_PX, formatStatNumber, StatOverflowError } from "./format.js";

beforeAll(() => {
  loadAllFonts();
});

describe("formatStatNumber — Number Formatting Contract (02-UI-SPEC.md)", () => {
  it("D-09: 0 renders as plain '0' in both languages", () => {
    expect(formatStatNumber(0, "en")).toBe("0");
    expect(formatStatNumber(0, "zh-TW")).toBe("0");
  });

  it("0 <= n < 10000 renders as the exact integer, no separator, both languages", () => {
    expect(formatStatNumber(42, "en")).toBe("42");
    expect(formatStatNumber(42, "zh-TW")).toBe("42");
    expect(formatStatNumber(9999, "en")).toBe("9999");
    expect(formatStatNumber(9999, "zh-TW")).toBe("9999");
  });

  it("en: n >= 10000 uses Intl compact notation (K/M)", () => {
    const result = formatStatNumber(10000, "en");
    expect(result).toMatch(/^\d+(\.\d)?[KM]$/);
    expect(formatStatNumber(12345, "en")).toBe("12.3K");
  });

  it("en compact notation round-trips to the same order of magnitude", () => {
    const formatted = formatStatNumber(1234567, "en");
    expect(formatted).toMatch(/^\d+(\.\d)?[KM]$/);
    // "1.2M" -> 1200000, same order of magnitude as 1234567 (both ~10^6).
    const numeric = parseFloat(formatted);
    const multiplier = formatted.endsWith("M") ? 1_000_000 : 1_000;
    expect(Math.round(Math.log10(numeric * multiplier))).toBe(Math.round(Math.log10(1234567)));
  });

  it("zh-TW: 10000 <= n < 100,000,000 renders as {value/10000 to 1 decimal}萬", () => {
    expect(formatStatNumber(10000, "zh-TW")).toBe("1.0萬");
    expect(formatStatNumber(12345, "zh-TW")).toBe("1.2萬");
  });

  it("zh-TW: n >= 100,000,000 renders as {value/100000000 to 1 decimal}億", () => {
    expect(formatStatNumber(100000000, "zh-TW")).toBe("1.0億");
  });

  it("zh-TW boundary values: 9999/10000 and 99999999/100000000", () => {
    expect(formatStatNumber(9999, "zh-TW")).toBe("9999");
    expect(formatStatNumber(10000, "zh-TW")).toBe("1.0萬");
    expect(formatStatNumber(99999999, "zh-TW")).toBe("10000.0萬");
    expect(formatStatNumber(100000000, "zh-TW")).toBe("1.0億");
  });

  it("en boundary values: 9999/10000", () => {
    expect(formatStatNumber(9999, "en")).toBe("9999");
    expect(formatStatNumber(10000, "en")).toMatch(/^\d+(\.\d)?[KM]$/);
  });
});

describe("assertColumnBudget — per-render 138px column-width backstop (T-02-05)", () => {
  it("a normally-formatted en value does not throw", () => {
    expect(() => assertColumnBudget("999.9K", "en", "stars")).not.toThrow();
  });

  it("a deliberately over-budget string throws StatOverflowError naming field, string, width, and budget", () => {
    let caught: unknown;
    try {
      assertColumnBudget("9999999.9K", "en", "stars");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StatOverflowError);
    const message = (caught as Error).message;
    expect(message).toContain("stars");
    expect(message).toContain("9999999.9K");
    expect(message).toContain(String(COLUMN_BUDGET_PX));
    // The measured width itself must also appear in the message, distinct
    // from the budget value.
    const widthMatch = message.match(/measures ([\d.]+)px/);
    expect(widthMatch).not.toBeNull();
    expect(Number(widthMatch?.[1])).toBeGreaterThan(COLUMN_BUDGET_PX);
  });

  it("zh-TW 萬/億 suffix width is computed as two separate glyph runs, not one same-font-size run", () => {
    const formatted = "1.2萬";
    // Should not throw for a realistic value.
    expect(() => assertColumnBudget(formatted, "zh-TW", "commits")).not.toThrow();

    // Prove the split-measurement methodology actually differs from a
    // naive whole-string same-font measurement — if these were equal, the
    // "two segments, two fonts" implementation detail wouldn't be
    // meaningfully verified by the above non-throw assertion alone.
    const wholeStringMonoWidth = measureAdvanceWidth("mono-semibold", formatted, 32);
    const splitWidth =
      measureAdvanceWidth("mono-semibold", "1.2", 32) + measureAdvanceWidth("noto-tc", "萬", 32 * 0.92);
    expect(splitWidth).not.toBeCloseTo(wholeStringMonoWidth, 1);
  });

  it("a deliberately over-budget zh-TW 萬-suffixed string also throws", () => {
    expect(() => assertColumnBudget("99999.9萬", "zh-TW", "followers")).toThrow(StatOverflowError);
  });
});
