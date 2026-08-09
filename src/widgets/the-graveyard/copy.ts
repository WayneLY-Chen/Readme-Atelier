/**
 * The Graveyard copy — 03-UI-SPEC.md "Graveyard chrome strings" table.
 *
 * Two deviations from the UI-SPEC's literal copy, both Rule 1 (auto-fixed
 * bug), both glyph-coverage failures verified empirically against the real
 * built font subsets in `assets/fonts/` (the same class of fix Plan 03-01
 * already made for the masthead's contents separator):
 *
 * 1. `bornDiedEn`'s `"BORN {born} · DIED {died}"` — the UI-SPEC's `" · "`
 *    (U+00B7 MIDDLE DOT) is outside `ibm-plex-mono-semibold`'s subset
 *    (`scripts/build-fonts.ts`'s `ASCII_PRINTABLE`, 0x20-0x7E only; U+00B7
 *    is in the Latin-1 Supplement block). Substituted `" - "` (ASCII
 *    hyphen), confirmed present.
 * 2. `bornDiedZh`'s `"生於 {born}．卒於 {died}"` — the UI-SPEC's `"．"`
 *    (U+FF0E FULLWIDTH FULL STOP) is outside `noto-serif-tc`'s subset
 *    (verified via `font.charToGlyphIndex("．")` === 0 on the written
 *    `assets/fonts/noto-serif-tc.subset.ttf`; `scripts/build-fonts.ts`'s
 *    `FULL_AND_HALF_WIDTH_PUNCTUATION` list includes `"。"` U+3002
 *    IDEOGRAPHIC FULL STOP but not the distinct Fullwidth-Forms-block
 *    U+FF0E glyph). Substituted `"。"`, confirmed present and semantically
 *    equivalent (separates two short factual clauses).
 *
 * Both strings render through the existing `assertCoverage()`/
 * `textToPathData()` engine-authored-text path (RENDER-05's fail-loud
 * policy for engine-authored chrome text) — rendering either literal
 * separator would throw `GlyphCoverageError` on every populated Graveyard
 * card in that language.
 */

export const chromeEn = { title: "THE GRAVEYARD" };
export const chromeZh = { title: "廢墟" };

export const emptyCaptionEn = "Everything here is still alive.";
export const emptyCaptionZh = "這裡目前什麼都還活著。";

export const shortestLivedLabelEn = "SHORTEST-LIVED:";
export const shortestLivedLabelZh = "最短命：";

export function buriedCountEn(n: number): string {
  return `${n} BURIED`;
}

export function buriedCountZh(n: number): string {
  return `已埋葬 ${n}`;
}

export function dayCountLabelEn(n: number): string {
  return `${n}D`;
}

export function dayCountLabelZh(n: number): string {
  return `${n}天`;
}

/** See the module doc comment above: `" - "` substituted for the UI-SPEC's
 * literal `" · "` (U+00B7), which neither built font subset covers. */
export function bornDiedEn(born: string, died: string): string {
  return `BORN ${born} - DIED ${died}`;
}

export function bornDiedZh(born: string, died: string): string {
  return `生於 ${born}。卒於 ${died}`;
}
