/**
 * 老師／家長的帳號頁（docs/plans/accounts.md 的 A1）：用自訂的帳號密碼登入或註冊，登入後依身分切換——
 * 老師看到「我的班級」（建立班級；點進去看成員、重設孩子密碼、移出、開關加入／聊天／送禮），
 * 家長的雲端角色在 A2 開放。沒勾「保持登入」時，登入狀態存 sessionStorage：教室共用電腦關掉分頁就登出。
 */
import { useCallback, useEffect, useState, type ReactNode, type SubmitEvent } from 'react';
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { useAccount } from '../../online/useAccount';
import { useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import { checkEmail, checkPassword, checkUsername, PASSWORD_MIN } from '../../online/userRules';
import type { KidSummary, MemberSummary, ParentKidsResponse, RoomSettings, TeacherRoomResponse, TeacherRoomSummary, TeacherRoomsResponse } from '../../online/protocol';

/** 顯示「多久以前」 */
function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof Error ? err.message : '發生錯誤，請再試一次');

/** 紅字的錯誤提示（沒有錯誤時不顯示） */
function ErrorNote({ text, testId }: { text: string | null; testId: string }) {
  if (!text) return null;
  return (
    <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid={testId}>
      {text}
    </p>
  );
}

/** 一個勾選框（文字在右邊） */
function Check({ checked, onChange, testId, children }: { checked: boolean; onChange: (v: boolean) => void; testId: string; children: ReactNode }) {
  return (
    <label className="plain" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {children}
    </label>
  );
}

/** 還沒登入：用帳號密碼登入，或註冊新的大人帳號 */
function AccountGate() {
  const login = useAccount((s) => s.login);
  const register = useAccount((s) => s.register);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [parent, setParent] = useState(false);
  const [teacher, setTeacher] = useState(false);
  /** 在這台裝置保持登入（預設不勾：教室共用電腦） */
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 註冊表單的第一個問題（前端先擋，伺服器也會再檢查一次） */
  const registerProblem = (): string | null => {
    const name = checkUsername(username);
    if (!name.ok) return name.reason;
    const pw = checkPassword(password);
    if (pw) return pw;
    if (password !== confirm) return '兩次輸入的密碼不一樣';
    const mail = checkEmail(email);
    if (!mail.ok) return mail.reason;
    if (!parent && !teacher) return '請勾選「老師」或「家長」（可以兩個都勾）';
    return null;
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mode === 'register') {
      const problem = registerProblem();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(username.trim(), password, remember);
      else await register({ username: username.trim(), password, email: email.trim(), parent, teacher, remember });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
  };
  const ready = !busy && username.trim().length > 0 && password.length > 0;
  return (
    <>
      <div className="tabs">
        <button className={`btn small white ${mode === 'login' ? 'on' : ''}`} onClick={() => switchMode('login')} data-testid="account-tab-login">
          登入
        </button>
        <button className={`btn small white ${mode === 'register' ? 'on' : ''}`} onClick={() => switchMode('register')} data-testid="account-tab-register">
          註冊新帳號
        </button>
      </div>
      <form className="panel-body" onSubmit={submit}>
        <label className="label" htmlFor="account-username">
          帳號名稱{mode === 'register' && '（4～20 個英文字母、數字或底線，不要用真實姓名）'}
        </label>
        <input
          id="account-username"
          className="text-input"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          data-testid="account-username"
        />
        <label className="label" htmlFor="account-password">
          密碼{mode === 'register' && `（至少 ${PASSWORD_MIN} 個字）`}
        </label>
        <input
          id="account-password"
          className="text-input"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="account-password"
        />
        {mode === 'register' && (
          <>
            <label className="label" htmlFor="account-confirm">
              再輸入一次密碼
            </label>
            <input id="account-confirm" className="text-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="account-confirm" />
            <label className="label" htmlFor="account-email">
              email（忘記密碼時用來重設，不會公開）
            </label>
            <input
              id="account-email"
              className="text-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="account-email"
            />
            <span className="label">身分（可以兩個都勾，之後也可以在帳號設定加上）</span>
            <Check checked={teacher} onChange={setTeacher} testId="role-teacher">
              👩‍🏫 老師（建立班級、管理學生）
            </Check>
            <Check checked={parent} onChange={setParent} testId="role-parent">
              👨‍👩‍👧 家長（管理自己孩子的雲端角色）
            </Check>
          </>
        )}
        <Check checked={remember} onChange={setRemember} testId="account-remember">
          在這台裝置保持登入（教室共用的電腦請不要勾）
        </Check>
        <ErrorNote text={error} testId="account-error" />
        <div style={{ marginTop: 14 }}>
          <button type="submit" className="btn big green" disabled={!ready} data-testid="account-submit">
            {busy ? '連線中…' : mode === 'login' ? '登入' : '註冊'}
          </button>
        </div>
        <p className="notice">孩子不用註冊：孩子用老師給的「班級代碼＋暱稱＋自己設的 4 位數密碼」加入班級。</p>
      </form>
    </>
  );
}

/** 帳號設定：加上另一個身分、改 email、改密碼 */
function AccountSettings() {
  const user = useAccount((s) => s.user);
  const update = useAccount((s) => s.update);
  const changePassword = useAccount((s) => s.changePassword);
  const [email, setEmail] = useState(user?.email ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 刪除帳號：按第一次才出現密碼欄與確定鈕 */
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  if (!user) return null;

  /** 執行一個設定動作，顯示結果 */
  const run = async (job: () => Promise<void>, done: string) => {
    setError(null);
    setMsg(null);
    try {
      await job();
      setMsg(done);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const savePassword = () => {
    const problem = checkPassword(next) ?? (next !== confirm ? '兩次輸入的新密碼不一樣' : null);
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
    }, '密碼改好了，其他裝置的登入都已經登出');
  };

  /** 刪除帳號：家長名下的角色一併刪除，這台裝置上的那些角色也拿掉，最後登出 */
  const deleteAccount = () =>
    void run(async () => {
      const call = useAccount.getState().call;
      const kids = user.parent ? (await call<ParentKidsResponse>('GET', '/api/parent/kids')).kids : [];
      await call('DELETE', '/api/users/me', { password: deletePassword });
      for (const k of kids) useCloud.getState().forget(k.id);
      await useAccount.getState().logout();
    }, '帳號已經刪除');

  return (
    <div className="panel-body plain" data-testid="account-settings-panel">
      <h4 style={{ margin: '0 0 6px' }}>身分</h4>
      <p style={{ margin: '0 0 6px' }} data-testid="account-roles">
        {[user.teacher && '👩‍🏫 老師', user.parent && '👨‍👩‍👧 家長'].filter(Boolean).join('、')}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!user.teacher && (
          <button className="btn small white" onClick={() => void run(() => update({ teacher: true }), '已加上老師身分')} data-testid="role-add-teacher">
            加上老師身分
          </button>
        )}
        {!user.parent && (
          <button className="btn small white" onClick={() => void run(() => update({ parent: true }), '已加上家長身分')} data-testid="role-add-parent">
            加上家長身分
          </button>
        )}
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>email</h4>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="text-input" type="email" inputMode="email" style={{ flex: '1 1 200px' }} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" data-testid="settings-email" />
        <button className="btn small white" disabled={email.trim() === (user.email ?? '')} onClick={() => void run(() => update({ email: email.trim() }), 'email 改好了')} data-testid="settings-email-save">
          儲存 email
        </button>
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>改密碼</h4>
      <input className="text-input" type="password" autoComplete="current-password" placeholder="目前的密碼" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="目前的密碼" data-testid="settings-current" />
      <input className="text-input" type="password" autoComplete="new-password" placeholder={`新密碼（至少 ${PASSWORD_MIN} 個字）`} value={next} onChange={(e) => setNext(e.target.value)} aria-label="新密碼" data-testid="settings-next" />
      <input className="text-input" type="password" autoComplete="new-password" placeholder="再輸入一次新密碼" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="再輸入一次新密碼" data-testid="settings-confirm" />
      <div style={{ marginTop: 8 }}>
        <button className="btn small white" disabled={!current || !next} onClick={savePassword} data-testid="settings-password-save">
          改密碼
        </button>
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>刪除帳號</h4>
      <p style={{ margin: '0 0 6px' }}>家長名下的雲端角色會一併刪除，刪除後無法復原。還有班級的老師帳號要先移除班級。</p>
      {deleting ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="text-input"
            type="password"
            autoComplete="current-password"
            placeholder="再輸入一次密碼"
            style={{ flex: '1 1 160px' }}
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            aria-label="再輸入一次密碼"
            data-testid="delete-password"
          />
          <button className="btn small red" disabled={!deletePassword} onClick={deleteAccount} data-testid="delete-account-confirm">
            確定刪除帳號
          </button>
          <button className="btn small white" onClick={() => setDeleting(false)}>
            取消
          </button>
        </div>
      ) : (
        <button className="btn small white" onClick={() => setDeleting(true)} data-testid="delete-account">
          刪除帳號
        </button>
      )}
      <ErrorNote text={error} testId="settings-error" />
      {msg && (
        <p className="notice" data-testid="settings-msg">
          {msg}
        </p>
      )}
    </div>
  );
}

/** 家長：名下的雲端角色（在這台裝置玩、退出班級、刪除），以及這台裝置上還沒存到雲端的角色（存到雲端） */
function ParentHome() {
  const call = useAccount((s) => s.call);
  const session = useAccount((s) => s.session);
  const profiles = useGame((s) => s.save.profiles);
  const [kids, setKids] = useState<KidSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** 等待第二次確認刪除的孩子 */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** 動作進行中：按鈕停用，避免連按兩下送出兩次（例如存到雲端變成兩個分身） */
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setKids((await call<ParentKidsResponse>('GET', '/api/parent/kids')).kids);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 執行一個動作後重新整理清單 */
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(done);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;
  /**
   * 這台裝置上有沒有這個雲端角色、而且還能同步（有權杖）。權杖過期或被撤銷（例如用班級代碼登入的平板退出班級）時
   * 算沒有，照樣顯示「在這台裝置玩」：拿新權杖，這台還沒送出的進度會疊回去。
   */
  const onThisDevice = (kidId: string) => profiles.some((p) => p.cloud?.accountId === kidId) && !!getToken(kidId);
  const localOnly = profiles.filter((p) => !p.cloud);

  return (
    <div className="panel-body plain" data-testid="parent-home">
      <h3 style={{ margin: '0 0 8px' }}>我的孩子（雲端角色）</h3>
      {kids === null ? (
        <p>讀取中…</p>
      ) : kids.length === 0 ? (
        <p>還沒有雲端角色。把下面這台裝置上的角色「存到雲端」，換電腦用家長帳號登入就能接著玩。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="kid-list">
          {kids.map((k) => (
            <div key={k.id} className="card" style={{ padding: '8px 12px' }} data-testid={`kid-${k.name}`}>
              <div>
                <strong>{k.name}</strong>　{k.room ? `🏫 ${k.room.name}` : '☁️ 還沒加入班級'}・⭐ {k.stars}・🪙 {k.coins}・{ago(k.lastSeen)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {onThisDevice(k.id) ? (
                  <span data-testid={`kid-here-${k.name}`}>✅ 這台裝置上有</span>
                ) : (
                  <button
                    className="btn small green"
                    disabled={busy}
                    onClick={() => void act(() => useCloud.getState().playOnThisDevice(k.id, session.server, session.token), `「${k.name}」已經在這台裝置上了，回到選角畫面就能玩`)}
                    data-testid={`kid-device-${k.name}`}
                  >
                    在這台裝置玩
                  </button>
                )}
                {k.room && (
                  <button
                    className="btn small white"
                    disabled={busy}
                    onClick={() => void act(() => call('POST', `/api/parent/kids/${k.id}/leave-class`, {}), `「${k.name}」已經退出班級，進度都還在`)}
                    data-testid={`kid-leave-${k.name}`}
                  >
                    退出班級
                  </button>
                )}
                {confirmDelete === k.id ? (
                  <>
                    <button
                      className="btn small red"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await call('DELETE', `/api/parent/kids/${k.id}`);
                          useCloud.getState().forget(k.id);
                          setConfirmDelete(null);
                        }, `已經刪除「${k.name}」`)
                      }
                      data-testid={`kid-delete-confirm-${k.name}`}
                    >
                      確定刪除「{k.name}」（進度會全部不見）
                    </button>
                    <button className="btn small white" onClick={() => setConfirmDelete(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button className="btn small white" onClick={() => setConfirmDelete(k.id)} data-testid={`kid-delete-${k.name}`}>
                    刪除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {localOnly.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 6px' }}>這台裝置上的角色</h3>
          <p style={{ margin: '0 0 6px' }}>存到雲端後，換電腦用家長帳號登入就能接著玩。</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localOnly.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-testid={`local-${p.name}`}>
                <strong>{p.name}</strong>
                <button
                  className="btn small green"
                  disabled={busy}
                  onClick={() => void act(() => useCloud.getState().uploadToCloud(p.id, session.server, session.token), `「${p.name}」已經存到雲端`)}
                  data-testid={`upload-${p.name}`}
                >
                  存到雲端
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <ErrorNote text={error} testId="parent-error" />
      {note && (
        <p className="notice" data-testid="parent-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** 一位成員的操作：重設密碼、移除（兩段式確認，不用瀏覽器的 confirm 對話框） */
function MemberActions({ member, onReset, onRemove }: { member: MemberSummary; onReset: (pin: string) => Promise<void>; onRemove: () => Promise<void> }) {
  const [mode, setMode] = useState<'idle' | 'pin' | 'remove'>('idle');
  const [pin, setPin] = useState('');
  if (mode === 'pin') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <input
          className="text-input"
          style={{ width: 90, padding: '4px 8px' }}
          inputMode="numeric"
          placeholder="新密碼"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          aria-label={`${member.nickname} 的新密碼`}
          data-testid={`new-pin-${member.nickname}`}
        />
        <button className="btn small green" disabled={pin.length !== 4} onClick={() => void onReset(pin).then(() => setMode('idle'))} data-testid={`save-pin-${member.nickname}`}>
          確定
        </button>
        <button className="btn small white" onClick={() => setMode('idle')}>
          取消
        </button>
      </span>
    );
  }
  if (mode === 'remove') {
    return (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn small red" onClick={() => void onRemove()} data-testid={`confirm-remove-${member.nickname}`}>
          確定移除「{member.nickname}」
        </button>
        <button className="btn small white" onClick={() => setMode('idle')}>
          取消
        </button>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn small white" onClick={() => setMode('pin')} data-testid={`reset-pin-${member.nickname}`}>
        重設密碼
      </button>
      <button className="btn small white" onClick={() => setMode('remove')} data-testid={`remove-${member.nickname}`}>
        移除
      </button>
    </span>
  );
}

/** 老師：我的班級清單與建立班級 */
function ClassList({ onOpen }: { onOpen: (code: string, created: boolean) => void }) {
  const call = useAccount((s) => s.call);
  const [rooms, setRooms] = useState<TeacherRoomSummary[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRooms((await call<TeacherRoomsResponse>('GET', '/api/teacher/rooms')).rooms);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ room: RoomSettings }>('POST', '/api/teacher/rooms', { name: name.trim() });
      setName('');
      onOpen(r.room.code, true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <h3 style={{ margin: '0 0 8px' }}>我的班級</h3>
      {rooms === null ? (
        <p className="plain">讀取中…</p>
      ) : rooms.length === 0 ? (
        <p className="plain">還沒有班級，先在下面建立一個。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="class-list">
          {rooms.map((r) => (
            <button key={r.code} className="btn white" style={{ textAlign: 'left' }} onClick={() => onOpen(r.code, false)} data-testid={`class-${r.code}`}>
              {r.name}（代碼 {r.code}）・{r.members} 位孩子
            </button>
          ))}
        </div>
      )}
      <form onSubmit={create} style={{ marginTop: 14 }}>
        <label className="label" htmlFor="class-name">
          建立新班級（例如：二年一班、安親班）
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input id="class-name" className="text-input" style={{ flex: '1 1 160px' }} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} data-testid="class-name" />
          <button type="submit" className="btn green" disabled={busy || !name.trim()} data-testid="class-create">
            建立班級
          </button>
        </div>
      </form>
      <ErrorNote text={error} testId="class-error" />
    </div>
  );
}

/** 老師：一個班級的代碼、開關與成員列表 */
function RoomDashboard({ code, justCreated, onBack }: { code: string; justCreated: boolean; onBack: () => void }) {
  const call = useAccount((s) => s.call);
  const [room, setRoom] = useState<RoomSettings | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** 這個班級的 API 路徑 */
  const base = `/api/teacher/rooms/${code}`;

  const reload = useCallback(async () => {
    try {
      const r = await call<TeacherRoomResponse>('GET', base);
      setRoom(r.room);
      setMembers(r.members);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 執行一個管理動作後重新整理列表 */
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      setNote(done);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <div className="panel-body">
      <button className="btn small white" onClick={onBack} data-testid="class-back">
        ← 我的班級
      </button>
      {justCreated && <p className="notice">班級建好了！把下面的班級代碼告訴孩子：孩子在選角畫面點「🏫 班級」→「第一次加入」，輸入代碼就能加入。</p>}
      {room && (
        <>
          <div className="room-code-box">
            <span className="label">班級代碼</span>
            <strong className="room-code" data-testid="room-code-display">
              {room.code}
            </strong>
            <span className="plain">{room.name}</span>
          </div>
          <Check checked={room.joinOpen} onChange={(v) => void act(() => call('PATCH', base, { joinOpen: v }), v ? '已開放加入' : '已停止加入')} testId="toggle-join">
            允許新的孩子加入（全班都加入後可以關掉，避免代碼外流後有陌生人加入）
          </Check>
          <Check checked={room.chatOpen} onChange={(v) => void act(() => call('PATCH', base, { chatOpen: v }), v ? '已開放聊天' : '已關閉聊天')} testId="toggle-chat">
            允許公頻聊天（孩子只能選預設短句，不能自由打字）
          </Check>
          <Check checked={room.giftsOpen} onChange={(v) => void act(() => call('PATCH', base, { giftsOpen: v }), v ? '已開放送禮' : '已關閉送禮')} testId="toggle-gifts">
            允許送禮物（用金幣買貼紙或外觀送同學；關掉後不能送新的，已送出的還是可以收下）
          </Check>
        </>
      )}
      <ErrorNote text={error} testId="teacher-error" />
      {note && <p className="notice">{note}</p>}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
        <button className="btn small white" onClick={() => void reload()} data-testid="teacher-reload">
          🔄 重新整理
        </button>
      </div>
      {members.length === 0 ? (
        <p className="plain">還沒有孩子加入。請孩子在選角畫面點「🏫 班級」→「第一次加入」，輸入上面的班級代碼。</p>
      ) : (
        <div className="scroll-x">
          <table className="report-table" data-testid="member-table">
            <thead>
              <tr>
                <th>暱稱</th>
                <th>線上</th>
                <th>最後上線</th>
                <th>⭐</th>
                <th>錯題</th>
                <th>🪙</th>
                <th>回合</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} data-testid={`member-${m.nickname}`}>
                  <td>{m.nickname}</td>
                  <td data-testid={`online-${m.nickname}`}>{m.online ? '🟢' : ''}</td>
                  <td>{ago(m.lastSeen)}</td>
                  <td>{m.stars}</td>
                  <td>{m.wrongCount}</td>
                  <td>{m.coins}</td>
                  <td data-testid={`sessions-${m.nickname}`}>{m.sessions}</td>
                  <td>
                    <MemberActions
                      member={m}
                      onReset={(pin) => act(() => call('POST', `${base}/members/${m.id}/pin`, { pin }), `已把「${m.nickname}」的密碼改成新密碼，請告訴孩子`)}
                      onRemove={() => act(() => call('DELETE', `${base}/members/${m.id}`), `已移除「${m.nickname}」`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 已登入：帳號列、身分切換、老師的班級或家長頁 */
function AccountHome() {
  const user = useAccount((s) => s.user);
  const refresh = useAccount((s) => s.refresh);
  const logout = useAccount((s) => s.logout);
  const [error, setError] = useState<string | null>(null);
  /** 使用者選的身分頁；沒選過時老師優先 */
  const [mode, setMode] = useState<'teacher' | 'parent' | null>(null);
  /** 老師點開的班級 */
  const [openClass, setOpenClass] = useState<{ code: string; created: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 重新整理頁面後只剩權杖：向伺服器讀回帳號資料
  useEffect(() => {
    if (!user) refresh().catch((err: unknown) => setError(messageOf(err)));
  }, [user, refresh]);

  if (!user) {
    return (
      <div className="panel-body">
        <p className="plain">讀取帳號資料中…</p>
        <ErrorNote text={error} testId="account-error" />
      </div>
    );
  }
  const current = mode && user[mode] ? mode : user.teacher ? 'teacher' : 'parent';
  return (
    <>
      <div className="panel-body" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="plain" data-testid="account-name">
            已登入：<strong>{user.username}</strong>
          </span>
          <button className="btn small white" onClick={() => setShowSettings((v) => !v)} data-testid="account-settings">
            ⚙️ 帳號設定
          </button>
          <button className="btn small white" onClick={() => void logout()} data-testid="account-logout">
            登出
          </button>
        </div>
        {user.teacher && user.parent && (
          <div className="tabs" style={{ marginTop: 8 }}>
            <button className={`btn small white ${current === 'teacher' ? 'on' : ''}`} onClick={() => setMode('teacher')} data-testid="mode-teacher">
              👩‍🏫 老師
            </button>
            <button
              className={`btn small white ${current === 'parent' ? 'on' : ''}`}
              onClick={() => {
                setMode('parent');
                setOpenClass(null);
              }}
              data-testid="mode-parent"
            >
              👨‍👩‍👧 家長
            </button>
          </div>
        )}
      </div>
      {showSettings && <AccountSettings />}
      {current === 'teacher' ? (
        openClass ? (
          <RoomDashboard key={openClass.code} code={openClass.code} justCreated={openClass.created} onBack={() => setOpenClass(null)} />
        ) : (
          <ClassList onOpen={(code, created) => setOpenClass({ code, created })} />
        )
      ) : (
        <ParentHome />
      )}
    </>
  );
}

export function TeacherScreen() {
  const goto = useUi((s) => s.goto);
  const session = useAccount((s) => s.session);
  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="老師／家長帳號">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#2b2a4c' }}>
            👩‍🏫 老師／家長
          </span>
          <h2 />
          <button className="btn small white" onClick={() => goto('title')} data-testid="teacher-back">
            返回
          </button>
        </div>
        {session ? <AccountHome /> : <AccountGate />}
      </div>
    </div>
  );
}
