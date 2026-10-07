/**
 * 家長接手老師建的孩子（L4 家長連結卡，docs/plans/login-ux-review.md 第 7.3 節方案 A）：
 * 家長打開老師給的 ?claim= 連結、登入後，帳號頁最上面出現這個面板：顯示孩子的暱稱、外觀與班級讓家長核對，
 * 按「把『小安』連到我的帳號」就完成（孩子的進度、班級都不動），接著和 L2 掃碼一樣在這台裝置進那一班的班級島。
 * 帳號沒有家長身分時先「加上家長身分並繼續」。連結用過、過期、找不到時說明原因。元素都有 data-testid（e2e 用）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../../online/useAccount';
import { useCloud } from '../../online/useCloud';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { ApiFailure } from '../../online/api';
import type { ClaimAcceptResponse, ClaimLookupResponse } from '../../online/protocol';
import { AnimalIcon } from '../AnimalIcon';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';

/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof ApiFailure || err instanceof Error ? err.message : '出了點問題，再試一次');

export function ClaimPanel() {
  const claiming = useAccount((s) => s.claiming);
  const setClaiming = useAccount((s) => s.setClaiming);
  const call = useAccount((s) => s.call);
  const session = useAccount((s) => s.session);
  const user = useAccount((s) => s.user);
  const goto = useUi((s) => s.goto);
  /** 連結上的孩子與班級（還沒讀到是 null） */
  const [info, setInfo] = useState<ClaimLookupResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 已經連到帳號、但在這台裝置進島失敗時的說明 */
  const [note, setNote] = useState<string | null>(null);
  const isParent = !!user?.parent;

  const load = useCallback(async () => {
    if (!claiming) return;
    try {
      setInfo(await call<ClaimLookupResponse>('GET', `/api/parent/claims/${claiming}`));
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, claiming]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 接手，接著在這台裝置進那一班的班級島 */
  const accept = async () => {
    if (!claiming || !info || !session) return;
    setBusy(true);
    setError(null);
    let kidId: string;
    try {
      kidId = (await call<ClaimAcceptResponse>('POST', `/api/parent/claims/${claiming}`, {})).kid.id;
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
      return;
    }
    setClaiming(null);
    try {
      const p = await useCloud.getState().playOnThisDevice(kidId, session.server, session.token);
      useGame.getState().setIsland(p.id, info.room.code);
      teleport(SPAWN);
      speak(enterIslandLine(info.kid.nickname));
      goto('island');
    } catch (err) {
      // 已經連好了，只是這台裝置進不了島（例如這台有同一個角色的備份分身）：到孩子清單處理
      setNote(`「${info.kid.nickname}」已經連到你的帳號。${messageOf(err)}`);
      setBusy(false);
    }
  };

  if (note) {
    return (
      <div className="panel-body plain join-class" data-testid="claim-panel">
        <p className="notice" data-testid="claim-done-note">
          {note}
        </p>
        <button className="btn small white" onClick={() => setNote(null)}>
          知道了
        </button>
      </div>
    );
  }
  if (!claiming) return null;

  return (
    <div className="panel-body plain join-class" data-testid="claim-panel">
      <div className="join-class-head">
        <h3 style={{ margin: 0 }}>👨‍👩‍👧 把孩子連到我的帳號</h3>
        <button className="btn small white" onClick={() => setClaiming(null)} data-testid="claim-cancel">
          取消
        </button>
      </div>
      {error ? (
        <p className="gift-error" role="alert" data-testid="claim-error">
          {error}
        </p>
      ) : !info ? (
        <p>讀取中…</p>
      ) : (
        <>
          <div className="join-choices">
            <div className="join-choice" data-testid="claim-kid">
              <span className="avatar-dot" style={{ background: info.kid.avatar.color }}>
                <AnimalIcon animal={info.kid.avatar.animal} />
              </span>
              <b>{info.kid.nickname}</b>
              <small>🏫 {info.room.name}</small>
            </div>
          </div>
          {!isParent ? (
            <div data-testid="claim-not-parent">
              <p className="notice">要把孩子連到帳號，這個帳號要有家長身分。</p>
              <button
                className="btn green"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  useAccount
                    .getState()
                    .update({ parent: true })
                    .catch((err: unknown) => setError(messageOf(err)))
                    .finally(() => setBusy(false));
                }}
                data-testid="claim-add-parent"
              >
                加上家長身分並繼續
              </button>
            </div>
          ) : (
            <>
              <p style={{ margin: '6px 0' }}>核對老師給的卡片：是你的孩子就按下面的按鈕。孩子在班上的進度都會留著，之後換裝置、看學習報告都用得到。</p>
              <button className="btn green" disabled={busy} onClick={() => void accept()} data-testid="claim-accept">
                {busy ? '連線中…' : `把「${info.kid.nickname}」連到我的帳號`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
