# 背景音樂授權與來源（CREDITS）

本資料夾的四個 MP3 都來自 OpenGameArt.org，作者在作品頁把授權標為 **CC0 1.0（公眾領域貢獻宣告）**。
CC0 不要求署名，這裡仍照實列出作者與來源，以示尊重，也方便日後查證。

- 查證日期：2026-10-01（每一頁都在當日以程式抓取頁面並讀取「License(s)」欄位，另用 WebFetch 獨立讀一次，結果都只列出 CC0 一項）。
- CC0 1.0 官方說明頁：https://creativecommons.org/publicdomain/zero/1.0/
- 該頁「No Copyright」段落原文：

  > The person who associated a work with this deed has dedicated the work to the public domain by waiving all of his or her rights to the work worldwide under copyright law, including all related and neighboring rights, to the extent allowed by law. You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.

- 「Other Information」另有一句提醒：專利與商標權不受 CC0 影響，他人對該作品可能享有的權利（例如肖像權、隱私權）也不受影響。本專案只使用純音樂，不涉及這些權利。
- CC0 是上傳者自己的宣告，OpenGameArt 並未替每件作品做權利清查。本文件記錄的是「作者在頁面上宣告了什麼」，不是法律意見。

下表是成品對照；各曲目的詳細來源在後面逐節列出。

| 成品檔 | 曲名 | 作者 | 用途 |
| --- | --- | --- | --- |
| `island.mp3` | Cozy Puzzle In-Game 3 | MintoDog | 島上探索（循環） |
| `quiz.mp3` | Cozy Puzzle In-Game 2 | MintoDog | 答題背景（循環） |
| `result.mp3` | Cozy Puzzle Clear (Jingle) | MintoDog | 結算短樂句（不循環） |
| `shop.mp3` | Buy Something!（Shop Theme） | CleytonKauffman | 商店／家長區（循環） |

所有成品共同的處理：解碼來源檔、套用固定增益（`volume` 濾鏡，不做壓縮或限幅）、以 libmp3lame 重新編碼為 44.1 kHz 立體聲 MP3、移除中繼資料。循環曲目的長度與來源逐取樣相同，沒有裁掉任何樂句。

---

## island.mp3　島上探索主題

- 曲名：Cozy Puzzle In-Game 3
- 作者：MintoDog（OpenGameArt 使用者頁：https://opengameart.org/users/mintodog）
- 作品頁：https://opengameart.org/content/cozy-puzzle-in-game-3
- 作品頁發佈日：2026-03-26
- 授權：CC0 1.0
- 授權原文（作品頁「License(s):」欄位逐字）：`CC0`，連結指向 `http://creativecommons.org/publicdomain/zero/1.0/`
- 作者的頁面說明（逐字）：「Music for puzzle game. This music is loopable. File formats are mp3 and ogg.」
- 作品頁標籤（逐字）：cozy, Puzzle, stage, mallet, wind, Acoustic Guitar, Bass, Relax, loopable
- 作品頁沒有「Attribution Instructions」或「Copyright/Attribution Notice」欄位。
- 原始檔名：`cozy_puzzle_in-game_3_bpm108.mp3`（4,980,111 bytes，LAME 3.100，320 kbps）
- 下載網址：https://opengameart.org/sites/default/files/cozy_puzzle_in-game_3_bpm108.mp3
- 來源檔 SHA-256：`819286797479011670efd54f1b15c48fb24705d49e7472de63e084a2d021d9db`
- 我們的修改：
  - 固定增益 -6.5 dB（來源約 -11.5 LUFS，調到約 -18 LUFS），來源響度很大，降低也能避免重新編碼後削峰。
  - 重新編碼為 MP3 128 kbps CBR、44.1 kHz、立體聲，移除中繼資料。
  - 不裁切、不加淡入淡出；長度與來源相同（5,488,000 取樣，124.444 秒）。
- 成品：`island.mp3`，1,992,012 bytes

## quiz.mp3　答題背景音樂

- 曲名：Cozy Puzzle In-Game 2
- 作者：MintoDog
- 作品頁：https://opengameart.org/content/cozy-puzzle-in-game-2
- 作品頁發佈日：2026-03-06
- 授權：CC0 1.0
- 授權原文（逐字）：`CC0`，連結指向 `http://creativecommons.org/publicdomain/zero/1.0/`
- 作者的頁面說明（逐字）：「Music for puzzle game. This music is loopable. File formats are mp3 and ogg.」
- 作品頁標籤（逐字）：cozy, Puzzle, stage, brass, synth, piano, Relax, loopable
- 作品頁沒有署名相關欄位。
- 原始檔名：`cozy_puzzle_in-game_2_bpm90.mp3`（5,122,216 bytes，LAME 3.100，320 kbps）
- 下載網址：https://opengameart.org/sites/default/files/cozy_puzzle_in-game_2_bpm90.mp3
- 來源檔 SHA-256：`bae99bca0d05474323c94a142942af41bc9227aed83ec197a14083a8684cc6dd`
- 我們的修改：
  - 固定增益 -10.8 dB（來源約 -11.2 LUFS，調到約 -22 LUFS），刻意比 island 安靜約 4 dB，讓孩子聽得清楚題目朗讀。
  - 重新編碼為 MP3 128 kbps CBR、44.1 kHz、立體聲，移除中繼資料。
  - 不裁切、不加淡入淡出；長度與來源相同（5,644,800 取樣，128.000 秒）。
- 成品：`quiz.mp3`，2,048,854 bytes

## result.mp3　結算短樂句

- 曲名：Cozy Puzzle Clear (Jingle)，出自作品集「Cozy Puzzle Jingle & Result」
- 作者：MintoDog
- 作品頁：https://opengameart.org/content/cozy-puzzle-jingle-result
- 作品頁發佈日：2026-05-07
- 授權：CC0 1.0
- 授權原文（逐字）：`CC0`，連結指向 `http://creativecommons.org/publicdomain/zero/1.0/`
- 作者的頁面說明（逐字）：「Jingle & Result music for puzzle game. File formats are mp3 and ogg. --Track list-- Cozy Puzzle Clear (Jingle) / Cozy Puzzle Clear (Loop) / Cozy Puzzle Failure (Jingle) / Cozy Puzzle Failure (Loop)」
- 作品頁標籤（逐字）：cozy, Puzzle, jingle, fanfare, finish, results, clear, failure, woodwinds, brass, bell
- 作品頁沒有署名相關欄位。
- 原始檔名：下載的是 `mp3_cozy_puzzle_jingle_result.zip`（5,566,234 bytes），取其中 `mp3_Cozy Puzzle Jingle & Result/Cozy Puzzle Clear (Jingle).mp3`（228,964 bytes，LAME 3.100，320 kbps）
- 下載網址：https://opengameart.org/sites/default/files/mp3_cozy_puzzle_jingle_result.zip
- zip 的 SHA-256：`8b3e44c1c7df291da330ae3b852bbdca9c6d87358636b9470747464a5c9c47a1`；內含 MP3 的 SHA-256：`91bf349850b5b6d737bb3b65d2625fd284496d3d4472c49bdbe3826d4f0adfef`
- 我們的修改：
  - 固定增益 -5.2 dB（來源約 -10.8 LUFS，調到約 -16 LUFS）。
  - 重新編碼為 MP3 192 kbps CBR（檔案很小，位元率拉高以降低重新編碼損失）、44.1 kHz、立體聲，移除中繼資料。
  - 不裁切、不加淡出（來源尾端本來就自然衰減到靜音）；長度與來源相同（249,035 取樣，5.647 秒）。
- 成品：`result.mp3`，137,318 bytes

## shop.mp3　商店／家長區音樂

- 曲名：Buy Something!（OpenGameArt 作品名：Shop Theme）
- 作者：CleytonKauffman
- 作品頁：https://opengameart.org/content/shop-theme
- 作品頁發佈日：2016-04-18
- 授權：CC0 1.0
- 授權原文（逐字）：`CC0`，連結指向 `http://creativecommons.org/publicdomain/zero/1.0/`
- 作者的頁面說明（逐字）：「Music: Buy something! Looped: Yes. Format: MP3 and OGG. -- Hiiiii, this is a "bossa nova", elevator music and etc. You can use in a store or whatever else you want. There are 2 versions in zip file, normal and radio (it sounds like it's being played through elevator speakers). Your feedback is highly appreciated!」
- 作品頁標籤（逐字）：store, mall, happy, zelda, bossa nova, Jazz, flute, buy, money
- 作品頁另有「Copyright/Attribution Notice」欄位，內容（逐字）：「Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman」。這是作者自願附上的標示；授權欄位仍是 CC0，法律上不要求署名，我們照列。
- 原始檔名：下載的是 `shop_theme.zip`（13,931,428 bytes），取其中 `shop_theme/Buy Something!.ogg`（3,564,380 bytes，Vorbis 320 kbps，正常版，不是 Radio Edit）
- 下載網址：https://opengameart.org/sites/default/files/shop_theme.zip
- zip 的 SHA-256：`127e5556a7ef9d944e5a44b012ffc6f833fa673c4c2091b71909159b9965c836`；內含 OGG 的 SHA-256：`fa023f1d2e3d3194136bb8f877925d5547e5489439b24658698fbbb458de5b21`
- 我們的修改：
  - 選用 zip 內的 OGG 當來源，不用同名的 MP3：該 MP3 沒有 LAME 無縫標籤（長度 88.033 秒，多出編碼延遲），OGG 剛好是 88.000 秒。
  - 固定增益 -5.1 dB（來源約 -14.9 LUFS，調到約 -20 LUFS）。
  - 最後 10 毫秒加線性淡出。來源尾端的振幅不是零，接回開頭時會有一個約 -27 dBFS 的跳變（循環時可能聽到「喀」一聲）；淡出後跳變降到約 -69 dBFS。
  - 重新編碼為 MP3 128 kbps CBR、44.1 kHz、立體聲，移除中繼資料。開頭原有的約 77 毫秒靜音保留（它是節拍的一部分）。
  - 長度與來源相同（3,880,800 取樣，88.000 秒）。
- 成品：`shop.mp3`，1,408,959 bytes
