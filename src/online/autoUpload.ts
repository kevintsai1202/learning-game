/**
 * 家長帳號登入中，在選角畫面新建的角色自動存到家長帳號（L2，存到雲端的決定 A：登入期間新建的角色全自動；
 * docs/plans/login-ux-review.md 的「L2 家長自動化」第 2 點）。
 * 只限不是老師的家長帳號（使用者 2026-10-06 決定）：老師兼家長在教室共用電腦登入時，學生新建的角色不能存進老師的帳號。
 * 只在選角畫面「新增角色」時呼叫；匯入備份不算。背景進行，失敗不擋遊戲（下次在家長頁的卡片還會問）。
 * 重新整理後只剩權杖、還沒讀回帳號資料時，先讀一次再判斷身分。
 */
import { useAccount } from './useAccount';
import { useCloud } from './useCloud';

/** 把剛新建的角色存到登入中的家長帳號；有存到回傳 true（沒有登入、不是家長、老師兼家長、失敗都是 false） */
export async function autoUploadNewProfile(profileId: string): Promise<boolean> {
  if (!useAccount.getState().session) return false;
  if (!useAccount.getState().user) {
    try {
      await useAccount.getState().refresh();
    } catch {
      return false;
    }
  }
  const { session, user } = useAccount.getState();
  if (!session || !user?.parent || user.teacher) return false;
  try {
    await useCloud.getState().uploadToCloud(profileId, session.server, session.token);
    return true;
  } catch {
    return false;
  }
}
