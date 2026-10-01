/**
 * 字母與自然發音（phonics）資料：依 docs/research/zhuyin-english.md §3.6 與
 * docs/research/curriculum-108.md §6.5.2（新北市低年段 26 組字母代表字）整理。
 * 挑字原則：c、g 取硬音（/k/、/g/）；母音字母取短音；x 開頭的字在課綱字表裡找不到，
 * 所以 x 不當「開頭字母」的答案，只在選項裡當誘答出現。
 */

/** 大寫字母 A～Z */
export const UPPER_LETTERS: string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/** 小寫字母 a～z */
export const LOWER_LETTERS: string[] = 'abcdefghijklmnopqrstuvwxyz'.split('');

/**
 * 容易聽錯或看錯的字母群（出「困難」題時，誘答優先從同一群挑）。
 * 聽：B D P T V G；M N；F S；看：b d p q；n h u；m w 等。
 */
export const CONFUSABLE_SOUND: string[][] = [['B', 'D', 'P', 'T', 'V', 'G', 'C', 'E', 'Z'], ['M', 'N'], ['F', 'S', 'X'], ['I', 'Y'], ['J', 'K', 'A'], ['Q', 'U', 'O']];
export const CONFUSABLE_SHAPE: string[][] = [['b', 'd', 'p', 'q'], ['n', 'h', 'u', 'r'], ['m', 'w', 'n'], ['i', 'j', 'l', 't'], ['c', 'e', 'o', 'a'], ['g', 'q', 'y', 'j'], ['v', 'u', 'y'], ['f', 't', 'k']];

/** 發音相同、不能同時出現在選項裡的字母（c 與 k 的硬音都是 /k/） */
export const SAME_SOUND_PAIRS: [string, string][] = [['C', 'K']];

/** 一個示範字 */
export interface PhonicsWord {
  en: string;
  zh: string;
  emoji: string;
  /** emoji 清楚，可以只看圖猜字 */
  pic: boolean;
  /** 新北市低年段 26 組字母代表字之一 */
  rep: boolean;
}

/** 字母 → 示範字（第一個字母就是該字母；X 沒有開頭字，列字尾 /ks/ 的字備用，不出開頭題） */
export const PHONICS: Record<string, PhonicsWord[]> = {
  A: [w('apple', '蘋果', '🍎'), w('ant', '螞蟻', '🐜', 1), w('angry', '生氣的', '😠')],
  B: [w('ball', '球', '⚽'), w('bear', '熊', '🐻'), w('bird', '鳥', '🐦', 1), w('bus', '公車', '🚌')],
  C: [w('cat', '貓', '🐱'), w('cow', '乳牛', '🐮'), w('cup', '杯子', '🥤', 2)],
  D: [w('dog', '狗', '🐶', 1), w('duck', '鴨子', '🦆'), w('desk', '書桌', '🗄️', 0)],
  E: [w('egg', '蛋', '🥚', 1), w('elephant', '大象', '🐘')],
  F: [w('fish', '魚', '🐟', 1), w('frog', '青蛙', '🐸'), w('fox', '狐狸', '🦊')],
  G: [w('girl', '女孩', '👧'), w('grape', '葡萄', '🍇'), w('goat', '山羊', '🐐', 1), w('game', '遊戲', '🎮')],
  H: [w('hat', '帽子', '👒', 1), w('horse', '馬', '🐴'), w('hand', '手', '✋')],
  I: [w('ink', '墨水', '🖋️', 2), w('insect', '昆蟲', '🐛')],
  J: [w('jacket', '外套', '🧥'), w('juice', '果汁', '🧃'), w('jet', '噴射機', '🛩️', 2)],
  K: [w('kite', '風箏', '🪁', 1), w('key', '鑰匙', '🔑'), w('king', '國王', '🤴')],
  L: [w('lion', '獅子', '🦁', 1), w('leg', '腿', '🦵'), w('lemon', '檸檬', '🍋')],
  M: [w('monkey', '猴子', '🐵', 1), w('milk', '牛奶', '🥛'), w('mouse', '老鼠', '🐭')],
  N: [w('nose', '鼻子', '👃', 1), w('nine', '九', '9️⃣'), w('nurse', '護理師', '👩‍⚕️')],
  O: [w('ox', '公牛', '🐂', 1), w('orange', '柳橙', '🍊')],
  P: [w('pig', '豬', '🐷', 1), w('pen', '原子筆', '🖊️'), w('pizza', '披薩', '🍕')],
  Q: [w('queen', '女王', '👸', 1), w('quiet', '安靜的', '🤫')],
  R: [w('rabbit', '兔子', '🐰', 1), w('red', '紅色', '🔴'), w('rain', '雨', '🌧️')],
  S: [w('sun', '太陽', '🌞', 1), w('six', '六', '6️⃣'), w('soup', '湯', '🍲')],
  T: [w('toy', '玩具', '🧸', 1), w('tiger', '老虎', '🐯'), w('taxi', '計程車', '🚕')],
  U: [w('up', '向上', '⬆️', 2), w('umbrella', '雨傘', '☂️')],
  V: [w('vest', '背心', '🦺', 1), w('violin', '小提琴', '🎻'), w('vegetable', '蔬菜', '🥦')],
  W: [w('watch', '手錶', '⌚', 2), w('water', '水', '💧'), w('window', '窗戶', '🪟'), w('watermelon', '西瓜', '🍉')],
  X: [w('box', '盒子', '📦'), w('fox', '狐狸', '🦊')],
  Y: [w('yo-yo', '溜溜球', '🪀', 1), w('yellow', '黃色', '🟡'), w('yummy', '好吃的', '😋')],
  Z: [w('zebra', '斑馬', '🦓', 1), w('zero', '零', '0️⃣')],
};

/**
 * 建一個示範字。flag：1＝新北代表字（emoji 清楚）、2＝新北代表字但 emoji 只是示意（不配圖）、
 * 0＝非代表字且 emoji 只是示意；省略＝非代表字、emoji 清楚。
 */
function w(en: string, zh: string, emoji: string, flag?: 0 | 1 | 2): PhonicsWord {
  return { en, zh, emoji, pic: flag === undefined || flag === 1, rep: flag === 1 || flag === 2 };
}

/** 能當「開頭字母」答案的字母（沒有 X） */
export const PHONICS_LETTERS: string[] = UPPER_LETTERS.filter((l) => l !== 'X');

/** 把所有開頭字的示範字攤平成清單（X 不算） */
export function phonicsWords(): (PhonicsWord & { letter: string })[] {
  return PHONICS_LETTERS.flatMap((letter) => PHONICS[letter].map((x) => ({ ...x, letter })));
}
