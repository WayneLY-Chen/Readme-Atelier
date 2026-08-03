import { Solar } from "lunar-typescript";
import { describe, expect, it } from "vitest";
import { ganZhiToEnglish, yijiTableEn } from "./copy.js";

describe("yijiTableEn totality (UI-SPEC almanac-yiji 'error' row)", () => {
  it("has an entry for every zhiXing value lunar-typescript actually returns", () => {
    // Scan enough consecutive days to be certain all 12 建除神 values in the
    // 12-day repeating cycle appear at least once, rather than assuming the
    // Traditional-Chinese characters from 01-UI-SPEC.md's table match this
    // library's runtime output (they don't for four of the twelve — see the
    // deviation note in copy.ts; this test is the regression guard for that
    // exact bug: a wrong/Traditional key here previously caused
    // `Almanac: no 宜/忌 mapping for zhiXing "..."` to throw for real dates).
    const seen = new Set<string>();
    for (let d = 0; d < 400; d++) {
      const date = new Date(2020, 0, 1 + d);
      seen.add(Solar.fromDate(date).getLunar().getZhiXing());
    }

    expect(seen.size).toBe(12);
    for (const zhiXing of seen) {
      const entry = yijiTableEn[zhiXing];
      expect(entry, `missing yijiTableEn entry for zhiXing "${zhiXing}"`).toBeDefined();
      expect(entry.auspicious.length).toBeGreaterThan(0);
      expect(entry.avoid.length).toBeGreaterThan(0);
    }
  });
});

describe("ganZhiToEnglish", () => {
  it("translates a 干支 pair to '{Element} {Animal}' (D-08 example: 甲子 -> Wood Rat)", () => {
    expect(ganZhiToEnglish("甲子")).toBe("Wood Rat");
  });

  it("throws for an unrecognized 干支 value", () => {
    expect(() => ganZhiToEnglish("??")).toThrow(/unrecognized/);
  });
});
