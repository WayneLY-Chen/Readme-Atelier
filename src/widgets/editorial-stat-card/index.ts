import { z } from "zod";
import { assertCoverage, measureAdvanceWidth, textToPathData } from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import { chromeEn, chromeZh, labelsEn, labelsZh, type StatLabels } from "./copy.js";
import { assertColumnBudget, formatStatNumber, SUFFIX_SIZE_RATIO } from "./format.js";

const CARD_WIDTH = 495;
const CARD_HEIGHT = 204;
const PADDING = 24;

const T1_SIZE = 8;
const T2_SIZE = 32;
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const SM = 8;
const MD = 16;

function pathElement(d: string, fill: string): string {
  if (d === "") {
    return "";
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

/**
 * Left-aligned run of glyph paths with manual per-character advance plus a
 * fixed letter-spacing add-on between characters (UI-SPEC T1 eyebrow style:
 * +1.6 user-unit letter-spacing). Structurally identical to
 * `src/widgets/almanac/index.ts`'s own `letterSpacedPath` — deliberately
 * redeclared here rather than imported, per this task's own instruction:
 * every widget carries its own copy of these small chassis-adjacent
 * helpers (RENDER-02: adding a card must not require touching another
 * card's private functions).
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

/** Total rendered width of a letter-spaced run — mirrors letterSpacedPath's
 * own cursor math exactly so the two never drift apart. Used both for the
 * zh-TW-only masthead eyebrow's right-alignment and for centering each
 * en-mode T1 column label under its numeral. */
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

/** T1 eyebrow/label style for English text: IBM Plex Mono Semibold,
 * uppercase, letter-spaced, 8px. Left-aligned at (x, y) — callers needing
 * horizontal centering compute x themselves via eyebrowLabelWidth. */
function eyebrowLabel(text: string, x: number, y: number, fill: string): string {
  const upper = text.toUpperCase();
  assertCoverage("mono-semibold", upper, `editorial-stat-card T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/**
 * T1 label style for zh-TW Chinese column labels (提交/PR/議題/星標/追蹤者)
 * and captions. Renders in Noto Serif TC at the same 8px size, with no
 * uppercase transform and no manual letter-spacing (neither concept exists
 * for Han script) — mirrors Almanac's own `zhLabel`.
 */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `editorial-stat-card T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/**
 * Renders a T1 column label horizontally centered at `centerX` (UI-SPEC
 * "Alignment rule" — column labels sit centered under their numeral, same
 * as the numeral itself). Language-dispatched exactly like Almanac's own
 * eyebrowLabel/zhLabel split: en renders mono-semibold uppercase/letter-
 * spaced, zh-TW renders Noto Serif TC as-is.
 */
function centeredLabel(
  text: string,
  language: "en" | "zh-TW",
  centerX: number,
  y: number,
  fill: string,
): string {
  if (language === "en") {
    const width = eyebrowLabelWidth(text);
    return eyebrowLabel(text, centerX - width / 2, y, fill);
  }
  const width = zhLabelWidth(text);
  return zhLabel(text, centerX - width / 2, y, fill);
}

/**
 * T3 primary-content style: Source Serif 4 (`serif`) in en mode, Noto Serif
 * TC (`noto-tc`) in zh-TW mode. Used for the card's title only.
 */
function contentText(fontName: string, text: string, x: number, y: number, fill: string, context: string): string {
  assertCoverage(fontName, text, context);
  const d = textToPathData(fontName, text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

/**
 * Renders a formatted stat numeral centered at `centerX`, always in
 * `theme.ink` (UI-SPEC Color: "no numeral is ever colored accent to
 * highlight it"). zh-TW's 萬/億 suffix is split into a separate Noto Serif
 * TC glyph run at `T2_SIZE * SUFFIX_SIZE_RATIO`, measured the exact same
 * way `format.ts`'s `assertColumnBudget` measures it — both pieces of code
 * must agree on what "the rendered width" means, or the budget check and
 * the actual centering math could silently disagree about whether a value
 * fits.
 */
function renderNumeral(
  formatted: string,
  language: "en" | "zh-TW",
  centerX: number,
  y: number,
  fill: string,
): string {
  if (language === "zh-TW" && (formatted.endsWith("萬") || formatted.endsWith("億"))) {
    const chars = Array.from(formatted);
    const suffixChar = chars[chars.length - 1] as string;
    const digitsPart = chars.slice(0, -1).join("");
    const digitsWidth = measureAdvanceWidth("mono-semibold", digitsPart, T2_SIZE);
    const suffixWidth = measureAdvanceWidth("noto-tc", suffixChar, T2_SIZE * SUFFIX_SIZE_RATIO);
    const startX = centerX - (digitsWidth + suffixWidth) / 2;
    const d =
      textToPathData("mono-semibold", digitsPart, startX, y, T2_SIZE) +
      textToPathData("noto-tc", suffixChar, startX + digitsWidth, y, T2_SIZE * SUFFIX_SIZE_RATIO);
    return pathElement(d, fill);
  }
  const width = measureAdvanceWidth("mono-semibold", formatted, T2_SIZE);
  const startX = centerX - width / 2;
  return pathElement(textToPathData("mono-semibold", formatted, startX, y, T2_SIZE), fill);
}

// ---------------------------------------------------------------------------
// Layout geometry (UI-SPEC "Card Layout" — 3-over-2 grid).
// ---------------------------------------------------------------------------

const COLUMN_WIDTH = (CARD_WIDTH - 2 * PADDING - 2 * MD) / 3;

const COL1_X = PADDING;
const COL2_X = COL1_X + COLUMN_WIDTH + MD;
const COL3_X = COL2_X + COLUMN_WIDTH + MD;

const ROW2_CONTENT_WIDTH = 2 * COLUMN_WIDTH + MD;
const ROW2_START_X = PADDING + (CARD_WIDTH - 2 * PADDING - ROW2_CONTENT_WIDTH) / 2;
const COL4_X = ROW2_START_X;
const COL5_X = COL4_X + COLUMN_WIDTH + MD;

const COL1_CENTER_X = COL1_X + COLUMN_WIDTH / 2;
const COL2_CENTER_X = COL2_X + COLUMN_WIDTH / 2;
const COL3_CENTER_X = COL3_X + COLUMN_WIDTH / 2;
const COL4_CENTER_X = COL4_X + COLUMN_WIDTH / 2;
const COL5_CENTER_X = COL5_X + COLUMN_WIDTH / 2;

// Column dividers (UI-SPEC "Column dividers"): one 1px accent hairline
// centered in each inter-column gutter — 2 in row 1 (between col1/col2 and
// col2/col3), 1 in row 2 (between col4/col5). This is the only element on
// the whole card that uses theme.accent.
const DIVIDER_1_X = COL1_X + COLUMN_WIDTH + MD / 2;
const DIVIDER_2_X = COL2_X + COLUMN_WIDTH + MD / 2;
const DIVIDER_3_X = COL4_X + COLUMN_WIDTH + MD / 2;

const HEADER_TITLE_BASELINE_Y = 44;
const HEADER_RULE_Y = 58;

const ROW1_TOP = 74;
const ROW1_NUMERAL_BASELINE_Y = 98;
const ROW1_LABEL_BASELINE_Y = ROW1_NUMERAL_BASELINE_Y + SM + T1_SIZE;
const ROW1_BOTTOM = ROW1_LABEL_BASELINE_Y + 4;

const ROW2_TOP = ROW1_BOTTOM + MD;
const ROW2_NUMERAL_BASELINE_Y = ROW2_TOP + 24;
const ROW2_LABEL_BASELINE_Y = ROW2_NUMERAL_BASELINE_Y + SM + T1_SIZE;
const ROW2_BOTTOM = ROW2_LABEL_BASELINE_Y + 4;

interface StatColumn {
  key: keyof StatLabels;
  value: number;
  centerX: number;
  numeralBaselineY: number;
  labelBaselineY: number;
}

/** D-08: all five fields, fixed order — commits/prs/issues/stars/followers.
 * `stars`/`followers` sit in row 2 per the 3-over-2 grid ("what you did"
 * vs. "what people think"). */
function buildColumns(data: ProfileData): StatColumn[] {
  return [
    {
      key: "commits",
      value: data.stats.totalCommits,
      centerX: COL1_CENTER_X,
      numeralBaselineY: ROW1_NUMERAL_BASELINE_Y,
      labelBaselineY: ROW1_LABEL_BASELINE_Y,
    },
    {
      key: "prs",
      value: data.stats.totalPRs,
      centerX: COL2_CENTER_X,
      numeralBaselineY: ROW1_NUMERAL_BASELINE_Y,
      labelBaselineY: ROW1_LABEL_BASELINE_Y,
    },
    {
      key: "issues",
      value: data.stats.totalIssues,
      centerX: COL3_CENTER_X,
      numeralBaselineY: ROW1_NUMERAL_BASELINE_Y,
      labelBaselineY: ROW1_LABEL_BASELINE_Y,
    },
    {
      key: "stars",
      value: data.stats.totalStars,
      centerX: COL4_CENTER_X,
      numeralBaselineY: ROW2_NUMERAL_BASELINE_Y,
      labelBaselineY: ROW2_LABEL_BASELINE_Y,
    },
    {
      key: "followers",
      value: data.followers,
      centerX: COL5_CENTER_X,
      numeralBaselineY: ROW2_NUMERAL_BASELINE_Y,
      labelBaselineY: ROW2_LABEL_BASELINE_Y,
    },
  ];
}

/**
 * D-01: `include_forks` per-card option, default `false` (forks excluded).
 * `.strict()` matches the established `almanacOptionsSchema` convention —
 * an unknown key (a typo) must be rejected, not silently ignored.
 */
const editorialStatCardOptionsSchema = z.object({ include_forks: z.boolean().optional() }).strict();

/**
 * The real shape `editorialStatCardWidget.optionsSchema.parse()` actually
 * returns at runtime. `include_forks` is the ONE field in this shape that
 * is genuinely real — `now`/`seed`/`language`/`timezone` are Almanac-style
 * placeholders that `core/pipeline.ts`'s `renderAllCards()` (Plan 04's
 * pattern) overwrites with the real merged `RenderOptions` before
 * rendering. `include_forks` has no such override: `core/pipeline.ts`'s
 * future `resolveCards`/`fetchSharedData` (02-03) must read this field
 * directly off this function's return value to know what to request from
 * the shared GraphQL fetch. Do not treat `include_forks` as a placeholder
 * the way the other four fields are — it is the structural difference
 * between this widget's options and Almanac's.
 */
export interface EditorialStatCardOptions extends RenderOptions {
  include_forks: boolean;
}

/**
 * Editorial Stat Card's WidgetDefinition (CARD-02). `requires: ["stats"]`
 * is the second real consumer of `DataCapability` (Almanac declares `[]`).
 * Opts is typed as the full `RenderOptions` shape, matching Almanac and
 * required by `core/svg.ts`'s `renderPair(widget: WidgetDefinition<RenderOptions>, ...)`
 * signature — see `optionsSchema.parse`'s own doc comment for how
 * `include_forks` still flows through this despite not appearing in the
 * `RenderOptions` interface itself.
 */
export const editorialStatCardWidget: WidgetDefinition<RenderOptions> = {
  name: "editorial-stat-card",
  requires: ["stats"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      const { include_forks } = editorialStatCardOptionsSchema.parse(value ?? {});
      const resolved: EditorialStatCardOptions = {
        now: new Date(),
        seed: 0,
        language: "en",
        timezone: "UTC",
        include_forks: include_forks ?? false,
      };
      return resolved;
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "統計卡",
        desc: "以雜誌排版風格顯示你 GitHub 個人檔案的提交、PR、議題、星標與追蹤者數量。",
      };
    }
    return {
      title: "Editorial Stat Card",
      desc:
        "Shows commits, pull requests, issues, stars, and followers from your GitHub profile, " +
        "in magazine-style typography.",
    };
  },

  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";
    const title = language === "zh-TW" ? chromeZh.title : chromeEn.title;
    const labels = language === "zh-TW" ? labelsZh : labelsEn;

    let markup = "";

    // Header: title (T3), left-aligned — identical role to Almanac's.
    markup += contentText(
      contentFont,
      title,
      PADDING,
      HEADER_TITLE_BASELINE_Y,
      theme.ink,
      `editorial-stat-card title (${language})`,
    );

    // Masthead eyebrow (zh-TW mode only) — decorative Latin brand
    // furniture, never translated, absent in en mode since en mode's own
    // title already reads "THE STATS" (mirrors Almanac's identical rule).
    if (language === "zh-TW") {
      const eyebrowText = chromeZh.mastheadEyebrow;
      const eyebrowWidth = eyebrowLabelWidth(eyebrowText);
      const eyebrowX = CARD_WIDTH - PADDING - eyebrowWidth;
      markup += eyebrowLabel(eyebrowText, eyebrowX, HEADER_TITLE_BASELINE_Y, theme.muted);
    }

    markup += `<line x1="${PADDING}" y1="${HEADER_RULE_Y}" x2="${CARD_WIDTH - PADDING}" y2="${HEADER_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // D-08: five fields, D-09: zero renders exactly like any other value —
    // one uniform code path, no branch on magnitude.
    for (const column of buildColumns(data)) {
      const formatted = formatStatNumber(column.value, language);
      // T-02-05 backstop: check BEFORE building path data, so an
      // out-of-budget value fails the build loudly instead of silently
      // overflowing the rendered column.
      assertColumnBudget(formatted, language, column.key);
      markup += renderNumeral(formatted, language, column.centerX, column.numeralBaselineY, theme.ink);
      markup += centeredLabel(labels[column.key], language, column.centerX, column.labelBaselineY, theme.muted);
    }

    // Column dividers — the card's only use of theme.accent (UI-SPEC
    // Color: "no numeral is ever colored accent to highlight it").
    markup += `<line x1="${DIVIDER_1_X}" y1="${ROW1_TOP}" x2="${DIVIDER_1_X}" y2="${ROW1_BOTTOM}" stroke="${theme.accent}" stroke-width="1"/>`;
    markup += `<line x1="${DIVIDER_2_X}" y1="${ROW1_TOP}" x2="${DIVIDER_2_X}" y2="${ROW1_BOTTOM}" stroke="${theme.accent}" stroke-width="1"/>`;
    markup += `<line x1="${DIVIDER_3_X}" y1="${ROW2_TOP}" x2="${DIVIDER_3_X}" y2="${ROW2_BOTTOM}" stroke="${theme.accent}" stroke-width="1"/>`;

    return markup;
  },
};
