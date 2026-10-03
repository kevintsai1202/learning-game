# 線上版規劃：班級帳號、雲端存檔、多人同島、公頻聊天、送禮物

狀態：P1、P2、P3 已完成（2026-10-03，定案內容見 `docs/decisions.md`）；P4 部署開始前再跟使用者確認細節與費用。

## 1. 使用者確認的範圍（2026-10-02）

| 項目 | 決定 |
| --- | --- |
| 存檔 | 雲端存檔：登入後存在伺服器，換裝置接著玩；沒網路時照常玩，連上後再同步 |
| 聊天 | 只有預設短句＋表情，不能自由打字 |
| 房間與帳號 | 班級房間：老師／家長建立房間拿到代碼；孩子用「房間代碼＋暱稱＋4 位數密碼」登入，只會遇到同房間的人 |
| 後端 | 自建 Node 伺服器放 Zeabur；前端照樣放 GitHub Pages |
| 送禮物 | 用金幣買禮物送給同房間的朋友，對方按「收下」才成立；每天送禮有上限 |

現有的名字、成績、錯題本、錯題再挑戰都保留，只是多了「存到雲端」這條路。沒有登入班級的本機角色維持現在的行為。

## 2. 架構

```text
GitHub Pages（靜態前端）
   │  HTTPS：登入、同步存檔、送禮、老師管理
   │  WSS：位置、公頻聊天、禮物通知
   ▼
Zeabur：Node 24 伺服器（Hono HTTP + ws）── Zeabur PostgreSQL
```

- **伺服器與前端共用程式**：存檔規則（`src/store/save.ts`）、計分（`src/engine/check.ts` 的 `scoreSession`）、聊天短句（`src/ui/lines.ts`）、可走範圍（`src/world/layout.ts`）、商品目錄、通訊格式（zod）都放在 `src/` 的純模組，伺服器直接 import，兩邊規則一定相同。
  - 已驗證（2026-10-02 探針）：這幾個模組用 `vite build --ssr` 打包後只依賴 zod，不含 three、react，Node 24 可直接執行。之後新增給伺服器用的模組也要維持這個條件（不能 import 畫面、音訊、3D 的程式）。
- **單一 package.json**：伺服器程式在 `server/`，用 `vite build --ssr` 打包成一個檔（伺服器的 vite 設定要 `publicDir: false`，否則會把 `public/` 的音檔一起複製過去）；前端不會 import 伺服器的套件。伺服器自己的 `server/CLAUDE.md` 寫伺服器端規範。
- **資料庫用 PostgreSQL（使用者決定，2026-10-02；曾提議改 SQLite 省一個服務，使用者維持 PostgreSQL）**：
  - 正式環境：Zeabur 的 PostgreSQL 服務，伺服器用 `pg`（node-postgres）連線（`DATABASE_URL`）。
  - 單元測試、e2e、本機開發：沒有 `DATABASE_URL` 時改用 PGlite（`@electric-sql/pglite`，編譯成 WASM 的真 PostgreSQL，跑在同一個程序裡），不需要 Docker。
  - 兩者包在 `server/db.ts` 的同一個介面（`query`、`transaction`），SQL 只寫一份（`$1` 參數）。PGlite 不會載入正式環境（只在沒有 `DATABASE_URL` 時動態 import，屬於 devDependencies）。
  - 另外用 Docker 起真正的 PostgreSQL，設 `TEST_DATABASE_URL` 跑同一套伺服器測試，驗證 `pg` 轉接層與交易鎖定（`SELECT … FOR UPDATE`）。
- **伺服器網址**：建置時用 `VITE_SERVER_URL`（GitHub Actions 從 repo variable 帶入）；另外可以用 localStorage `learning-island-server-url` 覆蓋（e2e 與開發用）。兩者都沒有時，線上功能整個不顯示，遊戲就是現在的單機版。

## 3. 班級與帳號

- **房間代碼**：6 位數字（孩子可以用現有的數字鍵盤輸入），隨機產生、不重複。
- **老師／家長**：標題畫面「👩‍🏫 老師／家長」→ 建立房間（房間名稱＋管理密碼，至少 6 字）→ 拿到代碼。之後用「代碼＋管理密碼」登入管理頁。
- **孩子第一次加入**：房間代碼 → 暱稱（最多 12 字，房間內不重複）→ 自己設 4 位數密碼 → 選動物外觀，或「把這台裝置上的角色進度帶過去」。房間關閉加入時不能加入。
  - 帶進度過去時，本機那個角色**直接變成雲端角色**（同一個 `Profile.id`，加上 `cloud` 欄位，名字改成暱稱），選角畫面不會多出一個同名角色。伺服器保留原本的 `Profile.id`；帳號 id（`accountId`）是另一個識別，只用在伺服器與權杖。
  - 在新裝置登入時，用伺服器存檔的 `Profile.id` 建立本機角色；這台裝置已經有同 id 的角色（例如登出後再登入）就直接取代。
- **孩子之後登入**：房間代碼＋暱稱＋密碼。登入後這台裝置記住（權杖存在 localStorage `learning-island-cloud`，不放進存檔，所以家長的「備份」不會帶出權杖），選角畫面直接點角色就能玩。
- **密碼與暴力破解**：4 位數密碼只有一萬種，所以**以「房間＋暱稱」計次**：連續錯 5 次鎖 5 分鐘。不用 IP 計次：同一間電腦教室 30 個孩子共用一個對外 IP，上課開頭一起登入就會被誤鎖；IP 層級只擋明顯的洪水（每分鐘 300 次以上）。密碼與管理密碼用 scrypt 加鹽雜湊。
- **權杖**：隨機 32 bytes，資料庫只存雜湊，180 天到期，到期要重新輸入密碼。

### 3.1 Google 快速登入（備選，使用者 2026-10-02 追加）

使用者先說「登入要請家長用 Gmail」，接著補充「Gmail 作為備選登入，只是方便登入」，並決定老師也可以用。所以**原本的登入方式全部保留**（孩子：代碼＋暱稱＋密碼；老師：代碼＋管理密碼），Google 只是綁定之後的快速登入。學校共用平板照樣用代碼登入，不受影響。

- **家長**：孩子先用代碼加入班級 → 家長在家長專區「班級帳號」分頁按「綁定 Google 帳號」→ 之後任何裝置在班級畫面按「用 Google 登入」，這個 Google 帳號綁定的所有孩子（例如兄弟姊妹）一次登入到這台裝置。只有一個孩子就直接進島；多個就回選角畫面挑。
  - 每一位孩子都和代碼登入走同一條路：本機存檔＝「伺服器版本＋這台裝置還沒送出的進度」（rebase），不能直接用伺服器版本覆蓋（這台裝置可能有那位孩子離線玩、還沒上傳的進度）。`googleLogin` 回傳 `Profile[]`，由呼叫端決定目前角色。
  - 回應格式：`{ kids: SessionResponse[] }`（每位孩子一張權杖）。
- **老師**：用代碼＋管理密碼登入管理頁後按「綁定 Google 帳號」→ 之後在管理頁按「用 Google 登入」。綁了多個房間就先選房間。
  - 回應格式：`{ rooms: [{ code, name, token }] }`。只有一個房間就直接進管理頁；多個時管理頁多一個「選房間」步驟，選定後才存進老師的登入狀態。
- 一個 Google 帳號可以綁多個孩子、多個房間；一個孩子也可以綁爸爸和媽媽兩個 Google 帳號。可以解除綁定。
- 老師移除成員時，那位孩子的綁定一併刪除；老師重設孩子密碼時，Google 綁定保留（家長仍可以用 Google 登入）。
- **個資**：伺服器只存 Google 帳號的識別碼（`sub`）與 email，用途只有快速登入；老師看不到家長的 email。畫面上顯示 email 時遮掉中間（`ke***@gmail.com`）。綁定按鈕旁說明用途。
- **技術**：
  - 前端用 Google Identity Services（`accounts.google.com/gsi/client`）的官方按鈕取得 ID token（不需要 client secret，靜態網站可用）；點了「用 Google 登入」才載入 Google 的程式。
  - 伺服器用 `jose` 依 Google 的公開金鑰（JWKS）驗證 ID token 的簽章、`aud`（OAuth Client ID）、`iss`、到期時間。
  - Client ID 只設定在伺服器（`GOOGLE_CLIENT_ID`），前端從 `GET /api/config` 取得；沒設定時 Google 按鈕不顯示。
  - **需要使用者在 Google Cloud Console 建立 OAuth 用戶端 ID**（網頁應用程式；授權的 JavaScript 來源填 GitHub Pages 網址與本機測試網址），步驟寫在 `docs/google-login-setup.md`。
- **測試模式**（真實 Google 登入無法自動化）：
  - 單元測試在程式裡產生金鑰、簽測試用 ID token，走完整的驗證邏輯。
  - e2e：伺服器設 `GOOGLE_TEST_JWKS`（測試公鑰）時改用這把公鑰驗證；前端設 localStorage `learning-island-google-stub` 時，Google 按鈕換成測試按鈕，按下去送出 e2e 事先簽好的 token，之後的流程與正式環境相同。
  - **測試模式不能出現在正式環境**：沒有 `GOOGLE_TEST_JWKS` 時一律用 Google 的公開金鑰；設了 `GOOGLE_TEST_JWKS` 但沒有同時設 `ALLOW_TEST_GOOGLE=1` 就拒絕啟動（兩個變數都要故意設才會開，不依賴正式環境記得設 `NODE_ENV`）；開啟時啟動訊息印警告。前端的測試按鈕即使被打開也沒有用（伺服器只認 Google 簽的 token）。
- 新增 API（第 10 節）：`GET /api/config`、`POST|DELETE /api/google/link`（孩子權杖）、`POST /api/google/login`、`POST|DELETE /api/teacher/google/link`（老師權杖）、`POST /api/teacher/google/login`；`GET /api/me` 與 `GET /api/teacher/room` 多回傳已綁定的 email（遮罩後）。
- 新增資料表：`google_links(google_sub, account_id, email, linked_at)`、`teacher_google_links(google_sub, room_code, email, linked_at)`。

## 4. 雲端存檔與同步

### 為什麼用「操作紀錄」而不是整份上傳

整份存檔上傳會互相覆蓋：孩子正在玩的時候收到禮物，裝置上傳整份存檔就會把禮物蓋掉；兩台裝置輪流離線玩也會丟進度。所以改成**裝置送出「做了什麼」，伺服器依同一套規則套用**：

| 操作 | 內容 | 伺服器檢查 |
| --- | --- | --- |
| `session` | 一回合的 `SessionResult`（含每題作答） | 題數與作答筆數相符；星數、金幣用 `scoreSession` 重算，不信任裝置送的值 |
| `playTime` | 遊玩秒數 | 單筆不超過 10 分鐘 |
| `buy` | 商品 id | 價格查伺服器的目錄；金幣不夠就拒絕 |
| `avatar` | 外觀 | 動物、顏色在選項內；帽子必須已擁有 |
| `curriculum` | 教材版本 | 格式 |

- 每筆操作有裝置產生的 id；伺服器記住套用過的 id（保留 30 天），重送不會重複加。
- 每筆帶裝置當時的時間 `at`；伺服器用它算日期（伺服器設 `TZ=Asia/Taipei`）。**舊的操作不拒絕**（寒暑假離線玩兩週再連上，進度都要收），只做修正：晚於伺服器現在的改成現在（裝置時鐘快了）；早於 90 天前的改成 90 天前（裝置時鐘壞了）。
- **這不是防作弊設計**：每題的對錯（`correct`／`firstTry`）仍是裝置自己回報，伺服器重算星數與金幣只能擋掉算錯或亂填的數字，擋不了「全部回報答對」。班級內的公平靠老師看報表，不另外做防作弊。
- **樂觀更新**：裝置先在本機套用、放進待送佇列（`learning-island-outbox-<帳號>`），有網路就送。伺服器回傳最新存檔＋版本號，裝置把「伺服器版本＋還沒送出的操作」重算一次當作本機存檔（`rebase`，純函式、有單元測試）。被拒絕的操作直接丟掉，本機自然回到伺服器的結果。
- 連續的 `playTime` 合併成一筆，避免佇列被計時器塞滿。兩個限制：
  - 佇列分成「待送」與「送出中」兩段，**只合併進待送段**。送出中的操作 id 已經交給伺服器，內容不能再變，否則重送時伺服器依 id 去重，多加的秒數會被丟掉。
  - 合併後超過 600 秒就另起一筆，所以離線玩 40 分鐘會變成 4 筆。伺服器收到超過 600 秒的單筆改成 600，不拒絕（拒絕會讓當天的遊玩時間消失，每日上限就失效了）。
- **核心不變量**：同一個存檔、同一串操作，「本機現有的路徑（`recordSession`、`buyItem`…）」和「`applyOp`」算出的結果必須相同（`cloud` 欄位除外）。用一個對照測試直接驗證，之後改 `save.ts` 忘了同步伺服器那邊，測試就會失敗。
- 伺服器端有變動（收到禮物、退款、老師重設）時，透過 WebSocket 通知版本號，裝置發現版本比較新就重新抓。
- 存檔欄位新增（都可省略，舊存檔自動補預設值，**不升級存檔版本**，比照 `voiceClips` 的做法）：
  - `cloud`：`{ server, room, roomName, accountId }`，只存在本機，伺服器不存。
  - `stickers`：收集到的貼紙與數量。
  - `giftLog`：最近 50 筆收到的禮物（誰送的、什麼、日期）。
- 「設定」（音量、注音、每日上限、家長 PIN）仍是裝置層級，不上雲端：每台裝置的使用情境不同。

## 5. 多人同島

- 登入班級的孩子在島上時，WebSocket 連線並送出位置（有移動才送，最多每秒 10 次；靜止時每 2 秒送一次心跳）。
- 伺服器每 100 毫秒把有變動的位置打包廣播給同房間；裝置端內插顯示，其他人走路才不會一格一格跳。
- 進入建築時送出所在建築，其他人的島上看不到他，公頻名單顯示「在數學城堡」。
- 其他角色頭上顯示暱稱（DOM，用 drei 的 `<Html>`；照專案規則不用 three 的文字）。
- 位置在伺服器端限制在可走範圍內；同一個帳號在第二台裝置登入時，舊連線會被踢下線（新連線沿用舊連線的位置，別人不會看到他瞬移回出生點）。
- **信任模型**：伺服器只保證位置在島的圓形範圍內，**不做建築、噴水池等障礙物的碰撞檢查**（改過裝置程式的人可以站進建築裡）。和「不防作弊」相同，班級內靠老師管理。
- 伺服器每 100 毫秒只打包這段時間內有移動的人，不重送全房間的位置。

## 6. 公頻聊天

- 聊天按鈕打開短句盤，點一下就送出。送出的句子出現在自己頭上的對話氣泡（約 5 秒），也出現在畫面角落的公頻列表（最近 30 則）。
- 短句（暫定，約 20 句）放在 `src/ui/lines.ts` 的 `CHAT_PHRASES`。加進去之後語音盤點會把它們列成缺音檔，所以 **P2 同時跑盤點與產生預錄語音**（約 20 句，免費額度內），不把缺音檔的狀態留到下一期：
  - 打招呼：你好！、一起玩吧！、掰掰！
  - 稱讚：好厲害！👍、加油！💪、謝謝你！❤️
  - 邀約：一起去數學城堡！等各建築、我在百寶屋！
  - 學習：我答對了！🎉、我拿到三顆星！⭐、我在練習錯題！📕
  - 心情：😀 😆 😮 😢 🎉 ❤️
- 伺服器只收短句 id，不收文字；每人每 3 秒最多一則（連發上限 3 則）。
- 收到的訊息不自動朗讀（多人同時說話會很吵）；點氣泡或列表裡的句子可以聽。
- 聊天紀錄不存資料庫，伺服器只在記憶體留每個房間最近 30 則，給剛上線的人看。
- 老師可以關閉房間的聊天。

## 7. 送禮物

使用者 2026-10-03 確認：禮物包含貼紙與**所有用金幣買的外觀**；可以送給**全班同學（含沒上線的）**；對方收下時告訴送禮人，「不用了」或過期**只說金幣退回來了、不說是誰**（避免孩子難過）。

- 從哪裡送：公頻面板的「🎁 送禮」（和「💬 說話」同一列）→ 選同學（全班名單，線上的排前面）→ 選禮物 → 確認。點島上同學頭上的名牌也可以直接送他（只有真的連上班級時；多人上線模擬的假同學不行）。
- **禮物目錄**（`src/store/gifts.ts`，前後端共用的純模組）：
  - 貼紙 8 種：🍪 餅乾、🍎 蘋果（3 金幣）、🌷 鬱金香、⭐ 星星（5）、🌈 彩虹、🐳 鯨魚（8）、🚀 火箭、🦄 獨角獸（10）。可以重複收；百寶屋多一頁「📒 貼紙簿」顯示每種收集到幾張、最近是誰送的。
  - 外觀道具：所有有金幣價格的帽子、眼鏡、背後、手持、寵物、走路特效，價格照百寶屋。獎章專屬道具不能送；對方已經有的不能送（選禮物時標「已經有了」）；對方還有一份一樣的外觀沒收下時也不能再送。
- 流程：送出時伺服器先扣送禮人的金幣，禮物變成「待收下」→ 收禮人在島上看到卡片「🎁 小安送你一張 🌷 鬱金香貼紙！［收下］［不用了］」→ 收下才放進收藏；按「不用了」或 7 天沒收，金幣退回送禮人（退送出當時的價格，不查現在的目錄）。
  - 收下時對方已經自己買了同一個外觀：自動退回，告訴收禮人「你已經有了，禮物退回給朋友」。
  - 送禮人的回饋：對方收下時看到「🎉 小美收下了你送的 🌷 鬱金香貼紙！」；「不用了」、過期、自動退回、對方被老師移出房間時，只說「有一份禮物沒送出，5 金幣退回來了」。送禮人不在線上時，下次上線看到。
- 每人每天最多送 5 份（當天送出的都算，包括後來被退回的，避免一直送一直退）；收禮不限。日期和存檔一樣用 `dateKey`（伺服器設 `TZ=Asia/Taipei`）。
- 卡片只在島上出現，不打斷答題；送禮人離線時對方也可以收。
- 老師可以關閉房間的送禮：**只擋新的禮物**，已經送出的仍然可以收下或按「不用了」（不然金幣要等 7 天才退）。
- 「交換」以互送的方式達成；不做「你給我 A、我給你 B 同時成立」的交易畫面（太複雜，也容易吵架）。
- **禮物不走「操作」佇列**：送、收是伺服器端的動作，回應帶最新存檔，裝置用 `rebase`（伺服器版本＋還沒送出的操作）更新本機。送禮前先把佇列送完（直接呼叫 `syncProfile`，不用 `syncNow`：同步進行中時它會馬上返回），伺服器才看得到最新的金幣。
- 伺服器規則（每條都有測試）：
  - 送、收、不用了、過期退款都在交易裡。送禮一次鎖住送禮人與收禮人兩列（`WHERE id IN (…) ORDER BY id FOR UPDATE`，固定順序避免死結）；收下先鎖禮物再鎖收禮人；不用了與過期先鎖禮物再鎖送禮人。
  - 禮物 id 由裝置產生：同一個送禮人重送同一個 id，回傳原本那份，不會扣兩次錢（學校網路不穩，送出後沒收到回應會重試）。收下或不用了回 `409 gift_done` 時，裝置當作已處理、重新讀取。
  - 過期：伺服器每小時掃一次 7 天前還沒收的禮物，退款走 `onProfileChanged`（送禮人的裝置同步）與 `onGift`（通知）；收下時發現已超過 7 天也當作過期。
  - 老師移出成員：在同一個交易裡先把別人送給他、還沒收的禮物退款，再刪帳號。禮物紀錄保留（送禮人、收禮人欄位改成空的，暱稱另外存），送禮人才看得到退款通知；他送出還沒被收的禮物，對方仍然可以收下。
  - 跨房間的對象回 404、送給自己 400、獎章道具或不存在的 id 400。

## 8. 老師管理頁

- 房間資訊：名稱、代碼（大字顯示，方便抄在黑板上）。
- 成員列表：暱稱、是否在線上、最後上線時間、總星數、錯題數、金幣。
- 操作：重設某位孩子的密碼、移除成員（同時斷線）、開關「允許加入」「聊天」「送禮」。
- 暱稱不當時，老師移除後請孩子換暱稱重新加入。

## 9. 安全與隱私

- 只存暱稱，不收真實姓名、生日、email；加入畫面提醒「請用綽號，不要用真名」。
- 沒有自由文字的地方，只有暱稱；暱稱過濾電話號碼格式與網址（簡單規則），其餘靠老師管理。
- CORS 只允許 GitHub Pages 網址與本機開發網址（`ALLOWED_ORIGINS`）。
- 請求大小上限 1 MB，一次最多 20 筆操作；WebSocket 訊息全部用 zod 驗證，格式錯就斷線。
- 4 位數密碼是給孩子用的方便措施，不是高強度防護；這點寫進資料來源頁與 README。

## 10. 伺服器介面

### HTTP（JSON）

| 方法與路徑 | 用途 |
| --- | --- |
| `POST /api/rooms` | 建立房間 `{ name, password }` → `{ code, token }` |
| `POST /api/teacher/login` | `{ code, password }` → `{ token }` |
| `GET /api/teacher/room` | 房間設定＋成員列表 |
| `PATCH /api/teacher/room` | `{ joinOpen?, chatOpen?, giftsOpen? }` |
| `POST /api/teacher/members/:id/pin` | 重設孩子密碼 |
| `DELETE /api/teacher/members/:id` | 移除成員 |
| `POST /api/join` | `{ code, nickname, pin, profile? }` → `{ token, account, profile, rev }` |
| `POST /api/login` | `{ code, nickname, pin }` → 同上 |
| `GET /api/me` | 目前存檔與版本號 |
| `POST /api/ops` | `{ ops: Op[] }` → `{ profile, rev, rejected: [{ id, reason }] }` |
| `GET /api/classmates` | 全班同學（不含自己）`[{ id, nickname, avatar, online, inventory }]`，選送禮對象用；外觀經過 `equippedOf` |
| `POST /api/gifts` | `{ id, to, itemId }` → `{ gift, profile, rev }`（id 由裝置產生，重送不重複扣款） |
| `GET /api/gifts` | `{ incoming, notices, sentToday, dailyLimit }`：待收下的禮物、送出的禮物還沒看過的結果、今天送了幾份 |
| `POST /api/gifts/:id/accept` | 收下 → `{ status: 'accepted' \| 'returned', profile, rev }`（`returned`：已經有了，自動退回） |
| `POST /api/gifts/:id/decline` | 不用了（退款給送禮人） |
| `POST /api/gifts/notices/ack` | `{ ids }` 送禮結果看過了 |
| `GET /api/config` | `{ googleClientId }`（沒開 Google 登入是 null） |
| `POST /api/google/link`、`DELETE /api/google/link` | 家長把 Google 綁到孩子（孩子權杖）`{ idToken }` → `{ google: [遮罩後的 email] }` |
| `POST /api/google/login` | `{ idToken }` → `{ kids: SessionResponse[] }`；沒綁定回 404 `google_not_linked` |
| `POST /api/teacher/google/link`、`DELETE /api/teacher/google/link` | 老師把 Google 綁到房間（老師權杖） |
| `POST /api/teacher/google/login` | `{ idToken }` → `{ rooms: [{ code, name, token }] }` |
| `GET /healthz` | Zeabur 健康檢查 |

### WebSocket（`/ws`，連上後第一則訊息送權杖）

- 裝置 → 伺服器：`hello { token }`、`move { x, z, h, m }`、`where { zone }`、`say { phrase }`
- 伺服器 → 裝置：`welcome { self, room, members, chat }`、`join`、`leave`、`moves`（打包的位置）、`member`（外觀或所在建築變了）、`chat`、`gift`（禮物有新狀態：收到新禮物，或送出的禮物有結果；裝置重新讀 `GET /api/gifts`）、`profile { rev }`（存檔有變）、`room`（老師改了設定）、`kicked { reason }`

## 11. 資料表（PostgreSQL）

- `rooms(code, name, teacher_hash, join_open, chat_open, gifts_open, created_at)`
- `accounts(id, room_code, nickname, pin_hash, profile_json, rev, created_at, last_seen)`，`(room_code, nickname)` 唯一
- `applied_ops(account_id, op_id, applied_at)`
- `tokens(token_hash, kind, account_id, room_code, expires_at)`
- `gifts(id, room_code, from_id, to_id, from_nickname, to_nickname, item_id, price, status, sender_seen, created_at, resolved_at)`：`status` 是 `pending`／`accepted`／`declined`／`expired`／`returned`（已經有了自動退回）／`cancelled`（收禮人被移出）；`from_id`、`to_id` 在帳號刪除時設成空的；`sender_seen` 表示送禮人看過結果了

## 12. 前端改動

- `src/online/`：`config.ts`（伺服器網址）、`api.ts`、`socket.ts`（自動重連）、`sync.ts`（佇列、合併、rebase，純函式）、`protocol.ts`（zod 訊息格式，伺服器共用）、`useOnline.ts`（連線狀態、成員、公頻、待收禮物）
- `src/store/useGame.ts`：雲端角色的動作同時進佇列；`save.ts` 匯出 profile 驗證格式、加新欄位
- `src/store/catalog.ts`：帽子＋貼紙目錄
- 畫面：選角畫面加「🏫 班級登入／加入班級」；島上加連線狀態、聊天按鈕、短句盤、公頻列表、點角色選單、禮物通知；百寶屋加「貼紙簿」；家長專區加「班級帳號」（同步狀態、登出這台裝置）；新增老師管理頁
- `src/world/RemotePlayers.tsx`：其他角色、暱稱、對話氣泡
- `window.__game.online`：e2e 讀線上狀態

## 13. 測試

- 單元（Vitest，`tests/server/`、`tests/online/`）：建立房間、加入、登入、密碼鎖定、操作套用與重送、金幣重算、rebase、送禮（扣款、收下、拒收退款、過期退款、每日上限、帽子已擁有）、老師操作、即時連線中樞（廣播、短句驗證、頻率限制、重複登入踢線），用 PGlite 記憶體資料庫與假連線；設了 `TEST_DATABASE_URL` 時改連真正的 PostgreSQL。
  - 測試 helper 是 `openTestDb()`＋`resetDb()`：PGlite 每個測試檔開新的記憶體資料庫；真 PostgreSQL 在 `beforeEach` 用 `TRUNCATE … CASCADE` 清空。兩條路徑跑同一套測試碼。
  - PGlite 是單一連線，`SELECT … FOR UPDATE` 不會真的發生搶鎖，**交易鎖定的正確性（例如同時送兩份禮物不會把金幣扣成負的）只有 Docker 那一輪驗得到**，所以每期收尾都要跑一次。
- e2e（Playwright）：`webServer` 同時啟動 `vite preview` 與記憶體資料庫的伺服器；兩個瀏覽器 context 模擬兩個孩子：老師建房間 → 兩人加入 → 互相看得到 → 公頻短句與頭上氣泡 → 送貼紙、收下 → 換一個新 context 登入，進度與錯題本都在。
- 既有的 e2e 不設伺服器網址，線上功能不出現，行為不變。

## 14. 部署（P4，屆時再跟使用者確認細節與費用）

Zeabur 服務（Dockerfile、volume、網域、環境變數）、GitHub Pages 建置帶入 `VITE_SERVER_URL`、資料庫備份方式，都在 P4 開始前再確認。

## 15. 分期

| 期 | 內容 | 驗收 |
| --- | --- | --- |
| P1 | 伺服器骨架、房間、老師管理頁、孩子加入／登入、雲端存檔同步（含錯題本）；Google 快速登入（家長、老師，備選）；新增 8 種動物（使用者追加） | ① 代碼登入：換新 context 登入，進度與錯題本都在；離線玩完連上後同步（已通過，存檔點 72ca27a）② Google：綁定後換裝置用 Google 登入，含一個 Google 綁多個孩子、老師多個房間；同裝置有待送進度時不遺失 ③ 12 種動物在選角、百寶屋、島上 3D 都正確，二年級孩子不看名字也認得出來；新動物名字有預錄語音 ④ 手機版面稽核（含班級畫面、12 種動物的選單）0 問題 |
| P2 | WebSocket、多人同島、公頻短句、頭上氣泡 | 兩個 context 互相看到走動與對話 |
| P3 | 禮物目錄（貼紙＋金幣外觀）、全班同學名單、送禮／收下／不用了／過期退款、送禮結果通知、貼紙簿、老師的送禮開關 | 兩個 context 送收禮物，金幣與收藏正確；沒上線的同學下次上線收得到；按「不用了」金幣退回 |
| P4 | 部署 Zeabur、GitHub Pages 帶伺服器網址、線上 e2e | 公開網址上兩台裝置互通 |

### P1 實作順序（每步先寫會失敗的測試）

1. **共用純模組**
   - `src/store/catalog.ts`：帽子資料從 `src/world/Hats.tsx` 搬出（`Hats.tsx` 改成 import），伺服器查價用。
   - `src/store/save.ts`：匯出 `profileSchema`；`Profile` 加可省略的 `cloud`；新增 `replaceProfile`（同 id 取代或新增）。
   - `src/online/ops.ts`：`Op` 型別與 zod 格式、`applyOp(profile, op, now)`（呼叫 save.ts 的純函式，加上第 4 節表格的檢查，回傳新存檔或拒絕原因）、`normalizeOpTime`。
   - `src/online/sync.ts`：`enqueue`（連續 `playTime` 合併）、`rebase(serverProfile, pending, now)`（伺服器版本＋待送操作重算；保留本機的 `cloud` 欄位）。
2. **伺服器**（`server/`）
   - `db.ts`：`Db` 介面、`pg` 與 PGlite 兩個轉接、建表（`CREATE TABLE IF NOT EXISTS`，版本記在 `schema_version` 表）。
   - `auth.ts`：scrypt 雜湊、權杖、6 位數房間代碼、「房間＋暱稱」登入鎖定（記憶體）。
   - `app.ts`：`createApp({ db, now })` 回傳 Hono app（P1 的 HTTP 路由，第 10 節表格中禮物以外的部分）；測試用 `app.request()`，不開網路埠。
   - `main.ts`：讀環境變數、CORS、`@hono/node-server` 啟動；`vite.config.ts`（ssr、`publicDir: false`、輸出 `server-dist/`）；`server/CLAUDE.md`。
   - `package.json` 指令：`server:dev`、`server:build`、`server:start`。
3. **前端**
   - `src/online/config.ts`（伺服器網址）、`api.ts`（fetch 包裝，錯誤轉成中文訊息）、`storage.ts`（權杖與待送佇列的 localStorage）。
   - `src/online/useCloud.ts`：同步狀態、待送筆數、送出迴圈（有佇列且在線上就送；失敗以 2、4、8…最多 60 秒重試；`online` 事件立刻重試）、加入／登入／登出。
   - `useGame.ts`：雲端角色的 `finishSession`、`tickPlayTime`、`purchase`、`updateAvatar`、`updateCurriculum` 同時放進佇列；新增 `applyServerProfile`。
   - 畫面：選角畫面的「🏫 加入班級」「🏫 班級登入」（新畫面 `class`）、角色卡的班級標記；標題畫面「👩‍🏫 老師／家長」（新畫面 `teacher`：建立房間、登入、成員列表、重設密碼、移除、開關加入）；島上 HUD 的同步狀態；家長專區「班級帳號」分頁（同步狀態、登出這台裝置，有未送出的進度時先提醒）。
   - `window.__game.cloud`：e2e 讀同步狀態。
4. **驗證**：單元測試（PGlite）→ Docker PostgreSQL 跑同一套伺服器測試 → build → `e2e/online.spec.ts`（`webServer` 加上伺服器；老師建房間、孩子帶本機進度加入、玩一回合含答錯、另一個 context 登入看到進度與錯題本、離線玩完恢復連線後同步、老師重設密碼）→ 既有 e2e 的 smoke 確認不受影響 → 更新 `docs/decisions.md`、`CLAUDE.md` → commit。

### P2 實作順序（2026-10-03 規劃；畫面元件已在「多人上線模擬」做好）

1. **共用格式**：`src/online/realtime.ts`（zod）定義 WebSocket 訊息；`src/ui/lines.ts` 加 `CHAT_PHRASES`（約 20 句，id＋文字），伺服器只收 id。
2. **伺服器即時中樞** `server/hub.ts`（不碰網路，用假連線做單元測試）：成員加入／離開廣播、同帳號第二台裝置登入踢掉舊連線、位置限制在可走範圍並每 100 毫秒打包廣播、說話驗證短句 id 與頻率（每 2.5 秒一則、連發上限 3）、老師關聊天時拒絕、存檔改變時更新外觀與稱號並通知、老師移除成員或重設密碼時踢線。
   - **其他人看到的外觀一律經過 `equippedOf`**（伺服器有存檔，廣播前過濾沒擁有的道具），裝置送來的外觀不直接轉發。
3. **WebSocket 連線** `server/ws.ts`：用 `ws` 掛在同一個 HTTP 伺服器的 `/ws`；檢查 Origin；連上後 5 秒內要送 `hello`（權杖），驗證後才加入房間；每 30 秒 ping；格式錯誤直接斷線。整合測試用真的 ws 用戶端連本機埠。
4. **前端連線** `src/online/realtimeClient.ts`：雲端角色有權杖、在島上或建築裡時連線；斷線依 2、4、8…秒（最多 30 秒）重連；位置有變才送（最多每秒 10 次）、靜止時每 2 秒送一次；換畫面送所在建築；收到的訊息寫進 `usePresence`。
5. **畫面**：公頻面板加「💬 說話」短句盤（點了先唸再送出）、自己頭上的對話氣泡、線上人數含自己；老師成員列表顯示誰在線上；老師可以開關聊天。
6. **預錄語音**：短句盤的句子跑盤點與產生。
7. **驗證**：hub 單元測試、ws 整合測試、e2e 兩個裝置同房間（互相看到走動、說話出現氣泡與公頻、進建築從島上消失、老師看到在線上）、手機稽核（短句盤）、Docker PostgreSQL。

### P3 實作順序（2026-10-03 規劃；使用者的決定見第 7 節開頭）

1. **規格**：第 7、10、11 節與本節。
2. **共用純模組** `src/store/gifts.ts`（給伺服器 import：只 type import `save.ts`、import `catalog.ts`，不碰畫面、音訊、3D）：貼紙目錄、`giftPrice`（貼紙與有金幣價格的外觀；獎章道具與不存在的 id 回 null）、`canReceive`、`receiveGift`（貼紙加一、外觀放進收藏、`giftLog` 只留最新 50 筆）、每日上限 5 與過期 7 天的常數。`save.ts` 的 `Profile` 加可省略的 `stickers`、`giftLog`，`profileSchema` 同步，不升存檔版本。
3. **資料表 v3** `gifts` ＋ **路由** `server/gifts.ts`（`createApp` 掛上）：同學名單、送禮、讀取、收下、不用了、通知已讀、過期掃描 `expireGifts`；老師移出成員改成交易並退款。PGlite 單元測試涵蓋第 7 節「伺服器規則」每一條。
4. **即時通知**：`AppOptions.onGift(accountId)` → 中樞 `notify` 送 `{ t: 'gift' }`；`main.ts` 啟動時與每小時跑 `expireGifts`，關機時清掉計時器。
5. **前端同步**：`cloudSync.ts` 加 `fetchClassmates`、`fetchGifts`、`sendGift`（先 `syncProfile` 把佇列送完）、`acceptGift`、`declineGift`、`ackGiftNotices`，回應的存檔一律 `rebase`；接真的伺服器 app 做單元測試。`useGifts` store 管待收禮物、送禮結果、送禮視窗；即時連線 `welcome` 與 `gift` 時重新讀取。
6. **畫面**：公頻面板「🎁 送禮」（和「說話」同一列，不加高面板）、名牌點了送禮（`stopPropagation`，不然也會走過去）、送禮視窗（選同學 → 選禮物 → 確認）、島上的禮物卡片（只在島上；z-index 高於「進去玩」泡泡的 1、低於休息提醒的 50）、百寶屋「📒 貼紙簿」、老師頁「送禮」開關。
7. **預錄語音**：固定的提示句放 `lines.ts` 跑盤點與產生；卡片上有暱稱的句子用裝置語音。
8. **驗證**：單元 → Docker PostgreSQL（同時送禮的金幣鎖定只有這一輪驗得到）→ build → `e2e/gifts.spec.ts`（兩台裝置：送貼紙收下、送外觀按不用了退款、送給沒上線的同學下次上線收到、老師在管理頁關閉送禮；手機上送禮視窗與卡片在畫面內）→ 5 種螢幕的公頻測試 → 完整 e2e → 文件 → commit。

每期完成就跑單元測試、build、相關 e2e，再 commit。每一期都是一個完整的 T3 任務：P1 做完驗收後，再跟使用者確認是否進 P2，不是一次簽核四期全開。
