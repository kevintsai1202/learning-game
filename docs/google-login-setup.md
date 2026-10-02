# Google 快速登入：建立 OAuth 用戶端 ID

班級伺服器的「用 Google 登入」（家長與老師的備選登入）需要一個 Google OAuth 用戶端 ID。這一步要用你自己的 Google 帳號在 Google Cloud Console 建立，程式這邊沒辦法代勞。沒有設定時，遊戲照常運作，只是不會出現 Google 按鈕。

設計說明見 `docs/plans/online.md` 3.1 節。

## 會用到的資料

- 只要「用戶端 ID」（長得像 `1234567890-xxxx.apps.googleusercontent.com`）。它是公開的識別碼，不是密碼。
- **不需要用戶端密鑰（client secret）**：前端用 Google 的官方按鈕直接拿 ID token，伺服器用 Google 的公開金鑰驗證。
- 要求的權限只有 `openid`、`email`、`profile`（Google 歸類為非敏感權限，不需要送審）。

## 步驟

Google Cloud Console 的選單名稱偶爾會改，下面括號裡是舊名稱。

1. 打開 <https://console.cloud.google.com/>，建立一個專案（例如 `learning-island`）。
2. 左側選單「Google Auth Platform」（舊名「API 和服務 → OAuth 同意畫面」）→ 開始設定：
   - 應用程式名稱：`知識島大冒險`
   - 使用者支援電子郵件：你的 email
   - 目標對象：**外部**
   - 聯絡資訊：你的 email
3. 「目標對象」頁面：把發布狀態從「測試中」改成「**正式版**」。
   - 維持「測試中」的話，只有加進「測試使用者」名單的帳號能登入（上限 100 個）。
   - 只用 `openid`、`email`、`profile` 時改成正式版不必送 Google 審查。
4. 「用戶端」（舊名「憑證 → 建立憑證 → OAuth 用戶端 ID」）→ 建立用戶端：
   - 應用程式類型：**網頁應用程式**
   - 名稱：`知識島大冒險（網頁）`
   - **已授權的 JavaScript 來源**（只填網域，不要有路徑，結尾不要斜線）：
     - `https://kevintsai1202.github.io`（GitHub Pages 的正式網址）
     - `http://localhost:4183`（本機 `vite preview`）
     - `http://localhost:5173`（本機 `vite dev`）
   - 已授權的重新導向 URI：不用填（用彈出視窗登入）。
5. 建立後複製「用戶端 ID」。

## 設定到伺服器

用戶端 ID 只設定在班級伺服器，前端會從 `GET /api/config` 取得。

本機測試（PowerShell 7）：

```powershell
npm run server:build
$env:GOOGLE_CLIENT_ID = '貼上你的用戶端 ID'; npm run server:start
```

接著在瀏覽器打開 `http://localhost:4183`，在開發者工具的 Console 執行 `localStorage.setItem('learning-island-server-url', 'http://localhost:8787')` 後重新整理，班級畫面就會出現「使用 Google 帳戶登入」按鈕。

正式環境（Zeabur）：在伺服器服務的環境變數加上 `GOOGLE_CLIENT_ID`（P4 部署時一起設定）。

## 注意

- **正式環境絕不能設 `GOOGLE_TEST_JWKS` 與 `ALLOW_TEST_GOOGLE`**：這兩個是 e2e 的測試模式，會讓伺服器接受測試金鑰簽的 token。只設其中一個時伺服器會拒絕啟動。
- 換了網址（例如改用自己的網域）要回到第 4 步把新網址加進「已授權的 JavaScript 來源」，否則 Google 按鈕會顯示錯誤。
- 伺服器只存 Google 帳號的識別碼與 email，用途只有快速登入；畫面上的 email 會遮掉中間，老師看不到家長的 email。
