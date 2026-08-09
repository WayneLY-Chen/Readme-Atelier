import { describe, expect, it, vi } from "vitest";
import { buildQuery, type FetchImpl, fetchProfileData, formatFetchFailureMessage } from "./fetch.js";

describe("buildQuery — zero-capability boundary (DATA-03)", () => {
  it("returns null when no capability is requested, regardless of includeForks", () => {
    expect(buildQuery(new Set(), false)).toBeNull();
    expect(buildQuery(new Set(), true)).toBeNull();
  });
});

describe("buildQuery — includeForks: false (default, DATA-04 fork exclusion)", () => {
  const query = buildQuery(new Set(["stats"]), false) as string;

  it("queries user(login: $login), never viewer (T-02-03 / RESEARCH.md Pitfall 2)", () => {
    expect(query).toContain("user(login: $login)");
    expect(query).not.toContain("viewer");
  });

  it("requests the per-repository breakdown fields needed to filter forks client-side", () => {
    expect(query).toContain("commitContributionsByRepository");
    expect(query).toContain("issueContributionsByRepository");
    expect(query).toContain("pullRequestContributionsByRepository");
    expect(query).toContain("statsRepos: repositories(");
    expect(query).toContain("isFork");
  });

  it("requests rateLimit { cost limit remaining } for DATA-07's point-cost read", () => {
    expect(query).toContain("rateLimit { cost limit remaining }");
  });

  it("does not use organizationID (DATA-06: org contributions included by default, unfiltered)", () => {
    expect(query).not.toContain("organizationID");
  });
});

describe("buildQuery — includeForks: true (opt-in cheap path)", () => {
  const query = buildQuery(new Set(["stats"]), true) as string;

  it("uses the plain contributionsCollection scalar fields", () => {
    expect(query).toContain("totalCommitContributions");
    expect(query).toContain("totalIssueContributions");
    expect(query).toContain("totalPullRequestContributions");
  });

  it("skips the per-repository breakdown fields entirely (cheap path, UI-SPEC Code Examples)", () => {
    expect(query).not.toContain("commitContributionsByRepository");
    expect(query).not.toContain("issueContributionsByRepository");
    expect(query).not.toContain("pullRequestContributionsByRepository");
  });

  it("drops the isFork: false argument from repositories() — unfiltered fan-out for stars", () => {
    expect(query).toContain("statsRepos: repositories(");
    expect(query).not.toContain("isFork: false");
  });

  it("still queries user(login: $login), never viewer", () => {
    expect(query).toContain("user(login: $login)");
    expect(query).not.toContain("viewer");
  });

  it("does not use organizationID", () => {
    expect(query).not.toContain("organizationID");
  });
});

describe("buildQuery — repoList capability (CARD-03)", () => {
  it("repoList alone: emits the graveyardRepos alias with PUSHED_AT ascending, no stats fields", () => {
    const query = buildQuery(new Set(["repoList"]), false) as string;

    expect(query).toContain("graveyardRepos: repositories(");
    expect(query).toContain("orderBy: { field: PUSHED_AT, direction: ASC }");
    expect(query).not.toContain("commitContributionsByRepository");
    expect(query).not.toContain("statsRepos");
  });

  it("stats alone: emits the statsRepos alias, no graveyardRepos alias", () => {
    const query = buildQuery(new Set(["stats"]), false) as string;

    expect(query).toContain("statsRepos: repositories(");
    expect(query).not.toContain("graveyardRepos");
  });

  it("stats + repoList together: both aliases present, each with its own distinct arguments", () => {
    const query = buildQuery(new Set(["stats", "repoList"]), false) as string;

    expect(query).toContain("statsRepos: repositories(");
    expect(query).toContain("graveyardRepos: repositories(");
    // stats' alias keeps isFork: false + STARGAZERS ordering...
    expect(query).toMatch(/statsRepos: repositories\([^)]*isFork: false[^)]*STARGAZERS/);
    // ...while graveyardRepos has neither an isFork argument nor STARGAZERS ordering.
    const graveyardCall = query.match(/graveyardRepos: repositories\([^)]*\)/)?.[0] ?? "";
    expect(graveyardCall).not.toContain("isFork");
    expect(graveyardCall).not.toContain("STARGAZERS");
    expect(graveyardCall).toContain("PUSHED_AT");
  });
});

describe("buildQuery — login is never string-interpolated (T-02-02)", () => {
  it("has no way to inject a login string — the function does not even accept one", () => {
    // buildQuery's signature is (capabilities, includeForks) — there is no
    // login parameter at all. This test documents that structural guarantee:
    // the only place "login" appears in the output is the literal variable
    // declaration/reference, never a concatenated value.
    const query = buildQuery(new Set(["stats"]), false) as string;
    const loginOccurrences = query.match(/login/g) ?? [];
    // "$login" (declaration), "$login" (usage in user(login: $login)), and
    // the "login" field itself requested on the User type.
    expect(loginOccurrences.length).toBeGreaterThan(0);
    expect(query).not.toMatch(/user\(login:\s*"[^$]/);
  });
});

/**
 * Builds a fake FetchImpl returning a literal GitHub-shaped HTTP response,
 * matching RESEARCH.md's "Injectable-transport test fake" example. A
 * `content-type: application/json` header is required — @octokit/request's
 * fetch-wrapper only JSON-parses the body when this header is present;
 * without it, the body comes back as a raw string and graphql.js's
 * `response.data.errors` check would never fire.
 */
function fakeGraphqlFetch(status: number, body: unknown, extraHeaders: Record<string, string> = {}): FetchImpl {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...extraHeaders },
    })) as unknown as FetchImpl;
}

const REPO_A = { isFork: false, commit: 10, issue: 2, pr: 1, star: 5 };
const REPO_B = { isFork: true, commit: 99, issue: 99, pr: 99, star: 999 };
const RESTRICTED_COUNT_MARKER = 1234567;

function excludeForksResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 42 },
        contributionsCollection: {
          restrictedContributionsCount: RESTRICTED_COUNT_MARKER,
          commitContributionsByRepository: [
            { contributions: { totalCount: REPO_A.commit }, repository: { isFork: REPO_A.isFork } },
            { contributions: { totalCount: REPO_B.commit }, repository: { isFork: REPO_B.isFork } },
          ],
          issueContributionsByRepository: [
            { contributions: { totalCount: REPO_A.issue }, repository: { isFork: REPO_A.isFork } },
            { contributions: { totalCount: REPO_B.issue }, repository: { isFork: REPO_B.isFork } },
          ],
          pullRequestContributionsByRepository: [
            { contributions: { totalCount: REPO_A.pr }, repository: { isFork: REPO_A.isFork } },
            { contributions: { totalCount: REPO_B.pr }, repository: { isFork: REPO_B.isFork } },
          ],
        },
        // GraphQL-side isFork: false filter already applied — only repo-a survives.
        statsRepos: { nodes: [{ stargazerCount: REPO_A.star }] },
      },
      rateLimit: { cost: 3, limit: 5000, remaining: 4997 },
    },
  };
}

function includeForksResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 42 },
        contributionsCollection: {
          totalCommitContributions: REPO_A.commit + REPO_B.commit,
          totalIssueContributions: REPO_A.issue + REPO_B.issue,
          totalPullRequestContributions: REPO_A.pr + REPO_B.pr,
          restrictedContributionsCount: RESTRICTED_COUNT_MARKER,
        },
        // Unfiltered — both repos come back.
        statsRepos: { nodes: [{ stargazerCount: REPO_A.star }, { stargazerCount: REPO_B.star }] },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

const REPO_C_NEVER_PUSHED = {
  name: "empty-repo",
  nameWithOwner: "octocat/empty-repo",
  url: "https://example.com/octocat/empty-repo",
  createdAt: "2020-01-01T00:00:00Z",
  pushedAt: null,
  isFork: false,
};
const REPO_D_STALE = {
  name: "old-repo",
  nameWithOwner: "octocat/old-repo",
  url: "https://example.com/octocat/old-repo",
  createdAt: "2019-01-01T00:00:00Z",
  pushedAt: "2019-06-01T00:00:00Z",
  isFork: true,
};

/** repoList-only fixture — no contributionsCollection/statsRepos in the response at all. */
function repoListResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 42 },
        graveyardRepos: { nodes: [REPO_C_NEVER_PUSHED, REPO_D_STALE] },
      },
      rateLimit: { cost: 2, limit: 5000, remaining: 4998 },
    },
  };
}

/** stats + repoList together — proves the two capabilities parse independently, no cross-contamination. */
function statsAndRepoListResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 42 },
        contributionsCollection: excludeForksResponseBody().data.user.contributionsCollection,
        statsRepos: { nodes: [{ stargazerCount: REPO_A.star }] },
        graveyardRepos: { nodes: [REPO_C_NEVER_PUSHED, REPO_D_STALE] },
      },
      rateLimit: { cost: 5, limit: 5000, remaining: 4995 },
    },
  };
}

describe("fetchProfileData — repoList capability (CARD-03)", () => {
  it("maps graveyardRepos.nodes into data.repositories, one-to-one", async () => {
    const fetchImpl = fakeGraphqlFetch(200, repoListResponseBody());
    const { data } = await fetchProfileData(new Set(["repoList"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.repositories).toHaveLength(2);
    expect(data.repositories?.[0]).toEqual(REPO_C_NEVER_PUSHED);
    expect(data.repositories?.[1]).toEqual(REPO_D_STALE);
  });

  it("passes pushedAt: null through unchanged — no createdAt fallback applied in fetch.ts", async () => {
    const fetchImpl = fakeGraphqlFetch(200, repoListResponseBody());
    const { data } = await fetchProfileData(new Set(["repoList"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.repositories?.[0].pushedAt).toBeNull();
  });

  it("leaves data.repositories undefined when repoList was not a requested capability", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.repositories).toBeUndefined();
  });

  it("stats + repoList together: both data.stats and data.repositories parse correctly, independently", async () => {
    const fetchImpl = fakeGraphqlFetch(200, statsAndRepoListResponseBody());
    const { data } = await fetchProfileData(new Set(["stats", "repoList"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.stats).toEqual({
      totalCommits: REPO_A.commit,
      totalIssues: REPO_A.issue,
      totalPRs: REPO_A.pr,
      totalStars: REPO_A.star,
    });
    expect(data.repositories).toHaveLength(2);
    expect(data.repositories?.[0]).toEqual(REPO_C_NEVER_PUSHED);
  });
});

describe("fetchProfileData — zero-capability boundary (DATA-03 extended guarantee)", () => {
  it("returns the placeholder immediately and never calls fetchImpl", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProfileData(new Set(), "fake-token", "octocat", false, fetchImpl as unknown as FetchImpl);

    expect(result).toEqual({
      data: {
        login: "",
        name: null,
        avatarUrl: "",
        followers: 0,
        fetchedAt: new Date(0).toISOString(),
        stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
      },
      pointCost: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchProfileData — fork exclusion (DATA-04)", () => {
  it("includeForks: false counts only the non-fork repo's contributions and stars", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.stats).toEqual({
      totalCommits: REPO_A.commit,
      totalIssues: REPO_A.issue,
      totalPRs: REPO_A.pr,
      totalStars: REPO_A.star,
    });
  });

  it("includeForks: true counts both repos via the cheap scalar/unfiltered path", async () => {
    const fetchImpl = fakeGraphqlFetch(200, includeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", true, fetchImpl);

    expect(data.stats).toEqual({
      totalCommits: REPO_A.commit + REPO_B.commit,
      totalIssues: REPO_A.issue + REPO_B.issue,
      totalPRs: REPO_A.pr + REPO_B.pr,
      totalStars: REPO_A.star + REPO_B.star,
    });
  });
});

describe("fetchProfileData — followers mapping and private-contribution non-leakage (DATA-05)", () => {
  it("maps followers.totalCount directly, and never surfaces restrictedContributionsCount anywhere in the returned data", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, fetchImpl);

    expect(data.followers).toBe(42);
    expect(JSON.stringify(data)).not.toContain(String(RESTRICTED_COUNT_MARKER));
  });
});

describe("fetchProfileData — GitHub's real 200+errors[] rate-limit shape (DATA-07, RESEARCH.md Pitfall 1)", () => {
  it("rejects when the response is HTTP 200 with a null data + errors[] body and x-ratelimit-remaining: 0", async () => {
    const fetchImpl = fakeGraphqlFetch(
      200,
      { data: null, errors: [{ message: "API rate limit exceeded for installation." }] },
      { "x-ratelimit-remaining": "0", "x-ratelimit-limit": "1000" },
    );

    await expect(
      fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, fetchImpl),
    ).rejects.toThrow(/rate limit/i);
  });
});

describe("fetchProfileData — point cost (DATA-07, Don't Hand-Roll)", () => {
  it("pointCost equals the response body's rateLimit.cost, not a recomputed value", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { pointCost } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, fetchImpl);

    expect(pointCost).toBe(3);
  });
});

describe("formatFetchFailureMessage — never leaks error.request/headers (T-02-01)", () => {
  it("returns only error.message content for a real thrown Error", () => {
    const message = formatFetchFailureMessage(new Error("boom"));
    expect(message).toContain("boom");
    expect(message).toContain("Failed to fetch live profile data from GitHub's GraphQL API");
    expect(message).toContain("Point cost for this attempt (if available) was logged above.");
    expect(message).toContain("This may be a temporary rate-limit condition — see GITHUB_STEP_SUMMARY.");
  });

  it("does not leak a token embedded in a GraphqlResponseError-shaped error's request.headers.authorization", () => {
    const fakeError = new Error("API rate limit exceeded for installation.") as Error & {
      request: { headers: { authorization: string } };
    };
    fakeError.request = { headers: { authorization: "token ghs_faketoken123" } };

    const message = formatFetchFailureMessage(fakeError);

    expect(message).not.toContain("ghs_faketoken123");
    expect(message).not.toContain("authorization");
    expect(message).toContain("API rate limit exceeded for installation.");
  });
});
