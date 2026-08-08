import { beforeAll, describe, expect, it } from "vitest";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";
import { editorialStatCardWidget } from "../widgets/editorial-stat-card/index.js";
import type { ResolvedConfig } from "./config.js";
import type { FetchImpl } from "./fetch.js";
import {
  fetchSharedData,
  InvalidCardOptionsError,
  renderAllCards,
  resolveCards,
  UnknownWidgetError,
} from "./pipeline.js";
import { get, register } from "./registry.js";

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

    const result = await fetchSharedData(cards, "fake-token", "octocat", fetchImpl);

    expect(calls).toHaveLength(0);
    expect(result.pointCost).toBe(0);
  });

  it("does not trigger the global fetch either when fetchImpl is omitted for a zero-capability card set", async () => {
    const cards = resolveCards(config());
    // No fetchImpl passed at all — if this reached fetchProfileData's default
    // (the real global `fetch`), a real network call would be attempted and
    // this test would fail/hang instead of resolving instantly.
    const result = await fetchSharedData(cards, "", "");
    expect(result.pointCost).toBe(0);
  });

  it("calls fetchImpl exactly once when multiple enabled cards share one 'stats' capability", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(
      config({ cards: [{ type: "almanac" }, { type: "editorial-stat-card" }] }),
    );

    await fetchSharedData(cards, "fake-token", "octocat", fetchImpl);

    expect(calls).toHaveLength(1);
  });

  it("derives includeForks:true from the stats card's real parsedOptions.include_forks", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(
      config({ cards: [{ type: "editorial-stat-card", options: { include_forks: true } }] }),
    );

    await fetchSharedData(cards, "fake-token", "octocat", fetchImpl);

    // The includeForks:true query shape never requests the per-repository
    // breakdown fields (core/fetch.ts's STATS_FRAGMENT_INCLUDE_FORKS).
    expect(calls[0]?.query).not.toContain("commitContributionsByRepository");
  });

  it("derives includeForks:false when include_forks is omitted (default)", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const cards = resolveCards(config({ cards: [{ type: "editorial-stat-card" }] }));

    await fetchSharedData(cards, "fake-token", "octocat", fetchImpl);

    expect(calls[0]?.query).toContain("commitContributionsByRepository");
  });
});

describe("renderAllCards", () => {
  it("renders one light/dark pair per card entry, in written order", () => {
    const cards = renderAllCards(
      config({ cards: [{ type: "almanac" }, { type: "almanac", id: "almanac-utc" }] }),
      GLOBAL_OPTS,
    );

    expect(cards.map((c) => c.id)).toEqual(["almanac", "almanac-utc"]);
    for (const card of cards) {
      expect(card.light).toContain("<svg");
      expect(card.dark).toContain("<svg");
      // The sandbox-safety invariant the whole phase rests on (RENDER-01).
      expect(card.light).not.toContain("<text");
      expect(card.dark).not.toContain("<text");
    }
  });

  it("defaults id to type, and uses an explicit id when given (D-10)", () => {
    expect(renderAllCards(config(), GLOBAL_OPTS)[0].id).toBe("almanac");
    expect(
      renderAllCards(config({ cards: [{ type: "almanac", id: "my-card" }] }), GLOBAL_OPTS)[0].id,
    ).toBe("my-card");
  });

  it("throws UnknownWidgetError for a type with no registered widget", () => {
    expect(() => renderAllCards(config({ cards: [{ type: "nope" }] }), GLOBAL_OPTS)).toThrow(
      UnknownWidgetError,
    );
  });

  it("rejects an unrecognized option key instead of ignoring it, and names it", () => {
    let caught: unknown;
    try {
      renderAllCards(
        config({ cards: [{ type: "almanac", options: { timezon: "Asia/Taipei" } }] }),
        GLOBAL_OPTS,
      );
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

  it("rejects a card-level language override (D-08)", () => {
    expect(() =>
      renderAllCards(
        config({ cards: [{ type: "almanac", options: { language: "zh-TW" } }] }),
        GLOBAL_OPTS,
      ),
    ).toThrow(InvalidCardOptionsError);
  });

  it("honors a per-card timezone override while language stays top-level (D-09)", () => {
    const [utc, taipei] = renderAllCards(
      config({
        timezone: "UTC",
        cards: [
          { type: "almanac", id: "a-utc" },
          { type: "almanac", id: "a-tpe", options: { timezone: "Asia/Taipei" } },
        ],
      }),
      { now: new Date("2026-08-07T20:00:00Z"), seed: 0 },
    );

    expect(utc.light).not.toBe(taipei.light);
  });

  it("is deterministic: same config and same now produce byte-identical output", () => {
    const a = renderAllCards(config(), GLOBAL_OPTS);
    const b = renderAllCards(config(), GLOBAL_OPTS);
    expect(a[0].light).toBe(b[0].light);
    expect(a[0].dark).toBe(b[0].dark);
  });
});
