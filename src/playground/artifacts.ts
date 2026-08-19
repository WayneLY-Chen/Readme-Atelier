import { buildEmbedSnippet } from "../core/embed-snippet.js";
import { configToYaml } from "../core/config.js";
import type { ResolvedConfig } from "../core/config.js";
import type { RenderedCard } from "../core/pipeline.js";

/**
 * D-05's three adoption artifacts, all built from canonical project code —
 * zero DOM, zero network I/O of any kind (this file is a pure function
 * layer; DOM wiring and event handling live in `main.ts`/`ui.ts`).
 *
 * ① `buildAdopterWorkflowYaml()` — a constant template, byte-identical to the
 *    block already shipped in `README.md`'s "Five-Minute Adoption" step 1
 *    (which is itself the single source of truth this artifact must never
 *    drift from — T-05-04-03 in 05-04-PLAN.md's threat model). It carries
 *    the real `render.yml@v1` contract this repo actually publishes
 *    (`.github/workflows/render.yml`), the default 6-hour cron, the
 *    `workflow_dispatch` manual trigger, and the `permissions: contents:
 *    write` line that (per D-08's platform fact) MUST live in the adopter's
 *    own file — the called reusable workflow cannot elevate it.
 *
 * ② `buildWidgetsYamlArtifact()` — composes a `ResolvedConfig`-equivalent
 *    object from the visitor's current checklist selection + theme, and
 *    serializes it through `core/config.ts`'s own `configToYaml` (never a
 *    hand-rolled YAML string) — the round trip through `parseConfig` is
 *    guaranteed by construction, not by convention.
 *
 * ③ `buildEmbedSnippetsArtifact()` — calls the canonical `buildEmbedSnippet()`
 *    once per rendered card, with `owner`/`repo` both set to the visitor's
 *    GitHub username (the profile-repo convention — a profile README lives
 *    at `github.com/<username>/<username>`). D-03's "one snippet shape, two
 *    delivery routes" is proven byte-for-byte by `artifacts.test.ts`.
 */

/**
 * ① The adopter workflow template. Kept as a single exported constant
 * string, not assembled from parts, so a diff against README.md's own copy
 * of this block is trivial to eyeball during review.
 */
export const ADOPTER_WORKFLOW_YAML = `name: readme-atelier
on:
  schedule:
    - cron: "0 */6 * * *"   # runs every 6 hours by default — edit this line to change the frequency
  workflow_dispatch:          # lets you trigger the first run manually, from the Actions tab
permissions:
  contents: write             # required — see "Organization Repositories" below if this repo belongs to an org
jobs:
  render:
    uses: WayneLY-Chen/Readme-Atelier/.github/workflows/render.yml@v1
`;

export function buildAdopterWorkflowYaml(): string {
  return ADOPTER_WORKFLOW_YAML;
}

/**
 * ② `cards` is a list of widget `type:` strings (the playground's checklist
 * order — Almanac → Editorial Stat Card → The Graveyard → The Record →
 * Masthead, per the checklist's own fixed order, D-05). An empty array is a
 * legal `widgets.yml` (`core/config.ts:90` has no `.min(1)`) and produces a
 * config with zero cards — the checklist's `empty` state, per UI-SPEC.
 */
export function buildWidgetsYamlArtifact(opts: { cards: string[]; theme: string }): string {
  const config: ResolvedConfig = {
    theme: opts.theme as ResolvedConfig["theme"],
    language: "en",
    timezone: "UTC",
    cards: opts.cards.map((type) => ({ type })),
  };
  return configToYaml(config);
}

/**
 * ③ `cards` are already-rendered cards (from the same `renderAllCards()`
 * call the preview uses) filtered down to the visitor's checklist selection,
 * in the checklist's fixed order. Each card contributes one `buildEmbedSnippet()`
 * call — `owner`/`repo` both set to `opts.username` (profile-repo
 * convention) — joined with a blank line between snippets so the artifact
 * reads as one paste-ready block covering every enabled card.
 */
export function buildEmbedSnippetsArtifact(opts: { username: string; cards: RenderedCard[] }): string {
  return opts.cards
    .map((card) =>
      buildEmbedSnippet({
        id: card.id,
        title: card.title,
        desc: card.desc,
        owner: opts.username,
        repo: opts.username,
      }),
    )
    .join("\n");
}
