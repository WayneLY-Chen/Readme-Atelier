# 設定說明

[← 回到 README](../README.md)

`widgets.yml` 是你唯一需要修改的檔案，放在 repo 根目錄。

所有欄位都可以省略。整份檔案刪掉也能跑——此時會套用內建預設值，並把一份**等價的設定完整印在
執行 log 裡**，讓你有東西可以直接複製著改，不用從空白開始猜。

## 欄位

| 欄位 | 可用值 | 預設 |
|---|---|---|
| `theme` | `editorial` | `editorial` |
| `language` | `en`、`zh-TW` | `en` |
| `timezone` | 任何 IANA 時區名，例如 `Asia/Taipei` | `UTC` |
| `cards[].type` | 卡片名稱 | 必填 |
| `cards[].id` | 小寫英文字母、數字、連字號 | 未填則沿用 `type` |
| `cards[].options` | 各卡片自己的選項 | — |

完整範例：

```yaml
theme: editorial
language: zh-TW
timezone: Asia/Taipei

cards:
  - type: almanac
```

## `language` 只在最上層

`language` 不接受卡片層級覆寫，也不會從你的帳號自動推論。整份設定只有一個語言。

在某張卡片的 `options` 裡寫 `language` 會直接讓執行失敗並告訴你原因——不會默默被忽略。

## `id` 與輸出檔名

`id` 決定產出的檔名：`<id>-light.svg` 與 `<id>-dark.svg`。未指定時沿用 `type`。

所以同一個 `type` 用兩次時，必須給其中一張明確的 `id`，否則兩張會撞檔名：

```yaml
cards:
  - type: almanac                 # → almanac-light.svg / almanac-dark.svg
  - type: almanac
    id: almanac-utc               # → almanac-utc-light.svg / almanac-utc-dark.svg
    options:
      timezone: UTC
```

`id` 只允許**小寫**英文字母、數字與連字號。限制大小寫不是潔癖：重複偵測是區分大小寫的，所以
`id: Foo` 和 `id: foo` 會被視為兩張不同的卡片通過驗證——但在 Windows 與預設設定的 macOS 上，
`Foo-light.svg` 和 `foo-light.svg` 是**同一個檔案**，其中一張會靜默覆蓋另一張，而且不會有任何錯誤。
強制小寫讓這種碰撞根本無法表達出來。

## 卡片選項

每張卡片自己決定接受哪些選項。目前：

### `almanac`

| 選項 | 說明 | 預設 |
|---|---|---|
| `timezone` | 覆寫這張卡片的時區 | 沿用最上層的 `timezone` |

不認識的選項鍵會讓執行失敗並指名是哪個鍵，不會被默默丟掉。

## 設定寫錯時

`widgets.yml` 有問題會讓整次執行失敗，**一次列出所有問題**，而不是修好一個才發現下一個：

```
✗ widgets.yml 設定有誤（3 個問題）

  widgets.yml:6:9
      6 |     id: Bad_ID
                  ^^^^^^
  第 6 行的 id: "Bad_ID" 不符合規則——僅允許小寫英文字母、數字與連字號（-）。請全部改成小寫，例如 "bad-id"。

  widgets.yml:2:1
      2 | langauge: en
          ^^^^^^^^
  未知的設定鍵 "langauge"，頂層沒有這個欄位，請檢查是否為拼字錯誤

  widgets.yml:4:11
      4 |   - type: almanc
                    ^^^^^^
  未知的卡片類型 "almanc"
  可用：almanac
  你是不是要打 "almanac"？
```

驗證失敗時**不會寫出任何檔案**——不會留下半套更新看起來像是成功了。

檔案編碼也有防護：開頭的 UTF-8 BOM 會被自動去掉；如果偵測到亂碼字元，會直接告訴你「請另存為
UTF-8」，而不是丟一個看不懂的 schema 錯誤。

## Action 參數

| 參數 | 必填 | 預設 | 用途 |
|---|---|---|---|
| `github-token` | 是 | — | 傳 `${{ github.token }}` 即可，不需要個人存取權杖 |
| `config-path` | 否 | `widgets.yml` | 設定檔位置 |

workflow 必須給 `permissions: contents: write`，否則 action 推送到 `output` 分支時會拿到 403。

## 幾件值得知道的事

**淺色與深色是兩個檔案。** SVG 內部的 `prefers-color-scheme` 一旦經過 GitHub 的圖片代理就不可靠，
所以每張卡片成對輸出，由 `<picture>` 負責切換。

**文字全部轉成路徑。** 以圖片形式載入的 SVG 無法載入字型，所以字符在渲染當下就嵌成路徑資料。
卡片在任何地方看起來都一樣，代價是檔案大一些（每張約 80KB，上限 200KB）。

**無障礙。** SVG 被當成圖片引用時，只有 `<img alt>` 會傳到輔助科技——寫在 SVG 裡的 `<title>`
永遠不會。所以產生的片段帶有真正描述卡片內容的 alt 文字，貼上時請保留它。

**GitHub 會在 repo 連續 60 天沒有活動後停用排程工作流程。** 卡片突然不再更新通常就是這個原因，
到 Actions 分頁重新啟用即可。

**圖片經過 GitHub 的 camo 快取**，內容更新後可能要一段時間才看得到變化。
