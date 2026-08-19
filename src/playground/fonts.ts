import { registerFont } from "../core/font.js";

/**
 * Browser sibling of `src/node/fonts.ts` — NOT a replacement. Same four
 * registration names (`mono-regular` / `mono-semibold` / `serif` /
 * `noto-tc`, byte-for-byte identical to `src/node/fonts.ts:32-35`), feeding
 * the same environment-agnostic `registerFont(name, ArrayBuffer)`
 * (`src/core/font.ts`) — only the byte source differs: `fetch` here,
 * `readFileSync` there (D-01).
 *
 * All URLs are RELATIVE (`assets/fonts/...`, never a leading `/`). The
 * playground is served from a GitHub Pages PROJECT site, which lives under a
 * subpath (e.g. `/Readme-Atelier/`) — an absolute path would 404 there even
 * though it works fine on localhost (RESEARCH.md Pitfall 7). `index.html`
 * must never add a `<base>` tag either, or this reasoning breaks silently.
 */
const LATIN = [
  ["mono-regular", "assets/fonts/ibm-plex-mono-regular.subset.ttf"],
  ["mono-semibold", "assets/fonts/ibm-plex-mono-semibold.subset.ttf"],
  ["serif", "assets/fonts/source-serif-4.subset.ttf"],
] as const;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`font fetch failed: ${url} (${res.status})`);
  }
  return res.arrayBuffer();
}

/**
 * D-01's first tier: the three Latin subsets (~96KB total, measured — see
 * RESEARCH.md Pattern 2), loaded up front before the playground can render
 * its first card.
 */
export async function loadLatinFonts(): Promise<void> {
  await Promise.all(LATIN.map(async ([name, url]) => registerFont(name, await fetchFont(url))));
}

let tcLoaded: Promise<void> | undefined;

/**
 * D-01's second tier: the 4.0MB `noto-serif-tc.subset.ttf`, fetched exactly
 * once (singleton Promise) and only when the visitor actually switches to
 * `zh-TW` — never on initial page load. Calling this repeatedly returns the
 * same in-flight/settled Promise rather than re-fetching.
 */
export function ensureTcFont(): Promise<void> {
  tcLoaded ??= fetchFont("assets/fonts/noto-serif-tc.subset.ttf").then((buf) => registerFont("noto-tc", buf));
  return tcLoaded;
}

/**
 * UI-SPEC's Retry contract for a failed zh-TW font load: reset the singleton
 * so the next `ensureTcFont()` call re-fetches from scratch instead of
 * replaying a rejected Promise forever.
 */
export function resetTcFontForRetry(): void {
  tcLoaded = undefined;
}
