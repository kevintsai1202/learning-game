/**
 * 結算畫面：星星依序跳出、獲得金幣、段考模擬顯示分數，並列出要再練習的題目；
 * 這一回合得到新獎章時，跳出獎章卡片並唸出「得到新獎章：○○！」。
 */
import { useEffect } from 'react';
import { useUi } from '../../store/useUi';
import { findActivity } from '../../activities/resolve';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { RESULT_DONE, RESULT_MESSAGES, newBadgeLine } from '../lines';
import { badgeById } from '../../store/badges';
import { teleport } from '../../world/input';
import { doorOf, zoneById } from '../../world/layout';

const MESSAGES = RESULT_MESSAGES;

export function ResultScreen() {
  const result = useUi((s) => s.lastResult);
  const newBadges = useUi((s) => s.lastNewBadges);
  const run = useUi((s) => s.run);
  const zone = useUi((s) => s.zone);
  const startActivity = useUi((s) => s.startActivity);
  const enterZone = useUi((s) => s.enterZone);
  const goto = useUi((s) => s.goto);
  const activity = result ? findActivity(result.activityId) : undefined;

  useEffect(() => {
    if (!result) return;
    sfx.fanfare();
    const timers = Array.from({ length: result.stars }, (_, i) => setTimeout(() => sfx.star(i), 500 + i * 350));
    timers.push(setTimeout(() => sfx.coin(), 600 + result.stars * 350));
    speak(MESSAGES[result.stars] ?? RESULT_DONE);
    // 新獎章：等星星與鼓勵的話唸完，再放一次號角、唸出獎章名稱（只唸第一個，多個時畫面都列出來）
    const first = newBadges.length ? badgeById(newBadges[0]) : undefined;
    if (first) {
      timers.push(
        setTimeout(() => {
          sfx.fanfare();
          speak(newBadgeLine(first.name));
        }, 2600),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [result, newBadges]);

  if (!result) return null;
  const missed = result.answers.filter((a) => !a.firstTry);
  const score = Math.round((result.correct / Math.max(1, result.total)) * 100);

  return (
    <div className="panel-screen" style={{ background: 'transparent', placeItems: 'center end', paddingRight: '4vw' }}>
      <div className="card result pop-in" data-testid="result">
        <span className="ribbon">{activity?.title ?? '完成了'}</span>
        <div className="result-stars" aria-label={`${result.stars} 顆星`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < result.stars ? '' : 'off'} style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
              ⭐
            </span>
          ))}
        </div>
        {activity?.exam && <div className="score">{score} 分</div>}
        <p>
          一次答對 <b>{result.correct}</b> 題，共 {result.total} 題
        </p>
        <p style={{ fontSize: 28, fontWeight: 800 }} data-testid="coins-earned">
          🪙 +{result.coins}
        </p>
        <p>{MESSAGES[result.stars]}</p>
        {newBadges.length > 0 && (
          <div className="new-badges" data-testid="new-badges">
            {newBadges.map((id) => {
              const b = badgeById(id);
              if (!b) return null;
              return (
                <div key={id} className="new-badge" data-testid={`new-badge-${id}`}>
                  <span className="new-badge-icon">{b.icon}</span>
                  <span>
                    新獎章：<b>{b.name}</b>
                    {b.title && <span className="new-badge-reward">可以在獎章簿選稱號「{b.title}」</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {missed.length > 0 && (
          <div className="explain" style={{ textAlign: 'left', margin: '8px auto' }}>
            📕 已放進錯題本，可以再練習：
            <ul style={{ margin: '4px 0 0', paddingLeft: 22 }}>
              {missed.slice(0, 4).map((a) => (
                <li key={a.question.id}>{a.question.prompt}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="result-actions">
          {run && !run.activityId.startsWith('review.') && (
            <button className="btn green" onClick={() => startActivity({ ...run, seed: Math.floor(Math.random() * 1e9) })} data-testid="play-again">
              ↻ 再玩一次
            </button>
          )}
          <button className="btn white" onClick={() => zone && enterZone(zone)} data-testid="back-to-zone">
            選別的
          </button>
          <button
            className="btn white"
            onClick={() => {
              if (zone) teleport(doorOf(zoneById(zone)));
              goto('island');
            }}
            data-testid="back-to-island"
          >
            回島上
          </button>
        </div>
      </div>
    </div>
  );
}
