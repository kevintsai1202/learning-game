/**
 * 朋友的益智對戰邀請卡（島嶼互訪 I4）：在島上與益智遊戲館選單顯示「○○邀請你一起玩○○！」，接受或不要。
 * 今天的益智遊戲時間用完時只能按「知道了」（回覆「時間用完」）。接受後進益智遊戲館等開局（useFriendDuel.answerInvite）。
 */
import { useEffect } from 'react';
import { useGame } from '../store/useGame';
import { answerInvite, useFriendDuel } from '../online/useFriendDuel';
import { puzzleGame } from '../puzzle/catalog';
import { puzzleSecondsLeft } from '../puzzle/time';
import { DUEL_LINES } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

export function DuelInviteCard() {
  const invite = useFriendDuel((s) => s.incoming);
  const profile = useGame((s) => s.profile());
  const limitMin = useGame((s) => s.save.settings.puzzleLimitMin);
  const left = profile ? puzzleSecondsLeft(profile, limitMin, new Date()) : null;
  /** 今天的益智遊戲時間用完了 */
  const tired = left !== null && left <= 0;

  // 收到新的邀請：叮一聲、唸一句（名字寫在卡片上）
  const from = invite?.from;
  useEffect(() => {
    if (!from) return;
    sfx.tap();
    speak(DUEL_LINES.invited);
  }, [from]);

  if (!invite) return null;
  const game = puzzleGame(invite.game);
  return (
    <div className="gift-card card duel-invite" role="alertdialog" data-testid="duel-invite">
      <span className="gift-big">{game?.icon ?? '🧩'}</span>
      <p className="gift-card-text">
        👫 <b>{invite.name}</b> 邀請你一起玩「{game?.title}」！
      </p>
      {tired ? (
        <>
          <p className="notice">今天的益智遊戲時間用完了，明天再一起玩吧！</p>
          <div className="gift-buttons">
            <button className="btn white" onClick={() => answerInvite(false, 'tired')} data-testid="duel-invite-ok">
              知道了
            </button>
          </div>
        </>
      ) : (
        <div className="gift-buttons">
          <button className="btn green" onClick={() => answerInvite(true)} data-testid="duel-accept">
            ✅ 一起玩
          </button>
          <button className="btn white" onClick={() => answerInvite(false)} data-testid="duel-decline">
            不要
          </button>
        </div>
      )}
    </div>
  );
}
