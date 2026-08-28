import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import {
  bandLabelEn,
  bandLabelZh,
  emptyStateEn,
  emptyStateZh,
  eyebrowEn,
  eyebrowZh,
  flatEn,
  flatZh,
  legendEn,
  legendZh,
  ohlcvLabelEnHigh,
  ohlcvLabelEnLow,
  ohlcvLabelEnOpen,
  ohlcvLabelEnVol,
  ohlcvLabelZhHigh,
  ohlcvLabelZhLow,
  ohlcvLabelZhOpen,
  ohlcvLabelZhVol,
  pageFooterEn,
  pageFooterZh,
  subLabelEn,
  subLabelZh,
} from "./copy.js";
import {
  assertSlotBudget,
  deriveSymbol,
  formatChange,
  formatTickerNumber,
  splitTickerValue,
  SUFFIX_SIZE_RATIO,
} from "./format.js";

/**
 * The Ticker / 行情 (CARD-07) — the catalogue's first chart with an axis.
 * Draws 12 months of development activity as OHLC candlesticks built on the
 * LEVEL series `L(d)` (a trailing 7-day contribution count), never on raw
 * single-day counts (06-UI-SPEC.md "The OHLC mapping — defined before it is
 * drawn"). Direction is carried by fill state (Rule C-3: filled = up,
 * hollow = down) and by ASCII `+`/`-` — never by hue, never by a triangle
 * glyph (both `▲`/`▼` are absent from every committed font subset and
 * banned project-wide for direction-encoding).
 */

// ---------------------------------------------------------------------------
// Geometry constants — each cites the UI-SPEC section that fixed the value
// (06-UI-SPEC.md "Card Layout 3 — The Ticker" "Canvas and geometry
// constants").
// ---------------------------------------------------------------------------

const CARD_WIDTH = 495;
const CARD_HEIGHT = 280;
const PADDING = 24;
const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471

const T1_SIZE = 8;
const T2_SIZE = 32;
/** T3-mono size (04-UI-SPEC.md's "T3-mono" pairing, reused verbatim here for
 * the ticker symbol — D-02's "all numerals route through IBM Plex Mono"
 * rule, extended by 04-UI-SPEC.md to this face/size pairing). */
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const TITLE_Y = 44;
const RULE_Y = 58;

const BAND_LABEL_Y = 88;
const CHANGE_Y = 92;
const BAND_VALUE_Y = 104;

const PANEL_X = 24;
const PANEL_Y = 120;
const PANEL_W = 447;
const PANEL_H = 88; // panel spans y 120..208

const PLOT_X0 = 32;
const PLOT_X1 = 463;
const PLOT_W = PLOT_X1 - PLOT_X0; // 431 (sm = 8 inset each side, x-axis only)

const PLOT_TOP = 136;
const PLOT_BOTTOM = 200;
const PLOT_RANGE = PLOT_BOTTOM - PLOT_TOP; // 64

const MONTHS = 12;
const COL_W = PLOT_W / MONTHS; // 35.916666...
const BODY_W = 11;
const DOJI_MIN_H = 1.5;

/** 200 - 64 * {0.25, 0.50, 0.75} = 184, 168, 152 (md = 16 apart, all on
 * grid) — listed top-to-bottom (drawing order) per the UI-SPEC's
 * composition diagram. */
const GRIDLINES_Y = [152, 168, 184];
const ZERO_LINE_Y = 200;

const AXIS_Y = 224;
const FOOTER_Y = 248;

/** OHLCV column origins (06-UI-SPEC.md "Canvas and geometry constants"). */
const OHLCV_X = { open: 24, high: 104, low: 184, vol: 256 };

// ---------------------------------------------------------------------------
// Text slot budgets (06-UI-SPEC.md "Text slot budgets — Ticker") — every
// one is a regression tripwire, checked via format.ts's assertSlotBudget
// before its corresponding path data is built. Not expected to fire for any
// engine-authored slot; the symbol slot is the one exception, and it is
// unreachable-by-construction (see deriveSymbol's doc in format.ts).
// ---------------------------------------------------------------------------

const SYMBOL_BUDGET_PX = 120;
const EYEBROW_BUDGET_PX = 200;
const CHANGE_FIGURE_BUDGET_PX = 150;
const CHANGE_SUBSTITUTE_BUDGET_PX = 150;
const BAND_LABEL_BUDGET_PX = 120;
const SUB_LABEL_BUDGET_PX = 160;
const OHLCV_VALUE_BUDGET_PX = 44;
const MONTH_AXIS_BUDGET_PX = 24;
const LEGEND_BUDGET_PX = 340;
const EMPTY_STATE_BUDGET_PX = 400;

// ---------------------------------------------------------------------------
// Chassis helpers — own copy, not imported (RENDER-02: adding/modifying a
// card must not require touching another card's private functions).
// Structurally identical to the-record/index.ts's and vitals/index.ts's own
// sets. This card deliberately does NOT import apiSourcedTextPathData or
// truncateToWidth for its chrome/copy strings — those are all
// engine-authored. The ticker SYMBOL is the one API-sourced text field on
// this card, and it ALSO goes through assertCoverage + textToPathData, not
// the placeholder path — see deriveSymbol's doc comment in format.ts and
// tickerSymbolText below for the full reasoning (prohibition 10's decision).
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
  assertCoverage("mono-semibold", upper, `the-ticker T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/** T1 label style for zh-TW text: Noto Serif TC, 8px, no uppercase
 * transform, no manual letter-spacing. */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `the-ticker T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/** T3 primary-content style: Source Serif 4 (en) / Noto Serif TC (zh-TW).
 * Used for the empty-state sentence and the FLAT/持平 change substitute. */
function contentText(fontName: string, text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage(fontName, text, context);
  const d = textToPathData(fontName, text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

/** T2 numeral style, left-aligned at (x, y) (D-02: every numeral routes
 * through IBM Plex Mono). Used for the change figure only — this card's
 * numeral never reaches the zh-TW 萬/億 magnitude (a percentage or a small
 * level delta), so no mixed-font split is needed here (unlike the OHLCV
 * band values, which do need one — see renderTickerValue below). */
function renderT2Value(text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage("mono-semibold", text, context);
  return pathElement(textToPathData("mono-semibold", text, x, y, T2_SIZE), fill);
}

/**
 * The ticker symbol: T3-mono, no letter-spacing (letter-spacing at T3 would
 * need a token that does not exist — T1_LETTER_SPACING is a T1-only
 * constant, 06-UI-SPEC.md "Header row").
 *
 * Prohibition 10's decision, restated at the call site: `deriveSymbol`
 * (format.ts) transforms `data.login` into a string whose character set is
 * ALWAYS a subset of `[$A-Z0-9]` — guaranteed ASCII, guaranteed covered by
 * every committed font subset. That guarantee is what makes routing this
 * API-sourced field through the engine-authored fail-loud path
 * (assertCoverage + textToPathData) correct rather than reckless: the
 * degrade-to-placeholder path (apiSourcedTextPathData) exists for text
 * whose coverage is genuinely uncertain, and after deriveSymbol's transform
 * it is not. Calling apiSourcedTextPathData here would be a review finding
 * per the UI-SPEC.
 */
function tickerSymbolText(symbol: string, x: number, y: number, fill: string): string {
  assertCoverage("mono-semibold", symbol, "the-ticker symbol");
  return pathElement(textToPathData("mono-semibold", symbol, x, y, T3_SIZE), fill);
}

/**
 * An OHLCV band value: mixed-font draw sharing `splitTickerValue`'s split
 * with format.ts's own `measureTickerValueWidth` slot-budget check — the
 * SAME function, not a second independent implementation of the same math
 * (02-02's documented lesson: two copies of the same math have a
 * divergence day).
 */
function renderTickerValue(formatted: string, language: "en" | "zh-TW", x: number, y: number, fill: string): string {
  const split = splitTickerValue(formatted, language);
  assertCoverage("mono-semibold", split.digitsPart, `the-ticker OHLCV value digits: "${formatted}"`);
  let d = textToPathData("mono-semibold", split.digitsPart, x, y, T1_SIZE);
  if (split.suffixChar !== null) {
    assertCoverage("noto-tc", split.suffixChar, `the-ticker OHLCV value suffix: "${formatted}"`);
    d += textToPathData("noto-tc", split.suffixChar, x + split.digitsWidth, y, T1_SIZE * SUFFIX_SIZE_RATIO);
  }
  return pathElement(d, fill);
}

// ---------------------------------------------------------------------------
// Data interpretation — pure functions, exported for unit testing (same
// convention as the-record's exported bucketWeeks/grooveRadius/etc and
// vitals's exported computeVitalsWindow/dayAmplitude/etc).
// ---------------------------------------------------------------------------

/**
 * `L(d) = round(7 * (sum of count over W(d)) / |W(d)|)`, where `W(d)` is
 * the set of days in `[d-6, d]` that exist in the calendar (06-UI-SPEC.md
 * "The OHLC mapping — the mapping (locked)"). Implemented over the
 * calendar's own array indices — `contributionCalendar` is a contiguous
 * daily series (core/fetch.ts's normalized shape), so a trailing 7-index
 * window IS a trailing 7-day window. ONE formula, no special case, no
 * branch for the first six days: for index `i`, the window is
 * `[max(0, i-6), i]`, which is naturally narrower than 7 entries only for
 * `i < 6` — exactly where the normalisation (`7 * sum / windowSize` rather
 * than a bare running sum) prevents the earliest candle from being
 * artificially depressed by a missing lead-in.
 *
 * REJECTED ALTERNATIVE, recorded per the UI-SPEC's explicit instruction:
 * Open/Close as raw single-day counts. Rejected because a flow series's
 * single-day count is zero for most people on most days, so nearly every
 * candle would have a zero-height body and a full-range wick — noise
 * wearing a suit, not a chart. The level series above is what makes the
 * body meaningful.
 */
export function computeLevelSeries(calendar: { date: string; count: number }[]): number[] {
  const levels: number[] = [];
  let windowSum = 0;
  for (let i = 0; i < calendar.length; i++) {
    windowSum += calendar[i]!.count;
    if (i >= 7) {
      // The window is now full (7 entries) and about to gain an 8th —
      // drop the oldest entry so it stays exactly [i-6, i].
      windowSum -= calendar[i - 7]!.count;
    }
    const windowStart = Math.max(0, i - 6);
    const windowSize = i - windowStart + 1;
    levels.push(Math.round((7 * windowSum) / windowSize));
  }
  return levels;
}

/** One monthly OHLC candle (06-UI-SPEC.md "The mapping (locked)" table).
 * `monthKey` is the calendar's own "YYYY-MM" grouping key, exposed for
 * testing/debugging only — rendering uses only the array's position. */
export interface MonthlyCandle {
  monthKey: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Groups the level series into calendar-month buckets and takes AT MOST the
 * trailing 12 (06-UI-SPEC.md "for each of the 12 months ending with the
 * month containing the calendar's last day"). Per month: Open = L of the
 * month's first available day; High/Low = max/min L over the month; Close =
 * L of the month's last available day; Volume = the RAW count sum over the
 * month (a true flow-per-period, not a level).
 *
 * Fewer than 12 months of calendar history naturally yields fewer than 12
 * candles (T3) — no special case; the eyebrow (index.ts's renderBody)
 * prints the real count, never a hardcoded 12.
 */
export function computeMonthlyCandles(calendar: { date: string; count: number }[]): MonthlyCandle[] {
  if (calendar.length === 0) {
    return [];
  }
  const levels = computeLevelSeries(calendar);
  const monthOrder: string[] = [];
  const monthMap = new Map<string, { levels: number[]; volume: number }>();

  for (let i = 0; i < calendar.length; i++) {
    const key = calendar[i]!.date.slice(0, 7); // "YYYY-MM"
    let entry = monthMap.get(key);
    if (entry === undefined) {
      entry = { levels: [], volume: 0 };
      monthMap.set(key, entry);
      monthOrder.push(key);
    }
    entry.levels.push(levels[i]!);
    entry.volume += calendar[i]!.count;
  }

  const last12Keys = monthOrder.slice(-MONTHS);
  return last12Keys.map((key) => {
    const entry = monthMap.get(key)!;
    return {
      monthKey: key,
      open: entry.levels[0]!,
      close: entry.levels[entry.levels.length - 1]!,
      high: Math.max(...entry.levels),
      low: Math.min(...entry.levels),
      volume: entry.volume,
    };
  });
}

/**
 * `y(v) = PLOT_BOTTOM - (maxHigh === 0 ? 0 : v / maxHigh) * PLOT_RANGE`
 * (06-UI-SPEC.md "Level -> y"). The `maxHigh === 0` guard is the T2 guard —
 * same defensive shape as The Record's `maxWeekly === 0` / Vitals'
 * `maxCount === 0`: `v = 0` always lands on `ZERO_LINE_Y` (200) and, when
 * `maxHigh` itself is 0, EVERY level in the series is 0 too (High is a max
 * over non-negative levels), so the guard's `0` branch is consistent with
 * every candle actually being at the zero line — not an arbitrary fallback.
 */
export function levelToY(v: number, maxHigh: number): number {
  return PLOT_BOTTOM - (maxHigh === 0 ? 0 : v / maxHigh) * PLOT_RANGE;
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/** No `widgets.yml`-configurable options exist for this card (masthead/
 * the-record/vitals's `z.object({}).strict()` no-args precedent). */
const theTickerOptionsSchema = z.object({}).strict();

export const theTickerWidget: WidgetDefinition<RenderOptions> = {
  name: "the-ticker",
  // "identity" costs literally zero (core/fetch.ts already sends `user {
  // login ... }` unconditionally whenever any capability is requested, and
  // "calendar" already makes that set non-empty) — declared anyway so
  // data.login's dependency is legible to the next reader (06-UI-SPEC.md
  // "Widget registration", honest-declaration decision).
  requires: ["calendar", "identity"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      theTickerOptionsSchema.parse(value ?? {});
      return { now: new Date(), seed: 0, language: "en", timezone: "UTC" };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "行情卡片",
        desc: "把每個月的開發活躍度畫成十二根 K 線，水位是近七天的貢獻數，成交量是當月總數。",
      };
    }
    return {
      title: "The Ticker card",
      desc:
        "Draws 12 months of development activity as candlesticks, where the level is a trailing " +
        "7-day contribution count and volume is the month total.",
    };
  },

  /**
   * Composition, z-order (06-UI-SPEC.md "Card Layout 3 — Composition"):
   * (1) header (symbol + eyebrow + hairline) -> (2) quote band (band label,
   * change figure/substitute, sub-label, four OHLCV label/value pairs) ->
   * (3) chart (panel border, three dashed gridlines, zero line, per-candle
   * wick-then-body) -> (4) month axis (omitted entirely in T1) -> (5)
   * bottom row (legend/basis line OR the T1 empty-state sentence, plus the
   * page-number footer).
   */
  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";

    const calendar = data.contributionCalendar ?? [];
    const candles = computeMonthlyCandles(calendar);
    const maxHigh = candles.length === 0 ? 0 : Math.max(...candles.map((c) => c.high));
    const current = candles.length > 0 ? candles[candles.length - 1]! : null;
    const monthCount = candles.length;

    let markup = "";

    // (1) Header row: ticker symbol left, eyebrow right (both languages —
    // "Declared chrome deviation": the title slot holds a data-derived
    // symbol, not the card's name, so an en reader needs the eyebrow to
    // learn what the card is).
    const symbol = deriveSymbol(data.login);
    assertSlotBudget("ticker symbol", symbol, measureAdvanceWidth("mono-semibold", symbol, T3_SIZE), SYMBOL_BUDGET_PX);
    markup += tickerSymbolText(symbol, PADDING, TITLE_Y, theme.ink);

    const eyebrow = language === "zh-TW" ? eyebrowZh(monthCount) : eyebrowEn(monthCount);
    const eyebrowWidth = language === "zh-TW" ? zhLabelWidth(eyebrow) : eyebrowLabelWidth(eyebrow);
    assertSlotBudget("eyebrow", eyebrow, eyebrowWidth, EYEBROW_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(eyebrow, RIGHT_EDGE_X - eyebrowWidth, TITLE_Y, theme.muted)
        : eyebrowLabel(eyebrow, RIGHT_EDGE_X - eyebrowWidth, TITLE_Y, theme.muted);

    markup += `<line x1="${PADDING}" y1="${RULE_Y}" x2="${RIGHT_EDGE_X}" y2="${RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (2) Quote band.
    const bandLabel = language === "zh-TW" ? bandLabelZh : bandLabelEn;
    const bandLabelWidth = language === "zh-TW" ? zhLabelWidth(bandLabel) : eyebrowLabelWidth(bandLabel);
    assertSlotBudget("band label", bandLabel, bandLabelWidth, BAND_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(bandLabel, PADDING, BAND_LABEL_Y, theme.muted)
        : eyebrowLabel(bandLabel, PADDING, BAND_LABEL_Y, theme.muted);

    // T1 (no calendar at all) reads open=0/close=0 -> formatChange's own
    // FLAT branch fires with no special case here; T2 (all-zero, but a
    // real candle exists) is the SAME "open===0 && close===0" branch,
    // reached naturally by the formula rather than by a distinct check.
    const change = formatChange(current?.open ?? 0, current?.close ?? 0);
    if (change.kind === "flat") {
      const flatText = language === "zh-TW" ? flatZh : flatEn;
      const flatWidth = measureAdvanceWidth(contentFont, flatText, T3_SIZE);
      assertSlotBudget("change substitute", flatText, flatWidth, CHANGE_SUBSTITUTE_BUDGET_PX);
      markup += contentText(
        contentFont,
        flatText,
        RIGHT_EDGE_X - flatWidth,
        CHANGE_Y,
        theme.muted,
        `the-ticker change substitute (${language})`,
      );
    } else {
      const changeWidth = measureAdvanceWidth("mono-semibold", change.text, T2_SIZE);
      assertSlotBudget("change figure", change.text, changeWidth, CHANGE_FIGURE_BUDGET_PX);
      markup += renderT2Value(
        change.text,
        RIGHT_EDGE_X - changeWidth,
        CHANGE_Y,
        theme.accent,
        "the-ticker change figure",
      );
    }

    const subLabel = language === "zh-TW" ? subLabelZh : subLabelEn;
    const subLabelWidth = language === "zh-TW" ? zhLabelWidth(subLabel) : eyebrowLabelWidth(subLabel);
    assertSlotBudget("sub-label", subLabel, subLabelWidth, SUB_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(subLabel, RIGHT_EDGE_X - subLabelWidth, BAND_VALUE_Y, theme.muted)
        : eyebrowLabel(subLabel, RIGHT_EDGE_X - subLabelWidth, BAND_VALUE_Y, theme.muted);

    // Four OHLCV label/value pairs: label muted, then sm (8px) gap, then
    // value ink. T1 (no candle) reads all four as 0.
    const ohlcv: { x: number; labelEn: string; labelZh: string; value: number }[] = [
      { x: OHLCV_X.open, labelEn: ohlcvLabelEnOpen, labelZh: ohlcvLabelZhOpen, value: current?.open ?? 0 },
      { x: OHLCV_X.high, labelEn: ohlcvLabelEnHigh, labelZh: ohlcvLabelZhHigh, value: current?.high ?? 0 },
      { x: OHLCV_X.low, labelEn: ohlcvLabelEnLow, labelZh: ohlcvLabelZhLow, value: current?.low ?? 0 },
      { x: OHLCV_X.vol, labelEn: ohlcvLabelEnVol, labelZh: ohlcvLabelZhVol, value: current?.volume ?? 0 },
    ];
    for (const field of ohlcv) {
      const label = language === "zh-TW" ? field.labelZh : field.labelEn;
      const labelWidth = language === "zh-TW" ? zhLabelWidth(label) : eyebrowLabelWidth(label);
      markup +=
        language === "zh-TW"
          ? zhLabel(label, field.x, BAND_VALUE_Y, theme.muted)
          : eyebrowLabel(label, field.x, BAND_VALUE_Y, theme.muted);

      const formattedValue = formatTickerNumber(field.value, language);
      const valueWidth = splitTickerValue(formattedValue, language).totalWidth;
      assertSlotBudget("OHLCV value", formattedValue, valueWidth, OHLCV_VALUE_BUDGET_PX);
      markup += renderTickerValue(formattedValue, language, field.x + labelWidth + 8, BAND_VALUE_Y, theme.ink);
    }

    // (3) The chart.
    markup += `<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="none" stroke="${theme.rule}" stroke-width="1"/>`;

    for (const y of GRIDLINES_Y) {
      markup += `<line x1="${PLOT_X0}" y1="${y}" x2="${PLOT_X1}" y2="${y}" stroke="${theme.rule}" stroke-width="0.5" stroke-dasharray="2 3"/>`;
    }

    markup += `<line x1="${PLOT_X0}" y1="${ZERO_LINE_Y}" x2="${PLOT_X1}" y2="${ZERO_LINE_Y}" stroke="${theme.rule}" stroke-width="0.5"/>`;

    candles.forEach((candle, i) => {
      // Right-aligned into the newest columns when monthCount < 12 (T3) —
      // COL_W is always computed over the fixed 12, so column geometry
      // never shifts; only the starting column index does.
      const colIndex = MONTHS - monthCount + i;
      const cx = PLOT_X0 + COL_W * (colIndex + 0.5);

      const highY = levelToY(candle.high, maxHigh);
      const lowY = levelToY(candle.low, maxHigh);
      markup += `<line x1="${cx.toFixed(2)}" y1="${highY.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${lowY.toFixed(2)}" stroke="${theme.ink}" stroke-width="1"/>`;

      const openY = levelToY(candle.open, maxHigh);
      const closeY = levelToY(candle.close, maxHigh);
      const bodyHeightPx = Math.abs(openY - closeY);
      const bodyX = (cx - BODY_W / 2).toFixed(2);

      if (bodyHeightPx < DOJI_MIN_H) {
        // Doji: body too thin to meaningfully encode direction — a solid
        // bar, direction deliberately NOT encoded (matches real
        // candlestick practice; documented in 06-UI-SPEC.md and pinned by
        // T5's boundary test).
        markup += `<rect x="${bodyX}" y="${(openY - 0.75).toFixed(2)}" width="${BODY_W}" height="${DOJI_MIN_H}" fill="${theme.ink}"/>`;
      } else if (candle.close > candle.open) {
        // Rule C-3: up -> filled ink body, no stroke.
        markup += `<rect x="${bodyX}" y="${closeY.toFixed(2)}" width="${BODY_W}" height="${(openY - closeY).toFixed(2)}" fill="${theme.ink}"/>`;
      } else {
        // Rule C-3: down -> hollow paper body, ink stroke.
        markup += `<rect x="${bodyX}" y="${openY.toFixed(2)}" width="${BODY_W}" height="${(closeY - openY).toFixed(2)}" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="1"/>`;
      }
    });

    // (4) Month axis — omitted entirely in T1 (no calendar at all). Twelve
    // generic column-position numerals 1..12 (NOT literal calendar month
    // numbers — 06-UI-SPEC.md "deliberate simplification of the sketch"),
    // eleven muted, the rightmost (the current, still-forming month's
    // column, which candles always right-align into) accent.
    if (monthCount > 0) {
      for (let i = 0; i < MONTHS; i++) {
        const numeral = String(i + 1);
        const cx = PLOT_X0 + COL_W * (i + 0.5);
        const width = measureAdvanceWidth("mono-semibold", numeral, T1_SIZE);
        assertSlotBudget("month-axis numeral", numeral, width, MONTH_AXIS_BUDGET_PX);
        const fill = i === MONTHS - 1 ? theme.accent : theme.muted;
        assertCoverage("mono-semibold", numeral, "the-ticker month-axis numeral");
        markup += pathElement(textToPathData("mono-semibold", numeral, cx - width / 2, AXIS_Y, T1_SIZE), fill);
      }
    }

    // (5) Bottom row: legend + basis line (T1's empty-state sentence
    // REPLACES it, never adds to it — 06-UI-SPEC.md Degenerate States T1),
    // page-number footer (absent-means-emit-nothing, Phase 3 contract).
    if (monthCount === 0) {
      const emptyText = language === "zh-TW" ? emptyStateZh : emptyStateEn;
      const emptyWidth = measureAdvanceWidth(contentFont, emptyText, T3_SIZE);
      assertSlotBudget("empty-state sentence", emptyText, emptyWidth, EMPTY_STATE_BUDGET_PX);
      markup += contentText(
        contentFont,
        emptyText,
        PADDING,
        FOOTER_Y,
        theme.ink,
        `the-ticker empty-state sentence (${language})`,
      );
    } else {
      const legend = language === "zh-TW" ? legendZh : legendEn;
      const legendWidth = language === "zh-TW" ? zhLabelWidth(legend) : eyebrowLabelWidth(legend);
      assertSlotBudget("legend", legend, legendWidth, LEGEND_BUDGET_PX);
      markup +=
        language === "zh-TW"
          ? zhLabel(legend, PADDING, FOOTER_Y, theme.muted)
          : eyebrowLabel(legend, PADDING, FOOTER_Y, theme.muted);
    }

    if (opts.pageNumber !== undefined && opts.totalPages !== undefined) {
      const pageText =
        language === "zh-TW" ? pageFooterZh(opts.pageNumber, opts.totalPages) : pageFooterEn(opts.pageNumber, opts.totalPages);
      const pageWidth = language === "zh-TW" ? zhLabelWidth(pageText) : eyebrowLabelWidth(pageText);
      markup +=
        language === "zh-TW"
          ? zhLabel(pageText, RIGHT_EDGE_X - pageWidth, FOOTER_Y, theme.muted)
          : eyebrowLabel(pageText, RIGHT_EDGE_X - pageWidth, FOOTER_Y, theme.muted);
    }

    return markup;
  },
};
