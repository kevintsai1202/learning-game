/**
 * 營運者監控頁（admin.html，docs/plans/admin.md）：用 Google 登入（伺服器只收 ADMIN_EMAILS 裡的帳號），
 * 看使用人數、活躍、每日趨勢、科目分布、AI 用量、匿名造訪與現在線上，以及班級、孩子、大人的明細。
 * 只能看、不能改。admin 權杖放 sessionStorage（關掉分頁就登出）；過期或被拒（401）時回到登入畫面。
 */
import { useCallback, useEffect, useState } from 'react';
import { GoogleButton } from '../ui/GoogleButton';
import { api, ApiFailure } from '../online/api';
import type { ServerConfig } from '../online/protocol';
import type { AdminAccounts, AdminLoginResponse, AdminOverview, ActiveCounts } from '../online/adminProtocol';

/** sessionStorage 的鍵：admin 權杖 */
const TOKEN_KEY = 'learning-island-admin-token';
/** 科目的中文名稱 */
const SUBJECT_NAMES: Record<string, string> = { math: '數學', zh: '國語', en: '英語', life: '生活與健康' };
/** 造訪來源的中文名稱 */
const HOST_NAMES: Record<string, string> = { pages: 'GitHub Pages', zeabur: 'Zeabur', other: '其他' };

/** 讀、存、清 admin 權杖（私密瀏覽擋住 sessionStorage 時只放在記憶體） */
let memoryToken: string | null = null;
function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return memoryToken;
  }
}
function saveToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // 只放記憶體
  }
}

/** ISO 時間 → 「2026-10-14 13:05」（裝置的當地時間）；沒有是「—」 */
function time(isoText: string | null): string {
  if (!isoText) return '—';
  const d = new Date(isoText);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 今天／近 7 天／近 30 天 */
const triple = (a: ActiveCounts) => `${a.today}／${a.d7}／${a.d30}`;

export function AdminApp() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [token, setToken] = useState<string | null>(loadToken());
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [accounts, setAccounts] = useState<AdminAccounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'classes' | 'kids' | 'adults'>('kids');

  /** 登出（或權杖失效）：清掉權杖與資料，回到登入畫面 */
  const signOut = useCallback((message: string | null = null) => {
    saveToken(null);
    setToken(null);
    setOverview(null);
    setAccounts(null);
    setError(message);
  }, []);

  /** 讀總覽與明細；401 時回到登入畫面 */
  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [o, a] = await Promise.all([api<AdminOverview>('GET', '/api/admin/overview', { token }), api<AdminAccounts>('GET', '/api/admin/accounts', { token })]);
      setOverview(o);
      setAccounts(a);
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) signOut('登入已過期，請重新登入');
      else setError(e instanceof Error ? e.message : '讀取失敗');
    } finally {
      setLoading(false);
    }
  }, [token, signOut]);

  useEffect(() => {
    api<ServerConfig>('GET', '/api/config')
      .then(setConfig)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '連不上班級伺服器'));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 拿到 Google 的 ID token：換 admin 權杖 */
  const onCredential = async (idToken: string) => {
    setError(null);
    try {
      const r = await api<AdminLoginResponse>('POST', '/api/admin/login', { body: { idToken } });
      saveToken(r.token);
      setToken(r.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗');
    }
  };

  const logout = async () => {
    if (token) await api('POST', '/api/admin/logout', { token, body: {} }).catch(() => {});
    signOut();
  };

  if (!token) {
    return (
      <main className="admin-login" data-testid="admin-login">
        <h1>知識島大冒險｜營運者監控</h1>
        <p>只有營運者的 Google 帳號可以登入。</p>
        {config?.googleClientId ? (
          <GoogleButton clientId={config.googleClientId} onCredential={(t) => void onCredential(t)} label="用 Google 登入" testId="admin-google" />
        ) : (
          config && <p className="admin-error">這台班級伺服器沒有開啟 Google 登入，無法使用監控。</p>
        )}
        {error && (
          <p className="admin-error" data-testid="admin-error">
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="admin" data-testid="admin-dashboard">
      <header className="admin-head">
        <h1>知識島大冒險｜營運者監控</h1>
        <span className="admin-muted">{overview ? `資料時間 ${time(overview.generatedAt)}` : ''}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => void refresh()} disabled={loading} data-testid="admin-refresh">
          {loading ? '讀取中…' : '重新整理'}
        </button>
        <button type="button" onClick={() => void logout()} data-testid="admin-logout">
          登出
        </button>
      </header>
      {error && (
        <p className="admin-error" data-testid="admin-error">
          {error}
        </p>
      )}

      {overview && (
        <>
          <section className="admin-cards" data-testid="admin-overview">
            <Card title="大人帳號" value={overview.counts.adults} detail={`老師 ${overview.counts.teachers}・家長 ${overview.counts.parents}`} testId="admin-count-adults" />
            <Card title="孩子（雲端角色）" value={overview.counts.kids} detail={`在班級 ${overview.counts.kidsInClass}・只有家長 ${overview.counts.kidsParentOnly}`} testId="admin-count-kids" />
            <Card title="班級" value={overview.counts.classes} testId="admin-count-classes" />
            <Card
              title="現在線上"
              value={overview.online ? overview.online.kids : '—'}
              detail={overview.online ? `孩子；進島的熊熊老師 ${overview.online.teachers}` : '伺服器沒有提供'}
              testId="admin-online"
            />
            <Card title="活躍孩子" value={triple(overview.active.kids)} detail="今天／近 7 天／近 30 天" testId="admin-active-kids" />
            <Card title="活躍大人" value={triple(overview.active.adults)} detail="今天／近 7 天／近 30 天（登入）" testId="admin-active-adults" />
            <Card
              title="匿名造訪（裝置）"
              value={triple(overview.visits)}
              detail={`今天／近 7 天／近 30 天；${Object.entries(overview.visits.hosts)
                .map(([h, n]) => `${HOST_NAMES[h] ?? h} ${n}`)
                .join('・') || '還沒有資料'}`}
              testId="admin-visits"
            />
          </section>

          <section>
            <h2>每日趨勢（近 30 天）</h2>
            <p className="admin-muted">回合數來自孩子的雲端存檔（每個孩子只留最近 300 回合，玩得很多的會少算，是下限）；遊玩分鐘來自每天的遊玩時間；造訪是不重複的裝置數，包含單機版。</p>
            <table className="admin-table" data-testid="admin-days">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>作答的孩子</th>
                  <th>回合</th>
                  <th>題數</th>
                  <th>遊玩分鐘</th>
                  <th>造訪裝置</th>
                </tr>
              </thead>
              <tbody>
                {[...overview.days].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.kids}</td>
                    <td>{d.rounds}</td>
                    <td>{d.questions}</td>
                    <td>{d.minutes}</td>
                    <td>{d.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="admin-two">
            <div>
              <h2>科目分布（近 30 天）</h2>
              <table className="admin-table" data-testid="admin-subjects">
                <thead>
                  <tr>
                    <th>科目</th>
                    <th>回合</th>
                    <th>題數</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.subjects.length ? (
                    overview.subjects.map((s) => (
                      <tr key={s.subject}>
                        <td>{SUBJECT_NAMES[s.subject] ?? s.subject}</td>
                        <td>{s.rounds}</td>
                        <td>{s.questions}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>還沒有資料</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div>
              <h2>AI 用量</h2>
              <table className="admin-table" data-testid="admin-ai">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>AI 出題（題）</th>
                    <th>AI 分析：老師</th>
                    <th>AI 分析：孩子</th>
                  </tr>
                </thead>
                <tbody>
                  {[...overview.ai.analyses].reverse().map((a) => (
                    <tr key={a.day}>
                      <td>{a.day}</td>
                      <td>{overview.ai.questions.find((q) => q.day === a.day)?.count ?? '—'}</td>
                      <td>{a.teacher}</td>
                      <td>{a.kid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="admin-muted">AI 出題的紀錄只留 7 天，更早的顯示「—」。</p>
            </div>
          </section>
        </>
      )}

      {accounts && (
        <section>
          <h2>明細</h2>
          <div className="admin-tabs">
            {(
              [
                ['kids', `孩子（${accounts.kids.length}）`],
                ['adults', `大人（${accounts.adults.length}）`],
                ['classes', `班級（${accounts.classes.length}）`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`admin-tab-${id}`}>
                {label}
              </button>
            ))}
          </div>
          {accounts.truncated && <p className="admin-muted">資料太多，每張表只列最近活動的 1000 筆。</p>}
          {tab === 'kids' && (
            <table className="admin-table" data-testid="admin-kids">
              <thead>
                <tr>
                  <th>名字</th>
                  <th>班級</th>
                  <th>家長帳號</th>
                  <th>最後上線</th>
                  <th>近 30 天回合</th>
                  <th>題數</th>
                  <th>遊玩分鐘</th>
                  <th>金幣</th>
                  <th>建立</th>
                </tr>
              </thead>
              <tbody>
                {accounts.kids.map((k, i) => (
                  <tr key={i} data-testid={`admin-kid-${i}`}>
                    <td>{k.name}</td>
                    <td>{k.classes.join('、') || '—'}</td>
                    <td>{k.hasParent ? '有' : '—'}</td>
                    <td>{time(k.lastSeen)}</td>
                    <td>{k.rounds}</td>
                    <td>{k.questions}</td>
                    <td>{k.minutes}</td>
                    <td>{k.coins}</td>
                    <td>{time(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'adults' && (
            <table className="admin-table" data-testid="admin-adults">
              <thead>
                <tr>
                  <th>帳號</th>
                  <th>email</th>
                  <th>身分</th>
                  <th>班級</th>
                  <th>孩子</th>
                  <th>最後登入</th>
                  <th>建立</th>
                </tr>
              </thead>
              <tbody>
                {accounts.adults.map((u) => (
                  <tr key={u.username} data-testid={`admin-adult-${u.username}`}>
                    <td>{u.username}</td>
                    <td>
                      {u.email ?? '—'}
                      {u.email && !u.emailVerified ? '（未驗證）' : ''}
                    </td>
                    <td>{[u.teacher && '老師', u.parent && '家長'].filter(Boolean).join('、')}</td>
                    <td>{u.classes}</td>
                    <td>{u.kids}</td>
                    <td>{time(u.lastLogin)}</td>
                    <td>{time(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'classes' && (
            <table className="admin-table" data-testid="admin-classes">
              <thead>
                <tr>
                  <th>班級</th>
                  <th>代碼</th>
                  <th>老師</th>
                  <th>成員</th>
                  <th>題庫包</th>
                  <th>最近有人上線</th>
                  <th>建立</th>
                </tr>
              </thead>
              <tbody>
                {accounts.classes.map((r) => (
                  <tr key={r.code} data-testid={`admin-class-${r.code}`}>
                    <td>{r.name}</td>
                    <td>{r.code}</td>
                    <td>{r.teacher ?? '—'}</td>
                    <td>{r.members}</td>
                    <td>{r.packs}</td>
                    <td>{time(r.lastSeen)}</td>
                    <td>{time(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

/** 總覽的一張數字卡 */
function Card({ title, value, detail, testId }: { title: string; value: number | string; detail?: string; testId: string }) {
  return (
    <div className="admin-card" data-testid={testId}>
      <div className="admin-card-title">{title}</div>
      <div className="admin-card-value">{value}</div>
      {detail && <div className="admin-muted">{detail}</div>}
    </div>
  );
}
