import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { mastheadWidget, type MastheadOptions } from "./index.js";

// Fixed inputs (mirrors editorial-stat-card.snapshot.test.ts's own
// convention): a real login, a citedFacts figure present, and a populated
// contents list, so the snapshot exercises every rendered row.
const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 12345, totalPRs: 12, totalIssues: 7, totalStars: 482 },
};

// GitHub's own 39-character username policy maximum (UI-SPEC "API-Sourced
// Text: Truncation Policy") — the case Task 2's truncation mechanism exists
// for, paired with zh-TW mode's longer literal suffix (the tightest budget
// combination this card renders).
const LONG_LOGIN_PROFILE_DATA: ProfileData = {
  ...stubProfileData,
  login: "a".repeat(39),
};

const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
};

const FIXED_CONTENTS: MastheadOptions["contents"] = [
  { id: "almanac", title: "Almanac card", pageNumber: 1 },
  { id: "editorial-stat-card", title: "Editorial Stat Card", pageNumber: 2 },
];

const FIXED_CITED_FACTS: MastheadOptions["citedFacts"] = {
  totalCommits: { label: "COMMITS", value: "3,481" },
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 03-01 Task 2: fixed-input snapshot (mirrors editorial-stat-card.snapshot.test.ts)", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts: MastheadOptions = {
      ...FIXED_OPTS_BASE,
      language: "en",
      contents: FIXED_CONTENTS,
      citedFacts: FIXED_CITED_FACTS,
    };
    const { light, dark } = renderPair(mastheadWidget, stubProfileData, opts as RenderOptions, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/masthead-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/masthead-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts: MastheadOptions = {
      ...FIXED_OPTS_BASE,
      language: "zh-TW",
      contents: FIXED_CONTENTS,
      citedFacts: FIXED_CITED_FACTS,
    };
    const { light, dark } = renderPair(mastheadWidget, stubProfileData, opts as RenderOptions, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/masthead-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/masthead-zh-TW-dark.svg");
  });
});

describe("Plan 03-01 Task 2: 39-character login (GitHub's username length policy maximum)", () => {
  it("en mode: does not throw and renders no <text>", () => {
    const opts: MastheadOptions = { ...FIXED_OPTS_BASE, language: "en" };
    expect(() =>
      renderPair(mastheadWidget, LONG_LOGIN_PROFILE_DATA, opts as RenderOptions, {
        light: editorialLight,
        dark: editorialDark,
      }),
    ).not.toThrow();
    const { light } = renderPair(mastheadWidget, LONG_LOGIN_PROFILE_DATA, opts as RenderOptions, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).toContain("<path");
    expect(light).not.toContain("<text");
  });

  it("zh-TW mode (longer literal suffix — the tightest budget combination): does not throw and renders no <text>", () => {
    const opts: MastheadOptions = { ...FIXED_OPTS_BASE, language: "zh-TW" };
    expect(() =>
      renderPair(mastheadWidget, LONG_LOGIN_PROFILE_DATA, opts as RenderOptions, {
        light: editorialLight,
        dark: editorialDark,
      }),
    ).not.toThrow();
    const { light } = renderPair(mastheadWidget, LONG_LOGIN_PROFILE_DATA, opts as RenderOptions, {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).toContain("<path");
    expect(light).not.toContain("<text");
  });
});
