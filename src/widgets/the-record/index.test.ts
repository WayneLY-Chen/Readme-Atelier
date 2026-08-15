import { beforeAll, describe, expect, it } from "vitest";
import { calendarWindowFrom } from "../../core/fetch.js";
import { hasGlyph } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { renderPair } from "../../core/svg.js";
import {
  busiestWeekLabelEn,
  busiestWeekLabelZh,
  busiestWeekValueEn,
  busiestWeekValueZh,
  chromeEn,
  chromeZh,
  mastheadEyebrowZh,
  needleCaptionEn,
  needleCaptionZh,
  noneValueEn,
  noneValueZh,
  pageFooterEn,
  pageFooterZh,
  silentWeeksLabelEn,
  silentWeeksLabelZh,
  silentWeeksValue,
  totalLabelEn,
  totalLabelZh,
  weeksPressedLabelEn,
  weeksPressedLabelZh,
  weeksPressedValue,
  zeroCaptionEn,
  zeroCaptionZh,
} from "./copy.js";
import {
  bucketWeeks,
  busiestElapsedWeek,
  grooveCountForYear,
  grooveRadius,
  mulberry32,
  type RecordWeek,
  theRecordWidget,
  tonearmTip,
  zonedYear,
} from "./index.js";

function baseProfileData(calendar?: { date: string; count: number }[]): ProfileData {
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

function optsFor(language: RenderOptions["language"], now: Date): RenderOptions {
  return { now, seed: 42, timezone: "UTC", language };
}

const NOW = new Date("2026-08-08T00:00:00Z");

beforeAll(() => {
  loadAllFonts();
});

describe("theRecordWidget — identity (CARD-04)", () => {
  it("has the expected name, requires, and size", () => {
    expect(theRecordWidget.name).toBe("the-record");
    expect(theRecordWidget.requires).toEqual(["calendar"]);
    expect(theRecordWidget.size).toEqual({ width: 495, height: 272 });
  });

  it("optionsSchema accepts an empty object and rejects an unknown key", () => {
    expect(() => theRecordWidget.optionsSchema.parse({})).not.toThrow();
    expect(() => theRecordWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => theRecordWidget.optionsSchema.parse({ bogus: true })).toThrow();
  });
});

describe("grooveCountForYear — bounded in [53, 54] (UI-SPEC Degenerate State #3)", () => {
  it("2026 (Jan 1 = Thursday, non-leap) has 53 buckets", () => {
    expect(grooveCountForYear(2026)).toBe(53);
  });

  it("2028 (leap year starting Saturday) has 54 buckets", () => {
    expect(grooveCountForYear(2028)).toBe(54);
  });
});

describe("grooveRadius — exact endpoints for every valid grooveCount (CARD-04 boundary)", () => {
  it.each([52, 53, 54])("G=%i: r_0 === R_OUTER (86) and r_(G-1) === R_INNER (39), exactly", (G) => {
    expect(grooveRadius(0, G)).toBe(86);
    expect(grooveRadius(G - 1, G)).toBe(39);
  });
});

describe("MAX_STROKE_WIDTH (1.10) — merge is deliberate and bounded (CARD-04 adjacency)", () => {
  it("1.10 exceeds groovePitch at the tightest count (G=54), so consecutive hot weeks can merge", () => {
    const pitchAt54 = (86 - 39) / (54 - 1);
    expect(1.1).toBeGreaterThan(pitchAt54);
  });

  it("the busiest elapsed week's rendered stroke-width never exceeds 1.10", () => {
    const calendar = [{ date: "2026-01-04", count: 1000 }]; // lands in bucket 0 (elapsed)
    const data = baseProfileData(calendar);
    const markup = theRecordWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    // Scoped to fill="none" circles (groove rings + the rim highlight) —
    // Plan 04-02's tonearm casing/shaft <line>s legitimately carry wider
    // strokes (4.0/2.4/4.8/3.2) that are not part of the MAX_STROKE_WIDTH
    // contract, which only bounds the groove-ring encoding.
    const widths = [...markup.matchAll(/<circle[^>]*fill="none"[^>]*stroke-width="(\d+\.\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    for (const w of widths) {
      expect(w).toBeLessThanOrEqual(1.1);
    }
    expect(markup).toContain('stroke-width="1.10"');
  });
});

describe("Render pipeline at G=54 — the leap-year-starting-Saturday case MAX_STROKE_WIDTH's own comment calls \"the tightest count\" (WR-01)", () => {
  it("renders well-formed markup for 2028 (grooveCountForYear === 54) via the real renderBody() path: no NaN/undefined/Infinity, 54 strictly-decreasing groove radii inside [R_INNER, R_OUTER], stroke widths within their documented bound", () => {
    const now = new Date("2028-08-08T00:00:00Z");
    expect(grooveCountForYear(2028)).toBe(54);

    const calendar = [
      { date: "2028-01-08", count: 5 },
      { date: "2028-06-03", count: 9 },
    ];
    const markup = theRecordWidget.renderBody(baseProfileData(calendar), editorialLight, optsFor("en", now));

    expect(markup).not.toMatch(/NaN|undefined|Infinity/);

    // Groove rings only — excludes the rim-land highlight circle (r=90.40,
    // outside [R_INNER, R_OUTER]), the only other fill="none" circle drawn.
    const grooveCircles = [
      ...markup.matchAll(
        /<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)" fill="none" stroke="[^"]*" stroke-width="([\d.]+)" stroke-opacity="[\d.]+"\/>/g,
      ),
    ].filter((m) => Number(m[1]) < 90);
    expect(grooveCircles).toHaveLength(54);

    const radii = grooveCircles.map((m) => Number(m[1]));
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThan(radii[i - 1]!);
    }
    expect(radii[0]).toBe(86); // R_OUTER
    expect(radii[radii.length - 1]).toBe(39); // R_INNER

    const widths = grooveCircles.map((m) => Number(m[2]));
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(0.4); // FUTURE_STROKE_WIDTH floor
      expect(w).toBeLessThanOrEqual(1.1); // MAX_STROKE_WIDTH
    }
  });
});

describe("bucketWeeks — strict index order, no sort (CARD-04 ordering)", () => {
  it("two weeks with identical counts still render at distinct radii, in bucket order", () => {
    // Bucket 0 = Sun 2025-12-28..Sat 2026-01-03 (the week containing Jan 1);
    // bucket 1 = Sun 2026-01-04..Sat 2026-01-10 — both elapsed relative to
    // NOW, both count 5.
    const calendar = [
      { date: "2025-12-28", count: 5 },
      { date: "2026-01-04", count: 5 },
    ];
    const weeks = bucketWeeks(calendar, 2026, NOW, "UTC");
    expect(weeks[0]?.count).toBe(5);
    expect(weeks[1]?.count).toBe(5);
    expect(weeks[0]?.index).toBe(0);
    expect(weeks[1]?.index).toBe(1);

    const grooveCount = weeks.length;
    const r0 = grooveRadius(weeks[0]!.index, grooveCount);
    const r1 = grooveRadius(weeks[1]!.index, grooveCount);
    expect(r0).not.toBe(r1);
  });

  it("bucket 0 starts on the Sunday on-or-before 1 January", () => {
    const weeks = bucketWeeks([], 2026, NOW, "UTC");
    // 2026-01-01 is a Thursday; the Sunday on-or-before it is 2025-12-28.
    expect(weeks[0]?.startDate.toISOString().slice(0, 10)).toBe("2025-12-28");
  });
});

describe("Zero-week / all-zero-year rendering (CARD-04 precision, RENDER-06 empty)", () => {
  it("an all-zero calendar produces no non-numeric coordinate token, and radii match a bounded-decimal pattern", () => {
    const data = baseProfileData([]);
    const markup = theRecordWidget.renderBody(data, editorialLight, optsFor("en", NOW));

    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    const radii = [...markup.matchAll(/r="(-?[\d.]+)"/g)].map((m) => m[1]);
    for (const r of radii) {
      expect(r).toMatch(/^-?\d+\.\d{2}$|^\d+(\.\d+)?$/);
    }
  });

  it("the zero-contribution render still contains the @keyframes block and the animated group (D-06)", () => {
    const data = baseProfileData([]);
    const markup = theRecordWidget.renderBody(data, editorialLight, optsFor("en", NOW));

    expect(markup).toContain("@keyframes atelier-record-spin");
    expect(markup).toContain('class="atelier-record-spin"');
  });

  it("exactly one class=\"atelier-record-spin\" group exists, for both a populated and an all-zero fixture", () => {
    const populated = theRecordWidget.renderBody(
      baseProfileData([{ date: "2026-01-04", count: 3 }]),
      editorialLight,
      optsFor("en", NOW),
    );
    const empty = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", NOW));

    expect(populated.match(/class="atelier-record-spin"/g)).toHaveLength(1);
    expect(empty.match(/class="atelier-record-spin"/g)).toHaveLength(1);
  });
});

describe("Animation markup — RENDER-06 mechanism (no per-widget !important)", () => {
  it("the widget's own animation shorthand carries no !important, while the wrapped SVG still carries the chassis reduced-motion block", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    const { light } = renderPair(theRecordWidget, data, optsFor("en", NOW), {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).toContain("@media (prefers-reduced-motion: reduce)");
    expect(light).toContain("animation-duration:0.01ms!important");

    const widgetStyleMatch = light.match(/<style>@keyframes atelier-record-spin[^]*?<\/style>/);
    expect(widgetStyleMatch).not.toBeNull();
    expect(widgetStyleMatch?.[0]).not.toContain("!important");
  });

  it("the <style> selector (.atelier-record-spin) matches a class attribute actually present in the body markup", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    const markup = theRecordWidget.renderBody(data, editorialLight, optsFor("en", NOW));
    const selector = markup.match(/\.([\w-]+)\{animation:/)?.[1];

    expect(selector).toBeDefined();
    expect(markup).toContain(`class="${selector}"`);
  });
});

describe("Determinism — same seed renders byte-identical output (RENDER-09)", () => {
  it("rendering the same (data, theme, opts) twice with the same opts.seed produces byte-identical markup", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    const opts = optsFor("en", NOW);
    const a = theRecordWidget.renderBody(data, editorialLight, opts);
    const b = theRecordWidget.renderBody(data, editorialLight, opts);
    expect(a).toBe(b);
  });

  it("mulberry32 is a pure function of its seed — same seed, same sequence", () => {
    const seqA = Array.from({ length: 5 }, mulberry32(7));
    const seqB = Array.from({ length: 5 }, mulberry32(7));
    expect(seqA).toEqual(seqB);
  });
});

describe("zonedYear / calendarWindowFrom — agree on the zoned year (CARD-04)", () => {
  it.each([
    { now: new Date("2026-08-08T00:00:00Z"), tz: "UTC" },
    { now: new Date("2026-01-01T00:00:00Z"), tz: "UTC" },
    // UTC+8, comfortably past local 1 January (no clamp in play) — the
    // zoned year must read 2026 in both this file's zonedYear() and
    // core/fetch.ts's calendarWindowFrom().
    { now: new Date("2026-06-15T00:00:00Z"), tz: "Asia/Taipei" },
    { now: new Date("2026-01-01T08:00:00Z"), tz: "Asia/Taipei" },
  ])(
    "now=$now.toISOString() tz=$tz: calendarWindowFrom's UTC year matches zonedYear's zoned year",
    ({ now, tz }) => {
      const year = zonedYear(now, tz);
      const windowStart = new Date(calendarWindowFrom(now, tz));
      expect(windowStart.getUTCFullYear()).toBe(year);
      expect(windowStart.getTime()).toBeLessThanOrEqual(now.getTime());
    },
  );

  it("clamps the window start to `now` itself when now is early on 1 January in a zone ahead of UTC (D-01 boundary)", () => {
    // 2025-12-31T20:00:00Z is already 2026-01-01T04:00 in Asia/Taipei
    // (UTC+8) — the zoned year is 2026, but Date.UTC(2026, 0, 1)
    // (2026-01-01T00:00:00Z) is AFTER this `now` instant, so the window must
    // clamp to `now` itself rather than start in the future.
    const now = new Date("2025-12-31T20:00:00Z");
    const tz = "Asia/Taipei";
    expect(zonedYear(now, tz)).toBe(2026);
    expect(calendarWindowFrom(now, tz)).toBe(now.toISOString());
  });
});

describe("renderPair — sandbox-safety invariant (RENDER-01)", () => {
  it("contains no <text> element in either theme", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    const { light, dark } = renderPair(theRecordWidget, data, optsFor("en", NOW), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).toContain("<svg");
  });

  it("renders in zh-TW without throwing (glyph coverage for the centre-label year digits)", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    expect(() =>
      renderPair(theRecordWidget, data, optsFor("zh-TW", NOW), { light: editorialLight, dark: editorialDark }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Plan 04-02 Task 3 — boundary tests over the degenerate states the UI-SPEC
// enumerates that the 04-01 tracer did not already close.
// ---------------------------------------------------------------------------

describe("Groove pitch — differs by at most 0.06px between a 53-week and a 54-week year (UI-SPEC Card Layout)", () => {
  it("pitch(53) vs pitch(54): the difference is at most 0.06", () => {
    const pitch = (G: number) => grooveRadius(0, G) - grooveRadius(1, G);
    expect(Math.abs(pitch(53) - pitch(54))).toBeLessThanOrEqual(0.06);
  });
});

describe("Pressed/future boundary — 1 January and 31 December (UI-SPEC Degenerate States #4/#5)", () => {
  it("now = 1 January: exactly one elapsed bucket, the rest future", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const weeks = bucketWeeks([], 2026, now, "UTC");
    expect(weeks.filter((w) => w.elapsed).length).toBe(1);
    expect(weeks.filter((w) => !w.elapsed).length).toBe(weeks.length - 1);
  });

  it("now = 31 December: every bucket elapsed, zero future", () => {
    const now = new Date("2026-12-31T00:00:00Z");
    const weeks = bucketWeeks([], 2026, now, "UTC");
    expect(weeks.every((w) => w.elapsed)).toBe(true);
    expect(weeks.filter((w) => !w.elapsed).length).toBe(0);
  });
});

describe("Tonearm tip radius — matches the current week's groove, not the last nonzero week (D-05)", () => {
  it("now = 1 January: tip radius/coords equal the R_OUTER worked endpoint (UI-SPEC worked table)", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const markup = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", now));
    const tipMatch = markup.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1.5" fill="[^"]+"\/>/);
    expect(tipMatch).not.toBeNull();
    // Compared with 1-decimal tolerance: the UI-SPEC's own worked table
    // rounds the intermediate unit vector `u` to 4 decimals before deriving
    // the tip, which introduces ~0.01px of drift versus computing directly
    // from the exact (unrounded) formula, as tonearmTip() does here.
    expect(Number(tipMatch![1])).toBeCloseTo(199.68, 1);
    expect(Number(tipMatch![2])).toBeCloseTo(171.94, 1);
  });

  it("now = 31 December: tip radius/coords equal the R_INNER worked endpoint (UI-SPEC worked table)", () => {
    const now = new Date("2026-12-31T00:00:00Z");
    const markup = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", now));
    const tipMatch = markup.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1.5" fill="[^"]+"\/>/);
    expect(tipMatch).not.toBeNull();
    expect(Number(tipMatch![1])).toBeCloseTo(153.61, 1);
    expect(Number(tipMatch![2])).toBeCloseTo(162.36, 1);
  });
});

describe("tonearmTip — reachability invariant holds at both radial extremes (record-tonearm overflow)", () => {
  it("r = R_OUTER (86) produces finite, non-NaN coordinates", () => {
    const tip = tonearmTip(86);
    expect(Number.isFinite(tip.x)).toBe(true);
    expect(Number.isFinite(tip.y)).toBe(true);
  });

  it("r = R_INNER (39) produces finite, non-NaN coordinates", () => {
    const tip = tonearmTip(39);
    expect(Number.isFinite(tip.x)).toBe(true);
    expect(Number.isFinite(tip.y)).toBe(true);
  });
});

describe("busiestElapsedWeek — ties resolve to the earliest (lowest-index) week (UI-SPEC Degenerate State #6, QA-02)", () => {
  const week = (index: number, count: number): RecordWeek => ({ index, startDate: new Date(0), count, elapsed: true });

  it("two elapsed weeks tied at the same max count: the earlier index wins", () => {
    const weeks = [week(0, 5), week(1, 5), week(2, 3)];
    expect(busiestElapsedWeek(weeks)).toEqual({ index: 0, count: 5 });
  });

  it("all-zero elapsed weeks return null (maxWeekly === 0)", () => {
    const weeks = [week(0, 0), week(1, 0)];
    expect(busiestElapsedWeek(weeks)).toBeNull();
  });

  it("no elapsed weeks returns null", () => {
    expect(busiestElapsedWeek([])).toBeNull();
  });
});

describe("Busiest-elapsed-count-of-0 — every elapsed groove takes the pressed floor, no branch (Degenerate State #1/#2)", () => {
  it("an all-zero calendar renders every elapsed groove at exactly the pressed floor (width 0.55, opacity 0.42)", () => {
    const markup = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", NOW));
    const pressedCircles = [
      ...markup.matchAll(/<circle[^>]*fill="none"[^>]*stroke-width="(\d+\.\d+)" stroke-opacity="0\.42"\/>/g),
    ];
    expect(pressedCircles.length).toBeGreaterThan(0);
    for (const m of pressedCircles) {
      expect(m[1]).toBe("0.55");
    }
  });

  it("the all-zero render emits exactly one more <path> element than a populated render with the same shape (D-06: only the caption is added)", () => {
    const populated = theRecordWidget.renderBody(
      baseProfileData([{ date: "2026-01-04", count: 3 }]),
      editorialLight,
      optsFor("en", NOW),
    );
    const empty = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", NOW));
    const countPaths = (markup: string) => (markup.match(/<path /g) ?? []).length;
    expect(countPaths(empty)).toBe(countPaths(populated) + 1);
  });

  it("the all-zero render has the same groove-ring count as a populated render (same year/now)", () => {
    const populated = theRecordWidget.renderBody(
      baseProfileData([{ date: "2026-01-04", count: 3 }]),
      editorialLight,
      optsFor("en", NOW),
    );
    const empty = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", NOW));
    const grooveCount = (markup: string) => (markup.match(/<circle[^>]*fill="none"/g) ?? []).length;
    expect(grooveCount(empty)).toBe(grooveCount(populated));
  });
});

describe("Future weeks never influence the total, busiest-week anchor, or silent-week count (D-03 no-future-contribution guard)", () => {
  it("bucketWeeks marks a week whose start date is after now as NOT elapsed even when it carries a nonzero count", () => {
    const calendar = [{ date: "2026-12-27", count: 999 }]; // final week of 2026, future relative to NOW (2026-08-08)
    const weeks = bucketWeeks(calendar, 2026, NOW, "UTC");
    const finalWeek = weeks[weeks.length - 1]!;
    expect(finalWeek.count).toBe(999);
    expect(finalWeek.elapsed).toBe(false);
  });

  it("injecting a huge future-week count does not change the rendered pressed-groove stroke-widths (maxWeekly stays anchored to elapsed weeks only)", () => {
    const baseCalendar = [{ date: "2026-01-04", count: 10 }]; // elapsed relative to NOW
    const withFuture = [...baseCalendar, { date: "2026-12-27", count: 999_999 }];
    const a = theRecordWidget.renderBody(baseProfileData(baseCalendar), editorialLight, optsFor("en", NOW));
    const b = theRecordWidget.renderBody(baseProfileData(withFuture), editorialLight, optsFor("en", NOW));
    const grooveWidths = (markup: string) =>
      [...markup.matchAll(/<circle[^>]*fill="none"[^>]*stroke-width="(\d+\.\d+)"/g)].map((m) => m[1]);
    expect(grooveWidths(b)).toEqual(grooveWidths(a));
  });
});

describe("Seeded texture element counts are fixed constants (D-09) — never scale with data", () => {
  it.each([
    { label: "populated", calendar: [{ date: "2026-01-04", count: 3 }] },
    { label: "all-zero", calendar: [] },
  ])("$label: scuff+wear arc count is 70, dust dot count is 24", ({ calendar }) => {
    const markup = theRecordWidget.renderBody(baseProfileData(calendar), editorialLight, optsFor("en", NOW));
    const arcCount = (
      markup.match(/<path d="[^"]*" fill="none" stroke="[^"]*" stroke-width="[\d.]+" stroke-opacity="[\d.]+"\/>/g) ??
      []
    ).length;
    const dustCount = (
      markup.match(/<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="[^"]*" fill-opacity="[\d.]+"\/>/g) ?? []
    ).length;
    expect(arcCount).toBe(70);
    expect(dustCount).toBe(24);
  });
});

describe("mulberry32 — different seeds diverge", () => {
  it("produces a different sequence for a different seed", () => {
    const seqA = Array.from({ length: 5 }, mulberry32(7));
    const seqC = Array.from({ length: 5 }, mulberry32(8));
    expect(seqA).not.toEqual(seqC);
  });
});

describe("Absent contributionCalendar renders the same as an all-zero calendar (capability not composed)", () => {
  it("does not throw when contributionCalendar is undefined", () => {
    const data = baseProfileData(undefined);
    expect(() => theRecordWidget.renderBody(data, editorialLight, optsFor("en", NOW))).not.toThrow();
  });

  it("produces the same groove-ring count as an explicit all-zero calendar", () => {
    const undefinedMarkup = theRecordWidget.renderBody(baseProfileData(undefined), editorialLight, optsFor("en", NOW));
    const emptyMarkup = theRecordWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en", NOW));
    const grooveCount = (markup: string) => (markup.match(/<circle[^>]*fill="none"/g) ?? []).length;
    expect(grooveCount(undefinedMarkup)).toBe(grooveCount(emptyMarkup));
  });
});

describe("Page-number footer — absent-means-emit-nothing contract (inherited Phase 3)", () => {
  it("rendering with pageNumber/totalPages undefined produces markup that is an exact prefix of the same render with them defined", () => {
    const data = baseProfileData([{ date: "2026-01-04", count: 3 }]);
    const optsNoFooter = optsFor("en", NOW);
    const optsWithFooter: RenderOptions = { ...optsNoFooter, pageNumber: 4, totalPages: 4 };
    const withoutFooter = theRecordWidget.renderBody(data, editorialLight, optsNoFooter);
    const withFooter = theRecordWidget.renderBody(data, editorialLight, optsWithFooter);
    expect(withFooter.startsWith(withoutFooter)).toBe(true);
    expect(withFooter.length).toBeGreaterThan(withoutFooter.length);
  });
});

describe("Glyph coverage regression — every character this card can emit is covered (Pitfall 4)", () => {
  it("every distinct character across copy.ts exports, describe() strings, digits, and separators is covered by its rendering font", () => {
    const enDesc = theRecordWidget.describe(baseProfileData([]), optsFor("en", NOW));
    const zhDesc = theRecordWidget.describe(baseProfileData([]), optsFor("zh-TW", NOW));

    const enStrings = [
      chromeEn.title,
      totalLabelEn,
      weeksPressedLabelEn,
      busiestWeekLabelEn,
      silentWeeksLabelEn,
      noneValueEn,
      needleCaptionEn,
      zeroCaptionEn,
      weeksPressedValue(33, 53),
      busiestWeekValueEn(23, "142"),
      silentWeeksValue(12),
      pageFooterEn(4, 4),
      enDesc.title,
      enDesc.desc,
      "0123456789",
      " -/",
    ];
    const zhStrings = [
      chromeZh.title,
      mastheadEyebrowZh,
      totalLabelZh,
      weeksPressedLabelZh,
      busiestWeekLabelZh,
      silentWeeksLabelZh,
      noneValueZh,
      needleCaptionZh,
      zeroCaptionZh,
      weeksPressedValue(33, 53),
      busiestWeekValueZh(23, "142"),
      silentWeeksValue(12),
      pageFooterZh(4, 4),
      zhDesc.title,
      zhDesc.desc,
      "0123456789",
      " -/",
    ];

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
