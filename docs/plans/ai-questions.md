# 老師 AI 出題＋班級題庫（G4＋G6）

> 狀態：**第 1～3 批 2026-10-13 12:26 上線**（正式環境用真的 Muse 驗收：5 題 40 秒全部通過檢查，`e2e/class-packs-live.spec.ts`）；第 4 批（題目來源開關、班級版本包、上傳 JSON）還沒做。確認（2026-10-13）：使用者選擇方案 B（加執行時用到 AI 的功能）、AI 出題可多選課綱、用 Meta Muse 模型（金鑰在 `.env` 的 `LLM_` 開頭變數）、G4 與 G6 都做（G5 試算表不做）。
> 起因：參加亞太文經學術基金會「AI 創新服務與軟體應用研究獎勵活動」（`docs/award/apcea-2026/README.md`），評分的「AI 整合程度」看 AI 是不是核心功能。
> 相關：`docs/plans/teacher-gm.md` 第 4 節（題目來源開關）、第 7 節（內容更新）；題目格式 `docs/content-pack.md`、`src/content/schema.ts`；版本包格式 `src/content/editions/schema.ts`。

## 1. 流程

1. 老師在班級頁的「班級題庫」新增或打開一包題目。
2. 編輯器（G6）：依題型的表單新增、修改、刪除題目，旁邊即時預覽孩子看到的樣子。
3. 「🤖 AI 出題」：勾選課綱指標（可多選、可跨科），選題數、題型、難度，可寫補充說明（例如「第三課生字：山、水、火」「主題：中秋節」）。伺服器呼叫 Muse，用結構化輸出拿到題目，程式檢查後把草稿放進編輯器，標出提醒。老師逐題審核、修改、刪除或單題重出，存起來才算數。
4. 發佈：班上孩子在班級島的挑戰塔看到「班級題庫」分組，作答照常進錯題本與課綱答對率。
5. 題目來源開關：老師決定班級島要不要顯示「跟著課本」「各主題活動」「班級題庫」。
6. 班級版本包：老師上傳版本包 JSON，班級版本的選單多出這個版本，相同 id 覆蓋內建版本。

## 2. 範圍

| 項目 | 內容 |
| --- | --- |
| G4 班級題庫 | 伺服器保存；上傳 JSON（同一份 `contentPackSchema`）；停用、改名、刪除；上限每包 2000 題、每班 30 包、單次上傳 4 MB |
| G4 題目來源開關 | `rooms.sources`：跟著課本、各主題活動、班級題庫，預設全開；只影響班級島（我的島照舊） |
| G4 班級版本包 | `class_editions`；老師的版本選單與孩子的班級島都用得到；相同 id 覆蓋內建 |
| G6 題目編輯器 | 單選、數字、排順序、描寫四種題型（和 teacher-gm 第 7.2 節的第一版一致）；每題有 `indicators`（課綱多選，可以空）與 `source`（預設「班級自編」，AI 出的題預設「班級自編（AI 協助）」） |
| AI 出題 | 題型：單選、數字、排順序；最多 10 個指標；伺服器一次呼叫最多 5 題，畫面連續呼叫到老師要的題數（最多 20），顯示「已出 5／20 題」；單題重出 |
| 不做 | 試算表匯入（G5）；AI 出撥時鐘、付錢、描寫題 |

## 3. 伺服器

- `POST /api/teacher/rooms/:code/ai-questions`：大人權杖＋老師身分＋自己的班級。輸入：指標鍵（`科目:代碼`）、題數、題型、難度、補充說明（300 字內）、要重出的那一題（可省略）。回傳草稿題目與每題的提醒，**不存**。
- `GET／POST／PATCH／DELETE /api/teacher/rooms/:code/packs[/:id]`：班級題庫（上傳路由放寬 `bodyLimit` 到 4 MB）。
- `POST／DELETE /api/teacher/rooms/:code/editions[/:id]`：班級版本包。
- `PATCH /api/teacher/rooms/:code` 多 `sources`。
- 孩子端：`RoomInfo` 多 `contentRev`（題庫、版本包、來源開關任何一個改了就加 1）；版本變了就抓 `GET /api/class/content`（這一班的來源開關、啟用中的題庫、版本包）。改了內容時即時中樞對全班送 `{ t: 'content' }`（G0 已有的機制），線上的孩子馬上同步。
- 資料表第 15 版：`rooms` 加 `sources jsonb`、`content_rev integer`；`class_packs`（id、room_code、title、pack jsonb、enabled、created_at、updated_at）；`class_editions`（room_code、id、edition jsonb、updated_at）；`ai_usage`（user_id、day、count）。
- `/api/config` 多 `aiQuestions: boolean`；沒設 `LLM_API_KEY` 時是 false，畫面不顯示 AI 出題（編輯器與上傳照常可用）。
- e2e 用假的出題器：`TEST_AI_FAKE=1` 與 `ALLOW_TEST_AI=1` 兩個都設才開（和測試信箱同樣的防線），正式環境絕不能設；和 `LLM_API_KEY` 同時設也拒絕啟動。

## 4. 呼叫 Muse

- 環境變數：`LLM_BASE_URL`（`https://api.meta.ai/v1`）、`LLM_API_KEY`、`LLM_MODEL`（`muse-spark-1.3-contributor`）、`LLM_REASONING_EFFORT`（`low`）。正式環境由使用者設在 Zeabur。
- 介面：OpenAI 相容的 `POST /chat/completions`，`response_format: { type: 'json_schema', json_schema: { strict: true, … } }`。用 Node 內建 `fetch` 寫薄的用戶端，不加 SDK 依賴；用串流（SSE）收，避免非串流請求的 504。
- 實測（2026-10-13）：strict schema 支援根節點以下的 `anyOf` 與 `["integer","null"]`；4 題約 24 秒、10 題約 49 秒（推理 1,510 tokens）；模型會在不相干的欄位亂填（數字題也給了 `tokens`），轉換時只讀該題型的欄位；解說寫成「3×4」違反「每份數量 × 份數」。推理也吃輸出額度，`max_completion_tokens` 要留足；串流只累加 `delta.content`，`finish_reason` 是 `length` 時整次失敗、不解析。
- 為了不讓一次請求太久（經過 Zeabur 的東京閘道器），一次最多 5 題，由畫面連續呼叫。
- 數字題要求模型另給 `expression`（例如「4×3」），伺服器算出來和答案比對。`id`、`subject`（由指標前綴決定）、`skill`、`source` 由伺服器填，不讓模型決定。單選題的選項由伺服器打亂順序（避免正確答案老是在第一個）；排序題只要模型給正確順序，由伺服器打亂成詞卡。
- `muse-spark-1.3-contributor` 是 Contributor 方案：**Meta 可以用送出的內容訓練模型**（官方價目頁原文："Contributor mode offers discounted pricing or more usage in exchange for permission to use your content"），價格 US$0.10／0.20 每百萬 tokens；Standard 方案 `muse-spark-1.3` 是 US$1.25／4.25，內容不用於訓練。換方案只要改 `LLM_MODEL`。
- 系統提示（固定）：二年級讀者、台灣正體字與用語、課綱備註的出題邊界（`docs/decisions.md`「依課綱備註修正的出題邊界」，例如乘式「每份數量 × 份數」）、生活題的選項附 emoji、有符號時填朗讀文字、每題寫解說、不抄教科書、不碰敏感題材（`docs/decisions.md`「生活與健康」）。
- 使用者訊息：選的指標與條文（`src/content/indicators.ts`）、題數、題型、難度、補充說明（當資料、不當指令）。
- 程式檢查（純函式，有單元測試）：轉成 `questionSchema`；指標必須在老師選的範圍內；選項不重複、答案索引有效；排序題詞卡一致；純算式的數字題重算答案；用到注音字型沒有的字標提醒（那些字不會有注音）；不合格的題目丟掉並說明原因。
- 每位老師每天最多 200 題（`ai_usage` 以台灣日期計，請求前先在同一句 SQL 裡預扣、AI 失敗時退回；伺服器重啟也算）。

## 5. 隱私

送給 Meta 的只有老師選的課綱、題數、題型、難度與補充說明，不含任何孩子的資料。用 Contributor 方案時 Meta 可以拿這些內容訓練模型，補充說明的欄位旁邊提醒「請勿填寫學生姓名或個人資料」。`public/privacy.html` 要一起更新：AI 出題的資料流向，以及班級題庫、版本包、來源開關從第 12 節「規劃中的功能」搬進正文。

## 6. 測試

- 單元：提示組裝、AI 回應轉題目與檢查（每種錯誤）、算式重算、用字檢查、來源開關篩選、班級版本包合併、編輯器表單轉題目。
- 伺服器（PGlite）：AI 路由（假出題器；不是老師、別人的班級、超過每日上限、沒設金鑰）、班級題庫與版本包的新增、修改、刪除與上限、來源開關、孩子抓內容、`contentRev`。
- e2e：老師 AI 出題 → 審核修改 → 發佈 → 線上的孩子在挑戰塔看到並作答；手動編題；上傳 JSON；來源開關；版本包。
- 真的 API 只在本機手動跑（花費很少）。

## 7. 分批

先做比賽影片需要的完整流程（AI 依課綱出題 → 老師把關 → 孩子作答 → 指標回報），做完就上線；來源開關與版本包放在後面，時間不夠可以延後。

1. 伺服器：資料表、班級題庫的路由、孩子抓班級內容、`contentRev`、AI 出題（假出題器與 Muse）。
2. 孩子端：抓班級內容、挑戰塔的「班級題庫」。
3. 老師端：班級題庫管理、編輯器與預覽、AI 出題；e2e、隱私權政策、文件，**上線**。
4. 題目來源開關、班級版本包、上傳 JSON；e2e、文件，上線。

時程（比賽 10/31 截止、不補件）：第 1～3 批約 10/22 前完成、10/24 前上線；10/25～29 錄影片、寫說明書；10/30 寄出。第 4 批 10/22 前沒做完就先不上。

## 8. 實作紀錄（第 1～3 批，2026-10-13）

- **純函式**：`src/content/aiQuestions.ts`（請求格式、給模型的 strict JSON Schema、提示、算式計算、轉題目與檢查）；`src/store/packEditor.ts`（指標分組、空白題目、存檔前整理、組成題庫包、AI 分批）；`src/store/classPacks.ts`（題庫轉挑戰塔活動 `class.<題庫 id>`、快取何時重抓、讀回快取）。注音字型收錄的字由 `scripts/build-font.py` 另外寫成 `src/content/zhuyinCharset.ts`（2,010 字），伺服器與畫面共用。
- **伺服器**：資料表第 15 版（`rooms.content_rev`、`class_packs`、`ai_usage`）；`server/classContent.ts`（班級題庫、孩子抓內容、AI 出題）、`server/ai.ts`（Muse 用戶端、假出題器、依環境變數選）。
- **和第 3 節不同的地方**：
  - AI 出題改成兩步（`POST` 回工作編號、`GET` 查結果）：實測一次 5 題要 24～66 秒，一個長請求經過閘道器容易逾時。
  - 孩子抓班級內容的路徑是 `GET /api/rooms/:code/content`，不是 `/api/class/content`（`/api/class/…` 是教室權杖專用）。
  - 數字題的解說裡有算式、卻沒有一個算得出答案時標提醒（實測 AI 把「5 排、每排 4 人」的解說寫成「4 乘以 3」）；朗讀文字和題目一樣時不留。
  - 每日額度以題數計（每位老師 200 題），`ai_usage` 保留 7 天。
- **孩子端**：班級的 `contentRev` 跟著同步存進 `CloudRoom`；`src/online/useClassContent.ts` 看到現在所在班級島的版本變了就抓，存在這台裝置（localStorage）；挑戰塔的「班級題庫」分組放最前面（只在班級島）。
- **老師端**：`src/ui/screens/teacher/`：`ClassPacks.tsx`（班級頁的題庫清單）、`PackEditor.tsx`（編輯器）、`QuestionForm.tsx`（依題型的表單＋即時預覽）、`QuestionPreview.tsx`、`IndicatorPicker.tsx`（課綱多選、搜尋）、`AiPanel.tsx`（AI 出題，每 5 題一批）、`aiJob.ts`（送出與查結果）。
- **隱私權政策**：第 2、3、5、6、7、8、12 節（中英文）寫進班級題庫與 Meta（AI 出題，Contributor 方案可用於訓練）；日期先寫 2026-10-13，上線那天要再對一次。
- **測試**：單元 `tests/content/aiQuestions.test.ts`、`tests/store/packEditor.test.ts`、`tests/store/classPacks.test.ts`；伺服器 `tests/server/classContent.test.ts`、`tests/server/aiClient.test.ts`；e2e `e2e/class-packs.spec.ts`（AI 出題 → 審核 → 發佈 → 孩子作答 → 停用；手動出題與手機寬度）。真的 API 用 `vitest.ai.config.ts` 試跑（`scripts/ai/try-muse.test.ts`）。
