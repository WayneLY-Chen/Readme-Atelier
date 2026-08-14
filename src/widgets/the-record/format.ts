import { measureAdvanceWidth } from "../../core/font.js";

/** T2 numeral font size (04-UI-SPEC.md Typography: "T2 — display numeral,
 * 32px"). Hardcoded here rather than imported from index.ts: format.ts is a
 * pure-function module with zero dependencies on any other widget file, to
 * avoid a circular import between index.ts (which imports
 * `formatRecordNumber`/`measureRecordNumeralWidth` from here) and this
 * module — same reasoning as editorial-stat-card/format.ts's own T2_SIZE
 * re-declaration. */
const T2_SIZE = 32;

/** 04-UI-SPEC.md "Number formatting": the zh-TW 萬/億 suffix renders in Noto
 * Serif TC at 92% of T2's declared size. */
export const SUFFIX_SIZE_RATIO = 0.92;

/**
 * Thrown by assertSlotBudget when a formatted string's measured render
 * width exceeds its slot's budget. Names all four load-bearing facts —
 * field, formatted string, measured width, budget — never just "too long"
 * (mirrors src/core/svg.ts's SizeBudgetError / editorial-stat-card's
 * StatOverflowError convention).
 */
export class RecordSlotOverflowError extends Error {
  constructor(field: string, formatted: string, widthPx: number, budgetPx: number) {
    super(
      `RecordSlotOverflowError: field "${field}" formatted as "${formatted}" measures ` +
        `${widthPx}px, exceeding the ${budgetPx}px slot budget.`,
    );
    this.name = "RecordSlotOverflowError";
  }
}

/**
 * Number Formatting Contract (02-UI-SPEC.md, restated at 04-UI-SPEC.md "Card
 * Layout — The Record" §5): 0 <= value < 10000 renders as a plain, unadorned
 * integer in both languages — no thousands separator, no special-casing for
 * zero. value >= 10000 switches to a language-native compact notation: en
 * uses Intl.NumberFormat's built-in "compact" notation (K/M); zh-TW has no
 * Intl support for 萬/億 grouping, so it is computed by hand per the
 * UI-SPEC's explicit formula.
 *
 * Deliberately duplicated from editorial-stat-card/format.ts's
 * `formatStatNumber` (RENDER-02: no widget imports another widget's private
 * helper — the same deliberate duplication as Phase 3's chassis helpers).
 * format.test.ts proves this duplication has not silently diverged.
 */
export function formatRecordNumber(value: number, language: "en" | "zh-TW"): string {
  if (value < 10000) {
    return String(value);
  }
  if (language === "en") {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (value < 100_000_000) {
    return `${(value / 10_000).toFixed(1)}萬`;
  }
  return `${(value / 100_000_000).toFixed(1)}億`;
}

/**
 * The T2 total numeral's own mixed-font measurement: the digit run in IBM
 * Plex Mono Semibold at T2_SIZE, plus (when present) the zh-TW 萬/億 suffix
 * as a separate Noto Serif TC run at T2_SIZE * SUFFIX_SIZE_RATIO, summed.
 * Shared by index.ts's `renderNumeral` (the actual glyph positioning) and by
 * this card's own total-numeral slot-budget check (via `assertSlotBudget`),
 * so the two can never silently disagree about the zh-TW suffix's rendered
 * width — precisely the hazard the RENDER-02 duplication would otherwise
 * create, mirroring editorial-stat-card/format.ts's `assertColumnBudget`.
 */
export function measureRecordNumeralWidth(formatted: string, language: "en" | "zh-TW"): number {
  if (language === "zh-TW" && (formatted.endsWith("萬") || formatted.endsWith("億"))) {
    const chars = Array.from(formatted);
    const suffixChar = chars[chars.length - 1] as string;
    const digitsPart = chars.slice(0, -1).join("");
    return (
      measureAdvanceWidth("mono-semibold", digitsPart, T2_SIZE) +
      measureAdvanceWidth("noto-tc", suffixChar, T2_SIZE * SUFFIX_SIZE_RATIO)
    );
  }
  return measureAdvanceWidth("mono-semibold", formatted, T2_SIZE);
}

/**
 * Per-render slot-width backstop (04-UI-SPEC.md "Text slot budgets") — every
 * one of The Record's seven text slots is engine-authored, so RENDER-05's
 * original fail-loud policy applies in full (Phase 3's truncate-with-
 * ellipsis policy for API-sourced text does NOT apply to this card). Takes
 * an already-measured `widthPx` (unlike editorial-stat-card's
 * `assertColumnBudget`, which measures internally against one shared column
 * budget) because The Record's seven slots each need a different
 * measurement recipe (T1 mono vs. T1 noto-tc vs. T3 content vs. the T2
 * mixed-font split above) — centralizing measurement here would just move
 * the same per-slot dispatch into this file with no benefit. Called before
 * the corresponding path data is built, so an out-of-budget string fails
 * the build loudly instead of silently overflowing the rendered card.
 */
export function assertSlotBudget(field: string, formatted: string, widthPx: number, budgetPx: number): void {
  if (widthPx > budgetPx) {
    throw new RecordSlotOverflowError(field, formatted, widthPx, budgetPx);
  }
}
