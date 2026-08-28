import { beforeAll, describe, expect, it } from "vitest";
import { hasGlyph } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import {
  eyebrowZh,
  pageFooterEn,
  pageFooterZh,
  stat1LabelEn,
  stat1LabelZh,
  stat2LabelEn,
  stat2LabelZh,
  stat3LabelEn,
  stat3LabelZh,
  statusFaintEn,
  statusFaintZh,
  statusFlatlineEn,
  statusFlatlineZh,
  statusRapidEn,
  statusRapidZh,
  statusSteadyEn,
  statusSteadyZh,
  titleEn,
  titleZh,
  windowCaptionEmptyEn,
  windowCaptionEmptyZh,
  windowCaptionFullEn,
  windowCaptionFullZh,
  windowCaptionPartialEn,
  windowCaptionPartialZh,
} from "./copy.js";
import {
  computeStreak,
  computeVitalsWindow,
  dayAmplitude,
  dayVertices,
  statusTier,
  statusWordFor,
  vitalsWidget,
  windowCaptionFor,
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

function optsFor(language: RenderOptions["language"], extra: Partial<RenderOptions> = {}): RenderOptions {
  return { now: new Date("2026-08-08T00:00:00Z"), seed: 42, timezone: "UTC", language, ...extra };
}

/** 28-day, fully-recorded, non-flatline fixture — used across several
 * sections below as the "populated" baseline. */
function populatedCalendar(): { date: string; count: number }[] {
  return Array.from({ length: 28 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 6, 12 + i)); // 2026-07-12..2026-08-08
    const count = i % 5 === 0 ? 0 : ((i * 7) % 11) + 1;
    return { date: day.toISOString().slice(0, 10), count };
  });
}

beforeAll(() => {
  loadAllFonts();
});

describe("vitalsWidget — identity (CARD-05)", () => {
  it("has the expected name, requires, and size", () => {
    expect(vitalsWidget.name).toBe("vitals");
    expect(vitalsWidget.requires).toEqual(["calendar"]);
    expect(vitalsWidget.size).toEqual({ width: 495, height: 272 });
  });

  it("optionsSchema accepts an empty object and rejects an unknown key", () => {
    expect(() => vitalsWidget.optionsSchema.parse({})).not.toThrow();
    expect(() => vitalsWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => vitalsWidget.optionsSchema.parse({ bogus: true })).toThrow();
  });
});

describe("computeVitalsWindow — right-aligned trailing window (06-UI-SPEC.md 'The ECG trace — Window')", () => {
  it("n === min(28, calendar.length); recorded holds the newest n counts, oldest first", () => {
    const calendar = [
      { date: "2026-08-01", count: 1 },
      { date: "2026-08-02", count: 2 },
      { date: "2026-08-03", count: 3 },
    ];
    const { n, recorded } = computeVitalsWindow(calendar);
    expect(n).toBe(3);
    expect(recorded).toEqual([1, 2, 3]);
  });

  it("clamps to 28 when the calendar is longer, taking the newest 28 entries", () => {
    const calendar = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, count: i }));
    const { n, recorded } = computeVitalsWindow(calendar);
    expect(n).toBe(28);
    expect(recorded).toEqual(Array.from({ length: 28 }, (_, i) => i + 12));
  });

  it("an empty calendar produces n === 0 and an empty recorded array", () => {
    expect(computeVitalsWindow([])).toEqual({ n: 0, recorded: [] });
  });

  it("an undefined calendar behaves the same as an empty one", () => {
    expect(computeVitalsWindow(undefined)).toEqual({ n: 0, recorded: [] });
  });
});

describe("V4 — maxCount === 0 division guard (dayAmplitude)", () => {
  it("every day with count === 0 has amplitude 0 regardless of maxCount", () => {
    expect(dayAmplitude(0, 0)).toBe(0);
    expect(dayAmplitude(0, 100)).toBe(0);
  });

  it("maxCount === 0 (all-zero window) never divides by zero for a c > 0 day — unreachable in practice (c > 0 implies maxCount >= c) but the guard is asserted directly", () => {
    // t = maxCount === 0 ? 0 : c / maxCount — asserted directly since a
    // real all-zero window can never produce a c > 0 day (maxCount is the
    // max of the same array c comes from).
    const h = dayAmplitude(5, 0);
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBe(6); // R_MIN, since t collapses to 0
  });

  it("t === 1 (the busiest day) produces exactly R_MAX (36)", () => {
    expect(dayAmplitude(10, 10)).toBe(36);
  });

  it("a mid-range day produces an amplitude strictly between R_MIN and R_MAX", () => {
    const h = dayAmplitude(5, 10);
    expect(h).toBeGreaterThan(6);
    expect(h).toBeLessThan(36);
  });
});

describe("V6 — a single enormous day: every other recorded day still collapses to R_MIN (6), not flat", () => {
  it("dayAmplitude(1, 1_000_000) rounds to R_MIN at 2-decimal render precision, and is never 0", () => {
    const h = dayAmplitude(1, 1_000_000);
    expect(h).toBeGreaterThan(0);
    expect(Number(h.toFixed(2))).toBe(6);
  });

  it("dayVertices for a count=1 day beside a huge maxCount places the R-wave peak at y = BASELINE_Y - R_MIN (110) after 2-decimal render rounding", () => {
    // Exercised via dayVertices directly (not a full renderBody) because a
    // huge count also inflates DAILY MEAN past its own T2 slot budget for
    // a 3-day fixture — this test is scoped to the geometry guard alone.
    const verts = dayVertices(0, 1, 1_000_000);
    const rWavePeak = verts[3]!;
    expect(Number(rWavePeak[1].toFixed(2))).toBe(110);
  });
});

describe("dayVertices — extent checks (06-UI-SPEC.md 'Extent check')", () => {
  it("t=1 (max upshoot) places the R-wave peak at y=80, 8px inside the panel top (72)", () => {
    const verts = dayVertices(0, 36, 36); // c === maxCount, t === 1, h === R_MAX
    const rWavePeak = verts[3]!;
    expect(rWavePeak[1]).toBe(80);
  });

  it("t=1's S-wave trough sits at y=132.2, inside the panel bottom (160)", () => {
    const verts = dayVertices(0, 36, 36);
    const sWaveTrough = verts[4]!;
    expect(sWaveTrough[1]).toBe(132.2);
  });

  it("a recorded-zero day (c === 0) produces exactly two flat points on BASELINE_Y", () => {
    const verts = dayVertices(5, 0, 100);
    expect(verts).toHaveLength(2);
    expect(verts[0]![1]).toBe(116);
    expect(verts[1]![1]).toBe(116);
  });

  it("every day begins and ends exactly on BASELINE_Y, whatever the count", () => {
    const verts = dayVertices(2, 7, 10);
    expect(verts[0]![1]).toBe(116);
    expect(verts[verts.length - 1]![1]).toBe(116);
  });
});

describe("V5 — streak grace day, exactly one (computeStreak)", () => {
  it("branch A: last recorded day is 0, day before is non-zero -> counts from the previous day", () => {
    // Grace consumes the trailing 0 (index 3); the walk then counts every
    // remaining non-zero day back to index 0: [3, 1, 1] -> streak 3.
    expect(computeStreak([1, 1, 3, 0])).toBe(3);
  });

  it("branch B: last recorded day is non-zero -> counts directly, no grace consumed", () => {
    expect(computeStreak([1, 1, 3, 4])).toBe(4);
  });

  it("two consecutive zero days: exactly one grace day is taken, never two — streak breaks at the second zero", () => {
    expect(computeStreak([5, 0, 0])).toBe(0);
  });

  it("an empty recorded array returns 0 without indexing", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("a single non-zero day returns 1", () => {
    expect(computeStreak([7])).toBe(1);
  });

  it("a single zero day (grace consumed, nothing left) returns 0", () => {
    expect(computeStreak([0])).toBe(0);
  });
});

describe("Status ladder boundaries (statusTier)", () => {
  it.each([
    [0, "FLATLINE"],
    [1, "FAINT"],
    [9, "FAINT"],
    [10, "STEADY"],
    [20, "STEADY"],
    [21, "RAPID"],
    [28, "RAPID"],
  ])("activeDays=%i -> %s", (activeDays, expected) => {
    expect(statusTier(activeDays as number)).toBe(expected);
  });
});

describe("statusWordFor / windowCaptionFor — copy selection matches copy.ts exactly", () => {
  it("every status word matches its copy.ts export, per language", () => {
    expect(statusWordFor("FLATLINE", "en")).toBe(statusFlatlineEn);
    expect(statusWordFor("FLATLINE", "zh-TW")).toBe(statusFlatlineZh);
    expect(statusWordFor("FAINT", "en")).toBe(statusFaintEn);
    expect(statusWordFor("FAINT", "zh-TW")).toBe(statusFaintZh);
    expect(statusWordFor("STEADY", "en")).toBe(statusSteadyEn);
    expect(statusWordFor("STEADY", "zh-TW")).toBe(statusSteadyZh);
    expect(statusWordFor("RAPID", "en")).toBe(statusRapidEn);
    expect(statusWordFor("RAPID", "zh-TW")).toBe(statusRapidZh);
  });

  it("window caption: n === 28 -> the full-window string", () => {
    expect(windowCaptionFor(28, "en")).toBe(windowCaptionFullEn);
    expect(windowCaptionFor(28, "zh-TW")).toBe(windowCaptionFullZh);
  });

  it("window caption: n === 0 -> the no-recording string", () => {
    expect(windowCaptionFor(0, "en")).toBe(windowCaptionEmptyEn);
    expect(windowCaptionFor(0, "zh-TW")).toBe(windowCaptionEmptyZh);
  });

  it("window caption: 1 <= n < 28 -> the partial-window string, with the real n interpolated (V2 — this is Rule C-1's whole reason to exist)", () => {
    expect(windowCaptionFor(9, "en")).toBe(windowCaptionPartialEn(9));
    expect(windowCaptionFor(9, "en")).toBe("ONLY 9 DAYS ON RECORD");
    expect(windowCaptionFor(9, "zh-TW")).toBe(windowCaptionPartialZh(9));
    expect(windowCaptionFor(9, "zh-TW")).toBe("僅有 9 天的紀錄");
  });
});

describe("V-02 — the pulse <circle> carries no opacity/fill-opacity/style attribute (the resting-state rule)", () => {
  it("the animated pulse circle in a populated, non-flatline render has none of the three attributes", () => {
    const markup = vitalsWidget.renderBody(baseProfileData(populatedCalendar()), editorialLight, optsFor("en"));
    const circleMatch = markup.match(/<circle cx="463" cy="116" r="3.5"[^>]*\/>/);
    expect(circleMatch).not.toBeNull();
    const circle = circleMatch![0];
    expect(circle).toContain('class="atelier-vitals-pulse"');
    expect(circle).not.toContain("opacity");
    expect(circle).not.toContain("fill-opacity");
    expect(circle).not.toContain("style=");
  });
});

describe("V-07 — animated-element count, restated conditionally (at most 1; exactly 1 iff n>0 && STATUS!=FLATLINE; exactly 0 for V1/V3)", () => {
  it("populated, non-flatline: exactly one class=\"atelier-vitals-pulse\"", () => {
    const markup = vitalsWidget.renderBody(baseProfileData(populatedCalendar()), editorialLight, optsFor("en"));
    expect(markup.match(/class="atelier-vitals-pulse"/g)).toHaveLength(1);
  });

  it("V1 (n === 0): exactly zero", () => {
    const markup = vitalsWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en"));
    expect(markup.match(/class="atelier-vitals-pulse"/g)).toBeNull();
  });

  it("V3 (28 recorded, all zero — a real flatline): exactly zero", () => {
    const flatline = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${(12 + i).toString().padStart(2, "0")}`, count: 0 }));
    const markup = vitalsWidget.renderBody(baseProfileData(flatline), editorialLight, optsFor("en"));
    expect(markup.match(/class="atelier-vitals-pulse"/g)).toBeNull();
    // A static rule-colored dot is still drawn.
    expect(markup).toContain(`fill="${editorialLight.rule}"`);
  });
});

describe("V-06 (second half) — n === 0 division guard (DAILY MEAN never prints NaN)", () => {
  it("an empty calendar renders no NaN/undefined/Infinity token anywhere in the markup", () => {
    const markup = vitalsWidget.renderBody(baseProfileData([]), editorialLight, optsFor("en"));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("V4 guard: an all-zero, fully-recorded (n=28) calendar also renders no NaN/undefined/Infinity token", () => {
    const flatline = Array.from({ length: 28 }, (_, i) => ({ date: `2026-07-${(12 + i).toString().padStart(2, "0")}`, count: 0 }));
    const markup = vitalsWidget.renderBody(baseProfileData(flatline), editorialLight, optsFor("en"));
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("Animation markup — RENDER-06 mechanism (no per-widget !important)", () => {
  it("the widget's own animation shorthand carries no !important, while the wrapped SVG still carries the chassis reduced-motion block", () => {
    const { light } = renderPair(vitalsWidget, baseProfileData(populatedCalendar()), optsFor("en"), {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).toContain("@media (prefers-reduced-motion: reduce)");
    expect(light).toContain("animation-duration:0.01ms!important");

    const widgetStyleMatch = light.match(/<style>@keyframes atelier-vitals-pulse[^]*?<\/style>/);
    expect(widgetStyleMatch).not.toBeNull();
    expect(widgetStyleMatch?.[0]).not.toContain("!important");
  });

  it("the <style> selector (.atelier-vitals-pulse) matches a class attribute actually present when the trace is non-flatline", () => {
    const markup = vitalsWidget.renderBody(baseProfileData(populatedCalendar()), editorialLight, optsFor("en"));
    const selector = markup.match(/\.([\w-]+)\{animation:/)?.[1];
    expect(selector).toBe("atelier-vitals-pulse");
    expect(markup).toContain(`class="${selector}"`);
  });

  it("the animated property is opacity only", () => {
    const markup = vitalsWidget.renderBody(baseProfileData(populatedCalendar()), editorialLight, optsFor("en"));
    const kf = markup.match(/@keyframes atelier-vitals-pulse\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    expect(kf).not.toBeNull();
    expect(kf![0]).toContain("opacity");
    expect(kf![0]).not.toMatch(/\btransform\b|\bfill\b(?!-opacity)/);
  });
});

describe("Determinism — same input renders byte-identical output twice", () => {
  it("renders the same (data, theme, opts) twice to identical markup", () => {
    const data = baseProfileData(populatedCalendar());
    const opts = optsFor("en");
    const a = vitalsWidget.renderBody(data, editorialLight, opts);
    const b = vitalsWidget.renderBody(data, editorialLight, opts);
    expect(a).toBe(b);
  });
});

describe("renderPair — sandbox-safety invariant (RENDER-01)", () => {
  it("contains no <text> element in either theme", () => {
    const { light, dark } = renderPair(vitalsWidget, baseProfileData(populatedCalendar()), optsFor("en"), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).toContain("<svg");
  });

  it("renders in zh-TW without throwing (glyph coverage)", () => {
    expect(() =>
      renderPair(vitalsWidget, baseProfileData(populatedCalendar()), optsFor("zh-TW"), {
        light: editorialLight,
        dark: editorialDark,
      }),
    ).not.toThrow();
  });
});

describe("Page-number footer (V7) — absent-means-emit-nothing contract (inherited Phase 3)", () => {
  it("rendering with pageNumber/totalPages undefined produces markup that is an exact prefix of the same render with them defined", () => {
    const data = baseProfileData(populatedCalendar());
    const optsNoFooter = optsFor("en");
    const optsWithFooter = optsFor("en", { pageNumber: 5, totalPages: 7 });
    const withoutFooter = vitalsWidget.renderBody(data, editorialLight, optsNoFooter);
    const withFooter = vitalsWidget.renderBody(data, editorialLight, optsWithFooter);
    expect(withFooter.startsWith(withoutFooter)).toBe(true);
    expect(withFooter.length).toBeGreaterThan(withoutFooter.length);
  });

  it("the window caption is independent of the footer and always renders regardless", () => {
    const data = baseProfileData(populatedCalendar());
    const withoutFooter = vitalsWidget.renderBody(data, editorialLight, optsFor("en"));
    // The window caption's eyebrowLabel path is emitted before the footer
    // conditional either way — this is a structural smoke check that the
    // caption branch itself never depends on opts.pageNumber.
    expect(withoutFooter).toContain(`fill="${editorialLight.accent}"`);
  });
});

describe("Glyph coverage regression — every character this card can emit is covered", () => {
  it("every distinct character across copy.ts exports, describe() strings, digits, and separators is covered by its rendering font", () => {
    const enDesc = vitalsWidget.describe(baseProfileData([]), optsFor("en"));
    const zhDesc = vitalsWidget.describe(baseProfileData([]), optsFor("zh-TW"));

    const enStrings = [
      titleEn,
      stat1LabelEn,
      stat2LabelEn,
      stat3LabelEn,
      statusFlatlineEn,
      statusFaintEn,
      statusSteadyEn,
      statusRapidEn,
      windowCaptionFullEn,
      windowCaptionEmptyEn,
      windowCaptionPartialEn(9),
      pageFooterEn(5, 7),
      enDesc.title,
      enDesc.desc,
      "0123456789",
      " -/",
      "12.4",
    ];
    const zhStrings = [
      titleZh,
      eyebrowZh,
      stat1LabelZh,
      stat2LabelZh,
      stat3LabelZh,
      statusFlatlineZh,
      statusFaintZh,
      statusSteadyZh,
      statusRapidZh,
      windowCaptionFullZh,
      windowCaptionEmptyZh,
      windowCaptionPartialZh(9),
      pageFooterZh(5, 7),
      zhDesc.title,
      zhDesc.desc,
      "0123456789",
      " -/",
      "12.4",
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
