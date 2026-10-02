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
      {/* 長寬的口鼻 */}
      <rect x="15" y="38" width="34" height="20" rx="9" fill="#d9a56a" />
      {/* 鼻墊與鼻孔 */}
      <rect x="19" y="39" width="26" height="6" rx="3" fill="#5a3a20" />
      <circle cx="27" cy="42" r="1.4" fill="#1d120a" />
      <circle cx="37" cy="42" r="1.4" fill="#1d120a" />
      {/* 嘴巴 */}
      <path d="M27 53 L37 53" stroke="#4a2c16" strokeWidth="2" strokeLinecap="round" />
      {/* 半閉的眼睛：深色圓上面蓋一層毛色眼皮 */}
      <circle cx="22" cy="31" r="3" fill="#2b2a4c" />
      <circle cx="42" cy="31" r="3" fill="#2b2a4c" />
      <path d="M18.5 30.5 A3.6 3.6 0 0 1 25.5 30.5 Z" fill="#c68a4e" />
      <path d="M38.5 30.5 A3.6 3.6 0 0 1 45.5 30.5 Z" fill="#c68a4e" />
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
