/**
 * 島嶼版面：各建築的位置、門口、碰撞範圍。
 * 採「立體透視模型」配置：建築都在北側排成弧形、面向南方，攝影機永遠從南方看過去，
 * 角色不會被建築擋住，孩子也不會因為鏡頭旋轉而迷路。
 * 座標：x 向右（東）、z 向鏡頭（南），y 向上，單位約 1 公尺。
 */
import type { SubjectId } from '../core/types';
import type { ZoneId } from '../store/useUi';

/** 一個區域（建築）的版面資料 */
export interface ZoneLayout {
  id: ZoneId;
  /** 顯示名稱 */
  name: string;
  /** 一句話介紹（靠近時朗讀） */
  intro: string;
  subject: SubjectId | null;
  /** 建築中心 */
  x: number;
  z: number;
  /** 建築面向的角度（弧度，0 = 面向 +z 南方） */
  rotY: number;
  /** 碰撞半徑 */
  radius: number;
  /** 主題色 */
  color: string;
  icon: string;
}

export const ZONES: ZoneLayout[] = [
  { id: 'tower', name: '挑戰塔', intro: '挑戰塔！來一場段考模擬吧！', subject: null, x: 0, z: -15, rotY: 0, radius: 3.2, color: '#8b5cf6', icon: '🏆' },
  { id: 'math', name: '數學城堡', intro: '數學城堡！算數、時鐘、錢幣都在這裡。', subject: 'math', x: -11, z: -10, rotY: 0.45, radius: 4.2, color: '#ff8a3d', icon: '🏰' },
  { id: 'zh', name: '文字森林', intro: '文字森林！來學注音和寫國字。', subject: 'zh', x: 11, z: -10, rotY: -0.45, radius: 3.6, color: '#3fbf7f', icon: '🌳' },
  { id: 'life', name: '生活村', intro: '生活村！認識四季、安全和健康。', subject: 'life', x: -16, z: 2.5, rotY: 1.1, radius: 3.8, color: '#f2b705', icon: '🏡' },
  { id: 'en', name: 'ABC 海灘', intro: 'ABC 海灘！一起說英語、寫字母。', subject: 'en', x: 16, z: 2.5, rotY: -1.1, radius: 3.4, color: '#2bb5c8', icon: '🏖️' },
  { id: 'shop', name: '百寶屋', intro: '百寶屋！用金幣換帽子和裝扮。', subject: null, x: -7.5, z: 11, rotY: 0.35, radius: 2.6, color: '#e8457c', icon: '🎁' },
  { id: 'puzzle', name: '益智遊戲館', intro: '益智遊戲館！動動腦，和機器人比一比。', subject: null, x: 7.5, z: 11, rotY: -0.35, radius: 2.6, color: '#2f6fde', icon: '🧩' },
];

/** 依 id 取得區域 */
export function zoneById(id: ZoneId): ZoneLayout {
  const z = ZONES.find((v) => v.id === id);
  if (!z) throw new Error(`找不到區域 ${id}`);
  return z;
}

/** 建築名稱；不認得的 id（例如同學的裝置版本比較新）回傳「別的地方」，不丟例外 */
export function zoneName(id: ZoneId): string {
  return ZONES.find((v) => v.id === id)?.name ?? '別的地方';
}

/** 門口位置：建築正面前方 radius + 1.2 公尺 */
export function doorOf(z: ZoneLayout): { x: number; z: number } {
  const d = z.radius + 1.2;
  return { x: z.x + Math.sin(z.rotY) * d, z: z.z + Math.cos(z.rotY) * d };
}

/** 熊熊老師站的位置（中央廣場） */
export const TEACHER_POS = { x: 1.8, z: -1.5 };
/** 角色出生點（南邊沙灘） */
export const SPAWN = { x: 0, z: 13 };
/** 可行走範圍半徑（草地） */
export const WALK_RADIUS = 21.5;
/** 島的外緣半徑（沙灘外緣） */
export const ISLAND_RADIUS = 25;
/** 中央噴水池 */
export const FOUNTAIN = { x: 0, z: -3.2, radius: 1.9 };

/**
 * 我的島的地標（L5）：孩子的小屋（西南角，門朝出生點，門前留空地，之後朝動物森友會的方向讓孩子進屋、佈置）、
 * 上岸後往廣場走的步道旁的島門牌（在角色的北邊，字不會擋到角色）、班級島噴水池旁的旗桿。clear 是小屋周圍拿掉樹的半徑（只在我的島）
 */
export const HOUSE = { x: -14, z: 11, rotY: Math.atan2(SPAWN.x - -14, SPAWN.z - 11), radius: 2.1, clear: 4.2 };
export const PLATE = { x: 3.2, z: 10.4 };
export const FLAGPOLE = { x: -2.6, z: -5 };
