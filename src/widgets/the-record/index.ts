import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";

/**
 * Plan 04-01 (tracer): this file proves the whole animated-card path end to
 * end — a real capability-composed calendar fetch, a rotating vinyl disc,
 * svgo-safe optimization — on ONE thin vertical slice: disc body, rim
 * highlight, the animation `<style>`, the seeded spinning texture, groove
 * rings, and the centre label. The full card face (header/title, the right
 * stat column, the tonearm/stylus, the D-06 zero-state caption, the masthead
 * contents-row retrofit) is a deliberate FUNCTIONALITY gap, not an
 * architectural one — deferred to Plan 04-02, per the plan's own objective.
 */

// ---------------------------------------------------------------------------
// Geometry constants — each cites the UI-SPEC section / D-number that fixed
// the value (04-UI-SPEC.md "Card Layout — The Record", "Geometry constants").
// ---------------------------------------------------------------------------

const CARD_WIDTH = 495;
const CARD_HEIGHT = 272;
const PADDING = 24;
const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471 — reserved for the header row Plan 04-02 adds.

/** T3-mono size (UI-SPEC Typography "T3-mono"): an existing size (17) paired
 * with the existing IBM Plex Mono Semibold face — used here for the centre
 * label's year, per D-02's "all numerals route through IBM Plex Mono" rule. */
const T3_SIZE = 17;

const CX = 115; // record centre X
const CY = 157; // record centre Y
const R_DISC = 91; // disc body; spans x 24..206, y 66..248
const R_OUTER = 86; // outermost groove (week 1) — 5px of blank rim land
const R_INNER = 39; // innermost groove (final week) — 8px of run-out land
const R_LABEL = 31; // centre label disc
const SPINDLE_R = 3.5;

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
// ---------------------------------------------------------------------------

function pathElement(d: string, fill: string): string {
  if (d === "") {
    return "";
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

/** T3-mono numeral style, horizontally centered at `centerX` (D-02: every
 * numeral routes through IBM Plex Mono for tabular discipline). */
function centeredMonoText(text: string, centerX: number, y: number, fill: string, context: string): string {
  assertCoverage("mono-semibold", text, context);
  const width = measureAdvanceWidth("mono-semibold", text, T3_SIZE);
  const d = textToPathData("mono-semibold", text, centerX - width / 2, y, T3_SIZE);
  return pathElement(d, fill);
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
   * Tracer-scoped render: disc body, rim highlight, the animation `<style>`,
   * the seeded spinning texture, groove rings, and the centre label — in
   * that bottom-up z-order (UI-SPEC "The disc (drawn bottom-up...)").
   * Header/title, the right stat column, and the tonearm are Plan 04-02.
   */
  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const year = zonedYear(opts.now, opts.timezone);
    const weeks = bucketWeeks(data.contributionCalendar, year, opts.now, opts.timezone);
    const grooveCount = weeks.length;

    let markup = "";

    // (1) Disc body.
    markup += `<circle cx="${CX}" cy="${CY}" r="${R_DISC}" fill="${theme.ink}"/>`;

    // (2) Rim land highlight — the light edge of a pressed rim.
    markup += `<circle cx="${CX}" cy="${CY}" r="90.40" fill="none" stroke="${theme.paper}" stroke-width="0.60" stroke-opacity="0.10"/>`;

    // (3) The widget's own <style> — exactly one @keyframes block and one
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

    // (4) Spinning group — the D-09 seeded texture ONLY. Concentric circles
    // are rotation-invariant, so grooves/label/spindle never go inside this
    // group ("What rotates" / RESEARCH anti-pattern "per-groove animations").
    // D-06: this group's contents are seed-derived, never data-derived, so
    // there is no code path that could stop the rotation on an all-zero year.
    markup += `<g class="${SPIN_NAME}">${renderTexture(theme, opts.seed)}</g>`;

    // (5) Groove rings, strict index order straight from the bucket array
    // (never sorted — equal counts can never contend for a position), drawn
    // ABOVE the texture so decoration never obscures data. D-04: t is linear,
    // normalized against the busiest ELAPSED week only; D-03: pressed vs.
    // future differ by a fixed, formula-guaranteed ink ratio (never a branch
    // that stops at zero — maxWeekly === 0 short-circuits t to 0 inline).
    const maxWeekly = Math.max(0, ...weeks.filter((w) => w.elapsed).map((w) => w.count));
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

    // (6) Centre label — accent disc, hairline, the year (T3-mono, never
    // inside the spinning group — "the year must never spin"), spindle hole
    // LAST so it punches through the year's descender space at the true
    // rotation centre.
    markup += `<circle cx="${CX}" cy="${CY}" r="${R_LABEL}" fill="${theme.accent}"/>`;
    markup += `<line x1="102" y1="172" x2="128" y2="172" stroke="${theme.paper}" stroke-width="0.80" stroke-opacity="0.5"/>`;
    markup += centeredMonoText(String(year), CX, CY - 6, theme.paper, `the-record centre-label year`);
    markup += `<circle cx="${CX}" cy="${CY}" r="${SPINDLE_R}" fill="${theme.paper}"/>`;

    return markup;
  },
};
