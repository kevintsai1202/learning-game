/**
 * 老師／家長的帳號頁（docs/plans/accounts.md 的 A1；標題畫面的「大人登入」）：用帳號密碼或 Google 登入、註冊，登入後依身分切換——
 * 老師看到「我的班級」（建立班級；點進去看成員、重設孩子密碼、移出、開關加入／聊天／送禮），
 * 家長看到名下的雲端角色（A2）與到家長專區的按鈕（登入家長帳號時不用 PIN）。沒勾「保持登入」時，登入狀態存 sessionStorage：教室共用電腦關掉分頁就登出。
 * L1 登入整理（docs/plans/login-ux-review.md）：一份登入表單、Google 按鈕在「登入」旁邊；用 Google 註冊不用帳號名稱與密碼。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { useAccount } from '../../online/useAccount';
import { useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import { ApiFailure } from '../../online/api';
import { GoogleButton } from '../GoogleButton';
import { checkEmail, checkPassword, checkUsername, PASSWORD_MIN } from '../../online/userRules';
import { BUILT_IN_EDITIONS, GENERIC_EDITION, curriculumText, editionsFor } from '../../content/editions';
import { DEFAULT_CURRICULUM, type CurriculumChoice } from '../../store/save';
import { zoneName } from '../../world/layout';
import { JoinClassPanel } from './JoinClassPanel';
import { JoinQr } from './JoinQr';
import type { ZoneId } from '../../store/useUi';
import { MAX_CLASSES, kidRooms } from '../../online/protocol';
import { addDeclined, profilesToOffer, readDeclined } from '../../online/uploadOffer';
import type { KidSummary, MemberSummary, ParentKidsResponse, RoomSettings, TeacherRoomResponse, TeacherRoomSummary, TeacherRoomsResponse, UserGoogleLink } from '../../online/protocol';

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

/**
 * 班級教材版本（老師 GM 的 G0，docs/plans/teacher-gm.md 第 4 節）：統一全班在班級島用的國語、數學版本與學期。
 * 不統一（null）時班級島照各孩子在家長專區的設定；孩子自己的設定留給「我的島」。
 * 只列內建版本：老師這台裝置匯入的版本包，孩子的裝置上沒有。
 */
function ClassCurriculum({ value, onSave }: { value: CurriculumChoice | null; onSave: (c: CurriculumChoice | null) => void }) {
  /**
   * 畫面上的設定：改了馬上顯示並送出，伺服器回應後再跟著伺服器的值。
   * 不直接用 value：連續改兩個下拉時，第二次會拿到還沒更新的舊值，把第一次的修改蓋掉
   */
  // 舊版伺服器的回應沒有這個欄位（部署途中前端先更新時）：當作沒有統一
  const [local, setLocal] = useState<CurriculumChoice | null>(value ?? null);
  useEffect(() => setLocal(value ?? null), [value]);
  /** 下拉選單顯示的值（還沒統一時先用預設版本，打勾就用它） */
  const cur = local ?? DEFAULT_CURRICULUM;
  const save = (c: CurriculumChoice | null) => {
    setLocal(c);
    onSave(c);
  };
  const set = (patch: Partial<CurriculumChoice>) => save({ ...cur, ...patch });
  /** 某科的版本下拉 */
  const select = (subject: 'zh' | 'math', name: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <b style={{ minWidth: 48 }}>{name}</b>
      <select value={cur[subject]} onChange={(e) => set({ [subject]: e.target.value } as Partial<CurriculumChoice>)} data-testid={`class-edition-${subject}`}>
        {editionsFor(BUILT_IN_EDITIONS, subject).map((e) => (
          <option key={e.id} value={e.id}>
            {e.publisher}
          </option>
        ))}
        <option value={GENERIC_EDITION}>依 108 課綱通用（不跟課本）</option>
      </select>
    </label>
  );
  return (
    <div style={{ margin: '12px 0' }} data-testid="class-curriculum">
      <h3 style={{ margin: '6px 0' }}>班級教材版本</h3>
      <Check checked={local !== null} onChange={(v) => save(v ? cur : null)} testId="class-curriculum-toggle">
        統一全班在班級島用的課本版本（不統一時，照各孩子在家長專區的設定；孩子自己的設定會用在「我的島」）
      </Check>
      {local && (
        <div className="plain" style={{ display: 'grid', gap: 8, marginLeft: 24 }}>
          {select('zh', '國語')}
          {select('math', '數學')}
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <b style={{ minWidth: 48 }}>學期</b>
            <select value={cur.term} onChange={(e) => set({ term: e.target.value as CurriculumChoice['term'] })} data-testid="class-edition-term">
              <option value="auto">自動（8～1 月為上學期，2～7 月為下學期）</option>
              <option value="上">二年級上學期</option>
              <option value="下">二年級下學期</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

/** 成員表的「在哪裡」：班級島或自己的島＋建築（島嶼互訪 I1）；舊版伺服器只有 online 時顯示 🟢；離線空白 */
function whereText(m: MemberSummary): string {
  /** 哪座島：這一班的班級島、別班的班級島（多班級，不寫是哪一班）、自己的島 */
  const island = { class: '班級島', otherClass: '別的班級島', own: '自己的島' } as const;
  if (m.where) return `🟢 ${island[m.where.island] ?? '班級島'}${m.where.zone ? `・${zoneName(m.where.zone as ZoneId)}` : ''}`;
  return m.online ? '🟢' : '';
}

/** 班級名稱與「改名稱」（升級換年級時用；規則和建立班級相同：1～20 個字） */
function ClassName({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  /** 正在改的名稱；null 表示沒在改 */
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <>
        <span className="plain" data-testid="room-name-display">
          {name}
        </span>
        <button className="btn small white" onClick={() => setDraft(name)} data-testid="room-rename">
          ✏️ 改名稱
        </button>
      </>
    );
  }
  const ok = draft.trim().length > 0 && [...draft.trim()].length <= 20;
  return (
    <form
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) void onSave(draft.trim()).then(() => setDraft(null));
      }}
    >
      <input className="text-input" maxLength={20} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="班級名稱" data-testid="room-rename-input" autoFocus />
      <button type="submit" className="btn small green" disabled={!ok} data-testid="room-rename-save">
        儲存
      </button>
      <button type="button" className="btn small white" onClick={() => setDraft(null)}>
        取消
      </button>
    </form>
  );
}

/**
 * 還沒登入：登入或註冊（L1 登入整理，docs/plans/login-ux-review.md 第 4.2 節）。一份表單，「登入」旁邊就是 Google 按鈕（Google 官方按鈕寫「透過 Google 帳戶繼續操作」）：
 * - 綁過的 Google 直接登入；沒綁過的直接建立帳號，不用帳號名稱與密碼（第 6 節第 1 點）：
 *   掃 QR code 進來的自動是家長，其他情況先問老師還是家長。
 * - 「還沒有帳號？註冊」展開用帳號密碼註冊要多填的欄位（再輸入一次密碼、email、身分）。
 * - 不想註冊、只要調整這台裝置的設定：連到家長專區（用 4 位數 PIN）。
 */
function AccountGate() {
  const login = useAccount((s) => s.login);
  const register = useAccount((s) => s.register);
  const googleLogin = useAccount((s) => s.googleLogin);
  const googleRegister = useAccount((s) => s.googleRegister);
  const googleClientId = useCloud((s) => s.googleClientId);
  const goto = useUi((s) => s.goto);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  /** 掃 QR code 打開的加入連結（docs/plans/class-join.md）：登入或註冊後讓孩子加入班級；註冊時預先勾「家長」，用 Google 時直接當家長 */
  const joining = useAccount((s) => s.joining);
  const [parent, setParent] = useState(!!joining);
  const [teacher, setTeacher] = useState(false);
  /** 在這台裝置保持登入（預設不勾：教室共用電腦、孩子的平板；保持登入時家長專區不用 PIN） */
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 顯示「忘記密碼」的表單 */
  const [forgot, setForgot] = useState(false);
  /** 沒綁過的 Google 給的 ID token：等使用者選好老師或家長，再用它建立帳號 */
  const [newGoogle, setNewGoogle] = useState<string | null>(null);

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

  /** 用 Google 建立帳號（帳號名稱由伺服器從 email 產生，沒有密碼）；成功後帳號頁換成登入後的畫面 */
  const createWithGoogle = async (idToken: string, roles: { parent: boolean; teacher: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      await googleRegister({ idToken, ...roles, remember });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  /** 按了 Google 按鈕：綁過的直接登入；沒綁過的建立帳號（掃 QR code 進來的直接當家長，其他情況先問身分） */
  const onGoogle = async (idToken: string) => {
    setBusy(true);
    setError(null);
    try {
      await googleLogin(idToken, remember);
      return;
    } catch (err) {
      if (!(err instanceof ApiFailure && err.code === 'google_not_linked')) {
        setError(messageOf(err));
        return;
      }
    } finally {
      setBusy(false);
    }
    if (joining) await createWithGoogle(idToken, { parent: true, teacher: false });
    else setNewGoogle(idToken);
  };

  const ready = !busy && username.trim().length > 0 && password.length > 0;
  if (forgot) return <ForgotPassword onClose={() => setForgot(false)} />;

  if (newGoogle) {
    // 第一次用這個 Google：選身分就建立帳號（之後可以在帳號設定加上另一個身分）
    return (
      <div className="panel-body plain" data-testid="google-role-pick">
        <h3 style={{ margin: '0 0 6px' }}>第一次用這個 Google 帳號</h3>
        <p style={{ margin: '0 0 10px' }}>選你的身分，就會建立知識島的帳號（之後可以在帳號設定加上另一個身分）：</p>
        <div className="join-choices">
          <button className="join-choice" disabled={busy} onClick={() => void createWithGoogle(newGoogle, { parent: false, teacher: true })} data-testid="google-role-teacher">
            <span className="avatar-dot">👩‍🏫</span>
            <b>老師</b>
            <small>建立班級、管理學生</small>
          </button>
          <button className="join-choice" disabled={busy} onClick={() => void createWithGoogle(newGoogle, { parent: true, teacher: false })} data-testid="google-role-parent">
            <span className="avatar-dot">👨‍👩‍👧</span>
            <b>家長</b>
            <small>管理孩子的角色、讓孩子加入班級</small>
          </button>
        </div>
        <ErrorNote text={error} testId="account-error" />
        <button
          className="btn small white"
          style={{ marginTop: 12 }}
          onClick={() => {
            setNewGoogle(null);
            setError(null);
          }}
          data-testid="google-role-cancel"
        >
          取消，回到登入
        </button>
        <p className="notice">帳號名稱會用你的 Google email 自動產生，不用設密碼；想用密碼登入的話，之後可以在帳號設定加上。</p>
      </div>
    );
  }

  return (
    <>
      {joining && (
        <p className="notice" style={{ margin: '0 16px 8px' }} data-testid="join-login-note">
          🏫 要讓孩子加入班級（代碼 {joining.code}）：請登入家長帳號；還沒有帳號的話，直接按 Google 按鈕或「註冊」。登入後選孩子就能加入，不用輸入密碼。
        </p>
      )}
      <form className="panel-body" onSubmit={submit}>
        {mode === 'register' && <h3 style={{ margin: '0 0 6px' }}>註冊新帳號</h3>}
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
              👨‍👩‍👧 家長（管理自己孩子的角色、讓孩子加入班級）
            </Check>
          </>
        )}
        <Check checked={remember} onChange={setRemember} testId="account-remember">
          在這台裝置保持登入（孩子的平板、教室共用的電腦不要勾）
        </Check>
        <ErrorNote text={error} testId="account-error" />
        {/* 「登入」與 Google 放在同一排（常見的「帳號密碼＋第三方登入」版面）；窄螢幕自動換行 */}
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="btn big green" disabled={!ready} data-testid="account-submit">
            {busy ? '連線中…' : mode === 'login' ? '登入' : '註冊'}
          </button>
          {googleClientId && <GoogleButton clientId={googleClientId} text="continue_with" label="用 Google 繼續" testId="account-google-login" onCredential={(t) => void onGoogle(t)} />}
        </div>
        {mode === 'login' ? (
          <p className="account-links">
            <button type="button" className="link-btn" onClick={() => setForgot(true)} data-testid="forgot-open">
              忘記密碼？
            </button>
            <span>
              還沒有帳號？
              <button type="button" className="link-btn" onClick={() => switchMode('register')} data-testid="account-tab-register">
                註冊
              </button>
            </span>
          </p>
        ) : (
          <p className="account-links">
            <span>
              已經有帳號？
              <button type="button" className="link-btn" onClick={() => switchMode('login')} data-testid="account-tab-login">
                登入
              </button>
            </span>
          </p>
        )}
        {googleClientId && <p className="notice">按 Google 按鈕：已經綁定的直接登入；第一次用的直接建立帳號，不用另外設帳號名稱和密碼。</p>}
        {mode === 'login' && !joining && (
          <p className="notice">
            只要調整這台裝置的設定（遊玩時間、教材版本、聲音），不用註冊：
            <button type="button" className="link-btn" onClick={() => goto('parent')} data-testid="account-parent-zone">
              到家長專區（用 4 位數 PIN）
            </button>
          </p>
        )}
        <p className="notice">孩子不用註冊：家長掃老師給的 QR code、用家長帳號選孩子加入（不用密碼）；或孩子用「班級代碼＋暱稱＋自己設的 4 位數密碼」加入。</p>
      </form>
    </>
  );
}

/** 忘記密碼：輸入帳號名稱或 email；不管帳號存不存在，送出後都顯示同一句話（不透露帳號是否存在） */
function ForgotPassword({ onClose }: { onClose: () => void }) {
  const forgotPassword = useAccount((s) => s.forgotPassword);
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(login.trim());
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel-body" onSubmit={submit} data-testid="forgot-panel">
      <h3 style={{ margin: '0 0 8px' }}>忘記密碼</h3>
      <label className="label" htmlFor="forgot-login">
        帳號名稱或 email
      </label>
      <input
        id="forgot-login"
        className="text-input"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        data-testid="forgot-login"
      />
      <ErrorNote text={error} testId="forgot-error" />
      {sent && (
        <p className="notice" data-testid="forgot-msg">
          如果這個帳號存在、email 也驗證過，重設密碼的信已經寄出（30 分鐘內有效），請到信箱收信；沒收到的話，看看垃圾郵件匣。email 沒驗證過的帳號沒辦法用這個方式找回。
        </p>
      )}
      <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn big green" disabled={busy || !login.trim()} data-testid="forgot-submit">
          {busy ? '連線中…' : '寄重設密碼的信'}
        </button>
        <button type="button" className="btn small white" onClick={onClose} data-testid="forgot-back">
          回到登入
        </button>
      </div>
    </form>
  );
}

/**
 * 從信裡的連結打開網頁（App.tsx 讀出網址參數交過來）：
 * 驗證連結一打開就送出驗證；重設連結顯示設定新密碼的表單（成功後要用新密碼重新登入）
 */
function EmailLinkPanel() {
  const link = useAccount((s) => s.emailLink);
  const setEmailLink = useAccount((s) => s.setEmailLink);
  const verifyEmail = useAccount((s) => s.verifyEmail);
  const resetPassword = useAccount((s) => s.resetPassword);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  /** 已經送出過驗證的權杖（開發模式的 StrictMode 會把 effect 跑兩次，第二次會變成「連結已經用過」） */
  const verified = useRef<string | null>(null);

  useEffect(() => {
    if (link?.kind !== 'verify' || verified.current === link.token) return;
    verified.current = link.token;
    verifyEmail(link.token)
      .then(() => setDone('email 驗證好了。忘記密碼時，就能用這個 email 重設。'))
      .catch((err: unknown) => setError(messageOf(err)));
  }, [link, verifyEmail]);

  if (!link) return null;
  /** 看完結果：關掉這個面板 */
  const close = () => {
    setEmailLink(null);
    setDone(null);
    setError(null);
  };

  const submitReset = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = checkPassword(password) ?? (password !== confirm ? '兩次輸入的密碼不一樣' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(link.token, password);
      setDone('密碼改好了，請用新密碼登入（所有裝置的登入都已經登出）。');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body plain email-link-panel" data-testid="email-link-panel">
      <h3 style={{ margin: '0 0 8px' }}>{link.kind === 'verify' ? '驗證 email' : '設定新密碼'}</h3>
      {done ? (
        <p className="notice" data-testid="email-link-result">
          ✅ {done}
        </p>
      ) : link.kind === 'verify' ? (
        !error && <p>驗證中…</p>
      ) : (
        <form onSubmit={submitReset}>
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            placeholder={`新密碼（至少 ${PASSWORD_MIN} 個字）`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="新密碼"
            data-testid="reset-password"
          />
          <input
            className="text-input"
            type="password"
            autoComplete="new-password"
            placeholder="再輸入一次新密碼"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label="再輸入一次新密碼"
            data-testid="reset-confirm"
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <button type="submit" className="btn big green" disabled={busy || !password} data-testid="reset-submit">
              {busy ? '連線中…' : '設定新密碼'}
            </button>
            <button type="button" className="btn small white" onClick={close} data-testid="reset-cancel">
              取消，回到登入
            </button>
          </div>
        </form>
      )}
      <ErrorNote text={error} testId="email-link-error" />
      {(done || error) && (
        <button className="btn small white" onClick={close} data-testid="email-link-close">
          知道了
        </button>
      )}
    </div>
  );
}

/** 驗證信的寄送結果（註冊、換 email、重寄之後顯示在帳號頁上方；已經驗證就不顯示） */
function VerifyMailNote() {
  const status = useAccount((s) => s.verifyMail);
  const user = useAccount((s) => s.user);
  const clear = useAccount((s) => s.clearVerifyMail);
  if (!status || !user || user.emailVerified) return null;
  const text = {
    sent: `驗證信已經寄到 ${user.email ?? ''}，請到信箱打開信裡的連結（24 小時內有效）。`,
    failed: '驗證信沒有寄出，可以到「帳號設定」重寄。',
    disabled: '伺服器還沒有設定寄信，暫時沒辦法驗證 email。',
    limited: '驗證信寄太多次了，請稍後再到「帳號設定」重寄。',
  }[status];
  return (
    <p className="notice" data-testid="verify-mail-note">
      {text}{' '}
      <button className="btn small white" onClick={clear}>
        知道了
      </button>
    </p>
  );
}

/**
 * 帳號設定的 Google 快速登入（A4）：列出已綁定的 Google（email 遮罩）、綁定、解除。
 * 一個 Google 只能綁一個帳號，一個帳號可以綁多個（爸爸、媽媽各一個）；伺服器沒開 Google 登入時不顯示。
 * 沒有密碼的帳號（用 Google 註冊的）不能解除最後一個 Google：不顯示那顆按鈕，說明要先設定密碼（伺服器也會擋）。
 * hideLinkButton：帳號設定正在用 Google 確認身分時，先收起「綁定 Google」——同一個畫面只能有一顆真正的 Google 按鈕
 * （src/online/google.ts 只記一個登入結果的回呼，兩顆同時在畫面上時，按哪一顆都會交給後畫出來的那顆）。
 */
function GoogleLinks({ hideLinkButton }: { hideLinkButton: boolean }) {
  const clientId = useCloud((s) => s.googleClientId);
  const hasPassword = useAccount((s) => !!s.user?.hasPassword);
  const googleLinks = useAccount((s) => s.googleLinks);
  const linkGoogle = useAccount((s) => s.linkGoogle);
  const unlinkGoogle = useAccount((s) => s.unlinkGoogle);
  /** 已綁定的 Google；null 是還沒讀到 */
  const [links, setLinks] = useState<UserGoogleLink[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    googleLinks()
      .then((g) => alive && setLinks(g))
      .catch((err: unknown) => alive && setError(messageOf(err)));
    return () => {
      alive = false;
    };
  }, [clientId, googleLinks]);
  if (!clientId) return null;

  /** 綁定或解除，更新清單與提示 */
  const run = (job: Promise<UserGoogleLink[]>, done: string) => {
    setError(null);
    setMsg(null);
    job
      .then((g) => {
        setLinks(g);
        setMsg(done);
      })
      .catch((err: unknown) => setError(messageOf(err)));
  };
  /** 可以解除：有密碼，或還有別的 Google 可以登入 */
  const canUnlink = hasPassword || (links?.length ?? 0) > 1;

  return (
    <div data-testid="google-links-section">
      <h4 style={{ margin: '14px 0 6px' }}>Google 快速登入</h4>
      <p style={{ margin: '0 0 6px' }} data-testid="google-links">
        {links === null ? '讀取中…' : links.length ? `已綁定：${links.map((l) => l.email).join('、')}` : '還沒有綁定 Google。'}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!hideLinkButton && (
          <GoogleButton clientId={clientId} label="綁定 Google" testId="settings-google-link" onCredential={(t) => run(linkGoogle(t), '綁定好了，之後可以在登入畫面用 Google 快速登入')} />
        )}
        {canUnlink &&
          links?.map((l) => (
            <button key={l.id} className="btn small white" onClick={() => run(unlinkGoogle(l.id), `已解除 ${l.email}`)} data-testid={`google-unlink-${l.id}`}>
              解除 {l.email}
            </button>
          ))}
      </div>
      {!canUnlink && links?.length === 1 && <p style={{ margin: '6px 0 0' }}>這是這個帳號唯一的登入方式：要解除的話，先在下面設定密碼。</p>}
      <ErrorNote text={error} testId="google-links-error" />
      {msg && (
        <p className="notice" data-testid="google-links-msg">
          {msg}
        </p>
      )}
      <p className="notice">爸爸、媽媽可以各綁一個 Google。伺服器只記 Google 帳號的識別碼與 email，只用在快速登入。</p>
    </div>
  );
}

/** 再確認一次身分的證明：目前的密碼，或綁定的 Google 給的 ID token（用 Google 註冊、沒有密碼的帳號用這個） */
type Proof = { current: string } | { idToken: string };

/**
 * 帳號設定：加上另一個身分、改 email、Google 快速登入、改密碼（沒有密碼的帳號是「設定密碼」）、刪除帳號。
 * 沒有密碼的帳號（L1：用 Google 註冊的）設定密碼與刪除帳號時用 Google 確認身分；這時「綁定 Google」的按鈕先收起來（見 GoogleLinks）。
 */
function AccountSettings() {
  const user = useAccount((s) => s.user);
  const update = useAccount((s) => s.update);
  const changePassword = useAccount((s) => s.changePassword);
  const resendVerify = useAccount((s) => s.resendVerify);
  const clientId = useCloud((s) => s.googleClientId);
  const [email, setEmail] = useState(user?.email ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 打開的區塊：設定密碼（沒有密碼的帳號）或刪除帳號；兩個不同時打開（各自可能有一顆 Google 按鈕） */
  const [panel, setPanel] = useState<'password' | 'delete' | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  if (!user) return null;
  /** 正在用 Google 確認身分（沒有密碼的帳號打開了設定密碼或刪除帳號） */
  const reauthOpen = !user.hasPassword && panel !== null;

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

  /** 打開或收起一個區塊（清掉上一個動作的訊息） */
  const open = (p: 'password' | 'delete' | null) => {
    setPanel(p);
    setError(null);
    setMsg(null);
  };

  /** 改密碼或設定密碼：先檢查新密碼，再用目前的密碼或 Google 確認身分 */
  const savePassword = (proof: Proof) => {
    const problem = checkPassword(next) ?? (next !== confirm ? '兩次輸入的新密碼不一樣' : null);
    if (problem) {
      setError(problem);
      return;
    }
    const done = user.hasPassword ? '密碼改好了，其他裝置的登入都已經登出' : '密碼設定好了，之後也能用帳號名稱和密碼登入；其他裝置的登入都已經登出';
    void run(async () => {
      await changePassword(proof, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPanel(null);
    }, done);
  };

  /** 刪除帳號：家長名下的角色一併刪除，這台裝置上的那些角色也拿掉，最後登出 */
  const deleteAccount = (proof: { password: string } | { idToken: string }) =>
    void run(async () => {
      const call = useAccount.getState().call;
      const kids = user.parent ? (await call<ParentKidsResponse>('GET', '/api/parent/kids')).kids : [];
      await call('DELETE', '/api/users/me', proof);
      for (const k of kids) useCloud.getState().forget(k.id);
      await useAccount.getState().logout();
    }, '帳號已經刪除');

  /** 新密碼的兩個輸入框（改密碼與設定密碼共用） */
  const newPasswordInputs = (
    <>
      <input className="text-input" type="password" autoComplete="new-password" placeholder={`新密碼（至少 ${PASSWORD_MIN} 個字）`} value={next} onChange={(e) => setNext(e.target.value)} aria-label="新密碼" data-testid="settings-next" />
      <input className="text-input" type="password" autoComplete="new-password" placeholder="再輸入一次新密碼" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="再輸入一次新密碼" data-testid="settings-confirm" />
    </>
  );
  /** 沒開 Google 登入的伺服器上，沒有密碼的帳號改用「忘記密碼」的信設定密碼 */
  const noGoogleNote = <p style={{ margin: '6px 0 0' }}>班級伺服器沒有開啟 Google 登入：請登出後在登入畫面按「忘記密碼？」，用寄到 email 的連結設定密碼。</p>;

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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 6px' }}>
        <span data-testid="email-status">{user.emailVerified ? '✅ 已驗證（忘記密碼時可以用這個 email 重設）' : '⚠️ 還沒驗證：驗證之後，忘記密碼時才能用 email 重設'}</span>
        {!user.emailVerified && (
          <button className="btn small white" onClick={() => void run(() => resendVerify(), '驗證信已經寄出，請到信箱收信')} data-testid="resend-verify">
            重寄驗證信
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="text-input" type="email" inputMode="email" style={{ flex: '1 1 200px' }} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="email" data-testid="settings-email" />
        <button className="btn small white" disabled={email.trim() === (user.email ?? '')} onClick={() => void run(() => update({ email: email.trim() }), 'email 改好了')} data-testid="settings-email-save">
          儲存 email
        </button>
      </div>
      <GoogleLinks hideLinkButton={reauthOpen} />
      <h4 style={{ margin: '14px 0 6px' }} data-testid="settings-password-title">
        {user.hasPassword ? '改密碼' : '設定密碼'}
      </h4>
      {user.hasPassword ? (
        <>
          <input className="text-input" type="password" autoComplete="current-password" placeholder="目前的密碼" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="目前的密碼" data-testid="settings-current" />
          {newPasswordInputs}
          <div style={{ marginTop: 8 }}>
            <button className="btn small white" disabled={!current || !next} onClick={() => savePassword({ current })} data-testid="settings-password-save">
              改密碼
            </button>
          </div>
        </>
      ) : panel === 'password' ? (
        <>
          {newPasswordInputs}
          {clientId ? (
            <>
              <p style={{ margin: '8px 0 6px' }}>填好新密碼後，按 Google 按鈕確認是你本人，就會儲存：</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <GoogleButton clientId={clientId} label="用 Google 確認並儲存" testId="settings-reauth-google" onCredential={(t) => savePassword({ idToken: t })} />
                <button className="btn small white" onClick={() => open(null)}>
                  取消
                </button>
              </div>
            </>
          ) : (
            noGoogleNote
          )}
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 6px' }}>
            這個帳號是用 Google 註冊的，還沒有密碼。設定之後，也能用帳號名稱「{user.username}」和密碼登入（Google 帳號出問題時用得到）。
          </p>
          <button className="btn small white" onClick={() => open('password')} data-testid="settings-set-password">
            設定密碼
          </button>
        </>
      )}
      <h4 style={{ margin: '14px 0 6px' }}>刪除帳號</h4>
      <p style={{ margin: '0 0 6px' }}>家長名下的孩子角色會一併刪除，刪除後無法復原。還有班級的老師帳號要先移除班級。</p>
      {panel !== 'delete' ? (
        <button className="btn small white" onClick={() => open('delete')} data-testid="delete-account">
          刪除帳號
        </button>
      ) : user.hasPassword ? (
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
          <button className="btn small red" disabled={!deletePassword} onClick={() => deleteAccount({ password: deletePassword })} data-testid="delete-account-confirm">
            確定刪除帳號
          </button>
          <button className="btn small white" onClick={() => open(null)}>
            取消
          </button>
        </div>
      ) : clientId ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flexBasis: '100%' }}>按 Google 按鈕確認是你本人，帳號就會刪除：</span>
          <GoogleButton clientId={clientId} label="用 Google 確認並刪除帳號" testId="delete-reauth-google" onCredential={(t) => deleteAccount({ idToken: t })} />
          <button className="btn small white" onClick={() => open(null)}>
            取消
          </button>
        </div>
      ) : (
        noGoogleNote
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

/**
 * 家長：名下的孩子角色（在這台裝置玩、加入或退出班級、刪除）。上方一張卡片問「這台裝置上有○○，是你的孩子嗎？」
 * （L2，存到雲端的決定 A：按「是」一次存好；按「不是」這台裝置不再問這位家長這些角色）
 */
function ParentHome() {
  const call = useAccount((s) => s.call);
  const session = useAccount((s) => s.session);
  const user = useAccount((s) => s.user);
  const profiles = useGame((s) => s.save.profiles);
  const goto = useUi((s) => s.goto);
  const [kids, setKids] = useState<KidSummary[] | null>(null);
  /** 「不是」之後重新讀紀錄用（紀錄在 localStorage，不是 React 狀態） */
  const [declinedTick, setDeclinedTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** 等待第二次確認刪除的孩子 */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** 打開「⋯ 更多」的孩子（L2：不常用、會改變狀態的「退出班級」「刪除」收在裡面） */
  const [moreFor, setMoreFor] = useState<string | null>(null);
  /** 正在輸入班級代碼的角色（孩子清單的「🏫 加入班級」） */
  const [joinFor, setJoinFor] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  /** 等待確認「用雲端的進度取代這台裝置上的同一個角色」的孩子 */
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
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
  /** 這台裝置上同一個角色（同一個角色 id）、但不是這個雲端角色的那份（例如以前用備份匯入的）：換成雲端版要先確認 */
  const sameLocalOf = (k: KidSummary) => profiles.find((p) => p.id === k.profileId && p.cloud?.accountId !== k.id);
  /**
   * 要問家長「是你的孩子嗎？」的角色（L2，存到雲端的決定 A）：這台裝置上還沒存到雲端、雲端也沒有同一個角色、
   * 這位家長沒說過「不是」的（declinedTick 變了就重新讀「不是」的紀錄）
   */
  const offer = kids && user ? profilesToOffer(profiles, kids, declinedTick >= 0 ? readDeclined(user.id) : []) : [];
  /** 「在這台裝置玩」完成時的提示 */
  const playedNote = (k: KidSummary) => `「${k.name}」已經在這台裝置上了，回到選角畫面就能玩`;

  /** 「是，存到我的帳號」：這張卡片上的角色一個一個存到家長帳號 */
  const saveOffered = () =>
    void act(async () => {
      for (const p of offer) await useCloud.getState().uploadToCloud(p.id, session.server, session.token);
    }, `${offer.map((p) => `「${p.name}」`).join('、')}已經存到你的帳號`);

  return (
    <div className="panel-body plain" data-testid="parent-home">
      {offer.length > 0 && (
        <div className="card upload-offer" data-testid="upload-offer">
          <p style={{ margin: '0 0 8px' }}>
            這台裝置上有{offer.map((p) => `「${p.name}」`).join('、')}，是你的孩子嗎？存到你的帳號後，換裝置、加入班級都用得到。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn green" disabled={busy} onClick={saveOffered} data-testid="upload-offer-yes">
              是，存到我的帳號
            </button>
            <button
              className="btn small white"
              disabled={busy}
              onClick={() => {
                if (user) addDeclined(user.id, offer.map((p) => p.id));
                setDeclinedTick((t) => t + 1);
              }}
              data-testid="upload-offer-no"
            >
              不是
            </button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
        <h3 style={{ margin: 0 }}>我的孩子</h3>
        {/* 這台裝置的設定（遊玩時間、教材版本、聲音）：登入家長帳號時不用 PIN（docs/plans/login-ux-review.md 第 6 節第 2 點） */}
        <button className="btn small white" onClick={() => goto('parent')} data-testid="parent-zone-link">
          ⚙️ 這台裝置的設定（家長專區）
        </button>
      </div>
      {kids === null ? (
        <p>讀取中…</p>
      ) : kids.length === 0 ? (
        <p>還沒有孩子的角色。掃老師給的 QR code 可以直接新建；這台裝置上的角色存到你的帳號後，換裝置也能接著玩。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="kid-list">
          {kids.map((k) => (
            <div key={k.id} className="card" style={{ padding: '8px 12px' }} data-testid={`kid-${k.name}`}>
              <div>
                <strong>{k.name}</strong>　{kidRooms(k).length ? `🏫 ${kidRooms(k).map((r) => r.name).join('、')}` : '還沒加入班級'}・⭐ {k.stars}・🪙 {k.coins}・{ago(k.lastSeen)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {onThisDevice(k.id) ? (
                  <span data-testid={`kid-here-${k.name}`}>✅ 這台裝置上有</span>
                ) : confirmReplace === k.id && sameLocalOf(k) ? (
                  <>
                    <span style={{ flexBasis: '100%' }} data-testid={`kid-replace-warning-${k.name}`}>
                      這台裝置上已經有「{sameLocalOf(k)!.name}」（同一個角色，可能是以前用備份匯入的），進度和雲端的不一樣。換成雲端的進度後，這台裝置上的進度會不見；要留著的話，先到家長專區下載備份。
                    </span>
                    <button
                      className="btn small red"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await useCloud.getState().playOnThisDevice(k.id, session.server, session.token, { replaceLocal: true });
                          setConfirmReplace(null);
                        }, playedNote(k))
                      }
                      data-testid={`kid-replace-confirm-${k.name}`}
                    >
                      用雲端的進度取代
                    </button>
                    <button className="btn small white" onClick={() => setConfirmReplace(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    className="btn small green"
                    disabled={busy}
                    onClick={() => (sameLocalOf(k) ? setConfirmReplace(k.id) : void act(() => useCloud.getState().playOnThisDevice(k.id, session.server, session.token), playedNote(k)))}
                    data-testid={`kid-device-${k.name}`}
                  >
                    在這台裝置玩
                  </button>
                )}
                {kidRooms(k).length < MAX_CLASSES &&
                  (joinFor === k.id ? (
                    // 輸入老師給的班級代碼（不用掃描），下一步在上面的「加入班級」面板選暱稱
                    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        className="text-input"
                        style={{ width: 110, padding: '4px 8px' }}
                        inputMode="numeric"
                        placeholder="班級代碼"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        aria-label={`${k.name} 要加入的班級代碼`}
                        data-testid={`kid-join-code-${k.name}`}
                      />
                      <button
                        className="btn small green"
                        disabled={joinCodeInput.length !== 6}
                        onClick={() => {
                          useAccount.getState().setJoining({ code: joinCodeInput, kidId: k.id });
                          setJoinFor(null);
                          setJoinCodeInput('');
                        }}
                        data-testid={`kid-join-next-${k.name}`}
                      >
                        下一步
                      </button>
                      <button className="btn small white" onClick={() => setJoinFor(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    <button className="btn small white" onClick={() => setJoinFor(k.id)} data-testid={`kid-join-${k.name}`}>
                      🏫 加入班級
                    </button>
                  ))}
                <button
                  className="btn small white"
                  aria-expanded={moreFor === k.id}
                  onClick={() => {
                    setMoreFor(moreFor === k.id ? null : k.id);
                    setConfirmDelete(null);
                  }}
                  data-testid={`kid-more-${k.name}`}
                >
                  ⋯ 更多
                </button>
                {/* 退出班級：每一班各一顆（多班級；只有一個班級時照舊寫「退出班級」）；刪除。都收在「⋯ 更多」裡 */}
                {moreFor === k.id && kidRooms(k).map((r) => (
                  <button
                    key={r.code}
                    className="btn small white"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await call('POST', `/api/parent/kids/${k.id}/leave-class`, { code: r.code });
                        // 這台裝置上有這個角色：馬上同步，本機的班級清單跟著更新
                        await useCloud.getState().syncKid(k.id);
                      }, `「${k.name}」已經退出「${r.name}」，進度都還在`)
                    }
                    data-testid={kidRooms(k).length === 1 ? `kid-leave-${k.name}` : `kid-leave-${k.name}-${r.code}`}
                  >
                    {kidRooms(k).length === 1 ? '退出班級' : `退出「${r.name}」`}
                  </button>
                ))}
                {moreFor !== k.id ? null : confirmDelete === k.id ? (
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
      <ErrorNote text={error} testId="parent-error" />
      {note && (
        <p className="notice" data-testid="parent-note">
          {note}
        </p>
      )}
    </div>
  );
}

/** 一位成員的操作：設定或重設密碼（家長掃 QR code 加入的孩子沒有密碼）、移除（兩段式確認，不用瀏覽器的 confirm 對話框） */
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
        {member.hasPin === false ? '設定密碼' : '重設密碼'}
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
      {justCreated && <p className="notice">班級建好了！請家長掃下面的 QR code（或把連結傳給家長），用家長帳號選孩子加入；也可以把班級代碼告訴孩子，孩子在選角畫面點「🏫 班級」→「第一次加入」。</p>}
      {room && (
        <>
          <div className="room-code-box">
            <span className="label">班級代碼</span>
            <strong className="room-code" data-testid="room-code-display">
              {room.code}
            </strong>
            <ClassName name={room.name} onSave={(name) => act(() => call('PATCH', base, { name }), `班級名稱改成「${name}」`)} />
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
          <JoinQr code={room.code} name={room.name} joinOpen={room.joinOpen} />
          <ClassCurriculum
            value={room.curriculum}
            onSave={(c) =>
              void act(
                () => call('PATCH', base, { curriculum: c }),
                c ? `班級島的教材版本：${curriculumText(BUILT_IN_EDITIONS, c)}` : '已取消統一，班級島照各孩子自己的設定',
              )
            }
          />
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
                <th>在哪裡</th>
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
                  <td data-testid={`online-${m.nickname}`}>{whereText(m)}</td>
                  <td>{ago(m.lastSeen)}</td>
                  <td>{m.stars}</td>
                  <td>{m.wrongCount}</td>
                  <td>{m.coins}</td>
                  <td data-testid={`sessions-${m.nickname}`}>{m.sessions}</td>
                  <td>
                    <MemberActions
                      member={m}
                      onReset={(pin) =>
                        act(
                          () => call('POST', `${base}/members/${m.id}/pin`, { pin }),
                          m.hasPin === false ? `已幫「${m.nickname}」設定密碼，請告訴孩子：之後可以用班級代碼＋暱稱＋密碼登入` : `已把「${m.nickname}」的密碼改成新密碼，請告訴孩子`,
                        )
                      }
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
      {/* 帳號列不縮（下面有加入班級面板時，直式手機上不會被壓扁切掉按鈕） */}
      <div className="panel-body" style={{ paddingBottom: 0, flex: 'none' }}>
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
        <VerifyMailNote />
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
      <JoinClassPanel />
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
  /** 打開重設密碼的連結時：先只顯示設定新密碼，改好按「知道了」才出現登入表單（兩個表單疊在一起容易填錯） */
  const resetting = useAccount((s) => s.emailLink?.kind === 'reset');
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
        {/* 整頁一起捲動：裡面的區塊不各自捲動（不然區塊被壓扁、按鈕被切掉、多出捲軸）；大人用的頁面字小一號 */}
        <div className="account-scroll">
          <EmailLinkPanel />
          {session ? <AccountHome /> : resetting ? null : <AccountGate />}
        </div>
      </div>
    </div>
  );
}
