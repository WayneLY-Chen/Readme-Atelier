# Contributing a Card

The catalog is meant to grow. Adding a card is intentionally cheap: **one new directory, plus one
line in `src/widgets/all.ts`.** Nothing under `src/core/` needs to change, and no other entry
point (`src/action-entry.ts`, `src/cli.ts`, the playground) needs to know your card exists.

This document is the real, verified-against-source procedure — not an idealized version of it.
Every claim below was read out of this repository's actual code, not written from memory of how
it "should" work.

## 1. One directory: a `WidgetDefinition`

Create `src/widgets/<name>/index.ts` exporting a `WidgetDefinition` (the interface lives in
`src/core/registry.ts:33-62`). Use any of the five existing widgets as a template. Every field:

```ts
export const myWidget: WidgetDefinition<MyOptions> = {
  // Registry key. Must match the `type:` value a consumer writes in widgets.yml.
  name: "my-card",

  // Declares the slice of ProfileData this widget needs — drives the single
  // shared GraphQL fetch every enabled widget's `requires` gets unioned into.
  requires: [],

  // Static, not computed at render time.
  size: { width: 495, height: 220 },

  // Validates AND supplies defaults for this widget's block of widgets.yml.
  optionsSchema,

  // Accessibility metadata for the <title>/<desc> the core owns — this text
  // is what actually reaches assistive technology via the embed snippet's
  // <img alt>, not anything drawn inside the SVG.
  describe(data, opts) {
    return { title: "...", desc: "..." };
  },

  // Returns ONLY the inner markup — never a full <svg> root. The core owns
  // the <svg> shell, theme injection, and light/dark pairing.
  renderBody(data, theme, opts) {
    return `...`;
  },

  // Optional. Only implement this if another widget (currently just the
  // masthead) should be able to cite a figure your widget computes.
  // citableFacts?(data, opts) { ... },
};
```

**`optionsSchema` must call `.strict()`.** `core/config.ts` only validates that `options:` is a
mapping — it has no idea which keys your card actually accepts. Your schema is the only place a
typo in the consumer's `widgets.yml` gets caught. Without `.strict()`, a misspelled option key is
silently dropped: the card still renders, just not the way the user asked for.

## 2. Register it: one line in `src/widgets/all.ts`

```ts
// src/widgets/all.ts
import { myWidget } from "./my-card/index.js";

export function registerAllWidgets(): void {
  register(almanacWidget);
  // ...
  register(myWidget); // <- the one new line
}
```

`registerAllWidgets()` is the single registration list every composition root
(`src/action-entry.ts`, `src/cli.ts`, `scripts/build-uat-preview.ts`, and the playground) calls.
Before this file existed, the same `register(...)` calls were hand-copied into three separate
places; adding a card now costs exactly the two changes in this document, nothing more.

`register()` (`src/core/registry.ts:77-82`) throws `DuplicateWidgetError` if a name is already
taken — it never silently overwrites one widget with another. If your card's `name` collides with
an existing one, registration fails loudly at startup, not with one card quietly winning.

## 3. Glyph coverage

Any text your widget generates that is not from GitHub (labels, static prose, formatted numbers)
gets checked by `assertCoverage()` (`src/core/font.ts:177-187`) against the font's actual subset —
a character outside that subset throws `GlyphCoverageError` and fails the build, rather than
silently rendering a missing-glyph box.

If your card needs a character outside the existing subset, edit the character set in
`scripts/build-fonts.ts` (the Traditional Chinese subset is sourced from
`scripts/fixtures/moe-common-chars.txt`) and re-run:

```bash
npm run build:fonts
```

## 4. Animation rules

Only CSS `@keyframes` is allowed — never SMIL (`<animate>`, `<animateTransform>`,
`<animateMotion>`). `core/svg.ts`'s `REDUCED_MOTION_STYLE` — the mechanism that honors a viewer's
`prefers-reduced-motion` setting — only knows how to stop CSS animation. A SMIL-animated card would
render fine but silently ignore reduced-motion, breaking accessibility with no visible error.

The 200KB per-file size budget is enforced automatically by the build pipeline; you do not need to
check it yourself.

## 5. Tests

Snapshot tests pin a fixed `now` value and RNG seed so output is byte-for-byte deterministic. Run:

```bash
npm test
```

If your change updates an existing snapshot, open the regenerated SVG and actually look at it
before accepting the update — do not blindly re-run with `--update`.

## 6. Proposal gates

Before writing code for a brand-new card concept (not a fix to an existing one), it goes through
two gates:

- **Prior-art gate.** Search first. If an equivalent card already exists in the wider ecosystem,
  either find a genuinely different angle on the same idea or drop it. (`github-profile-summary-cards`
  shipping a "Productive time" heatmap that this project's own brief had assumed did not exist is
  the standing reminder for this gate.)
- **Drawing-board gate.** Sketch it before implementing it. If it does not look good once actually
  drawn, drop it. Concepts are cheap and a high attrition rate here is expected and healthy — that
  is what a candidate backlog is for.

## 7. Themes are closed

The built-in theme set is deliberately capped at four: `editorial`, `dracula`, `nord`,
`tokyonight`. This is a fixed list, not a growing one — **new themes are not accepted as PRs to
this repository**, unlike cards. `github-profile-summary-cards` reached 62 built-in themes and then
had to freeze all new-theme contributions as unmaintainable; this project caps the set up front
instead. If you need a custom palette, that is a consumer-side concern for whatever future
extension mechanism the engine may add — it is not something this repository's maintainers
review PRs for today.

---

Questions or a card idea you're not sure clears the prior-art gate? Open an issue before writing
code.
