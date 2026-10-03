# 部署班級伺服器到 Zeabur（神奇網路）

前端照樣放 GitHub Pages；這份文件只處理**班級伺服器**（`server/`）與它的 PostgreSQL。
伺服器跑在你註冊到 Zeabur 的「神奇網路」裝置上，網路上的孩子經由閘道器（有公開 IP 的那台伺服器）連進來。

前提：已經有 Zeabur 帳號、神奇網路裝置已註冊、閘道器已開啟。

## 1. 建專案、加 PostgreSQL（2026-10-03 已用 Zeabur CLI 完成）

```powershell
npx zeabur@latest server list -i=false                                     # 找神奇網路伺服器的 ID
npx zeabur@latest project create -n "learning-island" -r "server-<伺服器 ID>" -i=false --json
npx zeabur@latest template search postgresql -i=false                      # 官方 PostgreSQL 範本代碼 B20CX0
npx zeabur@latest template deploy -i=false -c B20CX0 --project-id <專案 ID>
```

專案、服務的 ID 記在 `server/CLAUDE.md` 的「Zeabur 部署」。

## 2. 部署班級伺服器（從 GitHub 部署，push main 自動更新）

```powershell
npx zeabur@latest service search-repo learning-game --json -i=false      # 找儲存庫 ID（1399563645）
npx zeabur@latest service deploy --json -i=false --project-id <專案 ID> --template GIT --repo-id 1399563645 --branch-name main --name island-server
```

- 要先讓 Zeabur 的 GitHub App 存取這個儲存庫（https://github.com/apps/zeabur/installations/new → 選 `learning-game`），`search-repo` 才找得到。
- Zeabur 每次 push main 都會重新 clone、照根目錄的 `Dockerfile` 建置（同時建伺服器與前端）。GitHub Pages 也是 push main 部署，兩邊永遠是同一份程式。
- 一開始用過 CLI 直接上傳（`npx zeabur@latest deploy`），伺服器加前端與音檔約 50 MB，上傳超過 CLI 的時限（`failed to prepare upload … Client.Timeout exceeded`，重試也一樣），所以改成從 GitHub 部署。
- 神奇網路裝置是 arm64（Mac mini、樹莓派）時，確認建出來的映像檔架構相符；套件都是純 JavaScript，沒有原生模組。

## 3. 環境變數（已用 `variable env -f` 設好）

用 CLI 設的話要用 `npx zeabur@latest variable env --id <服務 ID> -f <檔案>`（會取代該服務全部變數，之後要 `service restart`）：`variable create -k` 會把含逗號的值與 `${…}` 引用切壞。檔案用完要刪掉（裡面沒有密碼，但習慣上不留）。

| 變數 | 值 |
| --- | --- |
| `DATABASE_URL` | `${POSTGRES_CONNECTION_STRING}`（引用同專案 PostgreSQL 的連線字串） |
| `ALLOWED_ORIGINS` | 正式：`https://kevintsai1202.github.io,https://learning-island.zeabur.app`（伺服器同時提供前端，同網址的 WebSocket 也會檢查來源）；對正式伺服器跑 e2e 時暫時加 `,http://localhost:4183`，跑完要拿掉 |
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
3. 合併到 main 並 push 之後，Zeabur 會自動重新部署伺服器（與它提供的前端）。

## 7. 交給孩子之前

1. `ALLOWED_ORIGINS` 改成 `https://kevintsai1202.github.io,https://learning-island.zeabur.app`（拿掉 `localhost`）。用 `variable env -f` 設的話，檔案要同時有 `DATABASE_URL`、`ALLOWED_ORIGINS`、`GOOGLE_CLIENT_ID` 三個（它會取代全部變數），之後 `service restart`。
2. 清掉測試建的房間與帳號（e2e 用的是很弱的測試密碼）：在 Zeabur 的 PostgreSQL 服務開資料庫主控台，執行

   ```sql
   TRUNCATE rooms CASCADE;
   ```

   房間清掉時，帳號、登入權杖、禮物、Google 綁定、同步紀錄都會一起清空；資料表結構保留。
3. Google OAuth：「已授權的 JavaScript 來源」要有 `https://kevintsai1202.github.io`，應用程式已發布為正式版。

## 8. 清掉測試資料

對正式伺服器跑過 e2e 之後，用腳本清掉測試房間（只挑管理密碼 `teach123` 的房間，真正的房間不會動）：

```powershell
.\scripts\deploy\purge-test-rooms.ps1           # 只列出
.\scripts\deploy\purge-test-rooms.ps1 -Apply    # 真的刪除（帳號、權杖、禮物、Google 綁定會跟著刪）
```

## 9. 注意事項

- **資料存在神奇網路裝置上**：裝置關機或斷網時，班級就連不上；裝置壞掉，資料就沒了。備份方式待決定（Zeabur 的資料庫備份功能，或在裝置上定期 `pg_dump`）。
- **防大量請求的限制**：建立房間、加入、登入每個 IP 每分鐘最多 300 次。伺服器取 `X-Forwarded-For` 的最後一個位址；經過閘道器時，所有孩子可能看起來是同一個位址，變成全班共用這 300 次。一個班級的登入量遠低於此。
- **兩個網址**：`https://kevintsai1202.github.io/learning-game/`（GitHub Pages，平常用）與 `https://learning-island.zeabur.app/`（班級伺服器同時提供的前端，學校網路擋 github.io 時用）。兩邊是同一份程式，資料都在班級伺服器，換網址登入同一個帳號就好。Google 登入要在 Google Console 的「已授權的 JavaScript 來源」加上兩個網址。
- **zeabur 網址只當備用**：前端素材（約 2.5 MB）經過「東京閘道器 → 家裡的神奇網路裝置」，實測同時下載時整體只有約每秒 450 KB（閘道器已經用 gzip 壓縮）。2026-10-03 對 zeabur 網址跑多台裝置的 e2e：只有 1～2 台時通過，同時開 2～3 個全新瀏覽器時，素材下載把路塞住，登入等 API 請求超過 15 秒時限而失敗；同一批測試改用 GitHub Pages 前端則全部通過。所以平常用 GitHub Pages，只有學校網路擋 github.io 時才用 zeabur 網址，而且避免全班在同一刻打開；大量使用時會連帶拖慢共用閘道器的班級功能。真的要靠它，就要把伺服器搬到頻寬足夠的主機。
- **動到同專案的其他服務之後要檢查網址**：2026-10-03 暫停舊的 `class-server` 服務後，`island-server` 照常在跑，`learning-island.zeabur.app` 卻全部回 502；到 `island-server` 的 Domains 分頁重新綁定網域就恢復。之後暫停、刪除或新增同專案的服務，做完都要照第 5 節的 1、2 項檢查。經由閘道器綁的網域，CLI 的 `domain list` 查不到，只能在後台看。
- **重新部署伺服器＝也重新部署 zeabur 網址的前端**：重啟時線上的孩子會斷線一下（會自動重連）。GitHub Pages 那一份由 push main 自動部署。
- **伺服器停機時**：GitHub Pages 網址照樣能單機玩（讀不到伺服器設定就不顯示班級功能），只是班級功能暫時用不了；zeabur 網址則整個打不開。
