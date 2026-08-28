import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theTickerWidget } from "./index.js";

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

/**
 * A ~12-month calendar (61 days of zero settle before 2026-01-01, then all
 * of 2026) engineered — and cross-checked against the real
 * computeMonthlyCandles/levelToY output during planning (06-03-SUMMARY.md
 * carries the worked numbers) — to yield >=3 filled(up), >=3 hollow(down),
 * and >=1 doji candle, with the current (December) month's open > 0 (so the
 * change figure prints a percentage, not FLAT or the level-change branch).
 */
const CALENDAR: NonNullable<ProfileData["contributionCalendar"]> = (() => {
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
})();

const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: CALENDAR,
};

const emptyProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: [],
};

/** T2 (all-zero, but real candles) — 120 days spanning 4 months, every
 * count zero. */
const allZeroProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: buildCalendar("2026-01-01", 120, () => 0),
};

// FIXED_OPTS_BASE (06-PATTERNS.md convention): seed 42, timezone UTC, a
// fixed `now` inside the calendar's last month.
const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-12-20T00:00:00Z"),
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 06-03 Task 3: fixed-input snapshot, populated state", () => {
  it("renders a stable en light/dark snapshot with >=3 filled, >=3 hollow, and >=1 doji candle bodies", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // Rule C-3's machine-verifiable face — a named assertion alongside the
    // file snapshot, since a snapshot diff is easy to silently `--update`
    // past (06-PATTERNS.md's stated convention).
    const filledBodies = [...light.matchAll(/<rect x="[\d.-]+" y="[\d.]+" width="11" height="[\d.]+" fill="#302A25"\/>/g)];
    const hollowBodies = [
      ...light.matchAll(/<rect x="[\d.-]+" y="[\d.]+" width="11" height="[\d.]+" fill="#F7F1E7" stroke="#302A25" stroke-width="1"\/>/g),
    ];
    expect(filledBodies.length).toBeGreaterThanOrEqual(3);
    expect(hollowBodies.length).toBeGreaterThanOrEqual(3);

    // Doji bodies are a subset of "filled" (ink fill, no stroke) at the
    // exact 1.5px height — isolate them from directional ink bodies whose
    // height happens to round to something else.
    const dojiBodies = [...light.matchAll(/<rect x="[\d.-]+" y="[\d.]+" width="11" height="1\.5" fill="#302A25"\/>/g)];
    expect(dojiBodies.length).toBeGreaterThanOrEqual(1);

    expect(light).toContain('stroke-dasharray="2 3"');
    expect(light).not.toContain("@keyframes");
    expect(light).not.toContain("<text");

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).not.toContain("@keyframes");
    expect(light).not.toContain("<text");

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-dark.svg");
  });
});

describe("Plan 06-03 Task 3: fixed-input snapshot, empty state (T1 — no calendar at all)", () => {
  it("renders a stable en light/dark snapshot: zero candle bodies, zero line present, empty sentence replaces the legend", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // UI-SPEC T1: panel and zero line render, no candle bodies, no month
    // axis (zero accent-fill elements).
    expect(light).not.toMatch(/<rect[^>]*width="11"/);
    expect(light).toContain('y1="200" x2="463" y2="200"');
    expect(light.match(/fill="#8B5E3C"/g)).toBeNull();

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-en-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-en-dark-empty.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).not.toMatch(/<rect[^>]*width="11"/);

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-dark-empty.svg");
  });
});

describe("Plan 06-03 Task 3: fixed-input snapshot, all-zero state (T2 — real candles, every count zero)", () => {
  it("renders a stable en light/dark snapshot: every candle body is a 1.5px doji at the zero line, legend still renders", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, allZeroProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    const bodyRects = [...light.matchAll(/<rect x="[\d.-]+" y="[\d.]+" width="11" height="1\.5" fill="#302A25"\/>/g)];
    expect(bodyRects.length).toBe(4); // 4 months in this fixture, all doji
    for (const m of bodyRects) {
      expect(m[0]).toContain('y="199.25"'); // openY(0)-0.75
    }

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-en-light-allzero.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-en-dark-allzero.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theTickerWidget, allZeroProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-light-allzero.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-ticker-zh-TW-dark-allzero.svg");
  });
});
