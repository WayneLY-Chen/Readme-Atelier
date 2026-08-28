import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
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
import { assertSlotBudget, formatDailyMean } from "./format.js";

/**
 * Phase 6's tracer (06-01): the first, and this phase's only, animated
 * card. Draws the trailing 28 days of `data.contributionCalendar` as an ECG
 * trace (06-UI-SPEC.md "Card Layout 1 — Vitals / 生命徵象", CARD-05).
 */

// ---------------------------------------------------------------------------
// Geometry constants — each cites the UI-SPEC section that fixed the value
// (06-UI-SPEC.md "Card Layout 1 — Vitals" "Canvas and geometry constants").
// ---------------------------------------------------------------------------

const CARD_WIDTH = 495;
const CARD_HEIGHT = 272;
const PADDING = 24;
const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471

const T1_SIZE = 8;
const T2_SIZE = 32;
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const HEADER_TITLE_BASELINE_Y = 44;
const HEADER_RULE_Y = 58;

const PANEL_X = 24;
const PANEL_Y = 72;
const PANEL_W = 447;
const PANEL_H = 88; // panel spans y 72..160

const PLOT_X0 = 32;
const PLOT_X1 = 463;
const PLOT_W = PLOT_X1 - PLOT_X0; // 431 (sm = 8 inset each side)
const WINDOW_DAYS = 28;
const DAY_W = PLOT_W / WINDOW_DAYS; // 15.392857...
const BASELINE_Y = 116; // isoelectric line, the panel's vertical midpoint
const R_MAX = 36; // maximum upward R-wave deflection
const R_MIN = 6; // minimum upward deflection for any day with count > 0
const Q_RATIO = 0.12; // downward deflection, as a fraction of the day's R height
const S_RATIO = 0.45; // downward deflection, as a fraction of the day's R height
const GRID_Y = [96, 136]; // BASELINE_Y +/- 20; each is lg (24) inside a panel edge
/** GRID_X = PLOT_X0 + DAY_W * {7, 14, 21} — the three interior week
 * separators produce four week columns. */
const GRID_X = [7, 14, 21].map((weeks) => PLOT_X0 + DAY_W * weeks);
const PULSE_R = 3.5;
const PULSE_CX = PLOT_X1;
const PULSE_CY = BASELINE_Y;

const STAT_LABEL_Y = 184;
const STAT_VALUE_Y = 216;
const FOOTER_Y = 240;
const COL1_X = 24;
const COL2_X = 176;

// ---------------------------------------------------------------------------
// Text slot budgets (06-UI-SPEC.md "Text slot budgets" — Vitals table) —
// every one is a regression tripwire, checked via format.ts's
// assertSlotBudget before its corresponding path data is built. Not
// expected to fire: every string on this card is engine-authored, so
// RENDER-05's fail-loud policy applies in full.
// ---------------------------------------------------------------------------

const CARD_TITLE_BUDGET_PX = 200;
const ZH_EYEBROW_BUDGET_PX = 120;
const STAT_LABEL_BUDGET_PX = 140; // stat label, col 1-2
const STAT_VALUE_BUDGET_PX = 140; // stat value, col 1-2
const STAT3_LABEL_BUDGET_PX = 100; // stat label, col 3 (right-aligned)
const STATUS_WORD_BUDGET_PX = 120;
const WINDOW_CAPTION_BUDGET_PX = 240;

// ---------------------------------------------------------------------------
// Animation constants (06-UI-SPEC.md "Animation Contract" literals).
// ---------------------------------------------------------------------------

const PULSE_NAME = "atelier-vitals-pulse";
const PULSE_DURATION_S = 1.6;

// ---------------------------------------------------------------------------
// Module-scope invariant throws (06-UI-SPEC.md "Extent check") — a bad
// geometry constant fails at IMPORT time, never silently at render time
// (same convention as the-record/index.ts's tonearm-reachability check).
// ---------------------------------------------------------------------------

if (!(BASELINE_Y - R_MAX >= PANEL_Y + 8)) {
  throw new Error(
    `vitals: R-wave headroom invariant violated — BASELINE_Y=${BASELINE_Y}, R_MAX=${R_MAX}, PANEL_Y=${PANEL_Y}`,
  );
}
if (!(BASELINE_Y + S_RATIO * R_MAX <= PANEL_Y + PANEL_H)) {
  throw new Error(
    `vitals: S-wave clearance invariant violated — BASELINE_Y=${BASELINE_Y}, S_RATIO=${S_RATIO}, R_MAX=${R_MAX}, ` +
      `PANEL_Y=${PANEL_Y}, PANEL_H=${PANEL_H}`,
  );
}

// ---------------------------------------------------------------------------
// Chassis helpers — own copy, not imported (RENDER-02: adding/modifying a
// card must not require touching another card's private functions).
// Structurally identical to the-record/index.ts's own set. This card
// deliberately does NOT import apiSourcedTextPathData or truncateToWidth —
// every string here is engine-authored, so only the assertCoverage +
// textToPathData fail-loud path applies.
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
    cursorX +=
      measureAdvanceWidth(fontName, ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return d;
}

function letterSpacedWidth(
  fontName: string,
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
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
  assertCoverage("mono-semibold", upper, `vitals T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/** T1 label style for zh-TW text: Noto Serif TC, 8px, no uppercase
 * transform, no manual letter-spacing. */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `vitals T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/** T3 primary-content style: Source Serif 4 (en) / Noto Serif TC (zh-TW). */
function contentText(fontName: string, text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage(fontName, text, context);
  const d = textToPathData(fontName, text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

/** T2 numeral style, left-aligned at (x, y) (D-02: every numeral routes
 * through IBM Plex Mono). Unlike The Record's `renderNumeral`, this card
 * never needs the zh-TW 萬/億 mixed-font split — `DAILY MEAN` and `CURRENT
 * STREAK` never reach that magnitude over a 28-day window. */
function renderT2Value(text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage("mono-semibold", text, context);
  return pathElement(textToPathData("mono-semibold", text, x, y, T2_SIZE), fill);
}

// ---------------------------------------------------------------------------
// Data interpretation — pure functions, exported for unit testing (same
// convention as the-record's exported busiestElapsedWeek/bucketWeeks/etc).
// ---------------------------------------------------------------------------

/**
 * The trailing WINDOW_DAYS entries of `contributionCalendar`, right-aligned
 * (06-UI-SPEC.md "The ECG trace — Window"): the newest recorded day always
 * occupies the rightmost slot. `n = min(28, calendar.length)`; `recorded`
 * has length `n` and holds the counts of the `n` most recent days, oldest
 * first — `recorded[recorded.length - 1]` is always the newest day.
 */
export function computeVitalsWindow(
  calendar: { date: string; count: number }[] | undefined,
): { n: number; recorded: number[] } {
  const cal = calendar ?? [];
  const n = Math.min(WINDOW_DAYS, cal.length);
  const recorded = cal.slice(cal.length - n).map((d) => d.count);
  return { n, recorded };
}

/**
 * `h = c === 0 ? 0 : R_MIN + t * (R_MAX - R_MIN)`, `t = maxCount === 0 ? 0 :
 * c / maxCount` (06-UI-SPEC.md "The ECG trace — Amplitude"). The
 * `maxCount === 0` guard is the same defensive shape as The Record's
 * `maxWeekly === 0` / The Graveyard's `maxLifespan === 0` (V4).
 */
export function dayAmplitude(c: number, maxCount: number): number {
  if (c === 0) {
    return 0;
  }
  const t = maxCount === 0 ? 0 : c / maxCount;
  return R_MIN + t * (R_MAX - R_MIN);
}

/**
 * The single day's vertex list (06-UI-SPEC.md "The ECG trace — Vertices"),
 * for slot `i` (0-indexed within the 28-day window) with count `c`. Every
 * day begins and ends exactly on the isoelectric line `BASELINE_Y`, so
 * consecutive days concatenate into one continuous, seamless polyline.
 */
export function dayVertices(i: number, c: number, maxCount: number): [number, number][] {
  const x0 = PLOT_X0 + i * DAY_W;
  const w = DAY_W;
  const b = BASELINE_Y;
  if (c === 0) {
    return [
      [x0, b],
      [x0 + w, b],
    ];
  }
  const h = dayAmplitude(c, maxCount);
  return [
    [x0, b],
    [x0 + 0.28 * w, b],
    [x0 + 0.36 * w, b + Q_RATIO * h],
    [x0 + 0.46 * w, b - h],
    [x0 + 0.58 * w, b + S_RATIO * h],
    [x0 + 0.7 * w, b],
    [x0 + w, b],
  ];
}

/**
 * Streak rule, exactly one grace day (06-UI-SPEC.md "Stat row — Streak
 * rule", documented in full in copy.ts): if the most recently recorded day
 * has count 0, the streak counts from the day before it instead. `recorded`
 * is the right-aligned window's count array (oldest first, per
 * computeVitalsWindow); `recorded.length === 0` returns 0 immediately (V1).
 */
export function computeStreak(recorded: number[]): number {
  let i = recorded.length - 1;
  if (i < 0) {
    return 0;
  }
  if (recorded[i] === 0) {
    i--;
  }
  let streak = 0;
  while (i >= 0 && recorded[i]! > 0) {
    streak++;
    i--;
  }
  return streak;
}

export type VitalsStatus = "FLATLINE" | "FAINT" | "STEADY" | "RAPID";

/**
 * Status ladder (06-UI-SPEC.md "Stat row — Status ladder"), driven by
 * `activeDays` — the count of recorded days with count > 0 — never by `n`
 * itself, so a brand-new account's short window cannot be pushed into a
 * higher tier by the thresholds alone.
 */
export function statusTier(activeDays: number): VitalsStatus {
  if (activeDays === 0) {
    return "FLATLINE";
  }
  if (activeDays <= 9) {
    return "FAINT";
  }
  if (activeDays <= 20) {
    return "STEADY";
  }
  return "RAPID";
}

/** Exported for direct unit testing (index.test.ts) — the rendered SVG's
 * status word is emitted as path data, so this is the only way to assert
 * the exact copy string chosen for a given status/language pair without
 * OCR-ing the render output. */
export function statusWordFor(status: VitalsStatus, language: "en" | "zh-TW"): string {
  const table: Record<VitalsStatus, { en: string; zh: string }> = {
    FLATLINE: { en: statusFlatlineEn, zh: statusFlatlineZh },
    FAINT: { en: statusFaintEn, zh: statusFaintZh },
    STEADY: { en: statusSteadyEn, zh: statusSteadyZh },
    RAPID: { en: statusRapidEn, zh: statusRapidZh },
  };
  return language === "zh-TW" ? table[status].zh : table[status].en;
}

/** Window caption, chosen by `n` (06-UI-SPEC.md "Bottom row" / "Vitals
 * chrome strings"): full window, partial window, or no recording at all.
 * Exported for direct unit testing — see statusWordFor's comment above for
 * why (the rendered caption is path data, not inspectable text). */
export function windowCaptionFor(n: number, language: "en" | "zh-TW"): string {
  if (n === WINDOW_DAYS) {
    return language === "zh-TW" ? windowCaptionFullZh : windowCaptionFullEn;
  }
  if (n === 0) {
    return language === "zh-TW" ? windowCaptionEmptyZh : windowCaptionEmptyEn;
  }
  return language === "zh-TW" ? windowCaptionPartialZh(n) : windowCaptionPartialEn(n);
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/** No `widgets.yml`-configurable options exist for this card
 * (masthead/the-record's `z.object({}).strict()` no-args precedent). */
const vitalsOptionsSchema = z.object({}).strict();

export const vitalsWidget: WidgetDefinition<RenderOptions> = {
  name: "vitals",
  requires: ["calendar"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      vitalsOptionsSchema.parse(value ?? {});
      return { now: new Date(), seed: 0, language: "en", timezone: "UTC" };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "生命徵象卡片",
        desc: "把最近二十八天的每日貢獻畫成心電圖，每一天一個波形，沒有貢獻的日子維持水平線。",
      };
    }
    return {
      title: "Vitals card",
      desc:
        "Draws the last 28 days of daily contributions as an ECG trace, one complex per day, " +
        "with a flat line on days with no contributions.",
    };
  },

  /**
   * Composition, z-order (06-UI-SPEC.md "Card Layout 1 — Vitals —
   * Composition"): header + hairline -> the widget's own <style> -> panel
   * border -> two horizontal minor grid lines -> three vertical week
   * separators -> isoelectric line -> unrecorded-segment dashed rule line
   * (Rule C-1) -> the ECG polyline -> the pulse dot -> stat row -> bottom
   * row (caption left, page-number footer right).
   */
  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";

    const { n, recorded } = computeVitalsWindow(data.contributionCalendar);
    const maxCount = Math.max(0, ...recorded);
    // V4b guard: the mean is defined over the n RECORDED days, never over
    // 28 — n === 0 is a 0/0 divide that would otherwise print "NaN".
    const mean = n === 0 ? 0 : recorded.reduce((sum, c) => sum + c, 0) / n;
    const activeDays = recorded.filter((c) => c > 0).length;
    const streak = computeStreak(recorded);
    const status = statusTier(activeDays);

    let markup = "";

    // (1) Header row: title left-aligned; zh-TW-only untranslated Latin
    // eyebrow, right-aligned; hairline rule.
    const title = language === "zh-TW" ? titleZh : titleEn;
    assertSlotBudget("card title", title, measureAdvanceWidth(contentFont, title, T3_SIZE), CARD_TITLE_BUDGET_PX);
    markup += contentText(contentFont, title, PADDING, HEADER_TITLE_BASELINE_Y, theme.ink, `vitals title (${language})`);

    if (language === "zh-TW") {
      const eyebrowWidth = eyebrowLabelWidth(eyebrowZh);
      assertSlotBudget("zh-TW eyebrow", eyebrowZh, eyebrowWidth, ZH_EYEBROW_BUDGET_PX);
      markup += eyebrowLabel(eyebrowZh, RIGHT_EDGE_X - eyebrowWidth, HEADER_TITLE_BASELINE_Y, theme.muted);
    }

    markup += `<line x1="${PADDING}" y1="${HEADER_RULE_Y}" x2="${RIGHT_EDGE_X}" y2="${HEADER_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (2) The widget's own <style> — exactly one @keyframes block and one
    // class rule (the same precedent as the-record/index.ts's spin style).
    // Emitted unconditionally, the same "same code path, only a
    // conditional class attribute" discipline the-record uses for its
    // zero-state — never SMIL, and the animation shorthand sets
    // non-important longhands, so the chassis REDUCED_MOTION_STYLE block
    // (emitted before this markup, but carrying !important) is the
    // complete RENDER-06 mechanism. No change to svg.ts required.
    markup +=
      `<style>@keyframes ${PULSE_NAME}{0%{opacity:1}45%{opacity:0.2}100%{opacity:1}}` +
      `.${PULSE_NAME}{animation:${PULSE_NAME} ${PULSE_DURATION_S}s ease-in-out infinite}</style>`;

    // (3) Panel border.
    markup += `<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" fill="none" stroke="${theme.rule}" stroke-width="1"/>`;

    // (4) Two horizontal minor grid lines.
    for (const y of GRID_Y) {
      markup += `<line x1="${PADDING}" y1="${y}" x2="${RIGHT_EDGE_X}" y2="${y}" stroke="${theme.rule}" stroke-width="0.5" stroke-opacity="0.6"/>`;
    }

    // (5) Three vertical week separators — four week columns.
    for (const x of GRID_X) {
      markup += `<line x1="${x.toFixed(2)}" y1="${PANEL_Y}" x2="${x.toFixed(2)}" y2="${PANEL_Y + PANEL_H}" stroke="${theme.rule}" stroke-width="0.5" stroke-opacity="0.6"/>`;
    }

    // (6) Isoelectric reference line, drawn under the trace so flat
    // segments read as sitting ON a baseline rather than floating.
    markup += `<line x1="${PLOT_X0}" y1="${BASELINE_Y}" x2="${PLOT_X1}" y2="${BASELINE_Y}" stroke="${theme.rule}" stroke-width="0.5" stroke-opacity="0.6"/>`;

    // (7) Unrecorded-segment dashed rule line (Rule C-1) — drawn ONLY when
    // n < 28. Slots 0..27-n carry no polyline vertices at all; this single
    // dashed line is the entire "we have no data here" signal, distinct
    // from a solid accent flat segment ("we measured zero").
    if (n < WINDOW_DAYS) {
      const dashEndX = PLOT_X0 + (WINDOW_DAYS - n) * DAY_W;
      markup += `<line x1="${PLOT_X0}" y1="${BASELINE_Y}" x2="${dashEndX.toFixed(2)}" y2="${BASELINE_Y}" stroke="${theme.rule}" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // (8) The ECG trace — a single <polyline>, present only when n > 0.
    // Consecutive days share their boundary point (each day starts and
    // ends on BASELINE_Y), so the shared point is emitted once, not
    // duplicated.
    if (n > 0) {
      const points: string[] = [];
      for (let i = 0; i < n; i++) {
        const slotIndex = WINDOW_DAYS - n + i;
        const c = recorded[i]!;
        const verts = dayVertices(slotIndex, c, maxCount);
        for (let j = 0; j < verts.length; j++) {
          if (i > 0 && j === 0) {
            continue; // shared with the previous day's final vertex
          }
          const [px, py] = verts[j]!;
          points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
        }
      }
      markup += `<polyline points="${points.join(" ")}" fill="none" stroke="${theme.accent}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    // (9) The pulse dot — drawn last (of the trace layer) so it sits above
    // the polyline. No opacity/fill-opacity/style attribute of its own:
    // REDUCED_MOTION_STYLE sets no animation-fill-mode, so a collapsed
    // animation returns this element to its BASE style, not its final
    // keyframe — the base style must already be its correct resting
    // appearance (06-UI-SPEC.md "Reduced motion — the resting-state rule").
    // Animates only when n > 0 AND status !== FLATLINE; a recorded
    // flatline (n === 28, every count 0) draws a static rule-colored dot
    // with no class; n === 0 draws no dot at all.
    if (n > 0) {
      if (status !== "FLATLINE") {
        markup += `<circle cx="${PULSE_CX}" cy="${PULSE_CY}" r="${PULSE_R}" fill="${theme.accent}" class="${PULSE_NAME}"/>`;
      } else {
        markup += `<circle cx="${PULSE_CX}" cy="${PULSE_CY}" r="${PULSE_R}" fill="${theme.rule}"/>`;
      }
    }

    // (10) Stat row — three columns, T1 label (muted) over T2/T2/T3 value
    // (ink). Columns 1-2 left-aligned; column 3 right-aligned to
    // RIGHT_EDGE_X.
    const stat1Label = language === "zh-TW" ? stat1LabelZh : stat1LabelEn;
    const stat1LabelWidth = language === "zh-TW" ? zhLabelWidth(stat1Label) : eyebrowLabelWidth(stat1Label);
    assertSlotBudget("stat-1 label", stat1Label, stat1LabelWidth, STAT_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(stat1Label, COL1_X, STAT_LABEL_Y, theme.muted)
        : eyebrowLabel(stat1Label, COL1_X, STAT_LABEL_Y, theme.muted);

    const meanStr = formatDailyMean(mean);
    assertSlotBudget(
      "stat-1 value",
      meanStr,
      measureAdvanceWidth("mono-semibold", meanStr, T2_SIZE),
      STAT_VALUE_BUDGET_PX,
    );
    markup += renderT2Value(meanStr, COL1_X, STAT_VALUE_Y, theme.ink, "vitals daily-mean value");

    const stat2Label = language === "zh-TW" ? stat2LabelZh : stat2LabelEn;
    const stat2LabelWidth = language === "zh-TW" ? zhLabelWidth(stat2Label) : eyebrowLabelWidth(stat2Label);
    assertSlotBudget("stat-2 label", stat2Label, stat2LabelWidth, STAT_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(stat2Label, COL2_X, STAT_LABEL_Y, theme.muted)
        : eyebrowLabel(stat2Label, COL2_X, STAT_LABEL_Y, theme.muted);

    const streakStr = String(streak);
    assertSlotBudget(
      "stat-2 value",
      streakStr,
      measureAdvanceWidth("mono-semibold", streakStr, T2_SIZE),
      STAT_VALUE_BUDGET_PX,
    );
    markup += renderT2Value(streakStr, COL2_X, STAT_VALUE_Y, theme.ink, "vitals current-streak value");

    const stat3Label = language === "zh-TW" ? stat3LabelZh : stat3LabelEn;
    const stat3LabelWidth = language === "zh-TW" ? zhLabelWidth(stat3Label) : eyebrowLabelWidth(stat3Label);
    assertSlotBudget("stat-3 label", stat3Label, stat3LabelWidth, STAT3_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(stat3Label, RIGHT_EDGE_X - stat3LabelWidth, STAT_LABEL_Y, theme.muted)
        : eyebrowLabel(stat3Label, RIGHT_EDGE_X - stat3LabelWidth, STAT_LABEL_Y, theme.muted);

    const statusWord = statusWordFor(status, language);
    const statusWidth = measureAdvanceWidth(contentFont, statusWord, T3_SIZE);
    assertSlotBudget("status word", statusWord, statusWidth, STATUS_WORD_BUDGET_PX);
    markup += contentText(
      contentFont,
      statusWord,
      RIGHT_EDGE_X - statusWidth,
      STAT_VALUE_Y,
      theme.ink,
      `vitals status word (${language})`,
    );

    // (11) Bottom row: window caption (left, T1 accent), page-number
    // footer (right, T1 muted, absent-means-emit-nothing per Phase 3).
    const caption = windowCaptionFor(n, language);
    const captionWidth = language === "zh-TW" ? zhLabelWidth(caption) : eyebrowLabelWidth(caption);
    assertSlotBudget("window caption", caption, captionWidth, WINDOW_CAPTION_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(caption, COL1_X, FOOTER_Y, theme.accent)
        : eyebrowLabel(caption, COL1_X, FOOTER_Y, theme.accent);

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
