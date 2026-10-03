# 部署班級伺服器到 Zeabur（神奇網路）

前端照樣放 GitHub Pages；這份文件只處理**班級伺服器**（`server/`）與它的 PostgreSQL。
伺服器跑在你註冊到 Zeabur 的「神奇網路」裝置上，網路上的孩子經由閘道器（有公開 IP 的那台伺服器）連進來。

前提：已經有 Zeabur 帳號、神奇網路裝置已註冊、閘道器已開啟。

## 1. 建專案、加 PostgreSQL

1. Zeabur 後台新增專案，伺服器選你的神奇網路裝置。
2. 專案裡「新增服務」→ 資料庫 → **PostgreSQL**。

## 2. 部署班級伺服器

1. 「新增服務」→ GitHub → 選 `kevintsai1202/learning-game`，分支選 **`feature/online`**（之後合併到 main，再改成 `main`，見第 6 步）。
2. Zeabur 會偵測到根目錄的 `Dockerfile`，用它建置（只包伺服器，不含前端與音檔）。
3. 神奇網路裝置是 arm64（Mac mini、樹莓派）時，確認 Zeabur 建出來的映像檔架構相符；套件都是純 JavaScript，沒有原生模組。

## 3. 環境變數（服務 → Variables）

| 變數 | 值 |
| --- | --- |
| `DATABASE_URL` | `${POSTGRES_CONNECTION_STRING}`（引用同專案 PostgreSQL 的連線字串） |
| `ALLOWED_ORIGINS` | `https://kevintsai1202.github.io,http://localhost:4183`（`localhost` 是測試用，第 7 步要拿掉） |
| `GOOGLE_CLIENT_ID` | 你的 Google OAuth 用戶端 ID（見 `docs/google-login-setup.md`） |

- **絕對不要設 `GOOGLE_TEST_JWKS`、`ALLOW_TEST_GOOGLE`**：那是 e2e 的測試模式，會接受測試金鑰簽的假 Google 登入。
- **沒設 `DATABASE_URL` 會啟動失敗，這是故意的**：正式的映像檔沒有記憶體資料庫，不會悄悄把孩子的進度存在記憶體裡、重開就不見。
- `PORT`（8080）與 `TZ`（`Asia/Taipei`，每日送禮上限與收禮日期依台灣時間）已經寫在 Dockerfile，不用設。

## 4. 綁網域

服務 → Networking → 綁定 `.zeabur.app` 子網域（例如 `learning-island.zeabur.app`），經由閘道器對外，HTTPS 自動處理。

## 5. 檢查

1. 瀏覽器打開 `https://<名稱>.zeabur.app/healthz`，看到 `{"ok":true}`。
2. 打開 `https://<名稱>.zeabur.app/api/config`，看到 `{"googleClientId":"…"}`（是你的用戶端 ID）。
3. 把網址告訴 Claude，它會先只跑「兩台裝置同島」的測試，確認即時連線（WebSocket）能穿過閘道器；通過後再跑其他線上測試：

   ```powershell
   npm run build
   $env:E2E_SERVER_URL = 'https://<名稱>.zeabur.app'
   npx playwright test --config playwright.remote.config.ts e2e/realtime.spec.ts --grep "兩台裝置"
   npx playwright test --config playwright.remote.config.ts e2e/realtime.spec.ts e2e/gifts.spec.ts e2e/online.spec.ts --grep-invert Google
   Remove-Item Env:E2E_SERVER_URL
   ```

   對正式伺服器**一定要加 `--grep-invert Google`**（Google 測試模式不能在正式環境打開，那一項測試跑不了）。
   如果即時連線穿不過閘道器（同島測試失敗、看不到別人），退路是把服務改放在有公開 IP 的伺服器上（例如閘道器那台）。

## 6. 正式網站開放班級功能（Claude 處理）

1. `.github/workflows/deploy.yml` 的建置步驟寫入 `VITE_SERVER_URL=https://<名稱>.zeabur.app`（伺服器網址是公開的，前端本來就看得到）。
2. 把 `feature/online` 合併到 `main` 並 push，GitHub Pages 自動部署，網站出現「班級登入」。
3. Zeabur 服務的分支改成 `main`。

## 7. 交給孩子之前

1. `ALLOWED_ORIGINS` 拿掉 `,http://localhost:4183`（存檔後 Zeabur 會重新部署）。
2. 清掉測試建的房間與帳號（e2e 用的是很弱的測試密碼）：在 Zeabur 的 PostgreSQL 服務開資料庫主控台，執行

   ```sql
   TRUNCATE rooms CASCADE;
   ```

   房間清掉時，帳號、登入權杖、禮物、Google 綁定、同步紀錄都會一起清空；資料表結構保留。
3. Google OAuth：「已授權的 JavaScript 來源」要有 `https://kevintsai1202.github.io`，應用程式已發布為正式版。

## 8. 注意事項

- **資料存在神奇網路裝置上**：裝置關機或斷網時，班級就連不上；裝置壞掉，資料就沒了。備份方式待決定（Zeabur 的資料庫備份功能，或在裝置上定期 `pg_dump`）。
- **防大量請求的限制**：建立房間、加入、登入每個 IP 每分鐘最多 300 次。伺服器取 `X-Forwarded-For` 的最後一個位址；經過閘道器時，所有孩子可能看起來是同一個位址，變成全班共用這 300 次。一個班級的登入量遠低於此。
- **更新**：push 到 Zeabur 追蹤的分支，就會自動重新建置與部署。
