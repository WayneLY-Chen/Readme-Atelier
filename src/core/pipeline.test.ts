import { beforeAll, describe, expect, it } from "vitest";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";
import { editorialStatCardWidget } from "../widgets/editorial-stat-card/index.js";
import { formatStatNumber } from "../widgets/editorial-stat-card/format.js";
import { mastheadWidget } from "../widgets/masthead/index.js";
import { theGraveyardWidget } from "../widgets/the-graveyard/index.js";
import type { ResolvedConfig } from "./config.js";
import { type FetchImpl, zeroCapabilityProfileData } from "./fetch.js";
import type { ProfileData, RenderOptions } from "./model.js";
import {
  ConflictingStatsOptionsError,
  fetchSharedData,
  InvalidCardOptionsError,
  PageNumberInvariantError,
  renderAllCards,
  resolveCards,
  resolveTheme,
  UnknownWidgetError,
} from "./pipeline.js";
import type { RenderedCard, ResolvedCard } from "./pipeline.js";
import { get, register } from "./registry.js";
import type { WidgetDefinition } from "./registry.js";
import { renderPair } from "./svg.js";

const NOW = new Date("2026-08-07T12:00:00Z");
const GLOBAL_OPTS = { now: NOW, seed: 0 };

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    theme: "editorial",
    language: "en",
    timezone: "UTC",
    cards: [{ type: "almanac" }],
    ...overrides,
  };
}

beforeAll(() => {
  loadAllFonts();
  // The registry is a module-level Map and `register` throws on a duplicate,
  // so guard: another test file in the same worker may have registered first.
  if (!get("almanac")) {
    register(almanacWidget);
  }
  if (!get("editorial-stat-card")) {
    register(editorialStatCardWidget);
  }
  // NOTE (Plan 03-05): the real `mastheadWidget` is deliberately NOT
  // registered here. The registry has no unregister/replace primitive
  // (register() throws DuplicateWidgetError on a second call for the same
  // name), and this file's pre-existing "renderAllCards — masthead citation
  // & page numbering (MAST-01/02/03)" tests (Plan 03-01) already claim the
  // name "masthead" for a fake spy widget via `ensureMastheadFixtures()`
  // below. Registering the real widget here would starve that fake
  // registration (whichever registers first wins the name for the whole
  // file) and break those pre-existing tests. Plan 03-05's own "real,
  // non-spy mastheadWidget" test instead constructs a `ResolvedCard`
  // directly from the imported `mastheadWidget` object — see that test's own
  // comment — so no registry entry is needed for it. Deviation recorded in
  // 03-05-SUMMARY.md.
  if (!get("the-graveyard")) {
    register(theGraveyardWidget);
  }
});

/**
 * A minimal, valid `StatsQueryResult`-shaped response (see
 * `core/fetch.ts`'s internal interface) that satisfies BOTH the
 * `includeForks: false` and `includeForks: true` query shapes — the fake
 * doesn't validate the query text against the response shape (a real GraphQL
 * server would), it just needs to be a well-formed body `fetchProfileData`
 * can normalize without throwing, regardless of which fragment was sent.
 */
function fixtureResponseBody() {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 5 },
        contributionsCollection: {
          restrictedContributionsCount: 0,
          totalCommitContributions: 3,
          totalIssueContributions: 1,
          totalPullRequestContributions: 1,
          commitContributionsByRepository: [],
          issueContributionsByRepository: [],
          pullRequestContributionsByRepository: [],
        },
        repositories: { nodes: [] },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

/**
 * A `FetchImpl` that records every call (count + the GraphQL request body's
 * `query`/`variables`) and always responds with `fixtureResponseBody()`.
 * Mirrors `fetch.test.ts`'s `fakeGraphqlFetch`, extended to actually inspect
 * `init` (which that helper deliberately ignores) since this file's tests
 * need to assert on call COUNT and on which query fragment was sent.
 */
function recordingFetch(): { fetchImpl: FetchImpl; calls: { query: string; variables: unknown }[] } {
  const calls: { query: string; variables: unknown }[] = [];
  const fetchImpl: FetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query: string; variables: unknown };
    calls.push(body);
    return new Response(JSON.stringify(fixtureResponseBody()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchImpl;
  return { fetchImpl, calls };
}

describe("resolveCards", () => {
  it("throws UnknownWidgetError for a type with no registered widget", () => {
    expect(() => resolveCards(config({ cards: [{ type: "nope" }] }))).toThrow(UnknownWidgetError);
  });

  /**
   * The regression guard for `almanacOptionsSchema`'s `.strict()`. Without it
   * this typo is silently ignored: the card renders in the top-level timezone
   * and the adopter never learns their override did nothing. `core/config.ts`
   * cannot catch this — it types `options:` as an open record, because only
   * the widget knows its own option vocabulary.
   */
  it("rejects an unrecognized option key instead of ignoring it, and names it", () => {
    let caught: unknown;
    try {
      resolveCards(config({ cards: [{ type: "almanac", options: { timezon: "Asia/Taipei" } }] }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidCardOptionsError);
    const message = (caught as Error).message;
    expect(message).toContain("almanac");
    expect(message).toContain("timezon");
    expect(message).not.toContain("(root)");
    expect(message).not.toContain("Unrecognized key");
  });

  /**
   * D-08 is a prohibition, not just a default: `language` is read from the top
   * level only. Enforcing it by REJECTION rather than by silently dropping the
   * key is the whole point — a dropped key renders the wrong language with no
   * visible cause.
   */
  it("rejects a card-level language override (D-08)", () => {
    expect(() =>
      resolveCards(config({ cards: [{ type: "almanac", options: { language: "zh-TW" } }] })),
    ).toThrow(InvalidCardOptionsError);
  });

  it("defaults id to type, and uses an explicit id when given (D-10)", () => {
    expect(resolveCards(config())[0].id).toBe("almanac");
    expect(resolveCards(config({ cards: [{ type: "almanac", id: "my-card" }] }))[0].id).toBe(
      "my-card",
    );
  });

  it("honors a per-card timezone override while config.timezone is the fallback (D-09)", () => {
    const [utc, taipei] = resolveCards(
      config({
        timezone: "UTC",
        cards: [
          { type: "almanac", id: "a-utc" },
          { type: "almanac", id: "a-tpe", options: { timezone: "Asia/Taipei" } },
        ],
      }),
    );

    expect(utc.timezone).toBe("UTC");
    expect(taipei.timezone).toBe("Asia/Taipei");
  });

  /**
   * WR-02 regression: the test above only ever exercised `almanac`, whose
   * `optionsSchema` happens to declare its own `timezone` field — which is
   * exactly what let CR-01 ship (masthead/editorial-stat-card/the-graveyard
   * all use `.strict()` schemas WITHOUT a `timezone` field and rejected the
   * override outright). Parametrized over every widget type registrable in
   * this file's registry (masthead is covered separately in
   * `widgets/masthead/index.test.ts`, since its real widget's name collides
   * with this file's own fake "masthead" spy fixture used by the citation/
   * page-numbering tests below).
   */
  it.each(["almanac", "editorial-stat-card", "the-graveyard"] as const)(
    "%s: honors a per-card options.timezone override (D-09)",
    (type) => {
      const [card] = resolveCards(
        config({ timezone: "UTC", cards: [{ type, options: { timezone: "Asia/Taipei" } }] }),
      );
      expect(card.timezone).toBe("Asia/Taipei");
    },
  );

  it("keeps optionsSchema.parse()'s full return value in parsedOptions, not just a placeholder", () => {
    const [card] = resolveCards(
      config({ cards: [{ type: "editorial-stat-card", options: { include_forks: true } }] }),
    );

    expect(card.parsedOptions.include_forks).toBe(true);
  });

  it("resolves each card's widget to the real registered object reference", () => {
    const [card] = resolveCards(config());
    expect(card.widget).toBe(get("almanac"));
  });
});

describe("fetchSharedData", () => {
  it("does not call fetchImpl at all for a zero-capability card set (almanac only)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config());

    const result = await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(0);
    expect(result.pointCost).toBe(0);
  });

  it("does not trigger the global fetch either when fetchImpl is omitted for a zero-capability card set", async () => {
    const cards = resolveCards(config());
    // No fetchImpl passed at all — if this reached fetchProfileData's default
    // (the real global `fetch`), a real network call would be attempted and
    // this test would fail/hang instead of resolving instantly.
    const result = await fetchSharedData(cards, "", "", NOW);
    expect(result.pointCost).toBe(0);
  });

  it("calls fetchImpl exactly once when multiple enabled cards share one 'stats' capability", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(
      config({ cards: [{ type: "almanac" }, { type: "editorial-stat-card" }] }),
    );

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(1);
  });

  it("derives includeForks:true from the stats card's real parsedOptions.include_forks", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(
      config({ cards: [{ type: "editorial-stat-card", options: { include_forks: true } }] }),
    );

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    // The includeForks:true query shape never requests the per-repository
    // breakdown fields (core/fetch.ts's STATS_FRAGMENT_INCLUDE_FORKS).
    expect(calls[0]?.query).not.toContain("commitContributionsByRepository");
  });

  it("derives includeForks:false when include_forks is omitted (default)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config({ cards: [{ type: "editorial-stat-card" }] }));

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls[0]?.query).toContain("commitContributionsByRepository");
  });

  it("throws ConflictingStatsOptionsError instead of silently picking one card's include_forks when two stats cards disagree (CR-01)", async () => {
    const { fetchImpl } = recordingFetch();
    const cards = resolveCards(
      config({
        cards: [
          { type: "editorial-stat-card", id: "with-forks", options: { include_forks: true } },
          { type: "editorial-stat-card", id: "without-forks", options: { include_forks: false } },
        ],
      }),
    );

    await expect(fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl)).rejects.toThrow(
      ConflictingStatsOptionsError,
    );
    await expect(fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl)).rejects.toThrow(
      /"with-forks".*"without-forks"|"without-forks".*"with-forks"/,
    );
  });

  it("allows two stats cards that agree on include_forks and fetches exactly once", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(
      config({
        cards: [
          { type: "editorial-stat-card", id: "a", options: { include_forks: true } },
          { type: "editorial-stat-card", id: "b", options: { include_forks: true } },
        ],
      }),
    );

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).not.toContain("commitContributionsByRepository");
  });
});

const GLOBAL_RENDER_OPTS = { now: NOW, seed: 0, language: "en" as const };
const EDITORIAL_THEMES = resolveTheme("editorial");

describe("Plan 04 Task 2: resolveTheme — D-06/D-07/THEME-04 (four-theme catalog)", () => {
  it.each(["dracula", "nord", "tokyonight"] as const)(
    "%s: resolves to a light/dark pair whose light and dark are the SAME object reference (D-07)",
    (themeName) => {
      const themes = resolveTheme(themeName);
      expect(themes.light).toBe(themes.dark);
    },
  );

  it("editorial: light and dark remain two DIFFERENT object references (existing behavior unchanged)", () => {
    const themes = resolveTheme("editorial");
    expect(themes.light).not.toBe(themes.dark);
  });

  it("resolves all four D-06 catalog names without throwing", () => {
    for (const themeName of ["editorial", "dracula", "nord", "tokyonight"] as const) {
      expect(() => resolveTheme(themeName)).not.toThrow();
      const themes = resolveTheme(themeName);
      expect(themes.light).toBeDefined();
      expect(themes.dark).toBeDefined();
    }
  });
});

describe("renderAllCards", () => {
  it("renders one light/dark pair per resolved card, in given order (UnknownWidgetError/InvalidCardOptionsError/D-08 rejection now belong to resolveCards — see its own describe block above)", () => {
    const cards = resolveCards(
      config({ cards: [{ type: "almanac" }, { type: "almanac", id: "almanac-utc" }] }),
    );

    const rendered = renderAllCards(
      cards,
      zeroCapabilityProfileData(),
      GLOBAL_RENDER_OPTS,
      EDITORIAL_THEMES,
    );

    expect(rendered.map((c) => c.id)).toEqual(["almanac", "almanac-utc"]);
    for (const card of rendered) {
      expect(card.light).toContain("<svg");
      expect(card.dark).toContain("<svg");
      // The sandbox-safety invariant the whole phase rests on (RENDER-01).
      expect(card.light).not.toContain("<text");
      expect(card.dark).not.toContain("<text");
    }
  });

  it("honors a per-card timezone override (already resolved onto ResolvedCard.timezone) while language stays top-level (D-09)", () => {
    const cards = resolveCards(
      config({
        timezone: "UTC",
        cards: [
          { type: "almanac", id: "a-utc" },
          { type: "almanac", id: "a-tpe", options: { timezone: "Asia/Taipei" } },
        ],
      }),
    );

    const [utc, taipei] = renderAllCards(
      cards,
      zeroCapabilityProfileData(),
      { now: new Date("2026-08-07T20:00:00Z"), seed: 0, language: "en" },
      EDITORIAL_THEMES,
    );

    expect(utc.light).not.toBe(taipei.light);
  });

  it("is deterministic: same cards/data/globalOpts/themes produce byte-identical output", () => {
    const cards = resolveCards(config());
    const data = zeroCapabilityProfileData();
    const a = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    const b = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    expect(a[0].light).toBe(b[0].light);
    expect(a[0].dark).toBe(b[0].dark);
  });

  it("renders a mixed Almanac + Editorial Stat Card set sharing one data/themes input", () => {
    const cards = resolveCards(
      config({ cards: [{ type: "almanac" }, { type: "editorial-stat-card" }] }),
    );
    const data: ProfileData = {
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "",
      followers: 9,
      fetchedAt: new Date().toISOString(),
      stats: { totalCommits: 12345, totalPRs: 3, totalIssues: 1, totalStars: 42 },
    };

    const rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    expect(rendered).toHaveLength(2);
    for (const card of rendered) {
      expect(card.light).toContain("<path");
      expect(card.dark).toContain("<path");
      expect(card.light).not.toContain("<text");
      expect(card.dark).not.toContain("<text");
    }
  });

  it("overwrites now/seed/language/timezone on the final opts, but passes every other parsedOptions field (e.g. include_forks) through untouched", () => {
    let capturedOpts: Record<string, unknown> | undefined;
    const fakeWidget: WidgetDefinition<any> = {
      name: "test-fake-opts-widget",
      requires: [],
      size: { width: 10, height: 10 },
      optionsSchema: {
        parse: () => ({
          include_forks: true,
          now: new Date(0),
          seed: 999,
          language: "zh-TW",
          timezone: "Asia/Tokyo",
        }),
      },
      describe: () => ({ title: "t", desc: "d" }),
      renderBody: (_data, _theme, opts) => {
        capturedOpts = opts as unknown as Record<string, unknown>;
        return "";
      },
    };
    if (!get("test-fake-opts-widget")) {
      register(fakeWidget);
    }

    const cards = resolveCards(config({ cards: [{ type: "test-fake-opts-widget" }] }));
    renderAllCards(
      cards,
      zeroCapabilityProfileData(),
      { now: new Date("2026-01-01T00:00:00Z"), seed: 1, language: "en" },
      EDITORIAL_THEMES,
    );

    expect(capturedOpts?.now).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(capturedOpts?.seed).toBe(1);
    expect(capturedOpts?.language).toBe("en");
    expect(capturedOpts?.timezone).toBe("UTC");
    expect(capturedOpts?.include_forks).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Plan 01 Task 1: MAST-01/02/03 — cross-card citation + page
// numbering, and the "identity" capability's fetch-path change.
// ---------------------------------------------------------------------------

function registerOnce(widget: WidgetDefinition<any>): void {
  if (!get(widget.name)) {
    register(widget);
  }
}

// The pipeline's `hasMasthead` check is a literal `widget.name === "masthead"`
// (matching the real production widget) — the registry only allows one
// object under that name per module instance, so these fixtures are
// singletons with mutable capture/fact state that each test resets, rather
// than a fresh per-test registration (which would throw DuplicateWidgetError
// on the second test).
let mastheadCapture: (opts: Record<string, unknown>) => void = () => {};
let contentACapture: (opts: Record<string, unknown>) => void = () => {};
let contentBCapture: (opts: Record<string, unknown>) => void = () => {};
let contentAFacts: Record<string, { label: string; value: string }> = {};

function ensureMastheadFixtures(): void {
  registerOnce({
    name: "masthead",
    requires: ["identity"],
    size: { width: 10, height: 10 },
    optionsSchema: { parse: () => ({ now: new Date(0), seed: 0, language: "en", timezone: "UTC" }) },
    describe: () => ({ title: "masthead", desc: "masthead desc" }),
    renderBody: (_data, _theme, opts) => {
      mastheadCapture(opts as unknown as Record<string, unknown>);
      return "";
    },
  });
  registerOnce({
    name: "t3-content-a",
    requires: [],
    size: { width: 10, height: 10 },
    optionsSchema: { parse: () => ({ now: new Date(0), seed: 0, language: "en", timezone: "UTC" }) },
    describe: () => ({ title: "Content A", desc: "d" }),
    renderBody: (_data, _theme, opts) => {
      contentACapture(opts as unknown as Record<string, unknown>);
      return "";
    },
    citableFacts: () => contentAFacts,
  });
  registerOnce({
    name: "t3-content-b",
    requires: [],
    size: { width: 10, height: 10 },
    optionsSchema: { parse: () => ({ now: new Date(0), seed: 0, language: "en", timezone: "UTC" }) },
    describe: () => ({ title: "Content B", desc: "d" }),
    renderBody: (_data, _theme, opts) => {
      contentBCapture(opts as unknown as Record<string, unknown>);
      return "";
    },
  });
}

describe("renderAllCards — masthead citation & page numbering (MAST-01/02/03)", () => {
  it("masthead present, one content card exposes totalCommits: contents/pageNumber/totalPages/citedFacts all correct, masthead excluded from its own contents/numbering", () => {
    ensureMastheadFixtures();
    let mastheadOpts: Record<string, unknown> = {};
    let aOpts: Record<string, unknown> = {};
    let bOpts: Record<string, unknown> = {};
    mastheadCapture = (o) => (mastheadOpts = o);
    contentACapture = (o) => (aOpts = o);
    contentBCapture = (o) => (bOpts = o);
    contentAFacts = { totalCommits: { label: "X", value: "9" } };

    const cards = resolveCards(
      config({ cards: [{ type: "t3-content-a" }, { type: "masthead" }, { type: "t3-content-b" }] }),
    );

    renderAllCards(cards, zeroCapabilityProfileData(), GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    expect((mastheadOpts.contents as unknown[]).length).toBe(2);
    expect(mastheadOpts.contents).toEqual([
      { id: "t3-content-a", title: "Content A", pageNumber: 1 },
      { id: "t3-content-b", title: "Content B", pageNumber: 2 },
    ]);
    expect(mastheadOpts.citedFacts).toEqual({ totalCommits: { label: "X", value: "9" } });
    // Masthead itself never receives a page number/totalPages — it's front
    // matter, not a numbered page (Q2, locked by UI-SPEC's Page Numbering
    // Display Contract: "the masthead itself never receives a page number").
    expect(mastheadOpts.pageNumber).toBeUndefined();
    expect(mastheadOpts.totalPages).toBeUndefined();

    expect(aOpts.pageNumber).toBe(1);
    expect(aOpts.totalPages).toBe(2);
    expect(bOpts.pageNumber).toBe(2);
    expect(bOpts.totalPages).toBe(2);
  });

  it("masthead present but no content card exposes citableFacts: citedFacts.totalCommits is undefined, not 0/empty", () => {
    ensureMastheadFixtures();
    let mastheadOpts: Record<string, unknown> = {};
    mastheadCapture = (o) => (mastheadOpts = o);
    contentACapture = () => {};
    contentBCapture = () => {};
    contentAFacts = {};

    const cards = resolveCards(
      config({ cards: [{ type: "t3-content-a" }, { type: "masthead" }, { type: "t3-content-b" }] }),
    );

    renderAllCards(cards, zeroCapabilityProfileData(), GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    expect((mastheadOpts.citedFacts as { totalCommits?: unknown }).totalCommits).toBeUndefined();
  });

  it("no masthead in the enabled set: every card's pageNumber/totalPages stay undefined (regression, existing almanac x2 set)", () => {
    ensureMastheadFixtures();
    let capturedA: Record<string, unknown> | undefined;
    contentACapture = (o) => (capturedA = o);
    contentBCapture = () => {};
    contentAFacts = {};

    // A card set with NO masthead present at all, mixing the fake fixture
    // with a real almanac card.
    const mixedCards = resolveCards(config({ cards: [{ type: "almanac" }, { type: "t3-content-a" }] }));
    renderAllCards(mixedCards, zeroCapabilityProfileData(), GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    expect(capturedA?.pageNumber).toBeUndefined();
    expect(capturedA?.totalPages).toBeUndefined();

    // Existing byte-output regression: the almanac-only path still renders
    // unchanged (no pipeline behavior change when no masthead is enabled).
    const cards = resolveCards(
      config({ cards: [{ type: "almanac" }, { type: "almanac", id: "almanac-utc" }] }),
    );
    const rendered = renderAllCards(cards, zeroCapabilityProfileData(), GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    expect(rendered).toHaveLength(2);
  });

  it("PageNumberInvariantError is exported and constructs a message naming the card id and both field values", () => {
    const error = new PageNumberInvariantError("some-card", 1, undefined);
    expect(error.name).toBe("PageNumberInvariantError");
    expect(error.message).toContain("some-card");
    expect(error.message).toContain("1");
    expect(error.message).toContain("undefined");
  });
});

describe("resolveCards + fetchSharedData — the 'identity' DataCapability (MAST-01)", () => {
  it("a masthead-only card set has a non-empty collectCapabilities() and calls fetchImpl exactly once (not the zero-capability fast path)", async () => {
    ensureMastheadFixtures();
    mastheadCapture = () => {};
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config({ cards: [{ type: "masthead" }] }));

    const capabilities = new Set(cards.flatMap((c) => c.widget.requires));
    expect(capabilities.size).toBeGreaterThan(0);

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);
    expect(calls).toHaveLength(1);
  });

  it("an almanac-only card set is unaffected (DATA-03's zero-capability guarantee still holds)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config());

    const capabilities = new Set(cards.flatMap((c) => c.widget.requires));
    expect(capabilities.size).toBe(0);

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Plan 03-05: full four-card integration (Almanac, Editorial Stat Card, The
// Graveyard, Masthead) — the phase's ROADMAP.md success criteria 1/2/3,
// proven for real against the complete v1 card set rather than the minimal
// fake-widget fixtures each earlier plan used.
// ---------------------------------------------------------------------------

/**
 * A `StatsQueryResult`-shaped body satisfying BOTH the "stats" and
 * "repoList" capability query shapes at once — mirrors `fixtureResponseBody`
 * above, extended with `statsRepos`/`graveyardRepos` (the current
 * `core/fetch.ts` field names, post-03-02's alias rename) so a single fetch
 * response can drive all four cards.
 */
function fixtureResponseBodyWithRepoList(totalCommits = 9) {
  return {
    data: {
      user: {
        login: "octocat",
        name: "The Octocat",
        avatarUrl: "https://example.com/avatar.png",
        followers: { totalCount: 5 },
        contributionsCollection: {
          restrictedContributionsCount: 0,
          totalCommitContributions: totalCommits,
          totalIssueContributions: 1,
          totalPullRequestContributions: 1,
          commitContributionsByRepository: [
            { contributions: { totalCount: totalCommits }, repository: { isFork: false } },
          ],
          issueContributionsByRepository: [],
          pullRequestContributionsByRepository: [],
        },
        statsRepos: { nodes: [] },
        graveyardRepos: {
          nodes: [
            {
              name: "old-project",
              nameWithOwner: "octocat/old-project",
              url: "https://github.com/octocat/old-project",
              createdAt: "2020-01-01T00:00:00Z",
              pushedAt: "2020-06-01T00:00:00Z",
              isFork: false,
            },
          ],
        },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

/** Same recording-fetch shape as `recordingFetch()` above, responding with
 * `fixtureResponseBodyWithRepoList()` instead. */
function recordingFetchWithRepoList(
  totalCommits = 9,
): { fetchImpl: FetchImpl; calls: { query: string; variables: unknown }[] } {
  const calls: { query: string; variables: unknown }[] = [];
  const fetchImpl: FetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query: string; variables: unknown };
    calls.push(body);
    return new Response(JSON.stringify(fixtureResponseBodyWithRepoList(totalCommits)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchImpl;
  return { fetchImpl, calls };
}

/**
 * A `ProfileData` carrying a non-trivial `repositories` array — at least one
 * repo buried well past the 180-day threshold (relative to this file's
 * `NOW`), so The Graveyard renders its populated (non-empty) state rather
 * than the empty-state caption, making the "all four cards carry real
 * content" integration meaningfully non-trivial.
 */
function profileDataWithRepos(totalCommits: number): ProfileData {
  return {
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "",
    followers: 9,
    fetchedAt: new Date().toISOString(),
    stats: { totalCommits, totalPRs: 3, totalIssues: 1, totalStars: 42 },
    repositories: [
      {
        name: "old-project",
        nameWithOwner: "octocat/old-project",
        url: "https://github.com/octocat/old-project",
        createdAt: "2020-01-01T00:00:00Z",
        pushedAt: "2020-06-01T00:00:00Z",
        isFork: false,
      },
    ],
  };
}

const FOUR_CARD_CONFIG_CARDS = [
  { type: "masthead" },
  { type: "almanac" },
  { type: "editorial-stat-card" },
  { type: "the-graveyard" },
];

describe("Plan 03-05: 四卡完整組合（MAST-01/02/03 收尾）", () => {
  it("resolveCards/fetchSharedData/renderAllCards 給定四卡（masthead 在陣列第一個，D-08 位置無關性）：回傳 4 張 RenderedCard", async () => {
    ensureMastheadFixtures();
    mastheadCapture = () => {};

    const { fetchImpl } = recordingFetchWithRepoList();
    const cards = resolveCards(config({ cards: FOUR_CARD_CONFIG_CARDS }));

    const { data } = await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);
    const rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    expect(rendered).toHaveLength(4);
  });

  it("spy masthead + 三張真實卡片（masthead 在陣列第一個，D-08）：contents 長度 3、依序 almanac/editorial-stat-card/the-graveyard、（真實卡片的）totalPages=3、citedFacts.totalCommits 深比對 editorialStatCardWidget.citableFacts()", () => {
    ensureMastheadFixtures();
    let mastheadOpts: Record<string, unknown> = {};
    mastheadCapture = (o) => (mastheadOpts = o);

    // The masthead's own opts never carry pageNumber/totalPages (D2, Plan
    // 03-01 SUMMARY.md: "masthead itself never receives a page number") —
    // core/pipeline.ts's Pass 4 only injects `contents`/`citedFacts` onto
    // the masthead's opts, and `pageNumber`/`totalPages` onto every OTHER
    // card's opts. Proving "totalPages 為 3" therefore requires capturing a
    // real CONTENT card's opts, not the masthead's — wrap the real
    // editorial-stat-card widget so its actually-rendered opts are visible
    // to this test while its own renderBody still runs unmodified.
    let statOpts: Record<string, unknown> = {};
    const capturingStatCard: WidgetDefinition<any> = {
      ...editorialStatCardWidget,
      renderBody(data, theme, opts) {
        statOpts = opts as unknown as Record<string, unknown>;
        return editorialStatCardWidget.renderBody(data, theme, opts);
      },
    };

    const mastheadEntry: ResolvedCard = {
      id: "masthead",
      widget: get("masthead") as WidgetDefinition<any>,
      parsedOptions: (get("masthead") as WidgetDefinition<any>).optionsSchema.parse(
        {},
      ) as unknown as Record<string, unknown>,
      timezone: "UTC",
    };
    const almanacEntry: ResolvedCard = {
      id: "almanac",
      widget: almanacWidget,
      parsedOptions: almanacWidget.optionsSchema.parse({}) as unknown as Record<string, unknown>,
      timezone: "UTC",
    };
    const statEntry: ResolvedCard = {
      id: "editorial-stat-card",
      widget: capturingStatCard,
      parsedOptions: editorialStatCardWidget.optionsSchema.parse({}) as unknown as Record<
        string,
        unknown
      >,
      timezone: "UTC",
    };
    const graveyardEntry: ResolvedCard = {
      id: "the-graveyard",
      widget: theGraveyardWidget,
      parsedOptions: theGraveyardWidget.optionsSchema.parse({}) as unknown as Record<string, unknown>,
      timezone: "UTC",
    };
    const cards: ResolvedCard[] = [mastheadEntry, almanacEntry, statEntry, graveyardEntry];
    const data = profileDataWithRepos(12345);

    renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    const contents = mastheadOpts.contents as { id: string; title: string; pageNumber: number }[];
    expect(contents).toEqual([
      {
        id: "almanac",
        title: almanacWidget.describe(data, GLOBAL_RENDER_OPTS as RenderOptions).title,
        pageNumber: 1,
      },
      {
        id: "editorial-stat-card",
        title: editorialStatCardWidget.describe(data, GLOBAL_RENDER_OPTS as RenderOptions).title,
        pageNumber: 2,
      },
      {
        id: "the-graveyard",
        title: theGraveyardWidget.describe(data, GLOBAL_RENDER_OPTS as RenderOptions).title,
        pageNumber: 3,
      },
    ]);
    expect(statOpts.totalPages).toBe(3);
    expect(statOpts.pageNumber).toBe(2);

    const expectedFact = editorialStatCardWidget.citableFacts?.(data, GLOBAL_RENDER_OPTS as RenderOptions);
    const citedFacts = mastheadOpts.citedFacts as { totalCommits?: unknown };
    expect(citedFacts.totalCommits).toEqual(expectedFact?.totalCommits);
  });

  it('同一組四卡組合，data.stats.totalCommits 換一個不同數字：citedFacts.totalCommits.value 跟著改變，與 formatStatNumber(newValue, "en") 一致（不是任何寫死的舊值）', () => {
    ensureMastheadFixtures();
    let mastheadOpts: Record<string, unknown> = {};
    mastheadCapture = (o) => (mastheadOpts = o);

    const cards = resolveCards(config({ cards: FOUR_CARD_CONFIG_CARDS }));
    const newValue = 987654;
    const data = profileDataWithRepos(newValue);

    renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    const citedFacts = mastheadOpts.citedFacts as { totalCommits?: { label: string; value: string } };
    expect(citedFacts.totalCommits?.value).toBe(formatStatNumber(newValue, "en"));
  });

  it("Almanac + Editorial Stat Card + The Graveyard（不含 masthead）：renderAllCards 的 light/dark 與各自直接呼叫 renderPair（同一組 opts，pageNumber/totalPages 顯式 undefined）逐位元組相同", () => {
    // renderAllCards's own return value (RenderedCard.light/dark) is the
    // FULL wrapped <svg> document (core/svg.ts's wrapSvg), not the bare
    // widget.renderBody() markup — so the byte-identical comparison this
    // test proves is against renderPair (the same function renderAllCards
    // calls internally per card), constructed directly from each card's own
    // resolved parsedOptions/timezone with pageNumber/totalPages explicitly
    // undefined. This is the plan's literal renderBody-vs-renderBody
    // comparison, generalized to account for the SVG wrapper every card
    // actually returns through the real pipeline (see 03-05-SUMMARY.md).
    const cards = resolveCards(
      config({
        cards: [{ type: "almanac" }, { type: "editorial-stat-card" }, { type: "the-graveyard" }],
      }),
    );
    const data = profileDataWithRepos(12345);

    const rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    const widgets = [almanacWidget, editorialStatCardWidget, theGraveyardWidget];
    widgets.forEach((widget, i) => {
      const card = cards[i] as ResolvedCard;
      const rc = rendered[i] as RenderedCard;
      const directOpts = {
        ...card.parsedOptions,
        now: GLOBAL_RENDER_OPTS.now,
        seed: GLOBAL_RENDER_OPTS.seed,
        language: GLOBAL_RENDER_OPTS.language,
        timezone: card.timezone,
        pageNumber: undefined,
        totalPages: undefined,
      } as RenderOptions;

      const direct = renderPair(widget, data, directOpts, EDITORIAL_THEMES);
      expect(rc.light).toBe(direct.light);
      expect(rc.dark).toBe(direct.dark);
    });
  });

  it("真正的 mastheadWidget（不是 spy）搭配另外三張真實卡片：renderAllCards 不拋例外，masthead 的 light/dark 皆含 <svg 與至少一個 <path、不含 <text", () => {
    // mastheadWidget is used directly here (never `register()`-ed under
    // "masthead" in this file — see the beforeAll comment above) by
    // constructing its ResolvedCard by hand rather than through
    // resolveCards()/the registry, sidestepping the DuplicateWidgetError
    // that would otherwise collide with this file's pre-existing fake
    // "masthead" spy fixture.
    const nonMastheadCards = resolveCards(
      config({
        cards: [{ type: "almanac" }, { type: "editorial-stat-card" }, { type: "the-graveyard" }],
      }),
    );
    const mastheadCard: ResolvedCard = {
      id: "masthead",
      widget: mastheadWidget,
      parsedOptions: mastheadWidget.optionsSchema.parse({}) as unknown as Record<string, unknown>,
      timezone: "UTC",
    };
    const cards: ResolvedCard[] = [mastheadCard, ...nonMastheadCards];
    const data = profileDataWithRepos(12345);

    let rendered: RenderedCard[] = [];
    expect(() => {
      rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    }).not.toThrow();

    const masthead = rendered.find((c) => c.id === "masthead");
    expect(masthead).toBeDefined();
    expect(masthead?.light).toContain("<svg");
    expect(masthead?.dark).toContain("<svg");
    expect(masthead?.light).toContain("<path");
    expect(masthead?.dark).toContain("<path");
    expect(masthead?.light).not.toContain("<text");
    expect(masthead?.dark).not.toContain("<text");
  });
});
