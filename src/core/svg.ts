import type { ProfileData, RenderOptions, Theme, WidgetSize } from "./model.js";
import type { WidgetDefinition } from "./registry.js";

const REDUCED_MOTION_STYLE =
  "<style>@media (prefers-reduced-motion: reduce){*{animation-duration:0.01ms!important;animation-iteration-count:1!important;}}</style>";

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Wrap a widget's inner body markup in the shared <svg> shell every card
 * inherits: root element, <title>/<desc>, background + inset border rects,
 * and the always-present prefers-reduced-motion style block. This is the one
 * place that owns the outer shell so no widget can omit or diverge from it.
 */
export function wrapSvg(
  bodyMarkup: string,
  size: WidgetSize,
  theme: Theme,
  title: string,
  desc: string,
): string {
  const { width, height } = size;
  return (
    `<svg role="img" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<title>${escapeXmlText(title)}</title>` +
    `<desc>${escapeXmlText(desc)}</desc>` +
    `<rect width="${width}" height="${height}" rx="6" fill="${theme.paper}"/>` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="5.5" fill="none" stroke="${theme.rule}"/>` +
    REDUCED_MOTION_STYLE +
    bodyMarkup +
    `</svg>`
  );
}

/**
 * Render a widget's paired light/dark SVG output (RENDER-03). Calls
 * `widget.renderBody` exactly twice, with only the `Theme` argument
 * differing between the two calls — this is the entire mechanism behind the
 * "light/dark structural invariant" (01-UI-SPEC.md): no widget author has a
 * way to intentionally violate it, since renderPair (not the widget) owns
 * the one place the two calls happen. `describe()` is called once, since its
 * result depends only on `data`/`opts`, never on `theme`.
 */
export function renderPair(
  widget: WidgetDefinition<RenderOptions>,
  data: ProfileData,
  opts: RenderOptions,
  themes: { light: Theme; dark: Theme },
): { light: string; dark: string } {
  const { title, desc } = widget.describe(data, opts);
  return {
    light: wrapSvg(
      widget.renderBody(data, themes.light, opts),
      widget.size,
      themes.light,
      title,
      desc,
    ),
    dark: wrapSvg(
      widget.renderBody(data, themes.dark, opts),
      widget.size,
      themes.dark,
      title,
      desc,
    ),
  };
}

/**
 * RENDER-07 soft budget: 200 KiB, per-file. Any single rendered SVG over
 * this fails the whole CLI run (or, in the real Action, the whole build) —
 * see 01-UI-SPEC.md's `almanac-card` "overflow" backstop item.
 */
export const SOFT_SIZE_BUDGET_BYTES = 204800;

/**
 * PITFALLS.md's second-layer hard canary: 1 MiB, leaving safety margin below
 * GitHub camo's 5MB hard proxy limit. Normal operation never reaches this —
 * the soft budget above always trips first — this exists purely as a last
 * line of defense if a future edit accidentally bypasses or removes the soft
 * check.
 */
export const HARD_SIZE_CANARY_BYTES = 1048576;

export class SizeBudgetError extends Error {
  constructor(label: string, bytes: number, budgetBytes: number) {
    super(`${label} exceeds size budget: ${bytes} bytes > ${budgetBytes} bytes budget`);
    this.name = "SizeBudgetError";
  }
}

/**
 * Throws SizeBudgetError if `svg`'s UTF-8 byte length exceeds `budgetBytes`.
 * Called twice per rendered file (once against SOFT_SIZE_BUDGET_BYTES, once
 * against HARD_SIZE_CANARY_BYTES) by the CLI/Action before any file is
 * written — any failure means nothing gets written at all.
 */
export function sizeGuard(svg: string, label: string, budgetBytes: number): void {
  const bytes = Buffer.byteLength(svg, "utf8");
  if (bytes > budgetBytes) {
    throw new SizeBudgetError(label, bytes, budgetBytes);
  }
}
