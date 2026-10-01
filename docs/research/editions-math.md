# 數學教材版本（康軒、南一、翰林）二年級單元整理

整理日期：2026-10-01。資料檔：`src/content/editions/math/kanghsuan.json`、`nani.json`、`hanlin.json`（格式見 `src/content/editions/schema.ts`），驗證測試：`tests/content/editions-math.test.ts`。

只收單元名稱與內容範圍，不收課本內容與習作題目。學年度以 115（2026–27）為主，另以 114 學年度的計畫與均一教育平台互相印證。

## 1. 先講結論

1. 三個版本各 20 個單元（二上 10、二下 10），60 個單元全部是 `verified`：每個版本都有至少三所學校（跨兩個縣市）寫出同樣的單元名稱，另有均一教育平台的版本對照。沒有 `single-source`、沒有 `missing`。
2. **二上就學完 2～9 的乘法**：三個版本的二上都先教「2、5、4、8」、再教「3、6、7、9」（康軒的單元名稱寫成「3、6、9、7」）。二下才是 0、1、10 的乘法與乘加減兩步驟。所以「二上只學 2、5、10 的乘法」這個前提不成立，乘法單元沒有適合的 `maxLevel`（見第 5 節）。
3. **「一千以內的數」是二下第 1 單元**。二上第 1 單元只到 200（康軒、翰林）或 300（南一）。
4. 三個版本的單元編排不同，不能互相套用：
   - 面積：康軒、翰林在二上（康軒第 5、翰林第 10 單元），南一在二下第 10 單元（和立體形體合為一個單元）。
   - 周長：南一在二上第 10 單元「平面圖形」，康軒、翰林在二下。
   - 重量：康軒在二上第 10 單元（與容量同單元），南一（第 6）、翰林（第 2）在二下。
   - 容量：三版都在二上。
   - 分類（對應 `math.chart`）：康軒二下第 8、翰林二下第 4 有明確的「分類」小節；南一只在二下第 10 單元的課程目標寫「分類再分類」，沒有獨立小節，對應較弱。
5. 專案出題器目前涵蓋不了的教材內容見第 5 節（0 的乘法、單位分數比大小、純加減的兩步驟問題、數值範圍限制等）。

## 2. 資料來源與方法

| 來源 | 內容 | 本次用途 |
| --- | --- | --- |
| 嘉義縣課程計畫及資源整合平台 `https://course.cyc.edu.tw/course/pub/cou_ps.php` | 各國小公告的 109～115 學年度課程計畫，每校有「二年級數學」計畫檔（含上下學期） | 逐校抓 115、114 學年度 |
| 彰化縣國民中小學課程計畫平台 `https://www.curriculum.chc.edu.tw/years/115/schools` | 115 學年度各國小課程計畫，每校有「5-2數學.pdf」（二年級數學，含上下學期） | 逐校抓 115 學年度 |
| 臺南市課程計畫平台 `http://course.tn.edu.tw/` | 安慶國小 114 學年度二年級數學（資源班）計畫，明寫「教材版本 南一」，含上下學期 | 南一的 114 學年度佐證 |
| 均一教育平台 `https://www.junyiacademy.org/topics/k-m2a`、`n-m2a`、`h-m2a` | 「類康軒版／類南一版／類翰林版」二年級數學單元列表（不標學年度） | 版本對照佐證 |

方法：程式逐校下載公開的課程計畫 PDF、抽出文字，以計畫上的「教材版本」欄位判定版本（康軒版第三／四冊、南一版第三冊、翰林版國小數學2 上／下教材），再用全文搜尋比對本檔 20 個單元名稱（忽略空白，並做 Unicode 相容正規化，因為 PDF 常用相容表意字）。每個單元的小節內容（例如「付錢」「估算」「分類」）取自同一批計畫的週次表與課程目標。

比對結果（偵測到的學校數／20 個單元名稱全部吻合的學校數）：

| 平台、學年度 | 康軒 | 南一 | 翰林 |
| --- | --- | --- | --- |
| 嘉義縣 115 | 39／38 | 26／24 | 35／35 |
| 彰化縣 115 | 32／32 | 107／87 | 30／30 |
| 嘉義縣 114 | 41／40 | 28／27 | 32／31 |

沒有全部吻合的學校，原因是：山美國小（康軒）115 學年度「數學」檔實際是一年級計畫；東榮國小（南一）採另一種編排、南新國小（南一）二下仍寫「兩步驟的乘法」（都見第 4 節）；彰化縣有 17 所南一學校的二下第 10 單元名稱被 PDF 表格折行拆開（「面」與「的大小與立體」中間夾了節數與其他欄位），抽字比對不到，並非名稱不同；另有 3 所（草港、舊館、西港）沿用 114 學年度的「兩步驟的乘法」（見第 4 節）。嘉義縣 114 的南一以「兩步驟的乘法」視為同一單元。

JSON 的 `sources` 每個單元共用同一組 5 個來源（A～D 為學校計畫、J 為均一），代號如下。嘉義縣的檔案直接下載網址（`cou_down.php?fn=…`）回傳的 Content-Type 被標成 `text/html`，瀏覽器開不起來，所以 JSON 引用的是學校頁面網址（`cou_dsp.php?sch_id=…&q_year=…`），檔名寫在來源名稱裡；頁面上點檔名即可下載。

- 康軒：A 嘉義縣太保國小 115｜B 嘉義縣布袋國小 115｜C 彰化縣大竹國小 115｜D 嘉義縣太保國小 114｜J 均一「類康軒版」
- 南一：A 嘉義縣朴子國小 115｜B 嘉義縣大同國小 115｜C 彰化縣和東國小 115｜D 臺南市安慶國小 114｜J 均一「類南一版」
- 翰林：A 嘉義縣安東國小 115｜B 嘉義縣雙溪國小 115｜C 彰化縣南興國小 115｜D 嘉義縣新埤國小 114｜J 均一「類翰林版」

嘉義縣學校頁面代號（`sch_id`）：太保 104669、布袋 104607、朴子 104601、大同 104602、安東 104670、雙溪 104603、新埤 104672。彰化縣計畫代號（`plans/…`）：大竹 1442、和東 1561、南興 1470。

未採用的來源：

- 康軒官網「課程計畫」頁（`https://www.knsh.com.tw/service/plan`）：數學領域範本的下載連結指向 Google 雲端硬碟資料夾，本次無法直接讀取。
- 南投縣桐林國小 114（`tlps.ntct.edu.tw`）：單元名稱與南一完全一致，但文件內沒有標明版本，所以不列為南一的來源，只當參考。
- 南投縣永康國小 112、114：計畫沒標版本，二上編排與嘉義縣東榮國小相同（「二位數的加法」「二位數的減法」分成兩個單元），與其他南一計畫不同，未採用（見第 4 節第 8 點）。
- 臺北市、新北市、桃園市等平台、因材網（adl.edu.tw）：本次沒有逐一查。

## 3. 單元一覽

技能欄省略 `math.` 前綴；`maxLevel` 是專案出題難度上限（理由見第 5 節）。「來源」欄的代號見第 2 節；每個單元的詳細內容範圍寫在 JSON 的 `note` 欄。

### 康軒（`kanghsuan-math`）

**二上（康軒版第三冊，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 200 以內的數 | place-value、compare、money-count、money-pay | verified | A、B、C、D、J |
| 2. 二位數的直式加減 | add、sub、word-addsub（maxLevel 2） | verified | A、B、C、D、J |
| 3. 量長度 | length（maxLevel 2） | verified | A、B、C、D、J |
| 4. 加減關係與應用 | word-addsub、add、sub（maxLevel 2） | verified | A、B、C、D、J |
| 5. 面積的大小比較 | measure-compare | verified | A、B、C、D（J 寫作「面積大小的比較」） |
| 6. 兩步驟的加減 | word-addsub、add、sub（maxLevel 2） | verified | A、B、C、D、J |
| 7. 2、5、4、8 的乘法 | mul-meaning、times | verified | A、B、C、D、J |
| 8. 幾時幾分 | clock-read、clock-set | verified | A、B、C、D、J |
| 9. 3、6、9、7 的乘法 | times、mul-meaning | verified | A、B、C、D、J |
| 10. 容量與重量 | measure-compare | verified | A、B、C、D、J |

**二下（康軒版第四冊，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 1000 以內的數 | place-value、compare、money-count、money-pay | verified | A、B、C、D、J |
| 2. 三位數的加減 | add、sub、word-addsub、estimate | verified | A、B、C、D、J |
| 3. 平面圖形 | shapes、perimeter（maxLevel 2） | verified | A、B、C、D、J |
| 4. 年、月、日 | time-units | verified | A、B、C、D、J |
| 5. 乘法 | times、mul-meaning | verified | A、B、C、D、J |
| 6. 兩步驟應用問題 | two-step、times、word-addsub | verified | A、B、C、D、J |
| 7. 公尺和公分 | length | verified | A、B、C、D、J |
| 8. 分類與立體形體 | chart、shapes | verified | A、B、C、D（J 寫作「分類與立體圖形」） |
| 9. 分分看 | share | verified | A、B、C、D、J |
| 10. 分數 | fraction | verified | A、B、C、D、J |

### 南一（`nani-math`）

**二上（南一版第三冊，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 數到300 | place-value、compare | verified | A、B、C、D、J |
| 2. 二位數的加減 | add、sub、word-addsub（maxLevel 2） | verified | A、B、C、D、J |
| 3. 幾公分 | length（maxLevel 2） | verified | A、B、C、D、J |
| 4. 加減的關係與應用 | word-addsub、add、sub、compare（maxLevel 2） | verified | A、B、C、D、J |
| 5. 容量 | measure-compare | verified | A、B、C、D、J |
| 6. 兩步驟的加減 | word-addsub、add、sub（maxLevel 2） | verified | A、B、C、D、J |
| 7. 2、5、4、8 的乘法 | mul-meaning、times | verified | A、B、C、D、J |
| 8. 幾時幾分 | clock-read、clock-set | verified | A、B、C、D、J |
| 9. 3、6、7、9 的乘法 | times、mul-meaning | verified | A、B、C、D、J |
| 10. 平面圖形 | shapes、perimeter（maxLevel 2） | verified | A、B、C、D、J |

**二下（南一版第四冊，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 數到1000 | place-value、compare、money-count、money-pay | verified | A、B、C、D、J |
| 2. 加加減減 | add、sub、word-addsub、estimate | verified | A、B、C、D、J |
| 3. 幾公尺 | length | verified | A、B、C、D、J |
| 4. 年月日 | time-units | verified | A、B、C、D、J |
| 5. 0、1、10 的乘法 | times、mul-meaning | verified | A、B、C、D、J |
| 6. 重量 | measure-compare | verified | A、B、C、D、J |
| 7. 兩步驟的計算 | two-step、times、word-addsub | verified | A、B、C、J（D 寫作「兩步驟的乘法」） |
| 8. 分東西 | share | verified | A、B、C、D、J |
| 9. 單位分數 | fraction | verified | A、B、C、D、J |
| 10. 面的大小與立體 | measure-compare、shapes、chart | verified | A、B、C、D、J |

### 翰林（`hanlin-math`）

**二上（翰林版國小數學2 上教材，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 200 以內的數 | place-value、compare、money-count、money-pay | verified | A、B、C、D、J |
| 2. 二位數的加減法 | add、sub、compare（maxLevel 2） | verified | A、B、C、D、J |
| 3. 認識公分 | length（maxLevel 2） | verified | A、B、C、D、J |
| 4. 加減應用 | word-addsub、add、sub（maxLevel 2） | verified | A、B、C、D、J |
| 5. 容量 | measure-compare | verified | A、B、C、D、J |
| 6. 加減兩步驟 | word-addsub、add、sub（maxLevel 2） | verified | A、B、C、D、J |
| 7. 乘法(一) | mul-meaning、times | verified | A、B、C、D、J |
| 8. 時間 | clock-read、clock-set | verified | A、B、C、D、J |
| 9. 乘法(二) | times、mul-meaning | verified | A、B、C、D、J |
| 10. 面的大小比較 | measure-compare | verified | A、B、C、D、J |

**二下（翰林版國小數學2 下教材，115 學年度）**

| 單元 | 對應技能 | 可信度 | 來源 |
| --- | --- | --- | --- |
| 1. 1000 以內的數 | place-value、compare、money-count、money-pay | verified | A、B、C、D、J |
| 2. 重量 | measure-compare | verified | A、B、C、D、J |
| 3. 加加減減 | add、sub、word-addsub、estimate | verified | A、B、C、D、J |
| 4. 平面圖形與立體形體 | shapes、perimeter、chart | verified | A、B、C、D、J |
| 5. 乘法 | times、mul-meaning | verified | A、B、C、D、J |
| 6. 公尺與公分 | length | verified | A、B、C、D、J |
| 7. 乘與加減兩步驟 | two-step、times、word-addsub | verified | A、B、C、D（J 寫作「乘與加兩步驟」） |
| 8. 年、月、日 | time-units | verified | A、B、C、D、J |
| 9. 分裝與平分 | share | verified | A、B、C、D、J |
| 10. 認識分數 | fraction | verified | A、B、C、D、J |

## 4. 查不到、不一致的地方

沒有查不到的單元（0 個 `missing`）。以下是來源之間寫法不同、或需要留意的地方：

1. **南一二下第 7 單元名稱隨學年度改變**：114 學年度的計畫（嘉義縣 27 所、臺南市安慶國小）寫「兩步驟的乘法」；115 學年度多數寫「兩步驟的計算」（嘉義縣 24 所、彰化縣 104 所），仍寫「乘法」的只有嘉義縣南新國小與彰化縣草港、舊館、西港國小，推測是沿用舊檔。均一也寫「兩步驟的計算」。JSON 採 115 名稱，並在 `note` 說明。內容都是乘加、乘減、加乘、減乘。
2. **康軒二上第 5 單元**：學校計畫寫「面積的大小比較」，均一寫「面積大小的比較」。採學校計畫寫法。
3. **康軒二下第 8 單元**：學校計畫寫「分類與立體形體」，均一寫「分類與立體圖形」。採學校計畫寫法。
4. **翰林二下第 7 單元**：學校計畫寫「乘與加減兩步驟」，均一寫「乘與加兩步驟」（少了「減」）。採學校計畫寫法。
5. **範圍差異**：二上第 1 單元，南一到 300、康軒與翰林到 200。500 元、1000 元，三個版本都放在二下才教（康軒、翰林的二上用到 100 元）。
6. **教材內容與專案決策不同**：
   - 單位分數的大小比較：康軒二下第 10 單元活動三「比大小」、南一二下第 9 單元「幾分之一的大小比較」都有；翰林二下第 10 單元只見等分、二分之一與四分之一、幾分之一，沒有比較。`docs/decisions.md` 決定專案不做單位分數比大小，所以 `math.fraction` 沒涵蓋這部分。
   - 教材用語：康軒有「重量的遞移律」、南一有「乘法交換律」、翰林有「乘法的關係（交換）」。`docs/decisions.md` 規定專案題目不出現這些詞，單純是題目用語，不影響技能對應。
7. **南一的 D-2-1（分類）只有弱證據**：只在二下第 10 單元的課程目標寫「分類再分類」，週次表沒有獨立小節，所以只把 `math.chart` 放在該單元技能的最後一個。
8. **少數學校的南一編排不同**：嘉義縣東榮國小（115、114 學年度都是，計畫標明南一版第三、四冊）的二上是「二位數的加法」「二位數的減法」分成兩個單元，沒有「加減的關係與應用」「兩步驟的加減」，重量放在二上第 10 單元，二下的順序也不同（0、1、10 的乘法在年月日之前、沒有獨立的「重量」）。南投縣永康國小（112、114 學年度，計畫沒標版本）的二上編排與它相同。可能是較早的編排或校本調整，原因不明。本檔以 20 幾所一致的編排為準；若孩子的課本是這種編排，可以用家長專區的「版本包」匯入修正。

## 5. 技能對應的限制與 maxLevel 的設定

**出題器沒有「數值範圍」參數**，只有難度 1～3，而難度 1 就已經出到三位數。所以教材範圍較小的單元（二上到 200／300 的數、二位數加減）無法只靠 `maxLevel` 限縮；建議之後在出題器或版本資料加數值上限，這次沒有做。

有設 `maxLevel` 的單元（共 14 個，都是設 2）與理由：

| 單元 | 技能 | 理由 |
| --- | --- | --- |
| 二上二位數加減（康軒 2、南一 2、翰林 2）、加減關係與應用／加減應用（康軒 4、南一 4、翰林 4）、兩步驟的加減（康軒 6、南一 6、翰林 6） | add、sub、word-addsub、compare | 依 `schema.ts` 註解「二上的加減只到 2」；二位數只有一次進位或退位，難度 3 要兩次進位、含 0 的三位數 |
| 二上公分（康軒 3、南一 3、翰林 3） | length | length 難度 3 是公尺公分換算，二下才教 |
| 平面圖形（南一二上 10、康軒二下 3） | shapes、perimeter | shapes 難度 3 是立體形體；代價是 perimeter 難度 3（正方形）也被排除 |

**不設 `maxLevel` 的情況**（`note` 裡有說明）：

- 二上乘法（康軒 7、南一 7、翰林 7，教 2、5、4、8）：`math.times` 難度 1 是 2、5、10，難度 2 是 2、3、4、5、6、10，難度 3 是 2～9，沒有哪一級剛好等於 2、5、4、8，所以不設。
- 位值、比大小、數錢：難度 1 已經是三位數，設上限也限縮不了範圍，且不確定的事不設（依任務指示）。
- 付錢（`money-pay`，康軒、翰林的二上第 1 單元，以及三個版本的二下第 1 單元有）：難度 3 含 500 元、1000 元的找錢，二上（只到 100 元）會超出範圍，但同一單元的位值、數錢不該跟著被限縮，多技能單元又沒辦法單獨限縮一個技能，所以不設。

**專案技能沒涵蓋的教材內容**：

| 教材內容 | 出現在 | 說明 |
| --- | --- | --- |
| 純加減的兩步驟問題（三個數連加連減、加減混合） | 三版二上（康軒 6、南一 6、翰林 6） | `math.two-step` 每一種題型都含乘法，不含純加減，所以這些單元改對應 `word-addsub`、`add`、`sub` |
| 0 的乘法、被乘數為 1 的乘法、十幾乘以一位數 | 南一二下 5、翰林二下 5、康軒二下 5 | `math.times` 的被乘數取自 2～9 與 10，沒有 0 與 1 |
| 單位分數比大小 | 康軒二下 10、南一二下 9 | 專案刻意不做（見第 4 節） |
| 立體形體（正方體、長方體） | 康軒二下 8、翰林二下 4、南一二下 10 | 在 `math.shapes` 難度 3；沒有「只出立體」的設定 |
| 分類再分類 | 南一二下 10（弱）、康軒二下 8、翰林二下 4 | 對應 `math.chart`，但 chart 是看統計圖，不是分類操作 |

## 6. 重現方式

資料可由上述公開平台重現：逐校取得各校「二年級數學」計畫的 PDF，抽出文字，依「教材版本」欄位分組，再比對單元名稱。本次使用的暫存腳本放在工作暫存區，沒有納入專案；若之後要定期更新（例如 116 學年度），建議把抓取與比對腳本寫成 `scripts/` 下的檔案。
