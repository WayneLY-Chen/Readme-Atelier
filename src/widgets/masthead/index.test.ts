import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../core/config.js";
import * as fontModule from "../../core/font.js";
import { measureAdvanceWidth } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { resolveCards } from "../../core/pipeline.js";
import { get, register, type CitableFact } from "../../core/registry.js";
import { loadAllFonts } from "../../node/fonts.js";
import { almanacWidget } from "../almanac/index.js";
import { editorialStatCardWidget } from "../editorial-stat-card/index.js";
import { theGraveyardWidget } from "../the-graveyard/index.js";
import { theRecordWidget } from "../the-record/index.js";
import { mastheadWidget } from "./index.js";

function stubProfileData(login = "octocat"): ProfileData {
  return {
    login,
    name: null,
    avatarUrl: "",
    followers: 0,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  };
}

function optsFor(
  language: RenderOptions["language"],
  overrides: Partial<RenderOptions> = {},
): RenderOptions {
  return {
    now: new Date("2026-08-09T06:00:00Z"),
    seed: 0,
    timezone: "UTC",
    language,
    ...overrides,
  };
}

beforeAll(() => {
  loadAllFonts();
});

describe("mastheadWidget — identity (MAST-01)", () => {
  it("has the expected name, requires, and size", () => {
    expect(mastheadWidget.name).toBe("masthead");
    expect(mastheadWidget.requires).toEqual(["identity"]);
    expect(mastheadWidget.size).toEqual({ width: 495, height: 116 });
  });
});

describe("mastheadWidget.optionsSchema — no configurable options", () => {
  it("accepts an empty object / undefined", () => {
    expect(() => mastheadWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => mastheadWidget.optionsSchema.parse({})).not.toThrow();
  });

  it("rejects any option key (.strict())", () => {
    expect(() => mastheadWidget.optionsSchema.parse({ unknown_key: 1 })).toThrow();
  });
});

/**
 * WR-02/CR-01 regression: `resolveCards` (core/pipeline.ts) must strip the
 * reserved `options.timezone` key BEFORE handing the rest of `entry.options`
 * to a widget's own `optionsSchema.parse()` — masthead's `.strict()` schema
 * (`z.object({}).strict()`, no `timezone` field of its own) is exactly the
 * widget that let this regress silently, since almanac's own schema happens
 * to declare a `timezone` field and masked the bug there. Registered under a
 * throwaway name (not "masthead") to avoid colliding with `pipeline.test.ts`'s
 * pre-existing fake "masthead" spy fixture, which shares the module-level
 * registry within a Vitest worker — the real `mastheadWidget.optionsSchema`
 * (the actual object under test) is what's registered, just under a
 * different registry key, so `resolveCards`'s option-stripping code path is
 * exercised faithfully regardless of key name.
 */
describe("resolveCards + real mastheadWidget — D-09 timezone override (WR-02 regression)", () => {
  const TEST_WIDGET_NAME = "masthead-d09-regression-fixture";

  beforeAll(() => {
    if (!get(TEST_WIDGET_NAME)) {
      register({ ...mastheadWidget, name: TEST_WIDGET_NAME });
    }
  });

  it("honors a per-card options.timezone override without throwing, even though masthead declares no timezone field", () => {
    const config: ResolvedConfig = {
      theme: "editorial",
      language: "en",
      timezone: "UTC",
      cards: [{ type: TEST_WIDGET_NAME, options: { timezone: "Asia/Taipei" } }],
    };

    const [card] = resolveCards(config);

    expect(card.timezone).toBe("Asia/Taipei");
  });

  it("falls back to config.timezone when no per-card override is given", () => {
    const config: ResolvedConfig = {
      theme: "editorial",
      language: "en",
      timezone: "UTC",
      cards: [{ type: TEST_WIDGET_NAME }],
    };

    const [card] = resolveCards(config);

    expect(card.timezone).toBe("UTC");
  });
});

describe("mastheadWidget.describe", () => {
  it("en", () => {
    expect(mastheadWidget.describe(stubProfileData(), optsFor("en"))).toEqual({
      title: "Masthead card",
      desc:
        "Prints an issue number, render timestamp, and a contents list for every other enabled " +
        "card, plus a figure cited from the Editorial Stat Card when it is enabled.",
    });
  });

  it("zh-TW", () => {
    expect(mastheadWidget.describe(stubProfileData(), optsFor("zh-TW"))).toEqual({
      title: "刊頭卡片",
      desc: "列印期數、產出時間，以及其他已啟用卡片的目次；並引用雜誌統計卡的一項數據。",
    });
  });
});

describe("mastheadWidget.renderBody — structure", () => {
  it("renders no <text> elements and at least one <path>", () => {
    const body = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));
    expect(body).not.toContain("<text");
    expect(body).toContain("<path");
  });
});

describe("mastheadWidget.renderBody — citation presence/absence (MAST-02/03)", () => {
  it("renders more markup when opts.citedFacts.totalCommits is present than when it is undefined", () => {
    const withCitation = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      citedFacts: { totalCommits: { label: "COMMITS", value: "3,481" } },
    } as RenderOptions);
    const withoutCitation = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));

    expect(withCitation.length).toBeGreaterThan(withoutCitation.length);
  });

  it("citedFacts.totalCommits === undefined renders byte-identically to citedFacts omitted entirely", () => {
    const explicitUndefined = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      citedFacts: { totalCommits: undefined },
    } as RenderOptions);
    const omitted = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));

    expect(explicitUndefined).toBe(omitted);
  });
});

describe("mastheadWidget.renderBody — contents zero-one-many (MAST-01)", () => {
  it("contents: [] does not throw and still renders the CONTENTS label alone", () => {
    expect(() =>
      mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
        ...optsFor("en"),
        contents: [],
      } as RenderOptions),
    ).not.toThrow();
  });

  it("contents omitted entirely behaves the same as contents: []", () => {
    const withEmptyArray = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      contents: [],
    } as RenderOptions);
    const omitted = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));
    expect(withEmptyArray).toBe(omitted);
  });
});

// Minimal local Theme stub — avoids importing core/theme.ts's real palette
// just to exercise renderBody's structural shape (mirrors this project's
// other widget test files, which do import the real theme; done inline here
// to keep this file's only cross-directory import limited to model/fonts).
function lightThemeStub() {
  return {
    name: "editorial",
    mode: "light" as const,
    paper: "#F7F1E7",
    ink: "#302A25",
    accent: "#8B5E3C",
    rule: "#CDBDA8",
    muted: "#6B5B4B",
  };
}

/**
 * UI-SPEC "Masthead Contents Row Budget Retrofit" regression coverage
 * (CARD-04). index.ts's own layout constants/helpers (`RIGHT_EDGE_X`,
 * `CONTENTS_ROW_BUDGET_PX`, `CONTENTS_CITATION_GUTTER_PX`, `monoRunWidth`,
 * `zhLabelWidth`, `citationWidth`, `truncateContentsToWidth`) are
 * module-private, not exported — duplicated here the same way
 * `editorial-stat-card/index.test.ts`'s own `enLabelWidth` already
 * duplicates that widget's internal letter-spaced width math for exactly
 * the same reason (an internal layout helper with no public surface).
 */
describe("mastheadWidget.renderBody — contents-row budget retrofit (CARD-04, masthead-contents-row)", () => {
  const PADDING = 24;
  const CARD_WIDTH = 495;
  const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471 — mirrors index.ts
  const CONTENTS_ROW_BUDGET_PX = RIGHT_EDGE_X - PADDING; // 447 — mirrors index.ts
  const CONTENTS_CITATION_GUTTER_PX = 16; // mirrors index.ts's own `md` token
  const T1_SIZE = 8;
  const T1_LETTER_SPACING = 1.6;

  /** Mirrors index.ts's own `monoRunWidth`/`letterSpacedWidth`. */
  function monoRunWidth(text: string): number {
    const chars = Array.from(text);
    let width = 0;
    chars.forEach((ch, i) => {
      width +=
        measureAdvanceWidth("mono-semibold", ch, T1_SIZE) +
        (i < chars.length - 1 ? T1_LETTER_SPACING : 0);
    });
    return width;
  }

  /** Mirrors index.ts's own `zhLabelWidth` — plain advance-width sum, no
   * manual letter-spacing (Han script has none). */
  function zhLabelWidth(text: string): number {
    return measureAdvanceWidth("noto-tc", text, T1_SIZE);
  }

  function runWidthFor(language: RenderOptions["language"]): (text: string) => number {
    return language === "zh-TW" ? zhLabelWidth : monoRunWidth;
  }

  /** Mirrors index.ts's own `citationWidth`: `{value} {label}` measured with
   * the same language-branched split the citation itself renders with. */
  function citationWidth(value: string, label: string, language: RenderOptions["language"]): number {
    const runWidth = runWidthFor(language);
    return runWidth(value) + runWidth(" ") + runWidth(label);
  }

  /** Mirrors index.ts's own `truncateContentsToWidth` exactly (trim from the
   * end, append an ellipsis, first fit wins). */
  function truncateContentsToWidth(
    language: RenderOptions["language"],
    text: string,
    budgetPx: number,
  ): string {
    const measure = runWidthFor(language);
    if (measure(text) <= budgetPx) {
      return text;
    }
    const chars = Array.from(text);
    for (let end = chars.length; end > 0; end--) {
      const candidate = chars.slice(0, end).join("") + "...";
      if (measure(candidate) <= budgetPx) {
        return candidate;
      }
    }
    return "...";
  }

  const FOUR_CARDS = [almanacWidget, editorialStatCardWidget, theGraveyardWidget, theRecordWidget];
  const THREE_CARDS = [almanacWidget, editorialStatCardWidget, theGraveyardWidget];

  /** Builds the masthead `contents` array from the widgets' own
   * `describe().title` return values — not string literals duplicated in
   * this test — so a future title change re-triggers this check. */
  function contentsEntriesFor(
    widgets: typeof FOUR_CARDS,
    language: RenderOptions["language"],
  ): { id: string; title: string; pageNumber: number }[] {
    const opts = optsFor(language);
    return widgets.map((w, i) => ({
      id: w.name,
      title: w.describe(stubProfileData(), opts).title,
      pageNumber: i + 2,
    }));
  }

  /** A real citation, produced by editorialStatCardWidget.citableFacts —
   * not an invented literal — so the measured width matches what the
   * Editorial Stat Card would actually hand the masthead. */
  function citedFactFor(language: RenderOptions["language"]): CitableFact {
    const data: ProfileData = {
      ...stubProfileData(),
      stats: { totalCommits: 12345, totalPRs: 0, totalIssues: 0, totalStars: 0 },
    };
    const facts = editorialStatCardWidget.citableFacts?.(data, optsFor(language));
    const fact = facts?.totalCommits;
    if (fact === undefined) {
      throw new Error("editorialStatCardWidget.citableFacts did not return totalCommits");
    }
    return fact;
  }

  /**
   * Renders the masthead and captures the EXACT contents-row string it
   * actually drew, via `assertCoverage` — both `monoRun` and `zhLabel` call
   * `assertCoverage(fontName, text, ...)` exactly once with the full
   * (already prefix-joined, already truncated) contents string before
   * turning it into path data, so this observes the real post-truncation
   * output rather than an independently recomputed prediction.
   */
  function renderAndCaptureContentsText(
    contents: { id: string; title: string; pageNumber: number }[],
    language: RenderOptions["language"],
    citedFacts?: { totalCommits?: CitableFact },
  ): string {
    const spy = vi.spyOn(fontModule, "assertCoverage");
    const opts = {
      ...optsFor(language),
      contents,
      ...(citedFacts !== undefined ? { citedFacts } : {}),
    } as RenderOptions;
    mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), opts);

    const fontName = language === "zh-TW" ? "noto-tc" : "mono-semibold";
    const labelRoot = language === "zh-TW" ? "目次" : "CONTENTS";
    const call = spy.mock.calls.find(
      (c) => c[0] === fontName && typeof c[1] === "string" && (c[1] as string).startsWith(labelRoot),
    );
    spy.mockRestore();
    if (call === undefined) {
      throw new Error(
        `No assertCoverage call found for the contents row (font="${fontName}", labelRoot="${labelRoot}")`,
      );
    }
    return call[1] as string;
  }

  it("four cards + citation, en: truncates with an ellipsis and never reaches the citation", () => {
    const contents = contentsEntriesFor(FOUR_CARDS, "en");
    const fact = citedFactFor("en");
    const contentsText = renderAndCaptureContentsText(contents, "en", { totalCommits: fact });

    // Truncation marker must be visible — UI-SPEC's graceful-degradation
    // policy, not a silently shortened/dropped title.
    expect(contentsText.endsWith("...")).toBe(true);

    // Geometric non-overlap: the two runs share CONTENTS_BASELINE_Y, so a
    // width-only check could pass a budget that was correct in arithmetic
    // but wrong in origin. This is what actually encodes "must not collide".
    const contentsRightEdge = PADDING + monoRunWidth(contentsText);
    const citationLeftEdge = RIGHT_EDGE_X - citationWidth(fact.value, fact.label, "en");
    expect(contentsRightEdge).toBeLessThan(citationLeftEdge);
  });

  it("four cards + citation, zh-TW: fits without truncation and stays clear of the citation", () => {
    const contents = contentsEntriesFor(FOUR_CARDS, "zh-TW");
    const fact = citedFactFor("zh-TW");
    const contentsText = renderAndCaptureContentsText(contents, "zh-TW", { totalCommits: fact });

    expect(contentsText.endsWith("...")).toBe(false);

    const contentsRightEdge = PADDING + zhLabelWidth(contentsText);
    const citationLeftEdge = RIGHT_EDGE_X - citationWidth(fact.value, fact.label, "zh-TW");
    expect(contentsRightEdge).toBeLessThan(citationLeftEdge);
  });

  it("four cards, no citation, en: the joined-titles budget reverts to the full row minus the prefix (pre-fix behaviour, byte-identical)", () => {
    const contents = contentsEntriesFor(FOUR_CARDS, "en");
    const contentsText = renderAndCaptureContentsText(contents, "en");

    const joined = contents.map((c) => c.title).join(" - ");
    const prefixWidth = monoRunWidth("CONTENTS ");
    const expectedBudget = Math.max(0, CONTENTS_ROW_BUDGET_PX - prefixWidth);
    const expectedTruncatedJoined = truncateContentsToWidth("en", joined, expectedBudget);

    expect(contentsText).toBe(`CONTENTS ${expectedTruncatedJoined}`);
  });

  it("three cards, no citation, en: still fits without truncation (the fix does not over-constrain the previously-working case)", () => {
    // Deviation from the plan's literal three-card wording (documented in
    // SUMMARY.md): measured against the REAL current widget titles and a
    // REAL citableFacts figure (not an estimate), three cards WITH a
    // citation present (350.4px joined) exceeds the citation-reduced budget
    // (296.6px) and legitimately truncates too — the pre-fix bug's own
    // "worse" note already implied this (376.0px joined+prefix would have
    // run under the citation's 389px left edge even before this retrofit).
    // The genuinely unaffected "previously-working case" is three cards
    // with NO citation, which still gets the full un-reduced budget exactly
    // as Phase 3 shipped it — asserted here. The with-citation three-card
    // case is covered by the next test, which proves the fix's real
    // invariant (never overlaps) holds even where truncation now kicks in
    // earlier than the plan estimated.
    const contents = contentsEntriesFor(THREE_CARDS, "en");
    const contentsText = renderAndCaptureContentsText(contents, "en");

    expect(contentsText.endsWith("...")).toBe(false);

    const joined = contents.map((c) => c.title).join(" - ");
    expect(contentsText).toBe(`CONTENTS ${joined}`);
  });

  it("three cards + citation, en: truncates (a lower threshold than three-cards-no-citation) but the fix still guarantees no overlap", () => {
    const contents = contentsEntriesFor(THREE_CARDS, "en");
    const fact = citedFactFor("en");
    const contentsText = renderAndCaptureContentsText(contents, "en", { totalCommits: fact });

    // The joined-titles budget genuinely tightens once a citation is
    // present — this is Task 1's fix working as intended, not a bug.
    expect(contentsText.endsWith("...")).toBe(true);

    const contentsRightEdge = PADDING + monoRunWidth(contentsText);
    const citationLeftEdge = RIGHT_EDGE_X - citationWidth(fact.value, fact.label, "en");
    expect(contentsRightEdge).toBeLessThan(citationLeftEdge);
  });

  it("zero contents entries: the bare label alone still renders, unchanged, with or without a citation", () => {
    const fact = citedFactFor("en");
    const withoutCitation = renderAndCaptureContentsText([], "en");
    const withCitation = renderAndCaptureContentsText([], "en", { totalCommits: fact });

    expect(withoutCitation).toBe("CONTENTS");
    expect(withCitation).toBe("CONTENTS");
  });
});
