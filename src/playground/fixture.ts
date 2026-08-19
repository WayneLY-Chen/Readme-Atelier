import type { ProfileData } from "../core/model.js";

/**
 * D-02's synthetic demo-account fixture: hand-authored, deterministic, tuned
 * so all five widgets show a flattering, representative state — never the
 * author's real snapshot. Follows the exact fixture discipline
 * `scripts/build-uat-preview.ts` established for Phase 4's UAT preview:
 * `PINNED_NOW`/`PINNED_SEED` are fixed literals — this file never reads the
 * live wall clock and never calls any pseudo-random number generator — and
 * "silent" calendar weeks are
 * expressed as whole Sunday-started weeks — the groove/callout encoding
 * buckets by WEEK, so a scattered zero day inside an otherwise-active week
 * would be invisible and would NOT produce a silent week.
 *
 * Two exports:
 *   - `DEMO_PROFILE` — the primary, deliberately generous demo account: all
 *     five widgets' `requires` capabilities are populated with non-trivial
 *     data (stats, identity via `login`, a calendar with a busiest week and
 *     two fully-silent elapsed weeks, and a repository list with several
 *     buried entries of varying lifespans for The Graveyard).
 *   - `NEW_ACCOUNT_PROFILE` — a secondary, near-zero fixture demonstrating
 *     UX-06's graceful degradation (an almost-empty account: one brand-new
 *     repository, no buried repos, a near-flat calendar).
 */
export const PINNED_NOW = new Date("2026-08-07T12:00:00Z");
export const PINNED_SEED = 42;

const MS_PER_DAY = 86_400_000;

/**
 * Sunday-started weeks that must render as PRESSED-BUT-SILENT — an elapsed
 * week whose every day is zero. Mirrors `scripts/build-uat-preview.ts`'s own
 * `SILENT_WEEK_STARTS` reasoning exactly: one mid-year week surrounded by
 * active grooves, one directly adjacent to the future band (the harder
 * legibility case), both deliberately not the very last elapsed week.
 */
const SILENT_WEEK_STARTS = ["2026-04-05", "2026-07-26"] as const;

function silentDayDates(): Set<string> {
  const dates = new Set<string>();
  for (const start of SILENT_WEEK_STARTS) {
    const startMs = Date.parse(`${start}T00:00:00Z`);
    for (let d = 0; d < 7; d++) {
      dates.add(new Date(startMs + d * MS_PER_DAY).toISOString().slice(0, 10));
    }
  }
  return dates;
}

/**
 * A partial-year daily contribution calendar (2026-01-01 .. PINNED_NOW) with
 * a deliberate seven-day busiest week (days 60-66, count = 30) and the two
 * fully-silent elapsed weeks above — so The Record's groove ink and its
 * BUSIEST WEEK / SILENT WEEKS callouts carry real signal, not an all-zero or
 * all-uniform fixture.
 */
function syntheticCalendarDays(): { date: string; count: number }[] {
  const days: { date: string; count: number }[] = [];
  const silent = silentDayDates();
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 7, 7); // matches PINNED_NOW's calendar date
  let i = 0;
  for (let ms = start; ms <= end; ms += MS_PER_DAY, i++) {
    const date = new Date(ms).toISOString().slice(0, 10);
    let count: number;
    if (silent.has(date)) {
      count = 0;
    } else if (i >= 60 && i < 67) {
      count = 30; // the deliberate busiest week
    } else {
      count = (i % 5) + 1;
    }
    days.push({ date, count });
  }
  return days;
}

const DEMO_CALENDAR = syntheticCalendarDays();

/**
 * The Graveyard's fixture repositories — four buried entries of visibly
 * different lifespans (short weekend project, a ~3-week experiment, a
 * ~253-day mid-length attempt, a ~653-day long-runner) plus two active
 * repositories that stay well inside the 180-day burial threshold
 * (`the-graveyard/index.ts`'s `BURY_THRESHOLD_DAYS`) as of `PINNED_NOW`, so
 * the card also demonstrates it does NOT bury everything indiscriminately.
 * `pushedAt` (not `createdAt`) is what the widget measures burial from
 * (`pushedAt ?? createdAt`) — every buried entry below is well past 180
 * days stale relative to 2026-08-07.
 */
const DEMO_REPOSITORIES: ProfileData["repositories"] = [
  {
    name: "prototype-parser",
    nameWithOwner: "atelier-demo/prototype-parser",
    url: "https://github.com/atelier-demo/prototype-parser",
    createdAt: "2018-02-10T00:00:00Z",
    pushedAt: "2018-05-20T00:00:00Z", // ~99-day lifespan
    isFork: false,
  },
  {
    name: "weekend-cli",
    nameWithOwner: "atelier-demo/weekend-cli",
    url: "https://github.com/atelier-demo/weekend-cli",
    createdAt: "2022-11-01T00:00:00Z",
    pushedAt: "2022-11-14T00:00:00Z", // ~13-day lifespan — the shortest-lived callout
    isFork: false,
  },
  {
    name: "legacy-api-wrapper",
    nameWithOwner: "atelier-demo/legacy-api-wrapper",
    url: "https://github.com/atelier-demo/legacy-api-wrapper",
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2020-09-10T00:00:00Z", // ~253-day lifespan
    isFork: false,
  },
  {
    name: "old-dashboard",
    nameWithOwner: "atelier-demo/old-dashboard",
    url: "https://github.com/atelier-demo/old-dashboard",
    createdAt: "2019-06-01T00:00:00Z",
    pushedAt: "2021-03-15T00:00:00Z", // ~653-day lifespan — the longest-lived-then-abandoned
    isFork: false,
  },
  {
    name: "readme-atelier-demo",
    nameWithOwner: "atelier-demo/readme-atelier-demo",
    url: "https://github.com/atelier-demo/readme-atelier-demo",
    createdAt: "2025-06-01T00:00:00Z",
    pushedAt: PINNED_NOW.toISOString(), // active — well inside the 180-day threshold
    isFork: false,
  },
  {
    name: "notes",
    nameWithOwner: "atelier-demo/notes",
    url: "https://github.com/atelier-demo/notes",
    createdAt: "2025-09-01T00:00:00Z",
    pushedAt: "2026-06-01T00:00:00Z", // active — ~67 days before PINNED_NOW, still inside threshold
    isFork: false,
  },
];

/**
 * The primary demo account (D-02): non-trivial stats, a populated
 * Graveyard, and a calendar with real busiest/silent signal — tuned to be
 * flattering and representative across every one of the five built-in
 * widgets at once.
 */
export const DEMO_PROFILE: ProfileData = {
  login: "atelier-demo",
  name: "Atelier Demo",
  avatarUrl: "",
  followers: 214,
  fetchedAt: PINNED_NOW.toISOString(),
  stats: { totalCommits: 1847, totalPRs: 96, totalIssues: 34, totalStars: 312 },
  contributionCalendar: DEMO_CALENDAR,
  contributionCalendarTotal: DEMO_CALENDAR.reduce((sum, d) => sum + d.count, 0),
  repositories: DEMO_REPOSITORIES,
};

/**
 * UX-06's graceful-degradation demo (D-02's secondary fixture): an
 * almost-empty account — one brand-new repository (so The Graveyard renders
 * its populated-but-empty-of-tombstones state, not a broken empty array), a
 * near-flat calendar with no busiest week and no silent weeks (there is
 * nothing yet to go silent from), and near-zero stats. Still fully
 * deterministic — the same rule as `DEMO_PROFILE` above applies here too.
 */
const NEW_ACCOUNT_CALENDAR: { date: string; count: number }[] = Array.from({ length: 5 }, (_, i) => {
  const ms = Date.UTC(2026, 7, 3) + i * MS_PER_DAY; // 2026-08-03 .. 2026-08-07 (PINNED_NOW's date)
  return { date: new Date(ms).toISOString().slice(0, 10), count: i === 2 ? 2 : 1 };
});

export const NEW_ACCOUNT_PROFILE: ProfileData = {
  login: "fresh-account",
  name: "New Contributor",
  avatarUrl: "",
  followers: 0,
  fetchedAt: PINNED_NOW.toISOString(),
  stats: { totalCommits: 6, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: NEW_ACCOUNT_CALENDAR,
  contributionCalendarTotal: NEW_ACCOUNT_CALENDAR.reduce((sum, d) => sum + d.count, 0),
  repositories: [
    {
      name: "first-repo",
      nameWithOwner: "fresh-account/first-repo",
      url: "https://github.com/fresh-account/first-repo",
      createdAt: "2026-08-01T00:00:00Z",
      pushedAt: PINNED_NOW.toISOString(), // 6 days old — nowhere near the 180-day burial threshold
      isFork: false,
    },
  ],
};
