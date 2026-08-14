/**
 * The Record copy — 04-UI-SPEC.md "The Record chrome strings" table.
 *
 * Week numbering (documented here per the UI-SPEC's explicit instruction,
 * "Card Layout — The Record" §5 "Week numbering, defined"): `W{n}` /
 * `第 {n} 週` counts Sunday-started calendar buckets, where W1 is the bucket
 * containing 1 January. This is deliberately NOT an ISO 8601 week number
 * (ISO weeks start Monday and ISO week 1 is the week containing 4 January)
 * and may differ from one by 1 — GitHub's contribution calendar buckets are
 * Sunday-started calendar buckets, so this numbering is the one that
 * actually matches the grooves rendered on screen (see index.ts's
 * `bucketWeeks`).
 *
 * Separators are ASCII `" - "` (space-hyphen-space) and `" / "`
 * (space-slash-space) ONLY. Four glyphs are explicitly banned from this
 * card's copy — a standing constraint for future edits to this file:
 *   - `·` (U+00B7 MIDDLE DOT)
 *   - `．` (U+FF0E FULLWIDTH FULL STOP)
 *   - `▸` (U+25B8 BLACK RIGHT-POINTING SMALL TRIANGLE — the sketch's bullet)
 *   - `…` (U+2026 HORIZONTAL ELLIPSIS, or any other truncation marker)
 * Phase 3 lost time to the first two glyphs three separate times
 * (`the-graveyard/copy.ts`, `masthead/copy.ts`) — do not reintroduce either
 * here, and do not add any arrow or triangle glyph in their place.
 */

export const chromeEn = { title: "THE RECORD" };
export const chromeZh = { title: "唱片" };

/** zh-TW-only decorative Latin masthead eyebrow — never translated, absent
 * in en mode (en mode's own title already reads as the brand). Almanac/
 * Editorial Stat Card convention, not Graveyard's functional-data variant —
 * The Record has no header-scale fact that needs to appear in both
 * languages. */
export const mastheadEyebrowZh = "THE RECORD";

export const totalLabelEn = "CONTRIBUTIONS";
export const totalLabelZh = "年度貢獻";

export const weeksPressedLabelEn = "WEEKS PRESSED";
export const weeksPressedLabelZh = "已壓製週數";

export const busiestWeekLabelEn = "BUSIEST WEEK";
export const busiestWeekLabelZh = "最忙的一週";

export const silentWeeksLabelEn = "SILENT WEEKS";
export const silentWeeksLabelZh = "空白週數";

export const noneValueEn = "NONE";
export const noneValueZh = "無";

export const needleCaptionEn = "NEEDLE RESTS ON THIS WEEK";
export const needleCaptionZh = "唱針停在本週";

export const zeroCaptionEn = "The record is blank.";
export const zeroCaptionZh = "這張唱片還是空白的。";

/** Row 1 value — `{elapsed} / {G}`, an identical shape (digits plus the
 * ASCII separator only) in both languages, so one function covers both. */
export function weeksPressedValue(elapsed: number, total: number): string {
  return `${elapsed} / ${total}`;
}

/**
 * Row 2 value. `count` is a PRE-FORMATTED string — the caller runs it
 * through `format.ts`'s `formatRecordNumber` (the Number Formatting
 * Contract) before calling this function, exactly as the total numeral is
 * formatted. This function only assembles the template; it never formats a
 * number itself.
 */
export function busiestWeekValueEn(n: number, count: string): string {
  return `W${n} - ${count}`;
}

export function busiestWeekValueZh(n: number, count: string): string {
  return `第 ${n} 週 - ${count}`;
}

/** Row 3 value — `{n}`, an identical shape in both languages. */
export function silentWeeksValue(n: number): string {
  return `${n}`;
}

/** Page-number footer — inherited verbatim from Phase 3's masthead/
 * editorial-stat-card/the-graveyard convention (same literal format, same
 * absent-means-emit-nothing contract, applied independently by index.ts). */
export function pageFooterEn(n: number, m: number): string {
  return `PAGE ${n}/${m}`;
}

export function pageFooterZh(n: number, m: number): string {
  return `頁 ${n} / ${m}`;
}
