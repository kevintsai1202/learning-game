/**
 * 自己的家第二期：小屋門口與屋裡腳踏墊的泡泡（docs/plans/home.md 第 8 節；孩子的 IslandHud 與熊熊老師的 GmHud 共用）。
 * - 島上站在小屋門口：「🏠 ○○的家」＋「進去 ▶」（data-testid enter-home）。
 * - 屋裡站在腳踏墊上：「🚪 門口」＋「回到島上 ▶」（data-testid leave-home）。
 * 走到時唸固定句（島主的名字只放在畫面上，不唸）；按 Enter 或空白鍵也可以。
 */
import { useEffect, useRef } from 'react';
import { enterHome, leaveHome, useHome } from '../store/useHome';
import { HOME_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

/** visual：畫泡泡（手機上由右下的大動作鍵代替，這裡只唸句子、接 Enter 鍵） */
export function HomeDoorBubble({ touch, visual = true }: { touch: boolean; visual?: boolean }) {
  const nearDoor = useHome((s) => s.nearDoor);
  const onMat = useHome((s) => s.onMat);
  const inside = useHome((s) => s.inside !== null && s.inside === s.houseKey);
  const name = useHome((s) => s.houseName);
  const showDoor = nearDoor && !inside;
  const showMat = onMat && inside;

  // 進屋那一刻唸一句（自己的家：歡迎回家；別人的家：進來玩囉）；從別的畫面回來時不再唸
  const own = useHome((s) => s.houseKey === 'mine');
  const wasInside = useRef(inside);
  useEffect(() => {
    if (inside && !wasInside.current) speak(own ? HOME_LINES.welcome : HOME_LINES.visit);
    wasInside.current = inside;
    // 只看進出屋
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inside]);

  // 走到小屋門口、腳踏墊時唸一句
  useEffect(() => {
    if (showDoor) speak(HOME_LINES.door);
  }, [showDoor]);
  useEffect(() => {
    if (showMat) speak(HOME_LINES.mat);
  }, [showMat]);

  // 在門口按 Enter 或空白鍵就進去（出來）
  useEffect(() => {
    if (!showDoor && !showMat) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      sfx.door();
      if (showDoor) enterHome();
      else leaveHome();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDoor, showMat]);

  if (!visual) return null;
  if (showDoor)
    return (
      <div className={`door-bubble card ${touch ? 'touch' : ''}`} data-testid="home-door-bubble">
        <span>🏠 {name ? `${name}的家` : '小屋'}</span>
        <button
          className="btn green"
          onClick={() => {
            sfx.door();
            enterHome();
          }}
          data-testid="enter-home"
        >
          進去 ▶
        </button>
      </div>
    );
  if (showMat)
    return (
      <div className={`door-bubble card ${touch ? 'touch' : ''}`} data-testid="home-mat-bubble">
        <span>🚪 門口</span>
        <button
          className="btn green"
          onClick={() => {
            sfx.door();
            leaveHome();
          }}
          data-testid="leave-home"
        >
          回到島上 ▶
        </button>
      </div>
    );
  return null;
}
