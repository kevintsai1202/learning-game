# 注音 IVS 字型可行性評估（ButTaiwan/bpmfvs）

評估日期：2026-10-01。評估對象：https://github.com/ButTaiwan/bpmfvs 最新 release v1.500。
所有下載、腳本、測試頁、截圖都在暫存區（見文末「檔案位置」），專案內只有本報告。

## 1. 結論

- **可行。** 子集化後仍保留 IVS（cmap format 14）與 GSUB，Chromium 實測 IVS 選字器可正確切換破音字讀音，注音也確實顯示。
- **推薦：字嗨注音標楷（BpmfZihiKaiStd）為主**，字形接近課本楷書；**注音粉圓（BpmfHuninn）為備選**，圓體、檔案小一半以上。
- **子集大小（約 1,500 字＋注音＋標點＋ASCII＋IVS，woff2）：楷體 801,856 bytes（約 783 KB，原檔 17,141,668 bytes）；粉圓 366,556 bytes（約 358 KB，原檔 4,581,932 bytes）。**
- **授權有出入，需注意：**
  - 楷體**不是純 OFL**：漢字部分是 CC-BY 4.0，漢字以外才是 OFL 1.1，且**宣告了 Reserved Font Name「字嗨」與「Zihi」**。子集化屬 OFL 的 Modified Version，**必須改名**，並須在網站標示 CC-BY 姓名標示。
  - 粉圓是純 OFL 1.1，**沒有宣告 Reserved Font Name**，子集化不強制改名（仍建議改名以免與原字型混淆）。
  - 專案 README 寫「一律統一為 OTF 1.1 授權」，是筆誤（應為 OFL）；實際以字型隨附授權檔為準，而楷體隨附授權檔與 README 的「一律 OFL」不一致，詳見第 3 節。
- **關鍵陷阱：** `pyftsubset` 預設會**把 cmap format 14 整個丟掉**，必須在 `--unicodes` 裡明確加入 `U+E0100-E01EF`，IVS 才會保留（實測見第 4 節）。

## 2. Release v1.500 字型清單

來源：`gh api repos/ButTaiwan/bpmfvs/releases/latest`。

| 檔案 | 大小（bytes） | 備註 |
| --- | ---: | --- |
| BpmfZihiKaiStd.zip | 9,567,647 | 字嗨注音標楷，教育部標準字體風格（推薦） |
| BpmfHuninn.zip | 2,624,461 | 注音粉圓，圓體（備選） |
| BpmfZihiSans.zip | 18,663,918 | 字嗨注音黑體 |
| BpmfZihiSerif.zip | 27,614,480 | 字嗨注音宋體 |
| BpmfIansui.zip | 3,826,678 | 注音芫荽（手寫風） |
| BpmfGenRyuMin.zip | 32,697,956 | 源流注音明體 |
| BpmfGenSekiGothic.zip | 20,215,432 | 源石注音黑體 |
| BpmfGenSenRounded.zip | 25,801,701 | 源泉注音圓體（另一款圓體，檔案較大） |
| BpmfGenWanMin.zip | 43,055,117 | 源雲注音明體 |
| BpmfGenYoGothic.zip | 21,140,655 | 源樣注音黑體 |
| BpmfGenYoMin.zip | 28,522,201 | 源樣注音明體 |
| BpmfSpecial.zip | 1,238,959 | 特殊用途 |
| Bpmf_Bolds.zip | 27,671,929 | 粗體合集 |
| Bpmf_Regulars.zip | 49,250,807 | 一般體合集 |
| Bpmf_VSIME.zip | 13,091,401 | IVS 輸入法相關 |

解壓後的實際 TTF：

| 字型 | 檔案 | 大小（bytes） | glyph 數 | 版本 |
| --- | --- | ---: | ---: | --- |
| 字嗨注音標楷 | BpmfZihiKaiStd-Regular.ttf | 17,141,668 | 32,981 | 1.501 |
| 注音粉圓 | BpmfHuninn-Regular.ttf | 4,581,932 | 21,519 | 1.500 |

**挑選理由**

- 楷體：字形對應教育部標準字體（內含全字庫正楷體），最像國小課本；缺點是原檔大、授權較複雜。
- 粉圓：圓體、親切、遊戲 UI 觀感好，授權單純；字形不是課本楷書，對「學寫字」的情境較不貼切。
- 兩款都支援 6 個 IVS 選擇子 U+E01E0～U+E01E5；子集內 1,501 字都有預設讀音，其中 283 字有第 2 讀音（U+E01E1）、50 字有第 3 讀音、11 字有第 4 讀音、3 字有第 5 讀音（`verify.py` 實測，兩款相同）。

## 3. 授權

### 3.1 楷體（BpmfZihiKaiStd）

隨附 `LICENSE-ZihiKaiStd.txt` 開頭，逐字：

```
BpmfZihiKaiStd-Regular.ttf	字嗨注音標楷
Copyright 2020 But Ko, with Reserved Font Name '字嗨' and 'Zihi'.

	https://github.com/ButTaiwan/bpmfvs

漢字部分 Licensed under CC-by 4.0
	https://creativecommons.org/licenses/by/4.0/deed.zh_TW
	https://creativecommons.org/licenses/by/4.0/

漢字以外 Licensed under SIL Open Font License 1.1
	http://scripts.sil.org/OFL
```

同檔後段：

```
BpmfZihiKaiStd-Regular contains ZihiKaiStd.ttf
	Copyright 2020 But Ko
	https://github.com/ButTaiwan/bpmfvs
	漢字部分 Licensed under CC-by 4.0
	漢字以外 Licensed under SIL Open Font License 1.1

ZihiKaiStd contains 全字庫正楷體

顯名聲明
國家發展委員會 2018 CNS11643中文標準交換碼全字庫 Ver 103.1
此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，
使用者於遵守本條款各項規定之前提下，得利用之。
政府資料開放授權條款：https://data.gov.tw/license

ZihiKaiStd contains Source Han Serif

Copyright 2014-2019 Adobe (http://www.adobe.com/), with Reserved Font
Name 'Source'. Source is a trademark of Adobe in the United States
and/or other countries.
```

字型 name table（用 fontTools 讀出）：

- nameID 0（copyright）：**無**。nameID 13（license description）、14（license URL）：**無**。
- nameID 1／4：`Bpmf Zihi KaiStd Regular`；nameID 5：`Version 1.501`；nameID 6：`BpmfZihiKaiStd-Regular`。
- nameID 8（manufacturer）：`But Ko`；nameID 11（vendor URL）：`https://github.com/ButTaiwan/bpmfvs`。
- 注意：字型本身名稱含 `Zihi`，與 RFN 衝突的就是這個名字。

OFL 1.1 相關條文（取自隨附授權檔）：

```
"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.
```

### 3.2 粉圓（BpmfHuninn）

隨附 `LICENSE-Huninn.txt` 開頭，逐字：

```
BpmfHuninn.ttf	注音粉圓
Copyright 2025 But Ko

	https://github.com/ButTaiwan/bpmfvs

Licensed under SIL Open Font License 1.1

	http://scripts.sil.org/OFL
```

來源聲明：

```
contains Huninn (粉圓).
	https://github.com/justfont/Huninn
	Copyright The Huninn Project Authors justfont <just@justfont.com>
	Licensed under SIL Open Font License 1.1

which based on Kosugi Maru
	https://github.com/googlefonts/kosugi-maru
	Copyright 2021 Motoya Font
	Licensed under Apache-2.0 License
and Varela Round
	https://github.com/avrahamcornfeld/Varela-Round-Hebrew
	Copyright 2011-2016 The Varela Round Project Authors
	Licensed under SIL Open Font License 1.1
```

name table：nameID 0 **無**；nameID 13 = `This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://scripts.sil.org/OFL`；nameID 14 = `http://scripts.sil.org/OFL`。**未宣告 Reserved Font Name。**

### 3.3 專案 README 的說法

README 原文：「隨本規格發佈的注音字型，目前已一律統一為OTF 1.1授權，詳細授權內容請參閱隨字型檔附帶的說明文件。」
（使用者轉述為 OFL 1.1；原文字面是「OTF 1.1」，應為筆誤。）這句話對楷體並不精確：楷體漢字是 CC-BY 4.0。

### 3.4 子集化是否必須改名

- OFL 定義 Modified Version 包含「deleting … any of the components」與「changing formats」，所以**子集化（刪 glyph）與轉 woff2 都算 Modified Version**。
- **楷體：必須改名。** 字型宣告 RFN「字嗨」「Zihi」，第 3 條禁止 Modified Version 使用 RFN 作為主要字型名稱。新名稱不可含「字嗨」「Zihi」（建議也避開 `Bpmf Zihi`）。
  - 另外**不可**在 `font-family` 以外的使用者可見處把子集宣稱為原字型。
  - 漢字部分 CC-BY 4.0 要求姓名標示：保留 But Ko 著作權、註明來源、說明有修改（子集化）。全字庫正楷體另有政府資料開放授權的顯名聲明，建議一併放進網站的「授權與致謝」頁。
- **粉圓：無 RFN，OFL 不強制改名。** 但子集仍是 Modified Version，須維持 OFL 1.1、附原著作權與授權文字、不可單獨販售字型本體。建議仍改名，避免使用者以為是完整版。
- 建議新名稱寫法（不含 RFN，不暗示原廠）：
  - 楷體子集：`LG Bopomofo Kai Subset`（例：`LearningGame Kai Bpmf`）
  - 粉圓子集：`LG Bopomofo Round Subset`
  - 實作時要同步改 name table 的 nameID 1、4、6（以及 16、17 若有），並補上 nameID 0（copyright）、13、14，因為原檔這些欄位是缺的。
- 這是對授權文字的讀法，不是法律意見；正式上線前建議由使用者確認，或寫信向 But Ko 取得書面確認。

## 4. 子集化測試

### 4.1 字集

`charset-1500.txt`（共 1,501 字）：取 Unicode Unihan `kGradeLevel`（香港小學字級，繁體，共 2,633 字，1～6 級依序 460／510／543／598／259／262）從 1 級往上填到 1,500 字，並補入測試字（我們一起去上學會長樂行為等）。
**這是替代字表**，非教育部國小常用字；正式版應換成教育部常用字／課本生字表（見第 7 節）。

### 4.2 指令（PowerShell 7）

先建 venv 並安裝工具：

```powershell
python -m venv .\venv
.\venv\Scripts\python.exe -m pip install fonttools brotli
```

子集化楷體（粉圓只要換輸入與輸出檔名）：

```powershell
.\venv\Scripts\python.exe -m fontTools.subset `
  .\BpmfZihiKaiStd\BpmfZihiKaiStd-Regular.ttf `
  --text-file=charset-1500.txt `
  --unicodes="U+0020-007E,U+3000-303F,U+3100-312F,U+31A0-31BF,U+02C7,U+02C9,U+02CA,U+02CB,U+02D9,U+FF00-FFEF,U+2014,U+2018-201D,U+2026,U+2500,U+E0100-E01EF" `
  --layout-features='*' --glyph-names --notdef-outline `
  --name-IDs='*' --name-languages='*' `
  --flavor=woff2 --output-file=kai-subset.woff2
```

說明：`--unicodes` 最後的 `U+E0100-E01EF` 是 IVS 選擇子範圍，**不可省略**；`--layout-features='*'` 讓 GSUB 的 ss01～ss04 等特性保留。

### 4.3 大小與驗證結果

| 版本 | 原檔 | 子集 woff2 | glyph 數 | cmap | 選擇子（base 字數） |
| --- | ---: | ---: | ---: | --- | --- |
| 楷體 | 17,141,668 | 801,856 | 4,681 | (0,3,4)、(0,5,14)、(3,1,4) | E01E0:1,502／E01E1:283／E01E2:50／E01E3:11／E01E4:3 |
| 粉圓 | 4,581,932 | 366,556 | 4,667 | 同上 | 同上（E01E0:1,501） |

- cmap format 14 保留；GSUB 保留特性：aalt、ss01、ss02、ss03、ss04、ss10、vert、vrt2（原檔多一個 ss05，因子集內沒有第 6 讀音而被剔除）。
- 抽查：會 → E01E0..E01E3（4 個讀音）、長 → 3 個、樂 → 3 個、行 → 4 個、為 → 2 個，全部保留。

### 4.4 對照實驗（IVS 何時會壞）

| 做法（楷體，同一字集） | woff2 大小 | format 14 | GSUB |
| --- | ---: | --- | --- |
| 不加選擇子、不加 layout-features（pyftsubset 預設） | 770,176 | **消失，IVS 失效** | vert、vrt2 |
| 只加 `U+E0100-E01EF` | 777,592 | 保留 | vert、vrt2 |
| 只加 `U+E01E0-E01E5` | 約同上 | 保留 | vert、vrt2 |
| 完整指令（上節） | 801,856 | 保留 | 含 ss01～ss04 |

結論：**IVS 會不會保留取決於 `--unicodes` 有沒有包含選擇子**，與 `--retain-gids` 無關，所以任務第 5 項的替代方案不需要。`--layout-features='*'` 只影響 ss0X（多花約 24 KB），用 IVS 方式選字不必保留；若想讓 CSS `font-feature-settings: "ss01"` 也能用，就保留。

## 5. 瀏覽器驗證（Chromium，Playwright 1.63）

測試頁 `test.html` 用 `@font-face` 載入兩個子集 woff2；`shot.cjs` 截圖並量測，`shot-zoom.cjs` 對破音字列放大。`document.fonts` 兩個字型皆 `loaded`。

肉眼確認（已用 Read 看過 `shot-full.png`、`shot-zoom-B1.png`）：

- 一般句子「我們一起去上學」每個字右側都有注音（截圖解析度下僅能辨識注音大致存在，逐符號未核對），楷體與粉圓皆正常；對照列（系統字型）無注音，證明注音來自字型。
- IVS 切換實測（放大圖）：
  - 會：預設 ㄏㄨㄟˋ → +U+E01E1 ㄎㄨㄞˋ → +U+E01E2 ㄏㄨㄟˇ
  - 長：預設 ㄔㄤˊ → +U+E01E1 ㄓㄤˇ → +U+E01E2 ㄓㄤˋ（第三讀音符號在放大圖上辨識為 ㄓㄤˋ，但解析度有限）
  - 樂：預設 ㄌㄜˋ → +U+E01E1 ㄩㄝˋ → +U+E01E2 ㄧㄠˋ
  - 行、為：截圖可見注音隨選擇子改變，逐符號未核對（B2 放大圖 `shot-zoom-B2.png`）
- 程式側佐證：canvas 繪製「會」「會+U+E01E1」「會+U+E01E2」三者像素兩兩不同（`ivsDiffers`、`ivs12Differs` 皆 true）。
- CSS `font-feature-settings:"ss01"` 可整段切到第二讀音（會長樂行為同時變）；只適合「整段同讀音」，單字選讀音仍以 IVS 為主。
- 子集外的字（例如「龘」）退回系統 fallback 字型，**沒有注音**，且不會報錯；此點對題庫字要先確認字集涵蓋。
- 注意（見第 7 節）：注音符號（ㄎㄨㄞˋ 等）本身若放進**一般文字流**，每個符號是 1.5em 寬的獨立字元，會被撐得很開（截圖 B 區第三行括號內可見），不要把注音符號當文字用這個字型顯示。

截圖（暫存區）：

- `…\scratchpad\font\shot-full.png`（整頁，1920x2550）
- `…\scratchpad\font\shot-zoom-B1.png`、`shot-zoom-B2.png`（破音字列放大）

## 6. 排版：字寬與行高

實測（font-size:100px，Chromium）：

- **每個字（含 ASCII 以外的漢字與全形標點）advance = 1536 / 1024 = 1.5em**，量測結果 150px。漢字本體約占左側 1em，右側 0.5em 是注音欄。也就是說：**一行可容納的字數 = 容器寬 ÷ (1.5 × font-size)**，不是 ÷ font-size。
- ASCII 字母寬度正常（約 0.7em）。
- 字型 metrics：hhea ascent 900／descent -124／lineGap 0（upm 1024）；OS/2 typo 900／-124／205、win 900／240。
- 單行高度實測：`line-height: normal` ≈ 1.11；`1` = 1.0；`1.3` = 1.3；`1.5` = 1.5。
- 注音在**字的右側**，不在上方，所以不需要為了注音另外加大行高；`line-height: 1.3` 即可不擁擠，注音最下方的符號（如 ㄧㄠˋ 的下半）在 `line-height: 1` 時會貼近下一行，**建議 1.4～1.5**。
- 建議字級：國小二年級閱讀 **28～36px**（螢幕閱讀；20px 時注音太小，24px 勉強）。注音在 28px 以下偏細，楷體尤其明顯；若要更好辨認，用粉圓或把字級拉到 32px 以上。
- 建議 CSS：

```css
@font-face {
  font-family: "LG Bopomofo Kai Subset";
  src: url("/fonts/lg-bopomofo-kai-subset.woff2") format("woff2");
  font-display: swap;
}
.zhuyin {
  font-family: "LG Bopomofo Kai Subset", "Microsoft JhengHei", sans-serif;
  font-size: 32px;
  line-height: 1.5;
  letter-spacing: 0;
}
```

## 7. 已知限制與待確認事項

1. **授權要先處理**：楷體漢字 CC-BY 4.0＋RFN；需改名、署名。若想少麻煩，粉圓授權最單純。是否要找 But Ko 確認，待使用者決定。
2. **字集需換正式清單**：本次用 Unihan `kGradeLevel`（港版）當替代。正式應用教育部常用字／國小課本生字（與題庫字交集）。注意字集越大檔越大：約 1,500 字楷體 783 KB；粗估每多 1,000 字加約 0.3～0.5 MB（未實測）。
3. **多音字資料**：repo 內 `ime/poyin_db.txt` 為教育部「國語一字多音審訂表（初稿）」範圍，可作為前端選字器的資料來源；IVS 序號（E01E1…）對應哪一個讀音，要以字型實際 glyph 為準，不能只靠序號猜。建議前端自建「字＋讀音 → 序號」對照表並用測試核對。
4. **注音符號不可獨立用此字型顯示**（每個符號 1.5em 寬）。需要顯示單獨注音（如題幹的 ㄎㄨㄞˋ）時，改用另一個一般字型。
5. **IVS 在 HTML 以外的處理**：JavaScript 字串中 U+E01E1 是補充平面字元（兩個 UTF-16 code unit），做字元切割、`length`、輸入框游標時要用 `Array.from` 或 `Intl.Segmenter`，否則會把選擇子切掉。複製貼上到不支援 IVS 的環境會顯示成預設讀音。
6. **瀏覽器相容**：只在 Chromium（Playwright）驗證。Safari／Firefox／平板（學生實際用的裝置）要在上線前實機補驗 IVS 切換；若某瀏覽器不支援，備案是 GSUB 方式（ss01…，但只能整段切）。
7. **name table 缺 copyright／license 欄位**（楷體 nameID 0／13／14 全缺；粉圓缺 nameID 0）；改名時一併補齊。另外原字型的 Big5 語系名稱字串（langID 0x404）在 fontTools 解碼為亂碼，改名時要一併處理或移除。
8. **未做**：未測 Firefox／Safari；未做字型載入時間量測（783 KB 在行動網路約需數秒，`font-display: swap` 先用 fallback 顯示，但 fallback 無注音，需設計載入中狀態）；未測 Huninn 的完整多音字截圖逐字核對（只核對 會長樂行 的 IVS 有切換）；字集沒有去重 Unihan 與本字型是否繁體字形一致的問題。
9. **範圍外建議（待使用者決定）**：可考慮把字集拆成「基本 500 字」與「擴充字」兩個 woff2，以 `unicode-range` 分段載入，降低首次載入量。

## 8. 檔案位置（暫存區，非專案內）

目錄：`C:\Users\KEVINT~1\AppData\Local\Temp\claude\d--GitHub-learning-game\bb580a18-c2a6-46e8-b30c-b0a32129f347\scratchpad\font\`

- 原始字型與授權：`BpmfZihiKaiStd\`、`BpmfHuninn\`
- 字集：`charset-1500.txt`、產生腳本 `make_charset.py`
- 子集腳本與產物：`subset.sh`、`kai-subset.woff2`、`huninn-subset.woff2`；對照實驗 `kai-default.woff2`、`kai-default-ivs.woff2`、`kai-narrow.woff2`
- 驗證腳本：`verify.py`、`nameinfo.py`
- 測試頁與截圖：`test.html`、`shot.cjs`、`shot-zoom.cjs`、`shot-full.png`、`shot-zoom-B1.png`、`shot-zoom-B2.png`
