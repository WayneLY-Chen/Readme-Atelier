/**
 * Post-`ncc` repair for the dependencies ncc cannot bundle statically.
 *
 * `css-tree` (pulled in by `svgo`) loads its data with runtime `require()`
 * rather than `import`, precisely so it does not need JSON import assertions:
 *
 *     // node_modules/css-tree/lib/data.js
 *     const mdnAtrules   = require('mdn-data/css/at-rules.json');
 *     const mdnProperties= require('mdn-data/css/properties.json');
 *     const mdnSyntaxes  = require('mdn-data/css/syntaxes.json');
 *     // node_modules/css-tree/lib/data-patch.js
 *     const patch        = require('../data/patch.json');
 *
 * ncc rewrites those to `createRequire(import.meta.url)(<same specifier>)` and
 * leaves the specifier alone — a dynamic require is invisible to static
 * analysis. After bundling, `import.meta.url` is `dist/index.js`, so:
 *
 *   - `'../data/patch.json'` resolves to `<action-root>/data/patch.json`, which
 *     does not exist; and
 *   - `'mdn-data/css/*.json'` are BARE specifiers, resolved by walking up for a
 *     `node_modules/` directory.
 *
 * The bare ones are the nastier failure, because they resolve fine on a
 * developer machine (the repo's own `node_modules/` is right there) and fail on
 * a real runner, where `.github/workflows/cards.yml` goes straight from
 * `actions/checkout` to `uses: ./` with no `npm install`. The bundle then throws
 * MODULE_NOT_FOUND on load, before a line of this project's code runs — the
 * whole step dies in under a second with an error naming none of our files.
 *
 * The repair vendors every such file into `dist/` and repoints the specifier at
 * the copy, so the shipped bundle depends on nothing outside its own directory.
 *
 * `src/action-bundle.test.ts` is the permanent guard, and it deliberately runs
 * the bundle from a directory with NO `node_modules` ancestor — otherwise it
 * reproduces the exact blind spot that let this ship.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BUNDLE = "dist/index.js";

/**
 * Every runtime require ncc leaves behind, with where to vendor it. Keep this
 * in sync with the `createRequire` audit in `src/action-bundle.test.ts` — that
 * test fails on ANY specifier not covered here, so a new dependency with the
 * same habit cannot slip through silently.
 *
 * `'../package.json'` is intentionally absent: it resolves to the repository's
 * own committed `package.json`, which is present on the runner.
 */
const VENDORED: { specifier: string; from: string; to: string }[] = [
  { specifier: "'../data/patch.json'", from: "node_modules/css-tree/data/patch.json", to: "dist/data/patch.json" },
  {
    specifier: "'mdn-data/css/at-rules.json'",
    from: "node_modules/mdn-data/css/at-rules.json",
    to: "dist/mdn-data/css/at-rules.json",
  },
  {
    specifier: "'mdn-data/css/properties.json'",
    from: "node_modules/mdn-data/css/properties.json",
    to: "dist/mdn-data/css/properties.json",
  },
  {
    specifier: "'mdn-data/css/syntaxes.json'",
    from: "node_modules/mdn-data/css/syntaxes.json",
    to: "dist/mdn-data/css/syntaxes.json",
  },
];

function fail(message: string): never {
  console.error(`[postbuild] ${message}`);
  process.exit(1);
}

if (!existsSync(BUNDLE)) {
  fail(`${BUNDLE} not found — run \`npm run build\` first.`);
}

let bundle = readFileSync(BUNDLE, "utf8");
let patched = 0;

for (const { specifier, from, to } of VENDORED) {
  // `to` is always under dist/, and createRequire resolves a relative specifier
  // against the requiring file's directory — which IS dist/ after bundling.
  const rewritten = `'./${path.relative("dist", to).split(path.sep).join("/")}'`;

  if (!bundle.includes(specifier)) {
    if (bundle.includes(rewritten)) {
      console.log(`[postbuild] ${specifier} already repointed to ${rewritten}`);
      continue;
    }
    fail(
      `neither ${specifier} nor ${rewritten} appears in ${BUNDLE}. ncc or the dependency changed shape — ` +
        `re-check whether this runtime require still needs vendoring before assuming it is safe to skip.`
    );
  }

  if (!existsSync(from)) {
    fail(`${from} not found — are dependencies installed? (svgo -> css-tree -> mdn-data)`);
  }

  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);

  const occurrences = bundle.split(specifier).length - 1;
  bundle = bundle.split(specifier).join(rewritten);
  patched += occurrences;
  console.log(`[postbuild] vendored ${from} -> ${to}  (${occurrences} require site(s) repointed)`);
}

writeFileSync(BUNDLE, bundle, "utf8");
console.log(`[postbuild] ${patched} runtime require(s) now resolve inside dist/`);
