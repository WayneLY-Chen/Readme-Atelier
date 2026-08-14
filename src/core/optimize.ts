import { optimize } from "svgo";
import type { Config } from "svgo";

/**
 * RENDER-08's animation-safe svgo config. Shaped like `src/core/svg.ts`: a
 * pure, zero-fs module exporting a named const + a pure function. `optimize()`
 * is svgo's own synchronous string->string transform with no I/O of its own
 * (RESEARCH.md Assumption A5) — there is nothing to inject, so unlike
 * `publish.ts`'s `ExecFn` seam this file needs no injectable-transport
 * parameter. This is not an exception to the `core/**` zero-fs boundary; it
 * simply never touches the filesystem in the first place.
 *
 * `preset-default`'s v4 plugin list (33 plugins, svgo.dev/docs/preset-default/)
 * still contains all four hazards CLAUDE.md's "What NOT to Use" names
 * (`cleanupIds`, `inlineStyles`, `convertShapeToPath`, `mergePaths`), plus six
 * more this phase's research found animation/structure hazards in. Every
 * override below is named individually (not just spread from an array) so a
 * test can assert the exact disable list by name — a future svgo upgrade that
 * silently re-enables one of these fails that assertion loudly instead of
 * shipping a broken card.
 */
export const ANIMATION_SAFE_SVGO_CONFIG = {
  multipass: false,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // CLAUDE.md's four named hazards:
          cleanupIds: false, // renames/removes ids -> desyncs any id-based CSS/SMIL reference
          inlineStyles: false, // inlines <style> rules into style="" attrs, mishandling @media rules
          convertShapeToPath: false, // would turn groove <circle> elements into <path>, losing their identity
          mergePaths: false, // would merge distinct texture <path> elements together
          // Additional hazards this phase's research found in v4's preset-default:
          minifyStyles: false, // csso can restructure or drop @keyframes it mis-detects as unused
          collapseGroups: false, // could dissolve the <g class="atelier-record-spin"> the animation targets
          moveElemsAttrsToGroup: false, // could relocate a class/transform attribute across the animated boundary
          moveGroupAttrsToElems: false, // same hazard, the other direction
          removeHiddenElems: false, // protects any 0-opacity animation start/rest state, present or future
          removeDesc: false, // wrapSvg's <desc> is meaningful accessibility content, not editor cruft
        },
      },
    },
  ],
} satisfies Config;

/**
 * Runs `svg` through the animation-safe svgo config above. Any error svgo
 * throws propagates unmodified — a card that cannot be optimized must fail
 * the whole run rather than silently pass through unoptimized while the run
 * reports success.
 */
export function optimizeSvg(svg: string): string {
  return optimize(svg, ANIMATION_SAFE_SVGO_CONFIG).data;
}
