import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(repoRoot, "_site");
const bundlePath = path.join(siteDir, "playground.js");

/**
 * `src/playground-bundle.test.ts` inherits its discipline directly from
 * `src/action-bundle.test.ts`, which exists because of a real Phase 4
 * incident: `dist/index.js` silently shipped two phases stale, and a
 * dynamic `require()` that resolved fine on a developer machine (its
 * `node_modules/` was right there) threw MODULE_NOT_FOUND on a real runner,
 * which has none. The lesson that test file's own header records — "a
 * guard test that runs IN the repo reproduces the exact blind spot it
 * exists to catch" — applies identically here: `_site/playground.js` is
 * served to a stranger's browser, an environment with NO Node runtime at
 * all, let alone this repo's `node_modules/`. Auditing the bundle from
 * inside the repo would prove nothing about what actually ships. This test
 * therefore copies the freshly-built `_site/` into a temp directory that is
 * never inside the repo before reading a single byte of it.
 *
 * Three checks, matching 05-03-PLAN.md's acceptance criteria exactly:
 *   (a) no Node built-in module specifier (including the `node:` protocol
 *       prefix form) anywhere in the bundle text;
 *   (b) no live CommonJS `require(...)` call left over — an ESM browser
 *       bundle should never need one; a global `require` does not exist in
 *       a browser and calling it throws immediately;
 *   (c) the bundle is non-empty and `_site/` carries its whole payload
 *       (`index.html` + the four subset TTFs the fonts loader depends on).
 */
describe("_site/playground.js — the bundle a real browser executes", () => {
  let sandbox: string;
  let sandboxSite: string;
  let sandboxBundle: string;

  beforeAll(() => {
    execSync("npm run build:playground", { cwd: repoRoot, stdio: "pipe" });

    // A sibling of the OS temp root, never inside the repo — mirrors
    // action-bundle.test.ts's sandbox reasoning exactly.
    sandbox = mkdtempSync(path.join(tmpdir(), "readme-atelier-playground-"));
    sandboxSite = path.join(sandbox, "_site");
    cpSync(siteDir, sandboxSite, { recursive: true });
    sandboxBundle = path.join(sandboxSite, "playground.js");
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("is non-empty", () => {
    expect(existsSync(sandboxBundle)).toBe(true);
    expect(readFileSync(sandboxBundle, "utf8").length).toBeGreaterThan(0);
  });

  it("ships index.html and every subset font playground/fonts.ts depends on", () => {
    expect(existsSync(path.join(sandboxSite, "index.html")), "_site/index.html missing").toBe(true);
    for (const font of [
      "ibm-plex-mono-regular.subset.ttf",
      "ibm-plex-mono-semibold.subset.ttf",
      "source-serif-4.subset.ttf",
      "noto-serif-tc.subset.ttf",
    ]) {
      const fontPath = path.join(sandboxSite, "assets", "fonts", font);
      expect(existsSync(fontPath), `_site/assets/fonts/${font} missing`).toBe(true);
    }
  });

  it("contains no Node built-in module specifier, including the node: protocol prefix form", () => {
    const bundle = readFileSync(sandboxBundle, "utf8");

    // Node built-in names this project's own Node-only shells (src/node/**,
    // scripts/**, src/action-bundle.test.ts itself) actually import — the
    // realistic set that could leak in if a dependency's Node entry point
    // ever got bundled by mistake (Pitfall 3: exactly what alias:svgo=svgo/
    // browser exists to prevent).
    const NODE_BUILTINS = [
      "fs",
      "path",
      "os",
      "child_process",
      "crypto",
      "url",
      "util",
      "stream",
      "buffer",
      "module",
      "process",
    ];

    const offending: string[] = [];
    for (const name of NODE_BUILTINS) {
      // Both bare ("fs") and node:-prefixed ("node:fs") specifier forms, in
      // either quote style, used as an ESM import source. Deliberately NOT
      // checking require(...) call syntax here — that's the next test's job,
      // which handles the one sanctioned non-executable exception by exact
      // text range rather than by specifier name (a real "fs" require
      // anywhere else in the bundle must still fail something).
      for (const specifier of [name, `node:${name}`]) {
        const pattern = new RegExp(`from\\s*["']${specifier}["']`);
        if (pattern.test(bundle)) {
          offending.push(specifier);
        }
      }
    }
    // The unprefixed "node:" protocol scheme itself, in case a specifier
    // outside the curated list above ever slips through (e.g. node:worker_threads).
    const genericNodeProtocol = [...bundle.matchAll(/["']node:[a-zA-Z0-9_/-]+["']/g)].map((m) => m[0]);
    offending.push(...genericNodeProtocol);

    expect(
      offending,
      `these Node built-in module specifiers appear in the browser bundle and will throw at runtime ` +
        `(no Node runtime exists in a browser): ${offending.join(", ")}. Check the esbuild alias config ` +
        `in scripts/build-playground.ts — a dependency's Node entry point likely got bundled instead of ` +
        `its browser entry point.`,
    ).toEqual([]);
  });

  it("contains no live CommonJS require(...) call — an ESM browser bundle must never need one", () => {
    const bundle = readFileSync(sandboxBundle, "utf8");

    // Sanctioned exception, precisely scoped by TEXT RANGE (not by specifier
    // name, so a real "fs" require anywhere else in the bundle still fails
    // this test): opentype.js ships a deprecation console.error() whose
    // MESSAGE STRING literally contains the text `require("fs")` as
    // human-readable example code, not an executable call. Verified by hand
    // against this exact bundle — see git blame for the verification note.
    const SANCTIONED_LITERAL = 'require("fs").readFileSync(url), opt)';
    const sanctionedStart = bundle.indexOf(SANCTIONED_LITERAL);
    const sanctionedEnd = sanctionedStart === -1 ? -1 : sanctionedStart + SANCTIONED_LITERAL.length;

    const callPattern = /require\(\s*(['"])((?:(?!\1).)*)\1\s*\)/g;
    const offending: string[] = [];
    for (const match of bundle.matchAll(callPattern)) {
      const index = match.index ?? -1;
      const insideSanctionedRange = sanctionedStart !== -1 && index >= sanctionedStart && index < sanctionedEnd;
      if (!insideSanctionedRange) {
        offending.push(match[0]);
      }
    }

    expect(
      offending,
      `these look like live require(...) calls left in the browser bundle — a browser has no global ` +
        `"require" and calling it throws ReferenceError immediately: ${offending.join(", ")}`,
    ).toEqual([]);
  });
});
