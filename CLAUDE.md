# 知識島大冒險（learning-island）專案規範

給國小二年級的 3D 遊戲化學習網頁。決策背景見 `docs/decisions.md`。

## 技術棧

- Vite 8 + React 19 + TypeScript 7（Go 版 tsc）+ three 0.186 / @react-three/fiber 9 + zustand 5 + zod 4 + hanzi-writer 3
- 測試：Vitest 5（`tests/`）、Playwright 1.63（`e2e/`，對 `vite preview` 的建置產物跑）

## 指令（PowerShell 7）

```powershell
npm install
npm run dev          # 開發伺服器
npm test             # 單元測試
npm run build        # 型別檢查 + 建置到 dist/
npx playwright test  # e2e（需先 build）
.\.venv\Scripts\python scripts\build-font.py   # 內容新增字之後重產注音字型子集
# 預錄語音（改了題目文字或 src/ui/lines.ts 之後；金鑰在 .env）
npx vitest run --config vitest.voice.config.ts                                  # 盤點要預錄的句子 → data-src/voice/inventory.json
node --env-file-if-exists=.env scripts/voice/generate.mjs 2>&1 | Tee-Object -FilePath logs\voice-generate.log   # 產生 public/audio/voice/
node --env-file-if-exists=.env scripts/voice/check.mjs 2>&1 | Tee-Object -FilePath logs\voice-check.log         # Whisper 聽寫抽查
```

長時指令的輸出 tee 到 `logs/`（不進版控）。

## 目錄

- `src/core/` 型別與種子亂數；`src/engine/` 出題器與判題（純函式，必須有單元測試）
- `src/activities/` 活動定義（每科一個模組，`registry.ts` 匯總）
- `src/quiz/` 答題流程（`session.ts` 狀態機）、作答元件、題目附圖
- `src/writing/` 筆順描寫（Hanzi Writer、注音與字母的中心線字形）
- `src/world/` 3D 島嶼與舞台（R3F）；`src/ui/` DOM 介面
- `src/store/` 存檔（`save.ts` 純函式 + `useGame` store）、自訂題庫、畫面狀態
- `src/content/` 題庫格式（zod）、課綱代碼對照、資料來源清單
- `public/data/strokes/` 國字筆順資料（腳本產生）；`public/licenses/` 授權全文

## 規則

- 內容一律原創或使用已確認授權的開放資料；新增外部資料要登記 `src/content/sources.ts` 並放授權檔。
- 國字筆順只用台灣教育部標準的資料；缺字不得用中國大陸筆順資料替代。
- 文字一律放 DOM，不要用 three 的文字渲染（注音字型需要 IVS）。
- 要朗讀的固定句子放 `src/ui/lines.ts`，題目的朗讀文字一律經過 `src/quiz/spoken.ts`；預錄語音的盤點腳本靠這兩處收集句子。
- 每題要有 `indicators`（108 課綱代碼）與 `source`。
- e2e：`workers: 1`、SwiftShader 參數已設好；用 `window.__game`（ui、game、player、teleport、quiz）讀狀態與自動作答。
