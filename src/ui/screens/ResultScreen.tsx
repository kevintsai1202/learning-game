/**
 * 結算畫面：星星依序跳出、獲得金幣、段考模擬顯示分數，並列出要再練習的題目。
 */
import { useEffect } from 'react';
import { useUi } from '../../store/useUi';
import { findActivity } from '../../activities/resolve';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { teleport } from '../../world/input';
import { doorOf, zoneById } from '../../world/layout';

const MESSAGES = ['', '有進步喔！我們再試一次吧！', '很棒！再練一次就更厲害了！', '太厲害了！全部都難不倒你！'];

export function ResultScreen() {
  const result = useUi((s) => s.lastResult);
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
    speak(MESSAGES[result.stars] ?? '完成了！');
    return () => timers.forEach(clearTimeout);
  }, [result]);

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
          >
            回島上
          </button>
        </div>
      </div>
    </div>
  );
}
