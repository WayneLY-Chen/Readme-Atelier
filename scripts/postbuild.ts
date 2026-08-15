/**
 * Post-`ncc` repair for the one dependency ncc cannot bundle statically.
 *
 * `css-tree` (pulled in by `svgo`) loads its own data at runtime rather than
 * importing it, precisely so it does not need JSON import assertions:
 *
 *     // node_modules/css-tree/lib/data-patch.js
 *     const patch = require('../data/patch.json');
 *
 * ncc rewrites that to `createRequire(import.meta.url)('../data/patch.json')`
 * and leaves the specifier alone, because a dynamic require is invisible to
 * static analysis. After bundling, `import.meta.url` is `dist/index.js`, so
 * `../data/patch.json` resolves to `<action-root>/data/patch.json` — a path
 * that does not exist. The bundle then throws MODULE_NOT_FOUND on load, before
 * any of our code runs, and the Action fails on a real runner with an error
 * that says nothing about this project.
 *
 * The fix keeps everything the Action needs inside `dist/`: copy the JSON to
 * `dist/data/patch.json` and repoint the specifier at it. `createRequire`
 * resolves a relative specifier against the requiring file's directory, so
 * `./data/patch.json` from `dist/index.js` lands on the copied file.
 *
 * `src/action-bundle.test.ts` is the permanent guard — it loads the built
 * bundle and fails if this (or any other) module resolution breaks again.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BUNDLE = "dist/index.js";
const SOURCE_JSON = "node_modules/css-tree/data/patch.json";
const DEST_JSON = "dist/data/patch.json";
const BROKEN_SPECIFIER = "'../data/patch.json'";
const FIXED_SPECIFIER = "'./data/patch.json'";

function fail(message: string): never {
  console.error(`[postbuild] ${message}`);
  process.exit(1);
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} not found — run \`npm run build\` first.`);
}
if (!existsSync(SOURCE_JSON)) {
  fail(`${SOURCE_JSON} not found — is css-tree installed? (svgo depends on it)`);
}

mkdirSync(path.dirname(DEST_JSON), { recursive: true });
copyFileSync(SOURCE_JSON, DEST_JSON);

const bundle = readFileSync(BUNDLE, "utf8");

if (!bundle.includes(BROKEN_SPECIFIER)) {
  // Either ncc/css-tree changed shape, or a previous run already patched this
  // file. Distinguish the two rather than silently succeeding: a shape change
  // means this script has quietly stopped doing its job.
  if (bundle.includes(FIXED_SPECIFIER)) {
    console.log(`[postbuild] ${BUNDLE} already patched — nothing to do.`);
    process.exit(0);
  }
  fail(
    `neither ${BROKEN_SPECIFIER} nor ${FIXED_SPECIFIER} appears in ${BUNDLE}. ` +
      `ncc or css-tree changed shape — re-check whether the runtime require still needs patching ` +
      `before assuming this is safe to skip.`
  );
}

const occurrences = bundle.split(BROKEN_SPECIFIER).length - 1;
writeFileSync(BUNDLE, bundle.split(BROKEN_SPECIFIER).join(FIXED_SPECIFIER), "utf8");

console.log(`[postbuild] copied ${SOURCE_JSON} -> ${DEST_JSON}`);
console.log(`[postbuild] repointed ${occurrences} runtime require(s) in ${BUNDLE} to ${FIXED_SPECIFIER}`);
