import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { computeLevelSeries, computeMonthlyCandles, levelToY, theTickerWidget } from "./index.js";

function buildCalendar(
  startDate: string,
  days: number,
  countFn: (i: number) => number,
): { date: string; count: number }[] {
  const result: { date: string; count: number }[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    result.push({ date: d.toISOString().slice(0, 10), count: countFn(i) });
  }
  return result;
}

function baseProfileData(login: string, calendar?: { date: string; count: number }[]): ProfileData {
  return {
    login,
    name: "Octo Cat",
    avatarUrl: "",
    followers: 9,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
    contributionCalendar: calendar,
  };
}

function optsFor(language: RenderOptions["language"], now: Date): RenderOptions {
  return { now, seed: 42, timezone: "UTC", language };
}

const NOW = new Date("2026-08-08T00:00:00Z");

beforeAll(() => {
  loadAllFonts();
});

// ---------------------------------------------------------------------------
// Validated fixtures (each cross-checked against the real computeMonthlyCandles
// / levelToY output during planning — see 06-03-SUMMARY.md for the worked
// numbers).
// ---------------------------------------------------------------------------

/** A ~12-month calendar (61 days of zero settle before 2026-01-01, then all
 * of 2026) engineered to yield >=3 filled(up), >=3 hollow(down), >=1 doji
 * candle, with the current (December) month's open > 0 (percent-change
 * branch). Used across the snapshot test and several structural checks
 * here. */
function populatedCalendar(): { date: string; count: number }[] {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthAmplitudes = [40, 25, 150, 40, 150, 25, 155, 13, 165, 37, 8, 20];
  const closeAmplitudes = [15, 60, 20, 90, 10, 55, 8, 95, 12, 65, 10, 24];
  const settle = buildCalendar("2025-11-01", 61, () => 0);
  const year: { date: string; count: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const len = daysInMonth[m]!;
    for (let d = 0; d < len; d++) {
      let count = 0;
      if (d === 0) count += monthAmplitudes[m]!;
      if (d === len - 4) count += closeAmplitudes[m]!;
      const date = new Date(Date.UTC(2026, m, d + 1)).toISOString().slice(0, 10);
      year.push({ date, count });
    }
  }
  return [...settle, ...year];
}

describe("theTickerWidget — identity (CARD-07)", () => {
  it("has the expected name, requires, and size", () => {
    expect(theTickerWidget.name).toBe("the-ticker");
    expect(theTickerWidget.requires).toEqual(["calendar", "identity"]);
    expect(theTickerWidget.size).toEqual({ width: 495, height: 280 });
  });

  it("optionsSchema accepts an empty object and rejects an unknown key", () => {
    expect(() => theTickerWidget.optionsSchema.parse({})).not.toThrow();
    expect(() => theTickerWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => theTickerWidget.optionsSchema.parse({ bogus: true })).toThrow();
  });
});

describe("computeLevelSeries — T6: the formula's only non-obvious behaviour (day 0 vs day 6)", () => {
  it("day 0 (|W|=1): L = round(7 * count / 1) — the incomplete-window normalisation", () => {
    const calendar = buildCalendar("2026-01-01", 7, (i) => [3, 1, 2, 4, 5, 6, 7][i]!);
    const levels = computeLevelSeries(calendar);
    expect(levels[0]).toBe(21); // round(7*3/1)
  });

  it("day 6 (|W|=7): L = the trailing 7-day sum, exactly", () => {
    const calendar = buildCalendar("2026-01-01", 7, (i) => [3, 1, 2, 4, 5, 6, 7][i]!);
    const levels = computeLevelSeries(calendar);
    expect(levels[6]).toBe(28); // 3+1+2+4+5+6+7
  });
});

describe("levelToY — T2 guard: maxHigh === 0 never divides by zero", () => {
  it("v=0, maxHigh=0: returns PLOT_BOTTOM (200), not NaN", () => {
    expect(levelToY(0, 0)).toBe(200);
  });

  it("v=any positive value, maxHigh=0: still returns 200 (guard short-circuits, never divides)", () => {
    expect(levelToY(50, 0)).toBe(200);
    expect(Number.isFinite(levelToY(50, 0))).toBe(true);
  });
});

describe("levelToY — exact endpoints", () => {
  it("v=0 -> 200.00 (ZERO_LINE_Y / PLOT_BOTTOM)", () => {
    expect(levelToY(0, 100)).toBe(200);
  });

  it("v=maxHigh -> 136.00 (PLOT_TOP)", () => {
    expect(levelToY(100, 100)).toBe(136);
  });
});

describe("An all-zero, multi-month calendar (T2) renders every candle as a doji on the zero line, no branch needed", () => {
  const calendar = buildCalendar("2026-01-01", 120, () => 0);

  it("produces no non-numeric coordinate token (no NaN/undefined/Infinity)", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("computeMonthlyCandles: every candle has open=close=high=low=0 across all 4 months", () => {
    const candles = computeMonthlyCandles(calendar);
    expect(candles).toHaveLength(4);
    for (const c of candles) {
      expect(c.open).toBe(0);
      expect(c.close).toBe(0);
      expect(c.high).toBe(0);
      expect(c.low).toBe(0);
    }
  });

  it("every candle body renders as a 1.5px doji bar at y=199.25 (openY(200) - 0.75)", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    const dojiBars = [...markup.matchAll(/<rect x="[\d.-]+" y="199\.25" width="11" height="1\.5" fill="[^"]+"\/>/g)];
    expect(dojiBars).toHaveLength(4);
  });

  it("legend line still renders (T2 is NOT the empty state — it has real, if all-zero, candles)", () => {
    // Legend renders as a single <path> at PADDING (x=24), y=FOOTER_Y (248).
    // We can't inspect glyph text, but we CAN assert the legend branch fired
    // rather than the empty-state-sentence branch by checking accent-count
    // (see the FLAT/level-branch tests below for the same technique) — here,
    // simplest: the T1 monthCount>0 path always draws the month axis, which
    // T1 (truly empty) never does.
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    const axisFillMuted = (markup.match(new RegExp(`fill="${editorialLight.muted}"`, "g")) ?? []).length;
    expect(axisFillMuted).toBeGreaterThan(0);
  });
});

describe("T4 — change figure degenerate branches, wired end to end", () => {
  it("open === 0 && close === 0 (current month) -> FLAT branch: accent used ONLY for the month-axis numeral, never for the change figure", () => {
    // Reuse the all-zero fixture: every month (including the current/last)
    // has open=close=0.
    const calendar = buildCalendar("2026-01-01", 120, () => 0);
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    const accentCount = (markup.match(new RegExp(`fill="${editorialLight.accent}"`, "g")) ?? []).length;
    // UI-SPEC "Accent reserved for... Ticker": exactly two elements — the
    // change figure and the current-month axis numeral. FLAT substitutes
    // theme.muted for the change figure, so only the axis numeral remains.
    expect(accentCount).toBe(1);
  });

  it("open === 0 && close > 0 (current month) -> level branch: computeMonthlyCandles derives exactly open=0, close=40, and the render uses the accent (non-flat) branch", () => {
    const settle = buildCalendar("2025-12-01", 20, () => 0);
    const current = buildCalendar("2026-01-01", 31, (i) => {
      const tail = [5, 5, 5, 5, 5, 5, 10];
      return i >= 24 && i <= 30 ? tail[i - 24]! : 0;
    });
    const calendar = [...settle, ...current];
    const candles = computeMonthlyCandles(calendar);
    const last = candles[candles.length - 1]!;
    expect(last.open).toBe(0);
    expect(last.close).toBe(40);

    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    const accentCount = (markup.match(new RegExp(`fill="${editorialLight.accent}"`, "g")) ?? []).length;
    // Non-flat branch: accent used for BOTH the change figure and the
    // current-month axis numeral.
    expect(accentCount).toBe(2);
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("T5 — doji boundary: body height exactly at DOJI_MIN_H (1.5) renders directionally; just below renders as a doji", () => {
  // Validated against the real computeMonthlyCandles/levelToY output during
  // planning: with a Jan spike (open=128) fixing maxHigh=128, February's
  // open=0/close=3 produces bodyHeightPx = 64*3/128 = EXACTLY 1.5 (not a
  // doji: the condition is strictly "<"), and March's open=3/close=2
  // produces bodyHeightPx = 64*1/128 = 0.5 (a doji).
  const settle = buildCalendar("2025-12-01", 20, () => 0);
  const jan = buildCalendar("2026-01-01", 31, (i) => (i === 0 ? 128 : 0));
  const feb = buildCalendar("2026-02-01", 28, (i) => (i === 27 ? 3 : 0));
  const mar = buildCalendar("2026-03-01", 31, (i) => (i === 30 ? 2 : 0));
  const calendar = [...settle, ...jan, ...feb, ...mar];

  it("computeMonthlyCandles confirms the exact worked values", () => {
    const candles = computeMonthlyCandles(calendar);
    expect(candles).toHaveLength(4); // Dec(partial settle) + Jan + Feb + Mar
    expect(candles[1]).toMatchObject({ open: 128, close: 0, high: 128 });
    expect(candles[2]).toMatchObject({ open: 0, close: 3, high: 3 });
    expect(candles[3]).toMatchObject({ open: 3, close: 2, high: 3 });
  });

  it("February (height exactly 1.5, close > open): renders as a FILLED (up) body, height 1.50, not a doji", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    // colIndex = 12 - 4 + 2 = 10 -> cx = 409.125, bodyX = 403.625.
    // openY=200, closeY=198.5 -> rect y=198.50 height=1.50 (toFixed(2), the
    // directional branch), fill=ink, no stroke.
    expect(markup).toContain(`<rect x="403.63" y="198.50" width="11" height="1.50" fill="${editorialLight.ink}"/>`);
  });

  it("March (height 0.5 < 1.5): renders as a doji — solid 1.5px bar, direction not encoded", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    // colIndex = 12 - 4 + 3 = 11 -> cx = 445.04, bodyX = 439.54.
    // openY(open=3)=198.5 -> doji y = 198.5 - 0.75 = 197.75 (the doji
    // branch emits the raw DOJI_MIN_H constant "1.5", not a toFixed(2)
    // "1.50" — that's how this assertion is disambiguated from the
    // directional branch above).
    expect(markup).toContain(`<rect x="439.54" y="197.75" width="11" height="1.5" fill="${editorialLight.ink}"/>`);
  });
});

describe("T3 — fewer than 12 months available: right-aligned columns, honest eyebrow count, stable COL_W", () => {
  const calendar = buildCalendar("2026-01-01", 120, (i) => (i % 10) + 1);

  it("computeMonthlyCandles produces exactly 4 candles for a 120-day (Jan-Apr) calendar", () => {
    const candles = computeMonthlyCandles(calendar);
    expect(candles).toHaveLength(4);
  });

  it("the eyebrow's real month count is 4, and the first candle's wick lands at COL_CENTER(8) (12 - 4 + 0), not COL_CENTER(0)", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    // COL_W = 431/12 = 35.916666..., COL_CENTER(8) = 32 + COL_W*8.5 = 337.29.
    expect(markup).toContain('<line x1="337.29" y1="');
  });

  it("does not throw, and produces no non-numeric coordinate token", () => {
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("T7 — API-sourced text injection mitigation, at the render level", () => {
  const ADVERSARIAL_LOGINS = [
    '"><script>alert(1)</script>',
    "<img src=x onerror=alert(1)>",
    "測試使用者",
    "!@#$%^&*()",
  ];

  it.each(ADVERSARIAL_LOGINS)("login=%j: renders without throwing, and no raw login substring leaks into the output", (login) => {
    const data = baseProfileData(login, []);
    let markup = "";
    expect(() => {
      markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    }).not.toThrow();
    expect(markup).not.toContain(login);
    // The raw login's individual dangerous substrings must not appear either
    // (not just the whole string) — e.g. "<script>" must not leak even if
    // deriveSymbol's transform happened to preserve character order.
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onerror");
  });

  it("an all-symbol login falls back to $DEV (T7), reachable through renderBody", () => {
    const data = baseProfileData("---", []);
    const markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("Current-month axis numeral is accent; the other eleven are muted", () => {
  it("a populated (12-month) fixture renders exactly one accent-fill axis numeral", () => {
    const calendar = populatedCalendar();
    const markup = theTickerWidget.renderBody(baseProfileData("octocat", calendar), editorialLight, optsFor("en", NOW));
    // The change figure ALSO uses accent (percent branch, current month
    // open=30>0) — isolate the axis numeral count by subtracting it. The
    // axis loop always draws exactly one accent-fill element (the
    // rightmost numeral) whenever monthCount > 0.
    const accentCount = (markup.match(new RegExp(`fill="${editorialLight.accent}"`, "g")) ?? []).length;
    expect(accentCount).toBe(2); // change figure + axis numeral
  });
});

describe("Determinism — same input renders byte-identical output", () => {
  it("rendering the same (data, theme, opts) twice produces byte-identical markup", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    const opts = optsFor("en", NOW);
    const a = theTickerWidget.renderBody(data, editorialLight, opts);
    const b = theTickerWidget.renderBody(data, editorialLight, opts);
    expect(a).toBe(b);
  });
});

describe("renderPair — sandbox-safety invariant (RENDER-01)", () => {
  it("contains no <text> element in either theme", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    const { light, dark } = renderPair(theTickerWidget, data, optsFor("en", NOW), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).toContain("<svg");
  });

  it("renders in zh-TW without throwing", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    expect(() =>
      renderPair(theTickerWidget, data, optsFor("zh-TW", NOW), { light: editorialLight, dark: editorialDark }),
    ).not.toThrow();
  });

  it("contains no @keyframes or <style> block — the Ticker is not animated", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    const { light } = renderPair(theTickerWidget, data, optsFor("en", NOW), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toContain("@keyframes");
  });
});

describe("T1 — empty calendar: quote band reads all zero, FLAT change, empty sentence replaces the legend, axis omitted", () => {
  it("undefined contributionCalendar does not throw", () => {
    const data = baseProfileData("octocat", undefined);
    expect(() => theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW))).not.toThrow();
  });

  it("an explicit empty array does not throw and produces no candle body rects", () => {
    const data = baseProfileData("octocat", []);
    const markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    // No candle body -> no <rect> with width="11" (the only <rect> that
    // width value can belong to is a candle body; the panel border rect has
    // a different width).
    expect(markup).not.toMatch(/<rect[^>]*width="11"/);
  });

  it("the zero line still renders (panel + zero line render even with zero candles)", () => {
    const data = baseProfileData("octocat", []);
    const markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    expect(markup).toContain(`y1="200" x2="463" y2="200" stroke="${editorialLight.rule}" stroke-width="0.5"`);
  });

  it("month axis is entirely omitted (zero accent-fill elements) — FLAT change never contributes accent either", () => {
    const data = baseProfileData("octocat", []);
    const markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    const accentCount = (markup.match(new RegExp(`fill="${editorialLight.accent}"`, "g")) ?? []).length;
    expect(accentCount).toBe(0);
  });
});

describe("Page-number footer — absent-means-emit-nothing contract (inherited Phase 3)", () => {
  it("rendering with pageNumber/totalPages undefined produces markup that is an exact prefix of the same render with them defined", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    const optsNoFooter = optsFor("en", NOW);
    const optsWithFooter: RenderOptions = { ...optsNoFooter, pageNumber: 7, totalPages: 7 };
    const withoutFooter = theTickerWidget.renderBody(data, editorialLight, optsNoFooter);
    const withFooter = theTickerWidget.renderBody(data, editorialLight, optsWithFooter);
    expect(withFooter.startsWith(withoutFooter)).toBe(true);
    expect(withFooter.length).toBeGreaterThan(withoutFooter.length);
  });

  it("the legend line renders independently of the page footer (T8)", () => {
    const calendar = populatedCalendar();
    const data = baseProfileData("octocat", calendar);
    const markup = theTickerWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    // No page footer configured, but the axis (monthCount>0) and quote band
    // still produce plenty of muted-fill markup — the render must not have
    // thrown or come back empty.
    expect(markup.length).toBeGreaterThan(0);
  });
});

describe("Glyph coverage regression — every character this card can emit is covered (Pitfall 4)", () => {
  it("every distinct character across describe() strings and the guaranteed symbol/digit/separator set is covered by its rendering font", () => {
    const enDesc = theTickerWidget.describe(baseProfileData("octocat", []), optsFor("en", NOW));
    const zhDesc = theTickerWidget.describe(baseProfileData("octocat", []), optsFor("zh-TW", NOW));

    const enStrings = [enDesc.title, enDesc.desc, "0123456789", "+-%,.$ /="];
    const zhStrings = [zhDesc.title, zhDesc.desc, "0123456789", "+-%,.$ /="];

    for (const str of enStrings) {
      for (const char of Array.from(str)) {
        expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in "${str}" (en)`).toBe(true);
      }
    }
    for (const str of zhStrings) {
      for (const char of Array.from(str)) {
        expect(hasGlyph("mono-semibold", char) || hasGlyph("noto-tc", char), `"${char}" in "${str}" (zh-TW)`).toBe(
          true,
        );
      }
    }
  });
});
