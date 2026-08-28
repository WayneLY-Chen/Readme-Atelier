/**
 * The Forecast copy — 06-UI-SPEC.md "Forecast chrome strings — and the
 * framing contract" table + "The framing vocabulary, pinned in both
 * languages".
 *
 * THIS IS THE CARD WHERE SLOPPY WORDING MAKES AN ETHICAL CLAIM THE DATA
 * CANNOT SUPPORT. Every string in this file is either (a) drawn from the
 * "permitted" vocabulary (`projection`/`projected`, `median`, `rhythm`,
 * past-tense/stative phrasing, `a typical week` as an archetype — never a
 * dated week), or (b) one of exactly four exempt literals (X1-X4) that state
 * the disclaimer's own negation ("NOT A PREDICTION" / "不是預測"). See the
 * B1-B9 / X1-X4 tables below — they are DATA, consumed by copy.test.ts's
 * V-03 four-step test, not decoration.
 *
 * Tie-break rule (documented here per 06-UI-SPEC.md's explicit instruction,
 * "The projection method — Tie for busiest weekday"): when two or more
 * weekdays share the maximum median, the EARLIEST weekday in Monday-first
 * order wins. Deterministic, unit-tested in index.test.ts (F5) — an
 * unspecified tie-break would be a byte-instability risk for QA-02.
 *
 * The card never names a date. The seven columns are weekday ARCHETYPES —
 * "a typical Monday" — never "next Monday". See index.ts's weekday-of-date
 * computation for the corresponding rule on the geometry side.
 */

export const titleEn = "THE FORECAST";
export const titleZh = "開發預報";

// ---------------------------------------------------------------------------
// Disclosure eyebrow — mandatory in EVERY state, both languages. Prints the
// REAL k (never a hardcoded 12) — this is F4, the card's single most
// important honesty mechanic (06-UI-SPEC.md F4).
// ---------------------------------------------------------------------------

/** `k >= 2` state — `k` is a PRE-COMPUTED integer, never formatted by this
 * function beyond template interpolation (same convention as Vitals'
 * `windowCaptionPartialEn`). */
export function disclosureEyebrowEn(k: number): string {
  return `A TYPICAL WEEK, PROJECTED FROM THE PAST ${k} WEEKS`;
}

export function disclosureEyebrowZh(k: number): string {
  return `典型的一週，依過去 ${k} 週的節奏推算`;
}

/** `k < 2` state (F1) — the card refuses to project rather than projecting
 * from fewer than 2 weeks of basis. */
export const disclosureEyebrowInsufficientEn = "NOT ENOUGH RECORDED WEEKS TO PROJECT";
export const disclosureEyebrowInsufficientZh = "紀錄的週數不足，無法推算";

// ---------------------------------------------------------------------------
// Weekday headers — the seven day-column labels (Monday-first).
// ---------------------------------------------------------------------------

export const weekdayHeadersEn = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export const weekdayHeadersZh = ["一", "二", "三", "四", "五", "六", "日"] as const;

/** Weekday full names, used in the headline sentence (Monday-first, index 0
 * = Monday .. index 6 = Sunday). */
export const weekdayFullNamesEn = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const weekdayFullNamesZh = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"] as const;

// ---------------------------------------------------------------------------
// Headline — three states, one per weekday-column code path (normal /
// all-medians-zero / insufficient-data).
// ---------------------------------------------------------------------------

/** Normal state — `weekdayName` and `m` are PRE-COMPUTED (weekday full name
 * string, integer median); this function only assembles the template. */
export function headlineNormalEn(weekdayName: string, m: number): string {
  return `${weekdayName} has been busiest - median ${m}.`;
}

export function headlineNormalZh(weekdayNameZh: string, m: number): string {
  return `過去最忙的是${weekdayNameZh}，中位數 ${m}。`;
}

/** F2 — all seven medians are 0 (basis exists, account dormant). A CORRECT
 * projection, not a failure — must look deliberate. */
export const headlineAllZeroEn = "No weekday shows a rhythm yet.";
export const headlineAllZeroZh = "還看不出任何一天的節奏。";

/** F1 — `k < 2`, fewer than 14 recorded days. */
export const headlineInsufficientEn = "Not enough recorded weeks to project a rhythm.";
export const headlineInsufficientZh = "紀錄的週數不足，無法推算節奏。";

// ---------------------------------------------------------------------------
// Caveat line — X1/X2. MANDATORY in every state, both languages, never
// truncated. The one exempt pair naming what the OTHER exempt pair
// (describe()'s desc strings, X3/X4) also names — the disclaimer that cannot
// name what it disclaims is not a disclaimer.
// ---------------------------------------------------------------------------

export const caveatEn = "A PROJECTION OF PAST RHYTHM, NOT A PREDICTION"; // X1
export const caveatZh = "這是過去節奏的投影，不是預測"; // X2

// ---------------------------------------------------------------------------
// describe() strings — the alt-text deliverable (06-UI-SPEC.md "<title>/
// <desc> — which is also the alt text"). desc carries the caveat verbatim —
// this is the ONLY channel where the dashed panel, the eyebrow and the
// numeral fill convey nothing at all (an <img src> exposes only `alt`).
// X3/X4 are the desc strings, exempt literals 3 and 4.
// ---------------------------------------------------------------------------

export const describeTitleEn = "The Forecast card";
/** X3 — exempt literal, byte-exact, matched whole-string only. */
export const describeDescEn =
  "Projects a typical week from the median of each weekday over the past 12 weeks. " +
  "A projection of past rhythm, not a prediction.";

export const describeTitleZh = "開發預報卡片";
/** X4 — exempt literal, byte-exact, matched whole-string only. Corrected
 * 2026-08-28: previously named a future window ("推算未來七天的節奏"); now
 * archetype phrasing carrying no future window, a faithful translation of
 * the en string rather than a looser paraphrase. */
export const describeDescZh = "依過去十二週每個星期幾的中位數，推算出典型的一週，這是投影不是預測。";

// ---------------------------------------------------------------------------
// Page footer — inherited verbatim from the shipped contract (same literal
// format, same absent-means-emit-nothing rule, applied independently by
// index.ts — RENDER-02, no widget imports another widget's copy).
// ---------------------------------------------------------------------------

export function pageFooterEn(n: number, m: number): string {
  return `PAGE ${n}/${m}`;
}

export function pageFooterZh(n: number, m: number): string {
  return `頁 ${n} / ${m}`;
}

// ---------------------------------------------------------------------------
// The B1-B9 / X1-X4 contract (06-UI-SPEC.md "Banned" / "The exemption set")
// — exported as DATA so copy.test.ts's V-03 four-step test can consume it
// mechanically rather than re-deriving it.
// ---------------------------------------------------------------------------

/**
 * B1-B9, English side, in table order. B2 covers BOTH `you'll` and `you
 * will` (a whole-word/phrase match, case-insensitive) since `you will`'s
 * `will` half is already covered by B1's `/\bwill\b/i`, but the row is kept
 * as its own pattern to mirror the UI-SPEC table 1:1. B7 is a WHOLE-WORD
 * match only (`/\bsure\b/i`) so `measure`/`ensure`/`pressure` never
 * false-positive (the exact bug B9's predecessor rule caused). B9 matches
 * all five second-person forms as one alternation.
 */
export const bannedPatternsEn: RegExp[] = [
  /\bwill\b/i, // B1
  /\byou'll\b|\byou\s+will\b/i, // B2
  /\bpredict/i, // B3 — prefix: predict, prediction, predicted
  /\bexpect/i, // B4 — prefix: expect, expected, expecting
  /\blikely\b/i, // B5
  /\bguarantee/i, // B6 — prefix: guarantee, guaranteed
  /\bsure\b/i, // B7 — whole word only
  /\bdefinitely\b/i, // B8
  /\b(you|your|yours|you're|yourself)\b/i, // B9 — second person
];

/**
 * B1-B9, zh-TW side, as substrings (zh has no word-boundary concept in the
 * same sense as en, so every check here is a plain substring match). B9 has
 * three entries (你/妳/您) for the three second-person forms named in the
 * UI-SPEC table; every other row has exactly one.
 */
export const bannedSubstringsZh: string[] = [
  "你會", // B1
  "將會", // B2
  "預測", // B3
  "應該會", // B4
  "可能會", // B5
  "保證", // B6
  "一定", // B7
  "肯定", // B8
  "你", // B9
  "妳", // B9
  "您", // B9
];

/**
 * The exactly-four exempt literals (X1-X4), matched whole-string and
 * byte-exact ONLY — never as a substring rule, never as a pattern. Every
 * exempt literal states the disclaimer's own negation ("NOT A PREDICTION" /
 * "不是預測"); there is no exempt string in which a banned token appears as
 * an assertion.
 */
export const exemptLiterals: string[] = [caveatEn, caveatZh, describeDescEn, describeDescZh];

/**
 * Builds the card's COMPLETE bilingual copy set (every chrome string, every
 * state variant of the eyebrow and headline expanded with a representative
 * value, the caveat, both describe() strings) — the single source both
 * V-03's four-step banned-vocabulary test and the glyph/budget sweeps in
 * copy.test.ts consume. Almanac's `copy.test.ts` totality precedent: leaving
 * an export out of this list is exactly the kind of hole V-03 exists to
 * catch, so every new string this card can ever render must be added here.
 */
export function buildFullCopySet(): string[] {
  return [
    // Title.
    titleEn,
    titleZh,
    // Disclosure eyebrow — both states, both languages. k=12 is the
    // UI-SPEC's own documented worst-case width for the k>=2 state; k=2 and
    // k=11 are also swept so every reachable digit width is covered.
    disclosureEyebrowEn(12),
    disclosureEyebrowEn(2),
    disclosureEyebrowEn(11),
    disclosureEyebrowZh(12),
    disclosureEyebrowZh(2),
    disclosureEyebrowZh(11),
    disclosureEyebrowInsufficientEn,
    disclosureEyebrowInsufficientZh,
    // Weekday headers.
    ...weekdayHeadersEn,
    ...weekdayHeadersZh,
    // Weekday full names.
    ...weekdayFullNamesEn,
    ...weekdayFullNamesZh,
    // Headline — all three states, both languages. Wednesday/median 288 is
    // the UI-SPEC's own documented worst-case example.
    headlineNormalEn("Wednesday", 288),
    headlineNormalZh("週三", 288),
    headlineAllZeroEn,
    headlineAllZeroZh,
    headlineInsufficientEn,
    headlineInsufficientZh,
    // Caveat (X1/X2).
    caveatEn,
    caveatZh,
    // Page footer — representative values.
    pageFooterEn(1, 1),
    pageFooterEn(10, 12),
    pageFooterZh(1, 1),
    pageFooterZh(10, 12),
    // describe() — both languages, title + desc (X3/X4 are the desc pair).
    describeTitleEn,
    describeDescEn,
    describeTitleZh,
    describeDescZh,
  ];
}
