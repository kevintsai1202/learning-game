/**
 * 班級登入畫面：孩子用「班級代碼＋暱稱＋4 位數密碼」登入（備援；L3 起主要路徑是老師在學校平板輸入教室密碼、
 * 家長掃 QR code 加入，docs/plans/login-ux-review.md 第 8 節第 4 點，「第一次加入」已拿掉）。
 * 老師在旁邊時改走教室密碼（ClassroomScreen）。家長要找回孩子的角色時，用家長帳號登入（帳號頁）：
 * L1 起大人的入口統一在標題畫面的「大人登入」，這裡只在登入失敗時提示（第 4.1 節）。
 */
import { useState, type SubmitEvent } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import { classesOf, reloginRoom } from '../../store/island';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';

/** 只留數字、最多 n 位（房間代碼與密碼用） */
const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

export function ClassScreen() {
  const goto = useUi((s) => s.goto);
  const active = useGame((s) => s.profile());
  const login = useCloud((s) => s.login);
  // 目前角色是雲端角色但需要重新登入時，先填好代碼與暱稱（多班級：現在所在那一班的代碼與那一班的暱稱，可以改選別班）
  const relogin = active?.cloud && !getToken(active.cloud.accountId) ? active : null;
  /** 重新登入時可以選的班級（多班級才列出來） */
  const reloginRooms = classesOf(relogin);
  const first = reloginRoom(relogin);
  const [code, setCode] = useState(first?.code ?? '');
  const [nickname, setNickname] = useState(first?.nickname ?? relogin?.name ?? '');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = code.length === 6 && nickname.trim().length > 0 && pin.length === 4 && !busy;

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const p = await login({ code, nickname: nickname.trim(), pin });
      sfx.fanfare();
      teleport(SPAWN);
      speak(enterIslandLine(p.name));
      goto('island');
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤，請再試一次');
      sfx.oops();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="班級">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#2f8f6b' }}>
            🏫 班級
          </span>
          <h2>登入班級</h2>
          <button className="btn small white" onClick={() => goto('profiles')} data-testid="class-back">
            返回
          </button>
        </div>
        <form className="panel-body" onSubmit={submit}>
          {reloginRooms.length > 1 && (
            // 多班級：各班的暱稱與密碼不同，選用哪一班登入（換成那一班的代碼與暱稱）
            <div style={{ marginBottom: 10 }}>
              <span className="label">用哪一班登入？</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {reloginRooms.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    className={`btn small ${r.code === code ? '' : 'white'}`}
                    aria-pressed={r.code === code}
                    onClick={() => {
                      setCode(r.code);
                      setNickname(r.nickname ?? relogin!.name);
                      setError(null);
                    }}
                    data-testid={`class-pick-${r.code}`}
                  >
                    🏫 {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="label" htmlFor="class-code">
            班級代碼（6 個數字，請問老師）
          </label>
          <input
            id="class-code"
            className="text-input"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(digits(e.target.value, 6))}
            placeholder="例如：123456"
            data-testid="class-code"
          />
          <label className="label" htmlFor="class-nickname">
            暱稱
          </label>
          <input
            id="class-nickname"
            className="text-input"
            maxLength={12}
            autoComplete="off"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例如：小安"
            data-testid="class-nickname"
          />
          <label className="label" htmlFor="class-pin">
            4 位數密碼
          </label>
          <input
            id="class-pin"
            className="text-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(digits(e.target.value, 4))}
            placeholder="● ● ● ●"
            data-testid="class-pin"
          />
          {error && (
            <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid="class-error">
              {error}
            </p>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="btn big green" disabled={!ready} data-testid="class-submit">
              {busy ? '連線中…' : '登入，出發！'}
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <span className="label">在學校、老師在旁邊？不用記密碼：</span>
            <button type="button" className="btn small white" onClick={() => goto('classroom')} data-testid="class-classroom">
              👩‍🏫 老師輸入教室密碼
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 12 }}>
              <span className="label">忘記密碼請老師重設；角色在家長帳號下的，請家長幫忙：</span>
              <button type="button" className="btn small white" onClick={() => goto('teacher')} data-testid="class-parent-login">
                大人登入
              </button>
            </div>
          )}
          <p className="notice">登入後，進度會存到班級，換一台平板也能接著玩。沒有網路時照常玩，連上網路後會自動上傳。</p>
        </form>
      </div>
    </div>
  );
}
