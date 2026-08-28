import { mkdirSync, writeFileSync } from "node:fs";
import type { ResolvedConfig } from "../src/core/config.js";
import type { ProfileData } from "../src/core/model.js";
import { renderAllCards, resolveCards, resolveTheme } from "../src/core/pipeline.js";
import { loadAllFonts } from "../src/node/fonts.js";
import { registerAllWidgets } from "../src/widgets/all.js";

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
 * A SECOND fixture: a fifteen-day-old account. This exists for exactly the
 * reason `SILENT_WEEK_STARTS` above exists — a check the page asks the
 * reviewer to make is meaningless unless the thing being checked is actually
 * on the page. The main `octocat` fixture carries a 219-day calendar, so
 * Vitals' `n` saturates at `WINDOW_DAYS` (28) and the Rule C-1 dashed
 * "no recording exists" segment is NEVER DRAWN. H-1 asks the reviewer to
 * distinguish that dashed segment from a solid accent flat segment while only
 * one of the two is rendered.
 *
 * The counts are not arbitrary — they were solved for against the shipped
 * `computeMonthlyCandles`/`levelToY` so that ONE fixture produces both of the
 * missing states at once:
 *
 * - **H-1 (Vitals, Rule C-1):** `n = 15 < 28`, so slots 0..12 carry the dashed
 *   `rule` line, and the zeros at indices 2, 4 and 9 are RECORDED zeros that
 *   draw as solid 1.6px `accent` flat segments on the same baseline. The two
 *   signals finally sit adjacent, which is the whole comparison.
 * - **H-2 (Ticker, Rule C-3):** the trailing month closes at 25 against an open
 *   of 26, giving a hollow body of **1.52px** — 0.02px above the `DOJI_MIN_H`
 *   floor of 1.5, i.e. the tightest hollow body the card can draw before it
 *   becomes a doji. The month before it is also hollow at 21.33px, so the
 *   reviewer gets an easy case and the hard case side by side and can say
 *   which one stops reading as hollow.
 *
 * `2026-08-07` is the last day, matching `PINNED_NOW`, so the account reads as
 * currently active rather than abandoned (which would route Vitals into its
 * FLATLINE branch and remove the pulse H-3 needs).
 */
const SPARSE_START = Date.UTC(2026, 6, 24); // 2026-07-24
const SPARSE_COUNTS = [6, 3, 0, 12, 0, 6, 6, 1, 1, 0, 3, 3, 10, 4, 4] as const;

function sparseCalendarDays(): { date: string; count: number }[] {
  return SPARSE_COUNTS.map((count, i) => ({
    date: new Date(SPARSE_START + i * MS_PER_DAY).toISOString().slice(0, 10),
    count,
  }));
}

function sparseProfileData(): ProfileData {
  const contributionCalendar = sparseCalendarDays();
  return {
    login: "newcomer",
    name: "New Comer",
    avatarUrl: "",
    followers: 3,
    fetchedAt: PINNED_NOW.toISOString(),
    stats: { totalCommits: 41, totalPRs: 2, totalIssues: 1, totalStars: 0 },
    contributionCalendar,
    contributionCalendarTotal: contributionCalendar.reduce((sum, d) => sum + d.count, 0),
    repositories: [
      {
        name: "first-repo",
        nameWithOwner: "newcomer/first-repo",
        url: "https://github.com/newcomer/first-repo",
        createdAt: "2026-07-24T00:00:00Z",
        pushedAt: PINNED_NOW.toISOString(),
        isFork: false,
      },
    ],
  };
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

const CARDS: ResolvedConfig["cards"] = [
  { type: "masthead" },
  { type: "almanac" },
  { type: "editorial-stat-card" },
  { type: "the-graveyard" },
  { type: "the-record" },
  { type: "vitals" },
  { type: "the-forecast" },
  { type: "the-ticker" },
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
    // Render once per THEME NAME (not once per ground) — dracula/nord/
    // tokyonight would otherwise be rendered (and written to disk) twice for
    // byte-identical output, since their light and dark pairs are the SAME
    // object reference (D-07).
  function renderFixture(
    data: ProfileData,
    dirSuffix: string,
  ): Map<ResolvedConfig["theme"], ReturnType<typeof renderAllCards>> {
      const byTheme = new Map<ResolvedConfig["theme"], ReturnType<typeof renderAllCards>>();
    for (const themeConfig of new Set(GROUNDS.map((g) => g.themeConfig))) {
      const themes = resolveTheme(themeConfig);
      const rendered = renderAllCards(
        cards,
        data,
        { now: PINNED_NOW, seed: PINNED_SEED, language: "en" },
        themes,
      );
      byTheme.set(themeConfig, rendered);

      const themeDir = `${OUTPUT_DIR}/${themeConfig}${dirSuffix}`;
      mkdirSync(themeDir, { recursive: true });
      for (const { id, light, dark } of rendered) {
        writeFileSync(`${themeDir}/${id}-light.svg`, light, "utf8");
        writeFileSync(`${themeDir}/${id}-dark.svg`, dark, "utf8");
      }
      console.log(`[build-uat-preview] wrote ${rendered.length} card(s) x2 modes under ${themeDir}/`);
    }
    return byTheme;
  }

  const renderedByTheme = renderFixture(syntheticProfileData(), "");
  const sparseByTheme = renderFixture(sparseProfileData(), "-sparse");

  function buildSections(
    byTheme: Map<ResolvedConfig["theme"], ReturnType<typeof renderAllCards>>,
    dirSuffix: string,
    labelSuffix: string,
  ): string {
    return GROUNDS.map((ground) => {
      const rendered = byTheme.get(ground.themeConfig)!;
        const label = `${ground.label}${labelSuffix}`;
      const cells = rendered
        .map((rc) => {
          const src = `${OUTPUT_DIR}/${ground.themeConfig}${dirSuffix}/${rc.id}-${ground.mode}.svg`;
          const alt = escapeHtml(`${rc.title} — ${label} ground`);
          return (
            `      <figure class="card-cell">\n` +
            `        <img src="${src}" alt="${alt}" width="495">\n` +
            `        <figcaption>${escapeHtml(rc.id)} — ${escapeHtml(label)}</figcaption>\n` +
            `      </figure>`
          );
        })
        .join("\n");
      return (
        `  <section>\n` +
        `    <h2>${escapeHtml(label)}</h2>\n` +
        `    <div class="card-grid">\n${cells}\n    </div>\n` +
        `  </section>`
      );
    }).join("\n\n");
  }

  const sections =
    buildSections(renderedByTheme, "", "") +
    `\n\n  <hr>\n  <h1>Sparse account — the fixture H-1 and H-2 are actually judged on</h1>\n` +
    `  <p class="warning">A fifteen-day-old account. The established-account fixture above cannot\n` +
    `  answer H-1 at all: its calendar is long enough that Vitals’ window saturates at 28 days,\n` +
    `  so the dashed &ldquo;no recording exists&rdquo; segment is never drawn and the reviewer is\n` +
    `  asked to compare it against something that is not on the page. Below, Vitals renders 15\n` +
    `  recorded days (dashed run on the left, three recorded zeros as solid accent flat segments)\n` +
    `  and the Ticker renders its tightest legal hollow body — 1.52px against the 1.5px doji\n` +
    `  floor — directly beside a comfortable 21.33px one.</p>\n\n` +
    buildSections(sparseByTheme, "-sparse", " — sparse account");

  writeDiagnosticSpinSvg();

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
    `  .diag { max-width: 900px; padding: 12px 16px; border: 1px solid #6B5B4B; background: #16140F; margin-bottom: 24px; }\n` +
    `  .diag-strip { display: flex; align-items: center; gap: 16px; margin-top: 12px; }\n` +
    `  .diag-strip img { border: 1px solid #444; display: block; }\n` +
    // The banner reads the viewer's OWN OS preference off the host page, so
    // "it isn't spinning" can be attributed correctly without guesswork.
    `  .rm-on { display: none; }\n` +
    `  .rm-off { display: block; }\n` +
    `  @media (prefers-reduced-motion: reduce) {\n` +
    `    .rm-on { display: block; color: #E0B080; }\n` +
    `    .rm-off { display: none; }\n` +
    `  }\n` +
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
    `  <li><strong>H-1 / Rule C-1 (Vitals) — judge this on the SPARSE sections, not the ones above.</strong> The established-account fixture saturates Vitals’ 28-day window, so it draws no dashed segment at all and cannot answer this question. In each sparse section the trace should show a dashed 1px <code>rule</code> run across the left ~13 slots (no recording exists) meeting a solid 1.6px <code>accent</code> trace, which itself sits flat on the baseline for three recorded zero days. Are the two flat runs — dashed and solid — tellable apart at README scale, on all five grounds? <em>If you see no dashed run at all, the fixture is broken and this check is meaningless — say so rather than passing it.</em></li>\n` +
    `  <li><strong>H-2 / Rule C-3 (Ticker) — judge this on the SPARSE sections.</strong> Each sparse Ticker draws exactly two hollow (down) bodies: a comfortable <strong>21.33px</strong> one and a <strong>1.52px</strong> one sitting 0.02px above the 1.5px doji floor — the tightest hollow body the card can legally draw. With an 11px width and a 1px stroke on each edge, the stroke very nearly consumes the fill. Does the 1.52px body still read as hollow rather than solid, on all five grounds? A "no" here is a real finding, not a fixture problem.</li>\n` +
    `  <li><strong>H-3 / reduced motion (Vitals):</strong> confirm the pulse dot actually freezes to a solid accent dot under reduced motion. Use a BROWSER-LEVEL launch flag (e.g. <code>--force-prefers-reduced-motion</code>) or a real OS setting — CDP <code>Emulation.setEmulatedMedia</code> does NOT propagate into &lt;img&gt;-decoded SVG and produces a false negative indistinguishable from a real defect (established in Phase 5).</li>\n` +
    `</ul>\n` +
    `<div class="diag">\n` +
    `  <strong>If the record does not appear to spin, read this before filing a bug.</strong>\n` +
    `  <p class="rm-on"><strong>Your OS reduce-motion preference is currently ON.</strong> A still record is\n` +
    `  therefore the CORRECT behaviour — this page is proving RENDER-06's accessibility half, not failing it.\n` +
    `  To check the rotation itself, turn the setting off (Windows: Settings &rsaquo; Accessibility &rsaquo;\n` +
    `  Visual effects &rsaquo; Animation effects) and reload.</p>\n` +
    `  <p class="rm-off">Your OS reduce-motion preference is currently OFF, so the record is expected to turn.</p>\n` +
    `  <p>The control below uses the <em>identical</em> mechanism — same <code>@keyframes</code> name, same class,\n` +
    `  same 24s period, same chassis reduced-motion block, embedded through the same &lt;img src&gt; path — but\n` +
    `  rotates a full-opacity hand instead of texture scuffs.</p>\n` +
    `  <div class="diag-strip">\n` +
    `    <img src="${OUTPUT_DIR}/_diagnostic-spin.svg" alt="A control graphic: a high-contrast hand rotating once every 24 seconds" width="200" height="200">\n` +
    `    <ul>\n` +
    `      <li><strong>Hand turns, record looks still</strong> &rarr; the animation works and the finding is about\n` +
    `      <em>visibility</em>, not a broken mechanism. The concentric grooves are rotationally symmetric, so the\n` +
    `      seeded texture is the only evidence of motion; if that texture is too faint the disc reads as static.\n` +
    `      This exact failure was found and fixed during Phase 4's own loop-A pass (the long "wear" arcs are the\n` +
    `      only marks the eye can track around a 24s revolution &mdash; grain and dust read as static noise at any\n` +
    `      brightness). If it recurs, tune <code>TEXTURE_WEAR_COUNT</code> and the wear layer's opacity in\n` +
    `      <code>the-record/index.ts</code>, and re-confirm D-03 afterwards &mdash; texture and grooves share the\n` +
    `      <code>paper</code> role, so brightening one trades against the other.</li>\n` +
    `      <li><strong>Neither turns</strong> &rarr; check the banner above first. If reduce-motion is OFF and the\n` +
    `      hand still will not move, CSS animation is not surviving &lt;img src&gt; in this browser — that IS a\n` +
    `      RENDER-06 blocker.</li>\n` +
    `      <li><strong>Both turn</strong> &rarr; RENDER-06's rotation half holds in the local loop. Loop B still owes\n` +
    `      the camo-proxied confirmation.</li>\n` +
    `    </ul>\n` +
    `  </div>\n` +
    `</div>\n` +
    `${sections}\n` +
    `</body>\n` +
    `</html>\n`;

  writeFileSync(HTML_PATH, html, "utf8");
  console.log(`[build-uat-preview] wrote ${HTML_PATH}`);
}

/**
 * A CONTROL, not a card. "The Record isn't spinning" has two very different
 * causes that look identical on screen, and this file separates them:
 *
 *   (a) the animation mechanism does not survive `<img src>` in this browser, or
 *       the OS reduce-motion preference is on and correctly suppressing it; or
 *   (b) the mechanism works fine and the rotation is simply imperceptible,
 *       because the only thing inside The Record's spinning group is 94 texture
 *       scuffs at stroke-opacity 0.03-0.19 and stroke-width 0.3-0.84px.
 *
 * This SVG uses the IDENTICAL mechanism — same `@keyframes` name, same class
 * name, same `transform-origin` form, and the same chassis reduced-motion block
 * ahead of it — but rotates a high-contrast, full-opacity hand that is
 * impossible to miss. Embedded through the same `<img src>` path as every card.
 *
 * If the hand spins and the record does not: cause (b) — a design problem in the
 * texture's visibility, not a broken animation.
 * If the hand does not spin either: cause (a) — check the OS reduce-motion
 * banner at the top of the page before concluding anything is broken.
 */
function writeDiagnosticSpinSvg(): void {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img">` +
    `<title>Animation control — a plainly visible rotating hand</title>` +
    `<desc>Uses the same @keyframes mechanism as The Record, at full opacity.</desc>` +
    `<style>@media (prefers-reduced-motion: reduce){*{animation-duration:0.01ms!important;animation-iteration-count:1!important;}}` +
    `@keyframes atelier-record-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}` +
    `.atelier-record-spin{animation:atelier-record-spin 24s linear infinite;transform-origin:100px 100px}</style>` +
    `<rect width="200" height="200" fill="#1c1a17"/>` +
    `<circle cx="100" cy="100" r="86" fill="none" stroke="#6B5B4B" stroke-width="1"/>` +
    `<g class="atelier-record-spin">` +
    // Full-opacity, 6px-wide hand from centre to rim — the same 24s period as
    // the record, so "one revolution every 24 seconds" is directly comparable.
    `<line x1="100" y1="100" x2="100" y2="18" stroke="#C99A70" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="100" cy="26" r="9" fill="#C99A70"/>` +
    `</g>` +
    `<circle cx="100" cy="100" r="5" fill="#F7F1E7"/>` +
    `</svg>\n`;
  const path = `${OUTPUT_DIR}/_diagnostic-spin.svg`;
  writeFileSync(path, svg, "utf8");
  console.log(`[build-uat-preview] wrote ${path} (animation control)`);
}

main();
