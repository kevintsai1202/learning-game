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
npx vitest run --config vitest.puzzle.config.ts --silent=false   # 七巧板剪影設計工具：預覽題庫的擺法、給外框讓解題器找擺法
node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.ai.config.ts --silent=false 2>&1 | Tee-Object -FilePath logs\ai-try.log   # 老師 AI 出題用真的 Muse 試出 5 題（.env 的 LLM_ 變數；印出草稿、提醒與丟掉的題目）
npm run server:build; npm run server:start   # 本機啟動班級伺服器（port 8787，PGlite 記憶體資料庫）
# 部署：合併到 main 並 push → GitHub Pages 與 Zeabur（班級伺服器＋同一份前端）都會自動部署；步驟與注意事項見 docs/deploy-zeabur.md
node scripts/deploy/watch-deploy.cjs <提交前 7 碼> <新版主程式才有的字串>   # push 後等兩個網址都換新版；之後 .\scripts\deploy\inspect-prod-data.ps1 唯讀檢查正式資料庫
$env:E2E_SERVER_URL = 'https://learning-island.zeabur.app'; npx playwright test --config playwright.remote.config.ts e2e/realtime.spec.ts --grep-invert Google   # 對外部伺服器跑線上 e2e（再設 BASE_URL 就連前端也用外部的）
.\.venv\Scripts\python scripts\build-font.py   # 內容新增字之後重產注音字型子集（同時更新 src/content/zhuyinCharset.ts）
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
- `src/world/` 3D 島嶼、屋子裡（`HomeScene.tsx`、房間的幾何 `room.ts`）與舞台（R3F）；鏡頭縮放（`cameraZoom.ts`）、轉視角與用家具時換視角（`cameraOrbit.ts`）、建築半透明（`fadeGroup.ts`）、用家具的姿勢包裝（`PoseWrap.tsx`）與偵測（`UseLayer.tsx`）；其他角色會擋住自己（`remoteBodies.ts` 別人站的位置、`movement.ts` 的 `blockByOthers`）；`src/ui/` DOM 介面（老師的班級題庫、題目編輯器與 AI 出題在 `src/ui/screens/teacher/`）
- `src/store/` 存檔（`save.ts` 純函式 + `useGame` store）、商品目錄（`catalog.ts`）、禮物目錄（`gifts.ts`）、益智遊戲的金幣與時間規則（`puzzle.ts`，伺服器共用）、班級島與我的島（`island.ts`：在哪座島、要用的教材版本、要不要顯示裝置上的題庫；`docs/plans/teacher-gm.md`）、自己的家：島上的擺設（`yard.ts` 規則，伺服器共用；`useDecor.ts` 動森做法的家具包與放法，島上與屋裡共用；`docs/plans/home.md`）與進屋（`home.ts` 房間的規則，伺服器共用；`useHome.ts` 進出屋的狀態；第 8 節）、可以用的家具（`furnitureUse.ts` 座位表與時間軸、`actCodes.ts` 同步的動作代碼，伺服器共用；`useFurnitureUse.ts` 用家具的狀態；第 9 節）、班級島遊樂場（`rideKinds.ts` 器材種類與格式，伺服器共用；`playground.ts` 位置、器材的座位與動法；`useRides.ts` 狀態；`actFrame.ts` 家具與器材共用的 `frameOf`；`docs/plans/playground.md`；模型在 `src/world/Playground.tsx`）、班級島大型設施（`grandKinds.ts` 種類與價錢，伺服器共用；`coasterTrack.ts` 雲霄飛車的軌道與時間表；`grandRides.ts` 位置、班次、座位、飛船的航線與甲板；`useGrand.ts` 狀態與上車；`clockSync.ts` 牆上的時間與對時；`rideSound.ts` 音效的排程（純函式）；`docs/plans/grand-rides.md`；模型在 `src/world/GrandRides.tsx`，音效播放在 `src/audio/rideAudio.ts`，音檔與授權在 `public/audio/sfx/rides/`，產生音檔的腳本在 `scripts/audio/`）、自訂題庫、班級題庫（孩子端的活動與快取規則 `classPacks.ts`、編輯器的純函式 `packEditor.ts`；`docs/plans/ai-questions.md`）、畫面狀態
- `src/online/` 線上版前端：操作套用（`ops.ts`，伺服器共用）、同步佇列（`sync.ts`）、同步迴圈、送禮與家長雲端角色的 API（`cloudSync.ts`）、狀態與排程（`useCloud.ts`）、即時連線（`realtimeClient.ts`）、好友名單（`friends.ts`、`useFriends.ts`；`docs/plans/islands.md`）、禮物狀態（`useGifts.ts`）、大人帳號的登入狀態（`useAccount.ts`）、信裡驗證與重設連結的網址參數（`emailLinks.ts`）、掃 QR code 加入班級的連結（`joinLink.ts`；`docs/plans/class-join.md`）、熊熊老師進島的連線（`gmClient.ts`）、孩子收到的公告與集合（`useTeacherCalls.ts`）與獎勵（`useRewards.ts`）、集合排圈（`summon.ts`，伺服器共用）、回報在做什麼（`doing.ts`；`docs/plans/teacher-gm.md` 第 13 節）、和朋友益智對戰的邀請與這一局的動作（`useFriendDuel.ts`；`docs/plans/islands.md` 第 12 節）、別人的島的院子（`useHostYard.ts`）、學校平板的教室權杖紀錄（`classroom.ts`；`docs/plans/login-ux-review.md` 第 7 節）、家長連結卡的連結（`claimLink.ts`）與帳號規則（`userRules.ts`，伺服器共用；`docs/plans/accounts.md`）、班級題庫在裝置上的快取（`useClassContent.ts`；班級的 `contentRev` 變了才重新抓）
- `src/puzzle/` 益智遊戲館的畫面（選單與結算 `PuzzleScreen.tsx`、五個遊戲、和機器人搶答的共用流程 `useDuel.ts`、和朋友對戰的共用流程 `useFriendGame.ts` 與一局的題目和指紋 `friendRound.ts`）；`src/engine/puzzle/` 益智遊戲的規則（出題、判定、機器人，純函式；和朋友對戰的規則 `friend.ts`，動作種類 `duelMoves.ts` 伺服器共用）。規格見 `docs/plans/puzzle-house.md`，和朋友對戰見 `docs/plans/islands.md` 第 12 節
- `server/` 班級伺服器（另有 `server/CLAUDE.md`）；規格與分期在 `docs/plans/online.md`；部署在 Zeabur（`docs/deploy-zeabur.md`），正式網址 GitHub Pages 與 `learning-island.zeabur.app`
- `src/update/` 更新通知：規則（`updateRules.ts`）、檢查與套用（`useUpdate.ts`；建置時的版本號與 `version.json` 在 `vite.config.ts`；`docs/plans/update-notice.md`）；提示在 `src/ui/UpdateBanner.tsx`
- `src/content/` 題庫格式（zod）、課綱代碼對照、資料來源清單、老師 AI 出題的請求格式、提示與檢查（`aiQuestions.ts`，伺服器共用）、注音字型收錄的國字（`zhuyinCharset.ts`，`scripts/build-font.py` 產生，不要手改）
- `public/data/strokes/` 國字筆順資料（腳本產生）；`public/licenses/` 授權全文

## 規則

- 內容一律原創或使用已確認授權的開放資料；新增外部資料要登記 `src/content/sources.ts` 並放授權檔。
- 國字筆順只用台灣教育部標準的資料；缺字不得用中國大陸筆順資料替代。
- 文字一律放 DOM，不要用 three 的文字渲染（注音字型需要 IVS）。
- 要朗讀的固定句子放 `src/ui/lines.ts`，題目的朗讀文字一律經過 `src/quiz/spoken.ts`；預錄語音的盤點腳本靠這兩處收集句子。
- 每題要有 `indicators`（108 課綱代碼）與 `source`。
- `public/google794a0ce8bfe02629.html` 是 Google Search Console 的網域驗證檔（OAuth 品牌驗證要用），不能刪也不能改；`kevintsai1202.github.io` 儲存庫根目錄的同名檔案也一樣。
- e2e：`workers: 1`、SwiftShader 參數已設好；用 `window.__game`（ui、game、player、teleport、quiz、cloud、presence、realtime、presenceDemo、gifts、puzzle、friends、music、gm、scene、duel、yard、home、furniture、classContent）讀狀態與自動作答；`classContent` 是班級題庫在這台裝置的快取（班級代碼 → 版本號與啟用中的題庫）；e2e 的伺服器開著假出題器（`TEST_AI_FAKE`），老師 AI 出題回固定的測試題目、不連網；`duel` 是和朋友益智對戰的邀請與進行中的一局；`yard` 是自己的家的擺設（格子、世界座標、家具佔的格子的正中間 `center`、家具包與放法的動作、別人的島的擺設；角色的位置與方向設 `player` 就能決定面前的格子與多格家具展開的方向），`home` 是進屋（狀態、進屋、出屋、小屋門口、腳踏墊、進屋站的位置、房間的格子與座標），`furniture` 是用家具的狀態（正在用的看 `player.act`，自己的角色的姿勢與縮放看 `scene.playerLift()`），`orbit` 是轉視角的角度與用家具時的視角模式（`setYaw`、`reset`、`setView`；屋裡半透明的牆看 `scene.fadedWalls`），`rides` 是班級島遊樂場（遊樂場、旁邊的器材、別人坐在哪裡、`occupied(slot)`、`start(slot)`；老師用 `PATCH /api/teacher/rooms/:code` 的 `playground` 設定）；`grand` 是班級島大型設施（`store` 旁邊的設施與別人坐在哪裡、`start(ride)`、`block(ride)`、`warp(秒)` 把牆上的時間往前撥（兩台裝置撥一樣多）、`wall()`、`coaster()`、`ship()` 現在的班次；自己在設施上離地多高與方向看 `scene.playerWorld()`）；`update` 是更新通知（`check()` 現在檢查一次、`buildId`；e2e 用 `page.route('**/version.json*')` 假裝有新版）；`rideAudio` 是大型設施的音效（`active()`、`loaded()`、`loops()`、`durations()`、`record(true)`／`drain()` 拿每一格的音效排程）；點 3D 物件是放開、沒拖動才算（`onClick`），e2e 拖曳畫面用 `page.mouse` 按著移動，`scene.hiddenZones` 是擋住角色而變半透明的建築（`scene.buildingLook` 看某一棟的不透明度，`scene.fadedCells` 是屋裡半透明的高家具），`camera` 是 3D 鏡頭，點 3D 物件用 `scene.project` 把世界座標換成畫面座標；`gm` 是熊熊老師進島的連線狀態，`scene.npcTeacher` 是廣場上的 NPC 熊熊老師有沒有畫出來；要快轉時間（休息倒數）用 `page.clock.install()`＋`fastForward`（不要用 `runFor`，會逼 3D 畫面畫幾千格）；益智遊戲的機器人速度用 `__game.puzzle.botDelayFactor` 調。手機尺寸（寬 ≤ 600，或橫式高 ≤ 500；判斷在 `src/ui/phoneLayout.ts`，`<html>` 會加 `phone` class）的島上介面是上方一行＋右側直排圖示＋右下大動作鍵（`ActionKey`）：`hud-badges`、`hud-parent` 要先點 `hud-menu`，公頻要先點 `chat-toggle`，門口與家具的按鈕 testid 和電腦版一樣（外框 `door-bubble` 等）。多台裝置的測試用 `e2e/onlineDevice.ts` 開啟（3D 畫質設成低，否則軟體 WebGL 會把 CPU 吃滿）。e2e 的伺服器開著測試信箱（`TEST_MAIL_OUTBOX`），驗證與重設連結用 `onlineDevice.ts` 的 `mailsTo`／`linkIn` 讀。裝置紀錄出現 `net::ERR_NETWORK_CHANGED` 時，是開發機的網路變動（Wi-Fi 斷線、漫遊）讓 Chrome 中斷了請求，連 localhost 也一樣：先查 Windows 事件記錄（`Microsoft-Windows-NetworkProfile/Operational` 的 10000／10001、System 的 `Netwtw14`）對時間，單獨重跑該測試。
- 雲端角色的存檔只能透過「操作」改變（`src/online/ops.ts`），伺服器用同一份規則套用；`src/` 裡給伺服器 import 的模組不能 import 畫面、音訊、3D 的程式。
- 角色走路的動作在 `src/world/walkPose.ts`（孩子與熊熊老師共用）。介紹影片的錄影、配樂、剪接腳本在 `scripts/video/`（`npx playwright test --config scripts/video/playwright.video.config.ts`、`node scripts/video/music.mjs`、`node scripts/video/edit.mjs`；輸出在不進版控的 `video-out/`）。
