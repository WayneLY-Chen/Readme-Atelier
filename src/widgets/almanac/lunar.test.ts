import { describe, expect, it } from "vitest";
import { getAlmanacContent, LunarRangeError } from "./lunar.js";

describe("getAlmanacContent", () => {
  it("computes correct Gregorian fields for a known UTC instant", () => {
    const content = getAlmanacContent(new Date("2026-08-02T00:00:00Z"), "UTC");
    expect(content.gregorian.year).toBe(2026);
    expect(content.gregorian.month).toBe(8);
    expect(content.gregorian.day).toBe(2);
  });

  describe("lunar 年份邊界 (RESEARCH.md Pitfall 2 / Task 3)", () => {
    // Verified range is 1901-2100, established empirically against the Hong
    // Kong Observatory's published Gregorian/lunar conversion tables (see
    // lunar.ts's VERIFIED_MIN_YEAR/VERIFIED_MAX_YEAR comment for the exact
    // dates cross-checked). 1900 is deliberately treated as OUT of range —
    // HKO's own table starts at 1901, not 1900 — so this suite asserts 1900
    // throws, not just 1899.

    it.each([1899, 1900])(
      "throws LunarRangeError for %d-01-01 and %d-12-31 (below verified range)",
      (year) => {
        expect(() => getAlmanacContent(new Date(Date.UTC(year, 0, 1)), "UTC")).toThrow(
          LunarRangeError,
        );
        expect(() => getAlmanacContent(new Date(Date.UTC(year, 11, 31)), "UTC")).toThrow(
          LunarRangeError,
        );
      },
    );

    it.each([2101, 3000])(
      "throws LunarRangeError for %d-01-01 and %d-12-31 (above verified range)",
      (year) => {
        expect(() => getAlmanacContent(new Date(Date.UTC(year, 0, 1)), "UTC")).toThrow(
          LunarRangeError,
        );
        expect(() => getAlmanacContent(new Date(Date.UTC(year, 11, 31)), "UTC")).toThrow(
          LunarRangeError,
        );
      },
    );

    it("LunarRangeError's message names the ISO date and the verified range", () => {
      let caught: unknown;
      try {
        getAlmanacContent(new Date(Date.UTC(1899, 0, 1)), "UTC");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LunarRangeError);
      const message = (caught as Error).message;
      expect(message).toContain("1899-01-01T00:00:00.000Z");
      expect(message).toContain("1901");
      expect(message).toContain("2100");
    });

    it("2100-01-01 (within the verified range) computes correctly, cross-checked against HKO", () => {
      // Hong Kong Observatory T2100c.txt: 2100年1月1日 -> 農曆 廿一 (month 11
      // continuing from the prior year, day 21).
      const content = getAlmanacContent(new Date(Date.UTC(2100, 0, 1)), "UTC");
      expect(content.lunarMonth).toBe(11);
      expect(content.lunarDay).toBe(21);
      expect(content.lunarDayZh).toBe("廿一");
    });

    it("2100-12-31 (within the verified range) computes correctly, cross-checked against HKO", () => {
      // HKO T2100c.txt: 2100年12月31日 -> 農曆 十二月 (month 12, day 1).
      const content = getAlmanacContent(new Date(Date.UTC(2100, 11, 31)), "UTC");
      expect(content.lunarMonth).toBe(12);
      expect(content.lunarDay).toBe(1);
      expect(content.lunarDayZh).toBe("初一");
    });

    it("2100-01-10 (within the verified range) matches HKO's month-12 rollover", () => {
      // HKO T2100c.txt: 2100年1月10日 -> 農曆 十二月 (month 12 begins here).
      const content = getAlmanacContent(new Date(Date.UTC(2100, 0, 10)), "UTC");
      expect(content.lunarMonth).toBe(12);
      expect(content.lunarDay).toBe(1);
    });

    it("1901-01-01 (within the verified range) matches HKO exactly", () => {
      // HKO T1901c.txt: 1901年01月01日 -> 農曆 十一 (day 11).
      const content = getAlmanacContent(new Date(Date.UTC(1901, 0, 1)), "UTC");
      expect(content.lunarMonth).toBe(11);
      expect(content.lunarDay).toBe(11);
    });
  });
});
