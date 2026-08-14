import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph } from "../../core/font.js";
import { loadAllFonts } from "../../node/fonts.js";
import { formatStatNumber } from "../editorial-stat-card/format.js";
import {
  busiestWeekLabelEn,
  busiestWeekLabelZh,
  busiestWeekValueEn,
  busiestWeekValueZh,
  chromeEn,
  chromeZh,
  mastheadEyebrowZh,
  needleCaptionEn,
  needleCaptionZh,
  noneValueEn,
  noneValueZh,
  pageFooterEn,
  pageFooterZh,
  silentWeeksLabelEn,
  silentWeeksLabelZh,
  silentWeeksValue,
  totalLabelEn,
  totalLabelZh,
  weeksPressedLabelEn,
  weeksPressedLabelZh,
  weeksPressedValue,
  zeroCaptionEn,
  zeroCaptionZh,
} from "./copy.js";
import { assertSlotBudget, formatRecordNumber, RecordSlotOverflowError } from "./format.js";

beforeAll(() => {
  loadAllFonts();
});

// Shared value table (04-UI-SPEC.md "Number formatting" / this plan's own
// Task 1 requirement): both formatters must agree on every one of these,
// in both languages, proving the deliberate RENDER-02 duplication has not
// silently diverged.
const VALUE_TABLE = [0, 1, 999, 9999, 10000, 12345, 1234567];

describe("formatRecordNumber — agrees with editorial-stat-card's formatStatNumber (RENDER-02 duplication proof)", () => {
  it.each(VALUE_TABLE)("value=%i: en output matches", (value) => {
    expect(formatRecordNumber(value, "en")).toBe(formatStatNumber(value, "en"));
  });

  it.each(VALUE_TABLE)("value=%i: zh-TW output matches", (value) => {
    expect(formatRecordNumber(value, "zh-TW")).toBe(formatStatNumber(value, "zh-TW"));
  });
});

describe("assertSlotBudget — fail-loud slot-width backstop", () => {
  it("throws RecordSlotOverflowError when the measured width exceeds the budget", () => {
    expect(() => assertSlotBudget("needle caption", "…", 200, 170)).toThrow(RecordSlotOverflowError);
  });

  it("the thrown message names the field, the formatted string, the measured width, and the budget", () => {
    try {
      assertSlotBudget("needle caption", "…", 200, 170);
      expect.fail("expected assertSlotBudget to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(RecordSlotOverflowError);
      const message = (err as Error).message;
      expect(message).toContain("needle caption");
      expect(message).toContain("…");
      expect(message).toContain("200");
      expect(message).toContain("170");
    }
  });

  it("returns silently when the measured width is within budget", () => {
    expect(() => assertSlotBudget("needle caption", "ok", 100, 170)).not.toThrow();
  });
});

// UI-SPEC "Glyph coverage — verified, not assumed" (Pitfall 4): every
// string copy.ts exports must be covered by the font it will actually
// render in. This is the Task 1-scoped check over copy.ts's own exports;
// index.test.ts's Task 3 glyph-coverage test additionally covers the
// describe()/desc strings and the digit/separator characters emitted at
// render time.
const ALL_COPY_STRINGS_EN: string[] = [
  chromeEn.title,
  totalLabelEn,
  weeksPressedLabelEn,
  busiestWeekLabelEn,
  silentWeeksLabelEn,
  noneValueEn,
  needleCaptionEn,
  zeroCaptionEn,
  weeksPressedValue(33, 53),
  busiestWeekValueEn(23, "142"),
  silentWeeksValue(12),
  pageFooterEn(4, 4),
];

const ALL_COPY_STRINGS_ZH: string[] = [
  chromeZh.title,
  mastheadEyebrowZh,
  totalLabelZh,
  weeksPressedLabelZh,
  busiestWeekLabelZh,
  silentWeeksLabelZh,
  noneValueZh,
  needleCaptionZh,
  zeroCaptionZh,
  weeksPressedValue(33, 53),
  busiestWeekValueZh(23, "142"),
  silentWeeksValue(12),
  pageFooterZh(4, 4),
];

describe("copy.ts — glyph coverage against the real bundled font subsets (Pitfall 4)", () => {
  it("every en copy string's characters are covered by mono-semibold or serif", () => {
    for (const str of ALL_COPY_STRINGS_EN) {
      for (const char of Array.from(str)) {
        const covered = hasGlyph("mono-semibold", char) || hasGlyph("serif", char);
        expect(covered, `"${char}" in "${str}" (en)`).toBe(true);
      }
    }
  });

  it("every zh-TW copy string's characters are covered by mono-semibold or noto-tc", () => {
    for (const str of ALL_COPY_STRINGS_ZH) {
      for (const char of Array.from(str)) {
        const covered = hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char);
        expect(covered, `"${char}" in "${str}" (zh-TW)`).toBe(true);
      }
    }
  });
});
