/**
 * 多人上線的「模擬」：在沒有伺服器的情況下，放一群假的同學到島上（走動、說話、有人在建築裡），
 * 讓大家先看到 P2 接上即時連線後的畫面。只從除錯介面啟動（window.__game.presenceDemo），一般使用者看不到。
 * 暱稱、位置、對話都是假的。
 */
import { usePresence } from './usePresence';
import type { RemoteMember } from './presence';
import type { Animal, AvatarConfig } from '../store/save';
import type { ZoneId } from '../store/useUi';

/** 模擬用的短句（P2 會改成 src/ui/lines.ts 的正式短句，並補預錄語音） */
const DEMO_PHRASES = ['你好！', '一起玩吧！', '好厲害！👍', '加油！💪', '一起去數學城堡！', '我答對了！🎉', '我拿到三顆星！⭐', '謝謝你！❤️', '我在練習錯題！📕', '😀'];

/** 一位模擬同學：外觀、位置；path 有值的會沿著路線走 */
interface DemoKid {
  id: string;
  nickname: string;
  animal: Animal;
  color: string;
  x: number;
  z: number;
  heading: number;
  zone?: ZoneId;
  path?: { x: number; z: number }[];
  /** 戴的道具、寵物、走路特效 */
  gear?: Partial<AvatarConfig>;
}

/** 模擬的同學：新動物都在島上，兩位在建築裡（島上看不到，公頻名單顯示在哪裡） */
const KIDS: DemoKid[] = [
  { id: 'demo-capybara', nickname: '阿寶', animal: 'capybara', color: '#8b5a2b', x: -1.8, z: 5.2, heading: 0.2, gear: { pet: 'pet.chick' } },
  { id: 'demo-panda', nickname: '小美', animal: 'panda', color: '#5b5b6b', x: 2.7, z: 4.4, heading: -0.5, gear: { face: 'face.round', hand: 'hand.balloon' } },
  {
    id: 'demo-penguin',
    nickname: '皮皮',
    animal: 'penguin',
    color: '#5b5b6b',
    x: -3.2,
    z: 8.4,
    heading: 1.6,
    gear: { trail: 'trail.stars', back: 'back.cape' },
    path: [
      { x: 3.4, z: 8.4 },
      { x: 3.4, z: 2.6 },
      { x: -3.2, z: 2.6 },
      { x: -3.2, z: 8.4 },
    ],
  },
  { id: 'demo-fox', nickname: '小橘', animal: 'fox', color: '#f2b36b', x: -5.6, z: 2.4, heading: 0.9, gear: { hat: 'hat.pirate' } },
  { id: 'demo-koala', nickname: '圓圓', animal: 'koala', color: '#5b5b6b', x: 5.8, z: 7.4, heading: -1.0, gear: { pet: 'pet.owl', hat: 'hat.scholar' } },
  {
    id: 'demo-pig',
    nickname: '嘟嘟',
    animal: 'pig',
    color: '#ff9db0',
    x: 5.6,
    z: 1.2,
    heading: -1.4,
    gear: { pet: 'pet.butterfly', trail: 'trail.flowers' },
    path: [
      { x: -0.8, z: 0.8 },
      { x: -6.8, z: 6.2 },
      { x: 0.6, z: 10.2 },
      { x: 5.6, z: 1.2 },
    ],
  },
  { id: 'demo-eagle', nickname: '飛飛', animal: 'eagle', color: '#8b5a2b', x: -7.6, z: -3.6, heading: 2.6 },
  {
    id: 'demo-elephant',
    nickname: '大寶',
    animal: 'elephant',
    color: '#c9a7ff',
    x: 4.4,
    z: -0.6,
    heading: -0.4,
    gear: { back: 'back.wings' },
    path: [
      { x: 7.6, z: -3.4 },
      { x: 4.4, z: -0.6 },
    ],
  },
  { id: 'demo-dog', nickname: '毛毛', animal: 'dog', color: '#f2b36b', x: 0, z: 0, heading: 0, zone: 'math' },
  { id: 'demo-cat', nickname: '喵喵', animal: 'cat', color: '#ffffff', x: 0, z: 0, heading: 0, zone: 'en' },
];

/** 開場就有的公頻紀錄（秒數是「幾秒前說的」；0～3 秒前的頭上還有氣泡） */
const OPENING: { id: string; text: string; secondsAgo: number }[] = [
  { id: 'demo-dog', text: '我答對了！🎉', secondsAgo: 40 },
  { id: 'demo-cat', text: '加油！💪', secondsAgo: 28 },
  { id: 'demo-panda', text: '一起去數學城堡！', secondsAgo: 15 },
  { id: 'demo-capybara', text: '你好！', secondsAgo: 2 },
  { id: 'demo-penguin', text: '一起玩吧！', secondsAgo: 1 },
  { id: 'demo-pig', text: '我拿到三顆星！⭐', secondsAgo: 0 },
];

/** 走路的人每隔多久換下一個點（毫秒）、多久有人說一句話 */
const WALK_EVERY_MS = 2200;
const CHAT_EVERY_MS = 2800;

/**
 * 開始模擬：清空目前的同島狀態、放入模擬同學、開始走動與說話。回傳停止的函式（停止時清空）。
 * 說話的人與句子依固定順序輪流（每次跑都一樣，截圖可以重現）。
 */
export function startPresenceDemo(): () => void {
  const store = usePresence.getState();
  store.clear();
  for (const k of KIDS) {
    const m: RemoteMember = {
      id: k.id,
      nickname: k.nickname,
      avatar: { animal: k.animal, color: k.color, hat: null, ...k.gear },
      x: k.x,
      z: k.z,
      heading: k.heading,
      zone: k.zone ?? null,
    };
    store.upsert(m);
  }
  const now = Date.now();
  for (const o of OPENING) store.say(o.id, o.text, now - o.secondsAgo * 1000);

  // 走動：沿路線一個點一個點走（畫面會用走路速度內插過去）
  const step = new Map(KIDS.filter((k) => k.path).map((k) => [k.id, 0]));
  const walk = setInterval(() => {
    for (const k of KIDS) {
      if (!k.path) continue;
      const i = step.get(k.id)!;
      const from = usePresence.getState().members[k.id];
      const to = k.path[i % k.path.length];
      if (from) usePresence.getState().move(k.id, to.x, to.z, Math.atan2(to.x - from.x, to.z - from.z));
      step.set(k.id, i + 1);
    }
  }, WALK_EVERY_MS);

  // 說話：島上的人輪流說固定順序的短句
  const speakers = KIDS.filter((k) => !k.zone).map((k) => k.id);
  let turn = 0;
  const chat = setInterval(() => {
    usePresence.getState().say(speakers[turn % speakers.length], DEMO_PHRASES[turn % DEMO_PHRASES.length]);
    turn += 1;
  }, CHAT_EVERY_MS);

  return () => {
    clearInterval(walk);
    clearInterval(chat);
    usePresence.getState().clear();
  };
}
