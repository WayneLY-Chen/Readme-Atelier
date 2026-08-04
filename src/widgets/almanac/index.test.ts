import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { editorialLight } from "../../core/theme.js";
import { loadAllFonts } from "../../node/fonts.js";
import { almanacWidget } from "./index.js";

const stubProfileData: ProfileData = {
  login: "octocat",
  name: null,
  avatarUrl: "",
  followers: 0,
  fetchedAt: new Date().toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
};

function optsFor(language: RenderOptions["language"]): RenderOptions {
  return { now: new Date(2026, 7, 4), seed: 0, timezone: "UTC", language };
}

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 02 Task 3: Almanac bilingual renderBody (UI-SPEC 'Header row', 'Typography')", () => {
  it("renders both languages without throwing (three-font dispatch + assertCoverage all pass)", () => {
    expect(() => almanacWidget.renderBody(stubProfileData, editorialLight, optsFor("en"))).not.toThrow();
    expect(() =>
      almanacWidget.renderBody(stubProfileData, editorialLight, optsFor("zh-TW")),
    ).not.toThrow();
  });

  it("zh-TW mode renders the masthead eyebrow that en mode omits (UI-SPEC: masthead is zh-TW-only)", () => {
    const enBody = almanacWidget.renderBody(stubProfileData, editorialLight, optsFor("en"));
    const zhBody = almanacWidget.renderBody(stubProfileData, editorialLight, optsFor("zh-TW"));

    const countPaths = (svg: string): number => (svg.match(/<path /g) ?? []).length;

    // The masthead eyebrow ("THE ALMANAC") is one extra letter-spaced glyph
    // run (one <path> per character) that only zh-TW mode emits — everything
    // else on the card renders exactly one text-role path count per string.
    expect(countPaths(zhBody)).toBeGreaterThan(countPaths(enBody));
  });

  it("describe() no longer throws for zh-TW (Task 3 removes the Plan 01 language stopgap)", () => {
    expect(() => almanacWidget.describe(stubProfileData, optsFor("zh-TW"))).not.toThrow();
    const { title, desc } = almanacWidget.describe(stubProfileData, optsFor("zh-TW"));
    expect(title.length).toBeGreaterThan(0);
    expect(desc.length).toBeGreaterThan(0);
  });
});
