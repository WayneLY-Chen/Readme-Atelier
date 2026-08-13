import { z } from "zod";
import {
  apiSourcedTextPathData,
  assertCoverage,
  measureAdvanceWidth,
  textToPathData,
  truncateToWidth,
} from "../../core/font.js";
import type { ProfileData, RenderOptions, Theme } from "../../core/model.js";
import type { WidgetDefinition } from "../../core/registry.js";
import {
  bornDiedEn,
  bornDiedZh,
  buriedCountEn,
  buriedCountZh,
  chromeEn,
  chromeZh,
  dayCountLabelEn,
  dayCountLabelZh,
  emptyCaptionEn,
  emptyCaptionZh,
  shortestLivedLabelEn,
  shortestLivedLabelZh,
} from "./copy.js";

const CARD_WIDTH = 495;
const CARD_HEIGHT = 204;
const PADDING = 24;

const T1_SIZE = 8;
const T3_SIZE = 17;
const T1_LETTER_SPACING = 1.6;

const RIGHT_EDGE_X = CARD_WIDTH - PADDING; // 471
const HEADER_TITLE_BASELINE_Y = 44;
const HEADER_RULE_Y = 58;

const GROUND_Y = 158;
const DAY_LABEL_Y = 152;
const CALLOUT_LINE1_Y = 180;
const CALLOUT_LINE2_Y = 192;

/** UI-SPEC "Tombstone geometry" — a fixed rendering constant chosen from
 * D-02's locked 6-8 band; reversible, not a published contract. */
const TOMBSTONE_CAP = 6;

/** CARD-03/D-01: a repository is "buried" once its last push is this many
 * days (or more) in the past — `>=`, so exactly 180 days counts as buried. */
const BURY_THRESHOLD_DAYS = 180;
const MS_PER_DAY = 86_400_000;

const TOMBSTONE_HALF_WIDTH = 13;
const TOMBSTONE_HEIGHT_FLOOR = 20;
const TOMBSTONE_HEIGHT_RANGE = 60;
const TOMBSTONE_HEIGHT_CEIL = 80;

/** UI-SPEC "API-Sourced Text: Truncation Policy" — the shortest-lived
 * callout's repo-name slot width budget. */
const REPO_NAME_BUDGET_PX = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Chassis helpers — own copy, not imported (RENDER-02: adding/modifying a
// card must not require touching another card's private functions).
// Structurally identical to editorial-stat-card/index.ts's own set.
// ---------------------------------------------------------------------------

function pathElement(d: string, fill: string): string {
  if (d === "") {
    return "";
  }
  return `<path d="${d}" fill="${fill}"/>`;
}

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
 * uppercase, letter-spaced, 8px. Left-aligned at (x, y). */
function eyebrowLabel(text: string, x: number, y: number, fill: string): string {
  const upper = text.toUpperCase();
  assertCoverage("mono-semibold", upper, `the-graveyard T1 eyebrow/label: "${text}"`);
  const d = letterSpacedPath("mono-semibold", upper, x, y, T1_SIZE, T1_LETTER_SPACING);
  return pathElement(d, fill);
}

function eyebrowLabelWidth(text: string): number {
  return letterSpacedWidth("mono-semibold", text.toUpperCase(), T1_SIZE, T1_LETTER_SPACING);
}

/** T1 label style for zh-TW text: Noto Serif TC, 8px, no uppercase
 * transform, no manual letter-spacing. */
function zhLabel(text: string, x: number, y: number, fill: string): string {
  assertCoverage("noto-tc", text, `the-graveyard T1 label (zh-TW): "${text}"`);
  return pathElement(textToPathData("noto-tc", text, x, y, T1_SIZE), fill);
}

function zhLabelWidth(text: string): number {
  return measureAdvanceWidth("noto-tc", text, T1_SIZE);
}

/** Renders a T1 label horizontally centered at `centerX` — mirrors
 * editorial-stat-card's own `centeredLabel`, used here for the per-tombstone
 * day-count labels. */
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

/** T3 primary-content style: Source Serif 4 (en) / Noto Serif TC (zh-TW). */
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

// ---------------------------------------------------------------------------
// selectTombstones — the CARD-03/D-01/D-02/D-03 pure selection algorithm.
// ---------------------------------------------------------------------------

/** The slice of a repository record `selectTombstones` actually needs.
 * `data.repositories`'s real shape (core/model.ts) carries more fields
 * (nameWithOwner, url) that this function simply ignores. */
export interface GraveyardRepoInput {
  name: string;
  createdAt: string;
  pushedAt: string | null;
  isFork: boolean;
}

export interface Tombstone {
  name: string;
  createdAt: string;
  /** `pushedAt ?? createdAt` — RESEARCH.md Pitfall 2. */
  lastPush: string;
  lifespanDays: number;
}

/**
 * Shared filter step behind both `selectTombstones` and `countBuried`:
 * fork-inclusion (D-03), then repositories buried >= BURY_THRESHOLD_DAYS ago
 * (D-01, using `pushedAt ?? createdAt` as the last-push proxy per
 * RESEARCH.md Pitfall 2). Deliberately factored out so the header's "N
 * BURIED" count and the tombstone-cap selection can never drift apart on
 * what counts as "buried" — see CR-02.
 */
function filterBuried(
  repositories: GraveyardRepoInput[],
  now: Date,
  includeForks: boolean,
): Array<GraveyardRepoInput & { lastPush: string }> {
  const withLastPush = repositories
    .filter((repo) => includeForks || !repo.isFork)
    .map((repo) => ({ ...repo, lastPush: repo.pushedAt ?? repo.createdAt }));

  return withLastPush.filter((repo) => {
    const daysSinceLastPush = (now.getTime() - new Date(repo.lastPush).getTime()) / MS_PER_DAY;
    return daysSinceLastPush >= BURY_THRESHOLD_DAYS;
  });
}

/**
 * CARD-03's tombstone selection: filter to every genuinely-buried
 * repository (`filterBuried`), sort by most-recently-buried first (UI-SPEC
 * "Selection" — keeps the card fresh across renders) with a stable
 * name-ascending tie-break for byte-identical reproducibility, then cap at
 * TOMBSTONE_CAP (D-02). This is the *display* list — for the true buried
 * count (uncapped), use `countBuried`.
 */
export function selectTombstones(
  repositories: GraveyardRepoInput[],
  now: Date,
  includeForks: boolean,
): Tombstone[] {
  const buried = filterBuried(repositories, now, includeForks);

  buried.sort((a, b) => {
    const diff = new Date(b.lastPush).getTime() - new Date(a.lastPush).getTime();
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  return buried.slice(0, TOMBSTONE_CAP).map((repo) => ({
    name: repo.name,
    createdAt: repo.createdAt,
    lastPush: repo.lastPush,
    lifespanDays: Math.floor(
      (new Date(repo.lastPush).getTime() - new Date(repo.createdAt).getTime()) / MS_PER_DAY,
    ),
  }));
}

/**
 * The true count of buried repositories, independent of TOMBSTONE_CAP —
 * this is what the header's "N BURIED" stat must use (CR-02).
 * `selectTombstones`'s returned array is capped for display purposes and
 * must never be used to derive this count.
 */
export function countBuried(
  repositories: GraveyardRepoInput[],
  now: Date,
  includeForks: boolean,
): number {
  return filterBuried(repositories, now, includeForks).length;
}

// ---------------------------------------------------------------------------
// Widget definition
// ---------------------------------------------------------------------------

/**
 * D-03: `include_forks` per-card option, default `true` (forks included) —
 * the deliberate mirror-opposite of Editorial Stat Card's `include_forks`
 * default `false`. `.strict()` matches the established per-card options
 * convention (an unknown key must be rejected, not silently ignored).
 */
const graveyardOptionsSchema = z.object({ include_forks: z.boolean().optional() }).strict();

export interface GraveyardOptions extends RenderOptions {
  include_forks: boolean;
}

export const theGraveyardWidget: WidgetDefinition<RenderOptions> = {
  name: "the-graveyard",
  requires: ["repoList"],
  size: { width: CARD_WIDTH, height: CARD_HEIGHT },

  optionsSchema: {
    parse(value: unknown): RenderOptions {
      const { include_forks } = graveyardOptionsSchema.parse(value ?? {});
      const resolved: GraveyardOptions = {
        now: new Date(),
        seed: 0,
        language: "en",
        timezone: "UTC",
        include_forks: include_forks ?? true,
      };
      return resolved;
    },
  },

  describe(_data: ProfileData, opts: RenderOptions): { title: string; desc: string } {
    if (opts.language === "zh-TW") {
      return {
        title: "廢墟卡片",
        desc: "顯示超過 180 天未推送的已放棄專案，以墓碑形式標示每個專案存活的天數。",
      };
    }
    return {
      title: "The Graveyard card",
      desc:
        "Shows repositories that have gone 180 days without a push, as tombstones marking how " +
        "many days each one lived.",
    };
  },

  renderBody(data: ProfileData, theme: Theme, opts: RenderOptions): string {
    const { include_forks: includeForks } = opts as GraveyardOptions;
    const language = opts.language;
    const contentFont = language === "zh-TW" ? "noto-tc" : "serif";
    const title = language === "zh-TW" ? chromeZh.title : chromeEn.title;

    const tombstones = selectTombstones(data.repositories ?? [], opts.now, includeForks);
    const N = tombstones.length;
    const totalBuried = countBuried(data.repositories ?? [], opts.now, includeForks);

    let markup = "";

    // (1) Header row: title left-aligned, buried count right-aligned.
    // Unlike Almanac/Stat Card's zh-only decorative eyebrow, this header-right
    // slot carries functional, card-specific data and is shown in BOTH
    // languages (UI-SPEC's explicit, deliberate departure).
    markup += contentText(
      contentFont,
      title,
      PADDING,
      HEADER_TITLE_BASELINE_Y,
      theme.ink,
      `the-graveyard title (${language})`,
    );

    const buriedCountText = language === "zh-TW" ? buriedCountZh(totalBuried) : buriedCountEn(totalBuried);
    if (language === "zh-TW") {
      const width = zhLabelWidth(buriedCountText);
      markup += zhLabel(buriedCountText, RIGHT_EDGE_X - width, HEADER_TITLE_BASELINE_Y, theme.muted);
    } else {
      const width = eyebrowLabelWidth(buriedCountText);
      markup += eyebrowLabel(
        buriedCountText,
        RIGHT_EDGE_X - width,
        HEADER_TITLE_BASELINE_Y,
        theme.muted,
      );
    }

    // (2) Hairline rule.
    markup += `<line x1="${PADDING}" y1="${HEADER_RULE_Y}" x2="${CARD_WIDTH - PADDING}" y2="${HEADER_RULE_Y}" stroke="${theme.rule}" stroke-width="1"/>`;

    // (3) Tombstone zone — same code path for every N from 0 to
    // TOMBSTONE_CAP (D-04's "one code path, not two" extended to every
    // cardinality). N === 0 means the loop below simply runs zero times.
    const contentWidth = CARD_WIDTH - 2 * PADDING;
    const maxLifespan = Math.max(0, ...tombstones.map((t) => t.lifespanDays));
    tombstones.forEach((tombstone, i) => {
      const centerX = PADDING + (i + 0.5) * (contentWidth / N);
      const height =
        maxLifespan === 0
          ? TOMBSTONE_HEIGHT_FLOOR
          : clamp(
              TOMBSTONE_HEIGHT_FLOOR + (tombstone.lifespanDays / maxLifespan) * TOMBSTONE_HEIGHT_RANGE,
              TOMBSTONE_HEIGHT_FLOOR,
              TOMBSTONE_HEIGHT_CEIL,
            );

      const left = centerX - TOMBSTONE_HALF_WIDTH;
      const right = centerX + TOMBSTONE_HALF_WIDTH;
      const bottom = GROUND_Y;
      const top = GROUND_Y - height;
      const capY = top + TOMBSTONE_HALF_WIDTH;
      const d =
        `M${left},${bottom} L${left},${capY} ` +
        `A${TOMBSTONE_HALF_WIDTH},${TOMBSTONE_HALF_WIDTH} 0 0 1 ${right},${capY} ` +
        `L${right},${bottom} Z`;
      markup += `<path d="${d}" fill="${theme.rule}" stroke="${theme.muted}" stroke-width="0.8"/>`;

      const dayLabel =
        language === "zh-TW" ? dayCountLabelZh(tombstone.lifespanDays) : dayCountLabelEn(tombstone.lifespanDays);
      markup += centeredLabel(dayLabel, language, centerX, DAY_LABEL_Y, theme.muted);
    });

    // (4) Ground line — heavier than the project's usual 1px hairline
    // (UI-SPEC: this is a structural horizon, not a section divider).
    markup += `<line x1="${PADDING}" y1="${GROUND_Y}" x2="${CARD_WIDTH - PADDING}" y2="${GROUND_Y}" stroke="${theme.ink}" stroke-width="1.5"/>`;

    if (N > 0) {
      // (5) Shortest-lived callout — populated state only.
      const shortest = tombstones.reduce((min, t) => (t.lifespanDays < min.lifespanDays ? t : min));
      const label = language === "zh-TW" ? shortestLivedLabelZh : shortestLivedLabelEn;
      const labelWidth = language === "zh-TW" ? zhLabelWidth(label) : eyebrowLabelWidth(label);
      markup +=
        language === "zh-TW"
          ? zhLabel(label, PADDING, CALLOUT_LINE1_Y, theme.muted)
          : eyebrowLabel(label, PADDING, CALLOUT_LINE1_Y, theme.muted);

      // The repo name is the phase's first shortest-lived-callout consumer
      // of the API-sourced text safety path (Plan 03-01 Task 2): measure +
      // truncate-with-ellipsis first, THEN convert to path data with
      // per-character glyph-placeholder degrade — never assertCoverage +
      // textToPathData directly, since a repo name is end-user-authored and
      // must degrade gracefully rather than fail the build (UX-06).
      const truncatedName = truncateToWidth(
        "mono-semibold",
        shortest.name,
        T1_SIZE,
        REPO_NAME_BUDGET_PX,
      );
      // en's chrome copy ("SHORTEST-LIVED:") has no trailing space, but the
      // UI-SPEC's line-1 format ("SHORTEST-LIVED: {name}") puts one between
      // the colon and the name; zh-TW's colon ("最短命：") touches the name
      // directly, no gap. Since the label (letter-spaced eyebrowLabel/
      // zhLabel) and the name (apiSourcedTextPathData) are two independent
      // rendering calls, the gap is reserved here rather than embedded in
      // either string.
      const labelGapPx = language === "zh-TW" ? 0 : measureAdvanceWidth("mono-semibold", " ", T1_SIZE);
      const nameX = PADDING + labelWidth + labelGapPx;
      const namePathData = apiSourcedTextPathData(
        "mono-semibold",
        truncatedName,
        nameX,
        CALLOUT_LINE1_Y,
        T1_SIZE,
      );
      markup += pathElement(namePathData, theme.accent);

      // Line 2: born/died dates — both engine-formatted (YYYY-MM-DD slices
      // of ISO strings), so this stays on the existing
      // assertCoverage+textToPathData engine-authored-text path.
      const born = shortest.createdAt.slice(0, 10);
      const died = shortest.lastPush.slice(0, 10);
      const bornDiedText = language === "zh-TW" ? bornDiedZh(born, died) : bornDiedEn(born, died);
      markup +=
        language === "zh-TW"
          ? zhLabel(bornDiedText, PADDING, CALLOUT_LINE2_Y, theme.muted)
          : eyebrowLabel(bornDiedText, PADDING, CALLOUT_LINE2_Y, theme.muted);
    } else {
      // Empty state (UX-06, D-04, D-05): same frame, same chrome, same
      // ground line, zero tombstones, one dry-toned caption — this is the
      // card's entire payload in this state, so it renders at content tier
      // (T3, ink), not caption tier.
      const emptyCaption = language === "zh-TW" ? emptyCaptionZh : emptyCaptionEn;
      markup += contentText(
        contentFont,
        emptyCaption,
        PADDING,
        118,
        theme.ink,
        `the-graveyard empty caption (${language})`,
      );
    }

    // (6) Page-number footer (MAST-03) — present in BOTH states, always at
    // CALLOUT_LINE2_Y: shares the callout's own dates baseline when
    // populated, occupies the row alone when empty. Same
    // absent-means-emit-nothing contract as Almanac/Editorial Stat Card's
    // own retrofits (Plan 03-03).
    if (opts.pageNumber !== undefined && opts.totalPages !== undefined) {
      const pageText =
        language === "zh-TW"
          ? `頁 ${opts.pageNumber} / ${opts.totalPages}`
          : `PAGE ${opts.pageNumber}/${opts.totalPages}`;
      if (language === "zh-TW") {
        const width = zhLabelWidth(pageText);
        markup += zhLabel(pageText, RIGHT_EDGE_X - width, CALLOUT_LINE2_Y, theme.muted);
      } else {
        const width = eyebrowLabelWidth(pageText);
        markup += eyebrowLabel(pageText, RIGHT_EDGE_X - width, CALLOUT_LINE2_Y, theme.muted);
      }
    }

    return markup;
  },
};
