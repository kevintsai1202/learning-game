# 班級伺服器（server/）規範

知識島線上版的後端：班級房間、孩子帳號、雲端存檔同步。規格與分期見 `docs/plans/online.md`。

## 技術

- Node 24 + Hono 4（`@hono/node-server`）；資料庫 PostgreSQL（`pg`），沒有 `DATABASE_URL` 時用 PGlite（測試、e2e、本機開發）
- 用 `vite build --ssr`（`server/vite.config.ts`）打包成 `server-dist/main.js`；套件不打包，執行時從 `node_modules` 載入
- 和前端共用 `src/` 的純模組：`src/store/save.ts`（存檔規則）、`src/online/ops.ts`（操作套用）、`src/online/protocol.ts`（HTTP 格式）、`src/store/catalog.ts`（價格）、`src/engine/check.ts`（計分）

## 指令（PowerShell 7）

```powershell
npm run server:build                     # 打包到 server-dist/
npm run server:start                     # 啟動（預設 port 8787，PGlite 記憶體資料庫）
npx vitest run tests/server tests/online # 伺服器與同步測試（PGlite）

# 用真正的 PostgreSQL 跑同一套測試（驗證 pg 轉接層與交易鎖定；每期收尾要跑一次）
docker run -d --name li-pg-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=island -p 55432:5432 postgres:17-alpine
$env:TEST_DATABASE_URL = 'postgres://postgres:test@localhost:55432/island'; npx vitest run tests/server tests/online; Remove-Item Env:TEST_DATABASE_URL
docker rm -f li-pg-test
```

## 環境變數

| 變數 | 用途 |
| --- | --- |
| `PORT` | 監聽埠，預設 8787 |
| `DATABASE_URL` | PostgreSQL 連線字串；沒有時用 PGlite |
| `PGLITE_DIR` | 沒有 `DATABASE_URL` 時，PGlite 存檔案的目錄；沒有就存記憶體（重啟清空） |
| `ALLOWED_ORIGINS` | 允許跨網域呼叫的前端網址，逗號分隔；預設 `http://localhost:5173,http://localhost:4183` |
| `GOOGLE_CLIENT_ID` | Google 快速登入（備選）的 OAuth 用戶端 ID；沒有就不開 Google 登入。建立方式見 `docs/google-login-setup.md` |
| `GOOGLE_TEST_JWKS`＋`ALLOW_TEST_GOOGLE=1` | **只給 e2e 用**的測試模式：用測試公鑰驗證 Google token。只設其中一個會拒絕啟動；正式環境絕不能設 |

## 規則

- **給伺服器 import 的 `src/` 模組必須是純邏輯**：不能 import 畫面、音訊、3D（three、react）的程式。改了之後看 `npm run server:build` 的產物，import 清單只能有 hono、pg、zod、jose、ws、node 內建模組與動態載入的 PGlite。
- **改 `src/store/save.ts` 的規則等於同時改伺服器**：`tests/online/ops.test.ts` 的對照測試確認「本機原本的路徑」與 `applyOp` 結果相同。
- 存檔只靠「操作」改變（`/api/ops`、之後的送禮），不要新增「整份上傳存檔」的 API：會蓋掉伺服器端的變更（例如收到的禮物）。
- 會讀後改的帳號資料一律在交易裡 `SELECT … FOR UPDATE`。PGlite 是單一連線測不出搶鎖，要用 Docker 的 PostgreSQL 驗證（`tests/server/sync.test.ts` 的並行測試拿掉列鎖就會失敗）。
- PGlite 轉接層自己排隊所有查詢；交易裡只能用 `tx.query`，在交易裡呼叫 `db.query` 會卡死。
- 資料表結構只往後加版本（`server/db.ts` 的 `MIGRATIONS`），不修改已發布的版本。
- 登入鎖定以「房間＋暱稱」計次（5 次鎖 5 分鐘），不用 IP：同一間教室共用對外 IP。IP 只擋大量請求（每分鐘 300 次）。
- 錯誤訊息用中文（前端直接顯示給大人看），格式 `{ error, code, retryAfter? }`。
- **即時連線**（`hub.ts` 不碰網路、`ws.ts` 掛在 `/ws`）：裝置送來的訊息一律用 `src/online/realtime.ts` 的 zod 格式驗證，格式錯就以 1008 斷線；第一則必須是 `hello`（權杖）；其他人看到的外觀一律經過 `equippedOf`，不轉發裝置送來的外觀；說話只收 `CHAT_PHRASES` 的 id。
- 伺服器只保證位置在島的圓形範圍內，不做障礙物碰撞（信任模型，見 `docs/plans/online.md` 第 5 節）。
- HTTP 路由在存檔改變、老師改設定、移除成員、重設密碼時呼叫 `onProfileChanged`／`onRoomChanged`／`onKick` 通知即時中樞（`main.ts` 串接）。
- Google 帳號只存 `sub` 與 email；回給前端的 email 一律遮罩（`maskEmail`），老師的 API 不回傳家長的 email。
- Google 登入的測試一律用程式產生的金鑰（`tests/server/googleKeys.ts`）或 `e2e/fixtures/google-test-key.json`，不要連到真正的 Google。
