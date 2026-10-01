/**
 * 建築選單：列出這棟建築裡的活動（依單元分組）、最佳星數，以及錯題複習。
 * 點活動後選難度（簡單／普通／挑戰）就開始。
 */
import { useMemo, useState } from 'react';
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { activitiesInZone } from '../../activities/registry';
import type { ActivityDef } from '../../activities/types';
import { zoneById } from '../../world/layout';
import { teleport } from '../../world/input';
import { doorOf } from '../../world/layout';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { usePacks } from '../../store/usePacks';
import { useEditions } from '../../store/useEditions';
import { curriculumActivities, currentBook } from '../../activities/resolve';
import { DEFAULT_CURRICULUM } from '../../store/save';

const LEVELS = [
  { level: 1 as const, name: '簡單', stars: '⭐', color: 'green' },
  { level: 2 as const, name: '普通', stars: '⭐⭐', color: '' },
  { level: 3 as const, name: '挑戰', stars: '⭐⭐⭐', color: 'red' },
];

/** 星數顯示，例如 ★★☆ */
export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function ZoneMenu() {
  const zoneId = useUi((s) => s.zone);
  const goto = useUi((s) => s.goto);
  const startActivity = useUi((s) => s.startActivity);
  const profile = useGame((s) => s.profile());
  const packs = usePacks((s) => s.activities);
  const editions = useEditions((s) => s.all);
  const curriculum = profile?.curriculum ?? DEFAULT_CURRICULUM;
  const [picking, setPicking] = useState<ActivityDef | null>(null);
  const zone = zoneId ? zoneById(zoneId) : null;

  const activities = useMemo(() => {
    if (!zoneId) return [];
    const base = activitiesInZone(zoneId);
    // 課本單元放最前面，挑戰塔的期中期末模擬放在一般段考模擬後面
    const book = curriculumActivities(zoneId, editions, curriculum);
    return zoneId === 'tower' ? [...base, ...book, ...packs] : [...book, ...base];
  }, [zoneId, packs, editions, curriculum]);
  /** 目前跟的課本（顯示在標題列） */
  const bookLabel = useMemo(() => {
    if (zoneId !== 'zh' && zoneId !== 'math') return '';
    const b = currentBook(editions, curriculum, zoneId);
    return b ? `${b.edition.publisher} 二${b.volume.term}` : '依 108 課綱';
  }, [zoneId, editions, curriculum]);

  /** 這一科的錯題數（挑戰塔顯示全部錯題） */
  const wrongCount = useMemo(() => {
    if (!profile || !zone) return 0;
    return Object.values(profile.wrongBook).filter((w) => !zone.subject || w.question.subject === zone.subject).length;
  }, [profile, zone]);

  if (!zone) return null;
  const groups = [...new Set(activities.map((a) => a.group))];

  const leave = () => {
    teleport(doorOf(zone));
    goto('island');
  };
  const begin = (a: ActivityDef, level: 1 | 2 | 3, mode: 'quiz' | 'shooter' = 'quiz') => {
    sfx.tap();
    startActivity({ activityId: a.id, level, seed: Math.floor(Math.random() * 1e9), mode });
  };
  const choose = (a: ActivityDef) => {
    sfx.tap();
    speak(a.title);
    if (a.levels || a.arcade) setPicking(a);
    else begin(a, 1);
  };

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label={zone.name}>
        <div className="panel-head">
          <span className="ribbon" style={{ background: zone.color }}>
            {zone.icon} {zone.name}
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>
            {zone.intro}
            {bookLabel && <span className="hud-chip" style={{ fontSize: 16, marginLeft: 8, padding: '2px 12px' }}>📚 {bookLabel}</span>}
          </h2>
          <button className="btn small white" onClick={leave} data-testid="leave-zone">
            回島上
          </button>
        </div>
        <div className="panel-body">
          {wrongCount > 0 && (
            <div className="zone-group">
              <h3>📕 錯題複習</h3>
              <div className="activity-grid">
                <button
                  className="activity-card review"
                  onClick={() => {
                    sfx.tap();
                    startActivity({ activityId: `review.${zone.subject ?? 'all'}`, level: 1, seed: Date.now() % 1e9 });
                  }}
                  data-testid="review-card"
                >
                  <span className="icon">📕</span>
                  <span className="name">錯題再挑戰</span>
                  <span className="stars">還有 {wrongCount} 題</span>
                </button>
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div className="zone-group" key={g}>
              <h3>{g}</h3>
              <div className="activity-grid">
                {activities
                  .filter((a) => a.group === g)
                  .map((a) => (
                    <button
                      key={a.id}
                      className="activity-card"
                      disabled={!!a.disabledReason}
                      style={a.disabledReason ? { opacity: 0.55, cursor: 'default' } : undefined}
                      onClick={() => choose(a)}
                      data-testid={`activity-${a.id}`}
                    >
                      <span className="icon">{a.icon}</span>
                      <span className="name">{a.title}</span>
                      <span className="stars" style={{ color: a.disabledReason ? '#9a96b0' : '#f2a20a' }}>
                        {a.disabledReason ?? starText(profile?.bestStars[a.id] ?? 0)}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {activities.length === 0 && <p style={{ fontSize: 22 }}>這裡還在施工中，過幾天再來看看！🚧</p>}
        </div>
      </div>
      {picking && (
        <div className="panel-screen" style={{ background: 'rgba(43,42,76,.35)' }}>
          <div className="card pop-in" style={{ padding: 22, width: 'min(560px, 100%)' }} role="dialog" aria-label="選難度">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 44 }}>{picking.icon}</span>
              <h2 style={{ margin: 0, flex: 1, fontSize: 28 }}>{picking.title}</h2>
              <button className="btn small white" onClick={() => setPicking(null)}>
                ✕
              </button>
            </div>
            <div className="level-pick">
              {(picking.levels ? LEVELS : LEVELS.slice(0, 1)).map((l) => (
                <button key={l.level} className={`btn big ${l.color}`} style={{ flexDirection: 'column', gap: 0 }} onClick={() => begin(picking, l.level)} data-testid={`level-${l.level}`}>
                  <span style={{ fontSize: 22 }}>{l.stars}</span>
                  {picking.levels ? l.name : '開始'}
                </button>
              ))}
            </div>
            {picking.arcade && (
              <>
                <p style={{ fontSize: 20, margin: '16px 0 6px', fontWeight: 800 }}>🎯 氣球射擊：點飄著的氣球，射中正確答案！</p>
                <div className="level-pick">
                  {(picking.levels ? LEVELS : LEVELS.slice(0, 1)).map((l) => (
                    <button key={l.level} className="btn purple" onClick={() => begin(picking, l.level, 'shooter')} data-testid={`shoot-${l.level}`}>
                      🎯 {picking.levels ? l.name : '射擊'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
