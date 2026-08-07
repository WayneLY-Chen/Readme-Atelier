import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ConfigValidationError, formatConfigErrors, loadConfigOrDefault } from "./core/config.js";
import { renderAllCards } from "./core/pipeline.js";
import { register } from "./core/registry.js";
import { loadAllFonts } from "./node/fonts.js";
import { almanacWidget } from "./widgets/almanac/index.js";

/**
 * Local preview entry point (UX-04). Reads a real `widgets.yml` off disk (or
 * applies D-11's built-in defaults if it does not exist), validates it, and
 * renders every enabled card to `.preview/<id>-light.svg` /
 * `.preview/<id>-dark.svg` — no network, no push, nothing beyond this
 * process. `cli.ts` itself does exactly three things: read the file (or
 * not), print/report, write files. All registry lookup, `renderPair` calls,
 * and size-guard checks live in `core/pipeline.ts`'s `renderAllCards()`,
 * shared with the future `action-entry.ts` — this file never reimplements
 * any of that (must_haves, Plan 04).
 */
async function main(): Promise<void> {
  loadAllFonts();
  register(almanacWidget);

  const configPath = process.argv[2] ?? "widgets.yml";
  const yamlText = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;

  let config;
  let usedDefault: boolean;
  let equivalentYaml: string;
  try {
    ({ config, usedDefault, equivalentYaml } = loadConfigOrDefault(yamlText));
  } catch (error) {
    // D-12: report every problem at once and exit non-zero, writing nothing
    // at all — validation always runs to completion before any file
    // touches disk.
    if (error instanceof ConfigValidationError) {
      console.error(formatConfigErrors(error.errors));
    } else {
      console.error(error);
    }
    process.exit(1);
    return;
  }

  if (usedDefault) {
    // D-11's transparency requirement: this is a snapshot of what THIS run
    // produced, not a live/continuously-updated preview — the wording below
    // must not imply the card stays in sync with `equivalentYaml` after
    // this point (must_haves prohibition, UX-01 transparency).
    console.log("-".repeat(72));
    console.log(
      `[cli] No ${configPath} found — this run used the built-in defaults. This is a snapshot ` +
        "of what you just ran, right now; it will not keep updating on its own. Copy the YAML " +
        `below into ${configPath} to make it your real, editable configuration:`,
    );
    console.log("");
    console.log(equivalentYaml);
    console.log("-".repeat(72));
  }

  let cards;
  try {
    cards = renderAllCards(config, { now: new Date(), seed: 0 });
  } catch (error) {
    // Same D-12 contract as the config-parse error path above: report and
    // exit non-zero, write nothing. UnknownWidgetError/InvalidCardOptionsError
    // aren't FormattedConfigError-shaped (they come from core/pipeline.ts,
    // not core/config.ts), so they're reported as plain named errors rather
    // than run through formatConfigErrors.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
    return;
  }

  if (cards.length === 0) {
    // must_haves (UX-01/empty): an existing-but-empty `cards: []` is valid
    // and renders zero cards — distinct from a missing widgets.yml (handled
    // above), and worth a visible warning since it is very likely an
    // adopter's mistake, not their intent.
    console.warn(`[cli] ${configPath} enables zero cards — nothing was rendered.`);
  }

  mkdirSync(".preview", { recursive: true });
  for (const { id, light, dark } of cards) {
    writeFileSync(`.preview/${id}-light.svg`, light, "utf8");
    writeFileSync(`.preview/${id}-dark.svg`, dark, "utf8");
    console.log(`[cli] wrote .preview/${id}-light.svg`);
    console.log(`[cli] wrote .preview/${id}-dark.svg`);
  }
}

await main();
