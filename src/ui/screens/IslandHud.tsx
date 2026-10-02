/**
 * 島上的介面：角色名牌、金幣與星星、雲端同步狀態、門口提示泡泡、熊熊老師的話、觸控搖桿、公頻。
 */
import { useEffect, useRef } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { zoneById } from '../../world/layout';
import { input, player } from '../../world/input';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { AnimalIcon } from '../AnimalIcon';
import { teacherTalk } from '../teacherTips';
import { useCloud, type CloudStatus } from '../../online/useCloud';
import { ChatPanel } from '../ChatPanel';
import { GiftInbox } from '../GiftInbox';
import { GiftDialog } from '../GiftDialog';
import { shownTitle } from '../../store/badges';

/** 同步狀態的圖示與文字 */
const CLOUD_LABEL: Record<CloudStatus, string> = {
  idle: '☁️',
  syncing: '🔄 同步中',
  synced: '☁️ 已存到班級',
  offline: '📴 離線',
  needLogin: '🔑 請重新登入',
  error: '⚠️ 同步失敗',
};

/** 雲端角色才顯示：進度有沒有存到班級；需要重新登入時點一下去登入 */
function CloudChip() {
  const status = useCloud((s) => s.status);
  const pending = useCloud((s) => s.pending);
  const goto = useUi((s) => s.goto);
  const label = CLOUD_LABEL[status] + (pending > 0 && status !== 'synced' ? `・${pending} 筆待上傳` : '');
  return (
    <button
      className="hud-chip"
      style={{ paddingLeft: 14 }}
      onClick={() => status === 'needLogin' && goto('class')}
      aria-label={`同步狀態：${label}`}
      data-testid="hud-cloud"
      data-status={status}
    >
      {label}
    </button>
  );
}

/** 觸控搖桿：拖曳圓鈕控制方向 */
function Joystick() {
  const knob = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const RADIUS = 50;
  const move = (x: number, y: number) => {
    if (!origin.current) return;
    let dx = x - origin.current.x;
    let dy = y - origin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    input.joy = { x: dx / RADIUS, z: dy / RADIUS };
    player.target = null;
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const end = () => {
    origin.current = null;
    input.joy = { x: 0, z: 0 };
    if (knob.current) knob.current.style.transform = '';
  };
  useEffect(() => end, []);
  return (
    <div
      className="joystick"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => move(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="移動搖桿"
    >
      <div ref={knob} className="knob" />
    </div>
  );
}

/** 熊熊老師的對話泡泡（6 秒後自動收起） */
export function SpeechBubble() {
  const bubble = useUi((s) => s.bubble);
  const clear = useUi((s) => s.clearBubble);
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(clear, 6500);
    return () => clearTimeout(t);
  }, [bubble, clear]);
  if (!bubble) return null;
  return (
    <div className="speech card" key={bubble.id} onClick={clear} role="status">
      <span className="who">🐻</span>
      <span>{bubble.text}</span>
    </div>
  );
}

export function IslandHud() {
  const profile = useGame((s) => s.profile());
  const nearZone = useUi((s) => s.nearZone);
  const enterZone = useUi((s) => s.enterZone);
  const goto = useUi((s) => s.goto);
  const touch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  const totalStars = profile ? Object.values(profile.bestStars).reduce((s, v) => s + v, 0) : 0;

  // 走到門口時唸出建築介紹
  useEffect(() => {
    if (nearZone) speak(zoneById(nearZone).intro);
  }, [nearZone]);

  // 在門口按 Enter 或空白鍵就進去
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && useUi.getState().nearZone) {
        e.preventDefault();
        sfx.door();
        enterZone(useUi.getState().nearZone!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enterZone]);

  const near = nearZone ? zoneById(nearZone) : null;
  return (
    <>
      <div className="hud-top">
        <div className="hud-stats">
          {profile && (
            <button className="hud-chip" onClick={() => goto('profiles')} aria-label="換角色" data-testid="hud-profile">
              <span className="avatar-dot" style={{ background: profile.avatar.color }}>
                <AnimalIcon animal={profile.avatar.animal} />
              </span>
              <span className="hud-name">
                {profile.name}
                {shownTitle(profile) && (
                  <small className="hud-title" data-testid="hud-title">
                    {shownTitle(profile)}
                  </small>
                )}
              </span>
            </button>
          )}
          <span className="hud-chip" data-testid="hud-coins" style={{ paddingLeft: 14 }}>
            🪙 {profile?.coins ?? 0}
          </span>
          <span className="hud-chip" style={{ paddingLeft: 14 }}>
            ⭐ {totalStars}
          </span>
          {profile?.cloud && <CloudChip />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn round white" onClick={() => goto('badges')} aria-label="獎章簿" data-testid="hud-badges">
            🏅
          </button>
          <button className="btn round white" onClick={teacherTalk} aria-label="問熊熊老師">
            🐻
          </button>
          <button className="btn round white" onClick={() => goto('parent')} aria-label="家長專區" data-testid="hud-parent">
            ⚙️
          </button>
        </div>
      </div>
      <SpeechBubble />
      {near ? (
        <div className="door-bubble card" data-testid="door-bubble">
          <span>
            {near.icon} {near.name}
          </span>
          <button
            className="btn green"
            onClick={() => {
              sfx.door();
              enterZone(near.id);
            }}
            data-testid="enter-zone"
          >
            進去玩 ▶
          </button>
        </div>
      ) : (
        <div className="hud-hint">{touch ? '點地面走過去・點建築就會進去' : '點地面或用方向鍵走路・點建築就會進去'}</div>
      )}
      {touch && <Joystick />}
      <ChatPanel />
      {/* 禮物卡片與送禮視窗：只在島上（不打斷答題） */}
      <GiftInbox />
      <GiftDialog />
    </>
  );
}
