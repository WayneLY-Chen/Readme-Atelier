import { beforeAll, describe, expect, it } from "vitest";
import { calendarWindowFrom } from "../../core/fetch.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { renderPair } from "../../core/svg.js";
import {
  bucketWeeks,
  grooveCountForYear,
  grooveRadius,
  mulberry32,
  theRecordWidget,
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

describe("grooveCountForYear — bounded in [52, 54] (UI-SPEC Degenerate State #3)", () => {
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
    const widths = [...markup.matchAll(/stroke-width="(\d+\.\d+)"/g)].map((m) => Number(m[1]));
    for (const w of widths) {
      expect(w).toBeLessThanOrEqual(1.1);
    }
    expect(markup).toContain('stroke-width="1.10"');
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
