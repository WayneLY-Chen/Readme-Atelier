import { measureAdvanceWidth } from "../../core/font.js";

/**
 * T1 font size (06-UI-SPEC.md Typography: "T1 — eyebrow/label, 8px"). The
 * OHLCV band values render at T1, NOT T2 — unlike The Record's total
 * numeral, this card's four quote-band figures sit inline with their labels
 * in the small chrome row, not as a headline display numeral. Hardcoded
 * here rather than imported from index.ts: format.ts is a pure-function
 * module with zero dependencies on any other widget file, to avoid a
 * circular import between index.ts (which imports this file's exports) and
 * this module — same reasoning as the-record/format.ts's own T2_SIZE
 * re-declaration and editorial-stat-card/format.ts's own T2_SIZE
 * re-declaration.
 */
const T1_SIZE = 8;

/** 06-UI-SPEC.md "Number formatting": the zh-TW 萬/億 suffix renders in Noto
 * Serif TC at 92% of the declared size — applied proportionally to T1 here
 * (the shipped SUFFIX_SIZE_RATIO convention, carried over from T2 to T1). */
export const SUFFIX_SIZE_RATIO = 0.92;

/**
 * Thrown by assertSlotBudget when a formatted string's measured render
 * width exceeds its slot's budget. Names all four load-bearing facts —
 * field, formatted string, measured width, budget — never just "too long"
 * (mirrors src/core/svg.ts's SizeBudgetError / the-record's
 * RecordSlotOverflowError / editorial-stat-card's StatOverflowError
 * convention).
 */
export class TickerSlotOverflowError extends Error {
  constructor(field: string, formatted: string, widthPx: number, budgetPx: number) {
    super(
      `TickerSlotOverflowError: field "${field}" formatted as "${formatted}" measures ` +
        `${widthPx}px, exceeding the ${budgetPx}px slot budget.`,
    );
    this.name = "TickerSlotOverflowError";
  }
}

/**
 * Per-render slot-width backstop (06-UI-SPEC.md "Text slot budgets —
 * Ticker") — every one of the Ticker's text slots is engine-authored EXCEPT
 * the ticker symbol, which is transformed into guaranteed ASCII before it
 * is ever measured (see deriveSymbol below), so RENDER-05's original
 * fail-loud policy applies in full across this whole card (Phase 3's
 * truncate-with-ellipsis policy for API-sourced text applies to NO slot on
 * this card). Called before the corresponding path data is built, so an
 * out-of-budget string fails the build loudly instead of silently
 * overflowing the rendered card.
 */
export function assertSlotBudget(field: string, formatted: string, widthPx: number, budgetPx: number): void {
  if (widthPx > budgetPx) {
    throw new TickerSlotOverflowError(field, formatted, widthPx, budgetPx);
  }
}

/**
 * Number Formatting Contract (02-UI-SPEC.md, restated at 04-UI-SPEC.md and
 * 06-UI-SPEC.md): 0 <= value < 10000 renders as a plain, unadorned integer
 * in both languages — no thousands separator, no special-casing for zero.
 * value >= 10000 switches to a language-native compact notation: en uses
 * Intl.NumberFormat's built-in "compact" notation (K/M); zh-TW has no Intl
 * support for 萬/億 grouping, so it is computed by hand per the UI-SPEC's
 * explicit formula.
 *
 * Deliberately duplicated a THIRD time from editorial-stat-card/format.ts's
 * `formatStatNumber` and the-record/format.ts's `formatRecordNumber`
 * (RENDER-02: no widget imports another widget's private helper — the same
 * deliberate duplication Phase 3/4 already shipped twice). 06-UI-SPEC.md
 * Watch Item B counts this as the 3rd copy and explicitly instructs: do NOT
 * extract it in Phase 6. format.test.ts's duplication-proof block proves
 * this copy has not silently diverged from EITHER existing copy.
 */
export function formatTickerNumber(value: number, language: "en" | "zh-TW"): string {
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

/** The result of splitting a formatted ticker value into its drawable
 * parts. `suffixChar` is `null` when the value has no zh-TW 萬/億 suffix
 * (every en value, and every zh-TW value < 10000). */
export interface TickerValueSplit {
  digitsPart: string;
  suffixChar: string | null;
  digitsWidth: number;
  suffixWidth: number;
  totalWidth: number;
}

/**
 * The T1 OHLCV value's own mixed-font split: the digit run in IBM Plex Mono
 * Semibold at T1_SIZE, plus (when present) the zh-TW 萬/億 suffix as a
 * separate Noto Serif TC run at T1_SIZE * SUFFIX_SIZE_RATIO.
 *
 * This is the SINGLE function both the slot-budget check
 * (`measureTickerValueWidth` below) and index.ts's actual glyph placement
 * call — unlike the-record/vitals's pattern of two independent
 * implementations (format.ts's measurement math and index.ts's own
 * `renderNumeral`/`renderT2Value` draw math) that merely AGREE by being
 * tested against each other, this card shares the literal split
 * computation so the two paths cannot silently diverge in the first place.
 * 02-02's own STATE.md-recorded lesson: two independent copies of the same
 * math have a divergence day; one shared function does not.
 */
export function splitTickerValue(formatted: string, language: "en" | "zh-TW"): TickerValueSplit {
  if (language === "zh-TW" && (formatted.endsWith("萬") || formatted.endsWith("億"))) {
    const chars = Array.from(formatted);
    const suffixChar = chars[chars.length - 1] as string;
    const digitsPart = chars.slice(0, -1).join("");
    const digitsWidth = measureAdvanceWidth("mono-semibold", digitsPart, T1_SIZE);
    const suffixWidth = measureAdvanceWidth("noto-tc", suffixChar, T1_SIZE * SUFFIX_SIZE_RATIO);
    return { digitsPart, suffixChar, digitsWidth, suffixWidth, totalWidth: digitsWidth + suffixWidth };
  }
  const digitsWidth = measureAdvanceWidth("mono-semibold", formatted, T1_SIZE);
  return { digitsPart: formatted, suffixChar: null, digitsWidth, suffixWidth: 0, totalWidth: digitsWidth };
}

/** Convenience wrapper over `splitTickerValue` for slot-budget callers that
 * only need the total measured width, not the split itself. */
export function measureTickerValueWidth(formatted: string, language: "en" | "zh-TW"): number {
  return splitTickerValue(formatted, language).totalWidth;
}

/**
 * Ticker symbol derivation (06-UI-SPEC.md "Ticker symbol derivation";
 * prohibition 10's decision, recorded here and in index.ts's rendering
 * call site):
 *
 *   raw    = login.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
 *   symbol = raw === "" ? "$DEV" : "$" + raw.slice(0, 5)
 *
 * The pattern map (06-PATTERNS.md §4) argues API-sourced text should go
 * through `apiSourcedTextPathData` (the degrade-not-throw path). The
 * approved UI-SPEC overrules that with a reasoned exception: this
 * transform's OUTPUT character set is always exactly `[$A-Z0-9]` — a strict
 * subset of ASCII, guaranteed by construction (strip everything outside
 * `[A-Za-z0-9]`, uppercase, cap at 5 characters, prefix `$`) — which is
 * fully covered by every committed font subset. `assertCoverage` therefore
 * can never legitimately throw for this string, which is exactly what makes
 * routing it through the fail-loud engine-authored path
 * (`assertCoverage` + `textToPathData`, in index.ts) SAFE rather than
 * reckless: the placeholder-glyph degrade path exists for text whose
 * coverage is genuinely uncertain, and after this transform it is not. Any
 * of the three new Phase 6 cards calling `apiSourcedTextPathData` is a
 * review finding (06-UI-SPEC.md, verbatim).
 *
 * The transform is ALSO the card's entire injection mitigation (T-06-21):
 * every character outside `[A-Za-z0-9]` — quotes, angle brackets,
 * whitespace, CJK, emoji, control characters — is stripped before anything
 * touches markup, so no character from `data.login` can ever reach the
 * rendered SVG. format.test.ts pins this against an adversarial input table
 * (XML special characters, an all-symbol login, CJK, very long logins).
 */
export function deriveSymbol(login: string): string {
  const raw = login.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return raw === "" ? "$DEV" : "$" + raw.slice(0, 5);
}

/** The three shapes `formatChange`'s result can take (06-UI-SPEC.md "The
 * change figure"). `kind: "flat"` carries no text — the caller looks up
 * `flatEn`/`flatZh` from copy.ts, exactly as `formatChange`'s two other
 * kinds are ALREADY-formatted strings the caller draws directly (never
 * re-formats), the same "caller draws a pre-formatted string" discipline
 * the-record/copy.ts's busiestWeekValueEn/Zh document. */
export type TickerChange = { kind: "flat" } | { kind: "percent"; text: string } | { kind: "level"; text: string };

/**
 * The month-over-month change figure (06-UI-SPEC.md "The change figure").
 * `change% = (close - open) / open * 100`, one decimal, ASCII sign ALWAYS
 * printed (`+18.4%`, `-6.2%`, `+0.0%` — never a bare, signless zero).
 *
 * Two defined degenerate branches, in the order the UI-SPEC states them:
 *   - open === 0 && close === 0 -> `{ kind: "flat" }` (percentage is 0/0,
 *     undefined; a real value at display size would overstate a
 *     non-reading).
 *   - open === 0 && close > 0 -> `{ kind: "level", text: "+{close-open}" }`
 *     — the percentage is mathematically undefined (division by zero), so
 *     the ABSOLUTE level change is rendered instead, signed, with NO
 *     percent sign. The absence of `%` is itself the reader's signal that
 *     the units changed from percent to level.
 *
 * Every other (open > 0) case falls through to the normal percent formula.
 * `open < 0` is not a reachable state — L(d) is derived from non-negative
 * contribution counts (round() of a non-negative average), so Open/High/
 * Low/Close are all >= 0 by construction.
 */
export function formatChange(open: number, close: number): TickerChange {
  if (open === 0 && close === 0) {
    return { kind: "flat" };
  }
  if (open === 0 && close > 0) {
    const delta = close - open;
    const sign = delta >= 0 ? "+" : "-";
    return { kind: "level", text: `${sign}${Math.abs(delta)}` };
  }
  const pct = ((close - open) / open) * 100;
  const sign = pct >= 0 ? "+" : "-";
  return { kind: "percent", text: `${sign}${Math.abs(pct).toFixed(1)}%` };
}
