import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { optimizeSvg } from "../../core/optimize.js";
import { SOFT_SIZE_BUDGET_BYTES } from "../../core/svg.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { vitalsWidget } from "./index.js";

/**
 * 06-VALIDATION.md V-04 / 06-PATTERNS.md "READ FIRST" — Option A: this file
 * replicates the invariant matrix `src/core/optimize.test.ts:90-146` runs
 * for every registered widget, INSIDE this widget's own directory, rather
 * than extending that core-owned file's hardcoded `WIDGETS` array (which
 * would be a `src/core/` diff and fail QA-04). This is a DELIBERATE fourth
 * copy of the matrix (06-UI-SPEC.md Watch Item B counts it) — read from
 * `../../core/optimize.js` only, never modifies it.
 *
 * Per 06-VALIDATION.md's explicit instruction: do NOT add vitals to
 * `src/core/optimize.browser-parity.test.ts` either — it already has an
 * animated fixture (the-record) and proves a property of the svgo entry
 * points, not of any one widget.
 */

const NOW = new Date("2026-08-08T00:00:00Z");

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

/** A populated, non-flatline, fully-recorded (n=28) fixture — the same
 * shape index.test.ts's populatedCalendar() uses, so the animated pulse
 * dot and a real ECG trace are both present. */
function populatedCalendar(): { date: string; count: number }[] {
  return Array.from({ length: 28 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 6, 12 + i));
    const count = i % 5 === 0 ? 0 : ((i * 7) % 11) + 1;
    return { date: day.toISOString().slice(0, 10), count };
  });
}

/** V2/partial (n=9) fixture — the ONLY populated-widget state that emits
 * Rule C-1's dashed no-recording line, needed for the dasharray-survival
 * check below. */
const PARTIAL_CALENDAR: { date: string; count: number }[] = [
  { date: "2026-07-31", count: 2 },
  { date: "2026-08-01", count: 0 },
  { date: "2026-08-02", count: 5 },
  { date: "2026-08-03", count: 1 },
  { date: "2026-08-04", count: 8 },
  { date: "2026-08-05", count: 0 },
  { date: "2026-08-06", count: 3 },
  { date: "2026-08-07", count: 2 },
  { date: "2026-08-08", count: 4 },
];

beforeAll(() => {
  loadAllFonts();
});

describe("vitals — optimizeSvg before/after structural invariants (V-04, Option A)", () => {
  for (const language of ["en", "zh-TW"] as const) {
    describe(language, () => {
      let raw: string;
      let opt: string;

      beforeAll(() => {
        const data = baseProfileData(populatedCalendar());
        const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language };
        raw = renderPair(vitalsWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
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
      });

      it("<polyline element count is identical before and after (Phase 6 addition — the ECG trace must survive convertShapeToPath: false)", () => {
        const rawPolylines = (raw.match(/<polyline/g) ?? []).length;
        const optPolylines = (opt.match(/<polyline/g) ?? []).length;
        expect(optPolylines).toBe(rawPolylines);
        expect(rawPolylines).toBeGreaterThan(0);
      });

      it("re-optimizing an already-optimized string is idempotent (preserves all invariants, does not grow)", () => {
        const reopt = optimizeSvg(opt);
        expect(reopt).toContain("@media (prefers-reduced-motion: reduce)");
        expect(reopt).toContain("<title>");
        expect(reopt).toContain("<desc>");
        expect(reopt).toContain("viewBox");
        expect((reopt.match(/<circle/g) ?? []).length).toBe((opt.match(/<circle/g) ?? []).length);
        expect((reopt.match(/<polyline/g) ?? []).length).toBe((opt.match(/<polyline/g) ?? []).length);
        expect(Buffer.byteLength(reopt, "utf8")).toBeLessThanOrEqual(Buffer.byteLength(opt, "utf8"));
      });

      it("the @keyframes name survives, and an animation: declaration in the same output references it (load-bearing cross-reference)", () => {
        const kfName = /@keyframes\s+([\w-]+)/.exec(opt)?.[1];
        expect(kfName).toBeDefined();
        expect(opt).toMatch(new RegExp(`animation:[^;}]*\\b${kfName as string}\\b`));
      });

      it('exactly one class="atelier-vitals-pulse" survives', () => {
        expect(opt.match(/class="atelier-vitals-pulse"/g)).toHaveLength(1);
      });
    });
  }
});

describe("vitals — stroke-dasharray (Rule C-1's no-recording line) survives optimization", () => {
  it("the V2/partial fixture's dashed no-recording line is present before AND after optimizeSvg", () => {
    const data = baseProfileData(PARTIAL_CALENDAR);
    const opts: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language: "en" };
    const raw = renderPair(vitalsWidget, data, opts, { light: editorialLight, dark: editorialDark }).light;
    const opt = optimizeSvg(raw);

    expect(raw).toContain('stroke-dasharray="3 3"');
    expect(opt).toContain('stroke-dasharray="3 3"');
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
    const { light, dark } = renderPair(vitalsWidget, data, opts, { light: editorialLight, dark: editorialDark });
    const raw = mode === "light" ? light : dark;
    const opt = optimizeSvg(raw);
    const bytes = new TextEncoder().encode(opt).length;

    // eslint-disable-next-line no-console -- V-08 requires this measurement
    // to be printed, not just asserted (06-01-SUMMARY.md records these four
    // numbers verbatim).
    console.info(`V-08: vitals-${language}-${mode}.svg optimized size = ${bytes} bytes`);
    expect(bytes).toBeLessThan(SOFT_SIZE_BUDGET_BYTES);
  });
});
