import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@actions/core";
import { ConfigValidationError, formatConfigErrors, loadConfigOrDefault } from "./core/config.js";
import { buildEmbedSnippet } from "./core/embed-snippet.js";
import { formatFetchFailureMessage } from "./core/fetch.js";
import { fetchSharedData, renderAllCards, resolveCards, resolveTheme } from "./core/pipeline.js";
import { publishOutputBranch } from "./core/publish.js";
import { register } from "./core/registry.js";
import { loadAllFonts } from "./node/fonts.js";
import { logPointCost } from "./node/point-cost.js";
import { writeStepSummary } from "./node/step-summary.js";
import { almanacWidget } from "./widgets/almanac/index.js";
import { editorialStatCardWidget } from "./widgets/editorial-stat-card/index.js";
import { mastheadWidget } from "./widgets/masthead/index.js";
import { theGraveyardWidget } from "./widgets/the-graveyard/index.js";

/**
 * The GitHub Action's real entry point (`action.yml`'s `main: dist/index.js`,
 * bundled from this file). Mirrors `src/cli.ts`'s read -> validate -> render
 * -> write shape exactly (Plan 04's "Next Phase Readiness" note), swapping
 * only the input source (Action `inputs`, not `argv`) and the output
 * destination (a force-orphan push to `output` plus `GITHUB_STEP_SUMMARY`,
 * not local files). Renders through the SAME `core/pipeline.ts`
 * `renderAllCards()` `src/cli.ts` calls — this file never reimplements any
 * part of registry lookup, `renderPair`, or size-guard logic.
 */
async function run(): Promise<void> {
  // T-01-10 / must_haves: setSecret() must run immediately after reading the
  // token, before ANY string (including the eventual git remote URL) is
  // built from it. Nothing between this line and the token's first use may
  // construct such a string.
  const token = core.getInput("github-token", { required: true });
  core.setSecret(token);

  const configPath = core.getInput("config-path") || "widgets.yml";

  // See node/fonts.ts's loadAllFonts() doc comment: this action's own
  // `assets/fonts/` lives beside THIS module's own file (`src/action-entry.ts`
  // when run directly, `dist/index.js` when run as the real bundled Action),
  // one directory level below the repo root in both cases — never relative
  // to `process.cwd()`, which is the CONSUMER's checked-out workspace during
  // a real run, not this repo.
  const actionRepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  loadAllFonts(actionRepoRoot);
  register(almanacWidget);
  register(editorialStatCardWidget);
  register(mastheadWidget);
  register(theGraveyardWidget);

  // GitHub Actions guarantees GITHUB_REPOSITORY correctly names the repo the
  // current workflow run belongs to (RESEARCH.md's Security Domain
  // analysis) — T-01-11's mitigation for "force-push targets the wrong
  // repo" rests on reading it directly, never accepting an override input.
  // Read here (moved up from just-before-publish in Phase 1): the shared
  // fetch below needs `owner` (the repo-owner segment) as its `login`
  // argument, and that fetch now happens well before publish.
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    core.setFailed("GITHUB_REPOSITORY is not set — refusing to publish without a known target.");
    return;
  }
  const owner = repo.split("/")[0];

  const yamlText = existsSync(configPath) ? readFileSync(configPath, "utf8") : undefined;

  let config;
  let usedDefault: boolean;
  let equivalentYaml: string;
  try {
    ({ config, usedDefault, equivalentYaml } = loadConfigOrDefault(yamlText));
  } catch (error) {
    // D-12: report every problem at once. `core.setFailed` marks the run
    // failed WITHOUT publishing anything — an invalid config must never
    // reach `publishOutputBranch`.
    if (error instanceof ConfigValidationError) {
      core.setFailed(formatConfigErrors(error.errors));
    } else {
      core.setFailed(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (usedDefault) {
    // D-11's transparency requirement, same honest "snapshot, not a live
    // preview" framing as `cli.ts`.
    core.info(
      `No ${configPath} found — this run used the built-in defaults. This is a snapshot of ` +
        `what just ran, right now; it will not keep updating on its own. Copy the YAML below ` +
        `into ${configPath} to make it your real, editable configuration:\n\n${equivalentYaml}`,
    );
  }

  let cards;
  try {
    cards = resolveCards(config);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
    return;
  }

  // The single shared GraphQL fetch (DATA-01/02). A failure here — including
  // a hit rate-limit (DATA-07) — must fail the WHOLE run before any card
  // renders or publishes: no `renderAllCards`/`publishOutputBranch` call
  // exists on this path, so a half-rendered/half-published state is not
  // structurally reachable.
  let data;
  let pointCost: number;
  try {
    ({ data, pointCost } = await fetchSharedData(cards, token, owner));
  } catch (error) {
    core.setFailed(formatFetchFailureMessage(error));
    return;
  }
  // D-04: dual-surface point-cost log, immediately after a successful fetch.
  logPointCost(pointCost);

  let renderedCards;
  try {
    renderedCards = renderAllCards(
      cards,
      data,
      { now: new Date(), seed: 0, language: config.language },
      resolveTheme(config.theme),
    );
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
    return;
  }

  if (renderedCards.length === 0) {
    core.warning(`${configPath} enables zero cards — nothing to render or publish.`);
    return;
  }

  // UI-SPEC "Degenerate States": any build failure must happen BEFORE
  // publish. Every card above has already rendered and passed both
  // size-guard layers inside `renderAllCards` — only now do we touch git.
  const files: Record<string, string> = {};
  for (const card of renderedCards) {
    files[`${card.id}-light.svg`] = card.light;
    files[`${card.id}-dark.svg`] = card.dark;
  }

  try {
    await publishOutputBranch(files, { token, repo });
  } catch (error) {
    // Without this, a push failure (e.g. Pitfall B2: a consumer's org has
    // locked default GITHUB_TOKEN permissions to read-only) crashes the
    // whole process with a raw Node stack trace in the Actions log instead
    // of a clean, actionable failure message — verified empirically: an
    // unhandled rejection here otherwise prints the full @actions/exec
    // internals stack, not something a non-expert adopter can act on.
    core.setFailed(
      `Failed to publish to the output branch: ${error instanceof Error ? error.message : String(error)}. ` +
        "If this is an org-owned repository, an admin may need to allow " +
        "Settings → Actions → General → Workflow permissions → Read and write permissions.",
    );
    return;
  }

  const repoName = repo.split("/")[1];
  for (const card of renderedCards) {
    const snippet = buildEmbedSnippet({
      id: card.id,
      title: card.title,
      desc: card.desc,
      owner,
      repo: repoName,
    });
    writeStepSummary(`### ${card.id}\n\n${snippet}\n`);
  }
}

await run();
