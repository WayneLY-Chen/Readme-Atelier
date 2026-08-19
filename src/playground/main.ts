import { buildAltText } from "../core/embed-snippet.js";
import { loadConfigOrDefault } from "../core/config.js";
import { renderAllCards, resolveCards, resolveTheme } from "../core/pipeline.js";
import { registerAllWidgets } from "../widgets/all.js";
import { loadLatinFonts } from "./fonts.js";
import { DEMO_PROFILE, PINNED_NOW, PINNED_SEED } from "./fixture.js";

/**
 * The playground's composition root — the THIRD entry point wired to the
 * exact same production pipeline `src/cli.ts` and `src/action-entry.ts` use
 * (RESEARCH.md Pattern 2: resolve -> fetch -> render). This is deliberately
 * minimal for Task 2's tracer slice: render the default config's one card
 * (`almanac`, per `core/config.ts`'s `DEFAULT_CONFIG`) against the D-02
 * synthetic fixture and inject it into the page. Later plans in this phase
 * (05-04) extend this file with the full four-axis control bar and the
 * three-artifact Adoption Kit — they must ONLY add to this composition, never
 * bypass it with a parallel render path (must_haves prohibition: the only
 * rendering path is `renderAllCards` — never the lower-level per-card
 * primitives `core/svg.ts` exports internally, called directly).
 *
 * `registerAllWidgets()` (src/widgets/all.ts, Plan 05-01) is called exactly
 * once, at module load — `register()` throws `DuplicateWidgetError` on a
 * second call, so a future hot-reload/re-render loop must never call this
 * function again.
 */

let currentObjectUrl: string | undefined;

/**
 * Injects `svg` into `img` via a Blob object URL — never `innerHTML` with a
 * live `<svg>` DOM (UI-SPEC hard constraint). Revokes the previous object URL
 * first so repeated re-renders don't leak memory.
 */
function setCardImage(img: HTMLImageElement, svg: string, alt: string): void {
  if (currentObjectUrl !== undefined) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  const blob = new Blob([svg], { type: "image/svg+xml" });
  currentObjectUrl = URL.createObjectURL(blob);
  img.src = currentObjectUrl;
  img.alt = alt;
}

async function main(): Promise<void> {
  await loadLatinFonts();
  registerAllWidgets();

  // The default config (almanac only, editorial theme, en, UTC) — the
  // tracer's minimal render input. Later plans swap this for the four-axis
  // control bar's live selection.
  const { config } = loadConfigOrDefault(undefined);
  const cards = resolveCards(config);
  const rendered = renderAllCards(
    cards,
    DEMO_PROFILE,
    { now: PINNED_NOW, seed: PINNED_SEED, language: "en" },
    resolveTheme("editorial"),
  );

  const firstCard = rendered[0];
  if (firstCard === undefined) {
    return;
  }

  const img = document.getElementById("playground-card") as HTMLImageElement | null;
  if (img === null) {
    return;
  }
  setCardImage(img, firstCard.light, buildAltText(firstCard.title, firstCard.desc));

  // The bundle initialized successfully — hide the static noscript/boot
  // fallback content now, never before this point (UI-SPEC page-shell
  // contract: the fallback is visible by default and only script that runs
  // AFTER a successful boot may hide it).
  document.getElementById("playground-boot-fallback")?.setAttribute("hidden", "");
  document.getElementById("playground-app")?.removeAttribute("hidden");
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
});
