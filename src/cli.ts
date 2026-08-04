import { mkdirSync, writeFileSync } from "node:fs";
import { fetchProfileData } from "./core/fetch.js";
import type { RenderOptions } from "./core/model.js";
import { get, register } from "./core/registry.js";
import {
  HARD_SIZE_CANARY_BYTES,
  renderPair,
  SOFT_SIZE_BUDGET_BYTES,
  sizeGuard,
} from "./core/svg.js";
import { editorialDark, editorialLight } from "./core/theme.js";
import { loadAllFonts } from "./node/fonts.js";
import { almanacWidget } from "./widgets/almanac/index.js";

/**
 * Local preview entry point. This task does not parse widgets.yml yet
 * (Plan 04) — it always renders the Almanac card, English mode, both
 * editorial themes, to .preview/almanac-light.svg and
 * .preview/almanac-dark.svg (D-13's <id>-light.svg / <id>-dark.svg naming
 * convention, first landed in code here — approved at this plan's
 * checkpoint:decision). `id` is almanacWidget.name for now; Plan 04 replaces
 * this with the real widgets.yml-derived id (a data-source swap, not an
 * architecture change).
 */
async function main(): Promise<void> {
  loadAllFonts();
  register(almanacWidget);

  const opts: RenderOptions = {
    now: new Date(),
    seed: 0,
    timezone: "UTC",
    language: "en",
  };

  // Zero-capability stub: Almanac needs no GitHub data (DATA-03), so this
  // never issues a network request.
  const stubProfileData = await fetchProfileData(new Set(), "");

  const widget = get("almanac");
  if (!widget) {
    throw new Error("cli: almanac widget was not found in the registry after register()");
  }

  const id = widget.name;
  const lightLabel = `${id}-light.svg`;
  const darkLabel = `${id}-dark.svg`;

  const { light, dark } = renderPair(widget, stubProfileData, opts, {
    light: editorialLight,
    dark: editorialDark,
  });

  // Soft budget first (RENDER-07): any single file over 200KB fails the
  // whole run before anything is written.
  sizeGuard(light, lightLabel, SOFT_SIZE_BUDGET_BYTES);
  sizeGuard(dark, darkLabel, SOFT_SIZE_BUDGET_BYTES);

  // Hard canary second-layer defense (1MB) — normal operation never reaches
  // this, the soft budget above always trips first.
  sizeGuard(light, lightLabel, HARD_SIZE_CANARY_BYTES);
  sizeGuard(dark, darkLabel, HARD_SIZE_CANARY_BYTES);

  mkdirSync(".preview", { recursive: true });
  writeFileSync(`.preview/${lightLabel}`, light, "utf8");
  writeFileSync(`.preview/${darkLabel}`, dark, "utf8");
  console.log(`[cli] wrote .preview/${lightLabel}`);
  console.log(`[cli] wrote .preview/${darkLabel}`);
}

await main();
