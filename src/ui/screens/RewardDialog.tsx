/**
 * 老師發獎勵的視窗（老師 GM 的 G3，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 給一位孩子或全班金幣（1～50）或貼紙（送禮用的 8 種之一），至少選一種；沒有每日上限。
 * 用在班級頁的成員表與熊熊老師進島後的全班清單。發完可以接著再發（視窗不關）。
 */
import { useState } from 'react';
import { useAccount } from '../../online/useAccount';
import type { RewardResponse } from '../../online/protocol';
import { STICKERS, giftName } from '../../store/gifts';
import { sfx } from '../../audio/sfx';

/** 金幣的選項 */
const COIN_CHOICES = [5, 10, 20, 30, 50];

/** 發給誰：帳號 id 清單或全班；label 是畫面上的稱呼（「阿寶」「全班」） */
export interface RewardTarget {
  ids: string[] | 'all';
  label: string;
}

export function RewardDialog({ code, target, onClose }: { code: string; target: RewardTarget; onClose: () => void }) {
  const call = useAccount((s) => s.call);
  /** 選的金幣（0 是不給） */
  const [coins, setCoins] = useState(0);
  /** 選的貼紙（null 是不給） */
  const [sticker, setSticker] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** 這份獎勵的說法：「10 枚金幣和鬱金香貼紙」 */
  const what = [coins ? `${coins} 枚金幣` : '', sticker ? giftName(sticker) : ''].filter(Boolean).join('和');

  const send = async () => {
    if (busy || (!coins && !sticker)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call<RewardResponse>('POST', `/api/teacher/rooms/${code}/rewards`, {
        to: target.ids,
        ...(coins ? { coins } : {}),
        ...(sticker ? { sticker } : {}),
      });
      sfx.coin();
      setDone(`已發給${target.label}（${r.given} 人）：${what}`);
      setCoins(0);
      setSticker(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發送失敗，請再試一次');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-screen gift-layer" data-testid="reward-dialog">
      <div className="card gift-panel reward-panel" role="dialog" aria-label="發獎勵">
        <h3 className="gift-title">🎁 發獎勵給{target.label}</h3>
        <p className="plain" style={{ margin: '4px 0' }}>
          金幣
        </p>
        <div className="reward-choices">
          {COIN_CHOICES.map((n) => (
            <button key={n} className={`btn small ${coins === n ? '' : 'white'}`} aria-pressed={coins === n} onClick={() => setCoins(coins === n ? 0 : n)} data-testid={`reward-coins-${n}`}>
              🪙 {n}
            </button>
          ))}
        </div>
        <p className="plain" style={{ margin: '10px 0 4px' }}>
          貼紙
        </p>
        <div className="reward-choices">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              className={`btn small ${sticker === s.id ? '' : 'white'}`}
              aria-pressed={sticker === s.id}
              onClick={() => setSticker(sticker === s.id ? null : s.id)}
              title={`${s.name}貼紙`}
              data-testid={`reward-sticker-${s.id}`}
            >
              {s.emoji} {s.name}
            </button>
          ))}
        </div>
        {done && (
          <p className="notice" role="status" data-testid="reward-done">
            {done}
          </p>
        )}
        {error && (
          <p className="notice" role="alert" style={{ color: '#c0392b' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn green" disabled={busy || (!coins && !sticker)} onClick={() => void send()} data-testid="reward-send">
            {what ? `送出：${what}` : '選金幣或貼紙'}
          </button>
          <button className="btn white" onClick={onClose} data-testid="reward-close">
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
