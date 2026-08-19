# 開發說明

[← 回到 README](../README.zh-TW.md)（English: [README.md](../README.md)）

需要 Node 24。

```bash
npm install
npm run build:fonts    # 子集化字型，產生 assets/fonts/*.subset.ttf
npm run preview        # 依 ./widgets.yml（或內建預設值）渲染到 .preview/
npm test
npm run build          # 用 ncc 打包 action 到 dist/
```

`npm run preview` 是最快的回饋迴圈：不需要推送、不需要等 workflow 跑完，直接在本機產出真正的
SVG 檔案，用瀏覽器打開就能看。

## 分層規則

`src/core/**` 與 `src/widgets/**` **完全不碰檔案系統**——沒有 `node:fs`、沒有 `node:path`、
沒有 `process`。所有磁碟 I/O 只存在於 `src/node/` 與兩個進入點：

- `src/cli.ts`——本機預覽
- `src/action-entry.ts`——GitHub Action

兩個進入點都經由同一支 `core/pipeline.ts` 的 `renderAllCards()` 渲染。這不是風格偏好，是為了讓
卡片在本機與在 CI 不可能長得不一樣——如果兩邊各自實作一次渲染流程，遲早會分岔。

## 新增一張卡片

完整、逐欄位對照真實源碼的步驟已搬到根目錄的
**[CONTRIBUTING.md](../CONTRIBUTING.md)**（英文，QA-03）——一張卡片就是一個新目錄 export 一個
`WidgetDefinition`，加上 `src/widgets/all.ts` 裡的一行註冊，不需要改動 `src/core/**` 任何檔案。
這裡不重複維護第二份步驟，避免兩處說法漂移。

## 新增一個主題

內建主題目錄刻意設限在四個：`editorial`、`dracula`、`nord`、`tokyonight`。這是固定的清單，不是
起點——新主題不透過對本 repo 提交 PR 加入，與上一節「新增一張卡片」歡迎貢獻的方式不同。

若真的需要自訂色板，那屬於消費端（使用這個 Action 的人）自行設定的範疇，前提是引擎未來支援這種
擴充方式；本 repo 不會為了單一使用者的配色需求收 PR。

## 約束

這些不是可以商量的實作細節，是瀏覽器與 GitHub 的行為：

- **不能有 `<text>`。** 以圖片形式載入的 SVG 不能載入字型，所有文字必須是路徑。
  請用 `core/font.ts` 的 `textToPathData()`，那是唯一被允許呼叫 opentype.js 的地方。
- **不能有 `<script>`、外部字型、外部圖片、`<foreignObject>`。** SMIL `<animate>` 與內嵌的
  `@keyframes` CSS 可以用，**但只有 CSS 動畫會被 `prefers-reduced-motion` 的晶片層機制
  （`core/svg.ts` 的 `REDUCED_MOTION_STYLE`）自動停用** —— 任何新卡片的動畫一律用
  `@keyframes`，不要用 SMIL，否則會悄悄破壞 RENDER-06 的無障礙承諾。
- **必須遵守 `prefers-reduced-motion`。**
- **每個檔案 200KB 上限**，超過直接讓 build 失敗。

## 測試

```bash
npm test
npx vitest run src/core/config.test.ts    # 單一檔案
```

快照測試用固定的 `now` 值，所以輸出是逐位元組決定性的。改動渲染邏輯後快照會變——請**打開產出的
SVG 看過**再更新快照，不要盲目 `--update`。

## 測試覆蓋率

```bash
npm run test:coverage    # 等同 vitest run --coverage
```

`vitest.config.ts` 的 `coverage.include` 涵蓋整個 `src/**/*.ts`，所以一個從沒被任何測試匯入過的
檔案，會以 0% 出現在報表裡，而不是從報表中直接消失（Vitest 4 的預設行為只回報「測試曾匯入過」的
檔案）。這個 `include` 是報表能不能找到真正沒測到的邏輯的關鍵，請不要為了「精簡設定」而移除。

**這個數字不是及格線。** 專案刻意不設任何覆蓋率門檻（沒有 `thresholds`），也不打算設。跑這份報表
的目的是找出「真的沒被測到」的錯誤路徑與邊界情況，不是把百分比推高——看到低分不代表哪裡有缺陷，
也請不要為了拉高數字寫沒有意義的填充測試。
