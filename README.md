<h1 align="center">Readme-Atelier</h1>

<p align="center">為你的 GitHub 個人檔案 README 產生卡片。<br>
一份設定檔、一個 Action，不用 fork、不用架伺服器。</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/preview-dark.svg">
    <img src="docs/preview-light.svg" width="495"
         alt="曆日卡片：顯示今日西曆日期、農曆月日、干支紀日，以及依建除十二神循環推算出的開發者宜／忌建議。">
  </picture>
</p>

<p align="center"><sub>曆日 Almanac ・ 淺色／深色跟著讀者的系統佈景切換</sub></p>

## 怎麼用

**1.** 在你的 profile repo 根目錄放一份 `widgets.yml`：

```yaml
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

**3.** 到 **Actions** 分頁跑一次。執行摘要會印出可以直接貼的 `<picture>` 片段，複製進你的 README 就完成了——不用自己拼網址。

## 卡片

| 名稱 | 內容 | 需要 GitHub 資料 |
|---|---|---|
| `almanac` | 今日西曆日期、農曆月日、干支紀日，以及依建除十二神推算的開發者宜／忌 | 否 |
| `editorial-stat-card` | 提交、PR、議題、星標、追蹤者五個統計數字，雜誌排版風格 | 是（需要 GitHub 資料） |

目錄會持續增加。

## 更多

- [完整設定說明](docs/configuration.md)——所有欄位、多張卡片、時區覆寫、錯誤訊息
- [English](docs/README.en.md)
- [開發說明](docs/development.md)

MIT © Wayne Chen
