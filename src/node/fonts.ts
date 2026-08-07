import { readFileSync } from "node:fs";
import path from "node:path";
import { registerFont } from "../core/font.js";

function readFontBuffer(baseDir: string, relativePath: string): ArrayBuffer {
  const buffer = readFileSync(path.join(baseDir, relativePath));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/**
 * Node-only font loader. This file is deliberately outside src/core and
 * src/widgets — those two directories must never import fs/path/process (see
 * 01-CONTEXT.md's <code_context>, kept so Phase 5's browser playground can
 * reuse core/widgets source unchanged). This is the one place that actually
 * touches disk to hand raw bytes to core/font.ts's registerFont().
 *
 * `baseDir` defaults to `process.cwd()` — correct for `src/cli.ts`'s local
 * preview use case, where an adopter runs `npm run preview` FROM this repo's
 * own root. It is NOT correct for `src/action-entry.ts`: a real GitHub
 * Actions run's working directory is `$GITHUB_WORKSPACE` (the CONSUMER's own
 * checked-out repository, which has no `assets/` directory at all), never
 * this repo's checkout. `action-entry.ts` therefore passes an explicit
 * `baseDir` derived from its OWN module location (`import.meta.url`), which
 * — confirmed empirically against a real `@vercel/ncc`-bundled `dist/index.js`
 * run from an unrelated `cwd` — correctly resolves to wherever the action's
 * own code (and its committed `assets/fonts/`) actually live on the runner,
 * regardless of the workflow's working directory (Plan 05, Rule 2 fix: the
 * plan's original text did not address this and the Action would otherwise
 * fail with ENOENT on every real run).
 */
export function loadAllFonts(baseDir: string = process.cwd()): void {
  registerFont("mono-regular", readFontBuffer(baseDir, "assets/fonts/ibm-plex-mono-regular.subset.ttf"));
  registerFont("mono-semibold", readFontBuffer(baseDir, "assets/fonts/ibm-plex-mono-semibold.subset.ttf"));
  registerFont("serif", readFontBuffer(baseDir, "assets/fonts/source-serif-4.subset.ttf"));
  registerFont("noto-tc", readFontBuffer(baseDir, "assets/fonts/noto-serif-tc.subset.ttf"));
}
