import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import {
  chromeEn,
  chromeZh,
  ganZhiToEnglish,
  gregorianCaptionEn,
  gregorianCaptionZh,
  lunarValueEn,
  lunarValueZh,
  yijiTableEn,
  yijiTableZh,
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

/**
 * Total rendered width of a letter-spaced run, for right-aligning the
 * masthead eyebrow (UI-SPEC Header row: "right-aligned, x≈471 right edge").
 * Mirrors letterSpacedPath's own cursor math exactly so the two never drift
 * apart.
 */
function letterSpacedWidth(
  fontName: string,
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
  const chars = Array.from(text);
  let width = 0;
  chars.forEach((ch, i) => {
    width += measureAdvanceWidth(fontName, ch, fontSize) + (i < chars.length - 1 ? letterSpacing : 0);
  });
  return width;
}

/**
 * T1 eyebrow/label style for English text: IBM Plex Mono Semibold,
 * uppercase, letter-spaced, 8px. Used for en-mode caption labels (LUNAR,
 * SEXAGENARY DAY, the month/year caption) and for the zh-TW-only masthead
 * eyebrow, which is always English brand furniture regardless of the card's
 * active language (UI-SPEC Header row: "it is brand furniture, not
 * translatable content").
 */
function eyebrowLabel(text: string, x: number, y: number, fill: string): string {
  const upper = text.toUpperCase();
  assertCoverage("mono-semibold", upper, `almanac T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

/**
 * T1 label style for zh-TW Chinese caption labels (農曆/干支/the
 * `{year}年{month}月` caption). UI-SPEC's Typography table names IBM Plex
 * Mono for the whole T1 role, but Plex Mono carries zero CJK glyph coverage
 * — this is the necessary interpretation already flagged in this plan's
 * must_haves backstop: Chinese T1 labels render in Noto Serif TC instead, at
 * the same 8px size, with no uppercase transform and no manual
 * letter-spacing (neither concept exists for Han script).
 */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `almanac T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

/**
 * CJK/Latin mixed-composition rule (UI-SPEC "CJK/Latin mixed-composition
 * rule"): when a single visual line mixes Noto Serif TC and Source Serif 4
 * glyphs, Noto Serif TC renders at 92% of the token's declared size so the
 * two faces read as optically balanced against each other. Almanac v1 never
 * actually triggers this — every string on this card is monolingual per
 * D-08 (each `language:` mode picks exactly one of the two serif faces) —
 * so every call site below passes `isMixedLine = false`. The decision point
 * is still written here, not omitted, because this is shared chassis logic
 * (the mixed-script primitive UI-SPEC says belongs in `svg.ts`) that a
 * future bilingual-masthead or mixed-display-name card will need to
 * exercise for real.
 */
function mixedCompositionSize(fontName: string, baseSize: number, isMixedLine: boolean): number {
  return fontName === "noto-tc" && isMixedLine ? baseSize * 0.92 : baseSize;
}

/**
 * T3 primary-content style: Source Serif 4 (`serif`) in en mode, Noto Serif
 * TC (`noto-tc`) in zh-TW mode — the real per-language font dispatch this
 * task installs, replacing Plan 01's "everything in mono-regular" stopgap.
 * `context` is threaded into assertCoverage (RENDER-05) so a coverage
 * failure names the offending card field rather than just the character.
 */
function contentText(
  fontName: string,
  text: string,
  x: number,
  y: number,
  fill: string,
  context: string,
): string {
  assertCoverage(fontName, text, context);
  const size = mixedCompositionSize(fontName, T3_SIZE, false);
  const d = textToPathData(fontName, text, x, y, size);
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
 * Almanac's own `options:` sub-block schema (D-09: `options: { timezone: ... }`
 * is the one thing a card entry may override). Plan 04, Task 3: this is the
 * real zod schema that replaces Plan 01's hand-written placeholder object —
 * a genuine implementation swap-in, not a new data shape (Plan 01's own
 * summary already flagged the placeholder as "not exercised until Plan 04
 * wires real widgets.yml parsing").
 *
 * `.strict()` is load-bearing, not stylistic. `core/config.ts` types a card's
 * `options:` as `z.record(z.string(), z.unknown())` — it validates that the
 * block is a mapping but cannot know which keys any given widget accepts, so
 * it lets every key through. This schema is the ONLY thing standing between
 * an adopter and a silently-ignored option. Without `.strict()`, `timezon:`
 * (typo) renders in UTC with no complaint, and `language: zh-TW` written at
 * the card level is dropped on the floor rather than reported — the latter
 * being precisely D-08's prohibition (`language` is top-level only, never a
 * per-card override), which is enforced here by rejection instead of silence.
 */
const almanacOptionsSchema = z.object({ timezone: z.string().optional() }).strict();

/**
 * Almanac's WidgetDefinition. Opts is the full RenderOptions shape (not a
 * narrower per-widget-options subset) — this is required by
 * `core/svg.ts`'s `renderPair(widget: WidgetDefinition<RenderOptions>, ...)`
 * signature, which every widget passed to it must satisfy, and by
 * `renderBody`/`describe` needing `opts.now`/`opts.timezone`/`opts.language`
 * directly. `optionsSchema.parse()` below therefore has two jobs: (1) run
 * the real `almanacOptionsSchema` validation against the card's own
 * `options:` block (throwing zod's own error for e.g. a non-string
 * `timezone`), and (2) still return a full `RenderOptions`-shaped value to
 * satisfy `OptionsSchema<RenderOptions>`. The `now`/`seed`/`language`
 * fields returned here are placeholders (this validation call's result is
 * not what actually drives rendering) — `core/pipeline.ts`'s
 * `renderAllCards()` builds the real merged `RenderOptions` (top-level
 * `language`, `now`/`seed` threaded from the caller, entry-level `timezone`
 * override) independently and passes THAT to `renderPair`, never this
 * function's return value.
 */
export const almanacWidget: WidgetDefinition<RenderOptions> = {
  name: "almanac",
  requires: [],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      const { timezone } = almanacOptionsSchema.parse(value ?? {});
      return {
        now: new Date(),
        seed: 0,
        language: "en",
        timezone: timezone ?? "UTC",
      };
    },
  },

  // Deviation from the plan text (recorded in SUMMARY.md, Plan 02 Task 3):
  // Plan 01's stopgap threw for any non-"en" language in both describe()
  // and renderBody(). Task 3's whole point is installing the zh-TW half —
  // leaving describe() throwing would make the widget's own metadata method
  // contradict its rendering method the moment a caller asks for zh-TW.
  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "曆日卡片",
        desc: "顯示今日西曆日期、農曆月日、干支紀日，以及依建除十二神循環推算出的開發者宜/忌建議。",
      };
    }
    return {
      title: "Almanac card",
      desc:
        "Shows today's Gregorian date, lunar month and day, the sexagenary day designation, " +
        "and a developer auspicious/inauspicious reading derived from the 建除十二神 cycle.",
    };
  },

  renderBody(_data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";
    const chrome = language === "zh-TW" ? chromeZh : chromeEn;
    const yijiTable = language === "zh-TW" ? yijiTableZh : yijiTableEn;

    const content = getAlmanacContent(opts.now, opts.timezone);
    const yiji = yijiTable[content.zhiXing];
    if (!yiji) {
      throw new Error(
        `Almanac: no 宜/忌 mapping for zhiXing "${content.zhiXing}" (language: ${language})`,
      );
    }

    let markup = "";

    // Header: title (T3), left-aligned.
    markup += contentText(
      contentFont,
      chrome.title,
      PADDING,
      44,
      theme.ink,
      `almanac title (${language})`,
    );
    markup += `<line x1="${PADDING}" y1="58" x2="${CARD_WIDTH - PADDING}" y2="58" stroke="${theme.rule}" stroke-width="1"/>`;

    // Masthead eyebrow (UI-SPEC "Header row"): decorative Latin brand mark,
    // present in zh-TW mode only, right-aligned to the card's right padding
    // edge (x≈471). Never rendered in en mode — D-08 guarantees en mode
    // needs zero CJK glyphs, and en mode's header row is the title alone.
    if (language === "zh-TW") {
      const eyebrowText = chromeZh.mastheadEyebrow;
      const eyebrowWidth = letterSpacedWidth(
        "mono-semibold",
        eyebrowText.toUpperCase(),
        T1_SIZE,
        T1_LETTER_SPACING,
      );
      const eyebrowX = CARD_WIDTH - PADDING - eyebrowWidth;
      markup += eyebrowLabel(eyebrowText, eyebrowX, 44, theme.muted);
    }

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
    // natural whitespace on the left instead of a leading "0"). Always IBM
    // Plex Mono Semibold regardless of card language — Western Arabic
    // numerals are never translated on this card (UI-SPEC: the slab's
    // numeral is fixed to mono-semibold).
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
        label:
          language === "zh-TW"
            ? gregorianCaptionZh(content.gregorian.month, content.gregorian.year)
            : gregorianCaptionEn(content.gregorian.month, content.gregorian.year),
        value: chrome.weekdayNames[content.gregorian.weekday],
        valueFill: theme.ink,
      },
      {
        label: chrome.lunarLabel,
        value:
          language === "zh-TW"
            ? lunarValueZh(content.lunarMonthZh, content.lunarDayZh)
            : lunarValueEn(content.lunarMonth, content.lunarDay),
        valueFill: theme.accent,
      },
      {
        label: chrome.ganzhiLabel,
        // zh-TW mode prints lunar-typescript's own 干支 characters directly
        // (e.g. "甲子"); en mode translates them via ganZhiToEnglish
        // ("Wood Rat") — UI-SPEC "干支 in English".
        value: language === "zh-TW" ? content.dayGanZhi : ganZhiToEnglish(content.dayGanZhi),
        valueFill: theme.ink,
      },
    ];

    metaRows.forEach((row, i) => {
      const rowTop = rowTop0 + i * rowHeight;
      const labelBaseline = rowTop + 12;
      const valueBaseline = labelBaseline + 21;
      markup +=
        language === "zh-TW"
          ? zhLabel(row.label, metaX, labelBaseline, theme.muted)
          : eyebrowLabel(row.label, metaX, labelBaseline, theme.muted);
      markup += contentText(
        contentFont,
        row.value,
        metaX,
        valueBaseline,
        row.valueFill,
        `almanac meta value row ${i} (${language})`,
      );
      if (i < metaRows.length - 1) {
        const dividerY = rowTop + rowHeight;
        markup += `<line x1="${metaX}" y1="${dividerY}" x2="${CARD_WIDTH - PADDING}" y2="${dividerY}" stroke="${theme.rule}" stroke-width="1"/>`;
      }
    });

    markup += `<line x1="${PADDING}" y1="178" x2="${CARD_WIDTH - PADDING}" y2="178" stroke="${theme.rule}" stroke-width="1"/>`;

    // 宜/忌 lines. 宜 uses accent, 忌 uses muted (UI-SPEC Color — no second
    // semantic/destructive hue is introduced for this card, by design).
    markup += contentText(
      contentFont,
      `${chrome.auspiciousPrefix}${yiji.auspicious}`,
      PADDING,
      199,
      theme.accent,
      `almanac 宜 line (${language})`,
    );
    markup += contentText(
      contentFont,
      `${chrome.avoidPrefix}${yiji.avoid}`,
      PADDING,
      215,
      theme.muted,
      `almanac 忌 line (${language})`,
    );

    return markup;
  },
};
