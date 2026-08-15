import { mkdirSync, writeFileSync } from "node:fs";
import type { ResolvedConfig } from "../src/core/config.js";
import type { ProfileData } from "../src/core/model.js";
import { renderAllCards, resolveCards, resolveTheme } from "../src/core/pipeline.js";
import { register } from "../src/core/registry.js";
import { loadAllFonts } from "../src/node/fonts.js";
import { almanacWidget } from "../src/widgets/almanac/index.js";
import { editorialStatCardWidget } from "../src/widgets/editorial-stat-card/index.js";
import { mastheadWidget } from "../src/widgets/masthead/index.js";
import { theGraveyardWidget } from "../src/widgets/the-graveyard/index.js";
import { theRecordWidget } from "../src/widgets/the-record/index.js";

/**
 * The D-08 loop-A preview harness (04-05 Task 2): an OFFLINE renderer that
 * writes every widget across every built-in theme into `.preview/` and emits
 * `.uat-preview.html` embedding them through real `<img src>` tags — the
 * "fast local loop" half of D-08's dual-loop animation verification
 * (04-CONTEXT.md D-08; the real GitHub push, loop B, is 04-05 Task 3's
 * checkpoint, not this script).
 *
 * Renders through the SAME `renderAllCards()` pass `src/cli.ts` and
 * `src/action-entry.ts` use — this script must never call `renderPair()`/
 * `wrapSvg()` directly, or a reviewer would be looking at a parallel
 * implementation rather than the code path that actually ships.
 *
 * Fully offline, no network call, no environment variable read (T-04-13):
 * the `ProfileData` fixture below is entirely synthetic. `PINNED_NOW`/
 * `PINNED_SEED` are fixed so re-running this script with no source change
 * produces byte-identical SVG output.
 */

const PINNED_NOW = new Date("2026-08-07T12:00:00Z");
const PINNED_SEED = 42;

const OUTPUT_DIR = ".preview";
const HTML_PATH = ".uat-preview.html";
const MS_PER_DAY = 86_400_000;

/**
 * Sunday-started weeks that must render as PRESSED-BUT-SILENT — an elapsed
 * week whose every day is zero. These exist for one reason: D-03, the phase's
 * only hard visual constraint, is the claim that a past week with zero
 * contributions stays distinguishable from a future week. Without at least one
 * such week in the fixture the preview page has no past-zero groove at all, so
 * the comparison the page asks the reviewer to make is not on the page.
 *
 * A scattered silent *day* does NOT produce one: the groove encoding buckets by
 * WEEK, so a lone zero day inside an otherwise-active week is invisible. The
 * bug this replaced set every ninth DAY to zero and reported `SILENT WEEKS 0`.
 *
 * - `2026-04-05` — mid-year, so a past-zero groove sits surrounded by pressed
 *   grooves of varying weight (is it distinguishable from its neighbours?).
 * - `2026-07-26` — the second-to-last ELAPSED week, so a past-zero groove sits
 *   directly against the future grooves (the exact D-03 adjacency). Deliberately
 *   not the last elapsed week, which the stylus rests on.
 */
const SILENT_WEEK_STARTS = ["2026-04-05", "2026-07-26"] as const;

function silentDayDates(): Set<string> {
  const dates = new Set<string>();
  for (const start of SILENT_WEEK_STARTS) {
    const startMs = Date.parse(`${start}T00:00:00Z`);
    for (let d = 0; d < 7; d++) {
      dates.add(new Date(startMs + d * MS_PER_DAY).toISOString().slice(0, 10));
    }
  }
  return dates;
}

/**
 * A partial-year daily contribution calendar (2026-01-01 .. PINNED_NOW) with a
 * deliberate seven-day busiest week and two fully-silent elapsed weeks — so The
 * Record's groove ink (D-03/D-04) and its right-column callouts (BUSIEST WEEK /
 * SILENT WEEKS) carry real signal in the preview, not an all-zero fixture and
 * not a fixture whose SILENT WEEKS reads 0. Days 60-66 (~early March) are the
 * busiest week; `SILENT_WEEK_STARTS` above are the zero weeks.
 */
function syntheticCalendarDays(): { date: string; count: number }[] {
  const days: { date: string; count: number }[] = [];
  const silent = silentDayDates();
  const start = Date.UTC(2026, 0, 1);
  const end = Date.UTC(2026, 7, 7); // matches PINNED_NOW's calendar date
  let i = 0;
  for (let ms = start; ms <= end; ms += MS_PER_DAY, i++) {
    const date = new Date(ms).toISOString().slice(0, 10);
    let count: number;
    if (silent.has(date)) {
      count = 0; // a whole elapsed week at zero — the D-03 comparison group
    } else if (i >= 60 && i < 67) {
      count = 30; // the deliberate busiest week
    } else {
      count = (i % 5) + 1;
    }
    days.push({ date, count });
  }
  return days;
}

/**
 * A synthetic `ProfileData` covering every declared capability at once
 * (stats, identity, repoList, calendar) — a realistic partial-year
 * contribution calendar, a repository list including a stale entry (so The
 * Graveyard renders its populated, non-empty state) and plausible aggregate
 * stats. Never reads an environment variable, never calls the GraphQL
 * client (T-04-13) — `login`/`name` below are fixed literals, not a real
 * account.
 */
function syntheticProfileData(): ProfileData {
  const contributionCalendar = syntheticCalendarDays();
  return {
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "",
    followers: 128,
    fetchedAt: PINNED_NOW.toISOString(),
    stats: { totalCommits: 3481, totalPRs: 42, totalIssues: 17, totalStars: 256 },
    contributionCalendar,
    contributionCalendarTotal: contributionCalendar.reduce((sum, d) => sum + d.count, 0),
    repositories: [
      {
        name: "old-project",
        nameWithOwner: "octocat/old-project",
        url: "https://github.com/octocat/old-project",
        createdAt: "2019-01-01T00:00:00Z",
        pushedAt: "2019-08-01T00:00:00Z",
        isFork: false,
      },
      {
        name: "active-project",
        nameWithOwner: "octocat/active-project",
        url: "https://github.com/octocat/active-project",
        createdAt: "2024-01-01T00:00:00Z",
        pushedAt: PINNED_NOW.toISOString(),
        isFork: false,
      },
    ],
  };
}

function registerAllWidgets(): void {
  register(almanacWidget);
  register(editorialStatCardWidget);
  register(mastheadWidget);
  register(theGraveyardWidget);
  register(theRecordWidget);
}

const CARDS: ResolvedConfig["cards"] = [
  { type: "masthead" },
  { type: "almanac" },
  { type: "editorial-stat-card" },
  { type: "the-graveyard" },
  { type: "the-record" },
];

/**
 * One visual ground the preview page shows. `editorial` produces two
 * genuinely different renders (light and dark); `dracula`/`nord`/
 * `tokyonight` are single-mode themes (D-07: their `light`/`dark` fields are
 * the SAME `Theme` object reference), so only one ground is listed for each
 * — 04-CONTEXT.md's carried-forward D-03 cross-theme legibility requirement
 * is about DISTINCT visual grounds, and a second, byte-identical render of a
 * single-mode theme would not add one. Five grounds total, matching
 * 04-05-PLAN.md's Task 3 walk ("editorial light, editorial dark, dracula,
 * nord, tokyonight in turn").
 */
interface Ground {
  label: string;
  themeConfig: ResolvedConfig["theme"];
  mode: "light" | "dark";
}

const GROUNDS: Ground[] = [
  { label: "editorial — light", themeConfig: "editorial", mode: "light" },
  { label: "editorial — dark", themeConfig: "editorial", mode: "dark" },
  { label: "dracula", themeConfig: "dracula", mode: "dark" },
  { label: "nord", themeConfig: "nord", mode: "dark" },
  { label: "tokyonight", themeConfig: "tokyonight", mode: "dark" },
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function main(): void {
  registerAllWidgets();
  loadAllFonts();

  const cards = resolveCards({
    theme: "editorial",
    language: "en",
    timezone: "UTC",
    cards: CARDS,
  });
  const data = syntheticProfileData();

  // Render once per THEME NAME (not once per ground) — dracula/nord/
  // tokyonight would otherwise be rendered (and written to disk) twice for
  // byte-identical output, since their light and dark pairs are the SAME
  // object reference (D-07).
  const renderedByTheme = new Map<ResolvedConfig["theme"], ReturnType<typeof renderAllCards>>();
  for (const themeConfig of new Set(GROUNDS.map((g) => g.themeConfig))) {
    const themes = resolveTheme(themeConfig);
    const rendered = renderAllCards(
      cards,
      data,
      { now: PINNED_NOW, seed: PINNED_SEED, language: "en" },
      themes,
    );
    renderedByTheme.set(themeConfig, rendered);

    const themeDir = `${OUTPUT_DIR}/${themeConfig}`;
    mkdirSync(themeDir, { recursive: true });
    for (const { id, light, dark } of rendered) {
      writeFileSync(`${themeDir}/${id}-light.svg`, light, "utf8");
      writeFileSync(`${themeDir}/${id}-dark.svg`, dark, "utf8");
    }
    console.log(`[build-uat-preview] wrote ${rendered.length} card(s) x2 modes under ${themeDir}/`);
  }

  const sections = GROUNDS.map((ground) => {
    const rendered = renderedByTheme.get(ground.themeConfig)!;
    const cells = rendered
      .map((rc) => {
        const src = `${OUTPUT_DIR}/${ground.themeConfig}/${rc.id}-${ground.mode}.svg`;
        const alt = escapeHtml(`${rc.title} — ${ground.label} ground`);
        return (
          `      <figure class="card-cell">\n` +
          `        <img src="${src}" alt="${alt}" width="495">\n` +
          `        <figcaption>${escapeHtml(rc.id)} — ${escapeHtml(ground.label)}</figcaption>\n` +
          `      </figure>`
        );
      })
      .join("\n");
    return (
      `  <section>\n` +
      `    <h2>${escapeHtml(ground.label)}</h2>\n` +
      `    <div class="card-grid">\n${cells}\n    </div>\n` +
      `  </section>`
    );
  }).join("\n\n");

  const html =
    `<!doctype html>\n` +
    `<html lang="en">\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<title>readme-atelier — D-08 loop-A UAT preview</title>\n` +
    `<style>\n` +
    `  body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }\n` +
    `  h1 { font-size: 20px; }\n` +
    `  .warning { max-width: 900px; padding: 12px 16px; border: 1px solid #C99A70; background: #1D1916; margin-bottom: 24px; }\n` +
    `  .checklist { max-width: 900px; }\n` +
    `  section { margin-bottom: 40px; }\n` +
    `  .card-grid { display: flex; flex-wrap: wrap; gap: 16px; }\n` +
    `  .card-cell { margin: 0; }\n` +
    `  .card-cell img { display: block; border: 1px solid #444; }\n` +
    `  figcaption { font-size: 12px; opacity: 0.7; margin-top: 4px; }\n` +
    `</style>\n` +
    `</head>\n` +
    `<body>\n` +
    `<h1>D-08 loop-A preview — every card, every built-in theme ground</h1>\n` +
    `<p class="warning">\n` +
    `  <strong>Read this before drawing any conclusion.</strong> Every card below is embedded through a\n` +
    `  real &lt;img src&gt; tag, not opened directly as an SVG document. A browser tab rendering a\n` +
    `  directly-opened SVG file is a materially more permissive context than the one GitHub actually\n` +
    `  serves cards through (via &lt;img&gt;/&lt;picture&gt;, proxied by camo) — a rotation confirmed by\n` +
    `  opening the raw file proves nothing about the shipping context. This page is the FAST local loop\n` +
    `  only. Loop B (a real push to GitHub, viewed in a genuinely rendered README, ideally with the\n` +
    `  OS-level reduce-motion setting on) is the one that actually proves RENDER-06/RENDER-08 hold in\n` +
    `  production — see 04-VALIDATION.md "Manual-Only Verifications".\n` +
    `</p>\n` +
    `<ul class="checklist">\n` +
    `  <li>The Record's surface texture should visibly sweep around the disc, roughly one revolution every 24 seconds.</li>\n` +
    `  <li>The year on the centre label and the tonearm must both stay perfectly still while the disc turns.</li>\n` +
    `  <li>No other card on the page should move at all.</li>\n` +
    `  <li><strong>D-03 legibility (the phase's only hard visual constraint):</strong> in EVERY section below, can you tell where the pressed (already-elapsed) grooves stop and the future (not-yet-happened) grooves begin, without being told? If not, note which section and what you see.</li>\n` +
    `  <li><strong>D-03, the harder half.</strong> The fixture contains <strong>two fully-silent elapsed weeks</strong> (SILENT WEEKS in the right column should read 2, not 0 — if it reads 0 the fixture is broken and this check is meaningless). Those two grooves are PAST weeks that happen to have zero contributions, and they must still look different from a FUTURE week. One sits mid-disc among active grooves; the other sits directly against the future band, which is the exact adjacency the constraint is about. Can you tell those two apart from the future grooves, in every theme?</li>\n` +
    `</ul>\n` +
    `${sections}\n` +
    `</body>\n` +
    `</html>\n`;

  writeFileSync(HTML_PATH, html, "utf8");
  console.log(`[build-uat-preview] wrote ${HTML_PATH}`);
}

main();
