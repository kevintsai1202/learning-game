/**
 * 送禮視窗：選同學 → 選禮物 → 確認送出。從公頻面板的「🎁 送禮」打開，或點島上同學的名牌（會先選好那位同學）。
 * 同學名單是全班（含沒上線的，線上的排前面）；選禮物時標出金幣不夠、對方已經有了、今天送完了。
 * 固定提示有預錄語音（lines.ts 的 GIFT_LINES）；確認句有暱稱，用裝置語音。
 */
import { useRealtime } from '../online/realtimeClient';
import { usePresence } from '../online/usePresence';
import { useEffect, useRef, useState } from 'react';
import { useGifts } from '../online/useGifts';
import { ApiFailure } from '../online/api';
import { newOpId } from '../online/ops';
import type { Classmate } from '../online/protocol';
import { useGame } from '../store/useGame';
import { ITEMS, type Slot } from '../store/catalog';
import { STICKERS, giftEmoji, giftName, giftPrice } from '../store/gifts';
import { AnimalIcon } from './AnimalIcon';
import { GIFT_LINES, giftConfirmLine } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

/** 禮物分頁：貼紙與六種外觀 */
type GiftTab = 'sticker' | Slot;
const GIFT_TABS: { id: GiftTab; name: string }[] = [
  { id: 'sticker', name: '🌷 貼紙' },
  { id: 'hat', name: '🎩 帽子' },
  { id: 'face', name: '👓 眼鏡' },
  { id: 'back', name: '🎒 背後' },
  { id: 'hand', name: '🎈 手持' },
  { id: 'pet', name: '🐥 寵物' },
  { id: 'trail', name: '✨ 特效' },
];

/** 某個分頁能送的禮物 id（外觀只列有金幣價格的，獎章專屬道具不能送） */
function giftsOf(tab: GiftTab): string[] {
  if (tab === 'sticker') return STICKERS.map((s) => s.id);
  return ITEMS.filter((i) => i.slot === tab && giftPrice(i.id) !== null).map((i) => i.id);
}

/** 錯誤轉成給孩子看的訊息 */
function messageOf(err: unknown): string {
  return err instanceof ApiFailure || err instanceof Error ? err.message : '出了點問題，再試一次';
}

/** 視窗打開時才掛載內容（每次打開都從頭開始） */
export function GiftDialog() {
  const dialog = useGifts((s) => s.dialog);
  return dialog ? <GiftDialogBody presetTo={dialog.to} /> : null;
}

function GiftDialogBody({ presetTo }: { presetTo: string | null }) {
  const close = useGifts((s) => s.closeDialog);
  const send = useGifts((s) => s.send);
  const loadClassmates = useGifts((s) => s.classmates);
  const sentToday = useGifts((s) => s.sentToday);
  const dailyLimit = useGifts((s) => s.dailyLimit);
  const coins = useGame((s) => s.profile()?.coins ?? 0);
  /** 全班同學；null 表示還在讀取 */
  const [classmates, setClassmates] = useState<Classmate[] | null>(null);
  const [to, setTo] = useState<string | null>(presetTo);
  const [tab, setTab] = useState<GiftTab>('sticker');
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 送出成功後的訊息 */
  const [done, setDone] = useState<string | null>(null);
  /** 這次確認的禮物 id：同一次確認重試時沿用（伺服器不會扣兩次錢）；換同學或禮物就重新產生 */
  const giftId = useRef(newOpId());

  /** 不在班級島（在朋友的島或自己的島上，島嶼互訪 I2）：只列島上的同學 */
  const onClassIsland = useRealtime((s) => s.island === 'class');
  useEffect(() => {
    let alive = true;
    loadClassmates()
      .then((list) => {
        if (!alive) return;
        if (onClassIsland) return setClassmates(list);
        const here = new Set(Object.keys(usePresence.getState().members));
        setClassmates(list.filter((c) => here.has(c.id)));
      })
      .catch((err) => alive && setError(messageOf(err)));
    return () => {
      alive = false;
    };
  }, [loadClassmates, onClassIsland]);

  useEffect(() => {
    giftId.current = newOpId();
  }, [to, itemId]);

  const friend = classmates?.find((c) => c.id === to) ?? null;
  /** 目前在哪一步（從名牌點進來但名單裡沒有這位同學時，回到選同學） */
  const step = done ? 'done' : !friend ? 'friend' : !itemId ? 'gift' : 'confirm';
  const remaining = Math.max(0, dailyLimit - sentToday);
  const price = itemId ? (giftPrice(itemId) ?? 0) : 0;

  // 換到選同學、選禮物時唸提示；確認時唸出要送什麼給誰
  useEffect(() => {
    if (step === 'friend' && classmates) speak(GIFT_LINES.pickFriend);
    if (step === 'gift') speak(GIFT_LINES.pickGift);
    if (step === 'confirm' && friend && itemId) speak(giftConfirmLine(friend.nickname, itemId, price));
  }, [step, classmates, friend, itemId, price]);

  /** 某項禮物不能選的原因；可以選時回傳 null */
  const blockReason = (id: string): string | null => {
    if (remaining <= 0) return '今天送完了';
    if (friend?.owned.includes(id)) return '已經有了';
    if (coins < (giftPrice(id) ?? Infinity)) return '金幣不夠';
    return null;
  };

  const submit = async () => {
    if (!friend || !itemId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await send({ id: giftId.current, to: friend.id, itemId });
      sfx.coin();
      speak(GIFT_LINES.sent);
      setDone(`送出去了！等${friend.nickname}收下。`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-screen gift-layer" data-testid="gift-dialog">
      <div className="panel card gift-panel" role="dialog" aria-label="送禮物">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#e8457c' }}>
            🎁 送禮物
          </span>
          <h2 style={{ fontSize: 22 }}>🪙 {coins}</h2>
          <button className="btn small white" onClick={close} data-testid="gift-close">
            關閉
          </button>
        </div>
        <div className="panel-body">
          {error && (
            <p className="gift-error" role="alert" data-testid="gift-error">
              {error}
            </p>
          )}

          {step === 'friend' && (
            <>
              <h3 className="gift-title">{GIFT_LINES.pickFriend}</h3>
              {!classmates ? (
                !error && <p>讀取同學名單…</p>
              ) : classmates.length === 0 ? (
                <p>{onClassIsland ? '班上還沒有其他同學。' : '島上沒有同班同學可以送禮。'}</p>
              ) : (
                <div className="gift-friends">
                  {classmates.map((c) => (
                    <button
                      key={c.id}
                      className="gift-friend"
                      onClick={() => {
                        sfx.tap();
                        setTo(c.id);
                      }}
                      data-testid={`gift-friend-${c.nickname}`}
                    >
                      <span className="avatar-dot" style={{ background: c.avatar.color }}>
                        <AnimalIcon animal={c.avatar.animal} />
                      </span>
                      <span className="gift-friend-name">{c.nickname}</span>
                      {c.online && <span className="gift-online">🟢</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'gift' && friend && (
            <>
              <h3 className="gift-title">要送什麼給{friend.nickname}呢？</h3>
              <p className="plain gift-remaining" data-testid="gift-remaining">
                {remaining > 0 ? `今天還可以送 ${remaining} 份` : `今天已經送 ${dailyLimit} 份了，明天再送吧`}
              </p>
              <div className="tabs">
                {GIFT_TABS.map((t) => (
                  <button key={t.id} className={`btn small white ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={`gift-tab-${t.id}`}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="activity-grid">
                {giftsOf(tab).map((id) => {
                  const reason = blockReason(id);
                  return (
                    <button
                      key={id}
                      className="activity-card shop-card"
                      disabled={reason !== null}
                      onClick={() => {
                        sfx.tap();
                        setItemId(id);
                      }}
                      data-testid={`gift-item-${id}`}
                    >
                      <span className="icon">{giftEmoji(id)}</span>
                      <span className="name">{giftName(id)}</span>
                      <span className="gift-price">{reason ?? `🪙 ${giftPrice(id)}`}</span>
                    </button>
                  );
                })}
              </div>
              {!presetTo && (
                <button className="btn small white" onClick={() => setTo(null)} data-testid="gift-change-friend">
                  換一位同學
                </button>
              )}
            </>
          )}

          {step === 'confirm' && friend && itemId && (
            <div className="gift-confirm">
              <span className="gift-big">{giftEmoji(itemId)}</span>
              <p data-testid="gift-confirm-text">{giftConfirmLine(friend.nickname, itemId, price)}</p>
              <div className="gift-buttons">
                <button className="btn green" disabled={busy} onClick={() => void submit()} data-testid="gift-send">
                  {busy ? '送出中…' : '送出 🎁'}
                </button>
                <button className="btn white" disabled={busy} onClick={() => setItemId(null)} data-testid="gift-back">
                  再想想
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="gift-confirm">
              <span className="gift-big">🎁</span>
              <p data-testid="gift-done-text">{done}</p>
              <button className="btn green" onClick={close} data-testid="gift-done">
                好
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
