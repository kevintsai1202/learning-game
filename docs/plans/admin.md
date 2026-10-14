# 營運者監控入口（admin）

> 狀態：2026-10-14 實作完成（伺服器、監控頁、匿名造訪、隱私權政策、單元與伺服器測試、e2e），**還沒上線**：要合併到 main 並在 Zeabur 設 `ADMIN_EMAILS`（使用者確認後）。
> 使用者的要求（2026-10-14）：針對軟體開發 admin 監控入口，只開放營運者本人的 Gmail（寫在 Zeabur 的環境變數 `ADMIN_EMAILS`，不進 repo）登入，可以看到所有使用人數與使用狀況。
> 使用者的決定（2026-10-14）：① 彙總之外也看得到每個帳號的明細（孩子的暱稱、大人遮罩過的 email），隱私權政策一起改；② 加匿名的造訪計數，單機版（沒有雲端帳號）的使用也算得到；③ 入口是獨立網址 `admin.html`，遊戲畫面不連過去，允許的 Gmail 寫在環境變數 `ADMIN_EMAILS`（email 不進公開的 repo）。

## 1. 登入

- 網址：`https://learning-island.zeabur.app/admin.html`（GitHub Pages 也會有這一頁，呼叫的是同一台伺服器）。
- 畫面只有 Google 登入按鈕（沿用 `src/ui/GoogleButton.tsx`）；拿到 ID token 送 `POST /api/admin/login`。
- 伺服器：`GOOGLE_CLIENT_ID` 與 `ADMIN_EMAILS` 都有設才開，否則 admin 的 API 一律 404 `admin_disabled`。驗證 Google token 後，email 必須是 Google 驗證過的（`emailVerified`）而且在 `ADMIN_EMAILS` 裡（不分大小寫、逗號分隔），否則 403 `not_admin`。
- 通過就發 admin 權杖（`tokens.kind = 'admin'`，8 小時，存雜湊；`room_code`、`account_id`、`user_id` 都是 null）；只由新的 `lookupAdminToken` 查，`lookupToken`（孩子、大人）看到 admin 權杖一律當無效，admin 權杖也不能用在其他 API。
- 前端把權杖放 `sessionStorage`（關掉分頁就登出）；401 時回到登入畫面。登出刪權杖。
- Google token 猜不到，不做登入鎖定；只擋同一個 IP 的大量請求（`checkFlood`）。

## 2. 看得到的內容

**只能看，不能改**：監控頁沒有刪除、重設、修改的動作（使用者要的是「看」；動作會讓一個 Google 帳號的風險變大）。

### 2.1 總覽（`GET /api/admin/overview`）

| 區塊 | 內容 | 資料來源 |
| --- | --- | --- |
| 人數 | 大人帳號（老師、家長、兩種都有）、孩子的雲端角色（有班級、只有家長）、班級 | `users`、`accounts`、`class_members`、`rooms` |
| 活躍 | 今天、近 7 天、近 30 天有上線的孩子與大人 | `accounts.last_seen`、`users.last_login` |
| 現在線上 | 連著即時中樞的孩子數、熊熊老師進島數 | `hub.ts`（新增 `stats()`，由 `main.ts` 傳進 `createApp`） |
| 每日趨勢（近 30 天） | 每天有作答的孩子數、回合數、題數、遊玩分鐘；匿名造訪的裝置數 | 回合與題數來自孩子存檔的 `history`（每個孩子只留最近 300 回合，玩得很多的孩子會少算，畫面註明是下限）；遊玩分鐘來自 `playLog`（每天的秒數，留 60 天）；`visits` |
| 科目分布（近 30 天） | 各科的回合數與題數 | 同上 |
| AI 用量 | 近 7 天每天 AI 出題的題數（`ai_usage` 只留 7 天）；近 30 天每天 AI 學習分析的次數，老師、孩子分開（`ai_reports` 留 30 天） | `ai_usage`、`ai_reports` |
| 匿名造訪 | 今天、近 7 天、近 30 天的不重複裝置數，依網址（GitHub Pages、Zeabur）分開 | `visits` |

日期一律用台灣時間（和 `ai_usage` 一樣）。

### 2.2 明細（`GET /api/admin/accounts`）

- 班級：名稱、代碼、老師帳號名稱、成員數、建立時間、最近有成員上線的時間、班級題庫包數。
- 孩子（雲端角色）：暱稱（存檔的名字）、所在班級、有沒有家長帳號、建立時間、最後上線、近 30 天的回合數與題數與遊玩分鐘、金幣。
- 大人帳號：帳號名稱、遮罩過的 email（`maskEmail`）、身分（老師／家長）、email 有沒有驗證、建立時間、最後登入、名下班級數與孩子數。不顯示有沒有綁 Google：隱私權政策第 4 節寫明 Google 使用者資料除了安全與法律要求不給人看。
- 每張表最多回 1000 列，依最近活動排序（目前正式環境遠少於這個數）。
- 不回：密碼雜湊、權杖、孩子密碼、完整 email、Google sub、存檔全文。email 一律用 `server/google.ts` 的 `maskEmail`；查詢不選 `password_hash`、`pin_hash`、`google_sub`，存檔只在伺服器裡算出數字。測試用「回應裡不能有這些鍵」的反向檢查。

## 3. 匿名造訪計數

- 日期由伺服器用台灣時間算，不用裝置送來的日期。

- 前端（`src/online/visit.ts`）：有設定班級伺服器時，每台裝置每天送一次 `POST /api/visit { device }`。`device` 是第一次開啟時產生的隨機 id（存在 localStorage，和角色、帳號無關），失敗不重試、不影響遊戲。
- 伺服器：只存 `visits(day, device_hash, host, first_at)`，`device_hash` 是 id 的 SHA-256；`host` 依 `Origin` 標頭分成 `pages`、`zeabur`、`other`。同一天同一台只算一次（主鍵 `day, device_hash`）。90 天後刪除（和其他每日清理同一個排程）。
- 不存 IP、User-Agent、角色或帳號；請求只擋大量（`checkFlood`）。
- 資料表第 17 版：`visits`。

## 4. 隱私權政策（`public/privacy.html`，中英文）

- 新增「匿名的造訪統計」：每台裝置每天一次的隨機識別碼（不能對應到人），用來估計使用人數，90 天刪除。
- 新增「營運者為了維運與排除問題，可以檢視帳號與使用狀況」：誰（只有營運者本人，登入限定）、看得到什麼（第 2.2 節）、看不到什麼（密碼、完整 email、存檔全文）。

## 5. 測試

- 單元：統計的純函式（存檔的 `history` 彙總成每日趨勢、科目分布、每個孩子近 30 天的數字；台灣日期；空資料）、造訪的「今天要不要送」判斷、`ADMIN_EMAILS` 的解析。
- 伺服器（PGlite）：admin 登入（不在清單的 Google 403、email 沒驗證 403、沒設 `ADMIN_EMAILS` 404、成功拿到權杖）；admin 權杖不能用在大人或孩子的 API、大人權杖不能用在 admin API；總覽與明細的數字對得上準備的資料、不含不該回的欄位；造訪同一天同一台只算一次、`host` 分類、90 天清理。
- e2e（`e2e/admin.spec.ts`）：伺服器設 `ADMIN_EMAILS` 為測試信箱；用 Google 測試按鈕登入看到總覽與明細；別的 Google 帳號被拒；孩子開遊戲後造訪數加一。

## 6. 文件與部署

- `server/CLAUDE.md` 的環境變數表加 `ADMIN_EMAILS`（有設 `ADMIN_EMAILS` 卻沒有 `GOOGLE_CLIENT_ID` 時拒絕啟動）；`docs/deploy-zeabur.md` 加設定步驟：**`variable env -f` 會取代全部變數**，要先匯出目前的全部變數、加上 `ADMIN_EMAILS`、整份重新上傳，否則正式站會少掉資料庫等變數而停擺。
- 上線要使用者確認：合併到 main 並 push、在 Zeabur 設 `ADMIN_EMAILS`。
