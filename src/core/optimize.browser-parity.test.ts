import { optimize as optimizeBrowser } from "svgo/browser";
import { optimize as optimizeNode } from "svgo";
import { beforeAll, describe, expect, it } from "vitest";
import { ANIMATION_SAFE_SVGO_CONFIG } from "./optimize.js";
import { renderPair } from "./svg.js";
import { editorialLight } from "./theme.js";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";
import { theRecordWidget } from "../widgets/the-record/index.js";
import type { ProfileData, RenderOptions } from "./model.js";

beforeAll(() => {
  loadAllFonts();
});

/**
 * Assumption A2 (RESEARCH.md): svgo 4.0.2 officially ships a pre-bundled
 * browser entry point (`svgo/browser`) with the same `optimize()` API as the
 * Node entry (`node_modules/svgo/package.json`'s `exports` map — verified),
 * and the esbuild alias `svgo -> svgo/browser` (scripts/build-playground.ts)
 * relies on both entries producing IDENTICAL output for the SAME input under
 * this project's `ANIMATION_SAFE_SVGO_CONFIG`. If they diverge, the
 * playground's preview would not actually be running "the same rendering
 * code that ships to production" (D-01) despite using the same source —
 * this test is the machine-checkable proof that assumption holds, or the
 * signal to fall back to CONTEXT's pre-approved alternative (skip svgo in
 * the playground, or open an injection seam in `core/`) if it does not.
 *
 * Two inputs, both real widget output (not hand-written SVG fragments):
 *   - The Record's card, which contains a real CSS `@keyframes` animation —
 *     the harder case, since several preset-default sub-plugins this
 *     project's config disables exist specifically to protect animated
 *     structure (see optimize.ts's own doc comment).
 *   - Almanac's card, which has no animation at all — the boundary case.
 */

const PINNED_NOW = new Date("2026-08-07T12:00:00Z");

const baseOpts: RenderOptions = { now: PINNED_NOW, seed: 42, language: "en", timezone: "UTC" };

const calendarProfile: ProfileData = {
  login: "parity-fixture",
  name: "Parity Fixture",
  avatarUrl: "",
  followers: 0,
  fetchedAt: PINNED_NOW.toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  contributionCalendar: Array.from({ length: 220 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    count: (i % 7) + 1,
  })),
  contributionCalendarTotal: 0,
};

const almanacProfile: ProfileData = {
  login: "parity-fixture",
  name: "Parity Fixture",
  avatarUrl: "",
  followers: 0,
  fetchedAt: PINNED_NOW.toISOString(),
  stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
};

function optimizeBoth(svg: string): { nodeOut: string; browserOut: string } {
  return {
    nodeOut: optimizeNode(svg, ANIMATION_SAFE_SVGO_CONFIG).data,
    browserOut: optimizeBrowser(svg, ANIMATION_SAFE_SVGO_CONFIG).data,
  };
}

describe("svgo node entry vs svgo/browser entry — ANIMATION_SAFE_SVGO_CONFIG parity (A2)", () => {
  it("produce byte-identical output for an ANIMATED card (The Record)", () => {
    const { light: rawLight, dark: rawDark } = renderPair(
      theRecordWidget,
      calendarProfile,
      baseOpts,
      { light: editorialLight, dark: editorialLight },
    );

    // Sanity check: this input actually exercises an animation, or the test
    // would pass vacuously without ever touching the hazard this file exists
    // to guard.
    expect(rawLight).toContain("@keyframes");

    const light = optimizeBoth(rawLight);
    expect(light.browserOut).toBe(light.nodeOut);

    const dark = optimizeBoth(rawDark);
    expect(dark.browserOut).toBe(dark.nodeOut);
  });

  it("produce byte-identical output for a NON-ANIMATED card (Almanac) — the boundary case", () => {
    const { light: rawLight, dark: rawDark } = renderPair(
      almanacWidget,
      almanacProfile,
      baseOpts,
      { light: editorialLight, dark: editorialLight },
    );

    expect(rawLight).not.toContain("@keyframes");

    const light = optimizeBoth(rawLight);
    expect(light.browserOut).toBe(light.nodeOut);

    const dark = optimizeBoth(rawDark);
    expect(dark.browserOut).toBe(dark.nodeOut);
  });
});
