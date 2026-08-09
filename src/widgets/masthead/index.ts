import { z } from "zod";
import {
  apiSourcedTextPathData,
  assertCoverage,
  measureAdvanceWidth,
  textToPathData,
  truncateToWidth,
} from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { CitableFact, WidgetDefinition } from "../../core/registry.js";
import { chromeEn, chromeZh, type MastheadChrome } from "./copy.js";

const CARD_WIDTH = 495;
const CARD_HEIGHT = 116;
const PADDING = 24;

const T1_SIZE = 8;
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471
const HEADER_TITLE_BASELINE_Y = 44;
const HEADER_RULE_Y = 58;
const SUBTITLE_BASELINE_Y = 74;
const CONTENTS_BASELINE_Y = 90;

/**
 * UI-SPEC "API-Sourced Text: Truncation Policy": the subtitle row's total
 * width budget, shared between the login and the right-aligned timestamp
 * that sits on the same row.
 */
const SUBTITLE_BUDGET_PX = 140;

/**
 * Fixed UTC epoch this card's issue number counts up from (RESEARCH.md Open
 * Question Q1's locked recommendation: deterministic-from-`now`, never a
 * persisted counter, so RENDER-09's "same now => byte-identical output"
 * invariant holds for the masthead exactly like every other card).
 */
const ISSUE_NUMBER_EPOCH_MS = Date.UTC(2026, 0, 1);
const ISSUE_NUMBER_TICK_MS = 6 * 60 * 60 * 1000; // 6-hour cadence, matching DIST-03's default cron

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
 * redeclared here rather than imported (RENDER-02: every widget carries its
 * own copy of these small chassis-adjacent helpers).
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
 * own cursor math exactly so the two never drift apart. */
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
 * T1 mono-semibold run, letter-spaced, WITHOUT the `eyebrowLabel` convention
 * of forcing `.toUpperCase()` — deliberately named/shaped differently from
 * Almanac's/Stat Card's `eyebrowLabel` because the masthead's T1 en-mode
 * strings genuinely mix case that must survive verbatim: a GitHub login
 * (`data.login`, never uppercased — GitHub usernames are case-preserving)
 * and other enabled cards' own `describe().title` strings (e.g. "Almanac
 * card", "The Graveyard" — mixed case by design, would be corrupted by a
 * forced uppercase transform the way `eyebrowLabel` applies it).
 */
function monoRun(text: string, x: number, y: number, fill: string): string {
  assertCoverage("mono-semibold", text, `masthead T1 mono run: "${text}"`);
  const d = letterSpacedPath("mono-semibold", text, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function monoRunWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text, T1_SIZE, T1_LETTER_SPACING);
}

/**
 * T1 label style for zh-TW Chinese caption text — mirrors Almanac's/Stat
 * Card's own `zhLabel`: Noto Serif TC, same 8px size, no uppercase transform
 * and no manual letter-spacing (neither concept exists for Han script, and
 * the ASCII segments this function also has to carry — e.g. a login, or a
 * "-" separator — read naturally at Noto Serif TC's own metrics too, since
 * the font's subset includes the full ASCII-printable range).
 */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `masthead T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/**
 * T3 primary-content style: Source Serif 4 (`serif`) in en mode, Noto Serif
 * TC (`noto-tc`) in zh-TW mode. Used for the title and the issue number.
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
  const d = textToPathData(fontName, text, x, y, T3_SIZE);
  return pathElement(d, fill);
}

/**
 * RESEARCH.md Open Question Q1's locked recommendation: a deterministic tick
 * count since a fixed UTC epoch, sized to roughly track the documented
 * 6-hour cron cadence — never a persisted counter (the engine has no
 * persistent store, and RENDER-09 requires identical `now` to always produce
 * byte-identical output). Pure function of `now` alone.
 */
function computeIssueNumber(now: Date): number {
  return Math.floor((now.getTime() - ISSUE_NUMBER_EPOCH_MS) / ISSUE_NUMBER_TICK_MS) + 1;
}

function formatTimestamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCDate())} ` +
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`
  );
}

/**
 * The pipeline-injected extension fields (`core/pipeline.ts`'s
 * `renderAllCards` Pass 4) that only the masthead's own `opts` ever carries —
 * mirrors `EditorialStatCardOptions extends RenderOptions`'s existing
 * precedent for a widget-specific, pipeline-populated field
 * (`include_forks`) that isn't named on the base `RenderOptions` interface.
 */
export interface MastheadOptions extends RenderOptions {
  contents?: { id: string; title: string; pageNumber: number }[];
  citedFacts?: { totalCommits?: CitableFact };
}

/** No `widgets.yml`-configurable options exist for this card — an empty
 * object (or `undefined`) is the only valid input. */
const mastheadOptionsSchema = z.object({}).strict();

function chromeFor(language: "en" | "zh-TW"): MastheadChrome {
  return language === "zh-TW" ? chromeZh : chromeEn;
}

/**
 * Renders the right-aligned citation half of the contents row
 * (`{value} {label}`, value in `theme.accent`, label in `theme.muted` — UI-SPEC
 * "Cross-Card Citation Display Contract"). Returns "" (no markup at all,
 * not a placeholder) when `fact` is undefined — MAST-03's citation-specific
 * degradation case.
 */
function renderCitation(
  fact: CitableFact | undefined,
  language: "en" | "zh-TW",
  theme: Theme,
): string {
  if (fact === undefined) {
    return "";
  }
  const runWidth = (text: string): number => (language === "zh-TW" ? zhLabelWidth(text) : monoRunWidth(text));
  const renderRun = (text: string, x: number, fill: string): string =>
    language === "zh-TW" ? zhLabel(text, x, CONTENTS_BASELINE_Y, fill) : monoRun(text, x, CONTENTS_BASELINE_Y, fill);

  const valueWidth = runWidth(fact.value);
  const spaceWidth = runWidth(" ");
  const labelWidth = runWidth(fact.label);
  const totalWidth = valueWidth + spaceWidth + labelWidth;
  const valueX = RIGHT_EDGE_X - totalWidth;
  const labelX = valueX + valueWidth + spaceWidth;

  return renderRun(fact.value, valueX, theme.accent) + renderRun(fact.label, labelX, theme.muted);
}

/**
 * The masthead's WidgetDefinition (MAST-01/02). `requires: ["identity"]` is
 * the first widget to declare a `DataCapability` other than `"stats"` —
 * `core/fetch.ts`'s `buildQuery` needs no new branch for it (see
 * `model.ts`'s `DataCapability` doc comment), but it moves a masthead-only
 * render out of the zero-capability fast path since this card needs a real
 * `data.login`.
 */
export const mastheadWidget: WidgetDefinition<RenderOptions> = {
  name: "masthead",
  requires: ["identity"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      mastheadOptionsSchema.parse(value ?? {});
      return {
        now: new Date(),
        seed: 0,
        language: "en",
        timezone: "UTC",
      };
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "刊頭卡片",
        desc: "列印期數、產出時間，以及其他已啟用卡片的目次；並引用雜誌統計卡的一項數據。",
      };
    }
    return {
      title: "Masthead card",
      desc:
        "Prints an issue number, render timestamp, and a contents list for every other enabled " +
        "card, plus a figure cited from the Editorial Stat Card when it is enabled.",
    };
  },

  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const mastheadOpts = opts as MastheadOptions;
    const language = mastheadOpts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";
    const chrome = chromeFor(language);

    let markup = "";

    // (1) Header row: title left-aligned, issue number right-aligned.
    markup += contentText(
      contentFont,
      chrome.title,
      PADDING,
      HEADER_TITLE_BASELINE_Y,
      theme.ink,
      `masthead title (${language})`,
    );

    const issueNumberText = chrome.issueNumberTemplate(computeIssueNumber(mastheadOpts.now));
    const issueNumberWidth = measureAdvanceWidth(contentFont, issueNumberText, T3_SIZE);
    markup += contentText(
      contentFont,
      issueNumberText,
      RIGHT_EDGE_X - issueNumberWidth,
      HEADER_TITLE_BASELINE_Y,
      theme.accent,
      `masthead issue number (${language})`,
    );

    // (2) Hairline rule.
    markup += `<line x1="${PADDING}" y1="${HEADER_RULE_Y}" x2="${CARD_WIDTH - PADDING}" y2="${HEADER_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (3) Subtitle + timestamp row. Login is ALWAYS rendered in
    // mono-semibold, never uppercased, regardless of card language — GitHub
    // usernames are ASCII-only and case-preserving. Length-truncated per
    // UI-SPEC's "API-Sourced Text: Truncation Policy" (Task 2): the literal
    // suffix's own measured width is reserved first, and whatever remains
    // of the shared SUBTITLE_BUDGET_PX budget is what the login is allowed
    // to occupy — routed through apiSourcedTextPathData (not
    // assertCoverage/textToPathData) since a GitHub login is API-sourced
    // text that must degrade (truncate + placeholder glyphs), never fail
    // the build.
    const login = data.login;
    const literalSuffixWidth =
      language === "zh-TW"
        ? zhLabelWidth(chrome.subtitleSuffix)
        : monoRunWidth(chrome.subtitleSuffix);
    const loginBudget = Math.max(0, SUBTITLE_BUDGET_PX - literalSuffixWidth);
    const truncatedLogin = truncateToWidth("mono-semibold", login, T1_SIZE, loginBudget);
    const loginPathData = apiSourcedTextPathData(
      "mono-semibold",
      truncatedLogin,
      PADDING,
      SUBTITLE_BASELINE_Y,
      T1_SIZE,
    );
    const loginWidth = measureAdvanceWidth("mono-semibold", truncatedLogin, T1_SIZE);
    markup += pathElement(loginPathData, theme.muted);

    const suffixX = PADDING + loginWidth;
    markup +=
      language === "zh-TW"
        ? zhLabel(chrome.subtitleSuffix, suffixX, SUBTITLE_BASELINE_Y, theme.muted)
        : monoRun(chrome.subtitleSuffix, suffixX, SUBTITLE_BASELINE_Y, theme.muted);

    const timestampText = formatTimestamp(mastheadOpts.now);
    const timestampWidth = monoRunWidth(timestampText);
    markup += monoRun(timestampText, RIGHT_EDGE_X - timestampWidth, SUBTITLE_BASELINE_Y, theme.muted);

    // (4) Contents + citation row. `contents` is genuinely zero-to-many
    // (UI-SPEC "zero-one-many", masthead-contents-row) — the joined-string
    // approach degrades to "" naturally, and the label alone still renders.
    const contents = mastheadOpts.contents ?? [];
    const joined = contents.map((c) => c.title).join(chrome.contentsSeparator);
    const contentsText =
      joined === "" ? chrome.contentsLabel : language === "zh-TW" ? `${chrome.contentsLabel}：${joined}` : `${chrome.contentsLabel} ${joined}`;

    markup +=
      language === "zh-TW"
        ? zhLabel(contentsText, PADDING, CONTENTS_BASELINE_Y, theme.muted)
        : monoRun(contentsText, PADDING, CONTENTS_BASELINE_Y, theme.muted);

    // Citation half — independently absent from the contents half (UI-SPEC
    // masthead-contents-row "partial"). renderCitation() returns "" (no
    // markup, no reserved space) when the fact is undefined.
    markup += renderCitation(mastheadOpts.citedFacts?.totalCommits, language, theme);

    return markup;
  },
};
