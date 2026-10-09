/**
 * 島上的獎勵卡片（老師 GM 的 G3）：熊熊老師發的金幣或貼紙，一次一張，按「謝謝老師！」看下一張。
 * 金幣與貼紙在伺服器那邊已經加進存檔（同步時就有了），卡片只是告訴孩子。
 * 只掛在島上的畫面（不打斷答題）；有禮物卡片時先處理禮物。句子有數字，用裝置語音。
 */
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRewards } from '../online/useRewards';
import { useGifts } from '../online/useGifts';
import { useGame } from '../store/useGame';
import { giftEmoji } from '../store/gifts';
import { rewardCardLine } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

export function RewardCard() {
  const activeId = useGame((s) => s.save.activeProfileId);
  const isCloud = useGame((s) => !!s.profile()?.cloud);
  const { profileId, rewards, load, seen } = useRewards(useShallow((s) => ({ profileId: s.profileId, rewards: s.rewards, load: s.load, seen: s.seen })));
  /** 有禮物卡片要處理時先不顯示（兩張卡片會疊在一起） */
  const giftShowing = useGifts((s) => s.profileId === activeId && (s.incoming.length > 0 || s.notices.length > 0));

  // 進到島上、換角色時重新讀取
  useEffect(() => {
    if (isCloud) void load();
  }, [activeId, isCloud, load]);

  const reward = isCloud && profileId === activeId && !giftShowing ? rewards[0] : undefined;
  const text = reward ? rewardCardLine(reward.coins, reward.itemId) : null;

  // 新卡片出現時唸出來、叮一聲
  useEffect(() => {
    if (!reward || !text) return;
    sfx.coin();
    speak(text);
    // 只在換卡片時唸一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward?.id]);

  if (!reward || !text) return null;
  return (
    <div className="gift-card card" role="status" data-testid="reward-card">
      <span className="gift-big">{reward.itemId ? giftEmoji(reward.itemId) : '🪙'}</span>
      <p className="gift-card-text">
        🐻 {text}
        <br />
        <small className="plain">{reward.className}</small>
      </p>
      <div className="gift-buttons">
        <button
          className="btn green"
          onClick={() => {
            sfx.tap();
            void seen(reward.id);
          }}
          data-testid="reward-ok"
        >
          謝謝老師！
        </button>
      </div>
    </div>
  );
}
