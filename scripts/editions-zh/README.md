# 國語三版本生字資料的抓取腳本

產生 `src/content/editions/zh/{kanghsuan,nani,hanlin}.json`。研究過程與資料來源見 `docs/research/editions-zh.md`。

主要來源是教育部「教育百科」的生字詞彙表（依版本、學年度、年級分課列出生字、認讀字、語詞）。
第二來源（顏國雄老師公開的「各版本筆順練習」試算表）只用來交叉比對，可省略。

## 什麼時候要重跑

- 新學年度或新學期的生字公布後（例如 2027 年 2 月 115 學年度下學期），要把 `build-editions.mjs` 裡 `VOL` 的學期代碼改成新的（例如下學期 `114_2` 改 `115_2`）再重跑。
- 重跑後要再跑 `scripts/build-hanzi-data.py`（產生新字的筆順資料）與 `scripts/build-font.py`（注音字型子集）。

## 步驟（PowerShell 7，專案根目錄）

```powershell
New-Item -ItemType Directory -Force data-src/raw/editions-zh | Out-Null
Push-Location data-src/raw/editions-zh
# 1. 抓教育百科（可只抓指定學期，例如：node ../../../scripts/editions-zh/scrape-pedia.mjs 115_1,115_2）
node ../../../scripts/editions-zh/scrape-pedia.mjs
# 2. 檢查每課抓到的詞條數與頁面標示一致（沒有漏抓）
node ../../../scripts/editions-zh/verify-counts.mjs
# 3. 產生三個版本的 JSON（沒有 gsheets-parsed.json 時全部標 single-source）
node ../../../scripts/editions-zh/build-editions.mjs
Pop-Location
npx vitest run tests/content/editions-zh.test.ts
```

`build-editions.mjs` 內的 `MANUAL_NOTE` 是人工判讀過的差異說明，重抓新學年度時要重新檢查。
