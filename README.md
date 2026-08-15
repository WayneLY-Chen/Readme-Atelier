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

## 目錄現況

<sub>以下不是截圖，是這個 repo 對自己跑出來的即時輸出。每 6 小時由
<a href="https://github.com/WayneLY-Chen/Readme-Atelier/actions"><code>cards.yml</code></a>
重新算繪並發布到 <a href="https://github.com/WayneLY-Chen/Readme-Atelier/tree/output"><code>output</code></a>
分支，經 GitHub 的 camo 代理送到這裡——也就是任何人嵌進自己 README 時會走的同一條路徑。</sub>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-record-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-record-light.svg?v=2" alt="唱片卡：把今年到目前為止的貢獻壓成一張黑膠唱片，每一圈溝紋代表一週，溝紋越粗該週越忙，唱針停在本週；碟面紋理以 24 秒一圈緩慢旋轉。">
  </picture>
</p>

<p align="center"><sub>唱片 The Record ・ 唯一會動的一張。若你的系統開啟了「減少動態效果」，它會靜止——這是刻意的。</sub></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/masthead-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/masthead-light.svg?v=2" alt="刊頭卡：報頭樣式的標題列，列出本頁啟用的卡片目次與一則引用數據。">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/editorial-stat-card-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/editorial-stat-card-light.svg?v=2" alt="統計卡：以雜誌排版呈現 commits、PR、issues、stars、followers 五項數字。">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-graveyard-dark.svg?v=2">
    <img src="https://raw.githubusercontent.com/WayneLY-Chen/Readme-Atelier/output/the-graveyard-light.svg?v=2" alt="墓園卡：列出久未推送的儲存庫，以墓碑呈現其存活天數。">
  </picture>
</p>

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
