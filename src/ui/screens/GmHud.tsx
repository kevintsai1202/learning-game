/**
 * 熊熊老師進島的畫面（老師 GM 的 G2，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 老師在 3D 班級島上以熊熊老師走動（點地面或觸控搖桿），上方是 GM 工具列：哪一班、連線狀態、離開。
 * 不進建築、沒有金幣與商店。下方工具列：全班公告（最多 60 字，每 10 秒一則）、請大家集合；上方「📋 全班」打開全班清單（GmRoster）。
 */
import { useEffect, useState } from 'react';
import { useUi } from '../../store/useUi';
import { announce, summon, useGm } from '../../online/gmClient';
import { ANNOUNCE_MAX } from '../../online/realtime';
import { Joystick } from './IslandHud';
import { sfx } from '../../audio/sfx';
import { GmRoster } from './GmRoster';

/** 連線狀態的文字 */
const STATUS_TEXT = { off: '', connecting: '連線中…', online: '🟢 在島上', error: '' } as const;

export function GmHud() {
  const room = useUi((s) => s.gmRoom);
  const status = useGm((s) => s.status);
  const error = useGm((s) => s.error);
  const notice = useGm((s) => s.notice);
  const online = status === 'online';
  /** 正在輸入的公告 */
  const [text, setText] = useState('');
  /** 全班清單打開了沒 */
  const [rosterOpen, setRosterOpen] = useState(false);
  const touch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  // 給老師的短訊息 4 秒後收起
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useGm.setState({ notice: null }), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <>
      <div className="hud-top">
        <div className="hud-stats">
          <span className="hud-chip gm-chip" data-testid="gm-hud">
            🐻 熊熊老師・{room?.name ?? ''}
          </span>
          {STATUS_TEXT[status] && (
            <span className="hud-chip" style={{ paddingLeft: 14 }} data-testid="gm-status">
              {STATUS_TEXT[status]}
            </span>
          )}
          <button
            className="hud-chip"
            style={{ paddingLeft: 14 }}
            aria-expanded={rosterOpen}
            onClick={() => {
              sfx.tap();
              setRosterOpen((v) => !v);
            }}
            data-testid="gm-roster-toggle"
          >
            📋 全班
          </button>
        </div>
        <button
          className="hud-chip"
          style={{ paddingLeft: 14 }}
          onClick={() => {
            sfx.tap();
            useUi.getState().goto('teacher');
          }}
          data-testid="gm-leave"
        >
          ← 離開
        </button>
      </div>
      {rosterOpen && room && <GmRoster code={room.code} onClose={() => setRosterOpen(false)} />}
      {error && (
        <p className="notice gm-error" role="alert" data-testid="gm-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="gm-notice" role="status" data-testid="gm-notice">
          {notice.text}
        </p>
      )}
      <form
        className="gm-tools card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!online || !text.trim()) return;
          sfx.tap();
          announce(text);
          setText('');
        }}
      >
        <input
          className="text-input"
          value={text}
          maxLength={ANNOUNCE_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="對全班說一句話（最多 60 字）"
          aria-label="全班公告"
          data-testid="gm-announce-input"
        />
        <button type="submit" className="btn small" disabled={!online || !text.trim()} data-testid="gm-announce">
          📢 公告
        </button>
        <button
          type="button"
          className="btn small green"
          disabled={!online}
          onClick={() => {
            sfx.tap();
            summon();
          }}
          data-testid="gm-summon"
        >
          🔔 集合
        </button>
      </form>
      {touch && <Joystick />}
    </>
  );
}
