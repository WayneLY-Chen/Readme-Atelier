import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { yijiTableEn, yijiTableZh } from "./copy.js";
import { almanacWidget } from "./index.js";
import { getAlmanacContent } from "./lunar.js";

const stubProfileData: ProfileData = {
  login: "octocat",
  name: null,
  avatarUrl: "",
  followers: 0,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
};

const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "Asia/Taipei",
  language: "zh-TW" as const,
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 03 Task 4: RENDER-09 byte-level determinism", () => {
  it("two independently-constructed Date objects with the same epoch value produce byte-identical renderPair output", () => {
    // Deliberately two distinct object references with the same .getTime()
    // value — not the same variable reused — to prove the comparison that
    // matters is value equality, not object-reference equality.
    const now1 = new Date("2026-08-02T00:00:00Z");
    const now2 = new Date(now1.getTime());
    expect(now1).not.toBe(now2);
    expect(now1.getTime()).toBe(now2.getTime());

    const opts1: RenderOptions = { ...FIXED_OPTS_BASE, now: now1 };
    const opts2: RenderOptions = { ...FIXED_OPTS_BASE, now: now2 };

    const result1 = renderPair(almanacWidget, stubProfileData, opts1, {
      light: editorialLight,
      dark: editorialDark,
    });
    const result2 = renderPair(almanacWidget, stubProfileData, opts2, {
      light: editorialLight,
      dark: editorialDark,
    });

    expect(result1.light).toBe(result2.light);
    expect(result1.dark).toBe(result2.dark);
  });
});

describe("Plan 03 Task 4: QA-02 fixed-input snapshot", () => {
  it("renders a stable light/dark snapshot for a fixed date/seed/timezone/language", async () => {
    const opts: RenderOptions = {
      ...FIXED_OPTS_BASE,
      now: new Date("2026-08-02T00:00:00Z"),
    };

    const { light, dark } = renderPair(almanacWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/almanac-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/almanac-dark.svg");
  });
});

describe("Regression (2026-08-09 production incident): every 建除十二神 content entry renders", () => {
  // The production cron rendered "危" for the first time since launch and hit
  // core/font.ts's PathCorruptionError on yijiTableZh's 忌 phrase — no test
  // had ever exercised that entry (or several others) through the real font
  // pipeline; the snapshot test above only ever fixes `now` to one date, so
  // it always exercises the same single zhiXing. This sweeps enough
  // consecutive days to hit all 12 建除神 values (a fixed one-time repro of
  // the exact broken string lives in core/font.test.ts) so a future addition
  // to either yiji table that introduces a new corrupting character
  // combination fails CI instead of a live cron run.
  it("sweeps 40 consecutive days and renders every yiji-table entry without throwing", () => {
    const seenZhiXing = new Set<string>();
    const startDate = new Date("2026-08-01T00:00:00Z");
    for (let i = 0; i < 40; i++) {
      const now = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      seenZhiXing.add(getAlmanacContent(now, FIXED_OPTS_BASE.timezone).zhiXing);
      for (const language of ["zh-TW", "en"] as const) {
        const opts: RenderOptions = { ...FIXED_OPTS_BASE, now, language };
        expect(() =>
          renderPair(almanacWidget, stubProfileData, opts, {
            light: editorialLight,
            dark: editorialDark,
          }),
        ).not.toThrow();
      }
    }
    // Guards the sweep itself: if the date range ever stops covering all 12
    // keys, this fails loudly instead of silently skipping the untested ones.
    expect([...seenZhiXing].sort()).toEqual(Object.keys(yijiTableZh).sort());
    expect(Object.keys(yijiTableZh).sort()).toEqual(Object.keys(yijiTableEn).sort());
  });
});
