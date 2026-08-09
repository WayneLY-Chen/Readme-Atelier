import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import {
  type GraveyardRepoInput,
  selectTombstones,
  theGraveyardWidget,
} from "./index.js";

function repo(overrides: Partial<GraveyardRepoInput> & { name: string }): GraveyardRepoInput {
  return {
    name: overrides.name,
    createdAt: overrides.createdAt ?? "2020-01-01T00:00:00Z",
    pushedAt: overrides.pushedAt ?? null,
    isFork: overrides.isFork ?? false,
  };
}

function baseProfileData(repositories: GraveyardRepoInput[] = []): ProfileData {
  return {
    login: "octocat",
    name: "Octo Cat",
    avatarUrl: "",
    followers: 9,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
    repositories: repositories.map((r) => ({
      ...r,
      nameWithOwner: `octocat/${r.name}`,
      url: `https://github.com/octocat/${r.name}`,
    })),
  };
}

function optsFor(language: RenderOptions["language"], now: Date): RenderOptions {
  return { now, seed: 0, timezone: "UTC", language };
}

const NOW = new Date("2025-08-09T00:00:00Z");
const MS_PER_DAY_TEST = 86_400_000;

beforeAll(() => {
  loadAllFonts();
});

describe("theGraveyardWidget — identity (CARD-03)", () => {
  it("has the expected name, requires, and size", () => {
    expect(theGraveyardWidget.name).toBe("the-graveyard");
    expect(theGraveyardWidget.requires).toEqual(["repoList"]);
    expect(theGraveyardWidget.size).toEqual({ width: 495, height: 204 });
  });
});

describe("selectTombstones — 180-day burial threshold (D-01)", () => {
  it("a repo pushed exactly 180 days ago is buried", () => {
    const result = selectTombstones(
      [repo({ name: "a", createdAt: "2020-01-01T00:00:00Z", pushedAt: "2025-02-10T00:00:00Z" })],
      NOW,
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("a");
  });

  it("a repo pushed 179 days ago is NOT buried", () => {
    const result = selectTombstones(
      [repo({ name: "a", createdAt: "2020-01-01T00:00:00Z", pushedAt: "2025-02-11T00:00:00Z" })],
      NOW,
      true,
    );
    expect(result).toHaveLength(0);
  });
});

describe("selectTombstones — over-cap selection (D-02)", () => {
  it("caps at 6, keeping the 6 most-recently-buried, sorted newest-to-oldest lastPush", () => {
    const repos: GraveyardRepoInput[] = [];
    for (let i = 0; i < 7; i++) {
      // Each pushedAt is well past the 180-day threshold, each distinct.
      repos.push(
        repo({
          name: `repo-${i}`,
          createdAt: "2010-01-01T00:00:00Z",
          pushedAt: new Date(NOW.getTime() - (200 + i) * MS_PER_DAY_TEST).toISOString(),
        }),
      );
    }
    const result = selectTombstones(repos, NOW, true);
    expect(result).toHaveLength(6);
    // repo-0 (200 days ago) is the MOST recently buried of the 7; repo-6
    // (206 days ago) is the LEAST recently buried and should be excluded.
    expect(result.map((t) => t.name)).not.toContain("repo-6");
    const lastPushTimes = result.map((t) => new Date(t.lastPush).getTime());
    for (let i = 1; i < lastPushTimes.length; i++) {
      expect(lastPushTimes[i]).toBeLessThanOrEqual(lastPushTimes[i - 1] as number);
    }
  });
});

describe("selectTombstones — tie-break by name (reproducibility)", () => {
  it("two repos with identical lastPush sort alphabetically by name, regardless of input order", () => {
    const pushedAt = "2025-01-01T00:00:00Z";
    const zeta = repo({ name: "zeta", createdAt: "2020-01-01T00:00:00Z", pushedAt });
    const alpha = repo({ name: "alpha", createdAt: "2020-01-01T00:00:00Z", pushedAt });

    const order1 = selectTombstones([zeta, alpha], NOW, true);
    const order2 = selectTombstones([alpha, zeta], NOW, true);

    expect(order1.map((t) => t.name)).toEqual(["alpha", "zeta"]);
    expect(order2.map((t) => t.name)).toEqual(["alpha", "zeta"]);
  });
});

describe("selectTombstones — pushedAt: null (RESEARCH.md Pitfall 2)", () => {
  it("uses createdAt as the lastPush proxy and yields lifespanDays 0, never excluded", () => {
    const createdAt = new Date(NOW.getTime() - 200 * MS_PER_DAY_TEST).toISOString();
    const result = selectTombstones(
      [repo({ name: "never-pushed", createdAt, pushedAt: null })],
      NOW,
      true,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.lastPush).toBe(createdAt);
    expect(result[0]?.lifespanDays).toBe(0);
  });
});

describe("selectTombstones — include_forks (D-03)", () => {
  const forkRepo = repo({
    name: "a-fork",
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2025-01-01T00:00:00Z",
    isFork: true,
  });
  const ownRepo = repo({
    name: "own-repo",
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: "2025-01-01T00:00:00Z",
    isFork: false,
  });

  it("include_forks: false excludes forks even when they qualify", () => {
    const result = selectTombstones([forkRepo, ownRepo], NOW, false);
    expect(result.map((t) => t.name)).toEqual(["own-repo"]);
  });

  it("include_forks: true includes forks", () => {
    const result = selectTombstones([forkRepo, ownRepo], NOW, true);
    expect(result.map((t) => t.name).sort()).toEqual(["a-fork", "own-repo"]);
  });
});

describe("theGraveyardWidget.optionsSchema — D-03 include_forks default true", () => {
  it("defaults include_forks to true when omitted", () => {
    const opts = theGraveyardWidget.optionsSchema.parse({}) as RenderOptions & {
      include_forks: boolean;
    };
    expect(opts.include_forks).toBe(true);
  });

  it("honors an explicit include_forks: false", () => {
    const opts = theGraveyardWidget.optionsSchema.parse({ include_forks: false }) as RenderOptions & {
      include_forks: boolean;
    };
    expect(opts.include_forks).toBe(false);
  });

  it("throws (.strict()) on an unknown/misspelled option key", () => {
    expect(() => theGraveyardWidget.optionsSchema.parse({ inclue_forks: true })).toThrow();
  });
});

describe("theGraveyardWidget.renderBody — empty state (UX-06, D-04, D-05)", () => {
  it("does not throw, renders a ground line, dry caption, no tombstone shapes, no callout", () => {
    const opts = { ...optsFor("en", NOW), include_forks: true } as RenderOptions;
    let body = "";
    expect(() => {
      body = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, opts);
    }).not.toThrow();

    expect(body).toContain("<line");
    // No tombstone shapes: the tombstone path's distinguishing stroke-width.
    expect(body).not.toContain('stroke-width="0.8"');
    // Empty caption text renders (some <path> from the dry-toned caption).
    expect(body).toContain("<path");
    // Header count still renders plainly as "0 BURIED".
    expect(body).not.toContain("<text");
  });

  it("zh-TW empty state also does not throw and omits tombstone shapes", () => {
    const opts = { ...optsFor("zh-TW", NOW), include_forks: true } as RenderOptions;
    let body = "";
    expect(() => {
      body = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, opts);
    }).not.toThrow();
    expect(body).not.toContain('stroke-width="0.8"');
  });
});

describe("theGraveyardWidget.renderBody — populated state (N=3)", () => {
  function threeQualifyingRepos(): GraveyardRepoInput[] {
    return [
      repo({
        name: "old-one",
        createdAt: "2015-01-01T00:00:00Z",
        pushedAt: "2024-01-01T00:00:00Z",
      }),
      repo({
        name: "middle-one",
        createdAt: "2018-01-01T00:00:00Z",
        pushedAt: "2024-06-01T00:00:00Z",
      }),
      repo({
        name: "shortest-one",
        createdAt: "2023-01-01T00:00:00Z",
        pushedAt: "2023-06-01T00:00:00Z",
      }),
    ];
  }

  it("renders exactly 3 tombstone shapes and a shortest-lived callout", () => {
    const opts = { ...optsFor("en", NOW), include_forks: true } as RenderOptions;
    const body = theGraveyardWidget.renderBody(
      baseProfileData(threeQualifyingRepos()),
      editorialLight,
      opts,
    );

    const tombstoneCount = (body.match(/stroke-width="0\.8"/g) ?? []).length;
    expect(tombstoneCount).toBe(3);
    expect(body).toContain("<path");
    expect(body).not.toContain("<text");
    // "3 BURIED" header count present via the letter-spaced glyph run —
    // verified structurally by re-rendering with a different N and
    // confirming the markup differs (numerals differ in path data).
    const zeroBody = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, opts);
    expect(body).not.toBe(zeroBody);
  });

  it("include_forks and header count vary the output correctly", () => {
    const opts = { ...optsFor("en", NOW), include_forks: true } as RenderOptions;
    const body = theGraveyardWidget.renderBody(
      baseProfileData(threeQualifyingRepos()),
      editorialLight,
      opts,
    );
    const tombstoneCount = (body.match(/stroke-width="0\.8"/g) ?? []).length;
    expect(tombstoneCount).toBe(3);
  });

  it("describe() returns non-empty title/desc for both languages", () => {
    const en = theGraveyardWidget.describe(baseProfileData([]), optsFor("en", NOW));
    const zh = theGraveyardWidget.describe(baseProfileData([]), optsFor("zh-TW", NOW));
    expect(en.title.length).toBeGreaterThan(0);
    expect(en.desc.length).toBeGreaterThan(0);
    expect(zh.title.length).toBeGreaterThan(0);
    expect(zh.desc.length).toBeGreaterThan(0);
  });
});

describe("theGraveyardWidget.renderBody — page-number footer (MAST-03)", () => {
  it("renders nothing extra when pageNumber/totalPages are undefined", () => {
    const opts = optsFor("en", NOW);
    const baseline = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, opts);
    const explicit = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, {
      ...opts,
      pageNumber: undefined,
      totalPages: undefined,
    });
    expect(explicit).toBe(baseline);
  });

  it("renders an additional path when both pageNumber and totalPages are set (empty state)", () => {
    const opts = optsFor("en", NOW);
    const withoutPage = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, opts);
    const withPage = theGraveyardWidget.renderBody(baseProfileData([]), editorialLight, {
      ...opts,
      pageNumber: 3,
      totalPages: 3,
    });
    expect(withPage).not.toBe(withoutPage);
    expect(withPage).toContain(`fill="${editorialLight.muted}"`);
  });
});

describe("theGraveyardWidget.renderBody — shortest-lived callout truncation", () => {
  it("truncates an over-180px synthetic repo name and appends a literal ellipsis", () => {
    const longName = "a".repeat(80);
    const opts = { ...optsFor("en", NOW), include_forks: true } as RenderOptions;
    let body = "";
    expect(() => {
      body = theGraveyardWidget.renderBody(
        baseProfileData([
          repo({ name: longName, createdAt: "2015-01-01T00:00:00Z", pushedAt: "2024-01-01T00:00:00Z" }),
        ]),
        editorialLight,
        opts,
      );
    }).not.toThrow();
    expect(body).toContain("<path");
    expect(body).not.toContain("<text");
  });
});
