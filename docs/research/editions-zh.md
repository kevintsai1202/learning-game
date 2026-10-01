# 國語二年級三版本（康軒、南一、翰林）課名與生字整理

整理日期：2026-10-01。資料檔：`src/content/editions/zh/kanghsuan.json`、`nani.json`、`hanlin.json`（格式見 `src/content/editions/schema.ts`），驗證測試：`tests/content/editions-zh.test.ts`。

## 1. 結論

- 三個版本、二上與二下共 6 冊，每冊 12 課，72 課全部有課名與生字，**沒有 missing**。
- 可信度：verified 69 課、single-source 3 課、missing 0 課（single-source 的原因見第 6 節）。
- 每冊習寫字（二上／二下）：康軒 216／212、南一 216／216、翰林 216／212。
- 三版本習寫字聯集 **836 字**（含認讀字共 914 字）；三版本都有的只有 86 字，至少兩個版本有的 366 字；各版獨有：康軒 147、南一 166、翰林 157 字。
- **同一課名的生字每年都會調整**（第 7 節），所以整份資料是「二上 115 學年度、二下 114 學年度」的快照，不能和其他學年度混用。

## 2. 取用的學年度

| 冊 | 取用學年度 | 理由 |
| --- | --- | --- |
| 二上 | 115 | 今天（2026-10-01）正是 115 學年度上學期，孩子手上的課本就是這一版。 |
| 二下 | 114 | 115 下（2027 年 2 月）的資料尚未公布，教育百科 115 下頁面是空的，取最新已公布的 114 下。 |

原定範圍是 113～115 學年度，不必追最新版；上表兩個學年度都在範圍內。113 學年度的資料也查過並做了驗證（第 7 節），但放進 JSON 的是上表的學年度。

## 3. 資料來源與可信度判定

| 代號 | 來源 | 用途 | 網址 |
| --- | --- | --- | --- |
| A | 教育部教育雲「教育百科」生字詞彙表（二年級、國語、各版本） | 主要來源：課名、習寫字、認讀字、語詞 | 列表頁 `https://pedia.cloud.edu.tw/Bookmark/Textword?category=國語&year=115_1&degree=2&press=康軒版`（`year` 換成 `114_2`、`press` 換成 `南一版`／`翰林版`）；每課頁 `https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=<課 id>`（id 見第 4 節各表「教育百科」欄的連結） |
| B | 顏國雄老師「各版本筆順練習」Google 試算表（網誌 `https://gsyan888.blogspot.com/p/stroke.html` 的 115 上、114 下、114 上選單） | 第二來源：每課的字集合（不分習寫字與認讀字） | 115 上 `https://docs.google.com/spreadsheets/d/10Nq6prSt0s_ZI1Z1phlGEtr0MDDE1wDqEiPmnHWSM_Q`；114 下 `https://docs.google.com/spreadsheets/d/1veHorc7pgqXK-TX68mrki-78V4Rdt_zE6AXNq9a3jBU`；114 上 `https://docs.google.com/spreadsheets/d/1A8HwYSnq5OpWG5q6mTnlxFfVb8pge79xg1FFFr2HWyk`。二年級分頁 gid：康軒 1678501344、南一 1142161459、翰林 1569448306 |
| C | 康軒「課程計畫」（官網 `https://www.knsh.com.tw/service/plan` 連到 Google Drive 的官方 docx） | 只核對康軒課名 | 115 國語 2 上 `https://drive.google.com/file/d/13MHoZaWYBcQ0C588_CGP8jX2rxc1BElf/view`；2 下 `https://drive.google.com/file/d/18dnibp43K6ZoJWQZG0eMc98Pu8uQanii/view` |

教育百科由教育部教育雲維護；頁面另有「會員貢獻生字詞彙表」功能，無法確認每一筆的貢獻者，所以仍只當一個來源。

判定規則（寫在每課的 `confidence`）：

- **verified**：來源 A 與 B 該課的字集合（習寫字＋認讀字）完全相同。注意 B 不是完全獨立的來源（見下方），所以 verified 的意思是「兩份公開資料一致」。
- **single-source**：只有 A，或 A、B 的字集合有差異（差異內容寫在該課 `note`）。
- **missing**：查不到生字（本次沒有）。

另外做的檢查：

- 教育百科每課詳細頁的「此標籤共 N 筆詞條」都等於抓到的生字、認讀字、語詞列數相加（72 課全部相符），沒有漏抓。
- 各課習寫字不重複、不與認讀字重疊、全是單一漢字（測試會檢查）；同一冊內習寫字沒有跨課重複，二上與二下之間也沒有重複。

## 4. 各版本課名與生字

「習寫字」欄括號內是字數。「教育百科」欄連到該課的原始頁面。康軒課名另有官方課程計畫核對，南一、翰林課名只有教育百科一個來源。

### 康軒 二上（115 學年度）

12 課；習寫字 216 字、認讀字 23 字；verified 12／single-source 0／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 新學年新希望 | 年希望坐位本淡書老師以為故用力只現還（18） | 聲矮 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150101) |  |
| 2 | 一起做早餐 | 全蛋煎圓番茄切輪司夾吐中方城堡接畫臉（18） | 餐醬 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150102) |  |
| 3 | 走過小巷 | 巷叔貓屋捧蝴蝶忙娶娘黃筆打扮樣越美麗（18） | 牆模 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150103) |  |
| 4 | 運動會 | 運動飄熱鬧舞哇往容步汗腳協聲河氣最可（18） | 賽拔 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150104) |  |
| 5 | 坐竹籃船 | 竹籃鄉南暑假帶等跨划吹邊叫原近捕活識（18） | 碗轉 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150105) | 113 學年同課次為〈水上木偶戲〉。 |
| 6 | 小鎮的柿餅節 | 鎮餅節因此進排遠色愛月乾甜客買親如意（18） | 柿埔 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150106) |  |
| 7 | 國王的新衣裳 | 衣胖針簡單聰明臣敢東西直棒街滿眼哪思（18） | 裳慌 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150107) |  |
| 8 | 「聰明」的小熊 | 渴烏喝瓶法森林物旅行午裝許石難忘哈但（18） | 熊鴉 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150108) |  |
| 9 | 大象有多重？ | 象操粗腿柱砍幾部搖沖首牽沉少沿然紀竟（18） | 曹秤 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150109) |  |
| 10 | 新年快樂 | 雪梨夜卻冷冬臺季相反煙火待雖春貨期飯（18） | 灣綻 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150110) | 113 學年同課次為〈我愛冬天〉。 |
| 11 | 遠方來的黑皮 | 皮具飛者洋寒北嘴伸飽沙急服站翅膀充念（18） | 戴扁 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150111) |  |
| 12 | 我愛冬天 | 灰涼牠鼓絡欣發居冒冰圍咪幸團聚愉鍋妙（18） | 聊 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021150112) | 113 學年同課次為〈新年快樂〉。 |

### 康軒 二下（114 學年度）

12 課；習寫字 212 字、認讀字 22 字；verified 11／single-source 1／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 春天的顏色 | 顏池塘藍田洞綠蜜蜂窩粉桃興處景（15） | 鼠燕 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140201) |  |
| 2 | 花衣裳 | 裳驚所躲房間討論指裙而且紫將工合貼候（18） | 剪慶 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140202) |  |
| 3 | 彩色王國 | 座對微表各突強被綻特舌賞果定互換共漸（18） | 壞融 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140203) |  |
| 4 | 爸爸 | 散芒透暗照掛角揚星閃晶當睡悄常旁臂永（18） | 窗避 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140204) |  |
| 5 | 我的家人 | 剛品爺採蕉軍告訴辛苦流堅固安寶貝幅管（18） | 機蓋 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140205) |  |
| 6 | 愛笑的大樹 | 教室棵及終立刻抱並猜文借枝鉛校車哥牛（18） | 騎踏 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140206) |  |
| 7 | 月光河 | 久條祕兔其猴病探體惜無辦之請鼻吸模度（18） | 挖坑 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140207) |  |
| 8 | 黃狗生蛋 | 狗雞經怪羊鴨信錯睛仔細能消傳嚇忍住顧（18） | 議鴕 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140208) |  |
| 9 | 神筆馬良 | 良孩錢醒尾巴村貪皇帝派抓銀准島元波浪（18） | 艘掀 | single-source | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140209) | 試算表缺「抓」且「掀」重複，疑為筆誤；以教育百科為準。 |
| 10 | 小熊的邀請 | 熊朝踮尖木架些足蹈轉趕耳啄袋鼠摸讀琅（18） | 邀蹦 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140210) | 113 學年同課次為〈快樂的探險家〉。 |
| 11 | 小讀者樂園 | 圖館參題士講甲形志約數迎交令世界險庫（18） | 索奧 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140211) |  |
| 12 | 巨人山 | 巨累髮根牆狂呼差睜緊餓百食桶倒量底（17） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0103021140212) |  |

### 南一 二上（115 學年度）

12 課；習寫字 216 字、認讀字 15 字；verified 12／single-source 0／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 打招呼 | 呼白雲柔前游噴美麗柱試吸用力哇又第功（18） | 擠 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150101) |  |
| 2 | 爬梯子 | 爬梯紙條線像身生迫及待站沿頂格哪才最（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150102) |  |
| 3 | 勇氣樹 | 勇教室棵葉克服害怕努完事倒時黑低聲故（18） | 跌騎 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150103) |  |
| 4 | 一天的時間 | 塊圓形芝麻餅咬飯做課洗澡拾整包遊戲剩（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150104) |  |
| 5 | 小書蟲 | 蟲森動物王坐午停座急百科全原從此管種（18） | 橋圖館 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150105) |  |
| 6 | 從自己開始 | 自己沙撿垃圾眼膠對牠安吧如該留便減少（18） | 灘塑 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150106) |  |
| 7 | 等兔子來撞樹 | 等兔撞農夫夏剛趕路幸運以耕守夜晚北搖（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150107) |  |
| 8 | 角和腳 | 角腳渴鹿喝影意卻獅追被枝掙脫速度直救（18） | 瘦嚇 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150108) |  |
| 9 | 赤腳國王 | 赤國熱宮涼踩毯暖馬壞難定更隨主法於舒（18） | 燙蹺 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150109) |  |
| 10 | 去農場玩 | 群靜抬非趣近堆棉遠景忽聽揮慢依捨放假（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150110) |  |
| 11 | 幸福湯圓 | 湯今至妹升陽因期盯米團粉南黃真呵接牛（18） | 糯變 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150111) |  |
| 12 | 到野外上課 | 野本模型蜜蜂蝴蝶飛活圖筆料湖調迷逛兒（18） | 盤 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021150112) |  |

### 南一 二下（114 學年度）

12 課；習寫字 216 字、認讀字 14 字；verified 12／single-source 0／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 彩色心情 | 情候翠溜滑傳深泳淚火奔怒拋潔舞各同受（18） | 藏 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140201) |  |
| 2 | 勇敢超人 | 敢超弟院正破所伸點重石消失合掉乾淨哥（18） | 盆 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140202) |  |
| 3 | 小波氣球飛上天 | 綿已經輸鼓取越竟飄抓啦喊踢結變讓終冷（18） | 脾 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140203) |  |
| 4 | 小水珠，去哪裡？ | 珠微醒甲瓢腰香掛閃晶串項鍊仙禮探幫姐（18） | 懶滾 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140204) |  |
| 5 | 生日快樂 | 病睛份牽步段毛晃籃亭忍祕耳聞味浪寶清（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140205) |  |
| 6 | 給地球的一封信 | 封信親貴洋蝦植量汙染使決具資源費康復（18） | 餐 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140206) |  |
| 7 | 傘 | 傘烏暗爺字謎語屋枴杖滴答叩嘻哈落街案（18） | 撐 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140207) |  |
| 8 | 老園丁的話 | 丁公每認比客相興照皮摘立位新它欣賞妙（18） | 牌 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140208) |  |
| 9 | 小小說書人 | 排介紹其賣帽蛋糕扶買休息拿精采希望讀（18） | 戴猴 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140209) |  |
| 10 | 點金術 | 銀女願摸品指桌椅食年幼純慌並切狀明而（18） | 術 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140210) |  |
| 11 | 我喜歡你 | 敗操旁脖瞇密件特別唱歌練習彈琴講論颳（18） | 勵 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140211) |  |
| 12 | 如果，我的房間…… | 牆壁窗床鋪錯輪搬冰且交往刻顆鮮汁晨由（18） | 極磚 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0102021140212) | 課名結尾為刪節號（教育百科作 ...）。 |

### 翰林 二上（115 學年度）

12 課；習寫字 216 字、認讀字 33 字；verified 11／single-source 1／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 我的心情 | 候颳冷躲閃電難烏雲密布盆充滿放晴現虹（18） | 傾麗 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150101) | 113 學年同課次為〈好心情〉。 |
| 2 | 彩色的天空 | 老師新希望卻始緊因為知道怎消失習最掛（18） | 轉熟辦舞 | single-source | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150102) | 113 學年同課次為〈踩影子〉。115 上試算表作「使」，教育百科與 114 上試算表作「始」，且語詞有「開始」，採「始」。 |
| 3 | 國王做新衣 | 國王喜歡穿只件點改領越設計發方法分享（18） | 臣袖驚讓 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150103) | 113 學年同課次為〈謝謝好朋友〉。 |
| 4 | 水草下的呱呱 | 呱聞聲猜蛙別靠近抓如果乖腦袋瓜證明頂（18） | 影蝦蟆擔 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150104) |  |
| 5 | 沙灘上的畫 | 沙灘海邊退遠螃蟹愛注夕腳丫橫留印挖麗（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150105) |  |
| 6 | 草叢裡的星星 | 月奶晚飯散屋竹林頭溪旁暗眼睛那聚成顆（18） | 叢盡 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150106) |  |
| 7 | 不一樣的美食 | 樣食郊活奇筒香味便當盒客清節保平安南（18） | 祖艾粄捲 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150107) | 113 學年同課次為〈不一樣的故事〉。 |
| 8 | 美食分享日 | 介圓形白紙米變軟搶材蝦線各種菜接聽更（18） | 紹舉 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150108) |  |
| 9 | 好味道 | 黃沖澡蘿蔔哪粒熱浴蒸胖名苔蛋蔬通細淡（18） | 黏飄 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150109) |  |
| 10 | 加加減減 | 減表讀認識謎答搖百嘴哥數題趕突異口對（18） | 嘟 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150110) |  |
| 11 | 奇怪的門 | 怪門扇立刻閒馬闖耳主播報力竟巴東西底（18） | 慌仔擠妖 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150111) |  |
| 12 | 詠鵝 | 念曲項浮掌撥波詩作首指伸脖身體隻倒肚（18） | 詠鵝歲翻 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021150112) |  |

### 翰林 二下（114 學年度）

12 課；習寫字 212 字、認讀字 21 字；verified 11／single-source 1／missing 0。

| 課次 | 課名 | 習寫字（生字） | 認讀字 | 可信度 | 教育百科 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 種子旅行真奇妙 | 旅行妙公園針尖狗士貓探險黑傘由哇世界（18） | 鬼刺昭飛 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140201) |  |
| 2 | 小水滴愛上探險 | 滴躺次落荷珍珠第被轉甩浪救植提漠令及（18） | 滾 | single-source | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140202) | 113 學年同課次為〈第一次旅行〉。試算表多列「圈」（認讀字），教育百科未列，未採用。 |
| 3 | 紫斑蝶向北飛 | 紫北悄擔翅膀讓溜滑梯碰遇鳥終於木些伴（18） | 斑蝶盪 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140203) | 113 學年同課次為〈不怕去探險〉。 |
| 4 | 一場雨 | 場農夫渴稻喝飽洗蚯蚓扭尾泥蝌蚪努爺剛（18） | 淹 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140204) |  |
| 5 | 笑容回來了 | 容丟負責收漸臉雖換工總親切慢利合式露（18） | 亂資源謝微 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140205) |  |
| 6 | 好好的說話 | 從臺夠昨球捧腹告訴整廁所踢足比校信祝（18） | 搬禮貌 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140206) |  |
| 7 | 色彩變變變 | 調盤配藍顏魔料幾已經趣呵將混橙棒神（17） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140207) | 113 學年同課次為〈孵蛋的男孩〉。 |
| 8 | 孵蛋的男孩 | 男孩靜晨傳雞吵雜女窩根羽啄母求助凡（17） | 孵離 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140208) | 113 學年同課次為〈點亮世界的人〉。 |
| 9 | 點亮世界的人 | 歲燈賣非貴買燒壞功費絲敗實驗呼良持宜（18） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140209) | 113 學年同課次為〈色彩變變變〉。 |
| 10 | 醜小鴨 | 醜鴨其特抱破碗煩雪餓縮孤單掉淚鵝飛迎（18） | 蘆葦 | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140210) |  |
| 11 | 蜘蛛救蛋 | 蜘蛛鴿裂痕拜託寶貝處補內石算吐顧離（17） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140211) |  |
| 12 | 玉兔搗藥 | 玉兔搗藥姑娘養仙重鬧桂砍嚇棍操夜運（17） |  | verified | [頁](https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=0101021140212) |  |

## 5. 統計與聯集

| 版本 | 二上習寫字 | 二下習寫字 | 全年不重複習寫字 | 二上認讀字 | 二下認讀字 |
| --- | --- | --- | --- | --- | --- |
| 康軒 | 216 | 212 | 428 | 23 | 22 |
| 南一 | 216 | 216 | 432 | 15 | 14 |
| 翰林 | 216 | 212 | 428 | 33 | 21 |

三版本習寫字聯集：

- 全年（二上＋二下）：**836 字**；再加上各版認讀字共 **914 字**（其中 78 字只在某版當認讀字，沒有任何版本列為習寫字）。
- 三版本全都列為習寫字：86 字；至少兩版：366 字。
- 二上單冊聯集 499 字（三版本都有 23 字）；二下單冊聯集 506 字（三版本都有 12 字）。

用途提醒：不指定版本、只依「二年級」出生字題時，用聯集會出到孩子那一版沒教過的字；要依版本出題才用各版本檔。

## 6. 查不到與不一致

### 6.1 single-source 的 3 課（兩個來源有差異）

| 版本與課次 | 差異 | 處理 |
| --- | --- | --- |
| 翰林 二上 第 2 課〈彩色的天空〉 | 教育百科（115 上、114 上）與 114 上試算表作「始」；115 上試算表作「使」。教育百科列出的語詞有「開始」。 | 採「始」。115 上試算表可能是筆誤，也可能是 115 課本真的改了，沒有第三來源可判定。 |
| 康軒 二下 第 9 課〈神筆馬良〉 | 試算表缺「抓」，且「掀」出現兩次；教育百科有「抓」。 | 以教育百科為準，試算表疑為筆誤。 |
| 翰林 二下 第 2 課〈小水滴愛上探險〉 | 試算表多列「圈」；教育百科只有「滾」一個認讀字。習寫字 18 字兩邊一致。 | 採教育百科，「圈」未收；可能是試算表沿用 113 學年舊課文的字。 |

### 6.2 查不到、沒取得的資料

- 115 下（二下）尚無任何公開生字資料；二下是 114 下的資料。康軒二下的課名有和 115 官方課程計畫核對（一致，含新課〈小熊的邀請〉），南一、翰林二下沒有 115 的官方資料可比對。
- 南一（NaniBox）、翰林的官方課程計畫在教師專區，沒有找到免登入可下載的檔案；兩家的**課名只有教育百科一個來源**。臺北市課程計畫平台（tten.tp.edu.tw）查到的學校課程計畫（麗湖國小 110 學年度、東園國小未標學年度）課本版次較舊，沒有採用。
- 康軒生字累計表 PDF（`http://class2.anhoes.ntpc.edu.tw/happy2/233/up_files/dl/國語2下生字累計表.pdf`）連線逾時，沒有取得；康軒官方數位平台（digitalmaster.knsh.com.tw）回應 403。
- 習寫字與認讀字的區分只有教育百科有（試算表不分）。唯一真正獨立的驗證是翰林 112 學年的學校生字累計表（見第 7 節），教育百科對 24 課的習寫字、認讀字都和它相同；115 上、114 下沒有這種學校公告的獨立來源。

### 6.3 資料來源本身的小問題

- 教育百科課名標點：問號是半形（〈大象有多重?〉、〈小水珠，去哪裡?〉），JSON 改為全形；南一二下第 12 課課名是〈如果，我的房間...〉，結尾是刪節號，JSON 寫成「……」。
- 教育百科不同學年度的同一課偶有筆誤或調整：南一二下〈生日快樂〉113 學年度作「晴」、114 學年度與試算表作「睛」（以「睛」為正）；南一二上 112 學年度有 6 課把某個字放在習寫字、113 學年度改列認讀字。所以才需要第二來源。
- 除了 6.1 的 3 課，取用的 115 上、114 下資料裡教育百科與試算表沒有其他衝突（教育百科「晴」的筆誤在 113 學年度，不在取用範圍內）。
- **來源 B 與來源 A 不是完全獨立的**：B 的字序在 58／72 課與 A 完全相同（113 學年的簡報是 71／72 課），推測作者以教育百科為底再校正。康軒二下 12 課字序都不同，應是另外輸入的。B 有自己的筆誤與修正（始／使、抓／掀、圈、睛／晴），所以仍當第二來源，但 verified 不等於「兩個互不相干的來源都查過」。要真正獨立驗證，需要學校公布的生字表或課本本身。

## 7. 與其他學年度的差異（為什麼不能混用）

教育百科有 111～115 的資料，同一課名的生字每年都會小幅調整，有些版本還會換課文。以下是目前取用的資料與 113 學年度（同冊）的比較：

| 版本與冊 | 113 沒有的課名 | 同課名且習寫字相同 | 同課名但習寫字不同 | 全冊習寫字與 113 重疊 |
| --- | --- | --- | --- | --- |
| 康軒 二上 | 1 課（〈坐竹籃船〉取代〈水上木偶戲〉；第 10 與第 12 課對調） | 7 | 4 | 203／216 |
| 康軒 二下 | 1 課（〈小熊的邀請〉取代〈快樂的探險家〉） | 5 | 6 | 193／212 |
| 南一 二上 | 0 | 10 | 2 | 215／216 |
| 南一 二下 | 0 | 9 | 3 | 211／216 |
| 翰林 二上 | 4 課（〈我的心情〉〈彩色的天空〉〈國王做新衣〉〈不一樣的美食〉） | 0 | 8 | 159／216 |
| 翰林 二下 | 2 課（〈小水滴愛上探險〉〈紫斑蝶向北飛〉） | 0 | 10 | 170／212 |

重點：翰林在 113 到 114 之間改動最大，康軒中等，南一幾乎沒變。若孩子手上是 113 以前的課本，要用家長專區「版本包」匯入對應學年度的資料（`src/content/editions/index.ts` 的註解已預留這個用法）。

額外查證 113 學年度資料的品質（沒有放進 JSON，只用來判斷教育百科可不可靠）：

- 顏國雄老師 113 上、113 下的筆順簡報（三版本二年級共 6 份，網誌 `https://glglace.blogspot.com/2023/02/1918-4-qr-code.html`）對 72 課：60 課字集合與教育百科完全相同；其餘 12 課，11 課是簡報每課最多只放 21 字、翰林認讀字較多被截掉，1 課是教育百科把「睛」寫成「晴」。
- 翰林 112 學年生字累計表（臺北市明湖國小公告，`http://mhups-teachers.mhups.tp.edu.tw/eweb/module/download/update/ew00000000034/file4134_30.pdf`）二年級頁：24 課的習寫字與認讀字，和教育百科 112、113 學年度**逐課完全相同**。

## 8. 疑慮

1. verified 的 69 課是「教育百科與顏國雄試算表一致」，兩者並非完全獨立（第 6.3 節）。若要更嚴格，可把 verified 視為「教育百科資料經人工校對過」；115 上、114 下沒有學校公告的生字表可以當真正獨立的第三來源。
2. 二上取 115 學年度，但教育百科 115 上與 114 上的資料完全相同，應是沿用 114 資料；只有康軒的課名有 115 官方課程計畫佐證。南一、翰林 115 課本若有微調，這份資料不會反映（翰林第 2 課「始／使」的差異是唯一的跡象）。
3. 二下是 114 學年度，115 下開學後（2027 年 2 月）可能有調整，屆時要重抓。
4. verified 的意思是「兩個來源的字集合相同」，習寫字與認讀字的分界只有教育百科。遊戲若只出習寫字題，風險是少數認讀字被當成習寫字，或反過來。
5. 語詞（`words`）只有教育百科一個來源，沒有驗證；已去重，長度都在 8 字以內。
6. 認讀字在不同學年度的歸類會變動（例如康軒二上〈新學年新希望〉的「聲」「矮」，112 學年度列習寫字、113 學年度起列認讀字），所以認讀字的穩定度比習寫字低。

## 9. 重現方式

沒有把抓取腳本放進專案。要更新時：

1. 在教育百科列表頁（第 3 節代號 A）取得每課的 `TextNameId`，再抓每課頁，詞條類別「生字」是習寫字、「認讀字」是認讀字、「語詞」是語詞；頁首「此標籤共 N 筆詞條」可用來驗證有沒有漏抓。
2. 與第 3 節代號 B 的試算表（`export?format=csv&gid=…`）逐課比對字集合。
3. 更新三個 JSON 後執行 `npx vitest run tests/content/editions-zh.test.ts`。
