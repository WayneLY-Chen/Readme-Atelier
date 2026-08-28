import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph, measureAdvanceWidth } from "../../core/font.js";
import { loadAllFonts } from "../../node/fonts.js";
import {
  bannedPatternsEn,
  bannedSubstringsZh,
  buildFullCopySet,
  caveatEn,
  caveatZh,
  describeDescEn,
  describeDescZh,
  describeTitleEn,
  describeTitleZh,
  disclosureEyebrowEn,
  disclosureEyebrowInsufficientEn,
  disclosureEyebrowInsufficientZh,
  disclosureEyebrowZh,
  exemptLiterals,
  headlineAllZeroEn,
  headlineAllZeroZh,
  headlineInsufficientEn,
  headlineInsufficientZh,
  headlineNormalEn,
  headlineNormalZh,
  titleEn,
  titleZh,
  weekdayFullNamesEn,
  weekdayFullNamesZh,
  weekdayHeadersEn,
  weekdayHeadersZh,
} from "./copy.js";

const T1_SIZE = 8;
const T1_LETTER_SPACING = 1.6;
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

// ---------------------------------------------------------------------------
// V-03 — the four-step banned-vocabulary test (06-VALIDATION.md V-03,
// 06-UI-SPEC.md "The test, specified precisely enough to write"). ALL FOUR
// steps must exist — three of four leaves the exemption a hole.
// ---------------------------------------------------------------------------

describe("V-03 — the four-step banned-vocabulary test (the card's honesty contract)", () => {
  it("step 1: buildFullCopySet produces a non-empty bilingual copy set", () => {
    const set = buildFullCopySet();
    expect(set.length).toBeGreaterThan(0);
    expect(set.every((s) => typeof s === "string")).toBe(true);
  });

  it("step 2: removing X1-X4 by exact whole-string equality removes exactly four occurrences (caveat + desc appear once each in the built set)", () => {
    const set = buildFullCopySet();
    const remaining = set.filter((s) => !exemptLiterals.includes(s));
    // buildFullCopySet includes each exempt literal exactly once.
    expect(set.length - remaining.length).toBe(exemptLiterals.length);
    expect(exemptLiterals).toHaveLength(4);
  });

  it("step 3: every remaining string matches NONE of the B1-B9 patterns (en: word-boundary regex; zh: substring)", () => {
    const set = buildFullCopySet();
    const remaining = set.filter((s) => !exemptLiterals.includes(s));

    for (const str of remaining) {
      for (const pattern of bannedPatternsEn) {
        expect(pattern.test(str), `"${str}" unexpectedly matched banned EN pattern ${pattern}`).toBe(false);
      }
      for (const substring of bannedSubstringsZh) {
        expect(str.includes(substring), `"${str}" unexpectedly contained banned zh substring "${substring}"`).toBe(
          false,
        );
      }
    }
  });

  it("step 4: X1-X4 are still present, byte-exact, in the built copy set (the exemption can never be used to smuggle in a CHANGED string, and deleting the disclaimer must fail the build)", () => {
    const set = buildFullCopySet();
    for (const literal of exemptLiterals) {
      expect(set, `exempt literal "${literal}" missing from buildFullCopySet()`).toContain(literal);
    }
    // And the byte-exact identity of each named X1-X4 constant.
    expect(caveatEn).toBe("A PROJECTION OF PAST RHYTHM, NOT A PREDICTION");
    expect(caveatZh).toBe("這是過去節奏的投影，不是預測");
    expect(describeDescEn).toBe(
      "Projects a typical week from the median of each weekday over the past 12 weeks. " +
        "A projection of past rhythm, not a prediction.",
    );
    expect(describeDescZh).toBe("依過去十二週每個星期幾的中位數，推算出典型的一週，這是投影不是預測。");
  });

  it("negative self-check: injecting a banned word into a copy of the built set makes step 3 fail (proves the test actually bites, is not vacuously true)", () => {
    const set = buildFullCopySet();
    const remaining = set.filter((s) => !exemptLiterals.includes(s));
    const poisoned = [...remaining, "We predicted you will love this."];

    let caught = false;
    for (const str of poisoned) {
      for (const pattern of bannedPatternsEn) {
        if (pattern.test(str)) {
          caught = true;
        }
      }
    }
    expect(caught).toBe(true);

    const poisonedZh = [...remaining, "你會喜歡這個"];
    let caughtZh = false;
    for (const str of poisonedZh) {
      for (const substring of bannedSubstringsZh) {
        if (str.includes(substring)) {
          caughtZh = true;
        }
      }
    }
    expect(caughtZh).toBe(true);
  });

  it("B7 whole-word 'sure' does not false-positive on measure/ensure/pressure", () => {
    const sureLikeWords = ["We measure velocity.", "Please ensure tests pass.", "Under pressure, ship less."];
    const surePattern = bannedPatternsEn[6]!; // B7, table order
    expect(surePattern.source).toContain("sure");
    for (const str of sureLikeWords) {
      expect(surePattern.test(str), `"${str}" incorrectly matched B7`).toBe(false);
    }
    expect(surePattern.test("Are you sure?")).toBe(true);
  });

  it("B3 prefix 'predict' correctly matches predict/prediction/predicted", () => {
    const predictPattern = bannedPatternsEn[2]!; // B3, table order
    expect(predictPattern.test("we predict growth")).toBe(true);
    expect(predictPattern.test("a prediction")).toBe(true);
    expect(predictPattern.test("predicted outcomes")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Glyph coverage — every string this card can render, per its rendering
// font (06-UI-SPEC.md "Glyph coverage", re-verified 2026-08-28 against real
// bundled subsets: zero missing glyphs).
// ---------------------------------------------------------------------------

describe("Glyph coverage — every copy.ts export, per its rendering font", () => {
  it("every en string in buildFullCopySet (excluding zh strings) is covered by mono-semibold or serif", () => {
    const enStrings = [
      titleEn,
      disclosureEyebrowEn(12),
      disclosureEyebrowInsufficientEn,
      ...weekdayHeadersEn,
      ...weekdayFullNamesEn,
      headlineNormalEn("Wednesday", 288),
      headlineAllZeroEn,
      headlineInsufficientEn,
      caveatEn,
      describeTitleEn,
      describeDescEn,
    ];
    for (const str of enStrings) {
      for (const char of Array.from(str)) {
        expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in "${str}"`).toBe(true);
      }
    }
  });

  it("every zh-TW string in buildFullCopySet is covered by mono-semibold or noto-tc", () => {
    const zhStrings = [
      titleZh,
      disclosureEyebrowZh(12),
      disclosureEyebrowInsufficientZh,
      ...weekdayHeadersZh,
      ...weekdayFullNamesZh,
      headlineNormalZh("週三", 288),
      headlineAllZeroZh,
      headlineInsufficientZh,
      caveatZh,
      describeTitleZh,
      describeDescZh,
    ];
    for (const str of zhStrings) {
      for (const char of Array.from(str)) {
        expect(hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char), `"${char}" in "${str}"`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Text slot width budgets (06-UI-SPEC.md "Text slot budgets" — Forecast
// table).
// ---------------------------------------------------------------------------

describe("Text slot width budgets (06-UI-SPEC.md 'Forecast' text slot table)", () => {
  function assertWithinBudget(label: string, str: string, width: number, budget: number): void {
    expect(width, `"${label}" = ${JSON.stringify(str)} measured ${width} > budget ${budget}`).toBeLessThanOrEqual(
      budget,
    );
  }

  it("card title (200px): en THE FORECAST, zh 開發預報", () => {
    assertWithinBudget("titleEn", titleEn, measureAdvanceWidth("serif", titleEn, T3_SIZE), 200);
    assertWithinBudget("titleZh", titleZh, measureAdvanceWidth("noto-tc", titleZh, T3_SIZE), 200);
  });

  it("disclosure eyebrow (380px) — never truncate: en worst case k=12 measured ~305.6px, zh k=12 measured ~132.3px", () => {
    const en12 = disclosureEyebrowEn(12);
    assertWithinBudget("disclosureEyebrowEn(12)", en12, letterSpacedWidth(en12, T1_SIZE, T1_LETTER_SPACING), 380);
    const zh12 = disclosureEyebrowZh(12);
    assertWithinBudget("disclosureEyebrowZh(12)", zh12, measureAdvanceWidth("noto-tc", zh12, T1_SIZE), 380);
    assertWithinBudget(
      "disclosureEyebrowInsufficientEn",
      disclosureEyebrowInsufficientEn,
      letterSpacedWidth(disclosureEyebrowInsufficientEn, T1_SIZE, T1_LETTER_SPACING),
      380,
    );
    assertWithinBudget(
      "disclosureEyebrowInsufficientZh",
      disclosureEyebrowInsufficientZh,
      measureAdvanceWidth("noto-tc", disclosureEyebrowInsufficientZh, T1_SIZE),
      380,
    );
  });

  it("weekday header (48px = COL_W minus 16), centred: worst case en WED, zh 三", () => {
    for (const w of weekdayHeadersEn) {
      assertWithinBudget(`weekdayHeadersEn "${w}"`, w, letterSpacedWidth(w, T1_SIZE, T1_LETTER_SPACING), 48);
    }
    for (const w of weekdayHeadersZh) {
      assertWithinBudget(`weekdayHeadersZh "${w}"`, w, measureAdvanceWidth("noto-tc", w, T1_SIZE), 48);
    }
  });

  it("headline sentence (400px): worst case en Wednesday/288 ~342.6px, zh 週三/288 ~253.8px", () => {
    const en = headlineNormalEn("Wednesday", 288);
    assertWithinBudget("headlineNormalEn worst case", en, measureAdvanceWidth("serif", en, T3_SIZE), 400);
    const zh = headlineNormalZh("週三", 288);
    assertWithinBudget("headlineNormalZh worst case", zh, measureAdvanceWidth("noto-tc", zh, T3_SIZE), 400);
  });

  it("insufficient-data headline (400px) — the tightest slot in the phase: en ~391.1px (9px margin)", () => {
    assertWithinBudget(
      "headlineInsufficientEn",
      headlineInsufficientEn,
      measureAdvanceWidth("serif", headlineInsufficientEn, T3_SIZE),
      400,
    );
    assertWithinBudget(
      "headlineInsufficientZh",
      headlineInsufficientZh,
      measureAdvanceWidth("noto-tc", headlineInsufficientZh, T3_SIZE),
      400,
    );
    assertWithinBudget(
      "headlineAllZeroEn",
      headlineAllZeroEn,
      measureAdvanceWidth("serif", headlineAllZeroEn, T3_SIZE),
      400,
    );
    assertWithinBudget(
      "headlineAllZeroZh",
      headlineAllZeroZh,
      measureAdvanceWidth("noto-tc", headlineAllZeroZh, T3_SIZE),
      400,
    );
  });

  it("caveat line (340px) — never truncate: en ~286.4px, zh ~112.0px", () => {
    assertWithinBudget("caveatEn", caveatEn, letterSpacedWidth(caveatEn, T1_SIZE, T1_LETTER_SPACING), 340);
    assertWithinBudget("caveatZh", caveatZh, measureAdvanceWidth("noto-tc", caveatZh, T1_SIZE), 340);
  });
});

describe("describe() strings (the alt-text deliverable) are covered in both languages", () => {
  it("en title+desc glyphs are all covered", () => {
    for (const char of Array.from(describeTitleEn + describeDescEn)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in en describe()`).toBe(true);
    }
  });

  it("zh-TW title+desc glyphs are all covered", () => {
    for (const char of Array.from(describeTitleZh + describeDescZh)) {
      expect(hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char), `"${char}" in zh-TW describe()`).toBe(
        true,
      );
    }
  });

  it("desc carries the caveat verbatim in substance — contains the negation, in both languages", () => {
    expect(describeDescEn).toContain("not a prediction");
    expect(describeDescZh).toContain("不是預測");
  });
});
