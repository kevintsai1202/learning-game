/**
 * 資料來源與授權清單（家長專區「資料來源」頁顯示）。
 * 新增任何外部資料時，一定要在這裡登記來源網址與授權。
 */
export interface SourceEntry {
  /** 用途 */
  use: string;
  name: string;
  url: string;
  license: string;
  /** 補充說明（例如有沒有修改） */
  note?: string;
}

export const SOURCES: SourceEntry[] = [
  {
    use: '課程內容依據',
    name: '十二年國民基本教育課程綱要（國語文、數學、生活課程、健康與體育、英語文）',
    url: 'https://www.k12ea.gov.tw/',
    license: '政府公開課綱文件',
    note: '題目依課綱學習內容自行編寫，未複製任何出版社教科書或學校考卷的內容。',
  },
  {
    use: '教材版本：國語三版本（康軒、南一、翰林）二上、二下的課名、生字、認讀字、語詞',
    name: '教育部教育百科「生字詞彙表」',
    url: 'https://pedia.cloud.edu.tw/Bookmark/Textword?category=%E5%9C%8B%E8%AA%9E&year=115_1&degree=2&press=%E5%BA%B7%E8%BB%92%E7%89%88',
    license: '政府網站公開資訊（只取課名、生字等事實資料）',
    note: '二上依 115 學年度、二下依 114 學年度整理；以顏國雄老師公開的「各版本筆順練習」試算表、學校公告的生字累計表交叉比對，康軒課名另以官方課程計畫核對。未收錄任何課文、習作或考卷內容。每課來源列在家長專區「教材版本」。',
  },
  {
    use: '國字筆順描寫引擎',
    name: 'Hanzi Writer',
    url: 'https://github.com/chanind/hanzi-writer',
    license: 'MIT',
  },
  {
    use: '國字筆順字形（台灣教育部筆順，主要來源）',
    name: 'animCJK（graphicsZhHant）',
    url: 'https://github.com/parsimonhi/animCJK',
    license: 'Arphic Public License',
    note: '只擷取課本生字，格式轉為每字一個 JSON；少數字依全字庫筆順序列調整筆畫順序（修改註記在各檔 _notice 欄位）。授權全文附於 public/licenses/ARPHIC-PL.txt。',
  },
  {
    use: '國字筆順字形（補 animCJK 沒有的字）',
    name: 'Make Me a Hanzi',
    url: 'https://github.com/skishore/makemeahanzi',
    license: 'Arphic Public License',
    note: '原始資料採大陸筆順，只採用經全字庫台灣筆順序列驗證一致（或可自動修正）的字；驗證不過的字不提供描寫。覆蓋率見 docs/stroke-coverage.md。',
  },
  {
    use: '注音、部首、筆畫數、台灣筆順序列（驗證與修正筆順）',
    name: 'CNS11643 中文標準交換碼全字庫屬性資料',
    url: 'https://data.gov.tw/dataset/5961',
    license: '政府資料開放授權條款－第 1 版',
    note: '顯名聲明與授權條款見 public/licenses/CNS11643-OGDL.txt。',
  },
  {
    use: '注音字型（畫面文字旁的注音）',
    name: '注音粉圓 BpmfHuninn（ButTaiwan/bpmfvs）',
    url: 'https://github.com/ButTaiwan/bpmfvs',
    license: 'SIL Open Font License 1.1',
    note: '本遊戲使用子集化並改名的版本「LG Bopomofo Round」；原字型 Copyright 2025 But Ko，內含 justfont 粉圓（OFL 1.1）、Kosugi Maru（Apache-2.0）、Varela Round（OFL 1.1）。',
  },
  {
    use: '注音符號與英文字母筆順',
    name: '依教育部注音符號筆順與國小四線格書寫規範自行繪製',
    url: 'https://stroke-order.learningweb.moe.edu.tw/',
    license: '原創（筆順規範參考教育部常用國字標準字體筆順學習網）',
  },
  {
    use: '生活與健康：洗手五步驟（濕、搓、沖、捧、擦）',
    name: '衛生福利部疾病管制署',
    url: 'https://www.cdc.gov.tw/Category/MPage/BUB88Dc-WrHrczuT0TE-bA',
    license: '政府公開資訊（事實依據，題目文字自編）',
  },
  {
    use: '生活與健康：「我的餐盤」口訣、視力保健 3010120',
    name: '衛生福利部（國民健康署）',
    url: 'https://www.mohw.gov.tw/cp-4251-50222-1.html',
    license: '政府公開資訊（事實依據，題目文字自編）',
  },
  {
    use: '生活與健康：地震「趴下、掩護、穩住」、火災逃生、119 報案',
    name: '內政部消防署（含消防防災館、兒童網）',
    url: 'https://www.nfa.gov.tw/kid/index.php?code=list&flag=detail&ids=659&article_id=1288',
    license: '政府公開資訊（事實依據，題目文字自編）',
    note: '地震避難另參考交通部中央氣象署地震教育網 https://edu.cwa.gov.tw/PopularScience/ec/ec_4.html',
  },
  {
    use: '生活與健康：防溺水「救溺五步、防溺十招」',
    name: '教育部（經臺南市政府消防局轉載）',
    url: 'https://119.tainan.gov.tw/News_Content.aspx?n=25516&s=7694517',
    license: '政府公開資訊（事實依據，題目文字自編）',
  },
  {
    use: '生活與健康：過馬路與搭車安全',
    name: '交通部道安資訊查詢網（168）',
    url: 'https://168.motc.gov.tw/theme/package/post/1906121100769',
    license: '政府公開資訊（事實依據，題目文字自編）',
  },
  {
    use: '生活與健康：垃圾分三類（資源垃圾、廚餘、一般垃圾）',
    name: '環境部規定（新北市環保局轉載）',
    url: 'https://www.ntepb.gov.tw/sub/news/Details.aspx?Parser=9%2C19%2C333%2C320%2C%2C%2C15730%2C%2C%2C%2C3',
    license: '政府公開資訊（事實依據，題目文字自編）',
  },
  {
    use: '背景音樂（島上、自己的島、答題、結算）',
    name: 'Cozy Puzzle 系列（MintoDog，OpenGameArt）',
    url: 'https://opengameart.org/content/cozy-puzzle-in-game-3',
    license: 'CC0（公眾領域）',
    note: '轉為 MP3 並調整音量；曲目與原始網址詳見 public/audio/music/CREDITS.md。',
  },
  {
    use: '背景音樂（百寶屋、家長區）',
    name: 'Buy Something!（Shop Theme，Cleyton Kauffman，OpenGameArt）',
    url: 'https://opengameart.org/content/shop-theme',
    license: 'CC0（公眾領域）',
    note: 'Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman（作者自願附的署名，CC0 不要求）。',
  },
  {
    use: '預錄語音（介面句子、生活與健康、英語）：AI 語音合成',
    name: 'Fish Audio 公開聲音「詩涵 Shihan（台灣）」（作者 Fish Official），模型 s2.1-pro-free',
    url: 'https://fish.audio/',
    license: 'Fish Audio 服務條款（免費方案；條款寫明免費使用者限個人、非商業使用，由專案維護者評估後採用）',
    note: '這些聲音是 AI 合成語音，不是真人錄音。中文語速 0.9、英文 0.85；去頭尾靜音並調整音量。句子清單見 data-src/voice/inventory.json，產生方式見 docs/plans/voice-clips.md，條款說明見 public/licenses/AI-VOICES.txt。',
  },
  {
    use: '預錄語音（37 個注音符號）：AI 語音合成',
    name: 'Microsoft Azure AI Speech 神經語音「曉臻 zh-TW-HsiaoChenNeural」',
    url: 'https://learn.microsoft.com/azure/ai-services/speech-service/',
    license: 'Microsoft 產品條款（F0 免費方案；條款的產出使用權只列付費方案，由專案維護者評估後採用）',
    note: '這些聲音是 AI 合成語音，不是真人錄音。直接唸注音符號，語速 0.7，結尾補 0.25 秒停頓；去頭尾靜音並調整音量。條款說明見 public/licenses/AI-VOICES.txt。',
  },
  {
    use: '3D 引擎',
    name: 'three.js／React Three Fiber／drei',
    url: 'https://threejs.org/',
    license: 'MIT',
    note: '島上所有 3D 模型都以程式用基本幾何體建立，沒有使用外部模型檔。',
  },
];
