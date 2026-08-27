<h1 align="center">Readme-Atelier</h1>

<p align="center">Cards for your GitHub profile README.<br>
One config file, one Action — no fork, no server, no code.</p>

<p align="center">
  <sub><a href="README.zh-TW.md">繁體中文</a> · English</sub>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/preview-dark.svg">
    <img src="docs/preview-light.svg" width="495"
         alt="Almanac card: shows today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer auspicious/inauspicious reading derived from the 建除十二神 cycle.">
  </picture>
</p>

<p align="center"><sub>Almanac · light and dark follow the reader's system theme</sub></p>

Each card is an independent SVG file, so you can embed just the one you want, or all five. A
GitHub Action renders every enabled card on a schedule and publishes the results to your
repository's `output` branch. Nothing runs at page-load time, so there is no service that can go
down and take your README with it.

## Live Catalog

<sub>The row below is not a screenshot — it is this repository's own live output. Every 6 hours
<a href="https://github.com/WayneLY-Chen/Readme-Atelier/actions"><code>cards.yml</code></a>
re-renders and publishes to the
<a href="https://github.com/WayneLY-Chen/Readme-Atelier/tree/output"><code>output</code></a>
branch, served from <code>raw.githubusercontent.com</code> — the exact same path any adopter's
embedded card takes, not GitHub's camo image proxy.</sub>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-record-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-record-light.svg?v=2" alt="The Record card: this year's contributions pressed into a vinyl record, one groove per week, thicker grooves for busier weeks, the needle resting on the current week; the record's surface texture rotates slowly, once every 24 seconds.">
  </picture>
</p>

<p align="center"><sub>The Record · the only card that moves. If your system has "reduce motion" turned on, it holds still — that is deliberate.</sub></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/masthead-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/masthead-light.svg?v=2" alt="Masthead card: a newspaper-style header row listing this page's enabled cards as a table of contents, plus one cited figure.">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/editorial-stat-card-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/editorial-stat-card-light.svg?v=2" alt="Editorial Stat Card: commits, PRs, issues, stars, and followers in magazine-style typography.">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-graveyard-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-graveyard-light.svg?v=2" alt="The Graveyard card: repositories gone stale, shown as tombstones with days since their last push.">
  </picture>
</p>

## Five-Minute Adoption

Four steps, no fork, no code. The [playground](https://waynely-chen.github.io/Readme-Atelier/)
generates steps 1 and 2 for you — type your username, pick your cards, copy the result — so this
walkthrough is here for anyone who prefers to read first or wants to understand what they're
pasting.

**1.** Save this as `.github/workflows/readme-atelier.yml` in the repository named exactly like
your GitHub username (your profile repository):

```yaml
name: readme-atelier
on:
  schedule:
    - cron: "0 */6 * * *"   # runs every 6 hours by default — edit this line to change the frequency
  workflow_dispatch:          # lets you trigger the first run manually, from the Actions tab
permissions:
  contents: write             # required — see "Organization Repositories" below if this repo belongs to an org
jobs:
  render:
    uses: WayneLY-Chen/Readme-Atelier/.github/workflows/render.yml@v1
```

**2.** Add `widgets.yml` to the same repository's root:

```yaml
language: en
timezone: Asia/Taipei

cards:
  - type: almanac
```

**3.** Open the **Actions** tab and run `readme-atelier` once manually (the `workflow_dispatch`
button) — don't wait for the first scheduled run.

**4.** Open that run's job summary. It prints a ready-to-paste `<picture>` snippet for every
enabled card — copy it straight into your README:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/<you>/<your-repo>/output/almanac-dark.svg?v=1">
  <img src="https://raw.githubusercontent.com/<you>/<your-repo>/output/almanac-light.svg?v=1"
       alt="Almanac card: shows today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer auspicious/inauspicious reading.">
</picture>
```

That's it. The trailing `?v=1` is a manual cache-buster — bump it any time you want to force a
refresh past caching, yours or a reader's browser.

## Try the Playground

The [**playground**](https://waynely-chen.github.io/Readme-Atelier/) renders every card live in
your browser, using the exact same rendering code this repository ships to production — not a
mockup. Pick a theme and language, type any username, and it hands you all three adoption
artifacts at once: the workflow file from step 1, a matching `widgets.yml`, and the `<picture>`
embed snippet from step 4 — the same snippet shape the Action itself prints, generated without
pushing anything or waiting for a run.

## Cards

| Name | What it shows | Needs GitHub data |
|---|---|---|
| `almanac` | Today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer 宜/忌 reading derived from the 建除十二神 cycle | no |
| `editorial-stat-card` | commits, PRs, issues, stars, followers in magazine-style typography | yes |
| `the-graveyard` | Repositories gone stale, shown as tombstones with days since their last push | yes |
| `the-record` | This year's contributions pressed into a vinyl record — one groove per week, thicker for busier weeks, needle on the current week; the only card that animates | yes |
| `masthead` | A newspaper-style header row listing the other enabled cards' contents and one cited figure | yes |

The catalog is meant to grow — see [Contributing](#contributing).

## Configuration

`widgets.yml` is the only file you edit. Every field is optional; delete the file entirely and the
run uses built-in defaults, printing an equivalent copy of them to the log so you have something
real to start from.

| Field | Values | Default |
|---|---|---|
| `theme` | `editorial`, `dracula`, `nord`, `tokyonight` | `editorial` |
| `language` | `en`, `zh-TW` | `en` |
| `timezone` | any IANA name, e.g. `Asia/Taipei` | `UTC` |
| `cards[].type` | a card name | required |
| `cards[].id` | lowercase letters, digits, hyphen | falls back to `type` |
| `cards[].options` | per-card settings | — |

`language` is top-level only — it is never set per-card and never inferred from your profile;
writing `language` inside a card's `options` fails the run rather than being silently ignored.
`id` decides the output filenames (`<id>-light.svg` / `<id>-dark.svg`) and must be lowercase —
duplicate detection is case-sensitive, but on Windows and default-configured macOS
`Foo-light.svg` and `foo-light.svg` are the same file, so lowercase-only makes that collision
unrepresentable. A config mistake fails the run and reports **every** problem at once, with line
numbers and a suggestion, and nothing is written when validation fails — a broken config never
leaves a half-updated set of cards behind.

The **[full configuration reference](docs/configuration.md)** — every card's own options, the
exact validation error format, and Action input details — is maintained in Traditional Chinese;
the table above is this project's complete English coverage of the same fields.

## Organization Repositories

**Getting publish permissions right does not automatically fix cards that need live GitHub data.**
Permissions only govern *publishing* rendered cards to the `output` branch — a separate step from
*fetching* the profile data those cards render. By default the fetch queries whichever account
owns the repository, and GitHub's GraphQL API can only look up a **User**'s profile, never an
**Organization**'s. On an organization-owned repository the owner *is* the organization, so every
card beyond `almanac` (the only card needing zero live data) fails, even with permissions fully
correct:

> ✗ Failed to fetch live profile data from GitHub's GraphQL API
>   Could not resolve to a User with the login of '\<your-org\>'.
>   ...

Fix it with the optional `profile-login` input, naming the GitHub **user** whose profile the
cards should actually show:

```yaml
jobs:
  render:
    uses: WayneLY-Chen/Readme-Atelier/.github/workflows/render.yml@v1
    with:
      profile-login: <your-github-username>
```

Personal repositories never need this — the repository owner already is the right account, and
leaving `profile-login` unset keeps today's exact behavior.

Separately, new organization-owned repositories often set the default `GITHUB_TOKEN` permissions
to read-only, which blocks *publishing* even once the profile-login above is sorted out. That
default is a **starting point, not a ceiling** — GitHub's own docs put it this way: *"If the
default permissions for the `GITHUB_TOKEN` are restrictive, you may have to elevate the
permissions to allow some actions and commands to run successfully."* That is exactly what
step 1's template does by declaring `permissions: contents: write` in your own workflow file —
permissions can only be **downgraded**, never elevated, by a called reusable workflow, so this
declaration has to live in *your* file, not in `render.yml`.

If publish still fails after that, the real wall is usually your organization's **allowed-actions
policy** (Settings → Actions → General → Policies): when it is set to "Allow select actions and
reusable workflows," an org admin must add `WayneLY-Chen/Readme-Atelier` to the allow list. An org
can also disable Actions entirely.

If `permissions: contents: write` is simply missing from your file, the run fails and the Action's
own error message names the fix:

> Failed to publish to the output branch: [...]. If this is an org-owned repository, an admin may
> need to allow Settings → Actions → General → Workflow permissions → Read and write permissions.

## Scheduled Workflow Reliability

GitHub's own wording: *"In a public repository, scheduled workflows are automatically disabled
when no repository activity has occurred in 60 days."* If your cards stop updating, this is
usually why. Three documented remedies: the **Enable workflow** button on the Actions tab, running
`workflow_dispatch` manually, or simply pushing anything to the repository — any of these resets
the clock.

Scheduled runs only fire on your repository's **default branch**, and GitHub is explicit that
under high load "some queued jobs may be dropped" — so the 6-hour cron in step 1 is a frequency
expectation, not a guaranteed exact timetable. Failure notifications go to whoever last edited the
cron syntax in the workflow file; because that file lives in *your* repository, that is you.

**No auto-commit keepalive bot ships with this project.** If you want one anyway, the documented
optional pattern is a separate, unrelated scheduled workflow elsewhere in your account that makes
a trivial commit before the 60-day window closes — a deliberate choice you make, not something
this project does on your behalf. Every failure path in the Action calls `core.setFailed`, so a
broken run always shows red in the Actions tab and emails the owner — it never fails silently.

## Notes

- **Delivery path is `raw.githubusercontent.com`**, a GitHub-owned domain, not the camo image
  proxy GitHub uses for third-party image hosts. Its Content-Security-Policy
  (`default-src 'none'; style-src 'unsafe-inline'; sandbox`) is what actually governs whether
  animation and styling survive — verified against The Record's real rendered output.
- **Light and dark are separate files.** `prefers-color-scheme` inside an SVG is unreliable once
  proxied, so each card ships as a pair and `<picture>` does the switching.
- **Text is converted to paths.** An SVG loaded as an image cannot load fonts, so glyphs are
  embedded as path data at render time — the cost is file size (~80KB per card, capped at 200KB).
- **Accessibility.** Only the `<img alt>` reaches assistive technology when an SVG is referenced as
  an image — a `<title>` inside the SVG never does. The generated snippet carries a real
  description of the card; keep it when you paste.
- **Private contributions are never visible**, regardless of what scopes `GITHUB_TOKEN` is
  granted — GitHub's GraphQL API does not expose private-contribution content through
  `contributionsCollection`, even to the profile owner's own token. This is a limitation of the
  API itself.
- **Organization-owned repository contributions are counted by default**, matching what a
  viewer's own GitHub profile page shows for the same account; there is currently no option to
  exclude them.

## Contributing

Want to add a sixth card? See **[CONTRIBUTING.md](CONTRIBUTING.md)** — a new card is one new
directory plus one line in `src/widgets/all.ts`, no changes to the rendering engine.

## Development

See **[docs/development.md](docs/development.md)** for the local build/test loop.

## Licence

MIT © Wayne Chen

Bundled fonts (IBM Plex Mono, Source Serif 4, Noto Serif TC) are licensed under the SIL Open Font
License 1.1, which permits embedding subset outlines in redistributed documents.
