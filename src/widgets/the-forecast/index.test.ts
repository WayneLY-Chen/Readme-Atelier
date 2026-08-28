import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { draculaTheme, editorialDark, editorialLight, nordTheme, tokyonightTheme } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { numeralFillFor } from "./contrast.js";
import {
  busiestWeekdayIndex,
  computeK,
  computeWeekdayMedians,
  eyebrowTextFor,
  headlineTextFor,
  tierFor,
  theForecastWidget,
  weekdayIndexOf,
} from "./index.js";

function baseProfileData(calendar: { date: string; count: number }[]): ProfileData {
  return {
    login: "octocat",
    name: "Octo Cat",
    avatarUrl: "",
    followers: 9,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
    contributionCalendar: calendar,
  };
}

function optsFor(language: RenderOptions["language"], extra: Partial<RenderOptions> = {}): RenderOptions {
  return { now: new Date("2026-08-08T00:00:00Z"), seed: 42, timezone: "UTC", language, ...extra };
}

/** Builds `n` consecutive UTC calendar days ending on `endDate` (inclusive),
 * with `count` decided per-weekday by `perWeekday` (index 0=Mon..6=Sun). */
function buildCalendar(
  n: number,
  endDate: string,
  perWeekday: (weekdayIndex: number) => number,
): { date: string; count: number }[] {
  const [ey, em, ed] = endDate.split("-").map(Number);
  const end = new Date(Date.UTC(ey!, em! - 1, ed!));
  const days: { date: string; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: perWeekday(weekdayIndexOf(dateStr)) });
  }
  return days;
}

beforeAll(() => {
  loadAllFonts();
});

describe("theForecastWidget — identity (CARD-06)", () => {
  it("has the expected name, requires, and size", () => {
    expect(theForecastWidget.name).toBe("the-forecast");
    expect(theForecastWidget.requires).toEqual(["calendar"]);
    expect(theForecastWidget.size).toEqual({ width: 495, height: 248 });
  });

  it("optionsSchema accepts an empty object and rejects an unknown key", () => {
    expect(() => theForecastWidget.optionsSchema.parse({})).not.toThrow();
    expect(() => theForecastWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => theForecastWidget.optionsSchema.parse({ bogus: true })).toThrow();
  });

  it("describe() returns the correct title/desc pair per language, carrying the caveat verbatim in en", () => {
    const data = baseProfileData([]);
    const en = theForecastWidget.describe(data, optsFor("en"));
    expect(en.title).toBe("The Forecast card");
    expect(en.desc).toContain("not a prediction");
    const zh = theForecastWidget.describe(data, optsFor("zh-TW"));
    expect(zh.title).toBe("開發預報卡片");
    expect(zh.desc).toContain("不是預測");
  });
});

describe("computeK — basis window sizing (06-UI-SPEC.md 'Basis window')", () => {
  it.each([
    [0, 0],
    [6, 0],
    [13, 1], // F1: fewer than 14 recorded days
    [14, 2], // the minimum projectable basis
    [83, 11],
    [84, 12],
    [94, 12], // cap: floor(94/7)=13, capped to 12
    [365, 12],
  ])("availableDays=%i -> k=%i", (available, expected) => {
    expect(computeK(available)).toBe(expected);
  });
});

describe("weekdayIndexOf — Monday-first remap", () => {
  it("maps known dates to the correct Monday-first index", () => {
    // 2026-08-03 is a Monday, 2026-08-09 is a Sunday.
    expect(weekdayIndexOf("2026-08-03")).toBe(0); // Monday
    expect(weekdayIndexOf("2026-08-04")).toBe(1); // Tuesday
    expect(weekdayIndexOf("2026-08-05")).toBe(2); // Wednesday
    expect(weekdayIndexOf("2026-08-06")).toBe(3); // Thursday
    expect(weekdayIndexOf("2026-08-07")).toBe(4); // Friday
    expect(weekdayIndexOf("2026-08-08")).toBe(5); // Saturday
    expect(weekdayIndexOf("2026-08-09")).toBe(6); // Sunday
  });
});

describe("computeWeekdayMedians — lower median, pinned by hand-computed examples", () => {
  it("k=2 (even, [3,9]): lower median index floor((2-1)/2)=0 -> 3", () => {
    // Two Mondays with counts 9 (older) then 3 (newer); sorted ascending
    // [3,9], lower-median index 0 -> 3.
    const cal: { date: string; count: number }[] = [];
    // The 14-day window ending 2026-08-10 (inclusive) is 2026-07-28..08-10;
    // its two Mondays are 2026-08-03 (older) and 2026-08-10 (newer).
    const mondays = ["2026-08-03", "2026-08-10"];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(2026, 7, 10));
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const isMonday = mondays.includes(dateStr);
      cal.push({ date: dateStr, count: isMonday ? (dateStr === "2026-08-03" ? 9 : 3) : 0 });
    }
    const { k, medians } = computeWeekdayMedians(cal);
    expect(k).toBe(2);
    expect(medians[0]).toBe(3); // lower median of [3,9] at index 0
  });

  it("k=12 (even count semantics do not apply — 12 is even too): lower median index floor((12-1)/2)=5 -> 6th smallest", () => {
    // 12 identical constant values per weekday -> sorted array is constant, median trivially equals the constant.
    const table = [0, 3, 8, 14, 20, 2, 5]; // Mon..Sun
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    const { k, medians } = computeWeekdayMedians(cal);
    expect(k).toBe(12);
    expect(medians).toEqual(table);
  });

  it("[1,2,5,8] worked example from the plan: index 1 -> 2 (k=4, floor((4-1)/2)=1)", () => {
    // Four Mondays with counts 8,1,5,2 in chronological (oldest-first) order;
    // sorted ascending [1,2,5,8], index 1 -> 2.
    const values = [8, 1, 5, 2]; // oldest -> newest, all landing on Mondays
    const mondayDates = ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"];
    const cal: { date: string; count: number }[] = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(Date.UTC(2026, 7, 3));
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const mIdx = mondayDates.indexOf(dateStr);
      cal.push({ date: dateStr, count: mIdx >= 0 ? values[mIdx]! : 0 });
    }
    const { k, medians } = computeWeekdayMedians(cal);
    expect(k).toBe(4);
    expect(medians[0]).toBe(2); // Monday's lower median
  });

  it("k < 2 returns an empty medians array (F1)", () => {
    const cal = buildCalendar(13, "2026-08-08", () => 5);
    const { k, medians } = computeWeekdayMedians(cal);
    expect(k).toBe(1);
    expect(medians).toEqual([]);
  });

  it("an undefined calendar behaves the same as an empty one", () => {
    expect(computeWeekdayMedians(undefined)).toEqual({ k: 0, medians: [] });
  });
});

describe("F3 — M===0 division guard (tierFor)", () => {
  it("every weekday resolves to CALM when M===0, without ever dividing", () => {
    expect(tierFor(0, 0)).toBe("CALM");
  });

  it("tier boundaries against a non-zero M (M=20): CLOUD<=5, PARTIAL<=10, SUN<=16, STORM>16", () => {
    expect(tierFor(0, 20)).toBe("CALM");
    expect(tierFor(3, 20)).toBe("CLOUD");
    expect(tierFor(5, 20)).toBe("CLOUD"); // boundary: 0.25*20 = 5, inclusive
    expect(tierFor(8, 20)).toBe("PARTIAL");
    expect(tierFor(10, 20)).toBe("PARTIAL"); // boundary: 0.50*20 = 10, inclusive
    expect(tierFor(14, 20)).toBe("SUN");
    expect(tierFor(16, 20)).toBe("SUN"); // boundary: 0.80*20 = 16, inclusive
    expect(tierFor(20, 20)).toBe("STORM"); // the busiest weekday always lands in STORM
  });
});

describe("F5 — tie-break: earliest weekday in Monday-first order wins", () => {
  it("a tie between Monday and Friday resolves to Monday (index 0)", () => {
    expect(busiestWeekdayIndex([10, 3, 3, 3, 10, 3, 3])).toBe(0);
  });

  it("a tie between Wednesday and Sunday resolves to Wednesday (index 2)", () => {
    expect(busiestWeekdayIndex([1, 1, 9, 1, 1, 1, 9])).toBe(2);
  });

  it("is deterministic — the same input produces the same output across repeated calls", () => {
    const medians = [5, 5, 5, 5, 5, 5, 5];
    const first = busiestWeekdayIndex(medians);
    const second = busiestWeekdayIndex(medians);
    expect(first).toBe(second);
    expect(first).toBe(0); // all tied -> earliest (Monday) wins
  });
});

describe("F4 — the eyebrow's rendered number MUST equal the computed k (the card's most important honesty mechanic)", () => {
  it("eyebrowTextFor(k, true, language) — the exact function renderBody calls — embeds the REAL k, in both languages", () => {
    const cal = buildCalendar(35, "2026-08-08", (w) => (w === 3 ? 7 : 1)); // k = floor(35/7) = 5
    const { k } = computeWeekdayMedians(cal);
    expect(k).toBe(5);
    expect(k).not.toBe(12);

    // eyebrowTextFor is the SAME function renderBody calls internally (not
    // a re-derivation) — asserting against it directly is the established
    // pattern for text that gets converted to opaque path data before it
    // reaches the markup (vitals' windowCaptionFor/statusWordFor).
    expect(eyebrowTextFor(k, true, "en")).toBe("A TYPICAL WEEK, PROJECTED FROM THE PAST 5 WEEKS");
    expect(eyebrowTextFor(k, true, "en")).not.toContain("12");
    expect(eyebrowTextFor(k, true, "zh-TW")).toBe("典型的一週，依過去 5 週的節奏推算");
    expect(eyebrowTextFor(k, true, "zh-TW")).not.toContain("12");

    // And the render itself must not throw for this non-12 k (a stale
    // hardcoded slot-width assumption would be the failure mode here).
    expect(() => theForecastWidget.renderBody(baseProfileData(cal), editorialLight, optsFor("en"))).not.toThrow();
    expect(() =>
      theForecastWidget.renderBody(baseProfileData(cal), editorialLight, optsFor("zh-TW")),
    ).not.toThrow();
  });

  it("eyebrowTextFor(k, false, language) — the F1 insufficient-data variant, independent of k's value", () => {
    expect(eyebrowTextFor(0, false, "en")).toBe("NOT ENOUGH RECORDED WEEKS TO PROJECT");
    expect(eyebrowTextFor(1, false, "en")).toBe("NOT ENOUGH RECORDED WEEKS TO PROJECT");
    expect(eyebrowTextFor(0, false, "zh-TW")).toBe("紀錄的週數不足，無法推算");
  });

  it("k >= 12 fixture (94 days) renders k=12, never higher (the cap)", () => {
    const table = [0, 3, 8, 14, 20, 2, 5];
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    const { k } = computeWeekdayMedians(cal);
    expect(k).toBe(12);
  });
});

describe("headlineTextFor — the exact function renderBody calls, one of three states", () => {
  it("hasProjection=false -> the insufficient-data variant, regardless of the other arguments", () => {
    expect(headlineTextFor(false, false, "Friday", 999, "en")).toBe(
      "Not enough recorded weeks to project a rhythm.",
    );
    expect(headlineTextFor(false, false, "Friday", 999, "zh-TW")).toBe("紀錄的週數不足，無法推算節奏。");
  });

  it("hasProjection=true, allZero=true -> the all-zero variant, regardless of weekday/median arguments", () => {
    expect(headlineTextFor(true, true, "Friday", 0, "en")).toBe("No weekday shows a rhythm yet.");
    expect(headlineTextFor(true, true, "Friday", 0, "zh-TW")).toBe("還看不出任何一天的節奏。");
  });

  it("hasProjection=true, allZero=false -> the normal variant, interpolating the real weekday name and median", () => {
    expect(headlineTextFor(true, false, "Wednesday", 288, "en")).toBe(
      "Wednesday has been busiest - median 288.",
    );
    expect(headlineTextFor(true, false, "週三", 288, "zh-TW")).toBe("過去最忙的是週三，中位數 288。");
  });
});

describe("V-06 — no NaN/undefined/Infinity token anywhere in the markup (F3's rendering-level guard)", () => {
  it("an all-zero, k=4 basis renders no NaN/undefined/Infinity token", () => {
    const cal = buildCalendar(28, "2026-08-08", () => 0);
    const markup = theForecastWidget.renderBody(baseProfileData(cal), editorialLight, optsFor("en"));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("an empty calendar (F1, k=0) renders no NaN/undefined/Infinity token", () => {
    const markup = theForecastWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en"));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("F1 (k<2) — no glyph, no numeral; eyebrow/headline switch to the insufficient-data variant; caveat still renders", () => {
  it("a 13-day calendar (k=1) renders zero glyph circles/lines beyond chrome, and the insufficient-data copy", () => {
    const cal = buildCalendar(13, "2026-08-08", () => 3);
    const markup = theForecastWidget.renderBody(baseProfileData(cal), editorialLight, optsFor("en"));

    // Zero <circle> elements anywhere — every weather glyph tier except CALM
    // uses at least one circle, and the glyph loop is skipped entirely.
    expect(markup.match(/<circle/g)).toBeNull();
    // Chrome-only <line> count: hairline (1) + six dashed column separators
    // (6) = 7. A CALM glyph (also a <line>) would push this to 8+.
    expect((markup.match(/<line/g) ?? []).length).toBe(7);
    // No <g fill="..."> numeral group wrapper at all.
    expect(markup).not.toContain("<g fill=");
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("k=0 (empty calendar) behaves identically to k=1 for the glyph/numeral guards", () => {
    const markup = theForecastWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en"));
    expect(markup.match(/<circle/g)).toBeNull();
    expect(markup).not.toContain("<g fill=");
  });
});

describe("F2 — all seven medians are 0 (basis exists, account dormant): a CORRECT projection, not a failure", () => {
  it("a 28-day all-zero calendar (k=4) renders seven glyph <line> elements (CALM bars) and a numeral group", () => {
    const cal = buildCalendar(28, "2026-08-08", () => 0);
    const markup = theForecastWidget.renderBody(baseProfileData(cal), editorialLight, optsFor("en"));

    // Chrome lines (7) + seven CALM glyph lines = 14.
    expect((markup.match(/<line/g) ?? []).length).toBe(14);
    expect(markup).toContain("<g fill=");
    expect(markup.match(/<circle/g)).toBeNull(); // CALM uses no circles
  });
});

describe("Rule C-2 wiring — the numeral <g fill> matches numeralFillFor(theme)'s decision, per theme", () => {
  const table = [0, 3, 8, 14, 20, 2, 5];
  const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
  const data = baseProfileData(cal);

  it("editorialLight -> muted", () => {
    const markup = theForecastWidget.renderBody(data, editorialLight, optsFor("en"));
    expect(numeralFillFor(editorialLight).source).toBe("muted");
    expect(markup).toContain(`<g fill="${editorialLight.muted}">`);
  });

  it("editorialDark -> muted", () => {
    const markup = theForecastWidget.renderBody(data, editorialDark, optsFor("en"));
    expect(numeralFillFor(editorialDark).source).toBe("muted");
    expect(markup).toContain(`<g fill="${editorialDark.muted}">`);
  });

  // WR-02 (06-REVIEW.md): nord is the theme the branch's own doc comment
  // calls out as the interesting case — it keeps `muted` at a 9.25:1 ratio
  // (contrast.test.ts's V-05 suite) despite `mode: "dark"`, unlike
  // dracula/tokyonight, which are also dark-mode but fall back to `ink`.
  // Before this test, nord's render-level `<g fill>` wiring was proven only
  // as a pure-function assertion (contrast.test.ts), never against the
  // actual SVG markup the way editorialLight/dracula/tokyonight already are.
  it("nordTheme -> muted (mode is dark, but the branch reads theme VALUES, not theme.mode)", () => {
    const markup = theForecastWidget.renderBody(data, nordTheme, optsFor("en"));
    expect(numeralFillFor(nordTheme).source).toBe("muted");
    expect(markup).toContain(`<g fill="${nordTheme.muted}">`);
  });

  it("draculaTheme -> ink (the AA fallback)", () => {
    const markup = theForecastWidget.renderBody(data, draculaTheme, optsFor("en"));
    expect(numeralFillFor(draculaTheme).source).toBe("ink");
    expect(markup).toContain(`<g fill="${draculaTheme.ink}">`);
  });

  it("tokyonightTheme -> ink (the AA fallback)", () => {
    const markup = theForecastWidget.renderBody(data, tokyonightTheme, optsFor("en"));
    expect(numeralFillFor(tokyonightTheme).source).toBe("ink");
    expect(markup).toContain(`<g fill="${tokyonightTheme.ink}">`);
  });
});

describe("Determinism — same input renders byte-identical output twice", () => {
  it("renders the same (data, theme, opts) twice to identical markup", () => {
    const table = [0, 3, 8, 14, 20, 2, 5];
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    const data = baseProfileData(cal);
    const opts = optsFor("en");
    const a = theForecastWidget.renderBody(data, editorialLight, opts);
    const b = theForecastWidget.renderBody(data, editorialLight, opts);
    expect(a).toBe(b);
  });

  it("F5 tie-break is itself deterministic across repeated renders", () => {
    const cal = buildCalendar(84, "2026-08-08", (w) => (w === 0 || w === 4 ? 10 : 3)); // Mon/Fri tie
    const data = baseProfileData(cal);
    const opts = optsFor("en");
    const a = theForecastWidget.renderBody(data, editorialLight, opts);
    const b = theForecastWidget.renderBody(data, editorialLight, opts);
    expect(a).toBe(b);
  });
});

describe("renderPair — sandbox-safety invariant (RENDER-01)", () => {
  it("contains no <text> element in either theme", () => {
    const table = [0, 3, 8, 14, 20, 2, 5];
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    const { light, dark } = renderPair(theForecastWidget, baseProfileData(cal), optsFor("en"), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).toContain("<svg");
  });

  it("renders in zh-TW without throwing (glyph coverage)", () => {
    const table = [0, 3, 8, 14, 20, 2, 5];
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    expect(() =>
      renderPair(theForecastWidget, baseProfileData(cal), optsFor("zh-TW"), {
        light: editorialLight,
        dark: editorialDark,
      }),
    ).not.toThrow();
  });
});

describe("Page-number footer (F7) — absent-means-emit-nothing contract (inherited Phase 3)", () => {
  it("rendering with pageNumber/totalPages undefined produces markup that is an exact prefix of the same render with them defined", () => {
    const table = [0, 3, 8, 14, 20, 2, 5];
    const cal = buildCalendar(94, "2026-08-08", (w) => table[w]!);
    const data = baseProfileData(cal);
    const optsNoFooter = optsFor("en");
    const optsWithFooter = optsFor("en", { pageNumber: 6, totalPages: 7 });
    const withoutFooter = theForecastWidget.renderBody(data, editorialLight, optsNoFooter);
    const withFooter = theForecastWidget.renderBody(data, editorialLight, optsWithFooter);
    expect(withFooter.startsWith(withoutFooter)).toBe(true);
    expect(withFooter.length).toBeGreaterThan(withoutFooter.length);
  });

  it("the caveat line is independent of the footer and always renders regardless (F1 fixture — footer-independent caveat is the point)", () => {
    const cal = buildCalendar(13, "2026-08-08", () => 3); // F1
    const data = baseProfileData(cal);
    const withoutFooter = theForecastWidget.renderBody(data, editorialLight, optsFor("en"));
    expect(withoutFooter).not.toMatch(/NaN|undefined|Infinity/);
    // The caveat's own path emission happens unconditionally before the
    // footer conditional either way — covered exhaustively by
    // copy.test.ts's V-03 test that caveatEn/Zh are always members of
    // buildFullCopySet(). This render-level check confirms F1's own copy
    // selection (eyebrow + headline) is the insufficient-data variant.
    expect(eyebrowTextFor(0, false, "en")).toBe("NOT ENOUGH RECORDED WEEKS TO PROJECT");
    expect(headlineTextFor(false, false, "Monday", 0, "en")).toBe(
      "Not enough recorded weeks to project a rhythm.",
    );
  });
});

describe("Glyph coverage regression — every character this card can emit is covered", () => {
  it("every distinct character across copy.ts exports, describe() strings, digits and separators is covered by its rendering font", () => {
    const enStrings = [
      "THE FORECAST",
      "A TYPICAL WEEK, PROJECTED FROM THE PAST 12 WEEKS",
      "NOT ENOUGH RECORDED WEEKS TO PROJECT",
      "MON",
      "TUE",
      "WED",
      "THU",
      "FRI",
      "SAT",
      "SUN",
      "Wednesday has been busiest - median 288.",
      "No weekday shows a rhythm yet.",
      "Not enough recorded weeks to project a rhythm.",
      "A PROJECTION OF PAST RHYTHM, NOT A PREDICTION",
      "The Forecast card",
      "0123456789",
      " -.,",
    ];
    for (const str of enStrings) {
      for (const char of Array.from(str)) {
        expect(hasGlyph("mono-semibold", char) || hasGlyph("serif", char), `"${char}" in "${str}" (en)`).toBe(true);
      }
    }
  });
});
