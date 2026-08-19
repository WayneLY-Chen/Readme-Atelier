import type { ProfileData } from "../core/model.js";

/**
 * D-02's synthetic demo-account fixture: hand-authored, deterministic,
 * never `Date.now()`/`Math.random()` — the fixture discipline this file
 * follows is the same one `scripts/build-uat-preview.ts` established
 * (PINNED_NOW/PINNED_SEED, explicit whole-week silence rather than
 * scattered zero days, since the groove encoding buckets by week not day).
 *
 * Task 2 (this commit) ships the MINIMAL version — just enough to render
 * the default `almanac`-only config end to end through the real browser
 * bundle. Task 3 expands this into the full, flattering five-card demo
 * account (tombstones, busiest week, silent weeks) plus a secondary
 * `NEW_ACCOUNT_PROFILE` for UX-06's graceful-degradation preview.
 */
export const PINNED_NOW = new Date("2026-08-07T12:00:00Z");
export const PINNED_SEED = 42;

export const DEMO_PROFILE: ProfileData = {
  login: "atelier-demo",
  name: "Atelier Demo",
  avatarUrl: "",
  followers: 128,
  fetchedAt: PINNED_NOW.toISOString(),
  stats: { totalCommits: 1204, totalPRs: 58, totalIssues: 21, totalStars: 96 },
};
