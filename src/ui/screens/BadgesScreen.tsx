/**
 * 獎章簿：18 個獎章，得到的彩色（寫得到的日期），沒得到的灰色並顯示「還差多少」；
 * 上方可以選擇要顯示的稱號（顯示在島上的名牌旁）。點獎章會唸出名稱。
 */
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { BADGES, badgeProgress, shownTitle } from '../../store/badges';
import { dateKey } from '../../store/save';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';

export function BadgesScreen() {
  const profile = useGame((s) => s.profile());
  const chooseTitle = useGame((s) => s.chooseTitle);
  const goto = useUi((s) => s.goto);
  if (!profile) return null;
  const today = dateKey(new Date());
  const earned = profile.badges ?? {};
  const count = BADGES.filter((b) => earned[b.id]).length;
  /** 可以選的稱號：已得到、而且有稱號的獎章 */
  const titles = BADGES.filter((b) => b.title && earned[b.id]);
  const current = shownTitle(profile) ? profile.title : null;

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="獎章簿">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#e0a800' }}>
            🏅 獎章簿
          </span>
          <h2 data-testid="badge-count">
            {count}／{BADGES.length}
          </h2>
          <button className="btn small white" onClick={() => goto('island')} data-testid="badges-back">
            回島上
          </button>
        </div>
        <div className="panel-body">
          {titles.length > 0 && (
            <>
              <span className="label">我的稱號（會顯示在名牌旁邊）</span>
              <div className="choice-row title-row">
                <button className={`btn small white ${current === null ? 'on' : ''}`} onClick={() => chooseTitle(null)} data-testid="title-none">
                  不顯示
                </button>
                {titles.map((b) => (
                  <button
                    key={b.id}
                    className={`btn small white ${current === b.id ? 'on' : ''}`}
                    onClick={() => {
                      sfx.tap();
                      chooseTitle(b.id);
                    }}
                    data-testid={`title-${b.id}`}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="badge-grid">
            {BADGES.map((b) => {
              const got = earned[b.id];
              const pr = badgeProgress(b, profile, today);
              const remain = Math.max(0, pr.target - pr.value);
              return (
                <button
                  key={b.id}
                  className={`badge-card ${got ? 'got' : 'locked'}`}
                  onClick={() => {
                    sfx.tap();
                    speak(b.name);
                  }}
                  data-testid={`badge-${b.id}`}
                  data-earned={got ? '1' : '0'}
                >
                  <span className="badge-icon">{b.icon}</span>
                  <span className="badge-name">{b.name}</span>
                  <span className="badge-goal">{b.goal}</span>
                  {got ? (
                    <span className="badge-note">{got} 得到</span>
                  ) : (
                    <>
                      <span className="badge-bar">
                        <i style={{ width: `${(pr.value / pr.target) * 100}%` }} />
                      </span>
                      <span className="badge-note">{b.unit ? `還差 ${remain} ${b.unit}` : '還沒達成'}</span>
                    </>
                  )}
                  {b.title && <span className="badge-reward">稱號「{b.title}」</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
