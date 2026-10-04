/**
 * 遊戲介面固定朗讀的句子。集中在這裡，預錄語音的盤點腳本（scripts/voice/collect.test.ts）才收得到；
 * 改字後要重跑盤點與產生語音檔，否則那一句會退回裝置語音。
 * 伺服器也 import 這裡（公頻短句），所以只能 import 純模組。
 */
import { findSticker, giftEmoji, giftName, giftPhrase } from '../store/gifts';

/** 標題畫面的歡迎詞 */
export const WELCOME_LINE = '歡迎來到知識島大冒險！';

/** 答對時輪流說的鼓勵語 */
export const PRAISE = ['答對了！', '好棒！', '太厲害了！', '你真聰明！', '完全正確！', '讚喔！'];

/** 第一次答錯時的提示 */
export const RETRY_LINE = '再想想看！';

/** 結算畫面依星星數說的話（索引是星星數，0 顆不說） */
export const RESULT_MESSAGES = ['', '有進步喔！我們再試一次吧！', '很棒！再練一次就更厲害了！', '太厲害了！全部都難不倒你！'];

/** 結算畫面沒有對應訊息時說的話 */
export const RESULT_DONE = '完成了！';

/** 每日遊玩時間到的休息提醒 */
export const REST_LINE = '今天玩很久囉！讓眼睛休息一下，看看遠方吧。';

/** 熊熊老師依序說的提示 */
export const TEACHER_TIPS = [
  '歡迎來到知識島！點地面就可以走過去，點建築就會走到門口喔。',
  '寫國字要注意筆順：先上後下、先左後右、先外後內。',
  '去數學城堡練習看時鐘吧！短針是時針，長針是分針。',
  '過馬路要走斑馬線，紅燈停、綠燈行，還要左右看一看。',
  'ABC 海灘可以練習英文字母，大寫和小寫都要會寫喔。',
  '答錯沒關係，錯題會放進錯題本，多練習幾次就會了！',
  '玩一段時間要讓眼睛休息，看看遠方的綠色植物。',
  '挑戰塔可以做段考模擬，看看自己學會了多少！',
];

/** 益智遊戲館的固定句子 */
export const PUZZLE_LINES = {
  /** 今天的益智遊戲時間用完了（選單） */
  timeUp: '今天的益智遊戲時間用完了，去其他建築挑戰吧！',
  /** 今天的益智金幣拿滿了（結算） */
  coinCap: '今天的益智遊戲金幣拿滿了，明天再來拿喔！',
  /** 和機器人比賽的結果 */
  win: '你贏了！好厲害！',
  tie: '平手！再來一局吧！',
  lose: '差一點點！再試一次吧！',
  /** 益智搶答：機器人先答對、兩個都答錯 */
  botGotIt: '機器人搶先答對了！',
  bothMissed: '都答錯了，看看正確答案。',
};

/** 在百寶屋買到帽子 */
export const boughtLine = (name: string): string => `買到${name}了！`;

/** 選好角色、進入島嶼（含孩子的名字，無法預錄，會用裝置語音） */
export const enterIslandLine = (who: string): string => `${who}，出發囉！點地面就可以走過去。`;

/** 結算畫面：得到新獎章（每個獎章名稱一句，盤點腳本會列出全部獎章，可以預錄） */
export const newBadgeLine = (name: string): string => `得到新獎章：${name}！`;

/** 公頻短句的分組（短句盤上的分區） */
export type ChatGroup = '打招呼' | '稱讚' | '邀約' | '學習' | '心情';

/**
 * 公頻短句：孩子只能選這些句子（不能自由打字）；伺服器只收 id，再換成這裡的文字廣播。
 * 只有表情符號的句子不唸（語音會把表情清掉）。改字後要重跑預錄語音的盤點與產生。
 */
export const CHAT_PHRASES: { id: string; text: string; group: ChatGroup }[] = [
  { id: 'hi', text: '你好！', group: '打招呼' },
  { id: 'play', text: '一起玩吧！', group: '打招呼' },
  { id: 'bye', text: '掰掰！', group: '打招呼' },
  { id: 'great', text: '好厲害！👍', group: '稱讚' },
  { id: 'cheer', text: '加油！💪', group: '稱讚' },
  { id: 'thanks', text: '謝謝你！❤️', group: '稱讚' },
  { id: 'go-math', text: '一起去數學城堡！', group: '邀約' },
  { id: 'go-zh', text: '一起去文字森林！', group: '邀約' },
  { id: 'go-en', text: '一起去 ABC 海灘！', group: '邀約' },
  { id: 'go-life', text: '一起去生活村！', group: '邀約' },
  { id: 'go-tower', text: '一起去挑戰塔！', group: '邀約' },
  { id: 'at-shop', text: '我在百寶屋！', group: '邀約' },
  { id: 'correct', text: '我答對了！🎉', group: '學習' },
  { id: 'three-stars', text: '我拿到三顆星！⭐', group: '學習' },
  { id: 'practice', text: '我在練習錯題！📕', group: '學習' },
  { id: 'badge', text: '我拿到新獎章了！🏅', group: '學習' },
  { id: 'smile', text: '😀', group: '心情' },
  { id: 'laugh', text: '😆', group: '心情' },
  { id: 'wow', text: '😮', group: '心情' },
  { id: 'sad', text: '😢', group: '心情' },
];

/** 送禮物的固定提示（有預錄語音） */
export const GIFT_LINES = {
  pickFriend: '要送給哪位同學呢？',
  pickGift: '要送什麼禮物呢？',
  sent: '送出去了！等朋友收下。',
  accepted: '收下了！放進你的收藏。',
  returned: '你已經有了，禮物退回給朋友。',
  expired: '這份禮物放太久，已經退回去了。',
} as const;

// 下面幾句有暱稱或數字，沒辦法預錄，朗讀時用裝置語音（盤點腳本不收）

/** 動詞後面接禮物：貼紙是「一張 🌷 鬱金香貼紙」，外觀道具不加量詞、前面空一格（「 🎉 派對帽」） */
const afterVerb = (itemId: string): string => (findSticker(itemId) ? giftPhrase(itemId) : ` ${giftPhrase(itemId)}`);

/** 收到禮物的卡片：「小安送你一張 🌷 鬱金香貼紙！」「小安送你 🎉 派對帽！」 */
export const giftCardLine = (from: string, itemId: string): string => `${from}送你${afterVerb(itemId)}！`;

/** 送出的禮物被收下：「小美收下了你送的 🌷 鬱金香貼紙！」 */
export const giftAcceptedLine = (to: string, itemId: string): string => `${to}收下了你送的 ${giftEmoji(itemId)} ${giftName(itemId)}！`;

/** 送出的禮物退回（不用了、過期、已經有了、對方被移出）：不說是誰，避免孩子難過 */
export const giftRefundLine = (price: number): string => `有一份禮物沒送出，${price} 金幣退回來了。`;

/** 送禮前的確認：「要把一張 🌷 鬱金香貼紙（5 金幣）送給小美嗎？」 */
export const giftConfirmLine = (to: string, itemId: string, price: number): string => `要把${afterVerb(itemId)}（${price} 金幣）送給${to}嗎？`;
