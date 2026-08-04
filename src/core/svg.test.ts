import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "./model.js";
import { renderPair } from "./svg.js";
import { editorialDark, editorialLight } from "./theme.js";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";

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

/**
 * Strips color-attribute values (RENDER-03's own diff mechanism, per
 * 01-UI-SPEC.md's "Light/Dark structural invariant"): the only bytes allowed
 * to differ between a light/dark pair are `fill="..."`/`stroke="..."`
 * values sourced from the Theme object. Everything else — every `d=` path
 * string, every coordinate, the viewBox, the <title>/<desc> text — must be
 * byte-identical.
 */
function stripColorAttrs(svg: string): string {
  return svg.replace(/(fill|stroke)="[^"]*"/g, "");
}

beforeAll(() => {
  loadAllFonts();
});

describe("Plan 03 Task 1: renderPair structural invariant (RENDER-03)", () => {
  it("produces byte-identical (post color-strip) light/dark pairs in en mode", () => {
    const { light, dark } = renderPair(almanacWidget, stubProfileData, optsFor("en"), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(stripColorAttrs(light)).toBe(stripColorAttrs(dark));
  });

  it("produces byte-identical (post color-strip) light/dark pairs in zh-TW mode", () => {
    const { light, dark } = renderPair(almanacWidget, stubProfileData, optsFor("zh-TW"), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(stripColorAttrs(light)).toBe(stripColorAttrs(dark));
  });

  it("actually differs before stripping colors (sanity check the diff mechanism isn't vacuous)", () => {
    const { light, dark } = renderPair(almanacWidget, stubProfileData, optsFor("en"), {
      light: editorialLight,
      dark: editorialDark,
    });
    expect(light).not.toBe(dark);
  });
});
