# readme-atelier — 專案交接簡報 / Project Intake Brief

> 這份文件是專案啟動前的討論結論。開新 session 後請先讀這份，再執行 `/gsd-new-project`。
> 完成 GSD 初始化（產出 `.planning/PROJECT.md`）後，這個檔案就可以刪掉。

---

## 1. 專案目標

做一套 **開源的 GitHub Profile README 動態卡片引擎**：一個 repo 內含多張卡片（widget），由單一設定檔驅動，透過 GitHub Actions 定時產生 SVG 並發佈到 `output` 分支，任何人都能引用。

作者：Wayne Chen（GitHub: `WayneLY-Chen`）
授權：MIT（`LICENSE` 已建立）

---

## 2. 已鎖定的決策（不需要再問使用者）

| 項目 | 決定 |
|---|---|
| 技術棧 | **TypeScript + Node**（Node 24 / npm 11 已確認可用） |
| 測試 | Vitest |
| 第一版卡片 | 四張全做：Editorial Stat Card、Contribution Terrarium、Commit Rhythm、Language Constellation |
| 授權 | MIT |
| README | **中英雙語**（繁體中文 + English），要有完整的「別人怎麼用」教學 |
| 散佈方式 | 打包成可重用的 **GitHub Action**（`action.yml`），別人不用 fork |
| 專案位置 | `c:\Users\user\Desktop\程式\readme-atelier`（獨立 repo，已 `git init -b main`） |
| 資料路線 | **Actions 預先產生**（非 Vercel 伺服器即時算）— 零成本、零維運、不會因為別人的服務掛掉而失效 |

### 模型路由偏好（使用者明確要求）
- **規劃 / 思考類代理**（roadmapper、planner、researcher、plan-checker）→ 用 **Fable**
- **實作類代理**（executor、code-fixer）→ 用 **Opus 或 Sonnet**
- GSD 內建的 `model_profile` 沒有 Fable 這一階，需要在 `.planning/config.json` 用 `model_overrides` 針對個別 agent 指定。

---

## 3. 核心架構

**一個 repo = 一套共用引擎 + N 個卡片外掛，由一份 YAML 驅動。**

```
readme-atelier/
├── action.yml                     ★ 打包成 GitHub Action，別人加 10 行 workflow 就能用
├── widgets.yml                    ★ 使用者唯一要改的檔案：選卡片、選主題、選語言、選時區
├── src/
│   ├── core/
│   │   ├── fetch.ts               只打一次 GraphQL，所有卡片共用同一份資料
│   │   ├── model.ts               正規化的 ProfileData 型別
│   │   ├── svg.ts                 SVG 基礎元件、緩動函式、體積守衛
│   │   ├── pixel-font.ts          內嵌點陣字（GitHub 不讓載外部字型）
│   │   ├── theme.ts               主題系統
│   │   └── registry.ts            卡片外掛註冊
│   ├── widgets/
│   │   ├── stat-card/
│   │   ├── terrarium/
│   │   ├── rhythm/
│   │   └── constellation/
│   └── cli.ts                     本機預覽，不用 push 就能看
├── docs/                          GitHub Pages 遊樂場：線上選主題 → 複製貼上片段
├── tests/
└── .github/workflows/update.yml   ★ 一條 workflow 產出全部
```

**外掛介面（設計方向）**：每張卡片實作 `render(data: ProfileData, theme: Theme, opts): string`，回傳完整 SVG 字串。註冊到 registry 後即可在 `widgets.yml` 用名稱啟用。

---

## 4. 四張卡片規格

### 4.1 Editorial Stat Card 雜誌統計卡
取代第三方的 `github-readme-stats`。以排版為主體的雜誌風統計卡：總 commit、PR、issue、star、追蹤者。
設計語言要對齊使用者現有的 editorial banner（見第 6 節配色）。
**這是最實用的一張，優先度最高。**

### 4.2 Contribution Terrarium 貢獻生態瓶
一年的貢獻資料長成一個玻璃生態瓶：
- 連續天數（streak）→ 植株高度
- 語言分布 → 花的顏色
- 當日 commit 數 → 觸發昆蟲/粒子動畫
取代使用者 README 現有的「Contribution Garden」（目前是 platane/snk 貪食蛇）。

### 4.3 Commit Rhythm 作息節奏卡
24 小時 × 7 天的熱力圖，標示高產時段，附一句「夜貓型 / 晨型」判定。
**市面上沒有同類卡片，最有機會被 star。**
註：GitHub GraphQL 的 `contributionsCollection` 只給到「天」的粒度，小時級資料需要另外從 commit 的 `committedDate` 取得（`repository.defaultBranchRef.target.history`）— 這點在 research 階段要確認清楚，並注意時區換算與 API 配額。

### 4.4 Language Constellation 語言星圖
語言使用比例畫成星座圖，主星＝主力語言，有緩慢軌道動畫。視覺衝擊最強。

---

## 5. 技術限制清單（重要 — 這些是參考專案踩過或沒處理的坑）

1. **GitHub 會消毒 SVG** — `<script>` 會被移除，外部字型／外部圖片載不進來。
   → 動畫只能用 SVG 原生 `<animate>` (SMIL) 或**內嵌** `@keyframes` CSS；文字要嘛轉成 path，要嘛自刻點陣字。
2. **`prefers-color-scheme` 在 SVG 內部不可靠**（經過 GitHub camo 代理後）。
   → 必須各產一份 `-light.svg` / `-dark.svg`，README 用 `<picture>` + `<source media="(prefers-color-scheme: dark)">` 切換。
3. **Camo 圖片快取** — GitHub 會代理並快取所有外部圖片。
   → 引用網址要帶 cache-buster 參數（例如 `?v=1`）。
4. **排程 workflow 會自動停用** — repo 連續 60 天無活動時 GitHub 會停掉 scheduled workflow。
   → README 要提醒，並考慮提供 keepalive 機制。
5. **不要太頻繁跑 cron** — 參考專案有每 2 小時跑一次的，對免費 Actions 額度不友善。建議預設 **每 6 小時**，並開放使用者自訂。
6. **無障礙** — 每張 SVG 要有 `<title>` / `<desc>`（螢幕閱讀器），並支援 `prefers-reduced-motion`（前庭障礙使用者）。三個參考專案都沒做。
7. **體積預算** — 單檔目標 < 200KB。要有自動守衛，超標就讓 build 失敗。
8. **GraphQL 配額** — 一次抓取供所有卡片共用，不要每張卡片各打一次 API。
9. **不要預先產生所有組合** — 參考專案 3DPixelCalendar 把「多語系 × 多主題 × 多時區」的所有組合都預產成幾百個 SVG 檔塞進 repo。改用執行期參數解決。

---

## 6. 設計語言：editorial 主題（使用者的品牌配色）

內建主題之一必須是使用者現有 README 的配色，命名為 `editorial`：

| 用途 | 色碼 |
|---|---|
| 主色 / 強調 | `#8B5E3C`（暖棕） |
| 背景 | `#F7F1E7`（米白） |
| 邊框 / 次要 | `#CDBDA8`（淺褐） |
| 主文字 | `#302A25`（深褐黑） |
| 弱化文字 | `#6B5B4B` |

同時要提供對應的 dark 變體，以及至少一到兩組通用主題供他人使用。

---

## 7. 與參考專案的差異點（這是本專案的賣點，README 要講清楚）

參考對象：
- https://github.com/MikeYC-Wang/Bug-Zapper-Chill（Python，每 2 小時 cron，寫死主題）
- https://github.com/MikeYC-Wang/3DPixelCalendar（TS，預產生所有組合）
- https://github.com/MikeYC-Wang/WolverineCommit.Snake（TS + Vitest，發佈到 output 分支）

它們的共同問題：**是作者自己的玩具，不是別人能用的產品** —— 各自獨立 repo、重複的抓取邏輯、主題與使用者名稱寫死在程式碼裡、沒有測試、沒有無障礙處理。

本專案的四個決定性差異：
1. **可當 Action 直接引用** — 別人不用 fork、不用讀原始碼。
2. **一次抓取、多張渲染** — 省 API 配額與 Actions 分鐘數。
3. **主題即資料** — 設定檔驅動，不必改程式碼。
4. **無障礙 + 體積預算 + 測試** — 三個參考專案都沒有。

---

## 8. 已完成的事

- [x] `git init -b main`
- [x] `LICENSE`（MIT）
- [x] `.gitignore`
- [x] 本文件

尚未 commit，GSD 初始化時可一併處理。

---

## 9. 下一步

1. `/gsd-config` — 設定 model profile（並手動加上第 2 節的 `model_overrides`，規劃走 Fable）
2. `/gsd-new-project` — 產出 `.planning/PROJECT.md` 與 `ROADMAP.md`
3. 依 roadmap 逐階段 `/gsd-plan-phase` → `/gsd-execute-phase`

建議的階段切分方向（供 roadmapper 參考，非定案）：
核心引擎與資料層 → 主題與 SVG 基礎設施 → 四張卡片 → Action 打包與 workflow → 遊樂場與雙語文件。
