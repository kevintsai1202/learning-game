# 知識島大冒險（learning-island）專案規範

給國小二年級的 3D 遊戲化學習網頁。決策背景見 `docs/decisions.md`。

## 技術棧

- Vite 8 + React 19 + TypeScript 7（Go 版 tsc）+ three 0.186 / @react-three/fiber 9 + zustand 5 + zod 4 + hanzi-writer 3
- 班級伺服器（線上版）：Node 24 + Hono 4 + PostgreSQL（測試用 PGlite），規範見 `server/CLAUDE.md`
- 測試：Vitest 5（`tests/`）、Playwright 1.63（`e2e/`，對 `vite preview` 的建置產物跑，同時啟動班級伺服器）

## 指令（PowerShell 7）

```powershell
npm install
npm run dev          # 開發伺服器
npm test             # 單元測試
npm run build        # 型別檢查 + 建置到 dist/
npx playwright test  # e2e（需先 build；班級伺服器由 playwright 自動打包啟動）
npm run server:build; npm run server:start   # 本機啟動班級伺服器（port 8787，PGlite 記憶體資料庫）
# 部署：合併到 main 並 push → GitHub Pages 與 Zeabur（班級伺服器＋同一份前端）都會自動部署；步驟與注意事項見 docs/deploy-zeabur.md
$env:E2E_SERVER_URL = 'https://learning-island.zeabur.app'; npx playwright test --config playwright.remote.config.ts e2e/realtime.spec.ts --grep-invert Google   # 對外部伺服器跑線上 e2e（再設 BASE_URL 就連前端也用外部的）
.\.venv\Scripts\python scripts\build-font.py   # 內容新增字之後重產注音字型子集
# 預錄語音（改了題目文字或 src/ui/lines.ts 之後；金鑰在 .env）
npx vitest run --config vitest.voice.config.ts                                  # 盤點要預錄的句子 → data-src/voice/inventory.json
node --env-file-if-exists=.env scripts/voice/generate.mjs 2>&1 | Tee-Object -FilePath logs\voice-generate.log   # 產生 public/audio/voice/
node --env-file-if-exists=.env scripts/voice/check.mjs 2>&1 | Tee-Object -FilePath logs\voice-check.log         # Whisper 聽寫抽查
node --env-file-if-exists=.env scripts/voice/variants.mjs   # 讀音修正：同一句做幾種寫法給使用者挑（清單在 data-src/voice/variants.json）
node scripts/voice/adopt.mjs "zh-TW|雨靴" 2                    # 把核可的版本設成正式音檔（先在 scripts/voice/rules.mjs 改好規則），再跑 generate.mjs
```

長時指令的輸出 tee 到 `logs/`（不進版控）。

## 目錄

- `src/core/` 型別與種子亂數；`src/engine/` 出題器與判題（純函式，必須有單元測試）
- `src/activities/` 活動定義（每科一個模組，`registry.ts` 匯總）
- `src/quiz/` 答題流程（`session.ts` 狀態機）、作答元件、題目附圖
- `src/writing/` 筆順描寫（Hanzi Writer、注音與字母的中心線字形）
- `src/world/` 3D 島嶼與舞台（R3F）；`src/ui/` DOM 介面
- `src/store/` 存檔（`save.ts` 純函式 + `useGame` store）、商品目錄（`catalog.ts`）、禮物目錄（`gifts.ts`）、自訂題庫、畫面狀態
- `src/online/` 線上版前端：操作套用（`ops.ts`，伺服器共用）、同步佇列（`sync.ts`）、同步迴圈、送禮與家長雲端角色的 API（`cloudSync.ts`）、狀態與排程（`useCloud.ts`）、即時連線（`realtimeClient.ts`）、禮物狀態（`useGifts.ts`）、大人帳號的登入狀態（`useAccount.ts`）、信裡驗證與重設連結的網址參數（`emailLinks.ts`）與帳號規則（`userRules.ts`，伺服器共用；`docs/plans/accounts.md`）
- `server/` 班級伺服器（另有 `server/CLAUDE.md`）；規格與分期在 `docs/plans/online.md`；部署在 Zeabur（`docs/deploy-zeabur.md`），正式網址 GitHub Pages 與 `learning-island.zeabur.app`
- `src/content/` 題庫格式（zod）、課綱代碼對照、資料來源清單
- `public/data/strokes/` 國字筆順資料（腳本產生）；`public/licenses/` 授權全文

## 規則

- 內容一律原創或使用已確認授權的開放資料；新增外部資料要登記 `src/content/sources.ts` 並放授權檔。
- 國字筆順只用台灣教育部標準的資料；缺字不得用中國大陸筆順資料替代。
- 文字一律放 DOM，不要用 three 的文字渲染（注音字型需要 IVS）。
- 要朗讀的固定句子放 `src/ui/lines.ts`，題目的朗讀文字一律經過 `src/quiz/spoken.ts`；預錄語音的盤點腳本靠這兩處收集句子。
- 每題要有 `indicators`（108 課綱代碼）與 `source`。
- `public/google794a0ce8bfe02629.html` 是 Google Search Console 的網域驗證檔（OAuth 品牌驗證要用），不能刪也不能改；`kevintsai1202.github.io` 儲存庫根目錄的同名檔案也一樣。
- e2e：`workers: 1`、SwiftShader 參數已設好；用 `window.__game`（ui、game、player、teleport、quiz、cloud、presence、realtime、presenceDemo、gifts）讀狀態與自動作答。多台裝置的測試用 `e2e/onlineDevice.ts` 開啟（3D 畫質設成低，否則軟體 WebGL 會把 CPU 吃滿）。e2e 的伺服器開著測試信箱（`TEST_MAIL_OUTBOX`），驗證與重設連結用 `onlineDevice.ts` 的 `mailsTo`／`linkIn` 讀。裝置紀錄出現 `net::ERR_NETWORK_CHANGED` 時，是開發機的網路變動（Wi-Fi 斷線、漫遊）讓 Chrome 中斷了請求，連 localhost 也一樣：先查 Windows 事件記錄（`Microsoft-Windows-NetworkProfile/Operational` 的 10000／10001、System 的 `Netwtw14`）對時間，單獨重跑該測試。
- 雲端角色的存檔只能透過「操作」改變（`src/online/ops.ts`），伺服器用同一份規則套用；`src/` 裡給伺服器 import 的模組不能 import 畫面、音訊、3D 的程式。
