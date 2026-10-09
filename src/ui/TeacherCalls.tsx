/**
 * 熊熊老師的公告字幕與集合卡片（老師 GM 的 G2，孩子的畫面）：
 * - 公告：畫面上方的大字幕，8 秒後收起（朗讀由即時連線收到時處理，答題時不唸）
 * - 集合卡片：在建築裡時「過去」、在別座島時「回班級島」，也可以按「等一下」；60 秒沒處理就收起
 */
import { useEffect } from 'react';
import { useTeacherCalls } from '../online/useTeacherCalls';
import { useUi } from '../store/useUi';
import { useGame } from '../store/useGame';
import { teleport } from '../world/input';
import { GM_LINES } from './lines';
import { sfx } from '../audio/sfx';

/** 公告顯示多久（毫秒） */
const ANNOUNCE_MS = 8000;
/** 集合卡片沒處理多久就收起（毫秒） */
const SUMMON_MS = 60_000;

/** 畫面上方的公告字幕 */
export function AnnounceBanner() {
  const a = useTeacherCalls((s) => s.announce);
  useEffect(() => {
    if (!a) return;
    const timer = setTimeout(() => useTeacherCalls.getState().clearAnnounce(), ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [a]);
  if (!a) return null;
  return (
    <div className="announce-banner" role="status" data-testid="announce-banner">
      <span className="announce-who">🐻 熊熊老師</span>
      <span className="announce-text">{a.text}</span>
    </div>
  );
}

/** 集合卡片 */
export function SummonCard() {
  const call = useTeacherCalls((s) => s.summon);
  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => useTeacherCalls.getState().clearSummon(), SUMMON_MS);
    return () => clearTimeout(timer);
  }, [call]);
  if (!call) return null;
  /** 過去：到那一班的班級島（在別座島時先換島），站到老師身邊 */
  const go = () => {
    sfx.tap();
    const p = useGame.getState().profile();
    if (call.kind === 'back' && p) useGame.getState().setIsland(p.id, call.room);
    teleport({ x: call.x, z: call.z });
    useUi.getState().goto('island');
    useTeacherCalls.getState().clearSummon();
  };
  return (
    <div className="card summon-card" role="dialog" aria-label="熊熊老師請大家集合" data-testid="summon-card">
      <div className="summon-big" aria-hidden>
        🐻
      </div>
      <p className="summon-text">{call.kind === 'back' ? GM_LINES.backToClass : GM_LINES.summon}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn green" onClick={go} data-testid={call.kind === 'back' ? 'summon-back' : 'summon-go'}>
          {call.kind === 'back' ? '🏫 回班級島' : '🏃 過去'}
        </button>
        <button className="btn white" onClick={() => useTeacherCalls.getState().clearSummon()} data-testid="summon-later">
          等一下
        </button>
      </div>
    </div>
  );
}
