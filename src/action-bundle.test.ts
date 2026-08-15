import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(repoRoot, "dist", "index.js");

/**
 * These assertions exist because `dist/index.js` is what a real GitHub runner
 * actually executes, and nothing else in this suite touches it. Every other test
 * imports from `src/`, so the committed bundle can be stale, or broken in a way
 * that only bundling introduces, and the whole suite still passes green.
 *
 * That is not hypothetical. Two separate real-runner failures motivated this file:
 *
 * 1. The bundle silently went two phases stale — it was rebuilt last during Phase 2
 *    and did not contain The Graveyard, the Masthead (Phase 3) or The Record
 *    (Phase 4). `widgets.yml` could name a card the shipped Action had never heard of.
 *
 * 2. `css-tree` (via `svgo`) loads its own data with a runtime
 *    `require('../data/patch.json')` rather than an import, specifically to avoid
 *    JSON import assertions. ncc cannot see a dynamic require, so it left the
 *    specifier alone; after bundling it resolved against `dist/`, pointed at a
 *    path that does not exist, and the bundle threw MODULE_NOT_FOUND on load —
 *    before a single line of this project's code ran. `scripts/postbuild.ts`
 *    repairs it; this test is what proves the repair is still in place.
 *
 * The suite cannot run the Action for real (no runner, no token), but it can prove
 * the bundle LOADS and reaches this project's own argument handling. That is the
 * boundary between "fails with our error message" and "fails before we exist".
 */
describe("dist/index.js — the artifact a real runner executes", () => {
  it("is committed", () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("contains every registered widget id, so a card named in widgets.yml cannot be unknown to the shipped Action", () => {
    const bundle = readFileSync(bundlePath, "utf8");
    for (const id of ["almanac", "editorial-stat-card", "the-graveyard", "masthead", "the-record"]) {
      expect(bundle, `widget "${id}" is missing from the bundle — run \`npm run build\``).toContain(`"${id}"`);
    }
  });

  it("loads far enough to reach this project's own input handling, rather than dying on module resolution", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, [bundlePath], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, INPUT_GITHUB_TOKEN: "", GITHUB_TOKEN: "" },
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? "");
    }

    // The bundle is EXPECTED to fail here: it is an Action entry point invoked
    // with no Action inputs. What matters is WHICH failure. Reaching
    // `@actions/core`'s required-input guard means every module resolved and our
    // `run()` was entered.
    expect(stderr, "the bundle failed before reaching our code").not.toContain("MODULE_NOT_FOUND");
    expect(stderr, "the bundle failed before reaching our code").not.toContain("Cannot find module");
    expect(stderr).toContain("Input required and not supplied: github-token");
  });

  it("keeps css-tree's runtime data require pointed inside dist/ (the scripts/postbuild.ts repair)", () => {
    const bundle = readFileSync(bundlePath, "utf8");
    expect(bundle, "postbuild did not run — the bundle will throw MODULE_NOT_FOUND on a real runner").not.toContain(
      "'../data/patch.json'"
    );
    expect(existsSync(path.join(repoRoot, "dist", "data", "patch.json"))).toBe(true);
  });
});
