# CC0 背景音樂挑選報告

調查日期：2026-10-01。範圍：找授權為 CC0 的音樂，下載、轉成 MP3 放進 `public/audio/music/`，並登記授權。
授權明細在 `public/audio/music/CREDITS.md`。下載、轉檔、分析用的檔案都在暫存區（見第 9 節），專案內只有成品與兩份文件。

## 0. 先說清楚：這些曲子沒有人試聽過

撰寫者沒有耳朵。風格判斷靠三樣東西：作品頁的標籤與說明、作者標的速度（BPM 寫在檔名裡）、我用 ffmpeg 與 numpy 做的客觀量測（響度、動態、發音密度、頭尾接縫）。
這些只能證明「音量平穩、沒有靜音、接縫沒有爆音」，**不能證明好不好聽、會不會太吵、適不適合小孩**。第 7 節列了請人實際聽的項目。

## 1. 結論與成品

| 成品 | 曲名（作者） | 長度 | 大小 | 位元率 | 響度 I／LRA／TP | 循環 |
| --- | --- | ---: | ---: | --- | --- | --- |
| `island.mp3` | Cozy Puzzle In-Game 3（MintoDog） | 124.44 秒 | 1,992,012 B | 128 kbps | -18.4 LUFS／1.5 LU／-7.8 dBTP | 是 |
| `quiz.mp3` | Cozy Puzzle In-Game 2（MintoDog） | 128.00 秒 | 2,048,854 B | 128 kbps | -22.4 LUFS／1.2 LU／-11.5 dBTP | 是 |
| `result.mp3` | Cozy Puzzle Clear (Jingle)（MintoDog） | 5.65 秒 | 137,318 B | 192 kbps | -16.3 LUFS／2.2 LU／-6.4 dBTP | 否 |
| `shop.mp3` | Buy Something!（CleytonKauffman） | 88.00 秒 | 1,408,959 B | 128 kbps | -20.4 LUFS／3.2 LU／-5.6 dBTP | 是 |

- 合計 5,587,143 bytes（約 5.6 MB，5.3 MiB），低於 7 MB；每個檔都低於 2.5 MB（最大是 quiz，2.05 MB）。
- 全部 44.1 kHz 立體聲（用 `ffprobe` 確認）。
- 四個授權欄位都是單一的 `CC0`，沒有雙重授權、沒有「Attribution Instructions」。shop 那頁有作者自願加的「Copyright/Attribution Notice」，見第 6 節。
- 響度是刻意調過的：quiz 比 island 低 4 dB，shop 居中，result 略高於背景樂。原曲母帶都在 -11 LUFS 上下（很吵），不調整的話 quiz 會比 island 還大聲，和「不搶注意力」相反。調整用固定增益，沒有壓縮或限幅。

## 2. 挑選理由

**評分順序**：先看授權（只收單一 CC0），再看作者聲明的用途與標籤，最後看量測。MintoDog 的 Cozy Puzzle 系列有四個優點：同一作者、同一風格、作者明說 loopable，而且檔名的 BPM 與曲長剛好是整數小節（例如 108 BPM 的 124.444 秒 = 56 小節），代表循環點對在小節線上。

### island：Cozy Puzzle In-Game 3

- 標籤：cozy、mallet、wind、Acoustic Guitar、Bass、Relax、loopable。對應需求裡的木琴／鐘琴（mallet）加撥弦（木吉他，不是烏克麗麗）加木管，氣質溫暖。
- 108 BPM，124 秒，落在 1～3 分鐘內。
- 量測：LRA 1.5 LU，0.5 秒 RMS 的 5～95 百分位只差 4.5 dB，起伏很小；發音密度約 5 個／秒（偏密，是這四首裡最忙的）。
- 疑慮：它是「益智遊戲關卡音樂」，不是專為兒童寫的。是否「童趣」要靠耳朵判斷。

### quiz：Cozy Puzzle In-Game 2

- 標籤：cozy、brass、synth、piano、Relax、loopable。
- 90 BPM，是系列裡最慢的一首；128 秒；LRA 1.2 LU，0.5 秒 RMS 的 5～95 百分位只差 3.1 dB，是所有候選裡最小的，音量最平穩。
- 烘進檔案的響度 -22 LUFS，比 island 安靜。
- 疑慮：標籤有 brass（銅管）。若銅管主旋律太搶，會干擾朗讀；備案是改用 In-Game 3（但那樣 island 要另找）。

### result：Cozy Puzzle Clear (Jingle)

- 5.65 秒，在 3～8 秒的範圍內，不循環。標籤 jingle、fanfare、clear、woodwinds、brass、bell。
- 這是同一個作品頁裡的「Clear」（過關）版，不是「Failure」（失敗）版。
- 尾端自然衰減到靜音（最後 150 毫秒低於 -60 dBFS），沒有被切斷。
- Kenney 的 Music Jingles 包（85 個，授權也是 CC0）我也看過：全部只有 0.28～1.75 秒，達不到 3～8 秒，所以沒採用。它們適合日後當「答對／答錯」音效。

### shop：Buy Something!（Shop Theme）

- 作者標明用途是商店，風格是 bossa nova 電梯音樂，標籤 store、flute、bossa nova，說明寫「Looped: Yes」。該頁下載數 1,860（只能當社群有人拿來用的旁證，不代表好聽）。
- 88 秒，LRA 3.2 LU。
- 量測的速度約 81 BPM（工具估計，可能有倍速或半速的誤差，作者沒標 BPM）。
- 這首的循環接縫要處理：來源尾端振幅不為零，接回開頭會有約 -27 dBFS 的跳變，所以最後加了 10 毫秒淡出（見 CREDITS.md）。處理後跳變是 -69 dBFS。
- 來源用 zip 內的 OGG，因為同名 MP3 沒有無縫標籤。

## 3. 客觀量測（成品）

`seam_check.py` 把成品解碼後「尾接頭」檢查接縫；`analyze.py` 量響度、動態、發音密度。

| 成品 | 解碼取樣數 | 與來源取樣數 | 頭／尾靜音 | 接縫絕對跳變 | 接縫頻譜通量百分位 |
| --- | ---: | --- | --- | --- | --- |
| island | 5,488,000 | 相同 | 0 ms／5 ms | -50.8 dBFS | 98.2%（未超過全曲 p99） |
| quiz | 5,644,800 | 相同 | 0 ms／0 ms | -43.6 dBFS | 93.7% |
| shop | 3,880,800 | 相同 | 77 ms／1 ms | -68.9 dBFS | 11.5% |
| result | 249,035 | 相同 | 2 ms／154 ms（自然收尾） | 不循環 | 不循環 |

- 「取樣數相同」代表 LAME 的無縫標籤有生效：ffmpeg 解碼時切掉了編碼延遲與補零，所以 MP3 的長度與來源逐取樣一致。
- 「絕對跳變」是第一個取樣與最後一個取樣的差。低於約 -40 dBFS 在音樂中基本聽不到。
- 「接縫頻譜通量百分位」：把接縫處的頻譜變化量和全曲其他位置比，越接近 100% 代表接縫處變化越像離群點；三首都沒有超過 p99。
- 這些檢查只能排除「靜音、淡出、爆音、響度突變」。**樂句接得順不順，要用耳朵聽。**
- 作者聲明的 loopable 與整數小節長度是更強的證據，但仍是推論。

## 4. 授權檢核方式

1. 每個作品頁都用程式抓回 HTML，印出「License(s):」欄位的原始碼，確認只有一項 `CC0`（連結 `http://creativecommons.org/publicdomain/zero/1.0/`）。
2. 另外用 WebFetch 對四個頁面獨立讀一次，結果相同：License 皆為 CC0，沒有「Attribution Instructions」欄位。
3. 逐字授權文字與作者說明都抄在 CREDITS.md。
4. 剔除規則：作品頁授權欄位出現兩項以上（例如「OGA-BY 3.0」加「CC0」）者一律不收，即使技術上可以選 CC0。被剔除的例子：Feel Good Island、Feel Good Island Loop、Story Time、Good Morning、Up in the Sky、Gone Fishin'。其中 Feel Good Island 的標籤最符合（marimba、Kids、Educational），但它是雙重授權。若使用者願意接受「雙重授權可選 CC0」，可以重新評估。

## 5. 候補清單（都是單一 CC0，都已下載量測過，但未試聽）

| 位置 | 作品 | 網址 | 特點與缺點 |
| --- | --- | --- | --- |
| island | Children's March Theme（CleytonKauffman） | https://opengameart.org/content/childrens-march-theme | 標籤 cartoon、children、cute、playful，作者說 loops seamlessly，64 秒。缺點：進行曲（長號、小鼓），較短，接縫處響度落差較大（尾 -36 dB 到頭 -22 dB）。作者還提醒「MP3 is not good for loop/play mode」，應從 zip 內的 WAV／OGG 轉檔。 |
| island | Happy Ukelele Island Surfing Theme（Tarush Singhal） | https://opengameart.org/content/happy-ukelele-island-surfing-theme | 有烏克麗麗、島嶼主題，136 秒。缺點：標籤含 8bit、drums；頻譜圖顯示分段明顯、中段很滿，動態大（LRA 6.9 LU），作者沒說可循環；有署名備註欄。 |
| island | Cozy Puzzle In-Game 1（MintoDog） | https://opengameart.org/content/cozy-puzzle-in-game-1 | bossa nova、薩克斯風、長笛、mallets，118 BPM，130 秒。接縫百分位 99.8%，略不如 In-Game 3。 |
| island／quiz | Children's Game Music 1 Picnic、4 Activity（heartade） | https://opengameart.org/content/childrens-game-music-1-picnic 、 https://opengameart.org/content/childrens-game-music-4-activity | 作者說是為「兒童教育遊戲」做的，文字上最貼近。缺點：只有 37 秒與 52 秒，結尾是淡出（不是循環曲），要自己做循環。 |
| quiz | Cozy Puzzle In-Game 3（MintoDog） | https://opengameart.org/content/cozy-puzzle-in-game-3 | 質地均勻，沒有銅管；但 108 BPM 較快、音符較密。 |
| quiz | Bluebonnet（Kistol） | https://opengameart.org/content/bluebonnet | 獨奏鋼琴，約 72 BPM，作者提供專用的 looped 版；最不搶注意力。缺點：動態比 MintoDog 大（LRA 4.9 LU），接縫量測不如 MintoDog；有署名備註欄。 |
| shop | Cozy Puzzle Stage Select（MintoDog） | https://opengameart.org/content/cozy-puzzle-stage-select | 100 BPM、77 秒，接縫最乾淨（-57.6 dBFS），沒有署名備註欄；但不是專為商店寫的。 |

## 6. 疑慮與已知限制

1. **未試聽**（第 0 節）。尤其要確認 quiz 的銅管是否搶戲、island 是否夠「童趣」。
2. **MP3 循環要走 Web Audio API。** `<audio loop>` 播 MP3，多數瀏覽器在循環點會有空隙。成品已寫入 LAME 無縫標籤，用 `decodeAudioData` 解成 `AudioBuffer`，再用 `AudioBufferSourceNode.loop = true`（three.js 的 `AudioLoader` 就是這條路）才會無縫。iOS Safari 的實際接縫沒有實測，要在真機驗證。
3. **響度已寫死在檔案裡。** 程式端仍要有音量設定，且 TTS 朗讀題目時建議把背景樂再壓低（ducking）。
4. **shop 頁面有「Copyright/Attribution Notice」欄位**（「Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman」）。授權欄是 CC0，法律上不要求，CREDITS.md 已列。若使用者連這種標示都不想碰，改用 Stage Select 即可。
5. **CC0 是上傳者的自我宣告。** OpenGameArt 不查證每件作品的權利歸屬；這兩位作者（MintoDog、CleytonKauffman）的作品頁都沒有提到第三方素材或 AI 生成工具（既沒聲明也沒否認）。這不是法律意見。
6. **MintoDog 的作品是 2026 年新發佈**，下載數不高（77、71、110），沒有任何人留言可供旁證。
7. 作品頁與下載網址日後可能變動；成品與來源檔的 SHA-256 已記在 CREDITS.md 與下方，專案內已有成品副本。
8. 未做：沒有在手機喇叭、藍牙喇叭或小耳機上測試低頻（island、quiz、shop 三首的能量有 53%～58% 在 250 Hz 以下，小喇叭可能聽起來偏薄）。

## 7. 建議使用者試聽確認的項目

- island：整體是否「輕快、溫暖、童趣」？節奏有沒有太密、太像咖啡廳爵士？
- quiz：銅管（brass）旋律會不會干擾聽題目朗讀？把題目朗讀疊上去聽一次最準。
- result：是否像「完成了」的小號角？5.6 秒是否太長、太短？
- shop：bossa nova 的風格對二年級學生與家長是否合適？
- 四首全部：連續循環聽 3 次，聽接縫有沒有「喀」一聲或節拍卡一下（shop 優先）。
- 音量：把 island、quiz 在手機與電腦喇叭上對照，確認 quiz 較小聲但仍聽得到。
- iOS Safari 真機：用 Web Audio 循環，聽接縫。

## 8. 重現指令（PowerShell 7）

下載與解壓（`$work` 為任意暫存目錄）：

```powershell
$work = Join-Path $env:TEMP 'music-src'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$base = 'https://opengameart.org/sites/default/files'
Invoke-WebRequest "$base/cozy_puzzle_in-game_3_bpm108.mp3" -OutFile "$work\in-game_3.mp3"
Invoke-WebRequest "$base/cozy_puzzle_in-game_2_bpm90.mp3" -OutFile "$work\in-game_2.mp3"
Invoke-WebRequest "$base/mp3_cozy_puzzle_jingle_result.zip" -OutFile "$work\jingle.zip"
Invoke-WebRequest "$base/shop_theme.zip" -OutFile "$work\shop.zip"
Expand-Archive "$work\jingle.zip" -DestinationPath "$work\jingle" -Force
Expand-Archive "$work\shop.zip" -DestinationPath "$work\shop" -Force
```

轉檔（增益值依來源響度計算：目標 LUFS 減去來源 LUFS；來源響度用 `ffmpeg -i <檔> -af ebur128=peak=true -f null -` 量）：

```powershell
$out = 'public\audio\music'
$enc = @('-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-compression_level', '0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact')
ffmpeg -y -i "$work\in-game_3.mp3" -af 'volume=-6.5dB'  @enc -b:a 128k "$out\island.mp3"
ffmpeg -y -i "$work\in-game_2.mp3" -af 'volume=-10.8dB' @enc -b:a 128k "$out\quiz.mp3"
ffmpeg -y -i "$work\shop\shop_theme\Buy Something!.ogg" -af 'volume=-5.1dB,afade=t=out:st=87.99:d=0.01' @enc -b:a 128k "$out\shop.mp3"
ffmpeg -y -i "$work\jingle\mp3_Cozy Puzzle Jingle & Result\Cozy Puzzle Clear (Jingle).mp3" -af 'volume=-5.2dB' @enc -b:a 192k "$out\result.mp3"
```

驗證長度、位元率與雜湊：

```powershell
Get-ChildItem public\audio\music\*.mp3 | ForEach-Object {
  ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels,bit_rate:format=duration -of csv=p=0 $_.FullName
  '{0}  {1:N0} bytes  {2}' -f $_.Name, $_.Length, (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
```

成品 SHA-256（轉檔結果會因 ffmpeg 版本而略有不同，這是本次使用 ffmpeg 8.0 的結果）：

| 檔案 | SHA-256 |
| --- | --- |
| island.mp3 | `b7836bdeea159dac6a0dc9b15f7675d5feca7aa600fed84633e18445a3fbdf3d` |
| quiz.mp3 | `f17d25eafee2961c8387cd1384a371c6cdab7278c812fc8e83ad4491d1a6ebba` |
| shop.mp3 | `f69d3b824463d7625fa1973898ba2e5958c37d5d78f58c5c32cf38fca62d3fb5` |
| result.mp3 | `cd662031887b31003497bce16a1ca32fd03b3cbd3b4336291d5776eb55def98c` |

## 9. 檔案位置（暫存區，非專案內）

目錄：`C:\Users\KEVINT~1\AppData\Local\Temp\claude\d--GitHub-learning-game\bb580a18-c2a6-46e8-b30c-b0a32129f347\scratchpad\music\`

- 下載的來源與候選檔：`dl\`；OpenGameArt 作品頁快取：`cache\`
- 抓取工具：`oga_tools.py`、`brief.py`、`getfiles.py`、`comments.py`
- 轉檔腳本：`build-music.ps1`（輸出 `build-result.json`、`build-music.log`）
- 分析腳本：`analyze.py`、`seam_check.py`、`bands.py`、`punch.py`；頻譜圖：`img\`
