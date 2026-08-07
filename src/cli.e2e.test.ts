import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cli e2e: npm run preview", () => {
  it(
    "writes .preview/almanac-light.svg + almanac-dark.svg (D-13) with real path data, zero <text>, and the locked viewBox",
    () => {
      // Clear any stale files first so a pass proves this run produced them,
      // not that they happened to survive from a previous run.
      rmSync(".preview/almanac-light.svg", { force: true });
      rmSync(".preview/almanac-dark.svg", { force: true });

      // Actually spawn a subprocess running `npm run preview` — not a direct
      // in-process call to renderPair()/wrapSvg() — to prove the real
      // package.json "preview" script + tsx execution of src/cli.ts works,
      // not just that the underlying functions are individually correct.
      execSync("npm run preview", { cwd: process.cwd(), stdio: "pipe" });

      for (const file of [".preview/almanac-light.svg", ".preview/almanac-dark.svg"]) {
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(0);

        const svgContent = readFileSync(file, "utf-8");

        // RENDER-04's most critical assertion: no silent fallback to <text>
        // nodes, which render fine locally but vanish entirely once GitHub's
        // SVG-as-image sandbox strips them.
        expect(svgContent.includes("<text")).toBe(false);
        expect(svgContent.includes("<path")).toBe(true);
        expect(svgContent.includes('viewBox="0 0 495 220"')).toBe(true);
      }
    },
    30_000,
  );
});
