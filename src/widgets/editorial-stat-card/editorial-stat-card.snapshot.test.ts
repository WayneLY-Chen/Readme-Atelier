import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { editorialStatCardWidget } from "./index.js";

// Includes totalCommits >= 10000 to exercise the compact/萬 formatting path
// in the fixed snapshot, not just plain small integers.
const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 12345, totalPRs: 12, totalIssues: 7, totalStars: 482 },
};

const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 02-02 Task 2: fixed-input snapshot (mirrors almanac.snapshot.test.ts)", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts: RenderOptions = { ...FIXED_OPTS_BASE, language: "en" };
    const { light, dark } = renderPair(editorialStatCardWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/editorial-stat-card-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/editorial-stat-card-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts: RenderOptions = { ...FIXED_OPTS_BASE, language: "zh-TW" };
    const { light, dark } = renderPair(editorialStatCardWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/editorial-stat-card-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/editorial-stat-card-zh-TW-dark.svg");
  });
});
