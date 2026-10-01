/**
 * 活動畫面：依目前的 run 產生題目，交給答題器；結束後存檔並顯示結算。
 * 錯題複習（review.*）從錯題本取題。
 */
import { useMemo, useState } from 'react';
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { usePacks } from '../../store/usePacks';
import { ALL_ACTIVITIES } from '../../activities/registry';
import { findActivity, rememberActivity } from '../../activities/resolve';
import type { ActivityDef } from '../../activities/types';
import type { Question, SubjectId } from '../../core/types';
import { QuizRunner } from '../../quiz/QuizRunner';
import { stopSpeaking } from '../../audio/speech';
import { buildSession } from '../../engine/session';
import { toArcade } from '../../quiz/arcade';
import { createRng } from '../../core/rng';

/** 錯題複習的活動定義 */
function reviewActivity(subject: SubjectId | 'all', questions: Question[]): ActivityDef {
  return {
    id: `review.${subject}`,
    zone: 'tower',
    subject: subject === 'all' ? (questions[0]?.subject ?? 'math') : subject,
    title: '錯題再挑戰',
    icon: '📕',
    group: '錯題複習',
    indicators: [],
    count: questions.length,
    levels: false,
    make: () => questions,
  };
}

export function ActivityScreen() {
  const run = useUi((s) => s.run);
  const zone = useUi((s) => s.zone);
  const enterZone = useUi((s) => s.enterZone);
  const showResult = useUi((s) => s.showResult);
  const finishSession = useGame((s) => s.finishSession);
  const profile = useGame((s) => s.profile());
  const packActivities = usePacks((s) => s.activities);
  const [confirmExit, setConfirmExit] = useState(false);

  /** 依 run 準備活動與題目（只在 run 改變時產生一次） */
  const prepared = useMemo(() => {
    if (!run) return null;
    if (run.activityId.startsWith('review.')) {
      const subject = run.activityId.slice('review.'.length) as SubjectId | 'all';
      const qs = Object.values(profile?.wrongBook ?? {})
        .filter((w) => subject === 'all' || w.question.subject === subject)
        .sort((a, b) => b.lastWrong.localeCompare(a.lastWrong))
        .slice(0, 10)
        .map((w) => w.question);
      const review = reviewActivity(subject, qs);
      rememberActivity(review);
      return { activity: review, questions: qs, mode: 'quiz' as const };
    }
    const activity = [...ALL_ACTIVITIES, ...packActivities].find((a) => a.id === run.activityId) ?? findActivity(run.activityId);
    if (!activity) return null;
    rememberActivity(activity);
    // 依「最近做過的題目」挑題，避免一直遇到同一題
    const recent = profile?.recent[activity.id] ?? [];
    const questions = buildSession(activity, { seed: run.seed, level: run.level }, recent);
    if (run.mode === 'shooter') {
      // 射擊模式：轉成答案氣球；能轉的題目不到六成就改回一般答題
      const rng = createRng(run.seed ^ 0xa11);
      const arcade = questions.map((q) => toArcade(q, rng)).filter((q): q is NonNullable<typeof q> => q !== null);
      if (arcade.length >= Math.ceil(questions.length * 0.6)) return { activity, questions: arcade, mode: 'shooter' as const };
      useUi.getState().say('這個練習比較適合一般答題，我們用一般方式玩喔！');
    }
    return { activity, questions, mode: 'quiz' as const };
    // 刻意只依 run 重新出題，存檔變動（例如錯題本更新）不應中途換題
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  if (!run || !prepared || prepared.questions.length === 0) {
    return (
      <div className="panel-screen">
        <div className="card" style={{ padding: 24, fontSize: 24 }}>
          這裡沒有題目喔！
          <button className="btn" onClick={() => zone && enterZone(zone)}>
            回選單
          </button>
        </div>
      </div>
    );
  }

  const backToMenu = () => {
    stopSpeaking();
    if (zone) enterZone(zone);
  };

  return (
    <>
      <QuizRunner
        key={`${run.activityId}:${run.seed}`}
        activity={prepared.activity}
        questions={prepared.questions}
        mode={prepared.mode}
        onExit={() => setConfirmExit(true)}
        onFinish={(result) => {
          finishSession(result);
          showResult(result);
        }}
      />
      {confirmExit && (
        <div className="panel-screen">
          <div className="card pop-in" style={{ padding: 24, textAlign: 'center', width: 'min(480px, 100%)' }} role="alertdialog">
            <p style={{ fontSize: 26, margin: '4px 0 18px' }}>要離開嗎？這一回合不會記錄喔。</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn white" onClick={() => setConfirmExit(false)}>
                繼續玩
              </button>
              <button className="btn red" onClick={backToMenu} data-testid="confirm-exit">
                離開
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
