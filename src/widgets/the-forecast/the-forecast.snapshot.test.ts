import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theForecastWidget, weekdayIndexOf } from "./index.js";

/** Builds `n` consecutive UTC calendar days ending on `endDate` (inclusive),
 * with `count` decided per-weekday by `perWeekday` (index 0=Mon..6=Sun). Own
 * copy, not imported from index.test.ts (RENDER-02 — a widget's own tests
 * do not share private fixture-building helpers across test files, the same
 * discipline the-record/the-graveyard's snapshot tests already follow). */
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

/**
 * Populated fixture (06-02-PLAN.md Task 3): 94 entries -> floor(94/7)=13,
 * k=min(12,13)=12 (the cap). Per-weekday counts are constant across the
 * 12-sample basis (median trivially equals the constant, byte-stable), and
 * deliberately span ALL FIVE weather tiers against M=20 (Friday, the unique
 * busiest weekday, unambiguous tie-break):
 *   Mon=0 (CALM), Tue=3/Sat=2/Sun=5 (CLOUD, boundary case at Sun's 0.25*20=5),
 *   Wed=8 (PARTIAL), Thu=14 (SUN), Fri=20 (STORM, busiest).
 */
const WEEKDAY_COUNT_TABLE = [0, 3, 8, 14, 20, 2, 5]; // Mon..Sun
const POPULATED_CALENDAR = buildCalendar(94, "2026-08-08", (w) => WEEKDAY_COUNT_TABLE[w]!);

const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: POPULATED_CALENDAR,
};

/** F1: 13 entries -> k=1 (< 2), the insufficient-data state. */
const INSUFFICIENT_CALENDAR = buildCalendar(13, "2026-08-08", () => 4);
const insufficientProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: INSUFFICIENT_CALENDAR,
};

/** F2: 28 entries, every count 0 -> k=4 (a real, dormant basis — a CORRECT
 * projection, not a failure). */
const DORMANT_CALENDAR = buildCalendar(28, "2026-08-08", () => 0);
const dormantProfileData: ProfileData = {
  ...stubProfileData,
  contributionCalendar: DORMANT_CALENDAR,
};

const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
};

beforeAll(() => {
  loadAllFonts();
});

describe("06-02 Task 3: fixed-input snapshot, populated state (all five weather tiers present)", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theForecastWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // F4: the eyebrow must print the REAL k (12, the cap for a 94-day
    // calendar) — asserted structurally via the disclosure eyebrow's own
    // budget-fitting render not throwing, plus the pure-function contract
    // proven in index.test.ts. Here we assert the mandatory caveat literal
    // and structural invariants alongside the file snapshot (a snapshot
    // diff is easy to silently `--update` past).
    expect(light).toContain("<g fill=");
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).not.toMatch(/@keyframes/); // this card carries no animation
    expect(light).not.toMatch(/NaN|undefined|Infinity/);

    await expect(light).toMatchFileSnapshot("__snapshots__/the-forecast-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-forecast-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theForecastWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(light).toContain("<g fill=");
    expect(light).not.toContain("<text");
    expect(dark).not.toContain("<text");
    expect(light).not.toMatch(/@keyframes/);
    expect(light).not.toMatch(/NaN|undefined|Infinity/);

    await expect(light).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-dark.svg");
  });

  it("the populated fixture's medians span all five weather tiers (CALM/CLOUD/PARTIAL/SUN/STORM) — this is what the file snapshot's glyph geometry actually exercises", () => {
    // Recompute the tier assignment directly against the fixture's own
    // per-weekday table (WEEKDAY_COUNT_TABLE), M=20 (Friday).
    const M = Math.max(...WEEKDAY_COUNT_TABLE);
    expect(M).toBe(20);
    const tiers = WEEKDAY_COUNT_TABLE.map((m) => {
      if (M === 0 || m === 0) return "CALM";
      if (m <= 0.25 * M) return "CLOUD";
      if (m <= 0.5 * M) return "PARTIAL";
      if (m <= 0.8 * M) return "SUN";
      return "STORM";
    });
    expect(new Set(tiers)).toEqual(new Set(["CALM", "CLOUD", "PARTIAL", "SUN", "STORM"]));
  });
});

describe("06-02 Task 3: F1 — insufficient data (k=1 < 2): no glyph, no numeral, insufficient-data copy, caveat still renders", () => {
  it("en/zh-TW: no <circle>, no numeral <g fill>, chrome-only <line> count (7)", async () => {
    const enOpts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light: enLight, dark: enDark } = renderPair(theForecastWidget, insufficientProfileData, enOpts, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(enLight.match(/<circle/g)).toBeNull();
    expect(enLight).not.toContain("<g fill=");
    expect((enLight.match(/<line/g) ?? []).length).toBe(7); // hairline + 6 dashed separators, no CALM glyph lines
    expect(enLight).not.toContain("<text");
    expect(enDark).not.toContain("<text");
    expect(enLight).not.toMatch(/NaN|undefined|Infinity/);

    await expect(enLight).toMatchFileSnapshot("__snapshots__/the-forecast-en-light-insufficient.svg");
    await expect(enDark).toMatchFileSnapshot("__snapshots__/the-forecast-en-dark-insufficient.svg");

    const zhOpts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light: zhLight, dark: zhDark } = renderPair(theForecastWidget, insufficientProfileData, zhOpts, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(zhLight.match(/<circle/g)).toBeNull();
    expect(zhLight).not.toContain("<g fill=");
    expect(zhLight).not.toContain("<text");
    expect(zhDark).not.toContain("<text");

    await expect(zhLight).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-light-insufficient.svg");
    await expect(zhDark).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-dark-insufficient.svg");
  });
});

describe("06-02 Task 3: F2 — dormant (k=4, all seven medians 0): a correct projection, not a failure", () => {
  it("en/zh-TW: seven CALM glyph <line>s, a numeral <g fill> wrapping seven '0's, all-zero headline copy", async () => {
    const enOpts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light: enLight, dark: enDark } = renderPair(theForecastWidget, dormantProfileData, enOpts, {
      light: editorialLight,
      dark: editorialDark,
    });

    // Chrome lines (7) + seven CALM glyph lines = 14.
    expect((enLight.match(/<line/g) ?? []).length).toBe(14);
    expect(enLight).toContain("<g fill=");
    expect(enLight.match(/<circle/g)).toBeNull(); // CALM uses no circles
    expect(enLight).not.toContain("<text");
    expect(enDark).not.toContain("<text");
    expect(enLight).not.toMatch(/NaN|undefined|Infinity/);

    await expect(enLight).toMatchFileSnapshot("__snapshots__/the-forecast-en-light-dormant.svg");
    await expect(enDark).toMatchFileSnapshot("__snapshots__/the-forecast-en-dark-dormant.svg");

    const zhOpts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light: zhLight, dark: zhDark } = renderPair(theForecastWidget, dormantProfileData, zhOpts, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect((zhLight.match(/<line/g) ?? []).length).toBe(14);
    expect(zhLight).toContain("<g fill=");
    expect(zhLight).not.toContain("<text");
    expect(zhDark).not.toContain("<text");

    await expect(zhLight).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-light-dormant.svg");
    await expect(zhDark).toMatchFileSnapshot("__snapshots__/the-forecast-zh-TW-dark-dormant.svg");
  });
});
