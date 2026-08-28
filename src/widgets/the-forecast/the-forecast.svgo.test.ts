import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { optimizeSvg } from "../../core/optimize.js";
import { SOFT_SIZE_BUDGET_BYTES } from "../../core/svg.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theForecastWidget, weekdayIndexOf } from "./index.js";

/**
 * 06-VALIDATION.md V-04 / 06-PATTERNS.md "READ FIRST" — Option A: this file
 * replicates the invariant matrix `src/core/optimize.test.ts:90-146` runs
 * for every registered widget, INSIDE this widget's own directory, rather
 * than extending that core-owned file's hardcoded `WIDGETS` array (which
 * would be a `src/core/` diff and fail QA-04). This is a DELIBERATE fourth
 * copy of the matrix (06-UI-SPEC.md Watch Item B counts it) — read from
 * `../../core/optimize.js` only, never modifies it.
 *
 * Per 06-VALIDATION.md's explicit instruction: do NOT add the-forecast to
 * `src/core/optimize.browser-parity.test.ts` either — it already has an
 * animated fixture (the-record) and a static one is not needed for that
 * file's own purpose (proving svgo vs svgo/browser parity, a property of
 * the svgo entry points and config, not of any one widget).
 */

const NOW = new Date("2026-08-08T00:00:00Z");

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

/** Same populated fixture the-forecast.snapshot.test.ts uses (all five
 * weather tiers present, k=12) — the widest-surface real render this card
 * can produce, so it is the right one to measure V-08 against. */
const WEEKDAY_COUNT_TABLE = [0, 3, 8, 14, 20, 2, 5]; // Mon..Sun
const POPULATED_CALENDAR = buildCalendar(94, "2026-08-08", (w) => WEEKDAY_COUNT_TABLE[w]!);

beforeAll(() => {
  loadAllFonts();
});

describe("the-forecast — optimizeSvg before/after structural invariants (V-04, Option A)", () => {
  for (const language of ["en", "zh-TW"] as const) {
    describe(language, () => {
      let raw: string;
      let opt: string;

      beforeAll(() => {
        const data = baseProfileData(POPULATED_CALENDAR);
        const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language };
        raw = renderPair(theForecastWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
        opt = optimizeSvg(raw);
      });

      it("optimized byte length is strictly less than raw byte length", () => {
        expect(Buffer.byteLength(opt, "utf8")).toBeLessThan(Buffer.byteLength(raw, "utf8"));
      });

      it("the reduced-motion media block survives optimization", () => {
        expect(opt).toContain("@media (prefers-reduced-motion: reduce)");
      });

      it("<title>, <desc>, and viewBox all survive", () => {
        expect(opt).toContain("<title>");
        expect(opt).toContain("<desc>");
        expect(opt).toContain("viewBox");
      });

      it("<circle element count is identical before and after", () => {
        const rawCircles = (raw.match(/<circle/g) ?? []).length;
        const optCircles = (opt.match(/<circle/g) ?? []).length;
        expect(optCircles).toBe(rawCircles);
        expect(rawCircles).toBeGreaterThan(0); // this fixture spans CLOUD/PARTIAL/SUN/STORM, all circle-bearing
      });

      it("re-optimizing an already-optimized string is idempotent (preserves all invariants, does not grow)", () => {
        const reopt = optimizeSvg(opt);
        expect(reopt).toContain("@media (prefers-reduced-motion: reduce)");
        expect(reopt).toContain("<title>");
        expect(reopt).toContain("<desc>");
        expect(reopt).toContain("viewBox");
        expect((reopt.match(/<circle/g) ?? []).length).toBe((opt.match(/<circle/g) ?? []).length);
        expect(Buffer.byteLength(reopt, "utf8")).toBeLessThanOrEqual(Buffer.byteLength(opt, "utf8"));
      });

      it("no @keyframes block exists, before or after (this widget carries no animation — the load-bearing non-animated invariant for this phase)", () => {
        expect(raw).not.toMatch(/@keyframes/);
        expect(opt).not.toMatch(/@keyframes/);
      });
    });
  }
});

describe("the-forecast — stroke-dasharray (Rule C-2's dashed panel) survives optimization", () => {
  it("the panel border's 3 3 dasharray and the six column separators' 2 3 dasharray are both present before AND after optimizeSvg", () => {
    const data = baseProfileData(POPULATED_CALENDAR);
    const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language: "en" };
    const raw = renderPair(theForecastWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
    const opt = optimizeSvg(raw);

    expect(raw).toContain('stroke-dasharray="3 3"');
    expect(opt).toContain('stroke-dasharray="3 3"');
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
    const data = baseProfileData(POPULATED_CALENDAR);
    const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language };
    const { light, dark } = renderPair(theForecastWidget, data, opts, { light: editorialLight, dark: editorialDark });
    const raw = mode === "light" ? light : dark;
    const opt = optimizeSvg(raw);
    const bytes = new TextEncoder().encode(opt).length;

    // eslint-disable-next-line no-console -- V-08 requires this measurement
    // to be printed, not just asserted (06-02-SUMMARY.md records these four
    // numbers verbatim).
    console.info(`V-08: the-forecast-${language}-${mode}.svg optimized size = ${bytes} bytes`);
    expect(bytes).toBeLessThan(SOFT_SIZE_BUDGET_BYTES);
  });
});
