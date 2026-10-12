/**
 * 更新通知的規則（docs/plans/update-notice.md；純函式）：
 * - isNewVersion：version.json 的 id 和網頁裡的版本號不一樣才算有新版。
 * - updateMode：這個畫面與狀態要倒數自動更新（auto）、等做完（wait），還是只提示（prompt，大人的頁面）。
 * - resumeScreenOf：重新整理後回到哪個畫面（null 是照平常從標題畫面開始）。
 */
import type { Screen } from '../store/useUi';

/** 讀到的 version.json（id 和網頁裡的不一樣、而且不是空的，才算有新版；網頁自己沒有版本號時不提示） */
export function isNewVersion(local: string, remote: unknown): boolean {
  if (!local || typeof remote !== 'object' || remote === null) return false;
  const id = (remote as { id?: unknown }).id;
  return typeof id === 'string' && id !== '' && id !== local;
}

/** 孩子可以倒數自動更新的畫面（再加上狀態的條件） */
const AUTO_SCREENS: readonly Screen[] = ['island', 'zone', 'badges', 'shop', 'title', 'profiles'];
/** 大人的頁面（只提示，不自動重新整理：可能正在打字或設定） */
const ADULT_SCREENS: readonly Screen[] = ['teacher', 'class', 'parent', 'gm', 'classroom'];

/** 這一刻的狀態：正在用家具或設施、和朋友對戰（邀請中或進行中）、佈置時拿著家具還沒放下 */
export interface UpdateCtx {
  acting: boolean;
  duel: boolean;
  picking: boolean;
}

/** 有新版時這個畫面要怎麼做：auto 倒數自動更新、wait 等做完回到安全的地方、prompt 只提示 */
export function updateMode(screen: Screen, ctx: UpdateCtx): 'auto' | 'wait' | 'prompt' {
  if (ADULT_SCREENS.includes(screen)) return 'prompt';
  if (!AUTO_SCREENS.includes(screen)) return 'wait';
  return ctx.acting || ctx.duel || ctx.picking ? 'wait' : 'auto';
}

/** 重新整理後回到哪個畫面：島上的各種畫面回島上、大人的頁面回原本的頁面；熊熊老師進島回帳號頁、家長區要密碼回標題（null） */
export function resumeScreenOf(screen: Screen): Screen | null {
  switch (screen) {
    case 'island':
    case 'zone':
    case 'shop':
    case 'badges':
    case 'activity':
    case 'result':
    case 'puzzle':
      return 'island';
    case 'teacher':
    case 'class':
    case 'classroom':
    case 'profiles':
      return screen;
    case 'gm':
      return 'teacher';
    case 'parent':
    case 'title':
      return null;
  }
}
