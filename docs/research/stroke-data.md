# 國字筆順描寫練習：資料來源與可行性研究

> 查證日期：2026-10-01。範圍：國語「國字筆順描寫練習」（前端 Hanzi Writer 3.7.3），筆順須採**台灣教育部標準筆順**。
> 本文件只記錄查證結果與建置建議；所有探索用腳本都留在暫存區（見第 9 節），專案內沒有新增程式碼。
> 所有數字都由暫存區腳本實際跑出，不是憑印象。查不到或沒驗證的地方集中列在第 8 節「待確認」。

---

## 0. 結論（先講）

**能做，但不能只靠單一來源。** 建議採「animCJK 繁中為主、makemeahanzi 補缺、CNS 全字庫當驗證與自動修正依據」的管線。

| 項目 | 結果 |
| --- | --- |
| animCJK ZhHant 是否符合台灣筆順 | **大致符合**。以 CNS 比對（1,011 字），筆畫數相同且順序一致 **96.2%**；類型順序不同 2.0%（20 字，經教育部原圖複核後 11 字確認、3 字無法判定、6 字是誤報）；筆畫數不同 1.8%（18 字，其中 16 字是「礻／衤」部首，經教育部原圖複核是 CNS 多算一筆，animCJK 與教育部相同）。 |
| makemeahanzi（hanzi-writer-data 的來源）是否符合 | **不符合**。同樣比對（9,560 字）一致率僅 **75.8%**；順序不同 12.2%，筆畫數不同 12.1%。makemeahanzi 自己的 README 就寫明是中華人民共和國筆順。 |
| animCJK 能否直接餵進 hanzi-writer 3.7.3 | **能，不需座標轉換**。只需把 JSONL 轉成「字 → `{strokes, medians}`」的查表，由 `charDataLoader` 回傳。已用 headless Chrome 實測載入、動畫、模擬描寫（quiz）全部通過。 |
| animCJK 的字數 | 只有 **1,013 字**（HSK v3 一至三級的繁體字 + 少量其他字），**不是**為台灣國小設計的字表。 |
| 國小字頻前 1,000 字覆蓋率 | animCJK **788 / 1,000（78.8%）**；makemeahanzi 1,000 / 1,000；CNS 筆順 1,000 / 1,000。animCJK 缺 212 字（清單見第 6 節）。 |
| 前 1,000 字建置後的品質（animCJK 優先，缺字由 makemeahanzi 補，以教育部原圖為基準） | **940 字（94.0%）可直接用**；28 字順序不同（需重排）；22 字筆畫數不同（需拆筆，全是 makemeahanzi 補的字）；9 字解析度不足需人工目視；1 字（裏）是異體字，改用「裡」。 |
| 主要風險 | ① 28 字順序要修，其中約 6 字無法自動修，要人工排；② 22 字筆畫數與台灣標準不同（艹、阝、辶、之、骨、鬼等部件台灣多一畫），無法靠重排解決；③ 國小字頻表授權限「申請許可後、非商業」；④ 教育部筆順動畫是 CC BY-NC-ND，不能當資料來源。 |

### 建議的資料管線（摘要，細節見第 7 節）

1. 字表（txt，一行一字）→ 2. 每字優先取 animCJK `graphicsZhHant.txt`，缺字取 makemeahanzi `graphics.txt` →
3. 以 CNS 筆順碼驗證（筆畫數、類型序列），不一致者用 CNS 自動重排並列入人工複核清單 →
4. 套用人工覆寫檔（`overrides`）→ 5. 輸出每字 `{strokes, medians}` + 清單（來源、授權、是否修改）→
6. 另從 CNS 取注音、部首、筆畫數，合併成「字 → 屬性」資料 → 7. 附上 Arphic 授權全文與修改聲明、CNS 顯名聲明。

### 缺字怎麼處理（摘要）

* animCJK 缺的 212 字：改取 makemeahanzi，再以 CNS 驗證；其中 19 字順序不同，自動重排可修好約八成（以暫存區實驗，35/42 成功），其餘人工；22 字筆畫數不同要決定「人工拆筆／暫不放進描寫練習／接受大陸筆畫數並標示」。
* 異體字（字頻表裡的「裏」）：對應到教育部標準字「裡」。
* 若之後想一次解決，教育部《國字標準字體筆順學習網》有 6,063 字的標準筆順，但授權為 CC BY-NC-ND 3.0 臺灣（非商業、禁止改作），要不要用要自行做法律判斷或向教育部申請（見 2.4、7.5）。

---

## 1. 研究方法與判斷基準

| 層級 | 做法 | 用途 |
| --- | --- | --- |
| 權威依據 | **CNS11643 全字庫的筆順碼序列**（1 橫、2 豎、3 撇、4 點、5 折），依使用者指示當台灣標準 | 全面比對 |
| 分類器 | 用 medians（筆畫中線折線）以啟發式規則判斷每筆屬於 1～5 哪一類（`classify.py`）。逐筆準確率 **95.85%**（animCJK 與 CNS 筆畫數相同的 993 字、10,349 筆，逐位置對位；包含少數真實順序差異，所以是準確率下限） | 把來源資料轉成可與 CNS 比對的類型序列 |
| 雜訊容忍的比對 | 平均一個字約 10 筆，即使順序全對，也有約三成的字會因一筆誤判而「字串不相等」。因此用「混淆機率成本 + 匈牙利指派」判斷：允許任意重排後能否大幅降低不一致成本（gain ≥ 5 nats 才算『類型順序不同』）（`order_compare.py`） | 區分「分類雜訊」與「真正的順序差異」 |
| 獨立驗證 | 教育部《國字標準字體筆順學習網》的「全筆順提示」PNG（逐步累加圖）。用兩種幾何匹配法（輪廓區域法、中線覆蓋法）還原「教育部第 k 筆 = 來源第 j 筆」，兩法一致且成本差 ≥ 0.8 才判定『順序不同』（`moe_verify.py`、`run_moe_verify2.py`） | 確認 CNS 與資料到底差在哪；**僅供查證，圖不納入專案** |

限制（誠實說明）：

* 兩筆「同類型」互換（例如兩橫的先後）無法由類型序列偵測；教育部原圖的幾何比對可以，但 45 px 的小圖解析度有限，密集小筆畫的字會判成「無法判定」。
* 分類器比對對 CNS 的「類型歸類慣例」敏感（見 4.1），所以分類器標為「順序不同」的字，只有約七成經教育部原圖確認（前 1,000 字內：41 字被標，28 確認、8 誤報、5 無法判定）；反向看，分類器判為一致的字，沒有任何一字被教育部原圖判為順序不同（922 一致、4 無法判定、1 查無）。

---

## 2. 各資料來源

### 2.1 animCJK 繁體中文（`graphicsZhHant.txt`）

* 網址：<https://github.com/parsimonhi/animCJK>（`graphicsZhHant.txt`、`dictionaryZhHant.txt`）
* 版本：master，最新 commit `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6`（2026-05-13）。建議建置時**固定這個 commit**。
* 檔案：`graphicsZhHant.txt` 2,988,095 bytes（sha256 前綴 `731fe26345833745`）、`dictionaryZhHant.txt` 168,277 bytes。
* **字數：1,013 字**（兩檔同字集）。其中 1,010 字在 U+4E00–9FFF，另有 々（U+3005）、〇（U+3007）、𡻕（U+21EE5，擴充 B）。

**README 對 ZhHant 的描述（逐字引用）：**

> The svgsZhHant folder contains svg files corresponding to Chinese "HSK v3 level 1 to 3 traditional hanzi" (907 characters) and some other characters. Note that some simplified characters have more than one corresponding traditional character. In all, the svgsZhHant folder contains 1013 characters.

**README 沒有明文說 ZhHant 的筆順依據是台灣教育部。** 它只在「References」列出「Taiwanese Minister Of Education, https://stroke-order.learningweb.moe.edu.tw (Chinese characters used in Taiwan)」作為交叉查核來源（前文是 "We used various sources to cross-check our data."），並在更新紀錄寫「add some traditional hanzi (hsk2 and hsk3) in svgsZhHant (Taiwan)」與「Note: there are many tiny differences (stroke order, glyph, ...) between the traditional hanzi of svgsZhHans and those of svgsZhHant.」。所以「符合台灣筆順」是**我們用 CNS 與教育部原圖驗證出來的結果（第 4 節）**，不是上游的承諾。

`dictionaryZhHant.txt` 的 `set` 欄位值：`taiwan4808` 982 字、`t31` 300、`t32` 302、`t33` 305（HSK v3 一／二／三級繁體）、`tu` 98（other traditional）、`tc` 2（components）。README 與 index.html 沒說明 `taiwan4808`，**我們用教育部官方 4,808 常用字清單核對：982 字與標籤完全一致**（標籤沒有誤標或漏標）。

**格式與座標系（證據）：**

* 每行一個 JSON，鍵為 `character`、`strokes`（每筆一條 SVG path，M/L/Q/C/Z）、`medians`（每筆一條中線折線），**與 makemeahanzi 的 `graphics.txt` 相同**。`strokes` 與 `medians` 長度一致（1,013 字全數檢查）。
* 座標系與 makemeahanzi 相同：1024 單位、y 軸向上，需 `scale(1,-1) translate(0,-900)` 才能正向顯示。證據有三：
  1. README：「text files are provided (graphicsJa.txt, graphicsZhHans.txt, etc.) that have the same format as the graphics.txt file of Makemeahanzi.」
  2. animCJK 自己的 `makeSvgsFromGraphics.php`：「transform coordinates of path nodes (x2 = x1, y2 = 900-y1)」、「Svg coordinates will be transformed using scale(1,-1) and translate(0,-900)!」
  3. 資料範圍：medians x 30～1009、y −96～885；strokes path y −117～894，落在 makemeahanzi 規定的 y∈[−124, 900] 內。
  並且第 3 節的實測中，animCJK 與 makemeahanzi 同一個字用同一個 hanzi-writer 渲染，位置完全重疊。

**格式樣本（「小」，路徑節錄，其餘以 … 省略）：**

```json
{"character":"小","strokes":["M499,695C500,673 502,485 501,132C500,118 495,108 488,101C481,96 468,96 448,100…C489,740 496,719 499,695Z","M227,467C229,445 230,422 221,382…C245,501 224,496 227,467Z","M706,472C747,431 793,383 842,323…C694,490 698,480 706,472Z"],"medians":[[[475,778],[534,727],[530,97],[505,25],[359,112]],[[237,490],[266,451],[267,406],[132,188]],[[703,501],[851,376],[881,298]]]}
```

`dictionaryZhHant.txt` 樣本：`{"character":"一","set":["t31","taiwan4808"],"definition":"one; Kangxi radical 1","radical":"一","decomposition":"","acjk":"一.1"}`。**沒有注音（pinyin）也沒有 makemeahanzi 的 `matches`**；注音要從 CNS 取（第 2.3 節）。

**授權（`licenses/COPYING.txt` 逐字節錄）：**

> You can redistribute and/or modify text files prefixed by "graphics" and SVG files of AnimCJK project representing a character under the terms of the Arphic Public License as published by Arphic Technology Co., Ltd.
> You can redistribute and/or modify all other files (including SVG files of AnimCJK project representing kana or strokes) under the terms of the GNU Lesser General Public License ...

`dictionary*.txt` 屬 LGPL（衍生自 Unihan）；我們只用 `graphicsZhHant.txt`，適用 **Arphic Public License（APL）**。APL 關鍵條文（`ARPHICPL.TXT` 英文版逐字節錄）：

> 1. Copying & Distribution: You may copy and distribute verbatim copies of this Font in any medium, without restriction, provided that you retain this license file (ARPHICPL.TXT) unaltered in all copies.
> 2. Modification: ... a) You must insert a prominent notice in each modified file stating how and when you changed that file. b) You must make such modifications Freely Available as a whole to all third parties under the terms of this License ...
> ... mere aggregation of another work not based on the Font with the Font on a volume of a storage or distribution medium does not bring the other work under the scope of this License.

對本專案的意義：資料可免費、含商業地使用與散布；**但只要我們修改資料（例如重排筆畫順序、補筆畫），修改後的資料檔就要用 APL 釋出、帶修改聲明並保留授權全文**；遊戲程式碼本身屬「單純聚合」，不被 APL 感染（這是條文字面解讀，不是法律意見）。

### 2.2 makemeahanzi / hanzi-writer-data

* 網址：<https://github.com/skishore/makemeahanzi>（`graphics.txt` 30,778,076 bytes、**9,574 字**；commit `bddc96d41bef78427ed0e034e9f7e31d71fd1b92`，2026-03-08）。npm `hanzi-writer-data@2.0.1`（授權 `SEE LICENSE IN ARPHICPL.TXT`）。
* hanzi-writer-data 每字 JSON 的 `strokes`、`medians` 與 makemeahanzi `graphics.txt` **9,568 / 9,574 字完全相同**（不同的 6 字：瑤袤謠遙颻黧），另外多了 `radStrokes`（來自 dictionary 的 matches）。
* **筆順依據（README 逐字）：**
  > This project is focused on building stroke order diagrams that follow the People's Republic of China (PRC) stroke order. Some characters are written with different stroke orders in Japan, Taiwan, and elsewhere. I don't have the time or knowledge to produce similar data for those orderings ...
* 座標（README 逐字）：「The upper-left corner is at position (0, 900). The lower-right corner is at position (1024, -124).」「`<g transform="scale(1, -1) translate(0, -900)">`」。
* 授權（`COPYING`）：`graphics.txt` 屬 APL（衍生自 Arphic PL KaitiM GB、Arphic PL UKai）；`dictionary.txt` 屬 LGPL。hanzi-writer 本體為 MIT（`LICENSE`、版本 3.7.3，npm `latest`）。

### 2.3 全字庫 CNS11643 開放資料

* 資料集：<https://data.gov.tw/dataset/5961>（「CNS11643中文標準交換碼全字庫(簡稱全字庫)」）；資料集頁最後修改 2026-08-10，內容版本 `20260805`（`release.txt`）。
* 下載（本次已實際下載並解壓）：
  * 屬性資料 <https://www.cns11643.gov.tw/opendata/Properties.zip>（3,158,491 bytes）
  * 中文碼對照表 <https://www.cns11643.gov.tw/opendata/MapingTables.zip>（809,868 bytes）
  * 版本說明 <https://www.cns11643.gov.tw/opendata/release.txt>
  * 字型檔（Fonts_Kai.zip、Fonts_Sung.zip）本次**沒有下載**。
* 對照表與屬性檔皆為 **UTF-8、Tab 分隔**，第一欄是「CNS 字碼 = 字面-編碼」（如 `1-4451` = 第 1 字面的 0x4451）。檔名在 zip 內是 CP950 編碼（解壓時要自行轉碼，否則中文檔名亂碼）。

**授權（data.gov.tw 資料集 API 的 `notes`，逐字）：**

> 1.本資料集授權使用者可依使用目的需求選擇『政府資料開放授權條款-第一版』或『開源字型授權1.1版(OFL 1.1) 』單一授權使用(非以上二種授權同時兼具)。

屬性資料（注音、筆順等）不是字型，適用**政府資料開放授權條款－第 1 版**。關鍵條文（<https://data.gov.tw/license>，逐字）：

> 二(一) 各機關所提供之開放資料，授權使用者不限目的、時間及地域、非專屬、不可撤回、免授權金進行利用，利用之方式包括重製、散布、公開傳輸、公開播送、公開口述、公開上映、公開演出、編輯、改作，包括但不限於開發各種產品或服務型態之衍生物。
> 三(二) 使用者利用依本條款提供之開放資料，及後續之衍生物，應以符合附件所示「顯名聲明」要求之方式，明確標示原資料提供機關之相關聲明；未盡顯名標示義務者，視為自始未取得開放資料之授權。

顯名聲明格式：「提供機關／單位 [年份] [開放資料釋出名稱與版本號]」＋「此開放資料依政府資料開放授權條款 (Open Government Data License) 進行公眾釋出，使用者於遵守本條款各項規定之前提下，得利用之。」（資料集頁的發布者聯絡信箱網域為 moda.gov.tw；實際要寫的「提供機關」名稱請以資料集頁為準，見第 8 節。）

**屬性檔清單與格式（官方《全字庫屬性資料說明文件.txt》逐字）：**

> 「CNS_strokes_sequence.txt」為全字庫的筆順資料表格
> 第一個欄位：CNS字碼(字面-編碼)
> 第二個欄位：該CNS字碼的筆順資料(1表示「橫」、2表示「豎」、3表示「撇」、4表示「點」、5表示「折」)

| 檔案 | 內容 | 筆數（行） | 樣本（Tab 分隔） |
| --- | --- | --- | --- |
| `CNS_strokes_sequence.txt` | 筆順碼 | 94,919 | `1-4421⇥1`　`1-4451⇥534`　`1-4A3C⇥3151543` |
| `CNS_phonetic.txt` | 注音；**同一 CNS 碼多個讀音就多行** | 117,249 | `1-4421⇥ㄧ`　`1-4421⇥ㄧˊ`　`1-4421⇥ㄧˋ` |
| `CNS_radical.txt` | 部首代號 1～214 | 97,291 | `1-2435⇥2`　`1-4A3C⇥62` |
| `CNS_radical_word.txt` | 代號 → 部首字（說明文件寫「EUC 編碼」，**實際檔案第二欄是部首字**） | 214 | `1⇥一⇥`　`62⇥戈⇥` |
| `CNS_stroke.txt` | 筆畫數（十進位） | 97,361 | `1-2122⇥1`　`1-4A3C⇥7` |
| `CNS_source.txt`、`CNS_cangjie.txt`、`CNS_component*.txt`、`CNS_pinyin_1/2.txt` | 字形來源、倉頡、部件、拼音 | — | 本次不使用 |
| `MapingTables/Unicode/CNS2UNICODE_Unicode {BMP,2,3,15}.txt` | CNS 碼 → Unicode 碼位（16 進位；4 位 = BMP，5 位首碼 = 字面） | 34,599 + 48,770 + 652 + 20,659 = 104,680 | `1-4421⇥4E00`　`1-2121⇥3000` |

重要觀察：

* CNS ↔ Unicode 是**乾淨的一對一**（104,680 個 CNS 碼、沒有重複、沒有一個 Unicode 對到多個 CNS 碼）。「字面 15」是私用區自造字（FExxx、F6001…），合併時排除。
* **4,808 個教育部常用字：筆順、注音、部首、筆畫數 4,808 / 4,808 全部齊全**；字頻前 1,000 字也是 1,000 / 1,000。
* 第 1 字面 6,277 字（含符號）中 5,402 字有筆順；第 2 字面 7,651 字全有筆順；全庫（不含私用區）84,021 個 Unicode 字，76,282 字有筆順、76,872 字有注音、77,139 字有部首、77,208 字有筆畫數。
* **筆畫數與筆順碼長度不一定相等**：全庫 2,216 字不相等，但 4,808 常用字只有 2 字（嘴 15／16、毒 8／9）。比對時以「筆順碼長度」為準。
* **注音**：列出的是**全部**讀音（含破音與罕用音，例如「不」5 個、「和」7 個，「我」有 `ㄜˇ`、`ㄨㄛˇ`），順序是檔案內出現順序，不代表常用度；字頻前 1,000 字中有 316 字有多個讀音。第一聲不標調、輕聲符號 `˙` **寫在字首**（200 個讀音，如 `˙ㄉㄜ`）。用字集是 37 個注音符號 + `ˊˇˋ˙`。要在遊戲裡顯示「課本讀音」，需要另外定義主讀音（CNS 沒有提供）。
* **部首**：代號 → `CNS_radical_word.txt` 的字，內容含變體，如 `心（忄⺗）`、`水（氵氺）`、`玉(𤣩)`；取第一個字當康熙部首。

**合併腳本**：`cns_merge.py`（暫存區）把以上檔案合併成「Unicode 字 → `{cns, zhuyin[], radical, strokeCount, strokeSeq}`」，輸出 `cns_merged.json`（9.4 MB，84,021 字）。範例：

```json
{"我":{"cns":"1-4A3C","zhuyin":["ㄜˇ","ㄨㄛˇ"],"radical":"戈","strokeCount":7,"strokeSeq":"3151543"},
 "小":{"cns":"1-4451","zhuyin":["ㄒㄧㄠˇ"],"radical":"小","strokeCount":3,"strokeSeq":"534"}}
```

### 2.4 教育部《國字標準字體筆順學習網》（僅供查證，不當資料來源）

* 網址：<https://stroke-order.learningweb.moe.edu.tw/>；營運單位為 CMEX 中文數位化技術推廣基金會（與全字庫同一單位；**是否同源於 CNS 沒有官方說明**，只是經驗上高度一致，見 4.4）。
* 授權（`page.jsp?ID=52` 逐字）：
  > 「國字標準字體筆順學習網」著作權係中華民國教育部所有。其目的為提供本部標準楷體字之筆順教學利用，不得用於商業用途。
  > 本網站「筆順動畫」、「全筆順提示」之著作係採用創用CC姓名標示－非商業性－禁止改作3.0臺灣版授權。如需引用，請標示「中華民國教育部」及本站網址。
* 內容：搜尋結果引用的站方說法為「6,057 個國字與 37 個注音符號」（萌典語料為 6,063 檔，兩個數字的差異本次未釐清）；單字頁的「全筆順提示」圖網址規則為 `/words/{Unicode 大寫十六進位}.png`（例：`/words/6211.png`、`/words/4F86.png`；**小寫會 404**），50×725 px，每格 45 px，第 k 格 = 寫完前 k 筆；17 筆以上為 95 px 寬兩欄（**由右欄先、再左欄**）。網站另提供 iframe 嵌入碼。
* 本次**只下載 1,047 張小圖（約 2 KB／張，間隔 0.4 秒）到暫存區做比對**，沒有重製或散布。

### 2.5 其他現成資源（參考，未納入建議）

* **萌典 moedict-app 的筆順語料**：`https://r2-assets.moedict.tw/stroke-corpus/current.json` 指向 6,063 個 JSON 檔、共 103,537,307 bytes，格式是每筆 `{outline:[{type:"M"|"L"|"Q",…}], …}`，README 寫明筆畫資料來源是教育部筆順學習網。**等於是教育部標準筆順的機器可讀版**，但上游授權（CC BY-NC-ND）的「禁止改作」是否涵蓋格式轉換，需自行判斷或詢問教育部；本次沒有轉換或驗證它。
* **`hanzi-writer-data-acjk`（npm 1.0.0）**：把 animCJK 的 graphics 轉成每字一個 JSON（`{strokes, medians}`，**座標完全沒轉換**），與我們的結論一致（它也證明「不經轉換」是業界作法）。
* **jackcsk/kanlinji**：以 animCJK 繁中（1,013 字）為預設、缺字後備用 hanzi-writer-data（大陸）並在畫面標示來源——與本報告的做法同方向。
* **mattsue1003/stroke-order-copybook**：README 稱 946 字的數字筆順「已和教育部筆順提示逐字比對」，其餘字讓使用者對照教育部圖手動排序；資料同樣來自 animCJK 與 makemeahanzi。

---

## 3. hanzi-writer 3.7.3 的資料格式，以及 animCJK 能否直接餵入

來源：npm 套件 `hanzi-writer@3.7.3` 的 `dist/types/index.esm.d.ts` 與 `dist/index.esm.js`（本機安裝於暫存區 `hw/`）、官方文件 <https://hanziwriter.org/docs.html>。

```ts
type CharacterJson = { strokes: string[]; medians: number[][][]; radStrokes?: number[] };
type CharDataLoaderFn = (char: string,
  onLoad: (data: CharacterJson) => void,
  onError: (err?: any) => void) => Promise<CharacterJson> | CharacterJson | void;
```

* `strokes`：每筆一條 SVG path 字串；`medians`：每筆一條 `[[x,y],…]`；`radStrokes` 可選（只用於部首上色）。`generateStrokes` 只讀這三個鍵，**多餘的鍵（如 `character`）會被忽略**。
* 座標：原始碼 `Positioner` 寫死 `CHARACTER_BOUNDS = [{x:0,y:-124},{x:1024,y:900}]`（註解 "All makemeahanzi characters have the same bounding box"）——**與 animCJK 的座標範圍一致**。
* 官方文件寫法：「Loading character data is ... accomplished via passing a custom closure to the `charDataLoader` option」；預設載入器從 jsdelivr 抓 `hanzi-writer-data@2.0.1/{字}.json`。
* **quiz（描寫）模式以資料陣列順序判定「下一筆」**：`strokeMatches(userStroke, character, this._currentStrokeIndex)`，成功才 `_currentStrokeIndex += 1`；比對用 medians 的起訖點、長度與 Fréchet 距離。所以**資料順序就是教學順序，資料錯就教錯**。

**實測結果（暫存區 `hw_test/`，headless Chrome + Playwright）：**

| 測試 | 結果 |
| --- | --- |
| 把 animCJK 一筆資料去掉 `character` 後由 `charDataLoader` 回傳，同字同時畫 makemeahanzi 與 animCJK | 兩者渲染位置、大小完全重疊（`hw_test/shot.png`）；`radStrokes` 為 undefined 也正常 |
| 以 animCJK 資料呼叫 `animateCharacter()`（我、永、小） | `onComplete` 皆回傳 `canceled:false` |
| quiz 模式沿 median 模擬描寫（91 個字，animCJK 與 makemeahanzi 各一次） | **animCJK 91 / 91 通過、makemeahanzi 91 / 91 通過** |
| 負向對照：animCJK「皮」（資料順序為大陸序：橫折先） | 照資料順序描寫全部接受；先描台灣標準第 1 筆（撇）→ 被判 `miss`，證明資料順序決定教學順序 |

**結論：animCJK 的 `graphicsZhHant.txt` 不需座標轉換，只需一個極薄的轉接**（JSONL 逐行解析 → 以 `character` 為鍵 → `{strokes, medians}`），例如：

```js
// 示意（說明用，不是專案程式碼）
const writer = HanziWriter.create('target', '我', {
  charDataLoader: (char, onLoad, onError) => {
    const d = DATA[char];           // DATA：建置產出的 { 字: {strokes, medians} }
    d ? onLoad({ strokes: d.strokes, medians: d.medians }) : onError(new Error('missing ' + char));
  },
});
```

未實測：真人手寫的容錯（medians 品質對判分寬鬆度的影響）；上述模擬是「理想軌跡」，只證明資料結構相容與順序規則。

---

## 4. 筆順比對

### 4.1 CNS 對「鉤」類筆畫怎麼歸類（實測）

結論：**所有帶鉤或轉折的筆畫一律歸 5（折）；提與短點則依形狀歸 1 或 4／3。**

| 字 | CNS 碼 | 逐筆解讀（對照渲染圖 `renders/hooks.png`） |
| --- | --- | --- |
| 小 | `534` | 豎鉤＝**5**、左點（形如短撇）＝**3**、右點＝**4** |
| 我 | `3151543` | 撇 3、橫 1、豎鉤 **5**、提 **1**、斜鉤（戈鉤）**5**、點 4、撇 3 |
| 心 | `4544` | 點 4、臥鉤 **5**、點 4、點 4 |
| 成 | `135543` | 橫 1、撇 3、橫折鉤 **5**、斜鉤 **5**、點 4、撇 3 |
| 水 | `5534` | 豎鉤 **5**、橫撇 **5**、撇 3、捺 4（捺歸 4） |
| 子 | `551` | 橫折（撇折）**5**、豎鉤 **5**、橫 1 |

其他慣例（由 10,349 筆資料歸納）：緩的「提」（扌的提）歸 1，**氵的陡提歸 4**；左上的短點視形狀歸 4 或 3；捺歸 4；所有「橫折、豎折、橫撇、豎彎鉤、臥鉤、斜鉤」皆 5。這些慣例已寫進分類器的規則。

### 4.2 animCJK ZhHant 對 CNS 的一致率

比對 1,011 字（1,013 字中，々、亠 無 CNS 筆順；〇 納入但不影響）：

| 類別 | 字數 | 比例 |
| --- | --- | --- |
| 筆畫數相同且順序一致（含分類雜訊） | 973 | **96.2%** |
| 　其中類型序列字串完全相等 | 691 | 68.3% |
| 類型順序不同 | 20 | 2.0% |
| 筆畫數不同 | 18 | 1.8% |

**類型順序不同（20 字，括號為教育部原圖複核結果）：**

* 確認 animCJK 順序與教育部不同（11 字）：來、圍、房、扉、皮、聯、衛、遍、過、關、顧。
* 無法判定（3 字，筆畫多、解析度不足）：體、感、識。
* 分類器誤報，animCJK 順序與教育部相同（6 字）：幣、髒、背、隨、續、熊。

**筆畫數不同（18 字）：** 初、社、祇、祝、神、福、禮、衫、被、裙、補、裡、複、褲、襯、視（16 字，皆「礻／衤」部首）、眞、着（2 字，教育部沒有這兩個異體字的圖）。以教育部原圖步數三角驗證：16 字的 **animCJK 筆畫數 = 教育部步數，CNS 序列多 1 筆**（例：初 animCJK 7／教育部 7／CNS 8；神 9／9／10）。換言之這類字 **animCJK 沒錯，是 CNS 序列對 礻／衤 多算一筆**；這 16 字的筆順本身也已用教育部原圖驗證為「與教育部相同」。

**animCJK 實際上改過台灣筆順的證據**：同一批字與 makemeahanzi 比對，animCJK 已把必、成、我、里、馬、長、出、母、快（忄的豎第二）、花（艹台灣算 4 筆）、這（辶台灣算 4 筆）等改成台灣序／台灣筆畫數；但**仍有未改的**（皮、來、過、房、衛、圍…，見上）。

### 4.3 makemeahanzi 對 CNS 的差距

| 範圍 | 字數 | 順序一致（含雜訊） | 類型順序不同 | 筆畫數不同 |
| --- | --- | --- | --- | --- |
| makemeahanzi 全部（有 CNS 筆順者） | 9,560 | 75.8% | 1,164（12.2%） | 1,154（12.1%） |
| 　限教育部 4,808 常用字 | 4,695 | 74.2% | 618（13.2%） | 593（12.6%） |
| 與 animCJK 同字的 998 字：animCJK | 997 | **96.3%** | 20（2.0%） | 17（1.7%） |
| 與 animCJK 同字的 998 字：makemeahanzi | 997 | 78.1% | 110（11.0%） | 108（10.8%） |

998 字中：兩者皆與 CNS 一致 778、**只有 animCJK 一致 182**、只有 makemeahanzi 一致 1、兩者皆不一致 36。

**筆畫數不同的系統性原因**（makemeahanzi，CNS 比它多 1 筆者 1,059 / 1,154 字）：台灣標準對下列部件的筆畫切法比大陸多一畫——

| 部首（教育部 4,808 內，筆畫數不同／總數） | |
| --- | --- |
| 艸（艹） | 135 / 171 |
| 辵（辶） | 84 / 84 |
| 阜（左阝） | 46 / 47 |
| 邑（右阝） | 24 / 26 |
| 示（礻）／衣（衤） | 25 / 30、31 / 54（但這兩個是 CNS 多算，見 4.2；makemeahanzi 的筆數其實等於教育部步數） |

另有「之」（3 對 4）、骨、鬼、及、巨等個別字。這類差異**無法靠重排解決**，要把一筆拆成兩筆。animCJK 已處理艹、辶、阝（花 8 筆、這 11 筆、陳／陸等不在它的字集），所以對 animCJK 收錄的字不是問題；問題只出在「由 makemeahanzi 補的字」（第 6 節）。

**類型順序不同的字**：全清單 1,164 字在 `compare_results.json`（暫存區）。其中分類器可信度約七成；教育部原圖確認的名單見 4.4 與第 6 節。

### 4.4 教育部原圖驗證（第三方基準）

* **CNS ＝ 教育部標準筆順，經驗上成立**：42 個「來源順序≠教育部」的案例，把筆畫按教育部順序排列後，與 CNS 比對一致 40 例（22 完全相等、18 在雜訊內；剩 2 例是筆畫多的聯、關，解析度不足）；968 個「來源＝教育部」的案例，CNS 一致 957 例（98.9%）；其餘 11 例是分類器歸類差異（例如「無」：我逐步目視教育部圖，順序＝CNS＝makemeahanzi，是誤報）。
* **CNS 不可盡信的唯一已知例外是 礻／衤 的筆畫數**（CNS 多 1 筆，見 4.2）；**筆順則與教育部一致**。
* **維基百科〈筆順〉（zh）的兩岸差異清單不可靠**：它說「皮：中国大陆、台灣、香港、澳門的筆順（先折後撇）」，但教育部現行筆順網與 CNS 都是**撇先**（`35254`），我已目視教育部原圖確認；animCJK 與 makemeahanzi 的皮是橫折先，**都不符合台灣標準**。維基百科對「戈」（點在撇前）、「必」、「忄（豎第二）」、「艹」的說明則與實測相符。
* **CNS 自動重排的可行性**（`reorder_eval2.py`）：對 42 個確認順序不同的案例，只用 CNS 序列做匈牙利指派重排，再用教育部原圖驗證，**35 例成功（83%）**；失敗 7 例：出（makemeahanzi）、悄、懷、爾、編（makemeahanzi）、聯、關（animCJK）——這些要人工排。

### 4.5 兩岸差異字逐字檢查表

判定欄：「一致」＝筆畫數與順序都與教育部（及 CNS）相同；「**順序不同**」＝教育部原圖複核確認不同。腳本：`user_list_table.py`。

| 字 | CNS 筆順碼 | animCJK ZhHant | makemeahanzi |
| --- | --- | --- | --- |
| 必 | `45443` | 一致 | **順序不同**（最後兩筆：台灣撇在最後） |
| 為 | `435554444` | 一致 | **筆數不同**：12 筆（CNS 9、教育部 9） |
| 方 | `4153` | 一致 | 一致 |
| 火 | `4334` | 一致 | 一致 |
| 王 | `1121` | （無此字） | 一致 |
| 里 | `2511121` | 一致 | **順序不同**（中豎在下方橫之後） |
| 馬 | `2111254444` | 一致 | **順序不同**（左豎先於橫折） |
| 長 | `21111534` | 一致 | **順序不同**（左豎先於首橫） |
| 隹 | `32411121` | （無此字） | 一致 |
| 出 | `25252` | 一致 | **順序不同**（中間長豎先寫） |
| 無 | `311222214444` | （無此字） | 一致（CNS 比對曾誤報，教育部圖確認一致） |
| 垂 | `312211211` | （無此字） | **筆數不同**：8 筆（CNS 9、教育部 9） |
| 博 | `121351124154` | （無此字） | 一致 |
| 叉 | `544` | （無此字） | 一致 |
| 田 | `25121` | （無此字） | 一致 |
| 由 | `25121` | 一致 | 一致 |
| 母 | `55441` | 一致 | **順序不同**（兩點先於長橫） |
| 成 | `135543` | 一致 | **順序不同**（點先於撇） |
| 我 | `3151543` | 一致 | **順序不同**（點先於撇） |
| 皮 | `35254` | **順序不同**（撇應最先） | **順序不同** |
| 來 | `12343434` | **順序不同**（豎應排第 2） | **順序不同** |
| 戈 | `1543` | （無此字） | **順序不同**（點先於撇） |
| 戶 | `3351` | （無此字） | **順序不同** |
| 快 | `4245134` | 一致 | **順序不同**（忄的豎排第 2） |
| 花 | `21123215` | 一致 | **筆數不同**：7 筆（CNS／教育部 8；艹台灣 4 筆） |
| 這 | `41112514554` | 一致 | **筆數不同**：10 筆（CNS／教育部 11；辶台灣 4 筆） |

（「順序不同」後的括號說明是我依渲染圖與教育部步驟目視整理，只標出差異點，沒有逐筆命名。）

---

## 5. 國小低年級字表來源與覆蓋率

### 5.1 課綱規定（逐字）

十二年國教國語文領域課程綱要（107 年 1 月，<https://www.k12ea.gov.tw/files/class_schema/課綱/3-國語文/3-1/…>，本機抽取全文）：

> 4-Ⅰ-1　認識常用國字至少 1,000 字，使用 700 字。
> 4-Ⅰ-5　認識基本筆畫、筆順，掌握運筆原則，寫出正確及工整的國字。
> Ab-I-1　1,000 個常用字的字形、字音和字義。　Ab-I-2　700 個常用字的使用。　Ab-I-3　常用字筆畫及部件的空間結構。
> 〔說明〕第一學習階段的用字，應該盡量強調高頻率字、具體詞 ...

課綱**沒有提供官方字表**（教科書開放民間編輯，各版本生字不同），只規定字數並要求以高頻率字為主。因此「依字頻選前 1,000 字」符合課綱精神。

### 5.2 選用的字表：教育部《國小學童常用字詞調查報告書》字頻總表

* 編輯：教育部國語推行委員會；初版 2000-12、二版 2002-03；GPN 1009100224、ISBN 957-01-0462-7（`banchan.htm`）。
* 網址：<https://language.moe.gov.tw/001/Upload/files/SITE_CONTENT/M0001/PRIMARY/shindex.htm>；字頻總表資料庫（dBase）：`…/PRIMARY/download/shrest1.zip`（78,386 bytes，`SHREST1.DBF`，Big5/CP950）；網頁只顯示表的前段，完整表要下載該檔。
* 內容：**5,021 字**、總頻次 1,206,977；欄位：序號、字、部首、筆畫、頻次、累積頻次、百分比、是否收於《國語辭典簡編本》。腳本 `read_dbf.py` 可直接解析；前 1,000 名全部正常解碼（第 1,413 名之後有 49 個造字檔字無法解碼，不影響前 1,000）。
* 樣本來源（`shrest1-2.htm`）：學童讀物（單本書、套書、報紙、雜誌、社教機構導覽）、教學用品（國立編譯館國語課本與習作等）、工具書、電子媒體。**不是只有課本**，高年級讀物也在內；編輯說明寫明先以「小學國語科低中年級」為對象做調查。
* **授權（`applicationform.odt`〈教育部終身教育司語詞資料庫授權聲明及申請表〉逐字）：**
  > 本資料檔案受著作權法及其他智慧財產權相關法律之保護。本資料檔案僅係授權使用，而非販售賣斷。
  > 本相關資料檔案內容，在經過申請許可後，開放給各界從事非商業目的之學術研究、教育推廣用途使用。
  > 本資料檔案不得作為商業營利用途使用；未經許可授權侵犯本資料檔案智慧財產權時，本部得依法追訴法律責任。

  → **技術上可直接下載，但授權要求「申請許可、非商業」，不是開放授權**。建議：建置時只把它當「產生字表的輸入」，**不要把整份字頻表提交進 repo**；若遊戲會公開散布，先依表格向教育部申請（免費，投遞部長信箱或郵寄終身教育司）。本報告只引用彙總數字與缺字清單。
* 前 1,000 名涵蓋該語料 **88.37%**（累積百分比）；其中 999 字屬教育部 4,808 常用字（唯一例外是異體字「裏」）；1,000 字在 CNS 都有筆順、注音、部首、筆畫數。

### 5.3 覆蓋率（前 N 名，animCJK ZhHant／makemeahanzi／CNS 筆順）

| 前 N 名 | 有效字數 | animCJK | makemeahanzi | CNS 有筆順 |
| --- | --- | --- | --- | --- |
| 1,000 | 1,000 | **788（78.8%）**，缺 212 | 1,000（100%） | 1,000 |
| 1,200 | 1,200 | 854（71.2%） | 1,200 | 1,200 |
| 1,500 | 1,499 | 902（60.2%） | 1,499 | 1,499 |
| 2,000 | 1,999 | 942（47.1%） | 1,997（缺 溼、汙，皆為異體字） | 1,999 |

animCJK 覆蓋率隨字頻下降而快速降低（名次 1–250：97.2%、251–500：92.8%、501–750：72.8%、751–1,000：52.4%、1,001–1,500：22.8%）。原因是它的字集依 HSK 而不是台灣國小用字。

**animCJK 缺的 212 字（前 1,000 名）：**
著之真與王吃無臺卻填林斯牠曲灣列寶爾葉細則巴統士呀童骨縣蟲植詩啦亞畢型雄尺伯依妳吸政羅婆令軍引甲圓野竹戰置漸德絲即琴蘭質洲孔源震藏帝呼驚洋玉維姊盡仙究辛喔供田官陳測鼓案針含竟顆研拜枝岩密治項波摩寒未模鼠射陸兵倍貝賞素端孫敬搖獲皇露鏡哇良宮投探奏博乙守局液構頂殺獨透鬼若織尾壁築勞珍愈岸倫江微幼郎榮歐懷梅蓋丁粉免偷豐施袋窗島減魔巨仔劉輪靈齒甚桃陣府符祖伸鬧灰森揮彈尋編移擊紛盛替虎夢尼堡殼圈吉乘異聖暗獎嚴鎮兄猴忍毒悄秦滑哦雅

makemeahanzi 對這 212 字全部有資料。**animCJK 與 makemeahanzi 兩者皆缺：0 字**（前 1,000 名內）。

### 5.4 其他字表來源（評估結果）

| 來源 | 網址 | 內容 | 授權 | 評語 |
| --- | --- | --- | --- | --- |
| 教育部 4,808 常用字 | <https://language.moe.gov.tw/material/info?m=9fe3ff5a-5a8c-4817-9e60-6337dd55a509>（`.ods`、`.pdf`） | 4,808 字，含教育部字號、Unicode | 頁面**未標示授權**（待確認） | 沒有頻率或年級，但可作「標準字」白名單與異體字正規化（已用來驗證 animCJK 的標籤） |
| 教育部《國語小字典》 | <https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_mini_download.html> | xlsx，4,719 列讀音，欄位：單字、部首、總筆畫數、部首外筆畫數、注音、解釋；適用國小低年級 | 創用 CC 姓名標示－禁止改作 3.0 臺灣（允許商業性重製散布，不得修改） | 授權寬鬆但**沒有字頻／年級**，4 千餘字遠大於 1,000 |
| 教育百科「生字詞彙表」 | <https://pedia.cloud.edu.tw/Bookmark/Textword> | 依學年度、年級、出版社（南一、康軒、翰林）列出各課生字 | 站方聲明「以數位內容提供者採取的授權條件為準」，**生字表授權不明**；開放 API 要會員金鑰且是詞條 API | 最貼近「實際教學生字」，但授權與取得方式待確認 |
| 國教院 TBCL／COCT 華語文語料庫 | <https://coct.naer.edu.tw/> | 華語文能力基準漢字表 | 未查證 | 對象是華語學習者，不適合當國小母語字表（未深入） |

**建議**：字表以「可替換的輸入檔」設計（建置腳本讀 `wordlist.txt`，與來源解耦）。第一版用字頻前 1,000 名（自己持有的檔案，授權需申請），之後可換成課本版本的生字表或老師自訂字表。

---

## 6. 前 1,000 字的建置分流結果（以教育部原圖為基準）

「animCJK 優先、缺字取 makemeahanzi」的結果（`final_stats3.py`、`final_pipeline.json`）：

| 來源 | 字數 | 可直接用（一致） | 順序不同 | 筆畫數不同 | 無法判定 | 查無 |
| --- | --- | --- | --- | --- | --- | --- |
| animCJK | 788 | 771 | 9 | 0 | 7 | 1 |
| makemeahanzi 補 | 212 | 169 | 19 | 22 | 2 | 0 |
| **合計** | **1,000** | **940（94.0%）** | **28** | **22** | **9** | **1** |

* 順序不同（animCJK 9 字）：來、過、關、皮、房、顧、圍、聯、衛。
* 順序不同（makemeahanzi 19 字）：爾、葉、童、婆、野、戰、密、波、獲、織、懷、梅、蓋、減、編、盛、夢、悄、哦。
* 筆畫數不同（makemeahanzi 22 字，需拆筆）：著、之、與、統、骨、畢、吸、藏、姊、陳、模、陸、敬、殺、透、鬼、若、郎、魔、巨、陣、滑。
* 無法判定（需人工目視）：animCJK：體、感、觀、麗、識、積、麻；makemeahanzi：牠、驚。
* 查無（異體字）：裏（animCJK 有，教育部標準字為「裡」）。
* 自動重排可修好的比例約八成（35 / 42）；**預估必須人工處理的字約 15 字**：無法自動重排的聯、關（animCJK）與悄、懷、爾、編（makemeahanzi）共 6 字，加上 9 個無法判定的字。
* 對照：若**只用 makemeahanzi**（前 1,000 字全部）——與教育部相同 801（80.1%）、順序不同 85、筆畫數不同 94、無法判定 19、查無 1；在 animCJK 收錄的 788 字上，makemeahanzi 只有 632 字（80.2%）正確，**animCJK 在其中 127 字是對的而 makemeahanzi 是錯的**。

---

## 7. 建議的建置腳本流程（之後在 `scripts/` 實作）

### 7.1 輸入與版本固定

| 輸入 | 固定方式 |
| --- | --- |
| animCJK `graphicsZhHant.txt` | 固定 commit `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6`，記錄 sha256 |
| makemeahanzi `graphics.txt` | 固定 commit `bddc96d41bef78427ed0e034e9f7e31d71fd1b92`，記錄 sha256；或直接用 npm `hanzi-writer-data@2.0.1`（有 6 字不同，見 2.2） |
| CNS `Properties.zip`、`MapingTables.zip` | 記錄 `release.txt` 版本（20260805）與 sha256；解壓檔名需 CP950 轉碼 |
| `wordlist.txt` | 一行一字，UTF-8；第一版由字頻前 1,000 名產生，**不提交字頻原表** |
| `overrides.json`（人工維護） | 見 7.4 |

下載與解壓到 `build/cache/`（不進版控），腳本啟動時檢查 sha256 不符就停止。

### 7.2 步驟

1. **載入 CNS**：依 `cns_merge.py` 的做法合併成「Unicode 字 → `{zhuyin[], radical, strokeCount, strokeSeq}`」，排除私用區；部首取第一個字；注音原樣保留陣列（輕聲 `˙` 在字首）。
2. **字表正規化**：以教育部 4,808 清單做白名單；不在清單內的字（如 裏、佈、溼、汙）列入警告，對應到標準字（裡、布、濕、污）後再查。
3. **選來源**：每字先查 animCJK，缺則查 makemeahanzi，皆缺則報錯。記錄 `source`。
4. **驗證**（每字）：
   * 筆畫數 ≠ CNS 序列長度 → `count_mismatch`（**礻／衤 例外**：CNS 多 1 筆，教育部與 animCJK 相同，這類字用「筆畫數 = CNS 序列長度 − 1 且部首為示／衣」白名單放行）；
   * 用 `medians` 分類出 1～5 類型序列（規則見 `classify.py`，參數見檔頭 `PARAMS`），以 `order_compare.py` 的混淆機率成本 + 匈牙利指派比對：gain ≥ 5 → `order_diff`；
   * 其餘 → `ok`。
5. **自動修正**：`order_diff` 的字，用同一個指派結果重排 `strokes` 與 `medians`，標記 `modified: true`，記錄原順序與新順序。
6. **產生人工複核清單**（HTML 或 markdown）：所有 `order_diff`（不論有無自動修正）、`count_mismatch`、分類雜訊 gain 介於 3～5 的邊界字；每字附 animCJK／makemeahanzi 的渲染圖（含筆畫編號）與**教育部單字頁連結**（只放連結，不嵌入、不下載圖）。人工確認後，把結論寫進 `overrides.json`。
7. **套用覆寫**：`overrides.json` 的格式建議為 `{ "字": { "order": [原筆序 index…], "note": "…", "reviewed": "日期" } }`；拆筆（筆畫數不同）若要做，必須手動編輯 path 並明確標示修改；不做的字寫入 `exclude_from_tracing`。
8. **輸出**：
   * 每字 `{strokes, medians}`（可省略 `character`；`radStrokes` 非必要，如要部首上色可從 makemeahanzi dictionary 的 `matches` 取）；
   * 合併檔或依字分檔（`charDataLoader` 兩者皆可），檔名含內容雜湊；
   * `manifest.json`：每字的 `source`（animCJK／makemeahanzi）、`modified`、`reviewed`、`status`；
   * `chars-meta.json`：CNS 的注音陣列、部首、筆畫數（顯示用）。
9. **授權檔**：輸出目錄放 `ARPHICPL.TXT` 全文、`NOTICE`（資料來源、版本、「哪些字被重排、何時」）、CNS 的政府資料開放授權條款顯名聲明（提供機關／單位、年份、資料集名稱與版本號 20260805）；LGPL 的 dictionary 檔不要混入。
10. **自動化 QA**：
    * 產生接觸印刷（contact sheet）：每字畫出 `strokes` 與編號，抽查；
    * 用 Playwright + hanzi-writer 3.7.3 對**全部字**跑「沿 median 模擬描寫」，要求每字 `onComplete`（暫存區 `hw_test/hw_quiz_check.cjs` 已證明 91 字全數通過）；
    * 對 `count_mismatch` 與 `order_diff` 數量設上限，超過就讓建置失敗，避免上游更新後悄悄變差。

### 7.3 注意事項

* **APL 第 2 條**：重排順序＝修改。修改後的資料檔要以 APL 釋出、保留授權檔、加上修改聲明（可寫在 `NOTICE` 與每個輸出檔頭的 `_notice` 欄位）。
* **不要把教育部的筆順動畫或全筆順提示圖放進專案**（CC BY-NC-ND）。人工複核請用站上連結。
* 分類器是啟發式：換了上游資料要重跑第 1 節的評估（`eval_classifier.py`），準確率跌破 93% 就重調參數。
* `strokes` 內路徑含 `Q` 與 `C` 混合，hanzi-writer 的 SVG 渲染器直接支援，不必改寫。
* **筆畫數不同的 22 字**（見第 6 節）要先決定政策：①人工拆筆（艹、阝等部件可從 animCJK 的同部件參考）；②暫不納入描寫練習，只做認讀；③接受大陸筆畫數並在畫面標示。在決定前，建置腳本請把它們標為 `status: "count_mismatch"` 而不是靜默放行。
* 一個字的多讀音：CNS 只給候選讀音，**主讀音需自行指定**（例如以課本或《國語小字典》決定）。

### 7.4 若想一次解決所有缺字與筆畫數問題

教育部筆順網的標準筆順（約 6,000 字）已有機器可讀版（萌典 stroke corpus，見 2.5）。但授權是 CC BY-NC-ND 3.0 臺灣，且我沒有驗證轉換成 hanzi-writer 格式是否算「改作」。有兩條路：（a）向教育部申請（站上版權頁提供書面申請管道，電話與地址在 `page.jsp?ID=52`）；（b）只用於非商業的個人／班級用途並保留署名。**這是法律判斷，請你自己決定**；我不建議把它當第一版的唯一來源。

---

## 8. 待確認／查不到／未驗證（不猜測）

1. **animCJK ZhHant 的筆順依據**：上游沒有明文宣告採台灣教育部標準，只列為交叉查核來源；本報告的「符合」是以 CNS 與教育部原圖驗證出的結果。
2. **CNS 筆順是否直接來自教育部標準**：沒有官方說明；兩者營運單位同為 CMEX，實測高度一致（見 4.4），但 礻／衤 的筆畫數不同（CNS 多 1 筆）。
3. **教育部原圖比對的上限**：45 px 小圖；筆畫多的字（體、感、識、聯、關、麗…）有「無法判定」；「同類型筆畫互換」只能靠幾何比對偵測，我對 animCJK 的 788 字與 makemeahanzi 的 1,000 字做了，但 animCJK 另外 225 字（不在前 1,000）**未用教育部圖驗證**，僅有 CNS 分類比對結果。
4. **分類器準確率**：逐筆 95.85%，是在可能含真實順序差異的對位資料上量的（下限）；未在獨立標註集上驗證。
5. **animCJK／makemeahanzi 的「字形」（部件形狀）是否完全符合教育部標準字體**：只比對了筆畫數與順序，沒有比對字形。
6. **hanzi-writer quiz 的真人手寫判分寬鬆度**：只做了「沿 median 的理想軌跡」模擬；animCJK 的 medians 與 makemeahanzi 的產生方式不同（animCJK README：「the median paths are different」），實際手感需要真人測試。
7. **CNS 資料「提供機關」的正式名稱**（顯名聲明要寫的）：資料集頁的發布者聯絡信箱網域是 moda.gov.tw，資料集 API 的 `dataProvider` 欄位只是帳號名；請在動工時以 data.gov.tw 資料集頁面或函詢確認。
8. **教育部 4,808 常用字檔（ods/pdf）的授權**：頁面沒有授權標示。
9. **《國小學童常用字詞調查報告書》**：授權需「申請許可」，我**沒有**提出申請；搜尋結果還提到另一張「字頻總表」（5,731 字、頻次 1,982,882，位於 `…/M0001/PIN/biau1.htm`），我**沒有打開檢視**，不確定它屬於哪一份調查（推測是成人用語調查，未驗證）。
10. **教育百科生字詞彙表（南一、康軒、翰林）**：授權不明、沒有實際取得資料；課本生字表若要當第二字表來源要另外確認。
11. **教育部「全字筆順提示 ZIP」與「教育部標準楷書字形檔」**：站上教學資源有提供下載，我沒有下載；字形檔授權另行確認。
12. **萌典 stroke corpus 的轉換**：沒有實際轉成 hanzi-writer 格式，也沒有驗證其與 hanzi-writer 座標系的關係。
13. **LICENSE 的法律解讀**（APL 的「聚合」例外、政府資料開放授權的顯名要求、教育部 CC BY-NC-ND 對格式轉換的適用）都是條文字面解讀，不是法律意見。
14. **維基百科兩岸差異清單**不可靠（皮的例子與教育部現行網站相反）；使用者列出的差異字已逐字驗證（4.5），但**全字庫範圍內的所有兩岸差異字**只有分類器篩出的候選（makemeahanzi 與 CNS 的順序不同候選共 1,164 字，約七成為真），沒有逐字用教育部圖確認。

---

## 9. 暫存區腳本與產物（均在 `C:\Users\KEVINT~1\AppData\Local\Temp\claude\d--GitHub-learning-game\bb580a18-c2a6-46e8-b30c-b0a32129f347\scratchpad\stroke\`）

| 檔名 | 用途 |
| --- | --- |
| `cns_merge.py`／`cns_merged.json` | **CNS 合併腳本與輸出**（Unicode 字 → 注音陣列、部首、筆畫數、筆順碼） |
| `common.py` | 共用載入函式（animCJK、makemeahanzi、4,808、字頻表） |
| `read_dbf.py` | 純標準函式庫的 dBase 讀取器（字頻表 `SHREST1.DBF`） |
| `inspect_animcjk.py` | animCJK 格式、字數、座標範圍檢查 |
| `classify.py` | medians → 1～5 筆畫類型分類器（含參數） |
| `explore_median_features.py`、`explore_outliers.py`、`fit_tree.py`、`grid_search.py`、`debug_cases.py`、`eval_classifier.py` | 分類器設計、調參、評估 |
| `order_compare.py` | 雜訊容忍的順序比對（混淆機率成本 + 匈牙利） |
| `run_compare_ani.py`、`run_compare_all.py`／`compare_results.json`、`compare_summary.txt` | animCJK、makemeahanzi 對 CNS 的完整比對與結果 |
| `svgpath.py`、`render_compare.py`／`renders/` | SVG path 展平、畫筆畫編號圖（hooks.png、li_ma_chang.png、lai_guo.png 等） |
| `moe_verify.py`、`run_moe_verify.py`、`run_moe_verify2.py`、`run_moe_verify3.py`、`moe_test.py`、`moe_cross.py`、`show_moe_steps.py`／`moe_verify*_results.json` | 教育部全筆順提示圖的逐步還原與判定（僅供查證） |
| `count_triangulation.py`／`count_triangulation.json` | 筆畫數不同字的三方（來源／CNS／教育部步數）驗證 |
| `reorder_eval.py`、`reorder_eval2.py`／`reorder_eval2_results.json` | 以 CNS 自動重排的成功率實驗 |
| `wordlist_coverage.py`／`wordlist_coverage.out.txt` | 字頻前 N 名對 animCJK／makemeahanzi／CNS 的覆蓋率與缺字 |
| `final_stats3.py`／`final_stats3.txt`、`final_pipeline.json` | 前 1,000 字的建置分流結果 |
| `user_list_table.py`／`user_list_table.md` | 4.5 的逐字檢查表 |
| `make_hw_test.py`、`make_quiz_test.py`、`hw_test/hw_anim_check.cjs`、`hw_test/hw_quiz_check.cjs`、`hw_test/hw_quiz_order_check.cjs` | hanzi-writer 3.7.3 載入／動畫／描寫（quiz）／順序負向對照實測 |
| `hw/`、`animcjk/`、`mmh/`、`cns/`、`wordlist/`、`moe/` | 下載的原始資料與快取（`moe/cache/` 為教育部圖，僅供查證，勿散布） |
