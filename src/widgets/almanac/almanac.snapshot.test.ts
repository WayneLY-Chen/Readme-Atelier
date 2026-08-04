import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { almanacWidget } from "./index.js";

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
