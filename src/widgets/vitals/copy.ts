/**
 * Vitals copy — 06-UI-SPEC.md "Vitals chrome strings" table.
 *
 * Streak rule (documented here per the UI-SPEC's explicit instruction, "Card
 * Layout 1 — Vitals" §5 "Streak rule"): CURRENT STREAK allows exactly ONE
 * grace day. If the most recently recorded day has count === 0, the streak
 * count starts from the day BEFORE it instead — because this project's own
 * default cron is 6-hourly, so most renders happen before the adopter has
 * committed anything "today." Never two grace days: a second zero day always
 * breaks the streak. See index.ts's `computeStreak`.
 *
 * Status ladder (documented here per the same UI-SPEC instruction): STATUS
 * is driven by `activeDays` (the count of recorded days with count > 0) out
 * of the `n` recorded days in the trailing-28-day window — 0 -> FLATLINE,
 * 1-9 -> FAINT, 10-20 -> STEADY, 21-28 -> RAPID. The thresholds apply to the
 * raw active-day count even when `n < 28`, so a brand-new account cannot be
 * pushed into a higher tier by a short window. See index.ts's `statusTier`.
 *
 * Separators are ASCII " - " and " / " ONLY. The banned-glyph list this
 * project has accumulated (Phase 1/3/4 all lost time to a subset of these)
 * is extended here per 06-UI-SPEC.md's "Glyph coverage" section:
 *   - `·` (U+00B7 MIDDLE DOT)
 *   - `．` (U+FF0E FULLWIDTH FULL STOP)
 *   - `▸` (U+25B8 BLACK RIGHT-POINTING SMALL TRIANGLE)
 *   - `…` (U+2026 HORIZONTAL ELLIPSIS)
 *   - `▲` (U+25B2), `▼` (U+25BC) — absent from both subsets project-wide
 *   - `●` (U+25CF) — absent from both subsets project-wide
 *   - en copy additionally bans `—` (U+2014 EM DASH), present in noto-tc but
 *     absent from the ASCII-only mono / Latin-1-only serif subsets
 * Do not reintroduce any of these in this file.
 */

export const titleEn = "VITALS";
export const titleZh = "生命徵象";

/** zh-TW-only decorative Latin eyebrow — never translated, absent in en mode
 * (Almanac/Editorial Stat Card/The Record convention: en mode's own title
 * already names the card, so no header-scale fact needs both languages). */
export const eyebrowZh = "VITALS";

export const stat1LabelEn = "DAILY MEAN";
export const stat1LabelZh = "每日均值";

export const stat2LabelEn = "CURRENT STREAK";
export const stat2LabelZh = "目前連續";

export const stat3LabelEn = "STATUS";
export const stat3LabelZh = "狀態";

export const statusFlatlineEn = "FLATLINE";
export const statusFlatlineZh = "平線";

export const statusFaintEn = "FAINT";
export const statusFaintZh = "微弱";

export const statusSteadyEn = "STEADY";
export const statusSteadyZh = "平穩";

export const statusRapidEn = "RAPID";
export const statusRapidZh = "急促";

export const windowCaptionFullEn = "TRAILING 28 DAYS";
export const windowCaptionFullZh = "近 28 天的紀錄";

export const windowCaptionEmptyEn = "NO RECORDING";
export const windowCaptionEmptyZh = "尚無紀錄";

/** Window caption, `1 <= n < 28` — `n` is a PRE-COMPUTED integer, never
 * formatted by this function beyond template interpolation (same convention
 * as The Record's `busiestWeekValueEn`/`Zh`). */
export function windowCaptionPartialEn(n: number): string {
  return `ONLY ${n} DAYS ON RECORD`;
}

export function windowCaptionPartialZh(n: number): string {
  return `僅有 ${n} 天的紀錄`;
}

/** Page-number footer — inherited verbatim from Phase 3's shipped contract
 * (same literal format, same absent-means-emit-nothing rule, applied
 * independently by index.ts). */
export function pageFooterEn(n: number, m: number): string {
  return `PAGE ${n}/${m}`;
}

export function pageFooterZh(n: number, m: number): string {
  return `頁 ${n} / ${m}`;
}
