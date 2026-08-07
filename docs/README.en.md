<h1 align="center">Readme-Atelier</h1>

<p align="center">Cards for your GitHub profile README.<br>
One config file, one Action, no fork and no server.</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="preview-dark.svg">
    <img src="preview-light.svg" width="495"
         alt="Almanac card: shows today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer auspicious/inauspicious reading derived from the 建除十二神 cycle.">
  </picture>
</p>

<p align="center"><sub>Almanac · light and dark follow the reader's system theme</sub></p>

Each card is an independent SVG file, so you can embed just the one you want. Cards are rendered by
a GitHub Action on a schedule and published to your repository's `output` branch. Nothing runs at
page-load time, so there is no service that can go down and take your README with it.

## Usage

**1.** Add `widgets.yml` to the root of your profile repository:

```yaml
language: en
timezone: Asia/Taipei

cards:
  - type: almanac
```

**2.** Add `.github/workflows/cards.yml`:

```yaml
name: cards

on:
  workflow_dispatch:
  schedule:
    - cron: "0 */6 * * *"

permissions:
  contents: write

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: WayneLY-Chen/Readme-Atelier@main
        with:
          github-token: ${{ github.token }}
```

**3.** Run it once from the **Actions** tab. The job summary prints a ready-to-paste `<picture>`
snippet — copy it into your README. You do not need to construct the URLs yourself.

## Cards

| Name | What it shows | Needs GitHub data |
|---|---|---|
| `almanac` | Today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer 宜/忌 reading derived from the 建除十二神 cycle | no |

The catalog is meant to grow.

## Configuration

Every field is optional. Delete `widgets.yml` entirely and the run uses built-in defaults, printing
an equivalent copy of them to the log so you have something real to start from.

| Field | Values | Default |
|---|---|---|
| `theme` | `editorial` | `editorial` |
| `language` | `en`, `zh-TW` | `en` |
| `timezone` | any IANA name, e.g. `Asia/Taipei` | `UTC` |
| `cards[].type` | a card name | required |
| `cards[].id` | lowercase letters, digits, hyphen | falls back to `type` |
| `cards[].options` | per-card settings | — |

**`language` is top-level only.** It is never set per-card and never inferred from your profile.
Writing `language` inside a card's `options` fails the run rather than being silently ignored.

**`id` decides the output filenames** (`<id>-light.svg` / `<id>-dark.svg`), so give a card an
explicit `id` when you use the same `type` twice:

```yaml
cards:
  - type: almanac                 # -> almanac-light.svg / almanac-dark.svg
  - type: almanac
    id: almanac-utc               # -> almanac-utc-light.svg / almanac-utc-dark.svg
    options:
      timezone: UTC
```

`id` allows lowercase letters, digits and hyphens only. That restriction is not fussiness:
duplicate detection is case-sensitive, so `id: Foo` and `id: foo` both validate as distinct cards —
but on Windows and default-configured macOS, `Foo-light.svg` and `foo-light.svg` are the *same
file*, and one card silently overwrites the other with no error. Forcing lowercase makes that
collision unrepresentable.

### When the config is wrong

A mistake fails the run and reports **every** problem at once, with line numbers, the offending
source line, and a suggestion — rather than making you fix one and discover the next. Nothing is
written when validation fails, so a broken config never leaves a half-updated set of cards behind
that looks like a successful run.

A leading UTF-8 BOM is stripped automatically, and mojibake is reported as "save the file as UTF-8"
rather than as a confusing schema error.

### Action inputs

| Input | Required | Default | Purpose |
|---|---|---|---|
| `github-token` | yes | — | Pass `${{ github.token }}`. No personal access token needed. |
| `config-path` | no | `widgets.yml` | Where your config lives. |

The workflow must grant `permissions: contents: write`, or the push to `output` returns 403.

## Notes

**Light and dark are separate files.** `prefers-color-scheme` inside an SVG is unreliable once
GitHub proxies the image, so each card ships as a pair and `<picture>` does the switching.

**Text is converted to paths.** An SVG loaded as an image cannot load fonts, so glyphs are embedded
as path data at render time. Cards look identical everywhere; the cost is file size (~80KB each,
capped at 200KB).

**Accessibility.** Only the `<img alt>` reaches assistive technology when an SVG is referenced as an
image — a `<title>` inside the SVG never does. The generated snippet carries a real description of
the card, so keep it when you paste.

**GitHub disables scheduled workflows after 60 days without repository activity.** If your cards
stop updating, that is usually why — open the Actions tab and re-enable the workflow.

**Images are served through GitHub's camo cache**, so a change can take a while to become visible.

## Development

See [development.md](development.md).

## Licence

MIT © Wayne Chen

Bundled fonts (IBM Plex Mono, Source Serif 4, Noto Serif TC) are licensed under the SIL Open Font
License 1.1, which permits embedding subset outlines in redistributed documents.
