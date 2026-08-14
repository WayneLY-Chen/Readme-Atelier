import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "./model.js";
import { editorialDark, editorialLight } from "./theme.js";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";
import { editorialStatCardWidget } from "../widgets/editorial-stat-card/index.js";
import { mastheadWidget } from "../widgets/masthead/index.js";
import { theGraveyardWidget } from "../widgets/the-graveyard/index.js";
import { theRecordWidget } from "../widgets/the-record/index.js";
import { ANIMATION_SAFE_SVGO_CONFIG, optimizeSvg } from "./optimize.js";
import { renderPair } from "./svg.js";
import type { WidgetDefinition } from "./registry.js";

/**
 * RESEARCH.md Pattern 5's invariant matrix, driven over EVERY registered v1
 * widget (Open Question 2, resolved: the optimize step is pipeline-level, so
 * it must be proven harmless for all five, not just the-record). Fixed
 * `now`/`seed` inputs mirror the widget snapshot tests' own convention
 * (`the-graveyard.snapshot.test.ts`'s `FIXED_OPTS_BASE`).
 */
const NOW = new Date("2026-08-08T00:00:00Z");
const OPTS: RenderOptions = { now: NOW, seed: 42, timezone: "UTC", language: "en" };

const SHARED_DATA: ProfileData = {
  login: "octocat",
  name: "Octo Cat",
  avatarUrl: "",
  followers: 9,
  fetchedAt: new Date(0).toISOString(),
  stats: { totalCommits: 12345, totalPRs: 12, totalIssues: 7, totalStars: 482 },
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
  contributionCalendar: [
    { date: "2026-01-04", count: 3 },
    { date: "2026-01-05", count: 1 },
  ],
};

interface WidgetEntry {
  name: string;
  widget: WidgetDefinition<RenderOptions>;
  animated: boolean;
}

/** All five v1 widgets — the four static cards plus the-record, the only
 * animated one. `animated` gates which extra invariants apply below. */
const WIDGETS: WidgetEntry[] = [
  { name: "almanac", widget: almanacWidget, animated: false },
  { name: "editorial-stat-card", widget: editorialStatCardWidget, animated: false },
  { name: "masthead", widget: mastheadWidget, animated: false },
  { name: "the-graveyard", widget: theGraveyardWidget, animated: false },
  { name: "the-record", widget: theRecordWidget, animated: true },
];

beforeAll(() => {
  loadAllFonts();
});

describe("ANIMATION_SAFE_SVGO_CONFIG — the ten named overrides (RENDER-08)", () => {
  const overrides = ANIMATION_SAFE_SVGO_CONFIG.plugins[0]?.params.overrides as Record<string, boolean>;

  it.each([
    "cleanupIds",
    "inlineStyles",
    "convertShapeToPath",
    "mergePaths",
    "minifyStyles",
    "collapseGroups",
    "moveElemsAttrsToGroup",
    "moveGroupAttrsToElems",
    "removeHiddenElems",
    "removeDesc",
  ])("disables %s", (pluginName) => {
    expect(overrides[pluginName]).toBe(false);
  });

  it("multipass is disabled", () => {
    expect(ANIMATION_SAFE_SVGO_CONFIG.multipass).toBe(false);
  });
});

describe("optimizeSvg — before/after structural invariants, every registered widget (RENDER-08)", () => {
  for (const { name, widget, animated } of WIDGETS) {
    describe(name, () => {
      let raw: string;
      let opt: string;

      beforeAll(() => {
        raw = renderPair(widget, SHARED_DATA, OPTS, { light: editorialLight, dark: editorialDark }).light;
        opt = optimizeSvg(raw);
      });

      it("optimized byte length is strictly less than raw byte length", () => {
        expect(Buffer.byteLength(opt, "utf8")).toBeLessThan(Buffer.byteLength(raw, "utf8"));
      });

      it("the reduced-motion media block survives optimization", () => {
        expect(opt).toContain("@media (prefers-reduced-motion: reduce)");
      });

      it("<title>, <desc>, and viewBox all survive", () => {
        expect(opt).toContain("<title>");
        expect(opt).toContain("<desc>");
        expect(opt).toContain("viewBox");
      });

      it("<circle element count is identical before and after", () => {
        const rawCircles = (raw.match(/<circle/g) ?? []).length;
        const optCircles = (opt.match(/<circle/g) ?? []).length;
        expect(optCircles).toBe(rawCircles);
      });

      it("re-optimizing an already-optimized string is idempotent (preserves all invariants, does not grow)", () => {
        const reopt = optimizeSvg(opt);
        expect(reopt).toContain("@media (prefers-reduced-motion: reduce)");
        expect(reopt).toContain("<title>");
        expect(reopt).toContain("<desc>");
        expect(reopt).toContain("viewBox");
        expect((reopt.match(/<circle/g) ?? []).length).toBe((opt.match(/<circle/g) ?? []).length);
        expect(Buffer.byteLength(reopt, "utf8")).toBeLessThanOrEqual(Buffer.byteLength(opt, "utf8"));
      });

      if (animated) {
        it("the @keyframes name survives, and an animation: declaration in the same output references it (load-bearing cross-reference)", () => {
          const kfName = /@keyframes\s+([\w-]+)/.exec(opt)?.[1];
          expect(kfName).toBeDefined();
          expect(opt).toMatch(new RegExp(`animation:[^;}]*\\b${kfName as string}\\b`));
        });

        it("exactly one class=\"atelier-record-spin\" group survives", () => {
          expect(opt.match(/class="atelier-record-spin"/g)).toHaveLength(1);
        });
      } else {
        it("no @keyframes block exists, before or after (this widget carries no animation)", () => {
          expect(raw).not.toMatch(/@keyframes/);
          expect(opt).not.toMatch(/@keyframes/);
        });
      }
    });
  }
});
