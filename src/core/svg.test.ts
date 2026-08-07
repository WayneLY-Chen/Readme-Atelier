import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "./model.js";
import {
  HARD_SIZE_CANARY_BYTES,
  renderPair,
  SizeBudgetError,
  SOFT_SIZE_BUDGET_BYTES,
  sizeGuard,
} from "./svg.js";
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

describe("Plan 03 Task 3: sizeGuard exact-byte boundaries (RENDER-07)", () => {
  // 'x' is a single UTF-8 byte, so 'x'.repeat(n) has an exact, unambiguous
  // Buffer.byteLength of n — hitting these boundaries precisely (not just
  // "obviously large"/"obviously small" representative values) is the whole
  // point of this test per the plan's flagged off-by-one edge probe.
  it("SOFT_SIZE_BUDGET_BYTES: exactly 204800 bytes passes, 204801 throws", () => {
    const atBudget = "x".repeat(SOFT_SIZE_BUDGET_BYTES);
    const overBudget = "x".repeat(SOFT_SIZE_BUDGET_BYTES + 1);
    expect(() => sizeGuard(atBudget, "almanac-light.svg", SOFT_SIZE_BUDGET_BYTES)).not.toThrow();
    expect(() => sizeGuard(overBudget, "almanac-light.svg", SOFT_SIZE_BUDGET_BYTES)).toThrow(
      SizeBudgetError,
    );
  });

  it("HARD_SIZE_CANARY_BYTES: exactly 1048576 bytes passes, 1048577 throws", () => {
    const atCanary = "x".repeat(HARD_SIZE_CANARY_BYTES);
    const overCanary = "x".repeat(HARD_SIZE_CANARY_BYTES + 1);
    expect(() => sizeGuard(atCanary, "almanac-light.svg", HARD_SIZE_CANARY_BYTES)).not.toThrow();
    expect(() => sizeGuard(overCanary, "almanac-light.svg", HARD_SIZE_CANARY_BYTES)).toThrow(
      SizeBudgetError,
    );
  });

  it("error message names the label, measured bytes, and budget", () => {
    const overBudget = "x".repeat(SOFT_SIZE_BUDGET_BYTES + 1);
    expect(() => sizeGuard(overBudget, "almanac-light.svg", SOFT_SIZE_BUDGET_BYTES)).toThrow(
      `almanac-light.svg exceeds size budget: ${SOFT_SIZE_BUDGET_BYTES + 1} bytes > ${SOFT_SIZE_BUDGET_BYTES} bytes budget`,
    );
  });
});
