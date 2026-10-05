# 班級伺服器（server/）規範

知識島線上版的後端：大人帳號（家長、老師）、班級、孩子帳號、雲端存檔同步。規格與分期見 `docs/plans/online.md`；大人帳號見 `docs/plans/accounts.md`。

## 技術

- Node 24 + Hono 4（`@hono/node-server`）；資料庫 PostgreSQL（`pg`），沒有 `DATABASE_URL` 時用 PGlite（測試、e2e、本機開發）
- 用 `vite build --ssr`（`server/vite.config.ts`）打包成 `server-dist/main.js`；套件不打包，執行時從 `node_modules` 載入
- 和前端共用 `src/` 的純模組：`src/store/save.ts`（存檔規則）、`src/online/ops.ts`（操作套用）、`src/online/protocol.ts`（HTTP 格式）、`src/online/userRules.ts`（帳號名稱、密碼、email 規則）、`src/store/catalog.ts`（價格）、`src/store/gifts.ts`（禮物目錄與收禮規則）、`src/store/puzzle.ts`（益智遊戲的金幣與每日上限）、`src/engine/check.ts`（計分）
- 路由：`app.ts`（孩子帳號、同步、老師的班級管理）、`users.ts`（大人帳號、刪除自己的帳號）、`email.ts`（驗證 email、忘記密碼與重設，A3）、`userGoogle.ts`（Google 快速登入綁大人帳號，A4）、`parents.ts`（家長的雲端角色）、`gifts.ts`（送禮物，也放「結清禮物」與「退出班級」的共用函式）；寄信在 `mail.ts`（nodemailer）；共用的 `ApiError`、`readBody` 在 `http.ts`

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
| `MAIL_SMTP_USERNAME`＋`MAIL_SMTP_PASSWORD` | 用 Gmail SMTP（`smtp.gmail.com:465`，TLS）寄驗證信與重設密碼信；`MAIL_SMTP_PASSWORD` 是應用程式密碼（空白會去掉）。只設一個或都沒設：不寄信（只設一個會警告） |
| `MAIL_FROM` | 寄件人的顯示；沒設是 `"知識島大冒險" <MAIL_SMTP_USERNAME>` |
| `TEST_MAIL_OUTBOX`＋`ALLOW_TEST_MAIL=1` | **只給 e2e 用**的測試信箱：信放在記憶體，`GET /api/test/mails` 讀得到。只設其中一個、或和 `MAIL_SMTP_USERNAME` 同時設會拒絕啟動；正式環境絕不能設 |
| `STATIC_DIR` | 前端建置產物（`dist/`）的目錄；設定時伺服器同時提供前端（Docker 映像檔設成 `/app/dist`）。本機開發與 e2e 不設 |

## 規則

- **給伺服器 import 的 `src/` 模組必須是純邏輯**：不能 import 畫面、音訊、3D（three、react）的程式。改了之後看 `npm run server:build` 的產物，import 清單只能有 hono、pg、zod、jose、ws、nodemailer、node 內建模組與動態載入的 PGlite。
- **改 `src/store/save.ts` 的規則等於同時改伺服器**：`tests/online/ops.test.ts` 的對照測試確認「本機原本的路徑」與 `applyOp` 結果相同。
- 存檔只靠「操作」（`/api/ops`）與送禮的路由改變，不要新增「整份上傳存檔」的 API：會蓋掉伺服器端的變更（例如收到的禮物）。
- 會讀後改的帳號資料一律在交易裡 `SELECT … FOR UPDATE`。PGlite 是單一連線測不出搶鎖，要用 Docker 的 PostgreSQL 驗證（`tests/server/sync.test.ts` 的並行測試拿掉列鎖就會失敗）。
- PGlite 轉接層自己排隊所有查詢；交易裡只能用 `tx.query`，在交易裡呼叫 `db.query` 會卡死。
- 資料表結構只往後加版本（`server/db.ts` 的 `MIGRATIONS`），不修改已發布的版本。
- 登入鎖定以「房間＋暱稱」（孩子）或「帳號名稱」（大人）計次（5 次鎖 5 分鐘），不用 IP：同一間教室共用對外 IP。IP 只擋大量請求（每分鐘 300 次）。
- **權杖兩種**（`tokens.ts` 的 `lookupToken` 回傳分型別）：孩子（雲端角色）與大人（`user_id`，不屬於班級）。改版前的老師權杖（kind `teacher`）一律視為無效。
  - 孩子權杖的「目前班級」從帳號讀（`accounts.room_code`，加入或退出班級立刻生效），`tokens.room_code` 只是保留寫入；`tokens.via` 記來源：`class`（孩子用班級代碼登入，例如學校平板）、`parent`（家長「在這台裝置玩」）。
  - `authenticate(c, 'kid')`：班級功能用，角色沒有班級時回 403 `no_class`（送禮、同學名單因此不用自己檢查）；`authenticateKidAny`：班級可以空，只給同步（`/api/ops`）、讀存檔（`/api/me`）與「帶權杖加入班級」用；`authenticateUser` 只收大人的。WebSocket 遇到沒有班級的角色：島嶼互訪 I1 起進他自己的島（改版前用 4004 `CLOSE_NO_CLASS` 關閉）。
- **家長的雲端角色與退出班級**（A2，`docs/plans/accounts.md` 第 6 節）：
  - 角色可以只有家長、沒有班級（`accounts` 的限制：班級與家長至少一個）；沒有班級就沒有孩子密碼。
  - 退出班級（老師移出家長名下的角色、家長讓孩子退出）用 `gifts.ts` 的 `settlePendingGifts`（收到與送出的未收禮物都退款，送出的標成看過）＋`detachFromClass`（班級與孩子密碼清空、刪掉 `class` 來源的權杖，家長裝置上的權杖留著）；沒有家長的純班級角色照舊刪除。
  - 老師重設孩子密碼只撤銷 `class` 來源的權杖，也只踢 `class` 來源的連線：中樞記每條連線的權杖來源（`JoinInfo.via`），`onKick(id, reason, 'class')`／`hub.kick(id, reason, via)`。移出、退出、刪除照舊全踢。
  - 收禮清單、送禮結果、收下與不用了都只算目前班級的禮物（`gifts.room_code`）：退出班級的交易在掃完禮物、鎖到帳號之前，同學剛好送出的那份會漏掉（真正的 PostgreSQL 才會發生），這種殘留的在新班級看不到也收不下，7 天後由 `expireGifts` 退款。
  - 老師移出成員（`removeMemberWithRefunds`）：交易開頭讀到的班級可能已經過期（家長讓他退出、又加入別的班級），結清禮物時鎖到帳號之後再確認一次，不是這個班的就丟出內部例外撤銷整個交易、回傳 null（路由回 404，不送撤銷前的退款通知）。老師只能移出自己班上的學生。
  - 存到雲端（`POST /api/parent/kids`）在交易裡先鎖家長的 `users` 列，再查重與新增：同時上傳同一個角色不會變成兩個分身。這個鎖只在這裡拿，期間只新增帳號、不鎖既有的帳號與禮物，和下面的鎖定順序不衝突。
  - 刪除角色、刪除自己的帳號：在交易裡結清禮物再刪，交易結束後才送通知，而且不送給被刪的角色（`parents.ts` 的 `emitExcept`）；還有班級的帳號不能刪（`has_classes`），因為刪掉老師帳號會連帶刪掉班上所有角色。
- **Email 驗證與忘記密碼**（A3，`email.ts`、`mail.ts`，`docs/plans/accounts.md` 第 7 節）：
  - email 只能綁一個帳號（`users` 的 `lower(email)` 唯一索引）；註冊與換 email 時查重回 409 `email_taken`，查重的寫法用 `WHERE lower(email) = lower($1)` 才吃得到索引。
  - 連結權杖只存雜湊（`email_tokens`），驗證 24 小時、重設 30 分鐘、只能用一次；帳號換了 email 之後，舊信裡的連結失效（比對權杖記的 email）。
  - 每個帳號每種信每分鐘 1 封、每天 10 封，用 `email_tokens` 計數（伺服器重啟也算數）。
  - 忘記密碼一律回同一句話：帳號不存在、email 沒驗證、被頻率限制，都照常回應但不寄、不建權杖；不等寄信完成就回應（權杖要在回應前寫進資料庫）。
  - 重設成功後刪掉這個帳號全部的權杖（所有裝置登出，包括正在重設的這台），並解除登入鎖定。
  - 信裡的連結指回前端送來的 `appUrl`，網域要在 `ALLOWED_ORIGINS` 裡，否則用 GitHub Pages 的網址（`email.ts` 的 `appBaseUrl`）。
  - 不寫「把信的內容印進記錄」的假寄信器：重設連結等於密碼。測試用 `TEST_MAIL_OUTBOX` 的記憶體信箱，或在 `createApp` 傳入寄信器。寄信失敗只回三種固定訊息，不轉出 SMTP 伺服器的回應（535 有時帶帳號），記錄只寫錯誤代碼。
  - 寄信一律在交易外；註冊與換 email 時寄不出去不擋請求，回應帶 `verifyMail`（`sent`／`failed`／`disabled`／`limited`），畫面提示可以重寄。
  - 會同時鎖帳號與連結權杖時，先鎖 `users` 再鎖 `email_tokens`（和刪除帳號時外鍵 CASCADE 的順序一樣）。
- **老師的 API**（`/api/teacher/rooms…`）：大人權杖＋老師身分（只有家長身分回 403 `not_teacher`）＋這個班級是他的；別人的班級和不存在的代碼一樣回 404 `no_room`，不透露代碼存在。改版前用管理密碼建的房間沒有擁有者（`owner_id` 是 null），目前沒有登入方式，上線前要看正式環境有沒有這種房間（`docs/plans/accounts.md` 的 A5）。
- 錯誤訊息用中文（前端直接顯示給大人看），格式 `{ error, code, retryAfter? }`。
- **即時連線**（`hub.ts` 不碰網路、`ws.ts` 掛在 `/ws`）：裝置送來的訊息一律用 `src/online/realtime.ts` 的 zod 格式驗證，格式錯就以 1008 斷線；第一則必須是 `hello`（權杖）；其他人看到的外觀一律經過 `equippedOf`，不轉發裝置送來的外觀；說話只收 `CHAT_PHRASES` 的 id。中樞以「島」為單位（班級島 `class:<代碼>`、自己的島 `kid:<帳號 id>`，`docs/plans/islands.md`）：移動、聊天、外觀只送同島的人；好友的在線狀態（只有在哪座島）送給朋友；全班的通知（`roomContent`、`roomSettings`）照帳號的班級送，不管在哪座島。
- 伺服器只保證位置在島的圓形範圍內，不做障礙物碰撞（信任模型，見 `docs/plans/online.md` 第 5 節）。
- HTTP 路由在存檔改變、老師改設定、移除成員、重設密碼時呼叫 `onProfileChanged`／`onRoomChanged`／`onRoomContent`／`onClassChanged`（加入班級，中樞以 4005 讓那個帳號重新上線）／`onKick` 通知即時中樞；老師成員表的在線與在哪裡來自 `isOnline`／`whereOf`（`main.ts` 串接；`onKick` 的第三個參數是只踢哪種權杖來源的連線）。
- **送禮物**（`gifts.ts`，規格見 `docs/plans/online.md` 第 7 節）：
  - 鎖定順序固定，避免真正的 PostgreSQL 互相等待：送禮只鎖帳號（送禮人與收禮人用一句 `WHERE id = ANY(…) ORDER BY id FOR UPDATE` 一起鎖）；收下、不用了、過期、移出成員先鎖禮物，再依 id 順序鎖帳號。新增會同時鎖禮物與帳號的路由也要照這個順序。
  - 交易裡不能丟 `ApiError` 卻期待前面的寫入保留（整個交易會撤銷）：例如收下過期的禮物，要先回傳結果讓退款提交，交易結束後再回 409。
  - 退款一律用 `gifts.price`（送出當時的價格），不查現在的目錄；退款與收下都要呼叫 `onProfileChanged`，禮物狀態有變的人呼叫 `onGift`（中樞送 `{ t: 'gift' }`）。
  - 禮物 id 由裝置產生，同一個送禮人重送同一個 id 回傳原本那份（不重複扣款）。
  - `main.ts` 啟動時與每小時跑 `expireGifts`（7 天沒收下就退款），關機時清掉計時器。
- **同時提供前端**（`static.ts`，只在 `STATIC_DIR` 有設時開）：註冊在所有路由之後，不蓋掉 `/api`；快取標頭在拿到回應之後補（`serveStatic` 的 `onFound` 在回應建立後才呼叫，那時設的標頭不會生效）。網頁與語音對照表不快取，`assets/` 與雜湊檔名的語音快取一年，其他一天。Docker 建置的前端用 `VITE_SERVER_URL=same-origin`（`src/online/config.ts` 的 `resolveServerUrl`），所以 `ALLOWED_ORIGINS` 要包含伺服器自己的網址（同網址的 WebSocket 也會送 Origin）。
- **Google 快速登入綁大人帳號**（A4，`userGoogle.ts`）：一個 Google 只能綁一個大人帳號（`user_google_links` 的主鍵是 `google_sub`），一個帳號可以綁多個。用 Google 登入只能登入已經綁定的帳號；用 Google 註冊時帳號名稱、密碼、身分照樣要設，email 用 Google 驗證過的（`GoogleIdentity.emailVerified`），算驗證過、不寄驗證信。驗證 token 的函式（`verifyGoogleToken`）在 `app.ts`，傳進路由模組共用。Google 的 token 猜不到，不用登入鎖定，只擋同一個 IP 的大量請求。孩子不綁 Google（「Google 綁孩子」與「Google 綁房間」的表在第 7 版拿掉）。
- Google 帳號只存 `sub` 與 email；回給前端的 email 一律遮罩（`maskEmail`）。
- Google 登入的測試一律用程式產生的金鑰（`tests/server/googleKeys.ts`）或 `e2e/fixtures/google-test-key.json`，不要連到真正的 Google。

## Zeabur 部署（2026-10-03）

- 專案 `learning-island`（ID `6ac070128ae74b28932b917f`），在神奇網路伺服器 `Wonder Mesh`（ID `69eeeb93f5343e60f36375c2`，新北市）上；對外經由閘道器（東京的騰訊雲伺服器）。
- 服務：`island-server`（ID `6ac096ec3eaaf9d7d3e1def7`，從 GitHub 的 main 部署，用根目錄 Dockerfile 建置伺服器與前端）、`postgresql`（ID `6ac071748ae74b28932b9226`，市集範本 `B20CX0`）。舊的 `class-server`（ID `6ac0724e3eaaf9d7d3e1d390`，CLI 直接上傳）已被取代，2026-10-03 暫停。
- 更新：合併到 main 並 push，Zeabur 自動重新建置與部署（GitHub Pages 同時部署）。直接上傳（`zeabur deploy`）約 50 MB 會超過 CLI 的上傳時限，不要再用。
- 紀錄：`npx zeabur@latest deployment log --service-id 6ac096ec3eaaf9d7d3e1def7 -t runtime -i=false`（建置紀錄用 `-t build`）。
- 環境變數用 `variable env -f <檔案>` 設（會取代全部變數）：`variable create -k` 會把含逗號的值（`ALLOWED_ORIGINS`）與 `${POSTGRES_CONNECTION_STRING}` 引用切壞。
- 網域只能在後台服務的 **Domains** 分頁綁：神奇網路伺服器上的服務要經由閘道器，CLI 的 `domain create` 會回 `WONDER_MESH_SERVER_REQUIRES_GATEWAY`，`domain list` 也查不到（顯示 No domains found），網域狀態只能在後台看。
- 暫停、刪除或新增同專案的服務之後，一定要再查正式網址的 `/healthz`：2026-10-03 暫停 `class-server` 後，`island-server` 照常在跑，正式網址卻全部回 502，在後台重新綁定網域後才恢復。
