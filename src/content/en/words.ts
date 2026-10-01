/**
 * 英語字詞資料（種子資料）：依 docs/research/zhuyin-english.md §3.3「二年級字詞主表」整理，
 * 中文意思、主題、難度分級與可否配圖由我們自編。
 *
 * 難度 lv（決定出題範圍，二年級以臺北市低年段為核心，不是國小 300 字）：
 *   1＝臺北市低年段 58 字中的名詞／形容詞／動詞（有圖者），加上新北市 26 組字母代表字（在主表內者）
 *   2＝主表中臺北市列在中年段（3–4 年級）的字
 *   3＝主表其餘字（高年段或不在臺北清單）
 *
 * pic：emoji 能清楚代表這個字，可以用在「看圖選字、聽字選圖」。
 *   主表備註標「~」（emoji 只是示意）或與別的字共用 emoji 者一律不設 pic（例如 brother 與 boy 都是 👦），
 *   這些字改用「聽字選意思、看中文選字」兩種不靠圖的題型。
 * countable：可數單數名詞，能套 What's this? It's a／an ___. 句型。
 */

/** 單字主題 */
export type WordTopic =
  | 'num' | 'color' | 'animal' | 'fruit' | 'food' | 'family' | 'people' | 'body' | 'school' | 'home' | 'toy'
  | 'weather' | 'vehicle' | 'adj' | 'verb' | 'cloth' | 'place' | 'prep';

/** 主題的中文名稱（分類題的題幹用；adj／verb／prep 不當分類） */
export const TOPIC_LABEL: Partial<Record<WordTopic, string>> = {
  num: '數字', color: '顏色', animal: '動物', fruit: '水果', food: '食物或飲料', family: '家人', people: '人物',
  body: '身體部位', school: '文具或學校用品', home: '家裡的東西', toy: '玩具', weather: '天氣', vehicle: '交通工具',
  cloth: '衣物', place: '地點',
};

export interface EnWord {
  en: string;
  zh: string;
  emoji: string;
  topic: WordTopic;
  lv: 1 | 2 | 3;
  pic: boolean;
  countable: boolean;
}

/** 一列資料：[英文, 中文, emoji, 主題, 難度, 旗標]；旗標 p＝可配圖、c＝可數單數名詞 */
type Row = [string, string, string, WordTopic, 1 | 2 | 3, string];

/** 主表字詞（每個主題內依「基本在前」排列，出題範圍不足時會依這個順序補字） */
const ROWS: Row[] = [
  // 數字
  ['one', '一', '1️⃣', 'num', 1, 'p'], ['two', '二', '2️⃣', 'num', 1, 'p'], ['three', '三', '3️⃣', 'num', 1, 'p'],
  ['four', '四', '4️⃣', 'num', 1, 'p'], ['five', '五', '5️⃣', 'num', 1, 'p'], ['six', '六', '6️⃣', 'num', 2, 'p'],
  ['seven', '七', '7️⃣', 'num', 2, 'p'], ['eight', '八', '8️⃣', 'num', 2, 'p'], ['nine', '九', '9️⃣', 'num', 2, 'p'],
  ['ten', '十', '🔟', 'num', 2, 'p'], ['eleven', '十一', '1️⃣1️⃣', 'num', 2, ''], ['twelve', '十二', '1️⃣2️⃣', 'num', 2, ''],
  ['thirteen', '十三', '1️⃣3️⃣', 'num', 3, ''], ['fourteen', '十四', '1️⃣4️⃣', 'num', 3, ''], ['fifteen', '十五', '1️⃣5️⃣', 'num', 3, ''],
  ['sixteen', '十六', '1️⃣6️⃣', 'num', 3, ''], ['seventeen', '十七', '1️⃣7️⃣', 'num', 3, ''], ['eighteen', '十八', '1️⃣8️⃣', 'num', 3, ''],
  ['nineteen', '十九', '1️⃣9️⃣', 'num', 3, ''], ['twenty', '二十', '2️⃣0️⃣', 'num', 3, ''],
  // 顏色
  ['red', '紅色', '🔴', 'color', 2, 'p'], ['blue', '藍色', '🔵', 'color', 2, 'p'], ['yellow', '黃色', '🟡', 'color', 2, 'p'],
  ['green', '綠色', '🟢', 'color', 2, 'p'], ['orange', '橘色', '🟠', 'color', 2, 'p'], ['brown', '咖啡色', '🟤', 'color', 2, 'p'],
  ['black', '黑色', '⚫', 'color', 2, 'p'], ['white', '白色', '⚪', 'color', 2, 'p'], ['purple', '紫色', '🟣', 'color', 3, 'p'],
  ['pink', '粉紅色', '🩷', 'color', 3, ''], ['gray', '灰色', '🩶', 'color', 3, ''],
  // 動物
  ['cat', '貓', '🐱', 'animal', 1, 'pc'], ['dog', '狗', '🐶', 'animal', 1, 'pc'], ['bird', '鳥', '🐦', 'animal', 1, 'pc'],
  ['fish', '魚', '🐟', 'animal', 1, 'pc'], ['pig', '豬', '🐷', 'animal', 1, 'pc'], ['cow', '乳牛', '🐮', 'animal', 1, 'pc'],
  ['lion', '獅子', '🦁', 'animal', 1, 'pc'], ['monkey', '猴子', '🐵', 'animal', 1, 'pc'], ['ant', '螞蟻', '🐜', 'animal', 1, 'pc'],
  ['zebra', '斑馬', '🦓', 'animal', 1, 'pc'], ['rabbit', '兔子', '🐰', 'animal', 2, 'pc'], ['bear', '熊', '🐻', 'animal', 2, 'pc'],
  ['tiger', '老虎', '🐯', 'animal', 2, 'pc'], ['elephant', '大象', '🐘', 'animal', 3, 'pc'], ['duck', '鴨子', '🦆', 'animal', 3, 'pc'],
  ['horse', '馬', '🐴', 'animal', 3, 'pc'], ['sheep', '綿羊', '🐑', 'animal', 3, 'pc'], ['frog', '青蛙', '🐸', 'animal', 3, 'pc'],
  ['mouse', '老鼠', '🐭', 'animal', 3, 'pc'], ['snake', '蛇', '🐍', 'animal', 3, 'pc'],
  // 水果
  ['apple', '蘋果', '🍎', 'fruit', 1, 'pc'], ['banana', '香蕉', '🍌', 'fruit', 1, 'pc'], ['grape', '葡萄', '🍇', 'fruit', 3, 'pc'],
  ['watermelon', '西瓜', '🍉', 'fruit', 3, 'pc'], ['strawberry', '草莓', '🍓', 'fruit', 3, 'pc'], ['lemon', '檸檬', '🍋', 'fruit', 3, 'pc'],
  ['peach', '水蜜桃', '🍑', 'fruit', 3, 'pc'], ['mango', '芒果', '🥭', 'fruit', 3, 'pc'], ['pineapple', '鳳梨', '🍍', 'fruit', 3, 'pc'],
  // 食物飲料
  ['egg', '蛋', '🥚', 'food', 1, 'pc'], ['milk', '牛奶', '🥛', 'food', 1, 'p'], ['cake', '蛋糕', '🍰', 'food', 1, 'pc'],
  ['rice', '米飯', '🍚', 'food', 2, 'p'], ['juice', '果汁', '🧃', 'food', 2, 'p'], ['water', '水', '💧', 'food', 2, 'p'],
  ['tea', '茶', '🍵', 'food', 2, 'p'], ['ice cream', '冰淇淋', '🍦', 'food', 2, 'pc'], ['pizza', '披薩', '🍕', 'food', 2, 'pc'],
  ['hamburger', '漢堡', '🍔', 'food', 2, 'pc'], ['bread', '麵包', '🍞', 'food', 3, 'p'], ['cookie', '餅乾', '🍪', 'food', 3, 'pc'],
  ['candy', '糖果', '🍬', 'food', 3, 'pc'], ['noodle', '麵', '🍜', 'food', 3, 'p'], ['soup', '湯', '🍲', 'food', 3, 'p'],
  // 家人
  ['mom', '媽媽', '👩', 'family', 1, 'p'], ['dad', '爸爸', '👨', 'family', 1, 'p'], ['brother', '哥哥、弟弟', '👦', 'family', 1, ''],
  ['sister', '姊姊、妹妹', '👧', 'family', 1, ''], ['grandma', '奶奶、外婆', '👵', 'family', 2, 'p'], ['grandpa', '爺爺、外公', '👴', 'family', 2, 'p'],
  ['baby', '寶寶', '👶', 'family', 3, 'pc'], ['uncle', '叔叔、舅舅', '🧔', 'family', 3, ''], ['aunt', '阿姨、姑姑', '👩‍🦰', 'family', 3, ''],
  ['family', '家人', '👨‍👩‍👧‍👦', 'family', 3, 'pc'],
  // 人物
  ['boy', '男孩', '👦', 'people', 1, 'pc'], ['girl', '女孩', '👧', 'people', 1, 'pc'], ['friend', '朋友', '🧑‍🤝‍🧑', 'people', 1, 'pc'],
  ['teacher', '老師', '🧑‍🏫', 'people', 1, 'pc'], ['student', '學生', '🧑‍🎓', 'people', 2, 'pc'], ['doctor', '醫生', '👨‍⚕️', 'people', 2, 'pc'],
  ['nurse', '護理師', '👩‍⚕️', 'people', 3, 'pc'],
  // 身體部位
  ['nose', '鼻子', '👃', 'body', 1, 'pc'], ['head', '頭', '🧑', 'body', 2, ''], ['face', '臉', '🙂', 'body', 2, ''],
  ['eye', '眼睛', '👁️', 'body', 2, 'pc'], ['ear', '耳朵', '👂', 'body', 2, 'pc'], ['mouth', '嘴巴', '👄', 'body', 2, 'pc'],
  ['arm', '手臂', '💪', 'body', 2, ''], ['hand', '手', '✋', 'body', 2, 'pc'], ['leg', '腿', '🦵', 'body', 2, 'pc'],
  ['foot', '腳', '🦶', 'body', 2, 'pc'], ['tooth', '牙齒', '🦷', 'body', 3, 'pc'], ['hair', '頭髮', '💇', 'body', 3, ''],
  // 學校用品
  ['book', '書', '📖', 'school', 1, 'pc'], ['bag', '書包', '🎒', 'school', 1, 'pc'], ['pen', '原子筆', '🖊️', 'school', 2, 'pc'],
  ['pencil', '鉛筆', '✏️', 'school', 2, 'pc'], ['ruler', '尺', '📏', 'school', 2, 'pc'], ['chair', '椅子', '🪑', 'school', 2, 'pc'],
  ['eraser', '橡皮擦', '🧽', 'school', 2, ''], ['desk', '書桌', '🗄️', 'school', 2, ''], ['notebook', '筆記本', '📓', 'school', 3, 'pc'],
  ['crayon', '蠟筆', '🖍️', 'school', 3, 'pc'], ['paper', '紙', '📄', 'school', 3, 'p'], ['glue', '膠水', '🧴', 'school', 3, ''],
  // 家中物品
  ['box', '盒子、箱子', '📦', 'home', 1, 'pc'], ['cup', '杯子', '🥤', 'home', 1, ''], ['door', '門', '🚪', 'home', 2, 'pc'],
  ['window', '窗戶', '🪟', 'home', 2, 'pc'], ['key', '鑰匙', '🔑', 'home', 2, 'pc'], ['table', '桌子', '🍽️', 'home', 2, ''],
  ['bed', '床', '🛏️', 'home', 3, 'pc'],
  // 玩具
  ['ball', '球', '⚽', 'toy', 1, 'pc'], ['toy', '玩具', '🧸', 'toy', 1, ''], ['kite', '風箏', '🪁', 'toy', 1, 'pc'],
  ['yo-yo', '溜溜球', '🪀', 'toy', 1, 'pc'], ['game', '遊戲', '🎮', 'toy', 2, 'pc'], ['doll', '洋娃娃', '🪆', 'toy', 3, ''],
  ['robot', '機器人', '🤖', 'toy', 3, 'pc'], ['balloon', '氣球', '🎈', 'toy', 3, 'pc'], ['puzzle', '拼圖', '🧩', 'toy', 3, 'pc'],
  // 天氣
  ['sun', '太陽', '🌞', 'weather', 1, 'p'], ['weather', '天氣', '🌦️', 'weather', 2, ''], ['sunny', '晴天的', '☀️', 'weather', 2, ''],
  ['cloudy', '多雲的', '🌥️', 'weather', 2, ''], ['rainy', '下雨的', '☔', 'weather', 2, ''], ['windy', '有風的', '🌬️', 'weather', 2, ''],
  ['cloud', '雲', '☁️', 'weather', 3, 'pc'], ['rain', '雨', '🌧️', 'weather', 3, 'p'], ['wind', '風', '💨', 'weather', 3, 'p'],
  ['snow', '雪', '❄️', 'weather', 3, 'p'], ['rainbow', '彩虹', '🌈', 'weather', 3, 'pc'], ['umbrella', '雨傘', '☂️', 'weather', 3, 'pc'],
  // 交通工具
  ['bus', '公車', '🚌', 'vehicle', 2, 'pc'], ['car', '汽車', '🚗', 'vehicle', 2, 'pc'], ['bike', '腳踏車', '🚲', 'vehicle', 2, 'pc'],
  ['train', '火車', '🚆', 'vehicle', 3, 'pc'], ['taxi', '計程車', '🚕', 'vehicle', 3, 'pc'], ['plane', '飛機', '✈️', 'vehicle', 3, 'pc'],
  ['boat', '船', '⛵', 'vehicle', 3, 'pc'], ['truck', '卡車', '🚚', 'vehicle', 3, 'pc'], ['MRT', '捷運', '🚇', 'vehicle', 3, 'pc'],
  ['scooter', '機車', '🛵', 'vehicle', 3, 'pc'],
  // 形容詞
  ['good', '好的', '👍', 'adj', 1, 'p'], ['happy', '快樂的', '😀', 'adj', 1, 'p'], ['bad', '壞的、不好的', '👎', 'adj', 2, 'p'],
  ['sad', '難過的', '😢', 'adj', 2, 'p'], ['hot', '熱的', '🥵', 'adj', 2, 'p'], ['cold', '冷的', '🥶', 'adj', 2, 'p'],
  ['big', '大的', '🐘', 'adj', 2, ''], ['small', '小的', '🐭', 'adj', 2, ''], ['tall', '高的', '🦒', 'adj', 2, ''],
  ['short', '矮的、短的', '🐧', 'adj', 2, ''], ['long', '長的', '🐍', 'adj', 2, ''], ['old', '老的、舊的', '🧓', 'adj', 2, ''],
  ['warm', '溫暖的', '♨️', 'adj', 2, ''], ['cool', '涼爽的', '🧊', 'adj', 2, ''], ['angry', '生氣的', '😠', 'adj', 3, 'p'],
  ['tired', '累的', '😴', 'adj', 3, 'p'], ['quiet', '安靜的', '🤫', 'adj', 3, 'p'], ['yummy', '好吃的', '😋', 'adj', 3, 'p'],
  ['new', '新的', '✨', 'adj', 3, ''], ['fast', '快的', '🚀', 'adj', 3, ''], ['slow', '慢的', '🐢', 'adj', 3, ''],
  ['hungry', '餓的', '🤤', 'adj', 3, ''], ['clean', '乾淨的', '🧼', 'adj', 3, ''], ['cute', '可愛的', '🥰', 'adj', 3, ''],
  // 動詞
  ['look', '看', '👀', 'verb', 1, 'p'], ['go', '去', '➡️', 'verb', 1, ''], ['run', '跑', '🏃', 'verb', 2, 'p'],
  ['walk', '走路', '🚶', 'verb', 2, 'p'], ['sleep', '睡覺', '🛌', 'verb', 2, 'p'], ['write', '寫', '✍️', 'verb', 2, 'p'],
  ['draw', '畫畫', '🎨', 'verb', 2, 'p'], ['sing', '唱歌', '🎤', 'verb', 2, 'p'], ['dance', '跳舞', '💃', 'verb', 2, 'p'],
  ['swim', '游泳', '🏊', 'verb', 2, 'p'], ['listen', '聽', '🎧', 'verb', 2, 'p'], ['cook', '煮菜', '🍳', 'verb', 2, 'p'],
  ['read', '讀', '📚', 'verb', 2, ''], ['play', '玩', '🎲', 'verb', 2, ''], ['open', '打開', '🔓', 'verb', 2, ''],
  ['close', '關上', '🔒', 'verb', 2, ''], ['like', '喜歡', '❤️', 'verb', 2, ''], ['come', '來', '⬅️', 'verb', 2, ''],
  ['stand', '站', '🧍', 'verb', 3, 'p'], ['fly', '飛', '🕊️', 'verb', 3, 'p'], ['jump', '跳', '🤸', 'verb', 3, ''],
  ['sit', '坐', '🧘', 'verb', 3, ''], ['eat', '吃', '🍽️', 'verb', 3, ''], ['drink', '喝', '🥤', 'verb', 3, ''],
  ['wash', '洗', '🚿', 'verb', 3, ''], ['watch', '看（電視）', '📺', 'verb', 3, ''],
  // 衣物
  ['hat', '帽子', '👒', 'cloth', 1, 'pc'], ['shoes', '鞋子', '👟', 'cloth', 2, 'p'], ['jacket', '外套', '🧥', 'cloth', 2, 'pc'],
  ['shirt', '襯衫', '👕', 'cloth', 3, 'pc'], ['socks', '襪子', '🧦', 'cloth', 3, 'p'], ['dress', '洋裝', '👗', 'cloth', 3, 'pc'],
  // 地點
  ['school', '學校', '🏫', 'place', 1, 'pc'], ['home', '家', '🏠', 'place', 1, 'pc'], ['park', '公園', '🏞️', 'place', 2, 'pc'],
  ['zoo', '動物園', '🦒', 'place', 1, ''], ['library', '圖書館', '🏛️', 'place', 3, ''],
  // 位置詞
  ['in', '在……裡面', '📥', 'prep', 2, ''], ['on', '在……上面', '🔛', 'prep', 2, ''], ['under', '在……下面', '⬇️', 'prep', 2, ''],
  ['up', '向上', '⬆️', 'prep', 3, ''],
];

/** 全部字詞（依資料順序） */
export const WORDS: EnWord[] = ROWS.map(([en, zh, emoji, topic, lv, flags]) => ({
  en,
  zh,
  emoji,
  topic,
  lv,
  pic: flags.includes('p'),
  countable: flags.includes('c'),
}));

/** 用英文查字詞，找不到時丟出錯誤（資料與出題器對不上時要立刻發現） */
export function wordOf(en: string): EnWord {
  const w = WORDS.find((x) => x.en === en);
  if (!w) throw new Error(`找不到字詞：${en}`);
  return w;
}

/** 單字前面加不定冠詞：a／an（以母音字母開頭用 an；MRT 例外，念 em-ar-tee 要用 an） */
export function withArticle(word: string): string {
  return /^[aeiou]/i.test(word) || word === 'MRT' ? `an ${word}` : `a ${word}`;
}

/**
 * 看圖時意思太接近、不能同時出現在同一題選項裡的字（例如 tired 😴 與 sleep 🛌、fish 與 swim）。
 * 每一組裡的字兩兩互斥。
 */
const CLASH_GROUPS: string[][] = [
  ['tired', 'sleep'], ['look', 'eye'], ['listen', 'ear'], ['hot', 'sun'], ['cold', 'snow'], ['angry', 'bad'],
  ['happy', 'good', 'yummy'], ['fly', 'bird', 'plane'], ['swim', 'fish'], ['write', 'pen', 'pencil'],
  ['draw', 'pencil', 'crayon'], ['read', 'book'], ['quiet', 'listen'], ['rain', 'umbrella', 'cloud', 'rainbow'],
  ['mom', 'nurse'], ['teacher', 'student', 'doctor', 'nurse', 'friend'], ['boy', 'baby', 'friend'], ['girl', 'baby', 'friend'],
  ['cook', 'egg', 'soup', 'noodle', 'rice'], ['sing', 'dance'], ['run', 'walk'], ['school', 'student', 'teacher'],
  ['milk', 'cup', 'water', 'juice', 'tea'], ['cake', 'candy', 'cookie'],
];

/** 兩個字看圖時會不會互相混淆 */
export function clashes(a: string, b: string): boolean {
  return a === b || CLASH_GROUPS.some((g) => g.includes(a) && g.includes(b));
}
