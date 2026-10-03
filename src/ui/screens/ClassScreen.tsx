/**
 * 班級畫面：孩子用「房間代碼＋暱稱＋4 位數密碼」登入班級，或第一次加入班級。
 * 加入時可以選新的外觀，或把這台裝置上的角色進度帶過去（那個角色直接變成雲端角色）。
 * 家長綁定過 Google 的話，也可以按「使用 Google 帳戶登入」快速登入（備選）。
 */
import { useState, type SubmitEvent } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import type { AvatarConfig } from '../../store/save';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { GoogleButton } from '../GoogleButton';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';

/** 只留數字、最多 n 位（房間代碼與密碼用） */
const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

export function ClassScreen() {
  const goto = useUi((s) => s.goto);
  const profiles = useGame((s) => s.save.profiles);
  const active = useGame((s) => s.profile());
  const join = useCloud((s) => s.join);
  const login = useCloud((s) => s.login);
  const attachToClass = useCloud((s) => s.attachToClass);
  const googleLogin = useCloud((s) => s.googleLogin);
  const googleClientId = useCloud((s) => s.googleClientId);
  // 目前角色是雲端角色但需要重新登入時，先填好代碼與暱稱
  const relogin = active?.cloud && !getToken(active.cloud.accountId) ? active : null;
  const [mode, setMode] = useState<'login' | 'join'>('login');
  const [code, setCode] = useState(relogin?.cloud?.room ?? '');
  const [nickname, setNickname] = useState(relogin?.name ?? '');
  const [pin, setPin] = useState('');
  /** 加入時的角色來源：new 為建立新角色，否則是要帶過去的本機角色 id */
  const [source, setSource] = useState('new');
  const [avatar, setAvatar] = useState<AvatarConfig>({ animal: 'bear', color: COLORS[0], hat: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 可以帶進度加入的角色：本機角色（上傳一份到班級），以及家長名下、還沒加入班級的雲端角色（同一個角色直接加入） */
  const localProfiles = profiles.filter((p) => !p.cloud || (!p.cloud.room && !!getToken(p.cloud.accountId)));
  const ready = code.length === 6 && nickname.trim().length > 0 && pin.length === 4 && !busy;

  /** 成功後進島 */
  const enterIsland = (who: string) => {
    sfx.fanfare();
    teleport(SPAWN);
    speak(enterIslandLine(who));
    goto('island');
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const input = { code, nickname: nickname.trim(), pin };
      const picked = profiles.find((x) => x.id === source);
      const p =
        mode === 'login'
          ? await login(input)
          : source === 'new' || !picked
            ? await join({ ...input, avatar })
            : picked.cloud
              ? await attachToClass(picked.id, input)
              : await join({ ...input, profile: picked });
      enterIsland(p.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤，請再試一次');
      sfx.oops();
    } finally {
      setBusy(false);
    }
  };

  /** 用 Google 快速登入：只有一位孩子就直接進島；多位就回選角畫面挑 */
  const onGoogle = async (idToken: string) => {
    setBusy(true);
    setError(null);
    try {
      const kids = await googleLogin(idToken);
      if (kids.length === 1) {
        enterIsland(kids[0].name);
      } else {
        sfx.fanfare();
        goto('profiles');
      }
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
          <h2>{mode === 'login' ? '登入班級' : '第一次加入班級'}</h2>
          <button className="btn small white" onClick={() => goto('profiles')} data-testid="class-back">
            返回
          </button>
        </div>
        <div className="tabs">
          <button className={`btn small white ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')} data-testid="class-tab-login">
            我加入過了
          </button>
          <button className={`btn small white ${mode === 'join' ? 'on' : ''}`} onClick={() => setMode('join')} data-testid="class-tab-join">
            第一次加入
          </button>
        </div>
        <form className="panel-body" onSubmit={submit}>
          <label className="label" htmlFor="class-code">
            房間代碼（6 個數字，請問老師）
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
            暱稱{mode === 'join' && '（請用綽號，不要用真名）'}
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
            {mode === 'join' ? '自己設一個 4 位數密碼（要記住喔）' : '4 位數密碼'}
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

          {mode === 'join' && (
            <>
              {localProfiles.length > 0 && (
                <>
                  <label className="label" htmlFor="class-source">
                    要用哪個角色？
                  </label>
                  <select id="class-source" className="text-input" value={source} onChange={(e) => setSource(e.target.value)} data-testid="class-source">
                    <option value="new">建立新角色</option>
                    {localProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.cloud ? `用「${p.name}」加入（雲端角色）` : `帶著「${p.name}」的進度過去`}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {source === 'new' && (
                <>
                  <span className="label">選一個動物</span>
                  <div className="choice-row">
                    {ANIMALS.map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        className={`animal-btn ${avatar.animal === a.id ? 'on' : ''}`}
                        onClick={() => setAvatar({ ...avatar, animal: a.id })}
                        aria-label={a.name}
                        aria-pressed={avatar.animal === a.id}
                      >
                        <AnimalIcon animal={a.id} />
                      </button>
                    ))}
                  </div>
                  <span className="label">選一個顏色</span>
                  <div className="choice-row">
                    {COLORS.map((c) => (
                      <button type="button" key={c} className={`swatch ${avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} aria-label={`顏色 ${c}`} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid="class-error">
              {error}
            </p>
          )}
          {/* 包一層 div：按鈕自己佔一行，不會擠到上面的下拉選單旁邊 */}
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="btn big green" disabled={!ready} data-testid="class-submit">
              {busy ? '連線中…' : mode === 'login' ? '登入，出發！' : '加入，出發！'}
            </button>
          </div>
          {mode === 'login' && googleClientId && (
            <div style={{ marginTop: 16 }}>
              <span className="label">家長快速登入（要先在家長專區綁定 Google）</span>
              <GoogleButton clientId={googleClientId} label="用 Google 登入" testId="class-google-login" onCredential={(t) => void onGoogle(t)} />
            </div>
          )}
          <p className="notice">登入後，進度會存到班級，換一台平板也能接著玩。沒有網路時照常玩，連上網路後會自動上傳。</p>
        </form>
      </div>
    </div>
  );
}
