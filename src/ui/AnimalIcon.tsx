/**
 * 動物圖示：有 emoji 就顯示 emoji；Unicode 沒有的動物（卡皮巴拉）改畫簡單的 inline SVG。
 * SVG 用 em 當單位，大小會跟著外層的 font-size，和 emoji 一樣大。
 */
import type { Animal } from '../store/save';
import { ANIMALS } from './screens/ProfilesScreen';

/** 卡皮巴拉的臉：方鈍的大口鼻、小圓耳朵、小眼睛 */
function CapybaraSvg() {
  return (
    <svg className="animal-svg" viewBox="0 0 64 64" width="1em" height="1em" aria-hidden="true" focusable="false">
      {/* 耳朵 */}
      <circle cx="17" cy="15" r="6" fill="#a8703c" />
      <circle cx="47" cy="15" r="6" fill="#a8703c" />
      <circle cx="17" cy="15" r="3" fill="#7a4a24" />
      <circle cx="47" cy="15" r="3" fill="#7a4a24" />
      {/* 頭（上圓下方的方鈍形狀） */}
      <path d="M10 28 C10 15 22 11 32 11 C42 11 54 15 54 28 L54 46 C54 53 49 57 42 57 L22 57 C15 57 10 53 10 46 Z" fill="#c68a4e" />
      {/* 大口鼻 */}
      <rect x="16" y="33" width="32" height="22" rx="9" fill="#e0b37a" />
      {/* 鼻孔 */}
      <ellipse cx="25" cy="38" rx="2.6" ry="3.4" fill="#4a2c16" />
      <ellipse cx="39" cy="38" rx="2.6" ry="3.4" fill="#4a2c16" />
      {/* 嘴巴 */}
      <path d="M25 49 Q32 53 39 49" fill="none" stroke="#4a2c16" strokeWidth="2" strokeLinecap="round" />
      {/* 眼睛 */}
      <circle cx="21" cy="26" r="3" fill="#2b2a4c" />
      <circle cx="43" cy="26" r="3" fill="#2b2a4c" />
      <circle cx="22" cy="25" r="1" fill="#fff" />
      <circle cx="44" cy="25" r="1" fill="#fff" />
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
