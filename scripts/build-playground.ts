/**
 * Builds the playground's browser bundle and assembles `_site/` — the
 * Actions-built, gitignored deployment tree `.github/workflows/pages.yml`
 * (05-06) will later `actions/upload-pages-artifact` straight out of. This
 * script is the SINGLE AUTHORITY for the build's exact settings: 05-06's
 * pages.yml calls `npm run build:playground` (this script) rather than
 * re-declaring the esbuild flags inline in YAML, so the two can never drift
 * apart from each other.
 *
 * Uses esbuild's JS API (not the CLI) so this runs identically under `tsx`
 * on any platform, including this project's own Windows dev machine — no
 * shell-specific flag quoting to get wrong cross-platform.
 *
 * The single alias line below is what makes "the same rendering code that
 * ships to production" literally true down to the optimization step (D-01):
 * `src/core/optimize.ts` imports `svgo` unconditionally, and svgo 4.0.2
 * officially ships a pre-bundled browser entry point (`svgo/browser`,
 * verified against `node_modules/svgo/package.json`'s `exports` map) with
 * the same `optimize()` API as the Node entry. `renderAllCards()` runs
 * completely unmodified in the browser once this alias swaps the import
 * target — no injection seam, no skip-svgo fallback needed (RESEARCH.md
 * Pattern 2).
 */
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(repoRoot, "_site");
const fontsSrcDir = path.join(repoRoot, "assets", "fonts");
const fontsOutDir = path.join(siteDir, "assets", "fonts");

async function main(): Promise<void> {
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });
  mkdirSync(fontsOutDir, { recursive: true });

  await build({
    entryPoints: [path.join(repoRoot, "src", "playground", "main.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    // The Pitfall-3 fix (RESEARCH.md): without this alias, esbuild resolves
    // svgo's default "." export (the Node entry), which pulls in `node:fs`/
    // `node:path` and either fails the build under platform=browser or
    // explodes at runtime in the browser.
    alias: { svgo: "svgo/browser" },
    minify: true,
    outfile: path.join(siteDir, "playground.js"),
  });

  copyFileSync(path.join(repoRoot, "src", "playground", "index.html"), path.join(siteDir, "index.html"));

  if (!existsSync(fontsSrcDir)) {
    throw new Error(`${fontsSrcDir} not found — run \`npm run build:fonts\` first.`);
  }
  for (const entry of readdirSync(fontsSrcDir)) {
    if (entry.endsWith(".subset.ttf")) {
      copyFileSync(path.join(fontsSrcDir, entry), path.join(fontsOutDir, entry));
    }
  }

  console.log(`[build-playground] wrote ${siteDir}`);
}

await main();
