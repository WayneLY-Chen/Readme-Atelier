import { beforeAll, describe, expect, it, vi } from "vitest";
import * as fontModule from "../../core/font.js";
import { measureAdvanceWidth } from "../../core/font.js";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { labelsEn, labelsZh } from "./copy.js";
import { COLUMN_BUDGET_PX, formatStatNumber } from "./format.js";
import { editorialStatCardWidget } from "./index.js";

const T1_SIZE = 8;
const T1_LETTER_SPACING = 1.6;

function zeroProfileData(): ProfileData {
  return {
    login: "octocat",
    name: null,
    avatarUrl: "",
    followers: 0,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  };
}

function nonZeroProfileData(): ProfileData {
  return {
    login: "octocat",
    name: "Octo Cat",
    avatarUrl: "",
    followers: 9,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 32, totalPRs: 12, totalIssues: 7, totalStars: 482 },
  };
}

function optsFor(language: RenderOptions["language"]): RenderOptions {
  return { now: new Date(2026, 7, 8), seed: 0, timezone: "UTC", language };
}

/** Letter-spaced width computed the same way index.ts's own
 * letterSpacedWidth does, duplicated here for the static budget test —
 * not exported from index.ts since it's an internal layout helper. */
function enLabelWidth(text: string): number {
  const upper = text.toUpperCase();
  const chars = Array.from(upper);
  let width = 0;
  chars.forEach((ch, i) => {
    width +=
      measureAdvanceWidth("mono-semibold", ch, T1_SIZE) +
      (i < chars.length - 1 ? T1_LETTER_SPACING : 0);
  });
  return width;
}

beforeAll(() => {
  loadAllFonts();
});

describe("editorialStatCardWidget — identity (CARD-02)", () => {
  it("has the expected name, requires, and size", () => {
    expect(editorialStatCardWidget.name).toBe("editorial-stat-card");
    expect(editorialStatCardWidget.requires).toEqual(["stats"]);
    expect(editorialStatCardWidget.size).toEqual({ width: 495, height: 204 });
  });
});

describe("editorialStatCardWidget.optionsSchema — D-01 include_forks", () => {
  it("defaults include_forks to false when omitted", () => {
    const opts = editorialStatCardWidget.optionsSchema.parse({}) as RenderOptions & {
      include_forks: boolean;
    };
    expect(opts.include_forks).toBe(false);
  });

  it("honors an explicit include_forks: true", () => {
    const opts = editorialStatCardWidget.optionsSchema.parse({ include_forks: true }) as RenderOptions & {
      include_forks: boolean;
    };
    expect(opts.include_forks).toBe(true);
  });

  it("throws (.strict()) on an unknown option key", () => {
    expect(() => editorialStatCardWidget.optionsSchema.parse({ unknown_key: 1 })).toThrow();
  });
});

describe("editorialStatCardWidget.renderBody — structure (D-08/D-09, UI-SPEC Color)", () => {
  it("renders no <text> elements and at least one <path>", () => {
    const body = editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("en"));
    expect(body).not.toContain("<text");
    expect(body).toContain("<path");
  });

  it("renders exactly 3 vertical accent dividers and 1 horizontal rule divider", () => {
    const body = editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("en"));
    const accentLines = (body.match(new RegExp(`<line[^>]*stroke="${editorialLight.accent}"`, "g")) ?? [])
      .length;
    const ruleLines = (body.match(new RegExp(`<line[^>]*stroke="${editorialLight.rule}"`, "g")) ?? [])
      .length;
    expect(accentLines).toBe(3);
    expect(ruleLines).toBe(1);
  });

  it("no numeral or label <path> ever uses theme.accent — accent is reserved for dividers only", () => {
    const body = editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("en"));
    const accentPaths = (body.match(new RegExp(`<path[^>]*fill="${editorialLight.accent}"`, "g")) ?? [])
      .length;
    expect(accentPaths).toBe(0);
  });

  it("zh-TW mode renders the masthead eyebrow that en mode omits", () => {
    const enBody = editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("en"));
    const zhBody = editorialStatCardWidget.renderBody(
      nonZeroProfileData(),
      editorialLight,
      optsFor("zh-TW"),
    );
    const countPaths = (svg: string): number => (svg.match(/<path /g) ?? []).length;
    expect(countPaths(zhBody)).toBeGreaterThan(countPaths(enBody));
  });

  it("a fully-zero ProfileData renders successfully with the same structure as a non-zero one (D-09)", () => {
    const zeroBody = editorialStatCardWidget.renderBody(zeroProfileData(), editorialLight, optsFor("en"));
    const nonZeroBody = editorialStatCardWidget.renderBody(
      nonZeroProfileData(),
      editorialLight,
      optsFor("en"),
    );

    const countPaths = (svg: string): number => (svg.match(/<path /g) ?? []).length;
    const countLines = (svg: string): number => (svg.match(/<line /g) ?? []).length;
    const fillsUsed = (svg: string): Set<string> =>
      new Set(Array.from(svg.matchAll(/fill="([^"]+)"/g)).map((m) => m[1]));

    expect(countPaths(zeroBody)).toBe(countPaths(nonZeroBody));
    expect(countLines(zeroBody)).toBe(countLines(nonZeroBody));
    expect(fillsUsed(zeroBody)).toEqual(fillsUsed(nonZeroBody));
    expect(zeroBody).not.toBe(nonZeroBody);
  });

  it("describe() no longer throws for zh-TW and returns non-empty title/desc", () => {
    const { title, desc } = editorialStatCardWidget.describe(nonZeroProfileData(), optsFor("zh-TW"));
    expect(title.length).toBeGreaterThan(0);
    expect(desc.length).toBeGreaterThan(0);
  });
});

describe("editorialStatCardWidget.renderBody — five labels reach the glyph layer (en + zh-TW)", () => {
  it("all five en column labels are passed through assertCoverage during render", () => {
    const spy = vi.spyOn(fontModule, "assertCoverage");
    editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("en"));
    const seenTexts = spy.mock.calls.map((call) => call[1]);
    for (const label of Object.values(labelsEn)) {
      expect(seenTexts).toContain(label);
    }
    spy.mockRestore();
  });

  it("all five zh-TW column labels are passed through assertCoverage during render", () => {
    const spy = vi.spyOn(fontModule, "assertCoverage");
    editorialStatCardWidget.renderBody(nonZeroProfileData(), editorialLight, optsFor("zh-TW"));
    const seenTexts = spy.mock.calls.map((call) => call[1]);
    for (const label of Object.values(labelsZh)) {
      expect(seenTexts).toContain(label);
    }
    spy.mockRestore();
  });
});

describe("Alignment rule — T2 numerals are horizontally centered, not edge-aligned", () => {
  it("a short numeral ('0') and a long one ('999.9K') share the same column center point", () => {
    const spy = vi.spyOn(fontModule, "textToPathData");

    // Filter on fontSize === 32 (T2_SIZE) to unambiguously pick out numeral
    // render calls — T1 labels (8px) and the title (17px) also call
    // textToPathData("mono-semibold"/"serif", ...) with single characters
    // or short strings that could otherwise collide with a numeral's text.
    const T2_SIZE = 32;

    const shortData = { ...nonZeroProfileData(), stats: { ...nonZeroProfileData().stats, totalCommits: 0 } };
    editorialStatCardWidget.renderBody(shortData, editorialLight, optsFor("en"));
    const shortCall = spy.mock.calls.find(
      (call) => call[0] === "mono-semibold" && call[4] === T2_SIZE && call[1] === "0",
    );
    expect(shortCall).toBeDefined();
    const [, , shortX] = shortCall as unknown as [string, string, number, number, number];
    const shortWidth = measureAdvanceWidth("mono-semibold", "0", 32);
    const shortCenter = shortX + shortWidth / 2;

    spy.mockClear();

    const longData = {
      ...nonZeroProfileData(),
      stats: { ...nonZeroProfileData().stats, totalCommits: 9999999 },
    };
    editorialStatCardWidget.renderBody(longData, editorialLight, optsFor("en"));
    const longCall = spy.mock.calls.find(
      (call) =>
        call[0] === "mono-semibold" &&
        call[4] === T2_SIZE &&
        typeof call[1] === "string" &&
        (call[1] as string).endsWith("M"),
    );
    expect(longCall).toBeDefined();
    const [, longText, longX] = longCall as unknown as [string, string, number, number, number];
    const longWidth = measureAdvanceWidth("mono-semibold", longText, 32);
    const longCenter = longX + longWidth / 2;

    expect(longCenter).toBeCloseTo(shortCenter, 1);
    // And the two must NOT share the same left edge (proving this is
    // genuinely centered, not coincidentally left-aligned).
    expect(shortX).not.toBeCloseTo(longX, 1);

    spy.mockRestore();
  });
});

describe("editorialStatCardWidget.citableFacts (MAST-02/D-07)", () => {
  it("en: returns totalCommits with an uppercase English label and formatStatNumber's verbatim output", () => {
    const data = nonZeroProfileData();
    const facts = editorialStatCardWidget.citableFacts?.(data, optsFor("en"));
    expect(facts).toEqual({
      totalCommits: { label: "COMMITS", value: formatStatNumber(data.stats.totalCommits, "en") },
    });
  });

  it("zh-TW: returns totalCommits with the Chinese label and formatStatNumber's verbatim 萬/億 output", () => {
    const data = { ...nonZeroProfileData(), stats: { ...nonZeroProfileData().stats, totalCommits: 12345 } };
    const facts = editorialStatCardWidget.citableFacts?.(data, optsFor("zh-TW"));
    expect(facts).toEqual({
      totalCommits: { label: "提交", value: formatStatNumber(data.stats.totalCommits, "zh-TW") },
    });
  });
});

describe("Static label width budget — 10 fixed strings, 138px column budget", () => {
  it("every en column label fits within COLUMN_BUDGET_PX", () => {
    for (const [key, label] of Object.entries(labelsEn)) {
      const width = enLabelWidth(label);
      expect(width, `en label "${key}" = "${label}" measured ${width}px`).toBeLessThan(COLUMN_BUDGET_PX);
    }
  });

  it("every zh-TW column label fits within COLUMN_BUDGET_PX", () => {
    for (const [key, label] of Object.entries(labelsZh)) {
      const width = measureAdvanceWidth("noto-tc", label, T1_SIZE);
      expect(width, `zh-TW label "${key}" = "${label}" measured ${width}px`).toBeLessThan(COLUMN_BUDGET_PX);
    }
  });
});
