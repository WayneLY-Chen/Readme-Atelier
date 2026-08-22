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

describe("buildQuery — calendar capability (CARD-04)", () => {
  it("calendar alone: emits the aliased calendar: contributionsCollection(from: selection, no stats fields", () => {
    const query = buildQuery(new Set(["calendar"]), false) as string;

    expect(query).toContain("calendar: contributionsCollection(from: $from)");
    expect(query).not.toContain("statsRepos");
    expect(query).not.toMatch(/^\s*contributionsCollection \{/m);
  });

  it("stats + calendar together: BOTH an unaliased contributionsCollection { and the aliased calendar: contributionsCollection(from: selection are present", () => {
    const query = buildQuery(new Set(["stats", "calendar"]), false) as string;

    expect(query).toMatch(/\bcontributionsCollection \{/);
    expect(query).toContain("calendar: contributionsCollection(from: $from)");
  });

  it("the operation header declares $from: DateTime! when and only when the calendar capability is present", () => {
    const withCalendar = buildQuery(new Set(["calendar"]), false) as string;
    const withoutCalendar = buildQuery(new Set(["stats"]), false) as string;

    expect(withCalendar).toContain("$from: DateTime!");
    expect(withoutCalendar).not.toContain("$from");
    expect(withoutCalendar).not.toContain("DateTime");
  });

  it("a query built without the calendar capability contains no reference to $from anywhere (threat T-04-01)", () => {
    const query = buildQuery(new Set(["stats", "repoList"]), false) as string;
    expect(query).not.toMatch(/from/i);
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

/**
 * Plan 04-04 Task 3: masthead's "identity"-only capability (the first widget
 * to push capabilities.size above 0 while requesting neither "stats" nor
 * "repoList" nor "calendar" — see StatsQueryResult's own doc comment on
 * `contributionsCollection`). The real API genuinely omits
 * contributionsCollection/statsRepos/graveyardRepos/calendar from the
 * response in this shape, since buildQuery never asked for them.
 */
function identityOnlyResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 7 },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

describe("fetchProfileData — identity-only capability, no stats fragment requested (masthead)", () => {
  it("normalizes to zeroed stats rather than throwing when contributionsCollection is genuinely absent", async () => {
    const fetchImpl = fakeGraphqlFetch(200, identityOnlyResponseBody());
    const { data } = await fetchProfileData(
      new Set(["identity"]),
      "fake-token",
      "octocat",
      false,
      undefined,
      fetchImpl,
    );

    expect(data.stats).toEqual({ totalCommits: 0, totalIssues: 0, totalPRs: 0, totalStars: 0 });
    expect(data.login).toBe("octocat");
    expect(data.followers).toBe(7);
  });
});

describe("fetchProfileData — repoList capability (CARD-03)", () => {
  it("maps graveyardRepos.nodes into data.repositories, one-to-one", async () => {
    const fetchImpl = fakeGraphqlFetch(200, repoListResponseBody());
    const { data } = await fetchProfileData(new Set(["repoList"]), "fake-token", "octocat", false, undefined, fetchImpl);

    expect(data.repositories).toHaveLength(2);
    expect(data.repositories?.[0]).toEqual(REPO_C_NEVER_PUSHED);
    expect(data.repositories?.[1]).toEqual(REPO_D_STALE);
  });

  it("passes pushedAt: null through unchanged — no createdAt fallback applied in fetch.ts", async () => {
    const fetchImpl = fakeGraphqlFetch(200, repoListResponseBody());
    const { data } = await fetchProfileData(new Set(["repoList"]), "fake-token", "octocat", false, undefined, fetchImpl);

    expect(data.repositories?.[0].pushedAt).toBeNull();
  });

  it("leaves data.repositories undefined when repoList was not a requested capability", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl);

    expect(data.repositories).toBeUndefined();
  });

  it("stats + repoList together: both data.stats and data.repositories parse correctly, independently", async () => {
    const fetchImpl = fakeGraphqlFetch(200, statsAndRepoListResponseBody());
    const { data } = await fetchProfileData(new Set(["stats", "repoList"]), "fake-token", "octocat", false, undefined, fetchImpl);

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

/**
 * A calendar response whose first returned week is partial (three
 * `contributionDays`, matching RESEARCH.md Pattern 3's "mid-year from a 1
 * January window returns a partial first week" expectation) plus one full
 * second week — enough to prove ordering and the totalContributions sum are
 * both preserved through normalization.
 */
function calendarResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 42 },
        calendar: {
          contributionCalendar: {
            totalContributions: 9,
            weeks: [
              {
                firstDay: "2026-01-01",
                contributionDays: [
                  { date: "2026-01-01", contributionCount: 1 },
                  { date: "2026-01-02", contributionCount: 2 },
                  { date: "2026-01-03", contributionCount: 0 },
                ],
              },
              {
                firstDay: "2026-01-04",
                contributionDays: [
                  { date: "2026-01-04", contributionCount: 3 },
                  { date: "2026-01-05", contributionCount: 1 },
                  { date: "2026-01-06", contributionCount: 0 },
                  { date: "2026-01-07", contributionCount: 2 },
                  { date: "2026-01-08", contributionCount: 0 },
                  { date: "2026-01-09", contributionCount: 0 },
                  { date: "2026-01-10", contributionCount: 0 },
                ],
              },
            ],
          },
        },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

describe("fetchProfileData — calendar capability normalization (CARD-04)", () => {
  it("flattens weeks[].contributionDays[] into ProfileData.contributionCalendar, preserving every day in order", async () => {
    const fetchImpl = fakeGraphqlFetch(200, calendarResponseBody());
    const { data } = await fetchProfileData(
      new Set(["calendar"]),
      "fake-token",
      "octocat",
      false,
      "2026-01-01T00:00:00.000Z",
      fetchImpl,
    );

    expect(data.contributionCalendar).toHaveLength(10);
    expect(data.contributionCalendar?.[0]).toEqual({ date: "2026-01-01", count: 1 });
    expect(data.contributionCalendar?.[9]).toEqual({ date: "2026-01-10", count: 0 });
  });

  it("sets ProfileData.contributionCalendarTotal to the response's totalContributions", async () => {
    const fetchImpl = fakeGraphqlFetch(200, calendarResponseBody());
    const { data } = await fetchProfileData(
      new Set(["calendar"]),
      "fake-token",
      "octocat",
      false,
      "2026-01-01T00:00:00.000Z",
      fetchImpl,
    );

    expect(data.contributionCalendarTotal).toBe(9);
  });

  it("leaves contributionCalendar/contributionCalendarTotal undefined when calendar was not a requested capability", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl);

    expect(data.contributionCalendar).toBeUndefined();
    expect(data.contributionCalendarTotal).toBeUndefined();
  });
});

describe("fetchProfileData — the from-date is never interpolated into query text (threat T-04-01)", () => {
  it("the composed query contains no interpolated date literal — from reaches the request only through the variables object", async () => {
    const calendarFrom = "2026-01-01T00:00:00.000Z";
    let capturedBody: { query: string; variables: { from?: string } } | undefined;
    const recordingFetchImpl: FetchImpl = (async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify(calendarResponseBody()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as FetchImpl;

    await fetchProfileData(new Set(["calendar"]), "fake-token", "octocat", false, calendarFrom, recordingFetchImpl);

    expect(capturedBody?.query).not.toContain(calendarFrom);
    expect(capturedBody?.query).toContain("$from: DateTime!");
    expect(capturedBody?.variables.from).toBe(calendarFrom);
  });

  it("CalendarWindowMissingError is thrown when the calendar capability is requested with no calendarFrom window", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchProfileData(new Set(["calendar"]), "fake-token", "octocat", false, undefined, fetchImpl as unknown as FetchImpl),
    ).rejects.toThrow(/CalendarWindowMissingError|no calendarFrom/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchProfileData — zero-capability boundary (DATA-03 extended guarantee)", () => {
  it("returns the placeholder immediately and never calls fetchImpl", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchProfileData(new Set(), "fake-token", "octocat", false, undefined, fetchImpl as unknown as FetchImpl);

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
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl);

    expect(data.stats).toEqual({
      totalCommits: REPO_A.commit,
      totalIssues: REPO_A.issue,
      totalPRs: REPO_A.pr,
      totalStars: REPO_A.star,
    });
  });

  it("includeForks: true counts both repos via the cheap scalar/unfiltered path", async () => {
    const fetchImpl = fakeGraphqlFetch(200, includeForksResponseBody());
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", true, undefined, fetchImpl);

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
    const { data } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl);

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
      fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl),
    ).rejects.toThrow(/rate limit/i);
  });
});

describe("fetchProfileData — point cost (DATA-07, Don't Hand-Roll)", () => {
  it("pointCost equals the response body's rateLimit.cost, not a recomputed value", async () => {
    const fetchImpl = fakeGraphqlFetch(200, excludeForksResponseBody());
    const { pointCost } = await fetchProfileData(new Set(["stats"]), "fake-token", "octocat", false, undefined, fetchImpl);

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

describe("formatFetchFailureMessage — GAP-05-01 org-repo actionable guidance", () => {
  it("appends profile-login guidance when the login was inferred from the repo owner AND the failure is GitHub's User-resolution error", () => {
    const error = new Error("Could not resolve to a User with the login of 'SomeOrg'.");
    const message = formatFetchFailureMessage(error, { login: "SomeOrg", wasInferredFromRepoOwner: true });

    expect(message).toContain("SomeOrg");
    expect(message).toContain("profile-login");
    expect(message).toContain("Organization");
    // The original four-line message must still be present verbatim underneath the addition.
    expect(message).toContain("Could not resolve to a User with the login of 'SomeOrg'.");
  });

  it("does NOT append guidance when profile-login was explicitly configured, even for the identical error text (probably a typo, not an org-repo problem)", () => {
    const error = new Error("Could not resolve to a User with the login of 'typo-user'.");
    const message = formatFetchFailureMessage(error, { login: "typo-user", wasInferredFromRepoOwner: false });

    expect(message).not.toContain("profile-login");
  });

  it("does NOT append guidance for an unrelated error even when the login was inferred", () => {
    const error = new Error("API rate limit exceeded for installation.");
    const message = formatFetchFailureMessage(error, { login: "SomeOrg", wasInferredFromRepoOwner: true });

    expect(message).not.toContain("profile-login");
  });

  it("omits guidance entirely when no loginHint is passed — existing callers (src/cli.ts) see unchanged output", () => {
    const error = new Error("Could not resolve to a User with the login of 'SomeOrg'.");
    const message = formatFetchFailureMessage(error);

    expect(message).not.toContain("profile-login");
    expect(message).not.toContain("Organization");
  });
});
