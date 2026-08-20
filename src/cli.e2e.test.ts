import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// This test drives the real `npm run preview` subprocess against a config it
// writes itself, NOT against the repository's own widgets.yml.
//
// Why: this repo's widgets.yml is the D-08 loop-B fixture — every shipped card
// enabled at once — and four of those five cards need live GitHub data, so
// src/cli.ts refuses to start without GITHUB_TOKEN/GITHUB_LOGIN. That made this
// test silently environment-dependent: green on any machine that happened to
// have a token exported, red on a clean checkout, and red for every contributor
// following CONTRIBUTING.md's "run npm test". The assertions below are all about
// Almanac, which needs zero API calls, so the token requirement was never
// intrinsic to what this test proves — it leaked in through the shared config.
//
// Pointing the CLI at an almanac-only config (src/cli.ts takes the config path
// as argv[2]) makes the test hermetic: no network, no credentials, same
// end-to-end coverage of the package.json script + tsx + cli.ts path.
const tmpDir = mkdtempSync(path.join(tmpdir(), "readme-atelier-cli-e2e-"));
const configPath = path.join(tmpDir, "almanac-only.widgets.yml");

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("cli e2e: npm run preview", () => {
  it(
    "writes .preview/almanac-light.svg + almanac-dark.svg (D-13) with real path data, zero <text>, and the locked viewBox",
    () => {
      writeFileSync(
        configPath,
        ["language: en", "timezone: Asia/Taipei", "", "cards:", "  - type: almanac", ""].join("\n"),
        "utf8",
      );

      // Clear any stale files first so a pass proves this run produced them,
      // not that they happened to survive from a previous run.
      rmSync(".preview/almanac-light.svg", { force: true });
      rmSync(".preview/almanac-dark.svg", { force: true });

      // Actually spawn a subprocess running `npm run preview` — not a direct
      // in-process call to renderPair()/wrapSvg() — to prove the real
      // package.json "preview" script + tsx execution of src/cli.ts works,
      // not just that the underlying functions are individually correct.
      // The `--` forwards the config path through npm to cli.ts's argv[2].
      execSync(`npm run preview -- ${JSON.stringify(configPath)}`, {
        cwd: process.cwd(),
        stdio: "pipe",
      });

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
