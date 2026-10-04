/**
 * 益智遊戲館的遊戲目錄（純資料）：選單的卡片與選玩法的說明。
 * 語音盤點腳本也讀這裡（遊戲名稱會朗讀），所以不能 import 畫面元件；元件的對照在 PuzzleScreen.tsx。
 */
import type { PuzzleGameId } from '../store/puzzle';

/** 選單上的一個遊戲 */
export interface PuzzleGameInfo {
  id: PuzzleGameId;
  title: string;
  icon: string;
  /** 一句話介紹（選玩法時顯示） */
  description: string;
  /** 自己玩的玩法 */
  solo: string;
  /** 和機器人比賽的玩法 */
  vs: string;
  /** 自己玩也要選難度（簡單／普通／厲害）；益智搶答自己玩不分難度 */
  soloLevels: boolean;
}

/** 已經做好的遊戲（依難易排列；第一批的順序見 docs/plans/puzzle-house.md 第 6.1 節） */
export const PUZZLE_GAMES: PuzzleGameInfo[] = [
  {
    id: 'quiz',
    title: '益智搶答',
    icon: '❓',
    description: '國語、數學、英語、生活的題目都有，看誰答得又快又對！',
    solo: '連續答對挑戰：答錯 3 題就結束，看你最多能連對幾題',
    vs: '和機器人搶答 10 題：先答對的得分',
    soloLevels: false,
  },
  {
    id: 'memory',
    title: '記憶翻牌',
    icon: '🃏',
    description: '翻兩張牌，一樣的就配成一對！英文單字配圖、乘法算式配答案、中文配圖輪流出現。',
    solo: '用越少步配完越好（簡單 6 對、普通 8 對、厲害 10 對）',
    vs: '和機器人輪流翻牌：配對成功可以再翻一次，配到比較多對的贏',
    soloLevels: true,
  },
  {
    id: 'spot',
    title: '找不同',
    icon: '🔍',
    description: '兩張島上的風景圖，右邊的圖有幾個地方不一樣，找出來點一下！',
    solo: '限時找完（簡單 3 處、普通 5 處、厲害 7 處），亂點會扣 3 秒',
    vs: '和機器人一起找：誰先點到就是誰的，找到比較多處的贏',
    soloLevels: true,
  },
  {
    id: 'blocks',
    title: '積木大師',
    icon: '🧱',
    description: '數數看，一堆積木共有幾個？被擋住看不到的也要算喔！',
    solo: '數數看 8 題（簡單 3～7 個、普通 5～10 個、厲害 8～15 個）',
    vs: '和機器人搶答 8 題：先答對的得分',
    soloLevels: true,
  },
];

/** 依 id 找遊戲 */
export function puzzleGame(id: PuzzleGameId): PuzzleGameInfo | undefined {
  return PUZZLE_GAMES.find((g) => g.id === id);
}
