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
     - `https://learning-island.zeabur.app`（班級伺服器同時提供的前端，學校擋 github.io 時用）
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

## 檢查來源有沒有設好

```powershell
node scripts/deploy/check-google-origins.mjs
```

打開兩個正式網址的老師登入畫面，看 Google 按鈕載不載得出來（不登入、不寫資料）：沒加進「已授權的 JavaScript 來源」的網址，Google 會回 403，主控台出現 `The given origin is not allowed for the given client ID`。Google 說設定改完要幾分鐘到幾小時才生效。

## 發布成正式版與品牌驗證（2026-10-03）

- 只用 `openid`、`email`、`profile` 時，發布成正式版不必先通過驗證；上傳了標誌、要在同意畫面顯示標誌與名稱，才需要通過「品牌驗證」（Google Auth Platform → 驗證中心）。
- 品牌頁：首頁 `https://kevintsai1202.github.io/learning-game/`、隱私權政策 `https://kevintsai1202.github.io/learning-game/privacy.html`、已授權網域 `kevintsai1202.github.io` 與 `learning-island.zeabur.app`（`github.io`、`zeabur.app` 都在 Public Suffix List 上，要填完整的子網域）。
- 首頁網域要在 Google Search Console 驗證擁有權，用 Cloud 專案擁有者的 Google 帳號：新增「網址前置字元」資源 `https://kevintsai1202.github.io/`，選「HTML 檔案」驗證，把 Google 給的 `google….html` 放到 `kevintsai1202.github.io` 儲存庫的根目錄。`learning-island.zeabur.app` 的驗證檔放這個專案的 `public/`（班級伺服器會放在網址根目錄）。驗證完要等 24 小時，再到驗證中心重新送審。
- 隱私權政策（`public/privacy.html`）要逐項寫清楚：收集哪些資料、用途、存放位置與保存期限、誰看得到、Google 使用者資料的取用與刪除，以及有限使用（Limited Use）聲明。第一次送審被退「內容不足」，之後改成中英文對照的版本；`e2e/privacy.spec.ts` 會檢查這些內容還在。
- 首頁的靜態 HTML（`index.html` 的 `#boot`）直接寫了遊戲名稱、說明與隱私權政策連結：Google 檢查首頁時不一定執行 JavaScript，標題畫面上的連結是 React 畫出來的。這段只在遊戲載入前看得到，React 掛載後就被取代（同一個 e2e 會檢查）。

## 注意

- **正式環境絕不能設 `GOOGLE_TEST_JWKS` 與 `ALLOW_TEST_GOOGLE`**：這兩個是 e2e 的測試模式，會讓伺服器接受測試金鑰簽的 token。只設其中一個時伺服器會拒絕啟動。
- 換了網址（例如改用自己的網域）要回到第 4 步把新網址加進「已授權的 JavaScript 來源」，否則 Google 按鈕會顯示錯誤。
- 伺服器只存 Google 帳號的識別碼與 email，用途只有快速登入；畫面上的 email 會遮掉中間，老師看不到家長的 email。
