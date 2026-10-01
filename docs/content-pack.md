# 自訂題庫格式（JSON）

家長或老師可以把題目整理成一個 JSON 檔，在「家長專區 → 自訂題庫」匯入。匯入後會出現在島上「挑戰塔」的「自訂題庫」分組。格式由 `src/content/schema.ts` 檢查，有錯會用中文列出哪一題、哪一欄有問題。

## 整份檔案

```json
{
  "format": "learning-island-pack",
  "version": 1,
  "title": "二年級國語第一課練習",
  "author": "王老師",
  "description": "第一課生字與造詞",
  "questions": [ ... ]
}
```

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| format | 是 | 固定為 `learning-island-pack` |
| version | 是 | 固定為 `1` |
| title | 是 | 題庫名稱（60 字內），會顯示在挑戰塔 |
| author、description | 否 | 作者、說明 |
| questions | 是 | 題目陣列，1～2000 題 |

## 每一題的共同欄位

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| id | 是 | 題目代號，同一個題庫裡不要重複（錯題本靠它追蹤） |
| subject | 是 | `zh` 國語、`math` 數學、`en` 英語、`life` 生活與健康 |
| skill | 是 | 技能代號，自訂題可寫 `zh.custom` 之類 |
| indicators | 是 | 108 課綱代碼陣列，例如 `["N-2-2"]`；不知道可以給空陣列 `[]` |
| type | 是 | 題型，見下表 |
| prompt | 是 | 題目文字 |
| speak | 否 | 朗讀用文字（題目有符號或 emoji 時建議填） |
| speakLang | 否 | `zh-TW`（預設）或 `en-US` |
| explain | 否 | 答錯兩次後顯示的解說 |
| source | 否 | 題目出處 |
| visual | 否 | 附圖，見最後一節 |

## 題型

| type | 額外欄位 | 範例 |
| --- | --- | --- |
| `choice` 單選 | `options`：2～6 個選項，每個至少有 `text`、`emoji` 或 `shape`；`answer`：正確選項的索引（從 0 開始） | `{"type":"choice","prompt":"「山」的部首是？","options":[{"text":"山"},{"text":"口"}],"answer":0}` |
| `number` 數字 | `answer`：數字；`unit`：單位（可省略） | `{"type":"number","prompt":"125 + 38 = ?","answer":163}` |
| `order` 排順序 | `tokens`：打散的詞卡；`answer`：正確順序（內容要和 tokens 一樣） | `{"type":"order","prompt":"排成句子","tokens":["上學","我"],"answer":["我","上學"]}` |
| `clock` 撥時鐘 | `hour`（1～12）、`minute`、`step`（分針一格幾分鐘） | `{"type":"clock","prompt":"撥到 3 點半","hour":3,"minute":30,"step":5}` |
| `money` 付錢 | `amount`：金額；`denominations`：可用面額 | `{"type":"money","prompt":"拿出 65 元","amount":65,"denominations":[1,5,10,50]}` |
| `write` 描寫 | `target`：要寫的字；`script`：`hanzi` 國字、`zhuyin` 注音、`latin` 英文字母 | `{"type":"write","prompt":"寫寫看","target":"山","script":"hanzi"}` |

`write` 題只有系統內建筆順資料的字才能寫（國字依教育部筆順），其他字會顯示「筆順資料還沒準備好」。

## 附圖 visual

| kind | 欄位 | 用途 |
| --- | --- | --- |
| `emoji` | `emoji`、`count`、`groups`（可省略） | 例如 3 盤、每盤 4 顆蘋果 |
| `clock` | `hour`、`minute` | 顯示時鐘 |
| `vertical` | `a`、`b`、`op`（`+`、`-`、`×`） | 直式算式 |
| `money` | `items`：面額陣列 | 一把錢 |
| `ruler` | `start`、`end`、`item`（emoji） | 用尺量長度 |
| `fraction` | `parts`、`shaded`、`shape`（`pizza`、`bar`） | 等分圖 |
| `shape` | `shape`：triangle、square、rectangle、circle、cube、cuboid、cylinder、cone、sphere | 圖形 |
| `bigtext` | `text` | 大字（國字、注音、字母） |
| `chart` | `rows`：`[{label, emoji, count}]` | 圖畫統計表 |
| `calendar` | `year`、`month`、`highlight`（可省略） | 月曆 |

## 注意

- 題目請自己出，或使用你有權使用的內容；不要整份照抄出版社教科書。
- 題庫存在這台裝置的瀏覽器，換裝置要重新匯入。
- 新出現的國字不會有注音（注音字型只包含系統內建內容用到的字）。
