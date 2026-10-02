/**
 * 動物圖示：有 emoji 就顯示 emoji；Unicode 沒有的動物（卡皮巴拉）改畫簡單的 inline SVG。
 * SVG 用 em 當單位，大小會跟著外層的 font-size，和 emoji 一樣大。
 */
import type { Animal } from '../store/save';
import { ANIMALS } from './screens/ProfilesScreen';

/** 卡皮巴拉的臉：方方的吐司頭、長寬的平鈍口鼻、半閉的小眼睛，頭頂一顆橘子 */
function CapybaraSvg() {
  return (
    <svg className="animal-svg" viewBox="0 0 64 64" width="1em" height="1em" aria-hidden="true" focusable="false">
      {/* 耳朵（頭頂後方兩角） */}
      <circle cx="16" cy="22" r="5" fill="#a8703c" />
      <circle cx="48" cy="22" r="5" fill="#a8703c" />
      {/* 方方的頭 */}
      <rect x="11" y="19" width="42" height="40" rx="12" fill="#c68a4e" />
      {/* 頭頂的橘子與葉子 */}
      <circle cx="32" cy="13" r="9" fill="#ff8c1a" />
      <path d="M33 5 Q41 1 43 7 Q37 10 33 5 Z" fill="#3fae4a" />
      {/* 長寬的口鼻：和頭同一個毛色（略深） */}
      <rect x="13" y="35" width="38" height="23" rx="11" fill="#b9803f" />
      {/* 鼻墊與鼻孔 */}
      <rect x="17" y="37" width="30" height="10" rx="5" fill="#6b4423" />
      <ellipse cx="25.5" cy="42" rx="2.2" ry="3" fill="#1d120a" />
      <ellipse cx="38.5" cy="42" rx="2.2" ry="3" fill="#1d120a" />
      {/* 嘴巴：淺淺的人字形 */}
      <path d="M28 52 L32 54.5 L36 52" fill="none" stroke="#4a2c16" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {/* 半閉的眼睛：深色圓上面蓋一層毛色眼皮 */}
      <circle cx="22" cy="30" r="3.6" fill="#2b2a4c" />
      <circle cx="42" cy="30" r="3.6" fill="#2b2a4c" />
      <circle cx="23" cy="31.2" r="1" fill="#fff" />
      <circle cx="43" cy="31.2" r="1" fill="#fff" />
      <path d="M17.6 29.2 A4.4 4.4 0 0 1 26.4 29.2 Z" fill="#c68a4e" />
      <path d="M37.6 29.2 A4.4 4.4 0 0 1 46.4 29.2 Z" fill="#c68a4e" />
    </svg>
  );
}

/** 顯示指定動物的圖示（選單按鈕、角色卡、名牌共用） */
export function AnimalIcon({ animal }: { animal: Animal }) {
  const emoji = ANIMALS.find((x) => x.id === animal)?.emoji;
  if (emoji) return <>{emoji}</>;
  if (animal === 'capybara') return <CapybaraSvg />;
  return <>🐻</>;
}
