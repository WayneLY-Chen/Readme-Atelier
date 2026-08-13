import type { CardEntry, ResolvedConfig } from "./config.js";
import { type FetchImpl, fetchProfileData } from "./fetch.js";
import type { ProfileData, RenderOptions, Theme } from "./model.js";
import { collectCapabilities, get } from "./registry.js";
import type { CitableFact, WidgetDefinition } from "./registry.js";
import {
  HARD_SIZE_CANARY_BYTES,
  renderPair,
  SOFT_SIZE_BUDGET_BYTES,
  sizeGuard,
} from "./svg.js";
import { draculaTheme, editorialDark, editorialLight, nordTheme, tokyonightTheme } from "./theme.js";

/** One card's finished light/dark pair, keyed by its D-10 `id`. */
export interface RenderedCard {
  id: string;
  light: string;
  dark: string;
  /**
   * The widget's own `describe()` output for this render — carried through
   * so `src/action-entry.ts` can build D-14's `<picture>` embed snippet
   * (`core/embed-snippet.ts`'s `alt` text, per D-16) WITHOUT re-doing the
   * widget lookup/option-merging `renderAllCards` already did. Added in Plan
   * 05 (Rule 2 — missing critical functionality): the publish path needs
   * this and `RenderedCard` previously had no way to expose it.
   */
  title: string;
  desc: string;
}

/**
 * A `type:` that no registered widget answers to.
 *
 * In practice `core/config.ts` rejects an unknown `type:` earlier, with a
 * did-you-mean suggestion (D-12), so this should be unreachable through the
 * CLI. It stays as a real guard because `renderAllCards` is exported and
 * `action-entry.ts` (Plan 05) plus any future caller could reach the pipeline
 * without going through config validation first.
 */
export class UnknownWidgetError extends Error {
  constructor(type: string) {
    super(`UnknownWidgetError: no widget is registered under type "${type}".`);
    this.name = "UnknownWidgetError";
  }
}

/**
 * A card's own `options:` block failed that widget's schema.
 *
 * `core/config.ts` validates the SHAPE of `options:` (it must be a mapping)
 * but deliberately not its CONTENTS — only the widget itself knows which
 * option keys it accepts. That check happens here, which is why this error
 * has to name the offending card: a `widgets.yml` with four cards produces
 * four separate option blocks, and "invalid options" without an id is not
 * actionable for someone editing the file by hand.
 */
export class InvalidCardOptionsError extends Error {
  readonly lines: string[];

  constructor(id: string, type: string, problems: string[]) {
    const lines = [
      `✗ 卡片 "${id}"（type: ${type}）的 options: 設定有誤（${problems.length} 個問題）`,
      "",
      ...problems.map((problem) => `  ${problem}`),
    ];
    super(lines.join("\n"));
    this.name = "InvalidCardOptionsError";
    this.lines = lines;
  }
}

/**
 * Two `stats`-requiring cards declared conflicting `include_forks` values.
 *
 * `fetchSharedData` fetches exactly once per run (DATA-01) and picks a single
 * `includeForks` boolean for that one fetch — there is no way to honor two
 * different values in one request. Rather than silently applying one card's
 * setting to the other (CR-01), this is a hard config error naming both cards
 * so the adopter fixes their `widgets.yml` instead of shipping wrong numbers.
 */
export class ConflictingStatsOptionsError extends Error {
  constructor(ids: string[]) {
    super(
      `✗ 卡片 ${ids.map((id) => `"${id}"`).join("、")} 都需要 stats 資料，但 include_forks 設定不一致——` +
        `同一次執行只會抓一次資料，無法讓每張卡片各自套用不同的 include_forks。請讓這些卡片使用相同的 include_forks 設定。`,
    );
    this.name = "ConflictingStatsOptionsError";
  }
}

/**
 * Defensive runtime guard for MAST-01/02/03's page-numbering invariant
 * (UI-SPEC "page-number-footer" partial-state row): `pageNumber` and
 * `totalPages` must always be set together or both left `undefined` — never
 * one without the other. Under normal execution this branch is unreachable
 * (both fields are always assigned from the same object-spread in
 * `renderAllCards`'s Pass 4), but UI-SPEC explicitly requires this to be a
 * runtime assertion, not just documentation, since a partial state here
 * would otherwise silently render e.g. `"PAGE 3/undefined"`.
 */
export class PageNumberInvariantError extends Error {
  constructor(cardId: string, pageNumber: number | undefined, totalPages: number | undefined) {
    super(
      `PageNumberInvariantError: card "${cardId}" has pageNumber=${String(pageNumber)} and ` +
        `totalPages=${String(totalPages)} — these two fields must always be set together, or ` +
        "both left undefined.",
    );
    this.name = "PageNumberInvariantError";
  }
}

/**
 * Scans the FULL enabled-array (`cards`, in `widgets.yml` order — D-08/D-09),
 * not just non-masthead entries, returning the first card's exposed fact
 * under `key`, or `undefined` if no enabled card exposes it. Scanning the
 * complete array (rather than filtering out the masthead first) keeps this
 * function's contract simple and uniform — in practice the masthead itself
 * is not expected to ever implement `citableFacts`, but nothing here assumes
 * that.
 */
function firstCitedFact(
  cards: ResolvedCard[],
  factRegistry: Record<string, Record<string, CitableFact>>,
  key: string,
): CitableFact | undefined {
  for (const card of cards) {
    const fact = factRegistry[card.id]?.[key];
    if (fact !== undefined) {
      return fact;
    }
  }
  return undefined;
}

/**
 * `theme:` value -> the light/dark pair it resolves to.
 *
 * A map rather than an if/else so THEME-01/03/04's catalog is a data change
 * here, not a control-flow change. D-06 locks the catalog at exactly these
 * four entries; `ResolvedConfig["theme"]`'s own union type (`config.ts`'s
 * `z.enum`) is what makes "exactly four, not five" a structural guarantee —
 * this `Record` cannot even compile with a key `config.ts`'s enum doesn't
 * also accept.
 *
 * D-07: `dracula`/`nord`/`tokyonight` are single-mode ecosystem themes with
 * no light counterpart the ecosystem recognizes as "real" — each one's
 * `light` and `dark` fields deliberately point at the SAME `Theme` object
 * reference (not two separately-constructed objects that merely happen to
 * hold equal values). `renderPair` calls `renderBody` once per field; two
 * calls against the same object reference are byte-for-byte identical by
 * construction, with no extra comparison step required.
 */
const THEME_PAIRS: Record<ResolvedConfig["theme"], { light: Theme; dark: Theme }> = {
  editorial: { light: editorialLight, dark: editorialDark },
  dracula: { light: draculaTheme, dark: draculaTheme },
  nord: { light: nordTheme, dark: nordTheme },
  tokyonight: { light: tokyonightTheme, dark: tokyonightTheme },
};

/**
 * Resolve a `widgets.yml` `theme:` value to the `{ light, dark }` pair
 * `renderAllCards` needs. Exists so callers (`action-entry.ts`/`cli.ts`)
 * don't need to import `THEME_PAIRS` themselves or know its internal
 * structure — they pass a plain `config.theme` string in and get a themes
 * object back. Covers all four of D-06's catalog entries.
 */
export function resolveTheme(theme: ResolvedConfig["theme"]): { light: Theme; dark: Theme } {
  return THEME_PAIRS[theme];
}

interface ZodLikeIssue {
  code?: string;
  path: PropertyKey[];
  message: string;
  keys?: string[];
}

/**
 * Turn a widget schema's validation failure into problem lines a person can
 * act on, in the same register as `core/config.ts`'s D-12 report.
 *
 * The point is to keep zod's internal vocabulary out of the adopter's
 * terminal. A raw zod issue for a typo'd key reads `(root): Unrecognized key:
 * "timezon"` — an empty path rendered as a literal "(root)", an English
 * sentence inside an otherwise-Chinese report, and no indication of what the
 * accepted keys are.
 *
 * Known limitation, deliberately not worked around here: this cannot offer a
 * did-you-mean suggestion the way an unknown `type:` does, because the
 * `OptionsSchema<Opts>` plugin contract exposes only `.parse()` — there is no
 * way to enumerate a widget's accepted option keys without widening the
 * contract that every future card author has to satisfy. Naming the offending
 * key precisely is the most that can be done without that change.
 */
function describeOptionsFailure(error: unknown): string[] {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    const issues = (error as { issues: ZodLikeIssue[] }).issues;
    return issues.map((issue) => {
      if (issue.code === "unrecognized_keys" && issue.keys && issue.keys.length > 0) {
        const quoted = issue.keys.map((key) => `"${key}"`).join("、");
        return `無法辨識的選項 ${quoted}，請檢查是否為拼字錯誤`;
      }
      const key = issue.path.length > 0 ? issue.path.join(".") : null;
      return key ? `選項 "${key}"：${issue.message}` : issue.message;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

/**
 * A card entry from `widgets.yml` after its `type:` has been resolved to a
 * real registered widget and its `options:` block has been validated by that
 * widget's own `optionsSchema` (RESEARCH.md Pattern 2: "resolve → fetch →
 * render"). `parsedOptions` carries the FULL return value of
 * `widget.optionsSchema.parse()` — unlike the old `renderAllCards` loop,
 * which called `.parse()` only to validate and then discarded the result,
 * this is the one place a genuinely real option value (e.g. Editorial Stat
 * Card's `include_forks`) survives past validation so `fetchSharedData` can
 * read it before the single shared fetch happens.
 */
export interface ResolvedCard {
  id: string;
  widget: WidgetDefinition<any>;
  parsedOptions: Record<string, unknown>;
  timezone: string;
}

/**
 * Validate every card in `config` against its registered widget, in the
 * order the consumer wrote them — the synchronous "resolve" half of
 * RESEARCH.md Pattern 2. No `fs`, no `path`, no `process`, no network: this
 * function throws before any network call could ever happen, which is what
 * makes `fetchSharedData`'s "resolve fully, then fetch once" ordering a
 * structural guarantee rather than a convention.
 *
 * This is the same lookup/validation logic `renderAllCards` used to run
 * inline (`UnknownWidgetError`/`InvalidCardOptionsError`/id/timezone
 * resolution) — moved here unchanged except that `parsedOptions` is now kept
 * rather than discarded.
 */
export function resolveCards(config: ResolvedConfig): ResolvedCard[] {
  return config.cards.map((entry: CardEntry): ResolvedCard => {
    const widget = get(entry.type);
    if (!widget) {
      throw new UnknownWidgetError(entry.type);
    }

    const id = entry.id ?? entry.type;

    // D-09 allows `timezone` to be overridden per card via a reserved
    // top-level `options.timezone` key — distinct from the widget's own
    // `optionsSchema` vocabulary (a widget could coincidentally declare its
    // own unrelated `timezone` option, as almanac's test fixtures do). The
    // reserved key is stripped out of the raw options *before* the rest is
    // handed to the widget's own `.strict()` schema, so a widget that does
    // not itself declare a `timezone` field (masthead, editorial-stat-card,
    // the-graveyard) never sees an "unrecognized key" for it.
    // `config.ts`'s `CardEntrySchema` leaves `options:` as an unvalidated
    // `z.record`, so a runtime `typeof` check replaces the previous unchecked
    // `as string` cast.
    const { timezone: rawTimezone, ...widgetOptions } = entry.options ?? {};
    const timezone = typeof rawTimezone === "string" ? rawTimezone : config.timezone;

    // The widget owns its own option vocabulary. This is where a typo inside
    // a card's `options:` block is caught — config.ts only checked that the
    // block is a mapping.
    let parsedOptions: Record<string, unknown>;
    try {
      parsedOptions = widget.optionsSchema.parse(widgetOptions) as Record<string, unknown>;
    } catch (error) {
      throw new InvalidCardOptionsError(id, entry.type, describeOptionsFailure(error));
    }

    return { id, widget, parsedOptions, timezone };
  });
}

/**
 * The ONLY place the pipeline touches the network (RESEARCH.md Pattern 2):
 * unions every resolved card's declared capabilities, derives the single
 * `includeForks` boolean the shared fetch needs from the `stats`-requiring
 * cards, and calls `fetchProfileData` exactly once (DATA-01). Every extra
 * enabled card beyond the first `stats` consumer is already covered by the
 * same union of capabilities — this function does not loop per card. Two or
 * more `stats` cards are allowed only if they all agree on `include_forks`
 * (see `ConflictingStatsOptionsError`); there is no way to honor divergent
 * settings from a single fetch.
 */
export async function fetchSharedData(
  cards: ResolvedCard[],
  token: string,
  login: string,
  fetchImpl?: FetchImpl,
): Promise<{ data: ProfileData; pointCost: number }> {
  const capabilities = collectCapabilities(cards.map((card) => card.widget));
  const statsCards = cards.filter((card) => card.widget.requires.includes("stats"));
  const distinctIncludeForks = new Set(statsCards.map((card) => Boolean(card.parsedOptions.include_forks)));
  if (distinctIncludeForks.size > 1) {
    throw new ConflictingStatsOptionsError(statsCards.map((card) => card.id));
  }
  const includeForks = Boolean(statsCards[0]?.parsedOptions.include_forks);

  return fetchProfileData(capabilities, token, login, includeForks, fetchImpl);
}

/**
 * Render every already-resolved card against already-fetched `data`.
 *
 * Pure and synchronous: no `fs`, no `path`, no `process`, no network — this
 * is the "render" third of RESEARCH.md Pattern 2 (`resolveCards` ->
 * `fetchSharedData` -> `renderAllCards`). Both entry points —
 * `src/cli.ts`/`src/action-entry.ts` — call `resolveCards`/`fetchSharedData`
 * first and pass their results in here, so a card can never render
 * differently locally than it does inside the Action.
 *
 * Every card is fully rendered and size-checked before ANY of them is
 * returned. A single over-budget or misconfigured card therefore aborts the
 * whole run with nothing written, rather than leaving a half-published set of
 * SVGs on the `output` branch.
 */
export function renderAllCards(
  cards: ResolvedCard[],
  data: ProfileData,
  globalOpts: { now: Date; seed: number; language: "en" | "zh-TW" },
  themes: { light: Theme; dark: Theme },
): RenderedCard[] {
  // Pass 1: build { card, opts } for every card — identical overlay logic to
  // the pre-Phase-3 inline .map() (D-09 timezone override, D-08 language
  // always top-level), just extracted so Passes 2-4 below can each iterate
  // it without recomputing.
  const entries: { card: ResolvedCard; opts: RenderOptions }[] = cards.map((card) => ({
    card,
    opts: {
      ...card.parsedOptions,
      now: globalOpts.now,
      seed: globalOpts.seed,
      language: globalOpts.language,
      timezone: card.timezone,
    } as RenderOptions,
  }));

  // Pass 2 (NEW, MAST-02): collect every enabled card's exposed citable
  // facts, keyed by card id. A widget that doesn't implement `citableFacts`
  // (the overwhelming majority) simply contributes nothing here.
  const factRegistry: Record<string, Record<string, CitableFact>> = {};
  for (const entry of entries) {
    const facts = entry.card.widget.citableFacts?.(data, entry.opts);
    if (facts !== undefined) {
      factRegistry[entry.card.id] = facts;
    }
  }

  // Pass 3 (NEW, MAST-01/02): masthead-context construction. Resolves
  // RESEARCH.md Open Question Q2 (locked by 03-UI-SPEC.md's Page Numbering
  // Display Contract): the masthead itself is excluded from both its own
  // contents list and from page numbering — `totalPages` counts only
  // non-masthead cards.
  const hasMasthead = cards.some((card) => card.widget.name === "masthead");
  let contents: { id: string; title: string; pageNumber: number }[] | undefined;
  let totalPages: number | undefined;
  let citedFacts: { totalCommits?: CitableFact } | undefined;
  let pageNumberById: Record<string, number> | undefined;

  if (hasMasthead) {
    const nonMastheadEntries = entries.filter((entry) => entry.card.widget.name !== "masthead");
    totalPages = nonMastheadEntries.length;
    contents = nonMastheadEntries.map((entry, i) => ({
      id: entry.card.id,
      title: entry.card.widget.describe(data, entry.opts).title,
      pageNumber: i + 1,
    }));
    pageNumberById = {};
    for (const item of contents) {
      pageNumberById[item.id] = item.pageNumber;
    }
    // D-07: v1's only known citation key. Scans the full `cards` array in
    // enabled order (see firstCitedFact's own doc comment).
    citedFacts = { totalCommits: firstCitedFact(cards, factRegistry, "totalCommits") };
  }

  // Pass 4 (replaces the old final .map()): inject pageNumber/totalPages
  // into every non-masthead card's opts (only when a masthead is present),
  // and contents/citedFacts into the masthead's own opts — then render
  // exactly as before.
  return entries.map((entry): RenderedCard => {
    const { card } = entry;
    let opts = entry.opts;

    if (card.widget.name === "masthead") {
      // contents/citedFacts are deliberately NOT named on the RenderOptions
      // interface (mirrors EditorialStatCardOptions' include_forks
      // precedent) — the masthead's own MastheadOptions extension type reads
      // them back off `opts` via a trusted cast, same convention every
      // widget already uses for pipeline-injected fields.
      opts = { ...opts, contents, citedFacts } as RenderOptions;
    } else if (pageNumberById !== undefined) {
      opts = { ...opts, pageNumber: pageNumberById[card.id], totalPages } as RenderOptions;
    }

    if ((opts.pageNumber === undefined) !== (opts.totalPages === undefined)) {
      throw new PageNumberInvariantError(card.id, opts.pageNumber, opts.totalPages);
    }

    const { light, dark } = renderPair(card.widget, data, opts, themes);

    const lightLabel = `${card.id}-light.svg`;
    const darkLabel = `${card.id}-dark.svg`;

    // Soft budget first (RENDER-07) — this is the one that trips in normal
    // operation. The 1MB canary is a second layer that only fires if the soft
    // budget were ever misconfigured away.
    sizeGuard(light, lightLabel, SOFT_SIZE_BUDGET_BYTES);
    sizeGuard(dark, darkLabel, SOFT_SIZE_BUDGET_BYTES);
    sizeGuard(light, lightLabel, HARD_SIZE_CANARY_BYTES);
    sizeGuard(dark, darkLabel, HARD_SIZE_CANARY_BYTES);

    const { title, desc } = card.widget.describe(data, opts);

    return { id: card.id, light, dark, title, desc };
  });
}
