import { beforeAll, describe, expect, it, vi } from "vitest";
import * as fontModule from "./font.js";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";
import { editorialStatCardWidget } from "../widgets/editorial-stat-card/index.js";
import { formatStatNumber } from "../widgets/editorial-stat-card/format.js";
import { mastheadWidget } from "../widgets/masthead/index.js";
import { theGraveyardWidget } from "../widgets/the-graveyard/index.js";
import { needleCaptionEn } from "../widgets/the-record/copy.js";
import { theRecordWidget } from "../widgets/the-record/index.js";
import type { ResolvedConfig } from "./config.js";
import { calendarWindowFrom, type FetchImpl, zeroCapabilityProfileData } from "./fetch.js";
import type { ProfileData, RenderOptions } from "./model.js";
import { optimizeSvg } from "./optimize.js";
import {
  ConflictingCalendarTimezoneError,
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
import { collectCapabilities, get, register, type CitableFact } from "./registry.js";
import type { WidgetDefinition } from "./registry.js";
import { renderPair, SOFT_SIZE_BUDGET_BYTES } from "./svg.js";

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

/**
 * A `ResolvedCard` for `the-record` built by hand, exactly the way this
 * file's existing masthead fixtures avoid the registry's no-unregister
 * limitation (see the `beforeAll` comment above): `theRecordWidget` declares
 * `requires: ["calendar"]`, which is all `fetchSharedData`'s calendar-window
 * derivation logic needs to see.
 */
function theRecordCard(id: string, timezone: string): ResolvedCard {
  return {
    id,
    widget: theRecordWidget,
    parsedOptions: theRecordWidget.optionsSchema.parse({}) as unknown as Record<string, unknown>,
    timezone,
  };
}

describe("Plan 04-01 Task 3: fetchSharedData — calendar capability composition (CARD-04/D-01)", () => {
  it("a card set including the-record produces a capability union containing 'calendar', and derives the window as calendarWindowFrom(now, card.timezone)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = [theRecordCard("the-record", "UTC")];

    const capabilities = new Set(cards.flatMap((c) => c.widget.requires));
    expect(capabilities.has("calendar")).toBe(true);

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(1);
    const variables = calls[0]?.variables as { from?: string };
    expect(variables.from).toBe(calendarWindowFrom(NOW, "UTC"));
  });

  it("derives the window from a non-UTC timezone the same way (1 January UTC instant of the zoned year)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = [theRecordCard("the-record", "Asia/Taipei")];

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    const variables = calls[0]?.variables as { from?: string };
    expect(variables.from).toBe(calendarWindowFrom(NOW, "Asia/Taipei"));
  });

  it("throws ConflictingCalendarTimezoneError naming both card ids when two calendar cards declare divergent timezones", async () => {
    const { fetchImpl } = recordingFetch();
    const cards = [theRecordCard("record-utc", "UTC"), theRecordCard("record-tpe", "Asia/Taipei")];

    let caught: unknown;
    try {
      await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictingCalendarTimezoneError);
    const message = (caught as Error).message;
    expect(message).toContain("record-utc");
    expect(message).toContain("record-tpe");
  });

  it("a card set with no calendar-requiring card still issues exactly one request whose query declares no $from variable", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config({ cards: [{ type: "editorial-stat-card" }] }));

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).not.toContain("$from");
    expect(calls[0]?.query).not.toContain("DateTime");
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

  /**
   * Plan 04-04 Task 3: the reverse direction of the same one-defined-
   * one-undefined condition. `renderAllCards`'s own doc comment on
   * PageNumberInvariantError states the guard is unreachable through the
   * public API (both fields are always assigned together, from the same
   * object-spread) — so, like the test above, this exercises the error
   * class's own message construction directly rather than trying to force
   * the unreachable branch through renderAllCards.
   */
  it("PageNumberInvariantError also names both field values when pageNumber (not totalPages) is the undefined one", () => {
    const error = new PageNumberInvariantError("other-card", undefined, 4);
    expect(error.name).toBe("PageNumberInvariantError");
    expect(error.message).toContain("other-card");
    expect(error.message).toContain("undefined");
    expect(error.message).toContain("4");
  });
});

/**
 * Plan 04-04 Task 3 (QA-01): capability composition over the REAL, complete
 * v1 widget set — every card genuinely registrable in this project, not a
 * hand-picked subset. Guards against a future card silently widening (or
 * narrowing) the union `fetchSharedData` derives its single shared query
 * from.
 */
describe("Plan 04-04 Task 3: collectCapabilities — the real v1 widget set (QA-01)", () => {
  it("unions exactly the capabilities the five real widgets declare, and nothing else", () => {
    const allFiveWidgets = [
      almanacWidget,
      editorialStatCardWidget,
      mastheadWidget,
      theGraveyardWidget,
      theRecordWidget,
    ];

    const capabilities = collectCapabilities(allFiveWidgets);

    expect(capabilities).toEqual(new Set(["stats", "identity", "repoList", "calendar"]));
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

  it("Almanac + Editorial Stat Card + The Graveyard（不含 masthead）：renderAllCards 的 light/dark 與各自直接呼叫 renderPair 再套用 optimizeSvg（同一組 opts，pageNumber/totalPages 顯式 undefined）逐位元組相同", () => {
    // renderAllCards's own return value (RenderedCard.light/dark) is the
    // FULL wrapped <svg> document (core/svg.ts's wrapSvg) AFTER Plan 04-01
    // Task 2's optimizeSvg pass (RENDER-08), not the bare renderPair output
    // — so the byte-identical comparison this test proves is against
    // renderPair's own output run through optimizeSvg (the same two calls
    // renderAllCards makes internally per card), constructed directly from
    // each card's own resolved parsedOptions/timezone with
    // pageNumber/totalPages explicitly undefined. This is the plan's literal
    // renderBody-vs-renderBody comparison, generalized to account for both
    // the SVG wrapper and the optimize pass every card actually goes through
    // in the real pipeline (see 03-05-SUMMARY.md / 04-01-SUMMARY.md).
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
      expect(rc.light).toBe(optimizeSvg(direct.light));
      expect(rc.dark).toBe(optimizeSvg(direct.dark));
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

// ---------------------------------------------------------------------------
// Plan 04-05 Task 1: the full five-widget composition (CARD-04/RENDER-06/
// RENDER-08/QA-01) — one composed query, exactly one animated card, both
// size-guard layers, non-colliding masthead contents row, and the MAST-03
// standalone-degradation contract extended to The Record.
// ---------------------------------------------------------------------------

const MS_PER_DAY_TEST = 86_400_000;

/**
 * A partial-year daily calendar (2026-01-01 .. NOW = 2026-08-07, this file's
 * own `NOW`) with a deliberate seven-day busiest week and several scattered
 * all-zero days, so The Record's busiest-week/silent-weeks rows and its
 * groove ink both have real signal rather than an all-zero fixture.
 */
function fiveWidgetCalendarDays(): { date: string; contributionCount: number }[] {
  const days: { date: string; contributionCount: number }[] = [];
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 7, 7);
  let i = 0;
  for (let ms = start; ms <= end; ms += MS_PER_DAY_TEST, i++) {
    let contributionCount: number;
    if (i >= 60 && i < 67) {
      contributionCount = 25; // the deliberate busiest week
    } else if (i % 9 === 0) {
      contributionCount = 0; // scattered silent days
    } else {
      contributionCount = (i % 4) + 1;
    }
    days.push({ date: new Date(ms).toISOString().slice(0, 10), contributionCount });
  }
  return days;
}

/**
 * A `StatsQueryResult`-shaped body satisfying all four capabilities the real
 * five-widget set unions at once (stats, identity, repoList, calendar) —
 * extends `fixtureResponseBodyWithRepoList`'s stats/repoList shape with a
 * `calendar` alias carrying `fiveWidgetCalendarDays()`.
 */
function fixtureResponseBodyFiveWidgets(totalCommits = 9) {
  const contributionDays = fiveWidgetCalendarDays();
  const totalContributions = contributionDays.reduce((sum, d) => sum + d.contributionCount, 0);
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
        calendar: {
          contributionCalendar: {
            totalContributions,
            weeks: [{ firstDay: "2026-01-01", contributionDays }],
          },
        },
      },
      rateLimit: { cost: 1, limit: 5000, remaining: 4999 },
    },
  };
}

/** Same recording-fetch shape as `recordingFetch()`/`recordingFetchWithRepoList()`
 * above, responding with `fixtureResponseBodyFiveWidgets()` instead. */
function recordingFetchFiveWidgets(
  totalCommits = 9,
): { fetchImpl: FetchImpl; calls: { query: string; variables: unknown }[] } {
  const calls: { query: string; variables: unknown }[] = [];
  const fetchImpl: FetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query: string; variables: unknown };
    calls.push(body);
    return new Response(JSON.stringify(fixtureResponseBodyFiveWidgets(totalCommits)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchImpl;
  return { fetchImpl, calls };
}

/**
 * A `ResolvedCard` built by hand from a real widget object, bypassing the
 * registry entirely — same convention `theRecordCard()` above and Plan
 * 03-05's own "真正的 mastheadWidget" test already use, and the only way to
 * get masthead + the-record's REAL (non-spy) widgets into one card set in
 * this file, since the registry has no unregister/replace primitive and this
 * file's masthead fixtures above already claim the name "masthead".
 */
function manualCard(id: string, widget: WidgetDefinition<any>, timezone = "UTC"): ResolvedCard {
  return {
    id,
    widget,
    parsedOptions: widget.optionsSchema.parse({}) as unknown as Record<string, unknown>,
    timezone,
  };
}

/**
 * Wraps a real widget so every `renderBody` call's fully-merged `opts`
 * (post pipeline injection of pageNumber/totalPages/contents/citedFacts) is
 * captured into `sink[widget.name]`, without altering what actually renders
 * — mirrors this file's own `capturingStatCard` shim above (Plan 03-05),
 * generalized to any widget.
 */
function capturingWidget(
  widget: WidgetDefinition<any>,
  sink: Record<string, Record<string, unknown>>,
): WidgetDefinition<any> {
  return {
    ...widget,
    renderBody(data: ProfileData, theme: any, opts: any) {
      sink[widget.name] = opts as Record<string, unknown>;
      return widget.renderBody(data, theme, opts);
    },
  };
}

const FIVE_WIDGETS_IN_ORDER: { id: string; widget: WidgetDefinition<any> }[] = [
  { id: "masthead", widget: mastheadWidget },
  { id: "almanac", widget: almanacWidget },
  { id: "editorial-stat-card", widget: editorialStatCardWidget },
  { id: "the-graveyard", widget: theGraveyardWidget },
  { id: "the-record", widget: theRecordWidget },
];

describe("Plan 04-05 Task 1: 五卡完整組合（CARD-04/RENDER-06/RENDER-08/QA-01 收尾）", () => {
  it("one composed query for the real five-widget set: capability union is exactly {stats, identity, repoList, calendar}, the single request's query carries the stats fragment + repo-list alias + calendar alias with $from declared exactly once", async () => {
    const capabilities = collectCapabilities(FIVE_WIDGETS_IN_ORDER.map((c) => c.widget));
    expect(capabilities).toEqual(new Set(["stats", "identity", "repoList", "calendar"]));

    const cards = FIVE_WIDGETS_IN_ORDER.map(({ id, widget }) => manualCard(id, widget));
    const { fetchImpl, calls } = recordingFetchFiveWidgets();

    await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    expect(calls).toHaveLength(1);
    const query = calls[0]?.query as string;
    // Stats fragment (default include_forks: false — the exclude-forks shape).
    expect(query).toContain("commitContributionsByRepository");
    // Repo-list alias (The Graveyard, CARD-03).
    expect(query).toContain("graveyardRepos:");
    // Calendar alias (The Record, CARD-04).
    expect(query).toContain("calendar: contributionsCollection(from: $from)");
    // $from declared exactly once in the operation header — not twice, and
    // not omitted (GraphQL's All-Variables-Used rule).
    expect((query.match(/\$from: DateTime!/g) ?? []).length).toBe(1);
  });

  it("renders all five real widgets through renderAllCards: 5 rendered cards, both size-guard layers pass with the largest observed byte size reported, exactly one animated card (The Record), and every non-masthead card carries a page number while the masthead carries none", async () => {
    const capturedOpts: Record<string, Record<string, unknown>> = {};
    const cards = FIVE_WIDGETS_IN_ORDER.map(({ id, widget }) =>
      manualCard(id, capturingWidget(widget, capturedOpts)),
    );

    const { fetchImpl } = recordingFetchFiveWidgets();
    const { data } = await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    const rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);
    expect(rendered).toHaveLength(5);

    // Both size-guard layers already ran INSIDE renderAllCards (a failure
    // would have thrown SizeBudgetError before any RenderedCard came back) —
    // this additionally records the largest observed byte size so the
    // record-card overflow backstop (04-UI-SPEC.md "overflow") has a real
    // measured number rather than an estimate.
    const allByteSizes = rendered.flatMap((rc) => [
      Buffer.byteLength(rc.light, "utf8"),
      Buffer.byteLength(rc.dark, "utf8"),
    ]);
    const maxBytes = Math.max(...allByteSizes);
    // eslint-disable-next-line no-console -- deliberate: this is the measured
    // number the record-card overflow backstop needs, not debug noise.
    console.log(
      `[04-05 Task 1] largest observed rendered byte size across the five-widget set: ${maxBytes} bytes (soft budget ${SOFT_SIZE_BUDGET_BYTES} bytes)`,
    );
    expect(
      maxBytes,
      `largest observed rendered byte size across the five-widget set: ${maxBytes} bytes (soft budget ${SOFT_SIZE_BUDGET_BYTES} bytes)`,
    ).toBeLessThanOrEqual(SOFT_SIZE_BUDGET_BYTES);

    // Exactly one animated CARD across the whole rendered set, and it is The
    // Record's — a future card that starts animating fails this test rather
    // than quietly stacking compositor work.
    const animatedCardIds = rendered
      .filter((rc) => rc.light.includes("@keyframes") || rc.dark.includes("@keyframes"))
      .map((rc) => rc.id);
    expect(animatedCardIds).toEqual(["the-record"]);

    // Page-number distribution: the masthead is excluded from its own
    // numbering (Q2, unchanged Phase 3 contract); every other card gets one.
    expect(capturedOpts.masthead?.pageNumber).toBeUndefined();
    expect(capturedOpts.masthead?.totalPages).toBeUndefined();
    for (const id of ["almanac", "editorial-stat-card", "the-graveyard", "the-record"]) {
      expect(capturedOpts[id]?.pageNumber, id).toBeDefined();
      expect(capturedOpts[id]?.totalPages, id).toBe(4);
    }
  });

  it("the masthead's contents row, genuinely composed from all four non-masthead cards, never collides with the citation: contents right edge is strictly left of the citation's left edge", async () => {
    const capturedOpts: Record<string, Record<string, unknown>> = {};
    const cards = FIVE_WIDGETS_IN_ORDER.map(({ id, widget }) =>
      manualCard(id, capturingWidget(widget, capturedOpts)),
    );

    const { fetchImpl } = recordingFetchFiveWidgets();
    const { data } = await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    const spy = vi.spyOn(fontModule, "assertCoverage");
    renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    // The masthead's own renderBody calls assertCoverage("mono-semibold",
    // <the exact post-truncation contents string>, ...) once per theme call
    // — this observes the REAL rendered string, not an independently
    // recomputed prediction (mirrors widgets/masthead/index.test.ts's own
    // `renderAndCaptureContentsText` technique, applied here through the
    // real pipeline instead of calling renderBody directly).
    const contentsCall = spy.mock.calls.find(
      (c) => c[0] === "mono-semibold" && typeof c[1] === "string" && (c[1] as string).startsWith("CONTENTS"),
    );
    spy.mockRestore();
    expect(contentsCall).toBeDefined();
    const contentsText = contentsCall![1] as string;

    const mastheadOpts = capturedOpts.masthead as unknown as {
      citedFacts?: { totalCommits?: CitableFact };
    };
    const fact = mastheadOpts.citedFacts?.totalCommits;
    expect(fact).toBeDefined();

    // Mirrors masthead/index.ts's own module-private monoRunWidth/
    // citationWidth math (no public export exists — same duplication
    // widgets/masthead/index.test.ts already uses for the identical reason).
    const T1_SIZE = 8;
    const T1_LETTER_SPACING = 1.6;
    const PADDING = 24;
    const RIGHT_EDGE_X = 495 - PADDING;
    function monoRunWidth(text: string): number {
      const chars = Array.from(text);
      let width = 0;
      chars.forEach((ch, i) => {
        width +=
          fontModule.measureAdvanceWidth("mono-semibold", ch, T1_SIZE) +
          (i < chars.length - 1 ? T1_LETTER_SPACING : 0);
      });
      return width;
    }
    function citationWidth(value: string, label: string): number {
      return monoRunWidth(value) + monoRunWidth(" ") + monoRunWidth(label);
    }

    const contentsRightEdge = PADDING + monoRunWidth(contentsText);
    const citationLeftEdge = RIGHT_EDGE_X - citationWidth(fact!.value, fact!.label);
    expect(contentsRightEdge).toBeLessThan(citationLeftEdge);
  });

  it("masthead disabled: the other four cards still render, no card receives a page number, and The Record's needle caption still renders while its page-number footer contributes no markup (MAST-03 standalone degradation, extended to CARD-04)", async () => {
    const capturedOpts: Record<string, Record<string, unknown>> = {};
    const fourWidgets = FIVE_WIDGETS_IN_ORDER.filter((c) => c.id !== "masthead");
    const cards = fourWidgets.map(({ id, widget }) => manualCard(id, capturingWidget(widget, capturedOpts)));

    const { fetchImpl } = recordingFetchFiveWidgets();
    const { data } = await fetchSharedData(cards, "fake-token", "octocat", NOW, fetchImpl);

    const spy = vi.spyOn(fontModule, "assertCoverage");
    const rendered = renderAllCards(cards, data, GLOBAL_RENDER_OPTS, EDITORIAL_THEMES);

    expect(rendered).toHaveLength(4);
    for (const id of ["almanac", "editorial-stat-card", "the-graveyard", "the-record"]) {
      expect(capturedOpts[id]?.pageNumber, id).toBeUndefined();
      expect(capturedOpts[id]?.totalPages, id).toBeUndefined();
    }

    // The needle caption is unconditional (always renders) — its
    // assertCoverage call for the exact copy string must be present.
    const needleCall = spy.mock.calls.find((c) => c[0] === "mono-semibold" && c[1] === needleCaptionEn);
    // The page-number footer is gated on pageNumber/totalPages both being
    // defined — with no masthead enabled, neither is ever set, so index.ts's
    // own Composition §5 block never runs and contributes literally zero
    // additional markup (never even reaching an assertCoverage call).
    const pageFooterCall = spy.mock.calls.find(
      (c) => c[0] === "mono-semibold" && typeof c[1] === "string" && (c[1] as string).startsWith("PAGE "),
    );
    spy.mockRestore();

    expect(needleCall).toBeDefined();
    expect(pageFooterCall).toBeUndefined();
  });
});
