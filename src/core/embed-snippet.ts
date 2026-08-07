/**
 * Builds the ready-to-paste `<picture>` embed snippet for one card (D-14).
 *
 * Zero-fs, zero-network — this is pure string composition over already-known
 * values (the card's own `describe()` output plus the adopter's own
 * `owner`/`repo`, read from `process.env.GITHUB_REPOSITORY` by the caller in
 * `src/action-entry.ts`, never by this module). Kept in `core/` because it has
 * no I/O of its own, matching the zero-fs boundary rule in
 * `.planning/phases/01-engine-core-zero-api-publish-pipeline/01-CONTEXT.md`'s
 * `<code_context>`.
 */

/**
 * D-16's structural assertion: an `alt` text built from an empty `title` or
 * `desc` is not a degraded-but-usable output, it is a silent accessibility
 * failure (a screen-reader user gets nothing). Thrown instead of returning a
 * half-built string so a future card's broken `describe()` fails loudly
 * during rendering rather than shipping an `<img>` with no `alt`.
 */
export class AltTextEmptyError extends Error {
  constructor() {
    super(
      "AltTextEmptyError: buildAltText() requires a non-empty title AND a non-empty desc " +
        "(D-16) — a card's describe() must never return an empty string for either field.",
    );
    this.name = "AltTextEmptyError";
  }
}

/**
 * Escapes the characters that would otherwise break out of a double-quoted
 * HTML attribute value. Only `&` and `"` matter here — `alt` text is plain
 * text, never markup, so `<`/`>` are left as-is (escaping them would be
 * incorrect for text that legitimately contains those characters, and no
 * current or planned `describe()` output uses them). `&` must be escaped
 * first, or escaping `"` afterward would double-escape the `&` inside
 * `&quot;`.
 */
function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * `${title}: ${desc}` — the exact composition D-16 specifies. Throws
 * `AltTextEmptyError` if either half is an empty string; never returns a
 * half-built alt text.
 */
export function buildAltText(title: string, desc: string): string {
  if (title === "" || desc === "") {
    throw new AltTextEmptyError();
  }
  return `${title}: ${desc}`;
}

export interface EmbedSnippetOptions {
  /** The card's D-10 id — determines the published SVG filenames. */
  id: string;
  /** From the widget's `describe()` — never data-derived (D-16). */
  title: string;
  desc: string;
  /** The adopter's own GitHub login/org. */
  owner: string;
  /** The adopter's own repository name. */
  repo: string;
}

/**
 * Builds the `<picture>` snippet D-14 writes into `GITHUB_STEP_SUMMARY` for
 * one card: a dark-mode `<source>` plus a light-mode `<img>` fallback (light
 * is always the fallback — PITFALLS.md Part A #2: `<picture>`-unaware
 * contexts like email/RSS readers fall back to `<img>`, and most such
 * contexts default to a white background). Both URLs carry D-15's literal,
 * hand-maintained `?v=1` cache-buster — never a computed value.
 */
export function buildEmbedSnippet(opts: EmbedSnippetOptions): string {
  const owner = encodeURIComponent(opts.owner);
  const repo = encodeURIComponent(opts.repo);
  const darkUrl = `https://raw.githubusercontent.com/${owner}/${repo}/output/${opts.id}-dark.svg?v=1`;
  const lightUrl = `https://raw.githubusercontent.com/${owner}/${repo}/output/${opts.id}-light.svg?v=1`;
  const alt = escapeAttr(buildAltText(opts.title, opts.desc));

  return (
    `<picture>` +
    `<source media="(prefers-color-scheme: dark)" srcset="${darkUrl}">` +
    `<img src="${lightUrl}" alt="${alt}">` +
    `</picture>`
  );
}
