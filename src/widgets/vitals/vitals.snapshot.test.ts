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

/** V1 (06-UI-SPEC.md "Degenerate States — Vitals"): no recording at all. */
const emptyProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: [],
};

/**
 * V2: a brand-new account, n=9 (< 28), with at least one recorded-zero day
 * and one clear peak day — the exact condition Rule C-1 exists to encode
 * (a recorded zero, drawn as a solid accent flat segment, must never be
 * confused with an unrecorded slot, drawn as a dashed rule line).
 */
const V2_CALENDAR: NonNullable<ProfileData["contributionCalendar"]> = [
  { date: "2026-07-31", count: 2 },
  { date: "2026-08-01", count: 0 },
  { date: "2026-08-02", count: 5 },
  { date: "2026-08-03", count: 1 },
  { date: "2026-08-04", count: 8 }, // the clear peak day
  { date: "2026-08-05", count: 0 },
  { date: "2026-08-06", count: 3 },
  { date: "2026-08-07", count: 2 },
  { date: "2026-08-08", count: 4 },
];
const partialProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: V2_CALENDAR,
};

/** V3: 28 days recorded, every count zero — a real flatline ECG (the
 * `c === 0` vertex rule with no branch), distinct from V1's "no recording
 * at all" in that the trace itself is drawn, solid, at BASELINE_Y. */
const V3_FLATLINE_CALENDAR: NonNullable<ProfileData["contributionCalendar"]> = Array.from(
  { length: 28 },
  (_, i) => {
    const day = new Date(Date.UTC(2026, 6, 12 + i)); // 2026-07-12 .. 2026-08-08
    return { date: day.toISOString().slice(0, 10), count: 0 };
  },
);
const flatlineProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: V3_FLATLINE_CALENDAR,
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

describe("06-01 Task 2: V1 — no recording at all (n === 0)", () => {
  it("en/zh-TW: no polyline, dashed line spans the full plot width, no pulse dot", async () => {
    const enOpts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light: enLight, dark: enDark } = renderPair(vitalsWidget, emptyProfileData, enOpts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // V1: no polyline vertices exist at all.
    expect(enLight).not.toContain("<polyline");
    // The dashed no-recording line spans the full plot width: x2 = 32 +
    // 28*DAY_W = 463 (PLOT_X1) exactly, since 431/28*28 === 431.
    expect(enLight).toContain('<line x1="32" y1="116" x2="463.00" y2="116" stroke=');
    expect(enLight).toContain('stroke-dasharray="3 3"');
    // No pulse dot of any kind (neither the animated accent circle nor the
    // static rule-colored one) — n === 0 draws no dot.
    expect(enLight).not.toContain("<circle");
    expect(enLight).not.toContain("<text");
    expect(enDark).not.toContain("<text");

    await expect(enLight).toMatchFileSnapshot("__snapshots__/vitals-en-light-empty.svg");
    await expect(enDark).toMatchFileSnapshot("__snapshots__/vitals-en-dark-empty.svg");

    const zhOpts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light: zhLight, dark: zhDark } = renderPair(vitalsWidget, emptyProfileData, zhOpts, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(zhLight).not.toContain("<polyline");
    expect(zhLight).not.toContain("<circle");
    expect(zhLight).not.toContain("<text");
    expect(zhDark).not.toContain("<text");

    await expect(zhLight).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-light-empty.svg");
    await expect(zhDark).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-dark-empty.svg");
  });
});

describe("06-01 Task 2: V2 — brand-new account, 1 <= n < 28 (Rule C-1's own reason to exist)", () => {
  it("en/zh-TW: the dashed no-recording line ends exactly where the accent polyline begins", async () => {
    // n === 9 -> 19 unrecorded leading slots -> dashEndX = 32 + 19*DAY_W,
    // the SAME x the recorded trace's first vertex starts at.
    const dashEndX = (32 + 19 * (431 / 28)).toFixed(2);

    const enOpts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light: enLight, dark: enDark } = renderPair(vitalsWidget, partialProfileData, enOpts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(enLight).toContain(`x2="${dashEndX}" y2="116" stroke=`);
    expect(enLight).toContain('stroke-dasharray="3 3"');
    const polylineMatch = enLight.match(/<polyline points="([^"]+)"/);
    expect(polylineMatch).not.toBeNull();
    expect(polylineMatch![1]!.startsWith(`${dashEndX},116.00`)).toBe(true);
    // n > 0 and STATUS is FAINT (activeDays 7, in [1,9]) here, not
    // FLATLINE, so the pulse dot animates.
    expect(enLight).toContain('class="atelier-vitals-pulse"');
    expect(enLight).not.toContain("<text");
    expect(enDark).not.toContain("<text");

    await expect(enLight).toMatchFileSnapshot("__snapshots__/vitals-en-light-partial.svg");
    await expect(enDark).toMatchFileSnapshot("__snapshots__/vitals-en-dark-partial.svg");

    const zhOpts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light: zhLight, dark: zhDark } = renderPair(vitalsWidget, partialProfileData, zhOpts, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(zhLight).toContain(`x2="${dashEndX}" y2="116" stroke=`);
    expect(zhLight).not.toContain("<text");
    expect(zhDark).not.toContain("<text");

    await expect(zhLight).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-light-partial.svg");
    await expect(zhDark).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-dark-partial.svg");
  });
});

describe("06-01 Task 2: V3 — 28 days recorded, every count zero (a real flatline, not 'no recording')", () => {
  it("en/zh-TW: a solid accent polyline sits entirely on BASELINE_Y; the pulse dot is static rule-colored with no class", async () => {
    const enOpts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light: enLight, dark: enDark } = renderPair(vitalsWidget, flatlineProfileData, enOpts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // No unrecorded slots at all (n === 28) — Rule C-1's dashed line must
    // be absent, distinguishing this from V1.
    expect(enLight).not.toContain("stroke-dasharray");
    const polylineMatch = enLight.match(/<polyline points="([^"]+)" fill="none" stroke="([^"]+)"/);
    expect(polylineMatch).not.toBeNull();
    const points = polylineMatch![1]!.split(" ").map((p) => p.split(",").map(Number));
    expect(points.length).toBeGreaterThan(0);
    for (const [, y] of points) {
      expect(y).toBe(116);
    }
    // The trace itself is drawn in accent, not rule — a real (if flat)
    // reading, never confused with "we have no data here".
    expect(polylineMatch![2]).toBe(editorialLight.accent);
    // The pulse dot is present but static: rule-colored, no class.
    const circleMatch = enLight.match(/<circle cx="463" cy="116" r="3.5"[^/]*\/>/);
    expect(circleMatch).not.toBeNull();
    expect(circleMatch![0]).toContain(`fill="${editorialLight.rule}"`);
    expect(circleMatch![0]).not.toContain("class=");
    expect(enLight).not.toContain("<text");
    expect(enDark).not.toContain("<text");

    await expect(enLight).toMatchFileSnapshot("__snapshots__/vitals-en-light-flatline.svg");
    await expect(enDark).toMatchFileSnapshot("__snapshots__/vitals-en-dark-flatline.svg");

    const zhOpts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light: zhLight, dark: zhDark } = renderPair(vitalsWidget, flatlineProfileData, zhOpts, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(zhLight).not.toContain("stroke-dasharray");
    expect(zhLight).not.toContain("<text");
    expect(zhDark).not.toContain("<text");

    await expect(zhLight).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-light-flatline.svg");
    await expect(zhDark).toMatchFileSnapshot("__snapshots__/vitals-zh-TW-dark-flatline.svg");
  });
});
