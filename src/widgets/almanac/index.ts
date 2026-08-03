import { measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import {
  chromeEn,
  ganZhiToEnglish,
  gregorianCaptionEn,
  lunarValueEn,
  yijiTableEn,
} from "./copy.js";
import { getAlmanacContent } from "./lunar.js";

const CARD_WIDTH = 495;
const CARD_HEIGHT = 220;
const PADDING = 24;

const T1_SIZE = 8;
const T3_SIZE = 17;
const T4_SIZE = 44;
const T1_LETTER_SPACING = 1.6;

function pathElement(d: string, fill: string): string {
  if (d === "") {
    return "";
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

/**
 * Left-aligned run of glyph paths with manual per-character advance plus a
 * fixed letter-spacing add-on between characters (UI-SPEC T1 eyebrow style:
 * +1.6 user-unit letter-spacing). IBM Plex Mono's own per-character advance
 * already comes from measureAdvanceWidth(); this only adds the extra gap.
 */
function letterSpacedPath(
  fontName: string,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  letterSpacing: number,
): string {
  let cursorX = x;
  let d = "";
  const chars = Array.from(text);
  chars.forEach((ch, i) => {
    d += textToPathData(fontName, ch, cursorX, y, fontSize);
    cursorX +=
      measureAdvanceWidth(fontName, ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return d;
}

/** T1 eyebrow/label style: IBM Plex Mono Semibold, uppercase, letter-spaced. */
function eyebrowLabel(text: string, x: number, y: number, fill: string): string {
  const d = letterSpacedPath("mono-semibold", text.toUpperCase(), x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

/**
 * T3 primary-content style. UI-SPEC calls for Source Serif 4 here; this task
 * is a deliberate single-font stopgap (see 01-01-PLAN.md Task 2 action item
 * 8) that substitutes IBM Plex Mono Regular for every serif-designated text
 * role until Plan 02 installs Source Serif 4 and swaps this call site's
 * first argument back to a serif font name.
 */
function contentText(text: string, x: number, y: number, fill: string): string {
  const d = textToPathData("mono-regular", text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

interface Point {
  x: number;
  y: number;
}

function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

/**
 * Almanac's WidgetDefinition. Opts is the full RenderOptions shape (not a
 * narrower per-widget-options subset) — deviation from the plan text's
 * literal `optionsSchema` sketch, recorded in SUMMARY.md: renderBody needs
 * `opts.now`/`opts.timezone` directly (Task 2 action item 8 explicitly calls
 * `getAlmanacContent(opts.now, opts.timezone)`), so this widget's Opts type
 * must include them. The placeholder optionsSchema.parse() below pads in
 * `now`/`seed` defaults purely to satisfy this type — it is not exercised by
 * Task 2's cli.ts (which builds RenderOptions directly) and will be replaced
 * by a real zod schema wired to widgets.yml parsing in Plan 04.
 */
export const almanacWidget: WidgetDefinition<RenderOptions> = {
  name: "almanac",
  requires: [],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      const v = (value ?? {}) as Record<string, unknown>;
      return {
        now: new Date(),
        seed: 0,
        language: (v.language as RenderOptions["language"]) ?? "en",
        timezone: (v.timezone as string) ?? "UTC",
      };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language !== "en") {
      throw new Error("zh-TW not yet implemented — Plan 02");
    }
    return {
      title: "Almanac card",
      desc:
        "Shows today's Gregorian date, lunar month and day, the sexagenary day designation, " +
        "and a developer auspicious/inauspicious reading derived from the 建除十二神 cycle.",
    };
  },

  renderBody(_data: ProfileData, theme: Theme, opts: RenderOptions): string {
    if (opts.language !== "en") {
      throw new Error("zh-TW not yet implemented — Plan 02");
    }

    const content = getAlmanacContent(opts.now, opts.timezone);
    const yiji = yijiTableEn[content.zhiXing];
    if (!yiji) {
      throw new Error(`Almanac: no 宜/忌 mapping for zhiXing "${content.zhiXing}"`);
    }

    let markup = "";

    // Header: title (T3), left-aligned. English mode has no masthead
    // eyebrow — that decorative mark is zh-TW-only per UI-SPEC Card Layout.
    markup += contentText(chromeEn.title, PADDING, 44, theme.ink);
    markup += `<line x1="${PADDING}" y1="58" x2="${CARD_WIDTH - PADDING}" y2="58" stroke="${theme.rule}" stroke-width="1"/>`;

    // Isometric slab (UI-SPEC "Isometric Slab Specification"): 100x100
    // front face, 32-unit depth extrusion at a 30 degree angle.
    const slabX = PADDING;
    const slabY = 70;
    const faceSize = 100;
    const depth = 32;
    const angleRad = (30 * Math.PI) / 180;
    const dx = depth * Math.cos(angleRad);
    const dy = depth * Math.sin(angleRad);

    const ftl: Point = { x: slabX, y: slabY };
    const ftr: Point = { x: slabX + faceSize, y: slabY };
    const fbl: Point = { x: slabX, y: slabY + faceSize };

    const topFacePoints: Point[] = [
      ftl,
      ftr,
      { x: ftr.x + dx, y: ftr.y - dy },
      { x: ftl.x + dx, y: ftl.y - dy },
    ];
    const sideFacePoints: Point[] = [
      ftl,
      fbl,
      { x: fbl.x + dx, y: fbl.y + dy },
      { x: ftl.x + dx, y: ftl.y + dy },
    ];

    markup += `<polygon points="${pointsAttr(topFacePoints)}" fill="${theme.rule}"/>`;
    markup += `<polygon points="${pointsAttr(sideFacePoints)}" fill="${theme.muted}"/>`;
    markup += `<rect x="${ftl.x}" y="${ftl.y}" width="${faceSize}" height="${faceSize}" fill="${theme.accent}"/>`;

    // Giant day-of-month numeral: right-aligned within a fixed two-digit
    // slot, no leading zero (UI-SPEC "zero-one-many" — days 1-9 leave
    // natural whitespace on the left instead of a leading "0").
    const digitWidth = measureAdvanceWidth("mono-semibold", "0", T4_SIZE);
    const slotWidth = digitWidth * 2;
    const dayStr = String(content.gregorian.day);
    const dayWidth = measureAdvanceWidth("mono-semibold", dayStr, T4_SIZE);
    const faceCenterX = ftl.x + faceSize / 2;
    const faceCenterY = ftl.y + faceSize / 2;
    const slotLeftX = faceCenterX - slotWidth / 2;
    const numeralX = slotLeftX + (slotWidth - dayWidth);
    const numeralY = faceCenterY + T4_SIZE * 0.35;
    markup += pathElement(
      textToPathData("mono-semibold", dayStr, numeralX, numeralY, T4_SIZE),
      theme.paper,
    );

    // Meta column: weekday / lunar date / 干支, three label+value rows.
    const metaX = 188;
    const rowHeight = 36;
    const rowTop0 = 70;
    const metaRows: { label: string; value: string; valueFill: string }[] = [
      {
        label: gregorianCaptionEn(content.gregorian.month, content.gregorian.year),
        value: chromeEn.weekdayNames[content.gregorian.weekday],
        valueFill: theme.ink,
      },
      {
        label: chromeEn.lunarLabel,
        value: lunarValueEn(content.lunarMonth, content.lunarDay),
        valueFill: theme.accent,
      },
      {
        label: chromeEn.ganzhiLabel,
        value: ganZhiToEnglish(content.dayGanZhi),
        valueFill: theme.ink,
      },
    ];

    metaRows.forEach((row, i) => {
      const rowTop = rowTop0 + i * rowHeight;
      const labelBaseline = rowTop + 12;
      const valueBaseline = labelBaseline + 21;
      markup += eyebrowLabel(row.label, metaX, labelBaseline, theme.muted);
      markup += contentText(row.value, metaX, valueBaseline, row.valueFill);
      if (i < metaRows.length - 1) {
        const dividerY = rowTop + rowHeight;
        markup += `<line x1="${metaX}" y1="${dividerY}" x2="${CARD_WIDTH - PADDING}" y2="${dividerY}" stroke="${theme.rule}" stroke-width="1"/>`;
      }
    });

    markup += `<line x1="${PADDING}" y1="178" x2="${CARD_WIDTH - PADDING}" y2="178" stroke="${theme.rule}" stroke-width="1"/>`;

    // 宜/忌 lines. 宜 uses accent, 忌 uses muted (UI-SPEC Color — no second
    // semantic/destructive hue is introduced for this card, by design).
    markup += contentText(
      `${chromeEn.auspiciousPrefix}${yiji.auspicious}`,
      PADDING,
      199,
      theme.accent,
    );
    markup += contentText(`${chromeEn.avoidPrefix}${yiji.avoid}`, PADDING, 215, theme.muted);

    return markup;
  },
};
