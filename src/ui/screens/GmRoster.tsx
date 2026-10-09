/**
 * 熊熊老師進島後的全班清單（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 班上每個孩子在哪裡、在做什麼（打開時每 5 秒向伺服器讀一次班級頁的成員表），線上的排前面。
 * 在這座島上（不在建築裡）的孩子可以按「📍 過去」，熊熊老師移到他旁邊。
 */
import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAccount } from '../../online/useAccount';
import { usePresence } from '../../online/usePresence';
import { onIsland } from '../../online/presence';
import type { MemberSummary, TeacherRoomResponse } from '../../online/protocol';
import { player, teleport } from '../../world/input';
import { whereText } from '../memberWhere';
import { sfx } from '../../audio/sfx';
import { RewardDialog, type RewardTarget } from './RewardDialog';
import { gmVisit } from '../../online/gmClient';

/** 多久讀一次（毫秒） */
const POLL_MS = 5000;

export function GmRoster({ code, onClose }: { code: string; onClose: () => void }) {
  const call = useAccount((s) => s.call);
  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 發獎勵的視窗：給誰 */
  const [rewardFor, setRewardFor] = useState<RewardTarget | null>(null);
  /** 在這座島上、不在建築裡的孩子（只取 id；位置在按下時才讀） */
  const here = usePresence(useShallow((s) => onIsland(s).filter((m) => m.role !== 'teacher').map((m) => m.id)));

  const load = useCallback(async () => {
    try {
      setMembers((await call<TeacherRoomResponse>('GET', `/api/teacher/rooms/${code}`)).members);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀不到全班清單');
    }
  }, [call, code]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /** 移到某個孩子旁邊（站在他前面一點，面向他） */
  const goTo = (id: string) => {
    const m = usePresence.getState().members[id];
    if (!m) return;
    sfx.tap();
    teleport({ x: m.x, z: m.z + 1.6 });
    player.heading = Math.PI;
  };

  /** 線上的排前面，其餘照暱稱 */
  const sorted = members ? [...members].sort((a, b) => Number(!!b.where || b.online) - Number(!!a.where || a.online) || a.nickname.localeCompare(b.nickname, 'zh-TW')) : null;
  return (
    <>
    <div className="card gm-roster" role="dialog" aria-label="全班清單" data-testid="gm-roster">
      <div className="gm-roster-head">
        <strong>📋 全班{members ? `（${members.length} 人）` : ''}</strong>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn small" onClick={() => setRewardFor({ ids: 'all', label: '全班' })} data-testid="gm-reward-all">
            🎁 全班
          </button>
          <button className="btn small white" onClick={onClose} data-testid="gm-roster-close">
            關閉
          </button>
        </span>
      </div>
      {error && <p className="notice">{error}</p>}
      {!sorted && !error && <p className="plain">讀取中…</p>}
      {sorted && sorted.length === 0 && <p className="plain">班上還沒有孩子。</p>}
      {sorted && sorted.length > 0 && (
        <ul className="gm-roster-list">
          {sorted.map((m) => (
            <li key={m.id} data-testid={`gm-roster-${m.nickname}`}>
              <span className="gm-roster-name">{m.nickname}</span>
              <span className="gm-roster-where">{whereText(m) || '離線'}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn small white" disabled={!here.includes(m.id)} onClick={() => goTo(m.id)} title="移到他旁邊" data-testid={`gm-goto-${m.nickname}`}>
                  📍 過去
                </button>
                {m.where?.island === 'own' && (
                  <button
                    className="btn small white"
                    onClick={() => {
                      sfx.tap();
                      gmVisit(m.id);
                    }}
                    title={`去${m.nickname}的島`}
                    data-testid={`gm-visit-${m.nickname}`}
                  >
                    🏝️ 去他的島
                  </button>
                )}
                <button className="btn small white" onClick={() => setRewardFor({ ids: [m.id], label: m.nickname })} title={`發獎勵給${m.nickname}`} data-testid={`gm-reward-${m.nickname}`}>
                  🎁
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
    {/* 發獎勵的視窗放在清單卡片外面（全畫面） */}
    {rewardFor && <RewardDialog code={code} target={rewardFor} onClose={() => setRewardFor(null)} />}
    </>
  );
}
