/**
 * 學校平板的班級畫面（L3 教室密碼，docs/plans/login-ux-review.md 第 7.2 節）：
 * 1. 老師輸入班級代碼（掃 QR code 進來時已填好）與教室密碼 → 這台平板拿到 8 小時的教室權杖（記在 localStorage）。
 * 2. 名單：班上每位孩子的卡片（和選角畫面一樣的樣式），點一張 → 這台平板拿到那位孩子的權杖 → 進那一班的班級島。
 *    最後一張「➕ 新增學生」：老師取暱稱、選外觀，建一個沒有家長、沒有密碼的角色（老師關掉「允許加入」時不能建）。
 * 3. 8 小時內從選角畫面點「🏫 班級」直接回到名單；「換班級」清掉記住的權杖。
 * 家長在自己手機掃到這一頁：底下「我是家長 → 登入」到帳號頁。元素都有 data-testid（e2e 用）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { useAccount } from '../../online/useAccount';
import { useCloud } from '../../online/useCloud';
import { api, ApiFailure } from '../../online/api';
import { LocalConflictError } from '../../online/cloudSync';
import { loadClassroom, saveClassroom, type ClassroomSession } from '../../online/classroom';
import type { ClassroomCreateResponse, ClassroomMember, ClassroomMembersResponse, ClassroomUnlockResponse } from '../../online/protocol';
import type { AvatarConfig } from '../../store/save';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';

/** 只留數字、最多 n 位 */
const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);
/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof ApiFailure || err instanceof Error ? err.message : '出了點問題，再試一次');

export function ClassroomScreen() {
  const goto = useUi((s) => s.goto);
  const joining = useAccount((s) => s.joining);
  const setJoining = useAccount((s) => s.setJoining);
  /** 這台平板記住的教室權杖；掃了別班的 QR code 就不算（要重新輸入那一班的密碼） */
  const [session, setSession] = useState<ClassroomSession | null>(() => {
    const kept = loadClassroom();
    return kept && (!joining || joining.code === kept.code) ? kept : null;
  });
  const [code, setCode] = useState(joining?.code ?? session?.code ?? '');
  const [password, setPassword] = useState('');
  /** 班上名單（還沒讀到是 null） */
  const [roster, setRoster] = useState<ClassroomMembersResponse | null>(null);
  /** 「新增學生」的表單 */
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [avatar, setAvatar] = useState<AvatarConfig>({ animal: 'bear', color: COLORS[0], hat: null });
  /** 這台平板已經有同一個角色的備份分身：要老師確認才用雲端的進度取代 */
  const [conflict, setConflict] = useState<ClassroomMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 教室權杖失效（老師換了密碼、8 小時到了）：清掉，回到輸入密碼 */
  const expire = useCallback((message: string) => {
    saveClassroom(null);
    setSession(null);
    setRoster(null);
    setError(message);
  }, []);

  /** 讀名單 */
  const loadRoster = useCallback(async () => {
    if (!session) return;
    try {
      setRoster(await api<ClassroomMembersResponse>('GET', '/api/class/members', { token: session.token }));
      setError(null);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 401) return expire('請老師重新輸入教室密碼');
      setError(messageOf(err));
    }
  }, [session, expire]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  /** 老師輸入教室密碼 */
  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<ClassroomUnlockResponse>('POST', `/api/class/${code}/unlock`, { body: { password } });
      const next: ClassroomSession = { code: res.room.code, name: res.room.name, token: res.token, expiresAt: res.expiresAt };
      saveClassroom(next);
      setSession(next);
      setPassword('');
      // 掃 QR code 進來的流程到這裡完成
      if (joining) setJoining(null);
    } catch (err) {
      setError(messageOf(err));
      sfx.oops();
    } finally {
      setBusy(false);
    }
  };

  /** 點名單上的孩子：這台平板拿到他的權杖，進這一班的班級島 */
  const pick = async (kid: ClassroomMember, replaceLocal = false) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const p = await useCloud.getState().playFromClassroom(kid.id, session.token, { replaceLocal });
      useGame.getState().setIsland(p.id, session.code);
      setConflict(null);
      sfx.fanfare();
      teleport(SPAWN);
      speak(enterIslandLine(kid.nickname));
      goto('island');
    } catch (err) {
      if (err instanceof LocalConflictError) setConflict(kid);
      else if (err instanceof ApiFailure && err.status === 401) return expire('請老師重新輸入教室密碼');
      setError(messageOf(err));
      sfx.oops();
    } finally {
      setBusy(false);
    }
  };

  /** 新增學生：建好就直接進島 */
  const create = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<ClassroomCreateResponse>('POST', '/api/class/members', { token: session.token, body: { nickname: newName.trim(), avatar } });
      setCreating(false);
      setNewName('');
      await pick(res.member);
    } catch (err) {
      if (err instanceof ApiFailure && err.status === 401) return expire('請老師重新輸入教室密碼');
      setError(messageOf(err));
      sfx.oops();
    } finally {
      setBusy(false);
    }
  };

  /** 掃碼進來的家長：到帳號頁登入（跳過「老師在旁邊／我是家長」那一頁） */
  const asParent = () => {
    if (joining) setJoining({ ...joining, asParent: true });
    goto('teacher');
  };

  const back = () => {
    if (joining) setJoining(null);
    goto('profiles');
  };

  const newOk = newName.trim().length > 0 && [...newName.trim()].length <= 12 && !busy;

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="學校平板的班級" data-testid="classroom-screen">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#2f8f6b' }}>
            🏫 班級
          </span>
          <h2>{session ? session.name : '老師請輸入教室密碼'}</h2>
          <button className="btn small white" onClick={back} data-testid="classroom-back">
            返回
          </button>
        </div>

        {!session ? (
          <form
            className="panel-body"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 6 && password.length > 0 && !busy) void unlock();
            }}
          >
            <label className="label" htmlFor="classroom-code">
              班級代碼（6 個數字）
            </label>
            <input id="classroom-code" className="text-input" inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(digits(e.target.value, 6))} placeholder="例如：123456" data-testid="classroom-code" />
            <label className="label" htmlFor="classroom-password">
              教室密碼（老師在班級頁設定的）
            </label>
            <input
              id="classroom-password"
              className="text-input"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="classroom-password"
            />
            {error && (
              <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid="classroom-error">
                {error}
              </p>
            )}
            <div style={{ marginTop: 14 }}>
              <button type="submit" className="btn big green" disabled={code.length !== 6 || !password || busy} data-testid="classroom-unlock">
                {busy ? '連線中…' : '看班上名單'}
              </button>
            </div>
            <p className="notice">密碼對了，這台平板 8 小時內不用再輸入。老師還沒設定教室密碼的話，請到老師的班級頁設定。</p>
            <div style={{ marginTop: 10 }}>
              <span className="label">我是家長，想讓孩子加入班級：</span>
              <button type="button" className="btn small white" onClick={asParent} data-testid="classroom-parent-login">
                👨‍👩‍👧 家長登入
              </button>
            </div>
          </form>
        ) : (
          <div className="panel-body">
            {conflict ? (
              <div className="plain" data-testid="classroom-conflict">
                <p>這台平板上已經有「{conflict.nickname}」，而且不是班級裡的這一個（可能是之前用備份匯入的）。換成班級的進度會蓋掉這台平板上的進度。</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn green" disabled={busy} onClick={() => void pick(conflict, true)} data-testid="classroom-replace">
                    用班級的進度取代
                  </button>
                  <button className="btn white" disabled={busy} onClick={() => setConflict(null)}>
                    取消
                  </button>
                </div>
              </div>
            ) : creating ? (
              <div className="plain" data-testid="classroom-new-form">
                <label className="label" htmlFor="classroom-new-name">
                  暱稱（請用綽號，不要用真名）
                </label>
                <input id="classroom-new-name" className="text-input" maxLength={12} autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="classroom-new-name" />
                <span className="label">選一個動物</span>
                <div className="choice-row">
                  {ANIMALS.map((a) => (
                    <button key={a.id} type="button" className={`animal-btn ${avatar.animal === a.id ? 'on' : ''}`} onClick={() => setAvatar({ ...avatar, animal: a.id })} aria-label={a.name} aria-pressed={avatar.animal === a.id}>
                      <AnimalIcon animal={a.id} />
                    </button>
                  ))}
                </div>
                <span className="label">選一個顏色</span>
                <div className="choice-row">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch ${avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} aria-label={`顏色 ${c}`} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                  <button className="btn big green" disabled={!newOk} onClick={() => void create()} data-testid="classroom-create">
                    建立，出發！
                  </button>
                  <button className="btn white" disabled={busy} onClick={() => setCreating(false)} data-testid="classroom-cancel-create">
                    返回名單
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="label">點自己的名字就出發：</p>
                {roster === null && !error ? (
                  <p className="plain">讀取中…</p>
                ) : (
                  <div className="profile-grid" data-testid="classroom-roster">
                    {roster?.members.map((m) => (
                      <button key={m.id} className="profile-card" disabled={busy} onClick={() => void pick(m)} data-testid={`classroom-kid-${m.nickname}`}>
                        <span className="face" style={{ background: m.avatar.color }}>
                          <AnimalIcon animal={m.avatar.animal} />
                        </span>
                        {m.nickname}
                      </button>
                    ))}
                    {roster && (
                      <button className="profile-card add" disabled={busy || !roster.joinOpen} onClick={() => setCreating(true)} data-testid="classroom-new">
                        <span className="face">➕</span>
                        新增學生
                        <span className="meta">{roster.joinOpen ? '老師取暱稱、選外觀' : '老師關掉了「允許加入」'}</span>
                      </button>
                    )}
                  </div>
                )}
                {roster && !roster.joinOpen && (
                  <p className="notice" data-testid="classroom-closed">
                    老師關掉了「允許新的孩子加入」，所以不能新增學生；要加人時老師在班級頁打開。
                  </p>
                )}
              </>
            )}
            {error && (
              <p className="notice" role="alert" style={{ color: '#c0392b' }} data-testid="classroom-error">
                {error}
              </p>
            )}
            <div style={{ marginTop: 14 }}>
              <button className="btn small white" disabled={busy} onClick={() => expire('')} data-testid="classroom-relock">
                🔑 換班級／重新輸入教室密碼
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
