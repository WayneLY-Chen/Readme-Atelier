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
      repositories(first: 100, isFork: false, ownerAffiliations: [OWNER], privacy: PUBLIC) {
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
      repositories(first: 100, ownerAffiliations: [OWNER], privacy: PUBLIC) {
        nodes { stargazerCount }
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
 */
export function buildQuery(capabilities: Set<DataCapability>, includeForks: boolean): string | null {
  if (capabilities.size === 0) {
    return null;
  }

  const fragments: string[] = [];
  if (capabilities.has("stats")) {
    fragments.push(includeForks ? STATS_FRAGMENT_INCLUDE_FORKS : STATS_FRAGMENT_EXCLUDE_FORKS);
  }

  return `query ProfileStats($login: String!) {
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
    contributionsCollection: {
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
    repositories: { nodes: { stargazerCount: number }[] };
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
  fetchImpl: FetchImpl = fetch,
): Promise<{ data: ProfileData; pointCost: number }> {
  if (capabilities.size === 0) {
    return { data: zeroCapabilityProfileData(), pointCost: 0 };
  }

  const query = buildQuery(capabilities, includeForks) as string;
  const result = await graphql<StatsQueryResult>(query, {
    login,
    headers: { authorization: `token ${token}` },
    request: { fetch: fetchImpl },
  });

  const { user, rateLimit } = result;
  const { contributionsCollection: cc } = user;

  const totalCommits = includeForks
    ? (cc.totalCommitContributions ?? 0)
    : sumExcludingForks(cc.commitContributionsByRepository);
  const totalIssues = includeForks
    ? (cc.totalIssueContributions ?? 0)
    : sumExcludingForks(cc.issueContributionsByRepository);
  const totalPRs = includeForks
    ? (cc.totalPullRequestContributions ?? 0)
    : sumExcludingForks(cc.pullRequestContributionsByRepository);
  // `repositories.nodes` is already server-side filtered by buildQuery's
  // `isFork: false` argument in the includeForks: false shape — no
  // client-side re-filtering needed here in either branch.
  const totalStars = user.repositories.nodes.reduce((sum, node) => sum + node.stargazerCount, 0);

  const data: ProfileData = {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
    followers: user.followers.totalCount,
    fetchedAt: new Date().toISOString(),
    stats: { totalCommits, totalIssues, totalPRs, totalStars },
  };

  // restrictedContributionsCount (cc.restrictedContributionsCount) is
  // intentionally read above only as part of the destructured `cc` object
  // and never assigned into `data` — DATA-05: private-contribution counts
  // are never fabricated into or leaked through ProfileData.

  return { data, pointCost: rateLimit.cost };
}

/**
 * Formats a fetch failure into the UI-SPEC "Error state" four-line message.
 * Reads ONLY `error.message` — never any other property of `error`
 * (`@octokit/graphql`'s `GraphqlResponseError` carries the full request
 * object, including the constructed `Authorization` header, on `.request`;
 * serializing the whole error object would leak the token into Action logs —
 * threat T-02-01).
 */
export function formatFetchFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return [
    "✗ Failed to fetch live profile data from GitHub's GraphQL API",
    `  ${message}`,
    "  Point cost for this attempt (if available) was logged above.",
    "  This may be a temporary rate-limit condition — see GITHUB_STEP_SUMMARY.",
  ].join("\n");
}
