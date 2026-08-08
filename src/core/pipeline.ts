import type { CardEntry, ResolvedConfig } from "./config.js";
import { type FetchImpl, fetchProfileData, zeroCapabilityProfileData } from "./fetch.js";
import type { ProfileData, RenderOptions, Theme } from "./model.js";
import { collectCapabilities, get } from "./registry.js";
import type { WidgetDefinition } from "./registry.js";
import {
  HARD_SIZE_CANARY_BYTES,
  renderPair,
  SOFT_SIZE_BUDGET_BYTES,
  sizeGuard,
} from "./svg.js";
import { editorialDark, editorialLight } from "./theme.js";

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
 * `theme:` value -> the light/dark pair it resolves to.
 *
 * A map rather than an if/else so THEME-03/04's eventual catalog is a data
 * change here, not a control-flow change.
 */
const THEME_PAIRS: Record<ResolvedConfig["theme"], { light: Theme; dark: Theme }> = {
  editorial: { light: editorialLight, dark: editorialDark },
};

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
  if (error && typeof error === "object" && "issues" in error) {
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

    // The widget owns its own option vocabulary. This is where a typo inside
    // a card's `options:` block is caught — config.ts only checked that the
    // block is a mapping.
    let parsedOptions: Record<string, unknown>;
    try {
      parsedOptions = widget.optionsSchema.parse(entry.options ?? {}) as Record<string, unknown>;
    } catch (error) {
      throw new InvalidCardOptionsError(id, entry.type, describeOptionsFailure(error));
    }

    // D-09 allows `timezone` to be overridden per card.
    const timezone = (entry.options?.timezone as string | undefined) ?? config.timezone;

    return { id, widget, parsedOptions, timezone };
  });
}

/**
 * The ONLY place the pipeline touches the network (RESEARCH.md Pattern 2):
 * unions every resolved card's declared capabilities, derives the single
 * `includeForks` boolean the shared fetch needs from whichever card declared
 * `stats` (v1 has at most one — RESEARCH.md's "Open Question 1" flags a
 * second `stats` card as a future, not-yet-arisen conflict), and calls
 * `fetchProfileData` exactly once (DATA-01). Every extra enabled card beyond
 * the first `stats` consumer is already covered by the same union of
 * capabilities — this function does not loop per card.
 */
export async function fetchSharedData(
  cards: ResolvedCard[],
  token: string,
  login: string,
  fetchImpl?: FetchImpl,
): Promise<{ data: ProfileData; pointCost: number }> {
  const capabilities = collectCapabilities(cards.map((card) => card.widget));
  const statsCard = cards.find((card) => card.widget.requires.includes("stats"));
  const includeForks = Boolean(statsCard?.parsedOptions.include_forks);

  return fetchProfileData(capabilities, token, login, includeForks, fetchImpl);
}

/**
 * Render every card in `config`, in the order the consumer wrote them.
 *
 * Pure and synchronous: no `fs`, no `path`, no `process`, no network. Both
 * entry points — `src/cli.ts` today and `src/action-entry.ts` in Plan 05 —
 * call this one function, so a card can never render differently locally than
 * it does inside the Action.
 *
 * Every card is fully rendered and size-checked before ANY of them is
 * returned. A single over-budget or misconfigured card therefore aborts the
 * whole run with nothing written, rather than leaving a half-published set of
 * SVGs on the `output` branch.
 */
export function renderAllCards(
  config: ResolvedConfig,
  globalOpts: { now: Date; seed: number },
): RenderedCard[] {
  // Almanac declares zero data capabilities (DATA-03), so the render path
  // holds no remote state at all. This is the synchronous placeholder, not an
  // awaited fetch — which is what lets this whole function stay synchronous.
  const data = zeroCapabilityProfileData();
  const themes = THEME_PAIRS[config.theme];

  return config.cards.map((entry: CardEntry): RenderedCard => {
    const widget = get(entry.type);
    if (!widget) {
      throw new UnknownWidgetError(entry.type);
    }

    const id = entry.id ?? entry.type;

    // The widget owns its own option vocabulary. This is where a typo inside
    // a card's `options:` block is caught — config.ts only checked that the
    // block is a mapping.
    try {
      widget.optionsSchema.parse(entry.options ?? {});
    } catch (error) {
      throw new InvalidCardOptionsError(id, entry.type, describeOptionsFailure(error));
    }

    // D-09 allows `timezone` to be overridden per card. `language` has no
    // such override by design (D-08): it is read from the top level only,
    // and is never inferred from profile data or from the card entry.
    const opts: RenderOptions = {
      now: globalOpts.now,
      seed: globalOpts.seed,
      language: config.language,
      timezone: (entry.options?.timezone as string | undefined) ?? config.timezone,
    };

    const { light, dark } = renderPair(widget, data, opts, themes);

    const lightLabel = `${id}-light.svg`;
    const darkLabel = `${id}-dark.svg`;

    // Soft budget first (RENDER-07) — this is the one that trips in normal
    // operation. The 1MB canary is a second layer that only fires if the soft
    // budget were ever misconfigured away.
    sizeGuard(light, lightLabel, SOFT_SIZE_BUDGET_BYTES);
    sizeGuard(dark, darkLabel, SOFT_SIZE_BUDGET_BYTES);
    sizeGuard(light, lightLabel, HARD_SIZE_CANARY_BYTES);
    sizeGuard(dark, darkLabel, HARD_SIZE_CANARY_BYTES);

    const { title, desc } = widget.describe(data, opts);

    return { id, light, dark, title, desc };
  });
}
