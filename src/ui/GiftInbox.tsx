/**
 * 島上的禮物卡片：一次一張。先處理收到的禮物（收下／不用了），再顯示送出的禮物的結果（好）。
 * 只掛在島上的畫面（不打斷答題）；進到島上時重新讀取一次（即時連線不通時也讀得到）。
 * 卡片句子有暱稱或數字，用裝置語音；收下後的固定提示有預錄語音。
 */
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGifts } from '../online/useGifts';
import { ApiFailure } from '../online/api';
import { useGame } from '../store/useGame';
import { giftEmoji } from '../store/gifts';
import { GIFT_LINES, giftAcceptedLine, giftCardLine, giftRefundLine } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

/** 收下後顯示的訊息 */
const OUTCOME_TEXT = { accepted: GIFT_LINES.accepted, returned: GIFT_LINES.returned, expired: GIFT_LINES.expired } as const;

export function GiftInbox() {
  const activeId = useGame((s) => s.save.activeProfileId);
  const isCloud = useGame((s) => !!s.profile()?.cloud);
  const { profileId, incoming, notices } = useGifts(useShallow((s) => ({ profileId: s.profileId, incoming: s.incoming, notices: s.notices })));
  const { load, accept, decline, ackNotice } = useGifts(useShallow((s) => ({ load: s.load, accept: s.accept, decline: s.decline, ackNotice: s.ackNotice })));
  /** 收下之後（或出錯時）要給孩子看的訊息；看完按「好」 */
  const [message, setMessage] = useState<{ text: string; icon: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 進到島上、換角色時重新讀取
  useEffect(() => {
    if (isCloud) void load();
  }, [activeId, isCloud, load]);

  const ready = isCloud && profileId === activeId;
  const gift = ready ? incoming[0] : undefined;
  const notice = ready && !gift ? notices[0] : undefined;
  /** 目前這張卡片的文字與圖示 */
  const card = message
    ? message
    : gift
      ? { text: giftCardLine(gift.from, gift.itemId), icon: giftEmoji(gift.itemId) }
      : notice
        ? notice.kind === 'accepted'
          ? { text: giftAcceptedLine(notice.to, notice.itemId), icon: '🎉' }
          : { text: giftRefundLine(notice.price), icon: '🪙' }
        : null;

  // 新卡片出現時唸出來
  const key = message ? `m:${message.text}` : gift ? `g:${gift.id}` : notice ? `n:${notice.id}` : null;
  useEffect(() => {
    if (key && card) speak(card.text);
    // 只在換卡片時唸一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!card) return null;

  /** 收下：依結果顯示訊息（之前已經處理過就直接換下一張） */
  const onAccept = async () => {
    if (!gift || busy) return;
    setBusy(true);
    try {
      const outcome = await accept(gift.id);
      if (outcome === 'accepted') sfx.coin();
      if (outcome !== 'done') setMessage({ text: OUTCOME_TEXT[outcome], icon: outcome === 'accepted' ? giftEmoji(gift.itemId) : '🎁' });
    } catch (err) {
      setMessage({ text: err instanceof ApiFailure ? err.message : '出了點問題，再試一次', icon: '⚠️' });
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    if (!gift || busy) return;
    setBusy(true);
    try {
      sfx.tap();
      await decline(gift.id);
    } catch (err) {
      setMessage({ text: err instanceof ApiFailure ? err.message : '出了點問題，再試一次', icon: '⚠️' });
    } finally {
      setBusy(false);
    }
  };

  /** 看完訊息或送禮結果 */
  const onOk = () => {
    sfx.tap();
    if (message) setMessage(null);
    else if (notice) void ackNotice(notice.id);
  };

  return (
    <div className="gift-card card" role="status" data-testid="gift-card">
      <span className="gift-big">{card.icon}</span>
      <p className="gift-card-text" data-testid="gift-card-text">
        {gift && !message ? '🎁 ' : ''}
        {card.text}
      </p>
      <div className="gift-buttons">
        {gift && !message ? (
          <>
            <button className="btn green" disabled={busy} onClick={() => void onAccept()} data-testid="gift-accept">
              收下
            </button>
            <button className="btn white" disabled={busy} onClick={() => void onDecline()} data-testid="gift-decline">
              不用了
            </button>
          </>
        ) : (
          <button className="btn green" onClick={onOk} data-testid="gift-ok">
            好
          </button>
        )}
      </div>
    </div>
  );
}
