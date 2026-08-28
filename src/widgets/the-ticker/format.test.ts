import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph, measureAdvanceWidth } from "../../core/font.js";
import { loadAllFonts } from "../../node/fonts.js";
import { formatRecordNumber } from "../the-record/format.js";
import { formatStatNumber } from "../editorial-stat-card/format.js";
import {
  bandLabelEn,
  bandLabelZh,
  emptyStateEn,
  emptyStateZh,
  eyebrowEn,
  eyebrowZh,
  flatEn,
  flatZh,
  legendEn,
  legendZh,
  ohlcvLabelEnHigh,
  ohlcvLabelEnLow,
  ohlcvLabelEnOpen,
  ohlcvLabelEnVol,
  ohlcvLabelZhHigh,
  ohlcvLabelZhLow,
  ohlcvLabelZhOpen,
  ohlcvLabelZhVol,
  pageFooterEn,
  pageFooterZh,
  subLabelEn,
  subLabelZh,
} from "./copy.js";
import {
  assertSlotBudget,
  deriveSymbol,
  formatChange,
  formatTickerNumber,
  measureTickerValueWidth,
  TickerSlotOverflowError,
} from "./format.js";

beforeAll(() => {
  loadAllFonts();
});

// ---------------------------------------------------------------------------
// formatTickerNumber — RENDER-02 duplication proof, against BOTH existing
// copies (06-PATTERNS.md §6 / this plan's Task 1 requirement). This is the
// THIRD copy of the 萬/億 compact-number logic.
// ---------------------------------------------------------------------------

const VALUE_TABLE = [0, 1, 999, 9999, 10000, 12345, 1234567];

describe("formatTickerNumber — agrees with editorial-stat-card's formatStatNumber (RENDER-02 duplication proof)", () => {
  it.each(VALUE_TABLE)("value=%i: en output matches", (value) => {
    expect(formatTickerNumber(value, "en")).toBe(formatStatNumber(value, "en"));
  });

  it.each(VALUE_TABLE)("value=%i: zh-TW output matches", (value) => {
    expect(formatTickerNumber(value, "zh-TW")).toBe(formatStatNumber(value, "zh-TW"));
  });
});

describe("formatTickerNumber — agrees with the-record's formatRecordNumber (RENDER-02 duplication proof, second existing copy)", () => {
  it.each(VALUE_TABLE)("value=%i: en output matches", (value) => {
    expect(formatTickerNumber(value, "en")).toBe(formatRecordNumber(value, "en"));
  });

  it.each(VALUE_TABLE)("value=%i: zh-TW output matches", (value) => {
    expect(formatTickerNumber(value, "zh-TW")).toBe(formatRecordNumber(value, "zh-TW"));
  });
});

// ---------------------------------------------------------------------------
// deriveSymbol — the card's single API-sourced text field, and the sole
// injection-mitigation surface (T-06-21). Adversarial inputs are pinned so
// the output NEVER escapes the guaranteed-ASCII character set.
// ---------------------------------------------------------------------------

describe("deriveSymbol — worked examples (06-UI-SPEC.md 'Ticker symbol derivation')", () => {
  it('deriveSymbol("WayneLY-Chen") === "$WAYNE"', () => {
    expect(deriveSymbol("WayneLY-Chen")).toBe("$WAYNE");
  });

  it('deriveSymbol("octocat") === "$OCTOC"', () => {
    expect(deriveSymbol("octocat")).toBe("$OCTOC");
  });

  it('deriveSymbol("a") === "$A"', () => {
    expect(deriveSymbol("a")).toBe("$A");
  });

  it('deriveSymbol("---") === "$DEV" (all-symbol login, T7)', () => {
    expect(deriveSymbol("---")).toBe("$DEV");
  });

  it('deriveSymbol("") === "$DEV" (empty login)', () => {
    expect(deriveSymbol("")).toBe("$DEV");
  });
});

describe("deriveSymbol — adversarial inputs always produce a safe, bounded symbol (T-06-21 mitigation)", () => {
  const ADVERSARIAL_LOGINS = [
    '"><script>alert(1)</script>',
    "<img src=x onerror=alert(1)>",
    "a&b'c\"d",
    "   ",
    "測試使用者",
    "😀😀😀",
    "12345",
    "9octocat",
    "a".repeat(500),
    "!@#$%^&*()",
    "\n\t\r",
  ];

  it.each(ADVERSARIAL_LOGINS)("login=%j: output matches /^\\$[A-Z0-9]{1,5}$/", (login) => {
    const symbol = deriveSymbol(login);
    expect(symbol).toMatch(/^\$[A-Z0-9]{1,5}$/);
  });

  it.each(ADVERSARIAL_LOGINS)("login=%j: output never contains any raw character from the login beyond the safe set", (login) => {
    const symbol = deriveSymbol(login);
    // The safe output character set is exactly [$A-Z0-9] — assert nothing
    // else survives, i.e. the transform is the whole mitigation.
    expect(Array.from(symbol).every((ch) => /[$A-Z0-9]/.test(ch))).toBe(true);
  });

  it("output length is always <= 6", () => {
    for (const login of ADVERSARIAL_LOGINS) {
      expect(deriveSymbol(login).length).toBeLessThanOrEqual(6);
    }
  });
});

// ---------------------------------------------------------------------------
// formatChange — three branches (normal percent, FLAT, bare level change).
// ---------------------------------------------------------------------------

describe("formatChange — normal percent branch, ASCII sign always printed", () => {
  it("close > open produces a '+' prefixed percent, one decimal", () => {
    const result = formatChange(214, 253.4952);
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") {
      expect(result.text).toBe("+18.5%");
    }
  });

  it("close < open produces a '-' prefixed percent", () => {
    const result = formatChange(100, 93.8);
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") {
      expect(result.text).toBe("-6.2%");
    }
  });

  it("close === open (unchanged, open > 0) still prints an explicit '+' sign on 0.0%", () => {
    const result = formatChange(100, 100);
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") {
      expect(result.text).toBe("+0.0%");
    }
  });

  it("close === 0, open > 0 produces the worst-case -100.0%", () => {
    const result = formatChange(214, 0);
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") {
      expect(result.text).toBe("-100.0%");
    }
  });
});

describe("formatChange — degenerate branch: open === 0 && close === 0 => FLAT signal (T4)", () => {
  it("returns the flat kind", () => {
    expect(formatChange(0, 0).kind).toBe("flat");
  });
});

describe("formatChange — degenerate branch: open === 0 && close > 0 => signed absolute level, no percent (T4)", () => {
  it("returns a signed integer level change with no % sign", () => {
    const result = formatChange(0, 40);
    expect(result.kind).toBe("level");
    if (result.kind === "level") {
      expect(result.text).toBe("+40");
      expect(result.text).not.toContain("%");
    }
  });
});

// ---------------------------------------------------------------------------
// assertSlotBudget / TickerSlotOverflowError
// ---------------------------------------------------------------------------

describe("assertSlotBudget — fail-loud slot-width backstop", () => {
  it("throws TickerSlotOverflowError when the measured width exceeds the budget", () => {
    expect(() => assertSlotBudget("legend", "x".repeat(80), 400, 340)).toThrow(TickerSlotOverflowError);
  });

  it("the thrown message names the field, the formatted string, the measured width, and the budget", () => {
    try {
      assertSlotBudget("legend", "…", 400, 340);
      expect.fail("expected assertSlotBudget to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TickerSlotOverflowError);
      const message = (err as Error).message;
      expect(message).toContain("legend");
      expect(message).toContain("…");
      expect(message).toContain("400");
      expect(message).toContain("340");
    }
  });

  it("returns silently when the measured width is within budget", () => {
    expect(() => assertSlotBudget("legend", "ok", 100, 340)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// measureTickerValueWidth — the shared measurement+draw math (02-02's
// lesson: two independent implementations diverge; this project has ONE
// function budget check and drawing both call).
// ---------------------------------------------------------------------------

describe("measureTickerValueWidth — mixed-font OHLCV value measurement", () => {
  it("a plain en value (no suffix) measures as a single mono-semibold run", () => {
    const width = measureTickerValueWidth("3,481", "en");
    expect(width).toBe(measureAdvanceWidth("mono-semibold", "3,481", 8));
  });

  it("a zh-TW value with a 萬 suffix splits into a mono digit run plus a noto-tc suffix run at 92% size", () => {
    const formatted = formatTickerNumber(123456, "zh-TW");
    expect(formatted.endsWith("萬")).toBe(true);
    const width = measureTickerValueWidth(formatted, "zh-TW");
    const digitsPart = formatted.slice(0, -1);
    const expected =
      measureAdvanceWidth("mono-semibold", digitsPart, 8) + measureAdvanceWidth("noto-tc", "萬", 8 * 0.92);
    expect(width).toBeCloseTo(expected, 5);
  });
});

// ---------------------------------------------------------------------------
// Ticker slot-budget sweep — every measured worst case from 06-UI-SPEC.md's
// Ticker text slot budget table (Typography "Text slot budgets" — Ticker).
// ---------------------------------------------------------------------------

describe("Ticker text slot budgets — measured worst cases stay within their budget (Typography table)", () => {
  it("symbol '$WAYNE' (T3-mono, mono-semibold 17px) <= 120px", () => {
    expect(measureAdvanceWidth("mono-semibold", "$WAYNE", 17)).toBeLessThanOrEqual(120);
  });

  it("eyebrow en 'THE TICKER / 12 MONTHS' (T1 mono, uppercase, +1.6 letter-spacing) <= 200px", () => {
    const text = eyebrowEn(12).toUpperCase();
    const chars = Array.from(text);
    let width = 0;
    chars.forEach((ch, i) => {
      width += measureAdvanceWidth("mono-semibold", ch, 8) + (i < chars.length - 1 ? 1.6 : 0);
    });
    expect(width).toBeLessThanOrEqual(200);
  });

  it("eyebrow zh '行情 / 12 個月' (T1 noto-tc) <= 200px", () => {
    expect(measureAdvanceWidth("noto-tc", eyebrowZh(12), 8)).toBeLessThanOrEqual(200);
  });

  it("change figure worst case '-100.0%' (T2 mono-semibold 32px) <= 150px", () => {
    expect(measureAdvanceWidth("mono-semibold", "-100.0%", 32)).toBeLessThanOrEqual(150);
  });

  it("change substitute en 'FLAT' (T3 serif 17px) <= 150px", () => {
    expect(measureAdvanceWidth("serif", flatEn, 17)).toBeLessThanOrEqual(150);
  });

  it("change substitute zh '持平' (T3 noto-tc 17px) <= 150px", () => {
    expect(measureAdvanceWidth("noto-tc", flatZh, 17)).toBeLessThanOrEqual(150);
  });

  it("band label en 'THIS MONTH' (T1 mono, letter-spaced) <= 120px", () => {
    const chars = Array.from(bandLabelEn.toUpperCase());
    let width = 0;
    chars.forEach((ch, i) => {
      width += measureAdvanceWidth("mono-semibold", ch, 8) + (i < chars.length - 1 ? 1.6 : 0);
    });
    expect(width).toBeLessThanOrEqual(120);
  });

  it("band label zh '本月' (T1 noto-tc) <= 120px", () => {
    expect(measureAdvanceWidth("noto-tc", bandLabelZh, 8)).toBeLessThanOrEqual(120);
  });

  it("sub-label en 'OPEN TO CLOSE' (T1 mono, letter-spaced) <= 160px", () => {
    const chars = Array.from(subLabelEn.toUpperCase());
    let width = 0;
    chars.forEach((ch, i) => {
      width += measureAdvanceWidth("mono-semibold", ch, 8) + (i < chars.length - 1 ? 1.6 : 0);
    });
    expect(width).toBeLessThanOrEqual(160);
  });

  it("sub-label zh '開盤到收盤' (T1 noto-tc) <= 160px", () => {
    expect(measureAdvanceWidth("noto-tc", subLabelZh, 8)).toBeLessThanOrEqual(160);
  });

  it("OHLCV value worst cases ('12.3K', '3,481', zh '1.2萬') <= 44px each", () => {
    expect(measureAdvanceWidth("mono-semibold", "12.3K", 8)).toBeLessThanOrEqual(44);
    expect(measureAdvanceWidth("mono-semibold", "3,481", 8)).toBeLessThanOrEqual(44);
    expect(measureTickerValueWidth("1.2萬", "zh-TW")).toBeLessThanOrEqual(44);
  });

  it("month-axis numeral '12' (T1 mono) <= 24px", () => {
    expect(measureAdvanceWidth("mono-semibold", "12", 8)).toBeLessThanOrEqual(24);
  });

  it("legend en (T1 mono, letter-spaced) <= 340px", () => {
    const chars = Array.from(legendEn.toUpperCase());
    let width = 0;
    chars.forEach((ch, i) => {
      width += measureAdvanceWidth("mono-semibold", ch, 8) + (i < chars.length - 1 ? 1.6 : 0);
    });
    expect(width).toBeLessThanOrEqual(340);
  });

  it("legend zh (T1 noto-tc) <= 340px", () => {
    expect(measureAdvanceWidth("noto-tc", legendZh, 8)).toBeLessThanOrEqual(340);
  });

  it("empty-state sentence en (T3 serif 17px) <= 400px", () => {
    expect(measureAdvanceWidth("serif", emptyStateEn, 17)).toBeLessThanOrEqual(400);
  });

  it("empty-state sentence zh (T3 noto-tc 17px) <= 400px", () => {
    expect(measureAdvanceWidth("noto-tc", emptyStateZh, 17)).toBeLessThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// copy.ts — glyph coverage against the real bundled font subsets (same
// placement precedent as the-record/format.test.ts:113).
// ---------------------------------------------------------------------------

const ALL_COPY_STRINGS_EN: string[] = [
  eyebrowEn(12),
  eyebrowEn(0),
  bandLabelEn,
  subLabelEn,
  flatEn,
  ohlcvLabelEnOpen,
  ohlcvLabelEnHigh,
  ohlcvLabelEnLow,
  ohlcvLabelEnVol,
  legendEn,
  emptyStateEn,
  pageFooterEn(4, 4),
  "$WAYNE",
  "+18.4%",
  "-100.0%",
  "+40",
];

const ALL_COPY_STRINGS_ZH: string[] = [
  eyebrowZh(12),
  eyebrowZh(0),
  bandLabelZh,
  subLabelZh,
  flatZh,
  ohlcvLabelZhOpen,
  ohlcvLabelZhHigh,
  ohlcvLabelZhLow,
  ohlcvLabelZhVol,
  legendZh,
  emptyStateZh,
  pageFooterZh(4, 4),
];

describe("copy.ts — glyph coverage against the real bundled font subsets (Pitfall 4)", () => {
  it("every en copy string's characters are covered by mono-semibold or serif", () => {
    for (const str of ALL_COPY_STRINGS_EN) {
      for (const char of Array.from(str)) {
        const covered = hasGlyph("mono-semibold", char) || hasGlyph("serif", char);
        expect(covered, `"${char}" in "${str}" (en)`).toBe(true);
      }
    }
  });

  it("every zh-TW copy string's characters are covered by mono-semibold or noto-tc", () => {
    for (const str of ALL_COPY_STRINGS_ZH) {
      for (const char of Array.from(str)) {
        const covered = hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char);
        expect(covered, `"${char}" in "${str}" (zh-TW)`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Glyph coverage — the guaranteed symbol character set, full sweep
// (this plan's hardening item: assert every one of the 37 guaranteed
// characters $ + A-Z + 0-9 individually, not just the letters+$ the render
// path happens to exercise via $OCTOC).
// ---------------------------------------------------------------------------

describe("Glyph coverage — the full guaranteed symbol character set ($ + A-Z + 0-9) is covered by mono-semibold", () => {
  const GUARANTEED_CHARS = ["$", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)), ...Array.from({ length: 10 }, (_, i) => String(i))];

  it.each(GUARANTEED_CHARS)('hasGlyph("mono-semibold", %j) is true', (ch) => {
    expect(hasGlyph("mono-semibold", ch)).toBe(true);
  });

  it("the guaranteed set has exactly 37 characters", () => {
    expect(GUARANTEED_CHARS).toHaveLength(37);
  });
});
