/**
 * Masthead copy — 03-UI-SPEC.md "Masthead chrome strings" table.
 *
 * Deviation from the UI-SPEC's literal `" · "` (U+00B7 MIDDLE DOT) contents
 * separator, recorded in SUMMARY.md (Rule 1 — auto-fixed bug): verified
 * empirically against the actual built font subsets
 * (`assets/fonts/ibm-plex-mono-semibold.subset.ttf` and
 * `assets/fonts/noto-serif-tc.subset.ttf`) that NEITHER font's subset
 * includes U+00B7 — `ibm-plex-mono-*` was subsetted to ASCII-printable only
 * (0x20-0x7E, `scripts/build-fonts.ts`'s `ASCII_PRINTABLE`) and
 * `noto-serif-tc` was subsetted to ASCII-printable + the MOE common-Hanzi
 * table + a fixed CJK punctuation list, neither of which includes the Latin-1
 * Supplement block U+00B7 belongs to. Rendering the literal separator would
 * throw `GlyphCoverageError` on every masthead render with 2+ contents
 * entries — this is engine-authored T1 chrome text, so RENDER-05's
 * fail-loud policy is doing exactly its job here, and the fix is to correct
 * the copy (same class of fix STATE.md already records for Phase 1's
 * 宜/忌 budget errors), not to touch font assets or bypass the coverage gate.
 * `" - "` (ASCII hyphen) is confirmed present in both fonts' subsets.
 */

export interface MastheadChrome {
  title: string;
  subtitleSuffix: string;
  issueNumberTemplate: (n: number) => string;
  contentsLabel: string;
  contentsSeparator: string;
}

export const chromeEn: MastheadChrome = {
  title: "README ATELIER",
  subtitleSuffix: "'S DEV LOG",
  issueNumberTemplate: (n: number) => `NO. ${n}`,
  contentsLabel: "CONTENTS",
  contentsSeparator: " - ",
};

export const chromeZh: MastheadChrome = {
  title: "README ATELIER",
  subtitleSuffix: " 的開發日誌",
  issueNumberTemplate: (n: number) => `第 ${n} 期`,
  contentsLabel: "目次",
  contentsSeparator: " - ",
};
