import type { Theme, WidgetSize } from "./model.js";

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
 * Does not implement renderPair()/sizeGuard() yet — that's Plan 03.
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
