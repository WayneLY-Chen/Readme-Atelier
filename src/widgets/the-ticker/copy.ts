/**
 * The Ticker copy — 06-UI-SPEC.md "Ticker chrome strings" table (Card Layout
 * 3 — The Ticker / 行情, CARD-07).
 *
 * The title slot is NOT a static chrome string on this card — it holds the
 * data-derived ticker symbol (see index.ts's `deriveSymbol`), so there is no
 * `chromeEn`/`chromeZh` title pair here the way The Record/Vitals have one.
 * The eyebrow carries the card's identity in both languages instead
 * (06-UI-SPEC.md "Declared chrome deviation" — same category as The
 * Graveyard's functional-data deviation).
 *
 * Separators are ASCII `" - "`, `" / "`, and `" = "` only, in both
 * languages. Banned glyphs, a standing constraint for future edits to this
 * file (06-UI-SPEC.md "Glyph coverage" — extends the four glyphs Phase 3/4
 * already banned):
 *   - `·` (U+00B7 MIDDLE DOT)
 *   - `．` (U+FF0E FULLWIDTH FULL STOP)
 *   - `▸` (U+25B8 BLACK RIGHT-POINTING SMALL TRIANGLE)
 *   - `…` (U+2026 HORIZONTAL ELLIPSIS, or any other truncation marker)
 *   - `▲` (U+25B2), `▼` (U+25BC), `●` (U+25CF) — absent from all four
 *     committed font subsets (verified directly with opentype.js) and
 *     banned project-wide for direction-encoding; this card carries
 *     direction by fill state (Rule C-3) and by ASCII `+`/`-` only.
 *   - `—` (U+2014 EM DASH) in en copy — present in noto-tc, absent from the
 *     ASCII-only mono and Latin-1-only serif subsets.
 */

/** Eyebrow, right-aligned, both languages (06-UI-SPEC.md "Header row" —
 * "Declared chrome deviation"). `n` is the REAL number of monthly candles
 * rendered (0..12) — never hardcoded to 12 (T3's honesty rule). */
export function eyebrowEn(n: number): string {
  return `THE TICKER / ${n} MONTHS`;
}

export function eyebrowZh(n: number): string {
  return `行情 / ${n} 個月`;
}

export const bandLabelEn = "THIS MONTH";
export const bandLabelZh = "本月";

export const subLabelEn = "OPEN TO CLOSE";
export const subLabelZh = "開盤到收盤";

/** Change-figure degenerate branch: open === 0 && close === 0
 * (06-UI-SPEC.md "The change figure", two defined degenerate branches).
 * Rendered at T3 `muted`, NOT T2 — a non-value at display size overstates
 * it (mirrors The Record's NONE/無 treatment). */
export const flatEn = "FLAT";
export const flatZh = "持平";

export const ohlcvLabelEnOpen = "OPEN";
export const ohlcvLabelEnHigh = "HIGH";
export const ohlcvLabelEnLow = "LOW";
export const ohlcvLabelEnVol = "VOL";

export const ohlcvLabelZhOpen = "開";
export const ohlcvLabelZhHigh = "高";
export const ohlcvLabelZhLow = "低";
export const ohlcvLabelZhVol = "量";

/** Legend + basis line (06-UI-SPEC.md "Bottom row") — states Rule C-3 in
 * words on every render (not just this card's design intent — a reader
 * cannot rely on colour to read direction, so the words carry it). */
export const legendEn = "FILLED UP / HOLLOW DOWN / LEVEL = TRAILING 7 DAYS";
export const legendZh = "實心漲 空心跌，水位 = 近 7 天貢獻數";

/** Empty state (no calendar at all, T1) — replaces the legend line, does
 * not add to it (06-UI-SPEC.md Degenerate States T1). */
export const emptyStateEn = "No trading history yet.";
export const emptyStateZh = "目前沒有可畫的交易紀錄。";

/** Page-number footer — inherited verbatim from Phase 3's masthead/
 * editorial-stat-card/the-record/vitals convention (same literal format,
 * same absent-means-emit-nothing contract, applied independently by
 * index.ts). */
export function pageFooterEn(n: number, m: number): string {
  return `PAGE ${n}/${m}`;
}

export function pageFooterZh(n: number, m: number): string {
  return `頁 ${n} / ${m}`;
}
