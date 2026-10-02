# 預錄語音檔規劃（朗讀改善第 2 步）

狀態：A 期已實作（2026-10-02），見第 9 節；B 期（國語）待決定。第 1 步「挑選自然語音」已完成，見 `docs/decisions.md` 的「朗讀聲音」一節。

## 1. 目標與理由

裝置語音的音質取決於孩子用的裝置：

- Windows 的 Edge：已有免費的自然語音（第 1 步會自動選用），音質沒問題。
- Chrome、Android：Google 的雲端語音，比舊版桌面語音好，但仍偏平。
- **iPad 的 Safari：iOS 18 起讀不到使用者下載的高品質語音，只能用內建的基本聲音。** 這個遊戲以平板為主，這是最需要改善的地方。

把固定的句子事先用高品質的語音合成做成音檔，放在網站上播放，就不受裝置限制。做不到的句子（數學題的數字每次不同）繼續用裝置語音。

## 2. 朗讀量（2026-10-01 實測）

用暫時的 vitest 腳本跑過所有活動（含三家版本的單元），每個活動 60 個種子 × 3 個難度，統計不重複的朗讀句子：

| 科目 | 不重複句子 | 字數 | 判斷 |
| --- | --- | --- | --- |
| 生活與健康 | 606 句 | 約 5,600 字 | 已收斂，可全部預錄 |
| 英語 | 約 1,400 句 | 約 1.4 萬字 | 可全部預錄 |
| 國語 | 約 1.5 萬句，還在增加 | 約 14 萬字以上 | 可預錄，但檔案多，先分析句型 |
| 數學 | 無上限 | — | 數字動態產生，不預錄 |

另外還有介面上的固定句子：歡迎詞、鼓勵語、「再想想看！」、熊熊老師的提示、建築介紹、結算訊息、休息提醒等，估計 100～300 句。

一句平均約 9 個字、2 秒左右。用 mp3 單聲道 32 kbps，每句約 10 KB。

## 3. 分期

| 期 | 內容 | 句數 | 檔案大小 |
| --- | --- | --- | --- |
| A | 介面固定句子、生活與健康、英語 | 約 2,100 句 | 約 20 MB |
| B | 國語（先分析句型，能拆成「固定句型＋字詞」的就拆開，降低檔案數） | 1 萬句以上 | 100～200 MB |
| C | 37 個注音符號：用教育部《國語注音符號手冊》的官方錄音（見第 7 節） | 37 段 | 不到 1 MB |

數學不在範圍內。之後若要改善，可以把數字（0～1000）和句型片段分開錄再串起來，但串接的聲音會有斷點，要先試聽再決定。

## 4. 語音來源（待決定）

| 選擇 | 優點 | 要注意的地方 |
| --- | --- | --- |
| Azure 神經語音 `zh-TW-HsiaoChenNeural`、`zh-TW-HsiaoYuNeural`（女）、`zh-TW-YunJheNeural`（男） | 和 Edge 的自然語音是同一組聲音，預錄檔和退回的裝置語音聽起來一致；F0 免費層每月 50 萬字，A、B 兩期都在免費額度內 | 台灣國語沒有說話風格（express-as），也沒有童聲，語氣比較平；讀音標記實測（2026-10-01）：`<phoneme alphabet="sapi">` 與帶聲調的 IPA 都回 HTTP 400，不帶聲調的 IPA 會被接受但無法指定聲調，破音字只能用 `<sub alias="同音字">` 替代 |
| Fish Audio 公開聲音「詩涵 Shihan（台灣）」（作者 Fish Official），模型 `s2.1-pro-free` | 可以在文字裡加 `[happy]`、`[warm]` 等情緒標記，適合鼓勵語和老師的台詞；破音字可用 `<\|phoneme_start\|>wei4<\|phoneme_end\|>`（拼音加聲調數字）指定；已有 SubTutor 的串接與抽查流程可以沿用 | 讀音要逐句抽查；免費模型的速率限制要實測 |
| 聯發科 BreezyVoice（Apache-2.0） | 台灣口音，可以用注音直接指定讀音 | 要在自己的電腦用 GPU 跑；附的範例人聲能不能用在公開網站，官方還沒有答覆（GitHub issue #15），要自備授權清楚的參考人聲 |

Google 新一代的 Chirp 3 HD 語音不支援台灣國語（cmn-TW），不採用。

**做法（已決定）**：先做試聽比較頁，聽過再選。英語可以和中文用不同來源。

### 4.1 試聽比較頁

- 句子與聲音：`scripts/voice/compare-lines.json`。共 26 句，包含介面固定句子、生活題、破音字測試句、注音測試、英語。比較的聲音：
  - 中文：Azure 曉臻、曉雨；Fish 詩涵、承翰。
  - 英文：Azure Ava、Ana（童聲）；Fish Hannah。
- 產生：`scripts/voice/compare.mjs`。每個音檔都去頭尾靜音，再調到同樣的響度（−16 LUFS，實測 84 個音檔在 −17.6～−15.9 之間），避免比較大聲的聽起來比較好。沒有金鑰的引擎會略過；已經下載過的音檔不會重新呼叫 API。
- 輸出：`data-src/raw/voice-compare/index.html`（不進版控、不部署）。每一列最右邊的「這台裝置」按鈕用瀏覽器語音唸，在 Edge 上就是 Azure 同一組自然語音，可以當參考。
- Fish 的官方聲音用 `scripts/voice/fish-voices.mjs` 查，只採用作者正好是「Fish Official」的聲音；作者「fishaudio」底下有名人仿聲，不能用。

```powershell
node --env-file-if-exists=.env scripts/voice/compare.mjs 2>&1 | Tee-Object -FilePath logs\voice-compare.log
Start-Process data-src\raw\voice-compare\index.html
```

Azure 金鑰：在 Azure 入口網站建立「語音服務（Speech）」資源，定價層選 F0（免費）。到資源的「金鑰和端點」頁，把「金鑰 1」和「位置/區域」（例如 `eastasia`）填進 `.env` 的 `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`，再執行一次上面的指令。

## 5. 架構

### 5.1 產生流程（只在開發者的電腦執行，金鑰不進前端也不進 CI）

1. **盤點**：`scripts/voice/collect.test.ts` 跑所有活動並列出朗讀文字，用獨立的 `vitest.voice.config.ts` 執行，不放進一般的單元測試。輸出 `data-src/voice/inventory.json`，內容包含文字、語言、科目、出現次數。介面固定句子從 `src/ui/` 的常數收集，所以要先把散在元件裡的固定句子集中到一個檔案。
2. **合成**：`scripts/voice/generate.mjs --phase A --engine azure|fish`。每句單獨產生一個檔案，去掉頭尾靜音並把音量標準化到 −16 LUFS。檔名用「引擎＋聲音＋語言＋文字」的雜湊值；已經有的檔案不重做，只有改稿或換聲音時才重新產生。
3. **抽查**：`scripts/voice/check.mjs` 用 Whisper 聽寫比對文字，沿用 SubTutor 的門檻 0.85。分數低的多半是同音字，只有真的漏字或讀錯才重做。破音字清單（`docs/stroke-coverage.md` 第 3 節的 14 字）另外人工試聽。
4. **輸出**：`public/audio/voice/<雜湊>.mp3`，另產生 `public/audio/voice/manifest.json`，對照「語言＋文字」到檔名。B 期上線後，manifest 依科目拆成多個檔案，用到時才下載。

指令（PowerShell 7，專案根目錄；金鑰放在 `.env`，已被 git 忽略）：

```powershell
npx vitest run --config vitest.voice.config.ts
node --env-file-if-exists=.env scripts/voice/generate.mjs --phase A --engine azure 2>&1 | Tee-Object -FilePath logs\voice-generate.log
node --env-file-if-exists=.env scripts/voice/check.mjs --phase A 2>&1 | Tee-Object -FilePath logs\voice-check.log
```

### 5.2 播放（`src/audio/speech.ts` 的 `say()` 已經是所有朗讀的共同入口）

- `say()` 先依句子切開，再查 manifest：**每一句都有音檔才播音檔，只要有一句沒有，整段就用裝置語音**，避免同一段話中途換聲音。
- 播放用 Web Audio：用已經解鎖的共用 `AudioContext`（`src/audio/sfx.ts` 的 `sharedAudio()`）下載、解碼、播放。iPad 上 `<audio>` 元素若不是在點擊當下呼叫 `play()` 可能被擋下，Web Audio 只要解鎖過就能播。這點要在 iPad 實機驗證。
- 沿用第 1 步的朗讀序號：新的朗讀或停止時中斷正在播的音檔；播放時壓低配樂，播完恢復。「再聽一次」也走同一個入口。
- 音檔下載失敗或解碼失敗時，退回裝置語音。
- 家長專區加「優先使用預錄語音」開關（預設開）。

### 5.3 版控與部署

- A 期約 20 MB，直接進 git。檔名是內容雜湊，重新產生同一句不會改動歷史。
- B 期 100～200 MB 會讓 repo 變大。GitHub Pages 網站上限 1 GB、單檔上限 100 MB。我們的部署是 GitHub Actions，`actions/checkout` 加 `lfs: true` 就能把 Git LFS 的檔案放進網站，但 LFS 有頻寬額度，而每次部署都要下載全部音檔。B 期開始前再決定：直接進 git、改用 LFS，或另外放在物件儲存。
- 新增的語音來源要登記在 `src/content/sources.ts`，並把授權或使用條款放進 `public/licenses/`。

### 5.4 測試

- 單元測試：manifest 查詢（文字正規化、每一句都有音檔才播、缺一句就整段用裝置語音）。
- e2e：攔截 `audio/voice/` 的請求，確認有音檔的句子不會呼叫 `speechSynthesis`，缺檔時會退回裝置語音；沿用 `e2e/voice.spec.ts` 的假語音服務。
- 實機：iPad Safari 與 Android Chrome 各試一次「進島、作答、答對答錯、結算」，確認都有聲音、配樂會壓低。

## 6. 工時估計

| 項目 | 估計 |
| --- | --- |
| 試聽比較頁（20 句 × 2 種來源） | 半天 |
| 盤點腳本、集中介面固定句子 | 半天 |
| 合成與抽查腳本 | 1 天 |
| 播放端（manifest、Web Audio、退回裝置語音、開關）與測試 | 1 天 |
| A 期產生、抽查、修正 | 半天到 1 天 |
| B 期（含句型分析） | 2～3 天 |

## 7. 注音符號的發音（C 期）：教育部官方錄音

使用者決定不找人錄音（2026-10-01）。語音合成唸單獨的注音符號不可靠：直接給「ㄅ」或加讀音標記的結果，放在試聽頁的「注音」一組實際聽。所以注音符號改用教育部的官方錄音：

- 來源：教育部《國語注音符號手冊》數位版的開放部件 `bopomofo_materials_20170213.zip`（<https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html>），其中 `audio/F1.WAV`～`F37.WAV` 共 37 個發音檔（44.1 kHz 立體聲，每個約 0.8 秒）。
- 編號對應：依手冊 HTML 版每個符號格子的 `play('aN')` 與同一列的筆順動畫字元對照，F1～F37 依序是 ㄅ～ㄙ、ㄚ～ㄦ、ㄧㄨㄩ（與 Unicode 順序相同）。對照表存在 `data-src/raw/moe-juyin/audio-map.json`。
- 授權：音檔與動畫採「創用CC 姓名標示 4.0 國際版本」，可以改作（轉檔、調音量）。手冊本體是 CC BY-ND 3.0 TW，不能改作，所以只用開放部件，不用手冊本體的內容。
- 標示（依 `license.txt` 的指定文字，資料來源頁照抄，並註明「已轉檔並調整音量」）：
  - 2017 © 教育部，國語注音符號手冊-開放部件。
  - 此素材依「創用CC 姓名標示 4.0 國際版本」授權條款進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。
  - 創用CC 姓名標示 4.0 國際版授權條款：<https://creativecommons.org/licenses/by/4.0/deed.zh_TW>
- 不含聲調符號（ˊˇˋ˙）。聲調名稱（一聲、二聲……）是一般詞語，用語音合成即可。
- 英文字母：英語活動唸的是字母名稱和單字（`src/engine/en/phonics.ts`），不需要單獨的字母發音，用語音合成即可。
- 音檔放進 `public/` 時，同時登記 `src/content/sources.ts` 並把授權全文放進 `public/licenses/`。

## 8. 決定紀錄與待決定

已決定（2026-10-01）：

- 語音來源：先做試聽比較，聽過再選（見 4.1）。
- A 期內容：介面固定句子、生活與健康、英語三類都做。
- 不找人錄音。

已決定（2026-10-02，聽過試聽頁）：

- 一般中文語音：**Fish 詩涵 Shihan（台灣）**（`91ec588cf8ef443a9c0d5b21d0c1fa36`）。
- 注音符號：**Azure 曉臻 `zh-TW-HsiaoChenNeural`**，直接給符號、不用替代字（使用者比較過教育部錄音後選擇）。試聽頁「注音逐個確認」一節已產生 37 個，等使用者逐個確認；不能用的符號再個別處理（例如改用教育部錄音或同音字替代）。曉臻的單一符號只有 0.24～0.48 秒，教育部錄音是 0.64～0.84 秒，要注意會不會太急促。
- 因為注音改用 Azure，第 7 節的教育部錄音目前只當對照，不放進遊戲；若之後有符號改用教育部錄音，再照第 7 節登記出處。

- 英文語音：**也用 Fish 詩涵**（和 Azure Ava、Ana、Fish Hannah 比較後選擇）。A 期的中文、英文都用同一個聲音，只有注音用 Azure。
- 注音放慢到 **0.7 倍**（Azure `<prosody rate="-30%">`），單一符號約 0.28～0.60 秒；試聽時比較過 0.9、0.7、0.55 三種。

A 期要用的聲音總結：

| 用途 | 聲音 | 語速 |
| --- | --- | --- |
| 介面固定句子、生活與健康 | Fish 詩涵 Shihan（`91ec588cf8ef443a9c0d5b21d0c1fa36`，模型 `s2.1-pro-free`） | 0.9 |
| 英語 | Fish 詩涵 Shihan | 0.85 |
| 37 個注音符號 | Azure 曉臻 `zh-TW-HsiaoChenNeural`（直接給符號） | 0.7 |

免費額度：Fish 免費模型不計費（免費帳戶並行 5 個請求）；Azure F0 每月 50 萬字、每 60 秒最多 20 次請求，37 個注音遠低於限制。

授權查證（2026-10-02，產生前查的）與決定：

- Fish Audio 服務條款（2024-08-18 版）：「You will only use the Services for your own internal, personal, non-commercial use, and not on behalf of or for the benefit of any third party」；付費使用者才「licensed to use the Services for commercial uses」。官方部落格（2026-06-23）說 `s2.1-pro-free` 是「built for experimentation and prototyping」，並寫「Some commercial scenarios may have restrictions. Products generating more than $1M ARR should contact us」。
- Microsoft：多篇 Microsoft Q&A 引用產品條款「For Customers of the paid tier TTS Service only, Customer may use the audio output of prebuilt neural voices」，免費方案只供評估測試（產品條款頁是動態網頁，沒能直接讀到原文）。
- 改用付費的成本：Fish `s2.1-pro` 每百萬 UTF-8 位元組 15 美元（官方說和免費版是同一個模型），A 期估計 1～2 美元；Azure 資源從 F0 改 S0，37 個注音不到 0.01 美元。
- **使用者決定照免費方案做（2026-10-02）**，條款風險由使用者評估承擔。資料來源頁與 `public/audio/voice/CREDITS.md` 註明是 AI 合成語音與採用的方案。

待決定：

1. B 期（國語）：A 期上線、在 iPad 上聽過之後再決定。
2. 之後是否改成付費方案（重跑 `generate.mjs` 即可，模型名稱改在腳本的 VOICES）。

## 9. A 期實作紀錄（2026-10-02）

- 盤點：`scripts/voice/collect.test.ts`（`npx vitest run --config vitest.voice.config.ts`）→ `data-src/voice/inventory.json`，共 3,491 句：中文 1,870、英文 1,584、注音 37，約 3.6 萬字。每個活動一直換種子出題，直到連續 40 個種子沒有新句子（英語單字圖卡要到第 713 個種子才收斂，固定跑幾十個種子會漏句）。
- 注音描寫題的指示句：只收出現在至少 10 個不同符號題目的句子（3 個固定句型）。含例字的句子（例如「介，默寫這個字裡面的注音符號。」）最多只出現在例字含有的幾個符號，門檻設 3 會誤收 205 句。
- 產生：`scripts/voice/generate.mjs`（共用 `scripts/voice/lib.mjs`）→ `public/audio/voice/<雜湊>.mp3` 與 `manifest.json`。`--limit N` 或 `--match <正規式>` 只做一部分（驗證用，不刪舊檔）。
- 抽查：`scripts/voice/check.mjs`，介面句子全部加題目抽 15%，Groq Whisper 聽寫，相似度低於 0.85 的列在 `data-src/raw/voice-check/index.html` 試聽。
- 執行端：`src/audio/clips.ts`（查詢規則，純函式、有單元測試）、`src/audio/clipPlayer.ts`（Web Audio 播放與快取）、`src/audio/speech.ts` 的 `say()`（整段一致規則、退回裝置語音）；e2e 在 `e2e/voice-clips.spec.ts`。
- 盤點時發現的既有問題（未修改）：英語題沒有指定朗讀語言時預設 en-US，所以 1,054 句中文題目（例如「「一」用英文怎麼說？」）用裝置語音時會被英文聲音唸。預錄語音已依內容用中文語速產生，不受影響；裝置語音的部分待使用者決定是否修正。

## 10. 暫停檢查點（2026-10-02，使用者要關機）

已完成（都還沒 commit）：

- 執行端：`src/quiz/spoken.ts`、`src/ui/lines.ts`、`src/audio/clips.ts`、`src/audio/clipPlayer.ts`、`speech.ts` 接上預錄語音、設定「優先使用預錄語音」、注音描寫題先唸符號；單元測試 685 個（筆順檔那 1 個在高負載時偶爾逾時，單獨跑會過）。
- 盤點與產生：3,377 句、40 MB、總長約 6,422 秒，0 失敗；長度檢查 0 異常（`scripts/voice/check-durations.mjs`）。
- 修正：數字鍵帽 U+20E3 造成亂唸（`cleanForSpeech` 轉成數字）、破折號改頓號、公布答案只唸文字、「第 N」改國字（Whisper 抽查發現「第 2 課」被唸成「第兩課」）、電話號碼逐字唸。
- e2e：`voice-clips.spec` 5 個、`voice.spec` 4 個、回歸 15 個都通過（是在上述修正與重產之前跑的）。

2026-10-02 恢復後已完成：步驟 1（Whisper 抽查 701 句、100 句低於 0.85，已確認沒有「第兩」；快取改成以音檔檔名為鍵）、步驟 2（建置與 e2e 24 個通過）。剩步驟 3、4。

接續步驟：

1. `node --env-file-if-exists=.env scripts/voice/check.mjs 2>&1 | Tee-Object -FilePath logs\voice-check.log`：重跑 Whisper 抽查（已聽寫過的句子有快取，只會送出改過的句子），整理試聽清單給使用者。
2. `npm run build` 後重跑 `e2e/voice-clips.spec.ts`、`e2e/voice.spec.ts` 與回歸組（smoke、english、life、chinese、mobile、shooter、curriculum、recycle、writing）。
3. 回報前呼叫 advisor；回報後詢問是否 commit 與推上 GitHub。
4. 待使用者決定：英語題的中文題目用裝置語音時被英文聲音唸（既有問題）、筆順檔測試的逾時是否調高、之後是否改付費方案。
