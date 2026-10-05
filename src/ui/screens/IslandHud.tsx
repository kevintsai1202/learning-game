/**
 * 島上的介面：角色名牌、金幣與星星、雲端同步狀態、班級島與我的島的切換、好友名單、門口提示泡泡、熊熊老師的話、觸控搖桿、公頻。
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
import { islandOf } from '../../store/island';
import { ISLAND_LINES } from '../lines';
import { FriendsButton, FriendsPanel } from '../FriendsPanel';

/** 同步狀態的圖示與文字 */
const CLOUD_LABEL: Record<CloudStatus, string> = {
  idle: '☁️',
  syncing: '🔄 同步中',
  synced: '☁️ 已存到班級',
  offline: '📴 離線',
  needLogin: '🔑 請重新登入',
  error: '⚠️ 同步失敗',
};

/**
 * 雲端角色才顯示：進度有沒有存到班級（家長名下、沒有班級的角色寫「雲端」）；
 * 需要重新登入時點一下去登入：班級角色到班級畫面，沒有班級的到帳號頁（家長登入找回）
 */
function CloudChip() {
  const status = useCloud((s) => s.status);
  const pending = useCloud((s) => s.pending);
  const goto = useUi((s) => s.goto);
  /** 目前角色在不在班級裡 */
  const inClass = useGame((s) => !!s.profile()?.cloud?.room);
  const base = status === 'synced' && !inClass ? '☁️ 已存到雲端' : CLOUD_LABEL[status];
  const label = base + (pending > 0 && status !== 'synced' ? `・${pending} 筆待上傳` : '');
  return (
    <button
      className="hud-chip"
      style={{ paddingLeft: 14 }}
      onClick={() => status === 'needLogin' && goto(inClass ? 'class' : 'teacher')}
      aria-label={`同步狀態：${label}`}
      data-testid="hud-cloud"
      data-status={status}
    >
      {label}
    </button>
  );
}

/**
 * 班級角色才顯示：切換班級島與我的島（老師 GM 的 G1）。按鈕寫要去的島。
 * 我的島看不到同學、用家長選的版本與裝置上的題庫；切回班級島時同步一次，拿老師最新的班級版本。
 */
function IslandSwitch() {
  const profile = useGame((s) => s.profile());
  const setIsland = useGame((s) => s.setIsland);
  if (!profile?.cloud?.room) return null;
  const island = islandOf(profile);
  const toggle = () => {
    const next = island === 'class' ? 'mine' : 'class';
    sfx.tap();
    setIsland(profile.id, next);
    const line = next === 'mine' ? ISLAND_LINES.toMine : ISLAND_LINES.toClass;
    useUi.getState().say(line);
    speak(line);
    if (next === 'class') void useCloud.getState().syncNow();
  };
  return (
    <button className="hud-chip" style={{ paddingLeft: 14 }} onClick={toggle} data-testid="hud-island" data-island={island}>
      {island === 'class' ? '🏝️ 去我的島' : '🏫 回班級島'}
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
          <IslandSwitch />
          <FriendsButton />
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
        <div className={`door-bubble card ${touch ? 'touch' : ''}`} data-testid="door-bubble">
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
      <FriendsPanel />
    </>
  );
}
