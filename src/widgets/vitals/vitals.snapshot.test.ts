import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { vitalsWidget } from "./index.js";

/**
 * A hand-written 35-entry calendar (06-01-PLAN.md Task 1: "at least 35
 * entries, tail 28 contain at least two count=0 days plus a clear maxCount
 * day"). The first 7 entries (2026-07-05..2026-07-11) fall OUTSIDE the
 * trailing-28-day window and only exist to prove the window is really
 * right-aligned to the newest 28 entries, not the whole array. The window
 * itself (2026-07-12..2026-08-08, 28 entries) contains two recorded-zero
 * days (2026-07-14, 2026-07-19 — Rule C-1's "solid accent flat segment"
 * case) and one clear maxCount day (2026-08-02, count 25).
 */
const CALENDAR: NonNullable<ProfileData["contributionCalendar"]> = [
  // Outside the trailing-28-day window.
  { date: "2026-07-05", count: 1 },
  { date: "2026-07-06", count: 2 },
  { date: "2026-07-07", count: 0 },
  { date: "2026-07-08", count: 3 },
  { date: "2026-07-09", count: 1 },
  { date: "2026-07-10", count: 2 },
  { date: "2026-07-11", count: 4 },
  // The trailing 28-day window (28 entries).
  { date: "2026-07-12", count: 2 },
  { date: "2026-07-13", count: 3 },
  { date: "2026-07-14", count: 0 }, // recorded zero, day 1
  { date: "2026-07-15", count: 5 },
  { date: "2026-07-16", count: 1 },
  { date: "2026-07-17", count: 4 },
  { date: "2026-07-18", count: 2 },
  { date: "2026-07-19", count: 0 }, // recorded zero, day 2
  { date: "2026-07-20", count: 6 },
  { date: "2026-07-21", count: 3 },
  { date: "2026-07-22", count: 2 },
  { date: "2026-07-23", count: 1 },
  { date: "2026-07-24", count: 8 },
  { date: "2026-07-25", count: 4 },
  { date: "2026-07-26", count: 2 },
  { date: "2026-07-27", count: 1 },
  { date: "2026-07-28", count: 9 },
  { date: "2026-07-29", count: 3 },
  { date: "2026-07-30", count: 2 },
  { date: "2026-07-31", count: 1 },
  { date: "2026-08-01", count: 5 },
  { date: "2026-08-02", count: 25 }, // the clear maxCount day
  { date: "2026-08-03", count: 4 },
  { date: "2026-08-04", count: 2 },
  { date: "2026-08-05", count: 1 },
  { date: "2026-08-06", count: 3 },
  { date: "2026-08-07", count: 2 },
  { date: "2026-08-08", count: 4 },
];

const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: CALENDAR,
};

// FIXED_OPTS_BASE (04-PATTERNS.md convention): seed: 42, timezone: "UTC", a
// fixed `now`. Vitals' output depends only on `contributionCalendar` and
// `language` — `now`/`seed`/`timezone` are carried for parity with every
// other card's snapshot-fixed-input convention, not because this widget
// reads them.
const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
};

beforeAll(() => {
  loadAllFonts();
});

describe("06-01 Task 1: fixed-input snapshot, populated state", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(vitalsWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // Named assertions alongside the file snapshot (a snapshot diff is easy
    // to silently `--update` past — 06-VALIDATION.md V-02/V-07's mechanism).
    expect(light).toContain("@keyframes atelier-vitals-pulse");
    expect(light).toContain('class="atelier-vitals-pulse"');
    // The fixture's window is fully recorded (n === 28), so Rule C-1's
    // dashed no-recording line must NOT appear.
    expect(light).not.toContain("stroke-dasharray");
    // RENDER-01 sandbox-safety invariant: no native SVG text element.
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");

    await expect(light).toMatchFileSnapshot("__snapshots__/vitals-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/vitals-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(vitalsWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).toContain("@keyframes atelier-vitals-pulse");
    expect(light).toContain('class="atelier-vitals-pulse"');
    expect(light).not.toContain("stroke-dasharray");
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");

    await expect(light).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-dark.svg");
  });
});
