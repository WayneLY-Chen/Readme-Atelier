# Readme-Atelier

SVG cards for your GitHub profile README — one `widgets.yml`, one Action, no fork and no server.

Each card is an independent SVG file, so you can embed just the one you want. Cards are rendered
by a GitHub Action on a schedule and published to your repository's `output` branch; nothing runs
at page-load time, and there is no service that can go down and take your README with it.

繁體中文說明在[下方](#readme-atelier-繁體中文)。

> **Status:** early. One card is available today (Almanac) and the catalog is meant to grow. The
> rendering engine, config validation, theming, and the publish pipeline are in place and tested.

---

## Quick start

**1.** Add `widgets.yml` to the root of your profile repository:

```yaml
theme: editorial
language: en          # or zh-TW
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
  contents: write       # required — the action pushes to your `output` branch

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

A working pair of files lives in [`examples/consumer/`](examples/consumer/).

---

## Configuration

Every field is optional. Delete `widgets.yml` entirely and the run uses built-in defaults, printing
an equivalent copy of them to the log so you can start from something real.

| Field | Values | Default |
|---|---|---|
| `theme` | `editorial` | `editorial` |
| `language` | `en`, `zh-TW` | `en` |
| `timezone` | any IANA name, e.g. `Asia/Taipei` | `UTC` |
| `cards[].type` | a card name from the catalog below | — |
| `cards[].id` | lowercase letters, digits, hyphen | falls back to `type` |
| `cards[].options` | per-card settings (see the card) | — |

`language` is read from the top level only — it is never set per-card and never guessed from your
profile. `id` decides the output filenames (`<id>-light.svg` / `<id>-dark.svg`), so give a card an
explicit `id` when you use the same `type` twice:

```yaml
cards:
  - type: almanac                 # -> almanac-light.svg / almanac-dark.svg
  - type: almanac
    id: almanac-utc               # -> almanac-utc-light.svg / almanac-utc-dark.svg
    options:
      timezone: UTC
```

A mistake in `widgets.yml` fails the run and reports **every** problem at once, with line numbers
and a suggestion — it never silently ignores a key it does not recognise.

### Action inputs

| Input | Required | Default | Purpose |
|---|---|---|---|
| `github-token` | yes | — | Pass `${{ github.token }}`. No personal access token needed. |
| `config-path` | no | `widgets.yml` | Where your config lives. |

---

## Cards

| `type` | What it shows | Needs GitHub data |
|---|---|---|
| `almanac` | Today's Gregorian date, the lunar date, the sexagenary day pillar, and a developer 宜/忌 reading derived from the 建除十二神 cycle | no |

---

## Notes

- **Light and dark are separate files.** `prefers-color-scheme` inside an SVG is unreliable once
  GitHub proxies the image, so each card ships as a pair and the snippet uses `<picture>`.
- **Text is converted to paths.** An SVG loaded as an image cannot load fonts, so glyphs are
  embedded as path data at render time. Cards look identical everywhere.
- **Accessibility.** Only the `<img alt>` reaches assistive technology when an SVG is referenced as
  an image, so the generated snippet carries a real description of the card. Keep it when you paste.
- **GitHub disables scheduled workflows after 60 days without repository activity.** If your cards
  stop updating, that is usually why — open the Actions tab and re-enable the workflow.
- Images are served through GitHub's camo cache, so a change can take a while to become visible.

---

## Development

```bash
npm install
npm run build:fonts    # subset the fonts (writes assets/fonts/*.subset.ttf)
npm run preview        # render to .preview/ using ./widgets.yml, or defaults
npm test
npm run build          # bundle the action into dist/
```

`src/core/**` and `src/widgets/**` are deliberately free of filesystem access — all disk I/O lives
in `src/node/` and the two entry points (`src/cli.ts`, `src/action-entry.ts`). Both entry points
render through the same `renderAllCards()`, so a card cannot look different locally than it does in
CI.

---

## Licence

MIT © Wayne Chen

Bundled fonts (IBM Plex Mono, Source Serif 4, Noto Serif TC) are licensed under the
SIL Open Font License 1.1, which permits embedding subset outlines in redistributed documents.

---

# Readme-Atelier（繁體中文）

為你的 GitHub 個人檔案 README 產生 SVG 卡片——一份 `widgets.yml`、一個 Action，不用 fork、不用架伺服器。

每張卡片都是獨立的 SVG 檔案，你要哪張就嵌哪張。卡片由 GitHub Action 定期算好，發布到你自己 repo 的
`output` 分支；沒有任何東西在讀者開啟頁面時才運算，也就沒有哪個服務掛掉會連帶讓你的 README 破圖。

> **狀態：** 早期。目前只有一張卡片（曆日 Almanac），目錄會持續增加。渲染引擎、設定驗證、主題、
> 發布管線都已完成並有測試覆蓋。

## 快速開始

**1.** 在你 profile repo 根目錄放 `widgets.yml`：

```yaml
theme: editorial
language: zh-TW
timezone: Asia/Taipei

cards:
  - type: almanac
```

**2.** 加上 `.github/workflows/cards.yml`：

```yaml
name: cards

on:
  workflow_dispatch:
  schedule:
    - cron: "0 */6 * * *"

permissions:
  contents: write       # 必要——action 要推送到你的 output 分支

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: WayneLY-Chen/Readme-Atelier@main
        with:
          github-token: ${{ github.token }}
```

**3.** 到 **Actions** 分頁手動跑一次。執行摘要會直接印出可以貼的 `<picture>` 片段，複製進 README
即可——你不需要自己拼網址。

## 設定

所有欄位都可省略。整個 `widgets.yml` 刪掉也能跑，此時會套用內建預設值，並把一份等價的設定完整印在
log 裡，讓你有東西可以複製著改。

| 欄位 | 可用值 | 預設 |
|---|---|---|
| `theme` | `editorial` | `editorial` |
| `language` | `en`、`zh-TW` | `en` |
| `timezone` | 任何 IANA 時區名，例如 `Asia/Taipei` | `UTC` |
| `cards[].type` | 下方目錄裡的卡片名稱 | — |
| `cards[].id` | 小寫英文字母、數字、連字號 | 未填則沿用 `type` |
| `cards[].options` | 各卡片自己的選項 | — |

`language` 只讀最上層——不接受卡片層級覆寫，也不會從你的帳號自動推論。`id` 決定輸出檔名
（`<id>-light.svg` / `<id>-dark.svg`），所以同一個 `type` 用兩次時要給其中一張明確的 `id`。

`widgets.yml` 寫錯會讓整次執行失敗，並**一次列出所有問題**，附行號與修正建議——絕不會默默忽略它
看不懂的鍵。

## 卡片目錄

| `type` | 內容 | 需要 GitHub 資料 |
|---|---|---|
| `almanac` | 今日西曆日期、農曆月日、干支紀日，以及依建除十二神循環推算的開發者宜／忌 | 否 |

## 注意事項

- **淺色與深色是兩個檔案。** SVG 內的 `prefers-color-scheme` 一旦經過 GitHub 的圖片代理就不可靠，
  所以每張卡片成對輸出，並用 `<picture>` 切換。
- **文字全部轉成路徑。** 以圖片形式載入的 SVG 無法載入字型，因此字符在渲染時就嵌成路徑資料。
- **無障礙。** SVG 以圖片被引用時，只有 `<img alt>` 會傳達給輔助科技，所以產生的片段帶有真正描述
  卡片內容的 alt 文字，貼上時請保留。
- **GitHub 會在 repo 連續 60 天沒有活動後停用排程工作流程。** 卡片突然不更新通常就是這個原因，
  到 Actions 分頁重新啟用即可。
- 圖片經過 GitHub 的 camo 快取，內容變更後可能要一段時間才看得到。

## 授權

MIT © Wayne Chen

內附字型（IBM Plex Mono、Source Serif 4、Noto Serif TC）採用 SIL Open Font License 1.1 授權，
該授權明確允許將子集化的字型輪廓嵌入再散布的文件中。
