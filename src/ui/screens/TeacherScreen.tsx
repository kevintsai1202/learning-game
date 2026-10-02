/**
 * 老師／家長的班級管理：建立房間或登入，之後看成員列表、重設孩子密碼、移除成員、開關「允許加入」。
 * 也可以綁定 Google，之後用 Google 快速登入（備選；綁了多個房間時先選房間）。
 * 登入狀態放 sessionStorage（教室共用電腦關掉分頁就登出）。
 */
import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { useUi } from '../../store/useUi';
import { api, ApiFailure } from '../../online/api';
import { serverUrl } from '../../online/config';
import { getTeacherSession, setTeacherSession, type TeacherSession } from '../../online/storage';
import type { GoogleRoomsResponse, MemberSummary, RoomSettings } from '../../online/protocol';
import { useCloud } from '../../online/useCloud';
import { GoogleButton } from '../GoogleButton';

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

/** 還沒登入：建立房間或用代碼＋管理密碼登入 */
function TeacherLogin({ onLogin }: { onLogin: (s: TeacherSession, created: boolean) => void }) {
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Google 登入後綁了多個房間：讓老師選一個 */
  const [rooms, setRooms] = useState<GoogleRoomsResponse['rooms'] | null>(null);
  const clientId = useCloud((s) => s.googleClientId);
  const server = serverUrl();

  /** 用 Google 登入：只有一個房間直接進管理頁，多個就先選房間 */
  const googleLogin = async (idToken: string) => {
    if (!server) return;
    setError(null);
    try {
      const r = await api<GoogleRoomsResponse>('POST', '/api/teacher/google/login', { body: { idToken } });
      if (r.rooms.length === 1) onLogin({ server, code: r.rooms[0].code, token: r.rooms[0].token }, false);
      else setRooms(r.rooms);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  if (rooms && server) {
    return (
      <div className="panel-body">
        <p className="plain">這個 Google 帳號綁了 {rooms.length} 個房間，要管理哪一個？</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {rooms.map((r) => (
            <button key={r.code} className="btn white" onClick={() => onLogin({ server, code: r.code, token: r.token }, false)} data-testid={`pick-room-${r.code}`}>
              {r.name}（{r.code}）
            </button>
          ))}
        </div>
      </div>
    );
  }

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!server) return;
    if (mode === 'create' && password !== confirm) {
      setError('兩次輸入的管理密碼不一樣');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const r = await api<{ code: string; token: string }>('POST', '/api/rooms', { body: { name: name.trim(), password } });
        onLogin({ server, code: r.code, token: r.token }, true);
      } else {
        const r = await api<{ token: string }>('POST', '/api/teacher/login', { body: { code, password } });
        onLogin({ server, code, token: r.token }, false);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const ready = !busy && password.length >= 6 && (mode === 'create' ? name.trim().length > 0 && confirm.length >= 6 : code.length === 6);
  return (
    <>
      <div className="tabs">
        <button className={`btn small white ${mode === 'create' ? 'on' : ''}`} onClick={() => setMode('create')} data-testid="teacher-tab-create">
          建立新房間
        </button>
        <button className={`btn small white ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')} data-testid="teacher-tab-login">
          登入已有的房間
        </button>
      </div>
      <form className="panel-body" onSubmit={submit}>
        {mode === 'create' ? (
          <>
            <label className="label" htmlFor="room-name">
              房間名稱（例如：二年一班、小安家）
            </label>
            <input id="room-name" className="text-input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} data-testid="room-name" />
          </>
        ) : (
          <>
            <label className="label" htmlFor="room-code">
              房間代碼（6 位數字）
            </label>
            <input
              id="room-code"
              className="text-input"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              data-testid="room-code"
            />
          </>
        )}
        <label className="label" htmlFor="room-password">
          管理密碼（至少 6 個字，只有大人知道）
        </label>
        <input id="room-password" className="text-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="room-password" />
        {mode === 'create' && (
          <>
            <label className="label" htmlFor="room-confirm">
              再輸入一次管理密碼
            </label>
            <input id="room-confirm" className="text-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="room-confirm" />
          </>
        )}
        {error && (
          <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid="teacher-error">
            {error}
          </p>
        )}
        <div style={{ marginTop: 14 }}>
          <button type="submit" className="btn big green" disabled={!ready} data-testid="teacher-submit">
            {busy ? '連線中…' : mode === 'create' ? '建立房間' : '登入'}
          </button>
        </div>
        {mode === 'login' && clientId && (
          <div style={{ marginTop: 16 }}>
            <span className="label">或用 Google 登入（要先在管理頁綁定 Google）</span>
            <GoogleButton clientId={clientId} label="用 Google 登入" testId="teacher-google-login" onCredential={(t) => void googleLogin(t)} />
          </div>
        )}
        <p className="notice">
          孩子用「房間代碼＋暱稱＋自己設的 4 位數密碼」加入。伺服器只存暱稱，不收真實姓名；4 位數密碼是給孩子的方便措施，不是高強度防護。
        </p>
      </form>
    </>
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

/** 已登入：房間資訊與成員列表 */
function RoomDashboard({ session, justCreated, onLogout }: { session: TeacherSession; justCreated: boolean; onLogout: () => void }) {
  const [room, setRoom] = useState<RoomSettings | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  /** 這個房間綁定的老師 Google 帳號（email 已遮罩） */
  const [google, setGoogle] = useState<string[]>([]);
  const clientId = useCloud((s) => s.googleClientId);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** 呼叫老師 API；權杖失效就登出 */
  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      try {
        return await api<T>(method, path, { base: session.server, token: session.token, body });
      } catch (err) {
        if (err instanceof ApiFailure && err.status === 401) onLogout();
        throw err;
      }
    },
    [session, onLogout],
  );

  const reload = useCallback(async () => {
    try {
      const r = await call<{ room: RoomSettings; members: MemberSummary[]; google: string[] }>('GET', '/api/teacher/room');
      setRoom(r.room);
      setMembers(r.members);
      setGoogle(r.google);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call]);

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
      {justCreated && <p className="notice">房間建好了！請記下房間代碼和管理密碼，之後要用代碼和管理密碼登入這個管理頁。</p>}
      {room && (
        <>
          <div className="room-code-box">
            <span className="label">房間代碼</span>
            <strong className="room-code" data-testid="room-code-display">
              {room.code}
            </strong>
            <span className="plain">{room.name}</span>
          </div>
          <label className="plain" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <input type="checkbox" checked={room.joinOpen} onChange={(e) => void act(() => call('PATCH', '/api/teacher/room', { joinOpen: e.target.checked }), e.target.checked ? '已開放加入' : '已停止加入')} data-testid="toggle-join" />
            允許新的孩子加入（全班都加入後可以關掉，避免代碼外流後有陌生人加入）
          </label>
          <label className="plain" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <input type="checkbox" checked={room.chatOpen} onChange={(e) => void act(() => call('PATCH', '/api/teacher/room', { chatOpen: e.target.checked }), e.target.checked ? '已開放聊天' : '已關閉聊天')} data-testid="toggle-chat" />
            允許公頻聊天（孩子只能選預設短句，不能自由打字）
          </label>
          <label className="plain" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
            <input type="checkbox" checked={room.giftsOpen} onChange={(e) => void act(() => call('PATCH', '/api/teacher/room', { giftsOpen: e.target.checked }), e.target.checked ? '已開放送禮' : '已關閉送禮')} data-testid="toggle-gifts" />
            允許送禮物（用金幣買貼紙或外觀送同學；關掉後不能送新的，已送出的還是可以收下）
          </label>
        </>
      )}
      {clientId && (
        <div className="plain" style={{ margin: '8px 0' }} data-testid="teacher-google-section">
          <strong>Google 快速登入（備選）</strong>
          <p style={{ margin: '4px 0' }} data-testid="teacher-google-linked">
            {google.length ? `已綁定：${google.join('、')}` : '還沒有綁定。綁定後可以用 Google 登入這個管理頁，不用記管理密碼（管理密碼照樣可以用）。'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <GoogleButton clientId={clientId} label="綁定 Google 帳號" testId="teacher-google-link" onCredential={(t) => void act(() => call('POST', '/api/teacher/google/link', { idToken: t }), '綁定好了！之後可以在管理頁用 Google 登入。')} />
            {google.length > 0 && (
              <button className="btn small white" onClick={() => void act(() => call('DELETE', '/api/teacher/google/link'), '已解除 Google 綁定')} data-testid="teacher-google-unlink">
                解除綁定
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="notice" role="alert" style={{ color: '#c0392b' }}>
          {error}
        </p>
      )}
      {note && <p className="notice">{note}</p>}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', flexWrap: 'wrap' }}>
        <button className="btn small white" onClick={() => void reload()} data-testid="teacher-reload">
          🔄 重新整理
        </button>
        <button className="btn small white" onClick={onLogout} data-testid="teacher-logout">
          登出管理頁
        </button>
      </div>
      {members.length === 0 ? (
        <p className="plain">還沒有孩子加入。請孩子在選角畫面點「🏫 班級」→「第一次加入」，輸入上面的房間代碼。</p>
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
                      onReset={(pin) => act(() => call('POST', `/api/teacher/members/${m.id}/pin`, { pin }), `已把「${m.nickname}」的密碼改成新密碼，請告訴孩子`)}
                      onRemove={() => act(() => call('DELETE', `/api/teacher/members/${m.id}`), `已移除「${m.nickname}」`)}
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

export function TeacherScreen() {
  const goto = useUi((s) => s.goto);
  const [session, setSession] = useState<TeacherSession | null>(() => getTeacherSession());
  // 讀伺服器設定（決定要不要顯示 Google 按鈕）
  useEffect(() => {
    void useCloud.getState().loadConfig();
  }, []);
  const [justCreated, setJustCreated] = useState(false);
  const logout = useCallback(() => {
    setTeacherSession(null);
    setSession(null);
  }, []);
  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="班級管理">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#2b2a4c' }}>
            👩‍🏫 班級管理
          </span>
          <h2 />
          <button className="btn small white" onClick={() => goto('title')} data-testid="teacher-back">
            返回
          </button>
        </div>
        {session ? (
          <RoomDashboard session={session} justCreated={justCreated} onLogout={logout} />
        ) : (
          <TeacherLogin
            onLogin={(s, created) => {
              setTeacherSession(s);
              setSession(s);
              setJustCreated(created);
            }}
          />
        )}
      </div>
    </div>
  );
}
