import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
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
import { assertSlotBudget, formatRecordNumber, measureRecordNumeralWidth, SUFFIX_SIZE_RATIO } from "./format.js";

/**
 * Plan 04-01 built the tracer slice (disc body, rim highlight, the animation
 * `<style>`, the seeded spinning texture, groove rings, the centre label's
 * year). Plan 04-02 (this file, current state) adds the full card face: the
 * header/title row, the right-hand stat column (total + three rows), the
 * tonearm/stylus, the needle caption, the page-number footer, and the D-06
 * zero-state caption — every string engine-authored and width-budgeted.
 */

// ---------------------------------------------------------------------------
// Geometry constants — each cites the UI-SPEC section / D-number that fixed
// the value (04-UI-SPEC.md "Card Layout — The Record", "Geometry constants").
// ---------------------------------------------------------------------------

const CARD_WIDTH = 495;
const CARD_HEIGHT = 272;
const PADDING = 24;
const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471

const T1_SIZE = 8;
const T2_SIZE = 32;
/** T3-mono size (UI-SPEC Typography "T3-mono"): an existing size (17) paired
 * with the existing IBM Plex Mono Semibold face — used here for the centre
 * label's year, per D-02's "all numerals route through IBM Plex Mono" rule. */
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const HEADER_TITLE_BASELINE_Y = 44;
const HEADER_RULE_Y = 58;

const CX = 115; // record centre X
const CY = 157; // record centre Y
const R_DISC = 91; // disc body; spans x 24..206, y 66..248
const R_OUTER = 86; // outermost groove (week 1) — 5px of blank rim land
const R_INNER = 39; // innermost groove (final week) — 8px of run-out land
const R_LABEL = 31; // centre label disc
const SPINDLE_R = 3.5;

/** Right column left edge (UI-SPEC "Geometry constants" — md=16 gutter from
 * the disc's x=206). */
const COLUMN_X = 222;
const TOTAL_LABEL_Y = 84;
const TOTAL_NUMERAL_Y = 116;
const COLUMN_RULE_Y = 140;
const ROW1_Y = 156;
const ROW2_Y = 172;
const ROW3_Y = 188;
const ZERO_CAPTION_Y = 216;
const FOOTER_Y = 240;

// ---------------------------------------------------------------------------
// Text slot budgets (UI-SPEC "Text slot budgets (overflow policy)") — every
// one is a regression tripwire, checked via format.ts's assertSlotBudget
// before its corresponding path data is built. Not expected to fire: every
// string on this card is engine-authored, so RENDER-05's fail-loud policy
// applies in full (Phase 3's truncation policy does not apply here).
// ---------------------------------------------------------------------------

const CARD_TITLE_BUDGET_PX = 200;
const CENTRE_LABEL_YEAR_BUDGET_PX = 46;
const TOTAL_NUMERAL_BUDGET_PX = 200;
const DATA_ROW_LABEL_BUDGET_PX = 130;
const DATA_ROW_VALUE_BUDGET_PX = 100;
const NEEDLE_CAPTION_BUDGET_PX = 170;
const ZERO_CAPTION_BUDGET_PX = 249;

// ---------------------------------------------------------------------------
// Tonearm geometry (UI-SPEC "Tonearm and Stylus", D-05).
// ---------------------------------------------------------------------------

const PIVOT_X = 196;
const PIVOT_Y = 74;
const ARM_LENGTH = 98; // L
/** Distance from the tonearm's fixed pivot to the record's centre — the `D`
 * of the two-circle intersection formula. Computed once at module scope so
 * both the reachability invariant below and `tonearmTip` share one value. */
const PIVOT_DISTANCE = Math.hypot(CX - PIVOT_X, CY - PIVOT_Y); // 115.97

/**
 * UI-SPEC "Tonearm and Stylus" static invariant: `L + R_INNER > D` and
 * `|L - R_OUTER| < D` must both hold so `h² = L² - a²` (in `tonearmTip`
 * below) is always positive for every reachable groove radius
 * (`R_INNER..R_OUTER`) — otherwise `Math.sqrt()` would emit `NaN` into the
 * SVG's line/circle coordinates for some week. A module-scope check means a
 * future geometry change (moving `PIVOT_X`/`PIVOT_Y`, `ARM_LENGTH`,
 * `R_INNER`, or `R_OUTER`) fails at `import` time, never silently at render
 * time (UI-SPEC "record-tonearm overflow").
 */
if (!(ARM_LENGTH + R_INNER > PIVOT_DISTANCE) || !(Math.abs(ARM_LENGTH - R_OUTER) < PIVOT_DISTANCE)) {
  throw new Error(
    `the-record: tonearm reachability invariant violated — ARM_LENGTH=${ARM_LENGTH}, ` +
      `PIVOT_DISTANCE=${PIVOT_DISTANCE.toFixed(2)}, R_OUTER=${R_OUTER}, R_INNER=${R_INNER}`,
  );
}

// ---------------------------------------------------------------------------
// Groove encoding constants (UI-SPEC "Groove Encoding", D-02/D-03/D-04).
// ---------------------------------------------------------------------------

const PRESSED_WIDTH_FLOOR = 0.55;
const PRESSED_WIDTH_RANGE = 0.55;
/**
 * PRESSED_WIDTH_FLOOR + PRESSED_WIDTH_RANGE — the pressed range's ceiling.
 * At groovePitch ~0.87-0.92 (R_OUTER/R_INNER above), consecutive
 * maximum-intensity grooves deliberately merge into one bright band; this is
 * bounded because stroke width can never exceed this constant, so the merge
 * can never cascade (UI-SPEC "Both channels, deliberately").
 */
const MAX_STROKE_WIDTH = 1.1;
const PRESSED_OPACITY_FLOOR = 0.42;
const PRESSED_OPACITY_RANGE = 0.53;
const FUTURE_STROKE_WIDTH = 0.4;
const FUTURE_STROKE_OPACITY = 0.14;

// ---------------------------------------------------------------------------
// Animation constants (UI-SPEC "Animation Contract", D-07 — locked by the
// user, not discretionary).
// ---------------------------------------------------------------------------

const SPIN_NAME = "atelier-record-spin";
const SPIN_DURATION_S = 24;

// ---------------------------------------------------------------------------
// Seeded surface texture constants (D-09/RENDER-09, UI-SPEC "Seeded Surface
// Texture"). Fixed constants — must NEVER scale with data, so the size
// budget and per-frame compositor cost stay constant year-round.
// ---------------------------------------------------------------------------

const TEXTURE_SCUFF_COUNT = 64;
const TEXTURE_WEAR_COUNT = 6;
const TEXTURE_DUST_COUNT = 24;
const TEXTURE_R_MIN = R_LABEL + 3;
const TEXTURE_R_MAX = R_DISC - 4;

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Chassis helpers — own copy, not imported (RENDER-02: adding/modifying a
// card must not require touching another card's private functions).
// Structurally identical to the-graveyard/index.ts's own set. This card
// deliberately does NOT import apiSourcedTextPathData or truncateToWidth —
// every string here is engine-authored, so only the assertCoverage +
// textToPathData fail-loud path applies (UI-SPEC "Engine-authored text →
// fail loud; API-sourced text → degrade").
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
  assertCoverage("mono-semibold", upper, `the-record T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/** T1 label style for zh-TW text: Noto Serif TC, 8px, no uppercase
 * transform, no manual letter-spacing. */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `the-record T1 label (zh-TW): "${text}"`);
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

/** T3-mono numeral style, horizontally centered at `centerX` (D-02: every
 * numeral routes through IBM Plex Mono for tabular discipline). */
function centeredMonoText(text: string, centerX: number, y: number, fill: string, context: string): string {
  assertCoverage("mono-semibold", text, context);
  const width = measureAdvanceWidth("mono-semibold", text, T3_SIZE);
  const d = textToPathData("mono-semibold", text, centerX - width / 2, y, T3_SIZE);
  return pathElement(d, fill);
}

/**
 * Renders the T2 total-contributions numeral LEFT-ALIGNED at `x` (adjusted
 * from editorial-stat-card's own `renderNumeral`, which centers at
 * `centerX` — The Record's right column is left-aligned throughout, per
 * UI-SPEC "Right column"). zh-TW's 萬/億 suffix is split into a separate
 * Noto Serif TC glyph run at `T2_SIZE * SUFFIX_SIZE_RATIO`, positioned via
 * the same digit-width measurement `format.ts`'s `measureRecordNumeralWidth`
 * performs — the two must agree, or the budget check and the actual glyph
 * placement could silently disagree about the suffix's rendered width.
 */
function renderNumeral(formatted: string, language: "en" | "zh-TW", x: number, y: number, fill: string): string {
  if (language === "zh-TW" && (formatted.endsWith("萬") || formatted.endsWith("億"))) {
    const chars = Array.from(formatted);
    const suffixChar = chars[chars.length - 1] as string;
    const digitsPart = chars.slice(0, -1).join("");
    const digitsWidth = measureAdvanceWidth("mono-semibold", digitsPart, T2_SIZE);
    const d =
      textToPathData("mono-semibold", digitsPart, x, y, T2_SIZE) +
      textToPathData("noto-tc", suffixChar, x + digitsWidth, y, T2_SIZE * SUFFIX_SIZE_RATIO);
    return pathElement(d, fill);
  }
  return pathElement(textToPathData("mono-semibold", formatted, x, y, T2_SIZE), fill);
}

/**
 * A right column label/value row (UI-SPEC "Right column" y-table): the
 * label left-aligned at COLUMN_X in `muted`, the value right-aligned to
 * RIGHT_EDGE_X in `ink`, both T1. Both slot budgets are checked before their
 * path data is built (UI-SPEC "Text slot budgets"). Factored out because
 * all three data rows share this exact shape — not a chassis helper (it is
 * specific to this card's column layout), just local de-duplication.
 */
function renderDataRow(label: string, value: string, y: number, language: "en" | "zh-TW", theme: Theme): string {
  const labelWidth = language === "zh-TW" ? zhLabelWidth(label) : eyebrowLabelWidth(label);
  assertSlotBudget("data-row label", label, labelWidth, DATA_ROW_LABEL_BUDGET_PX);
  const valueWidth = language === "zh-TW" ? zhLabelWidth(value) : eyebrowLabelWidth(value);
  assertSlotBudget("data-row value", value, valueWidth, DATA_ROW_VALUE_BUDGET_PX);

  const labelMarkup =
    language === "zh-TW" ? zhLabel(label, COLUMN_X, y, theme.muted) : eyebrowLabel(label, COLUMN_X, y, theme.muted);
  const valueMarkup =
    language === "zh-TW"
      ? zhLabel(value, RIGHT_EDGE_X - valueWidth, y, theme.ink)
      : eyebrowLabel(value, RIGHT_EDGE_X - valueWidth, y, theme.ink);
  return labelMarkup + valueMarkup;
}

// ---------------------------------------------------------------------------
// zonedYear — own copy of the almanac/lunar.ts formatToParts technique
// (RENDER-02: not imported from a widget). Reads the calendar year of `now`
// as observed in `timeZone`.
// ---------------------------------------------------------------------------

export function zonedYear(now: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" });
  const part = formatter.formatToParts(now).find((p) => p.type === "year")?.value;
  return Number(part);
}

/**
 * Total number of Sunday-started calendar-week buckets covering `year`
 * (D-02 fixed geometry). Sunday-started calendar buckets, NOT ISO 8601
 * weeks — mathematically bounded in [52, 54] for every year (RESEARCH.md
 * Code Examples / UI-SPEC Degenerate State #3).
 */
export function grooveCountForYear(year: number): number {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / MS_PER_DAY;
  return Math.ceil((daysInYear + jan1.getUTCDay()) / 7); // getUTCDay(): 0 = Sunday
}

/** One Sunday-started groove bucket. `startDate` is UTC midnight of the
 * bucket's first day (matching the calendar data's own UTC date strings). */
export interface RecordWeek {
  index: number;
  startDate: Date;
  count: number;
  elapsed: boolean;
}

/** "YYYY-MM-DD" for `date` as observed in `timeZone` — used only to compare
 * calendar days, never to construct a real Date (en-CA formats in ISO order,
 * so plain string comparison is valid). */
function zonedDateString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function parseIsoDateUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y as number, (m as number) - 1, d as number);
}

/**
 * Re-bucket the flattened daily `contributionCalendar` (core/fetch.ts's
 * normalized shape) into `grooveCountForYear(year)` Sunday-started weekly
 * sums — pure date math, zero-fs (RESEARCH.md "core composes queries,
 * widgets interpret ProfileData" boundary). Bucket 0 starts on the Sunday
 * on-or-before 1 January — `W1` is therefore NOT an ISO 8601 week.
 *
 * `elapsed` is true when the bucket's start date is on or before `now` in
 * `timeZone` (D-02/D-03) — the bucket's own start date is always compared as
 * a UTC calendar date (matching the calendar data's own UTC date strings),
 * against `now`'s date as observed in the card's timezone.
 */
export function bucketWeeks(
  calendar: { date: string; count: number }[] | undefined,
  year: number,
  now: Date,
  timeZone: string,
): RecordWeek[] {
  const grooveCount = grooveCountForYear(year);
  const jan1Ms = Date.UTC(year, 0, 1);
  const jan1Weekday = new Date(jan1Ms).getUTCDay(); // 0 = Sunday
  const firstBucketStartMs = jan1Ms - jan1Weekday * MS_PER_DAY;
  const nowDateString = zonedDateString(now, timeZone);

  const weeks: RecordWeek[] = Array.from({ length: grooveCount }, (_, index) => {
    const startMs = firstBucketStartMs + index * 7 * MS_PER_DAY;
    const startDate = new Date(startMs);
    return {
      index,
      startDate,
      count: 0,
      elapsed: zonedDateString(startDate, "UTC") <= nowDateString,
    };
  });

  for (const day of calendar ?? []) {
    const dayMs = parseIsoDateUtcMs(day.date);
    const bucketIndex = Math.floor((dayMs - firstBucketStartMs) / (7 * MS_PER_DAY));
    const bucket = weeks[bucketIndex];
    if (bucket !== undefined) {
      bucket.count += day.count;
    }
  }

  return weeks;
}

/** `r_i = R_OUTER - i * ((R_OUTER - R_INNER) / (grooveCount - 1))` — one code
 * path for every valid grooveCount (UI-SPEC "Groove Encoding — Positions"). */
export function grooveRadius(i: number, grooveCount: number): number {
  return R_OUTER - i * ((R_OUTER - R_INNER) / (grooveCount - 1));
}

/**
 * The two-circle intersection formula (UI-SPEC "Tonearm and Stylus"): the
 * tip of a fixed-length (`ARM_LENGTH`) tonearm pivoting at
 * `(PIVOT_X, PIVOT_Y)`, resting on the groove of radius `r` around
 * `(CX, CY)`. `h² = ARM_LENGTH² − a²` is guaranteed positive by the
 * module-scope reachability invariant above for every `r` in
 * `[R_INNER, R_OUTER]`.
 */
export function tonearmTip(r: number): { x: number; y: number } {
  const ux = (CX - PIVOT_X) / PIVOT_DISTANCE;
  const uy = (CY - PIVOT_Y) / PIVOT_DISTANCE;
  const perpX = uy;
  const perpY = -ux;
  const a = (PIVOT_DISTANCE * PIVOT_DISTANCE + ARM_LENGTH * ARM_LENGTH - r * r) / (2 * PIVOT_DISTANCE);
  const h = Math.sqrt(ARM_LENGTH * ARM_LENGTH - a * a);
  return {
    x: PIVOT_X + a * ux + h * perpX,
    y: PIVOT_Y + a * uy + h * perpY,
  };
}

/**
 * The busiest ELAPSED week (D-04's normalization anchor / UI-SPEC "BUSIEST
 * WEEK" row): the earliest (lowest-index) week among ties, or `null` when
 * every elapsed week has zero contributions (`maxWeekly === 0` — UI-SPEC
 * Degenerate States #1/#2/#6). `elapsedWeeks` must already be in ascending
 * index order (`bucketWeeks`'s own invariant) — `Array.prototype.find`
 * returning the FIRST match is what makes the tie-break deterministic
 * (earliest week wins, QA-02). Extracted as its own pure function so the
 * tie-break rule has a direct unit-test seam, the same convention as
 * `grooveRadius`/`tonearmTip`/`bucketWeeks` above.
 */
export function busiestElapsedWeek(elapsedWeeks: RecordWeek[]): { index: number; count: number } | null {
  const maxWeekly = Math.max(0, ...elapsedWeeks.map((w) => w.count));
  if (maxWeekly === 0) {
    return null;
  }
  const week = elapsedWeeks.find((w) => w.count === maxWeekly)!;
  return { index: week.index, count: week.count };
}

/**
 * Deterministic 32-bit PRNG (mulberry32, public domain). Integer-only ops +
 * Math.imul => bit-identical sequences on every platform, which is what
 * keeps D-09's texture snapshot-pinnable. Decorative determinism ONLY —
 * never security-relevant (T-04-04): must never be used for identifiers,
 * tokens, or any security-relevant value.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** A single-arc `<path>` `d` string, `sweepDeg` degrees long starting at
 * `startDeg` (0deg = +X axis, clockwise) around (cx, cy) at radius r. */
function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const startX = cx + r * Math.cos(toRad(startDeg));
  const startY = cy + r * Math.sin(toRad(startDeg));
  const endDeg = startDeg + sweepDeg;
  const endX = cx + r * Math.cos(toRad(endDeg));
  const endY = cy + r * Math.sin(toRad(endDeg));
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M${startX.toFixed(2)},${startY.toFixed(2)} A${r.toFixed(2)},${r.toFixed(2)} 0 ${largeArc} 1 ${endX.toFixed(2)},${endY.toFixed(2)}`;
}

/**
 * The D-09 seeded surface texture — scuff arcs, then wear arcs, then dust
 * dots, in that fixed draw order, each drawing its random fields in the
 * fixed order UI-SPEC's "Seeded Surface Texture" table lists (centre angle,
 * radius, sweep, width, opacity / angle, radius, size, opacity), so the byte
 * output is reproducible from the seed alone. This is the ONLY markup that
 * goes inside the spinning group (Pitfall 6 / "What rotates") — element
 * counts are fixed constants and never scale with data.
 */
function renderTexture(theme: Theme, seed: number): string {
  const rand = mulberry32(seed);
  let markup = "";

  for (let i = 0; i < TEXTURE_SCUFF_COUNT; i++) {
    const centerAngle = rand() * 360;
    const radius = TEXTURE_R_MIN + rand() * (TEXTURE_R_MAX - TEXTURE_R_MIN);
    const sweep = 1.5 + rand() * (9 - 1.5);
    const width = 0.3 + rand() * (0.8 - 0.3);
    const opacity = 0.03 + rand() * (0.1 - 0.03);
    const d = arcPath(CX, CY, radius, centerAngle, sweep);
    markup += `<path d="${d}" fill="none" stroke="${theme.paper}" stroke-width="${width.toFixed(2)}" stroke-opacity="${opacity.toFixed(2)}"/>`;
  }

  for (let i = 0; i < TEXTURE_WEAR_COUNT; i++) {
    const centerAngle = rand() * 360;
    const radius = TEXTURE_R_MIN + rand() * (TEXTURE_R_MAX - TEXTURE_R_MIN);
    const sweep = 22 + rand() * (60 - 22);
    const width = 0.5 + rand() * (0.9 - 0.5);
    const opacity = 0.12 + rand() * (0.2 - 0.12);
    const d = arcPath(CX, CY, radius, centerAngle, sweep);
    markup += `<path d="${d}" fill="none" stroke="${theme.paper}" stroke-width="${width.toFixed(2)}" stroke-opacity="${opacity.toFixed(2)}"/>`;
  }

  for (let i = 0; i < TEXTURE_DUST_COUNT; i++) {
    const angle = rand() * 360;
    const radius = TEXTURE_R_MIN + rand() * (TEXTURE_R_MAX - TEXTURE_R_MIN);
    const size = 0.25 + rand() * (0.6 - 0.25);
    const opacity = 0.05 + rand() * (0.14 - 0.05);
    const x = CX + radius * Math.cos(toRad(angle));
    const y = CY + radius * Math.sin(toRad(angle));
    markup += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${size.toFixed(2)}" fill="${theme.paper}" fill-opacity="${opacity.toFixed(2)}"/>`;
  }

  return markup;
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/** No `widgets.yml`-configurable options exist for this card (masthead's
 * `z.object({}).strict()` no-args precedent). */
const theRecordOptionsSchema = z.object({}).strict();

export const theRecordWidget: WidgetDefinition<RenderOptions> = {
  name: "the-record",
  requires: ["calendar"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      theRecordOptionsSchema.parse(value ?? {});
      return { now: new Date(), seed: 0, language: "en", timezone: "UTC" };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "唱片卡片",
        desc: "把今年到目前為止的貢獻壓成一張黑膠唱片，每一圈溝紋代表一週，唱針停在本週。",
      };
    }
    return {
      title: "The Record card",
      desc:
        "Presses this year's contributions so far into a vinyl record, one groove per week, " +
        "with the needle resting on the current week.",
    };
  },

  /**
   * Full card face (Plan 04-02): header/title, the disc (body, rim, spinning
   * texture, groove rings, centre label), the tonearm, the right stat
   * column, the D-06 zero-state caption, the needle caption, and the
   * page-number footer — in the UI-SPEC's "Composition" z-/reading-order.
   */
  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";

    const year = zonedYear(opts.now, opts.timezone);
    const weeks = bucketWeeks(data.contributionCalendar, year, opts.now, opts.timezone);
    const grooveCount = weeks.length;
    const elapsedWeeks = weeks.filter((w) => w.elapsed);
    // D-03/no-future-contribution invariant: maxWeekly, the busiest-week
    // anchor, and every right-column figure below derive ONLY from elapsed
    // weeks — a bucket whose start date is after `now` must never inflate
    // the total, the busiest-week callout, or the silent-week count.
    const maxWeekly = Math.max(0, ...elapsedWeeks.map((w) => w.count));

    let markup = "";

    // (1) Header row: title left-aligned; zh-TW-only untranslated Latin
    // eyebrow, right-aligned (Almanac/Stat Card convention — this card has
    // no header-scale fact that needs to appear in both languages, unlike
    // Graveyard's functional-data deviation); hairline rule.
    const title = language === "zh-TW" ? chromeZh.title : chromeEn.title;
    assertSlotBudget("card title", title, measureAdvanceWidth(contentFont, title, T3_SIZE), CARD_TITLE_BUDGET_PX);
    markup += contentText(contentFont, title, PADDING, HEADER_TITLE_BASELINE_Y, theme.ink, `the-record title (${language})`);

    if (language === "zh-TW") {
      const eyebrowWidth = eyebrowLabelWidth(mastheadEyebrowZh);
      markup += eyebrowLabel(mastheadEyebrowZh, RIGHT_EDGE_X - eyebrowWidth, HEADER_TITLE_BASELINE_Y, theme.muted);
    }

    markup += `<line x1="${PADDING}" y1="${HEADER_RULE_Y}" x2="${RIGHT_EDGE_X}" y2="${HEADER_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (2) Disc body.
    markup += `<circle cx="${CX}" cy="${CY}" r="${R_DISC}" fill="${theme.ink}"/>`;

    // (3) Rim land highlight — the light edge of a pressed rim.
    markup += `<circle cx="${CX}" cy="${CY}" r="90.40" fill="none" stroke="${theme.paper}" stroke-width="0.60" stroke-opacity="0.10"/>`;

    // (4) The widget's own <style> — exactly one @keyframes block and one
    // class rule (no precedent elsewhere in src/**). transform-origin is
    // derived from the SAME CX/CY constants the circles use below, so it can
    // never drift from the disc geometry (Pitfall 5). Never SMIL, and the
    // animation shorthand sets non-important longhands, so the chassis
    // REDUCED_MOTION_STYLE block (emitted before this markup, but carrying
    // !important) is the complete RENDER-06 mechanism (UI-SPEC "Rendering
    // Chassis Deltas" #1) — no change to svg.ts required.
    markup +=
      `<style>@keyframes ${SPIN_NAME}{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}` +
      `.${SPIN_NAME}{animation:${SPIN_NAME} ${SPIN_DURATION_S}s linear infinite;` +
      `transform-origin:${CX}px ${CY}px}</style>`;

    // (5) Spinning group — the D-09 seeded texture ONLY. Concentric circles
    // are rotation-invariant, so grooves/label/spindle never go inside this
    // group ("What rotates" / RESEARCH anti-pattern "per-groove animations").
    // D-06: this group's contents are seed-derived, never data-derived, so
    // there is no code path that could stop the rotation on an all-zero year.
    markup += `<g class="${SPIN_NAME}">${renderTexture(theme, opts.seed)}</g>`;

    // (6) Groove rings, strict index order straight from the bucket array
    // (never sorted — equal counts can never contend for a position), drawn
    // ABOVE the texture so decoration never obscures data. D-04: t is linear,
    // normalized against the busiest ELAPSED week only; D-03: pressed vs.
    // future differ by a fixed, formula-guaranteed ink ratio (never a branch
    // that stops at zero — maxWeekly === 0 short-circuits t to 0 inline).
    for (const week of weeks) {
      const r = grooveRadius(week.index, grooveCount);
      const t = maxWeekly === 0 ? 0 : week.count / maxWeekly;
      // Math.min makes the "bounded, can never cascade" guarantee explicit —
      // PRESSED_WIDTH_FLOOR + PRESSED_WIDTH_RANGE already equals
      // MAX_STROKE_WIDTH by construction (t is bounded to [0, 1]), but the
      // cap is asserted here rather than left implicit.
      const strokeWidth = week.elapsed
        ? Math.min(PRESSED_WIDTH_FLOOR + t * PRESSED_WIDTH_RANGE, MAX_STROKE_WIDTH)
        : FUTURE_STROKE_WIDTH;
      const strokeOpacity = week.elapsed
        ? PRESSED_OPACITY_FLOOR + t * PRESSED_OPACITY_RANGE
        : FUTURE_STROKE_OPACITY;
      markup +=
        `<circle cx="${CX.toFixed(2)}" cy="${CY.toFixed(2)}" r="${r.toFixed(2)}" fill="none" ` +
        `stroke="${theme.paper}" stroke-width="${strokeWidth.toFixed(2)}" stroke-opacity="${strokeOpacity.toFixed(2)}"/>`;
    }

    // (7) Centre label — accent disc, hairline, the year (T3-mono, budget-
    // checked, never inside the spinning group — "the year must never
    // spin"), spindle hole LAST so it punches through the year's descender
    // space at the true rotation centre.
    markup += `<circle cx="${CX}" cy="${CY}" r="${R_LABEL}" fill="${theme.accent}"/>`;
    markup += `<line x1="102" y1="172" x2="128" y2="172" stroke="${theme.paper}" stroke-width="0.80" stroke-opacity="0.5"/>`;
    const yearStr = String(year);
    assertSlotBudget(
      "centre-label year",
      yearStr,
      measureAdvanceWidth("mono-semibold", yearStr, T3_SIZE),
      CENTRE_LABEL_YEAR_BUDGET_PX,
    );
    markup += centeredMonoText(yearStr, CX, CY - 6, theme.paper, `the-record centre-label year`);
    markup += `<circle cx="${CX}" cy="${CY}" r="${SPINDLE_R}" fill="${theme.paper}"/>`;

    // (8) Tonearm (D-05) — drawn outside the spinning group; its position
    // encodes `now`, never motion. `r` is the CURRENT week's groove radius
    // (the last elapsed bucket), never the last bucket with a nonzero count.
    const currentWeekIndex = elapsedWeeks.length > 0 ? elapsedWeeks[elapsedWeeks.length - 1]!.index : 0;
    const currentR = grooveRadius(currentWeekIndex, grooveCount);
    const tip = tonearmTip(currentR);
    const headFraction = (ARM_LENGTH - 16) / ARM_LENGTH;
    const head = {
      x: PIVOT_X + headFraction * (tip.x - PIVOT_X),
      y: PIVOT_Y + headFraction * (tip.y - PIVOT_Y),
    };
    markup += `<line x1="${PIVOT_X.toFixed(2)}" y1="${PIVOT_Y.toFixed(2)}" x2="${head.x.toFixed(2)}" y2="${head.y.toFixed(2)}" stroke="${theme.paper}" stroke-width="4.0" stroke-linecap="round"/>`;
    markup += `<line x1="${PIVOT_X.toFixed(2)}" y1="${PIVOT_Y.toFixed(2)}" x2="${head.x.toFixed(2)}" y2="${head.y.toFixed(2)}" stroke="${theme.muted}" stroke-width="2.4" stroke-linecap="round"/>`;
    markup += `<line x1="${head.x.toFixed(2)}" y1="${head.y.toFixed(2)}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="${theme.paper}" stroke-width="4.8" stroke-linecap="round"/>`;
    markup += `<line x1="${head.x.toFixed(2)}" y1="${head.y.toFixed(2)}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="${theme.accent}" stroke-width="3.2" stroke-linecap="round"/>`;
    markup += `<circle cx="${tip.x.toFixed(2)}" cy="${tip.y.toFixed(2)}" r="1.5" fill="${theme.accent}"/>`;
    markup += `<circle cx="${PIVOT_X}" cy="${PIVOT_Y}" r="6" fill="${theme.rule}" stroke="${theme.muted}" stroke-width="1"/>`;

    // (9) Right column: total label + T2 numeral, hairline rule, three
    // label/value rows. The total is data.contributionCalendarTotal,
    // falling back to the sum of the ELAPSED buckets (never a separately
    // derived figure, and never inflated by an injected future day —
    // mirrors the groove/busiest-week/silent-week guard above).
    const totalLabel = language === "zh-TW" ? totalLabelZh : totalLabelEn;
    const totalLabelWidth = language === "zh-TW" ? zhLabelWidth(totalLabel) : eyebrowLabelWidth(totalLabel);
    assertSlotBudget("total label", totalLabel, totalLabelWidth, DATA_ROW_LABEL_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(totalLabel, COLUMN_X, TOTAL_LABEL_Y, theme.muted)
        : eyebrowLabel(totalLabel, COLUMN_X, TOTAL_LABEL_Y, theme.muted);

    const total = data.contributionCalendarTotal ?? elapsedWeeks.reduce((sum, w) => sum + w.count, 0);
    const formattedTotal = formatRecordNumber(total, language);
    assertSlotBudget(
      "total numeral",
      formattedTotal,
      measureRecordNumeralWidth(formattedTotal, language),
      TOTAL_NUMERAL_BUDGET_PX,
    );
    markup += renderNumeral(formattedTotal, language, COLUMN_X, TOTAL_NUMERAL_Y, theme.ink);

    markup += `<line x1="${COLUMN_X}" y1="${COLUMN_RULE_Y}" x2="${RIGHT_EDGE_X}" y2="${COLUMN_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // Row 1: WEEKS PRESSED — {elapsed} / {G}.
    const row1Label = language === "zh-TW" ? weeksPressedLabelZh : weeksPressedLabelEn;
    const row1Value = weeksPressedValue(elapsedWeeks.length, grooveCount);
    markup += renderDataRow(row1Label, row1Value, ROW1_Y, language, theme);

    // Row 2: BUSIEST WEEK — W{n} - {count}, or NONE/無 when maxWeekly === 0.
    // Tie-break-to-earliest-index lives in busiestElapsedWeek, the single
    // source of truth for this selection (also used by index.test.ts).
    const row2Label = language === "zh-TW" ? busiestWeekLabelZh : busiestWeekLabelEn;
    const busiest = busiestElapsedWeek(elapsedWeeks);
    let row2Value: string;
    if (busiest === null) {
      row2Value = language === "zh-TW" ? noneValueZh : noneValueEn;
    } else {
      const formattedCount = formatRecordNumber(busiest.count, language);
      row2Value =
        language === "zh-TW"
          ? busiestWeekValueZh(busiest.index + 1, formattedCount)
          : busiestWeekValueEn(busiest.index + 1, formattedCount);
    }
    markup += renderDataRow(row2Label, row2Value, ROW2_Y, language, theme);

    // Row 3: SILENT WEEKS — count of elapsed weeks with count === 0.
    const row3Label = language === "zh-TW" ? silentWeeksLabelZh : silentWeeksLabelEn;
    const silentCount = elapsedWeeks.filter((w) => w.count === 0).length;
    const row3Value = silentWeeksValue(silentCount);
    markup += renderDataRow(row3Label, row3Value, ROW3_Y, language, theme);

    // (10) Zero-state caption (D-06) — the ONLY markup the zero state adds.
    // Same scene, same code path, still rotating; only this one conditional.
    if (maxWeekly === 0) {
      const zeroCaption = language === "zh-TW" ? zeroCaptionZh : zeroCaptionEn;
      assertSlotBudget(
        "zero-state caption",
        zeroCaption,
        measureAdvanceWidth(contentFont, zeroCaption, T3_SIZE),
        ZERO_CAPTION_BUDGET_PX,
      );
      markup += contentText(
        contentFont,
        zeroCaption,
        COLUMN_X,
        ZERO_CAPTION_Y,
        theme.ink,
        `the-record zero-state caption (${language})`,
      );
    }

    // (11) Needle caption — always present, T1 accent.
    const needleCaption = language === "zh-TW" ? needleCaptionZh : needleCaptionEn;
    const needleCaptionWidth = language === "zh-TW" ? zhLabelWidth(needleCaption) : eyebrowLabelWidth(needleCaption);
    assertSlotBudget("needle caption", needleCaption, needleCaptionWidth, NEEDLE_CAPTION_BUDGET_PX);
    markup +=
      language === "zh-TW"
        ? zhLabel(needleCaption, COLUMN_X, FOOTER_Y, theme.accent)
        : eyebrowLabel(needleCaption, COLUMN_X, FOOTER_Y, theme.accent);

    // (12) Page-number footer — only when both fields are defined, so a
    // disabled masthead leaves literally zero additional markup here
    // (inherited Phase 3 contract, unchanged).
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
