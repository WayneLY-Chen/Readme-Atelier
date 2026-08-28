import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { optimizeSvg } from "../../core/optimize.js";
import { renderPair, SOFT_SIZE_BUDGET_BYTES } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theTickerWidget } from "./index.js";

/**
 * 06-VALIDATION.md V-04 / 06-PATTERNS.md "READ FIRST" — Option A: this file
 * replicates the invariant matrix `src/core/optimize.test.ts:90-146` runs
 * for every registered widget, INSIDE this widget's own directory, rather
 * than extending that core-owned file's hardcoded `WIDGETS` array (which
 * would be a `src/core/` diff and fail QA-04). This is a DELIBERATE fifth
 * copy of the matrix (06-UI-SPEC.md Watch Item B counts it, following
 * vitals.svgo.test.ts's fourth) — read from `../../core/optimize.js` only,
 * never modifies it.
 *
 * Per 06-VALIDATION.md's explicit instruction: do NOT add the-ticker to
 * `src/core/optimize.browser-parity.test.ts` either — it already has an
 * animated fixture (the-record) and proves a property of the svgo entry
 * points, not of any one widget. The Ticker is non-animated anyway, so this
 * file's own invariant matrix asserts the NO-@keyframes branch, matching
 * the-forecast's equivalent test rather than vitals's animated one.
 */

const NOW = new Date("2026-12-20T00:00:00Z");

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

/** The same populated (~12-month) fixture used by index.test.ts and
 * the-ticker.snapshot.test.ts — real candle bodies AND real dashed
 * gridlines/dashed axis text, so this test exercises the same markup
 * shapes svgo will actually see in production. */
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

beforeAll(() => {
  loadAllFonts();
});

describe("the-ticker — optimizeSvg before/after structural invariants (V-04, Option A)", () => {
  for (const language of ["en", "zh-TW"] as const) {
    describe(language, () => {
      let raw: string;
      let opt: string;

      beforeAll(() => {
        const data = baseProfileData(populatedCalendar());
        const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language };
        raw = renderPair(theTickerWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
        opt = optimizeSvg(raw);
      });

      it("optimized byte length is strictly less than raw byte length", () => {
        expect(Buffer.byteLength(opt, "utf8")).toBeLessThan(Buffer.byteLength(raw, "utf8"));
      });

      it("<title>, <desc>, and viewBox all survive", () => {
        expect(opt).toContain("<title>");
        expect(opt).toContain("<desc>");
        expect(opt).toContain("viewBox");
      });

      it("<rect element count is identical before and after (candle bodies + panel border must survive convertShapeToPath: false)", () => {
        const rawRects = (raw.match(/<rect/g) ?? []).length;
        const optRects = (opt.match(/<rect/g) ?? []).length;
        expect(optRects).toBe(rawRects);
        expect(rawRects).toBeGreaterThan(0);
      });

      it("<line element count is identical before and after (wicks, gridlines, zero line, hairline must all survive)", () => {
        const rawLines = (raw.match(/<line/g) ?? []).length;
        const optLines = (opt.match(/<line/g) ?? []).length;
        expect(optLines).toBe(rawLines);
        expect(rawLines).toBeGreaterThan(0);
      });

      it("re-optimizing an already-optimized string is idempotent (preserves all invariants, does not grow)", () => {
        const reopt = optimizeSvg(opt);
        expect(reopt).toContain("<title>");
        expect(reopt).toContain("<desc>");
        expect(reopt).toContain("viewBox");
        expect((reopt.match(/<rect/g) ?? []).length).toBe((opt.match(/<rect/g) ?? []).length);
        expect((reopt.match(/<line/g) ?? []).length).toBe((opt.match(/<line/g) ?? []).length);
        expect(Buffer.byteLength(reopt, "utf8")).toBeLessThanOrEqual(Buffer.byteLength(opt, "utf8"));
      });

      it("non-animated invariant: no @keyframes block before or after optimization (the only <style> element present is the chassis's own reduced-motion @media block, not a widget-authored animation)", () => {
        expect(raw).not.toContain("@keyframes");
        expect(opt).not.toContain("@keyframes");
        // The chassis (core/svg.ts's wrapSvg) unconditionally emits ONE
        // <style> for the prefers-reduced-motion @media block on every
        // card, animated or not — that one is expected and is NOT this
        // card's own markup, so it is not asserted against here.
      });
    });
  }
});

describe("the-ticker — stroke-dasharray (gridlines) survives optimization", () => {
  it("the populated fixture's dashed gridlines (2 3) are present before AND after optimizeSvg", () => {
    const data = baseProfileData(populatedCalendar());
    const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language: "en" };
    const raw = renderPair(theTickerWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
    const opt = optimizeSvg(raw);

    expect(raw).toContain('stroke-dasharray="2 3"');
    expect(opt).toContain('stroke-dasharray="2 3"');
  });
});

describe("V-08 — real rendered byte size, measured (not estimated), against the 204,800-byte guard", () => {
  it.each([
    ["en", "light"],
    ["en", "dark"],
    ["zh-TW", "light"],
    ["zh-TW", "dark"],
  ] as const)("%s / %s: optimized bytes < the 204800-byte soft budget", (language, mode) => {
    const data = baseProfileData(populatedCalendar());
    const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language };
    const { light, dark } = renderPair(theTickerWidget, data, opts, { light: editorialLight, dark: editorialDark });
    const raw = mode === "light" ? light : dark;
    const opt = optimizeSvg(raw);
    const bytes = new TextEncoder().encode(opt).length;

    // eslint-disable-next-line no-console -- V-08 requires this measurement
    // to be printed, not just asserted (06-03-SUMMARY.md records these four
    // numbers verbatim).
    console.info(`V-08: the-ticker-${language}-${mode}.svg optimized size = ${bytes} bytes`);
    expect(bytes).toBeLessThan(SOFT_SIZE_BUDGET_BYTES);
  });
});
