import { mkdirSync, writeFileSync } from "node:fs";
import { fetchProfileData } from "./core/fetch.js";
import type { RenderOptions } from "./core/model.js";
import { get, register } from "./core/registry.js";
import { wrapSvg } from "./core/svg.js";
import { editorialLight } from "./core/theme.js";
import { loadAllFonts } from "./node/fonts.js";
import { almanacWidget } from "./widgets/almanac/index.js";

/**
 * Local preview entry point. This task does not parse widgets.yml yet
 * (Plan 04) — it always renders the Almanac card, English mode, editorial
 * light theme only, to .preview/almanac-light.svg.
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

  const { title, desc } = widget.describe(stubProfileData, opts);
  const body = widget.renderBody(stubProfileData, editorialLight, opts);
  const svg = wrapSvg(body, widget.size, editorialLight, title, desc);

  mkdirSync(".preview", { recursive: true });
  writeFileSync(".preview/almanac-light.svg", svg, "utf8");
  console.log("[cli] wrote .preview/almanac-light.svg");
}

await main();
