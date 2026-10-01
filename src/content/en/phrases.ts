/**
 * 生活用語與教室用語（種子資料）：英文句子取自臺北市國小英語課綱附錄 2.A「低年段生活用語（含教室用語）」
 * （docs/research/zhuyin-english.md §3.5，原文以斜線並列的說法拆成單獨一句），
 * 新北市低年段 10 句教室用語（docs/research/curriculum-108.md §6.5.2）標為 ntpc。
 * 中文意思、情境說明、emoji 為自編。
 *
 * lv：1＝新北 10 句教室用語核心；2＝臺北市低年段其餘句子（原文只有 29 句）；3＝同一組問答的另一半與延伸說法。
 */

export interface EnPhrase {
  /** 英文（朗讀用，也是看字題顯示的文字） */
  en: string;
  zh: string;
  emoji: string;
  kind: 'classroom' | 'life';
  /** 中文情境：「什麼時候說這句？」題幹用，結尾不含冒號 */
  scene: string;
  lv: 1 | 2 | 3;
  /** 新北市低年段 10 句教室用語之一 */
  ntpc: boolean;
}

/** 一列：[英文, 中文, emoji, 類別, 情境, 難度, 新北] */
type Row = [string, string, string, 'classroom' | 'life', string, 1 | 2 | 3, boolean];

const ROWS: Row[] = [
  // 教室用語（臺北 Commands/Requests 13 句）
  ['Be quiet.', '請安靜。', '🤫', 'classroom', '老師要大家安靜', 1, true],
  ['Come here, please.', '請過來。', '👋', 'classroom', '老師請你走到她身邊', 1, true],
  ['Listen!', '聽！', '👂', 'classroom', '老師要大家注意聽', 1, true],
  ['Look!', '看！', '👀', 'classroom', '老師要大家看黑板', 1, true],
  ['Sit down.', '請坐下。', '🪑', 'classroom', '老師要大家坐下', 1, true],
  ['Stand up.', '請站起來。', '🧍', 'classroom', '老師要大家站起來', 1, true],
  ['Good job!', '做得好！', '👍', 'classroom', '老師稱讚你表現很棒', 1, true],
  ['Listen carefully!', '仔細聽！', '🎧', 'classroom', '老師要大家專心聽清楚', 2, false],
  ['Look here!', '看這裡！', '👉', 'classroom', '老師要大家看她手上拿的圖卡', 2, false],
  ['Open your book.', '打開你的書。', '📖', 'classroom', '老師要大家把課本翻開', 2, false],
  ['Close your book.', '闔上你的書。', '📕', 'classroom', '老師要大家把課本闔起來', 2, false],
  ['Raise your hand, please.', '請舉手。', '🙋', 'classroom', '老師請知道答案的人舉手', 2, false],
  ['Put your hand down, please.', '請把手放下。', '🙌', 'classroom', '老師請舉手的人把手放下', 2, false],
  ['Repeat after me, please.', '請跟我說。', '🗣️', 'classroom', '老師要大家跟著她唸一遍', 2, false],
  ['Go back to your seat, please.', '請回座位。', '💺', 'classroom', '老師請你回到自己的位子', 2, false],
  ['Take out your book.', '拿出你的書。', '🎒', 'classroom', '老師要大家把書從書包拿出來', 2, false],
  ['Put away your book.', '收起你的書。', '📚', 'classroom', '下課了，老師要大家把書收起來', 2, false],
  ['Point to the word "fish."', '指出 fish 這個字。', '☝️', 'classroom', '老師要大家用手指出 fish 這個字', 3, false],
  ['Circle the word "fish."', '把 fish 這個字圈起來。', '⭕', 'classroom', '老師要大家用筆把 fish 這個字圈起來', 3, false],
  ['Repeat.', '請再說一次。', '🔁', 'classroom', '老師請你再說一遍', 3, false],
  // 生活用語（臺北 Exchanges 8 組 16 句）
  ['Good morning.', '早安。', '🌅', 'life', '早上到學校遇見老師，要向老師問好', 1, true],
  ['Hello!', '哈囉！', '👋', 'life', '遇見朋友，要跟他打招呼', 1, true],
  ['Hi!', '嗨！', '🙋', 'life', '在走廊遇見同學，要簡單打個招呼', 1, true],
  ['OK.', '好的。', '🆗', 'life', '老師問你可不可以，你要回答「好」', 1, true],
  ['Good afternoon.', '午安。', '☀️', 'life', '下午遇見老師，要向老師問好', 2, false],
  ['Goodbye.', '再見。', '👋', 'life', '放學了，要跟老師說再見', 2, false],
  ['See you later.', '待會見。', '🕐', 'life', '等一下還會再見到朋友，分開時可以說', 2, false],
  ['How are you?', '你好嗎？', '🙂', 'life', '想關心朋友今天過得好不好', 2, false],
  ["I'm fine.", '我很好。', '😊', 'life', '朋友問你好不好，你覺得很好', 2, false],
  ['Thank you.', '謝謝你。', '🙏', 'life', '朋友借你橡皮擦，你要道謝', 2, false],
  ["You're welcome.", '不客氣。', '🤝', 'life', '別人跟你說 Thank you，你要回答', 2, false],
  ['Very good.', '很好。', '🌟', 'life', '老師看了你的作業，稱讚你寫得很好', 2, false],
  ['Thanks.', '謝謝。', '😄', 'life', '老師稱讚你，你要簡單地說謝謝', 3, false],
  ["I'm not OK.", '我不太好。', '😟', 'life', '朋友問你好不好，但你有一點不舒服', 3, false],
  ["Who's next?", '下一位是誰？', '🙋‍♂️', 'life', '老師問下一個換誰', 3, false],
  ["It's my turn.", '輪到我了。', '🙌', 'life', '輪到你了，你要告訴大家', 3, false],
  ['Are you ready?', '你準備好了嗎？', '❓', 'life', '老師問你有沒有準備好', 3, false],
  ['Yes, I am.', '是的，我準備好了。', '✅', 'life', '老師問 Are you ready? 你已經準備好了', 3, false],
  ['No, not yet.', '還沒。', '⏳', 'life', '老師問 Are you ready? 你還沒準備好', 3, false],
  ['Good morning, Ms. Wang.', '王老師早安。', '👩‍🏫', 'life', '早上遇見王老師，要有禮貌地問好', 3, false],
  ['Good afternoon, Mr. Lee.', '李老師午安。', '👨‍🏫', 'life', '下午遇見李老師，要有禮貌地問好', 3, false],
];

export const PHRASES: EnPhrase[] = ROWS.map(([en, zh, emoji, kind, scene, lv, ntpc]) => ({ en, zh, emoji, kind, scene, lv, ntpc }));

/** 簡易句型的人名（What's your name? — My name is ___.） */
export const NAMES = ['Andy', 'Amy', 'Tom', 'Lily', 'Ben', 'Judy', 'Sam', 'Emma'];
