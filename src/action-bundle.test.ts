import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");
const bundlePath = path.join(distDir, "index.js");

/**
 * These assertions exist because `dist/index.js` is what a real GitHub runner
 * actually executes, and nothing else in this suite touches it. Every other test
 * imports from `src/`, so the committed bundle can be stale, or broken in a way
 * only bundling introduces, and the whole suite still passes green.
 *
 * Three real failures motivated this file:
 *
 * 1. The bundle silently went two phases stale — last rebuilt during Phase 2, so
 *    it contained neither The Graveyard and the Masthead (Phase 3) nor The Record
 *    (Phase 4). `widgets.yml` could name a card the shipped Action had never
 *    heard of.
 *
 * 2. `css-tree` (via `svgo`) loads its data with runtime `require()` rather than
 *    `import`, to avoid JSON import assertions. ncc cannot see a dynamic require,
 *    so it left `'../data/patch.json'` alone; after bundling it resolved against
 *    `dist/` to a path that does not exist, and the bundle threw MODULE_NOT_FOUND
 *    on load.
 *
 * 3. The same mechanism, but worse: css-tree also requires `'mdn-data/css/*.json'`
 *    — BARE specifiers, resolved by walking up for a `node_modules/` directory.
 *    Those resolve perfectly on a developer machine, because the repo's own
 *    `node_modules/` is right there. On a runner they do not exist at all:
 *    `.github/workflows/cards.yml` goes straight from `actions/checkout` to
 *    `uses: ./` with no `npm install`. The step died in under a second.
 *
 * Finding (3) is why the smoke test below runs the bundle from a COPY in a temp
 * directory that has no `node_modules` anywhere above it. Running it in-repo
 * reproduces the exact blind spot that let this ship — the first version of this
 * test did precisely that and passed against a bundle that was already broken.
 */
describe("dist/index.js — the artifact a real runner executes", () => {
  let sandbox: string;
  let sandboxBundle: string;

  beforeAll(() => {
    // A sibling of the OS temp root, never inside the repo, so Node's upward
    // node_modules search finds nothing — the runner's condition exactly.
    sandbox = mkdtempSync(path.join(tmpdir(), "readme-atelier-bundle-"));
    cpSync(distDir, path.join(sandbox, "dist"), { recursive: true });
    // The bundle also requires '../package.json', which IS committed and present
    // on a real checkout — mirror that so the sandbox is faithful, not stricter.
    cpSync(path.join(repoRoot, "package.json"), path.join(sandbox, "package.json"));
    sandboxBundle = path.join(sandbox, "dist", "index.js");
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("is committed", () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it("contains every registered widget id, so a card named in widgets.yml cannot be unknown to the shipped Action", () => {
    const bundle = readFileSync(bundlePath, "utf8");
    for (const id of ["almanac", "editorial-stat-card", "the-graveyard", "masthead", "the-record"]) {
      expect(bundle, `widget "${id}" is missing from the bundle — run \`npm run build\``).toContain(`"${id}"`);
    }
  });

  it("has no runtime require that would escape dist/ on a runner — every createRequire specifier is vendored or committed", () => {
    const bundle = readFileSync(bundlePath, "utf8");
    const specifiers = [...bundle.matchAll(/_require\((['"])([^'"]+)\1\)/g)].map((m) => m[2]!);
    const unique = [...new Set(specifiers)].sort();

    // Anything NOT starting with './' escapes dist/. A bare specifier needs a
    // node_modules that does not exist on the runner; '../' reaches outside the
    // action's own directory. The single sanctioned exception is the repository's
    // committed package.json, which a real checkout does provide.
    const escaping = unique.filter((s) => !s.startsWith("./") && s !== "../package.json");

    expect(
      escaping,
      `these runtime requires resolve outside dist/ and will throw MODULE_NOT_FOUND on a runner ` +
        `(no npm install runs there). Vendor them in scripts/postbuild.ts: ${escaping.join(", ")}`
    ).toEqual([]);
  });

  it("loads from a directory with NO node_modules — the runner's condition — and reaches this project's own input handling", () => {
    let stderr = "";
    try {
      execFileSync(process.execPath, [sandboxBundle], {
        cwd: sandbox,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? "");
    }

    // The bundle is EXPECTED to fail here: it is an Action entry point invoked
    // with no Action inputs. What matters is WHICH failure. Reaching
    // `@actions/core`'s required-input guard means every module resolved.
    expect(stderr, "the bundle failed before reaching our code").not.toContain("MODULE_NOT_FOUND");
    expect(stderr, "the bundle failed before reaching our code").not.toContain("Cannot find module");
    expect(stderr).toContain("Input required and not supplied: github-token");
  });

  it("ships the vendored data files scripts/postbuild.ts is responsible for", () => {
    for (const rel of [
      "data/patch.json",
      "mdn-data/css/at-rules.json",
      "mdn-data/css/properties.json",
      "mdn-data/css/syntaxes.json",
    ]) {
      expect(existsSync(path.join(distDir, rel)), `dist/${rel} missing — run \`npm run build\``).toBe(true);
    }
  });
});
