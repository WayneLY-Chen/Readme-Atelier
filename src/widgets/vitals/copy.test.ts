import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph, measureAdvanceWidth } from "../../core/font.js";
import { loadAllFonts } from "../../node/fonts.js";
import {
  eyebrowZh,
  pageFooterEn,
  pageFooterZh,
  stat1LabelEn,
  stat1LabelZh,
  stat2LabelEn,
  stat2LabelZh,
  stat3LabelEn,
  stat3LabelZh,
  statusFaintEn,
  statusFaintZh,
  statusFlatlineEn,
  statusFlatlineZh,
  statusRapidEn,
  statusRapidZh,
  statusSteadyEn,
  statusSteadyZh,
  titleEn,
  titleZh,
  windowCaptionEmptyEn,
  windowCaptionEmptyZh,
  windowCaptionFullEn,
  windowCaptionFullZh,
  windowCaptionPartialEn,
  windowCaptionPartialZh,
} from "./copy.js";
import { vitalsWidget } from "./index.js";

const T1_SIZE = 8;
const T1_LETTER_SPACING = 1.6;
const T2_SIZE = 32;
const T3_SIZE = 17;

function letterSpacedWidth(text: string, fontSize: number, letterSpacing: number): number {
  const chars = Array.from(text.toUpperCase());
  let width = 0;
  chars.forEach((ch, i) => {
    width += measureAdvanceWidth("mono-semibold", ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return width;
}

beforeAll(() => {
  loadAllFonts();
});

describe("Glyph coverage — every copy.ts export, per its rendering font (06-UI-SPEC.md 'Glyph coverage')", () => {
  const enStrings = [
    titleEn,
    stat1LabelEn,
    stat2LabelEn,
    stat3LabelEn,
    statusFlatlineEn,
    statusFaintEn,
    statusSteadyEn,
    statusRapidEn,
    windowCaptionFullEn,
    windowCaptionEmptyEn,
    windowCaptionPartialEn(1),
    windowCaptionPartialEn(9),
    windowCaptionPartialEn(27),
    pageFooterEn(1, 1),
    pageFooterEn(10, 12),
  ];
  const zhStrings = [
    titleZh,
    eyebrowZh,
    stat1LabelZh,
    stat2LabelZh,
    stat3LabelZh,
    statusFlatlineZh,
    statusFaintZh,
    statusSteadyZh,
    statusRapidZh,
    windowCaptionFullZh,
    windowCaptionEmptyZh,
    windowCaptionPartialZh(1),
    windowCaptionPartialZh(9),
    windowCaptionPartialZh(27),
    pageFooterZh(1, 1),
    pageFooterZh(10, 12),
  ];

  it.each(enStrings)('en string %j is covered by mono-semibold or serif', (str) => {
    for (const char of Array.from(str)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in "${str}"`).toBe(true);
    }
  });

  it.each(zhStrings)('zh-TW string %j is covered by mono-semibold or noto-tc', (str) => {
    for (const char of Array.from(str)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char), `"${char}" in "${str}"`).toBe(true);
    }
  });

  it("describe() strings (the alt-text deliverable) are covered in both languages", () => {
    const data = { login: "octocat", name: null, avatarUrl: "", followers: 0, fetchedAt: new Date(0).toISOString(), stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 } };
    const opts = { now: new Date(0), seed: 0, timezone: "UTC" } as const;
    const enDesc = vitalsWidget.describe(data, { ...opts, language: "en" });
    const zhDesc = vitalsWidget.describe(data, { ...opts, language: "zh-TW" });

    for (const char of Array.from(enDesc.title + enDesc.desc)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in en describe()`).toBe(true);
    }
    for (const char of Array.from(zhDesc.title + zhDesc.desc)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char), `"${char}" in zh-TW describe()`).toBe(
        true,
      );
    }
  });
});

describe("Text slot width budgets (06-UI-SPEC.md 'Card Layout 1 — Vitals' text slot table)", () => {
  function assertWithinBudget(label: string, str: string, width: number, budget: number): void {
    expect(width, `"${label}" = ${JSON.stringify(str)} measured ${width} > budget ${budget}`).toBeLessThanOrEqual(
      budget,
    );
  }

  it("card title (200px): en VITALS, zh 生命徵象", () => {
    assertWithinBudget("title en", titleEn, measureAdvanceWidth("serif", titleEn, T3_SIZE), 200);
    assertWithinBudget("title zh", titleZh, measureAdvanceWidth("noto-tc", titleZh, T3_SIZE), 200);
  });

  it("zh-only Latin eyebrow (120px): VITALS", () => {
    assertWithinBudget("eyebrowZh", eyebrowZh, letterSpacedWidth(eyebrowZh, T1_SIZE, T1_LETTER_SPACING), 120);
  });

  it("stat label col 1-2 (140px): worst case is CURRENT STREAK (en) / 目前連續 (zh)", () => {
    assertWithinBudget(
      "stat2LabelEn",
      stat2LabelEn,
      letterSpacedWidth(stat2LabelEn, T1_SIZE, T1_LETTER_SPACING),
      140,
    );
    assertWithinBudget("stat1LabelZh", stat1LabelZh, measureAdvanceWidth("noto-tc", stat1LabelZh, T1_SIZE), 140);
    assertWithinBudget("stat2LabelZh", stat2LabelZh, measureAdvanceWidth("noto-tc", stat2LabelZh, T1_SIZE), 140);
  });

  it("stat value col 1-2 (140px): worst case is a 3-digit-plus-decimal mean (999.9) and a 3-digit streak (365)", () => {
    assertWithinBudget("mean worst case", "999.9", measureAdvanceWidth("mono-semibold", "999.9", T2_SIZE), 140);
    assertWithinBudget("streak worst case", "365", measureAdvanceWidth("mono-semibold", "365", T2_SIZE), 140);
  });

  it("stat label col 3, right-aligned (100px): en STATUS, zh 狀態", () => {
    assertWithinBudget("stat3LabelEn", stat3LabelEn, letterSpacedWidth(stat3LabelEn, T1_SIZE, T1_LETTER_SPACING), 100);
    assertWithinBudget("stat3LabelZh", stat3LabelZh, measureAdvanceWidth("noto-tc", stat3LabelZh, T1_SIZE), 100);
  });

  it("status word, right-aligned (120px): worst case is FLATLINE (en) / 平線 (zh)", () => {
    assertWithinBudget(
      "statusFlatlineEn",
      statusFlatlineEn,
      measureAdvanceWidth("serif", statusFlatlineEn, T3_SIZE),
      120,
    );
    assertWithinBudget(
      "statusFlatlineZh",
      statusFlatlineZh,
      measureAdvanceWidth("noto-tc", statusFlatlineZh, T3_SIZE),
      120,
    );
  });

  it("window caption, bottom-left (240px): worst case is ONLY 9 DAYS ON RECORD (en) / 僅有 9 天的紀錄 (zh)", () => {
    const en9 = windowCaptionPartialEn(9);
    const zh9 = windowCaptionPartialZh(9);
    assertWithinBudget("windowCaptionPartialEn(9)", en9, letterSpacedWidth(en9, T1_SIZE, T1_LETTER_SPACING), 240);
    assertWithinBudget("windowCaptionPartialZh(9)", zh9, measureAdvanceWidth("noto-tc", zh9, T1_SIZE), 240);
    // Every other window caption variant must also fit — the 9-day case is
    // the UI-SPEC's own documented worst case, not the only case checked.
    assertWithinBudget(
      "windowCaptionFullEn",
      windowCaptionFullEn,
      letterSpacedWidth(windowCaptionFullEn, T1_SIZE, T1_LETTER_SPACING),
      240,
    );
    assertWithinBudget(
      "windowCaptionEmptyEn",
      windowCaptionEmptyEn,
      letterSpacedWidth(windowCaptionEmptyEn, T1_SIZE, T1_LETTER_SPACING),
      240,
    );
  });
});
