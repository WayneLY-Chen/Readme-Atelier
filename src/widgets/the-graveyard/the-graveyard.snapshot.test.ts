import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { renderPair } from "../../core/svg.js";
import { editorialDark, editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { theGraveyardWidget } from "./index.js";

// Fixed inputs (mirrors editorial-stat-card.snapshot.test.ts's/
// masthead.snapshot.test.ts's own convention): 5 repositories spanning a mix
// of createdAt/pushedAt/isFork combinations, including a `pushedAt: null`
// case (RESEARCH.md Pitfall 2) — all well past the 180-day burial threshold
// relative to the fixed `now` below.
const REPOSITORIES: NonNullable<ProfileData["repositories"]> = [
  {
    name: "quick-todo-thing",
    nameWithOwner: "octocat/quick-todo-thing",
    url: "https://github.com/octocat/quick-todo-thing",
    createdAt: "2025-11-02T00:00:00Z",
    pushedAt: "2025-11-06T00:00:00Z",
    isFork: false,
  },
  {
    name: "old-experiment",
    nameWithOwner: "octocat/old-experiment",
    url: "https://github.com/octocat/old-experiment",
    createdAt: "2018-03-01T00:00:00Z",
    pushedAt: "2024-01-15T00:00:00Z",
    isFork: false,
  },
  {
    name: "never-pushed-repo",
    nameWithOwner: "octocat/never-pushed-repo",
    url: "https://github.com/octocat/never-pushed-repo",
    createdAt: "2024-06-01T00:00:00Z",
    pushedAt: null,
    isFork: false,
  },
  {
    name: "forked-abandoned",
    nameWithOwner: "octocat/forked-abandoned",
    url: "https://github.com/octocat/forked-abandoned",
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2023-05-20T00:00:00Z",
    isFork: true,
  },
  {
    name: "half-finished-cli",
    nameWithOwner: "octocat/half-finished-cli",
    url: "https://github.com/octocat/half-finished-cli",
    createdAt: "2021-09-10T00:00:00Z",
    pushedAt: "2022-12-01T00:00:00Z",
    isFork: false,
  },
];

const stubProfileData: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 12345, totalPRs: 12, totalIssues: 7, totalStars: 482 },
  repositories: REPOSITORIES,
};

const emptyProfileData: ProfileData = {
  ...stubProfileData,
  repositories: [],
};

const FIXED_OPTS_BASE = {
  seed: 42,
  timezone: "UTC",
  now: new Date("2026-08-08T00:00:00Z"),
  include_forks: true,
};

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 03-04 Task 2: fixed-input snapshot, populated state", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theGraveyardWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-graveyard-en-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-graveyard-en-dark.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theGraveyardWidget, stubProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-graveyard-zh-TW-light.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-graveyard-zh-TW-dark.svg");
  });
});

describe("Plan 03-04 Task 2: fixed-input snapshot, empty state (UX-06)", () => {
  it("renders a stable en light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "en" } as RenderOptions;
    const { light, dark } = renderPair(theGraveyardWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-graveyard-en-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-graveyard-en-dark-empty.svg");
  });

  it("renders a stable zh-TW light/dark snapshot", async () => {
    const opts = { ...FIXED_OPTS_BASE, language: "zh-TW" } as RenderOptions;
    const { light, dark } = renderPair(theGraveyardWidget, emptyProfileData, opts, {
      light: editorialLight,
      dark: editorialDark,
    });

    await expect(light).toMatchFileSnapshot("__snapshots__/the-graveyard-zh-TW-light-empty.svg");
    await expect(dark).toMatchFileSnapshot("__snapshots__/the-graveyard-zh-TW-dark-empty.svg");
  });
});
