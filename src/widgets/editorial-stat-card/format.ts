import { measureAdvanceWidth } from "../../core/font.js";

/**
 * 138px column-width budget (02-UI-SPEC.md "Card Layout" §Row 1:
 * `columnWidth = (447 − 2×16) / 3 ≈ 138`). This is the per-render
 * threshold `assertColumnBudget` enforces against a real formatted
 * string's measured advance width — a distinct constant from the layout
 * math's own `(CARD_WIDTH - 2 * PADDING - 2 * 16) / 3` formula (Task 2's
 * `renderBody`), which computes the same ~138.33 value for column
 * *positioning*. Kept as separate named constants deliberately: this one
 * is an integer safety threshold for the overflow backstop, not a layout
 * coordinate.
 */
export const COLUMN_BUDGET_PX = 138;

/** T2 numeral font size (02-UI-SPEC.md Typography: "T2 — stat display,
 * 32px"). Hardcoded here rather than imported from index.ts: format.ts is
 * a pure-function module with zero dependencies on any other widget file,
 * to avoid a circular import between index.ts (which imports
 * formatStatNumber/assertColumnBudget from here) and this module. */
const T2_SIZE = 32;

/** 02-UI-SPEC.md "Mixed Plex-Mono-digit + Noto-Serif-TC-suffix
 * composition": the 萬/億 suffix renders in Noto Serif TC at 92% of T2's
 * declared size. */
export const SUFFIX_SIZE_RATIO = 0.92;

/**
 * Thrown by assertColumnBudget when a formatted stat value's measured
 * render width exceeds COLUMN_BUDGET_PX. Names all four load-bearing
 * facts — field, formatted string, measured width, budget — never just
 * "too long" (mirrors src/core/svg.ts's SizeBudgetError convention).
 */
export class StatOverflowError extends Error {
  constructor(field: string, formatted: string, widthPx: number, budgetPx: number) {
    super(
      `StatOverflowError: field "${field}" formatted as "${formatted}" measures ` +
        `${widthPx}px, exceeding the ${budgetPx}px column budget.`,
    );
    this.name = "StatOverflowError";
  }
}

/**
 * Number Formatting Contract (02-UI-SPEC.md). D-09: 0 <= value < 10000
 * renders as a plain, unadorned integer in both languages — no thousands
 * separator, no special-casing for zero. value >= 10000 switches to a
 * language-native compact notation: en uses Intl.NumberFormat's built-in
 * "compact" notation (K/M, Western thousand/million grouping); zh-TW has
 * no Intl support for 萬/億 grouping, so it's computed by hand per the
 * UI-SPEC's explicit formula.
 */
export function formatStatNumber(value: number, language: "en" | "zh-TW"): string {
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
 * Per-render column-width backstop (UI-SPEC "stat-row overflow/long-text"
 * — the load-bearing new check this phase adds, since the numerals are
 * live, unbounded GitHub data and cannot be exhaustively checked at build
 * time the way Almanac's 48-phrase table was). Called BEFORE the
 * formatted string is turned into path data (Task 2's renderBody), so an
 * out-of-budget value fails the build loudly instead of silently
 * overflowing the rendered column.
 *
 * zh-TW's 萬/億 suffix is measured as two separate glyph runs — the digit
 * portion in IBM Plex Mono Semibold at T2_SIZE, the trailing Han
 * character in Noto Serif TC at T2_SIZE * 0.92 — summed together, per the
 * UI-SPEC's mixed-composition rule. Measuring the whole string as one
 * mono-semibold run would silently ignore the fact that 萬/億 has no
 * glyph in IBM Plex Mono at all and would misrepresent the suffix's true
 * (larger, serif) rendered width.
 */
export function assertColumnBudget(formatted: string, language: "en" | "zh-TW", field: string): void {
  let totalWidth: number;

  if (language === "zh-TW" && (formatted.endsWith("萬") || formatted.endsWith("億"))) {
    const chars = Array.from(formatted);
    const suffixChar = chars[chars.length - 1] as string;
    const digitsPart = chars.slice(0, -1).join("");
    totalWidth =
      measureAdvanceWidth("mono-semibold", digitsPart, T2_SIZE) +
      measureAdvanceWidth("noto-tc", suffixChar, T2_SIZE * SUFFIX_SIZE_RATIO);
  } else {
    totalWidth = measureAdvanceWidth("mono-semibold", formatted, T2_SIZE);
  }

  if (totalWidth > COLUMN_BUDGET_PX) {
    throw new StatOverflowError(field, formatted, totalWidth, COLUMN_BUDGET_PX);
  }
}
