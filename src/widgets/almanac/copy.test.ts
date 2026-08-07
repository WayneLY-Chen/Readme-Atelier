import { readFileSync } from "node:fs";
import path from "node:path";
import { Solar } from "lunar-typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { measureAdvanceWidth, registerFont } from "../../core/font.js";
import {
  chromeEn,
  chromeZh,
  ganZhiToEnglish,
  gregorianCaptionEn,
  gregorianCaptionZh,
  lunarValueEn,
  lunarValueZh,
  yijiTableEn,
  yijiTableZh,
} from "./copy.js";

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const T3_SIZE = 17;

beforeAll(() => {
  registerFont(
    "serif",
    toArrayBuffer(readFileSync(path.join("assets", "fonts", "source-serif-4.subset.ttf"))),
  );
  registerFont(
    "noto-tc",
    toArrayBuffer(readFileSync(path.join("assets", "fonts", "noto-serif-tc.subset.ttf"))),
  );
});

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

describe("Plan 02 Task 3: yijiTableZh + bilingual totality (UI-SPEC D-06 / almanac-yiji 'error' row)", () => {
  const ZHI_XING_KEYS = Array.from(
    new Set(
      Array.from({ length: 400 }, (_, d) =>
        Solar.fromDate(new Date(2020, 0, 1 + d)).getLunar().getZhiXing(),
      ),
    ),
  );

  it("yijiTableZh has an entry for every zhiXing value lunar-typescript actually returns", () => {
    expect(ZHI_XING_KEYS.length).toBe(12);
    for (const zhiXing of ZHI_XING_KEYS) {
      const entry = yijiTableZh[zhiXing];
      expect(entry, `missing yijiTableZh entry for zhiXing "${zhiXing}"`).toBeDefined();
      expect(entry.auspicious.length).toBeGreaterThan(0);
      expect(entry.avoid.length).toBeGreaterThan(0);
    }
  });

  it("the combined en+zh table totals 48 non-empty strings (12 建除神 x 2 languages x 宜/忌)", () => {
    const allStrings = ZHI_XING_KEYS.flatMap((key) => [
      yijiTableEn[key]?.auspicious,
      yijiTableEn[key]?.avoid,
      yijiTableZh[key]?.auspicious,
      yijiTableZh[key]?.avoid,
    ]);
    expect(allStrings).toHaveLength(48);
    expect(allStrings.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
  });
});

describe("Plan 02 Task 3: text slot width budgets (UI-SPEC 'Text slot budgets')", () => {
  const YIJI_BUDGET = 260;
  const TITLE_BUDGET = 200;
  const GANZHI_BUDGET = 120;
  const LUNAR_VALUE_BUDGET = 160;

  function assertWithinBudget(label: string, str: string, width: number, budget: number): void {
    expect(
      width,
      `"${label}" = ${JSON.stringify(str)} measured ${width} > budget ${budget}`,
    ).toBeLessThanOrEqual(budget);
  }

  it("every zh-TW 宜/忌 phrase (noto-tc, T3=17px) is within the 260-unit budget", () => {
    for (const [key, entry] of Object.entries(yijiTableZh)) {
      assertWithinBudget(
        `yijiTableZh[${key}].auspicious`,
        entry.auspicious,
        measureAdvanceWidth("noto-tc", entry.auspicious, T3_SIZE),
        YIJI_BUDGET,
      );
      assertWithinBudget(
        `yijiTableZh[${key}].avoid`,
        entry.avoid,
        measureAdvanceWidth("noto-tc", entry.avoid, T3_SIZE),
        YIJI_BUDGET,
      );
    }
  });

  it("every en 宜/忌 phrase (serif, T3=17px) is within the 260-unit budget", () => {
    for (const [key, entry] of Object.entries(yijiTableEn)) {
      assertWithinBudget(
        `yijiTableEn[${key}].auspicious`,
        entry.auspicious,
        measureAdvanceWidth("serif", entry.auspicious, T3_SIZE),
        YIJI_BUDGET,
      );
      assertWithinBudget(
        `yijiTableEn[${key}].avoid`,
        entry.avoid,
        measureAdvanceWidth("serif", entry.avoid, T3_SIZE),
        YIJI_BUDGET,
      );
    }
  });

  it("both localized card titles are within the 200-unit budget", () => {
    assertWithinBudget(
      "chromeZh.title",
      chromeZh.title,
      measureAdvanceWidth("noto-tc", chromeZh.title, T3_SIZE),
      TITLE_BUDGET,
    );
    assertWithinBudget(
      "chromeEn.title",
      chromeEn.title,
      measureAdvanceWidth("serif", chromeEn.title, T3_SIZE),
      TITLE_BUDGET,
    );
  });

  it("every 干支 value actually produced over a wide date range is within the 120-unit budget", () => {
    // Scan 3+ years (well over the 60-day sexagenary cycle) so this exercises
    // every real dayGanZhi value, not just today's.
    const ganZhiValues = new Set(
      Array.from({ length: 1200 }, (_, d) =>
        Solar.fromDate(new Date(2020, 0, 1 + d)).getLunar().getDayInGanZhi(),
      ),
    );
    expect(ganZhiValues.size).toBeGreaterThanOrEqual(60);
    for (const ganZhi of ganZhiValues) {
      assertWithinBudget(
        `dayGanZhi zh "${ganZhi}"`,
        ganZhi,
        measureAdvanceWidth("noto-tc", ganZhi, T3_SIZE),
        GANZHI_BUDGET,
      );
      const en = ganZhiToEnglish(ganZhi);
      assertWithinBudget(
        `dayGanZhi en "${en}"`,
        en,
        measureAdvanceWidth("serif", en, T3_SIZE),
        GANZHI_BUDGET,
      );
    }
  });

  it("every lunar month/day value actually produced over a wide date range is within the 160-unit budget", () => {
    // Scan ~8 years so every month label (including the 正/冬/腊-style names
    // and at least one leap month) and every day-of-month label appears.
    const seen = new Map<string, { monthCn: string; dayCn: string; month: number; day: number }>();
    for (let d = 0; d < 3000; d++) {
      const lunar = Solar.fromDate(new Date(2020, 0, 1 + d)).getLunar();
      const monthCn = lunar.getMonthInChinese();
      const dayCn = lunar.getDayInChinese();
      seen.set(`${monthCn}|${dayCn}`, { monthCn, dayCn, month: lunar.getMonth(), day: lunar.getDay() });
    }
    expect(seen.size).toBeGreaterThan(30);

    for (const { monthCn, dayCn, month, day } of seen.values()) {
      const zh = lunarValueZh(monthCn, dayCn);
      assertWithinBudget(
        `lunar value zh "${zh}"`,
        zh,
        measureAdvanceWidth("noto-tc", zh, T3_SIZE),
        LUNAR_VALUE_BUDGET,
      );
      const en = lunarValueEn(month, day);
      assertWithinBudget(
        `lunar value en "${en}"`,
        en,
        measureAdvanceWidth("serif", en, T3_SIZE),
        LUNAR_VALUE_BUDGET,
      );
    }
  });
});

describe("Plan 02 Task 3: zh-TW lunar label Simplified->Traditional conversion", () => {
  it("converts the two known Simplified holdouts (腊/闰) to Traditional (臘/閏)", () => {
    expect(lunarValueZh("腊", "初一")).toBe("臘月初一");
    expect(lunarValueZh("闰四", "十五")).toBe("閏四月十五");
  });

  it("leaves already-Traditional-compatible month labels untouched", () => {
    expect(lunarValueZh("六", "十九")).toBe("六月十九");
  });
});

describe("Plan 02 Task 3: gregorian caption formatting", () => {
  it("gregorianCaptionZh matches the UI-SPEC example", () => {
    expect(gregorianCaptionZh(8, 2026)).toBe("2026年8月");
  });

  it("gregorianCaptionEn still matches the UI-SPEC example (unchanged from Plan 01)", () => {
    expect(gregorianCaptionEn(8, 2026)).toBe("August 2026");
  });
});
