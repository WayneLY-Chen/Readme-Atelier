import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theRecordWidget } from "./index.js";

/**
 * A realistic partial-first-week calendar: 2026-01-01 is a Thursday, so the
 * bucket containing it (bucket 0, Sun 2025-12-28..Sat 2026-01-03) only has 4
 * real days (Jan 1-3 plus Dec 28-31 are outside the requested calendar
 * window and simply never appear) — matching what the real GraphQL fetch
 * actually returns for a 1 January-anchored window (04-PATTERNS.md). A
 * spread across the elapsed portion of the year (FIXED_OPTS_BASE's `now` is
 * mid-year), including one deliberately silent (zero-count) elapsed week and
 * one clear busiest week, so the snapshot exercises every rendered fact:
 * pressed vs. future grooves, the busiest-week anchor, and a silent week.
 */
const CALENDAR: NonNullable<ProfileData["contributionCalendar"]> = [
  { date: "2026-01-01", count: 2 },
  { date: "2026-01-02", count: 1 },
  { date: "2026-01-03", count: 0 },
  { date: "2026-01-12", count: 5 },
  { date: "2026-02-10", count: 12 },
  { date: "2026-03-15", count: 40 }, // lands the busiest-week anchor here
  { date: "2026-04-01", count: 3 },
  // 2026-05-04..2026-05-10 (bucket containing 2026-05-04) is left with no
  // entries at all — a genuinely silent elapsed week.
  { date: "2026-06-01", count: 7 },
  { date: "2026-07-04", count: 9 },
  { date: "2026-08-01", count: 4 },
];

const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: CALENDAR,
  contributionCalendarTotal: CALENDAR.reduce((sum, d) => sum + d.count, 0),
};

const emptyProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: [],
  contributionCalendarTotal: 0,
};

// FIXED_OPTS_BASE (04-PATTERNS.md convention): seed: 42, timezone: "UTC", a
// fixed mid-year `now` so a real pressed/future split is captured.
const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 04-02 Task 3: fixed-input snapshot, populated state", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theRecordWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-record-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-record-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theRecordWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-record-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-record-zh-TW-dark.svg");
  });
});

describe("Plan 04-02 Task 3: fixed-input snapshot, empty state (D-06)", () => {
  it("renders a stable en light/dark snapshot, still animating", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theRecordWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // UI-SPEC "Zero-contribution state": the rotation continues in the zero
    // state — a named assertion alongside the file snapshot, since a
    // snapshot diff is easy to silently `--update` past.
    expect(light).toContain("@keyframes atelier-record-spin");
    expect(light).toContain('class="atelier-record-spin"');
    expect(dark).toContain("@keyframes atelier-record-spin");
    expect(dark).toContain('class="atelier-record-spin"');

    await expect(light).toMatchFileSnapshot("__snapshots__/the-record-en-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-record-en-dark-empty.svg");
  });

  it("renders a stable zh-TW light/dark snapshot, still animating", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theRecordWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).toContain("@keyframes atelier-record-spin");
    expect(light).toContain('class="atelier-record-spin"');
    expect(dark).toContain("@keyframes atelier-record-spin");
    expect(dark).toContain('class="atelier-record-spin"');

    await expect(light).toMatchFileSnapshot("__snapshots__/the-record-zh-TW-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-record-zh-TW-dark-empty.svg");
  });
});
