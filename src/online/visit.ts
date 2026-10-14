/**
 * 匿名造訪計數（docs/plans/admin.md 第 3 節）：有設定班級伺服器時，每台裝置每天送一次 POST /api/visit，
 * 讓營運者知道大概有多少裝置在用（單機版、沒有雲端帳號的孩子也算得到）。
 * 送出的只有第一次開啟時產生的隨機 id（存在 localStorage，和角色、帳號無關）；伺服器只存它的雜湊與網址分類。
 * 失敗不重試、不影響遊戲；今天的日期用裝置的當地日期（伺服器記錄時用自己的台灣日期，不信任裝置送的）。
 */
import { dateKey } from '../store/save';
import { serverUrl } from './config';

/** 存在 localStorage 的鍵 */
export const VISIT_KEY = 'learning-island-visit';

/** 存的狀態：裝置的隨機 id、最後一次送出的日期 */
export interface VisitState {
  id: string;
  day: string;
}

/** 合格的裝置 id（和伺服器的 visitRequest 一樣） */
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * 決定今天要不要送：今天送過回 null；否則回要送的 id 與送出後要存的狀態。
 * 存的資料壞掉或 id 格式不對就用 newId() 換一個新的。
 */
export function planVisit(stored: string | null, today: string, newId: () => string): { device: string; state: VisitState } | null {
  let s: Partial<VisitState> | null = null;
  try {
    s = stored ? (JSON.parse(stored) as Partial<VisitState> | null) : null;
  } catch {
    s = null;
  }
  const id = s && typeof s.id === 'string' && ID_RE.test(s.id) ? s.id : newId();
  if (s && s.day === today && s.id === id) return null;
  return { device: id, state: { id, day: today } };
}

/** 隨機的裝置 id（32 個十六進位字） */
function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** 開遊戲時呼叫一次：有班級伺服器、今天還沒送過才送（先記下今天送過，失敗也不重試） */
export function reportVisit(): void {
  const base = serverUrl();
  if (!base) return;
  let plan: ReturnType<typeof planVisit>;
  try {
    plan = planVisit(localStorage.getItem(VISIT_KEY), dateKey(new Date()), randomId);
    if (!plan) return;
    localStorage.setItem(VISIT_KEY, JSON.stringify(plan.state));
  } catch {
    // 私密瀏覽或儲存空間被封鎖：不送（每次開啟都會換新 id，數字會失真）
    return;
  }
  void fetch(`${base}/api/visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device: plan.device }),
    keepalive: true,
  }).catch(() => {});
}
