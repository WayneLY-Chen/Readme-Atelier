import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import { numeralFillFor } from "./contrast.js";
import {
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
  headlineAllZeroEn,
  headlineAllZeroZh,
  headlineInsufficientEn,
  headlineInsufficientZh,
  headlineNormalEn,
  headlineNormalZh,
  pageFooterEn,
  pageFooterZh,
  titleEn,
  titleZh,
  weekdayFullNamesEn,
  weekdayFullNamesZh,
  weekdayHeadersEn,
  weekdayHeadersZh,
} from "./copy.js";

/**
 * Plan 06-02: The Forecast / 開發預報 (CARD-06) — the catalogue's first
 * "non-measured-data" card. Seven projected weekday numerals are NOT
 * measurements; they are a rhythm projection derived from the trailing basis
 * window (06-UI-SPEC.md "Card Layout 2 — The Forecast", "The projection
 * method — defined before it is drawn"). This is the one card in the batch
 * where sloppy wording makes an ethical claim the data cannot support — see
 * copy.ts's header comment and the B1-B9/X1-X4 tables it exports.
 */

// ---------------------------------------------------------------------------
// Geometry constants — each cites the UI-SPEC section that fixed the value
// (06-UI-SPEC.md "Card Layout 2 — The Forecast — Canvas and geometry
// constants").
// ---------------------------------------------------------------------------

const CARD_WIDTH = 495;
const CARD_HEIGHT = 248;
const PADDING = 24;
const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471

const T1_SIZE = 8;
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const TITLE_Y = 44;
const EYEBROW_Y = 58;
const RULE_Y = 68;

/**
 * Declared chrome deviation (06-UI-SPEC.md "Declared chrome deviation"):
 * Forecast is the only card in the catalogue whose eyebrow sits on its own
 * line (y=58) with the hairline pushed to y=68, instead of sharing the
 * title's y=44 baseline with the rule at y=58. Reason: the disclosure
 * eyebrow is 305.6px in en, the title is 128.3px, and a shared baseline
 * would leave a 13px gutter — a layout in which the honest thing is the
 * thing under pressure. Given a free choice between squeezing the
 * disclosure and moving one rule 10px down, the rule moves. Every OTHER
 * card keeps 44/58 unchanged.
 */

const PANEL_X = 24;
const PANEL_Y = 80;
const PANEL_W = 447;
const PANEL_H = 96; // panel spans y 80..176
const COL_W = PANEL_W / 7; // 63.857142...
const WEEKDAY_LABEL_Y = 96;
const GLYPH_CENTER_Y = 128;
const NUMERAL_Y = 168;
const HEADLINE_Y = 200;
const CAVEAT_Y = 216;

function colCenter(i: number): number {
  return PANEL_X + COL_W * (i + 0.5);
}

// ---------------------------------------------------------------------------
// Text slot budgets (06-UI-SPEC.md "Text slot budgets" — Forecast table) —
// every one is a regression tripwire, checked before its corresponding path
// data is built. Every string on this card is engine-authored, so
// RENDER-05's fail-loud policy applies in full.
// ---------------------------------------------------------------------------

const CARD_TITLE_BUDGET_PX = 200;
const DISCLOSURE_EYEBROW_BUDGET_PX = 380; // never truncate — mandatory string
const WEEKDAY_HEADER_BUDGET_PX = 48; // COL_W (63.86) minus 16
const NUMERAL_BUDGET_PX = 48; // 3-digit worst case ("288") measures 30.6px
const HEADLINE_BUDGET_PX = 400;
const CAVEAT_BUDGET_PX = 340; // never truncate — mandatory string

/**
 * Thrown by assertSlotBudget when a formatted string's measured render width
 * exceeds its slot's budget. No `format.ts` exists for this card (its
 * numerals are plain integers with no compaction path — 06-PATTERNS.md
 * "Concrete file sets to plan"), so this lives here instead, same shape as
 * the-record/format.ts's RecordSlotOverflowError / vitals/format.ts's
 * VitalsSlotOverflowError (RENDER-02: no widget imports another widget's
 * private helper).
 */
export class ForecastSlotOverflowError extends Error {
  constructor(field: string, formatted: string, widthPx: number, budgetPx: number) {
    super(
      `ForecastSlotOverflowError: field "${field}" formatted as "${formatted}" measures ` +
        `${widthPx}px, exceeding the ${budgetPx}px slot budget.`,
    );
    this.name = "ForecastSlotOverflowError";
  }
}

function assertSlotBudget(field: string, formatted: string, widthPx: number, budgetPx: number): void {
  if (widthPx > budgetPx) {
    throw new ForecastSlotOverflowError(field, formatted, widthPx, budgetPx);
  }
}

// ---------------------------------------------------------------------------
// Module-scope invariant throws (same convention as vitals/index.ts's
// R-wave headroom check) — a bad geometry constant fails at IMPORT time,
// never silently at render time.
// ---------------------------------------------------------------------------

const SUN_RAY_OUTER_R = 19; // UI-SPEC "Weather glyphs — geometry", SUN's outer ray radius
const NUMERAL_BOTTOM_CLEARANCE = 8; // UI-SPEC "Extent check": sm (8)

if (!(GLYPH_CENTER_Y - SUN_RAY_OUTER_R > PANEL_Y)) {
  throw new Error(
    `the-forecast: weather-glyph top clearance invariant violated — GLYPH_CENTER_Y=${GLYPH_CENTER_Y}, SUN_RAY_OUTER_R=${SUN_RAY_OUTER_R}, PANEL_Y=${PANEL_Y}`,
  );
}
if (!(NUMERAL_Y + NUMERAL_BOTTOM_CLEARANCE <= PANEL_Y + PANEL_H)) {
  throw new Error(
    `the-forecast: numeral bottom clearance invariant violated — NUMERAL_Y=${NUMERAL_Y}, PANEL_Y=${PANEL_Y}, PANEL_H=${PANEL_H}`,
  );
}

// ---------------------------------------------------------------------------
// Chassis helpers — own copy, not imported (RENDER-02: adding/modifying a
// card must not require touching another card's private functions).
// Structurally identical to vitals/index.ts's and the-graveyard/index.ts's
// own sets.
// ---------------------------------------------------------------------------

function pathElement(d: string, fill: string): string {
  if (d === "") {
    return "";
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

function letterSpacedPath(
  fontName: string,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  letterSpacing: number,
): string {
  let cursorX = x;
  let d = "";
  const chars = Array.from(text);
  chars.forEach((ch, i) => {
    d += textToPathData(fontName, ch, cursorX, y, fontSize);
    cursorX += measureAdvanceWidth(fontName, ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return d;
}

function letterSpacedWidth(fontName: string, text: string, fontSize: number, letterSpacing: number): number {
  const chars = Array.from(text);
  let width = 0;
  chars.forEach((ch, i) => {
    width += measureAdvanceWidth(fontName, ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return width;
}

/** T1 eyebrow/label style for English text: IBM Plex Mono Semibold,
 * uppercase, letter-spaced, 8px. Left-aligned at (x, y). */
function eyebrowLabel(text: string, x: number, y: number, fill: string): string {
  const upper = text.toUpperCase();
  assertCoverage("mono-semibold", upper, `the-forecast T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/** T1 label style for zh-TW text: Noto Serif TC, 8px, no uppercase
 * transform, no manual letter-spacing. */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `the-forecast T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/** Renders a T1 label horizontally centred at `centerX` — mirrors
 * the-graveyard's own `centeredLabel`, used here for the seven weekday
 * headers. */
function centeredLabel(text: string, language: "en" | "zh-TW", centerX: number, y: number, fill: string): string {
  if (language === "zh-TW") {
    const width = zhLabelWidth(text);
    return zhLabel(text, centerX - width / 2, y, fill);
  }
  const width = eyebrowLabelWidth(text);
  return eyebrowLabel(text, centerX - width / 2, y, fill);
}

/** T3 primary-content style: Source Serif 4 (en) / Noto Serif TC (zh-TW). */
function contentText(fontName: string, text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage(fontName, text, context);
  const d = textToPathData(fontName, text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

/** T3-mono numeral path (NO fill attribute of its own) — used ONLY for the
 * seven projected weekday numerals (D-02: every numeral routes through IBM
 * Plex Mono). Returns bare `<path d="...">` markup, intended to be wrapped
 * in a single `<g fill="...">` group by the caller — Rule C-2's fill is a
 * single per-render decision (`numeralFillFor(theme)`), not a per-numeral
 * one, so wrapping all seven in one group both states that fact structurally
 * and is the natural place a test asserts "the seven numerals' fill". */
function centeredMonoNumeralPath(text: string, centerX: number, y: number, context: string): string {
  assertCoverage("mono-semibold", text, context);
  const width = measureAdvanceWidth("mono-semibold", text, T3_SIZE);
  const x = centerX - width / 2;
  const d = textToPathData("mono-semibold", text, x, y, T3_SIZE);
  return d === "" ? "" : `<path d="${d}"/>`;
}

// ---------------------------------------------------------------------------
// The projection method — pure functions, exported for unit testing
// (06-UI-SPEC.md "The projection method — defined before it is drawn").
// ---------------------------------------------------------------------------

/** `k = min(12, floor(available / 7))` — the basis window is always a whole
 * number of weeks, so every weekday appears exactly `k` times with no
 * calendar-week alignment question. */
export function computeK(availableDays: number): number {
  return Math.min(12, Math.floor(availableDays / 7));
}

/**
 * Weekday of an ISO `YYYY-MM-DD` date, Monday-first (0=Mon .. 6=Sun).
 * `new Date(Date.UTC(y, m-1, d)).getUTCDay()` returns 0=Sunday..6=Saturday;
 * remapped via `(dow + 6) % 7`. `opts.timezone` is DELIBERATELY not applied
 * here — GitHub's `contributionCalendar` buckets are already localised to
 * the account's own day boundaries, and re-bucketing them by a second
 * timezone would double-shift the data (06-UI-SPEC.md "Weekday of a date").
 * The next reader will assume the opposite; this comment is the guard.
 */
export function weekdayIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return (dow + 6) % 7;
}

export interface WeekdayMediansResult {
  k: number;
  /** Length 7 when `k >= 2` (index 0=Mon .. 6=Sun); empty when `k < 2`
   * (F1 — the card projects nothing). */
  medians: number[];
}

/**
 * Per-weekday statistic: the LOWER median, not the mean (06-UI-SPEC.md "Per-
 * weekday statistic"). For weekday `d`, collect its `k` counts from the
 * trailing `7k`-day basis, sort ascending, take the element at index
 * `floor((k-1)/2)`. Lower median because it keeps the result an integer and
 * makes the tie-break deterministic for even `k` — a mean would introduce a
 * rounding decision and a byte-instability risk for QA-02. `k < 2` returns
 * an empty medians array (F1).
 */
export function computeWeekdayMedians(
  calendar: { date: string; count: number }[] | undefined,
): WeekdayMediansResult {
  const cal = calendar ?? [];
  const k = computeK(cal.length);
  if (k < 2) {
    return { k, medians: [] };
  }
  const basis = cal.slice(cal.length - 7 * k);
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const entry of basis) {
    buckets[weekdayIndexOf(entry.date)]!.push(entry.count);
  }
  const medians = buckets.map((counts) => {
    const sorted = [...counts].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
  });
  return { k, medians };
}

export type WeatherTier = "CALM" | "CLOUD" | "PARTIAL" | "SUN" | "STORM";

/**
 * Weather tier for a single weekday median `m`, given `M` = the maximum of
 * all seven medians. `M === 0` is an explicit division guard (F3) — every
 * tier resolves to CALM without ever computing `m / M`. Tiers are
 * SELF-RELATIVE, never absolute counts (06-UI-SPEC.md "Weather tiers"): five
 * commits a day is a storm for one person and a drizzle for another, and an
 * absolute scale would make the card a comparison between people, which it
 * must not be.
 */
export function tierFor(m: number, M: number): WeatherTier {
  if (M === 0) {
    return "CALM"; // F3 guard — never divides
  }
  if (m === 0) {
    return "CALM";
  }
  if (m <= 0.25 * M) {
    return "CLOUD";
  }
  if (m <= 0.5 * M) {
    return "PARTIAL";
  }
  if (m <= 0.8 * M) {
    return "SUN";
  }
  return "STORM";
}

/**
 * The busiest weekday's index, Monday-first tie-break (documented in
 * copy.ts's header comment per the UI-SPEC's explicit instruction): the
 * EARLIEST weekday in Monday-first order wins a tie. Deterministic — the
 * left-to-right scan below only updates on a STRICTLY greater value, so the
 * first-seen (earliest) index among equal maxima is kept automatically.
 */
export function busiestWeekdayIndex(medians: number[]): number {
  let bestIndex = 0;
  let bestValue = medians[0] ?? 0;
  for (let i = 1; i < medians.length; i++) {
    if (medians[i]! > bestValue) {
      bestValue = medians[i]!;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Disclosure-eyebrow text selection — exported for DIRECT unit testing (same
 * convention as vitals' `windowCaptionFor`/`statusWordFor`: the rendered
 * eyebrow is emitted as opaque path data, so this exported selector is the
 * only way to assert the exact copy string — and the exact `k` — chosen for
 * a given input, without OCR-ing the render output). This is F4, the card's
 * single most important honesty mechanic: `k` must be the REAL computed
 * value, never a hardcoded 12, and `renderBody` below calls this same
 * function rather than re-deriving the choice inline.
 */
export function eyebrowTextFor(k: number, hasProjection: boolean, language: "en" | "zh-TW"): string {
  if (!hasProjection) {
    return language === "zh-TW" ? disclosureEyebrowInsufficientZh : disclosureEyebrowInsufficientEn;
  }
  return language === "zh-TW" ? disclosureEyebrowZh(k) : disclosureEyebrowEn(k);
}

/**
 * Headline text selection — one of three states (insufficient / all-zero /
 * normal), exported for the same direct-testability reason as
 * `eyebrowTextFor` above.
 */
export function headlineTextFor(
  hasProjection: boolean,
  allZero: boolean,
  busiestWeekdayName: string,
  busiestMedian: number,
  language: "en" | "zh-TW",
): string {
  if (!hasProjection) {
    return language === "zh-TW" ? headlineInsufficientZh : headlineInsufficientEn;
  }
  if (allZero) {
    return language === "zh-TW" ? headlineAllZeroZh : headlineAllZeroEn;
  }
  return language === "zh-TW"
    ? headlineNormalZh(busiestWeekdayName, busiestMedian)
    : headlineNormalEn(busiestWeekdayName, busiestMedian);
}

// ---------------------------------------------------------------------------
// Weather glyph rendering — geometry copied verbatim from 06-UI-SPEC.md
// "Weather glyphs — geometry" (all centred on `(cx, GLYPH_CENTER_Y=128)`).
// ---------------------------------------------------------------------------

function renderWeatherGlyph(tier: WeatherTier, cx: number, theme: Theme): string {
  const cxs = cx.toFixed(2);
  switch (tier) {
    case "CALM": {
      const x1 = (cx - 9).toFixed(2);
      const x2 = (cx + 9).toFixed(2);
      return `<line x1="${x1}" y1="128" x2="${x2}" y2="128" stroke="${theme.rule}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
    case "CLOUD": {
      return (
        `<circle cx="${(cx - 5).toFixed(2)}" cy="126" r="8" fill="${theme.rule}"/>` +
        `<circle cx="${(cx + 5).toFixed(2)}" cy="128" r="10" fill="${theme.rule}"/>` +
        `<circle cx="${(cx - 3).toFixed(2)}" cy="131" r="7" fill="${theme.rule}"/>`
      );
    }
    case "PARTIAL": {
      // Sun ring drawn first, the two clouds after so they occlude it.
      return (
        `<circle cx="${(cx - 3).toFixed(2)}" cy="122" r="9" fill="none" stroke="${theme.accent}" stroke-width="1.6"/>` +
        `<circle cx="${(cx + 3).toFixed(2)}" cy="130" r="8" fill="${theme.rule}"/>` +
        `<circle cx="${(cx - 4).toFixed(2)}" cy="132" r="6" fill="${theme.rule}"/>`
      );
    }
    case "SUN": {
      let markup = `<circle cx="${cxs}" cy="128" r="11" fill="none" stroke="${theme.accent}" stroke-width="1.6"/>`;
      // Four rays, N/S/E/W, from radius 16 to 19.
      markup += `<line x1="${cxs}" y1="112" x2="${cxs}" y2="109" stroke="${theme.accent}" stroke-width="1.4" stroke-linecap="round"/>`; // N
      markup += `<line x1="${cxs}" y1="144" x2="${cxs}" y2="147" stroke="${theme.accent}" stroke-width="1.4" stroke-linecap="round"/>`; // S
      markup += `<line x1="${(cx + 16).toFixed(2)}" y1="128" x2="${(cx + 19).toFixed(2)}" y2="128" stroke="${theme.accent}" stroke-width="1.4" stroke-linecap="round"/>`; // E
      markup += `<line x1="${(cx - 16).toFixed(2)}" y1="128" x2="${(cx - 19).toFixed(2)}" y2="128" stroke="${theme.accent}" stroke-width="1.4" stroke-linecap="round"/>`; // W
      return markup;
    }
    case "STORM": {
      const bolt =
        `M${(cx + 2).toFixed(2)},130 L${(cx - 4).toFixed(2)},140 L${(cx + 1).toFixed(2)},140 ` +
        `L${(cx - 3).toFixed(2)},148 L${(cx + 7).toFixed(2)},136 L${(cx + 2).toFixed(2)},136 Z`;
      return (
        `<circle cx="${(cx - 5).toFixed(2)}" cy="124" r="8" fill="${theme.muted}"/>` +
        `<circle cx="${(cx + 5).toFixed(2)}" cy="126" r="10" fill="${theme.muted}"/>` +
        `<path d="${bolt}" fill="${theme.accent}"/>`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/** No `widgets.yml`-configurable options exist for this card (masthead/the-
 * record/vitals's `z.object({}).strict()` no-args precedent). */
const theForecastOptionsSchema = z.object({}).strict();

export const theForecastWidget: WidgetDefinition<RenderOptions> = {
  name: "the-forecast",
  requires: ["calendar"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      theForecastOptionsSchema.parse(value ?? {});
      return { now: new Date(), seed: 0, language: "en", timezone: "UTC" };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return { title: describeTitleZh, desc: describeDescZh };
    }
    return { title: describeTitleEn, desc: describeDescEn };
  },

  /**
   * Composition, z-order (06-UI-SPEC.md "Card Layout 2 — Composition"):
   * (1) title + disclosure eyebrow (every state, real k) + hairline ->
   * (2) dashed panel border + six dashed interior column separators
   * (Rule C-2 — no solid rule anywhere inside) ->
   * (3) seven weekday headers, centred ->
   * (4)+(5) seven weather glyphs + seven projected numerals (SKIPPED
   * entirely when `k < 2` — F1 renders headers only) ->
   * (6) headline sentence (one of three states) ->
   * (7) caveat line (mandatory, every state) + page-number footer.
   *
   * F1 (k<2) and F2 (all seven medians 0) share this SAME code path — F1
   * skips step (4)+(5) via `hasProjection`, F2 renders seven real CALM bars
   * and seven real `0` numerals through the ordinary tier/numeral path
   * (F3's `M===0` guard inside `tierFor` handles the geometry; the headline
   * branch below handles the copy). Neither is a separate branch of the
   * renderer — both are "the correct projection", not a fallback.
   */
  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";

    const { k, medians } = computeWeekdayMedians(data.contributionCalendar);
    const hasProjection = k >= 2;
    const M = hasProjection ? Math.max(0, ...medians) : 0;
    const busiestIndex = hasProjection ? busiestWeekdayIndex(medians) : 0;
    const busiestMedian = hasProjection ? (medians[busiestIndex] ?? 0) : 0;
    const allZero = hasProjection && M === 0;
    const numeralFill = numeralFillFor(theme).fill;

    let markup = "";

    // (1) Title, disclosure eyebrow (mandatory, every state — F4: prints
    // the REAL k, never a hardcoded 12), hairline.
    const title = language === "zh-TW" ? titleZh : titleEn;
    assertSlotBudget("card title", title, measureAdvanceWidth(contentFont, title, T3_SIZE), CARD_TITLE_BUDGET_PX);
    markup += contentText(contentFont, title, PADDING, TITLE_Y, theme.ink, `the-forecast title (${language})`);

    const eyebrowText = eyebrowTextFor(k, hasProjection, language);
    const eyebrowWidth = language === "zh-TW" ? zhLabelWidth(eyebrowText) : eyebrowLabelWidth(eyebrowText);
    assertSlotBudget("disclosure eyebrow", eyebrowText, eyebrowWidth, DISCLOSURE_EYEBROW_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(eyebrowText, PADDING, EYEBROW_Y, theme.muted)
        : eyebrowLabel(eyebrowText, PADDING, EYEBROW_Y, theme.muted);

    markup += `<line x1="${PADDING}" y1="${RULE_Y}" x2="${RIGHT_EDGE_X}" y2="${RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (2) The dashed panel (Rule C-2): border + six interior column
    // separators. No solid rule appears anywhere inside the panel — the
    // card's only solid line is the header hairline above (chrome, not
    // data). Always renders, in every state.
    markup += `<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="none" stroke="${theme.rule}" stroke-width="1" stroke-dasharray="3 3"/>`;
    for (let i = 1; i <= 6; i++) {
      const x = (PANEL_X + COL_W * i).toFixed(2);
      markup += `<line x1="${x}" y1="${PANEL_Y}" x2="${x}" y2="${PANEL_Y + PANEL_H}" stroke="${theme.rule}" stroke-width="0.5" stroke-dasharray="2 3"/>`;
    }

    // (3) Seven weekday headers, centred. Always renders, in every state
    // (F1 renders headers with no glyph and no numeral below them).
    for (let i = 0; i < 7; i++) {
      const cx = colCenter(i);
      const label = language === "zh-TW" ? weekdayHeadersZh[i]! : weekdayHeadersEn[i]!;
      const labelWidth = language === "zh-TW" ? zhLabelWidth(label) : eyebrowLabelWidth(label);
      assertSlotBudget(`weekday header ${i}`, label, labelWidth, WEEKDAY_HEADER_BUDGET_PX);
      markup += centeredLabel(label, language, cx, WEEKDAY_LABEL_Y, theme.muted);
    }

    // (4) Weather glyphs — SKIPPED ENTIRELY when k < 2 (F1: "no glyphs, no
    // numerals"). When a projection exists (F2 included), every column
    // renders a real glyph.
    if (hasProjection) {
      for (let i = 0; i < 7; i++) {
        const cx = colCenter(i);
        const tier = tierFor(medians[i]!, M);
        markup += renderWeatherGlyph(tier, cx, theme);
      }

      // (5) Seven projected numerals, wrapped in a SINGLE <g fill="...">
      // group — Rule C-2's fill is one per-render decision
      // (numeralFillFor(theme)), not seven independent ones, so the group
      // wrapper states that structurally and is what a test asserts against
      // (the g's fill === the theme's decided numeralFillFor result).
      let numeralGroup = "";
      for (let i = 0; i < 7; i++) {
        const cx = colCenter(i);
        const m = medians[i]!;
        const numeralText = String(m);
        const numeralWidth = measureAdvanceWidth("mono-semibold", numeralText, T3_SIZE);
        assertSlotBudget(`projected numeral ${i}`, numeralText, numeralWidth, NUMERAL_BUDGET_PX);
        numeralGroup += centeredMonoNumeralPath(numeralText, cx, NUMERAL_Y, `the-forecast numeral ${i}`);
      }
      markup += `<g fill="${numeralFill}">${numeralGroup}</g>`;
    }

    // (6) Headline — one of three states, decided by the same hasProjection
    // / allZero flags used above (never a fourth branch).
    const busiestWeekdayName =
      language === "zh-TW" ? weekdayFullNamesZh[busiestIndex]! : weekdayFullNamesEn[busiestIndex]!;
    const headline = headlineTextFor(hasProjection, allZero, busiestWeekdayName, busiestMedian, language);
    assertSlotBudget("headline", headline, measureAdvanceWidth(contentFont, headline, T3_SIZE), HEADLINE_BUDGET_PX);
    markup += contentText(contentFont, headline, PADDING, HEADLINE_Y, theme.ink, `the-forecast headline (${language})`);

    // (7) Caveat line (mandatory, EVERY state, both languages, never
    // truncated) + page-number footer, right-aligned on the same baseline
    // (absent-means-emit-nothing — inherited Phase 3 contract, F7).
    const caveat = language === "zh-TW" ? caveatZh : caveatEn;
    const caveatWidth = language === "zh-TW" ? zhLabelWidth(caveat) : eyebrowLabelWidth(caveat);
    assertSlotBudget("caveat", caveat, caveatWidth, CAVEAT_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(caveat, PADDING, CAVEAT_Y, theme.muted)
        : eyebrowLabel(caveat, PADDING, CAVEAT_Y, theme.muted);

    if (opts.pageNumber !== undefined && opts.totalPages !== undefined) {
      const pageText =
        language === "zh-TW"
          ? pageFooterZh(opts.pageNumber, opts.totalPages)
          : pageFooterEn(opts.pageNumber, opts.totalPages);
      const pageWidth = language === "zh-TW" ? zhLabelWidth(pageText) : eyebrowLabelWidth(pageText);
      markup +=
        language === "zh-TW"
          ? zhLabel(pageText, RIGHT_EDGE_X - pageWidth, CAVEAT_Y, theme.muted)
          : eyebrowLabel(pageText, RIGHT_EDGE_X - pageWidth, CAVEAT_Y, theme.muted);
    }

    return markup;
  },
};
