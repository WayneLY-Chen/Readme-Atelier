import { graphql } from "@octokit/graphql";
import type { DataCapability, ProfileData } from "./model.js";

/**
 * Mirrors `publish.ts`'s `ExecFn` pattern: the one real I/O primitive
 * (`fetch`) is swapped for a fake in tests via `@octokit/graphql`'s own
 * `request: { fetch }` injection point (RESEARCH.md Pattern 1). Production
 * callers omit this and get the real global `fetch` — a Web-standard global
 * that needs no import statement, keeping this file's zero-`fs`/`path`/
 * `process`/`@actions/core` boundary intact.
 */
export type FetchImpl = typeof fetch;

/**
 * `includeForks === false` (default) fragment: reads the per-repository
 * contribution breakdown (capped at 100 repos, no pagination — RESEARCH.md
 * Common Pitfall 3) so fork-authored contributions can be filtered
 * client-side in `fetchProfileData`, plus a fork-excluded `repositories()`
 * fan-out for the stars sum (`contributionsCollection` has no stars field
 * at all — RESEARCH.md Pitfall 3). `restrictedContributionsCount` is
 * requested here but is read-and-discarded downstream (DATA-05) — never
 * written into `ProfileData`.
 */
const STATS_FRAGMENT_EXCLUDE_FORKS = `
      contributionsCollection {
        restrictedContributionsCount
        commitContributionsByRepository(maxRepositories: 100) {
          contributions { totalCount }
          repository { isFork }
        }
        issueContributionsByRepository(maxRepositories: 100) {
          contributions { totalCount }
          repository { isFork }
        }
        pullRequestContributionsByRepository(maxRepositories: 100) {
          contributions { totalCount }
          repository { isFork }
        }
      }
      statsRepos: repositories(first: 100, isFork: false, ownerAffiliations: [OWNER], privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) {
        nodes { stargazerCount }
      }`;

/**
 * `includeForks === true` (opt-in) fragment: the cheap path — plain
 * `contributionsCollection` scalars, no per-repository fan-out for
 * commits/issues/PRs, and an unfiltered `repositories()` fan-out (no
 * `isFork: false` argument) for the stars sum.
 */
const STATS_FRAGMENT_INCLUDE_FORKS = `
      contributionsCollection {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        restrictedContributionsCount
      }
      statsRepos: repositories(first: 100, ownerAffiliations: [OWNER], privacy: PUBLIC, orderBy: { field: STARGAZERS, direction: DESC }) {
        nodes { stargazerCount }
      }`;

/**
 * The Graveyard's repo-list fragment (CARD-03). Aliased to `graveyardRepos`
 * so it can coexist in one composed query alongside `stats`'s own aliased
 * `repositories(...)` call above (see `STATS_FRAGMENT_*`) — the same
 * underlying `user.repositories` field with genuinely incompatible connection
 * arguments (no `isFork` filter here; `PUSHED_AT` ascending order to
 * surface the most historically-stale repos first even past the 100-row
 * cap). No `isFork` filter is a deliberate choice, not an oversight — D-03
 * includes forks by default, and that's a render-time client-side filter
 * over this uniformly-fetched list, not a server-side query concern
 * (RESEARCH.md's Anti-Pattern section). `privacy: PUBLIC` is a static
 * literal, matching DATA-05's private-data boundary — this capability must
 * never surface a private repository.
 */
const REPO_LIST_FRAGMENT = `
      graveyardRepos: repositories(first: 100, ownerAffiliations: [OWNER], privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: ASC }) {
        nodes { name nameWithOwner url createdAt pushedAt isFork }
      }`;

/**
 * The Record's contribution-calendar fragment (CARD-04). The `STATS_FRAGMENT_*`
 * constants above already select a BARE `contributionsCollection` (no
 * arguments) — GraphQL forbids the same response name with different
 * arguments in one selection set, so this must be aliased, exactly like the
 * Phase 3 `statsRepos:`/`graveyardRepos:` precedent (`REPO_LIST_FRAGMENT`
 * above). `from: $from` is declared as an operation variable (see
 * `buildQuery`'s conditional header) rather than a literal, so this fragment
 * text never itself carries a date value.
 */
const CALENDAR_FRAGMENT = `
      calendar: contributionsCollection(from: $from) {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays { date contributionCount }
          }
        }
      }`;

/**
 * Compose the GraphQL query text needed to satisfy the union of every
 * enabled widget's declared capabilities. Returns null for the zero-
 * capability case (DATA-03: Almanac needs no fetch at all).
 *
 * Always queries `user(login: $login)`, never `viewer` — `GITHUB_TOKEN`
 * authenticates as `github-actions[bot]` inside a real Actions run, not the
 * repo owner (RESEARCH.md Common Pitfall 2 / threat T-02-03). `login` is
 * declared ONLY as the GraphQL variable `$login`; this function never
 * accepts or interpolates an actual login string, so it has no way to
 * string-inject one even if handed a malicious value (threat T-02-02) — the
 * real value is supplied by the caller (`fetchProfileData`) via
 * `@octokit/graphql`'s variables mechanism, never text concatenation.
 *
 * `$from: DateTime!` is interpolated into the SAME operation-header template
 * literal ONLY when the "calendar" capability is present (GraphQL's
 * All-Variables-Used rule: an unconditional `$from` would break every
 * non-calendar query, since a declared variable that's never referenced is
 * itself an error). It is never appended after the header — the header is
 * built as one string, in one place.
 */
export function buildQuery(capabilities: Set<DataCapability>, includeForks: boolean): string | null {
  if (capabilities.size === 0) {
    return null;
  }

  const fragments: string[] = [];
  if (capabilities.has("stats")) {
    fragments.push(includeForks ? STATS_FRAGMENT_INCLUDE_FORKS : STATS_FRAGMENT_EXCLUDE_FORKS);
  }
  if (capabilities.has("repoList")) {
    fragments.push(REPO_LIST_FRAGMENT);
  }
  if (capabilities.has("calendar")) {
    fragments.push(CALENDAR_FRAGMENT);
  }

  const calendarVariable = capabilities.has("calendar") ? ", $from: DateTime!" : "";

  return `query ProfileStats($login: String!${calendarVariable}) {
    user(login: $login) {
      login
      name
      avatarUrl
      followers { totalCount }
${fragments.join("\n")}
    }
    rateLimit { cost limit remaining }
  }`;
}

/**
 * D-01's window start: midnight UTC of 1 January of `now`'s calendar year AS
 * OBSERVED IN `timeZone` — never a rolling 365-day window, never the
 * previous complete year (RESEARCH.md Pattern 3). Reads the zoned year with
 * the same `Intl.DateTimeFormat` + `formatToParts` technique
 * `src/widgets/almanac/lunar.ts` uses (read there for the shape only; this
 * is core's own copy, never imported from a widget — RENDER-02).
 *
 * `Math.min` clamps the real boundary case where `now` falls early on 1
 * January in a timezone ahead of UTC (so that zoned year's own UTC-midnight
 * 1 January instant would be AFTER `now`) — the window start can never be
 * later than `now`.
 *
 * Deliberately UTC midnight of the zoned year, not an offset-adjusted local
 * midnight: the API's day-bucketing timezone semantics for
 * `contributionCount` are not authoritatively documented (RESEARCH
 * Assumption A3), grooves aggregate seven days at a time, so a one-day
 * boundary shift is visually negligible — this must not be "optimized" into
 * a multi-year fetch later (RESEARCH Assumption A2).
 */
export function calendarWindowFrom(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" });
  const year = Number(formatter.formatToParts(now).find((part) => part.type === "year")?.value);
  return new Date(Math.min(Date.UTC(year, 0, 1), now.getTime())).toISOString();
}

/**
 * Thrown when `fetchProfileData` is asked for the "calendar" capability but
 * no `calendarFrom` window was supplied. A query that declares
 * `$from: DateTime!` in its header must never be sent without a value for
 * it — this must fail loudly rather than silently omit the variable and let
 * the GraphQL server reject the whole request with a less actionable error.
 */
export class CalendarWindowMissingError extends Error {
  constructor() {
    super(
      'CalendarWindowMissingError: the "calendar" capability was requested but no calendarFrom ' +
        "window was supplied — a query declaring $from: DateTime! must never be sent without a value.",
    );
    this.name = "CalendarWindowMissingError";
  }
}

/**
 * The zero-capability placeholder ProfileData, extracted as its own
 * synchronous function (Plan 04, Rule 3 — blocking) so `core/pipeline.ts`
 * (which must stay synchronous — `renderAllCards()` returns an array, not a
 * Promise) can obtain it without awaiting `fetchProfileData`, which is
 * declared `async` and therefore always returns a Promise regardless of
 * whether its zero-capability branch actually awaits anything.
 */
export function zeroCapabilityProfileData(): ProfileData {
  return {
    login: "",
    name: null,
    avatarUrl: "",
    followers: 0,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  };
}

/**
 * Shape of the `user`/`rateLimit` selection set `buildQuery` produces.
 * `commitContributionsByRepository`/`issueContributionsByRepository`/
 * `pullRequestContributionsByRepository` are declared optional because the
 * `includeForks: true` query shape never requests them at all — only the
 * `includeForks: false` shape does.
 */
interface StatsRepoContribution {
  contributions: { totalCount: number };
  repository: { isFork: boolean };
}

interface StatsQueryResult {
  user: {
    login: string;
    name: string | null;
    avatarUrl: string;
    followers: { totalCount: number };
    /**
     * Optional (Phase 3, "identity" capability fix — Rule 1/3 deviation
     * recorded in SUMMARY.md): `buildQuery` only ever emits this selection
     * when `capabilities.has("stats")`. Before this phase, every real widget
     * that pushed `capabilities.size` above 0 also required "stats", so this
     * field was in practice always present whenever the zero-capability
     * fast path was skipped. The masthead's `requires: ["identity"]` is the
     * first widget to break that coincidence — a masthead-only render still
     * has `capabilities.size > 0` (skipping the zero-fetch path) but never
     * requests this fragment, so it is genuinely absent in the real response.
     */
    contributionsCollection?: {
      /** Only present in the includeForks: true (cheap-path) query shape. */
      totalCommitContributions?: number;
      totalIssueContributions?: number;
      totalPullRequestContributions?: number;
      /** Read but never surfaced in ProfileData — DATA-05. */
      restrictedContributionsCount: number;
      /** Only present in the includeForks: false (default) query shape. */
      commitContributionsByRepository?: StatsRepoContribution[];
      issueContributionsByRepository?: StatsRepoContribution[];
      pullRequestContributionsByRepository?: StatsRepoContribution[];
    };
    /**
     * Same "stats"-gated optionality as contributionsCollection above.
     * Renamed from bare `repositories` (Phase 3, CARD-03) so this field can
     * coexist with `graveyardRepos` below in one composed query — see
     * `STATS_FRAGMENT_*`'s `statsRepos:` alias.
     */
    statsRepos?: { nodes: { stargazerCount: number }[] };
    /** Only present when "repoList" is a requested capability (CARD-03). */
    graveyardRepos?: {
      nodes: { name: string; nameWithOwner: string; url: string; createdAt: string; pushedAt: string | null; isFork: boolean }[];
    };
    /** Only present when "calendar" is a requested capability (CARD-04). */
    calendar?: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { firstDay: string; contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
  rateLimit: { cost: number; limit: number; remaining: number };
}

/** Sums `contributions.totalCount` over non-fork entries only. */
function sumExcludingForks(entries: StatsRepoContribution[] | undefined): number {
  return (entries ?? []).filter((entry) => !entry.repository.isFork).reduce((sum, entry) => sum + entry.contributions.totalCount, 0);
}

/**
 * Fetch profile data sufficient to satisfy `capabilities`. When the set is
 * empty this returns a placeholder ProfileData immediately, without
 * constructing or issuing any HTTP request — this is the concrete DATA-03
 * boundary: the zero-capability path never touches the network. `buildQuery`
 * is not even called in that branch.
 *
 * Any error the underlying `graphql()` call throws (a genuine network
 * failure, or the 200-status-with-`errors[]` shape GitHub uses for primary
 * rate-limit exhaustion — RESEARCH.md Common Pitfall 1) is left to propagate
 * unmodified. This function does not inspect `error.errors[].type` or branch
 * on any rate-limit-specific condition (RESEARCH.md Assumptions Log A2:
 * GitHub does not publish a stable `type` string for this) — "the promise
 * rejected" IS the DATA-07 failure signal, full stop.
 */
export async function fetchProfileData(
  capabilities: Set<DataCapability>,
  token: string,
  login: string,
  includeForks: boolean,
  calendarFrom: string | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<{ data: ProfileData; pointCost: number }> {
  if (capabilities.size === 0) {
    return { data: zeroCapabilityProfileData(), pointCost: 0 };
  }

  // A query declaring $from: DateTime! must never be sent without a value
  // for it (see CalendarWindowMissingError's own doc comment) — fail loudly
  // here, before the request is ever built.
  if (capabilities.has("calendar") && calendarFrom === undefined) {
    throw new CalendarWindowMissingError();
  }

  const query = buildQuery(capabilities, includeForks) as string;
  const result = await graphql<StatsQueryResult>(query, {
    login,
    // Spread in only when defined, matching the header's own conditional
    // declaration — never concatenated into query text (threat T-04-01).
    ...(calendarFrom !== undefined ? { from: calendarFrom } : {}),
    headers: { authorization: `token ${token}` },
    request: { fetch: fetchImpl },
  });

  const { user, rateLimit } = result;
  const cc = user.contributionsCollection;

  // cc/user.repositories are only present when "stats" was actually a
  // requested capability (see StatsQueryResult's doc comment) — a
  // "identity"-only request (e.g. masthead alone) legitimately gets neither
  // field back from the real API, so this must default to 0 rather than
  // crash on `cc.totalCommitContributions` against `undefined`.
  const totalCommits = cc
    ? includeForks
      ? (cc.totalCommitContributions ?? 0)
      : sumExcludingForks(cc.commitContributionsByRepository)
    : 0;
  const totalIssues = cc
    ? includeForks
      ? (cc.totalIssueContributions ?? 0)
      : sumExcludingForks(cc.issueContributionsByRepository)
    : 0;
  const totalPRs = cc
    ? includeForks
      ? (cc.totalPullRequestContributions ?? 0)
      : sumExcludingForks(cc.pullRequestContributionsByRepository)
    : 0;
  // `statsRepos.nodes` is already server-side filtered by buildQuery's
  // `isFork: false` argument in the includeForks: false shape — no
  // client-side re-filtering needed here in either branch.
  const totalStars = (user.statsRepos?.nodes ?? []).reduce((sum, node) => sum + node.stargazerCount, 0);

  // Flatten weeks[].contributionDays[] into a flat daily array — core only
  // normalizes shape, it never re-buckets into weeks. The-record (CARD-04)
  // owns re-bucketing this flat list into its own Sunday-started week
  // buckets (RESEARCH.md "core composes queries, widgets interpret
  // ProfileData" boundary — same standing comment shape as `repositories`
  // below).
  const calendarCalendar = user.calendar?.contributionCalendar;
  const contributionCalendar = calendarCalendar?.weeks.flatMap((week) =>
    week.contributionDays.map((day) => ({ date: day.date, count: day.contributionCount })),
  );

  const data: ProfileData = {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    followers: user.followers.totalCount,
    fetchedAt: new Date().toISOString(),
    stats: { totalCommits, totalIssues, totalPRs, totalStars },
    // `pushedAt` passed through exactly as GitHub returns it (string | null)
    // — no `?? createdAt` fallback here. The Graveyard (Plan 03-04) owns
    // interpreting a null pushedAt against the 180-day burial threshold;
    // core/fetch.ts only composes the query and normalizes shape, never
    // domain-interprets a widget's own display logic (RESEARCH.md boundary).
    repositories: user.graveyardRepos?.nodes,
    contributionCalendar,
    contributionCalendarTotal: calendarCalendar?.totalContributions,
  };

  // restrictedContributionsCount (cc.restrictedContributionsCount) is
  // intentionally read above only as part of the destructured `cc` object
  // and never assigned into `data` — DATA-05: private-contribution counts
  // are never fabricated into or leaked through ProfileData.

  return { data, pointCost: rateLimit.cost };
}

/**
 * Optional context for `formatFetchFailureMessage`'s GAP-05-01 org-repo
 * guidance. Callers construct this from `resolveProfileLogin`'s own return
 * shape (`core/profile-login.ts`) — `login` is whatever was actually passed
 * to `fetchProfileData`, `wasInferredFromRepoOwner` is true only when no
 * explicit `profile-login` input was supplied.
 */
export interface FetchFailureLoginHint {
  login: string;
  wasInferredFromRepoOwner: boolean;
}

/**
 * GitHub's own GraphQL error text for a login that does not resolve to a
 * User — the exact, un-actionable message an org-repo adopter hits under
 * GAP-05-01 (`user(login: $login)` can only ever resolve a User, never an
 * Organization). Matched narrowly so unrelated failures (rate limits,
 * network errors, a genuinely-typo'd explicit profile-login) never get this
 * specific advice appended.
 */
const USER_LOGIN_UNRESOLVED_PATTERN = /Could not resolve to a User with the login of/;

/**
 * Formats a fetch failure into the UI-SPEC "Error state" four-line message.
 * Reads ONLY `error.message` — never any other property of `error`
 * (`@octokit/graphql`'s `GraphqlResponseError` carries the full request
 * object, including the constructed `Authorization` header, on `.request`;
 * serializing the whole error object would leak the token into Action logs —
 * threat T-02-01).
 *
 * `loginHint` is optional and additive (GAP-05-01): existing callers that
 * omit it (e.g. `src/cli.ts`, which always requires an explicit
 * `GITHUB_LOGIN` — there is no repo-owner inference to guide about) see
 * byte-identical output to before this parameter existed. When supplied AND
 * the login was inferred from the repo owner (never explicitly configured)
 * AND the failure text matches GitHub's User-resolution error, an
 * actionable paragraph is appended naming the likely cause (the repo is
 * org-owned) and the exact fix (add a `profile-login` input). An explicitly
 * configured `profile-login` that still fails to resolve is a genuinely
 * different problem (probably a typo) and gets no unrelated org-repo advice.
 */
export function formatFetchFailureMessage(error: unknown, loginHint?: FetchFailureLoginHint): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [
    "✗ Failed to fetch live profile data from GitHub's GraphQL API",
    `  ${message}`,
    "  Point cost for this attempt (if available) was logged above.",
    "  This may be a temporary rate-limit condition — see GITHUB_STEP_SUMMARY.",
  ];

  if (loginHint?.wasInferredFromRepoOwner && USER_LOGIN_UNRESOLVED_PATTERN.test(message)) {
    lines.push(
      "",
      `  This repository's owner ("${loginHint.login}") could not be resolved as a GitHub User — it`,
      "  is likely an Organization instead. GitHub's GraphQL API can only look up a User's profile",
      "  data, never an Organization's, so the repository owner cannot be queried directly.",
      "  Fix: add an optional profile-login input to your workflow file, naming the GitHub user",
      "  whose profile these cards should show, e.g.:",
      "    with:",
      "      profile-login: <your-github-username>",
    );
  }

  return lines.join("\n");
}
